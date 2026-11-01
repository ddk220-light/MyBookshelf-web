# Free-content implementation validation

Checks performed 2026-11-01 in the isolated free-content worktree using Node
22.23.4. No hosted preview or production enablement is claimed.

Latest local result: **531 server, 138 client, eight Python and 236 full
feature-enabled desktop/mobile Chromium checks passed**, plus typecheck,
production build, SEO/deployment and pinned actionlint verification. Following
the final reader/link fixes, the 12 reader-flow tests and 24 feature browser
checks passed again. CI for the draft PR runs Chromium/mobile/WebKit with the
feature both disabled and enabled; consult [PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110)
for current run status. Hosted enablement and real pilot publication remain blocked.

## Search → API → metadata → reader → shelf

The actual Gutenberg snapshot supplies the search results and source-host links
in the [phone/desktop captures](evidence/2026-11-01/layout-checks.json). The API
rechecks access age on resolve; the browser saves a distinct content reference,
opens `/app/read/:contentKey` after reload and removes it without losing existing
library books. No ebook/PDF/EPUB content is fetched by the app server.

| Check | Result |
| --- | --- |
| Client type check and feature-enabled production build | Passed |
| Client suite | 130 tests passed; includes lossless v1 migration, write failure, recovery and mixed 100-item cap |
| Full server suite | 507 tests passed before the additional Indic search regression |
| Focused content/API tests after Indic regression | 23 passed, including real Redis integration (no skips) |
| Gutenberg importer | 3 tests passed; actual official RDF import yielded 1,000 records |
| Standard Vite browser regression | 212 passed across desktop/mobile Chromium; 14 feature tests intentionally skipped with flag off |
| Feature browser suite | 14 passed across desktop/mobile Chromium: save/reload/remove, unclear opt-in, source-sheet keyboard/Escape, unavailable state, axe in all three lights, 320px/200% text reflow |
| SEO and deployment checks | Passed |

Redis integration starts `redis:7-alpine` as
`mybookshelf-free-content-test-redis`; two coordinator instances share atomic
Lua reservations through a test HTTP REST facade backed by actual Redis. It
verifies cache/page coalescing, quota accounting and failure before provider
dispatch. This is local protocol evidence, not proof of hosted configuration.

Initial broad browser attempts used the API server rather than Vite's public
page handling and then omitted the installed Chromium executable override.
Those setup failures were corrected; the standard Vite run above passed.
The feature sheet test caught a real focus escape; `Sheet` now loops Tab within
the dialog. Visual review caught global input padding overriding the search
icon clearance; a scoped selector corrects it.

Reproduce (Node 22; install dependencies first):

```sh
python -m unittest discover -s tools/content -v
docker run -d --name mybookshelf-free-content-test-redis redis:7-alpine
CONTENT_REDIS_TEST_CONTAINER=mybookshelf-free-content-test-redis npm test --workspace=server
npm run typecheck:client
npm run test:client
npm run build
npm run test:seo
node --test tools/deployment/*.test.mjs
npm run test:e2e --workspace=client -- --project=chromium --project=mobile-chromium
VITE_CONTENT_DISCOVERY_ENABLED=true FREE_CONTENT_E2E=true npm run test:e2e --workspace=client -- free-content.spec.js --project=chromium --project=mobile-chromium
```

This workspace uses `/usr/bin/chromium` via
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. CI installs Playwright browsers instead.

## Remaining release gates

- Hosted shared Redis REST binding and explicit per-source budgets; flags remain
  off without them. Local Gutenberg search requires no database.
- Reviewed real children's records with original credits and languages.
- Automated reviewed catalog refresh before 24-hour access evidence expiry;
  the candidate tool/daily draft-PR workflow are now implemented and tested
  locally; first scheduled execution follows default-branch merge. Stale evidence
  remains unknown. No global Gutenberg/OTL completeness or deletion claim.
- Finish board-state coverage, source-specific retraction/version fixtures,
  fresh protected preview and final hosted release checks. WebKit runs in CI;
  Firefox is not part of the existing CI browser matrix and has not been run here.

Reference boards contain fictional papers and children's stories. Test fixtures
are explicit synthetic protocol data; they are not production catalogs. Captures
use actual Gutenberg metadata, not those fictional records.

## Open Textbook Library follow-up

The official CSV was freshly fetched at 2026-11-01T09:08:56Z; 2,735,385 bytes,
1,909 unique records. The discovery page's CC0 catalog statement was rechecked.
Raw source hash, protocol limits and the JSON/CSV coverage discrepancy are
recorded in [the snapshot notes](../../../server/data/content/README.md).

Six Python importer tests, 25 focused content/API tests (real Redis included),
510 full server tests, 131 client tests and 14 feature browser checks pass.
Typecheck and feature-enabled production build pass.
The [real textbook flow](evidence/2026-11-01/textbook-flow.json) verifies on
phone/desktop: search → resolve → supplied LibreTexts host link → save → reload
→ reopen, and exact source ISBN `9781946135100` → OTL record 4. No made-up file
download buttons appeared for the host's HTML landing page. There were no browser
page errors or horizontal overflow. These are metadata and browser checks, not
an exhaustive check of every publisher's outbound link.

## Multi-source papers follow-up

DOAJ, arXiv and OpenAlex now have bounded adapters, source-native identities and
per-location access/licence handling. Fresh [policy observations](evidence/2026-11-01/source-policies.json)
verify DOAJ's 2 RPS and arXiv's 3-second/single-connection aggregate rules. The
configured OpenAlex key reported $1/day free allowance, $0.001 ordinary search
and zero prepaid funds; runtime rechecks those conditions before dispatch.
Operational limits and caveats are in [OPERATIONS.md](OPERATIONS.md).

Paper-stage backend/client checks passed. Real Redis verifies two-instance quotas, source-wide spacing,
429 cooldown, record caching and a 180 KB cache value. Search transport tests
cover source progress, final commit/error and interrupted streams. The standard
14 feature browser checks pass after the progress changes.

The [actual paper flow](evidence/2026-11-01/papers-live-flow.json) exercised a
local API, actual Redis and official source metadata: 20 + 20 unique results,
source progress, reader → save → reload → reopen, and versioned legacy arXiv
lookup → reader. The latest first response took 2,468 ms across three sources;
the next buffered page took 198 ms. This does
not establish hosted performance or provider SLAs. No browser page errors
were recorded. The test facade initially hit an OS argument-size limit; using
stdin and adding the 180 KB check fixed the facade. The production REST protocol
does not pass cache values through a command-line argument.

Gates remain: hosted cache bindings/budgets, daily catalog refresh, actual
children's pilot, final browser/host-link/preview validation. Flags stay off.

## Children's curation gate

The empty production manifest is intentional. Five additional backend tests
verify that missing languages, translator/illustrator roles, licence, review
evidence, exact host links and unexpected text fields prevent publication.
Synthetic metadata exercises Hindi/Tamil search, publisher-level filters,
translation identities, signed paging and stale-access downgrades. There are
45 passing focused backend checks and 137 passing client tests after this slice.
Real publication remains blocked as recorded in [CHILDREN_REVIEW.md](CHILDREN_REVIEW.md).

The full existing+feature browser suite passed **226** desktop/mobile Chromium
journeys with the main feature flag enabled before pilot controls were added.
Existing library/camera/shelf behavior also works with the new Search scopes
visible. The CI lane should run both flags-off and flags-on paths.

## Final source and refresh checks

All four paper adapters passed fresh [exact-record lookups](evidence/2026-11-01/exact-lookups.json)
without the record cache. Their observed times were 252–1,635 ms in this workspace;
these small samples are not SLAs. A fresh full paper flow also passed after final
changes: source progress, 20 + 20 unique records, save/reload/reopen and legacy
arXiv version lookup. The [flow report](evidence/2026-11-01/papers-live-flow.json)
records actual statuses and timing.

[HEAD/header-only sampling](evidence/2026-11-01/host-head-checks.json) returned
200 from the textbook, DOAJ publisher, arXiv and Europe PMC hosts. It found a
Gutenberg legacy HTML 404; GET response headers confirmed it. The supplied direct
HTML and EPUB routes returned 200. Importer v2 removes virtual HTML links and
uses supplied direct HTML/landing URLs; a fresh 1,000-record import and runtime
audit passed. The primary location's licence and downloads now stay together;
other hosts/versions retain their own licence, and retraction flags appear on
direct detail visits. No full-text content was stored.

The refresh tool prepared both real catalogs without changing the baseline until
both passed validation. Counts and identities stayed stable; metadata differences
are the Gutenberg mapping-version/link changes. The daily workflow passed
actionlint 1.7.7 (release checksum verified), but has not executed on the default
branch or created an automated refresh PR yet. Actual source captures were
updated in all three reading lights with no page errors or horizontal overflow.
