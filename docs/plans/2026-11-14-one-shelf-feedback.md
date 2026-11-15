# One-shelf feedback and improvements

Reviewed with the owner on 14 November 2026 (America/Los_Angeles).
This is an editable feedback backlog, not an implementation or release.

The initial review covered `84cda3a` (the merged one-shelf redesign). Before
publishing this document, the relevant findings were checked against `61a3e50`
(current `main`, including the subsequent account/request-budget changes).
That newer work does not restore samples or remove the save race described below.

## Decisions and status

| ID | Improvement | Decision | Status | Owner / implementation PR |
| --- | --- | --- | --- | --- |
| F01 | Save reliably while Viewed before is updating | Accepted; original review item 1 | Open | Unassigned |
| F02 | Show library answers in visible words and explain freshness | Accepted; original review item 2 | Open | Unassigned |
| F04 | Restore actionable sample books for an empty personal shelf | Owner direction after correcting the sample history; original item 4 | Open | Unassigned |
| F06 | Complete the desktop layout | Accepted; original review item 6 | Open | Unassigned |
| C01 | Evaluate search readability and the nine-result limit | Candidate; original review item 5 was not explicitly accepted | Needs evaluation | Unassigned |
| C02 | Search already-loaded saved books when public search is unavailable | Additional feedback | Needs evaluation | Unassigned |

Original review item 3 (changing search-scope labels and adding another library
switching entry point) was declined by the owner and is not part of this backlog.
Candidate items are observations to evaluate, not approved design changes.

## F01 — Make explicit saves independent of background history

**Problem.** Opening a book while signed in automatically records it in Viewed
before. The account provider rejects a second action while that write, including
its subsequent snapshot reload, is pending. The Add to my shelf button remains
actionable, so a quick tap can show “Couldn’t save this book. Try again.” without
ever sending a save request.

**Evidence.** A controlled browser reproduction on `84cda3a` delayed
`/api/account/history/views`: the history request started, Add to my shelf was
enabled, tapping it displayed the error, and zero save requests were sent.
After history finished, another tap sent the save normally. The same busy guard
and automatic book-view write remain at `61a3e50`.

Sources: [account mutation guard](../../client/src/v2/storage/AccountLibraryStateProvider.tsx),
[automatic view recording and save action](../../client/src/v2/ui/book/ShelfBookPage.tsx),
[save button](../../client/src/v2/ui/book/SaveButton.tsx).

**Improvement.** Queue or otherwise coordinate the background write so an
explicit save is accepted and eventually completes. Preserve account isolation,
revision checks, and duplicate-save protection. A long disabled wait for routine
history persistence should not become the normal interaction.

**Acceptance checks**

- [ ] Delay both the history write and its snapshot reload; a single save tap
      still completes without a false failure or a second tap.
- [ ] Rapid repeated taps do not create duplicate saves or unintended removal.
- [ ] A genuine save failure remains actionable; success survives reload.
- [ ] Include a delayed-response regression journey for a signed-in reader.

## F02 — Make the library answer explicit

**Problem.** The library card computes Found, Not found, Couldn’t confirm,
Checking, and Couldn’t check, but puts those words in its accessibility label.
Visible content is the status icon, library name, and Catalog link. The reader
must interpret the icon to understand the central answer.

Found and definite Not found answers are stored for 180 days by an existing
owner decision. A stored answer can be returned without another live catalog
check. The public response does not currently include its check date or whether
it came from storage. A positive result establishes catalog holdings, not that a
copy is available to borrow now.

Sources: [library answer card](../../client/src/v2/ui/book/LibraryAnswerCard.tsx),
[answer retrieval](../../server/public-v2/holdings.js),
[stored answers](../../server/catalog-store/holdings.js).

**Improvement.** Add a short visible status, keeping the icon as reinforcement.
Suggested wording includes “Listed in the catalog,” “Not found in the catalog,”
“Checking…,” “Couldn’t confirm,” and “Couldn’t check.” Show the actual last-check
date when known and retain the catalog link. This does not authorize changing
the six-month retention policy or reintroducing copy counts and due dates.

**Acceptance checks**

- [ ] Every answer state is understandable without color or icon knowledge.
- [ ] Visible wording and screen-reader announcements agree.
- [ ] Failed checks remain distinct from definite absence.
- [ ] Stored results display their original observation date, not today's
      retrieval date; missing dates are not invented.
- [ ] Wording does not imply current borrowing availability.
- [ ] Long library names and status text fit on phones and in all reading lights.

## F04 — Restore samples as the starting point

**Correction to the initial review.** Sample books did exist. The former shelf
offered three clickable real editions under “Start your shelf”:

| Book | Edition ISBN |
| --- | --- |
| The Alchemist | 9780061122415 |
| Wings of Fire | 9788173711466 |
| Introduction to Algorithms | 9780262033848 |

Those examples opened book details without pretending the reader had saved them
or that a library held them. Commit
[`0f00426`](https://github.com/ddk220-light/MyBookshelf-web/commit/0f00426bf4d10f68753d9380e709d4143ab4bce1)
removed `exampleBooks.ts` and the old shelf screen. At `61a3e50`,
[EmptyShelf](../../client/src/v2/ui/shelf/EmptyShelf.tsx) still renders “Ready to
search,” Search/Scan buttons, and empty bays. The public landing's decorative
example shelf is separate from those former interactive examples.

**Owner direction.** Samples should kickstart book discovery so a new reader
does not land on an entirely empty shelf. Restore that capability within the
one-shelf design; avoid adding a tutorial that makes the reader type a sample
title before trying the product.

**Acceptance checks**

- [ ] A reader with no saved books sees a small, clearly identified sample
      selection alongside the ability to search or scan their own book.
- [ ] A sample starts the normal book discovery/detail flow and permits a real
      library check and an explicit save.
- [ ] Samples are not automatically added to saved books, shelf counts, or
      Viewed before merely because they rendered.
- [ ] Only real checks produce library badges or answers.
- [ ] After a first save, the personal shelf becomes primary; samples do not
      masquerade as the reader's collection.
- [ ] The flow works with missing covers, keyboard navigation, and no account.

## F06 — Complete the desktop experience

**Problem.** The home and book page are capped at a centered 480px column. This
was deliberately deferred in the approved mobile-first plan, rather than an
accidental responsive regression. It leaves desktop space largely unused.

Sources: [home layout](../../client/src/v2/ui/home/home.css),
[book layout](../../client/src/v2/ui/book/book.css),
[approved design scope](../design/2026-11-one-shelf/README.md).

**Improvement.** Design desktop shelf/results and book-detail layouts that use
the available width while retaining the existing identity and simple task flow.
Explore additional columns, larger readable book information, and an appropriate
detail layout. Keep library-selection behavior unchanged under this item;
the declined item 3 is not being reintroduced through desktop work.

**Acceptance checks**

- [ ] Review populated shelves, search, a book, and overlays at 1024px and 1440px.
- [ ] More space improves scanning and readability rather than just stretching
      text and controls.
- [ ] Phone layouts, Back behavior, keyboard order, and reduced motion remain usable.
- [ ] Daylight, Lamplight, and Ink remain legible.

## Candidates for further evaluation

### C01 — Search readability and discovery

Cover-only results can make unfamiliar titles and authors difficult to compare;
list view is already available. Also, saved matches occupy the same nine-result
budget as new matches. Nine saved books matching an author can leave no room for
new discoveries. See [result selection](../../client/src/v2/ui/search/searchResults.ts).

The nine-result limit and no More button were explicitly approved previously.
Do not silently replace them or switch the default view. Evaluate a broad author
search with at least nine saved matches, long titles, and similar book names.
Compare completion using the current shelf and list views; record whether a
separate saved-matches group or a way to see further results is warranted.

### C02 — Keep saved-book lookup useful during an outage

[runBookSearch](../../client/src/v2/ui/search/useBookSearch.ts) returns failure
when offline or when public book search fails, before computing matches against
the saved books already supplied to it. A reader can still browse loaded saved
books, but cannot use that search path to find one.

Consider displaying matching already-loaded saved books alongside a concise
notice that other books could not be searched. This is a proposed resilience
improvement, not a promise of offline cold-start support. Validate provider
failure and offline-after-load scenarios without showing unknown remote results
as absent or storing search text in browser storage.

## Review evidence and maintenance

The initial review on `84cda3a` included desktop and 390px phone walkthroughs,
build/type checking, and 153 passing targeted browser journeys across Chromium,
mobile Chromium, and WebKit. The signed-in save race was a separate controlled
reproduction. A single live search returned the expected book first; this is
not a comprehensive relevance benchmark or a user-comprehension study.
The `61a3e50` follow-up was source/history verification, not a repeat of that
entire browser suite.

Keep accepted work and candidates distinct. Update the status table with an
assignee and implementation PR, then record the validating commit, scenarios,
and remaining limitations before marking an item complete. A short new-reader
walkthrough should cover trying a sample, interpreting a library answer, saving,
and returning to the saved book.

This document is published on `docs-one-shelf-feedback-2026-11-14`, a branch
excluded by the existing Vercel `git.deploymentEnabled` rules. Documentation
edits can continue on this branch. Publishing this feedback does not merge to
`main` or `staging`, change deployment configuration, or authorize deployment.
