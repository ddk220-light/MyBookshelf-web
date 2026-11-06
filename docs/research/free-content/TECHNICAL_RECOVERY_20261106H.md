# Technical recovery H — 6 November 2026

Research-only continuation of the fixed original44. The baseline is commit8cbb45d:88 Working,45 Blocked/failed,0 Still checking;22/44 Working. No production source changes.

## Recovered searches

- **IndCat:** ten supported anonymous SRU/CQL title searches return relevant native bibliographic records. The exact `/robots.txt` response is an empty SRU virtual-database description, not an exclusion or challenge; the operator explicitly documents general no-auth API use. A narrowly reviewed response hash corrects the earlier policy misclassification; real restrictions and changed/challenge responses still stop requests. A second fix accepts a unique agency-qualified MARC035 identity when001/003 are absent and rejects conflicting IDs. The failed Organic chemistry parser output remains saved. An empty-control query exposed unrelated provider results; the adapter now requires every literal query token in the returned title. A filtered-empty page does not prove catalog-wide absence. Distinct page2 and invalid-index diagnostic controls are saved. This proves bounded bibliographic search, not free full-book access.
- **Abhilekh Patal / NAI reference tools:** the operator's public reference page contains78 unambiguous finding-aid/reference-tool records. Ten title-token queries pass. Nine missing/conflicting link mappings are excluded rather than repaired by guessing. Current targets, legacy handles and RT identifiers remain distinct. This is a local search over the published reference-tool list; the main archival-file catalog and reader access remain blocked. No request was sent to the restricted portal or linked PDFs.

- **CERT-In:** twelve title/language-label searches pass over44 public cyber-safety booklet links covering12 topic groups. The missing policy URL returns a reviewed soft404 page, not an exclusion or challenge. A narrow template check ignores only one decimal tracking value; actual directives and changed/challenge pages remain blocked. Unknown-term control returns0. No PDFs were fetched; advisory/vulnerability search is outside this scope.

- **NCBI Bookshelf:** ten supported Europe PMC title searches return native NBK book/chapter IDs. Current API fields and core records establish the indexed subset; MED/PMID and NBK identities remain distinct. Chapters retain their parent title without inventing parent IDs. This shares the existing Europe PMC index and is not an additional independent origin. Direct NCBI restrictions remain in force, and reader pages/full text were not fetched.

## Blocker investigation

- **FDIC Money Smart:** official documentation points to a separate catalog service. Its policy endpoint returned503, so no catalog/product query was sent. Wait for recovery; next timed check no earlier than16:00UTC without a new service signal.
- **LINCS:** API/RSS documentation searches did not establish a supported new interface. Unrelated third-party feeds, staging sites and host switching are not adopted as alternatives. CERT-In was subsequently recovered through its public metadata list after manual policy diagnosis.
- **Tamil Nadu land records:** the separate map-only Survey and Settlement service has policy503. No map/parcel/owner query was sent; wait until16:00UTC or a concrete recovery signal.
- **DOAB/OAPEN:** the officially documented Penn State export dataset pages are accessible, but their file routes return a traffic-control/Turnstile challenge. HTTP200 is not a metadata success. No files or signed-token alternatives were fetched after recognizing the challenge. OAPEN lists an October2026 snapshot; DOAB still lists May2024 with updates paused. A provider-permitted or owner-supplied export could unblock local metadata search.
- **NHM:** the exact published policy redirect timed out; no catalog request. **CMDA:** another policy503 after more than4hours backoff, with upstream connection timeout. **Let’s Read:** the response identifies a login-page app shell; no hidden API or login attempted.

## Evidence and continuation

Current counts and per-connector scopes are generated in [connector-status.csv](registry/connector-status.csv). Exact current and failed requests, policy review, parsed metadata and native IDs are under [run H](registry/runs/technical-recovery-20261106h/) and registry/examples. The original documentation collector and reporter remain stopped. The44-item recovery goal remains open until every retained connector works or the owner accepts the remainder.
