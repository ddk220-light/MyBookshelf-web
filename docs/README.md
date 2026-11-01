# MyBookshelf web documentation

Read [STATUS.md](STATUS.md) first when resuming work in a new chat.
This repository contains the current web code, tests, runtime inputs, CI,
deployment configuration and the recent work analysis. Native app source,
retired authentication and unrelated research archives are outside its scope.

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

- [Credential setup and verified Projects MCP access](development/credentials.md).
- [Repository completeness audit](development/2026-10-31-repository-handoff.md).
- [Root README](../README.md), [agent instructions](../AGENTS.md),
  [contributions](../CONTRIBUTING.md), [security](../SECURITY.md),
  [licence](../LICENSE) and [third-party notices](../NOTICE).
