# MyBookshelf web handoff

**Current free-content direction, 2026-11-03:** the owner requested a simpler
free live implementation with no datastore until a specific need is proven.
Use [the active plan](research/free-content/SIMPLE_LIVE_PLAN.md) / #156 on
`research/free-content-discovery-live` in the existing free-content worktree.
Replace Redis/federated sessions with one live source and signed provider paging;
retain provider cost/access rules. Older Redis release gates below are superseded.
Do not provision storage or change existing account resources/security.

Updated 2026-11-03. Active repository:
**https://github.com/ddk220-light/MyBookshelf-web**, default branch `main`.
The owner has chosen to do all future web work in this repository. Build, test,
plan and implement here directly. Do not depend on the previous private checkout
or copy its Git history/native applications into this repository.

**Current account rollout:** the owner authorized production completion. Source
`7ab9d89` is deployed at `https://mybookshelf.cloud`; account entry remains disabled
while production Resend setup and live release checks are unfinished. Dedicated
production Neon/private deletion storage, migrations, roles and a hosted logical
restore drill are now verified. The active repair branch is
`codex/account-production-health-monitor` (S20-C). The merged signup repair is
PR #151. Read the
[current production record](accounts/PRODUCTION_ROLLOUT.md) before the older dated
release observations below. Project tasks #147–150 stay open until real production
activation and workflow checks pass.

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

The owner authorized the free-content merge/deployment on 2026-11-01. Its
[release record](research/free-content/RELEASE.md) identifies the existing
production project/domain and rollback deployment. PR #110 now targets `main`
and integrates the account production baseline at `7ab9d89`. Actual deployment
and hosted checks are recorded in [#127](https://github.com/ddk220-light/MyBookshelf-web/issues/127).
The release is now merged at `1c16815` and deployed on `mybookshelf.cloud` with
four book sources enabled; live papers remain disabled pending Redis. The owner
then reported irrelevant free-book results and the misleading paper-outage UI.
The fix is on `research/free-content-discovery-relevance` in the same worktree,
tracked by [#154](https://github.com/ddk220-light/MyBookshelf-web/issues/154).
Read [search relevance and verification](research/free-content/SEARCH_RELEVANCE.md).
The following older release observations are historical checkpoints.

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
links. DOAJ, arXiv and OpenAlex adapters, bounded multi-source paging, shared
record caching, source progress and source-only retry are implemented and tested.
The reviewed children’s pilot now has source records; intended hosted enablement is pending.

The pilot now contains three reviewed real English/Hindi/Tamil source records,
with exact current credits, levels and original-story relations. The owner has
accepted free source login; cards and reader actions disclose that requirement.
Post-login reading has not been tested. Source research and curation belong to
Codex; no owner-supplied feed or metadata is pending. See [the source review gate](research/free-content/CHILDREN_REVIEW.md).
Latest UI review: 537 server tests, 141 client tests, 262 broad desktop/mobile
browser journeys, 50 final feature browser checks and 84 board/theme/device
captures pass, with typecheck/build/SEO/deployment. See the [screen comparison](research/free-content/UI_REVIEW.md).
The unchanged importers previously passed 12 Python checks; workflow lint passed.
All-source exact lookups and a 40-result real-paper flow
also passed locally with actual Redis; this is separate from hosted enablement.

Book Dash now adds 30 real English-language editions with original creator roles
and anonymous reading links; see [additional sources](research/free-content/ADDITIONAL_SOURCES.md).
The four local book sources contain 2,942 metadata records in disclosed subsets.

Both client and backend flags default off. Live paper search additionally needs
shared Redis REST credentials and explicit budget configuration; no hosted store
has been provisioned. The local Gutenberg snapshot needs daily refresh because
positive access evidence expires after 24 hours. A reviewed daily refresh workflow
is implemented; it becomes schedulable only when merged onto the default branch.
It proposes a draft metadata PR and runs CI. Production enablement and verification
for the owner's authorized release are tracked in the [release record](research/free-content/RELEASE.md).

## Account work: implemented; staging release exits pending

Deepak approved the document packet and Claude canvas v4 at R02 (`36a1436`),
then authorized progressive story/task implementation. Feature code in
[PR #57](https://github.com/ddk220-light/MyBookshelf-web/pull/57) now includes
email/password, Google/Apple protocol and method management, verified email
change, private library/shelf/history, explicit guest import, identity-isolated
UI, streaming export, durable deletion, independent restore suppression and
bounded maintenance tooling. See [implementation](accounts/IMPLEMENTATION.md),
[validation](accounts/VALIDATION.md) and [operations](accounts/OPERATIONS.md).

Node 22 checks include 514 server tests with actual local Postgres roles and
143 client tests, type checking, production build and zero audit findings.
Browser and hosted evidence are dated in VALIDATION.md; controlled provider/mail
transports do not prove live delivery. Guest/public behavior and exact catalog
identities remain required contracts.

The subsequent [account screen review](accounts/SCREEN_REVIEW.md) fixes form/card
layout, field/focus errors and failed clear/import retries, adds paired artifact
captures, and checks narrow/zoomed layouts in three lights. The owner's phone-type
review sets account headings to 28px with 16px body/input text. Default-size images
and enlarged-text stress images are labelled separately in the gallery.

Isolated staging uses `mybookshelf-accounts-staging` in iad1, Neon and a separate
private deletion ledger. Real staging migration checksums 001–011 match the repo;
private ledger writes/reads/encrypted cleanup and anonymous-read denial pass.
Runtime credentials are Preview/account-settings only, administrator Development
only. Existing production resources/Git connection remain unchanged.

## Resume this free-content branch

1. Use `/workspace/MyBookshelf-web-free-sources-implementation` on
   `research/free-content-discovery-relevance`, based on released main `1c16815`.
   [PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110) is merged.
   Preserve other worktrees and use #154 for the relevance/disabled-state repair.
2. Read [implementation/story state](research/free-content/IMPLEMENTATION.md),
   [operations](research/free-content/OPERATIONS.md) and
   [validation](research/free-content/VALIDATION.md). Existing native tasks belong
   to [project 4](https://github.com/users/ddk220-light/projects/4) / index #73.
3. The owner postponed hosted Redis configuration. The existing OpenAlex key is
   present and accepted. Free source login is explicitly allowed; do not ask the
   owner to curate the children’s records. See #139 and the current source evidence.
4. Complete the remaining FCD07 hosted checks when Redis is configured; local
   book catalogs and the reviewed children’s set remain independent of Redis.
   Keep the bounded Gutenberg subset/OTL export coverage explicit. Account work
   has its own branch/project; its historical planning section above is context.

## Account release context
The owner subsequently instructed: Resend only for production; keep Google/Apple
disabled and add their credentials later. These are deliberate activation deferrals,
not current staging setup requests. Live staging capabilities confirm all three
methods remain disabled. The GitHub workflow is an optional staging scheduler;
its Actions-secret HTTP 403 does not require a permission change to finish coding.
See [current rollout choices](accounts/OPERATIONS.md#owners-current-rollout-choices).
Production still needs real mail, active cleanup/alerts, hosted backup/restore,
retention proof and final accessibility/operator/R03 review before account enablement.
Provider-specific live checks apply before those methods are enabled later.

Worktree: `/workspace/worktrees/MyBookshelf-web-account-settings`, branch
`account-settings`. The existing
[project](https://github.com/users/ddk220-light/projects/3) tracks epics, stories,
progressively linked tasks and remaining validation.

## This handoff's verification

The public repo matched the latest reviewed web export. An additional startup
audit found and fixed its missing local environment loader; a real-server smoke
test now runs with the standard suite. Fresh Node 22 install, client type check,
120 client tests, 485 server tests, production build, SEO/deployment checks,
documentation/reference link checks and secret scan passed. No browser UI code
changed in this handoff. See [the audit](development/2026-10-31-repository-handoff.md).
