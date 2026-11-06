"""Published IndCat thesis form with its explicit Shodhganga filter.

Never follows the repository links or retrieves thesis contents. IndCat IDs and
linked Shodhganga handles remain separate; shared metadata is not a new origin.
"""
import fcntl
import hashlib
import json
import re
import time
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from run_source_reviews import robots, request, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://indcat.inflibnet.ac.in/index.php/search/thesesSearch'
FILTER = 'fulltextsource_str_mv:*Shodhganga*'
RECORD = re.compile(r'https://indcat\.inflibnet\.ac\.in/index\.php/thesesrequest\?id=(th_\d+)$')
HANDLE = re.compile(r'https?://shodhganga\.inflibnet\.ac\.in/handle/(10603/\d+)$')


def tokens(text):
    return set(re.findall(r'\w+', unicodedata.normalize('NFKC', text).casefold()))


def query_text(url):
    u = urlsplit(url); q = parse_qs(u.query, keep_blank_values=True)
    if (u.scheme + '://' + u.netloc + u.path != ENDPOINT or u.fragment or
            set(q) != {'src','word','field','url','search'} or
            q['src'] != ['free'] or q['field'] != ['allfields'] or q['url'] != [FILTER] or
            q['search'] != ['simple'] or len(q['word']) != 1 or
            not 1 <= len(q['word'][0]) <= 250 or not tokens(q['word'][0])):
        raise ValueError('Unreviewed public thesis form request')
    return q['word'][0]


class Results(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows=[]; self.current=None; self.title=False
        self.depth=0; self.record_depth=None; self.form=False; self.word=[]
        self.filter_checked=False; self.free_checked=False; self.field_allfields=False; self.select=None

    def flush(self):
        if self.current:
            self.current['title']=' '.join(''.join(self.current['title']).split())
            self.rows.append(self.current)
        self.current=None; self.title=False; self.record_depth=None

    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='form': self.form=a.get('action')==ENDPOINT and a.get('method','').lower()=='get'
        if tag=='input' and self.form:
            if a.get('name')=='word': self.word.append(a.get('value'))
            if a.get('name')=='url' and a.get('value')==FILTER and 'checked' in a: self.filter_checked=True
            if a.get('name')=='src' and a.get('value')=='free' and 'checked' in a: self.free_checked=True
        if tag=='select' and self.form: self.select=a.get('name')
        if tag=='option' and self.form and self.select=='field' and a.get('value')=='allfields' and 'selected' in a: self.field_allfields=True
        if tag=='table': self.depth+=1
        if tag=='a':
            href=a.get('href',''); record=RECORD.fullmatch(href); handle=HANDLE.fullmatch(href)
            if record:
                self.flush(); self.current={'indcat_id':record[1],'index_record':href,'title':[],'handles':[]}; self.title=True; self.record_depth=self.depth
            elif handle and self.current and self.depth==self.record_depth:
                self.current['handles'].append((handle[1],href))

    def handle_endtag(self, tag):
        if tag=='a': self.title=False
        if tag=='form': self.form=False
        if tag=='select': self.select=None
        if tag=='table':
            if self.record_depth==self.depth: self.flush()
            self.depth-=1

    def handle_data(self, data):
        if self.title and self.current: self.current['title'].append(data)


def parse(body, query):
    if not isinstance(body,bytes) or len(body)>512*1024: raise ValueError('Unbounded result page')
    text=body.decode('utf-8'); p=Results(); p.feed(text)
    if '</html>' not in text.lower() or p.current is not None: raise ValueError('Incomplete result document')
    if p.word != [query] or not p.filter_checked or not p.free_checked or not p.field_allfields:
        raise ValueError('Response did not echo the keyword query and Shodhganga filter')
    if len(p.rows)>20: raise ValueError('Unreviewed result-page size')
    result=[]; seen=set(); index_seen=set()
    for row in p.rows:
        if len(row['handles'])!=1 or not row['title'] or row['indcat_id'] in index_seen:
            raise ValueError('Missing/ambiguous native thesis mapping')
        native,link=row['handles'][0]
        if native in seen: raise ValueError('Duplicate Shodhganga handle on page')
        seen.add(native); index_seen.add(row['indcat_id'])
        if tokens(query)<=tokens(row['title']):
            result.append({'id':native,'native_handle':native,'title':row['title'],
                'indcat_id':row['indcat_id'],'metadata_record':row['index_record'],
                'reported_repository_link':link,'reading_access_verified':False,
                'identity_scope':'IndCat explicitly links this thesis to the native Shodhganga handle; edition/version not independently verified'})
    return result, {'provider_returned':len(p.rows),'literal_title_matches':len(result),
                    'scope':'First20 IndCat Shodhganga-linked theses; filtered empty is not catalog-wide absence'}


def assess(source, case, capture, body):
    error=capture.get('error'); rows=[]; summary={}
    try:
        query=query_text(case['request']['url'])
        if case['request']['method']!='GET' or error or capture['http']['status']!=200 or capture['http']['truncated']:
            raise ValueError(error or 'Failed/incomplete public search response')
        if hashlib.sha256(body).hexdigest()!=capture['http']['sampled_bytes_sha256']: raise ValueError('Mismatched response hash')
        rows,summary=parse(body,query)
    except (KeyError,ValueError,TypeError) as exc: error=str(exc)
    return evaluate(source,case,{**capture,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'query_summary':summary,'full_content_downloaded':False,'repository_requested':False},{'results':rows})


def probe(source, case_ids=None):
    if source['id']!='shodhganga' or source['query']['endpoint']!=ENDPOINT: raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB); policy,proof=robots(ENDPOINT); stop=None
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids: continue
            url=case['request']['url'];query_text(url)
            cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}};body=b''
            if stop or policy is False or policy is not None and not all(policy.can_fetch(a,url) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):
                cap['error']=stop or 'Policy unavailable/disallowing'
            else:
                time.sleep(pacing_seconds(policy));cap['http'],body=request(url,limit=512*1024)
                if cap['http']['status']!=200 or any(x in body.lower() for x in [b'<title>just a moment',b'verify you are human']):
                    stop='Provider service/access failure; wait for recovery';cap['error']=stop
            observation=assess(source,case,cap,body)
            with (REGISTRY/'examples/shodhganga.jsonl').open('a') as f:f.write(json.dumps(observation,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],observation['verdict'],observation['error'],flush=True)
