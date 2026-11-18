# Root causes: accounts

Read from the code on 19 November 2026; nothing was run or measured. Paths are
under the repository root. `S/` = `server/accounts/`, `A/` = `server/auth/`,
`J/` = `server/jobs/`, `U/` = `client/src/v2/ui/account/`,
`CS/` = `client/src/v2/storage/`, `CA/` = `client/src/v2/auth/`,
`OS` = `U/OneShelfAccountPages.tsx`.

## 1. Password rules

- Server rule and message: `S/validation.js:19`. Leak check: `S/validation.js:26-48`,
  called from `S/auth-actions.js:56`, `S/credential-actions.js:42,73`,
  `S/method-actions.js:303`, wired in `S/service.js:18,72-84`. Better Auth is
  also set to 15 (`A/auth.js:42`; maximum 256 at `:43`).
- Client: `OS:18-19,143-144,160-161,181-182,246,255-256,269`; hint at
  `U/AccountSettingsPage.tsx:976`.
- Other text: `docs/policy/privacy.md:91`, `client/public-app/privacy.html:23`.
  Tests: `S/validation.test.js:15-30`,
  `client/src/v2/ui/panel/PanelPages.test.tsx:162`,
  `client/e2e/accounts-visual.spec.js:46`, `client/e2e/one-shelf-account.spec.js:122`.
- Better Auth's own minimum: default 8, smallest settable 1 (0 falls back to 8).
- The password shown in plain text after a refusal: no app code reveals it. The
  refusal is client-side and leaves the form mounted (`OS:146-148`); iOS shows a
  suggested strong password in clear until the form is submitted. Unconfirmed
  on a device.
- Fix: `minPasswordLength: 1`; drop the length test (keep the maximum); delete
  `checkCompromisedPassword`, its call sites and tests; remove the client
  constants, the `short` and `leaked` branches and the hint. Reuse the existing
  Show/Hide `PasswordField` (`U/AccountPages.tsx:97-148`) for the bare inputs at
  `OS:113,192,270` and `U/AccountSettingsSmall.tsx:112`. There is no re-enter
  field today.
- Risks: both server checks change together, because a Better Auth 400 becomes
  a 503 "Couldn't connect" (`S/middleware.js:446`). With one-character
  passwords the sign-in limit (5 per address per 15 minutes,
  `S/auth-actions.js:162-165`) is the only guard.

## 2. Creating an account takes about 10 s

- Most likely a cold start. A guest's `/session` and `/capabilities` never
  start the account service (`S/middleware.js:193-196`), so the sign-up request
  itself loads the sign-in library, opens two pools, runs three start-up
  queries (`S/service.js:28-52`) and wakes the sleeping database.
- Then (`S/auth-actions.js:49-80`): two limit queries, the leak check (4 s cap,
  `S/validation.js:36`), one password hash, about six queries, one check query.
- The email is sent after the response (`J/mail-dispatch.js:97-102`).
- Warm, the same work is fast: the reset did hash, leak check and round trips
  in 0.55 s; the first sign-in took 2.2 s against 0.35 s warm.
- Fix: remove the leak check; start the service when Create account or Log in
  opens (one `GET /api/auth/ok` from `U/AccountEntryGate.tsx`: a reader's
  action, not a timer); open the two pools in parallel; add `Server-Timing` to
  account responses.
- Risks: warming wakes the database for readers who open the form and leave;
  `client/e2e/request-budget.spec.js` and the "guest never initializes" server
  test need updating. The split is unmeasured: time one cold and one warm
  sign-up.

## 3. Verify and reset end at an empty Log in

- `A/auth.js:40,51` turn automatic sign-in off; `S/auth-actions.js:143` calls
  `verifyEmail` without headers or cookies; reset returns only a status
  (`S/credential-actions.js:40-54`); the pages link to Log in with no email
  (`OS:261-263,298`; the input at `:112` has no default).
- Fix, verify: `autoSignInAfterVerification: true`, pass headers, forward
  cookies (`S/middleware.js:264-267`), then `refresh(true)`.
- Fix, reset: the library has no such option. Call `signInEmail` with the new
  password in the same transaction (pattern at `S/credential-actions.js:62`)
  and forward cookies (`S/middleware.js:282-285`).
- Cheaper alternative: return the email in both replies and pass it in router
  state (never in the address) to fill Log in.
- Risk: a verification link then signs in whoever opens it (single use, 24 h).
  A reset link already gives that power.

## 4. Reset link "expired" after a reload

- `CA/LinkTokenProvider.tsx:19-28` moves `?token=` into memory and replaces the
  address, so a reload has no token and the page starts expired (`OS:237`; the
  same for verify at `:281` and email change at `U/AccountPages.tsx:403-412`).
- "Send a new link" is a link to the empty Forgot password form (`OS:266`).
- Fix: stop stripping; clear the address only after success. Better: put the
  token in the fragment in emails (`J/mail.js:240`) and read `location.hash`,
  keeping `?token=` for mails already sent; a fragment never reaches server
  logs. Rename the button "Request a new link".
- Risk: the token stays in browser history until used or expired (single use;
  30 minutes for reset, 24 h for verify). Referrers are already off site-wide
  (`vercel.json:154`).

## 5. "Bring books over"

- The jump: `AccountNotice` puts "Loading your account shelf…" in the page flow
  above the form (`U/AccountSummary.tsx:144-149`,
  `client/src/v2/ui/AppFrame.tsx:102-114`, `U/account.css:298-309`) while the
  account shelf loads (`CS/AccountLibraryStateProvider.tsx:50,94`). Every
  sign-in goes to this screen when the browser holds anything
  (`U/AccountPages.tsx:421-428`).
- Reuse: `POST /api/account/imports` (`S/imports.js:87-199`, safe to repeat,
  with receipts) through `CS/AccountRepository.ts:282-328` and the provider's
  `importGuest` (`CS/AccountLibraryStateProvider.tsx:330-339`).
- Duplicates today: skipped by book key only (`S/imports.js:116-126`).
- Viewed before today: keeps the newer time and trims to 50
  (`S/imports.js:145-160`, `S/history.js:10-14`).
- Library today: the default `keep-account` never sets a library, even when the
  account has none; the checkbox sends `use-device` (`S/imports.js:162-172`).
- "Remove the copy here": after confirmation it deletes only unchanged imported
  items from the browser (`CS/importCleanup.ts:9-51`).
- Free books and papers (`savedContent`): never sent
  (`CS/AccountRepository.ts:296`), kept in the browser, hidden while signed in
  (`CS/AccountLibraryStateProvider.tsx:347`).
- Log out today: the browser record is never touched, so the guest shelf
  returns as it was (`client/src/v2/context.tsx:81-86`).
- Fix: drop the redirect. After the first account snapshot loads, quietly send
  only the missing books (filter with `isOnShelf`, which also matches ISBN-13),
  with `use-device` only when the account has no library; retry on the next
  load.
- Risks: because the guest copy stays, a book later removed from the account
  would be added again at the next sign-in on that browser; this needs a local
  "already merged" list, or emptying the guest copy. Imports are limited to 5
  an hour (`S/service.js:165-173`). A failed import leaves a pending request
  that locks the shelf (`CS/AccountLibraryStateProvider.tsx:354`) unless
  cleared.

## 6. Changes reach the other device late

- `CS/AccountLibraryStateProvider.tsx:27,117-121` skips the focus reload when
  the last load was under 60 s ago.
- Fix: on focus, ask only `/api/account/state` (one small request with the
  three revision numbers) and reload books and history only when they differ;
  lower the floor to about 10 s. No timers.
- Risk: more database wake-ups; the 60 s floor was added to save compute.

## 7. "Confirm it's you" seconds after signing in

- There is no freshness window. Every sensitive action needs a one-use proof
  (`S/credential-actions.js:13-22`) issued only by `/reauth/password`
  (`:55-71`, valid 5 minutes), and the dialog always opens at that step
  (`U/AccountSettingsPage.tsx:162,908`).
- Fix: issue a proof without a password when the session is under about 10
  minutes old; the client tries that first. Consider still asking for Delete.

## 8. A logged-out session still listed

- Cause not found. The list shows every unexpired session row
  (`S/session-actions.js:21-30`). Log out (`S/auth-actions.js:209-213`) and
  re-confirmation (`S/credential-actions.js:66`) both delete the old row, and
  tests cover both. One gap: the library's sign-out swallows a failed delete
  and logging is off (`A/auth.js:94`), so the cookie can clear while the row
  stays.
- Next step: reproduce (log in, out, in; open the devices list) and read the
  session rows.

## 9. A deleted account answers "This account is unavailable"

- `A/transaction.js:17-19` rejects a non-active account before the password is
  checked, so any password gets the 403; a second check is at
  `S/auth-actions.js:191-205`. Client text: `OS:35,61`.
- It lasts until the hourly job purges the user
  (`S/deletion-actions.js:163-219`); after that the address answers like any
  other. Wrong password: `S/middleware.js:437-445`, then `OS:98,114`.
- A deletion email exists (`J/mail.js:227-234`) but is queued only at the purge
  (`S/deletion-actions.js:208`), so it arrives up to an hour later.
- Fix: in `signin`, map both rejections to the wrong-password answer;
  optionally queue a "deletion started" mail in `deleteAccount`.

## 10. Two account screens

- "Account settings" is `U/AccountSettingsSmall.tsx` (`client/src/v2/App.tsx:77`):
  email, Change password (sends a reset link, `:39-48`), Delete account
  (password dialog, `:68-123`), More.
- "Your account" is `U/AccountSettingsPage.tsx` (`client/src/v2/App.tsx:78`,
  heading `:445`): name, sign-in methods, change email, signed-in devices,
  clear Viewed before, Review import, clear saved books, download data, Delete
  account; dialogs at `:858-1013`.
- `AccountSummary` (`U/AccountSummary.tsx:5-72`) is unused.
- Fix: one page (large). Two delete flows and two change-password flows to
  reconcile.

## 11. Notices that stay

- "Saved": set at `CS/AccountLibraryStateProvider.tsx:154`, never cleared,
  shown by `U/AccountSummary.tsx:150-167`. Clear it on success.
- "You've been signed out": set at `CA/AccountSessionProvider.tsx:145-162`,
  cleared only on sign-in or `continueGuest` (`:155,283`). The notice's own
  "Continue as guest" calls `refresh()` (`U/AccountSummary.tsx:139`), which does
  not clear it. Add a dismiss, and hide the notice on the entry pages.

## 12. Email subjects

- `J/mail.js:154-235` (first item of each template), sent at `:267-282`.
- Fix: add a unique reference header (the job id) to each message; subjects
  stay as they are. The header's effect on Gmail threading is untested.
