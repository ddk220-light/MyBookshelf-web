# Claude UI artifact: handoff and review record

Version 0.2, 2026-11-01. Story [S22 #56](https://github.com/ddk220-light/MyBookshelf-web/issues/56).
**Artifact status: approved at R02; implementation authorized.** Creator: Claude. Reviewer: Deepak Ravikumar.
This file is the brief; it is not a Claude-created artifact or an approval.

## Start condition

Start only after [R01 #7](https://github.com/ddk220-light/MyBookshelf-web/issues/7)
records Deepak's approval of the exact document-packet commit. Copy that commit
and decision into the record below. The owner requested documents for review
first, then Claude's artifact. No automatic Claude handoff is triggered here.

## Brief to give Claude

Create an interactive desktop/mobile account-management UI artifact for
MyBookshelf using the reviewed [PRD](PRD.md), [UX flows](UX_DESIGN.md),
[UI specification](UI_DESIGN.md) and [engineering contracts](ENGINEERING_DESIGN.md).
Use the current [approved reading design](../seo/IMPLEMENTATION_PLAN.md),
[reference boards](../design/2026-10-mobile/README.md) and existing reading CSS
tokens. Preserve the reading experience, three lights and private-account scope.

Show working simulated navigation for signup, verification, sign-in, reset,
Google/Apple entry/return/cancel, missing-name completion, recent authentication,
profile/email, methods/sessions, guest import, history consent, save/sync failure,
export and deletion. Cover UX-01–11. Use synthetic `example.test` identities and
synthetic reading data. No real auth, credentials, production requests or actual
destructive operations. Provider pages can be clearly labelled simulations.

Provide a screen/state switcher for normal, loading, empty, field-error,
verification/reset expired, provider cancelled/collision, offline,429, save
conflict, import overflow/retry, session expired, failed sign-out and deletion
confirmation/accepted states. Keep implementation metadata in the artifact's
review controls rather than in the simulated product flow.

Demonstrate 390px mobile and 1440px desktop in daylight/lamplight/ink, and resilient
320px/200%-zoom layouts. Include keyboard focus, visible labels, accessible errors,
modal focus/return and reduced motion. Use inspectable source with a local preview
entry point; keep assets self-contained or explicitly licensed. Do not claim
functional security, real provider success or production readiness from a mock.

Retain source/export under `docs/design/accounts/claude-artifact/`, with a README
containing preview instructions, creator, reviewed packet commit and artifact
version. Record screenshots/state coverage and any deliberate difference from the
reviewed requirements. Changes to product behavior must be called out for R02.

## Completion and reconciliation

- [x] R01 approval and input commit recorded.
- [x] Claude-produced preview and inspectable source/export available to Deepak.
- [x] Each UX flow and UI route maps to named artifact screens and material states.
- [x] Desktop/mobile and all three lights inspected; implementation keyboard/focus and screen comparisons recorded in [SCREEN_REVIEW.md](SCREEN_REVIEW.md).
- [x] Missing states, assumptions and proposed changes listed with disposition.
- [x] UI_DESIGN.md and affected delivery tasks reconciled with the artifact; subsequent implementation fixes tracked in #135, #136 and #138.
- [x] R02 receives exact source commit, preview and updated packet; approval recorded below at `36a1436`.

## Version and review record

| Field | Value |
| --- | --- |
| R01-approved packet commit | `5056de00bc1091fd11a8b49cf358e2594c37a49e` (packet v0.2, DEC-01–10 as proposed). Approved by Deepak Ravikumar on 2026-11-01; recorded on [#7](https://github.com/ddk220-light/MyBookshelf-web/issues/7). |
| Claude artifact version/source commit | Artifact v0.2, canvas version 4 (`1793518146-c9ad`); source in this commit under `docs/design/accounts/claude-artifact/` |
| Preview / source export | https://claude.ai/artifact/4wk6xx8eN6JZdFz95uM1d8 (private until shared) · [source and README](../design/accounts/claude-artifact/README.md) |
| Coverage inventory | Below |
| Claude assumptions and deviations | Below |
| R02 decision / reviewer / date | Approved by Deepak on 2026-11-01 in chat, at `36a1436`; progressive story-task publication authorized |
| Approved artifact used by T04 | Canvas version 4 (`1793518146-c9ad`), repository snapshot `36a1436` |

## Coverage

| Flow | Artifact screens (Main) | States shown |
| --- | --- | --- |
| UX-01 Sign up | Settings, guest; Create account; Check your email | checking account, accounts unavailable; submitting, field errors, rate limited; resent, mail delayed, verified on another device |
| UX-02 Verify | Verify link | ready, verifying, expired, already used |
| UX-03 Sign in | Sign in; Google or Apple (labelled simulation); Add your name | wrong details, not verified, rate limited, provider cancelled, provider collision, offline; name missing from provider; Apple relay address |
| UX-04 Recovery | Forgot password; New password | neutral sent message; expired or used, updated |
| UX-05 Guest import | Bring books over | preview with history unchecked and library choice, importing, over capacity, failed, imported with keep or remove the copy here |
| UX-06 Reading and sync | Shelf while signed in; Clear saved books | saved, saving, save failed, changed on another device, undo after remove, couldn't refresh, empty; clear confirmation |
| UX-07 Account details | Account settings; Change email | saving and saved name, email change pending |
| UX-08 Security and methods | Account settings; Confirm it's you | last sign-in method (disconnect disabled with reason), couldn't sign out another device |
| UX-09 Sign out | Signing out | not confirmed, session expired, signed out |
| UX-10 Export and delete | Export; Delete account | downloaded, error; confirm with Cancel first, accepted, no reply |
| UX-11 History | Recently viewed choice; Account settings | off by default, on, paused |

Every screen works at Phone 390, Phone 320 and Desktop 1440, in Daylight,
Lamplight and Ink, with a 200% page-zoom view for phones. The `Emails` board covers:

| Email | Covers |
| --- | --- |
| E1 | verify email |
| E2 | sign-up attempt for an existing account |
| E3 | password reset |
| E4 | reset request for a Google- or Apple-only account |
| E5 | unknown address (nothing sent) |
| E6 | password changed |
| E7 | confirm new email |
| E8 | change requested, to the current address |
| E9 | email changed |
| E10 | sign-in method connected |
| E11 | account deleted |
| E12 | expired or used links (nothing sent unless asked) |

## R02-approved deviations and decisions

1. **Wording (owner-approved, applied to UX_DESIGN.md):**
   - "Signed-in devices" instead of "Sessions".
   - "Remove the copy here" instead of "Remove device copy".
   - "Couldn't finish signing out" as the heading when the server doesn't
     confirm sign-out, with Try again and Continue as guest.
2. **Desktop entry point (owner-approved):** the sidebar footer shows "Sign
   in" for guests, and the private name and email when signed in. Settings
   remains the main entry. There is no sign-up prompt while saving.
3. **Provider buttons (owner-approved):** these follow each provider's
   published style.
   - **Google:** the four-colour G on a white button with a `#747775` border
     (dark variant in Lamplight), Roboto Medium, "Continue with Google" on
     Create account and "Sign in with Google" on Sign in.
   - **Apple:** black with the white Apple logo (white in Lamplight), "Continue
     with Apple" or "Sign in with Apple".

   Check the final assets against each provider's current guidelines at
   implementation.
4. **Emails E8 and E10: kept (owner decision, 2026-11-01).** These are now in
   PRD AC-07 and AC-08, marked as a change after R01 for R02.
   - **E8:** a notice to the current address when an email change is
     requested, in addition to the notice when it completes (E9).
   - **E10:** security notices when a sign-in method is connected or
     disconnected, or a first password is set.

5. **Apple without a name:** returning from Apple always goes to "Add your
   name", because Apple shares the name only on first authorization.
6. **Dialog focus:** the canvas can't trap or restore focus. The structure
   (labelled dialog, Cancel first) is shown, and the UI specification's focus
   rules apply in implementation.
7. **Emails use one light style** in every reading light. Sender domain and
   support address are placeholders until P02 configures sending.

Creation alone does not authorize feature implementation. R02 approves the actual
artifact plus reconciled designs; T04 later evaluates the implemented UI against
that version.
