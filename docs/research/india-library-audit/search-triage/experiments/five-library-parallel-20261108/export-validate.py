import json,pathlib,csv,hashlib,collections,datetime
p=pathlib.Path('/workspace/library-audit-review/five-library-parallel-spike-20261108')
s=json.loads((p/'summary.json').read_text());m=json.loads((p/'manifest.json').read_text());b=json.loads((p/'baseline.json').read_text())
raw=(p/'events.jsonl').read_bytes();assert raw.endswith(b'\n');e=[json.loads(l) for l in raw.splitlines()];q=[x for x in e if x['type']=='parallel_search_result']
assert len(q)==250 and len({x['jobId'] for x in q})==250
assert {x['jobId'] for x in q}==set(b)
assert collections.Counter(x['libraryId'] for x in q)=={x['libraryId']:50 for x in m['libraries']}
checked=set()
for x in e:
 ev=x.get('evidence',[]);ev=[ev] if isinstance(ev,dict) else ev
 for v in ev:
  if v.get('path'):
   f=p/v['path'];assert hashlib.sha256(f.read_bytes()).hexdigest()==v['sha256'];checked.add(v['sha256'])
refroot=pathlib.Path('/workspace/MyBookshelf-web-india-library-audit/docs/research/india-library-audit/search-triage/experiments/cluster-throughput-20261108')
for k,v in b.items():
 ev=v['evidence'];assert hashlib.sha256((refroot/ev['referenceDirectory']/ev['path']).read_bytes()).hexdigest()==ev['sha256']
for x in q:
 if x['ok']:
  a=x['result'];z=b[x['jobId']]['result'];assert a['total']==z['total']
  assert sorted((r['recordId'],r['title']) for r in a['records'])==sorted((r['recordId'],r['title']) for r in z['records'])
  assert x['sessionStable'] and x['titlesRelevant'] and x['sameTotal'] and x['sameRecordSet']
 else: assert x['error']['code']=='UPSTREAM_TIMEOUT'
assert sum(x['ok'] for x in q)==132
starts=[x for x in e if x['type']=='benchmark_network_started' and x['method']=='POST'];assert len(starts)==250
parse=lambda t:datetime.datetime.fromisoformat(t.replace('Z','+00:00'))
spread=(max(parse(x['atNetworkStart']) for x in starts)-min(parse(x['atNetworkStart']) for x in starts)).total_seconds()
def csvout(name,rows):
 with (p/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
libraries=[]
for r in s['perLibrary']:
 libraries.append({k:r[k] for k in ['libraryId','name','attempts','matchedReference','nonempty','empty','elapsedSeconds']}|{'timeouts':len(r['errors'])})
csvout('libraries.csv',libraries)
queries=[];results=[]
for x in sorted(q,key=lambda x:x['jobId']):
 a=x.get('result',{});ev=x.get('evidence',{})
 row={k:x.get(k,'') for k in ['jobId','libraryId','name','query','workId','requestedMember','startedAt','finishedAt','wallMs','wireMs','referenceEventId']}
 row.update(outcome='matched_reference' if x['ok'] else 'timeout',error=x.get('error',{}).get('code',''),total=a.get('total',''),returned=a.get('returned',''),evidenceSha256=ev.get('sha256',''),evidencePath=ev.get('path',''),eventId=x['eventId'])
 queries.append(row)
 for a in a.get('records',[]):results.append({'jobId':x['jobId'],'libraryId':x['libraryId'],'query':x['query'],'recordId':a['recordId'],'title':a['title'],'authors':json.dumps(a.get('authors',[])),'isbn':a.get('isbn') or '', 'observedAt':x['finishedAt'],'evidenceSha256':ev['sha256']})
csvout('queries.csv',queries);csvout('results.csv',results);csvout('failures.csv',[r for r in queries if r['outcome']=='timeout'])
v={'validatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'uniquePairs':250,'matchedReference':132,'timeouts':118,'currentBodyHashesVerified':len(checked),'baselineBodyReferencesVerified':250,'allReturnedCandidateRows':len(results),'postInvocationSpreadSeconds':spread,'httpStatusCounts':dict(collections.Counter(str(x['status']) for x in e if x['type']=='response_received')),'journalSha256':hashlib.sha256(raw).hexdigest(),'lastNetworkInFlight':next(x['inFlightAfter'] for x in reversed(e) if x['type']=='benchmark_network_finished')}
assert v['lastNetworkInFlight']==0
(p/'validation.json').write_text(json.dumps(v,indent=2)+'\n')
report='''# Five libraries together: bounded concurrency spike\n\nObserved 8 November 2026. Main audit and hourly watcher remain paused. No app/source changes.\n\nFive independent anonymous library sessions were initialized, then all five groups of fifty different Title searches were submitted together. There were 250 outstanding client requests at peak, no artificial start gap, a 45-second request deadline, and no retries. This measures client concurrency, not proof that the provider executed 250 requests simultaneously.\n\n**Result: 132 of 250 searches matched their saved reference; 118 timed out.** All completed searches matched the reference native ID/title sets and total counts. Successful empty results are valid query responses, not books found. No completed search showed a result mismatch or explicit access/rate-limit refusal.\n\n| Library | Attempted | Matched reference | Timed out | Nonempty responses | Empty responses | Batch seconds |\n|---|---:|---:|---:|---:|---:|---:|\n'''
for r in libraries:report+=f"| {r['name']} | 50 | {r['matchedReference']} | {r['timeouts']} | {r['nonempty']} | {r['empty']} | {r['elapsedSeconds']:.3f} |\n"
report+='''| **Total** | **250** | **132** | **118** | **48** | **84** | **45.513 wave** |\n\nSetup took 10.919 seconds; the concurrent wave took 45.513 seconds; total was 56.432 seconds. This was not a successful 250-query completion in 56 seconds. HTTP calls totalled 256: one robots request, five form GETs, 250 search POSTs. The robots URL returned 404; successful forms/searches returned 200. There were no item-detail requests or bulk content downloads.\n\nThe earlier experiment ran fifty searches concurrently inside one library at a time: all 250 succeeded, with 155.474 seconds of active execution including setup (126.725 seconds of search batches). This new test changed aggregate concurrency from 50 to 250; it retained independent sessions and paired all 250 exact library/title combinations with that prior evidence.\n\nCompleted responses favored the first submitted library groups. This could reflect transport/proxy/server queuing; the evidence does not isolate where requests waited. A client timeout does not prove a library is offline, a blocked route, a session error, or an exact provider capacity limit. Fifty concurrent searches per library succeeding individually does not establish that five such batches can safely overlap.\n\nThe current tested reliable reference is fifty aggregate outstanding requests, with one library batch at a time. A possible next bounded experiment is 25 per library across five libraries (125 aggregate), but it has NOT been run or scheduled here. No automatic retry or main-audit restart follows this spike.\n\n## Reviewable evidence\n\n- [Library totals](libraries.csv)\n- [All 250 exact queries, outcomes and evidence references](queries.csv)\n- [All returned candidate records](results.csv)\n- [118 timed-out queries](failures.csv)\n- [Validation and response hashes](validation.json)\n- [Raw append-only journal](events.jsonl) and content-addressed bodies in `bodies/`\n- [Frozen baseline references](baseline.json), sourced from [previous benchmark](../cluster-throughput-20261108/REPORT.md), commit 381a21e8be487251ffb31616e97019f8f73738c1\n\nSearch responses are not twenty-distinct-book or per-item-link passes. These requests do not add newly audited libraries to the frozen main run.\n'''
(p/'REPORT.md').write_text(report)
print(json.dumps(v,indent=2))
