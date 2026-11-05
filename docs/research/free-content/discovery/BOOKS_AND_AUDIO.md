# Books, children's reading and audiobooks: discovery recipes

Planning research, 2026-11-05. Covers C01, C02, C04 and C05 in the
[expansion plan](../EXPANSION_PLAN.md); published research articles C03 have a
separate recipe. Use the [qualification record](../SOURCE_REVIEW_TEMPLATE.md)
for every origin. Links below were inspected as documentation or directory leads;
this work does not establish a new working connector or enable a source.

The discovery chain is **directory/network → independently maintained catalog →
permitted retrieval route → matching item → evidenced free destination**. A
directory, an aggregator and the same underlying publisher are not three origins.
Reach 100 through additional useful catalogs, not additional mirrors, languages,
formats, narrators or books within a catalog.

## C01. Children's books and early literacy

**Best starting points.** [IBBY national sections](https://www.ibby.org/ibby-worldwide/ibby-sections)
provide country-level publishing/literacy networks, including India and the US.
Follow sections to publishers and literacy organizations with digital collections.
For India, [Parag's publisher and bookstore directory](https://www.paragreads.in/parag-reads/childrens-publishers-and-bookstores/)
is a concrete seed list; bookstores and commercial catalogs remain leads rather
than eligible sources. [Book Dash's partner network](https://bookdash.org/partners/)
links literacy organizations and content collaborators, including African
Storybook and Pratham Books. Distinguish content producers from organizations
that only distribute another publisher's books.

**Search process.** Create country × language × publisher-type cells: national
literacy NGOs, independent publishers, educational foundations and public bodies.
Start with English/Hindi/Tamil, then investigate other Indian scripts and
underrepresented African/Asian languages. For each network lead, search:

```text
site:{publisher-domain} ("free stories" OR "digital library" OR "open licence")
"{language}" "children's books" ("Creative Commons" OR "open access")
"{publisher name}" (metadata OR API OR catalog OR download)
"हिन्दी बाल कहानियाँ" "मुक्त" / "தமிழ் சிறுவர் கதைகள்" "இலவசம்"
```

Repeat the native-language pattern with locally appropriate vocabulary; search
terms are discovery prompts, not evidence that results are lawful or free. Follow
actual book credits back to publishers and translators. Expand in batches of 25
origins across new country/language cells; use the measured pass rate to replenish
the pool toward 100 qualified origins. A national section is not automatically a
publisher and a translation of the same catalog does not add an origin.

**Retrieval to investigate.** Prefer attributed coverage in an approved catalog,
an official export, or a supported publisher interface. An open-source website
codebase does not grant API access or metadata reuse. Free reader registration is
acceptable when disclosed; an advertised offer and verified post-login access are
separate observations. Recheck the existing StoryWeaver gate before expanding it.

**Category tests.** Find known titles in their original script; resolve the
specific translation, preserve writer/illustrator/translator credits and original
story relations, verify every page is accessible, and retain publisher levels
without inventing child ages. Test a wordless book, translated story and free-login
book where present. Do not turn a sample page into a complete reading action.

**First ten leads:** four India-origin publishers/NGOs from Parag and Pratham
connections, four publishers from other IBBY sections, and two independent
catalogs identified through Book Dash collaborators. Deduplicate shared catalogs;
deep-review one reusable-feed candidate and one multilingual candidate first.

## C02. General books and ebooks

**Best starting points.** [Project Gutenberg's official catalog documentation](https://www.gutenberg.org/ebooks/offline_catalogs.html)
identifies machine-readable catalogs, OPDS and affiliate/mirror links. Use the
catalog as a retrieval model; mirrors are duplicate hosting. National libraries,
state digital libraries, regional literary organizations and university special
collections supply additional independent origins. The [Library of Congress
JSON/YAML interface](https://www.loc.gov/apis/json-and-yaml/) is a US starting
point for digitized collection records; its scope is not the entire library catalog.
DPLA's [developer documentation](https://pro.dp.la/developers/api-codex) is a
US aggregator lead requiring a fresh documentation/access check before selection.

**India route.** Start with state-library and language-academy institution lists,
then inspect the official digital catalogs. [Project Madurai](https://www.projectmadurai.org/)
is a concrete Tamil literature lead with a linked works list and text-format
information. Its reading/distribution statements do not by themselves establish
permission for the app's proposed metadata harvest. Investigate Hindi and other
regional literary catalogs through their actual operators rather than copying
anonymous “free PDF” lists.

**Search process.** Search `"{country/state}" "digital library" "literature"`,
`site:{institution-domain} ("digitized books" OR "ebooks" OR "rare books")`,
then `"{catalog name}" (OPDS OR MARC OR RDF OR API OR metadata)`. For each
national/state network, follow its digitization partners to catalog owners.
Expand the pool by geography, language and literature type; count independently
maintained catalogs only after recording attribution and a searchable subset.
Compare holdings with existing Gutenberg coverage before prioritizing a connector.

**Retrieval to investigate.** Import official reusable metadata into a bounded
local search artifact, use permitted OPDS search when available, or verify an
aggregator's origin attribution. Gutenberg's documentation currently mentions
OPDS2 testing and planned retirement of its XML OPDS feed in 2027; recheck before
choosing a long-term interface. Search-engine site results are not a substitute
for an in-app catalog. Record OCR/full-text availability separately from metadata
search; a digitized scan may be readable without searchable OCR.

**Category tests.** Recover exact title/author/edition; distinguish similar titles,
multi-volume sets and translated editions; test complete book versus excerpt,
cover-only object and loan. Resolve ISBNs only where supplied. Preserve original
script and Unicode. Record territorial rights evidence independently of the
server's ability to fetch a page; US public-domain status is not worldwide proof.

**First ten leads:** four Indian regional/institutional catalogs, four national
or university catalogs across other countries, and two independent public-domain
publishers. Existing Gutenberg is a comparison baseline, not a newly found source.

## C04. Textbooks and scholarly books/chapters

**Best starting points.** [DOAB metadata](https://doabooks.org/en/librarians/doab-metadata)
documents CC0 exports and OAI-PMH, including selective publisher/subject exports.
Use publisher identities to discover origins and verify their actual OA subsets.
[Open Textbook Library discovery](https://open.umn.edu/opentextbooks/discovery)
documents MARC/CSV, JSON resources and change feeds. Follow textbook publisher and
institution links into university presses and open-education programs. These
catalogs expose different kinds of books; keep textbooks, monographs and chapters
distinct even when the same publisher supplies all three.

**India route.** Investigate [NCERT's textbook catalog](https://ncert.nic.in/textbook.php),
state textbook bodies, university presses and e-PG Pathshala-linked institutions.
Start with official institution lists, then find their publication catalogs and
terms. An NCERT/state-board website with downloadable books is a candidate, not
evidence of an available external search API. Treat school medium, syllabus and
academic year as scope fields, not merely title keywords.

**Search process.** Enumerate publisher-origin candidates from approved metadata
exports by discipline, language and geography; inspect batches of 25 distinct
publishers. Search `"{university press}" "open access books"`,
`"{subject}" "open textbook" "{country}"`, and
`site:{education-body-domain} (textbook OR publication) (catalog OR download)`.
Follow open-education network members into their own catalogs and compare against
DOAB/OTL holdings. To approach 100, add qualified publisher catalogs across
disciplines, not 100 series from one press. Record the fraction actually covered
by the aggregator; a few OA titles never imply a wholly free publisher catalog.

**Retrieval to investigate.** Prefer DOAB/OTL-origin mapping and official exports
before custom publisher connectors. OAI-PMH needs an import and local keyword
index; it is not a topic-search API. Per-book licenses and destinations remain
separate from the metadata feed license. Verify withdrawn records, corrected
editions and bounded refresh costs without provisioning a hosted database.

**Category tests.** Find a known chapter and its parent book; preserve chapter DOI
versus book DOI/ISBN; check edition and syllabus year; distinguish instructor-only
solutions from the free student text. Include a broad topic such as mathematics
and specific concepts to test relevance rather than accepting every education
record. Sample multilingual titles and withdrawn/changed links where available.

**First ten leads:** four Indian educational publishers/institutions, four new
publishers represented in DOAB/OTL, and two independently maintained catalogs from
underrepresented regions. Deep-review a publisher represented by an export and
an India school-text catalog to compare integration and refresh effort.

## C05. Audiobooks and recorded books

**Best starting points.** [LibriVox API documentation](https://librivox.org/api/info)
describes ID, title, author and genre retrieval, JSON/XML responses and offset
paging. It presently caps `limit` at 500 and asks clients to space bulk requests;
recheck current policies before implementation. Use national-library audio
collections and independently maintained public-domain recording projects for
additional catalogs. [DAISY member organizations](https://daisy.org/about-us/membership/full-members/)
provide accessible-reading leads, with eligibility evaluated individually.

**US and India route.** The [NLS BARD documentation](https://www.loc.gov/apis/additional-apis/nlsbard-api/)
is an important counterexample: public metadata search exists, but full-item use
requires reader eligibility. Keep this outside the general free-reading count.
Investigate regional-language volunteer recording catalogs and public cultural
institutions in India. [Sugamya Pustakalaya](https://sugamyapustakalaya.org.in/)
is a discovery lead whose access conditions and supported retrieval still require
review; do not treat accessibility-service registration as ordinary free signup.

**Search process.** Search `"{language}" "public domain audiobooks"`,
`"{institution}" ("talking books" OR audiobooks) (catalog OR API OR RSS)`,
and native-script equivalents for recorded stories/books. Follow a catalog's
producer credits to independently maintained origins. Expand by language/country
and producer type; distinguish library catalogs, volunteer recording projects and
publishers. A LibriVox narrator, recording version or mirror is not a new origin.
Expect a lower qualification rate and document scarcity if 100 independent,
freely accessible catalogs cannot be established.

**Retrieval to investigate.** Use native catalog APIs, approved aggregator
metadata, or complete reusable feeds compiled locally. A podcast feed containing
recent episodes may cover only a short window, not a book archive. Preserve
recording ID, work relation, narrator, language, abridgement, chapter order and
duration. Link the original player or permitted file; do not rehost audio.

**Category tests.** Recover a known title/author; distinguish human readings,
synthetic narration and dramatization; verify the first, middle and final sections
of a purported complete recording. Check playable media versus trailers, expired
links and subscriptions. Test accented/native-script names, repeated recordings
of one work and a free-login destination where genuinely available.

**First ten leads:** four India-language recording/catalog operators, four
independent international audio origins and two library/cultural audio catalogs.
If eligible candidates are scarce, record deferred leads explicitly; do not fill
the batch with paid trials, disability-entitled collections or podcast episodes.

## Evidence boundaries and next handoff

Documentation opens succeeded for IBBY, Parag, Book Dash, Gutenberg, OTL, DOAB,
Project Madurai, LibriVox, DAISY and NLS during this planning review. The research
tool returned HTTP 402 for StoryWeaver's open-content page, 502 for NCERT's
textbook page and 403 for DPLA's API page. Sugamya redirected to its current domain
but exposed no readable content to the tool. These observations establish neither
payment requirements nor source-wide outages. No credentials, source accounts,
outreach, bulk harvests or live query qualification probes were performed.

Next deliverables: up to 40 deduplicated leads across these four categories,
eight deep reviews where suitable candidates exist, and a ranked integration
recommendation with actual pass rate, marginal coverage and operating effort.
Keep the parent plan's qualified/enabled distinction and existing access-expiry
rules throughout; this document does not refresh old reading evidence.
