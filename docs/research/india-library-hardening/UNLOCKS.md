# How Indian library access was unlocked

Branch: `hardening-indian-libraries`. It carries the runtime fixes in `f29eeda`
and the complete evidence and replay tools in `d3ac08a`, originally developed
on `harden-india-top50-2026-11-14`. This branch adds this explanation without
changing the tested runtime or publishing a deployment.

The work repaired connections already present in the app's directory. A
successful check means a query found the intended catalog record, that record
resolved, and the app confirmed the selected institution's holding. The
[results](RESULTS.md) show 67 institutions with ten verified books, including
48 of the original 50. Outside that cohort, 612 connections passed at least
one book, including the 19 additional ten-book passes. Those totals include
libraries that already worked; they are not a count of newly repaired libraries.

## Repairs with concrete before-and-after evidence

| Library | What prevented the check | Change that restored the tested path | Verified result |
| --- | --- | --- | --- |
| University of Agricultural Sciences, Dharwad | Its native Koha URL was combined with obsolete IDEAL network branch and legacy-holdings settings. A native agriculture query returned zero results. | Removed the stale `UASD` branch restriction, legacy-holdings mode and old HTTP origin from the directory entry. | Ten eligible books queried and confirmed through the native catalog. [Koha evidence](koha-method.md). |
| Harekrushna Mahtab State Library, Odisha | Displayed titles combined separately indexed main titles, subtitles and Odia parallel titles. Slow member ISBN searches also exhausted the earlier probe budget. | Retry the main title once after a recognized empty result, preserving member/session checks and Indic vowel marks. Use a measured 35-second member probe inside a 45-second app budget; try the observed hyphenated ISBN spelling first. | Initial sample: one of ten attempts passed. Final strict result: ten distinct books after canonical-title rechecks and a replacement monograph; cold ISBN `9788185229461` passed in 27.0 seconds. One quoted full title still misses. [eGranthalaya evidence](egranthalaya-notes.md). |
| SRS Central Library, Jammu | Record `8147` was listed for the member but failed confirmation when its detail page had no visible local copies. Some ISBN probes timed out. | Confirm the exact record in a bounded main-title result set, retaining exact ISBN confirmation for ambiguous titles. Apply the measured 35/45-second budgets with the original ISBN order. | The previously failing record resolves and returns live catalog presence in about 11 seconds per stage. Eleven distinct books qualify overall; a cold runtime ISBN check passed in 21.4 seconds. Copy availability can remain unknown. [Record retest](egranthalaya-confirmation-results.json). |
| National Medical Library | A sampled ISBN failed within the earlier member-search timing budget. | Apply the measured 35-second member probe and 45-second app budget, preserving query order and cluster fallback. | Previously failing ISBN `9788185004051` passed with the actual directory configuration in 21.5 seconds. Ten distinct books qualify separately. [Runtime ISBN evidence](egranthalaya-nml-runtime-isbn-results.json). |
| Darshan University | A legitimate encrypted record ID, `O$$Sel08eL0=`, caused a public `India` search to fail validation. | Accept the observed `$` character in bounded record tokens while retaining the trusted origin/path checks and URL encoding. | Ten complete book checks passed. [Academic evidence](academic-notes.md). |
| Santhom Library, Paurastya Vidyapitham, Kottayam | Repeated spaces in stored titles caused the catalog's own displayed full title to return no result. | After a clean empty result, retry a bounded four-word prefix; keep the original record fingerprint and filter by the full normalized title. | The tested book's title query, record resolution and cold app lookup all passed. This is a one-book recovery. [Retest evidence](community-santhom-after-results.json). |

HKMS's final ten are a validated set of distinct books; the record and title
changes are preserved in the evidence. The result does not mean every original
failed title was repaired. National Medical Library's ambiguous series record
was excluded and replaced with a monograph, independently of its ISBN fix.

## LIBMAN: the specific additional connections recovered

LIBMAN stores some titles with repeated spaces and rejects certain punctuation
in queries. The old query handling could reduce `A+ Quizmasters Science` to
`A`, burying the intended book among unrelated results. Another record was
decoded differently by the search and detail parsers.

The adapter now selects a useful permitted contiguous title segment. After a
recognized empty phrase result, it can retry one substantial word and retain
only full-title matches. Both search and detail normalize the observed two
layers of HTML entity escaping consistently. Tenant and exact record-ID checks
remain mandatory; an error or refusal does not trigger broader searching.

| Connection | Library | Recovery demonstrated |
| --- | --- | --- |
| `libman:178` | Yashwantrao Chavan Mahavidyalaya, Halkarni | Repeated-space title recovery. An earlier separate zero-request timeout also exposed the bulk queue/deadline issue described below. |
| `libman:181` | Smt. Rewaben Manoharbhai Patel Mahila Kala Mahavidyalaya | Repeated-space phrase recovery. |
| `libman:283` | Late Karmaveer Dr. P. R. Ghogrey Science College, Dhule | Repeated-space phrase recovery. |
| `libman:491` | Mohamed Sathak AJ College of Pharmacy Library | Repeated-space phrase recovery. |
| `libman:515` | Smt. Sushiladevi Deshmukh College, Latur | Repeated-space phrase recovery. |
| `libman:663` | Appasaheb Girdhar Eknath Mali Arts, Commerce and Science Junior College, Taloda | Repeated-space phrase recovery. |
| `libman:84` | Shri Samarth Arts and Commerce College | Repeated-space phrase recovery. |
| `libman:798` | Ashok Hall Girls' Higher Secondary School | Useful punctuation handling: `A+ Quizmasters Science` searches `Quizmasters Science`. |
| `libman:255` | J. M. Patel Arts, Commerce and Science College | Consistent entity decoding preserves the same displayed title through search and record resolution. |
| `libman:599` | H. R. Patel Girls Secondary School, Shirpur | Evidence correction: the initial “Book” was actually a journal. A separate query verified *Instant English*, record `5531781`. This is a replacement eligible book, not an adapter repair. |

All ten follow-ups passed an individual query, exact record read and cold app
lookup. The original sweep's 457 claimed passes became **455 strict passes**
after excluding the title mismatch and journal. With the ten follow-ups, the
final result is **465/632 connections verified**, with 167 unconfirmed. These
are one-book checks. See the [method](libman-method.md),
[original attempts](libman-sweep-results.json) and
[separate follow-ups](libman-followup-results.json).

The new token fallback is verified for the observed English titles. Queries
with Indic combining marks retain their previous behavior and do not enter
that fallback; this audit does not establish full Indic-language LIBMAN search.

## Shared changes that make the connections reliable

- **IndCat:** retain authors from each search row and briefly reuse ownership
  evidence only for the same institution and record. This avoids redundant
  verification requests while rechecking membership after cache expiry. MARC
  format handling also prevents explicit serials from being counted as books.
  The campaign verified 43 scopes with ten books each and 30 more with one.
  These are post-change observations, not 73 newly unlocked institutions.
  [Method and independent audits](INDCAT.md).
- **Academic ISBN checks:** stop after a proven exact positive instead of
  starting another equivalent ISBN session. Incomplete variant coverage cannot
  claim complete copy totals or universal unavailability. Darshan's incomplete
  ISBN index cannot prove absence from an empty search.
- **Alternate catalogs:** use the actual contacted host's request budget,
  deadline, rate limit, concurrency and circuit state, while preserving the
  institution and record identity. A cold Mizoram University check used its
  native academic route and returned a live holding in three requests with
  correct host attribution. Regression tests reproduce and prevent an
  alternate's failure being charged to IndCat or a successful record read
  damaging host health. [Route evidence](academic-route-verification-results.json).
- **Cancellation and queue waits:** stop provider work before releasing a timed
  out record-read slot. Clamp host-slot waits to the app's actual operation
  deadline, so the app's own exhausted quota reports “busy” instead of falsely
  marking the library unavailable. This addressed the bulk-survey timeout
  observed at LIBMAN and protects ordinary reader operations too.

These changes are in [directory configuration](../../../server/data/india-catalogs.json),
the [provider adapters](../../../server/services/providers/), and
the [lookup execution layer](../../../server/services/catalog-lookup/).
The [validation handoff](VALIDATION.md) records 814 passing server tests,
24 database-dependent skips, and 13 passing audit-tool tests from the completed
implementation. This branch's additional change is documentation only.

## What is still unresolved

National Science Library's catalog hostname was corrected to
`opac.niscair.res.in`, but it and IIT Madras remained unreachable from the
execution environment. Neither is counted as a successful unlock. IIT Roorkee
and Anna University are separately verified reserves; the original failed
members remain in the frozen denominator.

Kerala University and Mahatma Gandhi University's preferred KALNET route could
not be queried when its robots endpoint returned HTTP 503. The real app wrapper
successfully fell back to each institution's IndCat route. This proves the
fallback path; KALNET itself remains unverified.

The wider eGranthalaya sweep passed 26/30 entries. Amiruduala, Bharathiar, Patna
and Lalit Narayan Mithila's tested member routes published zero records, so
those connections remain unconfirmed. Their physical collections may be large.
Other families retain blocked, unsupported and unattempted entries in
[coverage.csv](coverage.csv); untested connections are not inferred to work.

Existing Vercel rules enable deployments only for `main` and `staging`.
`hardening-indian-libraries` is excluded. The branch push runs GitHub checks
without a deployment step; no merge or release is included.
