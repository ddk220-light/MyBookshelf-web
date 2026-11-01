# Free reading: UI boards and implementation handoff

Status: **approved UI reference; implementation in progress.** Dated 2026-11-01.
Current decisions, implemented slices and remaining gates are in
[the implementation record](../../research/free-content/IMPLEMENTATION.md).
The [implementation screen review](../../research/free-content/UI_REVIEW.md)
compares all fourteen boards on phone/desktop in all three reading lights and
records the fixes, evidence and deliberate data-dependent differences.

Implement free-book and research-paper discovery from this document, the boards
in [`boards/`](boards/) (gallery: [index.html](index.html)) and the research in
[`../../research/free-content/`](../../research/free-content/README.md). The
research README's "UI proposal and owner decisions" section records the owner's
answers; they are repeated in [Decisions](#1-decisions) below. Where this file
and the architecture proposal disagree on UI, this file wins; on backend
contracts, [architecture.md](../../research/free-content/architecture.md) wins.

The same boards are on a private Design canvas for owner review:
https://claude.ai/artifact/NHwYSSaU4VGXDt2Pp9aA4X. The repo copies are the
reference for implementation.

## Viewing the boards

From the repository root run `python3 -m http.server 4196` and open
http://localhost:4196/docs/design/2026-11-free-content/index.html. Add
`?light=lamplight` or `?light=ink` to any board. Phone boards are 390×844;
`DeskFreeSearch` is fluid and drawn at 1280 wide. Inside a board, links between
boards work and links to hosts do nothing.

**All records are samples.** Project Gutenberg IDs, titles and the Gutenberg
rights wording are real. Every paper, author, journal, DOI (the `10.5555` test
prefix), arXiv ID and children's story is invented. Never copy board records
into fixtures as if they were real catalog data.

Boards follow the existing app: reading-light tokens from
[`../2026-10-mobile/reading-lights.css`](../2026-10-mobile/reading-lights.css),
Newsreader headings, system sans body, 44px touch targets and the four-tab bar.
Covers are drawn as coloured blocks because no cover art is redistributed; in
the app use real covers when a source supplies them and the existing
placeholder otherwise.

## 1. Decisions

1. **Keep the four tabs.** Free to read and Papers are scopes inside Search.
2. **Free books and papers can be saved to the shelf.** See
   [§6](#6-saving-to-the-shelf): the storage shape still needs an engineering
   decision before coding.
3. **Unclear access is hidden by default, and marked when shown.** The Free to
   read list never mixes unclear items in silently.
4. **No "include previews and loans" option** in the first release.
5. **Daily limit:** say the wide paper search is at today's limit. Do not name
   the provider to readers.
6. **Children's pilot:** English, Hindi and Tamil, using each publisher's own
   reading levels.
7. **Library link-back:** a free book offers "Prefer print? Find it at
   [library]". It runs a title/author search; it never asserts the two are the
   same edition.
8. **Rights text stays generic:** the source's own statement plus a prompt to
   check your country's rules. No per-country legal claims.
9. **Request identification** uses the existing public contact. Use is
   non-commercial. Traffic expectations and quotas are set later, so build
   budgets as configuration, not constants.

## Owner clarification: free source accounts (2026-11-01)

The owner clarified: free source login is acceptable, and those books must be
searchable with a link to the book. Verified `free_account_required` books now
appear under **Free account required**, with the condition repeated on the card
and before the source reading link. Anonymous reading remains distinct. Unknown
registration charges, previews, loans and paid access remain excluded. These are
accounts on the reading site, not a MyBookshelf account feature. The updated
implementation and source evidence supersede the old registration exclusion in
the boards; the remaining approved layout and shelf behavior still apply.

## 2. Scope

First release (matches research Phase A/B):

- Free to read: Project Gutenberg (local metadata import), Open Textbook
  Library and the bounded Book Dash catalog (owner-approved source expansion). Other free versions (LibriVox, Wikisource) appear only on detail
  pages as separate items, when a source links them.
- Papers: OpenAlex (when its key and budget are verified), Europe PMC, DOAJ,
  arXiv.
- Children's stories: the reviewed pilot set only, labelled as such.
- The library book page gains an "Also free to read" section.
- Desktop and mobile layouts, all three reading lights.

Not in the first release: previews/loans, Standard Ebooks, DIKSHA/NCERT, CORE,
HAL, Zenodo, bioRxiv/medRxiv as live sources (show "Not connected yet" if
listed), embedded readers, downloads proxied through our server, accounts.

## 3. Navigation and routes

Search keeps one route, `/app/search`. The scope control becomes three
segments:

| Segment | Behaviour |
| --- | --- |
| Library books | Today's search. **Keep the existing "All books / [library]" control** as a second row under this segment only; the boards omit it for space. ISBN scanning stays here. |
| Free to read | Free books and stories (`kinds` = book, learning_resource; children's pilot via its tile). |
| Papers | Articles, preprints, chapters (`kinds` = article, preprint, chapter, thesis, report). Query field also accepts DOI and arXiv IDs. |

Proposed URL state so back/forward and sharing work: `/app/search?scope=free&q=…`
and `/app/search?scope=papers&q=…`; no `scope` means Library books, which keeps
existing links valid. Content detail: `/app/read/:contentKey`, using the opaque
`Item.key` from the content API. Do not reuse `/app/books/:bookKey`: content
keys are a separate identity space (architecture §2, §3). The children's pilot
is `/app/search?scope=free&collection=children`. All `/app/` routes stay noindex
and out of the sitemap.

Tab bar: Search stays active for every board except the library book page,
where Shelf is active as today.

## 4. Boards

Each row names the board, what it proves, and the data it needs from
`POST /api/v2/content/search` / `resolve`.

| Board | What it shows | Data and behaviour |
| --- | --- | --- |
| `FreeStart` | Free to read with no query: four browse tiles (Classic literature, Open textbooks, Children's stories, Research papers) and recent free searches. | Tiles are static links into scopes/collections. Recent searches reuse the existing search memory, tagged with scope. Tile subtitles name the source. |
| `FreeBookResults` | Results for a free-book query, filter chips, loaded count with a Sources link, and the hidden-unclear notice. | Show **loaded counts**, never a global total ("3 free books shown · from Project Gutenberg"). Anonymous `free_full_text` items and a separately labelled `free_account_required` group are listed. Items with `unknown`/`metadata_only` access for this query are counted in the notice; "Show them, labelled" appends them under an "Unclear access" heading (see `DeskFreeSearch`). `preview`, `borrow`, unknown-price `registration` and `restricted` are never shown. Verified free accounts follow the owner clarification above. Filter chips: language, format, kind. Unsupported filters must be disabled with a reason, not silently ignored. |
| `FreeBookDetail` | One free edition: Read at host (primary), format links, rights, other free versions, library link-back, Save. | Primary action is the location's `readerUrl` or `landingUrl`, labelled "Read at [host]". Format buttons only for supplied `downloads` (label by MIME: EPUB, Kindle, Plain text, PDF). Rights box: source statement verbatim plus generic country note; footer "From [source] · checked [relative time]" from `evidence.observedAt`. "Other free versions" lists related items only when `relations` carry source evidence; each row states how it differs ("Separate recording", "Different source text"). |
| `LibraryBookFreeEdition` | Existing `/app/books/:bookKey` page with a new "Also free to read" card under availability. | Show only when a free item is linked by an exact identifier or the Open Library work ID (`workId`) with source evidence. Never by title similarity. Copy must say it is a different edition. Link opens `/app/read/:contentKey`. If resolution fails or is slow, omit the section; do not show an error on the library page. |
| `PaperResults` | Paper results with type pill, title, authors, container/year, and access line naming index and host. | Pill from `kind` (+ `version` for preprints: "Preprint · v3"). Source-supplied flags ("Correction listed", "Retracted") as a second pill in `--chk`/`--err`, worded as the source's claim. Access line: "Free · Found via [index], read at [host]" when they differ; "Free · HTML, PDF at arXiv" when the index is the host. Authors truncate to three plus "+ N". |
| `PaperDetail` | Preprint with versions, published version relation, licence, Save. | Versions are separate rows linking to each version. The published version is a relation with its own access state; never substitute it for the preprint or show the preprint's licence on it. Licence line uses `license.id` when present; when absent, say "Licence not stated". |
| `SourcesSheet` | Bottom sheet listing each source and its status for this query. | One row per entry in the response `sources` array. Status copy: ok → "N shown" (and "M already listed" for duplicates); not chosen by planner → "Not searched this time" + "Search it" action; disabled flag → "Not connected yet"; timeout/throttled/quota → see states below. Reuse `ui/Sheet.tsx`. |
| `Loading` | Per-source progress while searching. | Rows update as sources answer (ok / searching / queued). Results stream in below. Static skeleton blocks; no shimmer. Copy states the 5-second cap. |
| `PartialCoverage` | One source timed out; others' results shown. | Notice above results with "Try [source] again", which retries only that source using the search session cursor. Count line says "N of M sources answered". |
| `SourcesDown` | Every source failed with no cached results. | `role="alert"`. Must say this does not mean there's no free copy. Actions: Try again; Search library books instead (switches scope, keeps query). Never render as zero results. |
| `NoFreeCopy` | All sources answered; none has a free copy. | Lists each searched source with "0 matches". Primary action: check the selected library (or "Choose a library" when none). No previews/loans option. |
| `BudgetUsed` | Broad paper index at its daily limit; specialist results shown. | Notice: "Wide paper search is at today's limit. It resets tomorrow…" Do not name the provider. Show results from the remaining sources. |
| `ChildrensPilot` | Reviewed children's set: language chips (English, हिन्दी, தமிழ்), publisher levels 1–4, story cards with credits and licence. | Copy must say it is a reviewed starter set, not every free children's book. Level is "as the publisher labels it"; don't map levels across publishers or infer age. Credits show author, illustrator and translator roles from `contributors`. Translations are separate items; the card may say "also in [languages]". Set `lang` on non-English labels. |
| `DeskFreeSearch` | Desktop: navigation rail, results list and detail side by side; shows the expanded "Unclear access" group. | Selecting a result updates the right pane and the URL; Back returns to the previous selection. Unclear items carry the hollow `--chk` marker and "Access unclear · may be a loan, check at the source", plus a Hide link. Follow existing desktop layout rules in [`../2026-10-mobile/DESKTOP_PLAN.md`](../2026-10-mobile/DESKTOP_PLAN.md). |

## 5. Components and existing code

| Need | Where | Notes |
| --- | --- | --- |
| Three-segment scope | `ui/scan/ScanPage.tsx` | Extend the existing `.search-scope.segment-control`. Keep the library sub-toggle and ISBN scanning under Library books only. |
| Content result row | new `ui/content/ContentResult.tsx` | Two variants: book (cover 52×78) and paper (no cover, pill row). Don't overload `ui/scan/SearchResult.tsx`. |
| Access line | new `ui/content/AccessLine.tsx` | Filled dot `--ok` for free; hollow dot `--chk` for unclear. Text always states the state; colour is never the only signal. |
| Kind/flag pill | new `ui/content/KindPill.tsx` | Preprint `--ref`, article/chapter `--ink2`, correction `--chk`, retraction `--err`. |
| Coverage/status notices | `ui/Notice.tsx` | Partial, limit and down states. |
| Sources sheet | `ui/Sheet.tsx` | Focus trap and Escape exactly as existing sheets. |
| Detail page | new `ui/content/ContentPage.tsx` at `/app/read/:contentKey` | Outbound links: `target="_blank" rel="noopener noreferrer"`, visible ↗ and an accessible name ending "(opens [host])". |
| "Also free to read" | `ui/book/BookPage.tsx` | Separate fetch after the main book loads; must not delay or fail the availability block. |
| Copy | `uiMessages.ts` | Add strings from the boards verbatim (they were written for this app's voice). |
| API client | `api.ts` | `contentSearch`, `contentResolve`; abort on scope/query change. |

Server work is in architecture.md §2 and §5 (`server/services/content/`,
`server/public-v2/content.js`). The UI relies on these response fields:
`items[].{key, kind, title, contributors, version, container, publishedAt,
languages, locations[].{access, landingUrl, readerUrl, downloads, license,
evidence}, relations, provenance}`, `coverage`, `sources[].{id, status,
returned, retryable}`, `nextCursor`. Map `sources[].status` values as follows:
`ok`, `empty`, `timeout`, `throttled`, `quota_exhausted`, `unsupported`,
`disabled`, `not_selected`. The last one is needed for "Not searched this time";
add it to the contract if the server work hasn't.

## 6. Saving to the shelf

The owner wants free books and papers saveable. Today `savedBooks` holds
`RecentBook` records keyed by `bookKey` with ISBN/work identity
(`client/src/v2/localState.ts`, storage key `mybookshelf.anonymous-web.v1`,
version 1, cap 100). Content items have no ISBN and a different key space.

Before coding, the implementing agent should write a short decision covering:
a distinct saved-item kind (for example `{ kind: 'content', contentKey, title,
authors, itemKind, host }`) instead of faking a `bookKey`; a storage version
bump with migration that keeps every existing saved book; how the shelf draws
items without covers (paper spines); whether content counts toward the
100-item cap; and alignment with the planned account sync (STATUS.md, account
work), which must not gain a competing identity system. The Save button in the
boards uses the existing bookmark control and `aria-pressed` pattern.

## 7. Copy and accessibility rules

- Keep "free to read" separate from reuse rights in all copy. "Free" means free
  to read at the source, never "free to download and share".
- Failures are never absence: timeout, limit, down and unsupported states each
  have their own copy; none says "no results".
- Name the host in every outbound action ("Read at Project Gutenberg").
- Status is conveyed by text plus shape (filled vs hollow dot, pill label), not
  colour alone. Check contrast in Daylight, Lamplight and Ink.
- Live regions: loading progress `role="status"` (polite); `SourcesDown`
  `role="alert"`.
- Respect reduced motion; boards use no animation and the app shouldn't add any
  for these states.
- Language chips and story titles in Hindi/Tamil carry `lang`.

## 8. Acceptance checklist

Run the release checks in AGENTS.md plus:

- Each board's state reachable from fixtures (sanitised, no live network in unit
  tests), on mobile and desktop, in all three reading lights.
- Preview, borrow and metadata-only fixtures never appear in Free to read;
  unknown appears only after "Show them" and is marked.
- One source failing keeps other results; all failing shows `SourcesDown`, not
  an empty list; quota shows `BudgetUsed` copy without the provider name.
- Paging adds results without duplicates or skips; counts say "shown".
- Preprint and published version stay separate; translations stay separate.
- The library book page with a free edition renders the card only with
  identifier/work evidence; a title-only near match renders nothing.
- Saving and unsaving a free book and a paper survives reload, and existing
  saved books survive the storage migration.
- Existing ISBN, library and shelf journeys are unchanged.

## 9. Still open (engineering, not owner)

- Shelf storage shape for content items (§6).
- `not_selected` source status in the response contract.
- Quota numbers: set later per decision 9; ship with configurable budgets and
  the `BudgetUsed` state wired.
- Children's pilot record list and feed/curation process (research Phase C).
