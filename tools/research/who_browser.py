"""Research evidence validation for the published WHO publications search UI."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit
from browser_publications import output_hash
from jsonl_io import read_jsonl
from run_source_reviews import robots,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://www.who.int/publications/i'

def normalize(rows):
 results=[]
 for row in rows:
  u=urlsplit(row['url']);m=re.fullmatch(r'/publications/i/item/([^/]+)',u.path)
  if u.scheme!='https' or u.netloc!='www.who.int' or not m or u.query or u.fragment or not row['title'].strip():raise ValueError('Unexpected WHO publication identity/title')
  results.append({'id':m[1],'title':row['title'].strip(),'landing_page':row['url'],'published_date_display':row['date'],'title_may_be_abbreviated':row['title'].endswith(('...','…')),'edition_or_version':None,'reading_access_verified':False})
 if len({r['id'] for r in results})!=len(results):raise ValueError('Duplicate WHO native publication IDs')
 return results

def assess(source,case,row):
 results=[];error=None
 try:
  q=case['request']['ui_query']['text']
  if row.get('outcome')!='observed' or row.get('initial_http',{}).get('status')!=200:raise ValueError('Public UI query did not complete')
  if row.get('source_id')!='who-publications' or row.get('endpoint')!=ENDPOINT or case['request']['url']!=ENDPOINT or row.get('final_url')!=ENDPOINT or row.get('visible_query')!=q:raise ValueError('Public UI source/query mismatch')
  if output_hash(row['records'])!=row.get('observed_output_sha256'):raise ValueError('Rendered result capture hash mismatch')
  if row.get('previous_output_sha256')==row.get('observed_output_sha256'):raise ValueError('Unchanged stale public result set')
  if not row.get('result_summary'):raise ValueError('Missing public result/paging summary')
  results=normalize(row['records']);terms=set(re.findall(r'\w+',q.casefold()))
  if not terms or any(not terms<=set(re.findall(r'\w+',r['title'].casefold())) for r in results if r['id'] in case['expected_ids']):raise ValueError('Expected record lacks query-title relevance')
 except (ValueError,KeyError,TypeError) as exc:error=str(exc)
 obs={**row,'http':{'status':row.get('initial_http',{}).get('status'),'url':row.get('final_url'),'truncated':False,'evidence_kind':'rendered public WHO search form'},'response_sha256':row.get('observed_output_sha256'),'error':error}
 return evaluate(source,case,obs,{'results':results})

def probe(source,case_ids=None):
 if source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed endpoint')
 with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT)
  allowed=policy is not False and (policy is None or policy.can_fetch(USER_AGENT,ENDPOINT))
  with (REGISTRY/'examples/who-publications.access.jsonl').open('a') as out:out.write(json.dumps({'source_id':'who-publications','observed_at':now(),'robots_evidence':proof,'outcome':'allowed-preflight' if allowed else 'skipped','query_verified':False})+'\n')
  if not allowed:raise ValueError('Policy unavailable/disallowing; browser not started')
  time.sleep(pacing_seconds(policy));cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids];start=now()
  subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),*[c['request']['ui_query']['text'] for c in cases]],check=True,env=os.environ)
  rows=read_jsonl(REGISTRY/'examples/who-publications.browser.jsonl')
  for case in cases:
   matches=[r for r in rows if r.get('observed_at','')>=start and r.get('query')==case['request']['ui_query']['text']]
   if matches:
    row=assess(source,case,matches[-1]);row['robots_evidence']=proof
    with (REGISTRY/'examples/who-publications.jsonl').open('a') as out:out.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
