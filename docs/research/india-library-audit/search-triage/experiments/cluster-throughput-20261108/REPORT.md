# Fifty simultaneous searches per library — measured result

**All 250 library/title pairs completed with valid native search responses, using one independent session per library and 50 requests genuinely in flight together.** No artificial request-start spacing was used. Main audit and hourly milestone watcher remain paused.

| Library | Searches with matches | Empty searches | 50-search batch | Peak in flight |
|---|---:|---:|---:|---:|
| JNV HANUMANGARH LIBRARY | 10 | 40 | 20.9 s | 50 |
| JNV Hamirpur Library | 25 | 25 | 34.6 s | 50 |
| JNV Jashpur Library | 26 | 24 | 27.2 s | 50 |
| JNV JAFFARPUR KALAN DELHI | 12 | 38 | 26.7 s | 50 |
| JNV Jhabua-1 Library | 9 | 41 | 17.4 s | 50 |

The five search batches took **126.7 seconds combined**. Active execution including the five initial catalog form fetches, policy checks and evidence saving was **155.5 seconds** across two processes run consecutively after a diagnostic stop. Wall-clock time from the first run start to final completion was **215.8 seconds**, including a **60.3-second diagnostic pause**. This was not one uninterrupted 250-query execution. Each process used one Node event loop, no worker threads or AI response processing.

There were **82 nonempty searches and 168 valid empty searches**, with no HTTP/source request failures in this final 250-query pass. Fifty searches do not imply fifty books, twenty verified books, item-link health, or production readiness. `libraries.csv` counts distinct native catalog IDs separately from query hits; it does not merge copies/editions into inferred books.

## Correctness and retained negative evidence

The first cross-library session experiment in the parent journal found incorrect native result sets even when the selected-library echo looked correct. Those provisional results do not count here. Per-library sessions avoid changing member scope within a session. The paced per-library reference stopped at 171 unique pairs when the owner changed the benchmark method; its operator-aborted requests are retained as cancellations, not provider outages.

The final simultaneous pass compared **171 pairs** against that saved reference; the other pairs required correct library/query echoes, native IDs and relevant titles. All 50 first-library comparisons had a saved reference. Returned source records and counts remain in full. The false checker flag for Jashpur’s `Harry Potter and the Philosopher's Stone` was corrected offline: native ID406367 and the title `HARRY POTTER AND THE PHILOSOPHERS STONE-1` exactly matched the reference. Original failure, source date/hash and separate reanalysis event are retained. No duplicate provider request was used for that correction. The remaining two libraries ran after this fix; no first-150 searches were repeated.

## What this establishes

Fifty simultaneous searches within a single library session worked on these five JNV2 members in this bounded test. A 25-request fallback was unnecessary. This does not establish maximum server capacity, unlimited long-run throughput, all-cluster compatibility, or permission to overlap multiple 50-request library batches against the same origin. No 100-request test occurred. Older artificial-rate stages are retained separately and must not be represented as a clean unrestricted serial baseline. A full unpaced serial-250 trial was not performed.

## Files

`summary.json` is the consolidated result. `libraries.csv`, `queries.csv` and `results.csv` contain the per-library measurements, all 250 query outcomes and every returned record. `per-library-v3/` and `per-library-v4/` contain final HTTP journals and content-addressed bodies; earlier parent/v2 evidence remains historical diagnostics. `IMPLEMENTATION_PLAN.md` describes the proposed audit change; main collector code and production are unchanged. `validation.json` verifies raw body hashes, unique jobs and report reconciliation.
