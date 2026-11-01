# Account engineering design

Version 0.1, 2026-11-01. D03. **Proposed for R01; not an approved migration.**
Requirements: [PRD](PRD.md). Validation: [TEST_STRATEGY.md](TEST_STRATEGY.md).
Product decisions take precedence over vendor defaults. S01 must demonstrate
library support for the proposed controls before production implementation.

## Repository findings and boundaries

| Inspected surface | Current behavior | Required change |
| --- | --- | --- |
| [`server/anonymousApp.js`](../../server/anonymousApp.js) | Express 4 app; `/api/v2` isolated; remaining `/api/*` returns 410; HTML clears `mb_session` and `mb_key` | Mount auth/account handlers before retired catch-all; choose distinct new cookie names. Keep public router independent of auth/DB. |
| [`server/index.js`](../../server/index.js), [`server/vercel.js`](../../server/vercel.js) | Both construct anonymous app | Inject optional account dependencies in both entry points; disabled/misconfigured accounts must not prevent public startup. |
| [`server/package.json`](../../server/package.json), [`vercel.json`](../../vercel.json) | Node 22 ESM, Express 4, existing Vercel services | Versioned auth/DB adapter spike; verify proxy, raw-body routing, time/memory and connection budgets. |
| [`context.tsx`](../../client/src/v2/context.tsx), [`localState.ts`](../../client/src/v2/localState.ts) | Synchronous guest mutations, 100 saves/50 recent; saved objects reuse `viewedAt` | Async repository adapter; distinct cloud `savedAt` and `viewedAt`; guest import preserves old representation without calling its timestamp a save date. |
| [`readerState.ts`](../../client/src/v2/readerState.ts) | Browser-persisted library summary, lookup choices and availability | Account versions in memory; clear identity-derived state and reject stale responses. |
| [`SettingsPage.tsx`](../../client/src/v2/ui/settings/SettingsPage.tsx) | Guest privacy copy and synchronous clear | Identity-specific copy and acknowledged asynchronous lifecycle actions. |

Proposed modules: `server/auth/` (Better Auth configuration, mail hooks and
version-specific adapter), `server/accounts/` (session guard, router, application
services, validation), `server/db/` (pools, transactional owner context, migrations),
`server/jobs/` (durable outbox/deletion/retention work). Use the existing provider
directory and public book types through explicit adapters. Do not add auth checks
to `/api/v2` or store account data in its caches.

Request order: existing public router → `/api/auth/*` Better Auth Node handler
with the unconsumed request body → `/api/account/*` private router with bounded
JSON parser → health/retired routes/static files. Account-specific error handling
must precede the retired fallback. Exact Express 4 route syntax is exercised by
S01; do not copy Express 5/Next.js examples verbatim.

## Auth selection and S01 integration spike

Use Better Auth with managed Postgres (Neon preferred). Pin an audited supported
Better Auth release and compatible client/adapter versions together in the lockfile
at S01; the repository currently has none installed. Generate auth schema from
that pinned release. Prefer the official Postgres adapter and explicit SQL
migrations; introduce an ORM only if the selected adapter requires it and document
the reason. No hand-maintained imitation of auth tables or token protocols.

S01 produces a compatibility report with exact versions, generated schema diff,
test evidence, memory/latency measurements and a go/no-go for each item:

1. Express 4 + ESM + Node 22, local and actual Vercel entry points, body parsing,
   cookies, callback redirects, trusted proxy and same-origin browser calls.
2. Verification/reset hooks, single-use token behavior, scanner-safe landing,
   password hashing and compromised-password validation, new-email verification,
   explicit linking, recent authentication and social-only password setup.
3. Cookie-cache disabled, immediate database revocation, 7-day idle/30-day absolute
   lifetime, daily renewal, session listing and sensitive-action proof.
4. Postgres adapter transactions; owner-context transaction lifetime under pooled
   connections; auth-role grants independent of private-data RLS.
5. Apple cross-site form POST callback on Safari with state/nonce/PKCE validation
   as appropriate to the supported flow; exact cookie behavior and relay email.
6. Shared rate-limit storage and proxy-derived client address trust, failure
   behavior during database/mail outage, concurrent hash cost at expected load.

If a required guarantee needs unsupported hooks, stop that implementation path,
document a focused alternative and obtain review of changed behavior. Do not
claim that a configuration option exists until validated in the pinned version.
Framework documentation references for that investigation:
[Express](https://www.better-auth.com/docs/integrations/express),
[sessions](https://www.better-auth.com/docs/concepts/session-management),
[account linking](https://www.better-auth.com/docs/concepts/users-accounts),
[security](https://www.better-auth.com/docs/reference/security),
[Apple](https://www.better-auth.com/docs/authentication/apple).
These are investigation references, not evidence of a completed spike.

## Authentication and lifecycle contract

- New host-only secure HttpOnly cookies use a distinct `mybookshelf_auth` prefix,
  never `mb_session`/`mb_key`. Default SameSite=Lax; if Apple requires a temporary
  SameSite=None secure correlation cookie, scope and test that cookie explicitly.
  Never relax the main session or global origin policy without evidence.
- Exact production/stable-staging origins and callback URLs are configured per
  environment. No wildcard preview origins. Ephemeral previews disable real auth
  unless isolated configuration is deliberately supplied. Local dev uses explicit
  local origins. Return destinations are normalized allowlisted `/app/` paths;
  reject schemes, protocol-relative paths, backslashes, encoded traversal and
  malformed input. Exclude sign-in/reset loops from return targets.
- Disable session cookie caching initially. Every private operation checks active
  session, verified email, active app-user status and expiry. Renewal updates idle
  expiry no more than daily; absolute expiry is based on original session creation,
  never refreshed by sliding renewal. Recent-auth proof is server-side, bound to
  user/session/action, expires in 5 minutes and is consumed for destructive actions.
- Verification lasts 24 hours; reset 30 minutes; pending email change 30 minutes.
  Token delivery uses vetted library APIs. Do not log query strings on token paths;
  apply no-referrer/no-store, remove token from visible URL after exchange, and
  require explicit continuation before a scanner can consume verification.
- No automatic trusted-provider email linking. Google/Apple subjects identify
  provider accounts. Accept a provider email as verified only under the pinned
  provider's documented verified-email assertion; otherwise run verification.
  Missing name gets a completion step. Apple first-login name is captured once;
  relay address is a valid private address, not a matching key for another account.
- Linking requires existing session + recent auth + fresh provider authorization
  bound to a link intent. Unlink serializes method changes and verifies a usable
  method remains. Password setup requires verified email and recent auth; reset
  must not accidentally create a password account for arbitrary social-only email.
- Email change verifies the new address before replacing the old, checks unique
  ownership at commit time, notifies the old address, rotates current session and
  revokes others. A failed/expired request leaves old email intact. Provider subject
  identifiers do not change when the account contact email changes.
- Password reset revokes all sessions; change revokes others and rotates current.
  Use the library's supported password hashing with measured resource limits.
  Compromised-password screening must avoid transmitting raw passwords; select
  a local list or privacy-preserving supported mechanism in S01 and document outage
  behavior. Password policy is 15–128 characters without forced composition.

## Data model, identities and ownership

Logical schema below is a design, not executable DDL. Timestamps are UTC. Database
constraints enforce uniqueness and caps are checked under a user-scoped transaction
lock. Auth rows use the selected library's actual naming and supported migrations.

| Entity | Keys / fields / constraints | Ownership and lifecycle |
| --- | --- | --- |
| Auth user/session/account/verification | Generated by pinned Better Auth version; unique provider+subject and supported email uniqueness | Auth runtime role only; never directly exposed. Library lifecycle APIs own mutations. |
| `app_users` | UUID PK; unique auth-user ID; status active/deleting; profile_revision; created_at | Idempotent provisioning on first verified access; private name/email canonical in auth user. Lock this row for account mutations. |
| `user_settings` | user PK; revision; history_enabled=false; shelf_revision=0; history_generation=0 | One per app user. Revisions increment transactionally; settings/lifecycle changes conflict rather than silently overwrite. |
| `user_libraries` | user+directory_id PK; selected flag; partial unique index on user where selected | Only selected library exposed in v1; no public membership. Validate stable ID via existing directory. |
| `book_refs` | UUID PK; unique exact key digest plus exact canonical `bookKey`; optional validated ISBN/work/edition/catalog IDs; permitted bounded display snapshot | Shared reference metadata only; no owner, save/view counters or reading history. Exact-key comparison guards digest collisions. No fuzzy identity inference. |
| `user_books` | user+book_ref PK; saved_at; source optional enum | Private saved relationship. At most 1,000 active rows/user. Import uses import time as saved_at, not legacy viewedAt. |
| `recent_book_views` | user+book_ref PK; viewed_at; source enum | Private; newest 50 within 30 days; API filters expiry even if cleanup lags. |
| `guest_imports` | user+import_id unique; canonical payload hash; resulting counts/revisions; acknowledged_at | Idempotency receipt, no retained raw snapshot. Retain 30 days; stale revisions prevent later accidental replay as a new operation. |
| `account_operations` | user+operation_id unique; request hash; minimal result, created_at | 24-hour idempotency receipts, no credentials. Expired IDs require fresh preconditions; never blindly replay. |
| `recent_auth_proofs` | opaque proof hash; user/session/action; expiry/consumed flag | Only if supported plugin primitives cannot provide equivalent semantics; validate in S01. Purge after expiry. |
| Durable outbox / deletion jobs | random job ID; kind; attempt/state/next_at; minimal encrypted payload where necessary | Dedicated worker role. Mail payload containing token is encrypted and removed at send/expiry. Never accessible to application users. |
| Deletion suppression ledger | immutable internal user/auth IDs; requested/cleaned_at; suppression_until; provider cleanup status | Restricted operations store outside restored application snapshot; no email/book content. Enforce restore suppression before serving traffic. |

Book keys follow current validation, including long VPL catalog keys up to 4,096
characters where allowed. Do not impose a generic 512-character limit that breaks
existing references. Use a digest index to avoid oversized Postgres B-tree entries,
then compare full key. Accept only known key formats; do not fetch arbitrary
client-supplied URLs. Cover links obey current allowed hosts; reference metadata
is treated as untrusted text and retains provider restrictions/attribution. An
unresolved reference remains saveable. Shared metadata is not exported as a list
of who read it and does not retain private relationship timestamps.

Roles: migration owner holds DDL; auth runtime has generated auth-table grants;
application runtime is **not** table owner/superuser/BYPASSRLS; worker has narrow
job/deletion grants. Private tables use enabled and forced RLS with owner matching
a transaction-local app-user context. A request acquires one pooled connection,
begins a transaction, sets context using `set_config(..., true)`, checks active
status/ownership, performs operations, commits/rolls back and releases. Never use
session-level SET or alternate pool calls inside the transaction. No user context
means deny. Application authorization remains necessary because an API credential
could set arbitrary context; RLS is defense against omitted predicates, not a
replacement for session validation. Test actual role and pooled reuse at T02.

## Private API contracts

All paths below are proposals under `/api/account`. Auth flows remain under
Better Auth's `/api/auth`; exact generated endpoints are encapsulated by the app
adapter. Requests never accept an owner ID. JSON responses are `private, no-store`
with no CDN cache; private routes are noindex. Mutations require same-origin
Origin/Referer validation plus CSRF token tied to session; reject absent/invalid
browser proof. OAuth callbacks use their protocol's state validation, not the
custom JSON CSRF handler. Ordinary payload limit 32KiB; import 2MiB. The import
preview checks serialized UTF-8 size as well as item counts; oversize snapshots
produce a clear limit error without changing or discarding local data. Test the
largest supported key/metadata fixtures against the actual platform request cap.

Errors: `{error:{code,message,requestId,retryAfterSeconds?}}`, with safe messages.
Use 401 session missing/expired, 403 unverified/recent-auth/origin, 409 version or
idempotency conflict, 413 payload limit, 422 invalid input/quota, 429 shared limit,
503 dependency unavailable. Non-owned object IDs return 404. DB failures never
look like empty shelves or successful writes.

| Method / path | Request / response and invariant |
| --- | --- |
| GET `/state` | Profile summary, selected library, counts, settingsRevision, shelfRevision, historyGeneration, historyEnabled; authenticated bootstrap, no auth secrets. |
| PATCH `/profile` | private name + expected profile revision; validated canonical result. Auth adapter implements revision-safe update. |
| PUT `/library` | directory ID or null + settingsRevision + operationId; 409 on stale revision. |
| GET `/books?cursor=&limit=` | default 50/max 100; stable order saved_at DESC, reference ID DESC; opaque cursor bound to shelfRevision. 409 if shelf changed during pagination, then restart. |
| PUT `/books` | exact book reference + shelfRevision + operationId; idempotent save, bounded metadata and quota. No arbitrary URL retrieval. |
| DELETE `/books/:referenceId` | shelfRevision + operationId; remove relationship only; result includes new revision and 10-second undo eligibility. |
| POST `/books/undo` | prior removal operationId + returned shelfRevision + new operationId; restore exact reference only if still within 10 seconds and revision unchanged. |
| POST `/books/clear` | shelfRevision + operationId; confirmed whole-account clear, increments revision even if empty. |
| GET `/history` | valid last 30-day entries, newest 50; current generation and enabled state. |
| POST `/history/views` | reference + source + historyGeneration + operationId; server now for live views; record only when enabled and generation current. |
| DELETE `/history/:referenceId`, POST `/history/clear` | historyGeneration + operationId; remove/clear and increment generation, even for an absent entry/empty list. |
| PATCH `/history/settings` | enabled + settingsRevision + operationId; increment settings revision and history generation on change. |
| POST `/imports` | importId, canonical frozen snapshot, includeHistory, explicit library policy, expected settings/shelf/history versions; one transaction or no changes. |
| POST `/export` | recent-auth proof + operationId; streaming versioned JSON attachment, no persistent download URL. Snapshot isolation gives a coherent export. |
| POST `/deletion` | recent-auth proof + operationId + explicit confirmation; durable deletion request receipt, immediate disabled status/session revocation. |

Profile/email/password/provider/session operations use supported auth methods
through policy-enforcing adapters. Do not leave weaker raw auth endpoints usable
around recent-auth or linking controls; test every exposed route. If an operation
needs an application wrapper, its original endpoint must enforce equivalent policy
or be disabled. Document the final route list during S01/S03.

## Concurrency and retry rules

All reading mutations lock the app-user row, verify active status and expected
versions, then commit mutation and receipt together. Check an existing operation
receipt first **within the verified user's scope**: identical ID/hash returns the
prior result; changed payload returns 409. A duplicate receipt does not bypass a
deleted-account/session check. Use server time for ordering and expiry.

- **Shelf:** one monotonically increasing shelfRevision covers per-reference
  mutations and bulk clear. This intentionally rejects simultaneous independent
  edits too; the client refreshes and invites retry. No full-array replacement.
  Removal/clear advances the revision, so old save/undo requests cannot resurrect
  content. No unbounded tombstone table is needed. Same-operation retry is safe
  even after a lost response. Already-saved/no-op results return current versions.
- **History:** view events carry generation; pause/remove/clear advances it under
  the same lock. A delayed old event is rejected, not reissued with a fresh
  generation. Concurrent current-generation views upsert by exact key and trim
  by server time plus stable reference-ID tie-break. Remove may invalidate pending
  views of other books; that conservative behavior is accepted in v1.
- **Import:** validate the whole bounded payload first; max 100 guest saves/50
  recent, known source enum, timestamps and key lengths. Server removes duplicate
  exact keys; ignores expired history with reported count; rejects malformed or
  future-dated entries. Calculate union quota; overflow returns no partial import.
  Import may add historical rows while collection is off because consent is for
  this import only. Existing more-recent server history wins; trim to 50. Existing
  account library wins unless the explicit policy chooses the validated device
  library. Write receipts/revisions atomically. After acknowledgement, local cleanup
  compares the frozen snapshot with current device data and removes only unchanged
  imported entries, preserving concurrent guest changes.
- **Delete versus writes:** status transition uses the same user lock. Writes
  committed before it are included in deletion; writes after it fail. Revocation
  and app-user disable must produce no interval allowing private API access;
  if auth-session cleanup cannot share a transaction, disabled status is the
  immediate gate while retryable revocation follows. Auth sign-in hooks also reject
  a deleting user; never lazily recreate it through provisioning.

## Abuse, threats and failure handling

Use a shared Postgres-backed limiter initially; do not reuse the public router's
process-local counters. Proposed starting limits (tune with evidence): failed
credential attempts 5 / 15 min per normalized-address hash and 30 / 15 min per trusted
IP; signup/reset/resend/email-change 3 / 15 min per address and 20 / hour per IP;
private mutations 120 / min per user; imports 5 / hour, exports 3 / hour, deletion attempts
3 / hour per user. Use keyed HMAC for sensitive limiter keys and expire buckets
within 24h. Provider callbacks have independent bounded limits so routine redirects
are not broken. Validate trusted proxy chain on Vercel; never trust arbitrary
X-Forwarded-For. Apply pre-hash limits and bounded hashing concurrency. Fail account
mutations/auth attempts safely on limiter/DB outage; public routes keep working.

Threat tests cover stolen/revoked sessions, CSRF/login CSRF, open redirects,
email enumeration, token replay/link scanners, provider subject collisions,
concurrent last-method unlink, IDOR, pooled RLS leakage, stored metadata XSS,
import abuse, stale cross-user UI responses and restored deleted users. Never
log request bodies/cookies/query tokens/passwords; redact auth error stacks at
the boundary. Audit only security-event type, timestamp and pseudonymous internal
identifier when required; restricted logs expire in 7 days. Aggregate operational
metrics contain no identity or reading labels. Security event storage and access
must be documented in the privacy text before release.

## Jobs, retention, environments and rollout

Durable Postgres outbox plus an authenticated scheduled worker is sufficient for
v1; do not rely on in-process timers surviving a Vercel request. Lease jobs with
bounded batches, backoff and idempotent effects. Proposed mail attempts: immediate,
1,5,15 minutes, then hourly until token expiry; terminal failure prompts resend
and alerts the operator. Expired tokens are never emailed. A mail provider's
accepted response means submitted, not delivered. Dead-letter jobs expose safe
metadata to operations, never message/token contents.

Hourly retention work removes expired history, tokens/proofs and receipts.
Deletion job removes owned settings, libraries, saved/history/import/operation
rows, auth accounts/session/user rows and outstanding private jobs. Revoke Apple
authorization as supported/required by its integration, and other stored provider
tokens, before discarding the encrypted credentials needed for cleanup. Local
access remains disabled during retries. Retain only encrypted minimum provider
revocation material in a restricted job while retrying; alert at 24h and resolve
within 30 days. Shared book metadata survives only if independently permitted;
orphan references can be garbage collected without deleting another user's save.

Target live private-data cleanup within 24h; backups expire within 30 days. The
restricted suppression ledger survives 35 days after completed cleanup and exists
outside the restored database snapshot. Restore into isolation, replay ledger
deletions and invalidate sessions/jobs before network access. Expire any snapshot
older than the supported retention window; never serve it. Audit backup provider
retention capability at P01; a plan unable to meet this policy blocks release
until configuration or policy is reviewed. Legal indefinite retention is not
assumed. Export/deletion copies downloaded by the user are outside app deletion.

P01 creates isolated development/staging/production databases and roles, budgets,
backup policy and a stable staging origin. P02 establishes owned mail domain,
SPF/DKIM/DMARC and deliverability/relay checks. P03/P04 configure separate Google
and Apple credentials/callbacks, with Apple primary App ID/Services ID/domain
eligibility and client-secret renewal reminders before its expiry (maximum
six-month validity). Deepak owns provider accounts/budget decisions; engineering
owns configuration/runbooks; the named on-call owner is confirmed at S20.

Deployment sequence after R02: run reviewed additive migrations using migration
role → verify grants/RLS under runtime roles → deploy accounts disabled → test
isolated staging → complete T01–T06 and R03 → enable production deliberately at L01.
Check actual Vercel repository/branch/domains first; historical STATUS notes are
not current deployment evidence. Limit pool size for concurrent instances and use
the provider's pooled endpoint; migrations use its supported direct path.

Rollback disables new account entry and mutations, keeps public browsing available,
and returns account-unavailable UI without exposing guest/account mixtures. Revert
application only to a schema-compatible build; do not drop private tables or undo
user data writes. Continue deletion/retention workers. A security incident also
revokes sessions as required. S20 documents operator, commands, alert thresholds,
restore evidence and exact rollback candidate before R03.
