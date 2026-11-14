# Desktop layout and shelf suggestions

Date: 14 November 2026. Applies to mobile and desktop. Screens: `docs/design/2026-11-one-shelf/`
(boards D1–D5 for desktop, S1–S4 for suggestions; the mobile boards for everything else).

Order of work: build the desktop layout first, then suggestions on both mobile and desktop.

## Part 1: desktop layout (owner-approved)

- At 1100 px and wider: a fixed left column (library and account), the shelf middle-right.
  The side panel and the person icon are not used at this width.
- Opening a book puts it in the middle. The left column narrows and the shelf slides right
  (boards D4). Clicking the shelf or × closes it. No motion under reduced motion.
- The same middle slot opens Account settings, Report a problem, Privacy and About.
- Choosing a library happens inside the left column (board D5), with the shelf still visible.
- Search results replace the saved shelf in place, as on mobile (board D3).
- No scan button at desktop widths; a typed ISBN in the search bar goes straight to the book.
- Below 1100 px and above phone width: the left column collapses to icons, and an open book
  covers the shelf instead of pushing it. Nothing else is special at these widths: the scan
  button stays, as on phones (owner, 14 November).
- Below that: the phone layout as released.
- Board D1 (empty shelves on first open) is replaced by Part 2's cold open.

## Part 2: shelf suggestions (owner decisions)

1. **Cold open** (nothing saved and nothing viewed): the search bar dominates. No empty
   shelves. Five suggested books stand on the shelf: popular Indian books for now.
   Boards S1 (phone) and S3 (desktop): "Ready to search" and its one line, then a larger search
   bar (scan inside it on phones), then the five books. The separate "Search for a book" and
   "Scan the barcode" buttons go; the search bar does both.
2. **Always five suggestions**, placed after the reader's saved books in shelf order. They
   wrap like books do: with one saved book they share its row; with more, they continue on
   the next row (3 per row on phones, 6 on desktop).
3. **Look:** each suggestion at 75% opacity, with a "Suggested" label below them.
4. **Opening and saving:** a suggestion opens like any book. "Add to my shelf" makes it a
   saved book (full opacity) and a new suggestion takes its place, so there are still five.
   The saved book goes to the front of the shelf (newest first, as today); the new suggestion
   arrives at the end. Boards S2 (phone) and S4 (desktop) play this.
5. **Refresh:** suggestions are refreshed. They cannot be dismissed.
6. **Sources,** in this order, never more than one book by the same author:
   - books known to be in the chosen library (found answers in our catalog store);
   - popular books related to the books the reader has viewed or saved (Open Library
     subjects, sorted by popularity);
   - the popular Indian seed list.
7. **Later:** once the anonymous log has enough data, rank by what readers actually search
   for and open.

### Points decided by recommendation (change any of these if you disagree)

| Point | Decision |
|---|---|
| When suggestions refresh | When a book is saved or removed, when the library changes, and on each new visit. Not while browsing within one visit, so the shelf does not jump while someone is choosing. |
| Where "Suggested" goes | One small label on the shelf edge under the run of suggestions (one per row the run occupies), never a caption under each book, keeping "nothing written under books". |
| Screen readers | Each suggestion's name ends with ", suggested". The fade is not the only signal. |
| Library badge on a suggestion | Only when the catalog store already holds a "found" answer for that library. Never a live catalog check for suggestions. |
| Already saved or viewed | A book already on the shelf is never suggested, matched by book key, ISBN-13 or the same Open Library work (display only; editions are never merged for identity or library answers). Viewed books may be suggested. |
| Seed list | A hand-picked list of about 20 popular Indian books with good covers, kept in the repository so you can edit it. The cold open shows the first five; refreshes draw from the rest when other sources are thin. |
| Library outside India | Same rules. The Indian seed list is used only when the other sources give fewer than five. |
| List view | Suggestions appear at the end of the list, faded, with "Suggested" in place of the year. |
| During search | Suggestions are hidden; search results replace the shelf as today. |

### Edge cases and how each is handled

1. **Suggestion service down or offline.** The seed list ships inside the app, so the cold
   open always shows five books. Later refreshes keep the last set.
2. **A suggestion has no cover image.** It gets the plain coloured cover with title and
   author, at 75% opacity. The seed list only includes books with covers.
3. **Readability at 75%.** Fading the whole cover lowers the contrast of its printed title.
   The cover image or plain cover fades; the library badge, the "Suggested" label and the
   accessible name do not. A plain cover (no cover photo) on a suggestion uses a darker shade of
   its colour, chosen so its printed title still reads at 4.5:1 when faded; at 75% the usual
   shades drop to about 3–4:1. A unit test checks every plain-cover colour in all three reading
   lights.
4. **The same book saved twice through a suggestion.** Saving uses the existing "already on
   my shelf" match, so a suggestion of a book already saved under another edition is never
   shown, and saving cannot create a duplicate.
5. **Removing a saved book.** The suggestions refresh; the removed book can be suggested again.
6. **Saving the last suggestion during a slow refresh.** The new suggestion fills in when it
   arrives; until then four show. No placeholder text.
7. **Library changed.** Library badges on suggestions clear and refill from the store, as on
   saved books, and suggestions refresh.
8. **New library with no stored answers.** That source is simply empty; the others fill in.
9. **Very long shelf.** Suggestions stay at the end. Nothing extra is done.
10. **Signed in on two devices.** Suggestions are worked out per device and are not saved to
    the account, so two devices can show different suggestions.
11. **Indian-language titles.** The seed list uses editions with good covers and known
    English or transliterated titles, so search and library checks work on them.
12. **Privacy.** To get related suggestions, the app sends the server the book keys of a few
    recent books. Nothing about the reader is stored, and the request is not linked to an
    account. The anonymous log records only how many suggestions were shown, opened and saved,
    per book, which the published privacy text's "anonymous log" already covers. Search text
    rules are unchanged.
13. **Cost.** One server request per refresh. Related-book lists and the store's "found"
    lists are cached on the server for 24 hours. No catalog requests are made for suggestions.
14. **Reduced motion.** Suggestions appear and turn solid without animation.
15. **Clearing browser data or signing out** returns a guest to the cold open.

### Build outline

- `shared/suggestions-seed.json`: the seed list (book key, title, author, cover).
- Server: `POST /api/v2/suggestions { libraryId?, recentBookKeys[≤3], excludeKeys[≤200] }`
  returns five books with an optional `inLibrary` flag from the store; cached sources; counts
  only in the anonymous log. As built in step B (14 November 2026, `server/public-v2/suggestions.js`):
  - It returns up to 15 candidates, so that five remain after the app's own pick, which stays the
    authority. It applies the same exclusions (book key, ISBN-13, Open Library work) and the
    one-per-author rule. It always answers 200 within about 3 s; `partial: true` marks an answer
    cut short by a failing or slow store or Open Library, and the app then keeps its last books.
  - Source 1 reads the chosen library's 60 most recently checked stored "found" answers (works and
    ISBN-13s; never a "not found", never a catalog record, nothing for an opted-out library). The
    store keeps no title or cover, so the found edition's details come from one batched Open
    Library Books API request.
  - Source 2, "same author, then same subject and place", for the newest recent book. It reads
    that book's work record (`/works/<id>.json`, or a search by ISBN for an ISBN-only book): title,
    subjects, places and author keys. It then asks for two lists, both sorted by reader count
    (`sort=readinglog`):
    - The first author's most-read other works (`author_key=…`). The book itself, any work with
      its title, and all but the first work of each title are skipped; the one-per-author rule
      keeps one.
    - The most-read works on its first subject that is not a tag, in its first place
      (`q=subject:"Biography" place:"India"`; broad subjects are fine with a place). A work with no
      place uses its first two specific subjects together instead, and gets no second list with
      fewer than two. A single-subject popularity list is never used: on staging, "Presidents"
      alone gave American politics for *Wings of Fire*.
    - Covers only, titles in Latin letters, and nothing for adults or naming extremism (titles and
      subjects; the extremism deny-list also applies to library-found books). Nothing is
      suggested from a recent book that is itself blocked.
  - At most 4 Open Library requests per suggestion request: the library's edition details, the
    recent work's record, the author's list and the subject-and-place list. Each is cached in each
    instance's memory for 24 hours, as are found lists. No catalog request is ever made.
  - The app also never suggests a book whose title and first author match a saved book (display
    only, as for another edition of the same work), so a duplicate Open Library work of a saved
    book does not appear.
  - Counts: `POST /api/v2/suggestions/events { event: opened|saved, bookKey }` (the book page,
    marked by router state only) and "shown" rows written by the server for the five the app
    shows. Catalog migration `002-suggestion-counts.sql` adds the `suggestion` kind to the
    anonymous log.
- Client: a suggestions hook on the home screen, shelf layout that appends the five faded
  covers after saved books, the "Suggested" plank label, list-view rows, refresh triggers.
- Tests: the fill and wrap rule at 3 and 6 per row, one-per-author, never suggesting a saved
  book or another edition of one, offline cold open from the bundled list, badges only from
  stored answers, contrast in the three reading lights, reduced motion.
