# Free-knowledge source registry

This is a research collection of ordinary JSON files in Git. It needs no SQL,
database server, Redis, paid service or new dependency. JSON preserves nested
query parameters, multiple capabilities and result samples more clearly than a
wide CSV. A CSV summary can be generated later if a spreadsheet becomes useful.

The owner authorized continued source research after reviewing the first ten,
then selected a simple file format. App integration remains a separate decision.
The durable goal is in [goal.json](goal.json), tracked by
[#164](https://github.com/ddk220-light/MyBookshelf-web/issues/164).
Daily research continuation was created and enabled on 2026-11-05, for bounded
batches of 1–3 candidates. The schedule runs research work; it does not enable
sources. Each run must report actual progress or its access blocker.

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

Source `evidence` paths are relative to this registry directory. Documentation
URLs are primary references, not a claim that every policy has completed review.
Deferred records explicitly identify the missing evidence.

## What “verified” means

A query example passes when a real, successfully parsed response contains a
previously identified expected native item ID. HTTP 200, an empty result, a
documentation page or a browser challenge cannot pass. Later failures invalidate
earlier success for the same case when computing current progress. Retries,
pagination and duplicate requests do not inflate the count. The timestamp is the
date observed, not a guarantee of future availability.

The initial ten-example suites emphasize **known-item retrieval**. They do not
establish topic relevance, whole-book completeness, worldwide rights, reliability
or production readiness. The separate five-known-item/five-topic qualification
benchmark in the execution plan remains required before integration. Prior
representative reading/file checks are retained in the G01 batch evidence; ten
query successes do not mean ten complete books have been read or downloaded.

Source states are `candidate`, `probed`, `deferred`, and
`ten-query-examples-verified`. This research never sets `enabled` or
`full_qualification_complete` to true. Existing production sources remain outside
this research's activation decisions. Publishers sharing Thoth are separate
origins with one connector; language wikis and mirrors are not extra sources.
Aggregator memberships and overlapping records need deduplication.

## Read, validate and recheck

From the repository root, Python 3's standard library is sufficient:

```sh
python tools/research/source_registry.py validate
python -m unittest discover -s tools/research -p 'test_*.py' -v
python tools/research/source_registry.py probe gdl
python tools/research/source_registry.py probe gdl --case known-title-01
```

Validation and tests are offline. `probe` makes the public requests saved in that
source's JSON and appends observations. Read the provider's current policies
first. Calls are serial with a descriptive User-Agent, a two-second pause and a
4 MiB response cap. Stop on 403, 429, 503 or MediaWiki maxlag; do not bypass access
controls or blindly retry. Provider-specific limits override this research pace.
The probe is a developer research utility, not an application search adapter.

After a recheck, update source state and the progress checkpoint to match the
latest evidence; a previous verified state with failing current cases is rejected
by validation. Never delete failed observations to restore a passing count.

## Resume the goal

1. Use the free-content expansion worktree/branch, fetch the current remote and
   read `AGENTS.md`, `docs/STATUS.md`, this directory and the owning playbook.
   Preserve unrelated work and avoid overlapping runs.
2. Select 1–3 candidates from the current group. Resolve a stable origin/catalog
   identity and distinguish directory, aggregator, connector, mirror and content
   origin. Keep India/global gaps and USA/India public jurisdictions explicit.
3. Review official access/query/reuse documentation. Save a source record even
   when deferred, with the concrete blocker and next useful action. Resolve
   unlinked named leads as well as the linked inventory. Record new discoveries.
4. For a usable route, establish ten different expected items before querying,
   then run the ten real requests and save small outputs. Include representative
   subjects/languages where possible; never invent expected IDs or observations.
   Record content-access evidence separately and preserve item/version rights.
5. Update `goal.json`, `PROGRESS.md`, source state and backlog issues. Run offline
   validation/tests and commit/push only scoped research changes to PR #161.
6. Continue G02–G06, then revisit deferred and scarce areas. Work toward 100
   qualified origins per category/industry where real evidence supports it.
   Document shortfalls rather than padding counts. M2 completes only after every
   known lead has a triage decision; it is not complete merely because links exist.

Do not enable app sources, import a runtime catalog, provision infrastructure,
create paid accounts, contact third parties, bypass challenges or deploy. The
research files carry forward progress between runs; no always-running worker or
external database is needed.
