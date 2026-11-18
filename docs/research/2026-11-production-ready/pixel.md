# MyBookshelf on a Pixel 6 Pro: new-reader walk, 18 November 2026

Device: Pixel 6 Pro, Android 17, Chrome 157, over Wi-Fi. Site: https://mybookshelf.cloud (footer commit d3262e2).
Session: one new Incognito tab (tab id 10765). Page viewport 411 x 794 css px (411 x 770 on the public pages), device pixel ratio 3.5.
Files: 148 screenshots, `timings.csv` (36 rows), this file.

## Read this first: how the screenshots were made

- Chrome blocks device screenshots of Incognito tabs (adb screencap returns a black frame). Every screenshot here is therefore a **page-only capture through Chrome's debugging port**. It shows no Chrome toolbar, no keyboard and no Chrome permission prompt.
- Each capture is 850 css px tall but the phone shows only the top 794 css px (770 on public pages). The plain strip at the bottom of every image is not on screen.
- When the keyboard is open only the top 482 css px of the page area is visible (the top 57% of the image). Captures taken with the keyboard open start at the top of what the reader sees.
- Chrome's camera and location prompts were read as text with `uiautomator dump` (quoted below), not as images.
- All taps were real touches (`adb input tap`). Text was typed with `adb input text`. Scrolling for the long-page captures was done by script.

## Things I did that you should know about

1. **A library request was sent by accident.** In the picker's empty state I tapped "Request to add “Zzqqxx”" expecting a form. It sends on one tap. One request with the text "Zzqqxx" is now in the request list (`19-picker-request-sent.png`). Please delete it.
2. **Live library checks used: 8 of 8**, counting conservatively. One of them was not planned: reloading a book page restarted the check (see finding B5).
3. The Incognito tab is still open on the shelf (3 saved books, Burlingame Public Library chosen). Closing it discards everything. No other tab, app or setting was touched.
4. No account was created, no password or email typed, no permission granted, no problem report sent.

---

## (a) Step-by-step log

Scroll depth is page height / viewport height in css px. "Inner" means the app scrolls inside `main.app-screen`, not the document.

| # | Step | Screenshots | Time | Scroll depth | Hidden or cut off |
|---|------|-------------|------|--------------|-------------------|
| 1 | Landing page `/` | `01-landing-1..4` | load 347 ms | 2502 / 770 (3.2 screens) | Header links (Libraries, How it works, About, GitHub) are hidden at this width; they are only in the footer. First screen ends mid-way through the cover card. |
| 1 | `/how-it-works` | `02-how-it-works-1..3` | – | 2072 / 770 | Nothing. |
| 1 | `/about` | `03-about-1..3` | – | 1556 / 770 | Nothing. |
| 1 | `/libraries` | `04-libraries-1..7` | – | 4919 / 770 (6.4 screens) | 12 cards in one column; United States starts at screen 4, Japan at screen 6. No jump links at the top. |
| 1 | Guide: Anna Centenary Library | `05-guide-anna-1..4` | – | 2340 / 770 | Says "Catalog link uses HTTP, which is not encrypted." |
| 1 | `/privacy` | `06-privacy-1..9` (first 9 of 12 screens) | – | 9246 / 770 (12 screens) | Two tables; no horizontal overflow. |
| 1 | `/support`, `/open-source` (footer only) | `75-support-1..4`, `76-open-source-1..2` | – | 2370 / 770, 1257 / 770 | – |
| 1 | "Open the app" | `07-shelf-cold-loading`, `07-shelf-cold-open` | first paint 216 ms | 794 / 794 (no scroll) | – |
| 1 | Landing "Find my library" (done last, library already chosen) | `77-landing-find-my-library-result` | – | – | Opens the shelf with the library picker already open. |
| 2 | Cold shelf | `07-shelf-cold-open` | – | no scroll | "Ready to search / Add books to your shelf and search in your library", search field, barcode button, 5 suggested covers. **No library line and no library control.** |
| 9 | Side panel (person icon) | `08-sidepanel-open` | – | no scroll | Account (Create account, Log in), My library "None chosen / Choose", Reading light, Report a problem, Privacy, About. No Help. |
| 10 | Search field focused, keyboard up | `09-search-focused-empty`, `10-search-typed-nolibrary` | – | visible 482 of 794 | Second row of suggestions is under the keyboard. Nothing happens while typing; search runs on Enter. |
| 4 | Title search "Wings of Fire", no library | `11-search-title-loading`, `11-search-title-results-nolibrary`, `12-search-title-list-nolibrary-1` | 6.2 s to results | 9 results, fits in one screen (inner 834 / 794 in list view) | Shelf view shows covers only: no title, author or year. No hint that a library can be chosen. |
| 6 | Book page, no library (Wings of Fire, Kalam) | `13-book-nolibrary-loading`, `13-book-nolibrary-1..2`, `20-book-about-expanded-1..2` | 1.1 s to description | inner 987 / 794; 1189 with "More" open | Cover, title, author, "First published 1999", Add to my shelf, "Is it in your library? / Find my library", About this book (clamped, "More"), Reviews on Goodreads, All editions on Open Library. No ISBN, publisher, page count or language. No related books. |
| 3 | Picker opened from the book page | `14-picker-open`, `15-picker-focused` | – | – | Bottom sheet: "Libraries near me", "or", "City, town or library name". |
| 3 | Type a city: "Chennai" | `15-picker-city-chennai` (keyboard open), `16-picker-chennai-list-1..4` (keyboard closed) | not timed | sheet 2288 / 778 (2.9 screens) | 25 libraries, A to Z. With the keyboard open the typed field sits above the visible area (finding B2). |
| 3 | Type a library name: "Anna Centenary" | `17-picker-name-anna-keyboard` | 0.75 s | – | 1 result plus "My library isn’t listed". All visible above the keyboard. |
| 3 | No match: "Zzqqxx" | `18-picker-no-match`, `19-picker-request-sent` | 0.73 s | – | "No libraries here yet" and a green "Request to add “Zzqqxx”" button that sends on one tap. |
| 5 | Save from the book page | `21-book-saved-just-after`, `21-book-saved` | instant | – | Button becomes "On my shelf"; toast "Added to your shelf / See my shelf". |
| 6 | In-app Back from the book | `22-back-from-book-to-results` | – | – | Returns to the same results, same view, with a bookmark badge on the saved book. |
| 5 | Shelf with 1 book | `23-shelf-1-book`, `23-shelf-1-book-scroll-1..2` | – | inner 1003 / 794 | 1 saved book and 5 suggestions on the same shelves, then "Take your shelf with you" account card, then "Viewed before". No view switch yet. |
| 4 | Author search "R. K. Narayan", no library | `24-search-author-loading`, `24-search-author-results`, `-bottom`, `-bay` | 4.7 s | inner 834 / 794 | 9 results; author printed as "Rasipuram Krishnaswamy Narayan". No "more results". |
| 4 | ISBN search 9780143333623, no library | `25-search-isbn-loading`, `25-search-isbn-book-page`, `26-book-isbn-saved`, `27-back-from-isbn-book` | 2.4 s | no scroll | Goes straight to the book page (Grandma's Bag of Stories, "Published 2015", ISBN shown). Browser Back returns to the shelf with the search field empty. |
| 4 | Misspelling "Harry Poter and the Philosphers Stone" | `28-search-misspelt-loading`, `28-search-misspelt-results`, `-list` | 12.5 s | no scroll | 3 results for the corrected spelling, no "showing results for" line. All three cards have drawn placeholder covers; the third clips to "Parts 1 & 2…" and "Jack Thorne,..". The query is cut off in the search field. |
| 10 | Long title | `29-book-long-title`, `33-shelf-3-books-1` | – | – | Book page wraps the 21-word title over 6 lines, nothing clipped. Shelf list view cuts it to one line with "…". |
| 4 | No results "qzxvkjqwpl" | `30-search-no-results` | 4.5 s | no scroll | "No books found" and one button, "Scan the barcode". The field shows "Qzxvkjqwpl" (first letter capitalised by the keyboard). |
| 9 | Scan a barcode | `31-scan-screen-before-permission`, `32-scan-permission-dismissed` | prompt at once | – | Chrome prompt text: "mybookshelf.cloud wants to use your camera" / Allow while visiting the site / Allow this time / Never allow. Dismissed with Back. App then shows a dark panel with "Allow camera", and "Or type the ISBN" + Find. |
| 5 | Shelf with 3 books, list view | `33-shelf-3-books-1..2` | – | inner 1274 / 794 | View switch now present. Saved and suggested rows share one list; suggested rows say "· Suggested". |
| 7 | Open a suggestion (The Jungle Book) | `34-suggestion-book-jungle-1` | 1.2 s | inner 802 / 794 | Cover is a Spanish edition ("El libro de la selva"). Nothing on the page says it was a suggestion. |
| 7 | Save a suggestion | `35-suggestion-saved` | instant | – | – |
| 5 | Shelf with 4 books, both views | `36-shelf-4-books-list-1..2`, `37-shelf-4-books-bay-1..2` | – | list 1344 / 794, shelf 1234 / 794 | New suggestions include "Tales from The Jungle Book" and "The Jungle Book [adaptation]". |
| 5 | Remove a book | `38-remove-book-step` | Undo stays 10 s | – | Tapping "On my shelf" removes the book at once; toast "Removed The Jungle Book / Undo". |
| 9 | Reading light: Lamplight, Ink | `39-light-Lamplight-panel`, `-shelf-bay`, `-shelf-list`, `-book`; same four for `39-light-Ink-` | instant | – | Lamplight is dark brown, Ink is white with blue. Both readable. Daylight is every other screenshot. |
| 9 | Create account, Log in (nothing typed) | `40-account-create`, `41-account-login` | – | no scroll | Email, Password, button. Create account has Terms and Privacy links; Log in has "Forgot password?". No password rules shown, no show-password control. |
| 9 | Report a problem (not sent) | `42-report-problem` | – | no scroll | A title, an empty box and "Send". No label, hint or example. |
| 9 | Privacy and About inside the app | `43-app-privacy`, `44-app-about` | – | privacy inner 4978 / 794 | About shows "Version d3262e2" and the contact email. |
| 3 | Choose Anna Centenary Library from the book page | `45-anna-chosen-checking`, `45-anna-chosen-checking-2`, `45-anna-wings-status` | 9.1 s to answer | – | Card shows a tick in a circle, the library name and "Catalog". No word such as "Found". |
| 6 | Catalog link, opened once | `46-catalog-record-anna-koha` | about 8 s to load | – | Opens the book's own record (`opac-detail.pl?biblionumber=497990`) in a new tab on `http://118.185.210.241:8001`. Chrome's address bar read "Connection is not secure". |
| 6 | Reload on the book page | `47-book-reload-early`, `47-book-reload-settled` | paint 168 ms | – | Book and "On my shelf" come back at once; the library card was back on "Checking" 5.7 s later. |
| 2 | Shelf with a library chosen | `48-shelf-anna-bay`, `48-shelf-anna-list`, `49-shelf-anna-after-reload-list` | – | – | Library line is small grey text, not a control. After the reload there is no mark on Wings of Fire. |
| 4 | Title search with Anna chosen (same query again) | `50-search-typed-keyboard-anna`, `50-search-anna-loading`, `-3s`, `-8s`, `-settled-list`, `-settled-bay` | 0.24 s results, 0.74 s settled | – | Line "In Anna Centenary Library" with a building icon; the one found book carries the same icon. The other eight carry nothing. |
| 8 | Anna x Darkstalker | `51-anna-darkstalker-checking`, `51-anna-darkstalker-still-checking-21s`, `52-anna-darkstalker-couldnt-check` | 46.4 s | – | Spinner for 46 s, then a circular arrow, the library name and "Catalog". |
| 8 | Retry, once | `53-anna-darkstalker-retry-checking` | 45.2 s | – | Same result. |
| 2 | Shelf after an answer in the same visit | `54-shelf-anna-found-badge-bay`, `-list` | – | – | Found book has a 28 px building badge on the cover corner. |
| 3 | Change library | `55-sidepanel-library-chosen`, `56-picker-change-library` | – | – | Person icon, then "Change" beside the library name. The picker does not show the current library. |
| 3 | e-Granthalaya library | `57-picker-kv-narimedu`, `58-picker-my-library-isnt-listed`, `59-shelf-kv-chosen` | 0.64 s | – | Listed as "PM SHRI Kendriya Vidyalaya No.1 Narimedu Library". Name wraps to two lines on the shelf. |
| 8 | KV Narimedu x Wings of Fire | `60-kv-wings-checking`, `60-kv-wings-status`, `61-shelf-kv-after-couldnt-check` | 25.3 s | – | Couldn't check. Catalog link goes to the catalog's front page. |
| 9 | Libraries near me | `63-near-me-tapped`, `64-near-me-dismissed`, `62-sidepanel-long-library-name` | prompt at once | – | Chrome prompt text: "mybookshelf.cloud wants to use your device's location" / Precise / Approximate / Allow while visiting the site / Allow this time. Dismissed with Back. App then says only "Location unavailable". |
| 3 | Library outside India | `65-picker-burlingame`, `66-shelf-burlingame-chosen` | 0.71 s | sheet scrolls | 8 libraries for "Burlingame", all in San Mateo County. |
| 8 | Burlingame x Wings of Fire | `67-burlingame-wings-checking`, `67-burlingame-wings-status`, `68-shelf-burlingame-found-badge` | 3.5 s | – | Found. Catalog link is the BiblioCommons record. |
| 8 | Burlingame x Grandma's Bag of Stories | `69-burlingame-grandma-status` | 5.9 s | – | Not found: a short grey dash, the library name and "Catalog". |
| 5 | Shelf with one found and one not found | `70-shelf-burlingame-found-and-notfound-bay`, `-list` | – | – | Only the found book is marked. |
| 10 | Pull to refresh | `71-after-pull-to-refresh` | – | – | Nothing happens (page did not reload). |
| 10 | Reload on the shelf | `72-shelf-reload-early`, `72-shelf-reload-settled` | paint 160 ms | – | Books, library and view are kept. The found mark is gone. |
| 5 | Bottom of shelf; "Not now" | `73-shelf-bottom-account-card-viewed-before`, `74-shelf-after-not-now` | – | inner 1001 / 794 after | The account card goes away. |

### Phone specifics (step 10)

- **Horizontal overflow:** none on any screen (document scroll width 411 = viewport 411 everywhere measured).
- **Keyboard:** takes 312 of 794 css px. The search field stays visible. See B2 for the picker.
- **Browser Back:** closes the side panel; in the picker the first Back closes the keyboard and the second closes the sheet; on the scan sheet the first Back dismisses Chrome's prompt and the second closes the sheet; from a book it returns to the results or shelf it came from; from results it returns to the shelf. Back from the account, report, privacy and about pages returns to the shelf with the side panel still open. No trap found.
- **Reload keeps:** saved books, chosen library, shelf/list view, Viewed before. It does not keep library marks (B1). Whether the reading light survives a reload was not checked.
- **Text under 12 px:** "SUGGESTED" tags (11 px); author line on drawn placeholder covers and Viewed before spines (11 px); author names on the landing page's mock covers (8 px).
- **Tap targets under 44 px:** none among the app's buttons (all 44 px or more; "Catalog" 87 x 44, "Choose"/"Change" 62 x 44, view switch 44 x 44 each). On the public pages, in-text links are 17 to 19 px tall: "Find a book instead" (151 x 17), "Browse featured libraries" (172 x 17), "Read the privacy policy" (198 x 19), "Address source" (138 x 19), "Official library website" (181 x 18), "Report a problem with these details" (283 x 19), "Terms" and "Privacy" under Create account (42 x 17, 49 x 17), breadcrumb "Home" (40 x 44).
- **Chrome toolbar** never hides, because the app scrolls inside its own container. The app always has 794 css px.

---

## (b) Library x book: status shown and time

| Library (system) | Book | What the card shows | Screen-reader label | Time | Catalog link goes to | Screenshot |
|---|---|---|---|---|---|---|
| Anna Centenary Library (Koha) | Wings of Fire, A. P. J. Abdul Kalam | Tick in a circle, green tint | "Found in Anna Centenary Library" | 9.1 s | The book's record, over http on a bare IP address | `45-anna-wings-status` |
| Anna Centenary Library (Koha) | Darkstalker, Tui T. Sutherland | Circular arrow, grey tint | "Couldn’t check Anna Centenary Library" | 46.4 s | A keyword search for title and author | `52-anna-darkstalker-couldnt-check` |
| Anna Centenary Library (Koha) | Darkstalker, after one Retry | Same | Same | 45.2 s | Same | `53-anna-darkstalker-retry-checking` |
| PM SHRI Kendriya Vidyalaya No.1 Narimedu Library (e-Granthalaya) | Wings of Fire, A. P. J. Abdul Kalam | Circular arrow, grey tint | "Couldn’t check PM SHRI Kendriya Vidyalaya No.1 Narimedu Library" | 25.3 s | The catalog's front page | `60-kv-wings-status` |
| Burlingame Public Library (BiblioCommons) | Wings of Fire, A. P. J. Abdul Kalam | Tick in a circle, green tint | "Found in Burlingame Public Library" | 3.5 s | The book's record | `67-burlingame-wings-status` |
| Burlingame Public Library (BiblioCommons) | Grandma's Bag of Stories, Sudha Murthy (ISBN 9780143333623) | Short dash, white card | "Not found in Burlingame Public Library" | 5.9 s | A keyword search for the ISBN | `69-burlingame-grandma-status` |

While a check runs the card shows a small spinner, the library name and "Catalog" (pointing at the catalog's front page): `45-anna-chosen-checking`, `60-kv-wings-checking`, `67-burlingame-wings-checking`.

On the shelf and in search results the same answers look like this:

| Answer | Shelf / results |
|---|---|
| Found | Dark green round badge with a building icon on the cover corner (`54-…`, `50-search-anna-settled-bay`, `70-…`) |
| Not found | No mark (`70-…`: Grandma's Bag of Stories) |
| Couldn't check | No mark (`61-shelf-kv-after-couldnt-check`) |
| Not checked yet | No mark |

The same book across the three libraries: Wings of Fire was found at Anna Centenary (9.1 s) and Burlingame (3.5 s) and could not be checked at the e-Granthalaya library (25.3 s).

---

## (c) Findings by severity

### Broken (5)

**B1. The shelf forgets a "found" answer after a reload.**
Wings of Fire showed the found badge on the shelf after its book page answered (`54-shelf-anna-found-badge-bay`, `70-shelf-burlingame-found-and-notfound-bay`). After reloading the shelf the badge was gone, at both Anna Centenary (`49-shelf-anna-after-reload-list`) and Burlingame (`72-shelf-reload-settled`). The `holdings/lookup` call returned 200 both times. Seen for this one book, which has an Open Library work key and no ISBN; I did not test a found book that has an ISBN.

**B2. In the library picker, the field you are typing in goes out of view when the list is long.**
With the keyboard open the visible area is page y 312 to 794. After typing "Chennai" (25 results) and "Burlingame" (8 results) the sheet grew to full height and the field sat at y 229 to 281, above the visible area; the first result began at about y 295, so its top was cut too. `15-picker-city-chennai` shows what was on screen: the list from "Alliance Française" down, no field. With 1 result ("Anna Centenary", `17-picker-name-anna-keyboard`) everything stayed visible. This is measured from `visualViewport` and the field's position and matches the capture; I could not photograph the glass (Incognito).

**B3. Two of three Indian checks ended in "couldn't check" after a long wait.**
Anna Centenary x Darkstalker: 46.4 s, then 45.2 s again on Retry. KV Narimedu x Wings of Fire: 25.3 s (the known e-Granthalaya timeout, confirmed). During the wait the card shows only an 18 px spinner; nothing says how long it may take or that the reader can leave (`51-anna-darkstalker-still-checking-21s`, `60-kv-wings-checking`).

**B4. "Request to add" sends on a single tap, with no confirmation and no undo.**
In the empty state it is the only button (`18-picker-no-match` to `19-picker-request-sent`). After tapping "My library isn’t listed" under real results it appears as the main green button directly below the library the reader was looking for (`58-picker-my-library-isnt-listed`: "PM SHRI Kendriya Vidyalaya No.1 Narimedu Library" and under it "Request to add “Kendriya Vidyalaya Narimedu”"). I sent one by mistake.

**B5. Reloading a book page starts the library check again.**
Wings of Fire had just answered "Found" at Anna Centenary. After a reload the card was on "Checking Anna Centenary Library" and still there 5.7 s later (`47-book-reload-settled`). I left before it finished, so I do not know how long it takes or whether it asks the library again.

### Confusing (18)

**C1. A new reader is never asked to choose a library on the shelf.** The cold shelf says "search in your library" but has no library line and no control (`07-shelf-cold-open`). Search results with no library show covers and nothing else (`11-search-title-results-nolibrary`). The only ways in are "Find my library" on a book page (`13-book-nolibrary-1`) and "Choose" behind the person icon (`08-sidepanel-open`). The landing page's "Find my library" button does open the picker (`77-…`); "Open the app" does not.

**C2. Library status is an icon with no word.** Found is a tick, not found is a short grey dash, couldn't check is a circular arrow, checking is a spinner (`45-anna-wings-status`, `69-burlingame-grandma-status`, `52-anna-darkstalker-couldnt-check`). The words exist only for screen readers. The dash in particular reads as "nothing here yet". The circular arrow is a button (44 x 44) but nothing says "Try again".

**C3. The library name does not look changeable and is not.** On the shelf it is 14 px grey text in a paragraph (`48-shelf-anna-bay`). On the book page the name is plain text inside the card. The only "Change" is behind the person icon (`55-sidepanel-library-chosen`). That is three taps from a book page: Back, person icon, Change.

**C4. On the shelf, "not found", "couldn't check" and "not checked" all look the same: no mark.** `70-shelf-burlingame-found-and-notfound-bay` has one found book, one not found and one never checked; only the first is marked.

**C5. Search results in shelf view are covers only.** No title, author or year (`11-search-title-results-nolibrary`). "Wings of Fire" returns nine covers, eight from one dragon series; a reader has to recognise the cover or switch to list view. Books with no cover get a drawn cover whose text clips (`28-search-misspelt-results`).

**C6. A book cannot be saved from the results.** Rows and covers are links only. Saving takes: open the book, Add to my shelf, Back.

**C7. Suggestions are hard to tell from the reader's own books, and several are odd.**
- They sit on the same shelves and in the same list as saved books, separated only by an 11 px "SUGGESTED" tag or "· Suggested" (`37-shelf-4-books-bay-1`, `33-shelf-3-books-1`).
- Other language: "Ponniyin Selvan" with a Tamil cover on the cold shelf (`07-shelf-cold-open`); "The Jungle Book" with the Spanish cover "El libro de la selva" (`23-shelf-1-book`, `34-suggestion-book-jungle-1`).
- Near-duplicates of a saved book: with the Harry Potter two-book bundle saved, "Harry Potter and the Cursed Child" and "Harry Potter and the Philosopher's Stone" are suggested (`33-shelf-3-books-1`); with The Jungle Book saved, "Tales from The Jungle Book" and "The Jungle Book [adaptation]" (`36-shelf-4-books-list-2`). I did not see an exact duplicate of a saved book.
- Duplicates of each other: "The hidden kingdom [graphic novel]" and "The Hidden Kingdom" together (`59-shelf-kv-chosen`).
- After I only viewed Darkstalker (not saved), the suggestions switched to that series (`59-shelf-kv-chosen`). After I removed The Jungle Book, Jungle Book suggestions stayed (`39-light-Ink-shelf-list`).

**C8. Book search is slow and says only "Searching".** 6.2 s (title), 4.7 s (author), 12.5 s (misspelling), 4.5 s (no results), 2.4 s (ISBN). The misspelling was corrected without telling the reader.

**C9. Settings live behind a person icon.** Library, reading light, report a problem, privacy and about are all under an icon that reads as "account" (`08-sidepanel-open`). There is no Help link in the app, although `/support` exists and explains exactly the things a new reader gets stuck on.

**C10. "On my shelf" removes the book when tapped.** The button looks like a status. There is an Undo for 10 s (`38-remove-book-step`).

**C11. Permission dead ends are terse.** After dismissing the location prompt the picker says "Location unavailable" and nothing else (`64-near-me-dismissed`). The scanner asks for the camera the moment it opens, before the reader sees what it is for (`31-…`); its fallback is fine (`32-scan-permission-dismissed`).

**C12. Author names are inconsistent.** Results for "R. K. Narayan" print "Rasipuram Krishnaswamy Narayan" on every row (`24-search-author-results`); the cold-shelf suggestion for Malgudi Days is labelled "R. K. Narayan". "Tui T. Sutherland" and "Tui Sutherland" both appear (`12-…`).

**C13. "Catalog" means three different places.** The book's record when found; a keyword search when not found or when Anna couldn't check; the catalog's front page for the e-Granthalaya library and while a check is running. The label never changes. Anna Centenary's link is plain http on a bare IP address and Chrome marks it not secure (`46-catalog-record-anna-koha`).

**C14. "Report a problem" is an empty box.** No label, no hint about what to write, no note that the screen, library and book are attached (`42-report-problem`).

**C15. The picker gives no sense of where you are.** Opened from "Change" it does not show the current library (`56-picker-change-library`), has no recent libraries, and there is no way to go back to "none".

**C16. No-results gives one option.** "No books found" and "Scan the barcode" (`30-search-no-results`). Nothing about checking the spelling or trying the author.

**C17. The account card arrives after the first save and sits mid-shelf.** "Take your shelf with you" appears between the suggestions and Viewed before (`23-shelf-1-book`), pushing Viewed before below the fold.

**C18. The book page is thin.** No ISBN (unless found by ISBN), publisher, pages or language; no related books; "Reviews on Goodreads" is a Goodreads search, not the book. A Spanish cover on an English title has no explanation (`34-…`).

### Design polish (14)

**P1.** 11 px text on "SUGGESTED" tags, placeholder-cover authors and Viewed before spines; 8 px author names on the landing page's mock covers.
**P2.** Library names in the picker mix styles: "MOHAMED SATHAK A.J. ACADEMY OF ARCHITECTURE" beside "Mohamed Sathak Engineering College"; "GRT MV" has no place line; some show only "Tamil Nadu" (`16-picker-chennai-list-1..4`).
**P3.** A long library name wraps to two lines beside the view switch and pushes "My shelf" down (`59-shelf-kv-chosen`); it also wraps in the side panel (`62-…`).
**P4.** The found badge sits on the cover's top-right corner and covers part of the cover art (`54-…-bay`).
**P5.** Two toast styles: "See my shelf" is pale green text, "Undo" is white and underlined (`21-book-saved`, `38-remove-book-step`).
**P6.** The search field capitalises the first letter and cuts off a long query with no way to see the rest (`28-search-misspelt-results`, `30-…`).
**P7.** Some suggestion covers are washed out, e.g. Gandhi's "An autobiography" (`48-shelf-anna-bay`).
**P8.** While a search loads, empty skeleton shelves appear above the old shelf content for about 0.8 s (`11-search-title-loading`).
**P9.** In list view a result that is already on the shelf loses its year (`50-search-anna-settled-list`, first row).
**P10.** Shelf list view cuts a long title to one line; two would fit (`33-shelf-3-books-1`).
**P11.** `/libraries` is 6.4 screens of single-column cards with no country jump links; `/privacy` is 12 screens.
**P12.** Public-page text links are 17 to 19 px tall (list above). The header's navigation is hidden on a phone, so Libraries, How it works and About are reachable only from the footer.
**P13.** In-app About shows a commit hash as the version (`44-app-about`).
**P14.** Create account shows no password rules and has no show-password control (`40-account-create`).

### Owner's call-outs, checked

| Call-out | Result | Evidence |
|---|---|---|
| Status shown as icons, not words | Confirmed: tick, dash, circular arrow, spinner | `45-…`, `69-…`, `52-…`, `60-kv-wings-checking` |
| Library name not obviously changeable | Confirmed: plain text on shelf and book page | `48-shelf-anna-bay`, `45-anna-wings-status` |
| No visible "Change library" | Confirmed: only behind the person icon | `55-sidepanel-library-chosen` |
| Profile icon rather than a settings gear | Confirmed | `07-shelf-cold-open`, `08-sidepanel-open` |
| e-Granthalaya checks time out | Confirmed: 25.3 s then couldn't check | `60-kv-wings-status` |
| Suggested book duplicating a shelf book | Near-duplicates seen (bundle vs single volumes; adaptations); no exact duplicate seen | `33-…-1`, `36-…-2` |
| Suggestion in another language | Confirmed: Tamil cover, Spanish cover | `07-…`, `34-…` |

---

## (d) Not tested, and why

- **Device-glass screenshots** (Chrome toolbar, keyboard, permission prompts as images): Chrome blanks screenshots of Incognito tabs. Turning that off needs a Chrome flag, which is a settings change. B2 is therefore measured, not photographed.
- **Landscape:** needs a system rotation setting; not allowed.
- **Pressed and focus states:** only the focused search field and picker field were caught (`09-…`, `15-picker-focused`).
- **Search with a library chosen** for author, ISBN, misspelling and no-results: each would have been another live catalog search. Only the title search was run with a library, and it was a repeat of an earlier query, so its 0.24 s is not a first-time figure.
- **Japanese library (Calil):** check budget spent; Burlingame was the outside-India library.
- **Reading light with a library status on the book page, and after reload:** the light can only be changed from the shelf, and reopening a book would have been another check.
- **A found book that has an ISBN** after reload (B1), and **how the reloaded book-page check ends** (B5).
- **Scanner and "near me" working paths:** permissions were not granted.
- **Account flows, sending a problem report:** not allowed.
- **Privacy page screens 10 to 12** and the in-app privacy page beyond the first screen: not captured.
- **Clear Viewed before:** not pressed.
