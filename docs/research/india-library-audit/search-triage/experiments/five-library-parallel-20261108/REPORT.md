# Five libraries together: bounded concurrency spike

Observed 8 November 2026. Main audit and hourly watcher remain paused. No app/source changes.

Five independent anonymous library sessions were initialized, then all five groups of fifty different Title searches were submitted together. There were 250 outstanding client requests at peak, no artificial start gap, a 45-second request deadline, and no retries. This measures client concurrency, not proof that the provider executed 250 requests simultaneously.

**Result: 132 of 250 searches matched their saved reference; 118 timed out.** All completed searches matched the reference native ID/title sets and total counts. Successful empty results are valid query responses, not books found. No completed search showed a result mismatch or explicit access/rate-limit refusal.

| Library | Attempted | Matched reference | Timed out | Nonempty responses | Empty responses | Batch seconds |
|---|---:|---:|---:|---:|---:|---:|
| JNV HANUMANGARH LIBRARY | 50 | 50 | 0 | 10 | 40 | 20.956 |
| JNV Hamirpur Library | 50 | 42 | 8 | 20 | 22 | 45.138 |
| JNV Jashpur Library | 50 | 27 | 23 | 15 | 12 | 45.216 |
| JNV JAFFARPUR KALAN DELHI | 50 | 13 | 37 | 3 | 10 | 45.334 |
| JNV Jhabua-1 Library | 50 | 0 | 50 | 0 | 0 | 45.472 |
| **Total** | **250** | **132** | **118** | **48** | **84** | **45.513 wave** |

Setup took 10.919 seconds; the concurrent wave took 45.513 seconds; total was 56.432 seconds. This was not a successful 250-query completion in 56 seconds. HTTP calls totalled 256: one robots request, five form GETs, 250 search POSTs. The robots URL returned 404; successful forms/searches returned 200. There were no item-detail requests or bulk content downloads.

The earlier experiment ran fifty searches concurrently inside one library at a time: all 250 succeeded, with 155.474 seconds of active execution including setup (126.725 seconds of search batches). This new test changed aggregate concurrency from 50 to 250; it retained independent sessions and paired all 250 exact library/title combinations with that prior evidence.

Completed responses favored the first submitted library groups. This could reflect transport/proxy/server queuing; the evidence does not isolate where requests waited. A client timeout does not prove a library is offline, a blocked route, a session error, or an exact provider capacity limit. Fifty concurrent searches per library succeeding individually does not establish that five such batches can safely overlap.

The current tested reliable reference is fifty aggregate outstanding requests, with one library batch at a time. A possible next bounded experiment is 25 per library across five libraries (125 aggregate), but it has NOT been run or scheduled here. No automatic retry or main-audit restart follows this spike.

## Reviewable evidence

- [Library totals](libraries.csv)
- [All 250 exact queries, outcomes and evidence references](queries.csv)
- [All returned candidate records](results.csv)
- [118 timed-out queries](failures.csv)
- [Validation and response hashes](validation.json)
- [Raw append-only journal](events.jsonl) and content-addressed bodies in `bodies/`
- [Frozen baseline references](baseline.json), sourced from [previous benchmark](../cluster-throughput-20261108/REPORT.md), commit 381a21e8be487251ffb31616e97019f8f73738c1

Search responses are not twenty-distinct-book or per-item-link passes. These requests do not add newly audited libraries to the frozen main run.
