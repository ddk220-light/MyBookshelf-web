# Free-content implementation validation

Checks performed 2026-11-01 in the isolated free-content worktree using Node
22.23.4. No hosted preview or production enablement is claimed.

Latest local UI review: **537 server tests (real Redis, no skips), 141 client
tests, 262 broad feature-enabled desktop/mobile browser journeys and 50 focused
feature journeys passed**. All **84 board-state/theme/device captures** pass axe
and overflow checks. See the [screen review and comparison gallery](UI_REVIEW.md).
Typecheck, production build and SEO/deployment checks pass. The unchanged importers
previously passed 12 Python checks; isolated client-only build and pinned actionlint
also passed in the preceding source-expansion checkpoint. CI on
[PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110) also runs WebKit
and both disabled/enabled feature paths; consult the PR for the current head.
Hosted enablement and first scheduled refresh execution remain release checks.

Earlier per-slice counts below are dated checkpoints, not the latest totals.

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
- Reviewed real children’s metadata and local app journeys are now complete.
  The three StoryWeaver books require a free source account, as accepted by the
  owner; no source account was created and post-login reading was not tested.
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

## Isolated web-service build

The automatic Vercel preview check exposed a pre-existing build coupling:
Vite imported its CSP constant through the Express application module. The web
service installs client dependencies separately, so that import failed with
`ERR_MODULE_NOT_FOUND: express`. The failure was reproduced in a temporary
client-only installation with 254 packages and no Express.

The unchanged CSP now lives in `shared/html-security-policy.mjs`; both the API
and Vite preview import it. The isolated production build passes without API
dependencies. Ten existing header/SEO checks pass, and CI now runs
`node tools/deployment/check-client-service-build.mjs` to preserve this boundary.
The automatic deployment's project settings were inspected read-only; the fix is
contained in this branch's source. Final deployment/CI status is recorded on
[PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110) and task
[#134](https://github.com/ddk220-light/MyBookshelf-web/issues/134).

## Free source accounts and additional source delivery

The owner explicitly accepted free source login and assigned source research to
Codex. Public StoryWeaver metadata loaded in a normal browser even though direct
requests were blocked. Actual Read Story controls for records 7, 8 and 2252
returned 401 and a free signup offer. They are searchable as
`free_account_required`, grouped separately and labelled again before the source
reading link. Generic/unknown-price registration remains excluded. Explicit
`access: free_full_text` API requests remain anonymous-only. Old evidence becomes
unknown, and account-conditioned actions never invent direct file downloads.

[Primary review evidence](evidence/2026-11-01/children-source-review.json) records
current credits, source levels, original-story relations and the books policy.
A fresh browser recheck passed for all three records using
`tools/content/refresh_children.mjs`; changed credits, levels, identity, charges
or policy prevent renewal. Its guard tests pass. The old mirror had a different
Hindi translation link and Tamil translator; current primary facts were used.

[Actual app flows](evidence/2026-11-01/expanded-sources-app-flow.json) passed on
phone/desktop for source-account Tamil and anonymous Book Dash reading links:
search → detail → save → reload → reopen, preserving source-native IDs and
creator credits. Both flowed without Redis, page errors or horizontal overflow
at 320px/200% text. Captures include the
[Tamil phone detail](evidence/2026-11-01/children-reviewed-detail-phone.png) and
[Book Dash desktop search/detail](evidence/2026-11-01/bookdash-detail-desktop.png).

Book Dash’s 30-record subset imported and passed runtime search/resolve/freshness
audit. A second real refresh used pinned native IDs and retained all 30; newer
catalog entries cannot evict saved editions from the bounded subset. Import tests
cover source-only URLs/language/credits/galleries, metadata-only output, failed
refresh preservation and identity retention. The anonymous source reader sample
loaded all 14 supplied pages. No book artwork/text or guessed downloads enter the
snapshot. Source/API candidates and limits are in [the expanded survey](ADDITIONAL_SOURCES.md).

Current real-source records: 1,000 Gutenberg, 1,909 textbook, 30 Book Dash and
three reviewed StoryWeaver records. This is 2,942 bounded metadata records,
not a worldwide catalog size or a search-match total. Eight sources have
implementations: these four book sources plus four existing live paper adapters.
The OpenAlex key was rechecked successfully. Redis remains deferred by the owner;
no hosted store, source account or production enablement was created here.
