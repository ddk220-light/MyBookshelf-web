# Côte d’Ivoire — library integration research

**15 November 2026: 4 observed institutional book-search successes; 3 substantial selected targets; 1 digital-only reserve. Fourteen substantial library/network priorities are documented.** CNDJ returned an exact title, ENSEA returned the exact main title with three copies, and IFCI returned explicitly token-related titles plus a copy record. INP-HB returned digital-resource records and is a reserve. The selected-ten target has a **seven-library shortfall**. Original transport failures are preserved and do **not** establish a countrywide outage or absent books.

The strongest adapter opportunity is **French-language PMB**, now verified with copy-level evidence at ENSEA; BNCI and UAO remain high-value discovery priorities. IFCI offers an independently verified Bibliosoft JSON API, while CNDJ needs a small custom result-card adapter. COBES-CI and AUF are the best evidenced coordination opportunities. No outreach or application changes were performed.

## Marketplace, platforms and shared services

The market spans national patrimonial collections, public-reading centres, university systems, specialist documentation centres and cultural libraries. The Ministry’s statistical yearbook reports **86,449 books in 2024 for BNCI and CLAC combined**; this is a scoped aggregate, not national stock and not BNCI’s individual collection. Current government descriptions confirm a CLAC public-reading network. Older country overviews asserting no public network should not drive present recommendations. [Ministry yearbook, table 13, p. 50](https://culture.gouv.ci/uploads/publications/177918948235.pdf) · [Government CLAC description](https://www.bilan.gouv.ci/actualite/20308)

**PMB has the clearest deployment-specific evidence.** ENSEA has a live verified PMB catalogue and ESATIC has an indexed PMB catalogue; UAO’s official announcement records staff training on 20–23 February 2026 covering cataloguing, circulation, imports and web visibility, delivered by Barnoin Informatique for AUF. This supports an adapter-family opportunity, not a national market-share percentage. [UAO announcement](https://univ-ao.edu.ci/formation-des-agents-de-la-bibliotheque-centrale-de-luao-sur-le-logiciel-pmb/) · [ENSEA OPAC](https://labiblio.ensea.ed.ci/opac_css/index.php) · [ESATIC OPAC](https://www.ebibliotheque.esatic.ci/)

A January 2025 study of five public universities, using April 2023 convenience-sample fieldwork, names **PMB, WINISIS, Koha, WEBLIS and SHARON COLLECTION**. Its narrative calls PMB most used at 31.1%, while table 5 gives higher Koha/WEBLIS respondent percentages. These internally inconsistent, multiple-answer survey results are not installation shares. They justify investigating those families, but do not establish a dominant national system or a current public Koha endpoint at a named university. [Tanoh study, pp. 553–556](https://edition-efua.acaref.net/wp-content/uploads/sites/6/2025/02/21-TANOH-Zakary.pdf)

IFCI’s recovered public app uses **Bibliosoft**, with an Angular frontend and anonymously callable JSON search/copy endpoints. It is a separate adapter family; it is not evidence of PMB adoption.

The existing MyBookshelf Koha adapter is a potential reuse candidate once a real allowed endpoint is verified. Existing PMB support is pinned to known deployments and requires deployment-specific parsing and policy validation. French accents, legacy mojibake, edition identity, stable PMB notice IDs, copy locations, nonloanable statuses and anonymous form state need validation before integration.

| Shared opportunity | What the evidence establishes | Integration implication |
|---|---|---|
| [COBES-CI / EIFL](https://www.eifl.net/country/cote-divoire) | E-resource, open-access and copyright collaboration since 2017. An [EIFL-hosted member list](https://www.eifl.net/sites/default/files/list_of_members_-_ivordy_coast.pdf) names 13 institutions and their library units. | Best coordination route for authoritative catalogues and metadata arrangements. No shared physical-book union search was verified. |
| [UVCI national virtual library](https://www.repertoirecovid19.uvci.edu.ci/repertoire/Main/presenter_bv) | Historical official description reports 8,000 full-text documents from UFHB, UNA, UAO and UVCI. | A possible single digital research-content source. It does not prove paper-book holdings at every contributing university. |
| [AUF / UAO PMB modernization](https://univ-ao.edu.ci/formation-des-agents-de-la-bibliotheque-centrale-de-luao-sur-le-logiciel-pmb/) | Current training in library-management and publication workflows. | Potential repeatable PMB expertise; no common hosted OPAC established. |
| [CENATELPAC / CLAC](https://www.bilan.gouv.ci/actualite/20308) | Government describes an existing public-reading network and planned expansion. | Public access matters beyond Abidjan, but no union title catalogue was located. Planned centres are not current facilities. |

ScholarVox, Cairn and Goethe Onleihe are electronic-content entitlements. Journal licensing, institutional repositories and digital-space access must remain separate from physical-book presence. No whole network and its constituent branches have been counted twice.

## Substantial priorities

This is a research priority list, **not a largest-ten ranking**. Dates and units differ. Where no stock total was found, the proxy is explicit.

| Priority | Source-backed scale or proxy | Catalog outcome |
|---|---|---|
| **BNCI** | [Official homepage](https://www.bnci.ci/) advertises 20,000 documents in its renewed children’s collection only; undated. National patrimonial mandate supports priority. | Latest bounded recovery robots on `catalogue.bnci.ci` still503; stopped before search. Original failures preserved. |
| **UFHB library network** | [COBES list](https://www.eifl.net/sites/default/files/list_of_members_-_ivordy_coast.pdf) identifies central library plus 13 faculty/specialist units; undated institutional network proxy. | Official documentation and digital-space services found; physical OPAC not established. Counted once, including CIRES/UFR units. |
| **Nangui Abrogoua** | [Official brochure](https://bibliotheque.una.edu.ci/static/accueil/pdf/presentation.pdf): more than 400 seats; undated capacity proxy. | Recovered robots404 and public book form. `Biologie végétale`, ouvrage/title filter, returned 0; no book verified. |
| **Alassane Ouattara** | [Official PMB training](https://univ-ao.edu.ci/formation-des-agents-de-la-bibliotheque-centrale-de-luao-sur-le-logiciel-pmb/), February 2026, confirms the public university’s central library at Campus 2. No whole-collection total. | PMB use source-backed; current public OPAC URL unresolved. |
| **INP-HB Médiathèque** | [2019–2020 handbook](https://cea-valopro.inphb.ci/PDF/DOCUMENTS%20%26%20RAPPORTS/Livret/Nouveau_livret_etudiant_2021.pdf), pp. 37–38: three campus centres; more than 1,000 works/documents accessible to students. The filename says 2021 but printed edition says 2019–2020. | Recovered public search returned 31 related digital resources. Internet Archive links, no paper holdings; reserve only. Three campus centres count once. |
| **ENSEA** | [Institutional catalogue description](https://labiblio.ensea.ed.ci/opac_css/index.php?lvl=infopages&pagesid=9): 16,700 monographs including about 1,600 student reports/dissertations; undated. | Recovered PMB query returned main-title match, notice 1240, and 3 ENSEA/ECONOMIE copies marked Disponible. Selected target. |
| **CERAP CEDOC** | [Official description](https://cerap-inades.org/index.php/bibliotheque): over 50,000 paper monographs, 200 periodical titles, 120 seats; undated. | Live official landing links a public-IP PMB catalogue; catalogue-origin robots timed out. CERAP/UJA share this priority. |
| **Institut français de Côte d’Ivoire** | [Official page](https://institutfrancais.ci/mediatheque/): approximately 35,000 works; undated. | Recovered Bibliosoft API returned broad token-related books and 1 copy; strict requested title returned 0. Selected with explicit related-title caveat; membership required. |
| **CNDJ Bibliothèque classique** | [Official page dated 6 June 2024](https://cndj.ci/index.php/bases-de-recherche/bibliotheque-classique.html): over 2,000 works in physical-library database; national legal specialization. | Main official catalogue returned 1 exact-title book, ID2, accession1258. Detail redirects to login. Earlier beta robots503 was superseded for main-origin search. |
| **Musée des Civilisations library** | [University of Montréal overview](https://rel.bib.umontreal.ca/bibliotheques-a-l-international2/chapter/cote-divoire/) cites 16,000 works from Kpan (2018); historical secondary figure. | No public book OPAC located in bounded discovery. |
| **Péléforo Gon Coulibaly** | Public university central library in [COBES member list](https://www.eifl.net/sites/default/files/list_of_members_-_ivordy_coast.pdf); also covered by 2023 study. Stock unknown. | Survey family names do not establish a current public endpoint. |
| **Jean Lorougnon Guédé** | Public university central library in [COBES member list](https://www.eifl.net/sites/default/files/list_of_members_-_ivordy_coast.pdf); also covered by 2023 study. Stock unknown. | No public book OPAC established. |
| **ENS d’Abidjan** | National teacher-training library / documentation centre in [COBES member list](https://www.eifl.net/sites/default/files/list_of_members_-_ivordy_coast.pdf). | Historical PMB institutional-repository research found; current paper catalogue unresolved. |
| **CLAC network** | [Government source](https://www.bilan.gouv.ci/actualite/20308) confirms national network and planned additional centres; institutional network proxy. | No shared public catalogue located; not treated as ten verified branches. |

## Actual book queries and evidence

| Institution | Query and response | Actual returned book and identity | Holdings / access |
|---|---|---|---|
| **CNDJ — selected** | GET `book_title=DROIT PENAL DES SOCIETES COMMERCIALES`, `isStrict=1`, category1; HTTP200;1 result. | *DROIT PENAL DES SOCIETES COMMERCIALES* — Philippe CONTE; Wilfrid JEANDIDIER. Record **2**, ISBN **2-7110-0498-8**, accession **1258**. | Catalogue presence, no copy status. Detail redirects to login; stopped. |
| **ENSEA — selected** | POST `user_query=Les dépenses publiques improductives`; HTTP200;421 broad-token titles. Exact requested main title is first result. | *Les dépenses publiques improductives : analyse pragmatique de l’action des pouvoirs publics* — **FONDS MONETAIRE INTERNATIONAL**, FMI, 1996. Notice **1240**. | **3 copies**, location **ENSEA**, section **ECONOMIE**, all **Disponible**:11966 / G4FON100;11967 / G4FON101;11968 / G4FON102. |
| **IFCI — selected, related titles** | JSON POST `searchText=Le petit prince`, `exactMath=false`; HTTP200;1161 token-related rows,12 returned. Separate strict mode returned 0. | Returned *Célestine, petit rat de l’Opéra T.1 : Le palais des fées* — **Barussaud, Gwenaële**; ID **6af5a694473f1c17279e5778**, ISBN **978-2-226-40149-6**. **This is not Le petit prince.** | Public getCopies returns1 copy, registration **90095248**, copyID **6af5a69e473f1c17279e5779**, R/J BAR, `available=true`, borrowing/on-site flags true. Bibliographic `numberOfCopies=0` conflicts; use copy endpoint, not summary. |
| **INP-HB — digital-only reserve** | GET `query=Algèbre linéaire`; HTTP200;31 related resources,10 shown. | *Géométrie Analytique* — **V. Iline, E. Pozniak**; slug **v.-iline-e.-pozniak-geometrie-analytique-mir-1985**. | External Internet Archive item link; no physical-copy evidence. Local detail returned HTTP200 with 0 bytes; external/download links not followed. |


Verified request timestamps (UTC): civ-cndj 2026-11-15T08:35:58.053115+00:00; civ-ensea 2026-11-15T08:41:10.041587+00:00; civ-ifci 2026-11-15T08:45:16.953053+00:00; civ-inphb-digital 2026-11-15T08:44:39.972584+00:00.

Exact method, URL, payload, UTC timestamp and response metadata for every success are in [findings.json](findings.json). These are source observations, not completed application integrations.

- CNDJ: [query HTML](evidence/cndj-book-title-query.html), [metadata](evidence/cndj-book-title-query.json), [detail login redirect](evidence/cndj-book-detail.json). Public Livewire URL bindings establish `book_title` and `isStrict`; the earlier global-search timeout is preserved. Main-origin robots200 has an empty wildcard Disallow.
- ENSEA: [query HTML](evidence/recovery-ensea-title-query.html), [metadata](evidence/recovery-ensea-title-query.json), [readable excerpt](evidence/recovery-ensea-title-query-display.txt), [robots404](evidence/recovery-ensea-robots.json). Fresh OPAC form state was used in memory for the observed POST action. Notice 1240 is explicit in the inline DOM; all three copies are in the same response. No current-origin permalink was observed for that first card, so its record URL remains null. Some other result links point to a legacy host; it was not queried.
- IFCI: [broad JSON query](evidence/recovery-ifci-title-query.html), [request metadata](evidence/recovery-ifci-title-query.json), [strict zero response](evidence/recovery-ifci-exact-title-query.html), [copy detail](evidence/recovery-ifci-copy-detail.html). The officially linked Angular app’s [main bundle](evidence/recovery-ifci-app-js.html) declares the public API origin and notices service; its [catalog bundle](evidence/recovery-ifci-catalog-js.html) defines Search and public parameters. API robots404; frontend robots is an ordinary app-shell fallback, [manually documented](evidence/recovery-ifci-policy.json). No authenticated endpoint or browser account was used. The requested exact title was **not** verified; selection records an operational substantial public book catalogue with explicitly related-title evidence.
- INP-HB: [query HTML](evidence/recovery-inphb-title-query.html), [metadata](evidence/recovery-inphb-title-query.json), [empty local detail](evidence/recovery-inphb-book-detail.json). Its homepage also listed unrelated casino/property-advertising items, a content-quality concern whose cause was not determined. This portal should not become a physical availability adapter without separate evidence.

Anonymous CSRF values, server-reflected transport IP fields, extraneous staff-account audit metadata and nonvisible API text were redacted where encountered. Original-response hashes and stored-response hashes distinguish those changes. No cookies, account state or authentication credentials were retained. Bibliographic and copy identifiers remain intact.

## Recovery pass, blocked alternatives and transport limits

Initial robots requests returned identical generic proxy503 responses across unrelated origins. Root controls reproduced this outside Côte d’Ivoire. A later bounded recovery pass used one fresh robots request per priority. **ENSEA, UNA, INP-HB and IFCI recovered independently; BNCI did not.** Earlier failures remain in evidence and the findings history; they are not overwritten by success. See [shared reachability controls](../country-context/reachability-control.json), [client comparison](../country-context/client-comparison.json), and [path-policy decisions](evidence/policy-decisions.json).

| Candidate | Latest bounded finding / remaining blocker |
|---|---|
| **BNCI** | [Recovery robots](evidence/recovery-bnci-robots.json) still returned the same 98-byte proxy503. No title query. This is an unresolved path from this environment, not proof of library outage. |
| **CERAP CEDOC** | Official [CEDOC landing](https://cerap-inades.org/cedoc/) returned200 and linked `http://160.120.149.57:82/cedoc2/opac_css/`. This is a globally routable public address. Its [robots](evidence/cerap-ip-robots.json) timed out 22s; stopped before query. No private IP was used. |
| **Goethe Abidjan** | Official OPAC link leads to `abidjan.bibliothek.goethe.de`; [robots200](evidence/goethe-robots.html) explicitly says wildcard **Disallow: /**. No query; no bypass or repeated retry. |
| **Nangui Abrogoua** | Recovered404 robots and live publication form with an `ouvrage` option. One specific-title query **Biologie végétale** returned [Aucun résultat pour Ouvrages](evidence/recovery-una-title-query.html). This does not mean the book is absent from the institution. |
| **ESATIC / Saint Laurent** | Meaningful smaller/unquantified PMB alternatives researched; original503 checks preserved. ESATIC official source reports>800 works. Not promoted to selected targets or claimed live successes. |
| **UFHB / UAO / UPGC / UJLoG / ENS** | Official institution, consortium and platform research completed; current public physical-book OPAC routes unresolved. UAO PMB training does not identify a public OPAC origin to probe. |
| **UVCI** | Institutional repository is a digital opportunity, separate from paper holdings. Original503 retained; no live book success claimed. |
| **ITCJ / WASCAL** | LAPEA directory gives older PMB leads; current substantialness, route and access require verification. No additional IP probe. |
| **Museum / CLAC** | Significant cultural/public priorities retained; no shared or institution-specific title catalogue established. |

The next priority is authoritative public-route resolution at UAO/UFHB and later policy clearance at BNCI/CERAP. PMB parsing should begin from ENSEA’s successful anonymous POST and inline holdings. CNDJ should show “listed; copy status unknown” despite its detail-login redirect. IFCI needs accurate broad/strict match labels and its copy endpoint, not the contradictory summary count. INP-HB remains a digital-source quality review.

## Reader access and limits

IFCI advertises annual membership, CERAP paid subscriptions, UNA library-card conditions and CNDJ paid digital services. Public catalogue presence or API flags do not establish visitor borrowing, full-text entitlement, live circulation reliability or metadata-reuse permission.

The selected-ten target has a **seven-library shortfall** after meaningful alternatives and a bounded recovery pass. Three selected targets plus one digital-only reserve are supported by live returned records; only CNDJ and ENSEA supply exact-title/main-title matches. IFCI supplies explicitly token-related titles, not the requested exact work. No selected network and its branches are double-counted.

Counts use differing dates and units; unknown values remain unknown. No national LMS market share or largest-ten ranking is claimed. No authentication, private-IP request, TLS disabling, challenge bypass, outreach, holds, product edits or deployment occurred.
