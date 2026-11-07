# Library connector platform: implementation design

Status: implementation in progress, 7 November 2026. The internal HTTP service, resumable runner, full India queue, reports and disabled scheduling support are implemented. A bounded live pilot is recorded. Read [implementation status](IMPLEMENTATION_STATUS.md) and the [operator runbook](RUNBOOK.md); design ambitions below are not claims that every adapter or public delivery milestone is complete.

Build a reusable HTTP connector service that reproduces public catalog website searches, tests itself periodically and exposes the same capabilities to MyBookshelf, an API and eventually MCP clients. **No browser control, headless browser, screenshot requirement or browser fallback.** This owner decision supersedes the browser-based approach originally proposed in PR #187.

Start with the 6,703 configured India library entries, then add countries through directory records and catalog variants. A shared catalog adapter serves many libraries, but every library retains its own identity, query scope and evidence. Initial qualification finds 20 distinct books per library; recurring checks verify that those connections still work.

## Review packet

| Document | Decisions |
| --- | --- |
| [Product requirements](PRODUCT_REQUIREMENTS.md) | Success criteria, website equivalence, coverage and report behavior |
| [Engineering design](ENGINEERING_DESIGN.md) | Request reproduction, adapters, sessions, scheduling, persistence and performance |
| [API and MCP contract](API_CONTRACT.md) | Stable operations, pagination, freshness, errors, public access and future MCP |
| [Testing and operations](TESTING_AND_OPERATIONS.md) | Accuracy checks, metrics, benchmarks, scheduled tiers, logging and recovery |
| [Implementation backlog](IMPLEMENTATION_PLAN.md) | Epics, stories, concrete tasks, dependencies and acceptance checks |
| [India audit scope](../plans/2026-11-07-india-library-search-audit.md) | Baseline counts, book selection, omitted-entry reconciliation and outputs |

## Decisions

1. Reproduce the public website's actual HTTP search transaction and documented display transformations. Live tests use real responses; simulation/fixtures are only for offline tests.
2. Preserve native result order, search fields, filters, pagination and record identity. Unsupported transformations or uncertain equivalence are explicit failures to qualify, not guessed matches.
3. Use the same connector core for audit CLI, internal API and eventual MyBookshelf integration. Public API and MCP are delivery layers, not separate scrapers.
4. Begin with Node 22 in the existing repository. Use JSON configuration, append-only JSONL events and file checkpoints. No new SQL, Redis, hosted data service or paid infrastructure is a prerequisite.
5. Minimize requests before increasing concurrency. Reuse sufficient search-page evidence, avoid needless detail fetches, share permitted metadata reads, and pace by actual provider origin.
6. Separate initial 20-book qualification, periodic health, parser fidelity, freshness and application integration. A cached success is not a fresh provider check; a healthy sentinel is not a rerun of all 20 books.
7. Keep one authoritative outbound coordinator initially. Public clients must not multiply upstream traffic by bypassing its budgets. Multi-replica deployment needs a separately measured coordination design.
8. Design public access now; release it only for connectors whose provider policies permit both automated use and the intended response redistribution. Internal research access alone does not establish that permission.

## Implementation sequence

Contracts and inventory → shared transport/evidence → e-Granthalaya, Koha, IndCat and LIBMAN → resumable 20-book audit → metrics and periodic checks → remaining variants/countries → public API → MCP.

The first four families account for 6,465 of 6,703 configured entries (96.4%). That is prioritization by configuration, not a claim they are working. The full audit still includes every family and library. The pilot measures actual throughput before estimating completion dates.
