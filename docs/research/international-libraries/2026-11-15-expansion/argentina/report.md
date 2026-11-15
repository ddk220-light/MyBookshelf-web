# Argentina: catalog expansion research

Research completed 15 November 2026 UTC. **Four substantial institutions verified; four selected, zero reserves; six short of the ten-library target.** The successes are the Buenos Aires city public network, Universidad Nacional del Nordeste (UNNE) network, Universidad Nacional del Sur (UNS) network, and the Florentino Ameghino faculty/museum library at UNLP. Twenty-two blocked or unverified catalog cases are retained, including national, congressional, major city and university alternatives. These are cases/routes, not twenty-two additional distinct institutions.

The immediate engineering recommendation is **Argentine Pérgamo**, which returned real books and copy details for two substantial networks. A scoped UNS VuFind integration is also feasible for bibliographic discovery, with availability unknown when its backend fails. Koha remains the strongest strategic family candidate by institutional adoption evidence, but this study did not obtain a permitted, successful Koha book query. SIU BDU could offer the widest cross-institution discovery leverage; its explicit external-search rate limit prevents treating it as ready for integration.

## Marketplace, shared systems and access

Argentina's library landscape combines national heritage and congressional collections, municipal public networks, university libraries, and independently administered *bibliotecas populares*. These have different lending and visitor rules. The national public-library coordination program and CONABIP membership are useful discovery paths, not proof of a single live holdings system.

* **CONABIP / DigiBepé:** CONABIP explicitly describes DigiBepé as an adaptation of Koha for popular libraries. Its site also links a collective catalog. This supports family-level technical leverage, but neither membership nor a DigiBepé installation establishes an accessible public OPAC, collection scale or reader eligibility. No popular-library member is counted solely on this basis. [Official program](https://conabip.gob.ar/digibepe), retained in [evidence](evidence/conabip-digibepe.html).
* **University networks and Koha:** UBA's institutional program specifies Koha and MARC21 for 18 central libraries; that is a program scope, not verification that all migrations are complete. UNLP describes coordinated migration from heterogeneous systems to Koha and a VuFind collective discovery layer. Historical Pérgamo or Meran references must not be mistaken for current deployments. [UBA institutional code](https://codigo.rec.uba.ar/codigo_uba/libro-i-normas-generales-de-la-universidad-de-buenos-aires-1/titulo-26-bibliotecas-y-publicaciones/capitulo-l-sistema-informatico-de-gestion-en-red-de-las-bibliotecas-centrales-de-la-universidad-de-buenos-aires/), [UNLP projects](https://bibliotecas.unlp.edu.ar/proyectos/); indexed primary captures in [market sources](evidence/indexed-market-sources.json).
* **SIU is not one LMS:** SIU-Bibliotecas is a service program; BDU is a cooperative discovery/aggregation service. Its homepage reports 3,530,385 documents and 79 institutions. Its library registry lists 56 contributing libraries with source-record counts and last harvest information. It mixes physical-resource metadata with repositories and other digital resources; a document total is not a physical-book count. The observed institution filter `library_str:B-53` identifies the UNLP Public Library, but the actual `Rayuela` query returned HTTP429: external direct search routes are rate-limited. All BDU search stopped at that point. No registry entry is counted as a query success. [SIU description](https://www.siu.edu.ar/siu-bibliotecas), [BDU homepage](evidence/bdu-home.html), [registry page 1](evidence/bdu-libraries.html), [page 2](evidence/bdu-libraries2.html), [query failure](evidence/bdu-unlp-search.json).
* **Pérgamo:** This is WalySoft's Argentine product, distinct from Brazilian **Pergamum**. Its vendor roster spans public, popular, university, professional and school libraries. CABA and UNNE were directly verified on its public HTML search/detail routes. Vendor adoption claims are not a national market share. [Vendor roster](https://www.walysoft.com.ar/pergamo/clientes.php), [retained evidence](evidence/walysoft-clients.html).
* **Other families:** BNMM institutional cataloging documentation identifies Aleph 500; the live catalog could not be checked because robots failed. UNS currently exposes VuFind and separately describes its CaMPI development/support work. BFA exposes PMB. UdeSA's official site publishes Primo discovery, but that deployment's search and API paths are excluded by robots. [BNMM cataloging manual](https://escritoriopt.bn.gov.ar/mcat/mcat-intro.html), [UNS services](evidence/uns-about.html), [UdeSA official page](evidence/udesa-library.html).

This is a feasibility-selected sample, not evidence of national LMS prevalence. Journal unions, repositories and subscription ebook counts have not been substituted for physical-book holdings.

## Ten major priorities

The following is an opportunity list, **not a national size ranking**. Record totals, copies and mixed bibliographic pieces have different meanings and dates. Large blocked institutions remain visible.

| Priority | Scale evidence / explicit proxy | Observed outcome |
|---|---|---|
| Biblioteca Nacional Mariano Moreno | National heritage/legal-deposit institution; current total not established | Institutional and catalog robots HTTP503; no catalog search |
| Biblioteca del Congreso de la Nación | Official archive description: more than 3.5 million mixed bibliographic pieces, undated | Official redirect to `consulta.bcn.gob.ar`; robots disallows all |
| Buenos Aires city public network | Official service page: more than 320,000 copies, observed 2026-11-15 | **Selected: Pérgamo** |
| Biblioteca Pública de la UNLP | BDU: 194,693 source records, observed 2026-11-15; official library describes about 600,000 mixed physical volumes | Direct Koha robots503; BDU query429 |
| Universidad Nacional de Córdoba network | University-wide collective catalog; explicit substantial institutional proxy | Anubis challenge; stopped |
| UBA SISBI / central libraries | Koha/MARC21 program scope: 18 central libraries; FAUBA contribution 87,627 BDU records | FAUBA robots disallows all; full SISBI network unverified |
| Universidad Nacional de Cuyo network | BDU: 300,410 source records, observed 2026-11-15 | Anubis challenge; stopped |
| Biblioteca Nacional de Maestros | BDU: 101,866 source records, observed 2026-11-15 | Official current Koha catalog robots disallows all |
| Universidad Nacional del Nordeste network | Official central + faculty/institute network; substantial institutional proxy, no measured total claimed | **Selected: Pérgamo; CENTRAL copy** |
| Universidad Nacional del Sur network | 149,068 general-collection records within 290,315 mixed discovery records, observed 2026-11-15 | **Selected: VuFind; circulation backend failed** |

Source URLs and outcomes for every row are in [findings.json](findings.json). BDU's dated harvest counts are retained in the two registry captures above. The Congress size source is captured in [indexed primary sources](evidence/indexed-primary-sources.json). [UNLP Public Library collection description](https://biblio.unlp.edu.ar/colecciones/) is distinct from the BFA library verified below.

## Actual successful book queries

All four returned HTTP200 and were inspected for real books. Exact request URLs, methods, payloads, timestamps, returned titles, identifiers, ISBNs, statuses and raw evidence paths are in [findings.json](findings.json). No login, hold or borrow action was performed.

| Selected institution | Exact query / method | Actual returned book | Institution/copy evidence and limits |
|---|---|---|---|
| Buenos Aires city network | `Rayuela`, GET, 65 results | *Rayuela*, Julio Cortázar; 1987, 25th ed.; `PERGAMO.1.1056`; ISBN 9500701987 | Unit 8, inventory 00869, shelfmark `821.134.2[82]-31 CORr`; **No Disponible**. Count includes related works and editions. [Search](evidence/caba-search.html), [detail](evidence/caba-detail.html) |
| UNNE network | `Rayuela`, GET, 24 results | *Rayuela*, Julio Cortázar; 2013, 2nd ed., 12th reprint; `RESISTENCIA.1.3045`; ISBN 9789875780620 | CENTRAL inventory `01-028237`, shelfmark `86(82)-31 C827 r 2 ej.1`; circulation status absent. [Search](evidence/unne-search.html), [detail](evidence/unne-detail.html) |
| UNS network | `Rayuela`, GET with `type=Title`, 13 results | *Rayuela*, Julio Cortázar; 2004, 1st ed.; `EUN.eunm001183` | Detail explicitly identifies **BIB. CENTRAL - Sector A**, but copy section says **Library System Unavailable**. This is a backend error, not an unavailable copy. Search includes 12 Book and 1 eBook results. [Search](evidence/uns-search.html), [detail](evidence/uns-detail.html) |
| UNLP Biblioteca Florentino Ameghino | `"El origen de las especies"`, POST, 22 results | **Related title:** *Jornadas darwinianas 2009: A 200 años del nacimiento de Darwin y 150 años de la publicación del Origen de las Especies*, Riccardi/Núñez/Quesada Allué; 2011; record `25966`, ISBN 9789875371118 | Museo copy, barcode 66, shelfmark `92 D1 R4`, **Disponible**. Also returned Makinistian's *Desarrollo histórico…*, record `20482`, Facultad barcode 23741, **Disponible**. This does not verify Darwin's book. [POST response](evidence/bfa-search-exact.html), [metadata/payload](evidence/bfa-search-exact.json) |

BFA is a substantial additional science-library target: its official collection page, updated 1 April 2019, reports **more than 33,660 volumes** of books, congress proceedings, monographs and reference works, with separately listed pamphlets, serial titles, theses and faculty research works. It serves the Faculty of Natural Sciences and the Museo de La Plata across two locations. It is **one library**, not two branch targets, and is not the blocked UNLP Public Library. [Collection evidence](evidence/bfa-collections.html).

The first unquoted BFA request returned 63 results. Quoting the phrase narrowed it to 22, but the results still include content/keyword matches despite the submitted title checkbox. The returned related works and their explicit holdings are counted honestly; the result is not reported as an exact-title success.

## Reader eligibility and integration implications

* **CABA:** The official page asks for DNI on the first visit and permits up to three books for 30 days. The catalog's request form states that it is not a reservation. Do not equate that form with a hold. [Official service evidence](evidence/caba-access.html).
* **UNNE:** Search is public. The DGB site invites users to join for free services, but its linked eligibility page returned404. External-reader entry/borrowing remains unresolved. The current DGB site lists onsite hours whereas the catalog carries an undated virtual-only notice; do not display that notice as a verified current closure. [DGB evidence](evidence/unne-about.html), [broken eligibility route](evidence/unne-access.html).
* **UNS:** Central-library loans require an active account, identification and pickup confirmation. Its published borrower table includes UNS users, students of other institutions, professionals and *transeúntes*, with different limits. No account workflow was tested. [Lending page](evidence/uns-access.html).
* **BFA:** Reading-room consultation is open to affiliated and external users with identity document/passport and a consultation form. Home lending is limited to the listed eligible faculty groups and related UNLP students with reader card; visiting researchers/professionals consult onsite. [Regulation](evidence/bfa-access.html).

The Pérgamo adapter must preserve record/edition identifiers, unit codes, local shelfmarks and each status column. The CABA example is explicitly unavailable; UNNE only confirms a holding. An existing Brazilian Pergamum parser would not be appropriate. UNS and BFA require deployment-specific VuFind/PMB work; current app adapters for those families are not universal connectors. BFA's POST recipe and semantic payload are recorded without treating a session value as durable. All `live_app_tested` fields are false.

## Blocked alternatives and shortfall

Major independent alternatives were checked beyond the first ten priorities:

* **Robots restrictions:** UNMdP Central, UBA-FAUBA, UNGS, BNM, UNCaus Pérgamo and UdeSA Primo. The robots text and longest-match evaluations are retained. No prohibited search route was requested.
* **Challenges / rate limiting:** UNSAM search403 Cloudflare; UNRN search200 with `koha_fast_challenge` scripts and no book response; UNC and UNCuyo Anubis; BDU429. No challenge was solved and no alternate path was used to evade the restriction.
* **Unresolved infrastructure/access:** UNICEN and UNLPam robots403; UNLaM robots tunnel403; UNQ, UNR political science and Rosario municipal robots503; UNLP Public Library and BNMM robots503. UCSF's published WXIS catalog returned401. Rivadavia's official OPACMARC/WXIS route returned403 after robots was checked.

Several of these are clearly substantial: BDU records show UNMdP Central 128,932, UCSF 103,333, UNICEN 70,500, UNSAM 70,240, UdeSA 68,869 and UNGS 66,545 source records. None is counted as a successful book search. Rivadavia is an independent popular library whose catalog happens to be hosted under `uns.edu.ar`; it is not silently included in the successful UNS network.

The full per-route reasons and evidence are in `blocked_or_unverified` in [findings.json](findings.json). This research ends with a **six-institution shortfall** rather than counting search snippets, homepages, branch selectors, union membership, journals or challenges as successes.

## Evidence and limitations

The shared bounded probe retained raw responses and request metadata. [Policy decisions](evidence/policy-decisions.json) use longest matching path rules; CABA's five-second crawl delay was respected. Empty/404 robots is documented as no published restriction, not a reuse licence. BCN's institutional robots was an ordinary HTML fallback; its independently observed catalog origin had an explicit exclusion and was not searched.

Transient anonymous form/challenge payloads and reflected network addresses were redacted from relevant raw captures; affected metadata records original/revised hashes and a redaction note. No cookies or account state were persisted. Search terms here are synthetic research probes, not user search logs.

Availability can change; a successful public catalog request does not establish lending eligibility, permission to reuse metadata or production reliability. Dates/units differ, BDU is harvested, BFA's size is historical, and the UNS discovery total includes ebooks and repositories. Failed checks never mean that a book is absent. No application code, deployments, outreach or authentication was performed.
