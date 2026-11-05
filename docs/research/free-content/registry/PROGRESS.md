## 2026-11-05: current policy, reader and version evidence

Current checkpoint: **61 source records, 150 current verified examples across 15 catalogs, zero complete expanded dossiers.** Four prior catalog identities now have explicit candidate/deferred dossiers: NARA Catalog, US Data.gov, GovInfo and ROSA P. They add no verified query examples. Forty-six catalog identities (51 references), 31 named organizations and 22 URL leads still need resolution.

A separate 21-job reader/policy pass finished with 20 captured responses and one robots-timeout skip (Bharat Skills). OTL 10/22 now have canonical edition/language/license evidence plus MIT/Saylor reader samples; five topical searches retain 21 manual metadata judgments and practical-versus-pedagogical limitations. Two 1,910-record exports had the same hash; that does not verify deletion handling. OTL and Europe PMC's existing ten queries each re-passed without double-counting. Europe PMC now preserves publication types, item license labels, correction relationships and unknown retraction flags. Two rendered reader attempts failed because of cloud Chromium CA trust; these are environment failures, not proof of provider denial.

SWAYAM's current terms prohibit scraping, so that route is deferred. DIKSHA's Sunbird software license is not a hosted catalog access grant. NPTEL's NC license-label inconsistency and optional certificate fee remain explicit. NARA/Data.gov key requirements are recorded without provisioning accounts or using an inappropriate demo route. Historical section findings are retained in `analysis/dossier-reviews.jsonl`; short policy excerpts link exact primary-document hashes and job IDs. No production source activation changed.

The original 153-job documentation worker remains complete: 121 captures, 30 skips, one HTTP 403 and one timeout, final pushed worker checkpoint `dd2b8a5` at 02:46:35 UTC. Its status reporter was disabled after the final report; the broader completion task remains enabled. The registry/evidence audit and all 23 tests pass. A test initially collided with the active research lease; its lock fixture now uses a temporary file, leaving the real worker lock intact. Resume from the goal cursor and audits; documentation capture, repeat checks and candidate counts are not full source qualification.

## 2026-11-05: lead triage, scholarly queries and explicit completeness gaps

Current checkpoint: **57 source records; 150 current verified examples across 15 catalogs; zero complete expanded dossiers.** Europe PMC adds ten actual DOI queries, with topic/empty/pagination observations and correction/editorial limitations retained. OTL adds ten local queries over a supported CC0 metadata export. Existing production activation is unchanged.

All 138 preexisting URL leads now have explicit roles/decisions. Fifty candidate catalog identities (56 references) remain unmapped. Five G02 dossiers cover MIT OCW, SWAYAM, Bharatavani, Bharat Skills and NPTEL, with unsupported retrieval/rights modes explicit. Read the Docs search was skipped under its robots rule. The Book Dash partner excerpt contributed 35 named organizations (31 unresolved) and 22 additional URL leads, with no new qualified-origin count.

`coverage-audit.json` exposes per-document capture hashes, unresolved entity mappings, pending historical/current named-entity review, missing dossier fields and all 18 USA/India civic coverage cells. M0 is open until entity completeness is established; prior document-capture completion must not be confused with that stronger requirement. Missing capture hashes, partial sections, open questions and historical-only evidence cannot establish completion. Issues #164–170 are updated and archived. Registry/evidence checks and 23 research tests pass. Continue from the goal cursor; the recurring completion goal remains open.

## 2026-11-05: completed documentation pass and textbook metadata queries

The primary-document queue finished all 153 jobs: 121 captured responses, 30 policy/access skips and two request failures. Skips and failures remain saved; a captured page is not a qualified source. The process exited and its final checkpoint is `dd2b8a5`.

Open Textbook Library adds ten actual title searches over its documented CC0 CSV metadata export (1,910 records, 2,735,950 bytes). Five boundary/topic observations preserve empty results and unsupported full-text behavior. Total: 52 source records, 140 verified examples across 14 catalogs. Reader destinations, content rights, language/country coverage and full qualification remain open. Registry/capture/audit checks and 20 unit tests passed.

# Source registry checkpoint

Observed 2026-11-05 UTC. Research branch `research/free-content-discovery-expansion`,
[PR #161](https://github.com/ddk220-light/MyBookshelf-web/pull/161).

**52 source records; 13 have ten verified query examples each (130 total).**
The original ten are included, followed by Wikipedia, Wikibooks and Python
documentation from G02. Nine alternatives are deferred; 30 additional catalog
records were backfilled from historical analysis and require reconciliation.
All 36 rows of the earlier source catalog now map to individual catalog/family
records. A family record is not counted as a qualified independent origin.
The separate discovery inventory contains **138 links** from the existing plan;
it includes directories and documentation, not 138 qualified sources. All 49
content/industry/public-information areas are tracked. No production source is
qualified or enabled by this research.

The completion pass captures 59 text/evidence files (including the seven-issue
backlog snapshot) and indexes 156 existing screenshots. Full text, hashes and
source-specific passages live inside the JSON collection. All source dossiers
expose eight analysis sections and their remaining questions. Capturing existing
analysis is complete for the declared repository/backlog scope; no source dossier
is yet declared fully complete under the expanded audit. The recurring execution
task is enabled hourly. Its immediate-run endpoint failed with HTTP 404, so this
pass was performed directly in the conversation rather than deferred.

## Current query evidence

| Source | Group | Current successful cases | Query evidence |
| --- | --- | --- | --- |
| [African Minds](sources/african-minds.json) | G01 | 10/10 | [observations](examples/african-minds.jsonl) |
| [Biodiversity Heritage Library](sources/bhl.json) | G01 | 10/10 | [observations](examples/bhl.jsonl) |
| [Global Digital Library](sources/gdl.json) | G01 | 10/10 | [observations](examples/gdl.jsonl) |
| [LibriVox](sources/librivox.json) | G01 | 10/10 | [observations](examples/librivox.jsonl) |
| [Library of Congress digital books](sources/loc.json) | G01 | 10/10 | [observations](examples/loc.jsonl) |
| [LSE Press](sources/lse-press.json) | G01 | 10/10 | [observations](examples/lse-press.jsonl) |
| [Mattering Press](sources/mattering-press.json) | G01 | 10/10 | [observations](examples/mattering-press.jsonl) |
| [mediastudies.press](sources/mediastudies-press.json) | G01 | 10/10 | [observations](examples/mediastudies-press.jsonl) |
| [punctum books](sources/punctum-books.json) | G01 | 10/10 | [observations](examples/punctum-books.jsonl) |
| [Wikibooks](sources/wikibooks.json) | G02 | 10/10 | [observations](examples/wikibooks.jsonl) |
| [Wikipedia](sources/wikipedia.json) | G02 | 10/10 | [observations](examples/wikipedia.jsonl) |
| [Wikisource](sources/wikisource.json) | G01 | 10/10 | [observations](examples/wikisource.jsonl) |
| [Python documentation](sources/python-docs.json) | G02 | 10/10 | [observations](examples/python-docs.jsonl) |

The history also retains **8 unsuccessful query observations**, including
queries later revised. Only the latest successful observation of each current,
distinct request counts. Separate scouting/access files do not inflate this total.

The suites mainly demonstrate known-title retrieval. LoC uses ten short subject
queries with previously observed, title-matched native book IDs. These are small
retrieval checks, not the full five-known-item/five-topic relevance benchmark.
Book/volume/recording identity remains explicit. Item-level access and rights must
still pass qualification before implementation.

## Findings carried forward

- GDL: title punctuation can affect matching; a distinctive title word found the
  missed apostrophe-containing title. Blank queries returned mixed languages and
  content types despite a language parameter. Validate item language/type and
  relevance. The current suite includes a Hindi query and nine English queries.
- Wikisource: generic **Pride and Prejudice** resolved to a title page that search
  did not return in its first five results. The revised case explicitly targets
  the observed 1817 edition. Historical Tamil reading evidence remains linked.
- BHL: journal-title queries returned different issue IDs. Current examples
  replace those two with known book titles; retain the failed issue observations.
  The collection also includes reports, field notes, reviews and serials, so item
  type and whole-book filtering remain required.
- LoC: long congressional-report titles and one short physics request were slow
  or timed out. Ten other short subjects returned the expected digitized books;
  successful samples do not prove general reliability.
- Wikibooks: `intitle` searches for French/Spanish surfaced other pages; ordinary
  keyword searches returned the known book roots. Do not assume every title-only
  operator improves ranking or every book is complete.
- Wikipedia and Wikibooks: official copyright pages exposed CC BY-SA 4.0 terms.
  Actual Mathematics article content and a linked Calculus/Differentiation chapter
  returned parsed HTML, anonymously. See their access evidence files. This is not
  a whole-site accuracy, accessibility or rights certification.
- Five publisher origins share the Thoth connector. Results must retain work
  identity/license and use approved canonical digital locations; print/retail or
  unreviewed mirror links are excluded from the stored canonical-link samples.
- Python documentation: the official Python 3.15 Sphinx inventory supplied 20,490
  entries. Ten exact-symbol searches resolved native symbol/type IDs to versioned
  page anchors, including `pathlib.Path`, `sqlite3.connect` and `json.loads`.
  The official license and inventory documentation were reviewed; representative
  library pages exposed the expected symbols anonymously. This is metadata import
  plus local symbol search, not general topic/full-text search. Other languages,
  versions and broader quality/access/refresh questions remain explicit.

## Deferred candidates

- [Gallica / Bibliothèque nationale de France](sources/gallica.json): Live SRU request returned HTTP 403.
- [Helsinki University Press](sources/helsinki-university-press.json): Sampled records lacked canonical digital locations.
- [Lever Press](sources/lever-press.json): Selected active-book query and small catalog probe returned no works.
- [The Marg Foundation](sources/marg-foundation.json): Sample had paperback location only; no free digital edition established.
- [NCBI Bookshelf](sources/ncbi-bookshelf.json): Sample reading destination returned browser verification; full-text crawl is not authorized by API search support.
- [NCERT](sources/ncert.json): Catalog returned HTTP 503 in this environment.
- [Open Book Publishers](sources/open-book-publishers.json): Sample canonical PDF presented human verification; alternate OAPEN challenged and Cambridge route was denied by environment proxy.
- [OpenStax](sources/openstax.json): External use support for tested CMS route remains unestablished; overlaps Open Textbook Library.
- [Project Madurai](sources/project-madurai.json): Permission and maintained machine-query or metadata-import route remain unproved.

## Next work and completion boundary

Continue G02 with technical documentation, current curricula, courses and vocational
knowledge, then G03–G06. Triage linked and unlinked playbook leads, deduplicate
origins and measure overlap with existing app catalogs. Current India-operated
school-textbook coverage is still a gap; Hindi/Tamil or historical India content
is not a substitute. Public-record/map work needs USA/India jurisdiction pairs.

The first-ten evidence milestone is complete. Triage of all known leads and the
long-term 100-origin-per-category/industry target remain open. The goal and actual
continuation configuration are in [goal.json](goal.json). Do not label the whole
internet inventoried or this goal complete merely because these files exist.

Validation: offline registry validation, corpus completeness/provenance audit,
14 evidence/inventory/capture unit tests and
`git diff --check`. Network observations above are actual requests, not mocks.
Application tests/deployment were not needed: no runtime code or manifest changed.

## 2026-11-05 partner-lead checkpoint

All 22 previously untriaged URLs in the saved Book Dash partner excerpt now have
explicit role/decision reviews. App-store listings, directories, offline products
and opaque shortlinks remain leads; Worldreader's bot/mobile pages and duplicated
app/editorial links are not separate origins. African Storybook maps to its
existing record. Canonical operators and supported retrieval are still open for
the other catalog candidates; no new source or verified example is counted.
Ten distinct unresolved catalog/operator documentation leads are queued in
`runs/partner-leads-20261105/`. HTTP variants are proposed HTTPS candidates, not
verified canonical URLs. New evidence requests preserve redirects for review
instead of silently crossing to a route with unreviewed policy.

## 2026-11-05T04:31:47.556068+00:00 — partner outcomes and Census authentication

All ten partner jobs are analyzed: one captured, seven skipped, two blocked/failed. Nal’ibali is a catalog candidate, not query-qualified. Census API examples now explicitly require a key for every data query; three policy/schema documents are captured, with no data call or account creation. Both catalog identities have partial eight-section dossiers and exact blockers. Canonical redirects are leads needing independent policy review; 403/503 hosts remain deferred. Existing observations and historical claims are retained.
