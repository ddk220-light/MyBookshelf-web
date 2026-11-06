"""CERT-In public booklet metadata; no PDF/advisory body collection."""
import hashlib
import re
from run_source_reviews import request, parse_robots_response
POLICY_URL='https://www.cert-in.org.in/robots.txt'
SOFT404_HASH='a2ee72e13322eb78ece3583fb84473856ca90e3b5c56b655025b536c30a1ed8a'
ENDPOINT='https://www.cert-in.org.in/AwarenessBooklets.jsp'


def interpret_policy(http,body):
    policy,proof=parse_robots_response(POLICY_URL,dict(http),body)
    matches=re.findall(rb"var _event_transid='[0-9]+';",body)
    normalized=re.sub(rb"var _event_transid='[0-9]+';",b"var _event_transid='REVIEWED_NONCE';",body)
    if (len(matches)==1 and http.get('status')==200 and http.get('url')==POLICY_URL and http.get('content_type')=='text/html'
            and not http.get('truncated') and hashlib.sha256(normalized).hexdigest()==SOFT404_HASH):
        proof.pop('policy_error',None)
        proof.update(policy_interpretation='Reviewed exact missing-URL HTML page; no robots groups/rules, login or challenge',
                     review_evidence='runs/technical-recovery-20261106h/certin-policy-review.json',access_restriction_overridden=False)
        return None,proof
    return policy,proof


def policy():
    http,body=request(POLICY_URL,limit=65536)
    return interpret_policy(http,body)

import fcntl
import json
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from run_source_reviews import pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate

LANGUAGES={'English','Hindi','Tamil','Telugu','Odia','Malayalam','Assamese','Bengali','Dogri','Gujarati','Kannada','Punjabi','KONKANI','Maithili','Marathi','Nepali','Sanskrit','Sindhi','URDU','MANIPURI','BODO','Kashmiri','Konkani'}

class Listing(HTMLParser):
    def __init__(self):
        super().__init__();self.active=False;self.item=None;self.anchor=None;self.bold=False;self.items=[]
    def finish(self):
        if self.item is not None:self.items.append(self.item)
        self.item=None;self.anchor=None;self.bold=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='td':
            self.finish();self.active=a.get('class')=='contentTD'
        elif tag=='li' and self.active:
            self.finish();self.item={'prefix':[],'links':[]}
        elif tag=='a' and self.item is not None:
            self.anchor={'url':a.get('href',''),'text':[]};self.item['links'].append(self.anchor)
        elif tag=='b':self.bold=True
    def handle_data(self,text):
        if self.anchor is not None:self.anchor['text'].append(text)
        elif self.item is not None and self.bold:self.item['prefix'].append(text)
    def handle_endtag(self,tag):
        if tag=='a':self.anchor=None
        elif tag=='b':self.bold=False
        elif tag in ('li','td'):
            self.finish()
            if tag=='td':self.active=False


def parse(body):
    if not isinstance(body,bytes) or len(body)>512*1024:raise ValueError('Unbounded booklet metadata')
    text=body.decode('utf-8')
    if 'CERT-In has released awareness booklets' not in text or '</html>' not in text.lower():raise ValueError('Missing/incomplete booklet listing')
    p=Listing();p.feed(text);rows=[];seen=set()
    for item in p.items:
        prefix=' '.join(' '.join(item['prefix']).split())
        for link in item['links']:
            u=urlsplit(urljoin(ENDPOINT,link['url']));label=' '.join(' '.join(link['text']).split())
            permitted=(u.scheme=='https' and u.netloc=='www.cert-in.org.in' and not u.query and not u.fragment and
                (re.fullmatch(r'/PDF/[A-Za-z0-9_./-]+\.pdf',u.path) or u.path in ('/Mahila_Raksha_Booklet26.jsp','/SID_Booklet26.jsp')))
            if not permitted:continue
            if not label:raise ValueError('Missing booklet title/language label')
            language=label if prefix and label in LANGUAGES else None
            if prefix and not language:raise ValueError('Ambiguous grouped booklet label')
            title=prefix if language else label
            native=u.geturl()
            if native in seen:raise ValueError('Duplicate native booklet link')
            seen.add(native);rows.append({'id':native,'title':title,'published_language_label':language,'landing_page':native,
                'record_kind':'booklet-link-metadata','reading_access_verified':False,'identity_scope':'Exact published PDF or booklet-page URL; no inferred content language or edition year'})
    if not rows:raise ValueError('No booklet metadata found')
    return rows


def search(rows,q):
    if set(q)!={'title','language'} or not isinstance(q['title'],str) or not q['title'].strip() or q['language'] is not None and q['language'] not in LANGUAGES:raise ValueError('Unsupported booklet query')
    tokens=set(re.findall(r'\w+',q['title'].casefold()))
    if not tokens:raise ValueError('Empty title tokens')
    return [r for r in rows if tokens<=set(re.findall(r'\w+',r['title'].casefold())) and (q['language'] is None or r['published_language_label']==q['language'])]


def assess(source,case,cap,body):
    error=cap.get('error');rows=[]
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Failed/incomplete booklet listing')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched metadata hash')
        rows=search(parse(body),case['request']['local_query'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,
        'query_execution':'Local whole-title-token search over public booklet list, optional explicit published language label'},{'results':rows})


def probe(source,case_ids=None):
    if source['id']!='cert-in' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=policy();body=b''
        cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if p is False or p is not None and not all(p.can_fetch(a,ENDPOINT) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):cap['error']='Policy unavailable/disallowing'
        else:time.sleep(pacing_seconds(p));cap['http'],body=request(ENDPOINT,limit=512*1024)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            if case['request']['method']!='GET' or case['request']['url']!=ENDPOINT:raise ValueError('Unreviewed request')
            obs=assess(source,case,cap,body)
            with (REGISTRY/'examples/cert-in.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],obs['verdict'],obs['error'],flush=True)
