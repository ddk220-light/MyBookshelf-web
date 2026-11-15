# Nepal library catalogue feasibility — 15 November 2026

**9 institutions returned actual books from submitted title queries: 6 selected targets and 3 reserves. The ten-selected target is short by 4.** Fifteen major priorities remain visible below, including large collections whose catalogues could not be queried. This is a feasibility selection, not a national largest-ten ranking.

The strongest immediate opportunity is **Koha reuse at Kathmandu University, Lumbini Buddhist University, Keshar Library and Thapathali Campus**. A session-aware PMB extension would add Dilliraman and three reserve collections. Prithvi Narayan's substantial regional collection needs a separate public JSON/HTML adapter. No product configuration, app integration, authentication, holds, outreach or deployment was performed.

## Marketplace and shared-service opportunity

Nepal's institutions serve different reader groups: national and government heritage libraries; universities and separately managed campuses; independent social-science research libraries; special government libraries; cultural institutes; and geographically distributed community libraries. Public catalogue access does not settle entry, membership or borrowing rights. Martin Chautari, for example, explicitly provides reading-room access without membership against a valid ID and keeps books on premises. [Official library description](https://www.martinchautari.org.np/library).

Koha is observed directly in four successful deployments. Kathmandu University's own account describes its progression from CDS/ISIS to SOUL to Koha and says that Koha integrates its central and school libraries. Its search response proves school-specific holdings; this dossier counts the university network **once**. Lumbini's centralized catalogue likewise names three libraries, but this book query proves the Central Library only. [KU source](https://ku.edu.np/library), [LBU catalogue](https://opac.lbu.edu.np/).

PMB is directly observed in four other successful public catalogues, including a government memorial library. Nepal Knowledge Center Services documents PMB and Koha support; that is useful implementation-partner context, not a national market-share estimate. Pokhara's current official page instead names **Mumolas and RFID**, with more than 42,000 mixed volumes; older official descriptions name LIBRA or smaller collection totals. Neither a vendor demo nor an unrelated Mumolas public library can stand in for Pokhara. [NKCS PMB](https://nkcs.org.np/wpress/index.php/pmb/), [Pokhara library](https://pu.edu.np/students/library/).

NeLIC offers an institutional coordination opportunity, particularly for licensed scholarly resources. EIFL's current profile lists **101 members**, while an older facts panel on the same page says **62 institutions**. These are not a consistent census and are not physical-book union coverage. The historical EIFL virtual-union pilot combined MPP, Martin Chautari and Social Science Baha using Koha/Z39.50. Its past success does not establish a working national endpoint today. The National Digital Library's indexed page expressly labels itself a preview with sample content; its robots request failed here. Repositories such as DSpace, ICIMOD's InvenioRDM and journal platforms such as NepJOL are separate from book-copy catalogues. [EIFL Nepal](https://eifl.net/country/nepal), [historical VUC project](https://eifl.net/node/614), [NDL](https://ndl.gov.np/).

## Major library priorities

Counts keep their original unit and date. “Undated” means the page supplied no collection-count date; it was consulted on 15 November 2026. Indexed official claims are retained in [indexed-sources.json](evidence/indexed-sources.json) and are not query successes.

| Priority institution | Size evidence or institutional proxy | Outcome |
|---|---|---|
| Tribhuvan University Central Library | [2024/25 annual report](https://portal.tu.edu.np/publications/455/AnnualReport2024_20252081__2026_04_08_16_54_14.pdf): 461,565 document volumes, mostly books; indexed official | Robots request failed with tunnel 403; no query |
| Nepal National Library | [Official catalogue](https://catalog.nnl.gov.np/), indexed: 68,909 titles / 83,291 items; undated | Robots 503; no query |
| Prithvi Narayan Campus Western Regional Library | [Official page](https://prnc.tu.edu.np/pages/library-1524): more than 83,000 book volumes, over 2,800 dissertations separately; undated | Selected; custom public catalogue |
| Kathmandu University | [Official page](https://ku.edu.np/library): central library more than 60,000 book volumes; network total unknown; undated | Selected; Koha network counted once |
| Pokhara University Central Library | [Official page](https://pu.edu.np/students/library/): more than 42,000 mixed volumes, 3,000+ members; undated | Mumolas confirmed; public query route unresolved |
| Social Science Baha | [Official library page](https://soscbaha.org/library/), indexed: over 45,000 mixed items; undated | Catalogue robots 403 challenge |
| Madan Puraskar Pustakalaya | [Official collection page](https://madanpuraskar.org/collection-development-2/), indexed: 36,670 monograph titles in prose versus 30,000 monographs in its table; undated | Direct page challenge; current catalogue unverified |
| Keshar / Kaiser Library | [Government introduction](https://klib.gov.np/content/4/kaiser-library/), dated 5 Jestha 2083: national public heritage-library proxy | Selected; official public IP Koha |
| Dilliraman-Kalyani Regmi Memorial Library | [2011 national report](https://www.ndl.go.jp/en/cdnlao/meetings/pdf/CR2011_Nepal.pdf): 30,000 books and journals; historical | Selected; PMB; exact book is listed with “No copy” |
| Purbanchal University Central Library | [Official university account](https://purbanchaluniversity.edu.np/about): central-library building; numerical count unknown | No public search route established |
| Martin Chautari | [Official page](https://www.martinchautari.org.np/library): over 27,000 books/theses/reports and about 450 Nepali journal titles; undated | Official catalogue link leads to Apache default page |
| Thapathali Campus | [Live catalogue home](https://library.tcioe.edu.np/cgi-bin/koha/opac-main.pl): 30,792 books/manuals/documents on check date | Selected; Koha |
| Lumbini Buddhist University | [Live catalogue home](https://opac.lbu.edu.np/): 14,300 titles / 23,096 items on check date | Selected; Koha network counted once |
| Kathmandu Valley Public Library | [2011 national report](https://www.ndl.go.jp/en/cdnlao/meetings/pdf/CR2011_Nepal.pdf): over 45,000 books/reports/periodicals; historical | Query route unresolved; [August 2026 reopening report](https://kathmandupost.com/national/2026/08/05/kathmandu-valley-public-library-reopens-after-114-day-closure) prevents treating earlier closure reports as current |
| Nepal Health Research Council | [Official catalogue about page](https://opac.nhrc.gov.np/pages.pl?p=about), indexed: national health-research library; count unknown | Robots explicitly disallows generated searches |

Keshar's official narrative prints “270,000” books/periodicals collected during its founder's lifetime. This ambiguous historical statement is retained in the raw source, but **not used as a current collection-size claim**. Thapathali's indexed homepage had a different dynamic number; the retained live response says 30,792. These issues, the MPP discrepancy and mixed measurement units rule out a defensible national size ranking.

## Actual title-query results

All nine search requests returned HTTP 200. Exact UTC timestamps, methods, submitted payloads, HTTP/effective URLs, raw bodies, record identities and policy observations are in [findings.json](findings.json). GET links below are the actual query or detail route. POST evidence is linked to its local request metadata, not disguised as a replayable GET.

| Institution / selection | Submitted query and observed result | Copy evidence and integration issue |
|---|---|---|
| Kathmandu University — selected | GET [The wealth of nations](https://opac.ku.edu.np/cgi-bin/koha/opac-search.pl?idx=ti&q=The%20wealth%20of%20nations), 9 results. Adam Smith, record **46705**, Bantam Classic 2003 | School of Management: 1 available; School of Arts: 1 in transit. Subsequent detail returned **500**, so rely on the retained search response and keep detail reliability open |
| Lumbini Buddhist University — selected | GET [What the Buddha taught](https://opac.lbu.edu.np/cgi-bin/koha/opac-search.pl?idx=ti&q=What%20the%20Buddha%20taught), 5 results. Rahula, Walpala, record **240** | Central Library, barcode 00240, 294.34 RAH, Available; one holding |
| Dilliraman — selected | POST [Ancient Nepal request](evidence/dkrml-search.json), 24 results. D. R. Regmi, notice **13531**, 3rd edition, 2007 | **Copies(0), No copy.** A real bibliographic result, not a borrowable-copy claim. A digital-copy link is present but was not tested |
| Thapathali — selected | GET [Digital image processing](https://library.tcioe.edu.np/cgi-bin/koha/opac-search.pl?idx=ti&q=Digital%20image%20processing), 4 results. Gonzalez / Woods, record **527**, 4th edition, ISBN **9789353062989** | 16 holdings: 14 Available, 1 Checked out and 1 **Staff Collection**; preserve these separately |
| Keshar / Kaiser — selected | GET [Ancient Nepal](http://109.123.236.57:8008/cgi-bin/koha/opac-search.pl?idx=ti&q=Ancient%20Nepal), 10 results. D. R. Regmi, record **20036**, ISBN **9788129110989** | 2 Available: English Section and Children's Collection. Public IP and port 8008 are linked by the government site; HTTP transport needs deployment review |
| Prithvi Narayan — selected | POST [Research methodology request](evidence/pnc-search.json), 40 matches. **Related title:** *Educational research methodology*, Peshal Khanal, BookID **9120**, ISBN **99933-53-81-7** | JSON returns RemainingQuantity="1", but the frontend comments out its display; do not promote it to live availability. A second query, *The wealth of nations*, returned 0 |
| CEHRD — reserve | POST [Democracy and education request](evidence/cehrd-search.json), 11 results. John Dewey, record **8344** | Printed text, Available on result. Total collection size unknown; copied PMB French address defaults must not become user-facing locations |
| Alliance Française — reserve | POST [Le petit prince request](evidence/af-search.json); actual exact book by Antoine de Saint-Exupéry, notice **2068**, ISBN **9782070408504** | 2 Available at AFKTM Children's novels. Intermediate response has separate Title 85 and All-fields 754 buckets, so no single total asserted. Official scale: 5,000+ books |
| AFU Faculty of Forestry — reserve | POST [The practice of silviculture request](evidence/afu-search.json), 6 results. David M. Smith, notice **81**, 8th edition, Wiley 2014 | 15 copies labelled Available: 14 General Books and 1 **Referencs**. Keep the reference section; institution size unquantified |

**PMB fresh-form recipe:** GET the public catalogue form using an anonymous cookie jar held only in memory, read its displayed action and hidden fields, then POST the title and current `csrf_token`. Dilliraman, CEHRD and AFU use `lvl=more_results&autolevel1=1` with `user_query`, `look_TITLE=1`, empty `typdoc`, `surligne`, `look_FIRSTACCESS` and a fresh token. Alliance's quick search uses `lvl=search_result&search_type_asked=simple_search` and its `look_ALL` field. Stored request metadata documents the observed request; its nonce is not a durable integration credential. No cookies were saved.

**Prithvi Narayan recipe:** the institution's public homepage JavaScript explicitly calls `POST /Catalouge/SearchBook?searchby=title&s=...`, using DataTables paging fields; the probe requested the first ten rows. Its displayed detail modal calls `GET /Catalouge/BookDetail?bookId=...`. `ResTitle` carries the displayed contributor while `Author` is null. This is the observed anonymous public interface, not an internal API. The second query's zero result does not establish absence of editions under other titles.

## Blocked alternatives and policy discipline

[robots-assessments.json](evidence/robots-assessments.json) retains longest-match decisions. Search/detail requests followed applicable wildcard and AI-search-agent rules; no search was made after a failed robots check. HTTP 404 robots means no published rules, not a licence. No challenge, authentication or policy exclusion was bypassed.

- **NNL, NARC, NAST, CDC, Policy Research Institute, Hetauda School of Management, Lumbini Provincial Assembly and NDL:** robots 503; not permission to query.
- **TUCL:** robots fetch failed with tunnel 403. **Social Science Baha:** robots 403 challenge. **MPP:** allowed robots path but direct collection page 403 challenge; stopped.
- **Federal Parliament:** wildcard `Disallow: /`; Googlebot exceptions do not apply to this research.
- **NHRC:** explicit `Disallow: /cgi-bin/koha/opac-search.pl`. Individual indexed book details are not a title-query success.
- **ICIMOD:** its InvenioRDM catalogue shell exposes the public search API under `/api/communities/.../records`; robots disallows `/api`. The API was not queried, and the shell alone is not a success.
- **Martin Chautari:** the official public catalogue link returns an Apache default page. **Pokhara and Purbanchal:** institutional library sources were retained but no working public search route established.
- **Nagarjuna Institute of Buddhist Studies:** public static table and client-side filter; no title-specific response established, so not counted.

The large MPP heritage collection and National Archives/Asa Archives manuscript services merit a separate preservation/discovery workflow. A heritage record, digitized photograph, manuscript inventory or e-copy is not evidence of a circulating physical book. MPP's historical Koha pilot and undated “planned Koha” wording require current deployment verification. Neither is silently converted into a current Koha target.

## Delivery and limits

Six selected institutions have substantial official numerical evidence or a clear national-government heritage role. Three smaller or unquantified successes stay reserves; they do not fill the four-target selected shortfall. More than a dozen meaningful blocked or unresolved alternatives were investigated. No branches were multiplied into targets, and neither the entire TU system nor any nationwide consortium was counted alongside constituent collections.

Catalogue “Available”, historical due dates, reference-section labels and “No copy” are observations at the recorded time. They do not establish borrowing eligibility or a real-time promise. Existing Koha support is a reuse candidate; PMB and custom deployments need deliberate implementation and testing. No live application adapter test was performed.

The evidence directory contains bounded response bodies plus metadata, headers, hashes, forms and policy decisions. [build_findings.py](build_findings.py) regenerates the dossier from retained evidence without network access; [pmb_probe.py](pmb_probe.py) and [run_probe.py](run_probe.py) document the bounded research recipes.
