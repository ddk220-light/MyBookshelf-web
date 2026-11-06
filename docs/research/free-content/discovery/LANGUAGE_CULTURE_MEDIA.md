# Language, culture and educational media discovery

Research playbook, 2026-11-05. Covers C14, C15, C16, C17 and C20 under the
[expansion plan](../EXPANSION_PLAN.md). Links establish discovery routes and
documented capabilities, not qualified or enabled sources. No endpoint probes,
account creation or paid services were used. Apply the
[source-review template](../SOURCE_REVIEW_TEMPLATE.md) to each proposed origin.

## C14 — Language learning and adult literacy

**Where to start.** The [Open Language Archives Community](https://www.language-archives.org/)
provides a language-resource discovery network; its
[FAQ](https://www.language-archives.org/documents/faq/) describes participating
archives and OAI metadata exchange. Filter for instructional materials: a
linguistic recording or restricted research corpus is not automatically a usable
language lesson. For US adult literacy, the
[LINCS resource collection](https://lincs.ed.gov/resource-collection) identifies
instructional producers and state/local program resources. In India,
[Bharatavani](https://www.bharatavani.in/home/dictionaries) identifies dictionaries,
glossaries, languages and contributing institutions; follow those producers to
their lesson, primer and literacy catalogs. Also investigate state literacy
missions and university language departments through official institution sites.

**Repeatable searches.** Run `"{language}" "adult literacy" "resources"`,
`"{institution}" (primer OR lessons OR metadata OR OAI-PMH)` and native-script
variants such as `"தமிழ்" "கற்றல்" "பாடங்கள்"` and
`"हिन्दी" "साक्षरता" "पुस्तिका"`. Search the official institution domain after
finding an organization; record target language separately from teaching language.

**Toward 100.** Sample ten candidates: four Indian language/education producers,
two US adult-literacy organizations and four from language archives or other
countries. Expand by language family, literacy audience and institutional
producer in batches of 25. Reuse one producer across applicable categories but
count its language tabs only once. A large number of language collections does
not establish 100 independent instructional origins.

**Retrieval and tests.** Investigate attributed aggregator records and permitted
OAI/catalog imports. LINCS/Bharatavani website search alone does not establish a
reusable external API. Test an exact primer, a target-language topic, native
script, transliteration, an adult-versus-child distinction and the complete
lesson/audio destination. Preserve proficiency labels when supplied; do not infer
them from word count. Corpus access restrictions and missing machine interfaces
are likely reasons to defer candidates. Deep-review two distinct producers first.

## C15 — Historical documents, manuscripts and archives

**Where to start.** Use [Archives Portal Europe's institution directory](https://www.archivesportaleurope.net/find-an-institution/)
to branch by country and holding institution. Its current page directs researchers
to institution search while directory work continues. In the US,
[NARA's Catalog API documentation](https://www.archives.gov/research/catalog/help/api)
describes keyword/search-result and individual-record JSON retrieval. Extend
discovery through state archives, university special collections and municipal
archive directories. In India, the National Archives'
[Abhilekh Patal description](https://nationalarchives.nic.in/en/online-portal-abhilekh-patal)
is the national starting point; follow state archives, regional record centers
and university manuscript collections separately.

**Repeatable searches.** Use `"{country/state}" "archives" "digital collections"`,
`site:{archive-domain} (EAD OR OAI-PMH OR API OR "metadata download")`, and
`"{place}" "{date range}" "{document type}"`. Search historic and current place
names. For India add `"{state}" "अभिलेखागार"` and the local-script equivalent;
for the US include county/city archives after state-level discovery.

**Toward 100.** Start with four Indian holding institutions, two US federal/state
origins and four non-US international archives. Replenish from institutional
directories and regional archival networks. Record centers under one maintained
catalog are collections unless independent catalog stewardship is demonstrated.
Neither a directory's institution total nor a count of archival finding aids is
the enabled-source total.

**Retrieval and tests.** Prefer supported archival search or licensed EAD/OAI
exports with origin attribution. NARA documents a machine route; current key,
terms and limits still require review. Abhilekh Patal's external integration route
is unverified here. A finding aid may describe an undigitized box: require an
actual digitized object for usable online access. Test collection → series → item
hierarchy, reference code, date range, historical place aliases and a multipage
object. A IIIF manifest can describe/display a known object; separately prove
catalog discovery. Flag missing OCR rather than promising handwritten full-text
search. Deep-review one supported catalog and one Indian-origin candidate first.

## C16 — Museums, art and cultural heritage

**Where to start.** [Europeana's API overview](https://www.europeana.eu/en/apis)
describes search, record and harvesting routes with contributing institutions.
Use provider attribution to discover museums across countries, then check the
institution's own open-collection policy. In India,
[Museums of India's digitization initiative](https://museumsofindia.gov.in/repository/page/digitization_initiative)
links participating museums, with JATAN as the collection-management context.
This is a useful network of leads; it does not establish a public integration API.
For the US investigate museum open-access programs and official collection
developer pages, including Smithsonian as a lead requiring renewed documentation.

**Repeatable searches.** Run `"{country}" "museum" "open access collections"`,
`site:{museum-domain} (API OR IIIF OR "collection data" OR "metadata download")`
and `"{Indian state}" "museum" "digital collection"`. Follow departmental
collection links to confirm who maintains the catalog before assigning an origin.

**Toward 100.** First ten: four Indian museums, two US institutions and four
international museums identified through aggregators. Expand by institution,
country and collection discipline: visual art, archaeology, textiles, craft,
natural history and technology. Different departments, exhibitions and objects
under one catalog do not become additional sources. Measure whether an added
institution contributes new languages or material rather than duplicate records.

**Retrieval and tests.** Prefer attributed aggregate search or official catalog
APIs/exports. Keep object metadata rights, image rights and physical-object
ownership separate. Verify an object identifier, creator/culture where supplied,
date uncertainty, place, institution and viewable media. Test a known object,
material/technique query, multilingual title and duplicate depiction. A tiny
thumbnail or metadata-only entry does not prove access to usable educational
media; declare the available representation. Require item-level permission and
attribution, including any restriction notices. Deep-review one aggregator-backed
origin and one direct-origin route before proposing a shared museum connector.

## C17 — Newspapers, magazines and public-interest articles

**Where to start.** Separate historic newspaper repositories from current
publishers. The [Library of Congress Chronicling America API page](https://www.loc.gov/apis/additional-apis/chronicling-america-api/)
states that the collection moved exclusively to the loc.gov API beginning in
2025; do not reuse old `chroniclingamerica.loc.gov` integration recipes.
Europeana and national libraries provide additional historical leads. For current
US/local journalism, [INN's Find Your News directory](https://findyournews.org/)
leads to publishers by place and topic. India's
[Press Registrar title directory](https://prgi.gov.in/en/test/registred-titles)
supports discovery by publication place, state and language. Registration proves
neither free article access nor permission to reuse metadata.

**Repeatable searches.** Use `"{state/language}" "digitized newspapers"`,
`"{city}" "nonprofit newsroom"`, and
`site:{publisher-domain} (RSS OR API OR syndication OR "reuse policy")`.
For India combine local-script publication names with archive/date terms. Follow
each title to the actual publisher; exclude reseller and subscription-preview
pages from free-source qualification.

**Toward 100.** First ten: two Indian historical collections, two Indian current
publishers, two US archival/news origins and four other-country origins. Expand
by language, city/state, publication period and publisher network. Several titles
owned by the same maintained publisher catalog remain one origin. A syndication
copy does not automatically constitute new reporting coverage.

**Retrieval and tests.** Investigate supported archive APIs or permitted publisher
feeds/exports. [WordPress documents searchable post retrieval](https://developer.wordpress.org/rest-api/reference/posts/),
but a publisher's deployed endpoint and external-use terms still need validation.
RSS may contain only recent headlines; declare that window or find a supported
back-catalog route. Test issue/date/page identity separately from article identity,
OCR versus title matches, corrections, paywall/preview exclusions and original
publisher attribution. Test an older article beyond the first feed page before
claiming historical search. Deep-review one archive and one current publisher;
mixed paywalls and unclear reuse policies are expected qualification losses.

## C20 — Educational podcasts, lectures and documentaries

**Where to start.** Begin with universities, public educational broadcasters and
institutional media producers, following their series/catalog links. In India,
[NPTEL's course catalog](https://nptel.ac.in/courses) provides instructor/course
and institutional discovery leads; investigate official educational broadcaster
and university series alongside it. For international and US material, inspect
university lecture catalogs and public-media learning collections. The
[Internet Archive developer portal](https://archive.org/developers/) documents
metadata tools for archive-hosted media; [Wikimedia Commons API guidance](https://commons.wikimedia.org/wiki/Commons:API)
supports another metadata route, with license and exclusion markers to review.

**Repeatable searches.** Run `"{university/broadcaster}" "public lectures"`,
`"{subject}" "educational podcast" "RSS"`, and
`site:{official-domain} ("media catalog" OR API OR "video lectures" OR feed)`.
For India include Hindi/Tamil topic terms and the producer's official language
channel. A commercial streaming-platform listing is only a discovery clue.

**Toward 100.** First ten: four Indian educational producers, two US producers
and four elsewhere. Expand by discipline, teaching language and institutional
network; count the producing catalog once across its video channel, podcast feed
and mirror. Series, playlists and episodes are not independent source origins.
Full documentaries with suitable access and reusable discovery may be scarcer
than lectures; publish that gap rather than filling it with trailers.

**Retrieval and tests.** Prefer documented catalogs, attributed archive records
or permitted RSS/Atom imports. NPTEL's visible catalog does not establish an
external API in this review. Preserve episode/lecture ID, series/course relation,
producer, language, date, duration and canonical playback URL. Test a complete
recording, removed media, country restriction, premium-only episode and a caption
or transcript where available. Metadata search must not be described as searching
every spoken word. Hosting on an archive or public platform does not establish
lawful free access for every upload. Deep-review one feed-based producer and one
catalog-based producer before selecting a reusable media connector.

## Evidence limits and research handoff

This pass reviewed official documentation and directory pages on 2026-11-05.
NARA, Archives Portal Europe, National Archives of India, Museums of India,
Bharatavani, Europeana, PRGI, INN/Find Your News, loc.gov, NPTEL, Internet Archive,
Commons and WordPress pages were retrievable. OLAC FAQ and LINCS direct opens
returned 403 despite official search-index descriptions; treat those details as
leads pending direct recheck. Smithsonian `openaccess/devtools` and
`openaccess/faq` opens returned 404 despite indexed results; locate their current
official documentation before qualification. These observations do not establish
service-wide failure or full-item availability.

The first research batch is 50 category memberships, deduplicated globally, with
up to ten deep reviews across these five categories. Use the parent plan's
10 → 25 → 50 → 100 ladder, pass-rate estimates and required access/queryability
gates. Store only permitted metadata/evidence in the existing Git research
register; no new hosted data store is needed for this planning work.
