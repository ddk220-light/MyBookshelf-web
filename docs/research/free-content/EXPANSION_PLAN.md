# Expanding searchable free knowledge

Planning draft, 2026-11-05. Owner request: a route to 100+ sources overall and,
eventually, 100 qualified sources in each category, including international and
India-specific coverage. The owner accepted the content categories and requested
a 20-industry group, detailed discovery methods for every group/category, and
special treatment of US/India civic records, property records and geological maps.
This revision incorporates six delegated research workstreams. It remains a plan;
the linked documentation research does not establish enabled integrations.

The [simple live plan](SIMPLE_LIVE_PLAN.md) remains the runtime baseline. This
proposal adds no hosted database, paid search service, production change or source
account. Worktree: `/workspace/MyBookshelf-web-free-content-expansion`, branch
`research/free-content-discovery-expansion`, based on main `82c6559`.

## 1. Goal and counting rules

The useful outcome is: **a reader searches for something and receives a matching
item, its actual source, and an evidenced free reading/listening/viewing link.**
A list of promising websites is an intermediate research output.

Use 20 research categories: five core areas and 15 additions. Target 100 qualified
sources per category over successive research cycles. These are overlapping
category memberships, potentially 2,000 memberships, not necessarily 2,000 unique
sources or 2,000 custom integrations. Report the global unique count separately.

Add **Industry and job knowledge** as a visible group with 20 industry tags. It is
a second classification axis across those content categories. Track industry
coverage independently and use the same 10 → 25 → 50 → 100 ladder as an eventual
research aspiration for each industry. The same origin may support several
industries and categories; these memberships never add to the global unique count.

Keep four counts separate:

| Count | Definition |
| --- | --- |
| Candidate origin | An identified publisher, repository, institution or community with a distinct maintained content catalog; eligibility is unproven. |
| Qualified origin | A candidate whose relevant catalog or explicitly bounded subset passes the queryability, access, permissions and cost gates below. Record the tested scope and date. |
| Enabled origin | A qualified origin actually reachable through a released, tested integration, with current evidence. A source awaiting implementation is not enabled. |
| Connector / index | A machine interface used to reach origins. One aggregator connector can cover multiple evidenced origins; several connectors can cover the same origin. |

Count an origin once globally, and at most once in each relevant category.
Mirrors, language views, formats, feed endpoints, journal titles under one
publisher, and collections under one catalog do not inflate the origin count.
Separately maintained institutional catalogs can qualify independently when their
ownership, identifiers, searchable scope and evidence are recorded. An individual
article, course, podcast episode or PDF is an item, never a source.

For aggregator coverage, record `originId`, `connectorId`, provider attribution
and scope together. An aggregator's advertised institution count is not our
enabled-source count. Each claimed origin needs its own retrieval/access sample;
do not count the aggregator and its member catalogs twice as content origins.

The 100-per-category goal is an ambition to test. Some categories, especially
free audiobooks or children's publishers with reusable catalogs, may have fewer
than 100 suitable independent origins. Record a shortfall and keep the quality
gate; do not pad the count with mirrors or paywalled catalogs.

## 2. Twenty categories and how to find candidates for each

These are research workstreams and future filters, not a proposal for 20 app tabs.
Formats, subjects, languages, audience, source country and access country remain
separate facets. A Tamil children's audiobook can belong to several categories.
Names below are discovery leads, not newly certified integrations.

For **every row**, run the same 10 → 25 → 50 → 100 qualification ladder described
in section 5. The last three columns specify where that row's candidate pool
comes from and the technical route to investigate.

| ID / category | International discovery route | India and local discovery route | Queryability route to investigate |
| --- | --- | --- | --- |
| C01 Children's books and early literacy | Literacy-network publisher/member lists; children's collections in OER directories; trace publishers from StoryWeaver, African Storybook and Book Dash leads | Indian literacy NGOs, Pratham-related catalogs, state literacy programs, regional-language publishers; native-script searches | Licensed catalogs/feeds or attributed aggregator records; preserve translation, credits, language and publisher reading level |
| C02 General books and ebooks | National-library digital catalogs, public-domain publisher directories, Wikisource community links, Gutenberg-related catalogs | National/state digital libraries, regional literature academies, university digitization projects, Tamil/Hindi and other language collections | Official metadata exports, OPDS or documented search; distinguish full books from scans of covers, previews and loans |
| C03 Published research articles | OpenDOAR, DOAJ publisher/journal discovery, OpenAlex origins, SciELO country collections and disciplinary indexes | INFLIBNET/institution directories, Indian learned societies, university and research-institute OA journals | Attributed aggregator query first; native article search or permitted journal metadata harvest where justified |
| C04 Textbooks and scholarly books/chapters | DOAB publisher records, OAPEN, Open Textbook Library, open university presses and OER collections | NCERT, university presses, e-PG Pathshala, open course-text projects and state textbook bodies | Official exports/OAI-PMH plus bounded local search, or supported API; edition/chapter identity and per-book access |
| C05 Audiobooks and recorded books | Public-domain audio publishers, LibriVox-related collections, library audio collections and publisher feeds | Regional-language volunteer reading projects, public cultural institutions and eligible accessible-book initiatives | Search API, reusable catalog or complete feeds; distinguish complete recordings, samples, abridgements and eligibility restrictions |
| C06 Theses and dissertations | OpenDOAR by institution/country, national thesis portals and university repository directories | Shodhganga participating institutions, UGC/AISHE institution lists, IIT/IISc and university repositories | Attributed index or OAI-PMH/DSpace/EPrints export; record embargoes and thesis-native IDs |
| C07 Preprints and working papers | Disciplinary preprint directories, research-network members, institutional working-paper series | Indian institute departments, economics/social-science research centers and open manuscript repositories | Aggregator coverage or supported search/date feeds; exact version, publication relation and preprint label |
| C08 Government, policy and development reports | UN/multilateral publication catalogs, national agencies, policy institutes and open repository directories | Union/state ministries, RBI, NITI Aayog, research councils and state planning bodies | Publication API/export or permitted bounded catalog; jurisdiction, report date/version and actual document access |
| C09 School lessons, curricula and examination resources | Education ministry portals, teacher OER networks and curriculum repositories | DIKSHA organizations, SCERTs, state boards and official examination bodies | Supported catalog/search or export; board, medium, grade and curriculum year; avoid unauthorized commercial exam copies |
| C10 Courses, lecture notes and teaching materials | Open-education consortium members, university OpenCourseWare directories and OER hubs | NPTEL, SWAYAM, IIT/university course portals and teacher-education institutions | Course catalogs/feeds with stable lesson IDs; separate free learning material from paid certificates/enrollment conditions |
| C11 Encyclopedias, dictionaries and reference works | Wikimedia project communities, scholarly reference publishers, national reference portals | Regional-language reference communities, language academies, public terminology projects | MediaWiki/search APIs or approved exports; search entries, not merely reference-site homepages |
| C12 Technical documentation and software manuals | Official project documentation indexes, open-source organization catalogs, standards-body free-document lists | Public technology initiatives, Indian research/software projects and institution technical manuals | Versioned document catalogs, supported search or licensed exports; validate project ownership and version |
| C13 Practical, vocational and agricultural guides | Extension-service networks, vocational OER directories, development organizations and maker-education catalogs | ICAR/KVK networks, agricultural universities, skill-training agencies and state extension departments | Official publication feeds/catalogs or indexed repository subsets; language, region, publication date and intended use |
| C14 Language learning and adult literacy | Language-institute directories, adult-education networks and open language-course collections | CIIL-related initiatives, state literacy missions and regional language departments | Reusable lesson/book catalogs or indexed open courses; preserve script, proficiency and audio/text distinctions |
| C15 Historical documents, manuscripts and archives | National/archive association directories, Library of Congress, Europeana and regional aggregators | National/state archives, university special collections and regional manuscript initiatives | Collection search/export with digitized-item links; IIIF may describe/view an item but does not itself prove catalog search |
| C16 Art, museum and cultural-heritage resources | Europeana institution providers, museum open-access programs and cultural institution directories | National/state museums, cultural academies and university museums | Collection APIs/exports; item identity, captions, provenance and image/object rights; metadata-only objects excluded from usable-access totals |
| C17 Newspapers, magazines and public-interest articles | National-library newspaper collections, nonprofit newsroom networks, openly accessible periodical publishers | Regional newspaper archives, independent public-interest publications and government magazines | Full-article search or permitted metadata/feed import; recent RSS alone does not establish historical coverage |
| C18 Law, civics and public records | Dedicated US/India playbook: laws, civic decisions, budgets, procurement, ownership/land records, permits and planning | Union/state/district/municipal records; parallel US federal/state/county/city discovery, detailed in P02–P05 below | Supported document/address/parcel search or export; authority, jurisdiction, document number, effective date and actual record access |
| C19 Datasets, statistics, maps and atlases | Dedicated US/India playbook: geological, soil, hazard, topographic and historical maps; statistics, environment and infrastructure | National survey/statistical bodies, state agencies, local GIS and open-data portals, detailed in P05–P09 below | Distinguish catalog discovery, map viewing and feature/data queries; native layer/feature IDs, extent, CRS, scale and observation date |
| C20 Educational podcasts, lectures and documentaries | University/broadcaster educational series, open-media catalogs and educational feed directories | Public educational broadcasters, universities, science communicators and regional-language teaching series | Public catalog/API or permitted feeds; item-level audio/video links, language, duration, transcript/caption availability and geographic restrictions |

### Group-specific discovery playbooks

The category table is the overview. Each linked playbook gives category-specific
directories and documentation, global and local search recipes, likely retrieval
routes, qualification tests, unresolved evidence and first research batches.

| Research group | Category coverage | Detailed discovery plan |
| --- | --- | --- |
| Books and recorded books | C01, C02, C04, C05 | [Books and audio](discovery/BOOKS_AND_AUDIO.md) |
| Scholarly research | C03, C06, C07 | [Articles, theses and preprints](discovery/SCHOLARLY_RESEARCH.md) |
| Learning and technical knowledge | C09–C13 | [Learning and technical](discovery/LEARNING_AND_TECHNICAL.md) |
| Language, culture and educational media | C14–C17, C20 | [Language, culture and media](discovery/LANGUAGE_CULTURE_MEDIA.md) |
| Public information, civic records and maps | C08, C18, C19; P01–P09 | [US and India public records/maps](discovery/PUBLIC_RECORDS_AND_MAPS.md) |
| Industry and job knowledge | I01–I20 across all relevant content categories | [Twenty industries](discovery/INDUSTRIES.md) |

### Industry and job knowledge: first twenty industries

Use `industry × occupation × task × jurisdiction × content kind` to guide
discovery. For example, a construction supervisor searching concrete inspection
needs local building requirements and applicable technical guidance; an
agricultural worker searching soil suitability needs regional soil/terrain data
as well as practical guides. Tags identify relevance; they do not establish
professional suitability or current regulatory applicability by themselves.
The visible group belongs within Search/browse and its filters, preserving the
existing four main app tabs. Its eventual UI design must support task and
jurisdiction context without treating every resource as a book.

| ID | Industry | ID | Industry |
| --- | --- | --- | --- |
| I01 | Agriculture and horticulture | I11 | Energy, electricity and renewables |
| I02 | Livestock, dairy, fisheries and aquaculture | I12 | Mining and mineral resources |
| I03 | Forestry and timber | I13 | Transport, logistics and warehousing |
| I04 | Construction and civil infrastructure | I14 | Maritime, ports and shipping |
| I05 | Building operations and facilities | I15 | Aviation and aerospace |
| I06 | Manufacturing, machining and fabrication | I16 | Water, sanitation, waste and environmental services |
| I07 | Automotive and vehicle maintenance | I17 | Healthcare and care services |
| I08 | Chemicals and pharmaceuticals | I18 | IT, telecom and cybersecurity |
| I09 | Textiles, apparel and leather | I19 | Hospitality and tourism |
| I10 | Food processing and food safety | I20 | Finance, insurance and accounting |

An origin can expose textbooks, technical manuals, laws, datasets and courses
under the same industry tag. Keep occupation/task labels distinct from industry:
maintenance technicians and logistics workers operate in many industries. The
industry playbook supplies separate entry points and query recipes for every row;
additional industries can be added after the first coverage review.

### Dedicated civic-record and maps coverage columns

Maintain these explicit columns in the research coverage report, split by USA
and India. They are subtracks of the existing categories, not extra source-count
quotas. The [public-information playbook](discovery/PUBLIC_RECORDS_AND_MAPS.md)
contains the actual country-specific directories and example local portals.

| Coverage column | Parent | What a useful search must retrieve |
| --- | --- | --- |
| P01 Government/research reports | C08 | A report and edition/date from the responsible authority |
| P02 Laws, rules and gazettes | C18 | A named/numbered instrument with jurisdiction and effective/version context |
| P03 Civic decisions, budgets and procurement | C18 | An agenda, decision, budget, tender or award by body, topic, date or identifier |
| P04 Property, ownership records and land rights | C18 | A public parcel/deed/land-rights record by permitted address, parcel or document query; record type and authority explicit |
| P05 Building permits, zoning and planning | C18/C19 | A permit, planning document or applicable zone tied to a jurisdiction and location |
| P06 Geological, soil and hazard maps | C19 | A relevant map/layer and its coverage, scale, survey date and retrievable representation |
| P07 Topographic, land-cover and historical maps | C19 | A map sheet/layer by place, extent, subject and edition/date |
| P08 Census, statistics and time series | C19 | A table/series by geography, variable, period and release |
| P09 Environmental and infrastructure data | C19 | A dataset/layer or observation by topic, location, period and responsible body |

For P04, distinguish assessed ownership, registered deeds, land-rights records
and legal title; a match must retain the issuing authority's meaning. For P06/P07,
map-viewing capability and queryable geographic features are separate capabilities.
Capture geospatial fields and current/historical scope rather than presenting an
old or generalized map as a precise current property boundary. Research uses
catalog/schema examples; it does not require collecting personal ownership data.

Do not force every new item into `book` or `article`. Current contracts already
include audiobook, thesis, report and learning-resource kinds. Dataset, archive,
reference-entry and media semantics need explicit contract/UI decisions before
implementation; `other` is not a substitute for those decisions.

## 3. Discovery engines to use before broad web searching

Start with directories and networks that lead to many origins, then inspect each
origin's own documentation. This short documentation review establishes where to
look; it does not certify the listed origins' access or production reliability.

| Starting point | Why it helps | What it does not prove |
| --- | --- | --- |
| [OpenDOAR](https://opendoar.ac.uk/help/about) | Curated global OA repository directory; seed institutional and subject research tracks | Every record is readable or each repository exposes a permitted search API |
| [DOAB metadata](https://doabooks.org/en/librarians/doab-metadata) | Official metadata exports, OAI-PMH and publisher attribution make book-catalog discovery scalable | A publisher's entire catalog is OA or every linked host is currently available |
| [re3data API](https://www.re3data.org/api/doc/) | Machine-readable repository descriptions; subject/country discovery for data sources | The described datasets are all public, or the registry itself searches their contents |
| [OER Commons collections](https://help.oercommons.org/support/solutions/articles/42000046866-browse-collections) | Curated producer/subject/level/language leads for school, university and adult learning | An unrestricted third-party API or metadata reuse license |
| [Europeana APIs](https://www.europeana.eu/en/apis) | Search and record interfaces with institutional attribution for cultural material | Universal image/full-object rights; a free API key still needs registration and policy review |
| [Library of Congress JSON/YAML API](https://www.loc.gov/apis/json-and-yaml/) | Structured digital collection/search/item records across books, maps, images and media | Coverage of its whole library catalog or unrestricted reuse of every item |
| [SciELO country collections](https://www.scielo.org/en/) and [LA Referencia](https://www.lareferencia.info/en/home) | Regional discovery across Latin America and other participating research communities | A supported external query route for our application without further investigation |
| [INFLIBNET initiatives](https://www.inflibnet.ac.in/activities/) | Indian thesis, institutional and educational leads; distinguish open initiatives from institutional subscriptions | That consortial/subscription resources are free to every reader |
| [UGC](https://www.ugc.gov.in/) and [AISHE institution directory](https://dashboard.aishe.gov.in/hedirectory/) | Build a systematic India institution/state list, then inspect official repositories | That each institution has a digitized, open or queryable catalog |
| [DIKSHA discovery documentation](https://diksha.gov.in/help/getting-started/explore-diksha/) | Evidence of anonymous exploration and language/location-aware search; find participating organizations | Permission or a documented stable external API merely because the website has search |

Also investigate DOAJ, CORE/OpenAIRE/BASE, national libraries, professional
associations and ministry directories as leads. Choose an aggregator only after
checking current external-use terms, quotas, origin attribution and completeness.
Existing direct arXiv/DOAJ deferral remains in force until its stated constraint
has a supported solution; this plan does not quietly re-enable those connectors.

Documentation review limitations on 2026-11-05: the older DOAB metadata URL
returned 404; the linked `doab-metadata` page worked. AISHE and data.gov.in opens
timed out; DOAJ/CORE documentation opens returned 403 in this research tool.
Those remain leads, not verified integrations or evidence that the services are
down. No source-search API qualification probes were run for this plan.

## 4. International, USA, India and regional-language research tracks

For each category's first **20 candidate slots**, aim for eight India-focused,
eight cross-country/global and four local sources from other regions. This is a
research allocation, not an admission quota. Rotate the last track across Africa,
Latin America/Caribbean, Europe, East/Southeast Asia, the Middle East, Oceania and
the rest of South Asia. Continue looking when a track has few qualified results.

For government/public records and local maps, use a **USA/India split** instead:
first investigate federal/union and state authorities, then county/district and
city/municipal catalogs. Start with six US and six India origins spanning P01–P09
inside the common research budget. Track unrepresented subtracks explicitly.
Use official jurisdiction directories to expand coverage rather than assuming
one national portal contains all local records. Industry research uses global
professional networks plus separate US/India regulators, training bodies and
extension services. Keep each local portal's supported queries and limits.

India work proceeds by institution network, state/union territory and language,
not just `.in` search results. Start with English, Hindi and Tamil; then expand
through Bengali, Telugu, Marathi, Kannada, Malayalam, Gujarati, Punjabi, Urdu,
Odia, Assamese and the remaining scheduled-language communities. Maintain a
state/language matrix including unresearched cells. Search native script and
common transliterations; confirm content language rather than interface language.

Record separately:

- **Source location:** where the operator is based.
- **Subject/local relevance:** India-wide, a particular state, or another locality.
- **Content language and script:** original, translation and interface language.
- **Reader eligibility:** anonymous, free account, country restriction, or an
  institutional/library entitlement. An Indian source may be globally available;
  an international source may be unavailable in India.

Label availability `tested in <country> on <date>`, `provider-stated`, or
`unknown`. A cloud request from one region does not establish worldwide access.
Later region checks use permitted test environments and willing reviewers; do
not evade geographic restrictions. No precise reader location is needed for this
research; country/region can be an explicit preference in a future product design.

## 5. Repeatable route to 100 qualified sources in every category

1. **Define the category's boundary and benchmark queries.** Pick five topics,
   five exact known items, relevant languages and two exclusions. Avoid counting
   a generic repository in a category without real examples from that category.
2. **Seed ten candidates per category.** Use the row-specific directories above;
   target four India, four global and two other-region leads. This first pass
   produces up to 200 category memberships, deduplicated into a smaller origin
   register. Add five candidate memberships per industry tag, up to another 100
   memberships, and deduplicate all 300 across the shared origin register. A
   source can satisfy both a content and industry research slot with evidence.
   For civic/maps categories, use the US/India allocation above. Plan up to two
   deep reviews per content category and one per industry, within a maximum of
   **60 unique origins**; the twelve public-records/maps reviews are inside that cap.
   Allocate overlaps first and record any coverage gaps rather than exceed the
   cap to force every suggested slot into the same cycle.
3. **Build an initial pool of 150–250 candidates per category in batches of 25.**
   Expand directory countries/subjects, follow publisher/provider/member links,
   and inspect official institutional sites. This pool size is a planning
   hypothesis, not evidence that those candidates exist or will pass.
4. **Triage each candidate.** In roughly 10–15 minutes identify the operator,
   content scope, rights/access policy, machine route and likely costs. Keep the
   discovery URL and a reason for rejection/deferment. A web search box alone
   passes neither technical nor permission review.
5. **Deep-review the best candidates.** Timebox a first technical/access probe to
   roughly 30–90 minutes; flag unusually complex ones for a separate spike. Use
   the [review template](SOURCE_REVIEW_TEMPLATE.md). Do not write a production
   connector for every candidate during discovery.
6. **Measure conversion after every 25 reviewed candidates.** If the observed
   qualification rate is 40%, 100 qualified origins would require about 250
   reviewed candidates. Use `remaining target / observed pass rate` for the next
   effort estimate; a zero/small sample triggers new discovery routes, not an
   invented success rate. Deduplicate across categories before estimating effort.
7. **Replenish through targeted gaps.** Search underrepresented languages,
   countries, subjects and source types. Example query patterns:

   ```text
   "{category}" "{country}" ("open access" OR "public domain")
   site:{official-institution-domain} (repository OR publications OR digital library)
   "{source name}" (API OR metadata OR OAI-PMH OR OPDS OR export)
   "{native-script category term}" "{state or language}" "{open/free term}"
   "{network name}" (members OR partners OR publishers OR data providers)
   ```

   Inspect search results as leads; never turn search-engine snippets into book
   records or access evidence. Confirm official ownership and lawful distribution.
8. **Close each ladder stage at 10, 25, 50 and 100 qualified origins.** Publish
   counts, gaps, coverage scopes, best next integrations and expiring evidence.
   If repeated discovery routes are exhausted, document the shortfall instead
   of renaming collections to manufacture additional sources.

For hard-to-integrate but valuable origins, prepare a request for a supported
feed or metadata permission. Outreach is a separate action requiring the owner's
instruction; the rest of the research continues without it.

## 6. Queryability and free-access admission gates

A source qualifies only with evidence for **all** of the following:

| Gate | Required evidence |
| --- | --- |
| Reproducible retrieval | An allowed machine route can retrieve matching item records for the declared category-appropriate query: topic/title, address/parcel/document, geographic extent, or dataset variable/time/geography. It can retrieve or reproduce a specific record using a stable source identifier. Record supported fields and tested scope. |
| Actual item access | At least one usable full item, not only a title/abstract/cover/snippet. Test a representative set, including the destination and any free registration path; per-result access still needs checking. |
| Honest access class | Anonymous and free-account access are eligible and distinct. Free signup does not qualify subscription, institution-only, library-loan, preview or paid-trial content. Geographically limited free sources can qualify for their evidenced audience. |
| Permission and cost | Current terms permit the chosen API/export/index/display use. Metadata reuse and content reading/reuse rights are recorded separately. Identify quotas, key requirements, free limits and paid-overage behavior. |
| Identity and attribution | Stable source/item IDs, title, creator where supplied, content kind, language where supplied, source/host and canonical landing URL. Unknown fields stay unknown. Preserve editions, translations and versions. |
| Maintainable coverage | Defined subset/full-catalog scope, paging or bounded import behavior, refresh/deletion plan and an accountable maintainer. A handpicked record does not establish whole-catalog search. |

Accepted retrieval routes, in preferred order:

1. **Documented live search API**, with record resolution and bounded calls.
2. **Verified aggregator coverage**, with attributable item-level origin/host
   evidence. Confirm known items and missing/lagging coverage per origin; do not
   claim a source's complete catalog simply because it appears in an index.
3. **Official reusable metadata export/feed**, compiled into a bounded local
   search artifact. This is the existing book-catalog approach; it need not add a
   hosted service. Large imports require measured build/memory/refresh costs.
4. **Explicitly permitted structured harvesting**, only where refresh and item
   discovery are sustainable. Document the supported route and its limitations;
   a fragile browser scraper is not the default way to reach 100 sources.

If none passes, keep the source as `deferred: no supported retrieval route`.
A link to search the provider's website may help users, but **does not count as
in-app queryability** or prove that a particular item exists there.

Protocol distinctions matter: [OAI-PMH](https://www.openarchives.org/OAI/openarchivesprotocol.html)
harvests metadata, so it needs an import/search step; [OPDS](https://specs.opds.io/opds-1.2)
describes catalogs and acquisition, with search availability checked per feed.
[MediaWiki search](https://www.mediawiki.org/wiki/API:Search) and
[CKAN APIs](https://docs.ckan.org/en/latest/api/) offer reusable connector patterns,
but deployed versions, permissions and access vary. RSS can expose only recent
items, sitemaps only URLs, and IIIF only known objects. None automatically proves
full historical keyword search. DOI resolvers help exact lookups, not general
topic search; readable PDFs without discoverable metadata need another route.

## 7. Qualification tests and evidence

Research proof and production acceptance are different stages. For a deep review,
use a small, reproducible probe pack with source-derived expected records:

- Five known items: exact title/ID, author where supported, at least one
  non-English/native-script item when the source claims that coverage. Check
  round-trip search → native record → actual full-item destination.
- Five topic queries chosen before inspecting results. Review top-five results
  for subject match, useful item type and accessible destination. Record
  title/subject/full-text matching limitations. Do not repeat the earlier
  Mathematics problem by accepting unrelated metadata as relevance evidence.
- For public-record/geospatial sources, substitute five appropriate record/spatial
  queries for unsupported keyword searches: jurisdiction + document number,
  address/parcel, map-sheet name, bounding box, or variable + geography + period.
  Test CRS/axis ordering, geographic boundaries, pagination/truncation and survey
  versus publication/effective dates. A documented map viewer alone does not
  establish feature queries, and an API error must never imply no ownership record.
- For industry material, test role/task relevance, applicable country/standard,
  revision date and evidence for each assigned industry tag. A shared regulator
  catalog is one origin even when it spans all twenty industries.
- Negative/gibberish queries, changed filters, punctuation and Unicode. Confirm
  empty results versus source failure. Check a second page or declare the fixed
  import scope; retain duplicates/versions correctly.
- A representative restricted/embargoed/preview item if the catalog contains
  them. Verify exclusion or clear labeling rather than inheriting a blanket
  "free source" assumption. Free-login tests distinguish an advertised offer
  from actually verified post-login access; unavailable proof is a recorded gap.
- Latency, payload size, documented quotas and bounded errors. Test throttling
  and outages with fixtures; do not overload a real service to generate a 429.
- Two independent sessions for shortlisted sources, on different days where
  practical, to detect transient success. Capture timestamp, region, request
  shape, native IDs, policy URLs and a small permitted evidence sample; no keys,
  private cookies or copied full books in evidence.

Suggested pilot acceptance targets, to calibrate before production: all five
known eligible items are found in the declared searchable scope; at least four
of the first five results are relevant on four of five topic queries; no known
restricted item is labeled freely readable. A specialist source can declare
exact-title-only or structured-record/spatial capability, but must not be routed
unsupported queries or counted as general topic-search coverage. A native public
catalog that searches by parcel or document ID can qualify for that declared use.
Identifier redirect services such as DOI resolvers remain supporting services;
they do not themselves establish a searchable content catalog. Small tests establish the declared sample,
not measured recall of the entire catalog. Track these capabilities separately.

Before enabling an origin, add adapter contract/error/access tests, actual source
probes and browser search → detail → outbound action → save → reload checks.
Test phone/desktop, accessibility, all three reading lights, language/region
labels and source selection. Review new UI artifacts first if a new content kind
needs different cards/details; do not force datasets or videos through book UI.

## 8. Scale the integrations without scaling infrastructure prematurely

Keep the research register as reviewed JSON/CSV and Markdown in Git. It is a
source catalog and evidence index, not a new hosted database. Version snapshots
and run bounded local/repository checks within the existing free allowances.

Build shared connector families only when multiple qualified candidates justify
them: native/aggregator JSON search, OAI-PMH imports, CSV/JSON/MARC exports, OPDS,
MediaWiki, repository APIs and later dataset/media/geospatial interfaces. Evaluate
documented OGC/ArcGIS services with explicit catalog, map-view and feature-query
capabilities; do not assume every deployment supports the same operations. Reuse transport and
tests while retaining per-source mappings, policies and access rules. DSpace,
EPrints or OJS software alone is not proof that a site's interface is enabled.

**100 sources available does not mean 100 network calls per search.** Keep one
selected live connector per request initially, with source switching. Prefer an
eligible broad index when it supplies useful attributable coverage; route more
specialist searches by category, language and declared capabilities. A source
registry suggests where to search; it cannot assert that an unqueried source
contains the requested title. Only retrieved item evidence supports that claim.

Future routing should be deterministic first. Show which connector/origins were
searched, bounded catalog coverage, exclusions and failures. An explicit choice
must not silently search something else. Search more sources on reader request;
any later small parallel-search design needs its own latency, cost and pagination
proof. No paid LLM routing, vector database or blanket fan-out is prerequisite.

This trades exhaustive live coverage for bounded cost and responsiveness. A
qualified source can be available through explicit selection without being queried
on every search; report that distinction. For imported metadata, one local query
can search multiple origins within the declared snapshot. As imports grow,
evaluate bounded category/language artifacts against actual hosting limits before
adding more state or promising an all-source search.

Measure search latency, upstream calls, memory/build size, refresh effort and
free-limit usage during the pilot. Revisit infrastructure only for an observed
limit or a source's mandatory coordination requirement, with a specific costed
design. Free upstream APIs still consume existing hosting and maintenance time.

Refresh operational health and access evidence separately from long-term source
policy reviews. Use each source's documented limits/change cadence; monthly
directory gap reviews and periodic policy checks are planning defaults, not a
reason to hammer every endpoint daily. Suspend failing source actions honestly.
Current reading-evidence expiry rules remain in force unless explicitly revised
with evidence; source expansion does not renew stale StoryWeaver observations.

## 9. Delivery milestones and stories

Expand engineering tasks only when each story is reached. This plan creates a
bounded first research cycle; it does not create thousands of speculative tasks.

| Milestone / story | Deliverable | Exit condition |
| --- | --- | --- |
| M0: Taxonomy and research contract | Accepted content categories, twenty industry tags, six detailed playbooks, count rules and review template | Current revision incorporates owner direction on industries and US/India civic/maps coverage; implementation remains future work |
| M1: Candidate register and first survey | Ten leads/content category plus five/industry; shared deduplicated register and country/language/occupation gaps | Up to 300 category/industry memberships; actual unique count and P01–P09 USA/India coverage reported |
| M2: Feasibility pilot | Aim for two deep reviews/content category and one/industry, with overlaps and public-records allocation inside a 60-unique-origin cap | Every reviewed source has a qualified/deferred/rejected reason; geographic/industry gaps, conversion rate and first ten integration recommendations |
| M3: First expansion release | Implement the highest-value qualified origins in batches of 3–5; expand current book coverage as well as adding sources | Each batch has supported retrieval, fresh access evidence, measured marginal coverage and end-to-end tests |
| M4: 100 unique origins | Continue targeted discovery; reach 100 qualified unique origins, then enable them in independently verified batches | Report qualified and enabled counts separately; never label a research-only milestone as live coverage |
| M5: Per-category and industry ladder | Continue 10 → 25 → 50 → 100 per content category and selected industry cohorts, replenishing from measured conversion rates | Separate content/industry memberships, shortages, query modes, USA/India civic/maps coverage and globally unique totals published |
| M6: Maintenance and consolidation | Broken-source triage, policy review, refresh validation, overlap review | Remove stale/unsupported counts; prioritize reliable useful coverage over a higher headline number |

M1–M2 are an initial multi-week research effort for one implementer, not an
instant 2,000-source scrape. Re-estimate after the first 25 triages and 10 deep
reviews using actual time and pass rate. The full per-category target is an
ongoing program; no delivery date is credible before that sample. Connector
implementation and credential/permission lead times are estimated separately.

Prioritize passed candidates by: useful new items/languages/local coverage (30%),
retrieval/access quality (30%), maintenance/reliability (20%), and implementation
effort/free capacity (20%). Treat these as planning weights, calibrated after the
pilot; failing a mandatory gate cannot be rescued by a high score. Compare against
the current sources to avoid spending a sprint on mostly duplicate holdings.

## 10. Progress report and immediate next batch

Use one row per content category and a separate industry matrix: candidates / deeply reviewed / qualified / enabled,
unique origins, connector routes, anonymous/free-account split, tested languages,
USA/India/local coverage, exact/topic/record/spatial capabilities, rejection
reasons, evidence age and next batch. Also report global deduplicated totals,
incremental readable items where measured, known-item recovery, topic relevance,
reading-link success, latency and recurring maintenance effort. Raw source count
alone is not the success metric. P01–P09 get dedicated coverage columns per
country/jurisdiction. Industry rows also show occupation/task coverage; do not
count a source against an industry without relevant retrieved items.

The content categories are accepted. The next research cycle uses M1 across all
20 categories and 20 industry tags with the six playbooks. In M2,
prioritize book/education/India opportunities plus US/India public records/maps
and practical industry documentation: DOAB/OAPEN publisher coverage,
national/regional literature catalogs, school textbook bodies, children's
publishers, thesis repositories, audiobook catalogs, official civic/property
catalogs, geological data and agriculture/construction/manufacturing/logistics
guidance. Recheck existing source
freshness first; new names do not solve an expired catalog or a three-item pilot.

Deliver a research register, 60 or fewer distinct-origin completed reviews, an honest capability
and geography matrix, and a ranked next-ten recommendation. Only then expand
implementation stories for the first 3–5 integrations. This document is the plan
for that work, not authorization to treat the candidate examples as enabled.
