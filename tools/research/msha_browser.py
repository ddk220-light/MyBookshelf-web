"""MSHA public guest search validation; display rank is never a native ID."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit,parse_qs
from browser_publications import output_hash
from jsonl_io import read_jsonl
from run_source_reviews import robots,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://digitallibrary.msha.gov/#!autologin/research'


def normalize(rows):
    results=[]
    for row in rows:
        u=urlsplit(row['metadata_url']);m=re.fullmatch(r'/aw-server/rest/order/user/product/download/([0-9]+)',u.path)
        if u.scheme!='https' or u.netloc!='digitallibrary.msha.gov' or not m or u.query!='metadata=true' or u.fragment or not row['title'].strip():
            raise ValueError('Unexpected published metadata-link identity')
        results.append({'id':m[1],'title':row['title'],'landing_page':row['landing_page'],
                        'published_metadata_link':row['metadata_url'],'identity_scope':'Knowvation product ID from rendered metadata download link; not display rank',
                        'edition_or_year':None,'reading_access_verified':False})
    if len({r['id'] for r in results})!=len(results):raise ValueError('Duplicate native product IDs')
    return results


def assess(source,case,row):
    results=[];error=None
    try:
        query=case['request']['ui_query']['text'];u=urlsplit(row.get('search_url',''))
        if (row.get('outcome')!='observed' or row.get('initial_http',{}).get('status')!=200
            or row.get('source_id')!='msha-digital-library' or row.get('endpoint')!=ENDPOINT
            or case['request']['url']!=ENDPOINT or row.get('visible_query')!=query
            or row.get('guest_label')!='Welcome, Public Research' or u.scheme!='https' or u.netloc!='digitallibrary.msha.gov'
            or not u.fragment.startswith('!/s?') or parse_qs(u.fragment.split('?',1)[1]).get('q')!=[query]):
            raise ValueError('Public guest search/source/query mismatch')
        if output_hash(row['records'])!=row.get('observed_output_sha256'):raise ValueError('Rendered metadata capture hash mismatch')
        results=normalize(row['records'])
        if not query or any(query.casefold() not in r['title'].casefold() or r['title'] not in row['visible_titles'] for r in results):
            raise ValueError('Selected native item lacks visible query-title relevance')
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    obs={**row,'http':{'status':row.get('initial_http',{}).get('status'),'truncated':False,'url':row.get('search_url')},'error':error,'response_sha256':row.get('observed_output_sha256')}
    return evaluate(source,case,obs,{'results':results})


def probe(source,case_ids=None):
    if source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed MSHA endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        policy,proof=robots(ENDPOINT);allowed=policy is not False and (policy is None or policy.can_fetch(USER_AGENT,ENDPOINT))
        with (REGISTRY/'examples/msha-digital-library.access.jsonl').open('a') as out:
            out.write(json.dumps({'source_id':source['id'],'observed_at':now(),'robots_evidence':proof,'outcome':'allowed-preflight' if allowed else 'skipped','query_verified':False})+'\n')
        if not allowed:raise ValueError('Unavailable/disallowing policy; browser not launched')
        time.sleep(pacing_seconds(policy));start=now()
        cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
        subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),*[c['request']['ui_query']['text'] for c in cases]],check=True,env=os.environ)
        rows=read_jsonl(REGISTRY/'examples/msha-digital-library.browser.jsonl')
        for case in cases:
            found=[r for r in rows if r.get('observed_at','')>=start and r.get('query')==case['request']['ui_query']['text']]
            if found:
                obs=assess(source,case,found[-1]);obs['robots_evidence']=proof
                with (REGISTRY/'examples/msha-digital-library.jsonl').open('a') as out:out.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
