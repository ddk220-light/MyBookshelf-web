# Cluster search throughput benchmark

The owner stopped the main audit on 8 November. It and its hourly reporting automation remain paused until new owner direction. This isolated benchmark does not change production or main-audit code or count new library audits.

## Workload and method

Use one Node process, no worker threads and no AI in the request loop. Five frozen JNV2 members; first 50 distinct works from the saved 80-title pack; exactly 250 unique library/title jobs. Fetch the cluster form once for the serial/shared-session test. Submit only Title/LIKE/Books searches, preserve library and query echoes, native IDs/titles/counts and sanitized bodies. No detail lookups. An empty recognized search is a successful request with zero matches, not a library failure or a twenty-book pass.

Ten balanced jobs (first two titles across all five members) form the serial baseline and comparable concurrency canaries. Additional canary replays are labelled repeats and do not inflate the 250 unique jobs. Compare shared session versus separate sessions within the same process. A separate-session pool needs one initial GET per session. Retain the shared-session setup advantage separately from throughput.

## Bounded ramp

Serial -> 2 -> 5 -> 10 concurrent requests. Shared-session and separate-session ramps are separate. Aggregate request starts are paced: one per second through concurrency 2; at most two per second at 5/10, with no immediate burst. Existing provider policies, crawl delays, origin refusals and cooldowns still apply. Ten is this pilot ceiling, not a claim of the provider's maximum. Do not fire 100 simultaneous requests. Increase only when the preceding stage remains correct and gains at least 10% throughput; skip larger stages after a plateau, meaningful latency inflation, errors or scope/query/identity mismatch. Stop all requests on 401/403/429 or genuine challenge. No automatic failure retries. Save every failure and unfinished job.

Use fixed form state from the appropriate initial cluster page; do not mutate shared session state on response completion. Compare canary native ID/title sets, totals, query echo and selected library with serial results. Same-title ordering can vary and is recorded separately. Session rotation, wrong library and wrong query are correctness failures.

## Measurements and outcome

Save per-request actual network start, completion, queue time, response time, HTTP status, bytes, observed in-flight count, recognized/empty/nonempty results, native IDs/titles and source hashes. Per stage: measured wall time, requests/second, median/p95 latency, peak in-flight requests, errors and mismatches. Finish the remaining unique jobs at the fastest correct measured configuration, retaining a conservative fallback for overload.

Report actual whole-experiment time (including setup/canaries), actual time and throughput for the remaining workload, and separately labelled estimates for all 250 searches serially and at the best measured rate. Do not pretend phases with different queries are a controlled full-250 A/B trial. This experiment cannot determine an unrestricted maximum or guarantee twenty books per library. Save checkpoints and publish results, but DO NOT resume the main audit or its watcher.
