# MyBookshelf web handoff

Updated 2026-11-01. Active repository:
**https://github.com/ddk220-light/MyBookshelf-web**, default branch `main`.
The owner has chosen to do all future web work in this repository. Build, test,
plan and implement here directly. Do not depend on the previous private checkout
or copy its Git history/native applications into this repository.

## What is implemented

The anonymous React/Vite app and Express catalog API, work/edition discovery,
browser-saved shelves, library selection, desktop/mobile reading layouts,
three reading lights, static public pages and SEO metadata are present.
App routes live under `/app/` and are noindex. Failed catalog requests mean
unknown; cached availability has last-result context and refreshes on book open.

The initial public guides are Anna Centenary, Visakhapatnam, Aliah University,
IIT Bhubaneswar, Alameda County, San Mateo County, San Francisco, Santa Clara
County and Setagaya City. This is **SEO publication only**: other libraries stay
searchable/selectable inside the app. `shared/seo-libraries.json` is the gate.
There are sixteen indexable public URLs. Unpublished guide paths return 404.

Code licence is AGPL-3.0-only. Original directory contributions use CC BY 4.0;
third-party material keeps its own terms. About identifies Deepak Ravikumar,
Product Manager, using the public contact details already supplied by the owner.

The UI follows Claude's reference layouts, with product decisions reconciled in
[seo/IMPLEMENTATION_PLAN.md](seo/IMPLEMENTATION_PLAN.md). No numerical 99% pixel
match has been demonstrated. [The screen review](seo/SCREEN_REVIEW.md) explains
the intentional differences and [the reference boards](design/2026-10-mobile/index.html)
are available here without the private branch.

## Release state: recheck before changing production

- Reviewed preview: https://mybookshelf-jh0o69edr-ddk220.vercel.app/,
  deployment `dpl_4WuSysFWU4wQhHqNhEGksvU7W9FA`, application commit
  `02aa0d6d7673c449d1b138b38c64053b0d7bc29c`.
- Public baseline `83b481d22a72525048051702ac562695299435d8` adds a test-fixture
  ordering fix. Its CI run succeeded:
  https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41180235295.
- Last release verification recorded a passing client suite, 484 server tests,
  318 browser scenarios and 168 layout captures. See
  [seo/VALIDATION.md](seo/VALIDATION.md) and its evidence; these are dated results,
  not a claim that a future commit has been tested.
- Vercel project `mybookshelf` was checked again during this handoff. It still
  connects to the original `MyBookshelf` repository, production branch `main`.
  Production is `dpl_G6GaQUUqD7q6w7s8BcmX5n3EyHBd` at the time of checking.
  Moving development here does not switch that deployment connection.
- Remaining launch actions: verify a fresh public-repo preview, reconnect the
  existing Vercel project to this repo when releasing, retain domains and server
  credentials, verify production URLs/headers/source commit, recheck catalog
  connections, and complete Search Console/Bing ownership and sitemap submission.
  Repository protection and vulnerability-reporting settings also need owner
  administration. Keep the previous production deployment as the rollback target.

## Account work: R02 approved; foundation implementation active

Deepak approved all checked-in artifacts at `36a1436` on 2026-11-01 and
instructed progressive story-task publication and implementation. R01 and R02
are complete; Claude’s canvas version 4 is the approved visual reference.
R03 still gates production release. The earlier wait-for-artifact and
publish-all-children-before-R02 instructions are superseded.

The [implementation record](accounts/IMPLEMENTATION.md) contains the exact current
scope, actual tests, staging resource IDs and task links. The foundation now has
pinned Better Auth/native Postgres, shared lazy application composition,
transactional migrations, separate runtime roles, forced RLS, active-identity
provisioning and a narrow private session facade. App facades now cover signup/verification, password/session lifecycle and
private library/shelf/history APIs, backed by 504 passing server tests at this
checkpoint. Account entry/import and initial settings UI are implemented with memory-only
account repositories and explicit guest continuation on uncertain identity.
The current checkpoint has 131 client tests and twelve real local Chromium
account journeys across desktop/mobile and three lights, including axe checks.
Weaker raw auth routes remain gated. Verified email change is now implemented; social methods and export/
deletion are still being implemented; this is not a release-ready candidate.

An isolated staging Neon DB, private export/ledger stores and Vercel project
exist in iad1. Real staging migrations/roles were verified and secrets configured
in hosting. Production resources were not created. The current production site
remains on its existing Git connection; staging uses the canonical MyBookshelf-web
repository. See the runbook at `tools/accounts/README.md`.

Continue with S08–10 providers and S15 export/deletion;
expand subsequent tasks as reached. Real mail, Google/Apple, hosted journeys, restore/deletion and final
accessibility evidence remain required. Parent stories stay open until complete.
Preserve private data, exact book identities, guest browsing and all three lights.

Worktree: `/workspace/worktrees/MyBookshelf-web-account-settings`, branch
`account-settings`. Existing [project](https://github.com/users/ddk220-light/projects/3)
and [PR #57](https://github.com/ddk220-light/MyBookshelf-web/pull/57) track this work.

## This handoff's verification

The public repo matched the latest reviewed web export. An additional startup
audit found and fixed its missing local environment loader; a real-server smoke
test now runs with the standard suite. Fresh Node 22 install, client type check,
120 client tests, 485 server tests, production build, SEO/deployment checks,
documentation/reference link checks and secret scan passed. No browser UI code
changed in this handoff. See [the audit](development/2026-10-31-repository-handoff.md).
