# REST and MCP contract

Proposed API version: `v1`, namespace `/api/catalog/v1`. These are design contracts, not existing endpoints. Implement OpenAPI 3.1 and JSON Schema validation in story C1 before the service endpoints. Existing `/api/v2/books/*` contracts remain behind a compatibility layer.

## Operations

| Method / path | Behavior | Audience |
| --- | --- | --- |
| `GET /libraries?country=IN&cursor=...` | Cursor-paged directory, stable IDs and capability/fidelity summary; no upstream catalog calls | Internal, later public |
| `GET /libraries/{libraryId}/capabilities` | Supported fields, sorts, filters, page sizes, connection choices, policy/freshness limits | Internal, later public |
| `POST /search` | One library and one explicit search profile; bounded native page response | Internal, later public |
| `POST /records/resolve` | Resolve an opaque scoped record reference; identity, membership and availability where supported | Internal, later public |
| `GET /libraries/{libraryId}/health` | Last observation, age, operation health and qualification; performs no live check | Internal, later public |
| `POST /audit-runs` | Enqueue a frozen target set/profile; return 202 plus run ID; requires Idempotency-Key | Operator only |
| `GET /audit-runs/{runId}` | Run progress, attempts, per-library status and budgets | Operator only |
| `GET /audit-runs/{runId}/report?format=json\|csv\|html` | Authorized redacted report/export; large downloads paginated/sharded | Operator only; explicit published subset later |
| `POST /audit-runs/{runId}/cancel` | Stop scheduling, cancel safely, checkpoint completed evidence | Operator only |

No arbitrary upstream URLs, global unbounded search, raw cookie injection or public operation that launches a full-country audit. Future multi-library search must specify a bounded target list and account for every underlying request; it is not implicit in v1.

## Search request

Illustrative shape only; query and library ID are not a new successful test:

```json
{
  "libraryId": "egranthalaya:aps-aatsftp",
  "connectionId": "primary",
  "query": "Wings of Fire",
  "field": "keyword",
  "filters": {},
  "locale": "en",
  "sort": "website_default",
  "pageSize": "website_default",
  "cursor": null,
  "semantics": "website_native",
  "freshness": "live"
}
```

`connectionId` is resolved to a stable allowed route; omitted means the documented preferred route, echoed back. An alternate route must be explicitly identified. Capabilities enumerate accepted field/filter/locale values; `UNSUPPORTED_PROFILE` is safer than a silent fallback. Query limits use Unicode/encoding-aware validation and return an error instead of clipping bytes. Empty query handling matches documented source behavior but cannot fill the initial relevant-book target by itself.

`freshness: live` bypasses service caches and requests an actual source observation; compatible concurrent live callers may coalesce into the same in-flight source request. It cannot promise bypass of the provider's own CDN/index caches. `freshness: cached_ok` respects a capability-defined max age and exposes age/hit state. Externally requested live work still obeys source and consumer budgets; it is not an unlimited force-refresh switch.

## Search response

Define strict schemas for:

- `requestId`, `schemaVersion`, `libraryId`, resolved `connectionId`, adapter/config versions.
- `requestedProfile` and `effectiveProfile`, including query, field, filters, locale, sort and native page size. All transformations carry an evidence-backed reason.
- `fidelity`: `website_equivalent`, `unverified` or `alternate_not_equivalent`, plus `verificationMethod: html_response|site_json_contract|equivalent_export`, recipe version and verification time. This is protocol/data verification, not browser display validation.
- `records[]`: opaque `recordRef`, `nativeId` when present, `identityKind: native|fingerprint|query_replay`, native rank/page, original title and normalized display title, authors, ISBNs, edition/year/language/material type, safe source link and link kind (`record|search|catalog`), membership state and observation times. Missing values remain null/absent, never invented.
- `total`: value or null, relation `exact|estimated|unknown`, scope `native_query` and source observation time. It does not equal inspected/accepted/distinct books.
- `page`: native size/index if known, returned rows, `hasMore: true|false|null`, opaque `nextCursor`, `complete` and optional partial reason. Unknown next-page support is not an exhausted catalog.
- `freshness`: `observedAt`, `servedAt`, `cacheAgeMs`, `cacheStatus: miss|hit|coalesced|revalidated`, `sourceContacted`, optional non-sensitive provider cache/index timestamp. A 304 may refresh observation only when source validators and identical scope support it; retain original body capture date.
- `timing`: queue wait, upstream time, parse time, total time; `usage`: source requests/bytes. Internally include detailed evidence refs; public output contains only approved attribution and redacted provenance.

The native page preserves all returned records/order, even if some are irrelevant/non-books or ownership is not yet proven. `membership: unconfirmed` cannot qualify a book. The evaluator supplies accepted/rejected records separately in audit reports; it never edits the native page to make parity appear successful.

Healthy zero results return 200 with records empty and a recognized native zero. Upstream truncation/timeouts after some valid rows return a documented partial response with `complete:false`, preserving evidence; never a successful complete page. No stale results under `freshness:live` and no HTTP 200 challenge page interpreted as an empty catalog.

## Errors and continuation

| HTTP | Code examples | Meaning |
| --- | --- | --- |
| 400 | `INVALID_QUERY`, `INVALID_CURSOR` | Invalid profile/input or tampered cursor |
| 401/403 | `API_UNAUTHORIZED`, `API_SCOPE_DENIED` | Caller access to our service denied |
| 404 | `LIBRARY_NOT_FOUND`, `RECORD_NOT_FOUND` | Unknown local identity or positively confirmed record absence |
| 409 | `CONFIG_CHANGED`, `IDEMPOTENCY_CONFLICT` | Search recipe changed or idempotency key reused with another request |
| 410 | `CURSOR_EXPIRED` | Anonymous session/continuation expired; restart explicitly |
| 422 | `UNSUPPORTED_PROFILE`, `EQUIVALENCE_UNPROVEN` | Method cannot fulfill requested semantics |
| 429 | `CLIENT_QUOTA`, `PROVIDER_COOLDOWN` | Work not admitted; return Retry-After where known |
| 502 | `UPSTREAM_CHANGED`, `SCOPE_MISMATCH`, `INVALID_SOURCE_RESPONSE` | Unexpected source response; not zero results |
| 503 | `UPSTREAM_UNAVAILABLE`, `SOURCE_ACCESS_BLOCKED`, `QUEUE_FULL` | Source unavailable/refused or capacity exhausted |
| 504 | `UPSTREAM_TIMEOUT` | Deadline expired; unresolved work remains unknown |

Errors include request ID, safe message, retryability, retry-after and source/library identity. Keep the original HTTP status and diagnosis in internal evidence without returning session data or raw error bodies. Confirmed absence requires the provider's recognized scoped response; a failed fetch is never a 404 absence claim.

Bind cursors to effective profile and resolved connection/version. Clients cannot change filters between pages. Check replay loops, duplicate pages, dropped/changed library scope and out-of-order continuation. Authentication keys and cursor-signing secrets stay server-side; use key IDs/rotation without logging values.

## Public API and MCP rollout

Expose capabilities, directory, native search, resolve and last health first. Use versioned response schemas, documented attribution, key-based client identity, scoped quotas, body/response limits, source budget admission, deprecation policy and a versioned changelog. Use environment-managed key hashes/config initially; no new reader-account system. Rate-limit by client and provider, not just IP. Unknown API consumers cannot invoke operator audit/retry/admin functions.

Provider eligibility is a descriptor field with separate automated-access and metadata-redistribution decisions. A reachable endpoint is not proof that unrestricted public redistribution is allowed. For ineligible connectors, return a clear unsupported state rather than routing clients through our credentials.

Later MCP tools: `list_libraries`, `get_library_capabilities`, `search_library`, `get_library_record`, `get_library_health`. Tool schemas mirror OpenAPI; responses include source links, observation time, continuation and fidelity limits. MCP calls use the same authentication, quotas and trace correlation. No new scraping logic or automatic follow-up fan-out; an agent must request additional pages explicitly within budgets. Catalog text is untrusted tool data, never instructions.

Version the API schema independently from adapters. Additive optional response fields are backward compatible; changed query semantics, removed fields or identity changes require a new API/profile version. Run contract tests across CLI, REST, app compatibility layer and MCP before promotion.
