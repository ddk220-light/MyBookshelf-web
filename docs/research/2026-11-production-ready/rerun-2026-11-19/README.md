# Re-test of the new release, 19 November 2026

Site tested: `https://mybookshelf.cloud`, serving commit `d733e92255`. Analysis only: no change to the app, nothing deployed.

**Status of this report: the Pixel run is not complete.** It stopped at 512 of 648 checks (43 of 54 libraries) when the Pixel's Focus mode came on at about 09:00 Pacific and paused Chrome. Ten e-Granthalaya libraries and the last three books at SRS Central Library are still to run on the phone; the Mac run covers all of them. The tables in [libraries-54/tables.md](libraries-54/tables.md) are generated from the data and say how far the run had got; Everything else here is complete.

## What was done

| Part | Where it ran | Size | Folder |
|---|---|---|---|
| Guest walk-through again on the new release | Pixel 6 Pro, Chrome, by hand through the app | 236 screenshots, 70 timings | [pixel-rerun](pixel-rerun/findings.md) |
| First library test | Mac, asking the app's check service directly | 10 libraries x 15 books = 150 checks | [libraries-10](libraries-10/results.csv) |
| Second library test, Mac | Mac, asking the app's check service directly | 54 libraries x 10 books = 540 checks | [libraries-54](libraries-54/tables.md) |
| Second library test, phone | Pixel 6 Pro, Chrome, through the app's own picker and book pages | 54 libraries x 12 books = 648 checks (512 done) | [libraries-54](libraries-54/tables.md) |
| One plain request to each catalog | Mac | 30 catalog hosts | [direct-probe.csv](libraries-54/direct-probe.csv) |

Not done: the iPhone walk-through on the new release, and the account flows on the new release (set aside by the owner for now).

## Short version

1. **Four checks in five do not give the reader an answer.** From the Mac, 112 of 540 checks ended in found or not found. On the Pixel so far, 117 of 512. The rest show "Couldn't check right now".
2. **The phone and the Mac agree.** For the 428 book-and-library pairs both have asked, 377 gave the same answer. The differences are almost all between the two kinds of "couldn't check", or a second try succeeding. This is a problem in the checks, not in the phone.
3. **"Not found" comes almost only from two books.** Godaan and Ponniyin Selvan account for 77 of the Mac's 84 "not found" answers, in every catalog system. Six of the other eight books were never "not found" anywhere. Whether those are true absences or a title search that finds nothing has not been checked yet; it needs a look at the catalogs by hand before these answers are trusted.
4. **e-Granthalaya still fails.** 94 of 120 Mac checks ended unknown, nearly all at the 25-second limit; two libraries took 45 seconds a check.
5. **Many failures are quick, but the card says the catalog was slow.** On the Pixel, 98 of the 248 failed checks came back in under 3 seconds (44 in under 1 second), and the card still says "The library's catalog did not answer in time." All 30 catalog hosts answered a plain request from the Mac in 0.3 to 7.7 seconds.
6. **Stored answers work.** Found and not-found answers the Mac had already produced came back on the Pixel in a median 0.8 seconds. Unconfirmed and unknown answers are not stored, so each visit checks the catalog again (median 5.2 and 3.6 seconds).
7. **A second try sometimes works.** 12 pairs that were unknown from the Mac were found (5) or not found (7) when the phone asked later; 5 unconfirmed pairs became not found.
8. **The picker works, with one miss.** 43 of the 44 libraries tried were found by typing their name and were the first row offered. Typing "IIT Roorkee" found nothing; the app lists that library, so the name the picker searches needs a look.
9. **Libraries listed as strongly verified do no better.** Gandhi Smriti Library (LBSNAA), listed with ten verified books, failed every check on both devices in about a second. IIT Roorkee: 0 found, 2 not found, 8 unknown from the Mac.

## The 54-library test

### Choice of libraries and books

- 54 libraries from `server/data/india-catalogs-listed.json`: 50 new ones plus 4 repeated from the first test. 26 states and territories, 30 catalog hosts, six catalog systems (e-Granthalaya 12, Koha 10, college discovery systems 10, LIBMAN 8, INDCAT 7, community discovery systems 7). Nine are listed with ten verified books; six are listed from an e-Granthalaya audit only. The list is in [libraries.csv](libraries-54/libraries.csv).
- 10 books on both devices: Wings of Fire (by title and by ISBN), Godaan, Ponniyin Selvan, The Discovery of India, Malgudi Days, Concepts of Physics, Introduction to Algorithms, Harry Potter and the Philosopher's Stone, Atomic Habits. Two more on the phone only (The God of Small Things, Sapiens) so that the phone makes checks nobody has made before.
- Journals, DVDs and other things that are not books could not be tested: the app can only ask about a book (by work, ISBN or catalog record). That is a gap in the product, not in the test.

### Pace

The first test asked every 3 seconds and probably ran into the app's own limit per catalog host. This test kept inside those limits: one queue per host, 8 to 40 seconds between checks depending on the system. Even so the app refused 4 of 540 Mac checks with "rate limited". The Pixel waited 3 to 6 seconds after each answer, like a reader.

### Mac results, by system (540 checks)

| System | Checks | Found | Not found | Unconfirmed | Unknown | Refused | Median time | Longest |
|---|---|---|---|---|---|---|---|---|
| e-Granthalaya | 120 | 4 | 17 | 5 | 94 | 0 | 25.2 s | 55.5 s |
| Koha | 100 | 9 | 17 | 41 | 31 | 2 | 7.7 s | 26.4 s |
| College discovery systems | 100 | 6 | 17 | 17 | 58 | 2 | 1.9 s | 18.3 s |
| LIBMAN | 80 | 2 | 17 | 58 | 3 | 0 | 3.8 s | 17.6 s |
| INDCAT | 70 | 7 | 7 | 16 | 40 | 0 | 5.8 s | 18.4 s |
| Community discovery systems | 70 | 0 | 9 | 11 | 50 | 0 | 2.7 s | 15.3 s |
| All | 540 | 28 | 84 | 148 | 276 | 4 | 5.7 s | 55.5 s |

"Unconfirmed" means the catalog answered but the app could not tell. "Unknown" means the check failed. The reader sees "Couldn't check right now" for both, with a different sentence underneath.

### Pixel results so far, by system (512 checks; only 2 of the 12 e-Granthalaya libraries)

| System | Checks | Found | Not found | Unconfirmed | Unknown | No answer card | Median time | Longest |
|---|---|---|---|---|---|---|---|---|
| Koha | 120 | 14 | 26 | 41 | 39 | 0 | 8.6 s | 24.7 s |
| College discovery systems | 120 | 7 | 17 | 16 | 80 | 0 | 2.0 s | 35.9 s |
| LIBMAN | 96 | 2 | 19 | 54 | 21 | 0 | 4.5 s | 10.3 s |
| Community discovery systems | 84 | 0 | 8 | 16 | 59 | 1 | 5.2 s | 75.3 s |
| INDCAT | 72 | 11 | 5 | 19 | 37 | 0 | 6.4 s | 21.0 s |
| e-Granthalaya | 20 | 4 | 4 | 0 | 12 | 0 | 25.7 s | 46.8 s |

Time on the Pixel is from opening the book page to the answer card settling.

### By book (Mac, 54 libraries each)

| Book | Found | Not found | Unconfirmed | Unknown |
|---|---|---|---|---|
| Wings of Fire (title) | 8 | 2 | 14 | 30 |
| Wings of Fire (ISBN) | 9 | 5 | 18 | 22 |
| Godaan (title) | 0 | 37 | 8 | 9 |
| Ponniyin Selvan (title) | 0 | 40 | 2 | 12 |
| The Discovery of India (title) | 3 | 0 | 17 | 34 |
| Malgudi Days (title) | 0 | 0 | 22 | 32 |
| Concepts of Physics (ISBN) | 3 | 0 | 16 | 35 |
| Introduction to Algorithms (ISBN) | 0 | 0 | 19 | 33 |
| Harry Potter and the Philosopher's Stone (ISBN) | 1 | 0 | 18 | 34 |
| Atomic Habits (ISBN) | 4 | 0 | 14 | 35 |

No library was found to hold Godaan, Ponniyin Selvan, Malgudi Days or Introduction to Algorithms. For a set of Indian college, university and public libraries that is not believable for Godaan and Malgudi Days, and points at the matching rather than the shelves.

### What stands out by library

The full side-by-side table is in [tables.md](libraries-54/tables.md) and [per-library.csv](libraries-54/per-library.csv).

- **Every check failed, on both devices:** Chanakya Pustakalaya, Shodhak Book Library (both Rajkot), Gandhi Smriti Library LBSNAA (Mussoorie). From the Mac only (phone not yet run): 1805 Govt Vikram College, Khachrod. IIT Roorkee could not be chosen on the phone (see the picker note above).
- **Best of the set:** Indian Institute of Management Visakhapatnam (Pixel: 5 found, 2 not found of 12), Islamic University of Science and Technology (5 found of 12), Modern College Shivajinagar (4 found, 2 not found), Andhra University through INDCAT (3 found).
- **Slowest:** SRS Central Library and Romain Rolland Library (e-Granthalaya), median 45 seconds a check; the other e-Granthalaya libraries 25 seconds; several Koha libraries 15 to 20 seconds.
- **LIBMAN:** every library answers, in 3 to 6 seconds, but the answer is "unconfirmed" for 7 or 8 books of 10.

### Phone against Mac

- 428 pairs asked by both: 377 the same, 51 different. Of the 51: 29 moved between unconfirmed and unknown, 17 got a real answer on the phone's later try, 4 were the Mac's refused checks, and 1 was a page that never showed an answer card (Alliance Française Pondicherry, Ponniyin Selvan: 75 seconds with no card and no check request; screenshot `064-…`).
- Stored answers reach the phone fast: 94 of 117 found or not-found answers on the Pixel came back from the check request in under 0.3 seconds.
- The two phone-only books (84 live checks so far) did no better than the Mac's first asks: 6 found, 0 not found, 17 unconfirmed, 61 unknown.
- Nine phone checks took 31 to 47 seconds to show "Couldn't check right now".

### What the reader sees on the card (Pixel, 512 checks)

| Card | Sentence | Link | Checks |
|---|---|---|---|
| Couldn't check right now | The library's catalog did not answer in time. This does not mean the book is missing. | Open catalog | 248 |
| Couldn't check right now | The library's catalog answered, but we could not tell whether it has this book. | Open catalog | 146 |
| Not in your library | We looked for this book in the library's catalog and did not find it. The library may still have another edition. | Open the library's catalog, or Search the library's catalog yourself | 79 |
| In your library | (link only) | See this book in the library's catalog (23), Search the library's catalog for this book (9), Open the library's catalog (6) | 38 |
| No card | | | 1 |

For 15 of the 38 "In your library" answers the link does not go to the book's record, so the reader cannot confirm it in one tap.

## The first library test (10 libraries x 15 books, Mac)

Results in [libraries-10/results.csv](libraries-10/results.csv). Asked every 3 seconds, which was too fast for the app's own per-host limits, so some of the quick "unknown" answers are the test's fault. Four of these libraries were repeated in the 54-library test at a proper pace.

| Library | System | Found | Not found | Unconfirmed | Unknown | Note |
|---|---|---|---|---|---|---|
| Anna Centenary Library | Koha | 7 | 3 | 4 | 1 | median 8.4 s, longest 45.1 s |
| Kalaignar Centenary Library | Koha | 4 | 3 | 6 | 2 | |
| VPL | VPL | 0 | 2 | 13 | 0 | 17 s each |
| JSS (LIBMAN) | LIBMAN | 0 | 3 | 7 | 5 | |
| Roja Muthiah Research Library | Community discovery | 0 | 1 | 8 | 6 | |
| Islamic University of Science and Technology | College discovery | 2 | 0 | 2 | 11 | |
| IIT Roorkee | INDCAT | 1 | 2 | 1 | 11 | |
| Baba Mastnath University | College discovery | 0 | 1 | 1 | 13 | |
| Prayagraj (e-Granthalaya) | e-Granthalaya | 1 | 1 | 0 | 13 | 25 s each |
| KV Narimedu (e-Granthalaya) | e-Granthalaya | 0 | 1 | 0 | 14 | 26 s each |

## The Pixel walk-through on the new release

Full findings, a verdict on every earlier finding and 22 new problems: [pixel-rerun/findings.md](pixel-rerun/findings.md). Timings: [pixel-rerun/timings.csv](pixel-rerun/timings.csv). Screenshots: `pixel-rerun/screenshots/` (the findings name them without the folder).

- **Fixed:** stored answers come back in a fifth of a second; a reloaded book page does not check again; the answer is in words; the picker keeps its field and results above the keyboard; the request form needs a Send; the library row has Change.
- **Not fixed:** e-Granthalaya (5 checks, all "Couldn't check right now" after 25 to 26 s); Anna Centenary's slow checks (3 of 6 ended "couldn't check" after 40 to 46 s).
- **New:** the shelf drops stored answers for books opened by ISBN after a reload; after Remove and choosing a library again the shelf shows no answers until a reload; the shelf never checks saved books by itself; a long library name is drawn over the "My library" label; a long title in list view runs off the screen.

## Files

- `libraries-54/mac-results.csv`, `phone-results.csv`: one row per check, with answer, time, link and (phone) the words on the card and the screenshot name.
- `libraries-54/comparison.csv`: Mac and Pixel answer for each pair asked by both.
- `libraries-54/per-library.csv`, `phone-picker.csv`, `libraries.csv`, `direct-probe.csv`.
- `libraries-54/phone-screenshots/`: one screenshot per phone check, reduced to 1000 pixels tall.
- `libraries-54/scripts/`: `run.mjs` (Mac run), `phone-run.mjs` (Pixel driver), `compile.mjs` (builds the CSV files and tables), `summarize-mac.mjs`.

## Next

1. Finish the Pixel run (10 e-Granthalaya libraries, the rest of SRS Central, and IIT Roorkee once it can be chosen) after Focus mode is switched off, and regenerate the tables.
2. Look by hand at a sample of the Godaan and Ponniyin Selvan "not found" answers, and of the "unconfirmed" answers, in the catalogs themselves.
3. Find out why checks fail in under a second at libraries whose catalogs answer a plain request.
4. iPhone walk-through and account flows on the new release, when wanted.
