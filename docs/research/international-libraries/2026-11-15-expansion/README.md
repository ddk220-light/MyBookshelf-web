# Library expansion: 25 additional countries

Research checked on **15 November 2026 UTC**. One country agent investigated each market, followed by a separate offline quality review. This adds 25 countries to the initial Bangladesh, Pakistan, Nigeria, Philippines and Indonesia studies.

**144 institutions or networks returned actual book results: 105 selected substantial candidates and 39 reserves.** The dossiers identify **352 major library priorities** across all 25 countries. Brazil, Vietnam, Thailand, Algeria each reached ten selected candidates. The requested 250 selected-library target remains **145 short**; the reports document the inaccessible large libraries and why alternatives did or did not qualify. A successful search is evidence of technical feasibility, not a completed app integration.

[All 25 country comparisons](country-comparison.md) · [Every observed query and returned book](verified-searches.md) · [CSV](verified-searches.csv) · [JSON](verified-searches.json) · [All 30 countries](../README.md)

## Where to start

I would prioritize **Nepal and Tanzania for an initial Koha implementation exercise**, **Algeria for Francophone coverage**, **Brazil for large institutional networks**, and **Thailand for a shared discovery connector**. These are engineering and reach judgments from the observed evidence, not estimates of demand or national infrastructure need.

| Direction | Evidence and practical benefit | What must be resolved |
|---|---|---|
| [Nepal](nepal/report.md) and [Tanzania](tanzania/report.md): reuse Koha | Multiple substantial institutions already returned title records. Reuses the app's most transferable existing library adapter. | Template compatibility, multilingual work/edition matching, reader eligibility, missing copies and reference restrictions. No-copy results must remain unknown for physical availability. |
| [Algeria](algeria/report.md): PMB plus CCdz | Ten selected institutions: five PMB, one SYNGEB, four identified through the shared CCdz catalog. PMB work also helps Cameroon, DR Congo and other Francophone markets. | Existing PMB code is deployment-specific. CCdz proves institution association, not current borrowing status. Preserve fresh-form state and item restrictions. |
| [Brazil](brazil/report.md): SophiA plus Pergamum | Ten substantial selected targets. Six use SophiA and three Pergamum; a tenth uses Koha. These are often multi-campus networks counted once. | Separate modern and legacy SophiA flows, Pergamum holdings attribution, anonymous form sessions, edition identity and lending eligibility. |
| [Thailand](thailand/report.md): UC-TAL | Three actual union queries identified books at ten selected universities, with explicit institution IDs and local-record mappings. High reach from one new discovery integration. | Union ownership is not live circulation. Some local links are stale and the tested item relay failed. Anonymous public token issuance must stay transient. |
| [Kenya](kenya/report.md), [Sri Lanka](sri-lanka/report.md), [DR Congo](dr-congo/report.md): follow-on reuse | Kenya/Sri Lanka extend Koha; DR Congo extends PMB. These add useful reuse opportunities beyond the first pilots. | Public borrowing differs from catalog access. Sri Lankan union maintenance and Congolese consultation-only collections need explicit product treatment. |

[Vietnam](vietnam/report.md) also reached ten selected candidates, but its mix of KIPOS, Vebrary and local systems increases implementation work. [Türkiye](turkiye/report.md), [Egypt](egypt/report.md) and [South Africa](south-africa/report.md) have potentially large shared-service opportunities—KYGM, EULC/Future and Sabinet/OCLC respectively—but this study did not establish open, usable access to those broad services. They are supported-access or institutional-cooperation leads.

## Country results

“Selected” means a substantial institution/network with an observed book response and an explicit size source or institutional-scale rationale. It does not mean nationally ranked top ten, cleared for production, publicly borrowable, or currently available. Reserves include smaller, partial, test or restricted observations; Mexico's UAAAN is policy-excluded and must not be replayed.

| Country | Major priorities | Selected | Reserves | Most useful platform or network route |
|---|---:|---:|---:|---|
| [Brazil](brazil/report.md) | 24 | 10 | 0 | SophiA and Pergamum cover nine selected networks; IFPE adds Koha. Strong scale, multiple frontend generations. |
| [Mexico](mexico/report.md) | 14 | 3 | 4 | UNAM Aleph is the largest verified network; Koha offers two other selected targets. ADABI heritage subsets stay reserves. |
| [Colombia](colombia/report.md) | 12 | 0 | 3 | Koha is the best evidenced reuse direction; three PMB successes remain reserves. Major Janium/Primo routes are restricted. |
| [Peru](peru/report.md) | 12 | 4 | 1 | Three selected Koha universities plus UNSM Quibuk. National SNB reach is promising but its interface was denied. |
| [Argentina](argentina/report.md) | 10 | 4 | 0 | Pérgamo supports two selected networks; UNS VuFind and UNLP PMB add two. SIU BDU remains rate-limited. |
| [Vietnam](vietnam/report.md) | 16 | 10 | 1 | Ten selected targets across KIPOS, Vebrary, SLIB, PSC zLIS and custom systems; the Koha observation is a test-labeled reserve. More adapters and multilingual matching work. |
| [Thailand](thailand/report.md) | 14 | 10 | 2 | UC-TAL returned ten selected universities through three union queries. Institution attribution is verified; circulation is not. |
| [Nepal](nepal/report.md) | 15 | 6 | 3 | Four selected Koha institutions, Dilliraman PMB and a custom PNC route. Good reuse opportunity; sampled records can lack copies. |
| [Sri Lanka](sri-lanka/report.md) | 10 | 4 | 6 | Koha is supported by a dated university study and current public catalogs. VUC adds ownership discovery with a maintenance-limited holdings feed. |
| [Türkiye](turkiye/report.md) | 10 | 1 | 1 | KYGM central Koha could reach a large public network, but robots excludes it. Millet Yordam is the one selected success. |
| [Egypt](egypt/report.md) | 10 | 1 | 2 | EULC/Future has the strongest prospective university reach. Only Cairo Law selected; many major routes remain blocked. |
| [Morocco](morocco/report.md) | 10 | 1 | 2 | Saïs GLB is the selected success; CJB/INAU PMB are smaller reserves. Shared CBM/Ministry services need further access verification. |
| [Algeria](algeria/report.md) | 16 | 10 | 1 | Five PMB institutions, Béjaïa SYNGEB and four CCdz institution filters. Strong Francophone platform and union opportunity. |
| [Iraq](iraq/report.md) | 14 | 5 | 2 | Direct Baghdad/National/Mustansiriyah plus member-specific lib.iq union results. Union edition and branch attribution require care. |
| [Ethiopia](ethiopia/report.md) | 13 | 3 | 0 | Koha reuse at Admas plus custom Abrehot and AU catalogs. CEARL is a discovery/network lead, not a verified shared holdings API. |
| [Democratic Republic of the Congo](dr-congo/report.md) | 14 | 6 | 1 | PMB offers several selected institutions and networks. Consultation-only, not-for-loan and on-loan examples matter for the product. |
| [Kenya](kenya/report.md) | 18 | 5 | 1 | Five selected Koha institutions. KNLS WebCat offers wider prospective reach but was not verified as a usable union connector. |
| [Tanzania](tanzania/report.md) | 19 | 5 | 0 | Four selected Koha institutions plus the custom ZLSB catalog. TLSB iNDLS documents 11 current libraries versus 43 planned; do not count the plan as live coverage. |
| [Uganda](uganda/report.md) | 20 | 4 | 2 | Selected Koha/custom-fronted institutions; CUUL/RENU union is a future discovery lead, not a verified title success. |
| [Ghana](ghana/report.md) | 19 | 2 | 2 | Two selected Koha institutions; smaller Koha and digital-only SLiMS reserves. CARLIGH subscriptions are not a physical-book union. |
| [Cameroon](cameroon/report.md) | 14 | 2 | 2 | PMB at UCAC and UPAC provides university opportunities; small IIA stays a reserve. Several major universities lack verified public routes. |
| [Côte d’Ivoire](cote-divoire/report.md) | 14 | 3 | 1 | CNDJ custom, ENSEA PMB and IFCI Bibliosoft are selected. COBES-CI is a network lead; survey market-share claims conflict. |
| [Angola](angola/report.md) | 14 | 3 | 0 | BNA and Lusíada support Koha reuse; ReMA supplies network discovery. ISPTEC Pergamum failed; Metodista direct details do not prove search. |
| [Mozambique](mozambique/report.md) | 10 | 2 | 2 | Koha and legacy iAH/ISIS routes coexist. UEM is a national university network; UJC provides a practical Koha candidate. |
| [South Africa](south-africa/report.md) | 10 | 1 | 0 | eThekwini Sirsi Portfolio is verified. Sabinet/OCLC and other major discovery systems require supported access arrangements. |

## What the market evidence supports

The strongest general lesson is to organize implementation around reusable systems and shared catalogs while preserving institution-specific evidence. Koha has the clearest existing-code reuse path across multiple countries. PMB has a strong observed Francophone footprint. Brazil merits SophiA/Pergamum work; Thailand and Algeria merit union-catalog work. Argentina's Pérgamo is a different product from Brazil's Pergamum, and South Africa's SLIMS is different from Indonesia's Senayan SLiMS.

There is no reliable, comparable current national LMS-share census across these 25 markets. The country reports distinguish current institutional deployments, vendor footprints, dated surveys and this access-selected sample. For example, Sri Lanka's scoped 2021 university study does not describe all public libraries today; Côte d'Ivoire's survey contains conflicting percentages. “Most common” is reported only as far as the cited evidence supports it. Network membership, journal subscriptions, repositories and library directories are not treated as proof of searchable physical holdings.

The country set uses [World Bank population and income context](country-context/README.md): all 25 were low- or middle-income economies in the retrieved metadata and each exceeded 20 million residents in 2024. Their combined 1.681 billion residents are not an estimate of product users. Brazil, Mexico, Thailand, Türkiye and South Africa have substantial existing library infrastructure; their opportunity is fragmented discovery, uneven coverage and access, rather than a blanket absence of infrastructure. This is a varied expansion screen, not a ranking of deprivation.

## Evidence, limitations and implementation handoff

Every observed institution has an exact query, method/payload, UTC check, returned title/identifier, raw or explicitly redacted response, platform evidence, size rationale and access notes in its dossier. Some queries returned related works, translations or commentaries; those are labeled and must not be converted into exact-edition matches. Union members count only where actual returned records identify the institution. Whole unions are not counted again as additional libraries.

The shortfall is substantive. Some large catalogs prohibit automation, require authentication, return challenges or fail technically; some accessible collections are too small or partial to justify selection. Size evidence also mixes dates and units—books, titles, mixed resources, records and network extent—which prevents a national largest-ten ranking. Selected targets are not all equally large. Country reports keep both numeric sources and explicit institutional proxies visible.

Around 08:21–08:31 UTC, identical upstream proxy failures affected unrelated control and library origins. Controls and client comparisons are retained in [country-context](country-context/README.md). Later independent recoveries allowed additional bounded checks in Cameroon, Côte d'Ivoire, Angola and Mozambique. Remaining transport failures are observations from this research environment, not evidence of countrywide library outages or missing books. Low verified counts must not be read as low national potential.

An observed “Available” copy does not establish that an outside reader can borrow it. Room-use, reference-only, no-copy and on-loan states remain distinct. A union record may prove catalog ownership while its local link or circulation service is stale. Iraq's union can associate different local editions with one shared record; Thailand's local links need independent validation. Captured UNAM Aleph session links are transient. UAAAN's initial query followed an incorrect policy interpretation; it is preserved only as an excluded historical observation. The review also retains the disclosed Congo and Türkiye crawl-delay deviations.

No production providers were enabled and no library was contacted. The next implementation work should follow the [adapter roadmap](adapter-roadmap.md), with deployment-specific parser checks, edition-ID preservation, public-access qualifications and explicit unknown availability where a feed cannot answer.

[Package validation](validation.json) · [Independent quality review](quality-review.md) · [Protocol](PROTOCOL.md) · [Policy replay](policy-audit.json) · [Book-evidence triage](book-evidence-check.json) · [UNAM manual evidence review](manual-evidence-review.json). The offline policy replay checks saved query/linked-record paths; it is not a complete timing, redirect-chain or reuse-permission audit. The title/ID triage supports inspection and is not semantic proof of every book or holding.
