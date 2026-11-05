# Account management: review packet

Packet version **0.2 — R01 and R02 approved**, 2026-11-01. Product owner/reviewer:
Deepak Ravikumar. Draft author: Codex. Deepak approved the document packet and
DEC-01–10 in chat on 2026-11-01 (America/Los_Angeles), at commit
`5056de00bc1091fd11a8b49cf358e2594c37a49e`. Implementation and evidence are recorded in [IMPLEMENTATION.md](IMPLEMENTATION.md)
and [VALIDATION.md](VALIDATION.md). The owner authorized production completion;
email accounts are live. [Release acceptance](RELEASE_ACCEPTANCE.md) records the
verified workflows and remaining backup/operator evidence.
The implemented screens and approved artifact are compared in
[SCREEN_REVIEW.md](SCREEN_REVIEW.md), with a normal-size phone/desktop gallery.

Start with the PRD and the decisions below. The other documents specify how the
experience, implementation and release would meet those requirements.

This revision retains the ten product decisions below. Engineering/UI/test
clarifications cover maximum-size imports, private metadata snapshots, reset
atomicity, identity-cache clearing and recovery after a lost deletion response.
Unchanged documents retain their own version 0.1; review the whole packet at its
linked commit. R01 approval is recorded in [#7](https://github.com/ddk220-light/MyBookshelf-web/issues/7).
Deepak approved all checked-in artifacts at `36a1436` on 2026-11-01 and
instructed implementation with story-by-story task expansion. R02 is complete;
R03 has the owner’s conditional deployment authorization; final operational
acceptance remains open. See [the implementation record](IMPLEMENTATION.md).

| Document | Review purpose | Delivery issue |
| --- | --- | --- |
| [PRD](PRD.md) | Scope, observable requirements, defaults and acceptance | [D01 #2](https://github.com/ddk220-light/MyBookshelf-web/issues/2) |
| [UX design](UX_DESIGN.md) | Journeys, screen structure, copy and failure recovery | [D02 #3](https://github.com/ddk220-light/MyBookshelf-web/issues/3) |
| [Engineering design](ENGINEERING_DESIGN.md) | Auth, data, concurrency, API and operational contracts | [D03 #4](https://github.com/ddk220-light/MyBookshelf-web/issues/4) |
| [Test strategy](TEST_STRATEGY.md) | Requirement coverage, final evidence and release gates | D03; T01–T06 |
| [UI specification](UI_DESIGN.md) | Routes, components, state, accessibility and integration | [D04 #5](https://github.com/ddk220-light/MyBookshelf-web/issues/5) |
| [Delivery plan](DELIVERY_PLAN.md) | Epics, concrete tasks, estimates, owners and dependencies | [D05 #6](https://github.com/ddk220-light/MyBookshelf-web/issues/6) |
| [Claude handoff](UI_ARTIFACT.md) | Brief and acceptance for the subsequent UI artifact | [S22 #56](https://github.com/ddk220-light/MyBookshelf-web/issues/56) |

The owner later deferred Google/Apple activation and chose Resend for production
only. The original approved decisions below remain the design history; current
activation sequencing and conditional live checks are recorded in
[OPERATIONS.md](OPERATIONS.md#owners-current-rollout-choices).

## Decisions for this review

These decisions were accepted in R01 with no requested changes or exceptions.
Engineering feasibility checks are tracked
separately in S01 and do not require choosing an auth-library version now.

| ID | Approved decision | Why / tradeoff |
| --- | --- | --- |
| DEC-01 | Release includes email/password, Google **and** Apple. All reading data and names stay private; social features are deferred. | Provider setup is part of the critical path; no silent Apple deferral. |
| DEC-02 | Accounts hold up to **1,000 saved references**; guest limit remains 100. One selected library. Appearance, shelf sort and companion preferences remain device-local. | Useful cross-device capacity with bounded operations; no broader settings sync in v1. |
| DEC-03 | Cloud history starts **off**. Opt-in keeps newest 50 distinct books for 30 days. Pause stops new collection; existing history expires normally. Guest history behavior is preserved. | Clear privacy choice; history import and future collection are separate controls. |
| DEC-04 | Guest import requires explicit confirmation, with history unchecked. Keep the device copy by default; offer explicit removal after server acknowledgement. | Avoid losing a shared browser's shelf; warn that retained local books remain visible to other device users. |
| DEC-05 | Signed-in data uses memory only in the browser. No offline write queue. Cloud errors show retry; they never save into the guest shelf. | Predictable account isolation, at the cost of offline account editing. |
| DEC-06 | Sessions expire after 7 days of inactivity, renew at most daily, and require fresh login after 30 days absolutely. Sensitive actions need authentication within 5 minutes. | Limits forgotten shared-device sessions; social-only users reauthenticate with a linked provider. |
| DEC-07 | Name is private and editable. Email changes require recent authentication and verification of the new address; notify the old address. No automatic provider linking by email. | Prevents accidental account takeover; people who lose every login method have no manual identity bypass in v1. |
| DEC-08 | Account deletion immediately disables access, targets live-data cleanup within 24 hours, and expires backups within 30 days. Minimal deletion suppression records persist 35 days after cleanup. | Requires tested retries and restore suppression; provider outages may delay provider-side revocation and must be reported. |
| DEC-09 | No product analytics SDK or per-book telemetry. Release measures use synthetic tests and aggregate operational counts without account/book labels. | Supports reliability assessment; conversion/retention measurement would need a separate decision. |
| DEC-10 | Conflicts are visible and require refresh/retry; clearing a shelf/history invalidates older pending writes. Undo lasts 10 seconds and cannot overwrite a newer change. | Avoids surprising resurrection across devices; occasionally asks the reader to repeat an action. |

## Review sequence and record

The owner's latest instruction moves all document drafts before the first review.
This supersedes the older PRD-only-first sequence in the original backlog.

1. **R01 / [#7](https://github.com/ddk220-light/MyBookshelf-web/issues/7): review this document packet.**
   Record the exact Git commit, DEC-01–10 decisions, requested changes and Deepak's
   explicit decision. Current decision: **approved, 2026-11-01**, for the commit above.
2. **S22:** after R01 approval, Claude makes the interactive UI artifact from the
   reviewed packet. Its source, preview, state coverage and deviations are recorded
   in [UI_ARTIFACT.md](UI_ARTIFACT.md). Current artifact: **v0.2 / canvas v4 approved at R02**
   ([source](../design/accounts/claude-artifact/README.md)).
3. **R02 / [#8](https://github.com/ddk220-light/MyBookshelf-web/issues/8): review Claude's artifact and reconciled documents/tasks.**
   Explicit approval authorizes provisioning and feature implementation. Current
   decision: **approved, 2026-11-01**, by the owner’s explicit chat instruction.
   The owner superseded full upfront child publication with progressive story decomposition.
4. **R03 / [#9](https://github.com/ddk220-light/MyBookshelf-web/issues/9): review the tested staging release**, then L01 production rollout.

For each review, append reviewer/date, immutable artifact commit(s), decision,
comment disposition and accepted exceptions to its issue. R01 records the owner’s
chat approval; R02 is approved and R03 remains pending. Changed product behavior returns to the relevant
review before implementation continues.

## Evidence and limits

The packet was designed against application baseline `9f5bb4bd30055483dfabdcd02541e3060ccfdaf5`
and planning branch `account-settings` at `f648f20`. See the engineering inventory
for inspected files. Checks passed for local document links, all 17 PRD requirements mapped to
final tests, task specifications for all 22 stories, and the 56-issue/117-edge
native dependency graph (acyclic; implementation reaches R02 and rollout R03).
Whitespace checks passed. That paragraph describes the planning checkpoint. Current auth, browser,
performance and operational evidence, with unresolved live exits, is maintained
in [VALIDATION.md](VALIDATION.md).

Use the existing [project](https://github.com/users/ddk220-light/projects/3),
[backlog](../plans/2026-10-31-accounts-delivery-backlog.md) and
[foundation analysis](../plans/2026-10-31-accounts-social-foundation.md).
