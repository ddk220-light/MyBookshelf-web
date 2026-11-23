# e-Granthalaya public fixture provenance

Captured 2026-10-03 from `https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=PUBLICLIBRARIES`
and the public holdings popup. Requests identified as MyBookshelf. No patron login,
CAPTCHA completion, private account data, or authenticated browser state was used.

- `form.html`: the actual anonymous form controls, with every nonempty opaque hidden
  value replaced by `fixture-state` and library options reduced to the pilot names.
  The runtime must obtain its own fresh form and anonymous ASP.NET session.
- `search-hit.html`: exact ISBN **978-81-313-1345-9**, scoped to **HKMSLIB**;
  record **519750**, title *101 great lives who shaped the world*, format Print.
  The search took **22.29 seconds**, after a **4.02-second** form request.
- `holdings-available.html`: record 519750, the actual public `GridView1` structure,
  including its nested tooltip table. **One** copy at **HKMSLIB**, status **Available**,
  class/book number **BC SRI-K**, shelf **SLIC**, collection **R**. The public detail
  request took **3.08 seconds**. No cookies, viewstate, contact information, or patron
  data are retained. Accession IC2340 identifies a public library copy.
- `search-empty.html`: a second, scoped **CCLSZJYNGR** (Bengaluru Jayanagar) lookup
  for **978-81-7371-146-6** returned zero in **11.16 seconds**. This is deliberately
  treated as unconfirmed, not proof that a library lacks the book.

The unavailable, wrong-ISBN, incomplete-table and unfamiliar-status cases in tests
are explicit mutations of these fixtures. They are not claimed as additional live
observations. The first record was located by one bounded cluster-wide lookup
(61.78 seconds); the shipped provider always selects one library and never repeats
that discovery operation.

Harekrushna Mahtab State Library is a reference/research library, and its official
Odisha government description says lending is not permitted:
https://rtiodisha.gov.in/Pages/printManual/section_id%3A2/office_id%3A301/lang
The seed and returned format preserve that restriction.

## Romain Rolland Library, Puducherry (PYLIB:RRLPY)

Saved 2026-11-12 from `https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=PYLIB&LIB_CODE=RRLPY`
and its public `Details.aspx` record pages, one anonymous request at a time. Scripts,
styles, images, presentation attributes and every opaque hidden value were removed
(`fixture-state`); form controls, result rows and holdings tables are as served.

- `rrlpy-form.html`: the member landing page and anonymous search form (16.4 s).
- `rrlpy-search-wings-of-fire.html`: ALL/LIKE search, 5 records (11.0 s).
- `rrlpy-search-ponniyin-selvan-tamil.html`: பொன்னியின் செல்வன், 124 records, first 20 rows (23.1 s).
- `rrlpy-search-ponniyin-selvan-latin.html`: "ponniyin selvan", 8 records (13.2 s).
- `rrlpy-record-79863.html`: *Wings of Fire: An Autobiography*, one RRLPY copy,
  Available, class/book number V2,1Y7N31P3 (1.8 s). It was the second read of this
  record; the first read, 9 s earlier, was `rrlpy-record-79863-empty.html`.
- `rrlpy-record-79863-empty.html`, `rrlpy-record-101722-empty.html`: the empty record
  page (right form action, blank fields, no holdings table). Record 101722 came back
  empty on all three reads in three sessions. Across three PYLIB/PUBLICLIBRARIES
  libraries 10 of 13 record reads were empty; the cause is not known.

## Displayed subtitles (15 November 2026)

`hkms-subtitle-search.html` is a reduced regression fixture with the title,
record ID and copy count of HKMSLIB record 526126, captured from the member's
public `India` search. Its one-result count and selected-member controls are
constructed for the test; it is not a complete saved response. The live full
displayed-title query returned a scoped zero; a separate main-title query
returned this exact record. The fixture tests bounded
main-title recovery, fresh form/session state and unchanged member scope.
Live before/after evidence is in `docs/research/india-library-hardening/`.

## Title and ISBN search fields (19 November 2026)

Saved like the Romain Rolland pages (scripts, styles, images and presentation
attributes removed; every opaque hidden value is `fixture-state`), one request
at a time, a few seconds apart.

- `dlsitapur-form.html`, `dlsitapur-isbn-zero.html`, `dlsitapur-title-wings-of-fire.html`:
  Government District Library, Sitapur (UPLIBRARIES:DLSITAPUR). ALL/OR
  "817371146 81-7371-146" returned 0 records (4.5 s); TITLE/LIKE "Wings of Fire"
  returned the shared records 79083 and 451490, both showing ISBN 9788173711466
  (4.5 s). The same day ALL/LIKE "Wings of Fire" also returned 0 here.
- `srsjammu-form.html`, `srsjammu-title-wings-of-fire.html`, `srsjammu-all-wings-of-fire.html`:
  SRS Central Library, Jammu (JKLIBRARIES:SRSJAMMU). TITLE/LIKE "Wings of Fire"
  returned 0 (2.1 s); ALL/LIKE returned the member's record 31499 with ISBN
  9788173711466 (7.5 s).

So a member's TITLE search finds the records it holds copies of (shared
records included) and its ALL search the records it catalogued itself; the
adapter's title search runs both. Also observed: OR with ALL matches any of
the words (an ISBN's plain and hyphenated digits in one search); a POST built
from a form page fetched 15 minutes earlier, sent without a session cookie,
was answered normally; searches of "All Libraries" in UPLIBRARIES took 26 to
95 s, so the adapter no longer uses them.
