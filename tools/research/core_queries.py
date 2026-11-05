"""CORE's documented anonymous metadata search, paced below10tokens/minute."""
import fcntl
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode,urlsplit,parse_qs
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
BASE='https://api.core.ac.uk/v3/search/works/'
LIMIT=128*1024

def url(query,offset=0):return BASE+'?'+urlencode({'q':query,'limit':1,'offset':offset})

def parse(body,requested_url):
 u=urlsplit(requested_url);params=parse_qs(u.query)
 if u.scheme!='https' or u.netloc!='api.core.ac.uk' or u.path!='/v3/search/works/':raise ValueError('Unreviewed CORE route')
 d=json.loads(body);limit=int(params['limit'][0]);offset=int(params['offset'][0])
 if d.get('limit')!=limit or d.get('offset')!=offset or not isinstance(d.get('totalHits'),int) or not isinstance(d.get('results'),list):raise ValueError('CORE result/page envelope mismatch')
 rows=[]
 for x in d['results']:
  if x.get('fullText') not in (None,'','Not available for public API users.'):raise ValueError('Unexpected full text in metadata response; stop collection')
  sid=str(x['id'])
  if not re.fullmatch('[1-9][0-9]*',sid) or not x['title'].strip():raise ValueError('Invalid CORE native work identity/title')
  expected='https://core.ac.uk/works/'+sid
  if not any(v.get('type')=='display' and v.get('url')==expected for v in x.get('links',[])):raise ValueError('CORE display URL and work ID mismatch')
  rows.append({'id':sid,'title':x['title'],'landing_page':expected,'doi':x.get('doi'),'year':x.get('yearPublished'),'native_updated_at':x.get('updatedDate'),'identifiers':x.get('identifiers',[]),'output_urls':x.get('outputs',[])[:10],'output_count':len(x.get('outputs',[])),'data_providers':[{k:p.get(k) for k in ['id','name','url']} for p in x.get('dataProviders',[])],'full_text_not_retrieved':True,'reading_access_verified':False})
 if len(rows)>limit or len(rows)>d['totalHits'] or len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate/excess CORE results')
 return {'results':rows,'total':d['totalHits'],'offset':offset,'limit':limit,'query':params['q'][0]}

def assess(source,case,row):
 results=[];error=row.get('error')
 if not error and row.get('outcome')=='observed':
  if not re.fullmatch('[a-f0-9]{64}',row.get('response_sha256','')) or row['response_sha256']!=row.get('http',{}).get('sampled_bytes_sha256'):error='Missing/mismatched CORE response hash'
  elif row.get('request',{}).get('url')!=case['request']['url'] or row.get('http',{}).get('url')!=case['request']['url']:error='CORE request mismatch'
  else:results=row['parsed']['results']
 else:error=error or 'CORE query unavailable'
 return evaluate(source,case,{**row,'error':error},{'results':results})

def collect(urls):
 with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(BASE);blocked=False
  for u in urls:
   time.sleep(max(7.5,pacing_seconds(p)));row={'source_id':'core','observed_at':now(),'request':{'method':'GET','url':u},'robots_evidence':proof,'query_verified':False,'full_content_downloaded':False}
   if blocked or p is False or p is not None and not p.can_fetch(USER_AGENT,u):row.update(outcome='skipped',error='Policy or prior access/rate/content-boundary failure',http={'status':None,'truncated':False,'url':u})
   else:
    h,b=request(u,LIMIT);row['http']=h;row['response_sha256']=h.get('sampled_bytes_sha256')
    if h['status'] in (401,403,429,503) or h['truncated']:blocked=True
    try:
     if h['status']!=200 or h['truncated']:raise ValueError('HTTP failure or incomplete bounded response')
     row['parsed']=parse(b,u);row['outcome']='observed'
    except (ValueError,KeyError,TypeError) as e:row.update(outcome='failed',error=str(e));blocked=True
   with (REGISTRY/'examples/core.raw-queries.jsonl').open('a') as out:out.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
   print(u,row['outcome'],row['http']['status'],row.get('parsed',{}).get('total'),flush=True)

def probe(source,case_ids=None):
 cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids];start=now();collect([c['request']['url'] for c in cases])
 from jsonl_io import read_jsonl
 rows=read_jsonl(REGISTRY/'examples/core.raw-queries.jsonl')
 for case in cases:
  matches=[r for r in rows if r['observed_at']>=start and r['request']['url']==case['request']['url']]
  if matches:
   with (REGISTRY/'examples/core.jsonl').open('a') as out:out.write(json.dumps(assess(source,case,matches[-1]),ensure_ascii=False,sort_keys=True)+'\n')
