# Democratic Republic of the Congo (COD): library expansion screen

**7 distinct collections returned actual book records: 6 selected candidates and 1 reserve. The target of ten substantial verified collections remains four short.** Fourteen major priorities are retained below, including the large public universities that did not yield a public physical-book query. This is the Democratic Republic of the Congo, not Congo-Brazzaville. Research date: 15 November 2026 UTC.

The best immediate investment is a **general PMB adapter with explicit institution and copy-status mapping**, followed by a small adapter for CEPAS's public GET frontend. PMB is directly observed in this accessible sample; this does not establish national LMS market share. Three selected candidates use institutional/network scale proxies instead of audited book counts: UDBL, the SGN-C agency network and the Institut Français network. They are not claims to be among the country's six largest libraries.

## Market and shared-service opportunity

The market combines national/legal-deposit services, public universities, confessional universities, specialized documentation centers, and diplomatic/community reading services. A scoped country synthesis describes geographically uneven provision, weak national statistics and a significant role for cooperation institutions. Its historical totals should not be repeated as a current national census. National population and infrastructure need alone do not establish public-catalog readiness. [Country synthesis](https://rel.bib.umontreal.ca/bibliotheques-a-l-international3/chapter/republique-democratique-du-congo/) ([saved indexed evidence](evidence/discovery-s10.json); direct fetch returned HTTP403).

There are three well-supported technology threads:

- **PMB:** book queries returned records and physical holdings from Mikanda, ULPGL, UDBL, SGN-C and Institut Français RDC. CEPAS describes its underlying catalog as PMB but exposes a custom Laravel/Livewire frontend. Its public `q` and `notice` URL parameters work without calling the robots-disallowed `/livewire/` route.
- **Koha:** the UNIKIN implementation is documented in a 2008 institutional case study. A 2023 article, citing 2017 catalog sources, explicitly labels `koha.unikin.cd` as **intranet**. That route was not probed. CEDESURK's historically published Koha origin returned robots HTTP503 and was left unresolved. Historical adoption is not proof of a working public endpoint. [UNIKIN study](https://repository.ifla.org/bitstreams/41855b8d-0e59-4abe-a7e7-ec8f80f168d1/download) ([local PDF](evidence/ifla-unikin.html)); [2023 catalog discussion](https://www.cahierseconomiquesetsociaux.cd/Publications/CES_vol39_n%C2%B01/CES_vol_39_n%C2%B01_04.pdf) ([indexed passage](evidence/discovery-s8.json)).
- **CD-ISIS migration:** a UPC librarian's 2015 paper reports 9,707 monographs in the older CD-ISIS catalog and about 2,030 notices in the then-current PMB installation. Those are dated migration-stage figures, not today's catalog coverage. [Institutional paper](https://repository.ifla.org/bitstreams/f6541a03-e351-498b-9cd7-77ce63faec91/download) ([local text](evidence/ifla-upc.txt)).

**Mikanda offers the strongest shared-catalog opportunity.** Its live OPAC has many named institutional locations, but only UPC and Karibuni were proven here by returned physical copies. A future connector must map each result's actual holding institution; a selector, publisher named UCC, or author affiliated with a university is insufficient. The network is not counted again on top of its members. [Mikanda](https://mikanda.info/) ([saved source](evidence/mikanda-members.html)).

The SGN-C shared documentation catalog exposes five agency locations; a CTCPM book copy was verified. Institut Français RDC exposes four city views; only a Lubumbashi copy was verified. Each is counted once as a network, not as five or four successes. CEDESURK remains a useful interuniversity coordination prospect despite its inaccessible catalog. UPN's thesis/dissertation links, Astria digital-library announcements, Cairn subscription totals and downloadable research papers are not evidence of local physical-book holdings.

## Major priorities

These fourteen priorities exceed the requested ten while keeping inaccessible substantial collections visible. The ordering is not a national size ranking. Figures have different dates and units and cannot be added together.

| Priority | Source-backed scale or explicit proxy | Observed outcome |
|---|---|---|
| Bibliothèque nationale du Congo, Kinshasa | National heritage/legal-deposit mission; current book total not verified. [Director interview](https://acp.cd/culture/litterature-lexistence-des-bibliotheques-assure-la-perennite-de-lecriture-directeur-de-la-bibliotheque-nationale/) | No public physical-book OPAC established. |
| UNIKIN | Official page describes central library plus ten faculty and six research/large-school libraries. [Source](https://www.unikin.ac.cd/fac/fpsysed/?page_id=88) | Historical Koha; published route described as intranet. No internal access attempted. |
| UNILU | Official page: central library >29,000 volumes and 4,300 periodicals; faculty collections 11,200 and 6,350 periodicals; central, fourteen faculty libraries and four documentation centers. Page undated. [Source](https://www.unilu.ac.cd/bibliotheques-de-luniversite-de-lubumbashi/) | Substantial network, no supported public query route found. |
| UNIKIS | Official central-library service at the major public university; numerical scale unknown. [Source](https://unikis.ac.cd/services) | No public book-query endpoint established; do not confuse with Kindu/UNIKI. |
| UPN | National pedagogical university's central library; institutional proxy. [Source](https://upn.ac.cd/upn/bibliotheque.php) | Current page links theses and DEA dissertations; no print-book query verified. |
| UCC | About 90,100 volumes in a 2015 institutional study. [Source](https://repository.ifla.org/bitstreams/f6541a03-e351-498b-9cd7-77ce63faec91/download) | Mikanda selector exists; no UCC holding verified. One failed title query is not evidence of absence. |
| UCB | Current official description: thousands of works and physical/digital collections. [Source](https://ucbukavu.ac.cd/etudiants/) | No public print-book search exposed. Older indexed size PDF now returned 404. |
| CEPAS | >45,000 volumes; 1,600 periodical titles. [Source](https://www.cepas.online/secteurs/bibliotheque) | **Selected:** exact book and consultation-only copy returned. |
| UPC | About 29,400 volumes in 2015; current official page serves five faculties. [Historical source](https://repository.ifla.org/bitstreams/f6541a03-e351-498b-9cd7-77ce63faec91/download), [current page](https://upc.ac.cd/recherche/bibliotheque) | **Selected:** Mikanda returned explicit UPC copy. |
| ULPGL-Goma | 32,246 books **including 2,000 ebooks**, across two campuses; undated official page. [Source](https://bu-ulpgl.net/collections-courantes/) | **Selected:** official OPAC returned BIFAD physical copy. |
| UDBL | Official university library network naming Saint François de Sales and Ladrille; numerical total unknown. [Source](https://udbl.ac.cd/public/index.php?page=biblioth-que) | **Selected by institutional proxy:** Theologicum holding within UDBL catalog; counted once. |
| SGN-C documentation network | Five named agency collections in shared catalog, not a book total. [Source](https://sgnc.pmb.cd/opac_css/) | **Selected by network proxy:** CTCPM book copy proven; other agencies not independently verified. |
| Institut Français RDC | Four-city catalog network, not a physical-book total. [Source](https://mediatheques-ifrdc.org/) | **Selected by network proxy:** only Lubumbashi holding proven. |
| CEDESURK | Interuniversity documentation center; 120 reading places in 2016 cooperation publication. [Source](https://orbi.uliege.be/bitstream/2268/188554/1/Livre%20Pacodel.pdf) | Historical Koha robots 503; stopped before query. |

## Actual book-query results

All seven searches returned HTTP200 book records, not merely homepages or search-engine snippets. Exact request URLs, methods, payloads, UTC timestamps, policy responses and saved raw bodies are in [findings.json](findings.json) and the linked metadata. Counts below are the server's displayed search counts; broad matching can return many unrelated records.

| Selected collection | Submitted query | Actual returned book and record | Physical holding observed | Evidence |
|---|---|---|---|---|
| CEPAS | `Forced adjustment` | Roy Culpeper, *Forced adjustment*; 13789. Catalog subtitle transcribed as “the expert collapse in sub-saharan Africa”. 1 result. |22305; ECO.5.J.68; Bibliothèque du CEPAS; **Consultation sur place**. | [GET request/response metadata](evidence/cepas-exact.json), [raw search + detail](evidence/cepas-exact.html) |
| UPC via Mikanda | `"La publicité est dans le film"` | Jean-Marc Lehu, *La publicité est dans le film*; 2744; ISBN 9782708136434. 1 result. |0101032; 659.1 LEH 2007; **UPC; Exclu du prêt**. | [POST metadata](evidence/mikanda-upc-query.json), [detail](evidence/upc-detail.html) |
| ULPGL-Goma | `Sociologie des médias` | Rémy Rieffel, *Sociologie des médias*; 7182; ISBN 9782729805968. Exact requested title first among 82 results. |BU0005955; 302.23 RIE; **BIFAD; Disponible**. | [POST result metadata](evidence/opac-ulpgl-query-2-results.json), [detail](evidence/ulpgl-detail.html) |
| UDBL network | `"Manon Lescaut"` | Antoine François Prévost, *Manon Lescaut*, 1968; 78384. 2 results, the second a separate critical study. |LL 54.005; 809.3; **Bibliothèque Theologicum; Exclu du prêt**. | [POST metadata](evidence/udbl-title-final.json), [detail](evidence/udbl-detail.html) |
| SGN-C network | `haut- Uele` | Jean Omasombo Tshonda, *haut- Uele : trésor touristique*; 215; ISBN 9782871065784. **Title-fragment/related-title search**,21 mixed book/map/report results. |1001;DP247; papier/numérique; **CTCPM; Disponible**. A PDF is separately listed. | [POST result metadata](evidence/sgnc-query-3-results.json), [detail](evidence/sgnc-detail.html) |
| Institut Français RDC | `Droit de la concurrence` | Marie-Anne Frison-Roche and Jean-Christophe Roda, *Droit de la concurrence*,2nd ed., 2022; 31397; ISBN 9782247205721. Exact requested title first among 2,439 results. |LU304447; 343 FRI; **IF Lubumbashi; Sorti jusqu'au 21/11/2026**. | [POST metadata](evidence/ifrdc-query2.json), [detail](evidence/ifrdc-detail.html) |

**Reserve:** Karibuni's `Le petit prince` search returned Antoine de Saint-Exupéry's *Le Petit Prince*, record 161504, with copy BK 1757, shelf R SAI P, Karibuni, **Disponible**. The query returned 3,063 broad token matches; the exact title was first. Its unquantified scale does not justify treating it as an additional major national collection. [POST metadata](evidence/mikanda-query.json), [detail](evidence/karibuni-detail.html).

The book-search counts do not establish collection coverage. “Disponible” is the catalog's observed status, not a tested reservation or promise that a visitor may borrow. “Exclu du prêt”, “Consultation sur place” and the IF return date must remain visible to readers.

## Access, adapter requirements and shortfall

PMB variants differ materially. ULPGL and SGN-C first return a result-category page and then use a second public POST to list records. SGN-C and IFRDC need fresh anonymous form tokens; use an in-memory cookie jar and the normal public form flow. Captured tokens are historical evidence, not durable credentials. For IFRDC, start the form at `index.php?lvl=index&opac_view=2` and validate the returned institution. CEPAS declares its supported public `q`/`notice` URL mapping in the page; these GET routes successfully returned a book and copy without using its disallowed Livewire endpoint.

Mikanda publishes a 10-second crawl delay. One unsuccessful UCC exploratory form/query/result chain did not enforce that delay. Subsequent scripted UPC verification explicitly waited 10 seconds; the deviation is preserved in the limitations. No catalog queries followed the unresolved CEDESURK 503, CENCO verification challenge or Canisius 403 robots responses. No TLS verification was disabled, reader credentials used, or holds placed.

Further alternatives were investigated without inflating the count:

- **CENCO:** robots returned a verification challenge; stopped. **Loyola/Canisius:** institutional resources page has no book-search route; historical catalog origin's robots returned 403. **CEDESURK:** robots 503 remains unresolved.
- **UNILAC/Marbella:** university-linked PMB exists but the landing shows only 223 notices and generic template content; no query success claimed. **UPL:** a Livewire catalog landing shows 1,949 mixed records; no actual title query was executed, so it is not counted.
- **ULPGL alternate hostname:** `catalogue.bu-ulpgl.net` contains demo-like Bibliobus/Loire content. The official library's catalog page instead links `opac.bu-ulpgl.net`, used for the actual local-copy verification. [Provenance](evidence/ulpgl-catalog-link.html).
- **Theologicum hostname:** shares the institutional context and holdings visible through UDBL; not counted again. **UCC:** a location selector and publications issued by UCC do not prove UCC-owned books.

The four-candidate shortfall is substantive: the national library, UNIKIN, UNILU, UNIKIS, UPN and UCB do not have verified public physical-book responses in this dossier. Product deployment should begin with the observed PMB profiles, while retaining these institutions as high-value access/catalog-discovery priorities. All live-app testing flags remain false; no product code, configuration, outreach or deployment changed.
