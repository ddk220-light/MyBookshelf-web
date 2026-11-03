# Free-content production release

**Current revision (2026-11-03):** the owner authorized the
[simple free live plan](SIMPLE_LIVE_PLAN.md), #156. Release/hosted verification is
tracked in #159. Europe PMC/OpenAlex can run directly with no data store; the
blanket Redis gate is superseded. This release must retain verified free-budget
guards and existing account settings. The November 1 evidence below records the
initial book release, rather than the current paper prerequisites.

The owner authorized merging the free-content implementation with production
`main` and deploying it on 2026-11-01 (America/Los_Angeles). The release uses
[PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110), retargeted to
`main`. [Task #127](https://github.com/ddk220-light/MyBookshelf-web/issues/127)
records the actual deployment ID, source SHA, hosted verification and remaining
paper-source gates.

## Target and rollback

- Existing Vercel project `mybookshelf`, ID
  `prj_AhxvPVIgw95iofXaWigVNSYF30iP`, team `ddk220`.
- Canonical production origin: `https://mybookshelf.cloud`.
- Pre-release production: `dpl_4wkbMbk2ArfwkD9fU1j3FnCyfHNf`, source
  `7ab9d8967e17265c87b8c7e490fd50a295dba598` from `MyBookshelf-web`.
- Retain that deployment as the rollback target. The persistent Git connection
  still belongs to the older repository; use the explicit public-repository
  source reference when creating deployments. Do not change account settings,
  production databases, provider activation or maintenance credentials.

## Merge compatibility

The candidate integrates the current account production code without changing
its private API/schema. Anonymous library-book and source-content saves use the
same cross-tab storage lock and mixed 100-item cap. Clearing the browser shelf
retains viewed history. Content detail awaits save/remove confirmation.

Account imports serialize the existing v1 library-book wire format. Browser v2
source-native references remain local and survive acknowledged import cleanup,
including concurrent additions. The import screen discloses this. Account
reading state does not borrow guest content or write private data into browser
storage. Free-content saving is available in browser-only mode; it is explicitly
unavailable on an account shelf until a separately implemented content-sync
contract exists. Search and outbound reading remain public.

Both account and content suites remain in CI. The build uses the existing
dependency-free shared security-policy module and preserves production routing,
maintenance scheduling and cookie boundaries.

## Enablement

Enable `CONTENT_DISCOVERY_ENABLED`, `CONTENT_CHILDREN_ENABLED`,
`VITE_CONTENT_DISCOVERY_ENABLED` and `VITE_CHILDREN_PILOT_ENABLED` for the checked
preview/production build, with separate strong server-only cursor signing secrets.
This publishes Gutenberg, Open Textbook Library, Book Dash and the reviewed
StoryWeaver set. Source-account requirements remain visible.

All four live paper flags remain off while the owner postpones shared Redis.
No paid resource provisioning, account activation or production schema migration
is part of this release. Book discovery does not require Redis. Positive access
evidence still expires after 24 hours; retain the reviewed daily-refresh workflow
and verify its first default-branch execution. Never advance timestamps manually.

## Verification before merge

- Typecheck and 174 client tests pass, including v2 → v1 account-import
  serialization and preservation of source-native browser references.
- 567 server tests pass with real disposable Postgres/Redis and zero skips.
- 259 broad desktop/mobile browser checks passed initially; three assertions
  needed to await the new asynchronous storage confirmation. All 50 focused
  free-content journeys then passed after that correction.
- Ten real account browser journeys pass on the disposable local API/Postgres.
- Production build, isolated client-only build, SEO and deployment checks pass.
- Exact merged-head CI, hosted book search/detail/save/reload, public routes,
  source-account labels, disabled-paper behavior and production source/aliases
  are recorded in #127 when verified. Local checks do not establish deployment.
