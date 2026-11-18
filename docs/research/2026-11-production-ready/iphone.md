# MyBookshelf on iPhone: new-reader walk, 18 November 2026

Device: iPhone 16 Pro Max, iOS 27.2, Safari, Private tab, portrait unless noted. Site: https://mybookshelf.cloud (in-app About shows version d3262e2).
Driven over Wi-Fi with WebDriverAgent. Screen is 440 x 956 points; the page viewport is about 742 points tall with Safari's bars showing.
All times are coarse: they come from polling element lookups (about 0.3 s per poll) or from bursts of screenshots (one every 0.5-0.6 s). Treat them as upper bounds, one sample each.
Screenshots are in this folder. `timings.csv` has the numbers.

## (a) Step-by-step log

| Step | What was done | Screenshots | Time | Scroll depth | Hidden or cut off |
|---|---|---|---|---|---|
| 00 | Owner's existing shelf in the normal tab, untouched | 00 | - | - | - |
| 01 | Landing page `/` top to bottom | 01-landing-top, -scroll2..5 | not timed | page 2,460 pt, about 3.3 screens | "Wings of Fire" cover in the example shelf is cropped on the left ("VINGS OF FIRE"). Safari's floating bottom bar sits over the "How it works" heading at rest |
| 02 | `/how-it-works` (via footer link) | 02-how-it-works-top, -scroll2, -scroll3 | not timed | about 2.2 screens | Bottom bar over the "Different libraries share different details" heading at rest |
| 03 | `/about` (footer link) | 03-about-top, -scroll2, -scroll3 | not timed | about 1.7 screens | Nothing |
| 04 | `/libraries` (footer link) | 04-libraries-top, -scroll2..8 | not timed | 8 screens (7 swipes of 560 pt) | No jump links to India / United States / Japan; twelve full cards in one column |
| 05 | Library guide: Anna Centenary Library | 05-guide-anna-top, -scroll2..5 | not timed | about 3 screens | Note under the catalog button: "Catalog link uses HTTP, which is not encrypted." |
| 06 | `/privacy` (footer link) | 06-privacy-top, -scroll2..14 | not timed | 14 screens (about 8,600 pt) | Nothing cut off; very long |
| 07 | "Open the app" from the landing header: cold shelf | 07-shelf-cold-open-first-paint, -settled | 1.65 s to search field | fits one screen | No library line and no control to choose a library. Five suggested books; one cover is in Tamil script |
| 08 | Landing "Find my library": picker opens over the shelf. Typed a city (Chennai), a library name (Anna Centenary), a place with no libraries (Xyzzyville) | 08-picker-* (10 shots) | results about 1.1 s after typing ends | Chennai: 25 rows, about 1,900 pt, 4 swipes with keyboard down | With the keyboard up, Safari's form bar ("AutoFill Contact") covers the text field, and the single result row for a library name is fully under the keyboard (08-picker-name-anna-centenary, 34-picker-name-kv-narimedu-keyboard). After typing a city the sheet grows and its title, Close button and the field scroll off the top (08-picker-city-chennai). "My library isn't listed" is below all 25 rows |
| 09 | "Libraries near me": iOS location prompt appears straight away; pressed Don't Allow | 09-near-me-permission-prompt, 09-near-me-denied | - | - | After denial the sheet only says "Location unavailable" |
| 10 | Chose Anna Centenary Library | 10-library-anna-row-before-choose, -chosen-shelf, -chosen-shelf-settled | 1.0 s to shelf | - | Library name appears as small plain text under the search field |
| 11 | Focused the book search field, typed a title | 11-search-field-focused-keyboard, 11-search-title-typed | - | - | Page shifts up 39 pt on focus; the "MyBookshelf" header slides under Safari's address bar. No zoom |
| 12 | Search by title "Wings of Fire" (Anna) | 12-search-title-submitted-0.4s, -loading-1.0s, -results-1.7s, -list-view, -list-view-scroll2 | results <= 0.8 s; library answer <= 1.5 s; covers <= 2.3 s | 9 results: shelf view 3 rows, list view 1.2 screens | Shelf view shows covers only (titles only on placeholder covers). One book carries a small building badge; the other eight have no mark |
| 13 | Book page: Wings of Fire (Anna, found) | 13-book-wings-of-fire-anna-top, -scroll2, -scroll3, 13-book-description-expanded | page complete before it could be timed (under about 1.5 s) | 1.3 screens; 1.6 with description expanded | Status row shows a tick and the library name; the word "Found" is not on screen. The floating "Less" button overlaps the "READ MORE ELSEWHERE" heading |
| 14 | Catalog link, opened once | 14-catalog-link-opened-anna, 14-catalog-link-anna-after-continue | - | - | Opens a new tab that first shows Safari's "This Connection Is Not Secure" page. After Continue it is the book's own record on the library's Koha catalog (address bar: "Not Secure - 118.185.210.241") |
| 15 | Saved from the book page | 15-save-from-book-page-just-tapped, -saved | instant | - | Toast "Added to your shelf / See my shelf" sits above Safari's bar, over the description |
| 16 | Reload on the book page | 16-book-page-after-reload | button back 3.3 s; status <= 10.9 s | - | Saved state and status kept |
| 17-18 | In-app Back after the reload goes to the shelf (not to the results). Shelf with 1 book | 17-back-from-book-after-reload, 18-shelf-1-book-top, -scroll2 | - | 1.4 screens | Sticky header takes about 170 pt. "Viewed before" spine cuts the author ("A. P. J. Abdul Kala") |
| 19 | Tapped the library name on the shelf | 19-change-library-tap-library-line | - | - | Nothing happens; it is plain text |
| 20 | Account icon opens the side panel | 20-side-panel-open | - | fits | Sections: Account (Create account, Log in), My library (name, city, Change), Reading light, Report a problem, Privacy, About. No help or how-it-works link |
| 21 | Reading light: Lamplight and Ink on panel, shelf, book page | 21-light-lamplight-*, 21-light-ink-* | instant | - | Safari's status-bar strip keeps the previous colour for a moment after a switch (light strip over dark page in 21-light-lamplight-side-panel; dark strip over light page in 21-light-ink-side-panel) |
| 22 | Create account and Log in screens (nothing typed) | 22-account-create-screen, 22-account-log-in-screen | - | fits | Create account has no password rules and no link to Log in. Back link is 36 x 18 pt |
| 23 | Back from Create account: shelf with the panel open again; saved book has lost its library badge | 23-shelf-after-account-screen-badge-missing | waited about 40 s, badge did not return | - | - |
| 24 | Report a problem (not sent) | 24-report-a-problem-form | - | fits | One empty box and Send; no prompt text |
| 25 | Privacy and About inside the app | 25-in-app-privacy, 25-in-app-about | - | in-app privacy about 4,800 pt | In-app About is three lines plus version and contact |
| 26 | Reload on the shelf, then opened the saved book and came back | 26-shelf-after-reload, 26-shelf-after-visiting-book-page | shelf back in 2.9 s; no badge in 25 s | - | Badge only returns after the book page has been opened |
| 27 | Search by author "R. K. Narayan" (Anna) | 27-search-author-0.3s, -1.0s, -results-settled | skeleton 0.7 s; results <= 1.3 s | 9 results, 1.2 screens in list view | Skeleton is drawn in shelf view although list view was selected, with "My shelf 1 book" showing under it. Authors shown as "Rasipuram Krishnaswamy Narayan" |
| 28 | Book page: Swami and Friends (Anna), no answer in the results | 28-book-swami-anna-checking, -couldnt-check, -retry-checking, -after-retry | first check ended in "couldn't check" (not timed exactly, see timings); one Try again: 8.1 s to "Couldn't confirm" | fits | Three more icon-only states: spinner, circular arrow, question mark |
| 29 | Saved it, Back to results (query kept), saved two more from their book pages | 29-back-to-results-after-save, 29-results-after-saving-three | - | - | A second unexplained badge (bookmark) marks saved books in results |
| 30 | Shelf with 4 books, list and shelf view | 30-shelf-4-books-list-top, -list-scroll2, -bay-top, -bay-scroll2 | - | list 1.9 screens; shelf view 1.8 | Suggestions are mixed into the same list ("· Suggested" in small grey text). Viewed-before spines cut titles and authors ("The painter of sig.", "Rasipuram Krishna.") |
| 31 | Removed a book (book page, tap "On my shelf") | 31-remove-book-from-book-page, 31-shelf-after-remove-3-books | instant | - | Toast "Removed Malgudi days / Undo" |
| 32 | Search by ISBN 9780143333623 (Anna) | 32-search-isbn-loading-0.9s, -book-page-checking-2.2s, -not-found-13.9s | book page <= 1.4 s; "Not found" at about 14.3 s | fits | Goes straight to the book page (Grandma's Bag of Stories). Not found is a dash icon. Author shown as "Sudha Murthy"; the cover says "Murty". No description |
| 33-34 | Back goes to the shelf. Side panel, Change: same "Find your library" sheet. Searched "Kendriya Vidyalaya Narimedu" | 33-back-from-isbn-book, 34-change-library-picker, 34-picker-name-kv-narimedu-keyboard, 34-picker-name-kv-narimedu | - | - | Field and result hidden by the keyboard again |
| 35-37 | Chose PM SHRI Kendriya Vidyalaya No.1 Narimedu Library (e-Granthalaya). Opened Wings of Fire | 35-library-kv-narimedu-shelf-no-status, 36-book-wings-kv-checking, -answer, 36-shelf-kv-after-couldnt-check, 37-side-panel-kv-long-name | shelf: no status in 40 s; book page: "couldn't check" at 26.1 s | - | Library name wraps to two lines on the shelf and in the status row. Shelf shows no mark for "couldn't check" |
| 38-40 | Change to Burlingame Public Library. Opened Wings of Fire | 38-picker-burlingame, 39-library-burlingame-shelf, 40-book-wings-burlingame-first, -answer | "Found" at 4.9 s | - | Typing "Burlingame" lists 8 libraries (Daly City, Menlo Park...) with no note on why |
| 41 | Misspelling "Harry Poter" (Burlingame) | 41-search-misspelling-loading-1.0s, -results-2.7s, -settled-5.9s | results <= 3.1 s; answers settled <= 6.3 s | 2 results, one row | No "did you mean". After the check the "Looking in..." line vanishes and nothing replaces it. Placeholder cover cuts a long title ("...Sorcerer's Stone / Harry Po...") |
| 42 | No results | 42-search-no-results | "No books found" <= 5.1 s | fits | Only offers "Scan the barcode" |
| 43 | "Scan the barcode": camera prompt, pressed Cancel | 43-scan-camera-permission-prompt, 43-scan-sheet-camera-live-after-cancel-UNINTENDED, 43-scan-unintended-result-book-page | - | - | See section (d): the camera came on anyway and read a barcode |
| 44 | Back through overlays | 44-safari-back-with-side-panel-open, 44-safari-back-with-picker-open, 44-back-swipe-with-side-panel-open | - | - | Safari's Back button closes the side panel and the picker, one step each. Edge swipe could not be tested |
| 45 | Landscape | 45-landscape-book-page, 45-landscape-shelf, 45-landscape-side-panel | - | - | Shelf: sticky header leaves room for part of one row of covers. Side panel starts at the very left edge of the screen |
| 46 | Horizontal swipe on the shelf | 46-horizontal-swipe-shelf | - | - | No sideways movement |
| 47 | "Not now" on the account card; "Clear" on Viewed before | 47-shelf-after-not-now, 47-shelf-after-clear-viewed-before | instant | - | Clear has an Undo toast |
| 48 | Closed the private tab; owner's tab as it was | 48-owner-shelf-at-end-unchanged | - | - | - |

## (b) Library x book: status shown and time

Status wording is what the accessibility label says; on screen there is only an icon and the library name.

| Library | Book | Where | Status (label) | Icon on screen | Time |
|---|---|---|---|---|---|
| Anna Centenary Library (Koha) | Wings of Fire, Kalam | title search | "in Anna Centenary Library" | building badge on cover + legend line | <= 1.5 s after Return |
| Anna Centenary Library | Wings of Fire, Kalam | book page | "Found in Anna Centenary Library" | tick, green row | with page load (< 1.5 s) |
| Anna Centenary Library | 8 other "Wings of Fire" results (Tui T. Sutherland) | title search | no status in label | no mark | - |
| Anna Centenary Library | Malgudi days, The painter of signs, The vendor of sweets | author search | "in Anna Centenary Library" | building badge | present when looked at (about 20 s); not timed |
| Anna Centenary Library | Swami and Friends | author search | no status | no mark | - |
| Anna Centenary Library | Swami and Friends | book page, first check | "Checking..." then "Couldn't check Anna Centenary Library" | spinner, then circular arrow (Try again), grey row | still spinning at 8.5 s; ended some seconds later (not timed exactly) |
| Anna Centenary Library | Swami and Friends | book page, after one Try again | "Couldn't confirm in Anna Centenary Library" | question mark, grey row | 8.1 s |
| Anna Centenary Library | Grandma's Bag of Stories (ISBN 9780143333623) | ISBN search to book page | "Not found in Anna Centenary Library" | dash, white row | about 14.3 s |
| PM SHRI Kendriya Vidyalaya No.1 Narimedu Library (e-Granthalaya) | Wings of Fire, Kalam | book page | "Couldn't check ..." | circular arrow, grey row | 26.1 s |
| PM SHRI KV No.1 Narimedu | 3 saved books | shelf | none | no marks | none in 40 s |
| Burlingame Public Library | Wings of Fire, Kalam | book page | "Found in Burlingame Public Library" | tick, green row | 4.9 s |
| Burlingame Public Library | 2 "Harry Poter" results | search | "Looking in Burlingame Public Library..." then nothing | no marks | settled <= 6.3 s |
| Burlingame Public Library | a book read by the unintended scan | book page | "Found" | tick | not timed |

Same book across the three libraries (Wings of Fire, Kalam): Anna Centenary found, under 1.5 s; KV Narimedu couldn't check, 26.1 s; Burlingame found, 4.9 s. See 13-book-wings-of-fire-anna-top, 36-book-wings-kv-answer, 40-book-wings-burlingame-answer.

## (c) Findings by severity

### Broken (6)

B1. Library picker: the keyboard hides what you type and the result. On focus, Safari's form bar ("AutoFill Contact", arrows, tick) sits exactly over the "City, town or library name" field. When a library name gives one result, that row (y 551-619 pt) is entirely under the bar and keyboard (from y 540). The reader types a name and sees an apparently empty sheet. Shots: 08-picker-field-focused-keyboard, 08-picker-name-anna-centenary, 34-picker-name-kv-narimedu-keyboard.

B2. Library picker with many results: the sheet's top scrolls away. After typing "Chennai" the sheet grows to full height and the title, Close button and the text field move above the visible area (field at y 82 pt, behind Safari's address bar; Close at y -117). The reader cannot see the typed text or close the sheet without scrolling back. Shot: 08-picker-city-chennai.

B3. The shelf does not show library status for saved books by itself. After a reload, after returning from the Create account screen, and after changing library, saved books had no mark, and none appeared in 25-40 s of waiting. The mark came back only after opening that book's page. Shots: 23-shelf-after-account-screen-badge-missing, 26-shelf-after-reload, 26-shelf-after-visiting-book-page, 35-library-kv-narimedu-shelf-no-status, 39-library-burlingame-shelf.

B4. e-Granthalaya check ran 26.1 s and ended in "couldn't check" (PM SHRI KV No.1 Narimedu, Wings of Fire). During the wait there is only a small spinner. Matches the owner's 25-28 s call-out. Shots: 36-book-wings-kv-checking, 36-book-wings-kv-answer.

B5. Catalog link for Anna Centenary opens Safari's full-page "This Connection Is Not Secure" warning in a new tab, with an empty address bar. Only after "Continue" does the reader reach the record, on a bare IP address marked "Not Secure". The link itself is correct: it is the book's own record. Shots: 14-catalog-link-opened-anna, 14-catalog-link-anna-after-continue.

B6. Barcode scan: after pressing Cancel on the iOS camera prompt, the camera preview was live and it read a barcode in view, opening that book. I cannot tell whether the prompt registered Cancel, whether a second request was granted some other way, or whether the tool pressed something else; it needs a check by hand. Shots: 43-scan-camera-permission-prompt, 43-scan-sheet-camera-live-after-cancel-UNINTENDED.

### Confusing (14)

C1. Status is icons only (owner call-out, confirmed). Book page row shows an icon and the library name; the words "Found", "Not found", "Couldn't check", "Couldn't confirm", "Checking" exist only for screen readers. Five icons: tick (13-book-wings-of-fire-anna-top), dash (32-search-isbn-not-found-13.9s), circular arrow (28-book-swami-anna-couldnt-check), question mark (28-book-swami-anna-after-retry), spinner (28-book-swami-anna-checking).

C2. There are four answers, not three. Landing and How it works promise "found, not found, or couldn't check". The app also has "Couldn't confirm" (question mark), which is not explained anywhere I saw. Shot: 28-book-swami-anna-after-retry.

C3. In search results and on the shelf, no mark means three different things: not found, couldn't check, or not checked yet. Swami and Friends had no mark in results, then "couldn't check", then "couldn't confirm" on its page, and still no mark. Shots: 27-search-author-results-settled, 29-results-after-saving-three, 36-shelf-kv-after-couldnt-check.

C4. When a search finds nothing in the library, the "Looking in ..." line just disappears; nothing says "none of these are in Burlingame Public Library". Shots: 41-search-misspelling-results-2.7s, 41-search-misspelling-settled-5.9s.

C5. The library name is not changeable where it is shown (owner call-out, confirmed). It is plain 13 px text; tapping does nothing. Shot: 19-change-library-tap-library-line.

C6. "Change" is only inside the side panel, behind a person icon labelled "Account and settings" (owner call-outs, confirmed: no visible Change library; profile icon rather than a gear). Two taps and a guess. Shots: 20-side-panel-open, 37-side-panel-kv-long-name.

C7. Cold open has no library line and no way to choose a library on the shelf itself; the sub-heading says "search in your library". The picker is reached from the landing page's "Find my library" or the side panel. Shots: 07-shelf-cold-open-settled, 08-picker-from-landing-find-my-library.

C8. "My library isn't listed" becomes a one-tap "Request to add "Chennai"" button: it offers to request whatever was typed, here a city, with no field for the library's name and no explanation. It sits below all 25 rows. Shots: 08-picker-city-chennai-bottom-not-listed, 08-picker-not-listed-form, 08-picker-no-results.

C9. City results: "25 libraries" for Chennai, in A-Z order, ending at "PM SHRI Kendriya Vidyalaya Ashok Nagar". The count is only for screen readers and nothing says whether the list is cut at 25. Some rows have no city ("GRT MV", "E.S Arts and Science College (Co-Ed) · Tamil Nadu"), some are in capitals. Shots: 08-picker-city-chennai-keyboard-dismissed, 08-picker-city-chennai-bottom-not-listed.

C10. Saving and removing need the book page. Results and shelf rows have no save control; removal is by tapping "On my shelf" on the book page, which does not say "Remove". Shots: 12-search-title-list-view, 31-remove-book-from-book-page.

C11. Suggestions sit in the same grid and list as saved books. In list view the only difference is "· Suggested" in small grey text; "4 books" counts only the saved ones while nine are shown. Shots: 30-shelf-4-books-list-top, 30-shelf-4-books-bay-top.

C12. Suggestions in another language (owner call-out, confirmed): "Ponniyin Selvan" with a Tamil-script cover on cold open (07-shelf-cold-open-settled); "The Jungle Book" shown with the Spanish cover "El libro de la selva" (18-shelf-1-book-top); "The Hungry Tide by Amitav Ghosh, Yaʻel Akhmon" (30-shelf-4-books-bay-top; second name looks like a translator).

C13. Misspelling gets no help. "Harry Poter" returns two records that contain the typo; no "did you mean". No-results state offers only the barcode scanner. Shots: 41-search-misspelling-settled-5.9s, 42-search-no-results.

C14. Book data differs from what the reader expects: authors as "Rasipuram Krishnaswamy Narayan" for a search on "R. K. Narayan" (while the suggestion says "R. K. Narayan"); "Sudha Murthy" where the cover says "Murty"; "The hidden kingdom [graphic novel] · 2000"; "First published 1999" on a page whose library record is the 2021 edition. Shots: 27-search-author-results-settled, 32-search-isbn-not-found-13.9s, 12-search-title-list-view-scroll2, 14-catalog-link-anna-after-continue.

### Design polish (15)

P1. Small tap targets (from element frames): "Catalog" link on the book page 52 x 18 pt; "Back" link on Create account, Log in, Report a problem, in-app Privacy and About 36 x 18 pt; landing "Find a book instead" and "Browse featured libraries" 19 pt high; footer links 19 pt high; guide "Explore this library" links about 20 pt high. Fine: account icon 44 x 44, view switches 44 x 44, Clear 45 x 45, Close 44 x 44.

P2. Rows stay highlighted after a touch in the picker list (08-picker-city-chennai-keyboard-dismissed, -bottom-not-listed) and the account icon keeps a grey square or a focus ring that touches the "MyBookshelf" wordmark (17-back-from-book-after-reload, 21-light-lamplight-shelf, 39-library-burlingame-shelf).

P3. Safari offers "AutoFill Contact" on the library field (08-picker-field-focused-keyboard).

P4. On focusing the book search field the page moves up and the header goes under Safari's address bar (11-search-field-focused-keyboard).

P5. Search loading skeleton is always the shelf view, even with list view chosen, and "My shelf · 1 book" shows beneath it (27-search-author-0.3s, 41-search-misspelling-loading-1.0s).

P6. Two badges on result thumbnails (building = in library, bookmark = on my shelf); only the building has a legend, and the shelf has no legend at all (29-results-after-saving-three, 30-shelf-4-books-bay-top).

P7. Floating "Less" button overlaps the next heading (13-book-description-expanded).

P8. Book tab title is "Book details - MyBookshelf", not the book's title (seen in Safari's tab overview).

P9. Viewed-before spines cut titles and authors; the row repeats books already on the shelf (30-shelf-4-books-bay-scroll2, 47-shelf-after-not-now).

P10. Reading light: Safari's top strip lags one theme behind after a switch (21-light-lamplight-side-panel, 21-light-ink-side-panel). "Ink" is a light blue-white theme, which the name may not suggest (21-light-ink-shelf).

P11. Brand is "myBookshelf" on public pages and "MyBookshelf" in the app and in the About heading (01-landing-top, 07-shelf-cold-open-settled, 03-about-top).

P12. Long pages: `/privacy` is 14 screens and `/libraries` 8, with no contents list or country jump links (06-*, 04-*).

P13. Thin screens: Report a problem has no prompt text and none of the privacy page's "do not include personal details" advice (24-report-a-problem-form); "Location unavailable" gives no next step (09-near-me-denied); Create account shows no password rules (22-account-create-screen); in-app About has no link to How it works (25-in-app-about).

P14. Landscape: the sticky header fills most of the height, leaving part of one row of covers; the side panel starts at the left screen edge and needs scrolling to reach Reading light (45-landscape-shelf, 45-landscape-side-panel).

P15. Landing example shelf crops the "Wings of Fire" cover; typing "Burlingame" lists eight libraries without saying they are nearby (01-landing-top, 38-picker-burlingame).

### Checked and fine
- No zoom on focus in the book search field or the library field.
- No horizontal scrolling on the shelf (46).
- Reload keeps library, saved books and reading light; reload on a book page keeps saved state and status (16, 26).
- Safari's Back button closes the side panel and the picker one step at a time; in-app Back from a book returns to results with the query kept (29, 44).
- Toasts sit above Safari's bottom bar; bottom of the shelf clears it (15, 18-shelf-1-book-scroll2).
- Long title wraps cleanly on the book page (43-scan-unintended-result-book-page).
- Undo on remove and on Clear (31, 47).
- Owner call-out "a suggested book duplicating one already on the shelf": not seen in this run.

## (d) Not tested, and things that went wrong

1. Camera. I pressed Cancel on the camera prompt, but the next screenshot showed a live camera preview, and it read the barcode of a book near the phone. My next tap, meant for the sheet's Close button, landed on "Add to my shelf" on that book's page. I removed the book at once and closed the page; the camera indicator was off afterwards. This also caused one library check I did not intend (Burlingame). The screenshot 43-scan-sheet-camera-live-after-cancel-UNINTENDED shows part of the room and stays out of the repository. The manual ISBN box in the scan sheet was not tried.
2. Library check budget. Counted as live: title search, author search, Swami and Friends page, ISBN search (all Anna Centenary); Wings of Fire at KV Narimedu; Wings of Fire at Burlingame; misspelling and no-results searches (Burlingame). That is 8, plus the one Try again, plus the unintended scan = 9 checks and 1 retry. Book pages that answered at once (Malgudi days, The painter of signs, re-opened Wings of Fire) are not counted; I cannot tell from the phone whether they reached the catalog.
3. Step 7 (open and save a suggestion) was not done: it would have been another live check.
4. A Japanese library and Anna Centenary's "not found" by title were not tried, for the same reason.
5. Back edge swipe: the tool's swipe from the screen edge did not trigger Safari's gesture on a book page or with the side panel open, so the gesture is untested. Safari's Back button was used instead.
6. Notch / home indicator overlap: screenshots do not show the Dynamic Island or home indicator, so overlap is judged from frames only. Portrait looked clear; landscape side panel starts at x = 0.
7. Page load times for the public pages were not measured (the first attempt's wait matched too early).
8. First check time for Swami and Friends was not captured exactly (see timings.csv).
9. WebDriverAgent crashed once at 10:30 during a full accessibility snapshot; the coordinator restarted it. Re-creating the session relaunched Safari and Private Browsing asked for Face ID ("Face Not Recognized" was on screen once), then unlocked without my input. I pressed Cancel on that dialog only.
10. I pressed "Continue" on Safari's not-secure page once, to see where the catalog link leads.
11. No account was created, nothing was typed into email or password fields, no report or library request was sent, location was denied.
12. The private tab was closed at the end; the owner's normal tab shows the same library and saved book as at the start (00, 48).
