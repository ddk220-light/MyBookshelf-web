# MyBookshelf web documentation

Read [STATUS.md](STATUS.md) first when resuming work in a new chat.
This repository contains the current web code, tests, runtime inputs, CI,
deployment configuration and the recent work analysis. Native app source,
retired authentication and unrelated research archives are outside its scope.

## Production-ready checks (2026-11-18, start here for current work)

- [Backlog and analysis path](plans/2026-11-18-production-ready-backlog.md):
  the goal (analysis first, then a design plan, then the fixes), what was found
  in production on 18 November, the backlog in working order, open questions
  for the owner, and how to start the end-to-end run on the owner's Mac with
  both phones. Nothing in the app changes until the plan is agreed.
- [Root causes, design and implementation plan](plans/2026-11-production-ready-design.md):
  why each problem happens, three releases (make the core work; account and
  settings; pages and policy), the wording for every library answer, and the
  decisions left for the owner. For the agent that makes the changes.
- [Implementation progress](plans/2026-11-production-ready-progress.md#local-integration):
  the local integration branch, the four source branches, verification, and
  the release steps. [Worker brief](plans/2026-11-production-ready-worker-brief.md).
- [Screens](design/2026-11-production-ready/README.md): 20 mock-ups (library
  answer in words, choosing a library, settings and account, desktop).
- [The end-to-end run](research/2026-11-production-ready/README.md) and its
  [root-cause notes](research/2026-11-production-ready/root-causes/).
- [End-to-end run as a guest reader](research/2026-11-production-ready/README.md)
  (18 November): Pixel, iPhone and desktop walked at once; the library answers
  and times seen, findings ranked by severity and tied to backlog items, and
  the three device reports with their timings. Account flows are still to do.

## One-shelf redesign (2026-11-12, the current app)

- [Implementation plan](plans/2026-11-12-one-shelf-redesign-implementation-plan.md):
  owner decisions, target architecture, catalog lookup layer, catalog store and
  anonymous log, privacy model, phases 0–13, redirects, testing and release,
  open questions and backlog. Phases 0–12 are built; phase 13 is the release.
- [Approved screens](design/2026-11-one-shelf/README.md): the HTML boards
  (`canvas.json` lists them) and how the owner decisions override them.
- [Policy texts](policy/): `privacy.md`, `terms.md` and `about.md`, rendered
  in the app at `/app/privacy`, `/app/terms` and `/app/about`. The effective
  date and version are filled at release; legal review is a release item.

## Adoption readiness review (2026-11-11)

- [Product, infrastructure and adoption review](plans/2026-11-11-adoption-readiness-review.md):
  what is broken today, search and library-picking findings, the librarian's
  first impression, library data readiness with a pilot shortlist, public-page
  scaling, free sources, backend/operations and localization. Planning
  material; each fix is tracked in its own change.

## Accounts: implementation and release evidence

- [Current production rollout](accounts/PRODUCTION_ROLLOUT.md): actual resources,
  signup repairs, hosted restore evidence and remaining live activation checks.
- [Account review packet](accounts/README.md): PRD, UX, engineering, test strategy,
  UI specification, delivery tasks and Claude handoff. R01/R02 are approved;
  R03 gates production release.
- [Implemented account features](accounts/IMPLEMENTATION.md),
  [validation and remaining exits](accounts/VALIDATION.md), and
  [operations/restore runbook](accounts/OPERATIONS.md).
- [Architecture and data structure](plans/2026-10-31-accounts-social-foundation.md):
  open-source auth options, Better Auth/Postgres recommendation, private reading
  data, account lifecycle, existing book identities and security boundaries.
- [Delivery backlog](plans/2026-10-31-accounts-delivery-backlog.md): the published
  project, five definition tasks, owner review gates, seven epics, 21 account
  implementation stories, a Claude-created UI-artifact story after document review, early
  prerequisites and final validation. Seven social discovery
  stories remain outside the account release.
- [Work-aware search](work-aware-search.md): how the current code already uses
  Open Library works, editions, ISBNs and catalog records; limits of grouping.

## Free ebooks and scientific papers: implementation

- [Overview and source categories](research/free-content/README.md).
- [Repository catalog, APIs and access requirements](research/free-content/source-catalog.md).
- [Metadata discovery architecture and delivery phases](research/free-content/architecture.md).
- [Historical API observations and recovery limits](research/free-content/evidence.json).
- [UI boards and implementation handoff](design/2026-11-free-content/README.md):
  approved free-reading screens, owner decisions and acceptance checklist.

Implementation is in PR #110 on `research/free-content-discovery-implementation`;
source flags still default off. See [implementation](research/free-content/IMPLEMENTATION.md),
[screen comparison and visual fixes](research/free-content/UI_REVIEW.md),
[children’s review](research/free-content/CHILDREN_REVIEW.md) and
[additional sources](research/free-content/ADDITIONAL_SOURCES.md). The original unpushed
research was reconstructed from its conversation after an environment replacement;
the overview records the provenance and evidence limits.

## UI, designs and SEO

- [Approved UI/SEO implementation plan](seo/IMPLEMENTATION_PLAN.md).
- [Library shelves and book pages](seo/LIBRARY_SHELVES.md): the checker script, pacing, how to add libraries.
- [Screen review](seo/SCREEN_REVIEW.md): desktop/mobile changes and accuracy limits.
- [Validation and launch state](seo/VALIDATION.md): tested commits, preview,
  CI, remaining production/SEO actions and live catalog limitations.
- [Claude reference package](design/2026-10-mobile/README.md) and
  [131 HTML reference boards](design/2026-10-mobile/index.html).
- Archived proposals: [SEO](seo/SEO_PLAN.md), [About copy](seo/ABOUT_TEMPLATE.md),
  [UI review](design/2026-10-mobile/UI_REVIEW.md),
  [desktop plan](design/2026-10-mobile/DESKTOP_PLAN.md),
  [backend concerns](design/2026-10-mobile/BACKEND_ISSUES.md).
  Approved decisions take precedence where these differ.
- [Evidence notes and preview captures](seo/evidence/README.md),
  [layout matrix](seo/layout-checks.json), [deployment crawl](seo/deployed-checks.json)
  and [live catalog observations](seo/live-checks.json).

## Development and handoff

- [Indian library hardening](research/india-library-hardening/README.md): frozen
  size-led 50-library cohort, live book-query evidence, provider fixes, wider
  coverage, and reproducible validation tools.
- [How Indian library access was unlocked](research/india-library-hardening/UNLOCKS.md):
  library-by-library blockers, fixes and measured recoveries on
  `hardening-indian-libraries`.
- [Indian library status tracker](research/india-library-status/README.md):
  generated status, reason and revisit date for every Indian directory entry;
  [15 November host recheck](research/india-library-hardening/recheck-20261115.md).
- [Credential setup and verified Projects MCP access](development/credentials.md).
- [Repository completeness audit](development/2026-10-31-repository-handoff.md).
- [Root README](../README.md), [agent instructions](../AGENTS.md),
  [contributions](../CONTRIBUTING.md), [security](../SECURITY.md),
  [licence](../LICENSE) and [third-party notices](../NOTICE).
