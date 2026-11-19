# MyBookshelf on a Pixel 6 Pro: re-test of the new release, 19 November 2026

Device: Pixel 6 Pro, Android 17, Chrome 157, over Wi-Fi. Site: https://mybookshelf.cloud, commit `d733e92255` (the footer's "Source code" link carries that hash; `/api/health` said `"catalogStore":"ok"`).
Compared with the 18 November walk of commit `d3262e2cd7` (`docs/research/2026-11-production-ready/pixel.md` and `README.md` at `8966ab829b`).
Session: one **regular** Chrome tab (tab id 10769). Page viewport 411 x 794 css px (411 x 770 on the public pages), device pixel ratio 3.5. With the keyboard open the page is 458 css px tall (the keyboard takes 336).
Files in this folder: 235 screenshots, `timings.csv` (70 rows), this file.

## How the screenshots were made

- Every screenshot is a **device screenshot** (`adb screencap`, scaled to 720 x 1560). They show Chrome's bars, the keyboard and Chrome's permission prompts. None had to be taken through the debugging port.
- Names follow the 18 November set where the screen is the same (`07-shelf-cold-open`, `15-picker-city-chennai`, `45-anna-wings-status` and so on). New screens have new names or a letter after the number (`22b-…`, `56b-…`).
- Shots named `…-checking` were taken 3 s after the tap; for fast answers they already show the answer.
- Taps and typing were real touches and key events. Long public pages were scrolled by script between shots.
- Times come from a 50 ms page poll that starts on the tap or the Enter key, and from a wrapper that recorded the path, status and duration of each request (no request bodies, no search text).

## Short version

- The big items are fixed on this phone: library answers are stored and come back in a fifth of a second, a reloaded book page no longer checks again, the answer is in words, the picker keeps its field and results above the keyboard, the request form needs a Send, the library row has Change, there is a gear, a first-visit prompt, captions under results, a separate Remove, and book titles in the tab.
- Not fixed: the e-Granthalaya library (5 checks, all "Couldn't check right now" after 25 to 26 s) and Anna Centenary's slow checks (3 of 6 checks ended "couldn't check" after 40 to 46 s). The waiting card's promise that "the answer will be there when it arrives" did not come true for any of them within 25 minutes.
- New problems worth fixing before calling this done: the shelf drops the stored answers of books that were opened by ISBN after a reload; after Remove and choosing a library again the shelf shows no answers until a reload; a long library name is drawn over the "My library" label; a long title in list view runs off the screen.

---

## (a) Every earlier finding that applies to a phone

Verdicts: **fixed**, **partly fixed**, **not fixed**, **worse**, **could not check**. Screenshot names are in this folder.

### Combined findings (README 1 to 33)

| # | Earlier finding | Verdict | Evidence | Screenshots |
|---|---|---|---|---|
| 1 | Library answers are not kept between visits | partly fixed | Found and not-found answers came back at once after a reload, a library change, and in a browser with cleared storage (Wings of Fire at Anna Centenary: "In your library" 0.2 s after choosing the library, from `holdings/lookup`, no check). But books opened by ISBN lost their shelf answer after a reload in 3 of 4 cases, and after Remove + choose again no answer showed until a reload (new problems N1, N2) | `48-shelf-anna-bay`, `49-shelf-anna-after-reload-list`, `72-shelf-reload-settled`, `80b-…` |
| 2 | e-Granthalaya checks take 25 to 26 s and end "couldn't check" | not fixed | KV No.1 Narimedu: Wings of Fire 26.3 s, Darkstalker 25.2 s, Grandma's Bag of Stories 25.2 s, The Hunger Games 26.4 s, Wings of Fire again 3 minutes later 25.5 s. All "Couldn't check right now". No stored answer 25 minutes later either | `60-kv-wings-status`, `60-kv-…-status`, `61-shelf-kv-all-couldnt-check`, `84-late-answers-kv` |
| 3 | Anna Centenary is slow and unreliable; the wait has no words | partly fixed | The wait now has a card with words and a moving bar. Results: Darkstalker "couldn't check" after 40.6 s, then "Not in your library" 6.5 s after Try again; Swami and Friends "couldn't check" twice (45.8 s, 40.1 s); Grandma's Bag of Stories not found in 14.1 s; The Hunger Games found in 10.9 s | `51-anna-darkstalker-checking`, `52-…`, `53-…`, `57-anna-swami-answer`, `57-anna-swami-second-look` |
| 4 | On phones the picker hides what the reader types and finds | fixed | Pixel only. With the keyboard open and 25 results for "Chennai": title at y 34, field at y 109 to 158, first result at y 202 to 262, visible area 0 to 458. Seen in the device screenshot too. Same for 1 result, 8 results and no match | `15-picker-city-chennai`, `17-picker-name-anna-keyboard`, `18-picker-no-match`, `65-picker-burlingame` |
| 5 | "Request to add" sends on one tap | fixed | The button opens a form ("Ask us to add a library"); no request left the phone until "Send request" (request log empty, then one `POST library-requests` 202) | `19-picker-request-form-open`, `19-picker-request-sent` |
| 6 | Results, the book page and the catalog link disagree | fixed | Seen once. At Burlingame the results marked the same books the book pages had found (Wings of Fire, Darkstalker) plus two more. Opening a marked result (The Dragonet Prophecy) sent no check and linked to the book's own record | `68-search-burlingame-settled`, `68-burlingame-marked-result-opened-status` |
| 7 | Status has no words; a fourth unexplained answer; unmarked states | partly fixed | Book page and shelf say "In your library", "Not in your library", "Couldn't check right now" / "Couldn't check". The old "Couldn't confirm" is now "Couldn't check right now" with its own sentence. In search results only books that already have an answer carry words; unfound books carry nothing, and at the e-Granthalaya library the results show no words at all (N10) | `45-anna-wings-status`, `55-anna-grandma-answer`, `36-shelf-4-books-list-1`, `50-search-anna-settled-list`, `62-search-kv-results` |
| 8 | iPhone scanner showed a live camera after Cancel | could not check | iPhone only. On the Pixel: prompt dismissed with Back gave no video and an "Allow camera" button; after "Allow this time" the camera ran; closing the scanner turned it off (Android's camera pill gone) | `32-scan-permission-dismissed`, `32c-scan-camera-live`, `32d-scan-closed-camera-off` |
| 9 | Anna Centenary's catalog link is plain HTTP on a bare IP address | partly fixed | Still `http://118.185.210.241:8001/…`; the card now says "This catalog does not use a secure connection." Chrome showed a warning triangle in the address bar and no full-page warning | `45-anna-wings-status`, `46-catalog-record-anna-koha` |
| 10 | A typed ISBN ends up in the address and history | not fixed | `/app/books/v1%3Aisbn%3A<number>` for both ISBN searches (owner's open decision) | `25-search-isbn-book-page` |
| 11 | WebKit refuses a stylesheet | could not check | Not a Chrome matter | – |
| 12 | The first search for anything is slow | partly fixed | New queries: 4.0 s, 1.8 s, 1.2 s, 2.5 s (was 4.2 to 6.9 s); misspelling 3.0 s (was 12.5 s); repeat 0.16 s. But a repeated query took 5.7 s once with Anna Centenary chosen, and the library line took 6.4 s and 10.1 s to settle there | `timings.csv`, `50-search-anna-loading` |
| 13 | A new reader is never asked to choose a library | fixed | Cold shelf has a "Choose your library" card with "Find my library" and "Not now" | `07-shelf-cold-open` |
| 14 | The library name is not changeable where it is shown | fixed | Shelf row: icon, "My library", the name (a link to the catalog) and "Change". Book card: "Change library". The picker shows "Your library now" with "Remove". Gaps: N7, N9 | `48-shelf-anna-bay`, `45-anna-wings-status`, `56-picker-change-library` |
| 15 | Settings sit behind a person icon | fixed | Gear, labelled "Settings": My library, Account, Reading light, Help and about | `08-sidepanel-open` |
| 16 | Results are covers only; a book cannot be saved from results | partly fixed | Title, author and year under every cover. Still no way to save from the results (the plan says this was decided) | `11-search-title-results-nolibrary` |
| 17 | "On my shelf" removes the book when pressed | fixed | "On my reading shelf" is a status line; "Remove from my reading shelf" is a separate text button; Undo for 10 s | `21-book-saved`, `38-remove-book-step` |
| 18 | Suggestions: same shelves, other languages, near-duplicates | not fixed | Still on the same shelves and in the same list ("SUGGESTED" tag, "· Suggested"). Tamil cover (Ponniyin Selvan) on the cold shelf; Spanish cover on The Jungle Book; with Wings of Fire books saved, two more books of that series suggested; "Victorian quest romance" by "Fraser, Robert" after Ishiguro novels. No exact duplicate of a saved book seen. The tag is now 12 px | `07-shelf-cold-open`, `23-shelf-1-book`, `56c-…`, `79-shelf-10-books-bay-3`, `80-shelf-10-books-burlingame-list-2` |
| 19 | No results and misspellings get no help; "Looking in…" just disappears | partly fixed | "No books found" now lists three things to try, the scanner and "Tell us". The misspelling was still corrected with no "showing results for" line. When nothing is found in the library the "Looking in…" line still just disappears | `30-search-no-results-results`, `28-search-misspelt-results`, `56-search-swami-results` |
| 20 | Book details change and differ; tab says "Book details" | partly fixed | The tab shows the book's title. Title and author stayed as opened in every book I watched (10 books). Still: "Sudha Murthy" beside a cover that says "Murty"; "First published 2001" for The Buried Giant; no publisher or related books; ISBN shown only for books found by ISBN | `25-search-isbn-book-page`, `38-remove-book-step` |
| 21 | "Report a problem" is an empty box and Send | fixed | Prompt, example text, "Sent with your message: the screen you were on (Reading shelf) and your library (…)", optional name and email, advice about passwords | `42-report-problem` |
| 22 | Picker results: no count, mixed styles, rows without a city, eight libraries for "Burlingame", terse location message | partly fixed | New: "Showing 25 of 35 libraries that match" and "Show 10 more"; "Location unavailable. Type your city or library name instead." Unchanged: capitals mixed ("MOHAMED SATHAK A.J. ACADEMY OF ARCHITECTURE"), "GRT MV" with no place, several with only "Tamil Nadu", 8 libraries for "Burlingame" | `15-picker-city-chennai`, `16-picker-chennai-list-1..3`, `64-near-me-dismissed`, `65-picker-burlingame` |
| 23 | "Catalog" means three places | partly fixed | Labels now say where they go: "See this book in the library's catalog" (the record), "Search the library's catalog yourself" (a search), "Open the library's catalog instead" (front page, while checking). "Open catalog" on a couldn't-check card is still a keyword search at Anna Centenary and Burlingame and the front page at the e-Granthalaya library | `45-…`, `55-anna-grandma-answer`, `52-…`, `60-kv-wings-status` |
| 24 | "Viewed before" repeats every saved book; the account card sits mid-shelf | not fixed | Ten saved books, the same ten as spines with cut titles; "Take your reading shelf with you" still sits between suggestions and Viewed before | `79-shelf-10-books-bay-3`, `73-shelf-bottom-account-card-viewed-before` |
| 25 | Help describes only the phone; no Help link in the app | fixed | `/support` now covers phones and computers and the new wording; Settings has "How MyBookshelf works" (it opens that public page) | `75-support-1..4`, `08-sidepanel-open` |
| 26 | No hover or pressed states | could not check | No hover on a phone; pressed states were not captured | – |
| 27 | Small touch targets on public pages and Back links | partly fixed | Footer links are now 44 px high and nothing in the app's main controls is under 44 px. Still small: "privacy policy" in the request and report forms (87 x 15), "Address source" (138 x 19), "Official library website" (181 x 18), "Terms" / "Privacy" / "Log in" under Create account (17 to 18 px high), email links (19 px), breadcrumb "Home" (40 x 44) | measured on each page |
| 28 | Small text (11 px, 8 px) | fixed | No visible text under 12 px on any screen measured (shelf, results, book, picker, settings, report, privacy, account entry, About, How it works, Help, Libraries, guide, Privacy) | measured |
| 29 | Wide and narrow windows | could not check | Desktop and landscape | – |
| 30 | The app's fonts weigh 434 KB | partly fixed | Two WOFF2 files, 210 KB and 128 KB (338 KB) | measured |
| 31 | A dark system setting is ignored; "Ink" is light | not fixed | The phone is in dark mode (`prefers-color-scheme: dark` is true); the app opened in Daylight. The public pages do follow dark, so About and Help opened from Settings switch from a light app to dark pages | `07-shelf-cold-open`, `03-about-1`, `44-app-about` |
| 32 | Two wordmarks; the app's is not a link | fixed | "MyBookshelf" in both; the app's wordmark links to `/about`; public pages say "Open my reading shelf" | `03-about-1`, `07-shelf-cold-open` |
| 33 | Smaller things | partly fixed | Still there: two notice styles (pale green "See my reading shelf", white underlined "Undo"); the found badge covers the cover's corner; the search field cuts a long query. Worse: the long library name (P3). Gone: the commit hash in About. Not checked: "Less" overlapping a heading, the Undo notice covering a link | `21-book-saved`, `38-remove-book-step`, `59-shelf-kv-chosen-after-25s` |

### Pixel report items (B, C, P)

| # | Earlier finding | Verdict | Evidence | Screenshots |
|---|---|---|---|---|
| B1 | The shelf forgets a "found" answer after a reload | partly fixed | Kept for Wings of Fire and Darkstalker (work-key books) at Anna Centenary and Burlingame. Lost for The Hunger Games (found) at Burlingame and Grandma's Bag of Stories (not found) at both, all opened by ISBN, although their book pages still had the stored answer in 0.14 s | `49-shelf-anna-after-reload-list`, `49c-…`, `72-shelf-reload-settled`, `47b-book-reload-isbn-burlingame` |
| B2 | The picker field goes out of view when the list is long | fixed | See README 4 | `15-picker-city-chennai` |
| B3 | Two of three Indian checks ended "couldn't check" after a long wait, with only a spinner | partly fixed | The wait is explained. The outcomes are not better: 5 of 5 at the e-Granthalaya library and 3 of 6 at Anna Centenary ended "couldn't check" (25 to 46 s) | `60-kv-wings-checking`, `57-anna-swami-answer` |
| B4 | "Request to add" sends on a single tap | fixed | See README 5 | `19-…` |
| B5 | Reloading a book page starts the check again | fixed | After a reload the card read "In your library" when first looked at (1.2 s); `holdings/check` returned in 0.16 s. Same for an ISBN book at Burlingame | `47-book-reload-early`, `47-book-reload-settled`, `47b-…` |
| C1 | A new reader is never asked to choose a library on the shelf | fixed | First-visit card | `07-shelf-cold-open` |
| C2 | Library status is an icon with no word | fixed | Words on every card; "Try again" is a text button | `45-…`, `52-…`, `55-anna-grandma-answer` |
| C3 | The library name does not look changeable and is not | fixed | Row with "Change"; "Change library" on found cards; "Try another library" on not-found cards | `48-shelf-anna-bay` |
| C4 | On the shelf, not found, couldn't check and not checked look the same | fixed | "In your library", "Not in your library", "Couldn't check" under covers and in list rows; nothing under a book not yet checked. "Couldn't check" lasts for the visit only | `36-shelf-4-books-list-1`, `61-shelf-kv-all-couldnt-check`, `70-…` |
| C5 | Search results in shelf view are covers only | fixed | Captions under covers. New polish problem N15 | `11-search-title-results-nolibrary` |
| C6 | A book cannot be saved from the results | not fixed | Results are still links only (decided, per the plan) | `12-search-title-list-nolibrary-1` |
| C7 | Suggestions are hard to tell from saved books, and several are odd | not fixed | See README 18. Saved books now carry a library answer under them when there is one, which helps a little; a saved book with no answer and a suggestion still differ only by the tag | `59-shelf-kv-chosen-after-25s` |
| C8 | Book search is slow and says only "Searching" | partly fixed | Faster (README 12). While loading the screen shows empty placeholder covers and no visible word; the misspelling is still corrected silently | `11-search-title-loading`, `78-search-first-time-loading` |
| C9 | Settings live behind a person icon; no Help link | fixed | Gear; Help link | `08-sidepanel-open` |
| C10 | "On my shelf" removes the book when tapped | fixed | See README 17 | `21-book-saved` |
| C11 | Permission dead ends are terse | partly fixed | Location: now gives a next step. Camera: Chrome's prompt still appears the moment the scanner opens, before the reader sees the scanner | `64-near-me-dismissed`, `31-scan-screen-before-permission` |
| C12 | Author names are inconsistent | not fixed | "Rasipuram Krishnaswamy Narayan", "R. K. Narayan", "Rasupuram K. Narayan" and "R k Narayanan" in the same results; "Tui T. Sutherland" and "Tui Sutherland" | `56-search-swami-results`, `62-search-kv-results`, `50-search-anna-settled-list` |
| C13 | "Catalog" means three different places | partly fixed | See README 23 | – |
| C14 | "Report a problem" is an empty box | fixed | See README 21 | `42-report-problem` |
| C15 | The picker gives no sense of where you are | fixed | "Change library", "Your library now … Remove". No recent libraries | `56-picker-change-library` |
| C16 | No-results gives one option | fixed | Three things to try, scan, "Tell us" | `30-search-no-results-results` |
| C17 | The account card arrives after the first save and sits mid-shelf | not fixed | Same place after the first save | `23-shelf-1-book-scroll-1` |
| C18 | The book page is thin | not fixed | Same content: no publisher, pages, language or related books; "Reviews on Goodreads" unchanged; Spanish cover on The Jungle Book with no explanation | `13-book-nolibrary-1..2`, `34-suggestion-book-jungle-1` |
| P1 | 11 px and 8 px text | fixed | See README 28 | – |
| P2 | Library names in the picker mix styles | not fixed | See README 22 | `16-picker-chennai-list-1..3` |
| P3 | A long library name wraps beside the view switch | worse | "PM SHRI Kendriya Vidyalaya No.1 Narimedu Library" now takes three lines and its first line is drawn over the "My library" label. "Burlingame Public Library" takes two lines and touches the label (label y 130 to 147, name y 137 to 181) | `59-shelf-kv-chosen-after-25s`, `61-shelf-kv-all-couldnt-check`, `72-shelf-reload-settled` |
| P4 | The found badge covers part of the cover art | not fixed | Same 28 px badge on the corner, now with the words below | `48-shelf-anna-bay` |
| P5 | Two toast styles | not fixed | `21-book-saved` against `38-remove-book-step` | – |
| P6 | The search field capitalises the first letter and cuts off a long query | not fixed | The long query is still cut (text 301 px wide in a 217 px field). Capitalising could not be checked: text was typed with key events, which skip the keyboard's capitalising | `28-search-misspelt-results` |
| P7 | Some suggestion covers are washed out | not fixed | Gandhi's "An autobiography" again | `23-shelf-1-book` |
| P8 | Skeleton shelves appear above the old shelf content while loading | fixed | The two loading screenshots I looked at show placeholder covers only | `11-search-title-loading`, `78-search-first-time-loading` |
| P9 | In list view a result already on the shelf loses its year | not fixed | Saved Wings of Fire and Darkstalker have no year in the Burlingame results, in both views (earlier in the run Darkstalker still had its year right after being saved) | `68-search-burlingame-settled`, `50-search-anna-settled-list` |
| P10 | Shelf list view cuts a long title to one line | worse | The 21-word title is still on one line and now runs off the right edge of the screen with no "…"; its row is 881 px wide in a 411 px screen (clipped, no sideways scroll) | `79-shelf-10-books-list-1` |
| P11 | `/libraries` is 6.4 screens with no jump links; `/privacy` is 12 screens | not fixed | `/libraries` 4919 px, same; `/privacy` 11233 px (14.6 screens) | `04-libraries-1..7`, `06-privacy-1..9` |
| P12 | Public-page text links are 17 to 19 px tall; header navigation hidden on a phone | partly fixed | Footer links 44 px. Header links still hidden at this width (only the wordmark and "Open my reading shelf"); in-text links still 15 to 19 px | `03-about-1` |
| P13 | In-app About shows a commit hash as the version | fixed | About is now the public page; no version line | `44-app-about` |
| P14 | Create account shows no password rules and no show-password control | fixed | Eye button ("Show password"); "What happens next" list. Nothing was typed | `40-account-create`, `41-account-login` |

### Tally (70 rows: 33 combined + 37 Pixel)

| Verdict | Combined 1 to 33 | Pixel B/C/P | Total |
|---|---|---|---|
| fixed | 11 | 17 | 28 |
| partly fixed | 13 | 6 | 19 |
| not fixed | 5 | 12 | 17 |
| worse | 0 | 2 | 2 |
| could not check | 4 | 0 | 4 |
| all | 33 | 37 | 70 |

Many rows are the same problem counted in both lists (for example README 5 and B4).

---

## (b) Library x book: words shown and time, new and old

Time is from the card first saying "Checking your library…" to the answer (the `holdings/check` request). "Stored" means the answer was on screen at once and the request came back in about 0.2 s.

| Library | Book | 19 November: words on the book page | 19 Nov time | Catalog link (label → where) | 18 November (Pixel unless said) | Screenshot |
|---|---|---|---|---|---|---|
| Anna Centenary (Koha) | Wings of Fire, Kalam | "In your library" | stored: shown 28 ms after the tap; on the shelf 0.2 s after choosing the library | "See this book in the library's catalog" → `opac-detail.pl?biblionumber=497990` (the record, http) | tick, 9.1 s | `45-anna-wings-status` |
| Anna Centenary | Darkstalker | "Couldn't check right now … did not answer in time. This does not mean the book is missing." | 40.6 s | "Open catalog" → keyword search for title and author | circular arrow, 46.4 s | `52-anna-darkstalker-answer` |
| Anna Centenary | Darkstalker, one Try again | "Not in your library" | 6.5 s | "Search the library's catalog yourself" → the same keyword search | circular arrow again, 45.2 s | `53-anna-darkstalker-retry-answer` |
| Anna Centenary | Grandma's Bag of Stories (ISBN) | "Not in your library" | 14.1 s | "Search the library's catalog yourself" → ISBN search | iPhone: not found, about 14.3 s; desktop: "couldn't confirm" | `55-anna-grandma-answer` |
| Anna Centenary | Swami and Friends | "Couldn't check right now" | 45.8 s | "Open catalog" → keyword search | iPhone: couldn't check, over 8.5 s | `57-anna-swami-answer` |
| Anna Centenary | Swami and Friends, second look 3 min later | "Couldn't check right now" | 40.1 s | same | iPhone retry: "couldn't confirm", 8.1 s | `57-anna-swami-second-look` |
| Anna Centenary | The Hunger Games (ISBN) | "In your library" | 10.9 s | "See this book…" → `opac-detail.pl?biblionumber=53266` | not run | `58-anna-hunger-answer` |
| KV No.1 Narimedu (e-Granthalaya) | Wings of Fire, Kalam | "Couldn't check right now" | 26.3 s | "Open catalog" → the catalog's front page | circular arrow, 25.3 s | `60-kv-wings-status` |
| KV No.1 Narimedu | Wings of Fire, second look 3 min later | "Couldn't check right now" | 25.5 s | same | desktop retry 25.2 s | `60-kv-wings-second-look-status` |
| KV No.1 Narimedu | Darkstalker | "Couldn't check right now" | 25.2 s | same | not run | `60-kv-darkstalker-status` |
| KV No.1 Narimedu | Grandma's Bag of Stories (ISBN) | "Couldn't check right now" | 25.2 s | same | not run | `60-kv-grandma-status` |
| KV No.1 Narimedu | The Hunger Games (ISBN) | "Couldn't check right now" | 26.4 s | same | not run | `60-kv-hunger-status` |
| KV No.1 Narimedu | Swami and Friends | not run (four identical time-outs; spared the catalog) | – | – | not run | – |
| Burlingame (BiblioCommons) | Wings of Fire, Kalam | "In your library" | stored: on the shelf 0.14 s after choosing the library | "See this book…" → `/v2/record/S76C3452801` | tick, 3.5 s | `67-burlingame-wings-status` |
| Burlingame | Darkstalker | "In your library" | 1.4 s | "See this book…" → `/v2/record/S76C2424872` | not run | `67-burlingame-darkstalker-status` |
| Burlingame | Grandma's Bag of Stories (ISBN) | "Not in your library" | 2.1 s | "Search the library's catalog yourself" → ISBN keyword search | dash, 5.9 s | `69-burlingame-grandma-status` |
| Burlingame | Swami and Friends | "Couldn't check right now … The library's catalog answered, but we could not tell whether it has this book." (no Try again) | 2.2 s | "Open catalog" → keyword search | not run | `69-burlingame-swami-status` |
| Burlingame | The Hunger Games (ISBN) | "In your library" | 0.8 s | "See this book…" → `/v2/record/S76C3673851` | desktop: found, 9.0 s after submit | `69-burlingame-hunger-status` |
| Burlingame | The Buried Giant (extra) | "Couldn't check right now … could not tell" | 3.0 s | "Open catalog" → keyword search | – | `81-burlingame-buried-giant-status` |
| Burlingame | The Jungle Book (a suggestion, extra) | "Couldn't check right now … could not tell" | 6.3 s | "Open catalog" → keyword search | – | `34-suggestion-book-jungle-status` |

**The waiting card** (`51-anna-darkstalker-checking`, `60-kv-wings-checking`): "Checking your library…", the library's name, a moving bar, "This library's catalog can take up to a minute to answer. You can go back to your reading shelf: the answer will be there when it arrives." (Anna Centenary; "up to half a minute" at the e-Granthalaya library and Burlingame), and "Open the library's catalog instead" → the catalog's front page. At Anna Centenary every card also says "This catalog does not use a secure connection."

**The same answers in search results**

| Library | Search | What the results showed | Time for the library line | Screenshot |
|---|---|---|---|---|
| Anna Centenary | Wings of Fire | "In your library" under Kalam's book only; nothing under the other eight; hidden summary "9 books. 1 book in Anna Centenary Library". After Darkstalker's book page answered, its result said "Not in your library" | 10.1 s (0.74 s on 18 Nov, repeated query) | `50-search-anna-settled-list`, `54-results-after-darkstalker-notfound` |
| Anna Centenary | Swami and Friends | No words under any of 9 books; "Looking in Anna Centenary Library…" then gone | 6.4 s | `56-search-swami-results` |
| KV No.1 Narimedu | Malgudi Days | No words under any book; the "Looking in…" line was up for 0.1 s | 0.1 s | `62-search-kv-results` |
| Burlingame | Wings of Fire | "In your library" under 4 of 9 (Darkstalker, Kalam's Wings of Fire, The Dragonet Prophecy, The Hidden Kingdom) | 0.7 s | `68-search-burlingame-settled` |

**The same answers on the shelf**

| Answer | 19 November | 18 November |
|---|---|---|
| Found | Green building badge on the cover corner plus "In your library" under the cover / in the list row | Badge only, and only until a reload |
| Not found | "Not in your library" | No mark |
| Couldn't check | "Couldn't check" (for this visit; gone after a reload) | No mark |
| Not checked yet | Nothing. The shelf does not check by itself (N6) | No mark |

**Stored answers (step 5), from the request log**

| Action | Requests seen | Result |
|---|---|---|
| Choose Anna Centenary with Wings of Fire saved (fresh browser) | `holdings/lookup` x2, no `holdings/check` | "In your library" in 0.2 s |
| Open that book | `holdings/check`, back in 0.20 s | Answer on screen 28 ms after the tap |
| Reload the book page | `holdings/check`, back in 0.16 s | Answer on screen when first read at 1.2 s |
| Reload the shelf at Anna Centenary (4 books) | `holdings/lookup` x2 | Wings of Fire and Darkstalker kept; Grandma's Bag of Stories (ISBN) lost; Swami (couldn't check) gone, as designed |
| Reload the shelf at Burlingame (5 books) | `holdings/lookup` x2 | Wings of Fire, Darkstalker kept; The Hunger Games and Grandma's Bag of Stories (both ISBN) lost |
| Anna → KV → Burlingame → Anna → Burlingame | `holdings/lookup` only each time | Stored answers back in 0.14 to 0.23 s, with the same ISBN gaps (The Hunger Games did come back at Anna Centenary, not at Burlingame) |
| Open The Hunger Games again at Burlingame | `holdings/check`, back in 0.15 s | "In your library" at once: the answer is stored, the shelf just does not show it |

Whether a `holdings/check` that returns in 0.15 to 0.2 s reached the library is inferred from the time (a live check took 0.8 s at the fastest); I cannot see the server.

---

## (c) New problems in this build

### Broken

**N1. After a reload, the shelf drops the answers of books that were opened by ISBN.**
Grandma's Bag of Stories ("Not in your library" at Anna Centenary and Burlingame) and The Hunger Games ("In your library" at Burlingame) had words under them, and lost them on reload and on coming back from another library. Their book pages still answered in 0.14 to 0.15 s, so the answer is stored. Wings of Fire, Darkstalker and The Dragonet Prophecy (Open Library work addresses) kept theirs. One exception: The Hunger Games did keep "In your library" at Anna Centenary. Seen on two reloads at Anna Centenary and one at Burlingame.
`49-shelf-anna-after-reload-list`, `49b-…`, `49c-shelf-anna-second-reload`, `72-shelf-reload-settled`, `73b-shelf-back-at-burlingame`.

**N2. After "Remove" and choosing a library again, the shelf shows no answers until the page is reloaded.**
Change → Remove → choose Burlingame again: `holdings/lookup` ran and returned 200, and no book showed an answer (waited 25 s the first time, 6 s the second). After a reload three books said "In your library". Seen 2 times out of 2 (once choosing through Settings, once straight in the picker).
`80b-shelf-10-books-burlingame-no-answers`, `80c-shelf-after-remove-and-choose-again`.

**N3. A long library name is drawn over the "My library" label.** See P3 above. `59-shelf-kv-chosen-after-25s`.

**N4. A long title in the shelf's list view runs off the screen.** See P10 above. `79-shelf-10-books-list-1`.

### Confusing

**N5. "The answer will be there when it arrives" did not come true.** Swami and Friends at Anna Centenary (two checks) and three books at the e-Granthalaya library still had no stored answer when I looked again with a fresh shelf 25 to 30 minutes later (`holdings/lookup` only, no new check). I cannot see the server, so I do not know whether the late check ran or failed. `84-late-answers-anna`, `84-late-answers-kv`.

**N6. The shelf never checks a book by itself.** After choosing a library, five saved books sat with nothing under them and no request to the library went out in 25 s; each book has to be opened. The Help page says "Choose another library and the books are checked again." A new reader who saves books first and picks a library second sees a shelf that says nothing. `59-shelf-kv-chosen-after-25s`.

**N7. At Burlingame 3 of 8 books ended "Couldn't check right now … The library's catalog answered, but we could not tell whether it has this book."** Swami and Friends, The Buried Giant and The Jungle Book. The heading is the same as for a time-out, there is no "Try again", and the card has no "Change library". On the shelf it reads "Couldn't check". `69-burlingame-swami-status`, `81-burlingame-buried-giant-status`, `34-suggestion-book-jungle-status`.

**N8. The keyboard opens when returning to the shelf.** "Back to my reading shelf" put the cursor in the search field and raised the keyboard over the lower half of the shelf in 3 of 5 returns (not after every route; I did not find the rule). The ✕ in the search field does the same every time. `22b-back-to-shelf-keyboard-opens`, `62b-back-to-shelf-keyboard-opens-again`.

**N9. After "Not now" or "Remove" the shelf has no library control at all.** The prompt does not come back and there is no "Choose a library" row; the only ways are the gear or a book page. `07b-shelf-cold-after-not-now`, `56c-shelf-no-library-after-remove`, `84-shelf-3-books-no-library-no-prompt`. After "Remove" the picker also stays open as "Find your library" (`56b-library-removed`).

**N10. Search results say nothing for books the library does not have or could not be asked about.** Only "In your library" appears from the results check; "Not in your library" appeared only for a book whose own page had already answered. At the e-Granthalaya library the results never show any words. `56-search-swami-results`, `62-search-kv-results`.

**N11. A search took 5.7 s with Anna Centenary chosen** for a query that had taken 1.7 s six minutes earlier with no library. Seen once; later searches with a library took 1.2 to 1.4 s.

**N12. A sent problem report looks almost unchanged.** The button turns into "✓ Sent"; the text stays in the box, there is no thank-you or next step (the library request has one). `42-report-problem-sent`.

**N13. In the picker with the keyboard open only two results fit**, because "Show 10 more" and "My library isn't listed" stay fixed under the list. After a request is sent, "Done" closes the whole picker, so a reader with no library has to open it again. `15-picker-city-chennai`, `19-picker-after-done`.

**N14. Help and About from Settings leave the app** for the public pages, which were dark on this phone while the app was in Daylight; the way back is the browser's Back button or "Open my reading shelf". `44-app-about`.

### Design polish

**N15.** Result captions of three lines run onto the wooden shelf edge ("Narayan · 1982", "2012"). `62-search-kv-results`, `11-search-title-results-nolibrary`.
**N16.** "Couldn't check right now" has the same dashed-circle icon as "Checking your library…"; it looks like a spinner that stopped. `52-anna-darkstalker-answer`.
**N17.** In the request form the fields and the Send button reach the right edge of the sheet, and the focus ring is cut on both sides. `19-picker-request-form-open`, `19-picker-request-form-typed-keyboard`.
**N18.** List rows (shelf and results) are only as wide as their text: tap targets 169 to 216 px wide, divider lines of different lengths. `36-shelf-4-books-list-1`, `50-search-anna-settled-list`.
**N19.** Screen-reader labels differ: "…, in Anna Centenary Library" for found, "…, Not in your library" and "…, Couldn't check" for the others.
**N20.** The picker's count line is in the page text twice ("Showing 25 of 35 libraries that match"); one copy is presumably the hidden status line. I did not run a screen reader.
**N21.** Book data oddities seen: two results titled "malgudi days" whose author is "malgudi days"; The Dragonet Prophecy's "About this book" is a reader's review ("I would describe this book as enjoyable and fun…"); a Portuguese cover ("Nunca me abandones") on Never Let Me Go.
**N22.** Seen once: 2.5 s after opening Wings of Fire (Lamplight, just after N2) the page had no "First published" line or description and the found card's link read "Open the library's catalog". Opened again, it settled in 0.2 s with the record link. `39-light-Lamplight-book`, `82-book-wings-ink-settled`.

---

## (d) Clearly better

- Answers are stored and shared: a browser with nothing in it showed "In your library" 0.2 s after the library was chosen. `/api/health` reports the catalog store.
- A reloaded book page shows its answer without a 9-second check.
- Words everywhere: three plain answers, an explanation under each, and link labels that say where they go.
- The picker on a phone: title, field and first results stay above the keyboard; a count and "Show more"; the current library with Remove; location refusal gives a next step; "Libraries near me" worked (13 libraries, nearest first, with distances).
- Nothing is sent by accident: the request and the report both need a Send button and say what goes with them.
- The shelf opens at `/` (first paint 180 ms); `/app/shelf` forwards (308); `/app/search`, `/app/libraries` and `/app/settings` open the shelf with the matching overlay.
- First-visit prompt, library row with Change, gear with one-line explanations, Help link.
- Search: 1.2 to 4.0 s for new queries (was 4 to 7 s; 12.5 s for the misspelling, now 3.0 s); captions under covers; useful "No books found".
- "On my reading shelf" is a status and Remove is its own button.
- Tab titles: "Wings of Fire | MyBookshelf", "Report a problem — MyBookshelf", "Log in — MyBookshelf", "Privacy — MyBookshelf", "Welcome to MyBookshelf — MyBookshelf"; the shelf is "MyBookshelf — Find out if your library has a book"; public pages "About MyBookshelf | MyBookshelf", "How MyBookshelf works | MyBookshelf", "Help and support | MyBookshelf", "Explore featured libraries | MyBookshelf", "Anna Centenary Library — books and catalog | MyBookshelf", "Privacy policy | MyBookshelf". (Two separators, "|" and "—", are in use.)
- No text under 12 px, no sideways overflow on any screen (scroll width 411 = viewport 411 everywhere measured), footer links 44 px.
- Create account and Log in have a show-password button and say what happens next; Log in offers an emailed link.
- Reading light: all three readable with the new cards; the choice survived a reload (Ink). `39-light-…`.
- Browser Back: closes Settings, the picker (keyboard first, then the sheet), Chrome's prompts, the scanner; returns from Report, Privacy, Create account, Log in and About to the shelf with Settings still open; returns from a book to the shelf or results. No trap found.
- Pull to refresh still does nothing (the app scrolls inside its own area); not a change.

---

## (e) Not tested, and things the owner should know

**Sent to production (both allowed):**
1. One library request, text "Test request from the 19 November check, please ignore", no contact details (`POST /api/v2/library-requests` → 202). `19-picker-request-sent`.
2. One problem report, text "Test report from the 19 November check, please ignore", no contact details, from the shelf with Burlingame chosen (`POST /api/v2/problem-reports` → 202). `42-report-problem-sent`.

**Permissions:** location allowed once as "Approximate" + "Allow this time" (after first dismissing the prompt to see the message); camera allowed once with "Allow this time" (after first dismissing it). Nothing was allowed "while visiting the site". No barcode was in view; the camera showed a dark surface and was closed.

**Live library checks: about 21.** Anna Centenary 8 (two results checks, Darkstalker twice, Grandma, Swami twice, The Hunger Games); the e-Granthalaya library 5; Burlingame 7 or 8 (one results check, Darkstalker, Grandma, Swami, The Hunger Games, The Buried Giant once or twice, The Jungle Book). One second look each for Darkstalker and Swami at Anna Centenary and Wings of Fire at the e-Granthalaya library. Stored answers reopened are not counted. I also fetched the e-Granthalaya catalog's public front page once from the Mac (200 in 5.9 s) to see whether it was up.

**Things that went wrong or that I did:**
- Chrome was not in front at the start; bringing it forward opened a new tab page, and I used that tab (id 10769). The three older MyBookshelf tabs and the shopping tab were not touched. One extra tab opened from the catalog link and was closed with Back.
- I cleared this site's local and session storage twice (at the start and before the last new-reader check). This also removed the key `mybookshelf.identity-invalidation.v1` that an earlier session had left; the other tabs of this site share that storage.
- Once I pressed Back expecting a keyboard to be open; it was not, and the browser went back to `/privacy`. I returned with Forward; nothing was lost.
- A failed tap (wrong selector in list view) cost one 70 s wait with no effect on the site.
- The tab is left open on the shelf with three saved books and the e-Granthalaya library chosen, reading light Daylight.
- `00-start-state.png` shows Chrome's own new-tab page (news feed) and is not about the app.

**Not tested:**
- Any account step (not allowed): only the two entry screens were photographed, nothing typed.
- Swami and Friends at the e-Granthalaya library (see table).
- A Japanese library; landscape; hover and pressed states; a screen reader.
- Whether the search field capitalises the first letter (typing was by key events).
- `/terms`, `/open-source` (status 200 only); privacy screens 10 to 15; the in-app privacy page beyond the first screen.
- The "Less" button and the Undo notice overlapping other things (README 33) were not looked at again.
- Whether a late answer is ever stored after a time-out: I looked once, 25 to 30 minutes later, and found none; I cannot see the server.
- 1Password: no chip was tapped; none appeared in the screenshots I examined.
