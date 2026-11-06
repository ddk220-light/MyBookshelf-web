"""Approved African Storybook UI, all-language search and native book actions."""
import fcntl,json,os,re,subprocess,time
from pathlib import Path
from browser_publications import output_hash
from run_source_reviews import robots,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
from jsonl_io import read_jsonl
ENDPOINT='https://www.africanstorybook.org/'
ROUTE=ENDPOINT+'read/index.approved.php'

def normalize(rows):
 out=[]
 for r in rows:
  m=re.fullmatch(r'loadBook\(\s*(\d+),\s*1,\s*(true|false),\s*(\d+)\);',r['native_action'])
  language_ids=[v.strip() for v in str(r.get('language_id','')).split(',')]
  if not m or not all(v.isdigit() for v in language_ids) or r.get('approved')!='1' or not r.get('title'):raise ValueError('Native book/action or approved metadata mismatch')
  out.append({'id':m[1],'title':r['title'],'creator':r.get('creator'),'native_reader_action':r['native_action'],'landing_page':ENDPOINT,'language_id':r['language_id'],'language_ids':language_ids,'native_action_flag':m[2],'language':'English' if language_ids==['1133'] else None,'approved_by_provider':True,'reading_level':r.get('reading_level'),'provider_date_attribute':r.get('date_attribute'),'version_or_edition':None,'reading_access_verified':False})
 grouped={}
 for r in out:
  variant={k:r[k] for k in ('native_reader_action','language_ids','native_action_flag')}
  if r['id'] not in grouped:
   grouped[r['id']]={**r,'reader_variants':[variant]}
  else:
   prior=grouped[r['id']]
   if any(prior[k]!=r[k] for k in ('title','creator','reading_level','provider_date_attribute')):raise ValueError('Conflicting metadata for native book ID')
   if variant not in prior['reader_variants']:prior['reader_variants'].append(variant)
 return list(grouped.values())

def assess(source,case,row):
 results=[];error=None
 try:
  q=case['request']['ui_query']
  if row.get('outcome')!='observed' or row.get('source_id')!='african-storybook' or row.get('endpoint')!=ENDPOINT or case['request']['url']!=ENDPOINT or row.get('initial_http',{}).get('status')!=200 or row.get('visible_query')!=q['text'] or row.get('language_value')!='0' or row.get('language_label')!='All languages' or q.get('language_id')!='0' or q.get('collection')!='approved':raise ValueError('Browser query/collection/language mismatch')
  if output_hash(row['records'])!=row.get('observed_output_sha256'):raise ValueError('Rendered metadata hash mismatch')
  results=normalize(row['records'])
  if any(not re.search(r'\b'+re.escape(q['text'])+r'(?:s)?\b',r['title'],re.I) for r in results if r['id'] in case['expected_ids']):raise ValueError('Selected native book lacks title relevance')
 except (ValueError,KeyError,TypeError) as exc:error=str(exc)
 return evaluate(source,case,{**row,'http':{'status':row.get('initial_http',{}).get('status'),'truncated':False,'url':ENDPOINT},'error':error,'response_sha256':row.get('observed_output_sha256')},{'results':results})

def probe(source,case_ids=None):
 with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(ENDPOINT);allowed=p is not False and (p is None or all(p.can_fetch(USER_AGENT,u) for u in [ENDPOINT,ROUTE]))
  with (REGISTRY/'examples/african-storybook.access.jsonl').open('a') as out:out.write(json.dumps({'source_id':source['id'],'observed_at':now(),'robots_evidence':proof,'outcome':'allowed-preflight' if allowed else 'skipped','query_verified':False})+'\n')
  if not allowed:raise ValueError('Unavailable/disallowing public UI policy')
  cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids];time.sleep(pacing_seconds(p));start=now();subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),*[c['request']['ui_query']['text'] for c in cases]],check=True,env=os.environ)
  rows=read_jsonl(REGISTRY/'examples/african-storybook.browser.jsonl')
  for c in cases:
   found=[r for r in rows if r.get('observed_at','')>=start and r.get('query')==c['request']['ui_query']['text']]
   if found:
    obs=assess(source,c,found[-1]);obs['robots_evidence']=proof
    with (REGISTRY/'examples/african-storybook.jsonl').open('a') as out:out.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
