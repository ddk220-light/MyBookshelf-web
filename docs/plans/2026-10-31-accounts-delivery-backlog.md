# Accounts and social reading delivery backlog

Date: 2026-10-31. Status: proposed backlog preserved for GitHub publication.
Owner: Deepak Ravikumar. Repository: `ddk220-light/MyBookshelf-web`.

The existing [planning index, issue #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1)
is the only created issue. A native GitHub Project, child epics/stories and task
issues have **not** been created. Publication paused while Projects credentials
were being fixed. Stable IDs below are planning IDs, not GitHub issue numbers.

Use the [foundation analysis](2026-10-31-accounts-social-foundation.md) for rationale
and the conceptual data model. This outline does not replace a PRD or authorize
executing proposed migrations. Initial proposed inventory: one index, seven epics,
five definition tasks, twenty account stories, seven future discovery stories.

## First five tasks: define the work before implementation

| ID | Task | Completion evidence | Dependencies |
| --- | --- | --- | --- |
| D01 | Build the account PRD | Goals, users, MVP/non-goals, account flows, signup fields, guest behavior, sync/history/privacy rules, success criteria, failure behavior, dependencies, open decisions and measurable release acceptance. Social features explicitly deferred. | Foundation analysis |
| D02 | Build UX design | Desktop/mobile journeys for signup, verification, sign-in, recovery, provider return, explicit linking, sign-out, settings, guest import and sync failures; accessible content and all empty/loading/error states. | D01 |
| D03 | Build engineering implementation plan | Versioned auth integration spike, schema/migrations, ownership/RLS, APIs, identity reuse, concurrency/import/history rules, runtime roles, environments, mail/OAuth setup, threat review, test strategy, rollout/rollback and operational responsibilities. | D01; use D02 as journeys settle |
| D04 | Build UI implementation plan | Route/component/state inventory, storage/auth adapters, API contracts, session/cache isolation, responsive/theme behavior, accessibility and visual acceptance tied to current design references. | D01, D02, D03 contracts |
| D05 | Create detailed tasks for every story | Each ready story has linked, independently verifiable engineering/UI/configuration/test tasks, dependencies and completion criteria; missing decisions become explicit definition tasks. Future stories receive requirements/discovery tasks before implementation decomposition. | D01–D04 for account stories; F01–F07 require definitions first |

Create these tasks first in GitHub. They belong to E00. Their outputs live in this
repository and link back to their issues. D05 is an ongoing decomposition task,
not permission to expand undefined social behavior into implementation scope.

## Epics

| ID | Epic | Exit condition |
| --- | --- | --- |
| E00 | Product, UX and delivery definition | D01–D05 produce reviewable specifications and the account stories have clear acceptance/dependencies. |
| E01 | Account engineering foundation | S01–S03 establish the integration, durable schema and private access boundaries. |
| E02 | Authentication and account lifecycle | S04–S10 cover credential/social login, recovery, sessions and explicit linking. |
| E03 | Private reading synchronization | S11–S15 synchronize libraries/books/history and handle import, export and deletion. |
| E04 | Account UI implementation | S16–S18 deliver the designed flows on desktop/mobile without losing guest use. |
| E05 | End-to-end validation and operations | S19–S20 demonstrate real flows, isolation, deployment safety and supportability. |
| E06 | Social reading expansion — requirements and definitions needed | F01–F07 define future behavior, privacy, moderation and data ownership before scheduling implementation. |

## Account stories

All stories start as **Planned — specification/decomposition needed**. The
acceptance below guides the PRD and must be reconciled with its final decisions.

### E01: account engineering foundation

| ID | Story | Acceptance direction | Depends on |
| --- | --- | --- | --- |
| S01 | Integrate Better Auth with the existing Express/Vercel app | Pin a patched version; prove Express 4/ESM routing before retired API fallbacks and JSON handling, trusted origins, cookie behavior and adapter/transaction support. Auth/database failure leaves anonymous catalog browsing usable. | D03 |
| S02 | Establish Postgres schema, migrations and runtime configuration | Auth tables generated from the selected version; app user/settings/library/book reference/save/history/import tables, constraints and indices; pooled runtime and separate migration access; isolated staging data, backup/restore policy. Reuse existing Open Library/ISBN/catalog identities and permit unresolved references. | S01, D03 |
| S03 | Enforce private API ownership and abuse controls | Session-derived user identity, parameterized queries, owner checks and transaction-local RLS tested under the actual runtime role; CSRF/origin checks, shared rate limits, safe logs, private/no-store responses and noindex private routes. Two users cannot access each other's data. | S01, S02 |

### E02: authentication and account lifecycle

| ID | Story | Acceptance direction | Depends on |
| --- | --- | --- | --- |
| S04 | Sign up with name, email and password; verify email | Name/email/password fields, safe password handling and duplicate responses; reliable verification mail, bounded single-use tokens and resend handling. Guest shelf stays available while pending; verified account data sync starts only after verification. | S01–S03, mail configuration |
| S05 | Sign in and maintain secure sessions | Credential sign-in with secure HttpOnly cookies, bounded expiry and a validated in-app return path; no tokens/passwords in localStorage, logs or public responses. Session expiry has a recoverable UI state. | S04 |
| S06 | Recover and change a password safely | Generic request response, actual recovery mail, expired/replayed token rejection, new password setup and session invalidation. Password/email changes require recent authentication and appropriate email verification/notifications. | S04, S05 |
| S07 | Sign out and manage active sessions | Revoke current session; separate all-device sign-out; clear identity-derived browser state and notify other tabs. Offline/failed sign-out does not claim server revocation. Last usable login method remains available. | S05, S03 |
| S08 | Sign in with Google | Separate OAuth client/callback/consent configuration; only identity/email/profile scopes; verified provider return, missing profile handling, cancellation and mobile return. No implicit same-email account merge. | S01–S05, Google configuration |
| S09 | Sign in with Apple | Primary App ID/Services ID, domains/callbacks and signing key configured; first-login-only name and private relay email handled; actual staging flow and client-secret renewal procedure demonstrated. | S01–S05, Apple Developer setup |
| S10 | Explicitly link and unlink login methods | Recent authentication and proof of provider control; implicit linking disabled; collision and Apple relay cases handled; last-method unlink prevented. Existing separate accounts are not merged from matching email/name. | S07–S09 |

### E03: private reading synchronization

| ID | Story | Acceptance direction | Depends on |
| --- | --- | --- | --- |
| S11 | Store and synchronize selected libraries | Persist stable directory IDs; validate through existing directory service; at most one selected library per account, while allowing future multiple memberships. Choice appears on another signed-in device and stays private. | S02, S03, S05 |
| S12 | Store and synchronize saved books | Idempotent per-reference save/remove; separate saved/viewed timestamps; preserve edition/catalog identity, paginate shelves, handle concurrent devices without whole-shelf replacement. Unknown work relationships do not prevent saving. | S02, S03, S05 |
| S13 | Store and control recently viewed books | Bounded recent distinct references; proposed newest 50 within 30 days to settle in PRD. Pause/remove/clear controls, generation protection against stale writes, expiry cleanup and private visibility. | S02, S03, S05 |
| S14 | Import a device's guest shelf with consent | Show saved-book count and separate recent-history choice; preserve existing account library unless explicitly changed; bounded transactional idempotent import, safe retries/payload validation and original snapshot retained until acknowledgement. | S11–S13 |
| S15 | Export and delete account data | Authenticated export excludes secrets/tokens; recent authentication for deletion; immediate session revocation and retryable private-data cleanup, provider handling and documented backup expiry/restore suppression. | S02–S14 |

### E04: account UI implementation

| ID | Story | Acceptance direction | Depends on |
| --- | --- | --- | --- |
| S16 | Implement the auth journeys and responsive account routes | Signup, sign-in, verify-email, forgot/reset-password and provider returns match D02/D04 at desktop/mobile widths in all reading lights; accessible validation, keyboard/focus behavior, loading/expiry/error/cancellation and safe return navigation. | D02, D04, S04–S09 |
| S17 | Implement account settings and lifecycle controls | Profile/email/password, linked providers, sign-out/all devices, export/delete and history controls with clear pending/failure/success behavior. Never make signup name/email/library/history public by default. | D02, D04, S06, S07, S10, S13, S15 |
| S18 | Connect reading screens to guest/account storage | Repository abstraction replaces direct persistence calls; guest use preserved; cloud data authoritative while signed in; import consent and save rollback/retry; late old-identity responses ignored and cross-tab caches cleared on account change. Initial signed-in cache is in-memory without an offline mutation queue. | D04, S11–S14, S16, S17 |

### E05: end-to-end validation and operations

| ID | Story | Acceptance direction | Depends on |
| --- | --- | --- | --- |
| S19 | Verify account flows and isolation end to end | Device A/B sync, two independent accounts, real mail and Google/Apple callbacks including mobile Safari; recovery expiry/replay, linking collisions, rate limits/CSRF/redirect rejection, concurrent writes, import retry, account switching, deletion and anonymous/SEO regressions. Cover material failure paths as well as successful flows. | S01–S18 |
| S20 | Prepare operations and release | Separate runtime secrets and stable staging, migration/rollback sequence, restore exercise, Apple secret renewal, mail failure/deletion cleanup monitoring, retention/privacy text, dependency update owner and release evidence. Production release uses current deployment state and verified checks. | S19 |

## E06: future expansion — requirements and definitions needed

These are **discovery stories**, not approved implementation stories. Any proposed
social tables in the architecture are directional. Each story must define users,
rules, UX, data semantics, privacy/moderation/deletion and acceptance criteria;
D05 can then produce implementation tasks for an approved release.

| ID | Discovery story | Definitions required before implementation |
| --- | --- | --- |
| F01 | Public profiles and identity | Public opt-in, handles, visible fields, private profiles, discovery, avatar rights, account versus public name, blocking and deletion. |
| F02 | Ratings and reviews | Work versus edition target, external identity coverage/ambiguity study, rating scale, review editing/version rules, spoilers, visibility, aggregation eligibility, reporting/moderation and content deletion. Study BookWyrm and existing catalogs before adding identity infrastructure. |
| F03 | Comments and discussion | Allowed targets, nesting, edit/delete behavior, notifications, reporting, blocking, moderation/appeals and abuse rate limits. |
| F04 | Favorites and reading status | Difference between save/favorite/read/want-to-read, work versus edition semantics, rereads/dates, privacy defaults, import and deletion behavior. |
| F05 | Custom reading lists | List visibility, ordering, work/edition membership, duplicates, sharing, ownership, optional collaboration and export/deletion. |
| F06 | Following and blocking | Follow versus friendship, private-profile requests, block/mute rules across reads/writes/feeds, counts, visibility and abuse handling. |
| F07 | Activity and notifications | Explicit eligible events, recipient/visibility/block checks at delivery and read time, channels/preferences, retention, outbox/retries and unsubscribe. Private recently viewed history is excluded. |

## GitHub publication instructions

Use issue #1 as the index. When Projects access works, create or reuse a
user-owned Project named **MyBookshelf — Accounts and Social Reading** and link
the repository. Search by index marker/title before creating duplicates.

Create D01–D05 first, then epic issues, twenty account stories and seven future
discovery stories, preserving these IDs in titles/bodies. Link each story to its
epic and its dependencies; link every item from the index. Mark E06/F01–F07 as
needing requirements. Track definition/readiness separately from implementation
progress so a completed outline is not mistaken for a shipped account feature.

Suggested board fields: Status, Kind (definition/epic/story/task), Epic, Scope
(account/future discovery), Planning ID and readiness. Adapt to the available
Projects schema rather than assuming fields already exist. If native sub-issues
are unavailable, parent/dependency links and task lists preserve the hierarchy.

After D05, each story's child tasks should identify the concrete deliverable,
relevant specification/API/schema/UI dependencies, meaningful verification and
remaining external setup. Keep task bodies and specifications in sync when
requirements change. [Credential notes](../development/credentials.md) record
the current blocker; do not silently mark the Project as created.
