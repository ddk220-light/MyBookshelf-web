# Claude UI artifact: handoff and review record

Version 0.1, 2026-11-01. Story [S22 #56](https://github.com/ddk220-light/MyBookshelf-web/issues/56).
**Artifact status: not started.** Creator: Claude. Reviewer: Deepak Ravikumar.
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

- [ ] R01 approval and input commit recorded.
- [ ] Claude-produced preview and inspectable source/export available to Deepak.
- [ ] Each UX flow and UI route maps to named artifact screens and material states.
- [ ] Desktop/mobile and all three lights inspected; keyboard/focus checks recorded.
- [ ] Missing states, assumptions and proposed changes listed with disposition.
- [ ] UI_DESIGN.md and affected delivery tasks reconciled with the artifact.
- [ ] R02 receives exact source commit, preview, screenshots and updated packet.

## Version and review record

| Field | Value |
| --- | --- |
| R01-approved packet commit | Pending owner review |
| Claude artifact version/source commit | Not created |
| Preview / source export | Not created |
| Coverage inventory | Pending UX-01–11 and UI route mapping |
| Claude assumptions and deviations | Pending artifact |
| R02 decision / reviewer / date | Pending Deepak review |
| Approved artifact used by T04 | Pending R02 |

Creation alone does not authorize feature implementation. R02 approves the actual
artifact plus reconciled designs; T04 later evaluates the implemented UI against
that version.
