# MyBookshelf web documentation

Read [STATUS.md](STATUS.md) first when resuming work in a new chat.
This repository contains the current web code, tests, runtime inputs, CI,
deployment configuration and the recent work analysis. Native app source,
retired authentication and unrelated research archives are outside its scope.

## Accounts and social reading: next planned work

- [Architecture and data structure](plans/2026-10-31-accounts-social-foundation.md):
  open-source auth options, Better Auth/Postgres recommendation, private reading
  data, account lifecycle, existing book identities and security boundaries.
- [Delivery backlog](plans/2026-10-31-accounts-delivery-backlog.md): the five initial
  definition tasks, seven epics, twenty account stories and seven future
  discovery stories. Only the GitHub index issue exists so far.
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
[children’s review](research/free-content/CHILDREN_REVIEW.md) and
[additional sources](research/free-content/ADDITIONAL_SOURCES.md). The original unpushed
research was reconstructed from its conversation after an environment replacement;
the overview records the provenance and evidence limits.

## UI, designs and SEO

- [Approved UI/SEO implementation plan](seo/IMPLEMENTATION_PLAN.md).
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

- [Credential setup and current Projects blocker](development/credentials.md).
- [Repository completeness audit](development/2026-10-31-repository-handoff.md).
- [Root README](../README.md), [agent instructions](../AGENTS.md),
  [contributions](../CONTRIBUTING.md), [security](../SECURITY.md),
  [licence](../LICENSE) and [third-party notices](../NOTICE).
