"""Known-book title lookup through the site's advertised public WordPress API.

Only id/title/link/type fields are requested, never book/post bodies. The API
also contains blog articles; this adapter verifies known catalog books and does
not claim that arbitrary topic results are books or that every result is free.
"""
import fcntl
import hashlib
import html
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urlsplit
from run_source_reviews import robots, request, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT='https://freekidsbooks.org/wp-json/wp/v2/posts'

def query_url(text):
    if not isinstance(text,str) or not text.strip():raise ValueError('Nonempty title required')
    return ENDPOINT+'?'+urlencode({'search':text,'per_page':3,'_fields':'id,title,link,type'})

def parse(body):
    data=json.loads(body)
    if not isinstance(data,list) or len(data)>3:raise ValueError('Not a bounded public post list')
    rows=[];seen=set()
    for r in data:
        if type(r.get('id')) is not int or r['id']<=0 or r['id'] in seen or r.get('type')!='post':raise ValueError('Missing/duplicate post identity or wrong type')
        title=html.unescape(re.sub(r'<[^>]+>','',r.get('title',{}).get('rendered',''))).strip();u=urlsplit(r.get('link',''))
        if not title or u.scheme!='https' or u.netloc!='freekidsbooks.org' or u.path=='/' or u.query or u.fragment:raise ValueError('Missing title or native item permalink')
        rows.append({'id':str(r['id']),'title':title,'landing_page':r['link'],'record_kind':'WordPress publication metadata','reading_access_verified':False});seen.add(r['id'])
    return rows

def assess(source,case,cap):
    error=None;rows=[]
    try:
        body=cap['response_text'].encode();h=cap['http']
        if h['status']!=200 or h['truncated'] or hashlib.sha256(body).hexdigest()!=h['sampled_bytes_sha256'] or case['request']!=cap['request']:raise ValueError('Incomplete/mismatched query capture')
        rows=parse(body)
        tokens=set(re.findall(r'\w+',case['query_text'].casefold()))
        for r in rows:
            if r['id'] in case['expected_ids'] and not tokens<=set(re.findall(r'\w+',r['title'].casefold())):raise ValueError('Expected title lacks query relevance')
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    obs={k:v for k,v in cap.items() if k!='response_text'};obs['error']=error
    return evaluate(source,case,obs,{'results':rows})

def collect(source,cases,assess_results=True):
    if source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT)
        for case in cases:
            req=case['request'];body=b''
            if req['method']!='GET' or req['url']!=query_url(case['query_text']):raise ValueError('Unreviewed request shape')
            cap={'source_id':source['id'],'case_id':case['id'],'observed_at':now(),'request':req,'robots_evidence':proof,'http':{'url':req['url'],'status':None,'truncated':False},'full_content_downloaded':False}
            if policy is not False and (policy is None or policy.can_fetch(USER_AGENT,req['url'])):
                time.sleep(pacing_seconds(policy));cap['http'],body=request(req['url'],512*1024)
            cap['response_text']=body.decode();cap['response_sha256']=hashlib.sha256(body).hexdigest()
            with (REGISTRY/'examples/free-kids-books.access.jsonl').open('a') as f:f.write(json.dumps(cap,ensure_ascii=False,sort_keys=True)+'\n')
            obs=assess(source,case,cap)
            if assess_results:
                with (REGISTRY/'examples/free-kids-books.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],cap['http']['status'],obs['verdict'],obs['error'],flush=True)
            if cap['http']['status'] in (None,401,403,429,500,502,503,504) or (case['expected_ids'] and obs['verdict']!='verified'):break

def probe(source,case_ids=None):
    collect(source,[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids])
