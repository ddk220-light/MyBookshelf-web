"""Documented public GovInfo browser search; no direct/private search API replay."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit, unquote, quote
from browser_publications import output_hash
from jsonl_io import read_jsonl
from run_source_reviews import robots,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
BASE='https://www.govinfo.gov/app/search/'


def query_url(term):
    if not isinstance(term,str) or not re.fullmatch(r'[A-Za-z]+',term):raise ValueError('Reviewed single title term required')
    return BASE+quote(json.dumps({'query':'title:'+term,'offset':0},separators=(',',':')),safe='')


def normalize(rows):
    results=[]
    for row in rows:
        u=urlsplit(row['url']);m=re.fullmatch(r'/app/details/([A-Za-z0-9._-]+)(?:/([A-Za-z0-9._-]+))?',u.path)
        if u.scheme!='https' or u.netloc!='www.govinfo.gov' or not m or u.query or u.fragment or not row['title'].strip():raise ValueError('Invalid native package/granule URL')
        results.append({'id':m[2] or m[1],'title':row['title'],'package_id':m[1],'granule_id':m[2], 'landing_page':row['url'],'edition_or_version':'Encoded in native package/granule IDs; no work-level collapse','reading_access_verified':False})
    if len({r['id'] for r in results})!=len(results) or len(results)>10:raise ValueError('Unexpected duplicate/count in first ten results')
    return results


def assess(source,case,row):
    results=[];error=None
    try:
        u=urlsplit(row['search_url']);q=json.loads(unquote(u.path[len('/app/search/'):]))
        expected=case['request']['ui_query']['text']
        if (row.get('source_id')!='govinfo' or row.get('outcome')!='observed' or row.get('initial_http',{}).get('status')!=200 or u.scheme!='https' or u.netloc!='www.govinfo.gov' or not u.path.startswith('/app/search/') or q!={'query':expected,'offset':0} or row.get('visible_query')!=expected or row.get('endpoint')!=case['request']['url']):raise ValueError('Browser search/query mismatch')
        if output_hash(row['records'])!=row.get('observed_output_sha256'):raise ValueError('Rendered metadata hash mismatch')
        results=normalize(row['records']);term=expected.removeprefix('title:').casefold()
        if any(term not in r['title'].casefold() for r in results if r['id'] in case['expected_ids']):raise ValueError('Selected item lacks title relevance')
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**row,'http':{'status':row.get('initial_http',{}).get('status'),'truncated':False,'url':row.get('search_url')},'error':error,'response_sha256':row.get('observed_output_sha256')},{'results':results})


def probe(source,case_ids=None):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(BASE)
        cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
        allowed=policy is not False and (policy is None or all(policy.can_fetch(USER_AGENT,c['request']['url']) for c in cases))
        with (REGISTRY/'examples/govinfo.access.jsonl').open('a') as out:out.write(json.dumps({'source_id':'govinfo','observed_at':now(),'robots_evidence':proof,'outcome':'allowed-preflight' if allowed else 'skipped','query_verified':False})+'\n')
        if not allowed:raise ValueError('Browser search policy unavailable/disallowed')
        time.sleep(pacing_seconds(policy));start=now();subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),*[c['request']['ui_query']['text'].removeprefix('title:') for c in cases]],check=True,env=os.environ)
        rows=read_jsonl(REGISTRY/'examples/govinfo.browser.jsonl')
        for case in cases:
            found=[r for r in rows if r.get('observed_at','')>=start and r.get('query')==case['request']['ui_query']['text']]
            if found:
                obs=assess(source,case,found[-1]);obs['robots_evidence']=proof
                with (REGISTRY/'examples/govinfo.jsonl').open('a') as out:out.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
