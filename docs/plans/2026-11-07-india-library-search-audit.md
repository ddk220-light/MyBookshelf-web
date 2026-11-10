# India library search audit: 20 books per library

Status: revised for the owner’s HTTP-only direction. The [implementation design packet](../library-connectors/README.md) supersedes the earlier browser-control approach in this PR. No browser engine, rendered-page check or screenshot is required. The [internal implementation and bounded pilot](../library-connectors/IMPLEMENTATION_STATUS.md) now exist. The full inventory is prepared for testing; comprehensive collection has not started and schedules remain disabled.

## Goal and measure

For every India library in MyBookshelf, find **20 distinct books through its actual public catalog website**. Record the exact searches, the books returned, the library ownership evidence, and every unsuccessful attempt. Reusing a book across different libraries is fine. If a starting book is absent, try other books relevant to that library.

A library passes when 20 distinct books are supported by actual public website HTTP responses under the recorded query, field, filters and paging, with selected-library membership evidence and verified request/display semantics. The permanent connector reproduces the website’s normal public HTTP transaction without browser control. An unverified alternate API or export does not establish equivalence. Also compare the same library searches through MyBookshelf where supported, reporting app differences separately.

This is a bounded search-function audit, not a complete harvest of each library's holdings. A book appearing in the catalog does not necessarily mean it can currently be borrowed: preserve available, on loan, reference-only, catalog-only and unknown separately.

## Verified planning baseline

Derived from `getAllLibraries()` at main commit `8337f50a9d04eca3788b815c0a7ef0d6574388b5`, filtering `country === 'IN'`. The baseline is repository configuration, **not new live search verification**. See [the machine-readable inventory](../research/india-library-audit/planning-inventory.json).

| Catalog family | India directory entries |
| --- | ---: |
| e-Granthalaya | 5,036 |
| LIBMAN | 639 |
| IndCat | 407 |
| Koha | 383 |
| VuFind | 130 |
| Community discovery catalogs | 49 |
| Academic discovery catalogs | 36 |
| Other catalog websites | 19 |
| LIBSYS | 2 |
| Chamo | 1 |
| Visakhapatnam public catalog | 1 |
| **Total** | **6,703** |

These entries use 120 distinct configured primary catalog hosts. e-Granthalaya has 62 configured clusters; 41 India entries have alternate catalog connections. Those alternates are not extra libraries. Multiple branches are distinct audit targets only when the directory identifies them separately and ownership can be proved.

The app currently advertises inline title-search capability for 6,632 of these entries; 71 lack that configured capability. These are configuration counts, not proven successes or failures. Include all 6,703 in the website audit, and show website-only results separately from app integration results.

The raw `libraries.json` and `india-catalogs.json` merge gives only 5,730 India entries; `discovered-catalogs.json` adds 973. Use the application merge, including aliases, alternate connections and presentation reviews, rather than counting one input file.

There are also 365 omitted connection rows in `india-catalogs.json` and 14 in `discovered-catalogs.json`. Reconcile them against current entries and aliases. Do not add 379 to the library total: some can be duplicates, alternatives, demos or superseded candidates. Keep a reconciliation ledger so exclusions remain visible. Added real libraries expand the denominator explicitly.

At this baseline, the target is **134,060 library/book findings** if all 6,703 targets can be verified. It is not 134,060 unique books across India. No success count is inferred from historical flags such as `publicCatalogMethodValidated`.

## Implementation design

The [design packet](../library-connectors/README.md) defines the reusable connector core, REST API, eventual MCP tools, schemas, family adapters, scheduling, performance metrics and story-level delivery plan. It is the authoritative implementation proposal. This document preserves the India audit scope and inventory baseline.

The first four adapter families—e-Granthalaya, Koha, IndCat and LIBMAN—cover 6,465 configured entries. Pilot them early alongside representatives of the other families. Several existing adapters cap results at ten; the current app also reranks catalog results. The new native-results mode must preserve the website's request semantics, ordered native records, totals and pagination.

## Per-library procedure

1. Confirm the official site and exact institution/member/branch identity. Record the public form/JSON request recipe, defaults, permitted access and locale/encoding.
2. Try common starting titles such as *Wings of Fire*, *The Discovery of India*, *Godan* and *Malgudi Days*, recording actual author/field assumptions. These are seeds, not required holdings.
3. Adapt to institution, subject and language when those searches fail or repeat the same books. Follow native pagination. Record literal terms and any transformations the website itself performs.
4. Parse the real public HTML/JSON and verify native order, count and selected scope independently of the adapter's expected outputs. If client-side display behavior cannot be established through public code/docs, mark equivalence unproven; do not use browser control as a fallback.
5. Accept relevant books only with enough identity and library-membership evidence. Use sufficient search-result evidence directly; request detail/holdings only when needed, and exercise record resolution where supported. A parameter requesting a library does not by itself prove ownership.
6. Preserve native record/edition identity but do not fill the target with repeat pages, copies or known duplicate works. Ambiguous duplicates stay open. The same book can count for different libraries with separate proof.
7. Stop initial collection at 20 accepted books for that library. Fewer than 20 stays partial; zero searches do not imply the library has no books. Every failed/empty/irrelevant query is retained with cause and next action.
8. Save the useful terms and record checks as future health sentinels. Periodic health and fresh 20-book requalification remain separate measures.

A book in the catalog may be on loan, reference-only or have unknown current availability. Those remain distinct from searchability. Journals, articles, theses, links and copies do not fill the 20-book target; catalogued monographs/ebooks may count with format shown.

## Reports

| Deliverable | Contents |
| --- | --- |
| Library status JSON/CSV | One row per library: identity, verified books out of 20, last qualification, latest fresh health check, native fidelity, MyBookshelf outcome, blocker and next action |
| Search history JSONL/CSV | Every term/field/filter/page, exact safe request shape, source time, reported total, inspected/accepted count, empty/error outcome, timings and evidence refs |
| Books JSONL/CSV | Native identity, title, author, edition/language/format, matched searches, source links, membership/availability evidence and deduplication rationale |
| Failure report | Libraries affected, cause, attempted recovery, error/request examples, retry trigger and remaining shortfall |
| HTML report | Filter by library, country/region, family, status/reason; expand queries and books; compare runs and export |
| Evidence/checkpoints | Redacted source HTML/JSON, request recipe and parser versions, hashes, append-only events, frozen manifests and resumable cursors |

Library statuses: **20 verified**, **1–19 found**, **No books found**, **Blocked/failed**, **Not checked/checking**. A library with seven books and a subsequent timeout is partial with a blocker, not counted twice. Native website results and MyBookshelf results are separate so our connector bug is not labelled a library outage.

Totals always reconcile to the frozen manifest and individual evidence. “Assessed” and “passed with 20 books” are different measures. No catalog access, membership or complete coverage claim follows from configuration flags, historical fixtures or a completed run alone.

## Scale and operation

At baseline, full qualification targets 134,060 library/book findings. Shared origins dominate runtime; 62 e-Granthalaya clusters share one host. The design minimizes redundant requests and parallelizes independent origins within provider limits. It does not assume all 6,703 entries are independent servers.

Use the [pilot and backlog](../library-connectors/IMPLEMENTATION_PLAN.md) to establish throughput before dates or traffic increases. The [testing and operations design](../library-connectors/TESTING_AND_OPERATIONS.md) specifies separate offline regression, daily variant canaries, rolling weekly library health and monthly full requalification, all proposed and budget-dependent. Existing paused tasks remain paused.

Authoritative data uses versioned JSON, append-only JSONL and hashed redacted response files with CSV/HTML views. No initial SQL/Redis/hosted datastore requirement. No account creation, paid service, outreach, full-book downloads, personal-owner data or access-control bypass. Permanent public API/MCP exposure is a later delivery milestone with provider eligibility and consumer/source quotas.
