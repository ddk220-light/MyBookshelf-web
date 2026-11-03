# Simple live profile verification

2026-11-03. Implementation: #156, plan #157, backend #158, release verification
#159. Active plan: [SIMPLE_LIVE_PLAN.md](SIMPLE_LIVE_PLAN.md).

## Implemented and checked locally

- Redis coordinator, shared record/page caches, stored federation sessions,
  application-wide source counters and their setup/CI prerequisites are removed.
- One live source request per search/detail. Native cursors are signed, bounded,
  context-bound and usable after process restart. Replay makes another request.
- Deterministic tests cover source routing, no fan-out, token tampering/expiry,
  old-session rejection, page cycles/depth, underfilled pages, access classes,
  invalid provider responses, provider errors, cancellation and exact resolution.
- OpenAlex verifies free allowance/known pricing/zero prepaid funds before each
  request. Existing tests reject paid balances, changed prices and exhaustion.
- 570 server tests pass with zero skips; 179 client tests and typecheck pass.
  The disposable PostgreSQL used for existing account regression tests is local
  test infrastructure, not a free-content runtime dependency or hosted resource.
- 62 focused desktop/mobile browser checks pass, including live coverage,
  paging, source switching/website links, reading, save/reload/reopen and three
  reading lights. Full build, isolated client-only build, SEO/deployment checks,
  12 Python importer tests and refresh-script tests pass.

## Actual sources and browser

[Direct source probes](evidence/2026-11-03/direct-live-probes.json) use official
APIs and the existing OpenAlex key, without store bindings. Mathematics selects
OpenAlex; malaria selects Europe PMC. Both return current readable metadata,
resolve exact native records live and continue to another page. A Europe PMC
continuation overlapped one record, confirming why live paging is not a frozen,
globally duplicate-free snapshot. The browser removes repeated source keys.

[Actual browser review](evidence/2026-11-03/direct-live-ui.json) captures paper
results and Sources on phone/desktop in daylight, lamplight and ink: twelve
states pass axe/overflow checks, with zero page errors. Phone and desktop flows
load 24 distinct papers, open a supplied reading link, save and reopen after
reload. Existing Mathematics book search returns 20 results.

Official Gutenberg/OTL/Book Dash refreshes retain all 1,000/1,909/30 native keys,
with zero semantic metadata changes. Current evidence supports 987/1,905/30
reading actions. These are bounded catalog counts, not global source totals.
The StoryWeaver reading-offer recheck failed; its previous observations are
retained, never renewed manually. #127 tracks that separate source-review gate.

## Hosted release

The existing key has been bound privately as a server-only Secret for the
correct Vercel project. No key value appears in source, browser output or evidence.
Source flags, exact candidate CI, preview/production source SHAs and live
verification are recorded in #159. A successful local probe does not establish
hosted deployment; release evidence must name the checked deployment.

No paid service/store was provisioned. Account resources, credentials, activation
and security settings are outside this change. Direct arXiv/DOAJ automation stays
deferred; the UI offers searches at their own websites.
