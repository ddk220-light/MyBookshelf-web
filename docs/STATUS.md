# MyBookshelf web handoff

Updated 2026-11-01 for free-content implementation. Active repository:
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

## Free-content discovery: implementation in progress

The [source research](research/free-content/README.md) covers free ebooks,
scientific papers, textbooks, children's books and related collections. It
defines metadata imports plus bounded live API search, with reading links to
original hosts. This chat is exclusively for the free-content feature; account
work belongs to its separate branch and project.

Branch `research/free-content-discovery` was recreated on this repository after
the previous environment's unpushed commit `ee7d88e` could not be recovered.
The documents and historical probe outcomes were reconstructed from the retained
conversation; the original raw responses and complete fetch ledger are unavailable.
The research overview records these limits. Future work continues here directly.

UI artifacts and implementation are approved (2026-11-01):
[boards and implementation handoff](design/2026-11-free-content/README.md), with
the owner's nine decisions. Worktree: `/workspace/MyBookshelf-web-free-sources-implementation`;
branch: `research/free-content-discovery-implementation`, based on approved
artifact commit `760863a`. Track [project 4](https://github.com/users/ddk220-light/projects/4)
and [index #73](https://github.com/ddk220-light/MyBookshelf-web/issues/73).

Implemented: source-native identity/access contracts, bounded official Gutenberg
metadata import and local search/resolve, Europe PMC adapter and atomic shared
Redis coordination, search scopes, content reader pages and browser shelf v2
migration. The optional library bridge requires exact ISBN/work evidence.
See [implementation decisions and story state](research/free-content/IMPLEMENTATION.md)
and [validation](research/free-content/VALIDATION.md). Open Textbook Library is
implemented with 1,909 real metadata records, combined catalog search and ISBN
links. Other paper sources and the children's pilot are pending.

Both client and backend flags default off. Live paper search additionally needs
shared Redis REST credentials and explicit budget configuration; no hosted store
has been provisioned. The local Gutenberg snapshot needs daily refresh because
positive access evidence expires after 24 hours. No deployment or production
enablement has been performed.

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

For this branch, continue the free-content stories in
[IMPLEMENTATION.md](research/free-content/IMPLEMENTATION.md), creating native
tasks as each story is reached. The account instructions below are historical
handoff context for another branch; they do not apply to this task.

1. Read this handoff, the foundation analysis and
   [the delivery backlog](plans/2026-10-31-accounts-delivery-backlog.md).
2. Verify the newly configured GitHub Projects credential in the new environment,
   using [the credential notes](development/credentials.md). Do not expose its value.
3. Continue from the existing [GitHub planning index issue #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1).
   The native GitHub Project and child issues have **not** been created. Create
   them from the checked-in backlog once access works, linking epics/stories and
   marking future expansion as needing requirements. Avoid duplicate index issues.
4. Start with the five requested tasks: PRD, UX design, engineering implementation
   plan, UI implementation plan, then detailed task decomposition for each story.
   This handoff preserves the outline; it does not mark those deliverables done.

The prior chat paused backlog publication to resolve credentials. Its existing
integration could access the repository and create issues, but Projects requests
failed with `Resource not accessible by integration`. The newly added secret did
not appear in that task's running secret bindings. This is a task/configuration
observation, not proof that the saved environment was configured incorrectly.

## This handoff's verification

The public repo matched the latest reviewed web export. An additional startup
audit found and fixed its missing local environment loader; a real-server smoke
test now runs with the standard suite. Fresh Node 22 install, client type check,
120 client tests, 485 server tests, production build, SEO/deployment checks,
documentation/reference link checks and secret scan passed. No browser UI code
changed in this handoff. See [the audit](development/2026-10-31-repository-handoff.md).
