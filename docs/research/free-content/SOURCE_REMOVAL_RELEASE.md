# Remove sources that missed the 20-result target — 7 November 2026

The owner requested removal after the production depth audit. Eight sources
failed the default search criterion: Project Gutenberg, Open Textbook Library,
Book Dash, StoryWeaver, OpenStax, mediastudies.press, CORE and Sugamya Pustakalaya.
The first three required an opt-in access checkbox to reach 20; they are included
in this removal. Met Museum and LibriVox stay connected because the audit found
queries that returned 20+ distinct records. Their recorded limitations remain in
[audit PR #184](https://github.com/ddk220-light/MyBookshelf-web/pull/184).

The shared retirement list removes those eight from the public source directory
and client source picker, including cached responses that still list them. Public
search rejects explicit retired IDs, old cursors, access-toggle overrides and
implicit legacy book/pilot discovery before provider dispatch. Exact record
resolution remains available for existing saved books; historical catalog files,
reading conditions and research evidence are preserved. The optional free-edition
lookup returns no retired offers.

The four local book catalogs are now all retired. Their Free to read browse tab
is removed, and old browse/bookmark routes redirect to All knowledge with the
query preserved and retired source filters cleared. A disabled paper search also
leads to connected knowledge search. No new source, account or datastore is added.
The existing research automations remain paused.

Verification before release:

- 594 server tests passed, with 15 disposable-database tests skipped locally.
- 187 client tests and client type checking passed.
- Production client build and SEO checks passed.
- 58 targeted desktop/mobile Chromium browser journeys passed, covering retired
  options, old route redirects, existing paper searches, paging, accessibility,
  three reading lights, and saved-story compatibility. Obsolete retired-discovery
  journeys were replaced with removal checks; saved-reader regressions remain.
- The new directory test asserts 31 enabled sources and verifies all eight are
  absent. Removal guards also reject requests before any provider/cache dispatch.

Mobile screenshots are in `evidence/2026-11-07-source-removal/`.
Production commit, deployment identity and hosted verification will be recorded
after release. Existing account configuration is unchanged.
