# Free-content source operations

All flags default off. No hosted Redis service or production deployment has
been created by this implementation. Gutenberg and Open Textbook Library use
bundled metadata and require no database. Live paper sources need the shared
Redis REST URL/token and a strong random `CONTENT_CURSOR_SECRET` (at least 32
characters), plus an explicit daily/minute budget for each enabled source.
The build's `VITE_CONTENT_DISCOVERY_ENABLED` controls the Search scopes.

| Source | Enabled flag | Budget variables | Enforced constraints |
| --- | --- | --- | --- |
| Europe PMC | `CONTENT_EUROPEPMC_ENABLED` | `CONTENT_EUROPEPMC_DAILY_LIMIT`, `CONTENT_EUROPEPMC_PER_MINUTE` | Shared daily/minute caps, at most two active requests |
| DOAJ | `CONTENT_DOAJ_ENABLED` | `CONTENT_DOAJ_DAILY_LIMIT`, `CONTENT_DOAJ_PER_MINUTE` | At least 500 ms between dispatches across instances |
| arXiv | `CONTENT_ARXIV_ENABLED` | `CONTENT_ARXIV_DAILY_LIMIT`, `CONTENT_ARXIV_PER_MINUTE` | At least 3 seconds between dispatches; one active request |
| Wide paper search | `CONTENT_OPENALEX_ENABLED` | `CONTENT_OPENALEX_DAILY_LIMIT`, `CONTENT_OPENALEX_PER_MINUTE` | Maximum 500 ordinary requests/day; verifies current free allowance, $0.001 search pricing and zero prepaid funds before dispatch |

Other source daily budgets allow 1–100,000, minute budgets 1–300; these are
configuration bounds, not recommended traffic allowances. Choose lower team
limits deliberately. OpenAlex also needs the server-only `OPENALEX_API_KEY`.
Its rate-limit endpoint is checked before each uncached request; unknown pricing,
a paid allowance/prepaid balance, missing metadata or exhausted free funds block
dispatch. Local limits are conservative; other uses of the same key still draw
on the provider's allowance. No paid usage is enabled by this code.

All controlled machines that dispatch arXiv requests, including previews and
production, must use the **same shared coordinator and namespace**. Separate
stores would defeat its aggregate pacing rule. Never use an in-memory store
for hosted live requests. Store failures disable live dispatch; local catalogs
remain independent. Provider 429 cooldowns are shared. Cached pages and records
can still be read while a new request would be queued/limited.

The planner selects at most three live providers. Biomedical terms prefer
Europe PMC; general queries prefer the broad source and arXiv; DOAJ supplies
OA journal coverage. Recognized arXiv identifiers select arXiv. Sources not
chosen are explicit and can be searched independently from the source sheet.
Language context is only supported by the broad adapter today; other paper
sources report unsupported rather than silently ignoring it.

Each provider stage has a 2.5-second deadline; Redis REST commands have a
400-ms timeout. Responses and cache values are bounded. Source progress uses
optional NDJSON on the existing search route; a final committed page or explicit
error is required. Results appear after the page commits, preserving stable
page size and shared cursors. The source sheet can retry one failed source in
that session. An interrupted stream never becomes a successful empty response.

Shared sessions retain each source's cursor and excess records. Browser cursors
contain only a signed query/context/policy binding and shared page reference,
expire after 15 minutes, and replay without repeating provider requests. Versions
and translations retain source-native keys. Exact source-key repeats are removed;
cross-index DOI matches remain distinct until a source proves version equivalence.
Live offset indexes can change between requests; no frozen global catalog or
global result total is promised. Source observations and query coverage stay visible.

Search metadata is cached by exact source record as well as page. Opening an
arXiv result therefore uses the shared record cache instead of immediately making
another paced request. Licences remain attached to locations; a related journal
DOI is an access-unknown reference, never a substitute free copy.

Refresh bundled catalogs before the 24-hour positive-evidence expiry. Commands
and provenance are in [the snapshot notes](../../../server/data/content/README.md).
Offline reimports retain original observation times. Check removals, schema,
shrink protection, source permissions, host-link samples, bundle inclusion and
regressions before enabling a refreshed catalog. Never manually advance timestamps.
