"""Read-only production result-depth audit. Requests only public search metadata.

Counts distinct returned keys per query, follows the public signed cursor, and
preserves HTTP errors, repeated pages and exclusions. Uses the UI's six-item page
size. Does not activate sources, change flags, create accounts, or fetch full items.
Run with --source ID to resume selected incomplete sources; prior attempts remain.
"""
import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = 'https://mybookshelf.cloud'
OUT = Path('docs/research/free-content/evidence/2026-11-06-production-search-depth')
TERMS = {
 'onet':['engineers'], 'national-gallery-art':['portrait'], 'art-institute-chicago':['portrait'],
 'core':['agriculture'], 'metmuseum':['Buddha','portrait'], 'free-kids-books':['book','the'],
 'google-books':['mathematics'], 'appropedia':['solar'], 'crossref':['mathematics'],
 'osti':['solar'], 'cleveland-museum-art':['lotus'], 'nasa-image-video-library':['Apollo'],
 'federal-register':['water'], 'internet-archive':['history'], 'fao-publications':['agriculture'],
 'lever-press':['the','and','a'], 'nalibali':['the','and'], 'la-referencia':['mathematics'],
 'open-book-publishers':['the'], 'helsinki-university-press':['the','and','a'],
 'project-madurai':['பாடல்கள்'], 'openstax':['algebra','calculus','statistics','prealgebra','contemporary'],
 'sugamya-pustakalaya':['science'], 'gdl':['the','animal','children'], 'librivox':['the'],
 'loc':['history','mathematics'], 'bhl':['flora'], 'african-minds':['the','and','a'],
 'lse-press':['the','and','a'], 'mattering-press':['the','and','a'],
 'mediastudies-press':['the','and','communication'], 'punctum-books':['the'],
 'python-docs':['read'], 'europepmc':['cancer'], 'openalex':['mathematics'],
 'gutenberg':['the'], 'open-textbook-library':['introduction'], 'bookdash':['picture books'],
 'storyweaver':['children'],
}
LIMITS = {
 'openstax':'Deployed snapshot contains 16 Math textbooks; fewer than 20 in total.',
 'storyweaver':'Deployed reviewed starter snapshot contains three language records of one story.',
 'sugamya-pustakalaya':'Current app parser exposes first five public matches; no continuation is implemented. Keys are composites, not provider-native book IDs.',
 'bookdash':'Deployed snapshot contains 30 records; this tests its searchable subject metadata, not full provider holdings.',
 'gutenberg':'Deployed app snapshot contains 1,000 records, not the provider’s whole catalog.',
}

def now():
 return datetime.now(timezone.utc).isoformat()

def append(name, row):
 with (OUT/name).open('a') as f:
  f.write(json.dumps(row, ensure_ascii=False, separators=(',',':'))+'\n')

def request(payload=None):
 req=urllib.request.Request(BASE+'/api/v2/content/'+('search' if payload is not None else 'sources'),
   data=json.dumps(payload).encode() if payload is not None else None,
   headers={'Content-Type':'application/json','Origin':BASE,'User-Agent':'MyBookshelf-production-search-audit/1.0'})
 started=time.monotonic()
 try:
  with urllib.request.urlopen(req, timeout=55) as r:
   code,headers,raw=r.status,r.headers,r.read(4*1024*1024)
 except urllib.error.HTTPError as e:
  code,headers,raw=e.code,e.headers,e.read(20000)
 except (TimeoutError,OSError,urllib.error.URLError) as e:
  return {'http':None,'transportError':str(e)[:250],'observedAt':now(),'durationMs':round((time.monotonic()-started)*1000)},{}
 try:data=json.loads(raw)
 except (ValueError,UnicodeDecodeError):data={'error':{'message':'Non-JSON response'}}
 return {'http':code,'observedAt':now(),'durationMs':round((time.monotonic()-started)*1000),
  'responseSha256':hashlib.sha256(raw).hexdigest(),'retryAfter':headers.get('Retry-After')},data

def summarize(sources):
 rows=[json.loads(l) for l in (OUT/'queries.jsonl').read_text().splitlines() if l.strip()] if (OUT/'queries.jsonl').exists() else []
 result=[]
 for source in sources:
  sid=source['id'];attempts=[r for r in rows if r['source']==sid]
  best=max((r['distinct'] for r in attempts),default=0)
  union=set(k for r in attempts for k in r['keys'])
  status='passed' if best>=20 else 'below_target' if attempts else 'not_tested'
  if attempts and best<20 and all(r['error'] for r in attempts):status='error'
  result.append({'id':sid,'name':source['name'],'status':status,'bestSingleQuery':best,'distinctAcrossQueries':len(union),
   'queries':[{'query':r['query'],'distinct':r['distinct'],'pages':r['pages'],'stopReason':r['stopReason'],'error':r['error']} for r in attempts],
   'hasRecordedErrors':any(r['error'] for r in attempts),'knownLimit':LIMITS.get(sid)})
 report={'base':BASE,'updatedAt':now(),'criterion':'At least 20 distinct returned keys for one query using the normal UI page size and public continuations. Across-query totals are separate.',
   'enabledTotal':len(sources),'passed':sum(r['status']=='passed' for r in result),'belowTarget':sum(r['status']=='below_target' for r in result),
   'errors':sum(r['status']=='error' for r in result),'notTested':sum(r['status']=='not_tested' for r in result),'sources':result}
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 return report

def run(source,term):
 sid=source['id'];body={'query':term,'sourceIds':[sid],'kinds':source['kinds'],'limit':6,'access':'free'}
 keys=set();page_hashes=set();error=None;reason='page_budget';pages=0;hidden=0
 for page in range(1,(26 if sid=='free-kids-books' else 11)):
  time.sleep(8 if sid=='core' else 2)
  obs,data=request(body);items=data.get('items',[]);pages+=1
  projected=[{k:r[k] for k in ['key','title','kind','access','externalOnly','searchMatch'] if k in r} for r in items]
  row={**obs,'source':sid,'query':term,'page':page,'limit':6,'usedCursor':bool(body.get('cursor')),'returned':len(items),
       'items':projected,'hasNext':bool(data.get('nextCursor')),'sources':data.get('sources'),
       'hiddenUnclear':data.get('hiddenUnclear'),'error':data.get('error'),'coverage':data.get('coverage')}
  append('pages.jsonl',row)
  if obs['http']!=200:
   error=data.get('error') or obs.get('transportError') or 'HTTP '+str(obs['http']);reason='error';break
  if not isinstance(items,list) or any(not isinstance(r.get('key'),str) or not r['key'].startswith('fcd:v1:'+sid+':') for r in items):
   error='Invalid or cross-source identity';reason='identity_failure';break
  signature=tuple(r['key'] for r in items)
  if signature and signature in page_hashes:error='Provider repeated an earlier page';reason='repeated_page';break
  page_hashes.add(signature);keys.update(signature);hidden+=data.get('hiddenUnclear',0)
  print(sid,repr(term),'page',page,'returned',len(items),'distinct',len(keys),flush=True)
  if len(keys)>=20:reason='target_met';break
  cursor=data.get('nextCursor')
  if not cursor:reason='no_continuation';break
  body['cursor']=cursor
 result={'source':sid,'query':term,'observedAt':now(),'distinct':len(keys),'keys':sorted(keys),'pages':pages,'stopReason':reason,'hiddenUnclear':hidden,'error':error}
 append('queries.jsonl',result);return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source',action='append');parser.add_argument('--retry',action='store_true');args=parser.parse_args();OUT.mkdir(parents=True,exist_ok=True)
 obs,data=request();assert obs['http']==200,'Source directory failed'
 (OUT/'source-directory.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 sources=[s for s in data['sources'] if s['enabled']];report=summarize(sources)
 for source in sources:
  sid=source['id']
  if args.source and sid not in args.source:continue
  previous=next(r for r in report['sources'] if r['id']==sid)
  if previous['status']=='passed' and not args.source:continue
  tried={q['query'] for q in previous['queries']}
  for term in TERMS[sid]:
   if term in tried and not args.retry:continue
   result=run(source,term);report=summarize(sources)
   if result['distinct']>=20 or result['error']:break
  row=next(r for r in report['sources'] if r['id']==sid)
  print('CHECKPOINT',sid,row['status'],row['bestSingleQuery'],'aggregate',row['distinctAcrossQueries'],flush=True)
 print('FINAL',json.dumps({k:v for k,v in report.items() if k!='sources'}),flush=True)

if __name__=='__main__':main()
