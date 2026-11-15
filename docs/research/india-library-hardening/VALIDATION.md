# Validation and handoff

Validation date: 15 November 2026 UTC. Runtime changes are committed as
`f29eeda` on `harden-india-top50-2026-11-14`, based on
`61a3e505bb1f554b5e924752089f49c104068936`.

The work is also carried on `hardening-indian-libraries`, created from evidence
commit `d3ac08a`. Its additional change documents
[how access was unlocked](UNLOCKS.md); runtime code and historical evidence are
unchanged from the validated implementation.

## Automated checks

- `npm test --workspace=server`: **838 tests, 814 passed, 24 skipped, zero
  failures**. The skips require disposable account/catalog databases that were
  not configured locally. The existing GitHub workflow supplies those databases.
- `node --test tools/catalog-hardening/*.test.mjs`: **13 passed**. These check
  complete-attempt evidence, identity contradictions, distinct records/titles,
  material exclusions, deferred hosts, and stopping a live probe after refusal.
- Independent alternate-route review: **85 focused tests passed**. The review
  found and verified fixes for metadata budgets, strict record health, and
  attribution when two catalogs return positive answers.
- LIBMAN provider regressions: **18 passed**, covering observed whitespace,
  punctuation and entity-decoding defects and conservative Unicode handling.
- The Darshan fixture's trailing whitespace was cleaned after the full suite;
  its academic provider suite passed again. No runtime code changed afterward.

The changes are server adapters, lookup execution, directory corrections and
audit tooling. No UI or browser journey was changed. Local browser checks and
production deployment checks were not run; no release is part of this task.

## Live evidence and independent review

[RESULTS.md](RESULTS.md), [coverage.csv](coverage.csv) and
[summary.json](summary.json) are generated from the preserved source results.
The summary accepts one complete query/resolution/live-answer attempt; it
cannot assemble a pass from unrelated partial attempts. An independent review
checked every included result family, retry identity, route separation,
attempted denominator, and explicit material exclusions.

The live runs began from the base commit while adapter fixes were being made,
so their recorded `commit` fields often name that base. Per-run timestamps,
provider hashes where available, before/after attempts, and focused final
runtime checks preserve the actual chronology. They must not be described as
an unchanged production deployment or a uniform before/after experiment.

IndCat's counted records were independently reparsed from captured title-query
POSTs and holding pages, including exact selected-institution ownership. The
public audit files retain hashes and bibliographic evidence; raw HTML and form
state stay outside Git. Reproduction requires a new live run for fresh captures.

## Remaining limits and maintenance

- National Science Library and IIT Madras remain unverified because their
  public endpoints could not be reached from this execution environment.
  NSL's hostname is corrected and its directory health is unknown. The frozen
  cohort retains both failures; reserves are named separately.
- Collection sizes mix published book/volume counts and clearly labeled IndCat
  contribution proxies. This is not a definitive national size ranking.
- A book listed in an institution's catalog does not guarantee a borrowable
  copy. Reference-only holdings, unknown copy status, ISBN gaps and unknown
  material types remain visible in the evidence.
- One-book wider checks are coverage observations, not ten-book certification,
  a recall estimate, or an estimate of how many connections were newly fixed.
  Directory branches and duplicate institutions are not a unique-library census.
- KALNET's temporary robots-endpoint failure prevented verification of its
  preferred search route. Actual app wrappers for Kerala and Mahatma Gandhi
  successfully fell back to their connected IndCat routes.

To update the report, use a documented manifest with one queue per shared host,
preserve failures and explicit exclusions, then regenerate the summary. A
clean empty seed query remains unconfirmed coverage. A refusal stops further
requests to that shared host; do not retry through another access path.

The branch name is excluded by the existing Vercel `git.deploymentEnabled`
rule (`*` false; only `main` and `staging` true). The GitHub workflow performs
checks without a deployment step. Do not merge this branch as part of this
audit; merging into a release branch would change that behavior.
