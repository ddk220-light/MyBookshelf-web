# Free-knowledge source registry

## Full coverage completion target

The owner reaffirmed a 100% research-coverage goal on 2026-11-05. The existing
hourly completion task is enabled as **Reach full source research coverage**;
work also runs directly in this conversation. This is a saved repository goal
and recurring task, not activation of the unavailable native chat Goal UI.

Completion requires evidence-backed closure of all 49 areas and all 18 USA/India
civic cells, complete known-evidence/lead analysis, and full eight-section dossiers
with ten distinct current examples for retained queryable sources. Content and
industry areas target 100 qualified independent origins each where supply supports
it. Any documented scarcity stays open until the owner explicitly accepts the
shortfall with recorded provenance. No shortfall has been accepted yet.

`completion-audit.json` now exposes `area_completion` and `target_progress`.
Candidate counts, query-only examples, overlapping classifications and repeated
source IDs cannot satisfy the qualified-origin target. Every area also needs a
complete manual coverage review backed by saved evidence. Record those reviews
in append-only `analysis/area-coverage-reviews.jsonl` when performed; do not mark
a partial review complete to raise the percentage. The initial goal metrics are
0/49 area closures and 0/18 civic cells accounted. Read the current audit for
later values; counts in historical prose are checkpoints.


This is a research collection of ordinary JSON files in Git. It needs no SQL,
database server, Redis, paid service or new dependency. JSON preserves nested
query parameters, multiple capabilities and result samples more clearly than a
wide CSV. A CSV summary can be generated later if a spreadsheet becomes useful.

The owner authorized continued source research after reviewing the first ten,
then selected a simple file format. App integration remains a separate decision.
The durable goal is in [goal.json](goal.json), tracked by
[#164](https://github.com/ddk220-light/MyBookshelf-web/issues/164).
The completion task was updated on 2026-11-05 to resume **hourly**, use available
run time productively and checkpoint small batches. A batch size is not a stopping
quota. The immediate-run tool returned HTTP 404, so the first completion pass was
executed in the active conversation. Scheduling is confirmed; no background run
is claimed from that failed trigger.

The goal is the authoritative collection of **all source analysis**, including
historical findings, contradictions, failed attempts and open questions. The
[completion audit](completion-audit.json) distinguishes captured evidence from
completed analysis. A document import or ten passing queries does not close the
whole source dossier or the expansion goal.

## Immediate execution

The app's native chat Goal control is not exposed in this environment. A saved
goal file or an enabled schedule must not be described as activating that feature.
The available immediate scheduler endpoint returned HTTP 404 on both attempts.

The original 153-job queue is complete. Do not restart it to represent progress
on the broader goal. Analyze its observations and continue from `goal.json` and
the completion audit. Only if a restored checkpoint has unfinished queue IDs,
and no active writer owns the lease, resume that existing queue with:

```sh
python -u tools/research/run_source_reviews.py source-evidence-20261105 --publish
```

This resumable worker captures primary documentation from untriaged links and
historical source candidates, observes robots rules and provider pacing, and
stops requesting a host after access/rate denial. It writes real observations and
a process heartbeat under `runs/source-evidence-20261105/`, and commits/pushes
that directory every ten completed jobs and at the end. One lock prevents duplicate
workers. Read `progress.json` and verify its PID/heartbeat before restarting.
It is an evidence-collection phase of the larger research goal, not an AI agent
that completes every source dossier. Captured pages and skipped/blocked URLs never
count as verified search examples. After completion, analyze the observations and
continue source qualification; do not close the whole goal.

## Files and evidence

- `sources/<id>.json`: one catalog or publisher, capabilities, category/industry
  memberships, documentation, query method, restrictions, next action and cases.
- `examples/<id>.jsonl`: one JSON object per real query observation. Append later
  checks; retain failures. Each observation records the exact public request,
  expected and matched native IDs, UTC time, HTTP details, response hash and up to
  three small result samples. No credentials, full books or audio are stored.
- `examples/<id>.scouting.jsonl`: discovery requests that established candidate
  titles/IDs before testing search. These do not count toward ten query examples.
- `discovery-links.json`: all unique external links from the existing master
  plan, six playbooks and first-ten packet, with document provenance. It includes
  directories, policies and protocol documentation; **138 links are not 138
  sources**. Named but unlinked leads still need resolving during each group pass.
- `areas.json`: all 49 overlapping categories, industries and public tracks.
- `goal.json`: milestones, counting rules, continuation cursor and constraints.
- [PROGRESS.md](PROGRESS.md): human-readable checkpoint, including remaining gaps.
- `analysis/documents.jsonl`: complete text of the existing free-content research,
  structured evidence and approved design artifacts, retained by content hash.
  Changed documents append a new version; historical findings remain historical.
- `analysis/manifest.json`: current source paths/hashes and existing screenshot
  assets. Binary screenshots stay in Git and are referenced without duplicate copies.
- `analysis/external/github-backlog.json`: snapshot of the seven discovery issues.
- `catalog-import.json`: all 36 historical source-catalog rows mapped to records.
- `sources/<id>.json` also contains the eight-part `dossier`, explicit open
  questions and `analysis_refs` with exact document/line/text provenance.
- `completion-audit.json`: missing captures, unresolved dossiers, untriaged leads
  and candidate/query-verified/qualified memberships for all 49 areas.

Source `evidence` paths are relative to this registry directory, or explicitly
repository-relative for shared browser evidence. Documentation
URLs are primary references, not a claim that every policy has completed review.
Deferred records explicitly identify the missing evidence.
Imported catalog records may describe already deployed sources. Their `enabled`
field is this research's activation approval, not a claim about production's
current configuration. Use the preserved operations/release evidence to reconcile
historical implementation status; this workflow does not alter it.

## What “verified” means

A query example passes when a real, successfully parsed response contains a
previously identified expected native item ID. HTTP 200, an empty result, a
documentation page or a browser challenge cannot pass. Later failures invalidate
earlier success for the same case when computing current progress. Retries,
pagination and duplicate requests do not inflate the count. The timestamp is the
date observed, not a guarantee of future availability.

For catalogs spanning distinct content subsets, `query.area_case_ids` assigns
specific current cases to each area. An empty mapping establishes no query
coverage there; book examples cannot prove newspaper search. Older records
without this mapping retain source-level evidence until reviewed. Area closure
still requires its separate manual review and qualified-origin target. A complete
research dossier qualifies only its declared, evidenced subset; runtime ownership,
activation approval and deployment are separate decisions.

The initial ten-example suites emphasize **known-item retrieval**. They do not
establish topic relevance, whole-book completeness, worldwide rights, reliability
or production readiness. The separate five-known-item/five-topic qualification
benchmark in the execution plan remains required before integration. Prior
representative reading/file checks are retained in the G01 batch evidence; ten
query successes do not mean ten complete books have been read or downloaded.

Source states are `candidate`, `probed`, `deferred`, and
`ten-query-examples-verified`. This research never sets `enabled` to true.
`full_qualification_complete` may become true only after all evidence-backed
research gates are satisfied; it is separate from approval to activate a source.
Existing production sources remain outside this research's activation decisions. Publishers sharing Thoth are separate
origins with one connector; language wikis and mirrors are not extra sources.
Aggregator memberships and overlapping records need deduplication.

## Read, validate and recheck

From the repository root, Python 3's standard library is sufficient:

```sh
python tools/research/source_registry.py validate
python -m unittest discover -s tools/research -p 'test_*.py' -v
python tools/research/source_registry.py probe gdl
python tools/research/source_registry.py probe gdl --case known-title-01
python tools/research/source_registry.py probe python-docs
python tools/research/source_registry.py probe usgs-earthquake
python tools/research/capture_analysis.py capture
python tools/research/capture_analysis.py index
python tools/research/capture_analysis.py audit
```

Validation and tests are offline. `probe` makes the public requests saved in that
source's JSON and appends observations. Read the provider's current policies
first. Calls are serial with a descriptive User-Agent, a two-second pause and a
4 MiB response cap. Stop on 403, 429, 503 or MediaWiki maxlag; do not bypass access
controls or blindly retry. Provider-specific limits override this research pace.
The probe is a developer research utility, not an application search adapter.
For `python-docs`, one official Sphinx metadata inventory is downloaded and ten
distinct exact-symbol searches execute locally. The evidence labels this mode;
it does not claim ten live full-text API searches. Version and anchor identities
are retained, and a changed inventory version fails validation. Raw compressed
metadata exports are hash-backed in `analysis/inventories`; the PSF notice is in
`analysis/legal-notices`. A minor-version URL can change between builds, so the
inventory hash and observed patch label distinguish snapshots.

For `usgs-earthquake`, the documented FDSN service supports bounded time/region/
magnitude queries and exact event IDs. The research probe requests at most two
records, observes robots and serial pacing, and preserves longitude/latitude/
depth and origin/update timestamps. Scouting, empty/invalid/paging observations
and spatial relevance checks stay separate from the ten current cases. This
does not establish geological-map layers, item redistribution rights or full
source qualification. Gateway follow-ups and identity blockers remain explicit
in the audit and `analysis/identity-blockers.jsonl`.

For `open-textbook-library`, a documented CC0 CSV export supports actual local
title/subject searches. Its book URLs remain metadata-reported until reader access
is tested; paid print links are excluded. For `europe-pmc`, examples are real
exact-DOI REST queries with provider/native IDs retained; correction notices and
editorials must not be silently relabelled as original studies. Provider-specific
robots pacing applies (ten seconds in the current Europe PMC evidence).

After editing research/design documents or importing external findings, run
`capture`, `index`, then `audit`. Capture embeds current text losslessly, index
copies source-matching passages with provenance, and audit rejects missing/changed
captures. Source sections marked partial/unknown remain unresolved even if query
examples pass. Later mark a section complete only with concrete evidence and a
reviewed explanation; use not-applicable only with a justified reason.

`coverage-audit.json` distinguishes capture from entity completeness. Its open
catalog mappings and unreviewed named entities are real outstanding work, even
when all linked URLs have a role assigned. Record manual named-entity reviews in
append-only `analysis/named-entity-reviews.jsonl`, keyed by archived document ID
(or the `primary:` observation identity reported by the audit), with reviewed_at,
status, rationale, resolved entities and unresolved_names. Review superseded
versions too. Country-specific civic coverage is recorded separately in
`analysis/jurisdiction-reviews.jsonl`; geography cannot be inferred from an
operator's country or a single cloud-network request.

After a recheck, update source state and the progress checkpoint to match the
latest evidence; a previous verified state with failing current cases is rejected
by validation. Never delete failed observations to restore a passing count.

## Resume the goal

1. Use the free-content expansion worktree/branch, fetch the current remote and
   read `AGENTS.md`, `docs/STATUS.md`, this directory and the owning playbook.
   Preserve unrelated work and avoid overlapping runs.
2. Work in small checkpoints while continuing toward completion. Resolve a stable origin/catalog
   identity and distinguish directory, aggregator, connector, mirror and content
   origin. Keep India/global gaps and USA/India public jurisdictions explicit.
3. Review official access/query/reuse documentation. Save a source record even
   when deferred, with the concrete blocker and next useful action. Resolve
   unlinked named leads as well as the linked inventory. Record new discoveries.
4. For a usable route, establish ten different expected items before querying,
   then run the ten real requests and save small outputs. Include representative
   subjects/languages where possible; never invent expected IDs or observations.
   Record content-access evidence separately and preserve item/version rights.
5. Update `goal.json`, `PROGRESS.md`, all dossier fields, source state and backlog
   issues. Run capture/index/completion audit, offline validation/tests and
   commit/push only scoped research changes to PR #161. Continue independent work
   after a checkpoint; do not stop solely because a source-count quota was reached.
6. Continue G02–G06, then revisit deferred and scarce areas. Work toward 100
   qualified origins per category/industry where real evidence supports it.
   Document shortfalls rather than padding counts. M2 completes only after every
   known lead has a triage decision; it is not complete merely because links exist.

Do not enable app sources, import a runtime catalog, provision infrastructure,
create paid accounts, contact third parties, bypass challenges or deploy. The
research files carry forward progress between runs; no always-running worker or
external database is needed.
