#!/usr/bin/env python3
"""Offline, rebuildable library evidence index. No network or provider requests."""
import argparse, csv, datetime as dt, gzip, hashlib, json, math, os, pathlib, sqlite3, subprocess, sys
VERSION='1'
HERE=pathlib.Path(__file__).resolve().parent

def js(x): return json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True)
def digest(x): return hashlib.sha256(x).hexdigest()
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def file_hash(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def connect(path):
 path.parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(path);db.row_factory=sqlite3.Row
 db.executescript('DROP VIEW IF EXISTS library_current; DROP VIEW IF EXISTS library_books; DROP VIEW IF EXISTS returned_results;');db.executescript((HERE/'schema.sql').read_text());db.execute("UPDATE checks SET status='Blocked/deferred' WHERE status='Blocked / deferred'");db.execute('PRAGMA busy_timeout=30000');db.execute('PRAGMA cache_size=-131072')
 db.commit()
 from migrations import migrate
 migrate(db)
 return db

def safe(root,path):
 p=(root/path).resolve()
 if not p.is_relative_to(root.resolve()):raise ValueError('Evidence escapes source root: '+str(path))
 return p

def evidence_file(db,p,root,expected=None):
 p=p.resolve();rel=str(p.relative_to(root));st=p.stat()
 row=db.execute('SELECT * FROM evidence_files WHERE path=?',(rel,)).fetchone()
 # Unchanged evidence was verified on its first import. validate --full rehashes it.
 if row and row['bytes']==st.st_size and row['mtime_ns']==st.st_mtime_ns:
  raw=row['raw_sha256'];stored=row['stored_sha256']
 else:
  stored=file_hash(p);raw=stored;raw_bytes=st.st_size
  if p.suffix=='.gz':
   h=hashlib.sha256();raw_bytes=0
   with gzip.open(p,'rb') as f:
    for b in iter(lambda:f.read(1024*1024),b''):h.update(b);raw_bytes+=len(b)
   raw=h.hexdigest()
  db.execute('INSERT OR IGNORE INTO evidence_objects VALUES(?,?,?)',(stored,st.st_size,'sha256/'+stored[:2]+'/'+stored))
  db.execute('INSERT OR REPLACE INTO evidence_files VALUES(?,?,?,?,?,?)',(rel,stored,st.st_size,raw,raw_bytes,st.st_mtime_ns))
 if expected:
  if expected.get('sha256') and raw!=expected['sha256']:raise ValueError('Raw evidence hash mismatch: '+rel)
  if expected.get('storedSha256') and stored!=expected['storedSha256']:raise ValueError('Stored evidence hash mismatch: '+rel)
 return rel

def map_id(db,ident):
 if db.execute('SELECT 1 FROM libraries WHERE id=?',(ident,)).fetchone():return ident
 r=db.execute('SELECT library_id FROM aliases WHERE alias=?',(ident,)).fetchone()
 return r[0] if r else None

def seed(db,snapshot):
 from migrations import retain_connection, retain_snapshot_runtime
 full={e['id']:e for e in snapshot.get('entries',[])}
 for e in snapshot['inventory']['libraries']:
  db.execute('INSERT OR REPLACE INTO libraries VALUES(?,?,?,?,?)',(e['libraryId'],e['name'],e['country'],e['connections'][0]['family'],js(e)))
  # Preserve configuration bytes before updating the current route pointers.
  for previous in db.execute('SELECT * FROM connections WHERE library_id=?',(e['libraryId'],)).fetchall():retain_connection(db,previous)
  db.execute('DELETE FROM connections WHERE library_id=?',(e['libraryId'],))
  for i,c in enumerate(e['connections']):
   config={k:v for k,v in c.items() if k not in ('connectionId','fidelity')}
   entry=full.get(e['libraryId'])
   if entry is not None:config['directoryEntry']=entry if i==0 else entry.get('alternateCatalogs',[])[i-1]
   fp=digest(js(config).encode());cid=digest(js([e['libraryId'],config]).encode())
   db.execute('INSERT INTO connections VALUES(?,?,?,?,?)',(cid,e['libraryId'],c['connectionId'],fp,js(config)))
   retain_connection(db,dict(id=cid,library_id=e['libraryId'],label=c['connectionId'],fingerprint=fp,config_json=js(config)))
 for alias,target in snapshot['aliases'].items():
  target=map_id(db,target)
  if target:db.execute('INSERT OR REPLACE INTO aliases VALUES(?,?)',(alias,target))
 retain_snapshot_runtime(db,snapshot)

def add_record(db,eid,lib,label,date,r,suffix):
 native=r.get('nativeId') or r.get('sourceId') or r.get('recordId')
 copy=r.get('copyId') or r.get('barcode') or r.get('identityKind')=='copy'
 if copy:native=r.get('copyId') or r.get('barcode') or native
 # A fingerprint/lookup token is explicitly not an assigned bibliographic identifier.
 kind='copy' if copy else 'fingerprint' if not native or r.get('nativeLookup') or r.get('recordIdIsFingerprint') else 'native_bibliographic'
 key=digest(js([lib,label,kind,native or eid+suffix]).encode())
 db.execute('INSERT OR IGNORE INTO catalog_records VALUES(?,?,?,?,?)',(key,lib,label,str(native) if native is not None else None,kind))
 obs=r.get('observation') or {};url=r.get('itemUrl') or r.get('catalogUrl') or obs.get('catalogUrl')
 authors=r.get('authors');authors=[r['author']] if authors is None and r.get('author') else authors
 isbns=r.get('isbns') or [r[k] for k in ('isbn','isbn13','isbn10') if r.get(k)]
 oid=eid+':'+suffix
 values=(oid,eid,key,date,r.get('title'),js(authors) if authors is not None else None,r.get('edition') or r.get('editionStatement'),js(isbns) if isbns else None,r.get('publisher'),r.get('publicationYear') or r.get('publishedDate') or r.get('year'),r.get('language'),r.get('format') or r.get('materialType') or obs.get('format'),url,r.get('linkKind') or obs.get('catalogLinkKind'),js(r),VERSION,now())
 db.execute('INSERT OR IGNORE INTO record_observations VALUES('+','.join('?'*len(values))+')',values)
 return oid

def normalize(db,e,source,line,root):
 raw=js(e);eid=e.get('eventId') or digest((source+':'+str(line)+':'+raw).encode());h=digest(raw.encode())
 old=db.execute('SELECT content_sha256 FROM events WHERE id=?',(eid,)).fetchone()
 if old and old[0]!=h:raise ValueError('Conflicting event ID '+eid)
 db.execute('INSERT OR IGNORE INTO event_locations VALUES(?,?,?)',(eid,source,line)) if old else None
 if old:return
 if e.get('type')=='fifty_batch_complete':
  for name,key in [('summary.json','summarySha256'),('validation.json','validationSha256')]:
   p=safe(root,pathlib.Path(source).parent/'batches'/e['batch']/name)
   if file_hash(p)!=e[key]:raise ValueError('Batch artifact hash mismatch: '+str(p))
 source_id=e.get('libraryId');lib=map_id(db,source_id) if source_id else None
 date=e.get('sourceObservedAt') if e.get('observationKind')=='saved_response_reanalysis' else None
 date=date or e.get('observedAt') or e.get('at')
 typ=e.get('type','unknown');label=e.get('connectionId','primary')
 obs_kind=e.get('observationKind','live_http' if e.get('evidence') else 'unknown')
 db.execute('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?)',(eid,source,line,typ,lib,date,e.get('analysisAt'),raw,h))
 db.execute('INSERT INTO event_locations VALUES(?,?,?)',(eid,source,line))
 if typ=='revalidation_outcome_invalidated' and e.get('sourceEventId'):
  db.execute('INSERT OR IGNORE INTO invalidations VALUES(?,?,?)',(eid,e['sourceEventId'],e.get('reason')))
 if source_id and not lib:db.execute('INSERT INTO unmapped_evidence VALUES(?,?,?)',(eid,source_id,'no_unambiguous_canonical_id'))
 for ref in e.get('evidence') or []:
  if not isinstance(ref,dict) or not ref.get('path'):continue
  p=safe(root,pathlib.Path(source).parent/ref['path'])
  path=evidence_file(db,p,root,ref)
  db.execute('INSERT OR IGNORE INTO evidence_refs VALUES(?,?,?)',(eid,path,ref.get('sha256')))
 if not lib:return
 search_types={'batch_query_outcome','search_completed','search_failed','search_interrupted','triage_search','triage_search_failed','triage_lookup_failed'}
 if typ in search_types:
  result=e.get('result') or {};records=result.get('records',e.get('records',[])) or []
  interrupted=e.get('interrupted') or 'interrupted' in typ
  failed=e.get('ok') is False or 'failed' in typ
  outcome='interrupted' if interrupted else 'failed' if failed else 'success' if records else 'empty'
  total=result.get('total',e.get('total'));total=total.get('value') if isinstance(total,dict) else total
  profile=e.get('profile') or {}
  error=e.get('error') or e.get('code') or None
  db.execute('INSERT INTO searches VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(eid,lib,label,date,e.get('query'),e.get('field') or profile.get('field') or ('title' if typ=='batch_query_outcome' else None),js(profile),outcome,len(records),total,e.get('wallMs') or (e.get('timing') or {}).get('totalMs'),js(error) if isinstance(error,dict) else str(error) if error else None,obs_kind))
  for i,r in enumerate(records):
   oid=add_record(db,eid,lib,label,date,r,str(i));relevant=r.get('relevant')
   db.execute('INSERT INTO query_results VALUES(?,?,?,?)',(eid,i+1,oid,None if relevant is None else int(relevant)))
 if typ in ('book_accepted','book_rejected') and e.get('book'):
  oid=add_record(db,eid,lib,label,date,e['book'],'decision')
  db.execute('INSERT INTO book_decisions VALUES(?,?,?,?)',(eid,oid,typ,e.get('reason')))
 if typ.startswith('link_verification_') and e.get('url'):
  db.execute('INSERT INTO link_checks VALUES(?,?,?,?,?,?,?,?)',(eid,lib,e['url'],date,int(bool(e.get('tested'))),int(bool(e.get('identityConfirmed'))),e.get('outcome'),raw))
 outcome=e.get('outcome') if isinstance(e.get('outcome'),dict) else {}
 status=None;reason=None;count=None;kind='native'
 if typ in ('fifty_library_outcome','batch_library_outcome','triage_outcome'):
  if outcome.get('assessed') is False:return
  obs_kind='live_http' if typ in ('fifty_library_outcome','batch_library_outcome') else obs_kind
  status=outcome.get('status');count=outcome.get('distinctNativeBookRecords');reason=js(outcome.get('setupError') or outcome.get('errorCounts') or outcome.get('routes') or outcome.get('nextAction'))
 elif typ=='library_checkpoint':
  count=e.get('verifiedBooks');block=e.get('blocker') or {};code=str(block.get('code',''))
  status='Working' if count else 'Interrupted' if e.get('state')=='checking' else 'Blocked/deferred' if any(x in code for x in ('ROBOTS','ACCESS','HTTP','TIMEOUT','NETWORK')) else 'Needs work'
  reason=js(block) if block else e.get('state')
 elif typ=='app_search_assessment':
  # Explicit import contract only: no native event, fixture or provider lookup is promoted.
  kind='app';status='Interrupted' if e.get('interrupted') or e.get('completed') is False else 'Working' if e.get('relevantSpecificBook') is True and e.get('correctLibraryScope') is True and e.get('nativeRecordId') and e.get('query') and e.get('evidence') and obs_kind=='live_http' and not e.get('error') and e.get('ok') is not False else 'Needs work'
  reason=e.get('reason')
 if status:
  if status=='Blocked / deferred':status='Blocked/deferred'
  fp=e.get('configurationFingerprint') # Never assign today's fingerprint to historical observations.
  scope=e.get('scope') or outcome.get('coverage')
  db.execute('INSERT INTO checks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(eid,lib,label,date,e.get('analysisAt'),kind,status,reason,count,obs_kind,fp,scope))

def journals(root):
 # Discover authoritative journals, not export snapshots or archived preparation copies.
 paths=set()
 for p in root.rglob('events.jsonl'):
  if any(x in p.parts for x in ('reporting','prepared-repairs','milestones')):continue
  index=p.parent/'journal-index.json'
  if index.exists():
   idx=json.loads(index.read_text());seen=set()
   for seg in idx['sealed']:
    q=safe(root,p.parent.relative_to(root)/seg['path'])
    if q in seen:raise ValueError('Duplicate journal segment')
    seen.add(q)
    if file_hash(q)!=seg['sha256']:raise ValueError('Sealed segment hash mismatch: '+str(q))
    if seg.get('bytes') is not None and q.stat().st_size!=seg['bytes']:raise ValueError('Sealed size mismatch')
    paths.add(q)
   paths.add(safe(root,p.parent.relative_to(root)/idx['active']))
  else:paths.add(p)
 return sorted(paths)

def import_journal(db,p,root):
 rel=str(p.relative_to(root));old=db.execute('SELECT * FROM sources WHERE path=?',(rel,)).fetchone()
 offset=old['offset'] if old else 0
 # The complete prefix hash is checked even on resume: mutation is never accepted as append.
 h=hashlib.sha256()
 with p.open('rb') as f:
  left=offset
  while left:
   b=f.read(min(left,1024*1024))
   if not b:raise ValueError('Journal truncated: '+rel)
   h.update(b);left-=len(b)
  if old and h.hexdigest()!=old['sha256']:raise ValueError('Imported prefix changed: '+rel)
  line_no=sum(1 for _ in p.open('rb')) if offset==p.stat().st_size else 0
  if offset and offset<p.stat().st_size:
   with p.open('rb') as prev:line_no=prev.read(offset).count(b'\n')
  while True:
   b=f.readline()
   if not b or not b.endswith(b'\n'):break
   line_no+=1
   if b.strip():normalize(db,json.loads(b),rel,line_no,root)
   h.update(b);offset=f.tell()
 db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?)',(rel,p.stat().st_size,offset,h.hexdigest(),'journal'))

CSV_QUERIES={
 'libraries':'SELECT * FROM library_current',
 'connections':'SELECT * FROM connections',
 'checks':'SELECT * FROM checks',
 'searches':'SELECT * FROM searches',
 'results':'SELECT * FROM enriched_results',
 'books':'SELECT * FROM book_details',
 'book-observations':'SELECT * FROM enriched_observations',
 'book-decisions':'SELECT * FROM book_decisions',
 'links':'SELECT * FROM item_links',
 'link-check-history':'SELECT * FROM link_checks',
 'needs-work-libraries':"SELECT * FROM library_current WHERE status!='Working' OR app_eligible=0",
 'failures':"SELECT * FROM searches WHERE outcome IN ('failed','interrupted')",
 'unmapped-evidence':'SELECT * FROM unmapped_evidence',
 'sources':'SELECT * FROM sources',
 'metadata-extractions':'SELECT * FROM metadata_extractions',
 'query-quality':"SELECT library_id,field,count(*) attempts,sum(outcome='success') successful,sum(outcome='empty') empty,sum(outcome='failed') failed,avg(wall_ms) average_ms,count(DISTINCT CASE WHEN outcome='success' THEN query END) matched_tested_terms FROM searches GROUP BY library_id,field",
 'relevance':"SELECT s.library_id,count(*) returned,sum(q.relevant=1) explicitly_relevant,sum(q.relevant=0) explicitly_unrelated,sum(q.relevant IS NULL) unresolved FROM query_results q JOIN searches s ON s.id=q.search_id GROUP BY s.library_id",
}
def export(db,out):
 out.mkdir(parents=True,exist_ok=True)
 for name,sql in CSV_QUERIES.items():
  cursor=db.execute(sql)
  with (out/(name+'.csv')).open('w',newline='') as f:
   w=csv.writer(f);w.writerow([c[0] for c in cursor.description]);w.writerows(cursor)
 eligible=[dict(r) for r in db.execute('SELECT * FROM library_current WHERE app_eligible=1')]
 (out/'eligible-libraries.json').write_text(json.dumps(eligible,indent=2,ensure_ascii=False)+'\n')
 with (out/'archive-manifest.jsonl').open('w') as f:
  for r in db.execute('SELECT f.*,o.archive_key FROM evidence_files f JOIN evidence_objects o ON o.sha256=f.stored_sha256 ORDER BY f.path'):f.write(js(dict(r))+'\n')
 counts={t:db.execute('SELECT count(*) FROM '+t).fetchone()[0] for t in ('libraries','connections','events','checks','searches','query_results','catalog_records','evidence_files','evidence_objects','unmapped_evidence','metadata_extractions')}
 countries={r[0]:r[1] for r in db.execute('SELECT country,count(*) FROM libraries GROUP BY country')}
 size=db.execute('SELECT sum(bytes) FROM evidence_files').fetchone()[0] or 0
 unique=db.execute('SELECT sum(bytes) FROM evidence_objects').fetchone()[0] or 0
 summary={'schemaVersion':1,'generatedAt':now(),'counts':counts,'countries':countries,'nativeStatuses':{r[0]:r[1] for r in db.execute('SELECT status,count(*) FROM library_current GROUP BY status')},'eligible':len(eligible),'archive':{'sourceBytes':size,'uniqueStoredBytes':unique,'byteIdenticalSavings':size-unique,'objects':counts['evidence_objects'],'estimatedUploadPUTs':counts['evidence_objects'],'estimatedUploadRequestUSDWithoutAllowanceRounded':math.ceil(counts['evidence_objects']/1e6)*4.50,'monthlyStorageUSDWithoutAllowanceRounded':math.ceil(unique/1e9)*.015,'databaseSnapshotIncluded':False,'r2StandardStorageUSDPerMonthBeforeFreeTier':round(unique/1e9*.015,4),'r2PricingURL':'https://developers.cloudflare.com/r2/pricing/','pricingCheckedAt':'2026-11-10','provisioned':False,'uploaded':False,'note':'Account-wide allowance and rounded request charges apply. No cloud resources created.'},'limitations':['Native searches do not establish app eligibility.','Observed records are a sample, not total holdings.','No new provider checks; absent evidence stays unverified.']}
 (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
 return summary

def validate(db,root,full=False):
 errors=[]
 if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':errors.append('sqlite_integrity')
 if db.execute('PRAGMA foreign_key_check').fetchall():errors.append('foreign_keys')
 fifty='docs/research/india-library-audit/search-triage/egranthalaya-fifty-20261108/'
 q=db.execute("SELECT sum(s.outcome!='interrupted'),sum(returned),sum(s.outcome='interrupted') FROM searches s JOIN events e ON e.id=s.id WHERE e.source LIKE ?", (fifty+'batches/%',)).fetchone()
 n=db.execute("SELECT count(DISTINCT c.library_id) FROM checks c JOIN events e ON e.id=c.id WHERE e.type='fifty_library_outcome' AND e.source=?",(fifty+'events.jsonl',)).fetchone()[0]
 if n and (n,q[0],q[1])!=(5036,251600,104586):errors.append('fifty_totals_mismatch')
 if n:
  manifest=json.loads(safe(root,fifty+'manifest.json').read_text())
  native_json=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()
  frozen={x['libraryId'] for x in manifest['libraries']}
  actual={r[0] for r in db.execute("SELECT DISTINCT c.library_id FROM checks c JOIN events e ON e.id=c.id WHERE e.type='fifty_library_outcome' AND e.source=?",(fifty+'events.jsonl',))}
  if frozen!=actual or len(frozen)!=manifest['total']:errors.append('frozen_ids_mismatch')
  if digest(native_json(manifest['libraries']))!=manifest['libraryHash'] or digest(native_json(manifest['books']))!=manifest['bookHash']:errors.append('frozen_manifest_hash')
  if file_hash(safe(root,manifest['sourceManifest']['path']))!=manifest['sourceManifest']['sha256']:errors.append('source_manifest_hash')

 for row in db.execute("SELECT raw_json,source FROM events WHERE type='fifty_batch_complete'"):
  event=json.loads(row['raw_json'])
  for name,key in [('validation.json','validationSha256'),('summary.json','summarySha256')]:
   p=safe(root,pathlib.Path(row['source']).parent/'batches'/event['batch']/name)
   if file_hash(p)!=event[key]:errors.append('batch_hash:'+str(p))
 for row in db.execute('SELECT * FROM sources'):
  p=safe(root,row['path'])
  if row['offset']!=p.stat().st_size:errors.append('incomplete_active_line:'+row['path'])
 if full:
  for row in db.execute('SELECT * FROM evidence_files'):
   p=safe(root,row['path'])
   if file_hash(p)!=row['stored_sha256']:errors.append('stored_hash:'+row['path'])
   if p.suffix=='.gz':
    h=hashlib.sha256()
    with gzip.open(p,'rb') as f:
     for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    if h.hexdigest()!=row['raw_sha256']:errors.append('raw_hash:'+row['path'])
 return {'valid':not errors,'errors':errors,'fifty':{'libraries':n,'queries':q[0],'returnedCandidates':q[1],'interruptedObservationsRetained':q[2]},'fullHashes':full,'at':now()}

def restore(db,root,sha,destination):
 row=db.execute('SELECT path FROM evidence_files WHERE stored_sha256=? ORDER BY path LIMIT 1',(sha,)).fetchone()
 if not row:raise ValueError('Unknown archive object')
 p=safe(root,row[0]);target=pathlib.Path(destination)
 if target.exists():raise ValueError('Restore never overwrites an existing file')
 if file_hash(p)!=sha:raise ValueError('Restore source hash mismatch')
 target.parent.mkdir(parents=True,exist_ok=True)
 with p.open('rb') as src,target.open('xb') as dst:
  for b in iter(lambda:src.read(1024*1024),b''):dst.write(b)
 if file_hash(target)!=sha:raise ValueError('Restore byte verification failed')

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('command',choices=['import','export','validate','query','restore','enrich','prepare']);ap.add_argument('--root',type=pathlib.Path,default=HERE.parents[1]);ap.add_argument('--db',type=pathlib.Path,default=pathlib.Path('/workspace/library-data/library-data.sqlite'));ap.add_argument('--out',type=pathlib.Path,default=pathlib.Path('/workspace/library-data/current'));ap.add_argument('--node',default='node');ap.add_argument('--full',action='store_true');ap.add_argument('--country');ap.add_argument('--system');ap.add_argument('--library');ap.add_argument('--query');ap.add_argument('--since');ap.add_argument('--sha256');ap.add_argument('--destination');args=ap.parse_args();root=args.root.resolve()
 if args.command=='prepare':
  import fcntl
  from registry import refresh, export_registry
  lease=open(str(args.db)+'.import.lock','a');fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  db=connect(args.db)
  seed(db,json.loads(subprocess.check_output([args.node,str(HERE/'directory-snapshot.mjs')],cwd=root)));db.commit()
  from enrich import enrich
  enrich(db,root);refresh(db)
  print(js(export_registry(db,args.out/'registry')));return
 if args.command in ('import',):
  import fcntl
  args.db.parent.mkdir(parents=True,exist_ok=True)
  lease=open(str(args.db)+'.import.lock','a')
  fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  db=connect(args.db)
  snap=json.loads(subprocess.check_output([args.node,str(HERE/'directory-snapshot.mjs')],cwd=root))
  seed(db,snap);db.commit()
  corpus=root/'docs/research/india-library-audit'
  paths=journals(corpus)
  for i,p in enumerate(paths):
   with db:import_journal(db,p,root)
   if i%100==0:print(js({'journals':i+1,'total':len(paths)}),flush=True)
  # Archive every original corpus file, including unparsed snapshots, failures and CSVs.
  for i,p in enumerate(sorted(corpus.rglob('*'))):
   if p.is_file():evidence_file(db,p,root)
   if i%2000==0:db.commit()
  db.execute("INSERT OR IGNORE INTO invalidations SELECT id,json_extract(raw_json,'$.sourceEventId'),json_extract(raw_json,'$.reason') FROM events WHERE type='revalidation_outcome_invalidated' AND json_extract(raw_json,'$.sourceEventId') IS NOT NULL")
  db.execute("UPDATE checks SET observation_kind='live_http' WHERE id IN (SELECT id FROM events WHERE type IN ('fifty_library_outcome','batch_library_outcome'))")
  db.commit();result=validate(db,root)
  if not result['valid']:raise ValueError(js(result))
  from enrich import enrich
  enrich(db,root)
  from registry import refresh, export_registry
  refresh(db);export_registry(db,args.out/'registry')
  summary=export(db,args.out);(args.out/'validation.json').write_text(json.dumps(result,indent=2)+'\n');print(js(summary))
 else:
  db=sqlite3.connect('file:'+str(args.db.resolve())+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
  if args.command=='export':print(js(export(db,args.out)))
  elif args.command=='enrich':
   import fcntl
   lease=open(str(args.db)+'.import.lock','a');fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
   db.close();db=connect(args.db)
   from enrich import enrich
   print(js({'newMetadataExtractions':enrich(db,root)}))
   from registry import refresh, export_registry
   refresh(db);export_registry(db,args.out/'registry');print(js(export(db,args.out)))
  elif args.command=='validate':
   result=validate(db,root,args.full);print(js(result));sys.exit(0 if result['valid'] else 1)
  elif args.command=='restore':restore(db,root,args.sha256,args.destination)
  else:
   sql='SELECT s.*,l.country,l.system FROM searches s JOIN libraries l ON l.id=s.library_id WHERE 1=1';params=[]
   for field,value in [('l.country',args.country),('l.system',args.system),('s.library_id',args.library),('s.query',args.query)]:
    if value:sql+=' AND '+field+'=?';params.append(value)
   if args.since:sql+=' AND s.observed_at>=?';params.append(args.since)
   for r in db.execute(sql+' ORDER BY s.observed_at,s.id',params):print(js(dict(r)))
if __name__=='__main__':main()
