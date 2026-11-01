# Free-content implementation contract and progress

Owner approved the free-reading artifacts and authorized implementation in this
chat on 2026-11-01 (America/Los_Angeles). Baseline: `760863a` on
`research/free-content-discovery`. Active worktree:
`/workspace/MyBookshelf-web-free-sources-implementation`, implementation branch
`research/free-content-discovery-implementation`.
Track delivery in [#73](https://github.com/ddk220-light/MyBookshelf-web/issues/73).
Create each story's native tasks when reached; implement and verify before closing.

## FCD01: contract decisions

- Content keys use `fcd:v1:<source>:<record>`; Gutenberg records are positive
  integer IDs; Europe PMC records include their source (`MED`, `PMC`, `PPR`).
  A DOI is an identifier, never an app key. Versions, translations, chapters and
  recordings retain distinct source-native keys. No fuzzy-title merge.
- Reviewed StoryWeaver translations use distinct native story IDs. The pilot
  requires English/Hindi/Tamil records with original credits, publisher levels
  and per-record review evidence before enablement.
- An omitted `kinds` searches books/learning resources. Paper searches supply
  paper kinds explicitly. Mixed book/paper requests are reported unsupported;
  the API never silently omits one requested scope.
- Search and resolve both accept `country` (ISO alpha-2 or absent/unknown) and
  language context. An observation for one explicit country does not establish
  availability in another. Gutenberg's US rights statement is retained with a
  generic country-rules prompt, not turned into a global legal claim.
- A reading action requires an explicit per-location `free_full_text` claim,
  positive evidence field/source/time, a safe supplied HTTP(S) URL, and an
  observation no older than 24 hours. Stale, missing, contradictory or
  country-mismatched observations become unknown; fetch failure is not absence.
  Reuse licence and free reading remain distinct. Missing licence never becomes
  an invented Creative Commons licence.
- `not_selected` means the planner did not query this source; `disabled` means
  it is not connected. `ok` with zero results is distinct from timeout,
  unavailable, throttled and quota-exhausted. Counts describe loaded items,
  never a federated global total.
- Default results contain anonymous free full text and a separately labelled verified free-account group (owner clarification 2026-11-01). An explicit unclear group may
  contain unknown/metadata-only items with labelled source links; previews,
  borrowing, unknown-price registration and restricted access stay excluded in v1.
- Source cursors remain server-owned. Browser tokens bind query, context,
  policy/index revisions and expiry. Shared live quota reservation and page
  advancement must pass a two-instance test before a live source is enabled.
  A memory implementation is a development/test adapter only; store failure
  disables uncapped live dispatch while keeping local metadata searchable.

## Browser shelf decision (before FCD04 implementation)

Persist a version-2 object with existing `savedBooks`/`recentBooks` untouched and
an additional `savedContent` array. Each content entry has
`kind: 'content'`, `contentKey`, `itemKind`, `title`, `authors`, optional safe
cover/host label and `savedAt`. No fake `bookKey` or ISBN; it opens
`/app/read/:contentKey`, never a library circulation route.

Read version 1 without rewriting it; on the first successful write, migrate to
version 2 under the same browser-storage key. Retain all existing saved books,
library choice and history; corrupt data keeps the existing recovery path.
Preserve the original object if migration write fails. Library books and content
share the existing 100-item save cap. Papers use the existing typeset-cover
fallback, labelled by item kind. Shelf sort operates on title/authors/saved time;
content never triggers a library availability check. Clear saved books clears
both saved collections after confirmation; viewed library history is unchanged.
Future account sync can carry this tagged content reference without merging it
into book-edition identity. No account feature is part of this delivery.

## Delivery state

| Story | Tasks | State |
| --- | --- | --- |
| FCD01 contracts | [#75](https://github.com/ddk220-light/MyBookshelf-web/issues/75), [#76](https://github.com/ddk220-light/MyBookshelf-web/issues/76) | Complete: five contract tests passed |
| FCD02 Gutenberg | [#78](https://github.com/ddk220-light/MyBookshelf-web/issues/78), [#79](https://github.com/ddk220-light/MyBookshelf-web/issues/79) | Complete: real 1,000-record subset, import tests and local API |
| FCD03 Europe PMC | [#85](https://github.com/ddk220-light/MyBookshelf-web/issues/85), [#86](https://github.com/ddk220-light/MyBookshelf-web/issues/86) | Adapter and shared coordination implemented/tested; hosted Redis binding and budgets pending |
| FCD04 UI/shelf | [#88](https://github.com/ddk220-light/MyBookshelf-web/issues/88), [#89](https://github.com/ddk220-light/MyBookshelf-web/issues/89), [#90](https://github.com/ddk220-light/MyBookshelf-web/issues/90), [#104](https://github.com/ddk220-light/MyBookshelf-web/issues/104) | Implemented; client, access, migration and desktop/mobile checks pass. Source progress and source-only retry now implemented |
| FCD05 expanded sources | [#107](https://github.com/ddk220-light/MyBookshelf-web/issues/107): OTL [#108](https://github.com/ddk220-light/MyBookshelf-web/issues/108), [#109](https://github.com/ddk220-light/MyBookshelf-web/issues/109); planner [#112](https://github.com/ddk220-light/MyBookshelf-web/issues/112), DOAJ [#113](https://github.com/ddk220-light/MyBookshelf-web/issues/113), arXiv [#114](https://github.com/ddk220-light/MyBookshelf-web/issues/114), broad index [#115](https://github.com/ddk220-light/MyBookshelf-web/issues/115) | Code/protocol and actual-source checks pass; flags remain off pending hosted coordination/budget enablement |
| FCD06 children's pilot | [#120](https://github.com/ddk220-light/MyBookshelf-web/issues/120): source review [#121](https://github.com/ddk220-light/MyBookshelf-web/issues/121), UI/validation [#122](https://github.com/ddk220-light/MyBookshelf-web/issues/122) | Three actual EN/HI/TA records reviewed. Free source login is owner-approved; labelled search/reader/shelf behavior and unchanged-record refresh are implemented (#137, #139). Hosted publication remains gated |
| FCD07 final validation | [#125](https://github.com/ddk220-light/MyBookshelf-web/issues/125): refresh [#126](https://github.com/ddk220-light/MyBookshelf-web/issues/126), verification [#127](https://github.com/ddk220-light/MyBookshelf-web/issues/127), handoff [#128](https://github.com/ddk220-light/MyBookshelf-web/issues/128) | Local implementation and regression checks pass; final intended hosted/refresh execution remains tracked in #127 |

Paper protocol and operational decisions: [OPERATIONS.md](OPERATIONS.md).
Implementation PR: [#110](https://github.com/ddk220-light/MyBookshelf-web/pull/110),
targeting `research/free-content-discovery`.

## Owner updates and additional-source delivery

The owner postponed Redis and confirmed that Codex owns children’s sourcing. The
existing OpenAlex key was rechecked and accepted; no replacement key or owner
curation is pending. Free source login is explicitly allowed. The API distinguishes
`free_account_required` from anonymous full text and unknown-price registration;
ordinary book search includes the reviewed set when its flag is enabled.

[FCD08 #140](https://github.com/ddk220-light/MyBookshelf-web/issues/140) adds Book Dash:
source research #141, metadata/local integration #142 and verification #143. A
real 30-English-edition subset preserves native IDs and source credits without
invented reading levels. Live refresh retained all keys; the anonymous original
reader and app flows passed. The [expanded source inventory](ADDITIONAL_SOURCES.md)
records other current candidates and their concrete gaps.

## FCD07-D: compare and repair the approved UI

Task [#146](https://github.com/ddk220-light/MyBookshelf-web/issues/146) under
FCD07 adds the [screen review](UI_REVIEW.md) and a reproducible comparison gallery
for all fourteen boards on phone/desktop in Daylight, Lamplight and Ink. The UI
now aligns browse/header spacing, compact result rows/pills, bookmark/detail
controls, formats/rights, children's cards, loading/empty/failure/limit states,
source coverage and the desktop selected pane. Recent searches use bounded
same-tab memory; source-account books retain the owner's disclosure requirement.

537 server tests with real Redis/no skips, 141 client tests, 262 broad browser
journeys, 50 final feature journeys and 84 axe/overflow capture checks pass, with
typecheck/build/SEO/deployment. The actual Tamil StoryWeaver and Book Dash app
flows pass again through save/reload/reopen. Source data and hosted release gates
are unchanged. Consult the PR for CI at the current commit.
