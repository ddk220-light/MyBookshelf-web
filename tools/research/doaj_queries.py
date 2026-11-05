"""Bounded public DOAJ article title search; metadata only, serial policy checks."""
import fcntl
import json
from pathlib import Path
import re
import time
from urllib.parse import quote, urlencode, urlsplit, unquote, parse_qs
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
BASE='https://doaj.org/api/search/articles/'
LIMIT=512*1024

def url(query,page=1):return BASE+quote(query,safe='')+'?'+urlencode({'page':page,'pageSize':3})

def parse(body,requested_url):
 u=urlsplit(requested_url)
 if u.scheme!='https' or u.netloc!='doaj.org' or not u.path.startswith('/api/search/articles/'):raise ValueError('Unreviewed DOAJ route')
 q=unquote(u.path[len('/api/search/articles/'):]);page=int(parse_qs(u.query)['page'][0]);size=int(parse_qs(u.query)['pageSize'][0]);data=json.loads(body)
 if data.get('query')!=q or data.get('page')!=page or data.get('pageSize')!=size or not isinstance(data.get('results'),list) or not isinstance(data.get('total'),int):raise ValueError('DOAJ query/page/result envelope mismatch')
 rows=[]
 for x in data['results']:
  b=x['bibjson'];sid=x['id']
  if not isinstance(sid,str) or not re.fullmatch('[a-f0-9]{32}',sid) or not b['title'].strip():raise ValueError('Missing/malformed DOAJ native identity/title')
  rows.append({'id':sid,'title':b['title'],'landing_page':'https://doaj.org/article/'+sid,'identifiers':b.get('identifier',[]),'journal_title':b.get('journal',{}).get('title'),'journal_languages':b.get('journal',{}).get('language',[]),'year':b.get('year'),'native_updated_at':x.get('last_updated'),'reading_access_verified':False})
 if len(rows)>size or len(rows)>data['total'] or len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate/excess DOAJ records')
 return {'results':rows,'total':data['total'],'page':page,'page_size':size,'query':q}

def assess(source,case,row):
 results=[];error=row.get('error')
 if not error and row.get('outcome')=='observed':
  if not re.fullmatch('[a-f0-9]{64}',row.get('response_sha256','')) or row['response_sha256']!=row.get('http',{}).get('sampled_bytes_sha256'):error='Missing/mismatched DOAJ response hash'
  elif row.get('request',{}).get('url')!=case['request']['url'] or row.get('http',{}).get('url')!=case['request']['url']:error='DOAJ request mismatch'
  else:results=row['parsed']['results']
 else:error=error or 'DOAJ query unavailable'
 return evaluate(source,case,{**row,'error':error}, {'results':results})

def collect(urls):
 with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(BASE);blocked=False
  for u in urls:
   time.sleep(pacing_seconds(p));row={'source_id':'doaj','observed_at':now(),'request':{'method':'GET','url':u},'robots_evidence':proof,'query_verified':False,'full_content_downloaded':False}
   if blocked or p is False or p is not None and not p.can_fetch(USER_AGENT,u):row.update(outcome='skipped',error='Unavailable/disallowing policy or prior access/rate response',http={'status':None,'truncated':False,'url':u})
   else:
    h,b=request(u,LIMIT);row['http']=h;row['response_sha256']=h.get('sampled_bytes_sha256')
    if h['status'] in (401,403,429,503):blocked=True
    try:
     if h['status']!=200 or h['truncated']:raise ValueError('HTTP failure or incomplete bounded response')
     row['parsed']=parse(b,u);row['outcome']='observed'
    except (ValueError,KeyError,TypeError) as e:row.update(outcome='failed',error=str(e))
   with (REGISTRY/'examples/doaj.raw-queries.jsonl').open('a') as out:out.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
   print(u,row['outcome'],row['http']['status'],row.get('parsed',{}).get('total'),flush=True)

def probe(source,case_ids=None):
 cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids];start=now();collect([c['request']['url'] for c in cases])
 from jsonl_io import read_jsonl
 rows=read_jsonl(REGISTRY/'examples/doaj.raw-queries.jsonl')
 for case in cases:
  matches=[r for r in rows if r['observed_at']>=start and r['request']['url']==case['request']['url']]
  if matches:
   with (REGISTRY/'examples/doaj.jsonl').open('a') as out:out.write(json.dumps(assess(source,case,matches[-1]),ensure_ascii=False,sort_keys=True)+'\n')
