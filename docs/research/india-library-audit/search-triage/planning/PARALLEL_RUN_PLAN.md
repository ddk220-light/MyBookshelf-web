# Parallel India library search test plan

Prepared 8 November 2026 for the frozen 6,703-library inventory. This plans the
new three-category search audit, not a restart of the paused comprehensive audit.
The owner subsequently authorized a six-worker pilot and continuous classification. App publication remains out of scope.

## Outcomes and starting point

| Category | Meaning | Initial count |
| --- | --- | ---: |
| Working | Supported live query and native item resolution prove a relevant item in the selected library | 0 |
| Needs work | Untested, empty tested searches, method/scope/parser gap or unresolved identity | 6,393 |
| Blocked / deferred | Saved access/policy/transport restrictions on all available frozen routes | 310 |

Of Needs work, 5,907 have a shared-method test queued and 486 have method gaps.
The 796 offline decisions (486 gaps + 310 saved restrictions) are separately
accounted for; they are not fresh searches. An empty tested search does not
prove a library has no books. Historical evidence retains its original date.

Methods: Koha RSS/XML, VuFind Search API, Libman website JSON and e-Granthalaya
website HTML. IndCat's institution-specific SRU holdings/identity mapping is
still unproved; record the shared gap once instead of developing hundreds of
connectors. Seven IndCat entries have another eligible frozen route. No custom
connector development or silent API-to-scraping fallback during collection.

## One runner, parallel independent hosts

Use the existing cloud workspace: measured cgroup capacity is **4 CPU cores and
16 GiB memory**. Start one Node 22 coordinator with **6 concurrent library jobs**, as requested
by the owner, and reduce concurrency if the pilot shows memory or provider pressure. There is no need for extra machines or one agent per library.

- At most one in-flight request per origin; share that limit across search,
  item lookup, alternatives and book enrichment. Keep the existing minimum
  3-second per-origin gap and any longer source crawl delay.
- Round-robin eligible catalog families and then origins. Do not let thousands
  of queued e-Granthalaya jobs occupy all scheduling slots.
- All 5,036 e-Granthalaya primary libraries share eg4.nic.in across 62 clusters.
  Those clusters are not 62 independent request budgets. This host is likely
  the throughput bottleneck; extra cloud CPU cannot remove provider pacing.
- Reuse permitted sessions, connection pools, robots checks and saved evidence
  with their scope and expiry. Never reuse another library's holdings proof.
- Persist retries, origin cooldowns and refusals. Honor Retry-After; stop an
  affected origin on a genuine denial and continue independent origins. No
  retry just because a schedule fires, and no repeated probes of a known gap.
- Bounded metadata HTML/JSON/XML only. No book/audio downloads or browser use.

Pilot: the saved `pilot.json` selects 24 pending IDs, six per executable method,
preferring different origins/clusters in frozen inventory order. Run all 24 at
concurrency 6; validate evidence, scope, pacing, failures and memory before the
continuous queue. If these checks pass, continue in batches of 100 without asking
for another launch approval. Pilot outcomes remain in the same queue and are not
repeated. Do not hold up every provider merely because a pilot route is blocked.

Record requests and bytes per library, p50/p95 latency, peak RSS/CPU, query and
identity success, 429/503/timeouts, and throughput by origin. Increase concurrency
only for independent hosts when there is no new throttling and memory remains
below 8 GiB. Lower concurrency on memory pressure or increased errors. Use the
pilot's requests-per-library and per-origin latency/pacing to estimate completion;
do not promise an ETA from total worker count. Keep this measurement aggregate
small rather than repeating full journals in every summary.

## Two stages: searchability first, twenty-book samples second

**A. Cheap classification.** The implemented CLI uses up to three saved queries
per route, one result page per query and at most two item resolutions per query.
Stop at the first proved relevant native item. Alternate frozen routes can still
succeed if the primary fails. Preserve exact query/field, all returned results,
selected library scope, native IDs, titles, authors, source dates/body hashes,
item URLs and actual resolution outcome. This establishes Working, not twenty
books or deployed-app readiness. Configuration gaps remain Needs work.

**B. Twenty distinct books for Working libraries.** Use the accompanying
[80-title JSON](book-search-pack.json) / [CSV](book-search-pack.csv). These are
curated search seeds, not verified holdings. The list covers general Indian
reading, fiction, children, science/mathematics, computing/engineering,
business/social science, medicine/law/agriculture and regional languages.

Order seeds by known library subject and language, then broaden. Start with
10 seeds; continue in groups of 10, up to 80 seed works if necessary. Native-script
and transliterated queries are alternatives for the same work, not two books.
Use a supported Title field when available, otherwise the documented field, and
record it exactly. Reuse a current successful search from this run rather than
requesting it again. Old evidence may suggest a query but is not a fresh result.
Keep source order and native page size. Additional pages/variants need a saved
reason and remain within an initial **100 search-request budget per library**;
bootstrap/detail requests are counted separately. A budget hit is partial work,
not a failed library. Stop as soon as 20 distinct books are verified.

A result must match the intended title/work, have native identity, confirmed local
membership and book evidence. Common titles such as Economics need author or
edition disambiguation; author/editor changes across editions are not automatic
rejections. Preserve editions and copies separately. Twenty copies, volumes or
translations of one work do not satisfy twenty distinct works. Ambiguous
identities remain unresolved, never merged solely by similar title. If a query
returns additional relevant distinct books, retain them with their own identity
and relevance evidence; never count unrelated default results.

Record a library as **Working, 7/20 books** if only seven are verified. Keep zero
matches, restrictions and incomplete tooling separate. No fixed list can ensure
20 books exist in every catalog, especially specialist or small libraries. Where
seeds are exhausted, provider-returned relevant titles can seed a documented
follow-up plan, rather than endless unchanged retries. Authorize any later budget
increase through a saved plan amendment; do not automatically exceed the cap.

The current CLI implements A only. Stage B must be implemented and validated as
a separate versioned enrichment queue before use. Do not replace the existing
frozen three-query manifest or make the twenty-book benchmark a classification
gate again. Run A across pending IDs first so enrichment does not stall coverage.
Retain all returned candidates while doing detailed checks only on selected
candidates until the 20-book target is met; label other item links unchecked.
A lookup response is not proof that every public book URL opens successfully.

## Safe execution and checkpoints

Before launch, verify remote freshness, actual collector/supervisor commands,
host/start time, non-zombie state, advancing heartbeat, run/machine locks and
editor leases. Never overlap old collectors or steal locks. No old audit gate,
source status or paused schedule changes. Resume this same new queue, not the
old full-run.mjs supervisor. Launch is authorized; the six-worker pilot must pass operational checks first.

Implemented commands (Node 22):

```sh
npm run library:triage -- preflight
npm run library:triage -- validate
# Bounded initial live batch once launch is authorized:
npm run library:triage -- run --limit 24 --concurrency 6 --libraries <saved-pilot-IDs>
# Remaining classification queue after pilot review:
npm run library:triage -- run --all --concurrency 6
```

Append evidence immediately; retain all failures and interrupted attempts. The
current CLI saves reports every 10 completed libraries and at shutdown. Publish
small scoped Git checkpoints only at a stopped-writer boundary, initially every
100 unique outcomes, or sooner if a journal segment reaches 20 MiB. Preserve
unpublished work and never force push. A publishing failure does not erase
collection evidence. No report task commits through a live collector's worktree.

The implemented `tools/library-triage/supervisor.mjs --batch-size 100
--concurrency 6 --publish` runs bounded batches and validates/publishes only after
each child stops. It has a separate reservation, a pause file, a 10-second
heartbeat and preserves errors instead of force-pushing. The CLI rejects unrelated
writers during that reservation. The triage-only evidence store seals journals at 20 MiB and continues in numbered
append-only files, with a hashed journal-index.json. Old files never move or
change. Readers validate all sealed hashes and preserve interrupted active tails.
The owner-authorized run may start within this bound. No automatic twenty-book
enrichment is implied by this supervisor.

## Reporting every 1,000 newly checked libraries

The hourly automation is **report-only**. It does not start providers or restore
old schedules. Read the new manifest, progress and complete journal lines across every sealed
and active file in journal-index.json (events.jsonl alone before rollover). Count
distinct frozen library IDs with completed `triage_outcome` events in this run;
retries, route attempts, later book enrichment and the 796 offline baseline do
not increase that number. Cross-check against CSV/progress; expose discrepancies
instead of guessing. Source/contact counts are separate from attempted outcomes.

Report at 1,000, 2,000, 3,000, 4,000 and 5,000 newly checked IDs, then at the final
5,907 pending-ID outcomes, when all 6,703 are accounted for. If offline gaps later
become eligible, update the versioned denominator explicitly; never silently
reclassify baseline entries as fresh tests. If several thresholds pass between
hourly checks, send one cumulative report identifying all newly crossed ones.
Use the observed snapshot count, not invented exact historical threshold counts.

Each report includes a by-system and total table of Working / Needs work /
Blocked / pending; newly checked and remaining; fresh versus historical evidence;
twenty-book samples only if that phase exists; main blocker causes and CSV links;
last checkpoint/time, process health when actually observable and next action.
A stopped unlaunched queue is not a stalled worker. Remote-only data must be
labelled a checkpoint snapshot; a stale commit does not prove a crash.

Keep the delivery cursor outside collector-owned state at
`/workspace/library-audit-review/search-triage-reporting-cursor.json`, keyed by run
ID, with last delivered threshold, snapshot hash/time and checked count. Update
it only after delivering a report; archive at a safe writer boundary. No routine
message below a threshold unless an owner-action blocker arises. On completion,
deliver the final validated classification report even below the next thousand;
disable only this watcher after requested sampling/reporting is also complete,
or if the owner stops it. Existing old free-knowledge/audit schedules stay paused.

## Implementation order before a large launch

1. Validate the frozen 24-ID pilot and current queue; run at concurrency six.
2. Measure the 24-case pilot; fix shared method mistakes once, not per library.
3. Use the tested bounded publishing supervisor; use the tested segmented readers
   and validate counter, interruption and missing-hash handling.
4. Continue classification A across all eligible pending libraries; separately
   implement/test enrichment B with this versioned book pack and exact budgets.
5. Sample Working libraries to twenty books, publish separate honest sample
   coverage and final evidence-backed exports. No production changes.

Planning validation: JSON/CSV pack parity, 80 unique IDs/titles, eight groups,
nonempty authors/query variants, fixed frozen inventory/count reconciliation.
This validation is offline and establishes neither catalog access nor holdings.
