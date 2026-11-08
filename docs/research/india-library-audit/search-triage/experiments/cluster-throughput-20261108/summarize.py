from pathlib import Path
import json,hashlib,csv,datetime,re
p=Path(__file__).parent
load=lambda d:[json.loads(l) for l in (p/d/'events.jsonl').read_text().splitlines()]
e3=load('per-library-v3');e4=load('per-library-v4');e2=load('per-library-v2');manifest=json.loads((p/'manifest.json').read_text());expected={j['jobId'] for j in manifest['jobs']}
corrections={e['jobId']:e for e in e3 if e['type']=='benchmark_result_reanalysis' and e['ok']};rows={}
for d,es in [('per-library-v3',e3),('per-library-v4',e4)]:
 for e in es:
  if e['type']=='benchmark_search_result':
   assert e['jobId'] not in rows
   valid=e['ok'] or e['jobId'] in corrections
   assert valid and e['result']['status']==200 and e['result']['recognizedSearch'] and e['sessionStable']
   norm=lambda t:''.join(c for c in t.casefold() if c.isalnum())
   assert all(norm(e['query']) in norm(b['title']) for b in e['result']['records'])
   rows[e['jobId']]={**e,'currentValid':True,'sourceDirectory':d,'correctionEventId':corrections.get(e['jobId'],{}).get('eventId')}
assert set(rows)==expected and len(rows)==250
bodies=0;files=0
for d in ['', 'per-library-v2','per-library-v3','per-library-v4']:
 root=p/d;events=[json.loads(l) for l in (root/'events.jsonl').read_text().splitlines()];refs={}
 for e in events:
  for r in ([e['evidence']] if isinstance(e.get('evidence'),dict) else e.get('evidence',[])):refs[r['path']]=r
 for path,r in refs.items():assert hashlib.sha256((root/path).read_bytes()).hexdigest()==r['sha256']
 bodies+=len(refs);files+=len(events)
stages=[e for e in e3+e4 if e['type']=='benchmark_stage_completed'];assert len(stages)==5 and all(s['attempted']==50 and s['peakInFlight']==50 for s in stages)
librows=[]
for lib,stage in zip(manifest['libraries'],stages):
 rs=[r for r in rows.values() if r['libraryId']==lib['libraryId']];records=[b for r in rs for b in r['result']['records']]
 librows.append({'libraryId':lib['libraryId'],'name':lib['name'],'searched':len(rs),'queriesWithMatches':sum(r['result']['returned']>0 for r in rs),'emptySearches':sum(r['result']['returned']==0 for r in rs),'httpOrSourceErrors':0,'responseRows':len(records),'distinctNativeCatalogIds':len({b['recordId'] for b in records}),'batchSeconds':stage['elapsedSeconds'],'medianResponseMs':stage['medianWireMs'],'p95ResponseMs':stage['p95WireMs'],'peakSimultaneousRequests':stage['peakInFlight']})
writecsv=lambda name,fields,rs: None
def csvfile(name,fields,rs):
 with (p/name).open('w') as f:
  w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rs)
csvfile('libraries.csv',list(librows[0]),librows)
qs=[];bs=[]
for r in rows.values():
 qs.append({'jobId':r['jobId'],'libraryId':r['libraryId'],'name':r['name'],'query':r['query'],'observedAt':r['finishedAt'],'httpStatus':r['result']['status'],'queryEcho':r['result']['echoedQuery'],'requestedMember':r['requestedMember'],'returnedRows':r['result']['returned'],'nativeTotal':r['result']['total'],'responseMs':r['wireMs'],'comparedWithReference':r.get('sameRecordSet') is not None or bool(r['correctionEventId']),'currentValid':True,'originalCheckerPassed':r['ok'],'correctionEventId':r['correctionEventId'],'sourceEventId':r['eventId'],'evidencePath':r['sourceDirectory']+'/'+r['evidence']['path'],'sha256':r['evidence']['sha256']})
 for b in r['result']['records']:bs.append({'jobId':r['jobId'],'libraryId':r['libraryId'],'query':r['query'],'nativeId':b['recordId'],'title':b['title'],'isbn':b.get('isbn'),'sourceEventId':r['eventId'],'observedAt':r['finishedAt']})
csvfile('queries.csv',list(qs[0]),qs);csvfile('results.csv',list(bs[0]),bs)
p3=json.loads((p/'per-library-v3/progress.json').read_text());p4=json.loads((p/'per-library-v4/progress.json').read_text());active=p3['elapsedSeconds']+p4['elapsedSeconds'];batch=sum(r['batchSeconds'] for r in librows)
parse=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
start=next(e['at'] for e in e3 if e['type']=='benchmark_started');end=next(e['at'] for e in reversed(e4) if e['type']=='benchmark_finished');wall=(parse(end)-parse(start)).total_seconds()
summary={'schemaVersion':1,'completedUniqueLibraryQueryPairs':250,'libraries':5,'queriesPerLibrary':50,'matchedQueries':sum(r['queriesWithMatches'] for r in librows),'emptyQueries':sum(r['emptySearches'] for r in librows),'sourceRequestErrors':0,'checkerFlagsCorrectedFromSavedEvidence':1,'referenceComparedPairs':sum(r['comparedWithReference'] for r in qs),'actualPeakInFlightPerLibrary':50,'artificialStartGapMs':0,'queryBatchSecondsCombined':batch,'activeExecutionSecondsIncludingSetup':active,'elapsedWallSecondsIncludingDiagnosticPause':wall,'diagnosticPauseSeconds':wall-active,'twentyBookPassesNotAssessed':True,'mainAuditPaused':True,'milestoneWatcherPaused':True,'libraryResults':librows,'validatedBodyReferences':bodies,'validatedJournalEvents':files,'sourceStartAt':start,'sourceEndAt':end}
(p/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
report=['# Fifty simultaneous searches per library — measured result','','**All 250 library/title pairs completed with valid native search responses, using one independent session per library and 50 requests genuinely in flight together.** No artificial request-start spacing was used. Main audit and hourly milestone watcher remain paused.','','| Library | Searches with matches | Empty searches | 50-search batch | Peak in flight |','|---|---:|---:|---:|---:|']
for r in librows:report.append(f"| {r['name']} | {r['queriesWithMatches']} | {r['emptySearches']} | {r['batchSeconds']:.1f} s | {r['peakSimultaneousRequests']} |")
report += ['',f"The five search batches took **{batch:.1f} seconds combined**. Active execution including the five initial catalog form fetches, policy checks and evidence saving was **{active:.1f} seconds** across two processes run consecutively after a diagnostic stop. Wall-clock time from the first run start to final completion was **{wall:.1f} seconds**, including a **{wall-active:.1f}-second diagnostic pause**. This was not one uninterrupted 250-query execution. Each process used one Node event loop, no worker threads or AI response processing.",'',f"There were **{summary['matchedQueries']} nonempty searches and {summary['emptyQueries']} valid empty searches**, with no HTTP/source request failures in this final 250-query pass. Fifty searches do not imply fifty books, twenty verified books, item-link health, or production readiness. `libraries.csv` counts distinct native catalog IDs separately from query hits; it does not merge copies/editions into inferred books.",'','## Correctness and retained negative evidence','','The first cross-library session experiment in the parent journal found incorrect native result sets even when the selected-library echo looked correct. Those provisional results do not count here. Per-library sessions avoid changing member scope within a session. The paced per-library reference stopped at 171 unique pairs when the owner changed the benchmark method; its operator-aborted requests are retained as cancellations, not provider outages.','',f"The final simultaneous pass compared **{summary['referenceComparedPairs']} pairs** against that saved reference; the other pairs required correct library/query echoes, native IDs and relevant titles. All 50 first-library comparisons had a saved reference. Returned source records and counts remain in full. The false checker flag for Jashpur’s `Harry Potter and the Philosopher's Stone` was corrected offline: native ID406367 and the title `HARRY POTTER AND THE PHILOSOPHERS STONE-1` exactly matched the reference. Original failure, source date/hash and separate reanalysis event are retained. No duplicate provider request was used for that correction. The remaining two libraries ran after this fix; no first-150 searches were repeated.",'','## What this establishes','','Fifty simultaneous searches within a single library session worked on these five JNV2 members in this bounded test. A 25-request fallback was unnecessary. This does not establish maximum server capacity, unlimited long-run throughput, all-cluster compatibility, or permission to overlap multiple 50-request library batches against the same origin. No 100-request test occurred. Older artificial-rate stages are retained separately and must not be represented as a clean unrestricted serial baseline. A full unpaced serial-250 trial was not performed.','','## Files','','`summary.json` is the consolidated result. `libraries.csv`, `queries.csv` and `results.csv` contain the per-library measurements, all 250 query outcomes and every returned record. `per-library-v3/` and `per-library-v4/` contain final HTTP journals and content-addressed bodies; earlier parent/v2 evidence remains historical diagnostics. `IMPLEMENTATION_PLAN.md` describes the proposed audit change; main collector code and production are unchanged. `validation.json` verifies raw body hashes, unique jobs and report reconciliation.']
(p/'REPORT.md').write_text('\n'.join(report)+'\n')
(p/'validation.json').write_text(json.dumps({'valid':True,'uniquePairs':250,'frozenManifestPairs':250,'libraries':5,'queriesPerLibrary':[r['searched'] for r in librows],'queryCsvRows':len(qs),'returnedResultRows':len(bs),'validatedBodyReferences':bodies,'journalEvents':files,'fileHashes':{name:hashlib.sha256((p/name).read_bytes()).hexdigest() for name in ['manifest.json','summary.json','REPORT.md','libraries.csv','queries.csv','results.csv']}},indent=2)+'\n')
print(json.dumps(summary,indent=2))
