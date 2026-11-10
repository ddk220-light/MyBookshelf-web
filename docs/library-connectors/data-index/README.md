# Global library evidence index — implementation checkpoint

The next stage adds a versioned app-registry proposal and private local review
interface. See [registry/review implementation](REGISTRY.md). Production API
alignment and app verification are deferred; the current directory is unchanged.

Implemented 10 November 2026 on PR #188. No app sources, production deployment,
provider collection or recurring jobs were changed. No data was deleted.

The SQLite database is `/workspace/library-data/library-data.sqlite`. Reviewable
CSV/JSON exports and the archive manifest are `/workspace/library-data/current/`.
See [tooling and rebuild instructions](../../../tools/library-data/README.md).

| Imported data | Count |
|---|---:|
| Global libraries | 7,088 |
| Primary/alternate routes | 7,129 |
| Unique journal events | 1,400,309 |
| Query observations across all journalled runs | 260,651 |
| All returned candidate rows | 145,822 |
| Distinct observed catalog identities (including copies/fingerprints) | 135,314 |
| Metadata extractions from saved native result rows | 104,591 |
| Unmapped event library IDs | 0 |

Countries: India 6,703, USA 232, Canada 132, Japan 20, New Zealand 1.
Non-India entries without saved audit evidence remain Not checked. A directory
entry/capability, a fixture test or an old report summary alone is not a live pass.
Opaque non-journal historical artifacts remain archived with their original data.

The e-Granthalaya fifty-title subset independently reconciles to 5,036 libraries,
251,600 completed query outcomes and 104,586 returned candidates. Its 83 additional
interrupted observations are preserved but excluded from completed-query totals.
Other runs and repeated queries are retained without inflating library coverage.

Saved metadata extraction found author statements in 97,028 observations, edition
statements in 23,125, publishers in 101,146, publication years in 93,893 and languages
in 104,142. These overlap and are observation counts, not distinct books. Metadata
recovery requires exact native record ID/title matching and retains the source
body hash and a separate analysis date/version. Original results remain intact.

`libraries.csv` shows current native assessment, age, previous success and separate
app-check status/eligibility. `books.csv` has coalesced available metadata, native
identity, source references, item URLs and link-check outcome. `results.csv` retains
ALL candidates with the exact search query and rank, including irrelevant/unassessed
rows; book decisions and complete observation/link history are separate exports.
Search-quality and relevance CSVs avoid treating empty sampled titles as proof of
absence or sampled records as a complete catalog inventory.

The proposal currently contains **zero app-eligible libraries** because the saved
native audits lack the explicit live app-search/current-configuration proof
required by the approved rule. This does not mean native Working libraries have
failed; it means app eligibility remains unverified. Existing app publication was
not filtered or changed. The explicit future app-assessment import contract is in
the runbook; no fresh tests or reinterpretation of lookup-only canaries occurred.

All 282,878 original corpus files are indexed. Exact-byte deduplication yields
280,811 archive objects: 6,722,495,124 unique bytes from 6,794,638,769 source bytes,
saving 72,143,645 bytes without removing any original. The archive manifest
preserves each original path, stored/raw hashes, sizes and mtime. Private Cloudflare
R2 Standard is the recommended destination; no account/bucket/upload is created.
The cost estimate covers raw corpus objects and excludes the optional rebuildable
SQLite snapshot. Request rounding and account-wide allowances are explicit in
summary.json; no Vercel compute is involved.

Validation: 20 new data-index tests; 130 existing connector regressions; zero
SQLite integrity/FK errors; full stored/decompressed file hashes pass; repeated
import leaves observations unchanged; actual compressed-file restore bytes match.
The small adjacent JSON files capture reconciliation, full-hash validation,
idempotency and restore proof. Large database/exports stay outside Git. Archive
upload and public/production integration remain deferred.
