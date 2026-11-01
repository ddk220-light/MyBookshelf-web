# Production code release — 2026-11-01

The owner instructed **“Push to prod if your checks are clean”** after the UI
review and passing checks. That instruction and exact candidate evidence are
recorded on [R03 #9](https://github.com/ddk220-light/MyBookshelf-web/issues/9).
[PR #57](https://github.com/ddk220-light/MyBookshelf-web/pull/57) is merged.
**The tested source is deployed. Production account signup is not enabled.**

| Item | Verified value |
| --- | --- |
| Public URL | https://mybookshelf.cloud |
| Additional production domain | https://mybookshelf-beta.vercel.app |
| Vercel team/project | `team_mR8QSDMoZBHmT4pjGPuy3KCB` / `prj_AhxvPVIgw95iofXaWigVNSYF30iP` (`mybookshelf`) |
| Production deployment | `dpl_4FX4UbnpVFZKzaQRx6GZYgKCKaeG`, READY, iad1, Node 22 |
| Deployment URL | https://mybookshelf-8c0bnch13-ddk220.vercel.app |
| Deployed commit | `c17a75771c85e030666ec859040592a162df51b9` |
| Tested candidate | `41c8340dacde44b6424a716fa88a02c5ccf0f74b` |
| Source equivalence | Merge and tested candidate have identical tree `3b742d9beff8b1a94946a79b9d0acb669709afa9` |
| Passing candidate CI | https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41318085236 |
| Rollback deployment | `dpl_G6GaQUUqD7q6w7s8BcmX5n3EyHBd`, prior READY production deployment |
| Release task | [L01-A #144](https://github.com/ddk220-light/MyBookshelf-web/issues/144), parent [L01 #48](https://github.com/ddk220-light/MyBookshelf-web/issues/48) |

## Released scope and configuration

The deployment contains the account implementation, UI/retry fixes and current
public app. The original catalog credentials and domains are retained. No staging
database, migration administrator, auth secret or test inbox was copied into
production. No account production data/resource was created in this rollout.

Production currently has only the existing catalog credentials. It needs dedicated
auth/reading/worker database connections, stable auth origin/secrets, a verified
Resend sender/key, an independent private deletion ledger, and scheduled cleanup
with alerts before account entry is enabled. Google/Apple remain deferred and
disabled by owner instruction. The owner was asked to configure `RESEND_API_KEY`
and `ACCOUNTS_MAIL_FROM` privately in Vercel's Production environment.

With account configuration absent, the account endpoints return intentional
HTTP 503 with `private, no-store` and `noindex`. The app offers explicit browser-shelf
continuation. Do not interpret deployed forms or passing controlled-mail tests as
live signup/delivery verification. The remaining activation and operational
criteria on R03/L01 stay open; see [OPERATIONS.md](../OPERATIONS.md).

## Deployment connection and approval handling

This was a one-time deployment from the exact `MyBookshelf-web` Git commit.
The production project's persistent Git connection still points to
`ddk220-light/MyBookshelf`, production branch `main`. Future releases from
`MyBookshelf-web` require an explicit deployment until that connection is approved
and changed. A future push to the older linked repository can still auto-deploy;
coordinate releases with that fact in mind.

Automatic approval review initially rejected the merge because the owner's new
deployment instruction had not been recorded at R03. Recording the exact existing
instruction and clean-check evidence resolved that gate, and the merge succeeded.
Review separately rejected changing project-wide domain auto-assignment, a staged
production request with domain assignment disabled, and permanently relinking the
production Git repository. Those rejected actions did not execute. The completed
deployment used the existing project's normal production behavior; its Git link
and `autoAssignCustomDomains:true` setting were verified unchanged afterward.

## Verification and rollback

Candidate checks pass: 143 client tests, 514 server tests with real disposable
Postgres and zero skips, 318 public browser scenarios, 24 actual account journeys,
type checking, production build, SEO and deployment contracts. Both implementation
and final-candidate full CI runs passed before release.

Live home, settings, privacy, sitemap and health return HTTP 200. App pages have
`noindex, follow`; API responses have `noindex`. Live public library search returns
Alameda and exact ISBN lookup returns its book. The existing `/api/libraries`
endpoint remains intentionally retired (410); supported searches use `/api/v2`.
The custom domain was independently checked to resolve to the new deployment.

Live WebKit checks also pass in all three lights: 390px account headings measure
28px, input text 16px, with no horizontal overflow. Explicit guest continuation
reaches Shelf, and the 1440px settings layout uses the desktop grid without
horizontal overflow. No uncaught browser page errors were observed. The
[check metadata](../evidence/production-2026-11-01/checks.json),
[live mobile form](../evidence/production-2026-11-01/sign-up-daylight-390.png) and
[disabled-account settings](../evidence/production-2026-11-01/settings-account-disabled-390.png)
show the actual deployment. The visible unavailable-account notice is expected
while production account entry is disabled; it is not a successful signup claim.

Browser requests used the session HTTP proxy and its existing CA trust, with TLS
verification enabled. The initial Chromium request could not use its separate
certificate store; WebKit successfully used the system CA bundle. The public API
checks also verified TLS normally. No certificate validation was disabled.

Scoped runtime error/fatal log counts for the new deployment were empty during
the initial observation. No external drains are configured. This is an immediate
post-deploy observation, not a long-duration monitoring guarantee.

Rollback uses the named previous deployment on the same project and retains
catalog secrets/domains. No account production migration ran, so no account schema
rollback or data reconciliation is needed for this code-only release. Before
later account activation, complete the runbook's database/ledger/worker/mail and
retention checks; subsequent rollbacks must preserve their durable data/jobs.
