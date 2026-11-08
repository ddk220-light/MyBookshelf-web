# Library access classification — 2026-11-08

**Offline classification of all 6,703 frozen entries. No new provider requests, connector changes or audit restart.**

| Category | Libraries |
|---|---:|
| 1. Structured-access candidates | 632 |
| 2. Shared website connector candidates | 5,733 |
| 3. Individual connector work | 28 |
| 4. Deferred | 310 |

Categories describe the best known access route, not production readiness. Previously demonstrated results retain their source dates. No entry gains a new search pass from this classification.

| Primary system | Total | Structured | Shared website | Individual work | Deferred |
|---|---:|---:|---:|---:|---:|
| egranthalaya | 5036 | 0 | 5036 | 0 | 0 |
| libman | 639 | 0 | 639 | 0 | 0 |
| indcat | 407 | 407 | 0 | 0 | 0 |
| koha | 383 | 170 | 0 | 0 | 213 |
| vufind | 130 | 55 | 0 | 0 | 75 |
| community:rmc | 21 | 0 | 0 | 0 | 21 |
| community:pmb | 16 | 0 | 16 | 0 | 0 |
| individual | 12 | 0 | 0 | 12 | 0 |
| academic:srms | 10 | 0 | 10 | 0 | 0 |
| academic:easylib | 9 | 0 | 8 | 0 | 1 |
| community:surat | 5 | 0 | 5 | 0 | 0 |
| academic:autolib | 4 | 0 | 4 | 0 | 0 |
| academic:libaitech | 4 | 0 | 4 | 0 | 0 |
| slim | 4 | 0 | 0 | 4 | 0 |
| community:sindhi | 3 | 0 | 0 | 3 | 0 |
| libsys | 3 | 0 | 3 | 0 | 0 |
| academic:processcube | 2 | 0 | 2 | 0 | 0 |
| vmedulife | 2 | 0 | 2 | 0 | 0 |
| academic:bmu | 1 | 0 | 0 | 1 | 0 |
| academic:darshan | 1 | 0 | 0 | 1 | 0 |
| academic:iust | 1 | 0 | 0 | 1 | 0 |
| academic:librarika | 1 | 0 | 1 | 0 | 0 |
| academic:libsoft | 1 | 0 | 1 | 0 | 0 |
| academic:nios | 1 | 0 | 1 | 0 | 0 |
| academic:rps | 1 | 0 | 0 | 1 | 0 |
| chamo | 1 | 0 | 1 | 0 | 0 |
| community:nmmc | 1 | 0 | 0 | 1 | 0 |
| community:rmrl | 1 | 0 | 0 | 1 | 0 |
| community:santhom | 1 | 0 | 0 | 1 | 0 |
| community:shodhak | 1 | 0 | 0 | 1 | 0 |
| vpl | 1 | 0 | 0 | 1 | 0 |

## e-Granthalaya

The 5,036 primary entries share eg4.nic.in across 62 clusters. Existing member-scoped HTML search is a reusable method. NIC documents XML/JSON web services and registered-user catalog exports, but anonymous library-scoped search API access is not established. External-catalog importing and RFID APIs are not proof of public search access. Keep the structured upgrade lead open; do not build thousands of individual connectors.

## Decisions and limits

- Categories 1 and 2 are eligible for later verification and eventual initial release. Neither is automatically working.
- IndCat SRU needs per-institution holdings proof. VuFind API enablement varies. Koha has five saved structured probes; other installations remain candidates. Previously demonstrated native HTML results do not verify a different API.
- Libman has a shared website JSON method. Its advertised secured integration API is an upgrade lead, not verified anonymous catalog search.
- A blocked primary does not hide a candidate alternate. Category 4 requires every frozen route to have a saved restriction or access/transport failure. Standard protocol documentation alone does not establish a permitted alternative at that provider.
- Missing adapters, unknown material types and unchecked libraries are not source failures. Empty tested searches are not blockers.
- Historical robots restrictions and HTTP failures describe the tested route and observation date; they do not establish that the library is offline today.
- Subtypes with reusable existing implementations are category 2 even when their full twenty-book/app/link evidence is incomplete. Unsupported or unmapped methods stay category 3; shared software branding alone is not enough.
- The separate original audit gate, goals and paused schedules remain unchanged. Later execution needs a bounded pilot, not a blanket restart.

## Files

- [All libraries CSV](libraries.csv) · [JSONL](libraries.jsonl)
- [System totals](systems.csv) · [Summary](summary.json)
- [Deferred libraries](deferred.csv) · [All blocked routes, including libraries with alternatives](blocked-routes.csv)
- [System evidence and policy](systems.json) · [Saved query evidence index](evidence-index.json) · [Coverage audit](coverage-audit.json)

## Reproduce without network access

```sh
python tools/library-classification/classify.py build
python tools/library-classification/classify.py validate
python -m unittest discover -s tools/library-classification -p 'test_*.py'
```
