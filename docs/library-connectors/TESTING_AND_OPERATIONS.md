# Testing, performance and recurring operations

## Accuracy without browser control

Use the real public request/response as the source of truth, with a reviewed request recipe and a separate expected-result manifest. For HTML, identify ordered result IDs, displayed count, selected filters and detail links directly in saved sanitized markup. For JSON sites, document the publicly served client/request logic and any filtering/sorting before asserting displayed-result equivalence. Do not derive expected outputs by calling the same parser under test.

Version golden cases with source capture times, recipe/asset hashes and human-readable assertions. Compare the adapter against those expectations offline; use fresh HTTP tests to detect site drift. An offline fixture pass proves reproducibility, not live health. Native output parity and accepted-book relevance/membership are separate checks. Capture enough source evidence for every counted book; a screenshot is not required.

## Test layers

| Layer | Coverage | Network |
| --- | --- | --- |
| Contract/unit | Field mappings, encoding, ordered IDs, session transitions, counts, scope, identity and redaction | None |
| Fixture replay | Real sanitized positive/zero/error/paging cases plus labelled synthetic mutations; native transformations | None |
| Transport integration | Controlled HTTP server: CSRF rollover, redirects, 429/Retry-After, 200 challenge, partial bodies, TLS errors, cancellation and crash recovery | Local test server |
| Live canary | A small known good query/record per deployed variant; freshly read from the source | Bounded source HTTP |
| Initial qualification | Twenty distinct relevant books with verified member attribution per library | Paced, resumable HTTP |
| Periodic sentinel | Small known query/record set for each library, plus rotated terms to catch drift | Bounded fresh HTTP |
| Full requalification | Re-run twenty-book qualification using saved terms then recover changed records/terms | Rolling and budgeted |
| Performance | Deterministic fixture/load server for saturation; small paced live measurement for real latency | No provider load testing |

Cases must include multilingual scripts and byte limits, canonical ISBN variants without silent query changes, unsupported fields, query ignored by server, wrong branch, shared-index false positives, duplicate copies/editions, changed sorting, pagination overlap/loops, missing totals, missing native IDs, cookie isolation, expiry, 200 login pages, cached 404/zero mistakes, response truncation, conflicting writer, incomplete final JSONL and missing evidence hashes. No synthetic response is counted as a live finding.

Initial passing-library rule: 20 unique accepted books; every accepted book links a live query, sufficient identity/member evidence, request recipe and valid hashes; page/order parity verified; at least one record-resolution operation checked when supported. Search-only capability is explicit where detail lookup is unavailable.

## Planned recurring tiers

These are proposed defaults, **not activated schedules**. Tune them to pilot measurements and provider limits. Work is spread over the interval, not dispatched to thousands of libraries at the same moment.

| Tier | Initial proposed cadence | Work |
| --- | --- | --- |
| Offline regression | Every adapter/config change in CI | Affected variants plus cross-cutting contract/transport suite |
| Variant canary | Daily | One positive/empty handling or paging sentinel per active variant, rotate cases; shared-host budgets apply |
| Every-library health | Rolling weekly | Start with one known productive query and a selected record check where needed; track each library's last fresh check |
| Full 20-book requalification | Rolling monthly, budget permitting | All libraries; reuse term plans, still perform fresh source observations |
| Recovery | Triggered | Parser deployment, official endpoint change, cooldown expiry or documented access recovery |

When a known title disappears, retry a different saved term and classify `record_changed` or `query_empty`; do not immediately mark the entire catalog down. Persistent source refusal waits for an actionable trigger. If a full cycle exceeds budget, publish the exact overdue count/age and revise cadence openly; never claim current coverage from stale results. Each operation has its own health timestamp.

Scheduler supports pause/resume/cancel, run deduplication, due times, provider cooldowns and a global singleton lock. Existing research automation stays paused. A new monitor is enabled only as an explicit release/configuration action; restarting a worker does not implicitly enable it.

## Events and logging

Append events for `run_started`, `job_started`, `request_started`, `response_received`, `request_failed`, `parse_completed`, `scope_checked`, `book_accepted`, `book_rejected`, `retry_scheduled`, `job_checkpointed`, `run_completed`, `publish_failed` and `run_interrupted`. Request-start without completion after recovery becomes an interrupted attempt, not a lost job or duplicate success.

Correlate run/job/attempt/request IDs, parent request, library/connection, host budget group, adapter/config versions, timestamps, safe request profile, response status/size, queue/upstream/parse durations, fresh/cache state, rows returned, native total, accepted books, evidence hashes, error cause and next action. Distinguish requested, admitted, deferred, attempted and completed operations. Count retries by request attempt but libraries/books by stable distinct identities.

Owner-authored audit queries may be stored verbatim in audit evidence. Public user queries, tokens, cookies, viewstate, CSRF, authorization headers and patron fields do not enter telemetry or public reports. Redact before writing evidence; hash the retained sanitized bytes and version the redactor. Preserve source data fields used for proof. An evidence transformation must not erase the member/query assertions needed for verification. Test redaction against known sensitive shapes.

Use bounded metric labels such as family, country, outcome and error class. Library IDs, request IDs and query strings belong in controlled event records, not metric label cardinality. Event sink/storage failures must surface and stop a job from claiming an evidenced pass; do not silently drop qualification evidence.

## Metrics and formulas

| Metric | Definition / use |
| --- | --- |
| Initial qualification coverage | Libraries with 20 accepted books / all frozen in-scope libraries; also report all five status counts |
| Fresh health coverage | Libraries with an eligible completed live health check within the declared interval / all due libraries |
| Fidelity | Tested native ordered-ID/count/scope assertions passed / assertions evaluated; unknown cases listed separately |
| Search outcome | Fresh complete positive, healthy-zero, partial, parser failure, access refusal, timeout and pending counts; never combine into one misleading success number |
| p50/p95 latency | Queue, upstream, parse and end-to-end separately; split live/cache and family; show sample size and time window |
| Cost efficiency | Actual source requests and bytes / newly verified library or book; include failures and retries |
| Useful throughput | Newly qualified libraries/hour and books/hour, plus remaining work and actual provider-lane utilization |
| Request reduction | `(baseline requests - candidate requests) / baseline requests` for identical workload/proof requirements |
| Cache/coalescing | Cache hits and shared in-flight calls separately from fresh source contacts; observations retain original dates |
| Drift | Missing/added IDs, ordering/count changes, scope mismatches, detail failures and recurring parser/config variants |
| Resource usage | Peak RSS, CPU parse time, event/body storage growth, event lag, queue depth and checkpoint/push failures |

Use this evidence to choose larger native pages, fewer redundant detail calls, session reuse and permitted concurrency. Do not optimize on “requests per second” alone or trade away identity/holding proof for a higher passing count.

## Benchmarks and performance budgets

Benchmark a pinned fixture corpus and the same small live pilot before/after each optimization; record Node version, machine limits, cache mode, concurrency, provider delay and dataset hash. Golden native output and accepted-book decisions must remain equal. Live index drift is investigated rather than hidden by updating expected outputs automatically.

Provisional targets for our own overhead on a documented reference runner: p95 parse/normalize under 100 ms for a page up to 100 records/1 MiB, and p95 cache-only response under 100 ms. These are targets to establish in the pilot, not measured results or promises about a slow provider. Pages beyond that size use explicit variant budgets. A >20% repeatable overhead regression blocks optimization promotion until explained. Correctness/membership loss and quota violations block regardless of speed.

Measure cold and warm sessions, cache-disabled fresh runs, and unchanged response revalidation separately. No unconditional per-book detail request if the search page already proves all required fields; sample detail functionality independently. Don't fetch large exports repeatedly to make one library's health probe fast. Break down work by shared origin; wall-clock lower bound is governed by the slowest serialized provider lane, not total libraries divided by global concurrency.

## Recovery and publishing

For transient 5xx/timeouts, use bounded jittered backoff and at most the configured retry budget; defer further attempts to later runs. For 429 respect Retry-After and reduce/stop that origin's admission. For 401/403/CAPTCHA/prohibition, stop that path; a documented permitted alternative is a new recorded method. For parser drift, capture the failure once, quarantine the affected variant, fix offline and run a bounded live canary before resuming its queue.

Publishing snapshots is separate from collecting evidence. On failed commit/push save local checkpoint/error, reconcile remote state, and retry safely without force. Report runner state, fresh/processed counts and last successful saved/pushed checkpoint distinctly. A completed pass can contain unresolved library failures; neither a finished process nor a completed queue means every library qualified.

Reports retain successful/empty/failed terms, returned books, counts, partial reasons and next actions. Summaries compare to the previous report using stable IDs and immutable run manifests. Missing evidence hashes, duplicate count inflation, unknown library mappings or stale claims fail report validation.
