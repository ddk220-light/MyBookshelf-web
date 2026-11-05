# Public records, law, government data and maps

Planning review: 2026-11-05. This playbook expands C08, C18 and C19 in the
[expansion plan](../EXPANSION_PLAN.md). It gives civic records, property and
geological maps explicit research tracks. Local discovery starts in **the USA
and India**. These are researched entry points and proposed qualification work;
no new source integrations or individual property records were collected here.

## Research matrix

Keep the **record type** column in the source register and progress report.
The P01–P09 tracks below subdivide existing categories; they do not create nine
additional 100-source quotas. A government's departments, datasets and map layers
are not automatically independent origins: apply the master counting rules.

| Track / record type | USA: where to find origins | India: where to find origins | Required query and result identity |
| --- | --- | --- | --- |
| **P01 Government, research and development reports — C08** | [GovInfo Developer Hub](https://www.govinfo.gov/developers), agency publication catalogs, state research bureaus, municipal annual reports; follow publishing agencies from catalog records | Ministry/department publication sections reached through the [National Portal](https://www.india.gov.in/); RBI, NITI Aayog, research councils and state economic-survey series as leads | Topic/title/year/issuing body → report ID, edition, publication date and full report. A press release announcing a report is not the report. |
| **P02 Laws, rules and gazettes — C18** | GovInfo, official federal regulations, state legislatures and local ordinance publishers linked from government websites | [India Code](https://www.indiacode.nic.in/indiacode/home.jsp), Union/state gazettes, legislature sites and official rules collections | Act/rule number, title, section, jurisdiction and effective date → authoritative document/version. Distinguish enacted law, proposed bill, amendment and consolidated text. |
| **P03 Civic decisions, budgets and procurement — C18** | City/county clerks, council/board agenda archives, agency budget and open-spending portals; discover owners through [USAGov local-government links](https://www.usa.gov/local-governments) | Municipal corporations, panchayats, district administrations, state finance departments, legislative committees and official procurement portals | Meeting/body/date/topic, fiscal year or notice/award ID → exact minute, resolution, budget table or procurement document. Distinguish tender announcement, award and expenditure. |
| **P04 Property, ownership records and land rights — C18** | County recorder/register of deeds, assessor/property appraiser, tax authority and cadastral GIS; [NYC ACRIS](https://www.nyc.gov/site/finance/property/acris.page) is an illustrative city record system | State revenue/registration portals discovered through [DILRMP](https://dilrmp.gov.in/) and [NGDRS state links](https://ngdrs.gov.in/NGDRS_Website/state_ut_links.php?lang=en); [Tamil Nadu land e-services](https://eservices.tn.gov.in/eservicesnew/index.html) is a first state case | Address, parcel/APN/BBL, survey/subdivision, village/tehsil, registration/document number → actual public record and issuing office. Separate owner field, assessment, tax bill, deed, record of rights and mutation. None alone becomes our independent certification of current legal title. |
| **P05 Building permits, zoning and planning — C18/C19** | Municipal building/planning departments, permit open-data catalogs, zoning GIS, adopted comprehensive plans and public planning decisions | Urban local bodies, development authorities, town/country planning departments and state municipal portals | Permit/application ID, address/parcel, zoning designation or area → document/feature plus application status, decision date and effective plan version. A proposal is distinct from an adopted plan or issued permit. |
| **P06 Geological, soil and hazard maps — C19** | USGS National Geologic Map Database as a discovery lead; state geological surveys and their publications; USGS hazard programs and relevant public soil/flood agencies | GSI Bhukosh and [National Geoscience Data Repository](https://geodataindia.gov.in/); state geology/mining departments; disaster-management and public soil/water agencies | Place or bounding box + theme + scale/time → map sheet/layer ID, survey/publication date, legend, spatial extent and usable map/data. Keep geology, mineral exploration, soil classification and probabilistic hazard distinct. |
| **P07 Topographic, land-cover and historical maps — C19** | [USGS National Map](https://www.usgs.gov/faqs/there-api-accessing-national-map-data), state/local GIS catalogs and public library map collections | Survey of India and [Bhuvan](https://bhuvan.nrsc.gov.in/) discovery, state remote-sensing/GIS agencies and public historical-map collections | Place, sheet number, extent, date/edition or layer → actual map product/viewer/download. Distinguish present-day topography from historical sheets, satellite imagery and cadastral boundaries. |
| **P08 Census, statistics and time series — C19** | [Census developer geography guidance](https://www.census.gov/data/developers/geography.html), official statistical agencies and state/local statistical bureaus | OGD India, MoSPI, Census of India, RBI statistics and state statistical abstracts as source families | Topic/indicator + geography + period → dataset/table/series ID, unit, denominator, geography code and reference period. Housing-tenure statistics are aggregate information, not a register of individual owners. |
| **P09 Environmental and public infrastructure data — C19** | Federal/state environmental, water and transport agencies; public utilities' published datasets; local open-data catalogs | Pollution-control boards, water/public-works departments, transport authorities and state/city open-data catalogs | Facility/station/route/area + variable/time → public observation, inventory, permit or infrastructure dataset. Distinguish measured observations, modeled values and proposed infrastructure. |

## Find sources systematically, jurisdiction by jurisdiction

Build two jurisdiction trees before gathering hundreds of URLs. For the USA use
federal → state/territory → county/equivalent → municipality, recording tribal
government catalogs where appropriate. Start from [USAGov state links](https://www.usa.gov/state-governments)
and its local directory, then verify the actual agency responsible for the record.
Use official geography identifiers where supplied; the [Census API geography
documentation](https://www.census.gov/data/developers/geography.html) illustrates
why a county code without its state is ambiguous.

For India use Union → state/UT → district → subdistrict/tehsil → municipality or
village/panchayat. The [India district web directory](https://www.india.gov.in/directory/web-directory/districts)
and [Local Government Directory dataset](https://data.gov.in/catalog/local-government-directory-lgd)
are starting points. Follow official revenue, registration, planning, statistical
and geological offices from there. Record renamed/split districts and the vintage
of boundary codes; a village name alone is not a stable record identity.

For each of C08/C18/C19, expand an initial pool toward roughly 50–75 US and
50–75 India candidate origins, then replenish from observed pass rates. Sample
across geography, language, urban/rural context and government level. To approach
100 qualified sources, broaden jurisdictions and responsible agencies rather
than counting 100 datasets from one city as 100 sources. National aggregators
can cover several attributed origins, but membership and coverage require proof.

Research queries vary by record type:

```text
P01: site:{agency-domain} (publications OR reports) "{topic}" "{year}"
P02: site:{legislature-or-gazette-domain} "{act/rule title}" "{jurisdiction}"
P03: site:{city-domain} (minutes OR resolutions OR budget OR awards) "{year}"
P04: "{county/state}" (recorder OR assessor OR land records) (API OR open data)
P05: site:{planning-domain} (permits OR zoning OR master plan) (catalog OR GIS)
P06: "{state}" "geological survey" (map catalog OR GIS OR publications)
P07: site:{mapping-agency-domain} "{place/sheet}" (topographic OR land cover)
P08: site:{statistics-domain} "{indicator}" "{district/county}" (table OR API)
P09: site:{agency-domain} "{water/transport/environment theme}" (data OR services)
```

Use native-script/local terms for India, including भूलेख, खसरा, खतौनी, பட்டா and
சிட்டா where relevant. Keep the official terminology and script in results;
transliteration is a discovery aid, not authority to join two records. Search
engine hits identify candidates; they do not establish access or record contents.

## From a directory entry to something the app can query

Investigate these routes in order, and record the actual supported capabilities:

1. **Official document/dataset catalog API.** [GovInfo documents an API search
   service](https://www.govinfo.gov/features/search-service-overview) for content
   and metadata. The current [Data.gov Catalog API](https://resources.data.gov/catalog-api/)
   searches dataset metadata and identifies publisher organizations; it explicitly
   replaces the previous CKAN API. Use the current interface and key policy,
   not an old tutorial. An indexed dataset still needs a valid resource link.
2. **Approved exports and local metadata search.** Small DCAT/CSV/JSON/XML catalogs
   can become bounded, reviewed search artifacts without a hosted database. Prefer
   metadata and canonical outbound links; do not copy whole national parcel or
   imagery stores to make a prototype searchable.
3. **Native record or feature queries.** A source can qualify for property or
   spatial lookup through real address/parcel/document-ID/area queries even when
   it lacks general keyword search. This must return record metadata and a usable
   destination; an identifier-shaped redirect to an external search page is not
   retrieval. Record this as a separate capability from topic discovery.
4. **Geo services with explicit discovery.** [OGC WFS](https://www.ogc.org/standards/wfs/),
   [OGC API Features](https://www.ogc.org/standards/ogcapi-features/) and documented
   [ArcGIS layer queries](https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/)
   are patterns to inspect for spatial/attribute filtering. Confirm the deployed
   service's capabilities, limits, IDs and terms; the platform brand is not proof.
   [WMS](https://www.ogc.org/standards/wms/)/WMTS primarily deliver rendered maps
   or tiles. A searchable layer catalog can support map discovery, but does not
   establish searchable parcel attributes or downloadable source features.

Track three separate capabilities: **find a dataset/map/document**, **query
records within it**, and **read/view/download the result**. A catalog hit for
property data cannot answer “which record covers this parcel?” unless the second
capability is present. Conversely a spatial result can be useful without hosting
a map renderer: a precise official map/document link is a valid initial action.

Maintain one selected live connector per request and bounded local searches.
Route by explicit country/jurisdiction, record type and supported query mode;
do not fan out to every county or district. The register records unsearched
coverage. A failed jurisdiction query does not establish absence of the record.

## Property and maps: two concrete pilot cases

**USA property:** NYC's official ACRIS page documents searchable property records
and document images for four boroughs, and also states bandwidth/automation
restrictions. Investigate the separately published [ACRIS Master dataset](https://data.cityofnewyork.us/City-Government/ACRIS-Real-Property-Master/bnx9-e6tj)
and its native data dictionary as a metadata route; prove document/parcel joins,
current terms and canonical image links before qualification. Do not extrapolate
its geographic coverage to all New York City or all US counties. This is one
illustrative local case, not a model every recorder must support.

**India property:** Tamil Nadu's official land e-services page lists rural
Patta/Chitta/FMB and urban TSLR resources and describes free FMS copies. It also
warns that automatic translation can change names in Tamil extracts. These facts
make it a strong discovery lead; they do not demonstrate an authorized external
API. Check supported metadata/record interfaces, the actual free access path,
survey/subdivision identifiers and allowed automation before enabling it. Service
or certification fees are distinct from freely viewing an informational record.

For both, preserve issuer, jurisdiction, record type and “as of” date. Assessment
roll ownership, recorded transaction parties, records of rights and registered
title serve different purposes. Return the official source's classification and
published redactions; do not silently infer current ownership from an older deed
or build unrelated personal profiles by joining records across authorities.

For maps, store native map/layer/sheet ID, source URL, geographic extent, coordinate
reference system, axis order, scale/resolution, legend, survey/observation date,
publication/update date and data lineage where provided. A geology map at regional
scale must not appear to be a precise parcel survey. Survey date and download
date are separate; historic maps remain historical even when newly digitized.

## First batch and acceptance tests

Allocate **six US and six India origins within the overall 60-origin deep-review
cap**, deduplicating any shared candidates. This is not an additional 12 reviews.
For each country select one reports/law route, one civic-budget route, one
property route, one permits/planning route, one geological/topographic route and
one statistics/environment route. Within a broad national catalog, inspect the
origin-specific attribution; include state/local cases rather than selecting
only national aggregators. NYC and Tamil Nadu are initial local case studies.

Before the next batch, complete the [source review template](../SOURCE_REVIEW_TEMPLATE.md)
and these track-specific checks using provider examples or public institutional
locations where possible:

- **Reports/law/civics:** retrieve a known document by title and number, separate
  amendments and editions, recover a dated meeting/decision and prove fiscal-year
  filtering. Confirm the canonical complete document rather than its announcement.
- **Property/planning:** test native parcel/address/document lookup in the correct
  jurisdiction; ambiguous address and nonexistent parcel; leading zeros; parcel
  splits/renumbering; mismatched assessment versus deed dates; permit status versus
  approved plan. Display unavailable/unknown when the requested join is unsupported.
- **Geology/maps:** retrieve a known sheet by ID and bounding box; test an extent
  crossing administrative boundaries; verify longitude/latitude order and CRS;
  distinguish map layer, legend and feature response. Check scale/date constraints,
  no-coverage responses and source-service limits without stress-testing the host.
- **Statistics/environment:** test geography code plus period, units, denominator,
  missing/suppressed values and boundary-vintage changes. Never convert a missing
  observation into zero or present an aggregate estimate as a household fact.
- **All tracks:** prove usable free access, paging/export bounds, permission,
  current source attribution and at least two representative sessions. Fixture-test
  failures and quotas. Free registration is acceptable; CAPTCHA, paid document
  access or restricted APIs may require deferral, never circumvention.

Report progress by country, government level, P-track and capability. For each
of C08/C18/C19 pursue the 10 → 25 → 50 → 100 qualified-origin ladder using measured
conversion and geographic gaps. Separately report origins enabled in the product;
one source's 5,000 layers does not replace the 100-origin goal.

## Evidence status and next verification

This was documentation research, not an API qualification run. Current official
Data.gov, GovInfo, USGS TNM, Census, USAGov, NYC and Tamil Nadu pages were readable;
their documentation supports the proposed discovery routes, not an availability
guarantee. Data.gov's current migration notice is especially important for future
connector selection. Keys, terms, quota settings and actual result samples still
need checking before implementation.

Direct opens of data.gov.in timed out, DILRMP's older state-link page and NGDRS
state links returned 502 in the research tool, NGMDB returned 403, and the older
Bhuvan WMS wiki URL returned 404 despite remaining in search results. Bhuvan's
homepage exposed only a loading shell; NGDR terms could not be opened. Official
search results identified GSI/NGDR and land-directory leads, but no machine-query
or free post-login behavior is certified. Record these gaps and recheck the
operator's current documentation; do not interpret the tool failures as national
service outages or a reason to invent an endpoint.
