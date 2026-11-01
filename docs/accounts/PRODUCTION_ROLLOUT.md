# Account production rollout

Updated 2026-11-01 UTC. The owner instructed finishing the working account
feature in production and testing the full workflow. That instruction authorizes
the rollout; it does not turn unfinished checks into passing evidence.

**L01 is in progress. Production account creation is not yet enabled or proved.**
Track the remaining work in [Project 3](https://github.com/users/ddk220-light/projects/3):
[P01-C #147](https://github.com/ddk220-light/MyBookshelf-web/issues/147),
[P02-B #148](https://github.com/ddk220-light/MyBookshelf-web/issues/148),
[S20-B #149](https://github.com/ddk220-light/MyBookshelf-web/issues/149), and
[L01-B #150](https://github.com/ddk220-light/MyBookshelf-web/issues/150).

## Actual production setup

- Project `prj_AhxvPVIgw95iofXaWigVNSYF30iP`, team `ddk220`, existing Pro plan;
  canonical origin `https://mybookshelf.cloud`, iad1.
- Dedicated Neon `misty-cake-69893992`, resource `store_Y2EqcbZyTyIEwnbN`, existing
  Free plan. It is separate from staging `bold-band-47854367`.
- Independent private deletion ledger `store_Y1H9lYwwAobnvKnh`, production only.
- Migration administrator is Development/operator only. Deployed auth, reading
  and worker credentials use separate nonowner, nonsuperuser, non-BYPASSRLS roles.
  Production secrets remain in Vercel. Google/Apple remain disabled by owner choice.
- All eleven migration checksums and seven forced-RLS tables were verified against
  the actual production database. Role privilege checks and separate role logins
  passed. See [schema evidence](evidence/production/schema-verification.json).
- Real private Blob writes/reads, immutable request/completion, encrypted cleanup
  and anonymous-read denial passed; synthetic objects were removed. See
  [ledger evidence](evidence/production/ledger-verification.json).
- Authenticated production maintenance reaches the database and private ledger.
  Its response is **503**, with mail unavailable and deletion/provider queues
  healthy. Resend is not installed yet: its account/terms consent is pending.
  No successful production signup or delivered verification email is claimed.

Deployment `dpl_4wkbMbk2ArfwkD9fU1j3FnCyfHNf` is READY at the canonical domain,
source `7ab9d8967e17265c87b8c7e490fd50a295dba598`, with account entry disabled.
The prior infrastructure redeploy captured configuration before the new cron
secret had propagated and returned 403; redeploying after propagation resolved it.
The persistent Vercel Git connection still points to the original repository;
these releases use the explicit `MyBookshelf-web` source reference.

## Hosted restore evidence and limits

At 18:21:52 UTC a coherent logical snapshot of synthetic auth/private reading rows
was captured in a temporary isolated database on the production Neon project and
restored into a second isolated database. The actual independent production Blob
ledger suppressed a deleted synthetic identity and its reading rows, preserved an
unrelated synthetic reader's books, invalidated restored sessions and replayed
idempotently. Both temporary databases and the exact synthetic ledger records
were removed. Runtime customer data was not copied or changed. See
[hosted restore evidence](evidence/production/hosted-restore-verification.json).

This proves hosted logical restoration and suppression, not provider PITR or the
actual configured backup/manual-snapshot retention. Neon's current public Free
plan documentation describes a six-hour history window and one manual snapshot;
the actual project settings/snapshot inventory still require verification. Do not
substitute plan metadata for that configuration check.

## Verified signup and maintenance repairs

Merged [PR #151](https://github.com/ddk220-light/MyBookshelf-web/pull/151) checks session/service readiness before permitting account
submissions, distinguishes disabled setup from an outage, checks email capability
before signup/recovery, supports retry and preserves typed fields during startup.
Unavailable accounts no longer advertise a working Create account action in
Settings. Guest continuation preserves the actual browser shelf.

A full browser workflow reproduced a mobile double-tap defect: after Create
account collapsed the keyboard/reflowed the form, the gesture's second click hit
Continue using this browser. Account forms now ignore the second pointer action
of a double click on buttons/links; ordinary single clicks and keyboard activation
continue working. The regression follows native Settings → signup → validation →
double submit → check email → unverified sign-in → verification → sign-in/session.

Maintenance no longer advances `last_succeeded` for unavailable services or overdue
work. Such runs return 503. Native Vercel Cron is deployed every five minutes using
the production-only `CRON_SECRET`. An actual scheduled run at 18:40:33 UTC advanced
`last_started` while preserving the older success timestamp because mail remains
unavailable. No manual invocation ran at that time. The
[operations observation](evidence/production/live/operations-observation.json)
records the active deployment/schedule and database observation.

Actual production desktop/mobile HTTPS browser checks pass disabled-entry honesty,
absence of active signup fields, guest continuation, horizontal layout and page
errors. [HTTP checks](evidence/production/live/http-results.json) verify public
health, `ACCOUNT_DISABLED`, private no-store/noindex, unauthenticated worker denial,
the private app route and `.env` denial. See
[browser evidence](evidence/production/live/browser-results.json) and the
[production mobile screen](evidence/production/live/mobile-account-unavailable.png).

Local checks use synthetic accounts, real loopback Postgres/API/cookies and a
synthetic mail outbox. They do not prove Resend delivery. The client suite has
152 passing tests; the server suite has 515 passing tests with zero skips,
including isolated Postgres maintenance-failure coverage. Type checking, build,
SEO and deployment checks pass. Both complete CI runs passed on tested source
`41b626b9c4b792f8e71577228d0f21466086afee`:
[push](https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41336488573) and
[PR](https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41336512647).
Each includes 318 public browser scenarios and 30 account journeys across desktop
and mobile Chromium and WebKit, with the real API/Postgres and synthetic outbox.
The merged/deployed application tree was compared with that tested candidate.

## Independent production monitor (S20-C)

[S20-C #152](https://github.com/ddk220-light/MyBookshelf-web/issues/152) adds
`GET /api/account/health`, a no-store/noindex aggregate readiness check. It uses
the restricted worker role, rejects privileged connections, requires configured
mail/database/ledger secrets and a successful maintenance run within 15 minutes.
It exposes only ready/unavailable, without account rows, queue contents, timestamps
or credentials. Public catalog health stays independent.

The read-only `account-production-health.yml` workflow calls that endpoint every
five minutes, two minutes after normal worker boundaries, and fails the Actions
job on unavailable or stale maintenance. It needs no app/cron credentials.
GitHub delivery to the operator follows the owner's Actions notification settings;
an actual notification email is not claimed until observed. Monitor deployment
and live verification remain in progress with S20-C.

## Completion sequence

1. Finish Resend account/terms consent, provision production-only mail, verify
   sender DNS and actual delivery. Keep Google/Apple disabled.
2. Verify actual backup retention/snapshot inventory and the production schedule,
   job freshness and failure notification route.
3. Enable accounts and deploy the checked source. Use synthetic production smoke
   identities and the actual mail transport to verify signup, verification,
   sign-in, saved shelf, recovery, sign-out and deletion/cleanup. Remove fixtures.
4. Check the live desktop/mobile UI and public regression boundaries. Record the
   actual deployment, results and rollback target, then close the project items.

Keep account entry disabled on a genuine prerequisite failure while public
browsing continues. Do not present code deployment as completed account activation.
