# Simple search: Pixel re-test, 20 November 2026

Release `7afa547ac9` on `main` (one title search per check, plus one ISBN
search when the book was reached by ISBN; a row whose title is the book's
title is "found" and the card lists the matching catalog rows). Re-test on the
owner's Pixel 6 Pro, Chrome, through the live app at mybookshelf.cloud, same
method and book list as `README.md`: 52 libraries x 10 books = 520 checks
(`pixel-results-simple-search.csv`). Run 16:17 to 18:00 UTC; it paused at
17:00 when Focus mode suspended Chrome and was resumed at 17:16 (no phone
setting was changed). One check hit by the pause was repeated on its own
(see "The 91 s check").

Not in this run, as before: Gandhi Smriti Library (LBSNAA, removed from the
finder) and IIT Roorkee (not found in the picker by its name).

## Result

| Card | 19 Nov, old code (512) | 20 Nov morning (520) | 20 Nov simple search (520) |
|---|---|---|---|
| In your library | 38 | 133 | 147 |
| Not in your library | 79 | 167 | 354 |
| Couldn't check right now | 394 (+1 no card) | 220 | 19 |

Real answers: 23% -> 58% -> 96%. Median time until the card settled:
4.9 s -> 5.3 s -> 2.8 s.

Same 520 pairs, morning (rows) -> simple search (columns):

| Morning \ Now | Found | Not found | Couldn't check |
|---|---|---|---|
| Found (133) | 126 | 4 | 3 |
| Not found (167) | 0 | 166 | 1 |
| Couldn't check (220) | 21 | 184 | 15 |

The 184 "couldn't check -> not found" are mostly the three books that could
not be proven before: Ponniyin Selvan 49, Godaan 46, Harry Potter 44; the
other seven books 45.

## By system

Found / not found / couldn't check.

| System (libraries) | 19 Nov | 20 Nov morning | Simple search | Settle median / longest (morning -> now) |
|---|---|---|---|---|
| Discovery academic (10) | 7 / 17 / 96 | 23 / 35 / 42 | 24 / 66 / 10 | 2.4 / 12.9 s -> 1.7 / 4.8 s |
| Discovery community (7) | 0 / 8 / 75 | 18 / 29 / 23 | 24 / 46 / 0 | 3.6 / 10.4 s -> 2.6 / 5.9 s |
| e-Granthalaya (12) | 4 / 4 / 12 | 25 / 50 / 45 | 31 / 89 / 0 | 17.6 / 44.9 s -> 7.4 / 32.2 s |
| IndCat (6) | 11 / 5 / 56 | 24 / 0 / 36 | 24 / 35 / 1 | 3.9 / 13.3 s -> 2.7 / 31.0 s |
| Koha (9) | 14 / 26 / 80 | 25 / 29 / 36 | 24 / 58 / 8 | 7.9 / 46.1 s -> 3.2 / 35.7 s |
| LIBMAN (8) | 2 / 19 / 75 | 18 / 24 / 38 | 20 / 60 / 0 | 5.6 / 21.4 s -> 1.7 / 9.1 s |

(19 November covered 43 libraries; e-Granthalaya only 2 of them.)

## By book (simple search; morning in brackets)

| Book | Found | Not found | Couldn't check |
|---|---|---|---|
| Wings of Fire (title) | 32 (32) | 18 (14) | 2 (6) |
| Wings of Fire (ISBN) | 34 (32) | 16 (14) | 2 (6) |
| Godaan (title) | 4 (2) | 46 (0) | 2 (50) |
| Ponniyin Selvan (title) | 2 (0) | 49 (0) | 1 (52) |
| The Discovery of India (title) | 21 (22) | 29 (19) | 2 (11) |
| Malgudi Days (title) | 13 (11) | 36 (29) | 3 (12) |
| Concepts of Physics 1 (ISBN) | 11 (7) | 39 (30) | 2 (15) |
| Introduction to Algorithms (ISBN) | 13 (13) | 37 (29) | 2 (10) |
| Harry Potter (ISBN) | 6 (5) | 44 (0) | 2 (47) |
| Atomic Habits (ISBN) | 11 (9) | 40 (32) | 1 (11) |

## What still says "couldn't check" (19)

| Card sentence | Count | Where |
|---|---|---|
| The library's catalog is not answering right now. | 10 | Darshan University (all 10, answered in about 1 s; site under maintenance as before) |
| The library's catalog did not answer in time. | 9 | Karnataka Samskrit University 8 (30-35 s, slow host); Kakatiya University 1 (Malgudi Days, 30 s) |

## Found -> not found (4), checked in the library's own catalog

| Library (system) | Book | Library's catalog | App now |
|---|---|---|---|
| The C.E.S. College of Arts and Commerce (Koha, shared DHE Goa catalog) | The Discovery of India | Title search row 1: "The Discovery of India", Nehru, "available for loan: The C.E.S. College of Arts and Commerce (1)" (record 876) | Wrong |
| The C.E.S. College of Arts and Commerce | Wings of Fire | Title search: the C.E.S. copy ("Wings of fire: an autobiography") is row 34 of 40; rows 1-33 are other colleges' | Wrong |
| SRS Central Library (e-Granthalaya) | Wings of Fire | Title-field search: 0 records. Any-field search: 1, "Wings of Fire" by Tiwari, Arun | Wrong |
| SRS Central Library | Malgudi Days | Title-field search: 0. Any-field search: 1, "Malgudi Days" by Narayan, R K | Wrong |

All four are wrong "not found" answers.

- On the shared Goa catalog the search is unscoped, and the check opens at
  most 2 matching records (`MAX_RECORD_READS = 2`). A record that shows
  another college's copy is not counted as a failure, so after 2 such records
  the answer is "not found".
- e-Granthalaya's title index at SRS does not return these records for the
  full title, although the catalog shows them. Searching the title field for
  "Malgudi" alone returns 7 other records.

Other "not found" answers checked (from the 184 "couldn't check -> not found"):

| Library | Book | Library's catalog | App now |
|---|---|---|---|
| Amguri College (LibAITech) | The Discovery of India | Holds "JAWAHARLAL NEHRU : The Discovery of India" (Oxford, 2002) | Wrong (title has a prefix) |
| C.E.S. College | Godaan | More than 80 Godaan/Godan rows held by other colleges, none by C.E.S. in the first 80 | Not provable (2 records read) |
| C.E.S. College | Harry Potter | 3 title rows, all held by other colleges | Consistent |
| Assam Women's University (Koha) | Godaan | "Godaan", "Godan" and "गोदान" all return nothing | Consistent |
| Assam Women's University | Ponniyin Selvan | Nothing | Consistent |
| Andhra University (IndCat) | Harry Potter, Ponniyin Selvan | No match in the first 10 rows | Consistent |

Found answers that list a different work:

- Chanakya Pustakalaya, Rajkot: "In your library" for Kalam's Wings of Fire.
  Every visible row is Tui T. Sutherland's "Wings of Fire" series. In the
  morning run this card said "couldn't tell".
- Ashok Hall Girls' HSS: 2 of the 5 listed rows are Sutherland's. Kalam rows
  are also listed, so the answer is right.
- R.P.S. College, Mahnar: Godaan "found" from "GODAAN" by Dr. Prem Sagar, a
  study guide. The catalog also has "GODAN" by Premchand, so the answer is
  right, but the listed row is the guide.

The same pair gave different answers on repeated checks: CPU Central Library
Kota x Introduction to Algorithms was found at 16:59, not found at 18:09 and
found again at 18:10.

## The 91 s check

CPU Central Library Kota x Atomic Habits (ISBN), started 16:59:59 UTC,
settled at 91.0 s with no card. No card was ever seen (`cardFirstSeenMs` 0),
no `/holdings/check` request was recorded, and the next library failed with
"cdp timeout". Chrome was being suspended by Focus mode. The 91 s is the
driver's 75 s wait plus one blocked DevTools call (30 s timeout), not the
app; the app's 65 s client limit was not involved. When this pair was
repeated on its own at 18:03, it showed "Not in your library" after 3.9 s
(check 2.0 s). The CSV uses that row. The other 9 Kota books settled in
2.0-3.2 s.

## The list on found cards

146 of 147 found cards show a list. The other one, an IndCat ISBN find at
Pt. Ravishanker Shukla University, shows only "See this book in the library's
catalog". The list has two forms:

- "In the library's catalog:" with one row: 88 cards.
- "Books with this title in the library's catalog:" with 2 to 5 rows: 58
  cards. The list stops at 5 rows and does not say there are more.

Phone screenshots: in `run-2026-11-19/india-libraries-50/phone-3/`,
`pixel-found-list-kota-wings-of-fire.png` and
`pixel-found-list-kota-algorithms.png`. In `phone-3/shots/`,
`331-libman-798-OL1037811W.jpg` (5 rows, Sutherland rows included),
`444-egranthalaya-pylib-rrlpy-OL356672W.jpg` (5 rows) and
`348-indcat-indcat-andh-530003-9780262033848.jpg` (4 authors). On a phone,
titles and long author lists wrap inside the card. Nothing overflows, and the
catalog link and "Change library" sit on one row below the list.

## For the owner to decide

1. Shared catalogs (DHE Goa Koha): "not found" after reading 2 records is
   wrong. Options: say "couldn't check" when no record shows this college, or
   search scoped to the branch.
2. e-Granthalaya: the one title-field search misses records the catalog holds
   (2 of 2 regressions). Options: an any-field fallback before "not found".
3. "Not found" now covers Godaan, Ponniyin Selvan and Harry Potter at nearly
   every library (139 answers that used to be "couldn't check"). A Latin-title
   search cannot see Devanagari or Tamil rows, or titles with a prefix
   (Amguri).
4. A same-title row by another author counts as a find (Sutherland's Wings of
   Fire at Chanakya Pustakalaya).
5. Focus mode on the Pixel suspends Chrome at about 17:00 UTC. Later runs need
   to finish before then or have it switched off by the owner.
