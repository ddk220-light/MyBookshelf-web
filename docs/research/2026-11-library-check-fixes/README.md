# Library check fixes: Pixel re-test, 20 November 2026

Release `c5ab092575` on `main` (production deployment ready 20 November 2026,
about 06:00 UTC). Re-test on the owner's Pixel 6 Pro, Chrome, through the live
app at mybookshelf.cloud: each library chosen in the app's own picker, each
book page opened, the card read. 52 libraries x 10 books = 520 checks
(`pixel-results.csv`). Earlier run for comparison: 19 November, 512 checks
(branch `codex/production-ready`, `docs/research/2026-11-production-ready/rerun-2026-11-19/`).

## Result

| Card | 19 Nov (512) | 20 Nov (520) |
|---|---|---|
| In your library | 38 | 133 |
| Not in your library | 79 | 167 |
| Couldn't check right now | 395 | 220 |

Real answers went from 23% to 58%. Every one of the 52 libraries now gives at
least one real answer. On the 418 library-and-book pairs present in both runs:
found 32 -> 115, not found 79 -> 122, couldn't check 307 -> 181. 65 earlier
"not found" answers (Godaan, Ponniyin Selvan) are now "couldn't check": they
could not be proven.

By system, 20 November (found / not found / couldn't check):
discovery community 18 / 29 / 23; discovery academic 23 / 35 / 42; Koha
25 / 29 / 36; LIBMAN 18 / 24 / 38; IndCat 24 / 0 / 36; e-Granthalaya 25 / 50 / 45.

Time until the card settled, median / longest: discovery community 3.7 s / 10.4 s;
discovery academic 2.4 s / 12.9 s; IndCat 3.9 s / 13.3 s; LIBMAN 5.6 s / 21.4 s;
Koha 8.1 s / 46.1 s; e-Granthalaya 17.6 s / 44.9 s.

## What still says "couldn't check" (220)

Card sentence: "the catalog answered, but we could not tell" 182; "not
answering right now" 16; "did not answer in time" 15; "too many checks right
now" 7 (LIBMAN request cap).

Three books are 149 of the 220:

| Book | Found | Not found | Couldn't check |
|---|---|---|---|
| Ponniyin Selvan (title) | 0 | 0 | 52 |
| Godaan (title) | 2 | 0 | 50 |
| Harry Potter and the Philosopher's Stone (ISBN) | 5 | 0 | 47 |
| The other seven books together | 126 | 167 | 71 |

- Ponniyin Selvan, Godaan: no ISBN known for the work and the catalog may list
  the title in Tamil or Hindi script or another spelling, so absence cannot be
  proven and a Latin-title search rarely finds the row.
- Harry Potter: 52 editions and related series titles; a same-title row that
  cannot be ruled out blocks "not found".
- Libraries with the most "couldn't check": Karnataka Samskrit University (9 of
  10, slow host), Goa University (9), Darshan University (8, site under
  maintenance), C.E.S. College Goa (7, shared catalog, 45 s), Nagaland
  University (7), Government District Library Pratapgarh (7).

## Not in this run

- Gandhi Smriti Library (LBSNAA): removed from the finder (robots.txt forbids
  its search).
- IIT Roorkee: still not found in the picker by its name.
- The translator rule (a row naming a translator is not a find) shipped but the
  54-library local measurement was not repeated after it.
- Catalog migration 005 (`title_author` evidence) is not yet applied to
  production; until then title-and-author finds are not stored.
- Browser journeys were not run for this release (Playwright browser build
  missing on the Mac). Host-gate SQL was not tested against a local Postgres;
  production logs show no errors from it.

Production logging: each check writes one `library_check` line (library,
platform, host, outcome, reason, evidence, requests, duration; no title, ISBN
or work id). Lines for this run are in the Vercel runtime log.
