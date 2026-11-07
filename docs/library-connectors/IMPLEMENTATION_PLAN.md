# Implementation backlog

Status: ready for design review; all stories below are unstarted. This packet is a plan, not evidence that the service or schedules exist. Implement in the current repository, with isolated scoped branches/worktrees and small reviewable checkpoints. Preserve unrelated account/free-content work and current production source flags.

## Milestones

| Milestone | Concrete result | Depends on |
| --- | --- | --- |
| M1: foundation | Frozen library inventory, versioned contracts, native request recipes, evidence and transport harness | A, B |
| M2: usable pilot | Internal API/CLI and fresh HTTP qualification for representative catalog variants; measured baseline | C, D1–D4, E1–E2 |
| M3: complete audit system | Every India library queued/accounted for, recovery tooling, reports and remaining family adapters | D5, E3, F1 |
| M4: ongoing verification | Resumable schedules, health/freshness reporting, performance comparisons and operator runbook | F2–F3, G |
| M5: app and public API | Compatible MyBookshelf integration, public-eligible connectors, operating budgets and hosted API | H1–H2 |
| M6: MCP | Read-only tools using the same public API and budgets | H3 |

M3 means the system can execute/report the whole audit; it does not guarantee every inaccessible provider can be repaired. The report must retain all unresolved libraries and shortfalls. Milestones are acceptance outcomes rather than calendar promises. Estimate dates after M2 using measured requests per library and the shared-host bottleneck.

## A — Inventory and contracts

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| A1. Freeze and reconcile targets | Export actual app merge; preserve directory/member/alternate IDs; reconcile 365 + 14 omitted connection rows and duplicates; hash/version the manifest | 6,703 baseline rows accounted for with explicit additions/aliases/exclusions; no alternative counted as another library |
| A2. Define connector descriptors | Separate library, connection, catalog, origin budget and variant; record fields/sort/paging/locale/encoding; link official request/policy evidence | Shared catalogs and two countries can be represented without country logic in runner; unknown capabilities explicit |
| A3. Define result and evidence contracts | JSON Schemas for native search, record proof, job, event and status; define identity/fidelity/cache/partial states; add schema migration version | Malformed scope/count/freshness rejected; healthy empty distinct from failure; existing saved IDs preserved |

## B — Transport, source evidence and fidelity harness

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| B1. Injectable HTTP coordinator | Wrap existing transport; enforce origin budgets and cancellation; isolate anonymous sessions; coalesce compatible requests; centralize retries | Local integration server proves bounded concurrency, token rotation, deadlines, Retry-After, no nested-queue deadlock or cross-branch leak; A2–A3 |
| B2. Evidence journal and replay | Redact before persistence; content-address bodies; append request/response/parse events; atomic checkpoints, exclusive writer and restart recovery | Interrupted tail/missing body/push failure cannot produce a passing finding; repeated jobs don't double-count; A3, B1 |
| B3. Independent fidelity checks | Version form/JSON request recipes; extract reviewed native ID/order/count/scope expectations from raw evidence; preserve literal queries and actual website transformations | Golden and mutation cases catch reranking, clipping, ignored filters and first-ten loss; a parser's own output is not its expected output; A2–A3, B2 |

## C — Internal API and CLI

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| C1. OpenAPI and API implementation | Implement OpenAPI 3.1/JSON Schema from API_CONTRACT; directory/capabilities/search/resolve/health routes; native paging, signed scoped cursors and freshness fields | Request/response contract tests pass including 0/partial/error/expiry; no arbitrary URLs or false cache freshness; A3, B1–B3 |
| C2. Audit CLI and job control | Commands for inventory, qualify, health, resume, report; operator audit start/status/cancel endpoints; idempotency and budgets | CLI and HTTP call the same service; long runs survive request termination; cancellation saves completed evidence; B2, C1 |

## D — Family adapters, ordered by impact

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| D1. e-Granthalaya | Map actual public form/default fields; reuse safe viewstate sessions; expose native paging/counts; validate member versus cluster holdings; remove silent ten-record audit cap | At least two clusters and distinct members tested, including a shared-record wrong-member case; 20 books for working pilot members with raw HTTP proof; B3, C1 |
| D2. Koha | Use native keyword/title/author forms and branch filters; implement offset/page variants and one-result redirects; preserve edition/native IDs and branch holdings | Independent and union/legacy instances tested; no wrong-branch records counted or native ranking changed; B3, C1 |
| D3. IndCat | Map institution form/session fields; verify pagination and native totals; validate record/institution membership and exact query semantics | Multiple institutions plus healthy zero/expired state cases; scoped 20-book findings where available; B3, C1 |
| D4. LIBMAN | Inspect public website JSON mapping/display transformations; preserve tenant scope; expose actual native page semantics; avoid fixed ten-result/six-detail audit ceiling | Tenant isolation, native ID/order parity, paging and enough evidence without unconditional detail calls; B3, C1 |
| D5. Remaining variants | Implement VuFind, academic/community subvariants, other sites, LIBSYS, Chamo and Visakhapatnam; record unsupported client logic; follow alternate official routes explicitly | Every remaining baseline target has an executable HTTP recipe or precise unresolved reason; no browser fallback or unlabeled export substitution; B3, C1 |

D1–D4 cover 6,465 configured entries, not 6,465 live passes. Pilot approximately 30 libraries across all 11 families and known variants before broad execution; extend the pilot if new semantics appear. Keep slower/blocked origins aside while independent families progress.

## E — Qualification and full audit

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| E1. Adaptive query planner | Common seed terms; institution/language/subject-specific alternatives; reuse proven local queries; paginate and schedule retries fairly | Zero for one title leads to another meaningful term; exact attempted terms retained; stopping a budget leaves pending work rather than false completion; A1, C2 |
| E2. Twenty-book evaluator | Separate native page from accepted results; check relevance, format, member proof and identity; resolve only missing proof; retain failures/ambiguities | Every accepted book has valid evidence; copies/editions/other libraries cannot pad 20; no global book metadata used as holding proof; B3, E1 |
| E3. Full inventory/recovery run | Snapshot jobs; checkpoint small batches; isolate shared-host failures; fix parser variants offline and canary-retry; reconcile every final status | All targets accounted for; distinct attempts/books consistent across resume; complete assessed/pass/shortfall counts with next actions; D, E2 |

## F — Reports and recurring monitoring

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| F1. Operator reports | Library summary, query history, found books and failures; JSON/CSV/static HTML; filters, prior-run changes and evidence links | Counts reconcile to journal; stale/historical/partial separate; safe HTML/CSV; every failed term discoverable; B2, E2 |
| F2. Sentinel scheduler | Save known good queries/record probes; configurable rolling daily variant, weekly library and monthly full tiers; pause/resume, due times and singleton run keys | Fresh contacts required for fresh health; overdue count visible; no overlapping writer; legacy research schedules stay paused; C2, F1 |
| F3. Recovery and runbook | Circuit breakers and recovery triggers; API-key/secret redaction; local/save/push errors; restore/resume exercise; manual reporting commands | Exercise crash mid-page, expired cursor, stale lock and rejected push; no lost accepted findings or automatic restart of unrelated tasks; B2, F2 |

## G — Performance and expansion

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| G1. Instrument and baseline | Record queue/upstream/parse/storage timings, bytes, actual requests, cache/coalescing and throughput; benchmark cold/warm/fresh replay on pinned corpus | Reproducible measurements and provider bottlenecks; no real-provider load test; known resource limits and cost per qualified library; B, M2 |
| G2. Optimize with proof | Compare sufficient-list-evidence vs detail requests; session reuse, native page size, coalescing and permitted concurrency; rerun fidelity suite each time | Reduced requests/time at unchanged proof and native results; zero scope leaks/false freshness; agreed p95 overhead budgets; G1 |
| G3. Country onboarding contract | Template for local library identity, script/encoding, filters/timezone and source policy; add a small second-country validation set from existing directory | Runner unchanged for new country; Unicode and variant contracts verified; full new-country audit remains a separately selected target manifest; A2, G2 |

## H — Permanent API and MCP delivery

| Story | Tasks | Acceptance / dependencies |
| --- | --- | --- |
| H1. MyBookshelf compatibility integration | Wrap current catalog search/resolve; preserve book keys and old API shape; retain native ranking inside core and isolate app ranking; per-connector rollout/rollback | Existing HTTP/client tests pass; parity differences explicit; no unapproved source activation or release bundled into audit; M3 |
| H2. Public API release | Review each connector's automation/metadata redistribution eligibility; API keys/scopes and source/client budgets; choose measured durable hosting; docs/versioning/abuse limits; deployment/recovery checks | Only eligible connectors exposed, all traffic governed, public queries not logged as audit data, no silent paid infrastructure; M4, H1 |
| H3. MCP tools | Generate read-only tool schemas from API; map library/search/resolve/health; preserve errors/cursors/freshness/attribution and quotas | MCP/REST contract parity; prompt-injection text treated as data; no audit/admin launch tools or bypass routes; H2 |

## Definition of done per implementation story

- Evidence of the concrete behavior with scoped tests. Live observations have dates, safe request shapes and provenance; fixture tests are clearly labelled.
- Updated design/status/cursor where behavior changes. No generated report passes with missing/mismatched hashes or stale verification timestamps.
- Focused regression checks first; broader required repository CI before an app/API release. This HTTP testing system does not depend on browser automation.
- Scoped commits/pushes and reviewable PRs; no force push, unrelated data changes or production/scheduling changes hidden in research checkpoints.

## First executable batch

Implement A1–A3, B1–B3 and the minimal C1/C2 slice needed for D1–D4. Deliver one real native search/resolve path, sufficient membership proof, resumable evidence and a report before expanding configuration coverage. Then complete the representative pilot and establish throughput. Continue the remaining milestones from those checkpoints; no fixed daily source quota.

No public hosting or MCP implementation is needed to prove the connector core. Equally, do not postpone schema/versioning, provider budgets or privacy until public release: they are foundation contracts.
