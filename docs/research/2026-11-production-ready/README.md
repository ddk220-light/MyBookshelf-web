# Production-ready analysis: end-to-end run as a guest reader

18 November 2026, against `https://mybookshelf.cloud` (commit `d3262e2cd7`).
Backlog items 23 and 24 of
[the production-ready backlog](../../plans/2026-11-18-production-ready-backlog.md).
Nothing in the app was changed.

## What was run

Three walks as a new reader with no account, at the same time:

| Device | Browser | How it was driven | Report | Screenshots |
|---|---|---|---|---|
| Pixel 6 Pro, Android 17 | Chrome 157, Incognito tab | `adb` over Wi-Fi and Chrome remote debugging | [pixel.md](pixel.md) | 148 |
| iPhone 16 Pro Max, iOS 27.2 | Safari, Private tab | WebDriverAgent over Wi-Fi (taps, typing, screenshots; no page inspection) | [iphone.md](iphone.md) | 139 |
| Desktop | Chromium at 1920, 1440, 1280, 1100, 1024 and 700 px wide; one WebKit pass | Playwright | [desktop.md](desktop.md) | 221 screens, 224 control states |

Everything from the run is in this folder:

- **Screenshots:** [screenshots/](screenshots/INDEX.md), 817 files by device
  (`pixel/`, `iphone/`, `desktop/`, `desktop/states/`, `accounts/`), with an
  index. Screenshot names below refer to those folders.
- **Timings:** `pixel-timings.csv`, `iphone-timings.csv`, `desktop-timings.csv`
  (iPhone timings are coarse: polling screenshots). Account-flow timings are in
  the table in [accounts.md](accounts.md).
- **Layout measurements:** `desktop-layout.csv` (window size, screen, page
  height, overflow, cut-off text, smallest font and target).
- **Requests:** `desktop-api-and-asset-requests.csv` (769 requests: path,
  status, time, size, cache headers).
- **Desktop scripts and raw logs:** `desktop-scripts/` (the Playwright scripts
  and `logs/`: console, network, layout detail, control states, tab order).

Left out of the repository, which is public, and kept on the owner's Mac in
`~/mybookshelf-phones/run-2026-11-18/`: six screenshots (the nearby-libraries
result with distances from the owner's location, the camera frame showing the
owner's room, three password-manager screens and one showing another browser's
tabs) and the saved browser states from the desktop run (they hold a library
catalog's session cookie).


The account flows were run afterwards on both phones: see
[accounts.md](accounts.md) (create, verify, sign in on a second phone, sync,
log out, change email, reset password, delete).

Not covered: a Japanese library, Firefox, real desktop Safari, account flows
on desktop, and a few account actions listed at the end of accounts.md.

## Things that went wrong during the run

1. **One junk library request was sent to production.** On the Pixel the
   picker's "Request to add “Zzqqxx”" button was tapped expecting a form; it
   sends at once. The request needs deleting when the real database is found
   (item 20). It is also finding 5.
2. **The iPhone camera came on.** After Cancel was pressed on the camera
   prompt, the scanner showed a live preview, read the barcode of a book lying
   near the phone and opened it. It is not known whether Cancel registered or
   Safari already held a camera permission for the site. Finding 8.
3. **More library checks than planned.** Limits were 8, 8 and 10; used were 8
   (Pixel), 9 and a retry (iPhone) and 10 or 11 (desktop), partly because
   opening an already-marked result sends a new check (finding 6).
4. **Pixel screenshots show the page only.** Chrome blanks device screenshots
   of Incognito tabs, so the Pixel baseline has no browser toolbar, keyboard or
   permission prompts.
5. **"Not found" was not seen on desktop**, so that state is in the phone
   baselines only.

## Library answers seen

| Library | Book | Answer | Time | Device |
|---|---|---|---|---|
| Anna Centenary (Koha) | Wings of Fire, Kalam | Found | under 1.5 s | iPhone |
| Anna Centenary | Wings of Fire, Kalam | Found | 9.1 s | Pixel |
| Anna Centenary | Wings of Fire, Kalam (search results) | Found | 13.8 s after submit | Desktop |
| Anna Centenary | Wings of Fire, Kalam (book page, new visit) | Found | 9.9 s | Desktop |
| Anna Centenary | Darkstalker | Couldn't check | 46.4 s; Retry 45.2 s | Pixel |
| Anna Centenary | Ram - Scion of Ikshvaku | No answer | still checking at 45.9 s | Desktop |
| Anna Centenary | Swami and Friends | Couldn't check, then "Couldn't confirm" after Retry | over 8.5 s; Retry 8.1 s | iPhone |
| Anna Centenary | Grandma's Bag of Stories (by ISBN) | Not found | about 14.3 s | iPhone |
| Anna Centenary | Grandma's Bag of Stories (by ISBN) | "Couldn't confirm" | under 43 s | Desktop |
| KV No.1 Narimedu (e-Granthalaya) | Wings of Fire, Kalam | Couldn't check | 25.3 s | Pixel |
| KV No.1 Narimedu | Wings of Fire, Kalam | Couldn't check | 26.1 s | iPhone |
| KV No.1 Narimedu | Wings of Fire, Kalam | Couldn't check | 25.3 s; Retry 25.2 s | Desktop |
| Burlingame (BiblioCommons) | Wings of Fire, Kalam | Found | 3.4 to 4.9 s | all three |
| Burlingame | Grandma's Bag of Stories (by ISBN) | Not found | 5.9 s | Pixel |
| Burlingame | The Hunger Games (by ISBN) | Found | 9.0 s after submit | Desktop |

The same book and library gave different answers and very different times on
different devices within the hour (Anna Centenary: found in 1.5 s, 9.1 s and
13.8 s; "not found" on one device and "couldn't confirm" on another for the
same ISBN).

Book search with no library: 4.2 to 6.9 s for a query not asked recently
(12.5 s for a misspelling on the Pixel), 0.2 to 0.3 s when repeated.

## Findings, most serious first

"Seen on" lists the devices. "Item" is the backlog item it belongs to, or
"new".

### Broken

1. **Library answers are not kept between visits.** A book found in the library
   shows its mark on the shelf during the visit. After a reload, a library
   change or a new visit, no saved book has a mark, and none appears while
   waiting (25 to 40 s on the iPhone). Opening the book checks the library
   again (8.5 s at Anna Centenary). On desktop `holdings/lookup` was asked 36
   times, answered 200 each time and never produced a mark. Seen on all three.
   Item 20: this is what an app with no working answer store would do, but the
   cause was not investigated in this run.
   `pixel/49`, `pixel/72`, `iphone/26-shelf-after-reload`,
   `desktop/83-shelf-13-library-chosen-*`.
2. **e-Granthalaya checks take 25 to 26 s and end in "couldn't check"**, and
   Retry repeats it exactly. Seen on all three. Item 22.
3. **Anna Centenary is slow and unreliable too.** Two checks ran 45 s or more
   (one ended "couldn't check", one never ended); another gave "couldn't check"
   and then "couldn't confirm". So the problem is not only e-Granthalaya.
   During any wait there is one small spinner and no words, no limit and no
   hint that the reader can leave. Seen on all three. Item 22, widened.
4. **On phones the library picker hides what the reader types and finds.**
   iPhone: Safari's form bar covers the text field and a single result sits
   under the keyboard, so typing a library's name shows an apparently empty
   sheet (`iphone/08-picker-name-anna-centenary`). With many results the
   sheet's title, Close button and field move off the top of the screen on
   both phones (`iphone/08-picker-city-chennai`, `pixel/15-picker-city-chennai`).
   New (item 25).
5. **"Request to add" sends on one tap**, with no confirmation and no undo. It
   sends whatever was typed (a city, a typo), and after "My library isn't
   listed" it is the main button directly under the list. Seen on both phones
   and desktop (not pressed there). New (item 26).
6. **Search results, the book page and the catalog link disagree.**
   - At Burlingame the book page said Wings of Fire was found; a minute later
     the results marked two other books and not that one.
   - Opening a result that already carries the library mark sends a second
     check to the library.
   - A book opened from a marked result links to the catalog's home page; the
     same book opened another way links to its own record.
   Seen on desktop. New (item 27).
7. **A book's status has no words, and there are more states than the app
   explains.** Tick, dash, circular arrow, question mark or spinner in front of
   the library's name; the words exist only for screen readers, with no
   tooltip. The public pages promise three answers; the app has a fourth,
   "Couldn't confirm" (question mark), explained nowhere. On the shelf and in
   results, not found, couldn't check and not checked yet all look the same:
   no mark. Seen on all three. Item 15, which should also cover the shelf, the
   results and the fourth answer.
8. **The iPhone scanner showed a live camera after Cancel** (see above). Needs
   a check by hand before anything is concluded. New (item 28).
9. **Anna Centenary's catalog link is plain HTTP on a bare IP address.** Safari
   shows a full-page "This Connection Is Not Secure" warning first; Chrome
   marks it not secure. The link itself is right (the book's own record).
   Item 15 (catalog links).
10. **A typed ISBN ends up in the address and the browser history**
    (`/app/books/v1:isbn:<number>`). The rule says search text never goes into
    an address; an ISBN is also the book's identity. Owner's decision (open
    question 13).
11. **WebKit refuses a stylesheet on every page** ("Refused to apply a
    stylesheet… style-src"), 7 times, with no visible difference found. New
    (item 29).
12. **The first search for anything is slow**: 4 to 7 s with only "Searching"
    and grey placeholder covers; 13.8 s for the library line to settle at Anna
    Centenary. New (item 30).

### Confusing

13. **A new reader is never asked to choose a library.** The cold shelf says
    "search in your library" and has no library line or control on phones. The
    landing page's "Find my library" opens the picker; "Open the app" does not.
    Item 18.
14. **The library name is not changeable where it is shown.** Plain text on the
    shelf and on the book page. "Change" is behind the person icon on phones,
    a small text link under the name from 1100 px, and a rail icon that looks
    like "home" between 640 and 1099 px. The picker never shows the current
    library and there is no way back to "no library". Item 18.
15. **Settings sit behind a person icon** (phones) or are spread over three
    icons (rail). There is no gear. Item 18.
16. **Search results in shelf view are covers only**: no title, author, year or
    count; editions can be told apart only by the cover. A book cannot be saved
    from the results. New (item 31).
17. **"On my shelf" removes the book when pressed.** It reads as a status. An
    Undo shows for 10 s; a book added back goes to the front. New (item 31).
18. **Suggestions.** They stand on the same shelves as saved books with only a
    small tag. Seen: covers in Tamil, Spanish and Hindi; near-duplicates of
    saved books (a Harry Potter bundle saved, single volumes suggested; Jungle
    Book adaptations); after four R. K. Narayan novels, books on grief and
    language testing; a translator credited as author; a book only viewed, not
    saved, changing them. An exact duplicate of a saved book was not seen.
    The first two are under "Decided against, for now"; this is the evidence
    if the owner wants to look again.
19. **No results and misspellings get no help.** "No books found" offers only
    the barcode scanner. A misspelling was corrected silently on one device and
    returned two records containing the typo on another. When a search finds
    nothing in the library, the "Looking in…" line just disappears. New
    (item 31).
20. **Book details change and differ.** A suggestion opened as "Malgudi Days,
    R. K. Narayan" becomes "Malgudi days, Rasipuram Krishnaswamy Narayan" a
    second later; "Sudha Murthy" where the cover says "Murty"; "First published
    1999" beside a 2021 library record. The book page has no ISBN, publisher or
    related books, and its browser tab is titled "Book details". New (item 32).
21. **"Report a problem" is an empty box and Send**, with no prompt and none of
    the privacy page's advice. Item 14.
22. **Picker results.** "Chennai" gives 25 rows A to Z with no visible count or
    sign that the list is cut; names mix capitals and styles and some rows have
    no city; "Burlingame" lists eight libraries, seven in other cities.
    "Location unavailable" gives no next step. Item 25.
23. **"Catalog" means three places**: the book's record, a keyword search, or
    the catalog's front page, under the same label. Item 15.
24. **"Viewed before" repeats every saved book** as a spine with cut titles and
    sits below the fold. The account card appears mid-shelf after the first
    save. Item 19 (shelf and account design).
25. **The help page describes the phone layout** ("the person icon", "tap the
    barcode button") and there is no Help link inside the app on phones. Item
    12.

### Design polish

26. **No hover state** on book, suggestion and result covers, list rows,
    "Viewed before" spines, "Create account", "Log in" and most landing-page
    links; **no pressed state** on anything but two buttons. Keyboard focus is
    visible everywhere. The full table is in [desktop.md](desktop.md), finding
    29.
27. **Small touch targets** on public pages and Back links (17 to 20 px high);
    "Catalog" on the book page is 52 x 18 pt. In-app controls are 44 px.
28. **Small text**: 11 px on "Suggested" tags and spine authors; 8 px on the
    landing page's mock covers.
29. **Wide and narrow windows.** At 1920 px six covers stand 261 px apart with
    the search bar at the far left; with a book open, 252 px of shelf remain at
    1100 px and a 28 px strip at 700 px. iPhone landscape: the header fills
    most of the height.
30. **The app's fonts weigh 434 KB** (TTF) against 175 KB of script and styles;
    the landing page already uses WOFF2.
31. **A dark system setting is ignored** (Daylight is shown), and "Ink" is a
    light theme. On the iPhone Safari's top strip lags one theme behind.
32. **Two wordmarks** ("myBookshelf" on public pages, "MyBookshelf" in the app);
    the app's is not a link, so there is no way from the app to the public
    pages. "Open the app ↗" opens in the same tab.
33. **Smaller things**: touched rows stay highlighted on the iPhone; Safari
    offers "AutoFill Contact" on the library field; the "Less" button overlaps
    a heading; the Undo notice covers a link; two toast styles; a long library
    name wraps beside the view switch; the found badge covers cover art; the
    search field cuts a long query; in-app About shows a commit hash; Tab order
    reaches the search field eleventh at 1440 px.

### Checked and fine

- No horizontal overflow on any screen at any width; no layout shift to speak
  of (0.0003).
- No console errors or failed app requests in Chromium over the whole run.
- The app shell is fast: first paint 232 ms, 60 ms on reload; documents and
  assets come from the CDN.
- No zoom on focusing a field on the iPhone; toasts and the shelf clear
  Safari's bottom bar.
- Reload keeps the library, saved books and reading light. Back closes
  overlays one step at a time and returns to results with the query kept.
- Browser storage held no search text, and the address did not change during
  title or author searches.
- Create account and Log in screens open; nothing was submitted.

## The owner's call-outs

| Call-out | Result |
|---|---|
| Status as icons, not words (item 15) | Confirmed on all three; also a fourth answer and unmarked states (finding 7) |
| Library name not obviously changeable; no visible "Change library" (item 18) | Confirmed (finding 14) |
| Profile icon, no settings gear (item 18) | Confirmed (finding 15) |
| e-Granthalaya timing out (item 22) | Confirmed, 25 to 26 s every time; Anna Centenary also failed twice (findings 2, 3) |
| A suggestion duplicating a saved book | Not reproduced as an exact duplicate; near-duplicates seen (finding 18) |
| A suggestion in another language | Confirmed (finding 18) |
