"""Search the public OpenCity index of CMDA master-plan publication metadata."""
import fcntl
import hashlib
import json
import re
import time
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://data.opencity.in/dataset/chennai-master-plan-2026'
PACKAGE = 'ca3edfe1-6594-4a6d-92f4-8dde69338592'
UUID = r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}'
MAX_BYTES = 1024 * 1024


class Catalog(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items, self.item, self.depth = [], None, 0
        self.attribution = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href') == '/organization/chennai-metropolitan-development-authority':
            self.attribution = True
        if tag == 'li':
            if 'resource-item' in attrs.get('class','').split():
                if self.item is not None:
                    raise ValueError('Nested or incomplete resource record')
                self.item = {'native': attrs.get('data-id',''), 'headings': [], 'downloads': []}
                self.depth = 1
            elif self.item is not None:
                self.depth += 1
        if tag == 'a' and self.item is not None:
            classes = attrs.get('class','').split()
            if 'heading' in classes:
                self.item['headings'].append({'url':attrs.get('href',''),'title':attrs.get('title','')})
            if 'resource-url-analytics' in classes:
                self.item['downloads'].append(attrs.get('href',''))

    def handle_endtag(self, tag):
        if tag == 'li' and self.item is not None:
            self.depth -= 1
            if self.depth == 0:
                self.items.append(self.item)
                self.item = None


def parse(body):
    if not isinstance(body,bytes) or len(body)>MAX_BYTES:
        raise ValueError('Metadata exceeds byte bound')
    text=body.decode('utf-8')
    if '</html>' not in text.lower():
        raise ValueError('Incomplete metadata page')
    p=Catalog();p.feed(text)
    if p.item is not None or not p.attribution or not 0<len(p.items)<=100:
        raise ValueError('Missing CMDA attribution or incomplete/unbounded resource list')
    rows, excluded=[],[]
    for item in p.items:
        native=item['native']
        valid=re.fullmatch(UUID,native) and len(item['headings'])==1 and len(item['downloads'])==1
        if valid:
            h=item['headings'][0];link=urljoin(ENDPOINT,h['url']);title=h['title'].strip();download=item['downloads'][0]
            valid=(link==ENDPOINT+'/resource/'+native and title.startswith('Chennai Master Plan 2026 - Volume ')
                   and '...' not in title and '…' not in title
                   and re.fullmatch(r'https://data\.opencity\.in/dataset/'+PACKAGE+'/resource/'+native+'/download/'+UUID+r'\.pdf',download))
        if not valid:
            excluded.append({'id':native,'reason':'Missing/mismatched index resource identity or full title'})
            continue
        rows.append({'id':native,'title':title,'landing_page':link,'index_package_id':PACKAGE,
                     'published_download_url':download,'attribution':'CMDA as labelled by OpenCity',
                     'identity_namespace':'OpenCity resource UUID, not a CMDA publication identifier',
                     'publisher_native_id':None,'reading_access_verified':False})
    counts=Counter(r['id'] for r in rows)
    for row in rows:
        if counts[row['id']]!=1:excluded.append({'id':row['id'],'reason':'Duplicate/conflicting index ID, not merged'})
    rows=[r for r in rows if counts[r['id']]==1]
    if not rows:raise ValueError('No unambiguous indexed publication records')
    return {'records':rows,'excluded':excluded,'scope':'OpenCity-indexed CMDA Chennai Master Plan 2026 publication list only'}


def search(rows, query):
    if set(query)!={'field','value'} or query['field'] not in ('title','id') or not isinstance(query['value'],str):
        raise ValueError('Unsupported metadata query')
    words=re.findall(r'\w+',query['value'].casefold())
    if not words:raise ValueError('Empty query')
    return [r for r in rows if (r['id']==query['value'] if query['field']=='id'
            else all(w in re.findall(r'\w+',r['title'].casefold()) for w in words))]


def assess(source,case,cap,body):
    error,rows=cap.get('error'),[]
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/incomplete metadata')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched metadata capture')
        if case['request']['method']!='GET' or case['request']['url']!=ENDPOINT:raise ValueError('Unreviewed request')
        rows=search(parse(body)['records'],case['request']['local_query'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'full_content_downloaded':False,'query_execution':'Local literal title/index-UUID search over permitted public OpenCity metadata page'}, {'results':rows})


def probe(source,case_ids=None):
    if source['id']!='cmda-planning' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        policy,proof=robots(ENDPOINT);body=b''
        cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if policy is False or policy is not None and not all(policy.can_fetch(a,ENDPOINT) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):
            cap['error']='Policy unavailable/disallowing; no metadata request'
        else:
            time.sleep(pacing_seconds(policy));cap['http'],body=request(ENDPOINT,limit=MAX_BYTES)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/cmda-planning.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['error'],flush=True)
