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
Production commit, deployment identity and hosted verification will be recorded
after release. Existing account configuration is unchanged.
