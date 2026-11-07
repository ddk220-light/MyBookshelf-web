# Library audit implementation status — 7 November 2026

The internal HTTP testing system is implemented and the **6,703-library India queue is prepared**. A separate pilot has verified **20 distinct books for one library**. The comprehensive country audit has not started. No browser control, production release or recurring job was started.

Use the [runbook](RUNBOOK.md), [full library list](../research/india-library-audit/runs/india-20261107/library-status.csv) and [pilot results](../research/india-library-audit/runs/pilot-http-20261107/library-status.csv). The broader design and backlog remain useful acceptance criteria; this checkpoint does not assert all their future features are complete.

## Delivered

- One connector service behind the internal REST API and CLI. Literal queries, explicit fields, native record order, native totals, signed page/record references, scoped routes and explicit unsupported modes. [OpenAPI contract](../../server/services/catalog-connectors/openapi.json).
- Governed HTTP transport with anonymous provider sessions, origin allowlists, robots checks, three-second minimum pacing, global/request admission limits, response/deadline limits and cancellation. Existing app caches are bypassed only inside the connector context. Independent hosts can progress while a shared host is busy.
- Frozen inventories, exclusive run and machine-local collector locks, append-only events, sanitized response bodies with hashes, heartbeat/checkpoints and interrupted-tail recovery. A persistence failure waits for every worker before releasing its lock.
- Native search entry points for e-Granthalaya, Koha, IndCat, LIBMAN and VuFind, removing the old ten-result cap from audit responses. Independent HTML link extraction checks result IDs/order separately from the provider parser. JS/legacy display semantics remain unverified where not demonstrated.
- Adaptive seed terms, explicit title searches, conservative duplicate/book/relevance/member checks, a target of 20, recorded rejections and reusable sufficient search-page evidence. Record resolution is exercised; catalog presence never implies a borrowable copy.
- Resumable qualification, separate health checks, operator start/status/cancel/idempotency, JSON/CSV/filterable HTML reports, source timing/byte metrics, per-family totals, offline replay benchmark, and disabled rolling weekly/monthly scheduling support.
- Focused regression tests in CI, executable operator documentation and a continuation checkpoint.

## Coverage at this checkpoint

| Queue | Entries | Qualified with 20 | Interpretation |
| --- | ---: | ---: | --- |
| Full India run | 6,703 | 0 in this run | Prepared; zero provider requests. Pilot evidence is kept separate. |
| Selected pilot | 11 of the same 6,703 | 1 | Harekrushna Mahtab State Library has 20 distinct books from real searches and membership evidence. |

The configured route breakdown is **6,594 with native-search entry points**, **86 with legacy HTTP methods needing equivalence review**, and **23 without an implemented search method**. These are implementation/preflight counts, not successful library counts. The 639 LIBMAN entries are among the native-entry-point count, but their public client/display contract remains unverified. The 379 historical omitted connection rows are indexed with reasons and remain unresolved mapping work, not additional libraries.

## Live pilot and failures

| Library/variant | Observed outcome | Next action |
| --- | --- | --- |
| Harekrushna Mahtab State Library, e-Granthalaya | **20 distinct books verified.** Keyword `Wings of Fire` returned 5; `Science` returned 20 native rows in keyword/title modes; Title `History` returned 20. Duplicates and unproved relevance were rejected. | Expand to more clusters/members and verify native continuation. |
| IndCat ABHA_783384 | `Computer` returned 10 ordered records, native total 237. `Wings of Fire` had a contradictory page (claimed records but no record links), correctly rejected. | Retain the failed response; extend queries, record proof and paging for this institution. |
| Surat community catalog | `Wings of Fire` returned 10; website display equivalence remains unverified. | Review public request/display recipe before qualification. |
| Visakhapatnam public catalog | `Wings of Fire` returned 10 through the legacy adapter; equivalence remains unverified. | Review native query semantics and display transformations. |
| LIBMAN tenant 100 | A recognized zero for TITLE `Wings of Fire`; client/display equivalence remains unverified. | Try relevant local terms after reviewing the client contract. |
| Patna BNMC academic catalog | Legacy query returned zero. | Review query transformations and native result semantics. |
| Anna Centenary Library | Catalog-host request failed during policy/transport setup. | Verify the configured endpoint/network route; no absence claim. |
| Somaiya VuFind | Search route disallowed by robots. | Keep blocked; wait for a permitted route/policy change. |
| IIT Madras Chamo, IIM Tiruchirappalli LIBSYS, Adhiparasakthi Kalavai | No implemented HTTP search adapter; no catalog request made. | Implement/review an official search route or retain an explicit unsupported outcome. |

This was 11 selected targets, eight with actual HTTP attempts and three stopped by unsupported capabilities. Four targets returned nonempty results, two returned zero, and two encountered transport/policy problems. Only the e-Granthalaya target completed the book qualification. The raw journal retains earlier failures and an intentionally interrupted/resumed pilot; a recovered search does not erase its failed attempt.

See [searches](../research/india-library-audit/runs/pilot-http-20261107/searches.csv), [books](../research/india-library-audit/runs/pilot-http-20261107/books.csv), [events](../research/india-library-audit/runs/pilot-http-20261107/events.jsonl) and [metrics](../research/india-library-audit/runs/pilot-http-20261107/metrics.json).

## Accuracy and speed observations

The native e-Granthalaya response is checked for the literal query, selected library, Title/ALL field, Books material, LIKE operator, title sort and page size. Once an actual detail lookup has been exercised, a validated member-scoped Books page is sufficient catalog-presence evidence for later results. It avoids a home/session and detail fetch for each book. It does not invent copy availability.

In the saved final two title searches, the service took approximately **36–39 seconds**: about six seconds of intentional pacing, **30–33 seconds upstream**, and **31–32 milliseconds** in local processing. A 100-iteration offline replay of retained real pages measured p95 parser plus independent-ID checking at **14.74 ms for 20 e-Granthalaya rows** and **1.75 ms for 10 IndCat rows**. These are samples on this machine, not throughput promises for other sites. The initial unoptimized keyword pilot's slow detail calls remain in the metrics rather than being deleted.

[Benchmark output](../research/india-library-audit/runs/pilot-http-20261107/benchmark.json) clearly labels replay as offline. Provider latency, shared-host pacing and number of meaningful queries dominate elapsed time. There is not yet enough representative multi-cluster evidence to promise a full-country completion date or increase provider concurrency.

## Validation

- **27 connector/audit tests pass**, including literal queries, wrong scope, clipping/reordering, caches, robot rules, host fairness, rate limits, body limits, hash failures, partial journal recovery, duplicate counting, API authentication/idempotency/cancellation, resume, disabled scheduling and request reduction from sufficient book-list proof.
- **594 existing server tests pass; 15 skipped** because the optional database-backed account integration environment was not configured for this connector task. No existing server test failed. No account infrastructure changed.
- Both run journals and frozen inventory hashes validate. Reports reconcile to their distinct run manifests; the full queue has zero live results. Source artifacts and documentation links are checked before publication.
- The actual pilot reached 20 without browser control and exercised safe interruption/resumption. This is a pilot, not acceptance for every family or all 62 e-Granthalaya clusters.

## Backlog handoff

| Stories | Implemented outcome | Remaining acceptance work |
| --- | --- | --- |
| A1–A3 | Full inventory, explicit connections, runtime contracts/OpenAPI and evidence schemas | Resolve 379 historical mappings; expand descriptor policy/variant metadata; complete the broader schema-validation contract. |
| B1–B3 | Coordinator, evidence journal, HTML ID/order oracle and negative tests | In-flight coalescing, persistent cross-run origin budgets, reviewed JS display contracts and more native paging mutations. |
| C1–C2 | Internal localhost REST/CLI, signatures, auth, run control and resumability | Broader optional API profiles, streamed large reports, public consumer scopes/quotas are later work. |
| D1–D4 | Native entry points for the four dominant families; real e-Granthalaya/IndCat observations | Representative multi-member/cluster pilot; e-Granthalaya/IndCat native continuation; LIBMAN display parity; more live Koha variants. |
| D5 | VuFind native entry point, legacy wrappers and explicit unsupported entries | Complete/review 86 legacy methods and 23 missing methods; recover permitted failures. |
| E1–E2 | Adaptive terms, 20-book evaluator, sufficient page proof, failures and resume | Tune relevance/local-language plans from the broad audit; ambiguous records remain review candidates. |
| E3/F1 | Every target queued; library/search/book/failure reports and metrics | Execute the full audit and maintain its recovery ledger. No full-run result exists yet. |
| F2–F3 | Disabled due-job planner, weekly/monthly intervals, locks, cancellation and runbook | Daily variant canaries, automatic bounded jittered retries, richer drift comparisons and publishing-failure automation. No timer installed. |
| G1–G3 | Real timing breakdown, offline replay and country-parameterized inventory/runner | Broader load/variant benchmarks, session reuse, second-country live validation and measured expansion budgets. |
| H1–H3 | Shared service ready for later adapters; production app behavior preserved | MyBookshelf migration, public API eligibility/hosting, client quotas and MCP remain later milestones. |

Next execution starts with the other representative families/variants and blocked endpoint investigation, then runs the whole frozen queue with the same evidence rules. Testing can proceed for every entry now; unsupported or unverified variants are reported as such until repaired. A full pass is not permission to call all libraries working.
