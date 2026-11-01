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
- Default results contain free full text only. An explicit unclear group may
  contain unknown/metadata-only items with labelled source links; previews,
  borrowing, registration and restricted access stay excluded in v1.
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
| FCD01 contracts | [#75](https://github.com/ddk220-light/MyBookshelf-web/issues/75), [#76](https://github.com/ddk220-light/MyBookshelf-web/issues/76) | Implementing |
| FCD02 Gutenberg | Publish tasks when FCD01 is verified | Next |
| FCD03 Europe PMC | Publish after local slice | Planned |
| FCD04 UI/shelf | Uses approved free-reading boards and above shelf decision | Planned |
| FCD05 expanded sources | Per-source contracts and enablement gates | Planned |
| FCD06 children's pilot | Requires actual reviewed records; board examples are fictional | Planned |
| FCD07 final validation | Runtime/source/accessibility/regression evidence | Planned |
