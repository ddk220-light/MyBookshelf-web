# Nigeria continuation: additional catalogs

Checked 2026-11-15T07:10:57.400544+00:00.

Three additional institutions returned actual title searches and bibliographic records. These are verified integration candidates, **not demonstrated members of Nigeria’s ten largest libraries**: current physical collection totals are missing. Keep them as reserves unless the final shortlist explicitly separates scale from technical feasibility.

| Institution | Actual query and result | Holdings | Platform / access |
|---|---|---|---|
| Nigerian Institute of Social and Economic Research Library | [Nigeria: Crisis and Beyond](https://publications.niser.gov.ng/library/opac/initial/) → Nigeria: Crisis and Beyond; JOHN OYINBO; record 819 | NISER LIBRARY selected; Shelf Number13; classification966.9OYI. Detail says Call Numbers: Not Registered. No loan status stated. | ERAILS custom Django OPAC; HTTP 200 |
| Bishop Gabriel Oloniyo Public Digital Library / Ekiti State Library Board | [English for Business Communication](https://opac.ekitistatelibrary.org/cgi-bin/koha/opac-search.pl?idx=ti&q=English+for+Business+Communication) → English for Business Communication (Routledge Applied English Language Introductions).; Chan, Mable; record 50 | Bishop Gabriel Oloniyo Public Digital Library, Ekiti State; General stacks; call number808.066; Available; barcode2026-0050. | Koha; HTTP 200 |
| Mountain Top University Library | [Introduction To Conflict Resolution](https://opac.mtu.edu.ng/search?idx=ti&q=Introduction+To+Conflict+Resolution) → Introduction To Conflict Resolution; COBB, Sara, FEDERMAN, Sarah And CASTEL, Alison; record 9204 | Main Library; Main Stacks; Books; JZ5538.C63; barcode/accession09907; accession date2026-09-18; Available. | Lopac (current OPAC footer; older library webpage mentions Koha); HTTP 200 |

## Size and network interpretation

- **NISER:** Federal research institute on an official `niser.gov.ng` subdomain. Physical volume total is unknown. The 13K+ resources counter concerns external OER and must not be interpreted as locally held books. The verified OPAC itself identifies NISER LIBRARY.
- **Ekiti public library:** State government confirms the Bishop Gabriel Oloniyo library’s inauguration in July 2024. Its board page describes a state-owned public service and responsibilities for local/school libraries, but only one branch is proven in this catalog. No collection volume count found. [Government announcement](https://www.ekitistate.gov.ng/archives/29079), [board page](https://opac.ekitistatelibrary.org/cgi-bin/koha/opac-page.pl?page_id=6).
- **Mountain Top University:** Four library options are displayed: Main, CBAS, CHMS and Medical. A Main Library facet displays 11,722 on two one-result queries; unrelated author facets show that these facets are global-looking. This is an observed catalog display, not an audited physical collection count. The tested book has one Main Library item.

## Integration implications

- Ekiti is another conventional Koha HTML catalog and likely fits existing adapter patterns. An exact title query redirects directly to its record, so the parser must handle either a results page or a detail page.
- NISER uses a custom ERAILS/Django interface. Its anonymous search POST redirects to a reproducible GET with `attr=Title&type=Book&search=...`; both returned the requested book. No current circulation status is exposed on the tested record.
- Mountain Top uses **Lopac** in the current footer. Earlier official library material describing Koha should not be used as the current platform label. Its `/search` and `/record/` routes explicitly permit crawling. The robots file disallows queries with `sort=` or `branch=` and patron/auth routes; no prohibited query was requested.

## Negative checks and rejected shortcuts

| Institution | Outcome | Evidence |
|---|---|---|
| Ekiti State University | Official homepage points to eksuvirtuallibrary.com; robots and homepage400 Invalid URL. No book query success. | [eksu-robots](evidence/eksu-robots.html) |
| BOUESTI | Robots503; no catalog query attempted. | [bouesti-robots](evidence/bouesti-robots.html) |
| Osun State University | Official library site and main university /library route proxy403; no catalog verified. | [uniosun-home](evidence/uniosun-home.html) |
| Delta State University | Current host returns only libb; older official page available but no public OPAC identified. | [delsu-home](evidence/delsu-home.html) |
| Nigeria Governors Forum | Robots repeatedly timed out, including www; stopped before search. | [ngf-robots-retry](evidence/ngf-robots-retry.html) |
| Benue State University | Official library homepage503; no public catalog verified. | [bsum-home](evidence/bsum-home.html) |
| IITA | Former official Knowledge Center route404; main site timeout. Third-party110000-record claim cannot establish current working catalog. | [iita-home](evidence/iita-home.html) |
| Federal University of Agriculture Zuru | Official link to opac.fuaz.edu.ng; robots proxy403. No query attempted. | [fuaz-robots](evidence/fuaz-robots.html) |
| Standards Organisation of Nigeria | Working specialist standards sales/subscription portal; not verified as local book holdings catalog. | [son-home](evidence/son-home.html) |
| Naijacat Virtual Union Catalogue | Homepage marketing millions/60+ conflicts with actual4 libraries/3 entries including demo. No production network count accepted. | [naijacat-home](evidence/naijacat-home.html) |
| Lagos Business School | Robots404 but exact title query200 Anubis anti-bot page; stopped, no bypass. | [lbs-query](evidence/lbs-query.html) |
| Landmark University | Official homepage503; no current catalog verified. | [lmu-home](evidence/lmu-home.html) |
| African University of Science and Technology | Robots503; stopped before query. | [aust-robots](evidence/aust-robots.html) |
| Rivers State University | Official library homepage503; no public catalog verified. | [rsu-home](evidence/rsu-home.html) |
| Sule Lamido University | Official resource page links NewGenLib route; robots404; actual /opac/search title query404. Official source warns campus network/VPN may be needed. | [slu-opac](evidence/slu-opac.html) |
| Crawford University | Official page mentions remote OPAC, but only e-resources link found; no local book query verified. | [crawford-home](evidence/crawford-home.html) |
| Nigerian Baptist Theological Seminary | Official library page mentions OPAC; Catalogue nav is academic program PDF, not library query; no public OPAC found. | [nbts-catalog](evidence/nbts-catalog.html) |
| Fountain University | Robots404, two real title queries Things fall apart/Economics both zero. No success counted. Official scope roughly2000 students+200 staff,140 seats; not national-largest. | [fuo-query2](evidence/fuo-query2.html) |
| Sikiru Adetona College of Education Science and Technology | Robots404, two title queries Things fall apart/Education both zero. No success counted. | [sacoetec-query2](evidence/sacoetec-query2.html) |
| Federal University of Health Sciences Ila Orangun | Robots timeout; no query attempted. | [fuhsi-robots](evidence/fuhsi-robots.html) |

Naijacat’s landing page illustrates why marketing totals cannot establish a library network: it claims millions of books and 60+ libraries, while its actual counter says four libraries and three catalog entries and includes a demo institution. It was not counted.

Robots 404 is recorded as no published policy rather than affirmative institutional permission. Server failures, zero-result searches, anti-bot responses and internal-only routes do not count as successful integrations. No authentication, anti-bot circumvention, private IPs, patron actions or certificate bypasses were used.

Raw responses and request metadata are under `evidence/`; the machine-readable consolidated result is [evidence.json](evidence.json). The parent country researcher owns the final country shortlist.

## Focused size follow-up

A bounded published-source pass established that NISER had about **18,000 bound volumes in January 1972**, in a Library of Congress report published 1973. This is historical context, not current inventory. Current totals for NISER and Ekiti remain unknown. See [size-evidence.md](size-evidence.md) and [size-evidence.json](size-evidence.json) for dated measurements and excluded misattributions.
