# Five-library Koha interface investigation — 8 November 2026

## Finding

All five selected catalogs expose Koha's native RSS/XML search and a working public REST MARCXML record lookup without credentials. The tested RSS result IDs and order match equivalent native HTML requests. This supports replacing visual HTML result parsing for these paths with one shared structured connector, subject to further scope/paging/link regression tests. No production connector was changed and no full audit or scheduled worker was resumed.

These were five deliberately selected previously successful Koha catalogs from the frozen 554-entry cohort, on five different origins. They are a feasibility sample, not a random sample of all Koha libraries or a test of the restricted Rayat/MES routes. Existing twenty-book passes were not awarded again.

| Library | Keyword query | First page records returned | Next page records returned | RSS/native IDs and order | Public REST ID/title |
|---|---|---:|---:|---|---|
| Central Library, Assam Women's University | History | 5 | 5 | Match on both tested pages | Match |
| Central Library, IIT Bhubaneswar | Wings of Fire | 2 | 0 | Match on both tested pages | Match |
| Centre for Management Development Library | History | 5 | 5 | Match on both tested pages | Match |
| National Law University Odisha Library | Wings of Fire | 1 | 0 | Match on both tested pages | Match |
| Kumaraguru College of Technology — Mahatma Gandhi Central Library | Wings of Fire | 3 | 5 | Match on both tested pages | Match |

A requested page size of five and `sort_by=relevance` were used on both representations. Native title presentation may include author text in HTML that is separate in RSS/MARC; this comparison verifies IDs/order and the known record's title, not identical rendered text. NLU Odisha's first HTML request redirects to its single matching record; the redirect ID matches RSS and the detail page was fetched successfully. There are 31 returned record observations across these pages; these are not 31 newly qualified distinct books.

## Reusable request shapes

Search (same public search engine, structured XML response):

```http
GET /cgi-bin/koha/opac-search.pl?idx=kw&q=Wings%20of%20Fire&count=5&sort_by=relevance&format=rss
```

Next tested page adds `offset=5`. The original query and every request URL are in requests.csv. Keyword search is the tested mode; title-only, advanced filters, all branch variants and complete-catalog enumeration are not established by this sample.

Record metadata, using the native ID returned in search:

```http
GET /api/v1/public/biblios/{biblio_id}
Accept: application/marcxml+xml
```

All five records matched native MARC 999$c and the RSS title of the same ID. REST record retrieval is not itself a title-search endpoint. The documented staff bibliographic list endpoint requires catalogue permission; no staff endpoint, credentials or account was used here.

Five initial REST requests returned HTTP 406 because the broad Accept list omitted Koha's supported MARC media types. The server explicitly listed the accepted formats. A single corrected request per library returned HTTP 200 MARCXML. The failures are retained; this was request-format negotiation, not an access-control workaround.

## Other interfaces

- NLU Odisha: OAI-PMH Identify and ListMetadataFormats return valid XML and identify the repository. Advertised formats are oai_dc, marc21 and marcxml. This establishes service discovery, not tested record harvesting or permission for a full maintained index.
- Other four: the documented OAI-PMH path returned HTTP 404. No alternate hostname or access-control workaround was attempted. This does not prove the institution has no export anywhere.
- SRU/Z39.50: scoped documentation searches did not establish provider-advertised public endpoints for these five. No ports were scanned or guessed. Their availability remains unverified.

## Edge cases and limits

- All five nonsense-query RSS requests returned zero records and total zero.
- Assam, CMD and Kumaraguru returned additional records on the tested next page; IIT and NLU returned empty pages beyond their small result sets. IDs/order matched HTML in all five comparisons.
- Kumaraguru's first page declares 15 total results but emits only three items for a requested count of five; a later page emits five. The HTML page behaves the same. Never infer catalog exhaustion from a short page; underlying suppression/filter behavior needs careful treatment.
- IIT/NLU beyond-end feeds report total zero. Do not overwrite the first page's total merely because a later page is empty.
- Assam and IIT publish relative item URLs; resolve them against the verified catalog origin. CMD uses native MARC-detail links, while its RSS GUID uses the ordinary detail link. Retain actual links and native IDs.
- This sample validates one meaningful query, the next offset, an empty query and one known REST record per library. It is not a full library qualification or production deployment. Comprehensive item-link availability, live borrowing status, branch-specific holdings, additional queries and version compatibility remain future checks.
- The five original tested catalogs have no branch selector in their primary frozen connection. This does not establish member-scoped results for other multi-branch catalogs.

## Recommendation

Use a shared Koha connector with native RSS/XML for search and the documented public REST MARCXML endpoint for record metadata. Preserve the native query controls, scope, rank and identifiers. This removes visual result-layout parsing from these paths. It still needs monitoring and version/configuration checks; five successful catalogs do not prove universal Koha support. Keep HTML as an explicitly tested fallback where a structured route is unavailable.

## Primary references

- [Koha's public API documentation](https://api.koha-community.org/) — public getBiblio endpoint and MARC response formats; staff list-biblios permission is distinct.
- [Koha's native RSS/OpenSearch template](https://github.com/Koha-Community/Koha/blob/main/koha-tmpl/opac-tmpl/bootstrap/en/modules/opac-opensearch.tt) — built-in XML search representation.
- [Koha web-services manual](https://koha-community.org/manual/latest/en/html/webservices.html) — OAI-PMH configuration and SRU service discovery.

## Evidence

- [Per-library comparisons and requests](analysis.json)
- [All returned RSS records and item URLs](results.csv)
- [Request outcomes, including negative tests](requests.csv)
- [Derived append-only observation archive](observations.jsonl)
- [Capture provenance map](capture-map.json) and [validation](validation.json)

The original scoped journal remains at `/workspace/koha-interface-check-20261108/events.jsonl`. Archive bodies undergo additional anonymous HTML meta-token redaction before publication. `sourceSavedResponseSha256` retains the source-body hash, while `sha256` validates the archived derivative; observation dates and source event IDs are preserved. The original frozen audit journals and source code remain unchanged. No books/audio were downloaded, no accounts created, no APIs enabled and no providers contacted by outreach.
