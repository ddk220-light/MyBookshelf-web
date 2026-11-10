# Library registry and private evidence review

Implemented as an offline, staged integration. The live search API and production
directory do not import this registry. Updating the app API to match the audited
native methods, live app verification and rollout remain separate work.

## Use locally

From the repository, using Node 22 and Python 3.12 (Linux/macOS or WSL):

```sh
npm run library:registry -- --node /path/to/node22
npm run library:registry:compare
npm run library:review
```

Open `http://127.0.0.1:4322` on that machine. The read-only interface is bound to
loopback; it is not a hosted site. Pass `--db /path/to/library-data.sqlite` to
review a downloaded database, after applying `library:registry` to prepare it.
Detailed command and API documentation is in [the tooling runbook](../../../tools/library-data/README.md).

The local database remains `/workspace/library-data/library-data.sqlite`.
Generated outputs are under `/workspace/library-data/current/registry/`.
Database binaries, the complete registry, large CSVs and private configurations
are excluded from the app bundle and Git checkpoint. No deployment is required.

## What the owner can review

- Coverage by country and catalog family, plus search outcomes and metadata completeness.
- Every library's latest completed native check, last native success, app-check status and eligibility reason.
- All primary/alternate routes, native method/subtype, current app function/capability inspection and configuration versions.
- Exact search terms, fields, native profiles, dates, counts, timings, errors and **all** returned candidates in original order.
- Native IDs, titles, author statements, edition statements, ISBNs, publishers, years, languages, formats and item URLs where supplied.
- Record history, last explicitly relevant search match, accepted/rejected book decisions, existing item-link observations and source hashes.

An observed record is not automatically a verified book. Copies and opaque
fingerprints remain distinct identity kinds. A relevant search match does not
prove borrowing availability, successful item navigation or live app integration.
Unknown metadata and historical configuration remain unknown; the tool never
substitutes current settings into an older observation. Configuration index dates
and metadata extraction dates are not fresh provider-check dates.

Global coverage and cached metadata summaries describe all imported history.
Filtered query totals follow the selected country/library/term/field/date filters.
Library metrics remain all-time samples. CSV downloads include every matching row;
JSON preserves exact strings while spreadsheet CSVs escape formula-like cells.

## App registry contract

`library-registry.json` is the complete private control file. The smaller
`eligible-library-proposal.json` is the future server-side input containing only
qualified routes. Neither is activated. `registry-manifest.json` provides artifact
hashes; the reader rejects corrupt files, duplicate identities and inconsistent
qualification. An empty eligible proposal is valid and must not automatically
clear the current app directory.

Each connection retains its adapter family, actual native subtype/profile where
known, member/cluster scope, supported fields, pagination description, complete
server configuration, configuration fingerprint and immutable version identity.
`appAdapter` contains static function/capability inspection and the server search
implementation fingerprint. It is not a live check. Route index labels and source
route identities are both preserved; no name matching joins libraries.

Eligibility requires the latest completed live app assessment for that route to
have explicit relevant-specific-record and library-scope proof, source evidence,
the tested query/native identity, a matching configuration fingerprint and a
matching app implementation fingerprint. A changed implementation must be checked
again. Native checks, replay, fixtures, generic handoffs and lookup-only canaries
cannot grant eligibility. No automatic check-expiry period is imposed.

The unused `server/services/library-registry.js` reader resolves canonical IDs and
aliases and provides an allowlisted public projection. It is exercised only by
offline tooling/tests in this checkpoint. `connection-readiness.csv` records
missing methods, unexposed title search and unverified alignment, not library
outages. A route lacking direct catalog search may still have another capability
such as ISBN lookup; no such capability is silently activated.

## Preservation and validation

Schema version 2 adds immutable connection versions, static runtime observations
and rebuildable review caches. Import/enrichment/preparation share an exclusive
advisory writer lease; local HTTP queries use read-only SQLite transactions.
Every original event, date, failed observation and raw evidence file is retained.
The complete pre-migration archive also remains available in private Drive.

Tests cover migrations, changed connections/implementations, later failures,
replay/interruption exclusion, exact filters, result order, copies/editions,
item-specific links, pagination, CSV reconciliation, read-only SQL, loopback
Host/Origin checks, safe rendering and server-side registry projections.
Full corpus validation checks stored/decompressed hashes and frozen audit totals.
All prior audit schedules remain paused; this tool performs no provider requests.

The [validated snapshot](registry-validation.json) records 39 Python checks, eight
registry/UI checks, 130 existing connector regressions, unchanged counts after a
repeat import, all 1,026 journals and the complete evidence-hash check. The
[offline comparison](registry-comparison.json) has no directory/configuration
differences. The [analysis summary](registry-summary.json) is a small, tracked
snapshot; the full database and review exports remain outside Git.
