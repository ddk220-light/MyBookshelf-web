# Metadata search fixes — 6 November 2026

The owner approved searchable metadata and outbound source links, with reading eligibility shown separately. SWAYAM is excluded. This is research connector work; production activation is unchanged and both hourly tasks remain paused.

Five connectors now have ten distinct passing current searches each. The registry totals are **68 Working, 65 Blocked/failed, 0 Still checking** across 133 active connectors; all 134 records remain inventoried, including excluded SWAYAM. There are 717 passing examples overall, 50 added here. Deeper qualification is still open and is not the search-coverage count.

| Connector | Result | Search that now works | Limits |
|---|---|---|---|
| Open Book Publishers | Working | Public Thoth title search restricted to this publisher, active monographs/edited books; native work UUIDs and publisher links | Metadata CC0 does not license the books; reading not tested |
| Helsinki University Press | Working | Same publisher-scoped search; provider DOI links used when the landing-page field is empty | DOI destinations not fetched; provider titles with a literal `: None` suffix preserved |
| Project Madurai | Working | Local Tamil title/native work-label search over 1,149 published catalog records | Parts/component titles grouped under their printed labels; 7 malformed format-link records preserved; no e-text fetched or redistribution license inferred |
| Sugamya Pustakalaya | Working | Public anonymous keyword search; 10 relevant examples, five displayed entries per page, outbound search-result links | Native book IDs and individual book links are hidden anonymously. Local composite keys are explicitly not native IDs. Downloading requires eligible membership. The separate web-services API still requires registration and approval |
| OpenStax | Working | Normal Subjects → Math browser navigation, then local title/book-slug search over 16 current textbooks | Math catalog only in this batch; other subjects/languages and book reading not verified. Editions, volumes and corequisite variants remain distinct |
| NLS BARD | Blocked/failed | Official overview confirms a password-free metadata API, separate from reading eligibility | Documentation host still returned 403. Wait for access recovery or an official alternate contract; signing up for a reader account does not fix this |
| NYC ACRIS | Blocked/failed | Official non-personal Document Control Codes catalog and CSV export identified (`7isb-wh4c`) | Robots policy returned 503, so export not fetched. Retry after recovery. No personal owner/deed-party records collected |
| RePEc | Blocked/failed | Reviewed public metadata/archive instructions and API terms | Courtesy API requires approval and explicitly has no search function. OAI policy 502; rsync policy returned HTML rather than robots. No target requests or website scraping. A permitted metadata harvest is needed for local search; commercial-use permission remains separate |
| OpenCity India | Blocked/failed | Existing provider terms and robots findings retained | Terms prohibit automated retrieval/indexing and robots disallow `/api/`. Needs provider clarification/permission for machine metadata use; no outreach sent |
| NCBI Bookshelf | Blocked/failed | Reviewed the documented E-utilities metadata route independently of the reader | Robots disallowed the proposed search URL; no ESearch request sent. Reader challenge not bypassed |
| SWAYAM | Excluded by owner | Removed from active connector counts; probe rejects this source before network access | Historical record/evidence retained; no query or activation |

The remaining failures are provider policy/access or service issues, not a requirement that every visitor can read the book. Neither owner approval nor a working public webpage is treated as permission to bypass provider restrictions.

## Verification and preserved failures

- 50 current passing examples in the five source-specific JSONL files. Thoth queries verify publisher identity and title relevance; local catalogs distinguish title queries from upstream keyword search.
- Sugamya returned no result table for two full-title strings. Shorter relevant keywords succeeded; both failed requests remain saved.
- OpenStax direct subject reload produced an empty app shell. Normal public-link navigation plus a wait for rendered book cards succeeds; failed browser observations remain saved.
- Project Madurai's first 558 KB catalog exceeded the documentation sampler’s 512 KB cap. A bounded metadata-only capture completed; the parser handles the published omitted table-cell close and retains malformed format links without repairing/fetching them.
- 267 research tests pass, including publisher mismatch, changed/empty/challenge result shapes, Unicode catalog lookup, edition preservation, browser-output hash rejection and SWAYAM exclusion. Capture → index → audit and registry validation pass; missing/mismatched evidence hashes remain errors.

[Current per-connector status](registry/connector-status.csv) · [Owner scope](registry/analysis/external/metadata-link-owner-scope-20261106.json) · [Metadata evidence](registry/runs/metadata-link-query-seeds-20261106/) · [Documentation/access checks](registry/runs/metadata-link-fixes-20261106a/)
