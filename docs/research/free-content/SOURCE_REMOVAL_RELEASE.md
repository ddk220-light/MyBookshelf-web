# Remove sources that missed the 20-result target — 7 November 2026

The owner requested removal after the production depth audit. Five sources failed the target even with the access-checkbox diagnostics:
StoryWeaver, OpenStax, mediastudies.press, CORE and Sugamya Pustakalaya.
Project Gutenberg, Open Textbook Library and Book Dash remain available because
they returned 24 records with the existing unclear-access checkbox enabled. Met Museum and LibriVox stay connected because the audit found
queries that returned 20+ distinct records. Their recorded limitations remain in
[audit PR #184](https://github.com/ddk220-light/MyBookshelf-web/pull/184).

The shared retirement list removes those five from the public source directory
and client source picker, including cached responses that still list them. Public
search rejects explicit retired IDs, old cursors, access-toggle overrides and
legacy pilot discovery before provider dispatch. Exact record
resolution remains available for existing saved books; historical catalog files,
reading conditions and research evidence are preserved. Legacy book search and optional free-edition lookup continue with the remaining
three local catalogs, excluding retired StoryWeaver records.

The retired children's pilot card is removed and its old browse routes redirect
to All knowledge with the query preserved. The Free to read tab and the other
local catalogs remain available. Retired All knowledge source bookmarks clear
the removed filter and offer remaining connected sources. No new source, account or datastore is added.
The existing research automations remain paused.

Verification before release:

- 594 server tests passed, with 15 disposable-database tests skipped locally.
- 187 client tests and client type checking passed.
- Production client build and SEO checks passed.
- 66 targeted desktop/mobile Chromium browser journeys passed, covering retired
  options, old route redirects, existing paper searches, paging, accessibility,
  three reading lights, and saved-story compatibility. Obsolete retired-discovery
  journeys were replaced with removal checks; saved-reader regressions remain.
- The new directory test asserts 34 enabled sources and verifies all five are
  absent. Removal guards also reject requests before any provider/cache dispatch.

Mobile screenshots are in `evidence/2026-11-07-source-removal/`.

## Verified production release

PR [#185](https://github.com/ddk220-light/MyBookshelf-web/pull/185) merged at
`c801088fae01443dcbe6e29f81b273ad23c1568c`. Vercel production deployment
`dpl_4VSELLwipf6YMPAZRJNGikJ1UHrw` is READY and serves that exact commit at
<https://mybookshelf.cloud>.

Both complete CI runs passed: [push](https://github.com/ddk220-light/MyBookshelf-web/actions/runs/42320479988)
and [PR](https://github.com/ddk220-light/MyBookshelf-web/actions/runs/42320486053).
Hosted anonymous verification confirms:

- 34 enabled sources; all five retired IDs are absent from the directory.
- All five search requests return `CONTENT_DISABLED`, including access opt-in.
  Retired pilot and old-cursor requests are also blocked.
- Optional edition lookup returns no retired offers. A saved OpenStax Calculus
  record still resolves with its original key and title.
- NASA search continues to return 24 distinct records through pagination.
- Actual mobile Chromium shows 34 connected sources and none of the retired
  options. The remaining free-book browse links are present, the children's pilot
  link is absent, and old retired routes redirect while preserving the query.
  No browser page errors or horizontal overflow were observed.
- The deployment-scoped error/fatal log scan returned no entries during checks.

`production-api.json`, `production-browser.json` and `production-mobile.png`
record these checks. Browser origin responses used the configured proxy/CA trust
with TLS verification enabled. Existing accounts, saved shelves and research
schedules were not modified.
