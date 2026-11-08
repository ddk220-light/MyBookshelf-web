# Shared-method search audit

This is the owner's new three-category audit. It is separate from the paused
20-book comprehensive audit and never changes its gate or journals.

1. **Working:** a fresh supported query returns a relevant identified item in
   the selected library; the native resolver confirms the same ID/title and
   library membership. Both operations require saved response evidence.
2. **Needs work:** pending test, unsupported method, parser/configuration/scope
   issue, no relevant items for the tested terms, or an unresolved item. These
   reasons are separate in the CSV. Empty searches do not prove an empty library.
3. **Blocked / deferred:** every available route has an observed access/policy
   or transport blocker. A temporary unreachable route is not an offline library.

Twenty books, material-type classification and a full link sweep do not hold up
this searchability count. A generic link alone cannot pass. A resolved item can
be POST-only; the report distinguishes native resolution from independently
opening the returned item URL. No borrowing availability is inferred from
catalog presence. A pass is scoped to the saved query/method/library, not a claim
that every query or every returned URL works. This CLI is internal research;
it does not test the deployed app or activate a source.

## Methods and limits

Use **Koha RSS/XML**, the **VuFind Search API**, **e-Granthalaya shared HTML**,
and **Libman shared JSON**, all through the existing governed coordinator.
Structured search results must still resolve to matching native items with
confirmed local holdings. A documented endpoint returning 404/405/501 is Needs
work; actual permission refusals are Blocked/deferred. API failure does not
silently fall back to HTML search.

**IndCat remains an explicit shared-method gap:** its SRU service is documented,
but institution-specific holdings filters and native-ID mapping are not yet
proved. The runner records Needs work without making redundant union-catalog
queries for 407 libraries. This is a system-level implementation gap, not 407
failed libraries. No custom connector development happens during collection.

The native HTML/JSON service remains responsible for scoped item resolution.
Fixtures and saved-body replay cannot establish a new live pass. The API request
contracts and their upstream references are in `method-contracts.json`.

The frozen 6,703 IDs and 6,744 connections come from the original inventory and
the saved access-classification snapshot. No historical search pass is promoted
to a fresh pass. Saved route blockers stay deferred without new requests. Other
methods are marked Needs work by offline inspection. The remaining shared-method
jobs are interleaved by family, then scheduled by origin, so the large
single-host e-Granthalaya group does not fill every early batch.

Each route tries at most three exact terms (saved successful terms first, then
existing topic-aware seeds), one native result page per term, and at most two
relevant item resolutions per term. It stops at the first proved item. Eight
minutes per library is a tooling budget; exhausting it is Needs work, not a
source block. The coordinator enforces three seconds minimum per origin, longer
source crawl delays, robots/access rules, bounded bodies, and source cooldowns.
Concurrent libraries can use independent origins. No browser or bulk content.

## Commands (Node 22)

```sh
# Already initialized and committed for the frozen India inventory. Do not re-init.
node tools/library-triage/cli.mjs preflight
node tools/library-triage/cli.mjs validate

# A bounded live batch, once live execution is authorized:
node tools/library-triage/cli.mjs run --limit 10 --concurrency 3

# Continue through all pending shared-method targets:
node tools/library-triage/cli.mjs run --all --concurrency 3

# Rebuild CSVs under an exclusive writer lock:
node tools/library-triage/cli.mjs report

# Explicitly reconsider a completed non-policy case after a meaningful repair:
node tools/library-triage/cli.mjs run --libraries koha:example \
  --retry-reason 'Reviewed request repair and regression evidence'

node tools/library-triage/audit.test.mjs
```

Default directory:
`docs/research/india-library-audit/search-triage/india-20261108`.
`init --dir NEW_DIRECTORY` freezes a separate run; it refuses existing runs and
old audit/repair paths. Tests use disposable fixture directories only.

## Resume and worker safety

Before live work, fetch/check remote freshness and inspect existing collector
commands, host/start times, heartbeat, run/machine locks and supervisor
reservations. The CLI shares the existing exclusive machine lock; it never
steals a lock, and also checks the legacy link supervisor reservation. No
scheduled task is enabled by creating this run. Older schedules remain paused.

Completed outcomes are skipped on resume. Completed alternate-route work is
checkpointed separately and reused after interruption. An interrupted current
query may be repeated; old attempts remain in the journal and library totals
never double-count retries. Completed cases require explicit IDs and a meaningful
retry reason. The retry flag does not clear recorded provider refusals or saved
route blockers. Policy changes need a reviewed new manifest/version; do not edit
frozen blockers in place. Changed code alone does not silently rerun every ID.

Origin refusals, cooldowns and pacing state are loaded from both old runs and the
new run. The CLI saves that state on every library checkpoint and final/error
exit. SIGINT/SIGTERM aborts current work and releases owned locks. A damaged
trailing JSONL line is quarantined under the exclusive lock before resumption.
Execution heartbeats include host, PID and start time. A saved running state is
not proof of process liveness. Cross-machine workers require the same manual
remote-health check as the existing audit; the lock is machine-local.

## Outputs and publication

- `manifest.json`: immutable inventory, exact bounded query plans and source hashes.
- `events.jsonl` / `bodies/`: append-only attempts and sanitized, hashed evidence.
- `execution.json`, `heartbeat.json`, `origin-state.json`: health and provider state.
- `progress.json`, `report.md`: three-category totals, pending/live counts and family totals.
- `libraries.csv`, `blocked.csv`: unique libraries and named blocked routes/reasons.
- `queries.csv`, `results.csv`, `items.csv`: every tested query, all returned
  candidates, resolved item/native ID/title/URL and explicit link-check limits.

`triage_complete` means every entry has an assessed outcome in this new,
bounded process; it does not mean every library works or the twenty-book audit
is complete. Saved blockers and offline exclusions count as assessed but not as
live searches. Unknown items stay pending until tested or explicitly excluded.

Validate evidence and counts at a stopped checkpoint, then commit/push only the
new run's files. There is no automatic Git push or deployment. Keep the original
append-only journals intact. Long-run evidence segmentation remains a later
storage concern; use small stopped Git checkpoints while collecting.
