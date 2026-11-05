# Account release acceptance — 2026-11-05 UTC

Email accounts are enabled at https://mybookshelf.cloud. Signup, received-mail
verification, recovery, cross-device reading data and account controls have been
exercised in production. Google/Apple remain disabled by the owner's instruction;
social expansion is outside this release. The remaining operational evidence is
listed below, so this record does not declare the entire project complete.

## Release and repairs

Release source: **`74bb392c4ea71396da7877eace4f852bb98b050b`**; observed READY production deployment:
**`dpl_2TMzGkZKT9cWVLv5KmmWbMRUBxus`**. The owner authorized production completion and deployment
after clean checks in [R03 #9](https://github.com/ddk220-light/MyBookshelf-web/issues/9).
That authorization is recorded; another approval phrase is not required.

Actual acceptance found and repaired these defects:

- [#163](https://github.com/ddk220-light/MyBookshelf-web/pull/163): an early Verify
  tap was silently dropped while account readiness was pending. Submission now
  waits for readiness, preserves the token and exchanges it exactly once.
- [#172](https://github.com/ddk220-light/MyBookshelf-web/pull/172): settings failed
  after five minutes because native device listing required fresh authentication.
  A generic 403 was also mislabeled as an email-verification failure. Owned device
  summaries now remain readable without weakening recent-auth mutation proofs.
  The HTTP regression failed before repair. The same existing aged production
  sessions then loaded profile and devices successfully, without signing in again.
- [#175](https://github.com/ddk220-light/MyBookshelf-web/pull/175) and
  [#176](https://github.com/ddk220-light/MyBookshelf-web/pull/176): acknowledged
  deletion left a contradictory sign-out warning. Access-ending acknowledgements
  are bound to the original identity and sign-in intent; receipt recovery clears
  only its own uncertainty. Tests preserve genuine lost-response protection and
  prevent a late deletion response from disturbing a newer sign-in/privacy lock.
  Screenshot review also removed the generic prompt to sign into the deleted shelf.

Final CI also exposed a maintenance-test teardown race: forcibly dropping its
isolated database terminated still-connected middleware pools. [#177](https://github.com/ddk220-light/MyBookshelf-web/issues/177)
tracks explicit pool/service closure before ordinary DROP DATABASE. The affected
real-Postgres check passes, including three repeated runs; the original failed CI
run is retained as evidence rather than counted as passing.

Vercel's persistent Git connection now points to `ddk220-light/MyBookshelf-web`
(repo 1440561024), production branch `main`, rather than the previous repository.
Project/build/protection settings remain unchanged. See
[connection evidence](evidence/production/acceptance-2026-11-05/git-link-result.json)
and [#173](https://github.com/ddk220-light/MyBookshelf-web/issues/173).

## Actual production workflow

Only designated synthetic aliases in the owner's connected mailbox were used.
Passwords, cookies, one-use links, exported account contents and deletion nonces
are excluded from committed evidence. See the sanitized
[browser observations](evidence/production/acceptance-2026-11-05/browser-results.json),
[initial workflow](evidence/production/acceptance-2026-11-05/workflow-results.json)
and [scoped database observations](evidence/production/acceptance-2026-11-05/db-results.json).

| Boundary | Observed result |
| --- | --- |
| Availability | Session 200 guest; email capability true, Google/Apple false; aggregate health 200 ready. |
| Signup | Native Settings navigation, password validation, double submit, neutral duplicate response, unverified sign-in denied. |
| Verification | Actual received email, scanner-safe landing, explicit confirmation, URL token removal and replay rejection. |
| Recovery | Received reset email, password updated, replay and old password rejected; earlier session revoked. |
| Import | One saved book imported explicitly; history unchecked; device-copy removal followed acknowledgement; unselected guest history retained. |
| Reading data | Private shelf visible in separate mobile/desktop WebKit and Chromium contexts; exact San Mateo library choice survives reload and another device. |
| Profile | Acknowledged name changes survive reload. |
| History | Default off; opt-in records a view; pausing prevents the next view from being collected. |
| Email change | Expired link rejected with old address preserved; fresh received link confirms explicitly, removes token, rejects replay and revokes other devices; old email cannot sign in. |
| Password change | Current-password proof succeeds; other active sessions are revoked. |
| Sessions | Current-device and all-device sign-out, subsequent sign-in and aged-session settings work. |
| Export | Actual JSON downloads before/after credential changes contain the owned profile and shelf, omit credentials, and are deleted after inspection. |
| Privacy | Secure HttpOnly/Lax cookies; private no-store/noindex; credentials and private history absent from guest browser storage. |
| Deletion | Immediate guest state across active devices, private profile 401, durable receipt and native-worker cleanup. Auth/profile/session rows and retained mail ciphertext are absent after cleanup. |

The first fixture's native cleanup was observed at 02:27 UTC; scoped database
counts are auth 0, private profiles 0, sessions 0, retained mail ciphertext 0 and
one cleaned receipt. The final received-mail fixture was repeated on release `74bb392`: neither stale
sign-out uncertainty nor the generic erased-shelf sign-in prompt remains. All five
browser contexts returned guest, private profile returned 401, axe reported zero
violations, and no overflow/new page errors were observed. Native-worker cleanup
was confirmed at 03:42 UTC: every scoped auth/profile/settings/session/book/history/
import/operation count and retained ciphertext count is zero, with one cleaned
receipt. See [erasure counts](evidence/production/acceptance-2026-11-05/reading-erasure-results.json)
and [the final phone screen](evidence/production/acceptance-2026-11-05/production-deletion-final-mobile.png).

Production Resend uses `MyBookshelf <accounts@mybookshelf.cloud>`. The missing
DMARC policy was added as `_dmarc` TXT `v=DMARC1; p=none`; subsequent received reset,
security and email-change messages pass SPF, DKIM and DMARC. Observed jobs sent
once and purged encrypted payloads. Controlled failure/retry/lease/idempotency
checks use real disposable Postgres and a synthetic transport; no production mail
outage was induced. Resend remains production only.

## UI and accessibility

The approved Claude canvas v4 artifact (`1793518146-c9ad`, R02 `36a1436`) is
unchanged, SHA-256 `879889ccd1179b6d11afc7d73f9ea9ba01c46cae1f9e09e83531d74b7a78df69`.
[Screen review](SCREEN_REVIEW.md) and the [paired gallery](evidence/ui-review/index.html)
map the complete screen/state matrix. Fresh live settings captures in all three
lights are retained in the acceptance evidence directory at 390 and 1440 CSS px,
including the bottom controls. Mailbox aliases are masked. No horizontal overflow
was observed. Phone headings are 28px, body/input text 16px; default screenshots
are CSS-pixel scale rather than 3× retina images. No numerical pixel-match score
is claimed.

Live axe settings checks report zero violations. Production keyboard cancellation,
modal background isolation and focus restoration passed. The recorded
[assistive-technology equivalent](evidence/production/acceptance-2026-11-05/at-chromium-transcript.json)
uses actual Orca 48.1, AT-SPI2 and Chromium 154 on Linux. Generated speech text and
keyboard behavior were reviewed: private field labels/help, switch state, dialog
semantics, restored focus, password reveal state and the complete three-field
error announcement. This is not human audio listening or native VoiceOver/NVDA.
The WebKitGTK accessibility bridge misreported some entry/alert roles; it is not
counted as passing that check. Firefox could not initialize in this restricted
runtime. Playwright WebKit does not prove native iOS Safari/provider returns.

One early exploratory production page error lacked diagnostic detail. Subsequent
instrumented affected flows reported no new page errors; this is not a claim that
every exploratory attempt passed. Final repeats, rather than failed harness
locators or intermediate attempts, determine acceptance.

## Checks and measurements

Full [CI 41960443448](https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41960443448)
is green on `33130a5`. Final candidate `5bd6ee2` differs only in a restore-test
fixture timestamp; production code is byte-identical. The corrected fixture and
all 571 server tests pass locally with zero failures/skips. The merged release
tree equals that verified candidate. The new-head automatic CI may rerun these
unchanged application checks; it is not substituted for the evidence above.

The candidate passes 184 client tests and 571 server tests
with zero server skips, types, build, SEO, deployment contracts, 318 public browser
checks, 410 enabled discovery checks and 30 actual API/Postgres account journeys
across desktop/mobile Chromium and WebKit. Conditional public-lane exclusions are
covered by their enabled lanes. New deletion-state regressions failed before the
fix and pass afterward. No production credentials enter CI.

A duplicate candidate CI run hit an unchanged public WebKit versions-link assertion
and a transient internal-navigation failure. The other complete run passed the
entire suite; both affected cases then passed five local repeats each on the same
frozen candidate. The failed duplicate was rerun without changing production code; that rerun
exposed the separate restore-fixture clock boundary. Creation/expiry now derive
from one timestamp, preserving the strict 30-day guard. The corrected full server
suite passes, and the production code matches the independent green full CI.
[The record](evidence/production/acceptance-2026-11-05/webkit-rerun.json) preserves
the original failure and subsequent fixture correction; it is not counted as a first-attempt
pass.

The [synthetic load report](evidence/production/acceptance-2026-11-05/benchmark.json)
uses 20 readers with 1,000 saved books each: 400/400 HTTP 200, p50 265.5 ms,
p95 545.1 ms, max 948.3 ms; the p95 target is <1 second. Fresh lazy API
initialization is 156 ms. API process RSS peaked at 237 MiB, lifetime max 266 MiB.
A 20-hash burst completed 10 and rejected 10 with the bounded PASSWORD_BUSY result
in 628 ms; pools are limited to four per runtime role.
[Connection measurements](evidence/production/acceptance-2026-11-05/pool-acquisition.json)
cover the whole benchmark process: 545 queued acquisitions, queued p95 300.53 ms,
max 730.84 ms, maximum queue 15. Acquisition includes dispatch/connection overhead.
These are loopback measurements and exclude hosted infrastructure cold starts,
external redirects and mail delivery; they are not hosted capacity guarantees.

Native Vercel maintenance runs every five minutes. Consecutive successful runs,
sent/purged mail and actual deletion cleanup were observed. The independent
[production monitor](https://github.com/ddk220-light/MyBookshelf-web/actions/workflows/account-production-health.yml)
is green; an earlier genuine failure notification reached the owner as recorded
in [#152](https://github.com/ddk220-light/MyBookshelf-web/issues/152).

An additional [isolated recovery drill](evidence/production/acceptance-2026-11-05/recovery-drill.json)
proved that a wrong job key preserves unsent ciphertext, the retained key recovers
and drains it, a rotated auth key rejects the old cookie, explicit session/
challenge invalidation works, and new-key mail sends after draining. It used an
actual temporary Postgres database and controlled transport; that database was
removed. No production key was rotated. Keep backup-era keys available to isolated
restore operators and do not blindly replace keys with retained encrypted material.

Native auth logging is disabled, application failures use fixed safe codes/opaque
request IDs, and no log drains are configured. A scoped runtime-log query returned
no account lines; it does not establish provider-internal access-log retention.

## Remaining operational exits

1. **Actual Neon history and snapshot audit** — production project
   `misty-cake-69893992`, Vercel resource `store_Y2EqcbZyTyIEwnbN`. Verify the configured
   history window and manual-snapshot inventory/expiry are <=30 days. Free-plan
   metadata/public documentation does not prove the settings. The owner already
   has the exact read-only dashboard steps; no new token or paid plan is needed.
2. **Independent restore/runbook exercise** — the hosted engineering logical
   snapshot/suppression drill passed, including unrelated-reader preservation,
   session invalidation and idempotency. Temporary databases/ledger fixtures were
   removed. A second operator has not followed the runbook; do not claim one has. Complete
   the remaining incident/rotation/rollback rehearsal records as part of that
   recovery exercise; no production secret rotation is claimed.

These keep P01/S15/S20/T06 and their release/epic parents open. Completed email
implementation and verification work is reconciled separately. Provider setup,
live provider/relay/native-Safari checks and social expansion remain explicitly
deferred, required before their later activation.

## Recovery

Keep the additive schema, independent suppression ledger and accepted jobs during
rollback. The previous enabled deployment is `dpl_6mG8wqUn5CK2AcVWSyd2FYKqfogA`
(source `4c24530`); it retains the extra generic session-ended prompt after
deletion. Prefer forward repair for account-state changes. Do not restore the old
account-disabled setup as a routine UI rollback. For a genuine security/prerequisite
failure, temporarily close account entry while public browsing remains available;
fix and revalidate before reopening. Isolated database restore must replay the
external suppression ledger before any private traffic, as specified in
[OPERATIONS.md](OPERATIONS.md).
