# MyBookshelf desktop walk, 18 November 2026

Site: https://mybookshelf.cloud (build `d3262e2`, shown on the in-app About page). Walked as a new reader with Playwright 1.55.1, headless Chromium (build 1187) and one WebKit pass. Nothing was changed in the repository; nothing was deployed; no account was created; no form was sent; location was not granted.

Files in this folder:

- `shots/` 221 screenshots, named `NN-area-what-<viewport>.png` in step order.
- `shots/states/` 224 tight state shots, `control-state.png` (default, hover, focus, pressed) for 58 controls.
- `timings.csv` 148 rows. `layout.csv` 91 rows. `api-and-asset-requests.csv` 769 requests (path only, never a query string or search text).
- `scripts/` the Playwright scripts, saved browser states and raw logs (`scripts/logs/`).

Where a sentence below says "the source", it means the repository was read to explain something seen on screen. Everything else was seen in the browser.

## Read this first: library checks used

The limit was 10 live library checks. This run made 10 that are confirmed in the logs, and possibly an 11th. Two were not planned:

| # | Library | What | Request | Result |
|---|---|---|---|---|
| 1 | Anna Centenary | title search, background marks | `holdings/search` 10.2 s | 1 of 9 marked |
| 2 | Anna Centenary | book opened by typed ISBN | `holdings/check` (log lost, script error) | couldn't confirm |
| 3 | Anna Centenary | Wings of Fire by its address, new visit | `holdings/check` 8.5 s | found |
| 4 | Anna Centenary | Ram - Scion of Ikshvaku from the shelf | `holdings/check`, no answer in 45.9 s, ended when the book was closed | none |
| 5 | KV Narimedu | Wings of Fire from the shelf | `holdings/check` 25.3 s | couldn't check |
| 6 | KV Narimedu | the one allowed Retry | `holdings/check` 25.1 s | couldn't check |
| 7 | Burlingame | Wings of Fire from the shelf | `holdings/check` 3.4 s | found |
| 8 | Burlingame | book opened by typed ISBN | `holdings/check` 6.7 s | found |
| 9 | Burlingame | title search, background marks | `holdings/search` 0.69 s | 2 of 9 marked |
| 10 | Burlingame | a marked result opened | `holdings/check`, cancelled after 0.7 s when the book was closed | (answer shown from the mark) |
| 11? | Anna Centenary | the marked Wings of Fire result opened (step 7) | not in the log; the browser closed about 2 s later. Check 10 shows the app does send a check in this case, so one was probably started | (answer shown from the mark) |

Unplanned: checks 10 and 11. I expected a book opened from a marked result to use the mark and send nothing; it also sends a `holdings/check`. Check 3 repeated the question of check 11 (same book, same library) for the same reason. After check 10 I stopped: every later step ran with no library chosen, or on the shelf only (the shelf asks only for stored answers). So the WebKit pass, the reading lights, the interaction states and the other viewports have no library answers in them.

## (a) Step-by-step log

Times are from `timings.csv`. "Scroll" is the scrolling area's height against the window height.

| Step | What was done | Screenshots | Time | Scroll, cut off, hidden |
|---|---|---|---|---|
| 1 | Landing page `/` | `01-public-landing-top`, `-full` | TTFB 141 ms, first paint 220 ms, load 264 ms | Page 1449 px high at 900: one scroll to reach "Built to be trusted" and the footer. Three text links are 17 px high ("Find a book instead", "Browse featured libraries", "GeoNames"). 8 px author names inside the hero's cover art. |
| 1 | `/how-it-works`, `/about`, `/libraries` | `02-…`, `03-…`, `04-…` | load 145–271 ms | 1494, 1193, 2863 px high. Lines up to about 91–93 characters. |
| 1 | Library guide pages | `06-public-guide-anna-centenary`, `07-public-guide-setagaya` | not timed | 1726 and 1710 px. Anna's guide warns "Catalog link uses HTTP, which is not encrypted". Setagaya lists 21 branch names in Japanese only. |
| 1 | `/app/privacy`, `/privacy`, `/support`, `/open-source` | `05-public-privacy`, `08-…`, `09-…`, `10-…` | load 126 ms | `/app/privacy` opens inside the app beside a cold shelf; the page scrolls 4044 px inside a 900 px slot. `/privacy` on the public site is a separate 5879 px page with the same text. |
| 1 | Header links, "Open the app", "Find my library" | `11-public-open-the-app-result`, `12-public-find-my-library-result` | header links 83–126 ms; "Open the app" to shelf heading 883 ms | "Open the app" has an arrow (↗) but opens in the same tab. "Find my library" goes to `/app/libraries`, which becomes the shelf with the picker open. |
| 2 | Cold shelf at six viewports | `13-cold-shelf-<viewport>`, `-full` | heading 280–434 ms, covers loaded 688–989 ms | No scrolling at any size. Five suggestions on one bay (4 + 1 at 700). Empty space under the shelf: 518 px at 1920x1080, 338 at 1440x900, 262 at 1100x800, 226 at 1024x768, 158 at 1280x720, 138 at 700x900. Left column 300 px from 1100; 72 px rail below. Scan button only on the rail layouts. |
| 3 | Picker: open, city, names, misspelling, nothing found | `14-picker-open`, `15-picker-city`, `16-…anna`, `17-…kv-narimedu`, `18-…burlingame`, `19-…setagaya`, `20-picker-misspelt-city`, `21-picker-none` (1440 and 1024; `14-picker-rail-popover-1024x768` is the same picker, opened from the rail icon) | list answer 255–401 ms per request; about 0.5 s after the last key | "Chennai": 25 rows, column scrolls 2352 px, no count and no sign that the list stops at 25. Focus starts on "Libraries near me", not the text field. Details in findings 13–15. |
| 4 | Searches with no library: author, misspelt title, no results | `23-search-field-focused`, `24-search-author-nolib` (+`-full`, `-scrolled`), `25-search-misspelt-nolib`, `26-search-none-nolib`, `26-search-after-escape` | first result 4.7 s, 6.4 s; "No books found" 4.2 s. Repeat of the same author query later: 0.2–0.3 s | 9 and 5 results, no scrolling. Covers only: no title or author text. Two results without a cover image show typeset titles, one cut with "…". Escape in the search field does not clear the results. |
| 5, 6, 7 | Book page with no library; closing four ways; direct visit; reload; save | `27-book-nolib-suggestion`, `28-book-nolib-just-saved`, `28-book-nolib-saved`, `29-shelf-1-book`, `30-book-direct-visit`, `30-book-reload`, `31-suggestion-open`, `31-suggestion-saved-shelf-2`, `32-shelf-4-books` | cover click to title 30–49 ms; description arrives about 1.2–1.8 s later (`books/resolve`); direct visit 323 ms; reload 316 ms | Column narrows to 248 px, page is 600 px, shelf starts at x 848. ×, Escape, a click on the empty shelf and Back all close it and return focus to the cover. Forward reopens it. × after a direct visit goes to the shelf. Slot scrolls 941/900 once the description is in. |
| 5 | Save from results, to 12 books, list view, remove | `33-results-with-saved-badges`, `34-book-from-result-saved`, `34-results-after-save`, `35-results-list-view`, `36-shelf-6-books`, `37-shelf-12-books` (+`-full`, `-scrolled`), `38-shelf-12-list-view` (+`-full`), `39-remove-before`, `39-remove-after` | "Back to my shelf" 17 ms | 12 saved + 5 suggestions = 3 bays of 6, 6, 5; shelf scrolls 1129/900 ("Viewed before" is below the fold). List view 1587/900. View choice survives a reload. A book can only be saved from its page, not from a result. |
| 3, 4, 6, 8 | Anna Centenary: choose, title search, book pages, catalog link | `40-picker-row-hover-anna`, `41-library-chosen-anna-shelf`, `42-search-title-anna` (+`-full`), `43-book-anna-wings-of-fire`, `43-book-anna-answer-card`, `44-returning-shelf-anna`, `45-search-isbn-anna`, `45-book-anna-isbn-answer-card`, `47-book-anna-wings-direct`, `47-book-anna-found-answer-card`, `47-book-anna-wings-saved`, `48-catalog-link-anna-opened`, `49-shelf-13-anna`, `50-book-anna-ram`, `50-book-anna-ram-answer-card`, `51-shelf-anna-after-checks` | choose 51 ms; results 3.6 s; library line settled 13.8 s; see table (b) | See findings 1–6. |
| 3, 8, 14 | KV Narimedu (e-Granthalaya) | `52-column-library-change-hover`, `52-picker-change-from-anna`, `53-library-chosen-kv-shelf`, `54-book-kv-checking-6s`, `54-book-kv-checking-20s`, `54-book-kv-checking-answer-card`, `55-book-kv-answer`, `55-book-kv-answer-card`, `56-book-kv-retry-checking`, `56-book-kv-after-retry`, `57-shelf-kv-after-check` | 25.3 s, then Retry 25.2 s | The long name wraps to three lines in the 248 px column and fits on one line in the answer card. |
| 3, 4, 8 | Burlingame Public Library | `58-library-chosen-burlingame-shelf`, `59-book-burlingame-wings`, `59-book-burlingame-answer-card`, `60-isbn-flow-1s`, `60-isbn-flow-book-burlingame`, `60-shelf-burlingame-returning`, `61-search-title-burlingame`, `61-results-head-burlingame`, `62-book-burlingame-marked-result`, `62-shelf-burlingame-after` | found 3.4 s; ISBN flow 9.0 s; search marks 0.87 s | See table (b). |
| 9 | Account entry (nothing typed), Report a problem (not sent), Privacy, About, Terms, an address that does not exist | `63-account-create` (+`-full`), `64-account-log-in` (+`-full`), `65-report-a-problem`, `66-privacy-in-app`, `67-about-in-app` (+`-bottom`), `68-terms-in-app`, `69-not-found` | page open about 1.2 s including my wait | All open in the 600 px slot beside the shelf. Focus lands on Close, not on the Email field. Privacy scrolls 4044/900. |
| 9 | Reading light: shelf, book page, list in each | `70-light-<daylight, lamplight, ink>-shelf`, `71-light-…-book`, `72-light-…-list` | switch is immediate | Lamplight is the only dark one. Ink is a cool white with blue buttons. The choice survives a reload. |
| 11 | Reduced motion and dark colour scheme | `73-reduced-motion-…`, `73-dark-scheme-…`, `84-dark-scheme-fresh-cold-shelf` | | Reduced motion: no animations run when a book opens (normally four, 420–480 ms). Dark scheme: ignored, the app and the landing page stay light. |
| 10 | Interaction states and Tab order | `shots/states/*`, `74-tab-1-skip-link`, `74-tab-4`, `74-tab-first-book`, `75-rail-popover-<library, account, light, help>`, `90-scan-dialog-no-camera` | | See the state table in (c). |
| 11 | Layout at every viewport: shelf, bottom of shelf, list, book, results, book from results, picker, create account, shelf with a library | `76-shelf-12`, `76-shelf-12-bottom`, `77-shelf-list`, `78-book`, `78-book-more-open`, `79-results`, `80-book-from-results`, `81-picker-city`, `82-account-create`, `83-shelf-13-library-chosen`, `83-rail-my-library-pressed`, each with `-<viewport>` | | No horizontal overflow anywhere. `layout.csv` has the numbers. |
| 13 | WebKit at 1440x900 | `85-webkit-cold-shelf`, `86-webkit-results`, `87-webkit-book`, `87-webkit-book-saved`, `88-webkit-shelf-12`, `88-webkit-shelf-12-lamplight`, `89-webkit-landing` | shelf heading 456 ms; cover to title 47 ms | Looks the same as Chromium to within a pixel or two. One console error on every page (finding 9). |
| 14 | Duplicate-suggestion check | `91-isbn-book-nolib`, `91-shelf-after-saving-isbn-book` (+`-reload`) | ISBN to book title 2.3 s | Not reproduced (see call-outs). |

### Layout numbers (from `layout.csv`)

| Viewport | Layout | Books per bay | Cover | Shelf with 12 saved (scroll / window) | Shelf left beside an open book | Smallest font | Smallest target |
|---|---|---|---|---|---|---|---|
| 1920x1080 | column 300 | 6 | 120x180 | 1129 / 1080 | 1072 px | 11 px | 44 px |
| 1440x900 | column 300 | 6 | 120x180 | 1129 / 900 | 592 px | 11 px | 44 px |
| 1280x720 | column 300 | 6 | 120x180 | 1129 / 720 | 432 px | 11 px | 44 px |
| 1100x800 | column 300 | 6 | 104x156 | 1057 / 800 | 252 px | 11 px | 44 px |
| 1024x768 | rail 72 | 6 | 104x156 | 1376 / 768 | 352 px (page covers the left of the shelf) | 11 px | 44 px |
| 700x900 | rail 72 | 4 | 104x156 | 1816 / 900 | 28 px | 11 px | 44 px |

- Horizontal overflow: none on any screen at any viewport.
- Fonts under 12 px in the app: only the author line on "Viewed before" spines (11 px). On the landing page: 8 px names inside the hero cover art.
- Targets under 24 px: none in the app. On the public pages: inline text links 17–19 px high.
- Hidden behind another element: nothing while no overlay is open. The "Removed … Undo" notice covers the bottom link of the book page (`39-remove-after`).
- Text cut with "…": cover-less result titles (`25-search-misspelt-nolib`), "Viewed before" spine titles and authors (`32-shelf-4-books`), the book description until "More".
- Line length: book description about 64 characters a line; list view rows up to about 110; public pages about 91–93.

### Speed, caching, sizes

| Item | Status | Time | Transfer | Cache-Control | CDN |
|---|---|---|---|---|---|
| `/` document | 200 | 215 ms (TTFB 73) | 2.7 KB (6.0 KB unpacked) | `no-cache` | HIT |
| `/site.css`, `/site.js` | 200 | 31, 56 ms | 3.6 KB, 0.9 KB | `no-cache` | HIT |
| `/fonts/Newsreader.woff2` (landing) | 200 | 79 ms | 215 KB | `public, max-age=604800` | HIT |
| `/app/shelf` document | 200 | 179 ms (TTFB 22) | 1.0 KB | `no-cache` | HIT |
| `/assets/index-….js` | 200 | 130 ms | 151 KB (464 KB unpacked) | `public, max-age=31536000, immutable` | HIT |
| `/assets/index-….css` | 200 | 30 ms | 24.5 KB (121 KB unpacked) | same | HIT |
| `/assets/Newsreader-….ttf` | 200 | 96 ms | 266 KB | same | HIT |
| `/assets/WorkSans-….ttf` | 200 | 97 ms | 168 KB | same | HIT |

- App, first visit: first paint 232 ms, largest paint 428 ms (a suggestion cover), layout shift 0.0003. Reload: first paint 60 ms, scripts, styles and fonts from the browser cache (0 bytes).
- The two app fonts are 434 KB, more than the script and styles together (175 KB). They are TTF files; the landing page uses a WOFF2 file for the same Newsreader face.
- API calls over the whole run (count, min / median / max ms):

| Call | Status | Count | Min | Median | Max |
|---|---|---|---|---|---|
| `GET /api/account/session` | 200 | 55 | 82 | 113 | 938 |
| `GET /api/account/capabilities` | 200 | 12 | 99 | 110 | 153 |
| `POST /api/v2/libraries/discover` | 200 | 18 | 255 | 287 | 401 |
| `POST /api/v2/libraries/resolve` | 200 | 17 | 108 | 167 | 248 |
| `POST /api/v2/books/search` | 200 | 16 | 172 | 263 | 6866 |
| `POST /api/v2/books/resolve` | 200 | 47 | 88 | 120 | 1756 |
| `GET /api/v2/suggestions/related` | 200 | 152 | 0 | 81 | 1716 |
| `POST /api/v2/suggestions/events` | 202 | 24 | 86 | 116 | 2967 |
| `POST /api/v2/holdings/lookup` | 200 | 36 | 113 | 182 | 338 |
| `POST /api/v2/holdings/search` | 200 | 2 | 690 | — | 10244 |
| `POST /api/v2/holdings/check` | 200 | 5 | 3433 | 8501 | 25300 |
| `POST /api/v2/holdings/check` | cancelled by closing the book | 2 | 729 | — | 45879 |

- `books/search`: a query not asked recently took 2.2–6.9 s (seven of them); the same query again took 0.17–0.26 s.
- `suggestions/related` is `public, max-age=86400`; the CDN answered HIT 77 times and MISS 42 times in the first 119 calls. All other API answers are `no-store` (`account/session` is `private, no-store`).
- Console: no errors or warnings in Chromium in the whole run. WebKit: one error, 7 times (finding 9).
- Failed requests: 14 cover images cancelled when the landing page was left mid-load, and the two cancelled checks above. No 4xx or 5xx from the app.
- Storage: after searching, the browser's storage held four `mybookshelf.*` keys and no search text; the address never changed during a title or author search. A typed ISBN does end up in the address (finding 8).

## (b) Library × book: status shown and time

"Shown" is what a sighted reader sees. The words in quotes are the accessible name, which is not visible.

| Library | Book | Where | Shown | Time |
|---|---|---|---|---|
| Anna Centenary (Koha) | Wings of Fire, A. P. J. Abdul Kalam | search results | library badge on the cover, line "In Anna Centenary Library" | 13.8 s after submit (results at 3.6 s, "Looking in Anna Centenary Library…" for 10.2 s) |
| Anna Centenary | 8 other "Wings of Fire" results (Tui T. Sutherland) | search results | nothing | — |
| Anna Centenary | Wings of Fire | book page, opened from the marked result | green card, tick, "Found in Anna Centenary Library"; Catalog link to the catalog's home page | at once (4 ms) |
| Anna Centenary | Wings of Fire | book page, new visit by its address | green card, tick; Catalog link to the book's own record | 9.9 s (check 8.5 s) |
| Anna Centenary | Grandma's Bag of Stories (typed ISBN 9780143333623) | book page | grey card, question mark, "Couldn't confirm in Anna Centenary Library" (wording from the source; the label was not read in the run) | not captured; on screen 43 s after submit |
| Anna Centenary | Ram - Scion of Ikshvaku | book page, from the shelf | grey card, small spinner, "Checking Anna Centenary Library" | no answer in 45.9 s, then I closed the book |
| KV Narimedu (e-Granthalaya) | Wings of Fire | book page, from the shelf | grey card, retry arrow, "Couldn't check PM SHRI Kendriya Vidyalaya No.1 Narimedu Library" | 25.3 s |
| KV Narimedu | Wings of Fire, Retry pressed once | book page | the same | 25.2 s |
| Burlingame (BiblioCommons) | Wings of Fire | book page, from the shelf | green card, tick, "Found in Burlingame Public Library"; Catalog link to the record | 3.4 s |
| Burlingame | Wings of Fire | search results, one minute later | bookmark badge only, no library badge | — |
| Burlingame | The Dragonet Prophecy; The Hidden Kingdom | search results | library badge, line "In Burlingame Public Library" | 0.87 s after submit |
| Burlingame | 6 other results | search results | nothing | — |
| Burlingame | The Hidden Kingdom | book page, from the marked result | green card, tick; Catalog link to the catalog's home page | at once (5 ms) |
| Burlingame | The Hunger Games (typed ISBN 9780439023481) | book page | green card, tick; Catalog link to the record | 9.0 s after submit (book page at 2.2 s, check 6.7 s) |

"Not found" never appeared in this run, so its icon and card were not seen.

## (c) Findings by severity

### Broken (9)

1. **e-Granthalaya check takes 25 s and fails, and Retry does the same.** Wings of Fire at PM SHRI Kendriya Vidyalaya No.1 Narimedu: a small spinner for 25.3 s, then the retry arrow. One Retry: 25.2 s, same result, Retry offered again. Nothing on screen says how long it will take or that it has failed. `54-book-kv-checking-6s`, `54-book-kv-checking-20s`, `55-book-kv-answer`, `55-book-kv-answer-card`, `56-book-kv-retry-checking`, `56-book-kv-after-retry`.
2. **A check at Anna Centenary did not finish in 45.9 s.** Ram - Scion of Ikshvaku, opened from the shelf: the spinner was still turning when I closed the book. There is no visible limit and no message. Seen once; I did not repeat it. `50-book-anna-ram`, `50-book-anna-ram-answer-card`.
3. **A library answer is forgotten on the next visit.** Wings of Fire was found at Anna Centenary and at Burlingame. In the same visit its cover gets the library badge (`49-shelf-13-anna`). On the next visit the shelf shows no badge for any of the 13 books (`44-returning-shelf-anna`, `60-shelf-burlingame-returning`, `83-shelf-13-library-chosen-*`): `holdings/lookup` was asked 36 times in the run and no badge ever came from it. Opening the same book on a new visit ran the check again (8.5 s at Anna). Why the stored answers are empty was not investigated.
4. **Search results and the book page disagree.** At Burlingame the book page said Wings of Fire (Kalam) is found; one minute later the results for the same title marked two other books and not that one (`61-search-title-burlingame`). At Anna one of nine results was marked after 13.8 s (`42-search-title-anna`). An unmarked result looks the same whether it was checked and not matched, or not checked at all.
5. **The Catalog link goes to the catalog's home page when the book was opened from a marked search result.** Anna: `http://118.185.210.241:8001/`; Burlingame: `https://burlingame.bibliocommons.com/`. The same book opened another way links to its own record (`…/opac-detail.pl?biblionumber=497990`, `…/v2/record/S76C3452801`). Opened once: the Anna record link loads the Koha page for "Wings of fire : an autobiography" in 6.7 s (`48-catalog-link-anna-opened`). The Anna link is plain HTTP to a bare IP address. `43-book-anna-wings-of-fire`, `47-book-anna-wings-direct`, `62-book-burlingame-marked-result`.
6. **Opening a marked result sends a second check to the library.** The answer is already on screen from the mark, yet a `holdings/check` starts (cancelled at 0.7 s when I closed the book). This is the extra catalog load noted at the top.
7. **First search is slow.** With no library: 4.7 s and 6.4 s to the first result, 4.2 s to "No books found"; nine grey placeholder covers stand meanwhile (`60-isbn-flow-1s` shows them). A repeated query is 0.2–0.3 s. With Anna Centenary chosen, the library line settled 13.8 s after submit.
8. **A typed ISBN opens a book page whose address contains the ISBN** (`/app/books/v1:isbn:<the number typed>`), and it stays in the browser history. The project rule is that search text never goes into an address. An ISBN is also the book's identity, so this needs the owner's decision rather than a fix by default. `45-search-isbn-anna`, `60-isbn-flow-book-burlingame`.
9. **WebKit reports a Content-Security-Policy error on every page**: "Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline' does not appear in the style-src directive". 7 times across the landing page, the shelf and a book page. I found no visible difference from Chromium (`85`–`89-webkit-*`), so what is being refused is not known.

### Confusing (17)

10. **The library answer has no words.** A tick, a question mark, a retry arrow or a spinner sits before the library's name; "Found in…", "Couldn't confirm in…", "Couldn't check…", "Checking…" exist only for screen readers. There is no tooltip (no element in the wide layout has a `title`; only the rail icons do). The question mark and the retry arrow are both on the same grey card. `43-book-anna-answer-card`, `45-book-anna-isbn-answer-card`, `55-book-kv-answer-card`, `54-book-kv-checking-answer-card`, `59-book-burlingame-answer-card`.
11. **The retry arrow does not look like a button.** It is a 44 px target with a pointer cursor, but it is drawn as a small icon in the place where the tick normally is. `shots/states/retry-button-default`, `-hover`, `-focus`.
12. **The library name does not look or act changeable.** From 1100 px: icon tile, name and city are plain text (cursor stays an arrow, no hover, not focusable); the only control is a small "Change" text link on the line below (54x44, underline on hover). `41-library-chosen-anna-shelf`, `52-column-library-change-hover`, `shots/states/library-name-*`, `library-change-*`.
13. **On the rail layouts (640–1099 px) the library name is plain 14 px text under the search bar and clicking it does nothing.** The way to change it is the first rail icon, a small building that reads as "home"; its tooltip is "My library". Pressing it opens the picker at once. `83-shelf-13-library-chosen-1024x768`, `83-rail-my-library-pressed-1024x768`, `shots/states/rail-library-name-hover`, `rail-icon-my-library-*`.
14. **The picker never shows which library is chosen now, and there is no way to have no library.** It replaces the whole left column, so the current name disappears while choosing. `52-picker-change-from-anna`.
15. **Picker results.** "Chennai" gives 25 rows in alphabetical order with no count and no hint that more exist; Anna Centenary is second only because of its name. "Burlingame" gives 8 libraries, 7 of them in other cities. A misspelt city ("Chenai") gives "No libraries here yet" and a primary button "Request to add “Chenai”", which sends a request in one press (not pressed). "My library isn't listed" appears only under a list of results. Focus opens on "Libraries near me", so typing needs a click or a Tab first. `15-picker-city`, `18-picker-name-burlingame`, `20-picker-misspelt-city`, `21-picker-none`.
16. **Search results are covers only.** No title, author or year under a cover, no visible count ("9 books" is hidden text), no tooltip. Telling editions apart depends on reading the cover image at 120x180. Results without an image show a typeset title, cut with "…" when long. The list view shows titles and years but is a small unlabelled icon at the far right. `24-search-author-nolib`, `25-search-misspelt-nolib`, `35-results-list-view`, `42-search-title-anna`.
17. **While the library is being asked, the only sign is one line of text**, "Looking in <library>…", beside "Back to my shelf". When it ends with no match, the line just disappears. `61-results-head-burlingame` shows the settled form.
18. **"No books found" is the whole empty state**: no advice, no next step, and the view switch disappears. `26-search-none-nolib`.
19. **Suggestions drift a long way from the shelf.** After saving four R. K. Narayan novels the suggestions were "Everything Happens for a Reason", "When Bad Things Happen to Good People", "Testing for Language Teachers" and "Disenfranchised Grief" (`32-shelf-4-books`). Later: "Bibliotheca historica" by Diodorus Siculus, and a title shown in the list as "The Book of Ram Book Of Penguin Books" (its name contains line breaks and spaces; `38-shelf-12-list-view-full`).
20. **Covers in another language.** Cold open: Ponniyin Selvan with a Tamil cover (`13-cold-shelf-1440x900`). Suggestions: "When Bad Things Happen to Good People" with the Spanish cover "Cuando a la gente buena le pasan cosas malas" (`32-shelf-4-books`); The Jungle Book with "El libro de la selva" (`41-library-chosen-anna-shelf`). Saved: "Ram - Scion of Ikshvaku" stands on the shelf with a Hindi cover (`37-shelf-12-books`).
21. **A book's title and author change about a second after it opens.** The suggestion "Malgudi Days, R. K. Narayan" becomes "Malgudi days, Rasipuram Krishnaswamy Narayan", and "First published 1982" and the description appear, when `books/resolve` answers (1.2–1.8 s the first time). Every R. K. Narayan book is then listed under the long name. `27-book-nolib-suggestion`, `28-book-nolib-saved`.
22. **"On my shelf" removes the book.** The saved state of the button reads as a status; pressing it removes the book at once, with a "Removed Malgudi days · Undo" notice. Adding it back puts it first on the shelf, not where it was. `39-remove-before`, `39-remove-after`.
23. **"Viewed before" repeats the shelf.** Every saved book is there again as a spine, with titles and authors cut ("The English tea…", "Rasipuram Krishn…"). With 12 saved it is below the fold at 900 px. `32-shelf-4-books`, `37-shelf-12-books-scrolled`, `76-shelf-12-1920x1080`.
24. **Account and settings.** From 1100 px: "Create account" and "Log in" buttons in the column, no icon. On the rail: a person icon opening a pop-over with the same two buttons. There is no gear anywhere; reading light is the sun icon, and Report a problem, Privacy and About are under "?". The account forms open with focus on Close, not on Email. `63-account-create`, `64-account-log-in`, `75-rail-popover-account-1024x768`, `75-rail-popover-light-1024x768`, `75-rail-popover-help-1024x768`.
25. **"Report a problem" is one empty box and "Send"**: no label, no hint of what to write, no word on whether a reply is possible. `65-report-a-problem`.
26. **The book page has no related books.** After the library card there is the description and two outside links (Goodreads search, Open Library). Suggestions exist only on the shelf. `28-book-nolib-saved`.

### Design polish (14)

27. **No hover state** on book covers, suggestion covers, result covers, "Viewed before" spines, list rows, the two outside links on the book page, "Create account" and "Log in" (they are links styled as buttons; real buttons do brighten), and on the landing page's logo, header links, "Open the app", "Find my library", country rows, guide cards and footer links. The cursor is a pointer on all of them. State shots: `book-cover-*`, `suggestion-cover-*`, `result-card-*`, `viewed-before-spine-*`, `list-row-*`, `create-account-button-*`, `landing-*`.
28. **No pressed state** on anything except the search clear button and the scan button. The source has no `:active` rule.
29. **Keyboard focus** is visible on every control tested (ring on covers: `book-cover-focus`). Two things do not take focus and look like they might: the "MyBookshelf" wordmark in the column (plain text, not a link to anything) and the library name.

| Control | Size | Cursor | Hover changes | Pressed changes | Focus ring |
|---|---|---|---|---|---|
| Search field | 630x48 | text | no | focus ring only | yes |
| Scan button (rail only) | 52x50 | pointer | yes | yes | yes |
| Book cover, suggestion cover, result card | 120x180 | pointer | no | no | yes |
| "Viewed before" spine | 45x126 | pointer | no | no | yes |
| List row | 880x70 | pointer | no | no | yes |
| Add to my shelf / On my shelf | 520x52 | pointer | yes (brighter, shadow) | no | yes |
| Find my library (column, book page) | 251x48, 486x48 | pointer | yes | no | yes |
| Library name | 251x44 | arrow | no | no | not focusable |
| Change | 54x44 | pointer | yes (underline) | no | yes |
| Create account, Log in | 121x44 | pointer | no | no | yes |
| Reading light buttons, view switch | 83x44, 46x44 | pointer | yes | no | yes |
| Report a problem, Privacy, About | 44–119 x 44 | pointer | yes (underline) | no | yes |
| Rail icons | 48x48 | pointer | yes (fill) | no | yes |
| Pop-over items: account buttons | 246x44 | pointer | no | no | yes |
| Pop-over items: help links, light buttons | | pointer | yes | no | yes (help links); not captured (light buttons) |
| Close (book page, picker), Clear search | 44x44 | pointer | yes | no (Clear search: yes) | yes |
| Picker row | 257x60 | pointer | yes (fill) | no | yes |
| Back to my shelf, Clear (Viewed before) | 154x44, 44x44 | pointer | yes | no | yes |
| Landing: logo, header links, Open the app, Find my library, country rows, footer links | 44–48 high | pointer | no | no | yes |
| Landing: inline text links | 17 high | pointer | yes (thicker underline) | no | yes |

30. **Tab order at 1440x900**: Skip to content, Change library, Create account, Log in, Daylight, Lamplight, Ink, Report a problem, Privacy, About, then the search field (11th), Shelf view, List view, the 13 saved books left to right and top to bottom, the 5 suggestions, Clear, then the "Viewed before" spines. The skip link is the only way past ten column stops. Clear comes before the spines it clears. Full list: `scripts/logs/tab-order-1440.json`.
31. **1920x1080**: the bay is 1620 px wide and the six covers stand 261 px apart; the search bar stays 680 px at the left. Cold open leaves 518 px empty under one bay. `13-cold-shelf-1920x1080`, `76-shelf-12-1920x1080`.
32. **1100x800 with a book open**: 252 px of shelf remain, which is one cover and most of the next. `78-book-1100x800`.
33. **700x900 with a book open**: a 28 px strip of shelf shows at the right edge. `78-book-700x900`.
34. **The column's bottom links wrap** when a page is open and the column narrows to 248 px: "About" drops to its own line. `28-book-nolib-saved`.
35. **The "Removed … Undo" notice** sits across the edge between the page and the shelf and covers "All editions on Open Library". `39-remove-after`.
36. **The spinner is small and has no text** for a wait that ran 3 to 46 s. `54-book-kv-checking-answer-card`.
37. **Dark colour scheme is ignored.** A browser set to dark gets Daylight, in the app and on the landing page. "Ink" is a light theme, which the name does not suggest. `84-dark-scheme-fresh-cold-shelf`, `73-dark-scheme-landing`, `70-light-ink-shelf`.
38. **Two wordmarks and an arrow that misleads.** The landing page says "myBookshelf" with an icon; the app says "MyBookshelf" without one and it is not a link, so there is no way from the app back to the landing page, How it works or the library guides. "Open the app ↗" opens in the same tab. `01-public-landing-top`, `13-cold-shelf-1440x900`.
39. **The help page describes the phone app**: "open the menu (the person icon)", "tap the barcode button", "tap On my shelf". None of these match the layout from 1100 px. `09-public-support-full`.
40. **Font weight on the wire**: 434 KB of TTF fonts for the app against 175 KB of script and styles.

### The owner's call-outs

| Call-out | Seen? | Where |
|---|---|---|
| Status shown as icons (tick, question mark, retry) rather than words | Yes | Finding 10; the five `…-answer-card` shots |
| The library name is not obviously changeable | Yes | Findings 12, 13 |
| Where "Change" is | Text link under the name in the left column from 1100 px; behind the first rail icon below that; nowhere on the book page's library card | `41-library-chosen-anna-shelf`, `83-rail-my-library-pressed-1024x768`, `43-book-anna-wings-of-fire` |
| Profile/account entry versus a settings gear | No gear exists; see finding 24 | `75-rail-popover-*` |
| e-Granthalaya checks timing out, 25–28 s then "couldn't check" | Yes: 25.3 s and 25.2 s | Finding 1 |
| A suggested book duplicating one already on the shelf | Not reproduced. Tried: saving Wings of Fire by ISBN (a different record from the suggested one) removed it from the suggestions, also after a reload. No suggestion in the run matched a saved book. "Viewed before" does repeat every saved book (finding 23). | `91-shelf-after-saving-isbn-book`, `-reload` |
| A suggestion in another language | Yes, by its cover | Finding 20 |

## (d) Not tested, and why

- **"Not found"**: no check in the run returned it, and the check limit was reached, so its card and icon are not in the baseline.
- **Library answers in WebKit, in the three reading lights, at the other five viewports, and in the interaction states**: the check limit was used up at 1440x900. Those passes have "Find my library" on the book page instead of an answer card.
- **Search results at the e-Granthalaya library and at a Japanese library**: dropped to stay near the limit. Setagaya was only looked up in the picker.
- **Time to the answer for the ISBN typed at Anna Centenary**: the script failed after the screenshot; only "under 43 s" is known.
- **Whether the 45.9 s Anna check would ever have ended**, and whether it happens again: not repeated.
- **Accounts**: creating, logging in, verification, account settings, sign-out, signed-in shelf. Only the two entry screens were photographed, empty.
- **Sending** "Report a problem", "My library isn't listed" and "Request to add …": not pressed. The "My library isn't listed" form itself was not opened.
- **"Libraries near me"**: location was not granted, so neither the list nor the refusal message was seen.
- **Barcode scanning**: no camera. The scan button on the rail opens "Type the ISBN" with a field and "Find" (`90-scan-dialog-no-camera-1024x768`).
- **Below 640 px** (the phone layout) and **windows under 480 px tall**: outside this desktop walk.
- **Real browsers**: everything is headless Chromium 140 (build 1187, one revision older than the installed Playwright expects, because that is the build on this Mac) and Playwright's WebKit. No Safari, Firefox or Edge, no real mouse, no touch screen.
- **Pressed states inside rail pop-overs**: holding the mouse down and releasing outside closed the pop-over, so focus shots for three pop-over items are missing (`popover-item-my-library`, `popover-item-reading-light`, `popover-close`).
- **Hover on the open book's cover on the shelf**: pressing there closes the book; only its default state was kept (`open-book-cover-on-shelf-default`).
- **Truncation count in `layout.csv`** counts elements whose text is wider than their box. It misses text shortened by the app itself with "…" (spines, cover-less titles); those were found by eye.
- **Why** stored answers are empty, why WebKit refuses a stylesheet, and why results marks differ from the book page: observed only, not investigated.
