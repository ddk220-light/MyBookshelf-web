# Connector recovery — 6 November 2026, continuation B

Two additional connectors now work in research. NIST title queries use its registered Crossref DOI prefix10.6028; this covers registered technical-series/NBS metadata, not every paper written by NIST staff. Art Institute of Chicago local title/artist/ID searches use its explicitly published, pinned complete artwork metadata export. The139752 native records include one missing title, which stays missing rather than being invented. No images, books or audio were downloaded.

Each has ten current passing examples. NIST empty search returns zero and offset3 yields distinct IDs. Art local empty search returns zero; Git blob and SHA256 evidence pin the exact export. Crossref remains a shared metadata service, not a new NIST content origin. The original direct-API/site blockers remain historically recorded.

The official museum info.json identifies retained artwork metadata as CC0 subject to site terms; descriptions have a separate CC-BY license and were not collected. Image rights and full-item access remain separate. NIST results can include drafts and historic versions; DOI suffixes are preserved and current publication status is not inferred.

IMO's separately published catalog opens, but its robots file explicitly denies search/record routes and contains an additional bot block. No search request was sent. LINCS still fails policy preflight with403. These remain open; no outreach or account needed for the two successful recoveries.

A local scouting script attempted to parse an oversized GitHub commit response. The truncated response was rejected and retained as a failed capture; the documented small git-ref endpoint then supplied the exact commit. No truncated payload established verification.

Evidence: registry/runs/technical-recovery-20261106b/; current examples: registry/examples/art-institute-chicago.jsonl and nist-publications.jsonl. The publisher export was processed in memory with pinned hashes and small observed outputs retained, following the existing NGA workflow. This run is research only; production activation is unchanged.

## Further recovery and backoff checks

Free Kids Books policy recovered. Its published BookDash redirect and API Link/type discovery lead to a public WordPress metadata route. Ten title-keyword searches match books listed on the homepage, with native post IDs and permalinks. The API also contains blog articles; broad topic ranking is not claimed. A long-title zero-result failure is retained alongside the shorter successful request and a real empty control. No book or full-post bodies were downloaded through the API.

Marg's current active Thoth book subset contains one work, The Chandayan. Two real title queries and a negative control establish working search for that limited subset. Queryability reporting now recognizes this explicitly reviewed one-work case instead of fabricating ten different books. The review requires a complete short listing, two current passing requests, an empty control and matching evidence hashes. It does not turn an intermittent success such as Gutendex into Working. Ten-example and deeper qualification counts stay separate.

Seven unresolved checks this run: IMO explicitly denies automated search/record routes; LINCS policy403; India Code policy timeout; NHM policy redirects to a legacy HTTP404 page; CMDA policy503; Chicago dataset503; Gutendex still times out after45seconds. All failures and useful revisit triggers are saved. The fixed original44 now have10Working and34remaining. Four recoveries and32new positive examples this run;23 original items have not yet been revisited in this recovery pass. No production changes.
