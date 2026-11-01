# Account management PRD

Version 0.1, 2026-11-01. D01. **Proposed for R01 review.** The decision register
and review status are in [README.md](README.md). Requirement IDs are stable across
the designs, delivery tasks and [test matrix](TEST_STRATEGY.md).

## Problem and outcome

Today a reader's library choice, saved shelf and recent books exist in one browser.
Changing devices or clearing browser storage loses that continuity. An optional
private account should let readers keep those three things across devices while
continuing to browse, search, scan and save locally without an account.

Primary users are a guest deciding whether to sync, a returning reader on a
second device, an email/password reader recovering access, a Google/Apple-only
reader, and two people sharing one browser. Signup name is a private account name,
not a public identity. The application does not require a legal name.

## Scope

Include name/email/password signup and verification, sign-in, Google and Apple,
password recovery/change, private profile/email changes, explicit provider linking,
current/all/selected session revocation, library/shelf/history synchronization,
guest import, JSON export and account deletion. Preserve existing search, edition
selection, availability, public guides and anonymous storage recovery.

Exclude public profiles, ratings, reviews, comments, follows, favorites, reading
statuses, lists, feeds, notifications for social activity, account merging, MFA,
passkeys, avatars, paid plans, offline account writes and universal book matching.
Deferred social stories F01–F07 require separate requirements and privacy review.
Free-content discovery is separate research and is not part of this release.

## Requirements and observable acceptance

| ID | Required behavior and pass/fail acceptance | Stories | Final tests |
| --- | --- | --- | --- |
| AC-01 | Guest search, scan, library choice, 100-book local shelf and current local history work without signup. Unavailable/corrupt browser storage keeps its existing recovery path. Public pages and `/api/v2` work during account-service outage. | S01, S18 | T05 |
| AC-02 | Signup requires private name (1–80 characters after trimming), valid email and password (15–128 characters, spaces/paste allowed, no composition rule). Reject known compromised passwords through the selected implementation. Verification is required before any private reading API succeeds. An unverified reader may continue as a guest. Duplicate signup/resend responses do not expose account existence. | S04, S16 | T01, T02 |
| AC-03 | Email/password sign-in creates a server-revocable session with DEC-06 lifetime; no auth tokens in browser storage. Invalid credentials get a generic error. Session expiry clears account-derived data and offers sign-in or guest browsing. | S05, S16, S18 | T01, T02 |
| AC-04 | Password recovery always returns the same public message. Reset links expire after 30 minutes and succeed once. Reset revokes every existing session and returns to sign-in. Password change requires recent authentication, revokes other sessions and rotates the current one. Social-only users can add a password after recent provider authentication plus verified email ownership. | S06, S16, S17 | T01, T02 |
| AC-05 | Sign out revokes the current session; session settings can revoke another session or all sessions. The UI reports server failure truthfully. Cross-tab account content clears on identity change; a cached response from account A never renders for B. | S07, S17, S18 | T02, T03 |
| AC-06 | Google and Apple sign-in succeed on stable staging, including mobile Safari. Cancellation, missing profile data and existing-account collisions have recovery paths. Ask for a private name if unavailable; respect Apple relay email. Provider identity alone never silently joins an existing email account. | S08, S09, S16 | T01, T02 |
| AC-07 | Link/unlink is an explicit settings flow with recent authentication and proof of the linked provider. A provider already owned by another account cannot be transferred. Concurrent unlinks cannot remove the final usable login method. Email-password counts as usable only with a verified email and configured password. | S10, S17 | T01, T02 |
| AC-08 | Private name edits validate and persist across devices. Email changes verify the new address before replacing the old login address, notify the old address and revoke other sessions. Collision/expired/replayed verification leaves the original address valid. Google/Apple subjects remain unchanged. | S21, S17 | T01, T02 |
| AC-09 | A valid directory library ID syncs to a second device. Only one library is selected. A removed library prompts selection without guessing a replacement. A concurrent preference edit returns a conflict instead of overwriting an unseen choice. | S11, S18 | T03 |
| AC-10 | Save/remove use exact existing book references, including unresolved catalog records; similar titles/editions are never merged. Accounts allow 1,000 saves. Save time differs from view time. Acknowledged mutations appear after refresh/focus on another device. Remove has a 10-second conditional undo; clear-all requires confirmation and prevents older writes/undo from resurrecting books. | S12, S18 | T03 |
| AC-11 | Account history is off until opted in. When on, retain newest 50 distinct references with server-confirmed views from the last 30 days. Pause prevents subsequent writes, remove deletes an entry, and clear invalidates in-flight history writes. Previously stored history remains visible while paused until removed or expired. Background refresh, prefetch and merely listing a book do not count as views. | S13, S17, S18 | T03 |
| AC-12 | On first verified sign-in with guest data, preview counts, selected library and destination account. Saved books import only after confirmation; recent history is separately unchecked by default. History import does not enable future tracking. Keep account library unless the reader explicitly chooses the device library. Import is atomic and retryable without duplicates; overflow or malformed payload applies nothing. Keep the original device data until acknowledgement and remove it only on explicit choice. | S14, S18 | T03 |
| AC-13 | Export requires recent authentication and downloads versioned JSON of profile, preferences, linked provider names and owned library/book/history data. Exclude passwords, tokens, session identifiers and provider secrets. Expired history and other users' data never appear. Deletion requires recent authentication and explicit confirmation, disables access immediately, revokes sessions and follows DEC-08 cleanup/backup policy. | S15, S17, S20 | T02, T06 |
| AC-14 | Signed-in saves/library changes show pending, confirmed or failed state. Offline/server failure never writes account books into the guest namespace. Retryable operations preserve their request identity; a conflict requests fresh data. Session uncertainty is not treated as logged out until resolved or the reader explicitly continues as guest. | S03, S18 | T03, T05 |
| AC-15 | Account routes work from 320px through desktop in daylight/lamplight/ink, at 200% zoom and with keyboard/screen reader. Visible labels, accessible errors, focus restoration and non-color status meet WCAG 2.2 AA checks. Preserve appearance and companion preferences across sign-out. | S16, S17, S18 | T04 |
| AC-16 | Every private read/write derives owner from a verified active session, with server authorization and database isolation. CSRF/origin checks, safe return URLs, shared abuse limits, no-store responses and secret-safe logging hold across multiple API instances. Reading behavior is never public or emitted as telemetry. | S01, S02, S03, S20 | T02, T05 |
| AC-17 | Release evidence identifies a single tested commit/deployment, real mail/provider results, migration/restore/deletion drills, privacy text and rollback owner. No critical/high defects remain. Deepak approves that candidate at R03 before production rollout. | S19, S20, L01 | T01–T06 |

## Behavioral decisions

DEC-01–10 in the review hub are normative proposals for v1. Additional details:

- Verification links last 24 hours; resend is rate limited. Link scanners and
  email previews must not consume a token: the landing screen requires a
  deliberate continuation. If the chosen auth library cannot provide that flow,
  S01 must document and resolve the gap before S04 ships.
- Account history consent appears after first sign-in and remains available in
  settings. Choosing “Not now” leaves it off. Importing old history is a separate,
  one-time decision and retains original view times within the 30-day window.
- Library, shelf and history are cloud-authoritative while signed in. Revalidation
  occurs on page entry, focus and after mutation; no promise of live push updates.
  A second active device can refresh to see a confirmed change immediately.
- Failed sign-out hides private content and offers retry plus an explicit local
  “Continue as guest” mode. It warns that server sign-out is unconfirmed; this
  mode cannot revoke the HttpOnly session while offline. Next online opportunity
  retries revocation, before private content can reappear.
- Clearing saved books does not clear history, and clearing history does not
  unsave books. Deletion does not silently erase an independently retained guest
  shelf. The confirmation explains the difference and offers local cleanup.
- No automatic account recovery through support if every password/provider and
  verified email method is lost. Support can explain available recovery paths
  without bypassing identity checks or collecting credentials.

## Measures and launch acceptance

All 17 requirements must have current passing evidence or an explicitly reviewed
scope change. Core scripted journeys must pass on two isolated browser contexts
and two accounts; Google/Apple/mail must also pass real staging exercises.

Proposed engineering targets: account API p95 under 1 second for a representative
20-concurrent-reader staging run (excluding third-party redirect/mail time), no
confirmed write loss, and zero cross-user data exposure in adversarial tests.
Record cold-start timing separately. Verify a 1,000-book shelf and maximum guest
import within platform execution/memory limits. These are test targets, not
measured production promises. No conversion or retention target is invented
without a baseline and an approved telemetry plan.

Operational measures are aggregate auth/API failure rates, mail queue age,
deletion backlog age and scheduled-job freshness. Never label metrics with email,
user ID, book key, library choice, IP or provider tokens. Final acceptance also
requires the existing anonymous and SEO checks to pass on the same candidate.
