# Account implementation record

R02: Deepak approved all artifacts at `36a1436` on 2026-11-01 and authorized
implementation. Claude artifact: v0.2 / canvas version 4 (`1793518146-c9ad`).
The owner explicitly requested progressive task publication: expand each story
when reached, then implement and verify its tasks. This supersedes the older
D05-publish-all-before-R02 rule. R03 still gates the production release.

## Current foundation

- Shared local/Vercel application composition with lazy optional account service.
  Public catalog requests never initialize auth or database code.
- Exact Better Auth 1.7.14 and pg 8.23.1; native Postgres adapter, no ORM.
  Database transactions are enabled by the native adapter. Cookie cache is off;
  implicit linking is disabled; provider tokens use library encryption support.
- Version-generated auth migration and app-owned identity/settings/library/book/
  history/import/operation schema. Migrations are transactional, locked and
  checksum-checked; requests never run DDL.
- Separate auth and reading roles; forced row security, transaction-local owner
  context, lifecycle row locking and explicit rejection of privileged runtime roles.
- Narrow session bootstrap, server-cookie renewal forwarding, absolute 30-day
  expiry and idempotent app identity provisioning. Deleting identities cannot be
  reactivated by provisioning. Raw session tokens never reach the bootstrap JSON.
- App facades now implement signup/one-use scanner-safe verification, sign-in,
  recovery, atomic reset/change, fresh-session recent-auth proof and device
  revocation. Raw sensitive auth protocols remain disabled so policy cannot be
  bypassed. Password screening sends only a padded HIBP hash prefix.
- Mail enqueue joins supported Better Auth transactions. Encrypted durable jobs
  use fenced leases, provider idempotency IDs, bounded retries and ciphertext
  removal after send/expiry. Actual delivery awaits the staging sender setup.
- Private reading APIs implement versioned library preference, exact-reference
  saved books, signed revision-bound pagination, conditional ten-second undo,
  quota/clear fencing and opt-in bounded history with generation protection.
  A separate reading pool revalidates the session under the owner lock.

## Evidence

Node 22.23.4, local PostgreSQL 18.6. Six account tests/suites cover actual
Postgres roles and pooled reuse, raw Express body handling, verification,
password reset rollback, token replay/revocation, session renewal/absolute expiry,
concurrent identity provisioning, deleting identities, origin checks and account
outage isolation. These tests are included in the server test command and CI,
which now provisions a disposable Postgres service.

Full server suite at this checkpoint: 506 passing. Client suite: 134 passing after compatible
security maintenance (Vite 6.4.5, Vitest 4.1.12 and patched transitive packages).
Dependency audit: zero findings at this checkpoint. No claim of final browser,
real-provider, real-mail or release validation is made.

## Staging setup

Isolated resources in iad1:

| Resource | Identifier |
| --- | --- |
| Vercel staging project | `prj_tlwAzT2LGtV1HDRfW7DzhiWWihFF` / `mybookshelf-accounts-staging` |
| Neon staging project | `bold-band-47854367` / store `store_tVhnBuK6FDTErqQ5` |
| Private export store | `store_anEQSluYF2hXAEQT` |
| Independent private deletion ledger | `store_Gs9zkvOMQteZihLA` |

Neon uses the existing Free plan. Migrations were applied to the real staging
DB, and both runtime roles were authenticated and verified as non-superuser and
non-BYPASSRLS. Hosting secrets were configured directly in Vercel. The migration
administrator connection is connected only to the staging project's development
environment. Runtime credentials are scoped to the account-settings preview
branch; the staging project's default target has no account credentials. No decrypted credentials are saved in the
repository or local files. Account entry remains disabled until its service
stories pass. Real backup/restore and deletion-ledger drills remain T06.

Production resources have not been created. Automatic approval review rejected
production provisioning; it is deferred while staging supports implementation.
The existing production site's repository/domain/configuration is unchanged.

## Task publication

Native tasks created as work reached P01/S01/S02/S03:

- P01-A #58, P01-V #59, P01-B #67.
- S01-A #60, S01-B #61, S01-V #62.
- S02-A #63, S02-V #64.
- S03-A #65, S03-V #66, S03-B #68.

Parent stories remain open until their full acceptance criteria pass, including
hosted/provider exits. D05 tracks progressive decomposition, not a prerequisite
requiring every future child to exist before implementation starts.

Additional tasks published and linked as reached:
P02 #69–70; S04 #71–72; S05 #80–81; S07 #82–83; S06 #91–92;
S11 #93–94; S12 #95–96; S13 #97–98; S14 #99–100.

Current verification also covers password-proof rotation, atomic notification
failure rollback with token/session preservation, concurrent library edits,
operation receipts, private metadata, long valid VPL identities, microsecond
pagination, the 1,000-book boundary, history opt-in/pause/expiry/trim and late writes.
Production build passes. The new client has 131 passing tests, including delayed identity responses,
retry request identity, cache isolation, compare-before-remove import cleanup,
uncertain sign-out, initial-form preservation and scanner-safe links. Twelve real
loopback browser→API→Postgres journeys pass on Chromium desktop/mobile, covering
all three lights, signup/verification/sign-in/profile/sign-out, explicit import
and copy cleanup, history opt-in, two-device refresh/revocation, email change and
account switching, with account-settings axe checks. Mail transport in those journeys is an explicitly synthetic outbox
reader; this is not real delivery/provider evidence.

Atomic guest import and the asynchronous account/guest client repositories are
now implemented, together with entry/recovery/import screens and initial settings
for private name, password, history and signed-in devices. Account-linked reader,
availability and lookup caches stay in memory. Identity invalidation clears search,
reader, catalog and library-discovery memory, with a nonce-only cross-tab fallback.
Unknown/unavailable sessions require explicit guest continuation. A persistent
non-sensitive guest override prevents private hydration after uncertain sign-out.
The local browser harness refuses non-loopback/non-test databases and is absent
from deployed entry points.

S16 #101, S18 #102–103, S17 #105 and S21 #106 are published and linked.
Verified email change now uses the pinned library’s public token issuer with
random per-message IDs, a 30-minute owner/session-bound application challenge,
explicit scanner-safe continuation, pending cancellation and atomic old-address
notices. Tests prove rollback of token/email/session changes on notice failure,
expiry, same-second cancelled-link replay and collisions. Schema 006 and 007 are
applied to staging. The latter adds a narrowly granted boolean session recheck
under the existing owner lock; it avoids leasing an auth connection while the
reading transaction holds that lock. The reading role still cannot select auth
tables or tokens.

Private reading requests carry a reject-only `X-Account-Identity` precondition;
the server continues to derive ownership from the verified cookie. The client
rejects stale reads begun before a confirmed mutation. Explicit sign-in revokes
the former current-browser session and publishes the new identity before private
navigation; old sign-out responses cannot replace that identity.

Google/Apple redirect facades and conditional entry/return/name-completion UI are
implemented. A supported provider adapter uses the pinned library’s nonce/state
store and ID-token verifier. Native protocol tests cover Google and Apple state,
PKCE, signature, issuer, audience and nonce failures, relay addresses, missing
names, replay and forbidden implicit linking. These use controlled provider
responses with real signed fixture tokens and actual Postgres/native sessions;
they do not substitute for live provider testing.

S08 #116–117, S09 #118–119 and S10 #123–124 are published and linked. Explicit
provider link/reauth intents bind user/session/provider for five minutes. Provider
reauth requires the exact connected subject, rotates the current session and
returns a one-use proof through an authenticated POST, then a separate UI
confirmation. Serialized unlink protects the final configured usable method.
First password requires verified email plus recent auth; provider-confirmed
password changes use supported server-only hashing/session helpers. Required
method notices share the mutation transaction; injected DB failures prove link
and first-password rollback. Password work has a per-process two-job budget with
eight waiting slots and a one-second wait limit, alongside shared abuse limits.
Schema 008 is applied to staging with runtime grants.

Next: export/deletion, retention/restore and remaining browser/release evidence. Real Google/Apple configuration and mail-domain delivery
must be proved before account release. Resend's initial legal-policy acceptance
was presented to the owner and remains pending; no terms were accepted implicitly.
The temporary provisioning credential was removed from session storage at the
end of its authorized setup window. No persistent administrator token was created.
