# Account implementation record

Updated 2026-11-01. Feature code is implemented on `account-settings` in
[PR #57](https://github.com/ddk220-light/MyBookshelf-web/pull/57).
[Validation](VALIDATION.md) records the tested code and remaining release exits;
[operations](OPERATIONS.md) records actual resources and configuration.
**R03 and production rollout remain pending.**

Deepak approved the documents and Claude canvas v4 (`1793518146-c9ad`) at
`36a1436`, then authorized story-by-story child-task publication and implementation.
This supersedes the older requirement to publish every child before R02.

## Implemented behavior

- Optional, lazy account service shared by local and Vercel entry points. Public
  catalog browsing does not initialize auth or a database. Account outages retain
  explicit guest continuation and never redirect private writes into guest storage.
- Better Auth 1.7.14/native Postgres adapter, pg 8.23.1, no ORM or auth fork.
  Transactions, native password hashing, encrypted provider tokens and supported
  protocol/lifecycle APIs enforce app contracts. Breach screening sends only a
  padded SHA-1 prefix, normalized to the NFKC spelling the native verifier accepts.
  Password work has two active slots, eight waiting slots and a one-second wait.
- Signup, deliberate scanner-safe verification, sign-in, recovery/reset, fresh
  action-bound proof, password change/setup and device/session revocation. Sessions
  have seven-day idle and thirty-day absolute bounds. Token and notification
  failure tests prove transactional rollback rather than partial success.
- Google and Apple redirect sign-in, conditional branded entry, missing-name
  completion, explicit link, safe unlink and provider reauthentication. Native
  state/PKCE/nonce/signature/issuer/audience validation remains enabled. Expiring
  intents bind the original owner/session; final usable methods cannot be removed.
  Only Apple's temporary correlation cookie is SameSite=None/Secure. No implicit
  email linking, provider-photo retention or email fallback for recent auth.
- Revision-safe private name and verified new-email change, with old-address
  security notices, current-session rotation and revocation of other sessions.
- Separate auth/reading/worker roles, non-owner/non-BYPASSRLS checks, forced RLS,
  transaction-local owner context, active-identity fences, strict routes/payloads,
  exact origins, session CSRF, safe returns and shared database-backed abuse limits.
- Versioned selected library, up to 1,000 exact saved references, stable signed
  pagination, acknowledged mutations, ten-second conditional undo and clear fencing.
  History starts off; explicit confirmed views keep the newest fifty for thirty
  days. Paused/deleted/cleared generations reject late writes.
- Explicit frozen guest import, separate history consent, account-library default,
  all-or-nothing quota/version checks and hash-bound retry receipts. Guest writes
  and compare-before-remove cleanup coordinate through Web Locks; unsupported
  coordination retains the device copy. Concurrent guest edits are preserved.
- Account data/caches/proofs stay in browser memory, scoped by identity and epoch.
  Cross-tab/refocus invalidation, rejected stale responses and truthful uncertain
  sign-out protect shared devices. Guest shelves retain their independent storage,
  recovery behavior and 100-book limit. Ordinary guest bootstrap preserves its
  selected-library display; confirmed metadata refresh preserves original view time.
- Export requires recent auth and streams a coherent, owned JSON attachment with
  bounded backpressure. It omits credentials, tokens, session IDs and expired
  history, and creates no persistent export object or URL.
- Deletion atomically disables the identity and revokes all sessions. A memory-only
  nonce recovers status after a lost response without resubmitting. Live purge
  waits for an independent suppression record and encrypted cleanup copy. Leased,
  fenced workers retry provider revocation; material expires within thirty days.
  Minimal suppression persists thirty-five days after live cleanup. A guarded
  isolated restore reconciles that ledger and invalidates restored authentication
  before traffic can resume.
- Encrypted durable mail, bounded maintenance endpoint, expiry without mail
  credentials, safe request IDs, aggregate health/overdue checks, opt-in staging
  scheduler workflow and operational/restore tooling. Scheduler code is checked
  in; it is not yet an active hosted schedule.
- Account entry/settings/export/deletion UI follows the approved typography,
  reading lights and native dialog patterns. Destructive confirmation includes
  explicit consent, keyboard cancellation/focus restoration and recoverable errors.
  Website privacy/support copy now describes optional accounts while retaining
  the separate native-app policy.

## Staging resources actually verified

| Resource | Identifier / state |
| --- | --- |
| Vercel project | `prj_tlwAzT2LGtV1HDRfW7DzhiWWihFF`, `mybookshelf-accounts-staging`, Node 22/iad1 |
| Stable staging origin | `https://mybookshelf-accounts-staging.vercel.app`, `account-settings` preview branch |
| Neon database | `bold-band-47854367`, `store_tVhnBuK6FDTErqQ5`, existing Free plan |
| Independent private ledger | `store_Gs9zkvOMQteZihLA`; real authenticated operations and anonymous-read denial pass |
| Provisioned export store | `store_anEQSluYF2hXAEQT`; unused by v1 streaming export |
| Schema | Migrations 001–011; real staging names/checksums verified read-only on 2026-11-01 |

Runtime credentials are Preview/account-settings only. The staging administrator
connection is Development only. Separate runtime roles and grants were verified
against staging; no decrypted credentials are stored in repository files.
The temporary provisioning token expired and was removed from session storage;
no persistent administrator API token was created.

Production provisioning was rejected by automatic approval review earlier;
production remains deferred to R03. Existing production domains, credentials and
Git connection to `MyBookshelf/main` remain unchanged. Neon plan metadata does not
prove its actual backup lifetime. Hosted retention/restore evidence is still needed.

## Progressive task publication

Native tasks were created and added to the existing project before work on each
reached story. Parent stories retain their complete acceptance criteria, including
required live evidence; implementation is not equivalent to release approval.

| Story | Child tasks |
| --- | --- |
| P01 / S01–03 | #58–68 |
| P02 / S04–07 | #69–72, #80–83, #91–92 |
| S08–10 | #116–119, #123–124 |
| S11–14 | #93–100 |
| S15 | #129–130 |
| S16–18 | #101–103, #105 |
| S21 | #106, #111 |
| S19 validation consolidation | #131, reusing existing T01–T06 #42–47 |
| S20 operations | #132–133 |

Outstanding external exits: real Google/Apple credentials and designated-account
round trips (including mobile Safari/relay), explicit Resend legal-policy consent
and real mail/domain delivery, scheduler secret access/activation/notifications,
hosted backup-retention and isolated restore audit, real assistive-technology and
second-operator evidence. These remain visible in VALIDATION.md and the project.
No product scope, Apple requirement or R03 gate has been waived.
