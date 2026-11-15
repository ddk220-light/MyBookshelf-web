# Library expansion across five countries

Initial batch: 14 November 2026, America/Los_Angeles. Follow-up research and live checks: 15 November UTC. MyBookshelf adapter review baseline: `84cda3aaf52dbce539d60a228f63607345add833`.

## Executive summary

**Every country now has at least ten catalogs with observed specific-book results: 56 institutions or networks in total, comprising 46 selected targets and 10 reserves.** The follow-up added nine successful catalogs. Nigeria now has ten observed successes, but four are smaller or lack sufficient current size evidence, so its stronger shortlist remains six. The [complete query inventory](verified-searches.md) links actual searches and returned records; [CSV](verified-searches.csv) and [JSON](verified-searches.json) preserve request parameters and evidence.

**Koha is the best first investment for reuse across countries: 19 of the 46 selected targets were verified through Koha catalogs.** Captured book-search responses from Bangladesh, Pakistan, Nigeria and the Philippines work with existing MyBookshelf parsers, with template and holdings limitations documented below. Bangladesh offers a particularly substantial set of verified academic catalogs. This establishes a practical implementation starting point, while catalog policies, reader eligibility and deployment checks remain institution-specific. The 19-target count describes this selected sample, not national LMS market share.

**The largest network opportunities need a different approach from adding individual catalogs.** Pakistan's PakCat and PASTIC services, Bangladesh's government library service, Nigeria's NOUN network, the Philippine eLib and UP systems, and Indonesia OneSearch aggregate different kinds of institutions or records. They should be assessed as distinct network integrations; their membership figures are not counts of libraries already verified by this work.

**The largest libraries do not all use the easiest software to integrate.** Follett is the largest named product in the cited Philippine higher-education sample. Indonesia's major institutions use SLiMS, INLIS and several custom systems. Nigeria's successful Lagos and Benin searches use NewGenLib. MyBookshelf currently needs additional adapter work for those families.

The country dossiers retain both successful searches and larger blocked candidates. Published collection figures use different dates and units, so the results identify substantial institutions and networks rather than establish a definitive national size ranking. A search that returns a book is also distinct from evidence that the selected library has a usable copy available now.

| Country | Selected | Reserves | Total observed | Qualification that changes the next step |
|---|---:|---:|---:|---|
| Bangladesh | 10 | 1 | 11 | All ten now have collection-size evidence: nine official sources and one secondary report. Four catalogs use HTTP origins; two need richer-parser changes. |
| Pakistan | 10 | 2 | 12 | NDU replaces restricted UMT. Punjab now exposes stable IDs through its legacy form POST. NUML's policy remains unresolved. |
| Nigeria | 6 | 4 | 10 | Ekiti, NISER, Mountain Top and Lokoja add actual searches, but do not establish four additional largest-library targets. |
| Philippines | 10 | 2 | 12 | LST and AIIAS replace two smaller public pilots. Ten selected institutions use eight primary endpoints. LST returned related titles and has unresolved repeat-search reliability; union holdings can be historical. |
| Indonesia | 10 | 1 | 11 | UI Fasilkom is a faculty-only reserve. New adapters are needed; UIN Sunan Kalijaga's stable record mapping remains unresolved. |

These counts measure successful research queries. They do not count software integrations, policy approvals, branches, national size ranks or independently validated uptime.

## What the follow-up changed

- **Pakistan:** National Defence University contributes a dated official figure of 105,000 printed books and a working LibMax query. UMT remains a restricted reserve. Punjab's official legacy form returned stable MFN/LibId identifiers; the original identifier gap is resolved. Sindh Agriculture University is an additional Koha reserve.
- **Philippines:** Loyola School of Theology reports approximately 113,000 mixed book/periodical volumes, and AIIAS reports more than 70,000 book volumes. Both returned book records; Imus and Butuan remain smaller public reserves. LST's *Confessions of Saint Augustine* query returned two related books, not the exact requested edition. Its first search and detail succeeded, but later empty responses prevent a reliability claim. AIIAS returned the requested *Research design: why thinking about design matters*.
- **Nigeria:** Four new catalogs returned books: NISER, Ekiti's Oloniyo public library, Mountain Top University and Federal University Lokoja. NISER's roughly 18,000 volumes are a 1972 observation, Lokoja's 9,000 titles are from 2019, and the other current totals are unknown. These are useful reserves, not evidence that the largest-library gap is closed.
- **Bangladesh and Indonesia:** Official and secondary size evidence now has clearer dates and scope. Bangladesh's ten all have a published collection figure. Indonesia's UIN count, historical ITB/Padjadjaran counts and faculty-only Diponegoro count strengthen selection evidence without becoming a current national ranking; a UI Fasilkom book query adds a narrowly scoped reserve.

## Country findings

These five countries combine large populations with identifiable catalog-integration opportunities. Their library infrastructure varies substantially within each country; the opportunity is to connect existing collections and expose access conditions accurately. Indonesia and the Philippines already have significant national and institutional systems, so interoperability is a more defensible premise than a blanket absence of infrastructure.

| Country | Population, 2024 | Why it remains a useful target |
|---|---:|---|
| Bangladesh | 173.6 million | Numerous tested Koha catalogs support a practical first launch; the government public-library service offers a separate network opportunity. |
| Pakistan | 251.3 million | Large university collections and PASTIC/PakCat coordination offer reach; mixed platforms and restricted network routes need deliberate integration work. |
| Nigeria | 232.7 million | Koha adoption and NOUN's network offer reuse, while uneven externally accessible catalog coverage makes verification especially valuable. |
| Philippines | 115.8 million | National and scientific union catalogs provide shared discovery routes; Follett, TLC and other systems require broader adapter coverage. |
| Indonesia | 283.5 million | Large public and university collections, SLiMS/INLIS reuse and Jakarta's branch holdings justify a larger engineering investment. |

Population figures are rounded [World Bank 2024 observations](https://api.worldbank.org/v2/country/BGD;PAK;NGA;PHL;IDN/indicator/SP.POP.TOTL?date=2024&format=json&per_page=100), retrieved 15 November 2026; [raw data](country-context/population-2024.json) are retained. Population is context, not a count of eligible readers or accessible library users.

| Country | Platform strategy | Network opportunity | Main implication |
|---|---|---|---|
| [Bangladesh](bangladesh/report.md) | Start with verified Koha academic catalogs. A current nationwide LMS market-share ranking was not established. | Investigate the government's Amar Library service separately. BANSDOC's observed union catalog is for journals, not a demonstrated physical-book connection. | Strong first country for reusing the current adapter; preserve HTTP-origin, parser and university-access qualifications. |
| [Pakistan](pakistan/report.md) | Koha is a useful common family, but large institutions also use SLiMS, Insignia and custom catalogs. | PakCat's 157 participating libraries are distinct from PASTIC's 193 consortium members and 41 hosted Koha catalogs. | A shared-network agreement could be valuable. Explicit search exclusions prevent treating the listed network as immediately available for automation. |
| [Nigeria](nigeria/report.md) | Koha has the strongest adoption evidence in the inspected federal-university sample. Add NewGenLib if the large Lagos and Benin collections are priorities. | NOUN exposes 42 named branches and units in one observed catalog. | NOUN is a strong network pilot. Verify branch scope and local holdings before assigning the whole network collection to any one location. |
| [Philippines](philippines/report.md) | Koha offers immediate code reuse; Follett merits a larger strategic workstream. TLC/LS2 and custom services also appear among major libraries. | Philippine eLib offers a shared route to participating institutional collections; UP also has a separate union-discovery service. | Distinguish historical union-catalog holdings from current circulation availability. Search restrictions affect several major direct catalogs. |
| [Indonesia](indonesia/report.md) | Build reusable SLiMS and INLIS support, alongside selected custom systems. Existing installation lists do not establish current national market shares. | OneSearch is a broad metadata network. Jakarta's public-library system is a more concrete physical-book and branch-availability pilot. | Indonesia offers substantial reach with more engineering work; repository records should not be presented as available physical copies. |

Each country report contains collection-size evidence, exact query requests, returned books and record identifiers, access observations, platform evidence, and blocked alternatives. The [verification method](verification-method.md) defines how these observations are interpreted.

## What to implement first

1. **Prove a small Koha launch across representative institutions.** Start with standard HTTPS catalogs whose saved searches and records parse correctly. Exercise the actual lookup layer, permission checks, edition matching and failure states before enabling directory validation flags. The country dossiers identify the candidate institutions and their remaining issues.
2. **Treat network access as a separate workstream.** A single agreement or supported interface can be more useful than many unrelated page parsers. Confirm the catalog operator's permitted interface and the exact institution/branch scope returned. Membership, metadata coverage and live item availability are different measures.
3. **Add reusable families where the verified institutions justify them.** SLiMS has cross-country value in Indonesia and Pakistan. INLIS matters for Indonesian public-library coverage. NewGenLib would support the observed Nigerian Lagos and Benin catalogs. TLC/LS2 now appears at four selected Philippine institutions, and LibMax at two selected Pakistani institutions. Follett has strong adoption evidence but no successful permitted book query in this sample. These families, Insignia and other custom systems require their own adapters and verification of search, record and holdings responses.
4. **Choose public-reader and academic pilots deliberately.** University catalogs can serve students and affiliated readers, but their public web search does not establish unrestricted building access or borrowing. Public-library networks such as Jakarta deserve attention even when their connector takes more work.

## What the existing adapter checks establish

The [adapter readiness report](adapter-readiness.md) documents the current implementation and links the offline parser and robots-policy audits. Standard Koha responses offer genuine reuse. CUET and RUET require work on the richer title-search parser even though the simpler search parser reads their saved results. MMSU exposes a more consequential holdings issue: its record marks a copy as available but also says “Room Use Only” in Notes, which the current parser misses. That restriction needs to be preserved before rollout. Current VuFind and PMB implementations are pinned to known deployments; they are not unrestricted configuration-only connectors.

Offline replay establishes compatibility with a captured response. It does not establish a live deployed integration, permission to query, or continued service reliability. No app directory, provider implementation, production configuration or deployment is changed by this research.

## Evidence and follow-through

- Country dossiers: [Bangladesh](bangladesh/report.md), [Pakistan](pakistan/report.md), [Nigeria](nigeria/report.md), [Philippines](philippines/report.md), [Indonesia](indonesia/report.md).
- [All selected verified queries and returned books](verified-searches.md), with [CSV](verified-searches.csv) and [JSON](verified-searches.json) downloads.
- [Current adapter constraints and reproducible offline checks](adapter-readiness.md).
- [Selection and verification definitions](verification-method.md).
- [Independent follow-up evidence and inventory review](continuation-qa.md).
- Raw public-response snapshots and exact request metadata are retained under each country's `evidence/` folder. A failed or restricted candidate remains visible in its country dossier.

The requested end state was ten large, verifiable book-search targets per country. Actual book queries now cover at least ten institutions in every country, but the stronger selected shortlist remains 46. Nigeria's four reserves do not close the large-library selection gap, and a definitive largest-ten ranking in each country remains unresolved. Directory entries, blocked endpoints, zero-result responses and alternate URLs for one institution do not fill those gaps.
