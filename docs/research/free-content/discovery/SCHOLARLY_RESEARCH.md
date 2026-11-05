# Scholarly research discovery playbook

Planning research, 2026-11-05. Covers C03 published articles, C06 theses and
dissertations, and C07 preprints/working papers. Apply the counting and admission
rules in [the expansion plan](../EXPANSION_PLAN.md) and record each investigation
with [the source template](../SOURCE_REVIEW_TEMPLATE.md). These are documented
research routes; no new origin has been qualified or enabled by this review.

## C03 — Published research articles

**Start with publisher and repository discovery, then prove individual holdings.**
[OpenDOAR](https://opendoar.ac.uk/help/about) supplies institutional repository
leads. [SciELO](https://www.scielo.org/en/) supplies country, publisher and subject
entry points, particularly useful for Latin American and regional-language
coverage. DOAJ remains a directory lead; the current direct DOAJ connector
deferral is unchanged. Separate the publisher, journal collection, repository
copy and index that found it.

| Research track | Where to look and how to expand |
| --- | --- |
| International | Follow SciELO's publisher lists and country nodes; use OpenDOAR to identify university/research repositories; inspect disciplinary society publishers. Rotate medicine, engineering, agriculture, social sciences and humanities instead of taking the first 100 biomedical origins. |
| USA | Start with university repository catalogs and official learned-society publication lists. Separate institution-hosted open manuscripts from subscription publisher versions. Federal research agencies can also supply journal-article deposits; an agency bibliography alone is insufficient. |
| India | Use [INFLIBNET's initiatives](https://www.inflibnet.ac.in/activities/) and [university directory](https://web.inflibnet.ac.in/universitydirectory/index.php) to locate official institution sites. Follow their repository and society-publisher links, sampling central/state universities and research institutes. ONOS/N-LIST institutional entitlements are not evidence of anonymous public access. |

Repeatable discovery searches:

```text
site:{official-university-domain} (repository OR "open access") "{discipline}"
"{society name}" journals (metadata OR OAI-PMH OR API)
"{Indian institution}" (शोध OR ஆய்வு OR research) repository
```

Resolve organization names to stable identities before counting. The first
research batch is ten independent origins: four Indian, four broadly accessible
international and two additional regional-language origins. Deep-review one
publisher and one repository with the greatest apparent coverage gap. Expand in
25-origin batches across countries, disciplines and organization types toward
100 qualified origins; journal titles from one catalog do not become 100 origins.

**Retrieval strategy.** Test existing OpenAlex coverage first, using a known work
and its actual host attribution. Current [OpenAlex search documentation](https://help.openalex.org/api/searching/)
describes work text/keyword search and separate entity searches; an institution
name match does not establish that its repository holds the paper. Use the
documented filters and inspect individual locations. Preserve the existing free
allowance guard. A new publisher API or permitted OAI/export import is justified
when the index demonstrably misses useful holdings. An OJS website or a DOI
registration record alone does not prove reusable full-item discovery.

**Category-specific proof.** Use five known articles spanning recent/older years,
at least two subjects and relevant local-language content. Confirm topic relevance
with agriculture, manufacturing or another industry topic, not just exact titles.
Resolve DOI/native ID to the same article and test its free destination. Include
a hybrid-journal paywalled article, accepted manuscript versus published version,
retraction/correction and missing full-text location where present. Keep valid
versions distinct; a source-wide OA label cannot make every location free.

## C06 — Theses and dissertations

**Start from degree-granting institutions and national thesis networks.**
[NDLTD's FAQ](https://ndltd.org/thesis-resources/faqs/) describes a union catalog
made available to service providers and directs users to its current Find ETDs
resources; its navigation currently points Global ETD Search to OATD. Treat this
as a directory/coverage route, not evidence of a turnkey NDLTD keyword API.
Cross-reference university origins through OpenDOAR.

| Research track | Where to look and how to expand |
| --- | --- |
| International | Follow NDLTD's member/resource links to national thesis services and their contributing universities. Sample different languages and degree systems; a national portal is an index unless it hosts the authoritative deposit. |
| USA | Inspect official university library ETD policies and institutional repositories. Check whether the institution supplies open deposits or only points to a commercial dissertation service. University departments are not extra origins when their theses share one maintained catalog. |
| India | Begin with Shodhganga through [INFLIBNET's official initiatives](https://www.inflibnet.ac.in/activities/), then follow university links. Use the official university directory's state/category browsing to fill geographic gaps. [IndCat's documented features](https://indcat.inflibnet.ac.in/index.php/main/features) include thesis discovery and Shodhganga links, but a bibliographic record is not itself a readable thesis. |

Search recipes:

```text
site:{university-domain} ("electronic theses" OR dissertation OR thesis) repository
"{university name}" (OAI-PMH OR "metadata harvesting")
"{state or university}" (शोधप्रबंध OR ஆய்வேடு) repository
```

The first ten candidates should include four Indian university origins from
different states, two US universities and four institutions in other regions.
Select two deep reviews with different repository platforms/languages. Build the
next batches from uncovered degree institutions, not repeated national-portal
collections. Five discovery regions with 20 qualified institution catalogs each
is a research allocation toward 100, subject to actual conversion and overlap.

**Retrieval strategy.** Verify attributed aggregator coverage with known thesis
titles first. Otherwise inspect the repository's advertised OAI-PMH/export or
documented API. OAI-PMH requires an import and local title/topic search; it is not
a live keyword endpoint. Discover actual supported routes and versions instead
of guessing DSpace paths. Start with a bounded, disclosed metadata subset using
the existing catalog approach; no new hosted database is prerequisite.

**Category-specific proof.** Check complete dissertation versus abstract/synopsis,
degree, university, award year, native handle and content language. Sample a
multi-file/chapter thesis, embargoed deposit, scanned document and duplicate
national/institutional copy. Search Hindi/Tamil titles in native script where
claimed; compare transliteration separately. Successful retrieval of a title page
or one chapter does not establish access to the whole thesis. Document OCR/full-text
limitations, withdrawn records and how embargo changes will be refreshed.

## C07 — Preprints and working papers

**Use two different discovery paths: disciplinary servers and institutional series.**
[ASAPbio's server directory](https://asapbio.org/preprint-servers/) describes
server scope and practices. [RePEc's archive directory](https://ideas.repec.org/archives.html)
identifies institutional archive providers, but explicitly says its listing is
not current. Follow its archive templates and each institution's current site;
do not derive today's coverage totals from that list.

| Research track | Where to look and how to expand |
| --- | --- |
| International | Use ASAPbio for disciplinary server leads, SciELO's preprint link for regional coverage, and RePEc archive/provider links for economics and social-science working-paper collections. Sample more than one discipline. |
| USA | Follow university/research-center working-paper series and government research-unit publications from their official sites. Record whether a series is independently maintained or part of the institution's existing repository origin. |
| India | Follow Indian institutions in RePEc and the INFLIBNET university directory; inspect economics, management, engineering and agricultural research repositories. Include native-language series where actually present; an English institutional website does not prove English-only holdings. |

Search recipes:

```text
site:{institution-domain} ("working papers" OR "discussion papers" OR preprints)
"{series name}" (ReDIF OR metadata OR repository OR API)
"{discipline}" "{country}" "preprint server"
```

For the first ten origins, investigate four Indian institution collections, three
international disciplinary servers and three institutional series from other
regions, including the USA. Deep-review one server and one working-paper archive.
To approach 100, replenish both paths in batches of 25 and deduplicate operators.
There may not be 100 suitable independent preprint servers; institutional
working-paper catalogs supply a distinct, valid part of this category. One
university's many series still count as one catalog origin under the main rules.

**Retrieval strategy.** Prefer existing attributed aggregator search where its
coverage passes. The [bioRxiv/medRxiv API documentation](https://api.biorxiv.org/)
supports date-window/DOI metadata retrieval and version information; it is not a
generic keyword search interface. A permitted bounded metadata import can make
that feed searchable locally. [RePEc's metadata policy](https://ideas.repec.org/getdata.html)
prefers publisher archives/ReDIF over website scraping and requires prior contact
for commercial use. Review applicability before use; no outreach is sent as part
of this plan. Direct arXiv automation remains deferred under the current plan.

**Category-specific proof.** Search five known preprints/working papers, including
an older version, updated version, published successor, withdrawn item and a
paper without DOI where those cases exist. Preserve native handle, series/number,
version date and exact reading destination. Publication relations are links,
not a reason to merge distinct versions. Test topic results for industry terms
and label preprints clearly; being publicly readable is not peer-review evidence.

## Handoff and research limits

Each ten-candidate batch produces the origin register, two completed qualification
records, a category benchmark, unsupported-query notes and the next directory
expansion. Report aggregate overlap across C03/C06/C07 before estimating work.
Scale only after measuring pass rates and useful new coverage.

This review inspected official directory/protocol documentation, not production
API behavior, source-login access or complete catalogs. The old OpenAlex docs URL
failed after redirect; the linked Help Center route worked. RePEc's root page
returned a gateway error while its archive/policy pages worked. These are tooling
observations, not evidence of source-wide downtime. Current prices, permission,
freshness and per-origin free access still require qualification before enablement.
