# Account management delivery backlog

Updated 2026-10-31. Owner: Deepak Ravikumar. Repository: `ddk220-light/MyBookshelf-web`.

The [Account Management project](https://github.com/users/ddk220-light/projects/3)
and [planning index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1)
organize the work. There are 54 child issues plus the existing index: seven epics,
five definition tasks, three owner review gates, four prerequisite tasks,
21 account stories, six final validation tasks, one rollout task and seven future
discovery stories. Planning IDs below are distinct from GitHub issue numbers.

The [foundation analysis](2026-10-31-accounts-social-foundation.md) remains the
architecture direction. PRD, UX, engineering, UI and detailed delivery documents
are scheduled deliverables, not completed or approved artifacts. Implementation
has not started; proposed schemas do not authorize migrations.

## Delivery and owner review gates

1. D01 writes the PRD; R01 records Deepak's explicit review of its version and
   resolves scope/behavior decisions before UX and engineering design finalize.
2. D02 creates UX flows, D03 engineering design and test strategy, D04 UI design,
   and D05 concrete child tasks and the delivery plan. D05 includes estimates,
   ownership, dependency checks and acceptance-to-test traceability.
3. R02 reviews the complete versioned packet. Implementation and provisioning
   depend on this approval. Closing a drafting issue alone is not approval.
4. P01–P04 establish staging, database, mail and provider prerequisites early.
   Implement stories with focused tests. Core storage integration can proceed
   before all settings/provider screens are complete.
5. T01–T06 validate one identified staging candidate. S19 consolidates evidence
   and defects; S20 verifies operations and release readiness.
6. R03 records Deepak's tested-release decision. L01 rolls out the approved
   candidate, checks production and applies the documented rollback criteria.

Each review records exact artifact versions, an explicit approve/changes-requested
decision, and the disposition of comments. Changes affecting approved behavior
return to the relevant review. No implementation or release approval is recorded
by creating this project.

## Planned repository deliverables

The definition tasks create `docs/accounts/PRD.md`, `UX_DESIGN.md`,
`ENGINEERING_DESIGN.md`, `TEST_STRATEGY.md`, `UI_DESIGN.md` and `DELIVERY_PLAN.md`.
Final validation and operations create `VALIDATION.md` and `OPERATIONS.md` in the
same directory. Link reviewable screen artifacts and exact commits from issues.

## Board conventions

Status starts at Todo; it does not imply readiness or approval. Labels distinguish
kind and stage: definition, implementation, validation and future. Dedicated views
cover definition/review, account delivery, implementation, testing/release, owner
reviews and future discovery. Native parent and blocked-by links complement the
linked acceptance/dependency checklists in each issue.

Stories remain specification/decomposition work until the reviewed documents and
D05 child tasks exist. Future social features are excluded from account-release
acceptance and require separate requirements and review.

## Definition deliverables

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [D01 / #2](https://github.com/ddk220-light/MyBookshelf-web/issues/2) | **Write the account-management PRD** — Goals, users, MVP/non-goals, account flows, signup fields, guest behavior, sync/history/privacy rules, success criteria, failure behavior, dependencies, open decisions and measurable release acceptance. Social features explicitly deferred. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | Foundation analysis / child exit criteria |
| [D02 / #3](https://github.com/ddk220-light/MyBookshelf-web/issues/3) | **Design account UX journeys and reviewable screen flows** — Desktop/mobile journeys for signup, verification, sign-in, recovery, provider return, explicit linking, sign-out, settings, guest import and sync failures; accessible content and all empty/loading/error states. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | [R01 / #7](https://github.com/ddk220-light/MyBookshelf-web/issues/7) |
| [D03 / #4](https://github.com/ddk220-light/MyBookshelf-web/issues/4) | **Write engineering design, integration-spike plan and test strategy** — Versioned auth integration spike, schema/migrations, ownership/RLS, APIs, identity reuse, concurrency/import/history rules, runtime roles, environments, mail/OAuth setup, threat review, test strategy, rollout/rollback and operational responsibilities. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | [R01 / #7](https://github.com/ddk220-light/MyBookshelf-web/issues/7) |
| [D04 / #5](https://github.com/ddk220-light/MyBookshelf-web/issues/5) | **Write UI design and implementation specification** — Route/component/state inventory, storage/auth adapters, API contracts, session/cache isolation, responsive/theme behavior, accessibility and visual acceptance tied to current design references. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | [D02 / #3](https://github.com/ddk220-light/MyBookshelf-web/issues/3), [D03 / #4](https://github.com/ddk220-light/MyBookshelf-web/issues/4) |
| [D05 / #6](https://github.com/ddk220-light/MyBookshelf-web/issues/6) | **Decompose approved requirements into reviewable delivery tasks** — Each ready story has linked, independently verifiable engineering/UI/configuration/test tasks, dependencies and completion criteria; missing decisions become explicit definition tasks. Future stories receive requirements/discovery tasks before implementation decomposition. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | [D01 / #2](https://github.com/ddk220-light/MyBookshelf-web/issues/2), [D02 / #3](https://github.com/ddk220-light/MyBookshelf-web/issues/3), [D03 / #4](https://github.com/ddk220-light/MyBookshelf-web/issues/4), [D04 / #5](https://github.com/ddk220-light/MyBookshelf-web/issues/5) |

## Owner review gates

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [R01 / #7](https://github.com/ddk220-light/MyBookshelf-web/issues/7) | **Review and approve the PRD** — Deepak reviews the versioned PRD and open decisions; record an explicit approve/changes-requested decision with the reviewed commit or document version. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | [D01 / #2](https://github.com/ddk220-light/MyBookshelf-web/issues/2) |
| [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8) | **Review and approve UX, UI, engineering design and delivery plan** — Deepak receives the PRD, UX flows, UI screens, engineering design, test strategy and decomposed plan as one review packet. | [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | [R01 / #7](https://github.com/ddk220-light/MyBookshelf-web/issues/7), [D02 / #3](https://github.com/ddk220-light/MyBookshelf-web/issues/3), [D03 / #4](https://github.com/ddk220-light/MyBookshelf-web/issues/4), [D04 / #5](https://github.com/ddk220-light/MyBookshelf-web/issues/5), [D05 / #6](https://github.com/ddk220-light/MyBookshelf-web/issues/6) |
| [R03 / #9](https://github.com/ddk220-light/MyBookshelf-web/issues/9) | **Review tested release and approve production rollout** — Deepak reviews the actual staging candidate, validation report, remaining defects, privacy text and release/rollback plan. | [E05 / #15](https://github.com/ddk220-light/MyBookshelf-web/issues/15) | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39), [S20 / #40](https://github.com/ddk220-light/MyBookshelf-web/issues/40) |

## Epics

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [E00 / #10](https://github.com/ddk220-light/MyBookshelf-web/issues/10) | **Product, UX and delivery definition** — D01–D05 produce reviewable specifications and the account stories have clear acceptance/dependencies. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |
| [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | **Account engineering foundation** — S01–S03 establish the integration, durable schema and private access boundaries. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |
| [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | **Authentication and account lifecycle** — S04–S10 cover credential/social login, recovery, sessions and explicit linking. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |
| [E03 / #13](https://github.com/ddk220-light/MyBookshelf-web/issues/13) | **Private reading synchronization** — S11–S15 synchronize libraries/books/history and handle import, export and deletion. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |
| [E04 / #14](https://github.com/ddk220-light/MyBookshelf-web/issues/14) | **Account UI implementation** — S16–S18 deliver the designed flows on desktop/mobile without losing guest use. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |
| [E05 / #15](https://github.com/ddk220-light/MyBookshelf-web/issues/15) | **End-to-end validation and operations** — S19–S20 demonstrate real flows, isolation, deployment safety and supportability. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |
| [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | **Social reading expansion — requirements and definitions needed** — F01–F07 define future behavior, privacy, moderation and data ownership before scheduling implementation. | [Index #1](https://github.com/ddk220-light/MyBookshelf-web/issues/1) | Foundation analysis / child exit criteria |

## Early external prerequisites

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [P01 / #17](https://github.com/ddk220-light/MyBookshelf-web/issues/17) | **Provision isolated account environments and Postgres** — Stable staging URL and separate production/staging/development credentials and databases; previews cannot reach production account data. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8) |
| [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18) | **Configure transactional email and authenticated sending domain** — Select provider and verify SPF/DKIM/DMARC and sender domain; separate environments and authorized test recipients. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [P01 / #17](https://github.com/ddk220-light/MyBookshelf-web/issues/17) |
| [P03 / #19](https://github.com/ddk220-light/MyBookshelf-web/issues/19) | **Configure Google OAuth for staging and production** — Dedicated OAuth clients, consent configuration, exact redirect/origin allowlists and minimal identity scopes. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [P01 / #17](https://github.com/ddk220-light/MyBookshelf-web/issues/17) |
| [P04 / #20](https://github.com/ddk220-light/MyBookshelf-web/issues/20) | **Configure Apple web sign-in and relay prerequisites** — Confirm Apple Developer access, primary App ID association, Services ID, domains and callbacks. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [P01 / #17](https://github.com/ddk220-light/MyBookshelf-web/issues/17), [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18) |

## Account stories

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [S01 / #21](https://github.com/ddk220-light/MyBookshelf-web/issues/21) | **Integrate Better Auth with the existing Express/Vercel app** — Pin a patched version; prove Express 4/ESM routing before retired API fallbacks and JSON handling, trusted origins, cookie behavior and adapter/transaction support. Auth/database failure leaves anonymous catalog browsing usable. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8), [P01 / #17](https://github.com/ddk220-light/MyBookshelf-web/issues/17) |
| [S02 / #22](https://github.com/ddk220-light/MyBookshelf-web/issues/22) | **Establish Postgres schema, migrations and runtime configuration** — Auth tables generated from the selected version; app user/settings/library/book reference/save/history/import tables, constraints and indices; pooled runtime and separate migration access; isolated staging data, backup/restore policy. Reuse existing Open Library/ISBN/catalog identities and permit unresolved references. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [S01 / #21](https://github.com/ddk220-light/MyBookshelf-web/issues/21) |
| [S03 / #23](https://github.com/ddk220-light/MyBookshelf-web/issues/23) | **Enforce private API ownership and abuse controls** — Session-derived user identity, parameterized queries, owner checks and transaction-local RLS tested under the actual runtime role; CSRF/origin checks, shared rate limits, safe logs, private/no-store responses and noindex private routes. Two users cannot access each other's data. | [E01 / #11](https://github.com/ddk220-light/MyBookshelf-web/issues/11) | [S02 / #22](https://github.com/ddk220-light/MyBookshelf-web/issues/22) |
| [S04 / #24](https://github.com/ddk220-light/MyBookshelf-web/issues/24) | **Sign up with name, email and password; verify email** — Name/email/password fields, safe password handling and duplicate responses; reliable verification mail, bounded single-use tokens and resend handling. Guest shelf stays available while pending; verified account data sync starts only after verification. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S03 / #23](https://github.com/ddk220-light/MyBookshelf-web/issues/23), [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18) |
| [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25) | **Sign in and maintain secure sessions** — Credential sign-in with secure HttpOnly cookies, bounded expiry and a validated in-app return path; no tokens/passwords in localStorage, logs or public responses. Session expiry has a recoverable UI state. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S04 / #24](https://github.com/ddk220-light/MyBookshelf-web/issues/24) |
| [S06 / #26](https://github.com/ddk220-light/MyBookshelf-web/issues/26) | **Recover and change a password safely** — Generic recovery response, actual reset mail, expired/replayed token rejection, secure password setup/change and session invalidation; sensitive changes require recent authentication. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25), [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18) |
| [S07 / #27](https://github.com/ddk220-light/MyBookshelf-web/issues/27) | **Sign out and manage active sessions** — Revoke current session; separate all-device sign-out; clear identity-derived browser state and notify other tabs. Offline/failed sign-out does not claim server revocation. Last usable login method remains available. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25) |
| [S08 / #28](https://github.com/ddk220-light/MyBookshelf-web/issues/28) | **Sign in with Google** — Separate OAuth client/callback/consent configuration; only identity/email/profile scopes; verified provider return, missing profile handling, cancellation and mobile return. No implicit same-email account merge. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25), [P03 / #19](https://github.com/ddk220-light/MyBookshelf-web/issues/19) |
| [S09 / #29](https://github.com/ddk220-light/MyBookshelf-web/issues/29) | **Sign in with Apple** — Primary App ID/Services ID, domains/callbacks and signing key configured; first-login-only name and private relay email handled; actual staging flow and client-secret renewal procedure demonstrated. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25), [P04 / #20](https://github.com/ddk220-light/MyBookshelf-web/issues/20) |
| [S10 / #30](https://github.com/ddk220-light/MyBookshelf-web/issues/30) | **Explicitly link and unlink login methods** — Recent authentication and proof of provider control; implicit linking disabled; collision and Apple relay cases handled; last-method unlink prevented. Existing separate accounts are not merged from matching email/name. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S07 / #27](https://github.com/ddk220-light/MyBookshelf-web/issues/27), [S08 / #28](https://github.com/ddk220-light/MyBookshelf-web/issues/28), [S09 / #29](https://github.com/ddk220-light/MyBookshelf-web/issues/29) |
| [S11 / #31](https://github.com/ddk220-light/MyBookshelf-web/issues/31) | **Store and synchronize selected libraries** — Persist stable directory IDs; validate through existing directory service; at most one selected library per account, while allowing future multiple memberships. Choice appears on another signed-in device and stays private. | [E03 / #13](https://github.com/ddk220-light/MyBookshelf-web/issues/13) | [S03 / #23](https://github.com/ddk220-light/MyBookshelf-web/issues/23), [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25) |
| [S12 / #32](https://github.com/ddk220-light/MyBookshelf-web/issues/32) | **Store and synchronize saved books** — Idempotent per-reference save/remove; separate saved/viewed timestamps; preserve edition/catalog identity, paginate shelves, handle concurrent devices without whole-shelf replacement. Unknown work relationships do not prevent saving. | [E03 / #13](https://github.com/ddk220-light/MyBookshelf-web/issues/13) | [S03 / #23](https://github.com/ddk220-light/MyBookshelf-web/issues/23), [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25) |
| [S13 / #33](https://github.com/ddk220-light/MyBookshelf-web/issues/33) | **Store and control recently viewed books** — Bounded recent distinct references; proposed newest 50 within 30 days to settle in PRD. Pause/remove/clear controls, generation protection against stale writes, expiry cleanup and private visibility. | [E03 / #13](https://github.com/ddk220-light/MyBookshelf-web/issues/13) | [S03 / #23](https://github.com/ddk220-light/MyBookshelf-web/issues/23), [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25) |
| [S14 / #34](https://github.com/ddk220-light/MyBookshelf-web/issues/34) | **Import a device's guest shelf with consent** — Show saved-book count and separate recent-history choice; preserve existing account library unless explicitly changed; bounded transactional idempotent import, safe retries/payload validation and original snapshot retained until acknowledgement. | [E03 / #13](https://github.com/ddk220-light/MyBookshelf-web/issues/13) | [S11 / #31](https://github.com/ddk220-light/MyBookshelf-web/issues/31), [S12 / #32](https://github.com/ddk220-light/MyBookshelf-web/issues/32), [S13 / #33](https://github.com/ddk220-light/MyBookshelf-web/issues/33) |
| [S15 / #35](https://github.com/ddk220-light/MyBookshelf-web/issues/35) | **Export and delete account data** — Authenticated export excludes secrets/tokens; recent authentication for deletion; immediate session revocation and retryable private-data cleanup, provider handling and documented backup expiry/restore suppression. | [E03 / #13](https://github.com/ddk220-light/MyBookshelf-web/issues/13) | [S06 / #26](https://github.com/ddk220-light/MyBookshelf-web/issues/26), [S07 / #27](https://github.com/ddk220-light/MyBookshelf-web/issues/27), [S10 / #30](https://github.com/ddk220-light/MyBookshelf-web/issues/30), [S11 / #31](https://github.com/ddk220-light/MyBookshelf-web/issues/31), [S12 / #32](https://github.com/ddk220-light/MyBookshelf-web/issues/32), [S13 / #33](https://github.com/ddk220-light/MyBookshelf-web/issues/33), [S14 / #34](https://github.com/ddk220-light/MyBookshelf-web/issues/34), [S21 / #41](https://github.com/ddk220-light/MyBookshelf-web/issues/41) |
| [S16 / #36](https://github.com/ddk220-light/MyBookshelf-web/issues/36) | **Implement the auth journeys and responsive account routes** — Signup, sign-in, verify-email, forgot/reset-password and provider returns match D02/D04 at desktop/mobile widths in all reading lights; accessible validation, keyboard/focus behavior, loading/expiry/error/cancellation and safe return navigation. | [E04 / #14](https://github.com/ddk220-light/MyBookshelf-web/issues/14) | [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8), [S04 / #24](https://github.com/ddk220-light/MyBookshelf-web/issues/24), [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25), [S06 / #26](https://github.com/ddk220-light/MyBookshelf-web/issues/26), [S08 / #28](https://github.com/ddk220-light/MyBookshelf-web/issues/28), [S09 / #29](https://github.com/ddk220-light/MyBookshelf-web/issues/29) |
| [S17 / #37](https://github.com/ddk220-light/MyBookshelf-web/issues/37) | **Implement account settings and lifecycle controls** — Profile/email/password, linked providers, sign-out/all devices, export/delete and history controls with clear pending/failure/success behavior. Never make signup name/email/library/history public by default. | [E04 / #14](https://github.com/ddk220-light/MyBookshelf-web/issues/14) | [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8), [S06 / #26](https://github.com/ddk220-light/MyBookshelf-web/issues/26), [S07 / #27](https://github.com/ddk220-light/MyBookshelf-web/issues/27), [S10 / #30](https://github.com/ddk220-light/MyBookshelf-web/issues/30), [S13 / #33](https://github.com/ddk220-light/MyBookshelf-web/issues/33), [S15 / #35](https://github.com/ddk220-light/MyBookshelf-web/issues/35), [S21 / #41](https://github.com/ddk220-light/MyBookshelf-web/issues/41) |
| [S18 / #38](https://github.com/ddk220-light/MyBookshelf-web/issues/38) | **Connect reading screens to guest/account storage** — Repository abstraction replaces direct persistence calls; guest use preserved; cloud data authoritative while signed in; import consent and save rollback/retry; late old-identity responses ignored and cross-tab caches cleared on account change. Initial signed-in cache is in-memory without an offline mutation queue. | [E04 / #14](https://github.com/ddk220-light/MyBookshelf-web/issues/14) | [R02 / #8](https://github.com/ddk220-light/MyBookshelf-web/issues/8), [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25), [S07 / #27](https://github.com/ddk220-light/MyBookshelf-web/issues/27), [S11 / #31](https://github.com/ddk220-light/MyBookshelf-web/issues/31), [S12 / #32](https://github.com/ddk220-light/MyBookshelf-web/issues/32), [S13 / #33](https://github.com/ddk220-light/MyBookshelf-web/issues/33), [S14 / #34](https://github.com/ddk220-light/MyBookshelf-web/issues/34) |
| [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | **Verify account flows and isolation end to end** — Device A/B sync, two independent accounts, real mail and Google/Apple callbacks including mobile Safari; recovery expiry/replay, linking collisions, rate limits/CSRF/redirect rejection, concurrent writes, import retry, account switching, deletion and anonymous/SEO regressions. Cover material failure paths as well as successful flows. | [E05 / #15](https://github.com/ddk220-light/MyBookshelf-web/issues/15) | [T01 / #42](https://github.com/ddk220-light/MyBookshelf-web/issues/42), [T02 / #43](https://github.com/ddk220-light/MyBookshelf-web/issues/43), [T03 / #44](https://github.com/ddk220-light/MyBookshelf-web/issues/44), [T04 / #45](https://github.com/ddk220-light/MyBookshelf-web/issues/45), [T05 / #46](https://github.com/ddk220-light/MyBookshelf-web/issues/46), [T06 / #47](https://github.com/ddk220-light/MyBookshelf-web/issues/47) |
| [S20 / #40](https://github.com/ddk220-light/MyBookshelf-web/issues/40) | **Prepare operations and release** — Separate runtime secrets and stable staging, migration/rollback sequence, restore exercise, Apple secret renewal, mail failure/deletion cleanup monitoring, retention/privacy text, dependency update owner and release evidence. Production release uses current deployment state and verified checks. | [E05 / #15](https://github.com/ddk220-light/MyBookshelf-web/issues/15) | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) |
| [S21 / #41](https://github.com/ddk220-light/MyBookshelf-web/issues/41) | **Manage private profile and verified email changes** — Update chosen display name privately with validation; name is never published as a public profile. | [E02 / #12](https://github.com/ddk220-light/MyBookshelf-web/issues/12) | [S05 / #25](https://github.com/ddk220-light/MyBookshelf-web/issues/25), [S07 / #27](https://github.com/ddk220-light/MyBookshelf-web/issues/27), [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18) |

## Final validation

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [T01 / #42](https://github.com/ddk220-light/MyBookshelf-web/issues/42) | **Validate authentication and real provider journeys** — Run real verification/reset email, Google and Apple callbacks on stable staging, including mobile Safari. | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | [S16 / #36](https://github.com/ddk220-light/MyBookshelf-web/issues/36), [S17 / #37](https://github.com/ddk220-light/MyBookshelf-web/issues/37), [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18), [P03 / #19](https://github.com/ddk220-light/MyBookshelf-web/issues/19), [P04 / #20](https://github.com/ddk220-light/MyBookshelf-web/issues/20) |
| [T02 / #43](https://github.com/ddk220-light/MyBookshelf-web/issues/43) | **Validate privacy, authorization and abuse resistance** — Run two-user object-ownership tests against actual runtime DB roles and reused pooled connections. | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | [S03 / #23](https://github.com/ddk220-light/MyBookshelf-web/issues/23), [S10 / #30](https://github.com/ddk220-light/MyBookshelf-web/issues/30), [S15 / #35](https://github.com/ddk220-light/MyBookshelf-web/issues/35), [S18 / #38](https://github.com/ddk220-light/MyBookshelf-web/issues/38), [S21 / #41](https://github.com/ddk220-light/MyBookshelf-web/issues/41) |
| [T03 / #44](https://github.com/ddk220-light/MyBookshelf-web/issues/44) | **Validate cross-device synchronization and import races** — Device A/B and two-account scenarios cover selected library, saved books, history, import and identity transitions. | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | [S11 / #31](https://github.com/ddk220-light/MyBookshelf-web/issues/31), [S12 / #32](https://github.com/ddk220-light/MyBookshelf-web/issues/32), [S13 / #33](https://github.com/ddk220-light/MyBookshelf-web/issues/33), [S14 / #34](https://github.com/ddk220-light/MyBookshelf-web/issues/34), [S18 / #38](https://github.com/ddk220-light/MyBookshelf-web/issues/38) |
| [T04 / #45](https://github.com/ddk220-light/MyBookshelf-web/issues/45) | **Validate accessibility and responsive visual behavior** — Cover all account screens and guest/account reading transitions on desktop/mobile in three reading lights. | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | [S16 / #36](https://github.com/ddk220-light/MyBookshelf-web/issues/36), [S17 / #37](https://github.com/ddk220-light/MyBookshelf-web/issues/37), [S18 / #38](https://github.com/ddk220-light/MyBookshelf-web/issues/38) |
| [T05 / #46](https://github.com/ddk220-light/MyBookshelf-web/issues/46) | **Run regression, resilience and performance checks** — Run fresh client/server suites, type checking, production build, SEO/deployment checks and existing browser journeys. | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | [S16 / #36](https://github.com/ddk220-light/MyBookshelf-web/issues/36), [S17 / #37](https://github.com/ddk220-light/MyBookshelf-web/issues/37), [S18 / #38](https://github.com/ddk220-light/MyBookshelf-web/issues/38) |
| [T06 / #47](https://github.com/ddk220-light/MyBookshelf-web/issues/47) | **Rehearse account deletion, restore and operational recovery** — Verify export completeness and retryable deletion including provider links, background jobs and immediate revocation. | [S19 / #39](https://github.com/ddk220-light/MyBookshelf-web/issues/39) | [S15 / #35](https://github.com/ddk220-light/MyBookshelf-web/issues/35), [P01 / #17](https://github.com/ddk220-light/MyBookshelf-web/issues/17), [P02 / #18](https://github.com/ddk220-light/MyBookshelf-web/issues/18), [P04 / #20](https://github.com/ddk220-light/MyBookshelf-web/issues/20) |

## Production rollout

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [L01 / #48](https://github.com/ddk220-light/MyBookshelf-web/issues/48) | **Roll out the approved account release and verify production** — Use the current verified Vercel repository/branch/domain configuration and approved migration sequence. | [E05 / #15](https://github.com/ddk220-light/MyBookshelf-web/issues/15) | [R03 / #9](https://github.com/ddk220-light/MyBookshelf-web/issues/9) |

## Future discovery — requirements needed

| ID / issue | Work and acceptance direction | Parent | Depends on |
| --- | --- | --- | --- |
| [F01 / #49](https://github.com/ddk220-light/MyBookshelf-web/issues/49) | **Public profiles and identity** — Public opt-in, handles, visible fields, private profiles, discovery, avatar rights, account versus public name, blocking and deletion. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |
| [F02 / #50](https://github.com/ddk220-light/MyBookshelf-web/issues/50) | **Ratings and reviews** — Work versus edition target, external identity coverage/ambiguity study, rating scale, review editing/version rules, spoilers, visibility, aggregation eligibility, reporting/moderation and content deletion. Study BookWyrm and existing catalogs before adding identity infrastructure. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |
| [F03 / #51](https://github.com/ddk220-light/MyBookshelf-web/issues/51) | **Comments and discussion** — Allowed targets, nesting, edit/delete behavior, notifications, reporting, blocking, moderation/appeals and abuse rate limits. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |
| [F04 / #52](https://github.com/ddk220-light/MyBookshelf-web/issues/52) | **Favorites and reading status** — Difference between save/favorite/read/want-to-read, work versus edition semantics, rereads/dates, privacy defaults, import and deletion behavior. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |
| [F05 / #53](https://github.com/ddk220-light/MyBookshelf-web/issues/53) | **Custom reading lists** — List visibility, ordering, work/edition membership, duplicates, sharing, ownership, optional collaboration and export/deletion. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |
| [F06 / #54](https://github.com/ddk220-light/MyBookshelf-web/issues/54) | **Following and blocking** — Follow versus friendship, private-profile requests, block/mute rules across reads/writes/feeds, counts, visibility and abuse handling. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |
| [F07 / #55](https://github.com/ddk220-light/MyBookshelf-web/issues/55) | **Activity and notifications** — Explicit eligible events, recipient/visibility/block checks at delivery and read time, channels/preferences, retention, outbox/retries and unsubscribe. Private recently viewed history is excluded. | [E06 / #16](https://github.com/ddk220-light/MyBookshelf-web/issues/16) | Foundation analysis / child exit criteria |

## Cross-cutting completion rules

- Each story's GitHub issue contains its deliverables, failure cases and meaningful
  verification. D05 creates independently verifiable engineering/UI/configuration/
  test child tasks after contracts are defined and before R02 review.
- Preserve anonymous browsing, exact edition/catalog identities and unresolved
  references. Account data stays private; import and provider linking are explicit.
- Define and test concurrent save/remove/undo/clear-all, history generation and
  pause/clear races, import retries, shared-device behavior and stale responses.
- Test real mail and Google/Apple callbacks, including Safari, on isolated staging.
  Mocked provider tests alone do not establish release readiness.
- Final evidence identifies the commit/deployment, environment, outcomes and
  defects. Resolve critical/high defects; record the owner's release disposition
  for remaining defects and rerun affected checks after repairs.
- Review current Vercel repository/branch/domain configuration before rollout;
  the previous production connection in the handoff is historical evidence.

## Publication and maintenance

Reuse this project and the stable planning markers in the existing issues; do not
create another index or duplicate backlog. Keep these links and the
[handoff](../STATUS.md) current as requirements change. The official GitHub
Projects MCP created the board; repository issue APIs supply native hierarchy and
dependencies. See [credential notes](../development/credentials.md).
