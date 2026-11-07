# Running the library connector audit

This implementation uses Node 22 and direct HTTP. It does not use a browser, a new database or a hosted queue. The service is internal and binds localhost; it is not mounted in the production app. See [implementation status](IMPLEMENTATION_STATUS.md) for measured pilot results and unfinished adapter work.

## Setup and prepared runs

```sh
npm ci
npm run test:library-connectors
npm run library:audit -- preflight --dir docs/research/india-library-audit/runs/india-20261107
```

The prepared full run contains **6,703 India libraries** with a target of 20 distinct books each. Its frozen inventory and the separate 11-library pilot are committed under `docs/research/india-library-audit/runs/`. It collected 553 assessed entries and one interrupted attempt before the owner's repair hold. Do not initialize it again. For a new country or a new inventory snapshot, choose a new run directory:

```sh
npm run library:audit -- init --country US --dir /workspace/library-audits/us-pilot
```

Use `--libraries id,id` at initialization to select a pilot subset. It preserves the country's total as `universeTotal`. Alternate catalog routes are connections of the same library, not additional libraries. The 379 historically omitted connection rows remain explicit reconciliation work, not automatic targets.

## Execute or resume

**Owner repair hold (7 November):** full collection is paused by `audit-control.json`. Both the runner and supervisor refuse to collect while `resumeAllowed` is false, including an accidental restart by an older scheduled prompt. The repair cohort freezes all **554 attempted IDs** without changing the 6,703-library denominator. Original failures are never overwritten. Run saved-body replay before duplicating provider requests:

```sh
node tools/library-audit/review-cohort.mjs
node tools/library-audit/revalidate-run.mjs \
  --dir docs/research/india-library-audit/revalidation/20261107 \
  --batch-size 10 --concurrency 6 --publish
```

The repair supervisor has the same run/machine locks, pacing, source refusals, safe Git publishing and interruption behavior as full collection. It rechecks open entries once per implementation version, resumes saved books and queries, and then stops collecting when semantic work remains. A completed collection attempt is not a closed tooling gap. The existing scheduled repair task must analyze unresolved adapters and evidence instead of blindly repeating the same code. Read `execution.json`, `heartbeat.json`, `repair-goal.json`, `gate-report.json`, `repair-report.md` and `revalidation-status.csv` in that directory. A fresh process/heartbeat check is required before resuming; an old saved phase is not proof of liveness.

Resume full collection only after every frozen entry has an evidence-backed corrected outcome, regression checks pass, no known code/equivalence/configuration gap is mislabelled as a provider failure, and corrected findings have been reconciled into the original journal with provenance. Connection errors describe reachability from this environment. Partial libraries still fail the twenty-book target. `gate-report.json` deliberately keeps full resume disabled until the final reconciliation step is implemented and verified. Do not manually flip the control just because the collector reaches the end of its queue.

```sh
# A bounded pilot using actual catalog traffic
npm run library:audit -- run \
  --dir docs/research/india-library-audit/runs/pilot-http-20261107 \
  --libraries egranthalaya:publiclibraries-hkmslib \
  --query Science --field title --concurrency 1

# Run/resume the prepared full inventory when starting the comprehensive audit
npm run library:audit -- run \
  --dir docs/research/india-library-audit/runs/india-20261107 \
  --concurrency 3
```

`run` is an explicit live operation. `--limit N` caps libraries selected for that invocation; it does not change the inventory or its denominator. The runner preserves successful books and finished query checkpoints. It skips libraries already at 20 and blocked libraries unless an explicit retry reason is supplied. It never treats a stopped or budget-limited run as finished qualification.

By default, e-Granthalaya uses the website's Title option for efficient book discovery; other families use their advertised field. `--field keyword` explicitly selects its ALL/LIKE search instead. The exact query, native controls, result order, count and rejected candidates remain in the journal. A member-scoped Books search can prove catalog presence; it does not prove a borrowable copy. A detail check is performed before using sufficient list evidence to count later books.

`Ctrl-C`/SIGTERM cancels outstanding requests and checkpoints the run. Repeat the command to resume. Interrupted jobs remain resumable even if a provisional review reason was saved; recorded source access refusals remain enforced. A real interrupted/resumed pilot is saved. Ordinary failed searches are preserved; repeating a completed query automatically is avoided. Supply a new meaningful query for a shortfall. Do not edit old events to turn a failure into a success.

## Safe concurrency and locks

The coordinator serializes each origin with a minimum three-second gap after each response, honors longer robots crawl delays, and caps actual requests globally at eight. Worker selection lets independent origins progress while a large shared catalog is busy. The CLI accepts 1–8 workers (default three). More workers cannot make one shared server answer faster.

Each run has `writer.lock`; a second machine-local lock at `/tmp/mybookshelf-library-connector-coordinator/writer.lock` prevents separate run directories or worktrees from starting competing live coordinators. No lock is automatically stolen. Before recovering one, verify its host/PID, the process command and zombie state, recent journal/heartbeat timestamps, and any remote worker checkpoint. A PID from another host proves nothing. Only after establishing that its owner has stopped, preserve the lock record for diagnosis and remove that stale lock. Never remove a live lock or run two machines against the same provider budget.

The lock is a single-machine guard. Distributed/public hosting and its coordination remain a later release decision. The API and CLI share one coordinator in a process; do not deploy multiple replicas of this internal service.

## Failures and useful retries

- **Robots refusal, 401/403, CAPTCHA/WAF:** stop the route. Use only a documented permitted alternative or wait for an actual policy/access change.
- **429:** honor Retry-After and the origin cooldown. A later run still needs a concrete recovery reason.
- **Timeout/network/5xx:** inspect saved status and timing. Retry a small canary after recovery/backoff; do not run a tight retry loop across thousands of members.
- **Unexpected markup, changed scope, mismatched native IDs:** fix against the saved body, run regression tests, then try one live canary.
- **Equivalence unproven/unsupported:** successful JSON or a legacy search is evidence to review; it does not qualify a library until website semantics are demonstrated.

```sh
npm run library:audit -- run --dir RUN_DIRECTORY \
  --libraries LIBRARY_ID --query QUERY \
  --retry-blocked --retry-reason 'Concrete endpoint/parser/recovery change and evidence'
```

The current runner requires explicit retry decisions; automatic jittered transient retry/coalescing and separate daily variant canaries are not implemented. Scheduling leaves blocked and review-required shortfalls aside so they cannot monopolize every tick.

## Reports and evidence

```sh
npm run library:audit -- report --dir RUN_DIRECTORY
npm run library:audit -- validate --dir RUN_DIRECTORY
node tools/library-audit/benchmark.mjs PILOT_RUN_DIRECTORY 100
```

- `manifest.json`: frozen library/connection denominator and hash, including historical omitted rows.
- `events.jsonl`: append-only request, search, book decision, failure and checkpoint history.
- `bodies/`: sanitized, content-addressed response evidence. Cookies, credentials, CSRF/viewstate and scripts are not retained as usable session state.
- `progress.json` / `library-status.csv`: per-library qualification, number found, separate health results, blocker and next action.
- `searches.csv`: every successful/empty/failed query and returned count, native totals, exact profile and evidence.
- `books.csv`: accepted book identities/titles, search terms and proof references; history is retained across requalification cycles. Current counts come from `progress.json`.
- `failures.csv`: failed searches/records with codes and evidence.
- `metrics.json`: source-response counts/bytes and latency percentiles. `benchmark.json` is explicitly offline replay, not fresh health.
- `report.html`: regenerable, filterable report with CSV links; ignored by Git to avoid duplicating the dataset. Open it as a static document if desired; the runner never drives a browser.

`validate` fails on missing/mismatched evidence hashes or incomplete accepted-book proof. A broken trailing JSONL line is quarantined during locked resume. Fixtures are confined to temporary unit-test stores and cannot count as live qualification through the CLI. Fresh health and 20-book qualification have different timestamps and counts. Search totals are not the number of distinct books verified.

The journal is saved per event; progress checkpoints every ten libraries and at completion/interruption. Run `report` only when no writer holds that run lock. Commit and push completed checkpoints separately from collection; a failed push does not invalidate locally saved work and must never be repaired with force push.

## Internal API

Set `LIBRARY_CONNECTOR_API_KEY` to a secret of at least 32 characters. An optional `LIBRARY_CONNECTOR_SIGNING_SECRET` of at least 32 bytes keeps signed record/page references valid across restarts; otherwise an ephemeral secret is generated. Supply secrets through the environment, never committed files or logs.

```sh
npm run library:audit -- serve --dir RUN_DIRECTORY --port 4321
```

The implemented [OpenAPI 3.1 contract](../../server/services/catalog-connectors/openapi.json) exposes `/api/catalog/v1/libraries`, capabilities, search, record resolution, saved health, and operator run/start/status/report/cancel. Every route requires `Authorization: Bearer …`. Operator submissions require an idempotency key and 1–100 explicit library IDs. Requests cannot supply upstream URLs, credentials or unimplemented filters. The API limits concurrent requests and shares provider budgets with its audit worker. Shutdown cancels and awaits its worker.

Only live freshness, the advertised fields and website defaults are implemented. Unsupported locale/sort/filter/cache choices fail explicitly. e-Granthalaya and IndCat currently expose the complete first native page and indicate unsupported continuation; Koha and VuFind expose signed continuation. Legacy/JS variants remain unverified until their display contract is reviewed. Public key management, redistribution eligibility, hosted API, MyBookshelf migration and MCP are later work.

## Periodic checks are prepared, disabled

```sh
# Display/save due jobs without contacting providers
npm run library:audit -- schedule --dir RUN_DIRECTORY
```

The saved `schedule.json` defaults to `enabled: false`, a rolling weekly health interval, 30-day requalification interval, 25-library tick budget and three workers. No cron/cloud job is installed and the old research schedules stay paused. When a new monitor is explicitly enabled, set its configuration and invoke `schedule --execute` from one controlled timer. Each tick respects locks, skips blockers needing investigation, and reports overdue work. Enabling a timer is separate from implementing the runner.

## Comprehensive India run

The owner authorized the full run on 7 November 2026. The detached supervisor uses the same connector/evaluator, keeps one coordinator and both locks for the whole run, and serially publishes batches of ten assessed libraries:

```sh
node tools/library-audit/full-run.mjs \
  --dir docs/research/india-library-audit/runs/india-20261107 \
  --batch-size 10 --concurrency 6 --publish
```

It prioritizes hosts with the fewest assessed libraries so the large shared catalogs cannot hide other catalog families. It retains access refusals and rate-limit cooldowns across restart in `origin-state.json`; a 401/403 requires an actual permitted recovery. Robots policies are refreshed at least every 24 hours during the long run, and an unsuccessful refresh blocks further requests rather than reusing expired permission. `execution.json` describes worker state/counts, `heartbeat.json` advances with evidence, and `/tmp/mybookshelf-india-library-audit.log` records saved/pushed checkpoints. Confirm PID command, zombie state, locks and heartbeat before resuming. Never launch a second supervisor for the same source budget.

Each batch completes before its report and Git snapshot are published. Unrelated staged changes or another writer's branch update stop publishing safely. Data checkpoint commits skip CI/preview builds; implementation changes still run tests. The supervisor emits `final-report.md` and `final-report.json` only when every frozen target has an outcome. The report explicitly distinguishes 20-book passes, partial findings, clean searches finding no books, and failures/unsupported methods; complete assessment does not imply every connection worked. User notification is requested only for the final report or a blocker needing their action. The earlier free-knowledge recovery/reporting schedules stay paused.
