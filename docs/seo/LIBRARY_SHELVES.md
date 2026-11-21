# Library shelves and book pages

Owner decision, 21 November 2026: public, static library pages for Indian
libraries, each with a shelf of up to ten books that the app's own check found
in that library's catalog, and a static page for every shelved book.

## What controls what

| File | What it is | Who writes it |
| --- | --- | --- |
| `shared/seo-book-pool.json` | The books asked about, in popularity order (general, then academic) | By hand; `pool` fills Open Library keys |
| `shared/seo-shelf-candidates.json` | The candidate libraries, in order | `candidates` (from the directory) |
| `shared/seo-shelves.json` | Each library's answers per pool book, and Open Library details of every found book | `run` / `details`; never by hand |
| `shared/seo-libraries.json` | The twelve reviewed guides (unchanged) | By hand |

`tools/seo/build-pages.mjs` publishes `/libraries/<slug>` for every library in
`seo-shelves.json` with at least five found books (a reviewed guide keeps its
page and gains the shelf), `/books/<slug>` for every book on a published shelf,
`/books`, and the state list on `/libraries`. Library facts come from the
directory only (name, city or published district, state, address and its
source, catalog link); fields the directory lacks are left out, and there is no
official website on generated pages because the directory has none. Book facts
come from Open Library as stored by the checker. The build needs no network.

### What the pages show

- **Place** (`tools/seo/public-place.mjs`, one rule for every public page): the
  city the directory's source publishes, or the place index's city when it
  matched that city or the published address names it (a city with the
  district's name first: Prayagraj, Kupwara). Nothing that looks like a street,
  road, colony, building or number is shown as a city. Else the district, when
  it is published, a PIN code in the library's evidence lies in it, or the
  address names it: shown as the town when the address names it, else as
  "<district> district". Else the one district of the state that a part of the
  published address names. Else the state only. Never from a library's name.
- **States** have one spelling (`canonicalRegion`, server/public-v2/geography.js):
  "&" is "and", and older Union Territory names are today's.
- **Addresses** are the directory's, with parts the source ran together
  separated ("BhopalBarkeri Kalan" -> "Bhopal, Barkeri Kalan") and a repeated
  part dropped.
- **Titles** about 60 characters: the library's name and city (or the book's
  title and first author) first, then "catalog" (or "find it in a library"),
  with " | MyBookshelf" only when it still fits. Descriptions fit 155
  characters and end at a full sentence (shorter forms are chosen, never cut).
- **Book titles** are shown in title case ("Malgudi days" -> "Malgudi Days";
  a word with other capitals is never changed). Open Library's earliest edition
  year is not shown: it is often a reprint.
- **Library structured data**: the page's URL, and a PostalAddress with the
  published library or campus address, its PIN when it has exactly one, the
  town shown, the state and IN. No official website (the directory has none).
- **Book slugs**: title and first author's surname; post-nominal letters
  ("F.R.S.", "Jr.") are not a surname. `correctBookSlugs` changes only a slug
  the earlier rule made ("grays-anatomy-s" -> "grays-anatomy-gray"), in the
  builder and when the checker loads the data file; vercel.json redirects the
  old address.

## The check

`tools/seo/library-shelves.mjs run` uses the same lookup as the app's book page
(`createCatalogLookup().lookupBook`, as `tools/diag-check.mjs` runs it, with
`CATALOG_LOOKUP_V2=all`): one any-field catalog search for the book's title and
the 80% title matcher in `server/services/libraryBookSearch.js`. Found means
that check found it on the date shown. Wrong finds are accepted as they are.

- Order: a public library is asked the general books first; an academic
  library (by its name) academic and general books alternately. Books already
  found at another library are asked first, so book pages are shared. A
  library stops at ten found or when every pool book is answered.
- Pacing: one request at a time per catalog host (`hostFor`: e-Granthalaya,
  LIBMAN, IndCat and shared Koha/discovery hosts each count once), a fixed
  30-second gap after each check on that host (`--gap`, never below 20), hosts
  in parallel. The app's robots.txt policy, host gate and access restrictions
  apply to every request.
- Failures: a couldn't-check answer is recorded as such, never as not found,
  and is asked again only on a later day. Any blocking sign (robots refusal,
  access challenge, login) or four failures in a row skips the host for the
  rest of the day (remembered in `<log>/hosts-skipped.json`); three in a row
  skip a library for the day.
- Resumable: every answer is written to `shared/seo-shelves.json` at once
  (sorted keys, deterministic). Stop the run at any time; the next run carries on.

## How to run

```sh
node tools/seo/library-shelves.mjs candidates          # choose the candidates
node tools/seo/library-shelves.mjs pool                # after editing the pool
node tools/seo/library-shelves.mjs run --log ~/shelves # all candidates, resumable
node tools/seo/library-shelves.mjs run --ids koha:a,egranthalaya:b --log ~/shelves
node tools/seo/library-shelves.mjs status              # progress and publishable count
node tools/seo/library-shelves.mjs details             # fill missing book details
npm run build                                          # pages, from the data
```

`run --refresh-before 2027-01-01` asks again every answer older than that date
(a failed refresh keeps the earlier answer). `--hours N` stops a run after N
hours. Logs go to `<log>/checks.jsonl` (library, book key, answer, reason,
duration; no reader search text).

## Adding libraries

Add or change candidates (edit the rules in `tools/seo/shelves-core.mjs` and
run `candidates`, or pass `--ids` for specific directory IDs), then `run`.
Pages appear on the next build once a library has five found books. A slug,
once given, is kept in `seo-shelves.json`. To take a library off, add it to the
`removed` list of `server/data/india-catalogs-listed.json` (or to
`EXCLUDED_IDS` in `shelves-core.mjs`); the builder then skips it.
