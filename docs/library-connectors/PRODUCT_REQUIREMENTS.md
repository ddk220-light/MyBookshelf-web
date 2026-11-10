# Product requirements

## Problem and users

Library catalogs change request formats, filters, sessions and markup. A connector may appear healthy while silently dropping pages, returning another branch's books or serving old cache data. We need a permanent way to search and verify those connections across countries, with enough evidence to diagnose problems and enough efficiency to run regularly.

Users are readers through MyBookshelf, operators running library qualification/regression checks, and future developers or agents using the API/MCP. This design is the backend service and its operational report design; a visual redesign of the reading app is outside this change.

## Meaning of “same as the website”

The contract is an **anonymous public search under an explicit search profile**: catalog/library, literal query, selected field, language/locale, material filters, default or selected sort, page and page size. Match the website's published defaults and record them. Never silently replace title search with keyword search, remove punctuation, truncate a query, widen to the whole network or apply our own relevance ranking.

For a supported profile, return the same native result IDs in the same order and the same displayed fields/count semantics as the public HTML or the public JSON request used by that website, after any demonstrated client-side filtering/sorting. Preserve original fields alongside normalized fields. An upstream total may be approximate or unknown; say which.

For server-rendered catalogs, the returned search HTML is direct website evidence. For JavaScript catalogs, inspect the publicly served form/configuration/scripts or official documentation to establish request and display behavior without running a browser. A public API over a different index is an alternate method, not automatic website equivalence. An export qualifies only when evidence establishes that the website uses that version and search algorithm; otherwise label export-only discovery and exclude it from strict equivalence qualification.

Unexplained client-side behavior, required device interaction, CAPTCHA, prohibited automation, private APIs or personalization that cannot be reproduced make that profile unsupported or blocked. Do not claim pixel/UI verification or identical results at different times. Catalog updates, locale and changing availability can legitimately change results. Save the profile and observation time so differences can be investigated.

## Required outcomes

| ID | Requirement | Acceptance |
| --- | --- | --- |
| R1 | Every directory library accounted for | Stable library IDs, explicit duplicate/alias decisions, one status row per frozen audit target |
| R2 | Website-equivalent searches without browsers | Native request mapping and display logic are evidence-backed; ordered ID/count/filter checks pass |
| R3 | Twenty distinct books per initial library qualification | Each accepted book traces to a successful query, source evidence and selected-library membership; copies and known duplicate works do not pad counts |
| R4 | Accurate failure reporting | Empty results, irrelevant results, parser bugs, wrong-library data, timeout, refusal and unfinished work are separate outcomes |
| R5 | Repeatable monitoring | Fresh sentinel and full requalification runs can resume; prior success dates never become new observation dates |
| R6 | Fast, measurable execution | Request reduction and concurrency changes are benchmarked with fidelity held constant; all traffic follows provider limits |
| R7 | Stable reusable service | CLI, internal REST and later public REST/MCP share core contracts and adapter versions |
| R8 | International expansion | Country/language/encoding/timezone/branch details live in descriptors and fixtures, not assumptions in the runner |
| R9 | Auditable reports | Per-library, per-query and per-book exports, failure causes, next actions, timestamps and evidence links |
| R10 | Public API suitability | Provider policy/attribution eligibility, admission limits, API authentication, privacy, versioning and operating budgets validated before exposure |

## Finding and counting books

Use a small common seed set, then institution/subject/language-specific terms. Several books may come from one query; the same book can count at different libraries with distinct membership proof. Stop after 20 accepted books at one library. Record all unsuccessful terms and adaptations.

The API returns the native ordered result page even when it includes non-book or irrelevant rows. The qualification evaluator separately labels relevance, format, membership and deduplication. This prevents “improving” search results in ways that violate parity. Use structured title/author/subject evidence or a recorded review rationale for relevance; vector/LLM judgement alone cannot establish catalog identity.

Search rows may already prove the book identity and selected-library membership. Fetch details only when needed for proof, disambiguation or the recurring record-resolution check. Do not require an ISBN where the source has none. Preserve native edition IDs; group only demonstrably identical books. Ambiguous duplicates remain review items. Catalog presence counts toward searchability even when a copy is on loan or reference-only; borrowing status remains a separate fact.

## Report design

First view: total libraries, 20-book passes, partial passes, no-books-found, blocked/failed, pending; latest run time and change since previous report. Filter by country, state/region, catalog family, provider host, status, reason and freshness. No coverage jargon is needed.

Each library row shows name/link, verified books out of 20, last full qualification, latest fresh health outcome, website fidelity, MyBookshelf comparison, request count, latency and next action. Expand it to see every term, query field/filters, reported result count, accepted books and errors; expand a book to see identity, holding evidence and catalog link.

Initial qualification statuses are mutually exclusive: `20 verified`, `1–19 found`, `No books found`, `Blocked/failed`, `Not checked/checking`. A library with seven verified books followed by a timeout remains partial with a blocker attached. Health is separately `healthy`, `degraded`, `failed`, `unknown/stale`. A single failed query cannot erase historical evidence or establish that the library has no books.

Provide filterable static HTML and JSON/CSV exports first. Publish only redacted metadata/evidence permitted for disclosure. Escape untrusted source text in HTML and protect CSV cells against spreadsheet formula execution. Detailed internal traces are not automatically public API fields.

## Scope and rollout

Design and implementation are separate from deployment. Start with internal adapters/audit tooling; integrate through the existing MyBookshelf API only after contract regression checks. Preserve saved catalog book keys and existing source behavior during migration. Existing paused research schedules stay paused; this new monitoring system has its own deliberately enabled schedule after implementation.

No automated account creation, borrowing, paid integrations, outreach, bulk full-text downloads or bypassing source access controls. A permanent public contract is in scope; an unbounded public proxy or library metadata mirror is not.
