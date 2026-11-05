"""Documented public StoryWeaver browser search; no direct/private search API replay."""
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
BASE='https://storyweaver.org.in/en/search'


def query_url(term):
    if not isinstance(term,str) or not re.fullmatch(r'[A-Za-z]+',term):raise ValueError('Reviewed single title term required')
    return BASE+'?intent=1&query='+term+'&tab=matches&language=English'


def normalize(rows):
    results=[]
    for row in rows:
        u=urlsplit(row['url']);m=re.fullmatch(r'/en/stories/(\d+)-([a-z0-9-]+)',u.path)
        if u.scheme!='https' or u.netloc!='storyweaver.org.in' or not m or u.query or u.fragment or not row['title'].strip():raise ValueError('Invalid native story URL')
        results.append({'id':m[1],'title':row['title'],'landing_page':row['url'],'language_filter':'English','version_or_edition':'Native story record; translation/edition relationships not inferred','reading_access_verified':False})
    if len({r['id'] for r in results})!=len(results) or len(results)>30:raise ValueError('Unexpected duplicate/count in first30 results')
    return results


def assess(source,case,row):
    results=[];error=None
    try:
        expected=case['request']['ui_query']['text']
        if (row.get('source_id')!='storyweaver' or row.get('outcome')!='observed' or row.get('search_http_status')!=200 or row.get('search_url')!=query_url(expected) or row.get('query_echo')!=expected or row.get('language_filter')!='English' or case['request']['url']!=query_url(expected)):raise ValueError('Browser search/query mismatch')
        if output_hash(row['records'])!=row.get('observed_output_sha256'):raise ValueError('Rendered metadata hash mismatch')
        results=normalize(row['records'])
        if any(not re.search(r'\b'+re.escape(expected)+r'(?:s)?\b',r['title'],re.I) for r in results if r['id'] in case['expected_ids']):raise ValueError('Selected item lacks title relevance')
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**row,'http':{'status':row.get('search_http_status'),'truncated':False,'url':row.get('search_url')},'error':error,'response_sha256':row.get('observed_output_sha256')},{'results':results})


def probe(source,case_ids=None):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(BASE)
        cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
        allowed=policy is not False and (policy is None or all(policy.can_fetch(USER_AGENT,u) for u in ['https://storyweaver.org.in/','https://storyweaver.org.in/en','https://storyweaver.org.in/en/advanced-search?query=']+[c['request']['url'] for c in cases]))
        with (REGISTRY/'examples/storyweaver.access.jsonl').open('a') as out:out.write(json.dumps({'source_id':'storyweaver','observed_at':now(),'robots_evidence':proof,'outcome':'allowed-preflight' if allowed else 'skipped','query_verified':False})+'\n')
        if not allowed:raise ValueError('Browser search policy unavailable/disallowed')
        time.sleep(pacing_seconds(policy));start=now();subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),*[c['request']['ui_query']['text'] for c in cases]],check=True,env=os.environ)
        rows=read_jsonl(REGISTRY/'examples/storyweaver.browser.jsonl')
        for case in cases:
            found=[r for r in rows if r.get('observed_at','')>=start and r.get('query')==case['request']['ui_query']['text']]
            if found:
                obs=assess(source,case,found[-1]);obs['robots_evidence']=proof
                with (REGISTRY/'examples/storyweaver.jsonl').open('a') as out:out.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
