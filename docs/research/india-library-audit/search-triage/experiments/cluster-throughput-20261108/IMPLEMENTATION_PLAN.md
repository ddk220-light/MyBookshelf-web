# Proposed audit redesign: one session per library, fifty searches together

## Decision and current state

The main `india-20261108` audit and `Report library test milestones` hourly watcher were paused at the owner's request on 8 November. The pause file explicitly forbids automatic resume. Old audit/free-knowledge schedules stay paused. No app library/source or production deployment changed. This document proposes the implementation; it does not authorize a main-run restart.

The final benchmark used one Node process/event loop, one fresh session per library, and fifty genuinely simultaneous search requests. All 250 pairs had valid source results (one punctuation-check flag was corrected against exact saved native identity). Five libraries in one JNV2 cluster passed, with combined search-batch time 126.7 seconds and active execution including setup 155.5 seconds. Wall time 215.8 seconds included a diagnostic pause. Do not extrapolate these results into guaranteed performance for every cluster or treat fifty as the provider's absolute maximum.

Do not reuse a session across libraries. The earlier five-library probe was insufficient: later repeated cross-library searches returned the wrong native record set despite an apparently correct selected-library echo. Retain those findings as superseded diagnostics, not fresh qualification. Per-library context is the proven test boundary.

## 1. Replace repeated setup with a library-owned session

Add an audit-only e-Granthalaya session object keyed by exact origin, cluster and library code. Fetch the member's native form once. Retain the public session cookie and form fields only in process memory; never write reusable session state to Git, logs or reports. Freeze the library binding. A session must not serve another member or silently default to All Libraries.

Build a new form body per query so concurrent requests cannot mutate each other's fields. Use the tested Title/LIKE/Books controls and retain exact query and source-selected member. Search responses contain the results; parsing is local and adds no HTTP request. Do not perform item detail lookups for searchability classification. Item links/holdings details, if requested later, are a separately measured operation.

Use a fresh session after process restart. Handle a demonstrated expired/rotated/unrecognized session as a session/configuration issue; preserve the failed response, drain the batch, refresh once and retry only affected unfinished queries. Do not call an audit-tool failure a failed library.

## 2. Schedule fifty queries within one library

Run the fifty-title pack as one asynchronous batch in one Node process. No browser and no AI in the query loop. Start up to fifty requests without an artificial per-second delay. Continue to honor actual provider policies/crawl delays and HTTP Retry-After.

Initially process one library at a time on `eg4.nic.in`; keep fifty as the **aggregate origin ceiling**, not fifty per each of six workers. This retains the measured load envelope. A second library starts with a new session only after the first drains. Other origins may retain independent existing scheduling, but must not circumvent the single origin coordinator/lock budget.

Use the owner's top-down decision rule: fifty first. On a concurrency-related incomplete batch, let active requests finish, inspect cause, then reduce to twenty-five for affected unfinished work with explicit retry provenance. Do not re-run the full inventory or all successful queries. Stop an origin on real access refusal; honor rate-limit recovery rather than bypassing it. Preserve healthy independent work where permitted. Do not add ascending probe ladders or fifty/one-hundred-request stress loops to ordinary audits.

The benchmark's fifty requests passed on all five members, so a twenty-five fallback was not exercised. The implementation must still test fallback with controlled local fixtures before relying on it.

## 3. Define search outcomes narrowly and clearly

A successful query requires recognized source result structure, the correct library and query, native record identity for returned entries, and relevant titles. Normalize punctuation/spacing for relevance without changing stored native titles or merging records; the source's `PHILOSOPHERS STONE-1` matched the intended work and exact reference ID despite an apostrophe difference. Preserve native IDs, edition/ISBN data where supplied, totals and raw response evidence.

A correctly scoped zero result is a valid empty query. It is not proof the library has no books. Count a library as search-working when at least one tested term returns a relevant identifiable entry. Fifty terms do not guarantee twenty works; report matches, native records and the twenty-book benchmark separately. Copies/editions and repeated queries never inflate unique-library counts.

Wrong library, wrong query, generic catalog pages, login/challenge pages, parser gaps and session failures never become Working merely because HTTP is 200. Native detail resolution is removed from this searchability path; do not silently retain the old extra two requests.

## 4. Preserve resumability, safety and reports

Keep ordinary Git JSON/append-only segmented JSONL. Stable job ID = library ID + query-pack version + term/field + implementation protocol version. Every request saves timing, status, source evidence hash, exact query/control scope, all returned IDs/titles and errors. Keep results independent of response arrival order.

Checkpoint each completed library (fifty query outcomes), with safe stopped-writer Git publication batches. Resume only unfinished query IDs after confirming locks, host/PID/command/start time and heartbeat; never duplicate a live collector or rewrite older evidence. Sessions are recreated in memory on resume. Retain operator cancellations distinctly from source outages.

Reports show library totals, nonempty/empty/failed queries, matching native records, median/p95 response time, actual peak concurrency and library-batch elapsed time. Separate historic evidence, new observations, reanalysis and retry attempts. Keep item-link validation and twenty-book status out of the basic searchability completion count.

## 5. Verify, then obtain the owner's restart decision

Before touching the main collector, add local regression coverage for simultaneous queries with fixed library binding, cross-library misuse rejection, independent request bodies, session rotation, punctuation variants, true challenge responses, fifty-to-twenty-five fallback and interrupted batch resume. Use mock HTTP responses for load/failure mechanics; do not recontact providers just to exercise error branches.

Run the existing library connector/provider regressions and inventory/evidence hash validation. Preserve frozen IDs and old audit outcomes. Reconcile protocol-version changes so earlier detail-resolution failures are not automatically relabelled without relevant search evidence.

Then present the implementation diff and required migration/resume behavior. Keep the main audit and watcher paused until the owner directs their restart. No source activation/removal, runtime imports or production deployment is part of this work.
