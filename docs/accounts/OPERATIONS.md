# Account operations and release gate

This is the runbook for the account implementation. R02 documents and Claude
canvas v4 are approved. Deepak subsequently authorized production completion;
the actual feature rollout is still in progress. Read
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

The existing production project's persistent Git connection remains on the older
`MyBookshelf/main` repository. Explicit source-reference deployments now serve
`MyBookshelf-web` at its existing domains. Dedicated production Neon and private
ledger resources have since been provisioned under the owner's production
instruction. See the current production record; do not reuse staging credentials.

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
sessions. A real provider-hosted restore and actual backup-retention audit remain
release gates. The API reports the staging Neon plan as Free; that metadata alone
does **not** prove its configured recovery/retention period. Obtain the provider's
actual retention setting and ensure all provider/manual snapshots expire within
30 days. Do not enable accounts if that guarantee is unverified or incompatible.

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

`.github/workflows/account-maintenance.yml` provides a five-minute staging schedule
and manual dispatch. It is inactive until repository variable
`ACCOUNTS_STAGING_JOBS_ENABLED=true`. Configure the `accounts-staging` environment
with `ACCOUNTS_STAGING_CRON_SECRET` and `ACCOUNTS_STAGING_DEPLOYMENT_BYPASS`, matching
the staging server's bearer value and a dedicated Vercel automation bypass. Restrict
that environment to trusted branches/operators. The workflow reads the fixed
staging origin and prints only safe aggregate health; failed/overdue results fail
its check. GitHub schedules run from the default branch, so the workflow must be
present there before relying on scheduled execution. Enable failure notifications
and verify consecutive runs and health timestamps before release.

This optional staging schedule remains inactive. The current GitHub connection
returned HTTP 403 for the Actions secrets public-key API. That restricts this
particular scheduling option; no GitHub permission change is requested now.
Do not pass credentials as workflow inputs, commit them, disable deployment
protection, or treat the checked-in workflow as a running job. Native Vercel Cron
runs on production deployments; validate the selected plan's supported frequency
when setting up production maintenance. A trusted operator may run
`tools/accounts/run-maintenance.mjs` with secrets supplied by their secret manager
for controlled staging validation. Never rely on website visits to drive cleanup.

## Mail and identity providers

Required server-only mail values: `RESEND_API_KEY`, `ACCOUNTS_MAIL_FROM`,
`ACCOUNTS_JOB_SECRET`. Queued payloads use authenticated encryption; plaintext
credentials/tokens never enter logs. Native protocol and outbox failure tests pass,
but controlled outbox readers do not prove delivery. The owner has chosen Resend
for production only. No staging sender or provider installation is requested.
Settle legal-policy acceptance and verify SPF/DKIM/DMARC and real verification,
reset and security email during production setup before enabling email accounts.
Verify Apple relay delivery when Apple sign-in is enabled later. No terms have
been accepted implicitly.

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
with an isolated drill. Replacing either value alone is not a supported rotation.

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
production deployment as the production rollback target until R03 chooses a new one.

R03 needs one identified tested commit/deployment, tested production mail and an
active production scheduler/alerts before email accounts are enabled, hosted
restore and backup-retention proof, final privacy/accessibility/public regression
evidence, zero unresolved critical/high defects, and Deepak's explicit approval.
Google/Apple activation is deferred by the owner; live provider/Safari/relay checks
apply before those methods are enabled. Local controlled transports and a
provisioned resource do not substitute for required live operational evidence.
