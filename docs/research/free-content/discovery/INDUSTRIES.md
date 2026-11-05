# Industry and job knowledge: twenty discovery tracks

Planning research, 2026-11-05. Companion to the [expansion plan](../EXPANSION_PLAN.md)
and [source review template](../SOURCE_REVIEW_TEMPLATE.md). The links below are
discovery entry points, not a list of qualified or enabled integrations.

## Group and tagging model

Expose **Industry and job knowledge** as a recognizable discovery group. Implement
its twenty sectors as cross-cutting tags, alongside occupation, task, jurisdiction
and the existing content categories. A pump-maintenance handbook can be tagged
water services, agriculture and facilities while retaining one item identity.
It remains a technical manual or learning resource; industry is not its format.

Use `industryIds`, source-supplied occupation codes/titles, `taskTerms`, content
kind, language, jurisdiction, publication/version date and equipment/process
context. Keep locally supplied occupation labels; do not automatically equate
different countries' qualifications. The [O*NET database](https://www.onetcenter.org/database.html)
and its [documented API](https://services.onetcenter.org/reference/start/overview)
can supply US role/task vocabulary. India's [National Classification of
Occupations](https://www.dge.gov.in/national_classification_of_occupations) supplies
another classification. Neither is a universal collection of practical manuals.

An eventual goal of 100 qualified origins **per industry tag** is a separate
coverage measure. It does not add 2,000 unique providers to the twenty content
categories' totals. Count each origin once globally, then report evidenced
industry/category memberships and searchable scope. Repeating one qualification
registry across twenty sectors is still one registry connector.

## Shared starting points

- **International:** [ILO sectors](https://www.ilo.org/topics-and-sectors/industries-and-sectors)
  links sector programs and guidance. Use its sector/country networks to find
  additional publishers. [FAO publications](https://www.fao.org/publications/en)
  links its knowledge repository; [WHO publications](https://www.who.int/publications)
  supplies health-related guidance; [IMO's Maritime Knowledge Centre](https://www.imo.org/en/knowledgecentre/pages/default.aspx)
  is a maritime discovery lead. Admission is per free item, not organization.
- **USA:** follow regulator publication catalogs, the [USDA land-grant institution
  directory](https://www.nifa.usda.gov/land-grant-colleges-and-universities-partner-website-directory)
  and [NIST MEP centers](https://www.nist.gov/mep/centers) into independently
  maintained extension/training catalogs. A center offering paid consulting can
  still publish free material; its whole service catalog is not free content.
- **India:** [NQR](https://www.nqr.gov.in/) exposes sectors, awarding bodies and
  job-role qualifications, and announces migration to [Kaushalverse](https://kaushalverse.ncvet.gov.in/homepage/repository).
  Check both during discovery and preserve original qualification IDs/version.
  [Bharat Skills](https://bharatskills.gov.in/) offers trade learning resources;
  [NSDC occupational standards and model curricula](https://nsdcindia.org/national-occupational-standards-and-model-curriculum)
  leads to sector councils and qualification packs. Their website search does
  not establish a reusable API or permission to reproduce metadata.

In the matrix, **catalog probe** means investigate a documented API, permitted
metadata export or bounded reusable index. It does not mean scrape whichever
internal endpoint powers a website. Searches are discovery recipes to run against
official sites, then repeat for other countries, languages and institutions.

## Industry-specific discovery matrix

| Industry and useful work tasks | International / US entry points | India entry points | Search recipe and retrieval proof |
| --- | --- | --- | --- |
| **I01 Agriculture and horticulture** — crop planning, soil management, irrigation, extension work | FAO; USDA land-grant directory → each university extension publication catalog | [ICAR agricultural universities](https://www.icar.org.in/en/list-agricultural-universities) → state universities/KVKs; NQR Agriculture | `site:{extension-domain} "drip irrigation" (manual OR guide)`. Catalog probe by crop, region and language; retrieve the exact edition and actual guide. Expand through independent universities, not every extension office as a new origin. |
| **I02 Livestock, dairy, fisheries and aquaculture** — feed, farm biosecurity, pond management, dairy operations | FAO fisheries/livestock publications; land-grant animal-science and aquaculture extension catalogs | ICAR institute/university networks; NQR Agriculture roles for dairy/fisheries | `site:{institute-domain} "pond management" handbook`. Probe species, climate/region and production stage; distinguish practical manuals from research abstracts and unavailable training courses. |
| **I03 Forestry and timber** — silviculture, harvesting, timber grading, restoration | FAO forestry; [US Forest Service research](https://research.fs.usda.gov/); university forestry extension | NQR Wood & Carpentry; state forest departments and forestry institutes located through official agency directories | `site:{forest-agency-domain} nursery manual`. Probe species, geography, document year and measured units. Follow institute catalogs; a scanned PDF without discoverable metadata needs an import route. |
| **I04 Construction and civil infrastructure** — site supervision, concrete, scaffolding, roads | [OSHA publications](https://www.osha.gov/publications); [NIST publications](https://www.nist.gov/publications); ILO construction guidance | NQR Construction; [CPWD](https://cpwd.gov.in/) publications and state public-works departments | `site:{public-works-domain} "concrete" (handbook OR specification)`. Resolve document number, amendments and issuing jurisdiction. A reference to a paid building standard does not make that standard freely accessible. |
| **I05 Building operations and facilities** — HVAC, electrical maintenance, plumbing, energy management | NIST buildings publications; OSHA; public energy-agency and facilities-training catalogs | Bharat Skills Electrician/Wireman/Refrigeration trades; NQR Plumbing and Facility Management | `site:{provider-domain} "air conditioning" "maintenance manual"`. Probe equipment model, voltage/system and version. Operation manuals and manufacturer catalogs need independent availability/reuse checks. |
| **I06 Manufacturing, machining and fabrication** — CNC, welding, metrology, quality control | NIST MEP center directory → regional technical resources; NIST manufacturing publications; ILO | [MSME technology centers](https://www.dcmsme.gov.in/clcs_tus_scheme/tool_room_tech_institutions/scheme_guidelines.aspx); Bharat Skills Fitter/Welder; NQR Capital Goods & Manufacturing | `site:{technology-center-domain} (CNC OR metrology) training manual`. Probe process, machine class, units and edition; separate skills curricula from the instructional handbook. |
| **I07 Automotive and vehicle maintenance** — diagnostics, servicing, EV systems | ILO transport-equipment program; US public technical-college catalogs and [NHTSA research](https://www.nhtsa.gov/research-data) as a lead | Bharat Skills Mechanic Motor Vehicle; NQR Automotive awarding bodies | `site:{official-training-domain} "electric vehicle" service training`. Probe vehicle/platform/version. Manufacturer service portals may charge or restrict access; a research report is not a model-specific repair procedure. |
| **I08 Chemicals and pharmaceuticals** — process operations, quality assurance, manufacturing guidance | [FDA guidance catalog](https://www.fda.gov/regulatory-information/search-fda-guidance-documents); WHO; ILO chemicals/pharmaceuticals | NQR Chemicals & Petrochemicals/Life Sciences; [CDSCO](https://cdsco.gov.in/) guidance as a lead | `site:{regulator-domain} "good manufacturing" guidance`. Probe draft/final/superseded status, product class and jurisdiction. Retain issuing authority and revision rather than collapsing similarly titled guidelines. |
| **I09 Textiles, apparel and leather** — sewing, pattern making, dyeing, finishing | ILO textiles/apparel/leather sector; public vocational and textile-university repositories; OSHA workplace material | Bharat Skills garment trades; NQR Apparel, Textile & Handloom and Leather awarding bodies | `site:{training-provider-domain} "sewing machine operator" handbook`. Probe role, process, language and complete lessons. Multiple qualification packs from one publisher remain one origin. |
| **I10 Food processing and food safety** — processing, hygiene, cold chains, HACCP | FAO; FDA guidance and [Food Code](https://www.fda.gov/food/retail-food-protection/fda-food-code); university food-science extension | [FSSAI FoSTaC](https://fostac.fssai.gov.in/usermanuals); NQR Food Processing | `site:fostac.fssai.gov.in "training manual" Hindi`. Probe food-business category, language and publication date; distinguish a free manual from paid training/certification and an adopted local rule from a model code. |
| **I11 Energy, electricity and renewables** — solar installation, grid operations, efficiency | NIST energy publications; [OSTI](https://www.osti.gov/) research discovery; ILO energy sector | NQR Power/Hydrocarbon; Bharat Skills electrical/solar trades; [MNRE](https://mnre.gov.in/) publications lead | `site:{energy-agency-domain} "solar photovoltaic" installation manual`. Probe system scale, equipment and standard version. Recheck OSTI's supported metadata interface before selecting a connector. |
| **I12 Mining and mineral resources** — mine operations, ventilation, surveying, mineral processing | ILO mining; [MSHA](https://www.msha.gov/) training/publications lead; geological-agency repositories | [DGMS](https://www.dgms.gov.in/) circulars; NQR Mining; mineral-research institutes | `site:{mine-regulator-domain} ventilation training manual`. Probe commodity, mine type, issue date and authority. Link maps to the separate geospatial track; a geology map and an operating procedure are different item kinds. |
| **I13 Transport, logistics and warehousing** — freight, inventory, packaging, fleet operations | [ROSA P / US National Transportation Library](https://rosap.ntl.bts.gov/); ILO transport/ports/logistics; state transport research libraries | NQR Transportation, Logistics & Warehousing → awarding-body catalogs; government transport and warehouse-training institutions | `site:{transport-repository-domain} "cold chain" warehouse manual`. Probe mode, handling task, jurisdiction and full-text report. Verify repository export/search documentation instead of inferring it from the search form. |
| **I14 Maritime, ports and shipping** — cargo handling, seafaring, port operations | IMO Knowledge Centre; ILO maritime guidance; [US Maritime Administration](https://www.maritime.dot.gov/) publications lead | [DG Shipping training circulars](https://www.dgshipping.gov.in/Content/TrainingCircularsAndGuidlines.aspx); official maritime institute listings; NQR Shipping | `site:{maritime-authority-domain} "cargo handling" circular`. Probe circular number, vessel/port context and amendments. Some international code publications are sold; qualify accessible guidance separately. |
| **I15 Aviation and aerospace** — maintenance training, airport operations, flight handbooks | [FAA handbooks and manuals](https://www.faa.gov/regulations_policies/handbooks_manuals); ILO civil aviation; public aerospace repositories | NQR Aerospace & Aviation; [DGCA](https://www.dgca.gov.in/) and approved training-institution leads | `site:faa.gov "aviation maintenance" handbook`. Probe revision, volume and applicability; a general handbook cannot substitute for a restricted aircraft maintenance manual. Preserve that distinction in results. |
| **I16 Water, sanitation, waste and environmental services** — treatment, operations, recycling, monitoring | [EPA NEPIS](https://nepis.epa.gov/) discovery lead; WHO/FAO; public utility and university extension catalogs | NQR Water Supply/Sewerage/Waste Management; [CPCB](https://cpcb.nic.in/) and state pollution-control/public-utility leads | `site:{utility-domain} "wastewater" operation manual`. Probe treatment/process type, geography and edition. Classify operating manuals separately from monitoring datasets and permit records. |
| **I17 Healthcare and care services** — nursing support, community health, infection control | WHO publications; US public-health agencies and open health-workforce training catalogs | [National Health Mission resource documents](https://www.nhm.gov.in/index1.php?lang=1&level=1&lid=371&sublinkid=344), state NHM catalogs; NQR Healthcare/Caregiving | `site:{health-agency-domain} "community health worker" training manual`. Probe intended professional role, protocol version, language and jurisdiction; preserve supersession and professional-audience context. |
| **I18 IT, telecom and cybersecurity** — system administration, networking, incident response | [NIST CSRC publications](https://csrc.nist.gov/publications); official software-project documentation; ILO telecommunications | [CERT-In guidelines](https://www.cert-in.org.in/s2cMainServlet?pageid=GUIDLNVIEW01); Bharat Skills COPA; NQR IT-ITeS/Telecom | `site:cert-in.org.in guidelines "incident"`; repeat with software name/version. Probe exact advisory/publication ID and withdrawn status; vendor release docs and training curricula need separate mappings. |
| **I19 Hospitality and tourism** — food service, housekeeping, guest operations, guiding | ILO tourism/hotels program; FDA Food Code for food-service tasks; public hospitality colleges and tourism agencies | NQR Tourism & Hospitality awarding bodies; FSSAI training; state tourism training catalogs | `site:{hospitality-institute-domain} housekeeping participant handbook`. Probe job role, language and full lesson availability. Marketing brochures and booking pages do not qualify as job documentation. |
| **I20 Finance, insurance and accounting** — compliance, bookkeeping, financial operations | [FDIC Money Smart](https://www.fdic.gov/consumer-resource-center/money-smart) lead; public financial regulators; ILO financial/professional services | NQR BFSI awarding bodies; [RBI](https://www.rbi.org.in/) Master Directions and public training institutions | `site:rbi.org.in "Master Direction" "Know Your Customer"`. Probe effective/amended dates, jurisdiction and issuer. Distinguish learner material, binding directions and commentary; professional course catalogs often contain paid material. |

The row links to roots such as CPWD, NHTSA, CDSCO, MNRE, MSHA, CPCB, DGCA and
RBI are institution leads requiring deeper catalog inspection. The generic
registry entries identify the correct sector/awarding-body trail, not a claim that
every qualification has a publicly reusable handbook.

## Repeatable search and qualification process

Search the combination **industry × occupation × task × jurisdiction × content
kind**. Begin with a worker question such as “Hindi guide for a warehouse picker
handling cold-chain products.” Expand occupation synonyms using source-supplied
labels, task vocabularies and English/native-script variants. Keep transliteration
as a search aid; it does not establish content language.

For every industry, follow three independent discovery routes:

1. **Authority route:** sector regulator → publications/guidelines → state/local
   counterparts → independently maintained catalogs. Check applicability and
   version. Twenty departments publishing through one catalog are not twenty
   automatically qualified origins.
2. **Training route:** qualification register → awarding body/sector council →
   public handbook/curriculum catalog → institution publishers. Qualification
   descriptions alone establish skills or curriculum, not full training content.
3. **Practice route:** extension/technical-center network → institutional resource
   collections → official manufacturer/project manuals where freely accessible.
   Publisher member lists are candidate generators; membership proves no API.

Try exact strings such as `"{role}" "participant handbook"`,
`site:{official-domain} "{task}" (manual OR guide OR curriculum)` and native-script
equivalents. Then search the selected provider for `API`, `metadata`, `export`,
`repository`, `license` and `reuse`. External search-engine matches help find
providers; they do not become app catalog records by themselves.

Use a documented live/aggregator interface where available, otherwise a permitted
metadata import searched locally. A small static registry and bounded catalog
artifacts fit the existing no-new-datastore approach. Shared transport/parsers can
serve several sources, but permissions and field mapping remain source-specific.
Record metadata reuse separately from the right to read a publicly downloadable
manual; public availability alone does not authorize bulk reproduction.

The initial queue is five leads per industry, ideally two India, two US and one
international. These up-to-100 industry memberships overlap the master plan's
content-category survey. Deduplicate before selecting deep reviews and use the
master plan's aggregate cap. Prioritize agriculture, construction, manufacturing
and logistics in the first technical sample, while retaining all twenty tags in
the register. Subsequently use the common 10 → 25 → 50 → 100 ladder and observed
pass rate to refill each sector's candidate pool. Record sparse sectors honestly.

## Category-specific acceptance and evidence

Test a known handbook, a task query, a role synonym, one native-language query
where supported and an old/superseded edition. Retrieve the actual document and
its issuer/version, not a course-registration page. Sample whether a search for
an operator's task returns useful instructions rather than unrelated research
or executive policy reports. Preserve equipment/process model, qualification
code, units and jurisdiction when supplied. Do not synthesize missing metadata.

For safety-critical and regulated work, results should identify the authority,
audience and effective revision. Government/industry guidance, binding rules,
training texts and manufacturers' procedures remain distinguishable. An indexed
manual does not confer a job qualification, certification or approval.

Before enablement, prove item-level topic/title retrieval and stable resolution,
free full-item access, source permissions and refresh behavior under the shared
review template. Neither an O*NET occupational match nor an NQR qualification
match establishes that another provider has the requested manual. Identifier-only
resolvers support discovery but do not count toward searchable-origin targets.

## Documentation review limits

This review inspected primary web documentation/catalog pages, not production
API requests or a hundred sources per industry. O*NET explicitly documents an
API and downloadable data; reuse that as vocabulary evidence only until the
chosen integration is tested. The NQR migration notice was observed directly.
FDA/FAA/OSHA/NIST, ROSA P, FAO/WHO/IMO and Bharat Skills pages were readable.
India's ICAR, MSME, FSSAI, NHM and CERT-In discovery links also appeared in official
search results; catalog/permissions checks remain necessary.

NSDC's sector-council page and the FDIC page returned 403 in this research tool;
EPA NEPIS exposed no readable text. OSTI/MSHA/MARAD deep links were inaccessible,
and the older Forest Service Treesearch URL redirected to its research homepage.
These are unresolved research observations, not claims of service downtime.
Use official directory/root navigation to find current routes; do not turn a
browser restriction into an invented endpoint or relax the source admission gate.
