# Account test strategy and release evidence

Version 0.2, 2026-11-01. D03. **Planned tests; none of the account checks below
has run yet.** A documentation review is not runtime validation. Requirements:
[PRD](PRD.md). Contracts: [ENGINEERING_DESIGN.md](ENGINEERING_DESIGN.md).

## Test layers and fixtures

Use existing client Vitest/Testing Library, server `node:test`/Supertest and
Playwright infrastructure. Add real temporary Postgres integration tests with
the actual non-owner runtime role, migrations and pool behavior; mocked queries
cannot prove RLS. Unit tests target parsers, identity/revision transitions and
error mapping. Browser tests assert user-observable behavior and stored results,
not merely that a button invokes a mocked function.

Fixtures: guest with 100 saves/50 history, account at 999/1,000 saves, two independent
verified accounts A/B, one unverified account, password-only and provider-only
accounts, Apple relay/missing-name fixture, long VPL key, two similar-title
different-edition records, unresolved reference, removed library, expired history
and corrupted/unavailable localStorage. Use synthetic names/books/emails in
committed fixtures. Real provider testing uses designated staging accounts;
redact addresses/tokens/private content from evidence.

Use controllable clocks for token, session, undo, retention and job lease expiry.
Use barriers/latches to order concurrent requests and force responses after
sign-out/switch. Test both before-commit failure and after-commit lost response.
Use two browser contexts as devices and a second tab for cross-tab tests. Real
Safari/iOS checks supplement Playwright WebKit for provider return and cookies.

## Requirement coverage

| Requirement | Focused evidence during implementation | Final package |
| --- | --- | --- |
| AC-01 | Public router startup without auth secrets/DB; guest storage corruption, capacity, save/search/scan/library tests | T05 |
| AC-02 | Validation boundaries, enumeration response shape, unverified API rejection, token expiry/replay and scanner landing | T01 + T02 |
| AC-03 | Idle/absolute expiry and renewal clocks, revoked-session rejection, no browser token persistence | T01 + T02 |
| AC-04 | Real reset mail, expired/used tokens, concurrent reset, session revocation, provider-only password setup | T01 + T02 |
| AC-05 | Current/other/all revocation, failed sign-out, late response, reload/local override, tab fallback | T02 + T03 |
| AC-06 | Provider protocol fixtures plus actual Google/Apple login, cancellation, relay and name completion | T01 + T02 |
| AC-07 | Explicit link intent, collision, missing recent auth, concurrent last-method unlink | T01 + T02 |
| AC-08 | Private name validation/revision; new-email verify/collision/expiry and old-address notification | T01 + T02 |
| AC-09 | Directory ID validation/removal; conflicting selections on two devices | T03 |
| AC-10 | Exact identity, quota, timestamp separation, pagination conflict, save/remove/undo/clear races | T03 |
| AC-11 | Default off, opt-in, expiry, trim/order, pause/remove/clear generation barriers | T03 |
| AC-12 | Consent, atomic capacity failure, duplicate/reordered retry, snapshot cleanup race and separate history choice | T03 |
| AC-13 | Export snapshot/omissions, deletion immediate denial, provider cleanup retry and restored-backup suppression | T02 + T06 |
| AC-14 | No guest fallback, session uncertainty, failed mutation/lost response/idempotency and stale UI | T03 + T05 |
| AC-15 | Label/focus semantics, three lights, narrow/zoom/reflow, keyboard and real screen reader | T04 |
| AC-16 | Two-user endpoints/RLS, proxy/shared limits, CSRF/redirect/no-store and secret-safe logs | T02 + T05 |
| AC-17 | Candidate manifest, full check results, defects, operations drill and owner decision | T01–T06 + R03 |

## Final validation tasks

### T01 / #42 — Authentication and real providers

Run signup → actual received verification → deliberate verify → sign-in on device
B → reset via actual mail → old-session rejection → new sign-in. Exercise resend,
duplicate signup, changed address, expired/replayed links and mailbox-delivery
failure. Assert scanners cannot consume verification. Check daily renewal and
30-day absolute expiry with controlled clocks in integration tests.
Inject a failure between token consumption, password update and session
revocation; require rollback with no partially applied reset or false success.

Exercise actual Google and Apple on stable staging, desktop and mobile Safari:
first login, returning login, cancel, expired state, disallowed return, missing
name, private relay mail, verified-email trust and subject collision. Explicitly
link, reauthenticate, unlink and prove a last-method unlink is rejected. Test
provider-only recovery/password setup and verified email change. Record callback
configuration identifiers safely, not secrets. Mock-only provider results cannot
pass this task; provider prerequisites unavailable means **blocked**, not passed.

### T02 / #43 — Privacy, authorization and abuse

For every private route, test no session, unverified, expired, revoked, deleting,
owner A, owner B and forged object/owner input. Include raw auth endpoints that
might bypass application wrappers. RLS tests run as the real role: A transaction,
rollback, B transaction, missing context, pooled connection reuse and deliberately
omitted owner predicate. Confirm application role neither owns tables nor bypasses
RLS. Verify export and metadata joins cannot disclose another reader's records.
Import different display snapshots for the same exact reference as users A and B;
neither snapshot may replace shared provider facts or the other user's display.

Test two API instances against the shared limiter, forged forwarding headers,
CSRF missing/wrong token/origin, login CSRF, callback-state replay, open redirect
encodings, malformed JSON, oversize import, metadata XSS and arbitrary cover URL
fetch prevention. Confirm private responses are no-store/noindex and never cached
across cookies. Search browser storage, logs and exported files for seeded test
secrets. Verify unlink/email/delete races and recent-auth proof expiry/replay.

### T03 / #44 — Synchronization and race matrix

| Controlled sequence | Required result |
| --- | --- |
| Two devices save different books at the same shelf revision | One commits; the other receives conflict and can refresh/retry without loss. |
| Save/remove/undo responses arrive out of order | Revision/epoch checks keep latest authoritative result; stale undo does not restore. |
| Delayed save or undo arrives after clear-all | Rejected by old shelf revision; shelf remains cleared. |
| Lost save response, retry same ID; same ID with changed payload | Exactly one effect; changed payload rejected. |
| Pagination concurrent with mutation | Cursor revision conflict, restart page list; no silent skipped/duplicated records. |
| View delayed across pause, remove or clear | Old generation rejected; no resurrection. New deliberate view after opt-in can record. |
| Two current views, expired rows, 51st distinct book | Server-time ordering, stable tie-break, newest 50 / last 30 days only. |
| Duplicate import / failure halfway / lost response | Atomic rollback or one committed result; retry returns original counts. |
| Import over 1,000 union capacity / corrupt/future timestamp | No partial change; readable explanation and preserved device data. |
| Import 100 saves / 50 recent with maximum-length catalog keys | Check serialized UTF-8 size and the 2MiB bound; valid bounded fixtures import, oversized payloads fail without local data loss. |
| Guest edits while import runs; then requests local cleanup | Remove only unchanged imported entries; preserve newly added/changed local data. |
| History unchecked / checked while collection off | Unchecked imports none; checked imports eligible history once and leaves future collection off. |
| Account A request completes after sign-out and B sign-in | No A data rendered/persisted; user+epoch mismatch discards it. |
| BroadcastChannel absent, storage event lost, tab refocus | Session revalidation clears stale identity before private rendering. |
| Deletion races with save/import/provisioning | Disabled identity cannot write or be recreated; committed prior records are deleted. |

Also verify selected library conflict/removal, savedAt/viewedAt separation, exact
edition/catalog keys, unknown reference handling, device-local appearance and
no account data written to any guest or lookup cache key.
Seed search-memory and reader fallback caches before switching identities and
restoring a page from bfcache; prior-account state must not reappear.

### T04 / #45 — Accessibility and visual behavior

Use Claude's **R02-approved** artifact commit as reference. Cover every route and
material UX-01–11 state at 390/1440px in all three lights; add 320/768px,200% zoom,
400% reflow equivalent, long strings, reduced motion and forced colors for layout
stress. Capture named screens and document intentional differences, not a guessed
percentage match.

Run axe checks, then manual keyboard-only signup/import/settings/deletion and
screen-reader checks (VoiceOver/Safari and NVDA/Firefox or an explicitly recorded
equivalent). Check error announcement, live-status verbosity, modal focus trap/
restore, password-manager/autofill, provider button names, contrast and touch
targets. Automated checks alone do not pass keyboard or screen-reader acceptance.

### T05 / #46 — Regression, resilience and performance

Run existing commands on Node22 from a clean install:

```sh
npm ci
npm run typecheck:client
npm run test:client
npm test --workspace=server
npm run build
npm run test:seo
npm run test:e2e
```

Extend the server test script to actually include new auth/account/DB suites;
the current explicit file glob would otherwise omit them. CI provisions a fresh
test database with roles and applies migrations. External-provider tests are a
separate staging lane with protected credentials; pull requests do not receive
production secrets. Retain existing deployment/header/SEO checks referenced in
the root README and record their exact commands in VALIDATION.md.

Inject DB/auth/mail outage, quota exhaustion, timeout, lost response, throttling,
stale schema, offline navigation and unavailable localStorage. Public browsing
must remain usable; private failures must be explicit. Load a 1,000-book shelf,
maximum import and 20 concurrent synthetic readers. Report p50/p95, errors, pool
wait, cold starts, hash resource use and worker lag; compare account API p95 to
the 1-second target excluding external redirects/mail. No unbounded polling,
hashing or per-book requests on the shelf.

### T06 / #47 — Lifecycle and operational recovery

Export a known fixture, compare every owned field and assert no auth secrets or
other users. Delete with two active devices and in-flight writes; access ends
immediately. Kill/restart workers during each cleanup step and show idempotent
progress, safe alerts and eventual live-data cleanup. Exercise Apple revocation
failure without reenabling access or discarding retry credentials prematurely.
Lose the deletion response after session revocation and recover status using the
client's receipt nonce. Wrong/expired nonces expose no data; losing the nonce does
not stop cleanup. Fail the external ledger write: access stays disabled, the
durable job retries and no durable-acceptance/erasure success is reported early.

Restore a pre-deletion snapshot into an isolated environment, replay the external
suppression ledger, invalidate sessions/jobs, then prove deleted users remain
absent. Verify actual backup-retention settings and job/ledger expiry. Rehearse
ledger unavailability during restore: private traffic stays closed until deletion
suppression can be reconciled. Also rehearse
mail outage, Apple client-secret rotation, compromised-session response and
schema-compatible rollback with public browsing operational. Evidence includes
operator and dates; a written runbook without the drill does not pass T06.

## Candidate evidence and go/no-go

S19 creates `docs/accounts/VALIDATION.md` with candidate Git SHA/deployment URL,
environment/DB migration version, dependency lockfile version, test dates, browser
versions, command summaries, trace/screenshot links, T01–T06 outcomes and defects.
Keep artifacts synthetic/redacted. S20 adds OPERATIONS.md with actual owners,
privacy/retention text, configuration inventory, monitors, rotations and rollback.

Block R03 on any failed required flow, unresolved critical/high defect, missing
real provider evidence, cross-user exposure, accepted-write loss, restore
resurrection, unavailable mandatory prerequisite or unreviewed scope change.
Lower-severity exceptions need owner, impact, workaround and explicit Deepak
acceptance. After a fix, rerun affected checks and their dependencies; a changed
candidate needs refreshed evidence, not copied historical green results.

R03 records Deepak's explicit tested-candidate decision. L01 verifies current
production connection/configuration, deploys only that approved candidate,
executes smoke checks and watches defined rollback signals. Automatic test success
or closing S19 is not production authorization.
