# Account production rollout

Updated 2026-11-05 UTC. **Email accounts are enabled and actual production
workflows have been verified at https://mybookshelf.cloud.** The owner authorized
production completion and deployment after clean checks. Google/Apple remain
disabled; Resend is production only. See [release acceptance](RELEASE_ACCEPTANCE.md)
for source/deployment, full test results, real workflow observations, screenshots,
privacy limits and remaining operational exits.

The whole project remains open for actual Neon history/snapshot retention evidence
and an independent operator's restore exercise. Follow
[Project 3](https://github.com/users/ddk220-light/projects/3), especially
[P01-C #147](https://github.com/ddk220-light/MyBookshelf-web/issues/147),
[S20-B #149](https://github.com/ddk220-light/MyBookshelf-web/issues/149),
[S20-V #133](https://github.com/ddk220-light/MyBookshelf-web/issues/133) and
[T06 #47](https://github.com/ddk220-light/MyBookshelf-web/issues/47).
Production mail setup [#148](https://github.com/ddk220-light/MyBookshelf-web/issues/148)
and health monitoring [#152](https://github.com/ddk220-light/MyBookshelf-web/issues/152)
are complete. [L01-B #150](https://github.com/ddk220-light/MyBookshelf-web/issues/150)
records the full activation workflow.

## Production configuration

- Existing Pro project `prj_AhxvPVIgw95iofXaWigVNSYF30iP`, team `ddk220`, iad1;
  canonical origin `https://mybookshelf.cloud`.
- Dedicated production Neon `misty-cake-69893992`, store `store_Y2EqcbZyTyIEwnbN`,
  existing Free plan; separate from staging `bold-band-47854367`.
- Independent production private deletion ledger `store_Y1H9lYwwAobnvKnh`.
- Migration administrator is Development/operator only. Deployed auth, reading
  and worker connections are separate nonowner, nonsuperuser, non-BYPASSRLS roles.
  All eleven migration checksums and seven FORCE RLS tables were verified again
  against production. No administrator is supplied to the deployed application.
- `ACCOUNTS_ENABLED=true`; capability response exposes email true, Google/Apple
  false. Private guest session 200 and aggregate health 200 ready.
- Production sensitive Resend transport and authenticated sender
  `MyBookshelf <accounts@mybookshelf.cloud>`. Received verification/recovery/security/
  change emails work. After adding `_dmarc` TXT `v=DMARC1; p=none`, observed reset,
  security and new-address messages pass SPF, DKIM and DMARC.
- Native `/api/internal/account-jobs` Vercel Cron runs every five minutes.
  Consecutive successes, sent/purged mail and actual fixture deletion cleanup
  were observed. Unauthenticated maintenance is denied. Partial/overdue work
  returns 503 and does not advance `last_succeeded`.
- The independent `account-production-health.yml` workflow checks aggregate
  readiness/freshness every five minutes without app secrets. Real earlier failure
  notification reached the owner; subsequent monitor runs are green (#152).
- The saved Vercel Git link now points to `ddk220-light/MyBookshelf-web/main`,
  repo 1440561024. Readback verified the same project and unchanged build and
  protection settings; domains, resources, environment variables and billing were
  preserved. See [#173](https://github.com/ddk220-light/MyBookshelf-web/issues/173).

No secret values, mailbox aliases, one-use links or session cookies are included
in this record. The [schema](evidence/production/schema-verification.json) and
[ledger](evidence/production/ledger-verification.json) evidence remain applicable.

## Release acceptance and fixes

[RELEASE_ACCEPTANCE.md](RELEASE_ACCEPTANCE.md) is the current application release
record. PRs #163, #172, #175 and #176 address defects reproduced during real acceptance:
startup verification submission, settings after the five-minute freshness window,
and contradictory deletion sign-out state/late response races. Repeat the affected
flows against the checked deployment; do not sign in again to conceal an aged
session failure. The report identifies actual clean CI and production repeats.

Signup, deliberate single-use verification, recovery, import, profile/library/
history/shelf synchronization, email/password changes, export, current/all-device
sign-out and native-worker deletion cleanup are recorded with sanitized browser
and scoped synthetic database evidence. The current production screens and actual
Orca/Chromium accessibility equivalent complement the full earlier artifact matrix.
No live external identity-provider or native iOS Safari result is claimed.

## Hosted restore evidence and limits

On 2026-11-01 at 18:21:52 UTC a coherent logical snapshot of synthetic auth/private
reading rows was captured in a temporary isolated database on production Neon and
restored into a second isolated database. The independent production Blob ledger
suppressed a deleted synthetic identity/reading rows, preserved another synthetic
reader's books, invalidated restored sessions and replayed idempotently. Both
temporary databases and exact synthetic ledger objects were removed. Runtime
customer data was not copied or changed. See
[hosted restore evidence](evidence/production/hosted-restore-verification.json).

This proves hosted logical restoration/suppression. It does not prove native PITR
or the actual history/manual-snapshot inventory and expiry. Free-plan metadata and
public documentation are not substitutes for those settings. The owner has been
given read-only steps: Vercel Storage → production account resource → Open in Neon →
project `misty-cake-69893992` → history settings and Snapshots. Record the configured
window and every snapshot's expiry, all <=30 days. No new token/paid plan is needed.
A second operator has not followed [the restore runbook](OPERATIONS.md); that exit
remains open separately from the completed engineering drill.

## Recovery and historical records

Preserve the additive schema, accepted jobs and independent suppression ledger.
Use the enabled rollback/forward-repair guidance in [release acceptance](RELEASE_ACCEPTANCE.md).
A database restore stays isolated until external deletion suppression is complete.
Do not reopen private traffic on reconciliation failure.

The earlier `evidence/production/live/` files and Nov 1 observations describe the
then-disabled account setup. They are dated historical evidence, superseded by
`evidence/production/acceptance-2026-11-05/` for current enablement and workflows.
Account-disabled code deployment alone was not feature completion; the live
workflow checks in the current acceptance report establish the working feature.
