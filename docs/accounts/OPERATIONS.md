# Account operations and release gate

This is the runbook for the account implementation. R02 documents and Claude
canvas v4 are approved. Deepak subsequently authorized production completion;
email accounts are enabled and production workflows are verified. Final backup/
operator acceptance remains open. Read
[PRODUCTION_ROLLOUT.md](PRODUCTION_ROLLOUT.md) for current production resources,
evidence and unfinished exits; the staging observations below are historical.
Deepak is the release/configuration owner. A second operator has not yet followed
this runbook; automated checks are recorded separately from that observation.

## Owner's current rollout choices

Recorded 2026-11-01, following the implementation checkpoint:

- Use Resend only for production. Do not provision a staging sender or request
  staging mail-provider legal consent. Local automated tests continue to use their
  existing synthetic outbox; this does not enable a hosted test inbox or bypass
  email verification. Settle production mail consent/domain/delivery at production
  setup, before enabling email accounts for readers.
- Keep Google and Apple disabled for now; credentials and activation are deferred
  by the owner. Retain the implementation and protocol tests. Complete each
  provider's real login/relay/Safari checks before enabling that provider later.
- The GitHub maintenance workflow was an optional staging scheduler. Its secret
  permissions are not required to finish coding or to leave staging automation
  inactive. Production still requires a tested scheduler and failure alerts before
  real account data/deletions rely on it; select the production scheduler at setup.

Live staging capabilities were checked after this instruction and report email,
Google and Apple all disabled. Do not add credentials or turn these on implicitly.

## Environments and credentials

**Staging was removed on 2026-11-14.** The Vercel project
`mybookshelf-accounts-staging` and its Blob stores were deleted; the owner chose a
single `mybookshelf` project that deploys only `main` and `staging` branches
(`git.deploymentEnabled` in `vercel.json`). The notes below describe the former
staging setup and are kept for history only.

Staging uses Vercel project `mybookshelf-accounts-staging`
(`prj_tlwAzT2LGtV1HDRfW7DzhiWWihFF`), team `ddk220`, region iad1, Node 22.
Stable origin: `https://mybookshelf-accounts-staging.vercel.app`, mapped to the
`account-settings` branch. Runtime variables are **Preview / account-settings**
only. The staging project's default target has no account runtime credentials.
Ephemeral aliases must send users to the canonical account origin; never add a
wildcard trusted origin or relax the Origin check.

Neon project `bold-band-47854367`, resource `store_tVhnBuK6FDTErqQ5`, is on its
existing Free plan. The administrator URL is available only in Development and
is never supplied to deployed application code. Separate auth, reading and worker
roles are non-owner/non-superuser/non-BYPASSRLS; auth has no private reading-table
grants, reading cannot select credentials, and the worker cannot select auth or
reading rows. Narrow definer functions expose only a session-active boolean,
a proof-gated export projection, and expired-state maintenance.

Private deletion ledger: `store_Gs9zkvOMQteZihLA`. Its separate read/write token is
`ACCOUNTS_DELETION_LEDGER_READ_WRITE_TOKEN`. The provisioned private export store
`store_anEQSluYF2hXAEQT` is unused by v1: export streams an authenticated attachment,
with no persistent export file or URL. Do not start retaining export copies.

The existing production project's persistent Git connection now points to
`ddk220-light/MyBookshelf-web/main` (repo 1440561024), verified on 2026-11-05.
Dedicated production Neon and private ledger resources are separate from staging.
Production uses Resend, native five-minute Vercel Cron and the independent public
health monitor. Read [the release acceptance](RELEASE_ACCEPTANCE.md) for actual
received-mail, cleanup and failure-notification evidence. Do not reuse staging
credentials. The sections below retain the staging setup and common runbook.

## Migrations and restoration

Use Node 22. Run migrations with the private migration administrator using
`npm run accounts:migrate --workspace server`, then apply
`server/db/runtime-grants.sql`. The migration runner locks, checks applied
checksums and commits atomically. Do not edit applied migrations or run DDL in a
request. Staging migrations 001–011 and runtime grants were applied and verified
on 2026-11-01. Application rollback must preserve additive schema and deletion jobs.

Before restoring, isolate the destination from account traffic and migrate it.
Never serve an old snapshot while trying to reconcile the ledger in the background.
The restore command requires the migration administrator with access to forced-RLS
rows. Supply these through the operator's secret manager:

- `ACCOUNTS_MIGRATION_DATABASE_URL`: the isolated restore destination.
- `ACCOUNTS_DELETION_LEDGER_READ_WRITE_TOKEN`: the independent ledger, not a copy
  inside the restored snapshot.
- `ACCOUNTS_RESTORE_ISOLATED=true`, `ACCOUNTS_ENABLED=false`.
- `ACCOUNTS_RESTORE_SNAPSHOT_CREATED_AT`: the provider's actual snapshot timestamp.

Run `node tools/accounts/restore.mjs`. It rejects future/older-than-30-day snapshots,
missing isolation, unreadable ledger or insufficient database authority. It
invalidates restored sessions and outstanding token mail/proofs/intents, removes
suppressed immutable identities and owned rows, and restores encrypted outstanding
provider-revocation jobs. Reconciliation is idempotent. Keep traffic disabled on
any failure, including completion-ledger failure after the database commit.
Validate private/public behavior and job health before enabling the restored app.

The automated drill creates a separate disposable database, preserves an unrelated
account's books, removes the suppressed account's rows and invalidates all restored
sessions. The actual provider-hosted logical restore now passes (see production record);
actual backup-retention audit and the second operator exercise remain release gates. The API reports the staging Neon plan as Free; that metadata alone
does **not** prove its configured recovery/retention period. Obtain the provider's
actual retention setting and ensure all provider/manual snapshots expire within
30 days. Do not enable accounts if that guarantee is unverified or incompatible.

### Outstanding operator evidence

Record these in #147/#133 using safe values, not credentials:

1. Open the production storage resource in Neon and record the configured history
   window plus each manual snapshot's expiry (or an empty inventory). Repeat the
   staging recovery-access audit in #67. The <=30-day requirement is unchanged.
2. A second operator follows the isolation/restore steps above with synthetic
   data only: snapshot A/B, delete A using the independent ledger, restore into an
   isolated destination, run `node tools/accounts/restore.mjs`, and repeat it.
3. Record operator name, UTC snapshot/run times, A absent, B's books retained,
   restored sessions invalid, and identical safe results on the second run.
   Remove the exact temporary databases and synthetic ledger fixtures afterward.
4. Attach the sanitized result and close the associated audit tasks only when
   observed. Existing engineering drill evidence can guide the operator; it does
   not stand in for their independent exercise.

## Nightly backup

Owner decision (one-shelf plan, section 9): stay on the free database plan and
keep a nightly encrypted export of the accounts database for 30 days.
`.github/workflows/account-backup.yml` runs at 20:41 UTC. It dumps the
database with `pg_dump` (`tools/accounts/backup.sh`), compresses and encrypts it
in one stream with [age](https://age-encryption.org/) to the owner's public key
(no plain SQL is written to disk or uploaded), stores the file in a private
Vercel Blob store and deletes stored files older than 29 days
(`tools/accounts/backup-store.mjs`). Nothing runs until it is configured.

Settings (GitHub → Settings → Environments → `accounts-backup`):

| Name | Kind | Value |
|---|---|---|
| `ACCOUNTS_BACKUP_DATABASE_URL` | secret | Direct (not `-pooler`) connection string of a role that reads every table with row security bypassed: preferably `mybookshelf_backup` (LOGIN, BYPASSRLS, NOSUPERUSER; `server/db/runtime-grants.sql` grants it SELECT), else the migration administrator. |
| `ACCOUNTS_BACKUP_BLOB_READ_WRITE_TOKEN` | secret | Read/write token of a new private Blob store used only for backups (not the deletion ledger's store). |
| `ACCOUNTS_BACKUP_AGE_RECIPIENT` | variable | The age public key (`age1…`). Create the pair offline with `age-keygen -o mybookshelf-backup-key.txt`; keep the private key file with the owner (password manager or offline), never in GitHub or Vercel. |
| `ACCOUNTS_BACKUP_ENABLED` | repository variable | `true` turns on the nightly schedule. A manual run works without it. |

A role that is subject to row security makes `pg_dump` stop with an error, so a
backup is never silently missing rows. Run the workflow once by hand after
setting it up and check the "List stored backups" step. If the schedule stops
(GitHub pauses scheduled workflows after 60 days without repository activity),
the files already stored are no longer pruned: re-enable it or delete them in
the Blob store.

### Restoring from a nightly backup

Keep account traffic off the destination until the last step.

1. Create an isolated, empty database (a Neon branch or a new database), and
   the runtime roles if it is in another project.
2. Download the file: `ACCOUNTS_BACKUP_BLOB_READ_WRITE_TOKEN=… node tools/accounts/backup-store.mjs list`,
   then `… download accounts-<time>.sql.gz.age backup.age`.
3. Decrypt and load in one transaction:
   `age --decrypt --identity mybookshelf-backup-key.txt backup.age | gunzip | psql "$DESTINATION_URL" -v ON_ERROR_STOP=1 --single-transaction`.
4. Apply `server/db/runtime-grants.sql` as the administrator, then
   `npm run accounts:migrate --workspace server` (it checks the restored
   migration checksums and applies anything newer).
5. Run the reconciliation in [Migrations and restoration](#migrations-and-restoration)
   with `ACCOUNTS_RESTORE_SNAPSHOT_CREATED_AT` set to the time in the file name
   (`accounts-20261113T204100Z…` is `2026-11-13T20:41:00Z`). It removes accounts deleted since the backup and ends restored sessions.
6. Validate, then point the runtime connection strings at the destination.

Dry run, 13 November 2026, on a throwaway local Postgres 16 with migrations
001–012 and synthetic rows: the script refused to run without its settings, with
a `-pooler` host and with roles subject to row security (no file left behind);
with a BYPASSRLS reader it wrote a 6.7 kB encrypted file in under 0.1 s with no
readable text in it; decrypting and loading it into a second database gave the
same row counts and content checksum, the same 7 FORCE RLS tables and 9
policies, and the migration runner accepted all 12 checksums. The Blob upload,
prune and download paths were exercised with a stand-in store
(`tools/accounts/backup-store.test.mjs`); the reconciliation step is covered by
`server/accounts/restore.integration.test.js`. Not yet run: the workflow on
GitHub against production, and a restore from a real stored file.

## Maintenance and overdue work

`GET /api/internal/account-jobs` requires the independent, at-least-32-character
`ACCOUNTS_CRON_SECRET` bearer value (`CRON_SECRET` is also supported). Browser
sessions cannot authorize this endpoint. Account entry may be disabled while
maintenance continues. Keep normal deployment/environment checks intact.

Each invocation processes a bounded deletion batch, provider revocations and
mail, then purges expired transient state and old ledger records. Jobs use leases,
fencing, backoff and stable mail idempotency IDs. A failed worker can be retried;
do not manually recreate deletion requests. Deletion first disables the account
and revokes sessions atomically. It persists a minimal independent suppression
record and encrypted provider cleanup material before durable acceptance or live
purge. A ledger outage leaves the account disabled and reports pending acceptance.
Provider credentials are kept only as encrypted minimum revocation material,
never in status receipts. Native/private rows are removed without waiting for a
provider outage; provider cleanup continues, with a 30-day maximum for its material.

`account_job_health` contains only fixed job name/start/success times. Responses
contain aggregate processed counts and boolean alerts, not emails/book contents.
Alert the operator if a run fails, freshness exceeds 15 minutes, live deletion
exceeds 24 hours, provider cleanup exceeds 24 hours, or account mail is delayed
beyond one hour. Resolve provider cleanup within 30 days; its encrypted material
is removed at the deadline and an expired failure must be investigated. Suppression
records remain for 35 days **after** live cleanup, outside database snapshots.

Native Vercel Cron runs account maintenance every five minutes on the production
project. Consecutive successful runs, real cleanup and independent failure
notification are verified in the release acceptance. Never rely on website visits
to drive cleanup. (The old staging GitHub schedule and its runner script were removed
on 2026-11-14 together with the staging project.)

## Mail and identity providers

Required server-only mail values: `RESEND_API_KEY`, `ACCOUNTS_MAIL_FROM`,
`ACCOUNTS_JOB_SECRET`. Queued payloads use authenticated encryption; plaintext
credentials/tokens never enter logs. Native protocol and outbox failure tests pass,
but controlled outbox readers do not prove delivery. The owner has chosen Resend
for production only. No staging sender or provider installation is requested.
The owner completed production provider setup. Actual verification/reset/security/
email-change delivery passes, including received SPF/DKIM/DMARC results; see the
release acceptance. Verify Apple relay delivery when Apple sign-in is enabled later.
No new provider/legal consent is requested for the email-account release.

Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; identity-only scopes
`openid email profile`. Register the exact stable callback
`https://mybookshelf-accounts-staging.vercel.app/api/auth/callback/google`.
Apple: `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`; register the stable domain and
`/api/auth/callback/apple`, verify developer eligibility/Services ID/relay mail and
use a current signed client secret. Renew the Apple client secret before expiry
and rehearse a returning-user round trip after rotation. Keep signing keys in the
provider/hosting secret manager. Neither provider's live credentials are currently
configured in staging.

Only Apple's short-lived state cookie uses SameSite=None/Secure for its cross-site
form POST. Normal session cookies remain HttpOnly/Secure/Lax. Do not disable state,
nonce, PKCE or ID-token validation to make a provider work. Connecting a provider
requires a fresh intent and recent auth; reauthentication requires the exact owned
subject and returns to an explicit final confirmation. Provider outages do not
permit an email-based bypass of recent authentication.

Do not rotate `BETTER_AUTH_SECRET` or `ACCOUNTS_JOB_SECRET` without a planned
migration of retained encrypted provider/job material and session/token invalidation.
Retain decryption capability for every supported backup/retry window, or rewrap
using supported library/encryption APIs before removing an old key. Verify this
with an isolated drill. The 2026-11-05 engineering recovery drill proves safe
wrong-key failure, retained-key recovery, draining, explicit session/challenge
invalidation and new-key mail in an actual temporary local database. It does not
rotate hosted secrets or replace the independent operator exercise. Replacing
either value alone is not a supported rotation.

## Logging, rollback and R03

Application account errors return a per-request opaque request ID and safe error
code/message. Do not log request bodies, full token/callback query strings,
cookies, provider tokens, private names/emails, shelf/history data or raw SQL
parameters. Confirm hosting/log-drain redaction and access/retention settings for
sensitive routes; the application tests do not prove a host's logging configuration.
The website privacy policy distinguishes guest storage, optional accounts and
native apps. Recheck it against final vendors and retention settings at R03.

On a private-data/security incident: disable new account entry/writes, revoke
sessions as needed, preserve the independent ledger, and continue deletion and
retention workers. Public catalog browsing should remain available. Do not roll
back a database to revive a deleted identity or discard queued cleanup. Restore
only into isolation with ledger reconciliation. Retain the last reviewed public
enabled production deployment as the rollback target identified in
[release acceptance](RELEASE_ACCEPTANCE.md); preserve accepted writes and jobs.

R03 needs one identified tested commit/deployment, tested production mail and an
active production scheduler/alerts before email accounts are enabled, hosted
restore and backup-retention proof, final privacy/accessibility/public regression
evidence, zero unresolved critical/high defects, and Deepak's explicit approval.
Google/Apple activation is deferred by the owner; live provider/Safari/relay checks
apply before those methods are enabled. Local controlled transports and a
provisioned resource do not substitute for required live operational evidence.
