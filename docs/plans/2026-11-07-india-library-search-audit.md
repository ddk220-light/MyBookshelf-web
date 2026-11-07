# India library search audit: 20 books per library

Status: proposed for owner review. This change creates the plan and a repository inventory only. The audit, connector implementation and recurring runs have not started.

## Goal and measure

For every India library in MyBookshelf, find **20 distinct books through its actual public catalog website**. Record the exact searches, the books returned, the library ownership evidence, and every unsuccessful attempt. Reusing a book across different libraries is fine. If a starting book is absent, try other books relevant to that library.

A library passes when all 20 books are reproducible through its website with the recorded query, search field and library filters. A connector response alone does not establish this. Also test the same searches through MyBookshelf where an inline catalog search exists, and report discrepancies separately.

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

## What to reuse and what to build

Existing code already supplies the directory, library IDs, catalog adapters and a library-specific book-search service:

- `server/services/directory.js`: canonical app directory and alternate routes.
- `server/public-v2/catalogBooks.js`: library-scoped book search and resolution.
- `server/public-v2/router.js`: `/api/v2/books/search` route and contract parsing.
- `server/services/providers/`: e-Granthalaya, IndCat, Koha, LIBMAN, VuFind and other adapters.
- Existing captured fixtures: useful parser regression inputs, not current live proof.

Important limitations found during planning: e-Granthalaya's `parseCatalogSearch`, IndCat's `parseIndcatSearch` and expanded Koha's `parseExpandedKohaCatalogSearch` cap returned results at ten. Some adapters do not expose native pagination or total counts. `searchLibraryBook` is a bounded check for one known book, not a suitable 20-book audit runner.

Build a **local browser-backed audit connector**, reusing trusted parsing and identity logic. Prefer a CLI/module interface; an optional local HTTP wrapper may expose the same operations if useful. No new public production API or hosted datastore is needed.

Proposed operations:

```text
openCatalog(libraryId) -> actual site, selected member, supported form fields
search(libraryId, query, field, filters, page) -> native records, totals, next page
openBook(libraryId, recordId) -> bibliographic data, library/holding evidence
verifyWebsite(attemptId) -> rendered results, scope confirmation, evidence
checkMyBookshelf(attemptId) -> app results or an explicit unsupported/error state
```

Each catalog-family adapter must preserve native library scope, field semantics, native IDs and page tokens. Configured library IDs are the entry point; the wrapper must not become an arbitrary URL fetch service.

### Website equivalence is mandatory

1. Open the real catalog in Playwright, select the actual library/member, enter the query and submit the visible form. Inspect the actual permitted form/network flow.
2. Drive browser interaction for JavaScript-only sites and stateful forms. Keep anonymous sessions, CSRF fields and viewstate in memory. Do not invent undocumented backend calls or use privileged APIs.
3. A direct HTTP implementation may reproduce the site's public requests once the browser establishes equivalence. Use the same query, scope, field, sort, page size and pagination. If policies or results differ, keep browser execution or record a blocker.
4. **For every library, every counted book must appear in an actual rendered search result or the record page reached from that query.** Capture each successful query/page's DOM evidence; open each counted book and verify identity and library membership. The 20 accepted books cannot be certified by a sample from another member of the network.
5. Compare returned native IDs and titles on the same pages close in time. Explain sort/index changes instead of requiring byte-identical HTML or forcing an exact global rank. Missing records, ignored filters or connector-only results fail equivalence and trigger investigation.
6. Capture at least one readable search screenshot per library, and screenshots for mismatches or unexpected failures. Store the page/request evidence supporting all 20 findings. Share one capture across findings when it actually contains those findings.
7. Check the same query in MyBookshelf's library-specific search, through the API used by its UI and a browser journey per library. Tag app ranking differences, truncation and unsupported inline search. Global Open Library/Google Books discovery is not evidence that the selected library holds a book.

## Search procedure for each library

1. **Confirm identity and access.** Follow the official catalog link, verify institution/member code, note catalog language, supported search fields and material filters. Check applicable automation rules and identify redirects or stale links. Distinguish a catalog landing page from an actual search result.
2. **Try common starting books.** Use a small shared seed set, for example *Wings of Fire* (A. P. J. Abdul Kalam), *The Discovery of India* (Jawaharlal Nehru), *Godan* (Premchand) and *Malgudi Days* (R. K. Narayan). They are starting probes, not titles every library must own. Include an author/subject query to test discovery rather than exact title lookup alone.
3. **Adapt to the library.** Technical colleges: programming, mathematics, mechanics; medical libraries: anatomy and public health; law libraries: constitutional and criminal law; schools: children's fiction and textbooks. Use visible catalog subjects, actual authors and local-script title variants to choose subsequent searches. Record the literal term and native field; never silently substitute a query.
4. **Follow real pagination.** Gather relevant book candidates until 20 distinct books are verified. One successful query may supply several books. Use additional terms whenever initial terms yield too few, are irrelevant, or repeatedly return the same books. Empty/wildcard/all-catalog searches do not substitute for relevant searches.
5. **Open and verify candidates.** Save title, author where present, native record ID, ISBN if present, edition/year/language/material type, source link and membership evidence. In union catalogs, an institution query parameter alone is insufficient: require a verified member filter and/or explicit matching institution/branch holdings. A different member's holding cannot count.
6. **Deduplicate honestly.** Repeated pages, copies, repeated native IDs and duplicate ISBN records do not increase the count. Do not fill 20 with editions of the same title. Preserve edition IDs, group demonstrably identical works within a library, and review ambiguous duplicate identities instead of guessing. Reuse across different libraries is allowed with separate ownership proof. Journals, articles, theses and web links do not fill a book target; monographs and catalogued ebooks may count with their format shown.
7. **Record unsuccessful searches too.** Separate a healthy zero-result page, irrelevant results, wrong-library results, parser failures, timeouts, access refusals and broken detail pages. Record page totals, rows inspected and valid distinct books independently. A displayed total of 5,000 does not mean 5,000 books were verified.
8. **Check empty-result handling.** Use one clearly nonexistent control term per catalog implementation/variant, and per library when a suspicious result suggests it ignored the query. This is a diagnostic, not a book-finding attempt.
9. **Finish or investigate.** Stop collection for a library at 20 accepted books. If fewer are found, record the exact shortfall and continue adaptive research in later batches. A work-budget checkpoint is not a terminal failure. If the site only lists a small collection, document the inspected limits and remaining gap; never invent books or infer whole-catalog absence from unsuccessful terms.

## Execution phases and acceptance

| Phase | Work | Exit condition |
| --- | --- | --- |
| 1. Freeze inventory | Export merged India entries, routes/aliases, platform/member IDs, state/city and omitted-row reconciliation | Every baseline directory ID has one report row; potential duplicates and unresolved omissions are explicit |
| 2. Build browser audit runner | Browser actions, native request adapters, library attribution, pagination, attempt/evidence schema, locks and resumption | Positive, empty, wrong-member, duplicate, stale-session and partial-result tests pass; no fixture can count as a live result |
| 3. Representative pilot | Start with about 30 libraries spanning all 11 families, shared branches, large/small catalogs, regional scripts, website-only and slow sites; expand if variants are uncovered | Demonstrate full 20-book evidence on working variants, document actual blockers, validate browser/API parity and measure request/time/storage cost |
| 4. Full-directory pass | Process every library using proven adapters; investigate new layouts immediately; keep all attempts | Every library is assessed or has an explicit pending/blocker reason; verified count is separate from assessed count |
| 5. Recovery pass | Fix parsers, pagination, stale official links and incorrect scope; vary meaningful terms; retry recoverable outages at the right time | Each unresolved case has fresh relevant evidence and a concrete next action; unresolved libraries stay visible |
| 6. Final quality review | Reconcile 20-book rows to raw browser evidence; validate membership and deduplication; review all exceptions and a stratified sample of passes | Publish complete reports; no claim that all passed unless every in-scope library has 20 verified books |

Pilot is an engineering validation step, not permission to substitute 30 libraries for the full audit. Bring back its concrete results and measured throughput before committing to a completion date or increasing traffic.

### Pacing and workload

- Prioritize the e-Granthalaya pilot early because it represents about 75% of entries, while testing every other family before scaling. A broken shared adapter can invalidate thousands of apparent successes.
- Use one in-flight request/browser navigation per shared origin initially, at least a 3-second gap between requests unless provider guidance requires longer, and a small initial pool of three independent origins. Count actual search/detail network traffic, not just logical library jobs. Honor stricter published limits and `Retry-After`.
- The 62 e-Granthalaya clusters are not 62 independent rate-limit lanes: they share `eg4.nic.in`. Aggregate pacing across browser work, direct requests and app checks that hit the same upstream. Keep browser assets cached within normal sessions.
- Reuse a shared search/detail capture only when the same response explicitly proves each credited member's ownership. Never copy one library's success status to all network members. Per-library website verification remains mandatory.
- Queue transient retries instead of sleeping inside workers; open a shared-host circuit breaker on repeated errors. Verify lock ownership, process command/health and checkpoint freshness before resuming.
- Append evidence after each completed attempt; update summaries/checkpoint every ten libraries or fifteen minutes. Resume by stable attempt IDs without duplicating findings. Retain prior failed outcomes and link subsequent fixes to them.
- This is a multi-day or potentially multi-week audit. The baseline has 134,060 book findings before search attempts, browser checks and retries. The pilot must measure cost per library and the shared-host bottleneck; do not promise a one-day scan or multiply throughput by 6,703 independent hosts.

## Failure investigation

| Observed cause | Response |
| --- | --- |
| Website works; connector fails | Reproduce the same request in the browser, fix parser/request/pagination/scope, retain the failed evidence and rerun affected variant |
| Website works; MyBookshelf fails | Mark app integration failure separately; record the exact native and app queries/results; propose a scoped fix |
| HTTP 429 or temporary 5xx/timeout | Honor Retry-After; default retry windows of 15 minutes, 1 hour and 24 hours when none is specified; stop the shared-host lane as appropriate |
| DNS/TLS/retired URL | Verify official current catalog links and retry only a documented replacement; retain TLS verification |
| CAPTCHA, WAF refusal, login wall or prohibition | Stop that access path; classify accurately; use a documented permitted public route only if available; request owner help only for an actionable permission/account need |
| No relevant books for initial terms | Try catalog/language/domain-specific terms and inspect visible subject/title suggestions; do not call the catalog broken |
| Books returned, but no proof they belong to this library | Inspect member filters and holdings; use an official member-specific catalog if available; leave unproven records out of the 20 |
| 1–19 books after investigation | Report partial success and remaining number, with search coverage and next action; do not pad with copies or change the target |
| Zero books with a working search | Report “No books found in tested searches,” not “library has no books” or a transport failure |

No account creation, paid service, outreach, CAPTCHA/WAF bypass, automated login or full-book downloads is included. Only public bibliographic/holding evidence is collected; patron/personal-owner data, cookies and session secrets are excluded from saved artifacts.

## Deliverables and report fields

Store ordinary Git-tracked JSON and append-only JSONL with generated CSV and a static filterable HTML report. No SQL, Redis or hosted database. Shard by catalog/region as needed; pilot measurement determines a sustainable evidence layout. Redact session/CSRF values before persistence, retain evidence hashes and capture dates, and cap response sizes.

| Artifact | Contents |
| --- | --- |
| `inventory.json` | Frozen library IDs, names, location, provider/cluster/member codes, official sites, aliases/alternates and inventory revision |
| `inventory-reconciliation.jsonl` | Every omitted/duplicate/demo/superseded entry and its mapping or unresolved reason |
| `attempts.jsonl` | Unique attempt ID, library, query/field/filters/language/page, method/request shape, timestamps, duration, HTTP and website outcomes, reported total, inspected count, accepted count, failure cause, evidence refs, retry/next action |
| `books.jsonl` | Library ID, native record/edition/work identity, title, author, ISBN, format/language/year, matched queries, catalog link, membership and availability evidence, browser confirmation, acceptance/deduplication rationale |
| `library-status.json` / `.csv` | One row per library: target 20, verified count, shortfall, status, terms tried/succeeded/empty/failed, site result, MyBookshelf result, blocker, last check and next action |
| `books.csv`, `searches.csv`, `failures.csv` | Flat exports of every accepted book and every attempted search/error; joinable by library/attempt IDs |
| `report.html` and summary | Search/filter by library, state, provider, result and reason; expand a library to its 20 books and full query history, with evidence links |

The human summary uses plain statuses: **20 verified**, **1–19 found**, **No books found**, **Blocked/failed**, **Not checked/checking**. These are mutually exclusive at library level: if 7 books are verified before a block, the library is “1–19 found” with a blocker reason, not counted twice. Preserve failed attempts even after eventual success. Website and MyBookshelf outcomes have separate columns so a working library is never blamed for our connector bug.

Example report layout (placeholders, not findings):

| Library | Website status | Verified books / 20 | Terms that worked | Empty/error terms | MyBookshelf result | Reason / next action |
| --- | --- | --- | --- | --- | --- | --- |
| Library name | 20 verified / partial / blocked | n/20 | Linked attempt list | Linked attempt list | Matches / differs / unsupported / not tested | Evidence and action |

Summaries show the total libraries in each status, books verified, remaining library/book shortfall, newly fixed libraries and blockers by cause. “Assessed” and “passed the 20-book target” are distinct percentages. Publish progress after checkpoints; any future reporting schedule must be deliberately enabled after plan review. Existing paused research tasks stay paused.

## Verification and completion rules

- Recompute the directory count and input hashes; report intentional denominator changes. Every baseline ID remains accounted for even if later deduplicated, retired or inaccessible.
- Validate every accepted record against a real search attempt, native ID, selected library evidence, rendered website evidence and matching stored hashes. Missing evidence fails validation.
- Exercise parser variants, pagination overlaps, wrong-member records, login/error pages returned as HTTP 200, changed query/filter state, duplicate works, multilingual terms and interrupted append-only writes.
- Use current live observations for this audit. Keep fixture/historical claims clearly separate; never manufacture a current check timestamp from a previous capture.
- Treat provider changes between browser/API requests as a retry/investigation case, not permission to substitute a different query or library.
- A final report can cover every library while honestly showing unresolved gaps. **All-libraries assessment complete** is not **all libraries passed**. All-passed requires 20 accepted books for every in-scope library; an unavailable catalog remains failed/blocked until repaired or the owner explicitly changes scope.
- Planning and audit work do not activate, remove or deploy libraries. Any later production fixes follow their own scoped review and release verification.

## First implementation batch after review

1. Freeze/reconcile the 6,703-entry inventory and publish the per-library tracker.
2. Implement the runner/evidence contract and website-equivalent e-Granthalaya, IndCat and Koha paths, including real native pagination where exposed.
3. Demonstrate 20 distinct books with correct library attribution in the browser, then cover the remaining catalog families in the pilot.
4. Present the pilot report, actual blockers and throughput estimate; continue the full audit from durable checkpoints when the pilot acceptance checks pass. Escalate only a material change to the approved scope or an actionable access requirement.
