# Technical recovery continuation D–F — 6 November 2026

This continuation tests supported searches and records their actual scope. It does not activate sources, import runtime catalogs or deploy the app. 82 Working / 51 Blocked/failed / 0 Still checking of 133 active research connectors; 857 current passing examples. Original 44: 16 Working, 28 remaining; 0 not yet revisited. Current counts live in [connector status](registry/connector-status.csv) and the [fixed 44-item goal](registry/technical-recovery-goal.json).

## Recovered searches

| Connector | Verified search scope | Limits |
|---|---|---|
| Bhuvan | Ten local title/version and native-selector queries over 85 published Bhuvan Store products | No imagery, tiles or product downloads. Dates, resolution and versions are preserved. Obsolete WMS documentation still returns 404. |
| NYC City Planning | Ten live anonymous SODA 2.1 zoning-map label searches with native row IDs | Map-index labels only, no parcels, owners or legal zoning determination. Two 503s recovered after backoff; a separate paging request still failed. Empty-result control passed. |
| ROSA P | Ten live native-record ID lookups through the operator-documented OAI service | Keyword search and full text remain unverified. A date-filtered page of 100 metadata records also passed. |
| GSA FRPP | Ten fiscal-year searches over 13 annual summary-dataset labels and versioned resource URLs | No spreadsheet downloads, asset rows or owner records. The original full asset-export access failure remains separate. Empty-result control passed. |
| Seattle GeoData | Ten live catalog `q` queries, with local title-substring filtering of the first three upstream items | Native catalog IDs only; no underlying asset/owner rows. The advertised `title` parameter failed relevance. Paging and empty controls remain unverified. |
| DG Shipping / DGMA | Ten title searches over 18 dated circular links on the current authority homepage | Current listing only, not the historical archive. DGS and its successor DGMA remain one origin. PDF bodies and legal supersession were not inspected. Empty-result control passed. |

These are scoped metadata queries. A working record-ID lookup does not establish keyword search, and a working title listing does not establish full-content access or reuse rights.

## Incomplete or blocked follow-ups

- **NQR:** the actual public keyword form works, unlike the advanced GET route that returned 500. Nine new keyword queries returned relevant qualification IDs. A later initial-page request returned 403 and collection stopped. An earlier exploratory Electrician query returned 16 items, but its capture did not record the final search HTTP status, so it is not promoted into a verified tenth example. Qualification files, current approval status and paging remain unverified. Retry only after a useful availability/policy recovery signal; do not evade the denial.
- **Gutendex:** the documented native-book lookup is a real alternative to the timed-out broad search. A same-host 301 revealed the canonical trailing slash. Book 84 returned immediately; book 8746 then timed out after 30 seconds, so the route remains intermittent. The old broad-search failures and two historical successes are preserved under the superseded contract. One successful lookup is not full recovery.
- **Seattle GeoData:** its published OpenAPI specification and dataset collection were captured. The documented `title` filter returned unrelated results. The separately documented `q` keyword parameter passed ten current queries at the host's 60-second pacing. It can match descriptions as well as titles; the adapter retains title-relevant matches from the first three items and preserves the observed upstream title list. An overly strict parser initially rejected a correct result because neighboring results had different titles; that failed observation is retained. This is catalog metadata only; underlying feature-service access is separate.

## Access and documentation findings

| Connectors | Cause and action |
|---|---|
| Bloom Library | OPDS requires an operator-issued account/key through an enterprise subscription or content-sharing partnership. This is not open self-service signup. Wait for approved access; no account, purchase or outreach performed. |
| Snapplify | Current operator help documents a Free = Yes filter in Engage Library. Anonymous public catalog/API access is not established. Find an approved public interface or use owner-provided access later. |
| DIKSHA, OER Commons | DIKSHA help describes guest search, but the saved live Library redirect still requires login and generic Sunbird docs do not establish a deployed API. OER's official API sample is an early 2010 staging interface, not a current production contract. Find a current documented public route. |
| OAPEN | Current docs confirm CC0 metadata feeds, but repository robots times out and the export-host policy redirects to login; the old documentation link is now 404. Wait for a usable policy or documented alternative. |
| NCBI Bookshelf, Gallica, USGS National Map, Shodhganga | Tested routes or documented alternatives have explicit robots restrictions. NCBI web docs also show a browser challenge. Do not change agents or use mirrors to bypass restrictions. |
| IndCat, Let's Read, CERT-In | Policy endpoints return XML or HTML instead of usable robots text. Save the response and wait for a legitimate policy/interface correction. |
| FDIC, SciELO Spain OAI, Abhilekh Patal | Policy responses are respectively 403, 503 and empty 202. No protected target queries were sent. |
| Tamil Nadu land records | The current integrated portal includes ownership information. No separately queryable map-only catalog is established; owner/parcel searches are outside this task. Find a nonpersonal map-metadata interface. |

Other unresolved original-44 items and their prior recovery attempts remain in the per-connector status list. Access restrictions are route-specific findings, not claims that every possible use of a provider is forbidden.

## Evidence and validation

Requests, response hashes, outputs and failures are saved in `registry/runs/technical-recovery-20261106d/`, `technical-recovery-20261106e/`, `technical-recovery-20261106f/` and per-source append-only `registry/examples/` JSONL files. Partial dossier sections remain partial. The completed original documentation queue and its disabled status reporter remain stopped; the separate technical-recovery completion automation remains enabled.

Validation: capture → index → audit and registry validation passed; **299 research tests passed**. Current example totals come from the latest request contracts, so superseded title-search cases are not counted again as native-ID cases. All original 44 have a saved recovery-pass assessment; unresolved providers remain open.
