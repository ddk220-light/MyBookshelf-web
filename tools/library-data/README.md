# Local library evidence database

Offline analysis of the global app directory and existing India audit evidence.
No collector, account, hosting, app publication, public API or deployment is used.
All recurring research jobs stay paused. Original journals and bodies are untouched.

## Private review and staged app registry

After an existing import, prepare the versioned registry and summary caches:

```sh
npm run library:registry -- --node /path/to/node22
npm run library:registry:compare
npm run library:review
```

Open `http://127.0.0.1:4322` on the machine running the review. To use it on your
PC, run the tools alongside your downloaded SQLite file and pass `--db PATH`.
The server binds **only** to IPv4 loopback, checks Host/Origin, uses SQLite
read-only/query-only connections, and never contacts providers. No remote tunnel
or hosted dashboard is configured. `--port` changes only the local port.

The interface includes country/system/status filters, exact query/field filters,
original date ranges, library and book drill-downs, complete ordered query results,
observation history, link-check outcomes and evidence references. APIs use
`limit` (1–500, default 100) and `offset`; CSV downloads stream every matching row,
not just the visible page. The JSON API preserves exact values. Review CSVs prefix
formula-like text with an apostrophe to protect spreadsheet imports. Unknown
metadata stays unknown. Summary coverage/metadata metrics describe the whole
imported snapshot; `filteredSearches` describes the selected query/date filters.
Library-page metrics are all-time observations, not holdings counts.

Local read interfaces are `GET /api/summary`, `/api/libraries`, `/api/searches`,
`/api/results`, `/api/books`, `/api/observations`, `/api/checks`, `/api/links` and
`/api/failures`; library/search/book/event details accept an encoded ID path segment.
`GET /api/export/<dataset>.csv` uses identical filters. These are private review
interfaces, **not** additions to the production public API. Historical connection
configuration is returned only for an explicitly recorded matching fingerprint;
today's configuration is never attached retroactively to an old search.

Outputs under `current/registry/`:

- `library-registry.json`: complete private registry, all current routes and reasons.
- `eligible-library-proposal.json`: small future app input, approved connections only.
- `connection-versions.json`: immutable indexed configurations, including superseded versions.
- `connection-readiness.csv`: audit methods, statically inspected app methods/capabilities and gaps.
- `analysis-summary.json` / `.md`: country/system coverage, sample metrics and limitations.
- `registry-manifest.json`: artifact checksums and deterministic snapshot identity.

The unused server-side `library-registry.js` reader verifies artifact hashes,
route/alias uniqueness and eligibility consistency. It exposes an explicit safe
public projection without private configurations/evidence. It is **not imported by
the production directory or live search API**. The comparison command reads the
current directory/configuration and provider function names without invoking them.
Missing direct catalog-search methods do not prove a library cannot support some
other mode, such as ISBN lookup. Static methods do not prove live search success.
Catalog system/subtype and adapter family are separate for grouped academic and
community methods; exact native profiles and institution configuration are retained.

Schema version 2 is an additive migration. Connection versions are immutable and
captured before current pointers change. `indexed_at` is an index date, never an
observation date. Historical unknown versions remain unknown. Cache tables are
rebuildable; `prepare`, `import` and `enrich` refresh them under the same exclusive
import lease. Keep the SQLite file outside Git and the application bundle.

The registry's eventual app assessment must also include
`appImplementationFingerprint`, matching the statically inspected server search
implementation. An older success cannot authorize a changed API implementation.
Its `configurationFingerprint` must still match the actual tested connection.
The earlier configuration-only app eligibility export remains available for compatibility;
use the versioned **eligible-library-proposal** for staged integration. Currently
both proposals are empty because app-search proof has not been collected.

Live API upgrades, new app-path verification, production filtering, hosting,
R2 provisioning and recurring checks remain deferred. No raw files are deleted.

## Build and review

Requires Node 22 (directory inventory only) and Python 3.12+ with standard-library
SQLite. Run from the repository root:

```sh
python3 tools/library-data/library_data.py import --node /path/to/node22
python3 tools/library-data/library_data.py validate --full
python3 tools/library-data/library_data.py enrich
python3 tools/library-data/library_data.py query --country JP
python3 tools/library-data/library_data.py query --library egranthalaya:jnv2-jnvjogna --query 'Ignited Minds'
python3 -m unittest discover -s tools/library-data -p 'test_*.py'
```

Defaults: database `/workspace/library-data/library-data.sqlite`; review exports
`/workspace/library-data/current/`. Override with `--db`, `--out`, `--root`.
Query filters also include `--system` and `--since` (ISO observation date).
Query, validate and export open SQLite read-only. `enrich` writes only the derived
local database. Import has an exclusive advisory lease separate from collector
locks and commits one journal at a time. Do not run two import/enrich writers.
The SQLite file and large exports stay outside Git; source tools and small
validation/summary snapshots may be committed on protected research branches.

The importer follows every journal-index sealed/active segment, verifies sealed
hashes and all referenced body hashes (stored and decompressed for gzip), retains
only complete active lines and checks the previously imported prefix before
resuming. A partial tail prevents a complete validation. Event IDs deduplicate
copied events, with all source locations retained; conflicting event content is
an error. Unknown library IDs go to `unmapped-evidence.csv`, never name matching.
Every original corpus file, including opaque reports and failed experiments, is
listed in the archive manifest. Non-journal findings remain available in that
archive; they are not silently promoted to normalized search/app proof.

Existing authoritative event journals are normalized across the full audit,
revalidation, pilots, search triage, fifty-title batches and journalled experiments.
The complete current global directory seeds every country. USA/Japan/Canada/NZ
entries without matching saved journal evidence remain Not checked. Future saved
app assessments use the explicit contract below; no fresh searches are made.

## Tables and interpretation

`libraries`, `connections`, `aliases`, `checks`, `searches`, `query_results`,
`catalog_records`, `record_observations`, `book_decisions`, `link_checks`,
`events`, `event_locations`, `sources`, `evidence_refs`, `evidence_files`,
`evidence_objects`, `metadata_extractions`, `invalidations`, `unmapped_evidence`.
`schema.sql` initializes the original tables; `migrations.py` applies explicit
versioned additions. Future physical table changes require another migration.

CSV exports cover the latest library status, all checks, exact queries/profiles,
ALL returned candidates, distinct observed records, observation history, book
accept/reject decisions, failures, metadata extraction, link history/current
link state, mapping issues and per-library search/relevance metrics. JSON columns
preserve original arrays and arbitrary native fields. `query-quality.csv` groups
comparable fields; `relevance.csv` separates unassessed relevance. Repeated queries
are observations, not new libraries. `books.csv` is the latest observed metadata
per native identity, including unverified candidates; consult decisions/relevance
before calling a record a verified book. Copies and fingerprints never increment
`observed_native_records`. Sample sizes are not complete holdings or availability.

Metadata recovery reads only saved e-Granthalaya result spans, requires the exact
native ID AND matching title, and stores separate extraction rows with original
body hashes, version and analysis time. Original results, dates and JSON do not
change. Recovered author strings are kept as supplied, not guessed apart.
Edition statements are nullable verbatim strings, not inferred edition numbers.

`library_current` shows latest native assessment and last live success separately.
Empty single-title responses remain query outcomes; they do not declare a library
broken or absent. Historical invalidation events exclude an erroneous check from
current status without removing it. An interrupted assessment does not replace a
completed check. Dates are original observations, never import time.

App eligibility is deliberately separate. Only a live `app_search_assessment`
event with `relevantSpecificBook: true`, `correctLibraryScope: true`, a nonempty
`nativeRecordId`, `query`, evidence references and matching
`configurationFingerprint` can qualify. Its status must be the latest completed
app assessment for that route. Derive the fingerprint from the exact stored
connection configuration used at the check, never from today's configuration
retroactively. Native successes, lookup-only canaries, fixtures and saved replay
cannot qualify. No automatic age expiry is imposed; observation dates are shown.
`eligible-libraries.json` is a proposal only. No app/runtime filtering changes.

## Private archive preparation (no upload)

`archive-manifest.jsonl` maps EVERY original path to its stored SHA256, original
size/mtime, decompressed hash/size and immutable `sha256/<prefix>/<hash>` object
key. Only byte-identical files share an object. Multiple observations and gzip
variants retain their references and bytes. `summary.json` measures unique bytes,
object count and storage-only R2 price before allowances. Request rounding and
account-wide free allowances affect the actual cost; no service is provisioned.

Recommend private Cloudflare R2 Standard, with no public access or deletion
lifecycle. Future uploads use bounded S3-compatible object transfers, verify
uploaded content and retain all existing originals. Do not connect to Vercel.
A local restore/read-back rehearsal is available now:

```sh
python3 tools/library-data/library_data.py restore --sha256 STORED_HASH --destination /tmp/restored-object.gz
```

Restore verifies both source and destination bytes and refuses overwrites.
Cloud account/region decisions, credentials and uploads are deferred. Nothing
is deleted, moved or rewritten in Git history. Growing SQLite snapshots belong
in future private storage, never the application bundle.
