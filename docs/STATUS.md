# MyBookshelf web handoff

Updated 2026-10-31. Active repository:
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

## Account work: architecture chosen, implementation not started

The owner requested secure signup with name/email/password, verification,
sign-in, password recovery, sign-out, Google and Apple, and synchronization of
library preference, saved books and viewed books. Anonymous use should continue.

Direction: Better Auth in the existing Express API, managed Postgres (Neon is
preferred), transactional email, secure server sessions and private owner-scoped
reading data. The architecture is in
[the foundation analysis](plans/2026-10-31-accounts-social-foundation.md).
PRD/UX/engineering/UI specifications must settle the remaining implementation
choices before schema and API work begins. No database, OAuth client, mail service,
account UI or account persistence has been provisioned/implemented by this work.

Book identities reuse Open Library work/edition IDs, normalized ISBNs and existing
catalog keys. A small `book_refs` store supports relationships; do not build a
new universal catalog or fuzzy work-matching engine. Unresolved references remain
saveable. See [existing discovery behavior](work-aware-search.md).

Reviews, comments, follows, favorites, reading statuses, lists and activity are
future discovery scope. **They still need requirements and definitions**, including
privacy, moderation, work identity, deletion and acceptance criteria.

## Resume in this order

1. Read this handoff, the foundation analysis and
   [delivery backlog](plans/2026-10-31-accounts-delivery-backlog.md).
2. Open the [Account Management project](https://github.com/users/ddk220-light/projects/3)
   and [planning index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1).
   The native board and 54 child issues now exist. Reuse them.
3. Start [D01: write the PRD](https://github.com/ddk220-light/MyBookshelf-web/issues/2).
   [R01 / #7](https://github.com/ddk220-light/MyBookshelf-web/issues/7) records the
   owner's PRD review. D02–D05 then produce UX, engineering/test, UI and detailed
   delivery specifications. Their artifacts have not yet been written.
4. Present the concrete versioned packet for
   [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8). Implementation
   and provisioning wait for explicit owner approval. No approval is recorded yet.
5. Build with focused tests, then complete final T01–T06 validation and operations
   readiness. [R03 / #9](https://github.com/ddk220-light/MyBookshelf-web/issues/9)
   reviews the tested release before L01 production rollout.

GitHub Projects access now works through the official Projects MCP service using
the configured `GH_PROJECT_TOKEN` binding at `api.githubcopilot.com`. The earlier
integration-credential failure is historical; see the updated
[credential notes](development/credentials.md). Project creation did not provision
account services or implement features. Social discovery remains future scope.

The working branch is `account-settings`, with worktree
`/workspace/worktrees/MyBookshelf-web-account-settings` in this environment.

## Account project publication verification

Verified 55 unique project items, including the existing roadmap, with all items
at Todo. The 54 new issues have kind/stage labels and native parents; 111 explicit
blocked-by links encode the plan. Owner-review, core-sync, final-validation and
rollout dependency sets were read back and checked. The project has an All work
table plus six focused views, with labels, parent issues and sub-issue progress
visible. All account implementation paths reach R02; rollout reaches R03.

Documentation links, dependency acyclicity and whitespace checks passed. This was
planning publication only; application tests were not rerun and no account
feature or design deliverable is marked complete.

## This handoff's verification

The public repo matched the latest reviewed web export. An additional startup
audit found and fixed its missing local environment loader; a real-server smoke
test now runs with the standard suite. Fresh Node 22 install, client type check,
120 client tests, 485 server tests, production build, SEO/deployment checks,
documentation/reference link checks and secret scan passed. No browser UI code
changed in this handoff. See [the audit](development/2026-10-31-repository-handoff.md).
