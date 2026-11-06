# G01 first ten: query-verified source candidates

Research date: **2026-11-05 UTC**. Owner request: identify and share ten strong
queryable sources; **do not add them to the app**.
Backlog [#164](https://github.com/ddk220-light/MyBookshelf-web/issues/164);
active group [#165](https://github.com/ddk220-light/MyBookshelf-web/issues/165).

## Result and evidence boundary

Ten recommended source candidates returned actual machine-search results without
an API key or reader account in this review. Representative reading destinations
also exposed text, PDF bytes or audio bytes. The evidence is in
[G01_QUERY_EVIDENCE.json](G01_QUERY_EVIDENCE.json), including request parameters,
publisher IDs, native item IDs, UTC observations, small metadata samples and
response hashes. Supporting access and negative/paging observations are in
[G01_ACCESS_EVIDENCE.json](G01_ACCESS_EVIDENCE.json).

Status is **probed / recommended for owner review**, not production-qualified or
enabled. The full five-known-item/five-topic benchmark, repeated-session
reliability, accessibility/browser journeys and country-specific rights/access
checks remain later qualification tasks. Byte-range PDF/audio checks establish
anonymous retrieval of the sampled files; they do not certify every page or a
complete listening experience. No adapter, runtime manifest, source flag, catalog
import, deployment, database, scheduled task or source account was added.

## The ten candidates

| # | Source | Useful coverage | Tested query → example result | Machine route |
| --- | --- | --- | --- | --- |
| 1 | [Global Digital Library](https://content.digitallibrary.io/api/) | Children's picture books and early literacy; English and Hindi sampled | `rain` → **Rain**; Hindi `पानी` → **पूरी क्यों फूलती है?** | Documented anonymous content-search JSON API, with language and offset |
| 2 | [Wikisource](https://www.mediawiki.org/wiki/API:Search) | Literature and historical books; original-script Indian-language coverage | English mathematics-title query → **A History of Mathematics (1893)**; Tamil `திருக்குறள்` → **திருக்குறள், மூலம்** | MediaWiki search plus page/section resolution; EN/TA are one source candidate |
| 3 | [Library of Congress digital books](https://www.loc.gov/apis/json-and-yaml/) | Digitized historical nonfiction, literature and educational books | `mathematics` → **Introduction to mathematics**, native ID `16017346` | Official search/item JSON API, restricted to online material |
| 4 | [Biodiversity Heritage Library](https://about.biodiversitylibrary.org/tools-and-services/developer-and-data-tools/) | Natural-history, botany and zoology books; historical India material | `botany` and exact-title query → **Exotic botany illustrated**; India query → **The flora of British India** | Internet Archive advanced-search JSON over the attributed `biodiversity` collection, then item metadata |
| 5 | [LibriVox](https://librivox.org/api/info) | Free recorded books, including children's classics | Title prefix `Alice` → **Alice's Adventures in Wonderland**, recording ID `200` | Official title/author/genre API and recording/section IDs |
| 6 | [African Minds](https://www.africanminds.co.za/) | African scholarly books, education, arts and social sciences | `musical arts` → **A Contemporary Study of Musical Arts… Volume 1** | Thoth GraphQL search scoped to this publisher |
| 7 | [LSE Press](https://press.lse.ac.uk/) | Politics, economics, development and social-science books | `politics` → **Afghanistan: Long War, Forgotten Peace** | Thoth GraphQL search scoped to this publisher |
| 8 | [Mattering Press](https://www.matteringpress.org/) | Anthropology, science and technology studies | Exact-title query → **The Ethnographic Case**; `ethnographic` also returned other matching works | Thoth GraphQL search scoped to this publisher |
| 9 | [mediastudies.press](https://www.mediastudies.press/) | Media and communication scholarship | `communication` → **Communication Conduct in an Island Community** | Thoth GraphQL search scoped to this publisher |
| 10 | [punctum books](https://punctumbooks.com/) | Humanities, architecture, arts and cultural scholarship | `Analogical City` → **Analogical City** | Thoth GraphQL search scoped to this publisher |

Five publishers share **one** documented [Thoth API](https://thoth.pub/docs).
Thoth is a connector, not an eleventh content origin.
Its [metadata policy](https://thoth.pub/docs/policies/terms-thoth-metadata)
permits public access and CC0 metadata reuse. Book licenses remain independent.

This is ten discovery options, not ten demonstrated net-new origins in production.
GDL and BHL aggregate contributors; do not add their contributor counts on top.
BHL's Internet Archive hosting is not another source. Measure item/publisher
overlap with existing StoryWeaver, Book Dash, OTL and Gutenberg before reporting
incremental coverage. The five named publishers have distinct publisher IDs;
their chapters, editions and mirrored files do not increase that count.

## Reading evidence and source-specific limits

| Source | Observed usable access | Limits that implementation must preserve |
| --- | --- | --- |
| GDL | English **Rain** page exposed 15 H5P chapter/page units; Hindi sample exposed 19, without login. Both had actual embedded book content rather than only catalog cards. | Some publisher/credit fields are empty in API responses: recover evidence from the book's attribution data. Per-book CC licenses differ. The `rain` result set also included **Queens of Shakrain**, so native substring search needs relevance checks. Avoid double-counting StoryWeaver/other republished stories. |
| Wikisource | English introduction returned 18,376 characters of rendered HTML; Tamil **உழவு** section returned 7,337. Native page IDs and parent/section links resolved. | Search returns chapters, version pages and entire works together. Preserve language, edition, parent work, proofread status and applicable rights; do not label a contents page or incomplete transcription a complete book. |
| Library of Congress | Sample item declared unrestricted access and public-domain reuse; its PDF returned HTTP 206 and PDF bytes. | API covers digital collections rather than the whole library catalog. Keep per-item rights, scan/OCR quality and historical publication date. Metadata result alone is insufficient. |
| BHL | Exact matched item supplied institutional attribution, a public-domain statement and a public PDF; PDF returned HTTP 206 and PDF bytes. | Scope this route to BHL's maintained collection and retain contributing-library attribution. Members may overlap other catalogs. Historical taxonomy/terminology and volume identities matter; modern in-copyright items require their own licenses. |
| LibriVox | API returned 12 sections for recording 200. First, middle and final section URLs returned HTTP 206 audio/mpeg bytes. | Other results included a different recording and an abridged version. Preserve narrator, recording ID, language and abridgement. US public-domain statements do not establish worldwide rights. |
| African Minds | Publisher-attributed record contained a CC BY 4.0 license and a canonical PDF that returned HTTP 206/PDF bytes. | Tested subset only; preserve volume identity and per-title licenses. |
| LSE Press | Sample **Afghanistan** record had CC BY 4.0 and a canonical PDF returning HTTP 206/PDF bytes. | Other titles have other CC terms. Select digital editions rather than paid print formats. |
| Mattering Press | **The Ethnographic Case**, second edition, had CC BY-NC-SA 4.0 and a canonical PDF returning HTTP 206/PDF bytes. | First/second editions are distinct records. Preserve noncommercial/share-alike terms for content reuse; this proposal is metadata discovery and outbound reading. |
| mediastudies.press | Selected second-edition record declared CC0 and supplied a canonical PDF returning HTTP 206/PDF bytes. | A same-title older edition had a different DOI/license. Do not merge by title or copy rights across editions. |
| punctum books | **Analogical City** had CC BY-NC-SA 4.0 and a canonical publisher PDF returning HTTP 206/PDF bytes. | Returned location lists also contain retail and unreviewed third-party hosts. Only approved official/authorized locations can become reading links. |

File-access samples were 4 KiB, bounded to avoid bulk downloads. No complete books
or audio files are committed. Source API responses were examined locally; the
committed evidence retains only small metadata samples and request summaries.
Browser-verification pages and failed requests were not treated as usable content.

## Query behavior and operating constraints

All six retrieval families—GDL, MediaWiki, LoC JSON, Internet Archive search,
LibriVox and Thoth—were probed with a nonsense term. Empty results were observed;
LibriVox expresses this as HTTP 404 with an audiobook-not-found JSON message.
An adapter must distinguish that documented response shape from an outage.
Representative second-page requests were also checked; retain each provider's
paging and scope. These checks are evidence, not implemented app behavior.

Thoth publisher filters and active book types constrain results, but results are
not guaranteed to be ordered by reader relevance. They can match descriptions.
Wikisource needs whole-work/section handling. GDL needs token/phrase relevance
checks. These observations are particularly relevant to the earlier irrelevant
free-search results: a working API alone does not finish search quality.

No paid fallback is proposed. All tested search requests worked anonymously.
Respect current provider limits and use bounded requests, cancellation, backoff
and truthful unavailable states. No numeric unlimited allowance is inferred where
documentation does not publish one. Wikimedia calls should be serial with a
descriptive User-Agent and maxlag for research; Internet Archive also requests
identification of automated clients. LibriVox documents a maximum page size of
500 and pacing for bulk work. We requested only three catalog records at a time,
except GDL's fixed 20-record search page.

## Alternatives investigated but withheld from the ten

| Candidate | What worked | Why withheld / next useful action |
| --- | --- | --- |
| Open Book Publishers | Publisher-scoped Thoth queries and publisher landing page | Sample canonical PDF presented human verification; OAPEN sample also challenged, and the Cambridge repository request was denied by this environment's network proxy. No bypass attempted. Recheck reader access through an allowed normal browser route before promotion. |
| NCBI Bookshelf | ESearch/ESummary produced real chapter and parent-book IDs | Sample reading page returned browser verification. Keep as a queryable lead; verify ordinary reader access and book-versus-chapter scope before promotion. Do not crawl the full-text website. |
| NCERT | Official catalog is known from the discovery playbook | Catalog request returned HTTP 503 here. No current machine-search or metadata route was demonstrated in this batch. Revisit supported feeds/exports; this is not a claim of source-wide downtime. |
| Project Madurai | Official works catalog downloaded | A maintained and permitted metadata-search route still needs evidence. Public reading availability alone is insufficient. |
| Gallica / BnF | Official SRU search documentation reviewed | Actual SRU probe returned HTTP 403. Keep for a later supported-access check; documentation is not a passing probe. |
| OpenStax | CMS catalog, biology search and detail endpoints returned records | Current external-use support for the tested CMS route remains unestablished; measure existing OTL overlap and prefer documented OTL metadata where appropriate. |
| The Marg Foundation | Thoth returned **The Chandayan** | Sample supplied only a paperback location, with no evidenced free digital edition. Do not infer OA from presence in Thoth. |
| Helsinki University Press via Thoth | Topic query returned book records | Sampled records lacked canonical digital reading locations. Check an official supported publisher/repository route later. |
| Lever Press via Thoth | API requests completed | Selected active-book query and small catalog probe returned no works. This does not prove the publisher has no free books; inspect another supported catalog route later. |

## Coverage and the next decision

G01 covers children, books, scholarly books/textbooks and audio. This first batch
demonstrates each broad area but is weighted toward scholarly publishers; it is
not ten sources per category. Hindi, Tamil and India-related historical material
were sampled. No newly qualified India-operated catalog or current Indian school
curriculum collection is claimed. That remains an explicit discovery gap.

If selected to advance later, prioritize GDL for children's coverage, Wikisource
for Indian-language literature, and the five Thoth publishers for shared
engineering. BHL and LoC add historical depth; LibriVox adds audio and requires an
appropriate listening-result design. Keep source qualification and new UI review
before implementation under the agreed workflow.

**Subsequent direction, 2026-11-05:** the owner approved continuing research and
requested a source registry with capabilities, query instructions and ten
verified examples per usable source, then chose simple JSON files over SQL.
The [registry](../registry/README.md) and [current progress](../registry/PROGRESS.md)
supersede the original stop-after-ten checkpoint. G01 remains open for its gaps;
G02 research has begun. Integration tasks have not been started. The observations
above remain the historical first-batch evidence, with later rechecks stored
separately.

## Primary documentation reviewed

- [GDL content API](https://content.digitallibrary.io/api/).
- [MediaWiki search](https://www.mediawiki.org/wiki/API:Search) and
  [API etiquette](https://www.mediawiki.org/wiki/API:Etiquette).
- [Library of Congress JSON API](https://www.loc.gov/apis/json-and-yaml/).
- [BHL developer/data tools](https://about.biodiversitylibrary.org/tools-and-services/developer-and-data-tools/),
  [collection policy](https://about.biodiversitylibrary.org/about/collection-management/collection-development-policy/),
  and [copyright/reuse](https://about.biodiversitylibrary.org/help/copyright-and-reuse/).
- [Internet Archive structured advanced search](https://archive.org/advancedsearch.php),
  [metadata API](https://archive.org/developers/md-read.html), and
  [automated-access guidance](https://archive.org/developers/bots.html).
- [LibriVox API](https://librivox.org/api/info) and
  [public-domain scope](https://librivox.org/pages/public-domain/).
- [Thoth documentation](https://thoth.pub/docs),
  [live schema explorer](https://api.thoth.pub/graphiql) and
  [metadata access/CC0 policy](https://thoth.pub/docs/policies/terms-thoth-metadata).
