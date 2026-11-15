# South Africa: international library expansion

Research date: **15 November 2026 UTC**. **1 observed substantial network, 1 selected target, 0 reserves. Nine further verified targets remain outstanding.** Ten major priorities are retained below. Policy restrictions and inaccessible origins prevented verification of most major collections; these failures do not establish that books are absent.

**Recommendation:** investigate eThekwini as a concrete Sirsi Enterprise/Portfolio pilot, and pursue a supported Sabinet/OCLC holdings arrangement for wider reach. South Africa already has strong shared cataloguing, interlibrary services, large public networks and sophisticated academic discovery systems. MyBookshelf's opportunity is easier discovery across those systems, reliable edition matching and clearer access guidance. This is not a country lacking library infrastructure nationwide.

## Marketplace and shared services

Academic and metropolitan collections are substantial: official sources report more than 1.5 million printed book items at Unisa, over one million book volumes at Wits, more than 1.2 million print volumes at UCT, and 102 City of Cape Town libraries. These differently dated measures cannot produce a national ranking. Rural access, connectivity, opening conditions, skills and membership still vary. A [2024 Rustenburg study](https://sajim.co.za/index.php/sajim/article/view/1769/2678) surveyed 35 staff and found substantial reliance on manual systems and limited use of available automation. That municipality-specific finding must not be projected onto the whole country. [Raw study](evidence/rustenburg-study.html).

[Sabinet's 2026 account](https://sabinet.co.za/30-years-of-connecting-south-african-libraries-to-the-world/) describes cooperative cataloguing integrated into WorldCat since 2006 and WMS in South Africa since 2013. SabiCat/SACat/WorldCat and interlibrary services offer the most plausible broad route, subject to provider terms and a supported agreement. Bibliographic holdings would establish which institution reports an edition; they would not establish a currently lendable copy. Sabinet's journal and legislative databases, licensed ebooks and institutional repositories are different resources from local physical-book holdings. No licensed API was accessed. [Saved source](evidence/sabinet-source.html).

[SEALS](https://www.seals.ac.za/) connects Nelson Mandela, Rhodes, Fort Hare and Walter Sisulu universities. Its historical website still discusses Millennium, but the old catalogue now redirects to a **Primo NDE union view**. [Rhodes' current announcement](https://www.ru.ac.za/library/latestnews/rhodes_university_library_management_system_upgrade-1.html) confirms Sierra-to-Alma migration and Primo discovery. The new origin prohibits `/primaws`, `/discovery/search` and `/nde/search`. None of the four institutions was counted: a union homepage and a member list are not four verified holding queries. [Redirect evidence](evidence/seals-robots.json), [current policy](evidence/seals-primo-robots.html).

The platform landscape is heterogeneous. This sample directly observes eThekwini Sirsi Portfolio; classic Innovative-style OPACs at Wits, Unisa and UJ; Primo routes at UCT and Stellenbosch; and provincial SITA SLIMS routes. The current UWC institutional homepage embeds **EBSCO Discovery**, so its historical Alma/Primo adoption does not establish its present discovery interface. DUT's current catalogue link is also an EBSCO guest route. These EBSCO policies prohibit the applicable agent. [UWC source](evidence/uwc-source.html), [DUT source](evidence/dut-source.html).

**Platform names and dates matter:** South African SITA/Brocade **SLIMS is not Indonesian Senayan SLiMS**. A [2015 IFLA paper](https://library.ifla.org/1083/1/207-ruppelt-en.pdf) identifies Cape Town's then-current Brocade system; [later official links](https://www.capetown.gov.za/Media-and-news/Celebrate%20South%20African%20Library%20Week%20with%20the%20City%27s%20libraries) use Sirsi-style `/client/en_US/` paths. The present Cape Town backend was not verified. Keep the city's catalogue separate from Western Cape provincial `wc.slims.gov.za`. No LMS national market-share percentage is inferred from this feasibility sample.

## Ten major priorities

This is a source-backed opportunity list, **not the ten largest libraries in South Africa**. A whole institutional or municipal network is counted once.

| Institution/network | Published scale or explicit proxy | Observed outcome |
|---|---|---|
| eThekwini Municipal Libraries | [Three million books, >96 public libraries](https://economic.durban.gov.za/uploads/0000/6/2025/08/11/metro-ezasegagasini-23-jul-2021-english.pdf), municipal newspaper dated July–August 2021 | **Selected:** title query and local copy detail returned |
| National Library of South Africa | [Over one million books and periodicals in the General Reading Room](https://www.nlsa.ac.za/using-the-library/); undated, not a book-only institution total | Official homepage HTTP503; reliable current catalogue route not established |
| University of South Africa | [Over 1.5 million printed book items](https://www.unisa.ac.za/sites/corporate/default/Library/Search-library-resources); undated official page | OASIS search and applicable AI agents prohibited |
| University of Cape Town | [More than 1.2 million print volumes](https://uct.ac.za/uct-libraries); undated official overview | Primo search/API prohibited |
| Stellenbosch University | [1.2 million physical volumes](https://files.su.ac.za/public/about-library/documents/2026-01/annual-report-2023.pdf), 2023 annual report | Primo search/API prohibited |
| University of the Witwatersrand | [Over one million book volumes](https://www.wits.ac.za/media/wits-university/study/postgraduate/documents/wits-pg-studies-brochure2025.pdf), two main and nine branch libraries, 2025 | Search and applicable AI agents prohibited |
| University of Pretoria | [Over 700,000 printed books in 11 faculty libraries](https://drupalwebprod-files.up.ac.za/Public/2025-12/up-postgraduate-brochure-2025.zp260832.pdf?VersionId=HkGeBCBkWYsbe30ymXgBHdvrujMPz7JK), 2025 brochure | WorldCat Discovery prohibits all automated paths |
| City of Cape Town | [102 public libraries](https://www.capetown.gov.za/media-and-news/city-libraries-open-doors-to-learning-jobs-and-opportunity/), 22 January 2026; network proxy | Catalogue robots HTTP503; no query sent |
| City of Johannesburg | [89 public libraries](https://joburg.org.za/play_/Pages/Overview-.aspx); undated municipal overview, network proxy | MyLibrary robots HTTP503; no query sent |
| University of Johannesburg | [Campus library network including documented APK and DFC services](https://uj.ac.za.libguides.com/gis); institutional proxy, no numeric stock count established | UJLink search and applicable AI agents prohibited |

Size sources were primarily read through indexed official pages/PDFs. The three saved discovery responses and [eThekwini size discovery](evidence/durban-size-discovery.json) retain those observations. They are not direct catalogue evidence. Document dates, not search-engine upload estimates, are used for historical figures.

## Actual successful title query

| Network | Submitted text | Response | Verified returned book | Local holding evidence |
|---|---|---|---|---|
| eThekwini Municipal Libraries | `Long walk to freedom` | HTTP200; **49 local results**, with **43 Books** in the format facet | *Long walk to freedom*, Nelson Mandela, Chris Van Wyk, Paddy Bouma; London: Macmillan Children's Books, 2009; ISBN **9781405091886**; **SD_ILS:1126617** | Asherville: **J 920 MAND**, Juvenile Non-Fiction; Don Africana: **DON 920 MAND**, Reference Non-Fiction; Pinetown: **RE MAND**, Juvenile English Fiction; other municipal locations also listed |

This is the illustrated **children's adaptation**, not an assertion that the original adult edition shares its identity. The total includes other editions, related titles and non-book formats. The selected record's title matches the submitted title; ISBN and source record identity are retained.

The homepage supplied an anonymous POST search form. The actual request, payload, UTC timestamp, HTTP status and redirect URL are in [query metadata](evidence/durban-query.json); the [raw response](evidence/durban-query.html) returns the books. Reproduction requires fetching a fresh form and its transient hidden state, entering the exact title in `q`, and submitting the normal search action. The saved nonce is evidence, not a durable integration credential. No cookie jar, account or authentication was used.

The title's observed public AJAX detail URL returned structured content with the normal `X-Requested-With: XMLHttpRequest` header. The same URL as an ordinary page returned a system-error frame; the failed response is retained separately. [Successful raw detail](evidence/durban-detail-ajax.html), [request metadata](evidence/durban-detail-ajax.json), [readable extraction](evidence/durban-detail-readable.txt). The response also supplies a source-native sharing URL recorded in `findings.json`; that share URL was not separately replayed.

**Circulation remains unknown.** Copy rows displayed `Searching...`/`Unknown`. The normal POST availability request embedded in the returned public script responded without item-status values; [raw result](evidence/durban-holdings.html), [metadata](evidence/durban-holdings.json). Location/call-number evidence is positive, but this is not proof that a copy can be borrowed now. The Don Africana reference classification must survive any adapter. Cached availability-summary labels are not substituted for live item status.

The municipal catalogue identifies **Sirsi Corporation Portfolio 5.2.1.5** in its footer. This needs a new adapter family: form/redirect handling, public AJAX detail parsing, exact `SD_ILS` identity, ISBN/edition separation, reference restrictions and explicit unknown-status handling. The app's Koha adapter is not a configuration-only solution. No live MyBookshelf integration was tested.

The city's [service guidance](https://www.durban.gov.za/page/community-services) describes free entry and library-card borrowing, with identification and address evidence for membership. Public discovery does not grant lending eligibility. Current access rules should accompany a future integration.

## Blocked alternatives and policy evidence

Sixteen blocked/unverified candidates are individually recorded in [findings.json](findings.json), with local request evidence. The strongest additional routes were investigated rather than replacing major institutions with small colleges:

- **SEALS's four universities:** migrated union view found, but current Primo search/API restrictions stop verification. No member was counted from a branch or scope selector.
- **Western Cape and KwaZulu-Natal provincial SLIMS:** official/observed links found; both robots files prohibit all paths.
- **UWC and DUT:** current official catalogue links discovered; EBSCO policies prohibit applicable agents. No guest or login route was used to evade those rules.
- **CPUT:** official description identifies seven campus libraries and Alma/Primo; landing request failed HTTP503. No tenant address was invented.
- **Cornerstone Institute:** a smaller Koha alternative was identified from its official homepage; catalog robots fetch failed with tunnel HTTP403. It was not promoted to a major target.

The [policy ledger](evidence/policy-decisions.json) applies longest matching paths, includes named applicable AI-agent restrictions and preserves the distinction between prohibited and unresolved. eThekwini robots returned HTTP404 before the search: no published rule was found, but this is not a reuse licence. HTTP503 and tunnel failures were never treated as permission. No alternate user agent, disabled TLS, challenge bypass or repeated blocked-origin search was used.

## Delivery limits

The requested ten verified substantial targets remain unmet. The dossier preserves **one strong, reproducible network success and nine outstanding targets**, with major blocked collections still visible. None of eThekwini's branches is counted separately. A failed automated check is not a finding that an institution lacks the title, a catalogue or useful infrastructure.

The research does not establish current national stock rankings, LMS market share, licensed reuse rights, borrower eligibility, or live availability. All application code and production configuration remain unchanged. No outreach, holds or account actions occurred.
