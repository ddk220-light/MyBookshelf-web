# One any-field search: Pixel re-test, 20 November 2026

Release `27cf7bf9bc` in production ("one any-field library search"): every
library check is one any-field search of the library's catalog, and a catalog
row matches when at least 80% of the book title's words appear in the row's
title. Search-list marks use the same search and matcher with the typed text.

Re-test on the owner's Pixel 6 Pro, Chrome, through the live app at
mybookshelf.cloud. Same method, libraries and books as
`simple-search-pixel-retest.md`: 52 libraries x 10 books = 520 checks
(`pixel-results-one-search.csv`, same columns as before). Run 20:11 to 21:44
UTC, no pause (Focus mode was not active at that hour). The driver is the same
as before, except that it kept the whole card text (2,000 characters instead
of 300) so the matching rows on found cards could be read
(`run-2026-11-19/india-libraries-50/phone-run-wide.mjs`; results in
`phone-4/`).

Three checks showed no card at all: the book page said "Book unavailable.
Book details could not load." (Indian Institute of Sindhology x Wings of Fire
at 20:11, Santhom Library x Godaan at 20:16, District Library Kupwara x Godaan
at 21:34). No library check was made for them. They were repeated on their own
at 21:44 (`phone-4-recheck/`) and gave the same answers as the previous run;
the CSV uses those rows. In the first ten minutes, 13 more pages took 5 to 13 s
to show the card although the library check itself took under 2 s; the book
page, not the library check, was slow then.

Not in this run, as before: Gandhi Smriti Library (LBSNAA) and IIT Roorkee
(not found in the picker by name).

## Result

| Card | 20 Nov morning (520) | Simple search (520) | One search (520) |
|---|---|---|---|
| In your library | 133 | 147 | 173 |
| Not in your library | 167 | 354 | 329 |
| Couldn't check right now | 220 | 19 | 18 |

Time until the card settled: median 2.8 s -> 2.5 s; 90th percentile 9.8 s ->
11.3 s; longest 35.7 s -> 37.9 s (Romain Rolland Library x Wings of Fire, an
e-Granthalaya search that took 37.3 s). The library check request itself:
median 1.7 s, longest 37.3 s.

Same 520 pairs, simple search (rows) -> one search (columns):

| Before \ Now | Found | Not found | Couldn't check |
|---|---|---|---|
| Found (147) | 145 | 1 | 1 |
| Not found (354) | 27 | 325 | 2 |
| Couldn't check (19) | 1 | 3 | 15 |

34 answers changed.

## By system

Found / not found / couldn't check.

| System (libraries) | Simple search | One search | Settle median / longest (before -> now) |
|---|---|---|---|
| Discovery academic (10) | 24 / 66 / 10 | 26 / 64 / 10 | 1.7 / 4.8 s -> 1.6 / 19.5 s |
| Discovery community (7) | 24 / 46 / 0 | 24 / 46 / 0 | 2.6 / 5.9 s -> 2.8 / 14.9 s |
| e-Granthalaya (12) | 31 / 89 / 0 | 36 / 84 / 0 | 7.4 / 32.2 s -> 6.0 / 37.9 s |
| IndCat (6) | 24 / 35 / 1 | 31 / 29 / 0 | 2.7 / 31.0 s -> 2.4 / 17.8 s |
| Koha (9) | 24 / 58 / 8 | 32 / 50 / 8 | 3.2 / 35.7 s -> 3.4 / 35.8 s |
| LIBMAN (8) | 20 / 60 / 0 | 24 / 56 / 0 | 1.7 / 9.1 s -> 1.3 / 5.8 s |

The longest discovery times (19.5 s, 14.9 s) are the slow book pages of the
first ten minutes, not the checks.

## By book (one search; simple search in brackets)

| Book | Found | Not found | Couldn't check |
|---|---|---|---|
| Wings of Fire (title) | 34 (32) | 16 (18) | 2 (2) |
| Wings of Fire (ISBN) | 33 (34) | 16 (16) | 3 (2) |
| Godaan (title) | 7 (4) | 43 (46) | 2 (2) |
| Ponniyin Selvan (title) | 4 (2) | 46 (49) | 2 (1) |
| The Discovery of India (title) | 27 (21) | 23 (29) | 2 (2) |
| Malgudi Days (title) | 16 (13) | 35 (36) | 1 (3) |
| Concepts of Physics 1 (ISBN) | 17 (11) | 34 (39) | 1 (2) |
| Introduction to Algorithms (ISBN) | 15 (13) | 35 (37) | 2 (2) |
| Harry Potter (ISBN) | 8 (6) | 43 (44) | 1 (2) |
| Atomic Habits (ISBN) | 12 (11) | 38 (40) | 2 (1) |

## What still says "couldn't check" (18)

| Card sentence | Count | Where |
|---|---|---|
| The library's catalog is not answering right now. | 10 | Darshan University (all 10, in 1.2-1.7 s, as before) |
| The library's catalog did not answer in time. | 8 | Karnataka Samskrit University 7 (30-36 s); C.E.S. College, Goa x Wings of Fire (ISBN), 35.6 s |

## Changed answers (34), by group

Judged from the rows each found card lists ("In the library's catalog:"),
without opening the catalogs themselves.

**Not found -> found (27)**

Right, or the listed row is the book (13, plus Kakatiya, which was "couldn't
check"):

| Library (system) | Book | Row listed |
|---|---|---|
| Amguri College (LibAITech) | The Discovery of India | "JAWAHARLAL NEHRU : The Discovery of India" |
| Islamic University of Science and Technology | Harry Potter | "Harry Potter and the Philsopher's Stone", Rowling |
| Roja Muthiah Research Library | Ponniyin Selvan | "Kalki R. Krishnamurthy's Ponniyin selvan" |
| Government District Library, Agra (e-Granthalaya) | The Discovery of India | "Jawaharlal Nehru: The Discovery of India" (author field "GANDHI, RAJIV") |
| Government District Library, Pratapgarh | The Discovery of India | "Jwahaar Lal Nehru: The Discovery of India" |
| SRS Central Library | Wings of Fire (title) | "Wings of Fire", Tiwari, Arun |
| SRS Central Library | Godaan | "Gift of a Cow: A translation of the Hindi novel, Godaan", Premchand (first row is a study by Yadav) |
| SRS Central Library | Malgudi Days | "Malgudi Days", Narayan |
| C.E.S. College, Goa (Koha, shared DHE catalog) | Wings of Fire (title) | Five "Wings of Fire" rows, no authors shown |
| C.E.S. College, Goa | The Discovery of India | "The Discovery of India" and others |
| Ashok Hall Girls' HSS (LIBMAN) | Ponniyin Selvan | "KALKIS PONNIYIN SELVAN 1-3", tr. Rajaram |
| IIPM School of Management (LIBMAN) | The Discovery of India | "Jawaharlal Nehru: The Discovery of India" |
| SSM College of Engineering (LIBMAN) | The Discovery of India | "Jawaharlal Nehru The Discovery of India" (author field "Mead,M") |
| Kakatiya University (IndCat; was couldn't check) | Malgudi Days | "Malgudi Days", Narayan |

Wrong, a different book whose title contains the words (7):

| Library | Book | Rows listed |
|---|---|---|
| Central University of Odisha (IndCat) | Concepts of Physics | "Concepts of modern physics", Beiser |
| Goa University (IndCat) | Concepts of Physics | Concepts of Nuclear / Particle / modern / atomic physics |
| Goa University | Introduction to Algorithms | "An Introduction to Parallel Algorithms", "... Genetic Algorithms", "Introduction to the Design and Analysis of Algorithms", Baase |
| Nagaland University (IndCat) | Concepts of Physics | Concepts of nuclear physics, Concepts of modern physics, "Physics of Materials: Essential Concepts..." |
| Pt. Ravishanker Shukla University (IndCat) | Concepts of Physics | Concepts of nuclear physics, Concepts of modern physics, "Development of concepts of physics" |
| St. Anthony's College, Shillong (Koha) | Concepts of Physics | "CONCEPTS OF MODERN PHYSICS", Beiser (2 rows) |
| Ashok Hall Girls' HSS (LIBMAN) | Concepts of Physics | "BASIC CONCEPTS OF PHYSICS - VOL. I", Mohindroo |

Shared catalog, not filtered to the college (C.E.S. College, Goa) (6): Godaan,
Harry Potter, Malgudi Days, Concepts of Physics, Introduction to Algorithms,
Atomic Habits. Each card lists five rows of the shared DHE Goa catalog with no
author and no holding college. In the previous write-up the catalog's own
pages showed Godaan (first 80 rows) and Harry Potter (3 rows) held only by
other colleges, so those two are likely wrong; the other four are not known.
This follows the owner's rule for shared catalogs that cannot be filtered.

A study only (1): Pt. Ravishanker Shukla University x Godaan, "PREMCHAND KI
UPANYAS KALA KA UTKARSH : GODAAN" (a study of the novel). Accepted under the
owner's decision on study guides.

**Found -> not found (1)**

Shree Chhatrapati Shivaji Maharajjee Pustakalay, Surat (discovery community) x
Concepts of Physics 1. In the simple-search run the card listed "CONCEPTS OF
PHYSICS 1" by H C Verma three times. Now "Not in your library" (check 1.3 s).
A wrong "not found": the any-field search for the title did not return, or did
not return early enough, the rows the title search found.

**Found -> couldn't check (1):** C.E.S. College x Wings of Fire (ISBN), catalog
did not answer in time (35.6 s). The title key found it on the same run.

**Not found -> couldn't check (2), couldn't check -> not found (3):**
Karnataka Samskrit University; the host answers some searches in about 30 s
and times out on others, as before.

## Known cases

| Case | Now | Note |
|---|---|---|
| C.E.S. College Goa x The Discovery of India | Found | Was a wrong "not found"; now right. |
| C.E.S. College Goa x Wings of Fire | Found (title); couldn't check (ISBN, timeout) | Was a wrong "not found". |
| SRS Central Library Jammu x Wings of Fire, Malgudi Days | Both found | Were wrong "not found"; the any-field search returns them. Godaan is also found now. |
| Amguri College x The Discovery of India | Found | "JAWAHARLAL NEHRU : The Discovery of India" now matches. |
| LIBMAN 520 (Karunakaran Library, Rayburn College) x Wings of Fire | Not found (both keys, 1.0-1.9 s) | Earlier recorded as genuinely absent, so this is right. |
| Chanakya Pustakalaya x Wings of Fire | Found (both keys) | Still wrong: all five listed rows are Tui T. Sutherland's "Wings of Fire" series. |
| CPU Central Library Kota x Introduction to Algorithms | Found (1.2 s) | Lists four "Introduction to Algorithms" rows (three Cormen). Found on this run; one run only, so the earlier found/not found flip is not re-tested. |
| Darshan University | Couldn't check x 10 | "Not answering right now" in about 1.5 s, as before. |
| Karnataka Samskrit University | 7 couldn't check, 3 not found | Timeouts at 30-36 s. |

## Likely false answers

**False founds: 13 of 173 found cards** (none of the listed rows is the book):

- 7 "contains the words" matches listed above (6 x Concepts of Physics, 1 x
  Introduction to Algorithms).
- 2 Chanakya Pustakalaya x Wings of Fire (title and ISBN): Sutherland only.
- 2 Government District Library, Pratapgarh x Wings of Fire (title and ISBN):
  the only row is "On Wings of Fire" by Nancy and Mimi. Under the simple search
  these were also "found"; the row listed is not Kalam's book.
- 2 C.E.S. College x Godaan and Harry Potter: shared catalog, copies held by
  other colleges (owner's rule: unfiltered shared catalogs count).

Not counted but uncertain: the four other unfiltered C.E.S. finds, the
Pt. Ravishanker Shukla Godaan study, and two Discovery of India rows with odd
author fields (Agra, SSM).

**False not-founds: 1 confirmed in the 520** (Surat x Concepts of Physics).
Not found for Godaan, Ponniyin Selvan and Harry Potter at most libraries is
not verified (Latin-only searches; earlier noted). The mark test below adds 19
book pages that say "Not in your library" for another Open Library edition of
a work that the same library has.

## Search-list marks (5 libraries x 3 searches)

Typed into the search box on the phone with the library chosen; the URL stayed
`https://mybookshelf.cloud/` throughout and book pages were
`/app/books/<book key>` only (search text never in a URL). For each search,
every marked book and two unmarked ones were opened from the list
(`phone-4/marks.jsonl`, script `marks-run.mjs`, screenshots
`phone-4/shots/marks-*.jpg`).

Libraries: Modern College, Pune (Koha); Romain Rolland Library (e-Granthalaya);
Ashok Hall Girls' HSS (LIBMAN); Andhra University (IndCat); Santhom Library
(discovery community).

Each search lists 9 Open Library books. 135 listed: 58 marked "In your
library", 8 marked "Couldn't check", 69 with no mark.

| Library | wings of fire | discovery of india | malgudi days | Marks done after |
|---|---|---|---|---|
| Modern College (Koha) | 2 | 4 | 5 | 6.4 / 4.5 / 3.3 s |
| Romain Rolland (e-Granthalaya) | 1 (+8 "Couldn't check") | 4 | 5 | 22.3 / 14.6 / 11.7 s |
| Ashok Hall (LIBMAN) | 6 | 4 | 5 | 2.5 / 5.5 / 2.2 s |
| Andhra University (IndCat) | 2 | 4 | 5 | 9.3 / 2.2 / 2.6 s |
| Santhom Library (discovery) | 2 | 4 | 5 | 2.1 / 5.3 / 3.4 s |

Times are from pressing search until the "Looking in ..." line went away. The
first mark often appears with the list (0.4-6.4 s), because books checked
earlier on the phone already have a stored answer.

Which books are marked:

- wings of fire: Kalam's "Wings of Fire" and Sutherland's "Wings of Fire"
  (2018 box set) everywhere, because both titles are "Wings of Fire". At Ashok
  Hall, four Sutherland books are marked as well; that library lists rows such
  as "Wings of Fire The Hidden Kingdom", so those are plausible.
- discovery of india: the 1946, 1947 and 1956 "The Discovery of India" records,
  and also "India" (Discovery Channel, 2002) at all five libraries: the one-word
  title "India" is fully contained in "The Discovery of India". A false mark.
  Not marked: "The Discovery of India. (Fourth Edition.)", "The Discovery of
  India ,Year 1947", "Jawaharlal Nehru's The discovery of India" (fewer than 80%
  of their title words are in the row titles).
- malgudi days: the five records titled "Malgudi days"; not "Malgudi Days I",
  "Malgudi Days II", "Malgudi Days (Twentieth-Century Classics)" or "(Penguin
  Classics)".

List and page:

- Marked "In your library" -> book page "In your library": 58 of 58. For 42 of
  them the page showed only the catalog link, without the "In the library's
  catalog:" list; at Modern College and Andhra University the page made no
  check of its own and showed the mark's record link.
- No mark -> book page: "Not in your library" 27, "Couldn't check" 1 (Romain
  Rolland x The Discovery of India, Fourth Edition, 13 s). 20 of these 28 are
  editions of the work the same list marks (Discovery of India Fourth Edition /
  Year 1947, Malgudi Days I / Twentieth-Century Classics) and 19 of them say
  "Not in your library", so the reader sees
  "In your library" on one card and "Not in your library" on the page of
  another edition of the same book.
- Marked "Couldn't check" (Romain Rolland, wings of fire; the marks request
  ended at 22 s) -> page: 7 "Not in your library", 1 "In your library"
  (Sutherland's "Wings of Fire", 19 s).

## For the owner to decide

1. The 80% rule finds other books whose titles contain the words: 6 of 17
   "Concepts of Physics" finds and 1 "Introduction to Algorithms" find are
   different books, and "India" is marked for "discovery of india" at every
   library.
2. Open Library edition titles with extra words ("Fourth Edition", "I",
   "(Twentieth-Century Classics)") get "Not in your library" on the book page
   at libraries that hold the work. The main-title rule does not remove
   bracketed or edition text.
3. A marked book's page often shows no matching rows, so the reader cannot see
   why it was marked.
4. The e-Granthalaya marks search can run past the 22-25 s marks limit and
   show "Couldn't check" on every unmarked card.
5. Surat x Concepts of Physics: one regression from title search to any-field
   search.
