# Technical recovery H — 6 November 2026

Research-only continuation of the fixed original44. The baseline is commit8cbb45d:88 Working,45 Blocked/failed,0 Still checking;22/44 Working. No production source changes.

## Recovered searches

- **IndCat:** ten supported anonymous SRU/CQL title searches return relevant native bibliographic records. The exact `/robots.txt` response is an empty SRU virtual-database description, not an exclusion or challenge; the operator explicitly documents general no-auth API use. A narrowly reviewed response hash corrects the earlier policy misclassification; real restrictions and changed/challenge responses still stop requests. A second fix accepts a unique agency-qualified MARC035 identity when001/003 are absent and rejects conflicting IDs. The failed Organic chemistry parser output remains saved. An empty-control query exposed unrelated provider results; the adapter now requires every literal query token in the returned title. A filtered-empty page does not prove catalog-wide absence. Distinct page2 and invalid-index diagnostic controls are saved. This proves bounded bibliographic search, not free full-book access.
- **Abhilekh Patal / NAI reference tools:** the operator's public reference page contains78 unambiguous finding-aid/reference-tool records. Ten title-token queries pass. Nine missing/conflicting link mappings are excluded rather than repaired by guessing. Current targets, legacy handles and RT identifiers remain distinct. This is a local search over the published reference-tool list; the main archival-file catalog and reader access remain blocked. No request was sent to the restricted portal or linked PDFs.

## Blocker investigation

- **FDIC Money Smart:** official documentation points to a separate catalog service. Its policy endpoint returned503, so no catalog/product query was sent. Wait for recovery; next timed check no earlier than16:00UTC without a new service signal.
- **LINCS and CERT-In:** API/RSS documentation searches did not establish a supported new interface. Unrelated third-party feeds, staging sites and host switching are not adopted as alternatives.
- **Tamil Nadu land records:** discovery found leads for a separate Survey and Settlement map service. These are leads pending primary policy/interface verification; no personal-owner or parcel-detail queries were sent.

## Evidence and continuation

Current counts and per-connector scopes are generated in [connector-status.csv](registry/connector-status.csv). Exact current and failed requests, policy review, parsed metadata and native IDs are under [run H](registry/runs/technical-recovery-20261106h/) and registry/examples. The original documentation collector and reporter remain stopped. The44-item recovery goal remains open until every retained connector works or the owner accepts the remainder.
