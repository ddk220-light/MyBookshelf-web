# MyBookshelf web handoff

**e-Granthalaya audit complete, 10 November:** All 5,036 frozen libraries now have evidence-backed outcomes: 3,135 Working, 1,901 Needs work, zero Blocked/deferred and zero pending. Of these, 1,783 returned at least twenty distinct native bibliographic records; 1,352 Working libraries returned fewer. Needs work separates 1,890 fifty-title empty searches from 11 request/setup cases. Independent validation reconciles 1,008 batches, 253,984 response bodies, 7,056 indexed artifact hashes and all CSV counts. [Final report and full lists](research/india-library-audit/search-triage/egranthalaya-fifty-20261108/final-report.md). Native searches are complete; item URLs are saved but unverified, and no app source publication changed. The collector stopped cleanly. Disable only the current hourly completion watch after report delivery; older tasks remain paused. Audit/research Vercel deployment-disable rules and publisher guard must remain intact.

**Research build-cost containment, 10 November:** Audit Git pushes were automatically creating Vercel previews in both `mybookshelf` and `mybookshelf-accounts-staging` despite skip markers. The owner reported $100/day of build cost. Both active audit builds were canceled, the collector was cooperatively stopped with all evidence retained at3,710 assessed, and the hourly restart was temporarily paused. The committed Vercel Git policy now disables `feat/library-connector-audit` and `research/**` before deployment creation; the ignore command also exits before history checks on those branches. The checkpoint publisher refuses remote operations if the committed disable rule is absent or overridden.20 related regressions pass. Never run Vercel build/deploy/promote for this research. Resume collection only after verifying zero deployments for the protected checkpoint; preserve all existing interrupted jobs and other paused tasks. [Incident evidence](research/india-library-audit/search-triage/egranthalaya-fifty-20261108/vercel-build-incident-20261110.json).

**e-Granthalaya recovery repair, 9 November:** A transient GitHub HTTP503 stopped publication after 445 assessed libraries; all 89 batches and 22,664 response hash references validate. The hourly task is now authorized to diagnose, fix and resume stopped work and must report every stopped hourly check. The supervisor retries transient Git errors with backoff and durable interrupted-push recovery, preserving completed searches. Resume the same frozen queue after publishing this source/evidence checkpoint; verify actual worker state rather than this handoff. Five libraries × fifty searches, sixty-second minimum between starts and 180-second deadlines are unchanged. No app changes.

**e-Granthalaya main continuation authorized, 8 November:** The owner superseded the prior hold for e-Granthalaya only: all 5,036 frozen members, five independent sessions and fifty Title searches per member, up to 250 concurrent requests. Latest cadence is one minute minimum between batch starts, always after the prior batch settles; request timeout remains three minutes. New resumable [run and reports](research/india-library-audit/search-triage/egranthalaya-fifty-20261108/README.md) preserve every older journal and prioritize 2,910 previously unchecked members. The worker checkpoints every five libraries, with per-query results and compressed hash-verified HTML. Other catalog-system and older collectors stay paused. Read actual worker/lock state at `/workspace/library-audit-review/egranthalaya-fifty-supervisor/` before any writer; historical pause paragraphs below describe earlier owner instructions. No production/source activation changes.

**Five-library parallel spike complete, 8 November:** Five independent sessions each submitted fifty Title searches together (250 outstanding client requests). Of 250 attempts, 132 matched their paired reference and 118 hit the 45-second request deadline; no completed-result mismatches or explicit access/rate-limit refusals were observed. Setup took 10.919 seconds and the wave 45.513 seconds. This is not a successful 250-query completion; provider versus transport queuing is unresolved. All 250 outcomes, 138 current body hashes and 250 reference body references validate. [Report and failed-query list](research/india-library-audit/search-triage/experiments/five-library-parallel-20261108/REPORT.md). No retries, runtime changes or main-audit restart. The main audit and hourly watcher remain paused by owner.

**Main audit paused by owner; fifty-search benchmark complete, 8 November:** The search-triage supervisor and its hourly milestone watcher are paused pending redesign. Do not automatically resume them. One independent session per library handled all fifty simultaneous Title searches on each of five JNV2 libraries: 250 valid query responses, 82 nonempty and 168 empty, with zero source-request errors. Search batches totalled 126.7 seconds; active execution with setup 155.5 seconds; wall time 215.8 seconds includes a diagnostic pause for one punctuation-check correction. Cross-library session reuse was found unsafe on repeated searches despite a correct-looking library echo; those earlier positive probes are insufficient for production. No main audit/runtime/source publication changes were made. See [benchmark and full evidence](research/india-library-audit/search-triage/experiments/cluster-throughput-20261108/REPORT.md) and [implementation plan](research/india-library-audit/search-triage/experiments/cluster-throughput-20261108/IMPLEMENTATION_PLAN.md). All original failures/cancellations and source-dated reanalysis are retained; fifty is a tested bounded setting, not an unrestricted server capacity claim.

**Six-worker search-triage pilot passed, 8 November 2026:** All 24 selected IDs have saved outcomes: 11 Working, 11 Needs work and two Blocked/deferred; 18 record live source contact. These exclude the 796 offline baseline. The pilot repaired catalog-only Koha RSS configuration, exact-title author-credit comparison, and false rejection of native scoped records whose public URL is a catalog handoff. A handoff alone still cannot pass; direct URL checks remain separate. Original failures are preserved and only meaningful affected cases were retried. All 41 new audit/structured/checkpoint/segmentation tests pass. [Pilot review](research/india-library-audit/search-triage/planning/pilot-review.json) records HTTP failures, pacing and memory; minimum observed same-origin response/start gap was at least 2.999 seconds. The continuous supervisor is authorized for the remaining 5,883 pending IDs at concurrency six, publishing stopped-child batches of 100; inspect `/workspace/library-audit-review/search-triage-supervisor/progress.json` and actual PID/locks for live state. Its journal reader follows every hash-indexed segment. The hourly watcher reports each 1,000 new unique outcomes, excluding retries/offline baseline. Twenty-book enrichment is separately planned with the 80-title seed pack; this classifier proves searchability. No app changes or old worker restarts.

**Parallel search-triage launch authorized, 8 November 2026:** [Run plan](research/india-library-audit/search-triage/planning/PARALLEL_RUN_PLAN.md) and 80-title JSON/CSV search pack are saved. The owner requested maximum safe utilization and authorized a 24-ID pilot (six per executable method) at concurrency six, then continuous classification. A bounded supervisor in `tools/library-triage/supervisor.mjs` validates and publishes stopped-child checkpoints every 100 outcomes; it has its own reservation and pause path under `/workspace/library-audit-review/search-triage-supervisor`, never force-pushes and uses a triage-only segmented evidence store with 20 MiB sealed files and hash-validated readers. The existing single-origin pacing remains in force; e-Granthalaya clusters share one origin. The separate hourly report-only watcher is enabled for each 1,000 newly checked IDs, excluding retries and the 796 offline baseline. Old audit/free-knowledge tasks stay paused. Twenty-book sampling is separately planned; the current runner proves one relevant native item and does not yet consume the 80-title pack. No production changes. See live execution/progress for launch results; this planning checkpoint itself establishes no new passes.

**Three-category shared-method audit built, 8 November 2026:** The new process is in `tools/library-triage/` ([runbook](../tools/library-triage/README.md)); it has a separate prepared queue under [search-triage/india-20261108](research/india-library-audit/search-triage/india-20261108/report.md). All 6,703 frozen IDs and 6,744 routes are preserved. Methods are Koha RSS/XML, VuFind Search API, e-Granthalaya shared HTML and Libman shared JSON. IndCat SRU remains an explicit Needs work gap until institution holdings and identity mapping are established; seven IndCat entries have another eligible frozen route. No silent fallback from a failed structured API to HTML search. A Working pass requires a relevant query result plus a fresh matching native item and library membership; the twenty-book target is separate. Reports preserve exact queries, all results, native IDs/titles, item URLs, failure causes, source hashes and direct-link limitations. Bounded queries, family interleaving, origin pacing, exclusive locks, interruption recovery and explicit retries are implemented. The initial offline state is 0 newly Working, 6,393 Needs work (5,907 pending live checks), 310 deferred from saved blockers, 796 assessed by offline triage, and zero live checks. No provider collector was started; older schedules and audit gates remain paused. Tests: 25 new checks including replay of five archived Koha RSS responses, and all 130 existing audit regressions. The initial sandbox test-server binding failures passed outside the sandbox. Use `npm run library:triage -- preflight`, then an explicitly authorized `run --limit 10` or `run --all`. No app/source activation, removal, deployment or production behavior changed.

**Offline library-access classification, 8 November 2026:** The owner replaced further broad audit work with an inexpensive system-based classification. All 6,703 frozen IDs and 6,744 frozen routes are now mapped in [access-classification/REPORT.md](research/india-library-audit/access-classification/REPORT.md), with per-library JSONL/CSV, system provenance, blockers and next actions. Current counts: 632 structured-access candidates, 5,733 shared website connector candidates, 28 individual/unestablished-method cases and 310 deferred libraries. These are access candidates, not newly working or release-ready libraries. e-Granthalaya has 5,036 primary entries across 62 clusters using a common HTML method; anonymous public search API access is still unestablished. Three of the top five systems have structured interface candidates (Koha, IndCat and VuFind); provider enablement and institution scope remain separate checks. Fifteen offline tests cover alternatives, corrected failures, frozen counts, deterministic output and missing/corrupt evidence. No provider requests, collector restarts, schedule changes or app changes occurred. Earlier automatic-resume instructions below are historical; keep the audit paused under the owner's later stop instruction. Both structured and shared website routes can qualify for an eventual release after real verification. Reproduce with `python tools/library-classification/classify.py build` then `validate` and the local unittest suite.

**Two newly eligible public catalog methods, 8 November 2026:** vmedulife now has an internal native adapter for APCE and Scott Christian using the actual pinned public client, institute-bound Title requests, thirty-row first pages and per-resource metadata lookups. Public API canaries include correct bootstrap IDs, relevant results and a negative foreign-institution resource lookup. Per-item material types and distinct titles still govern qualification; General is not book proof. Frozen unsupported capability flags no longer prevent a repaired native method on the same connection/origins, and the inventory hash is unchanged.130 audit tests and594 server tests pass (15 skipped). The two new methods are prioritized for fresh native revalidation; they do not gain twenty-book passes from fixture tests. Link progress is15,611 processed/218 pending,976 confirmed identities with generic/POST-only handoffs separate. Full collection remains gated; no app activation or production changes.

**Scoped PMB item-link repair, 8 November 2026:** The heading-only link matcher missed PMB labelled titles. Canonical item ID, branch view and local holdings now establish identity; unrelated headings cannot override PMB/IndCat/IUST native fields. Saved-response reanalysis rechecked82 native responses, recovered45 PMB identities and invalidated zero earlier confirmations, preserving original dates and all negative history. Two useful live item canaries pass.120 audit tests and28 related provider tests pass; the prior full594-pass/15-skip server run remains valid for unchanged server/shared files. Link queue:6,643 processed,261 confirmed identities,6,377 generic handoffs,2 policy-unavailable routes,1 non-HTML cancellation,2 unresolved field/native-identity cases and9,186 unchecked. This does not change517 native reviews/37 open cases or open the full gate. Resume the same continuous link supervisor after this scoped checkpoint; no app publication changes.

**Five native Surat searches repaired, 8 November 2026:** All five branches return live scoped Title results through the reviewed DataTables1.10.4 client; actual first pages have10/10/7/6/10 copy rows. One exact copy lookup and the shared app provider lookup also passed. Native paging/order/branch controls and public script hashes are preserved. Copies and missing material types earn no book credit: all five remain open pending useful type evidence, without repeatedly downloading the same copy lookup. The overall native benchmark stays517 reviewed/37 open,189 twenty-book passes,7 partial,310 observed blocked routes and11 empty tested searches.117 audit tests and594 server tests pass (15 skipped); full collection remains gated. The continuous link supervisor has published2,103 processed outcomes,179 confirmed identities and1,921 generic handoffs;13,726 links remain unchecked. Its cooperative editor pause must be released only after this source/evidence checkpoint is pushed. No app publication changes.

**Continuous item-link checkpointing, 8 November 2026:** Native review remains517/554 with37 open:189 twenty-book passes,7 partial,310 observed blocked routes and11 empty tested searches. The completed link batch has1,103 processed outcomes:144 confirmed identities,956 generic handoffs,2 policy-unavailable requests before an item response and1 non-HTML body cancelled;14,726/15,829 jobs remain unchecked. Failed policy refreshes now back off, origin pacing/access guards persist across restarts, and interruption preserves pending jobs/retry intent. A new exclusive batch supervisor continues the saved queue and publishes scoped checkpoints, with a cooperative pause before code edits.111 audit tests and594 server tests pass (15 skipped). Git publication works. Full collection remains gated by native engineering, actual app-path/link proof and reconciliation. No app library/source publication changes.

**Latest native outcomes and reporting checks, 8 November 2026:** The automatic repair checkpoint reached517 reviewed/37 open:189 twenty-book passes (90 replay,99 live),7 partial,310 observed blocked routes and11 empty tested searches. Abhayapuri and Amity Rajasthan each pass20; Barkhetri has15 proven books. Simple native Title searches avoided the observed Solr400 from a complete punctuation-bearing title. A separately saved native page2 browse returned zero rows and adds no book/search credit; the source is not claimed exhausted. Native outcomes are distinct from all-item-link and app-path completion. The permanent final-report metric now separates nonempty queries from returned candidate rows;100 audit regressions pass. Provider/app sources are unchanged from the594-pass/15-skip run, with prior evidence retained explicitly. Both frozen inventories/evidence sets validate. Remaining report/CSV contract gaps are saved for completion before a final report. The next independent worker may continue the governed1,000-link batch with concurrency6; full collection stays gated. No app publication changes.

**Current safe audit continuation, 8 November 2026:** The complete516-review data checkpoint `1216ebf` is on PR #188; ordinary Git publishing is restored. A governed link scheduler now lets independent origins progress concurrently while keeping jobs within each origin serial and sharing all existing pacing/policy controls. Current worktree100 audit tests and594 server tests pass (15 skipped), and both frozen inventories/evidence hashes validate. The isolated preparation and application record are archived. Barkhetri's next explicit Title plan uses simple meaningful terms after a complete punctuation-bearing title changed native scope; all prior failures remain saved. This plan still needs live revalidation. There are38 open repair entries plus6,149 outside the cohort; native benchmark totals remain189 twenty-book passes,6 partial,310 blocked routes and11 empty tested searches. Full collection stays gated, with app-path, item-link and audited reconciliation work still open. No source/library publication changes.

**Git publishing restored and two IndCat passes, 8 November 2026:** Ordinary fetch and push now work. The full saved checkpoint `5e79342` is published on `research/audit-publish-checkpoint-20261108-indcat`; current batch data will also be published on PR #188 at this safe boundary. Abhayapuri College and Amity University Rajasthan each have twenty distinct live verified books through native Title searches. Current repaired cohort:516 reviewed/38 open,189 twenty-book passes,6 partial,310 observed blocked routes,11 empty searches. Barkhetri has six proven books and remains open after a punctuation-bearing native free-search term changed the returned scope; preserve that failure and use documented simple Title terms instead of accepting unscoped results. The full run remains gated by other native methods, app/link proof and reconciliation. No app publication changes.

**Documented IndCat Title alternative, 8 November 2026:** A same-query native form canary disproved the blank-paging hypothesis: All-fields Chemistry still reports ten results with no actual rows. The advertised Title field returns eight native Barkhetri records with their actual item URLs. The audit now exposes this as an explicit Title mode, preserves keyword/All-fields behavior and failures, verifies field/query/member echoes and supports per-library field plans in the repair supervisor. Three deferred IndCat entries are eligible for meaningful native Title revalidation; none gains a pass from the diagnostic or offline tests. The first governed link batch added 100 distinct outcomes: twenty confirmed item identities and eighty generic handoffs; including earlier canaries,23 identities are confirmed and15,645 of15,748 jobs remain unchecked. Native/library totals remain514 reviewed /40 repair cases open. Full collection remains gated. Current checks:97 audit passes and594 server passes/15 skips; inventories/evidence hashes validate. Source checkpoint `b80f9d9` is published and normally merged with all preserved local journals. Full provider data remains unpublished pending workspace Git access. No app publication changes.

**IUST live benchmark and continuation, 8 November 2026:** The latest repair collector stopped cleanly at its semantic boundary on 7 November 19:33Z. IUST has twenty distinct live titles/native IDs, each with its own matching item-detail identity and MARC monograph proof. The cohort is 514 reviewed / 40 open: 187 twenty-book passes (90 replay, 97 live), six partial, 310 observed blocked routes and eleven empty searches. Another 6,149 libraries remain outside the repair cohort. Current checks are 92 audit passes and 594 server passes / 15 skips. Full collection is still gated by unfinished native methods, app/link proof and reconciliation. IUST source/test checkpoint `ead1187` is published and normally merged with the preserved local branch. New provider evidence remains local pending publishing; large upload attempts have no confirmed success. Hourly completion checks remain enabled; next unique-library milestone is 600. No app publication changes.

**Current native repair checkpoint, 7 November 2026:** SP Jain now has twenty distinct live verified books, bringing the repaired cohort to 513 reviewed / 41 open (186 twenty-book passes, six partial, 310 observed blocked routes, eleven empty tested searches). IUST now has a primary-client-backed native Title profile with default source-order paging and per-record identity/MARC monograph proof; six regressions plus existing checks pass (92 audit checks, 594 server passes, 15 skips). Its successful single-record metadata-fragment canary is not a twenty-book pass. Live IUST qualification is next. The source-only remote checkpoint is `ff6fb10`, while newer provider evidence is preserved locally pending Git credential restoration; the full local branch is reconciled with that remote source commit. The full 6,703-library queue remains gated by semantic repair, app/link evidence and reconciliation. No library/source publication changes.

**Split source/evidence publication, 7 November 2026:** The query-plan and per-item link fixes have 86 passing audit checks and 594 server passes (15 skips). Source-only checkpoint `ff6fb10` is published through the connected GitHub app; newer provider observations and the 512-reviewed / 42-open repair cursor remain in the original workspace pending full Git publication. The last complete remote evidence checkpoint is `fc20376`. Read `publication-blocker.json`; an older remote heartbeat must never justify a duplicate collector. Full collection remains gated and app publication is unchanged.

**Plan-sensitive repair continuation, 7 November 2026:** The previous supervisor finished cleanly at 512 reviewed / 42 open: 185 twenty-book passes (90 replay, 95 live), six partial findings, 310 observed blocked routes and eleven empty tested searches. Query-plan keys now distinguish actual changed search terms from report-date edits, allowing useful same-implementation retries without deleting old attempts. The prepared native-title review is archived; SP Jain receives 25 short, distinct titles from explicitly labelled Text Book rows in its saved public metadata. These are query leads, not new live passes. IndCat missing-row/count behavior and Lucknow local-holdings evidence stay open and are deferred until a useful native-method review. Current checks and evidence hashes are recorded in the repair run; full collection stays gated.

**Publishing access changed, 7 November 2026:** The latest repair/link implementation is saved locally at `2d94a7b`; GitHub branch #188 remains at `fc20376`. Workspace Git authentication is unavailable. The configured GitHub MCP service authenticates, but its 31 MB evidence upload reset; the temporary publisher branch did not advance. See the repair run’s `publication-blocker.json`. Continue the existing repair queue locally without `--publish` until Git access is restored, then validate and publish the saved scoped changes. Do not mistake the older remote heartbeat for current local process health or start a duplicate collector. The hourly task stays enabled; no app or production changes.

**Per-item checks and useful revalidation, 7 November 2026:** The repair collector was gracefully checkpointed at 509 reviewed / 45 open to avoid redundant Autolib export downloads when native material labels are missing. Those rows stay unresolved without book credit; unrelated missing barcodes no longer invalidate another valid title query. Saved native titles now supply explicit query plans for Barkhetri and the Gurgaon/Lucknow PMB branches, with original source-event provenance. A separate governed item-link queue covers all returned items and accepted books, avoids non-HTML downloads and records HTTP success separately from confirmed native URL/title identity. It retains refusals and unknown identities; link checks never inflate reviewed-library counts. Three live CMD Kerala canaries each confirmed their own native item URL/title; the initial link queue has 14,924 jobs, of which 14,921 remain unchecked, including generic handoffs that will be classified without item requests. Current regressions: 84 audit tests and 594 server passes / 15 skips. Full collection remains gated pending semantic repairs, app/link proof and reconciliation.

**500-review milestone and native filters, 7 November 2026:** The first safe snapshot after 500 contains 506 unique reviewed repair entries: 180 twenty-book passes (90 historical replays and 90 live), five partial findings, 310 observed blocked routes and eleven empty tested searches; 48 repair IDs remain open, plus 6,149 outside the repair cohort. The report was delivered in the conversation with named blocker and query/result/link exports. Six Easylib catalogs gained fresh twenty-book evidence. Two additional public client variants were reviewed; their search requests and native identity/order contract are unchanged. Autolib now follows the canonical landing, its actual DataTables 1.13.5 smart Title filter and 25-row source-order pages, retaining barcode/copy identity and explicit material types. Offline equivalence uses the actual captured JavaScript without provider calls or browser control. Current checks: 78 audit tests; 594 server passes and 15 skips. The newly implemented routes still need live verification; item-link/app-path proof, other semantic repairs and reconciliation remain open. Full collection stays gated; no publication/removal changes.

**Easylib and repair classification, 7 November 2026:** The stopped repair supervisor published 496 reviewed entries. A classification fix separates the latest completed native attempt from older unverified attempts, preserving source dates and honest empty/partial outcomes. The new Easylib native profile follows the actual keyword control, reads each website's offered page-size default, checks the advertised client hash, retains source order/native IDs and mixed material types, and derives the documented item URLs without declaring them healthy. The public legacy adapter's historical row limit is 20 (not the previously written 40); the reviewed website defaults to five. Regressions and live per-host verification are recorded in the repair run. Changed clients and unsupported methods remain open, and the full run stays paused until repairs/reconciliation are complete.

**India audit repair checkpoint, 7 November 2026:** The previous worker stopped cleanly at its semantic-repair boundary. The known BN College challenge label is now explicitly invalidated, with the original normal HTTP 200 form, date and hash retained. Prepared MARC-link, untitled-row and challenge-detector fixes are applied. Live canaries then exposed native metadata resolution incorrectly depending on app borrowing flags, and Librarika's 20-second crawl delay exceeding the ordinary 30-second multi-request deadline; both are repaired without changing app publication or provider pacing. A source-backed SRMS Title-control recipe now preserves the mapped college, native array order and ten-row client pages; its record fingerprint is explicitly not an assigned API ID. Current tests: 64 audit checks and 594 server passes (15 skipped). Newly repaired routes still need live revalidation; source success is never inferred from these tests. Easylib/Autolib request/display gaps are documented in [native client review](research/india-library-audit/revalidation/20261107/native-client-review.json). The full 6,703-entry run stays gated until all 554 repair entries have honest outcomes and reconciliation passes. Hourly completion checks and cumulative reports after each 100 unique reviewed libraries remain enabled; no app libraries may be removed or activated during the audit.

**India audit repair hold, 7 November 2026:** The owner paused the full audit to repair false failures and revalidate the already-attempted cohort. The full worker stopped cleanly at 553 assessed / 554 attempted libraries; its original findings remain historical evidence. An enforced `audit-control.json` gate blocks full collection. The frozen [554-library repair cohort](research/india-library-audit/revalidation/20261107/manifest.json) has an independent replay review, append-only live revalidation journal and [repair report](research/india-library-audit/revalidation/20261107/repair-report.md). Fixes preserve robots/access errors, separate bibliographic material from local categories, establish IndCat book-record provenance, normalize recorded Koha origins, and complete native request/display paths for reviewed variants. Replayed evidence is dated as replay, never fresh verification. `tools/library-audit/revalidate-run.mjs --publish` continues bounded batches under both locks; `gate-report.json` remains false while semantic gaps or reconciliation are open. Update the existing repair completion watch; leave earlier free-knowledge schedules disabled. The full 6,703-library run must resume only after all 554 entries have evidence-backed, correctly classified outcomes and corrected findings are reconciled without deleting the original evidence.

**Library connector audit implementation, 7 November 2026:** The owner approved implementing the HTTP-only design. [Draft PR #188](https://github.com/ddk220-light/MyBookshelf-web/pull/188), branch `feat/library-connector-audit` in `/workspace/MyBookshelf-web-india-library-audit` now contains the internal REST/CLI connector core, governed transport, evidence journal, native-page adapters, resumable 20-book evaluator, reports and disabled scheduler. All 6,703 India targets are frozen in a full-run manifest; a separate bounded 11-library live pilot records successes, failures and an interrupted/resumed qualification. [Implementation status and limitations](library-connectors/IMPLEMENTATION_STATUS.md), [runbook](library-connectors/RUNBOOK.md), [approved design](library-connectors/README.md). The owner has now authorized the full-country run; `tools/library-audit/full-run.mjs` publishes resumable ten-library checkpoints and emits the final report when every target has an outcome. Check the full run’s `execution.json`, heartbeat, locks and actual PID before any restart. Browser control, public hosting, source activation and production deployment remain outside this audit. Existing research schedules remain paused; the new schedule is disabled.

**Source removal, 7 November 2026:** The owner requested removing the five sources that failed the 20-result target even with checkbox diagnostics. The scoped release removes them from discovery, denies retired search routes and preserves saved-book resolution. 34 enabled sources remain; legacy children’s pilot links redirect to All knowledge, and the other three local catalogs remain available. [Scope and verification](research/free-content/SOURCE_REMOVAL_RELEASE.md). PR #185 is merged at `c801088` and deployed as `dpl_4VSELLwipf6YMPAZRJNGikJ1UHrw`. All five retirement guards and the 34-source directory passed hosted checks; retained NASA pagination and saved OpenStax resolution also pass. Research scheduling remains paused.

**Full-collection release, 6 November 2026:** PR #182 is merged at `3cc37e6` and deployed to mybookshelf.cloud as `dpl_Fcr6nFnKSB63LFjwHDNAjA3YouV2`. All 18 added connectors passed anonymous production searches; 39 sources are enabled in total. Full CI and mobile WebKit source-link checks pass. The owner’s full-collection restriction excludes limited research subsets. [Release scope, production evidence and exclusions](research/free-content/FULL_COLLECTION_RELEASE.md). The two public-ID secret-scanning false positives were resolved with explicit owner approval. Research scheduling remains paused.

**Metadata search release, 6 November 2026:** Five completed connectors are integrated for production release: Open Book Publishers, Helsinki University Press, Project Madurai, OpenStax and Sugamya Pustakalaya. Live queries, detail/source links, client/server tests, type checking, build, SEO and desktop/mobile browser journeys pass. [Release scope and evidence](research/free-content/METADATA_CONNECTOR_RELEASE.md). Released as PR #180/main d406469 to mybookshelf.cloud, Vercel deployment dpl_9ACDFzr9QNmqq9yNg4hzzKCcq9EZ. All five anonymous production queries and four detail lookups pass; iPhone/WebKit source-link journeys pass. There are 21 enabled app sources. The separate research branch owns the 44-item recovery goal. Earlier entries are historical.

**Cross-source knowledge search, 2026-11-05:** the owner authorized implementation and production release in the separate `feat/free-knowledge-search` worktree. [Release design and verification](research/free-content/KNOWLEDGE_RELEASE.md) records the new All knowledge view, ten additional supported integrations, independent source paging/errors, policy exclusions and hosted release state. The research registry completion goal continues separately; no candidate count is treated as proof of production readiness.

**Current free-content direction, 2026-11-03:** the owner requested a simpler
free live implementation with no datastore until a specific need is proven.
Use [the active plan](research/free-content/SIMPLE_LIVE_PLAN.md) / #156 on
`research/free-content-discovery-live` in the existing free-content worktree.
Replace Redis/federated sessions with one live source and signed provider paging;
retain provider cost/access rules. Older Redis release gates below are superseded.
Do not provision storage or change existing account resources/security.

Updated 2026-11-05. Active repository:
**https://github.com/ddk220-light/MyBookshelf-web**, default branch `main`.
The owner has chosen to do all future web work in this repository. Build, test,
plan and implement here directly. Do not depend on the previous private checkout
or copy its Git history/native applications into this repository.

**Current account rollout, 2026-11-05:** email accounts are enabled at
`https://mybookshelf.cloud`. Real received-mail signup/verification/recovery,
cross-device shelf/library sync, history consent, profile/email/password changes,
export, session revocation and native-worker deletion cleanup have been exercised.
Release acceptance found and repaired startup-verification, aged-session settings
and deletion-confirmation defects (#163/#172/#175/#176). The existing Vercel project
now connects to `MyBookshelf-web/main`. Google/Apple remain disabled by owner choice.
Read the [release acceptance](accounts/RELEASE_ACCEPTANCE.md) and
[current production record](accounts/PRODUCTION_ROLLOUT.md). Actual Neon history/
snapshot settings and a second operator's restore exercise remain open; the full
project is not declared complete. Preserve unrelated free-content work.

## What is implemented

The anonymous React/Vite app and Express catalog API, work/edition discovery,
browser-saved shelves, library selection, desktop/mobile reading layouts,
three reading lights, static public pages and SEO metadata are present.
App routes live under `/app/` and are noindex. Failed catalog requests mean
unknown; cached availability has last-result context and refreshes on book open.

The initial public guides are Anna Centenary, Visakhapatnam, Aliah University,
IIT Bhubaneswar, Alameda County, San Mateo County, San Francisco, Santa Clara
County and Setagaya City. This is **SEO publication only**: other libraries stay
searchable/selectable inside the app. `shared/seo-libraries.json` is the gate.
There are sixteen indexable public URLs. Unpublished guide paths return 404.

Code licence is AGPL-3.0-only. Original directory contributions use CC BY 4.0;
third-party material keeps its own terms. About identifies Deepak Ravikumar,
Product Manager, using the public contact details already supplied by the owner.

The UI follows Claude's reference layouts, with product decisions reconciled in
[seo/IMPLEMENTATION_PLAN.md](seo/IMPLEMENTATION_PLAN.md). No numerical 99% pixel
match has been demonstrated. [The screen review](seo/SCREEN_REVIEW.md) explains
the intentional differences and [the reference boards](design/2026-10-mobile/index.html)
are available here without the private branch.

## Release state: recheck before changing production

The owner authorized the free-content merge/deployment on 2026-11-01. Its
[release record](research/free-content/RELEASE.md) identifies the existing
production project/domain and rollback deployment. PR #110 now targets `main`
and integrates the account production baseline at `7ab9d89`. Actual deployment
and hosted checks are recorded in [#127](https://github.com/ddk220-light/MyBookshelf-web/issues/127).
The release is now merged at `1c16815` and deployed on `mybookshelf.cloud` with
four book sources enabled; live papers remain disabled pending Redis. The owner
then reported irrelevant free-book results and the misleading paper-outage UI.
The fix is on `research/free-content-discovery-relevance` in the same worktree,
tracked by [#154](https://github.com/ddk220-light/MyBookshelf-web/issues/154).
Read [search relevance and verification](research/free-content/SEARCH_RELEVANCE.md).
The following older release observations are historical checkpoints.

- Reviewed preview: https://mybookshelf-jh0o69edr-ddk220.vercel.app/,
  deployment `dpl_4WuSysFWU4wQhHqNhEGksvU7W9FA`, application commit
  `02aa0d6d7673c449d1b138b38c64053b0d7bc29c`.
- Public baseline `83b481d22a72525048051702ac562695299435d8` adds a test-fixture
  ordering fix. Its CI run succeeded:
  https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41180235295.
- Last release verification recorded a passing client suite, 484 server tests,
  318 browser scenarios and 168 layout captures. See
  [seo/VALIDATION.md](seo/VALIDATION.md) and its evidence; these are dated results,
  not a claim that a future commit has been tested.
- Vercel project `mybookshelf` was checked again during this handoff. It still
  connects to the original `MyBookshelf` repository, production branch `main`.
  Production is `dpl_G6GaQUUqD7q6w7s8BcmX5n3EyHBd` at the time of checking.
  Moving development here does not switch that deployment connection.
- Remaining launch actions: verify a fresh public-repo preview, reconnect the
  existing Vercel project to this repo when releasing, retain domains and server
  credentials, verify production URLs/headers/source commit, recheck catalog
  connections, and complete Search Console/Bing ownership and sitemap submission.
  Repository protection and vulnerability-reporting settings also need owner
  administration. Keep the previous production deployment as the rollback target.

## Free-content discovery: implementation in progress

The [source research](research/free-content/README.md) covers free ebooks,
scientific papers, textbooks, children's books and related collections. It
defines metadata imports plus bounded live API search, with reading links to
original hosts. This chat is exclusively for the free-content feature; account
work belongs to its separate branch and project.

Branch `research/free-content-discovery` was recreated on this repository after
the previous environment's unpushed commit `ee7d88e` could not be recovered.
The documents and historical probe outcomes were reconstructed from the retained
conversation; the original raw responses and complete fetch ledger are unavailable.
The research overview records these limits. Future work continues here directly.

UI artifacts and implementation are approved (2026-11-01):
[boards and implementation handoff](design/2026-11-free-content/README.md), with
the owner's nine decisions. Worktree: `/workspace/MyBookshelf-web-free-sources-implementation`;
branch: `research/free-content-discovery-implementation`, based on approved
artifact commit `760863a`. Track [project 4](https://github.com/users/ddk220-light/projects/4)
and [index #73](https://github.com/ddk220-light/MyBookshelf-web/issues/73).

Implemented: source-native identity/access contracts, bounded official Gutenberg
metadata import and local search/resolve, Europe PMC adapter and atomic shared
Redis coordination, search scopes, content reader pages and browser shelf v2
migration. The optional library bridge requires exact ISBN/work evidence.
See [implementation decisions and story state](research/free-content/IMPLEMENTATION.md)
and [validation](research/free-content/VALIDATION.md). Open Textbook Library is
implemented with 1,909 real metadata records, combined catalog search and ISBN
links. DOAJ, arXiv and OpenAlex adapters, bounded multi-source paging, shared
record caching, source progress and source-only retry are implemented and tested.
The reviewed children’s pilot now has source records; intended hosted enablement is pending.

The pilot now contains three reviewed real English/Hindi/Tamil source records,
with exact current credits, levels and original-story relations. The owner has
accepted free source login; cards and reader actions disclose that requirement.
Post-login reading has not been tested. Source research and curation belong to
Codex; no owner-supplied feed or metadata is pending. See [the source review gate](research/free-content/CHILDREN_REVIEW.md).
Latest UI review: 537 server tests, 141 client tests, 262 broad desktop/mobile
browser journeys, 50 final feature browser checks and 84 board/theme/device
captures pass, with typecheck/build/SEO/deployment. See the [screen comparison](research/free-content/UI_REVIEW.md).
The unchanged importers previously passed 12 Python checks; workflow lint passed.
All-source exact lookups and a 40-result real-paper flow
also passed locally with actual Redis; this is separate from hosted enablement.

Book Dash now adds 30 real English-language editions with original creator roles
and anonymous reading links; see [additional sources](research/free-content/ADDITIONAL_SOURCES.md).
The four local book sources contain 2,942 metadata records in disclosed subsets.

Both client and backend flags default off. Live paper search additionally needs
shared Redis REST credentials and explicit budget configuration; no hosted store
has been provisioned. The local Gutenberg snapshot needs daily refresh because
positive access evidence expires after 24 hours. A reviewed daily refresh workflow
is implemented; it becomes schedulable only when merged onto the default branch.
It proposes a draft metadata PR and runs CI. Production enablement and verification
for the owner's authorized release are tracked in the [release record](research/free-content/RELEASE.md).

## Account work: implemented; staging release exits pending

Deepak approved the document packet and Claude canvas v4 at R02 (`36a1436`),
then authorized progressive story/task implementation. Feature code in
[PR #57](https://github.com/ddk220-light/MyBookshelf-web/pull/57) now includes
email/password, Google/Apple protocol and method management, verified email
change, private library/shelf/history, explicit guest import, identity-isolated
UI, streaming export, durable deletion, independent restore suppression and
bounded maintenance tooling. See [implementation](accounts/IMPLEMENTATION.md),
[validation](accounts/VALIDATION.md) and [operations](accounts/OPERATIONS.md).

Node 22 checks include 514 server tests with actual local Postgres roles and
143 client tests, type checking, production build and zero audit findings.
Browser and hosted evidence are dated in VALIDATION.md; controlled provider/mail
transports do not prove live delivery. Guest/public behavior and exact catalog
identities remain required contracts.

The subsequent [account screen review](accounts/SCREEN_REVIEW.md) fixes form/card
layout, field/focus errors and failed clear/import retries, adds paired artifact
captures, and checks narrow/zoomed layouts in three lights. The owner's phone-type
review sets account headings to 28px with 16px body/input text. Default-size images
and enlarged-text stress images are labelled separately in the gallery.

Isolated staging uses `mybookshelf-accounts-staging` in iad1, Neon and a separate
private deletion ledger. Real staging migration checksums 001–011 match the repo;
private ledger writes/reads/encrypted cleanup and anonymous-read denial pass.
Runtime credentials are Preview/account-settings only, administrator Development
only. Existing production resources/Git connection remain unchanged.

## Resume this free-content branch

1. Use `/workspace/MyBookshelf-web-free-sources-implementation` on
   `research/free-content-discovery-relevance`, based on released main `1c16815`.
   [PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110) is merged.
   Preserve other worktrees and use #154 for the relevance/disabled-state repair.
2. Read [implementation/story state](research/free-content/IMPLEMENTATION.md),
   [operations](research/free-content/OPERATIONS.md) and
   [validation](research/free-content/VALIDATION.md). Existing native tasks belong
   to [project 4](https://github.com/users/ddk220-light/projects/4) / index #73.
3. The owner postponed hosted Redis configuration. The existing OpenAlex key is
   present and accepted. Free source login is explicitly allowed; do not ask the
   owner to curate the children’s records. See #139 and the current source evidence.
4. Complete the remaining FCD07 hosted checks when Redis is configured; local
   book catalogs and the reviewed children’s set remain independent of Redis.
   Keep the bounded Gutenberg subset/OTL export coverage explicit. Account work
   has its own branch/project; its historical planning section above is context.

## Account release context

The owner subsequently instructed: Resend only for production; keep Google/Apple
disabled and add their credentials later. These are deliberate activation deferrals,
not current staging setup requests. Live staging capabilities confirm all three
methods remain disabled. The GitHub workflow is an optional staging scheduler;
its Actions-secret HTTP 403 does not require a permission change to finish coding.
See [current rollout choices](accounts/OPERATIONS.md#owners-current-rollout-choices).
Production still needs real mail, active cleanup/alerts, hosted backup/restore,
retention proof and final accessibility/operator/R03 review before account enablement.
Provider-specific live checks apply before those methods are enabled later.

Worktree: `/workspace/worktrees/MyBookshelf-web-account-settings`, branch
`account-settings`. The existing
[project](https://github.com/users/ddk220-light/projects/3) tracks epics, stories,
progressively linked tasks and remaining validation.

## This handoff's verification

The public repo matched the latest reviewed web export. An additional startup
audit found and fixed its missing local environment loader; a real-server smoke
test now runs with the standard suite. Fresh Node 22 install, client type check,
120 client tests, 485 server tests, production build, SEO/deployment checks,
documentation/reference link checks and secret scan passed. No browser UI code
changed in this handoff. See [the audit](development/2026-10-31-repository-handoff.md).
