# Free-content screen review

Reviewed 2026-11-01 (America/Los_Angeles) in the isolated free-content worktree.
Task [#146](https://github.com/ddk220-light/MyBookshelf-web/issues/146), under
FCD07 / [PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110).

The implemented flow is Search → content API → source metadata → reading link →
browser shelf → reload/reopen. The review compares all fourteen approved
[boards](../../design/2026-11-free-content/README.md) with the running app in
Daylight, Lamplight and Ink on 390×844 phones and 1280×900 desktops.

Open the [comparison gallery](evidence/2026-11-01/ui-review/index.html) and use its
reading-light selector. The [84 audit results](evidence/2026-11-01/ui-review/checks.json)
all pass: no page errors, horizontal page/main overflow or WCAG A/AA axe findings
within the reviewed screen/dialog. These are state-based screenshots and a human
visual comparison, not a numerical pixel-match claim.

## Differences found and fixed

| Board | Implemented correction |
| --- | --- |
| FreeStart | Match header spacing, introductory copy, compact filled browse tiles, icons and type. Add real recent queries with scope labels; retain only six in same-tab memory. Clearing a query returns to browse. No fabricated sample history. |
| FreeBookResults | Compact 52×78 covers and rows, supplied format summaries, inline loaded counts/source names, working type filter, labelled disabled filters, horizontally scrollable filter row, stronger contrast and the full opt-in unclear notice. |
| FreeBookDetail | Add the top bookmark control, reading-status line, supplied-format grid, source-host note, compact rights block and per-location observation time. Use SVG outbound icons so missing glyphs cannot render as boxes. |
| LibraryBookFreeEdition | Keep the exact-identifier optional lookup below circulation; match the inset card treatment. The full-screen audit exposed an existing dark-theme circulation-location contrast failure, fixed using the shared reading-light secondary ink. |
| PaperResults | Restore distinct type/version and source-reported correction/retraction pills, author truncation, host/index access wording and the type/language/year filter order. Type filtering changes the actual request; unavailable year/language filters explain their limits. |
| PaperDetail | Remove the invented paper cover from the detail heading, retain version and source metadata, place Save in the toolbar and keep related versions' access/licences separate. Label supplied relations instead of exposing enum names. |
| SourcesSheet | Include the current query/scope, source coverage, loaded counts, unsearched-source action and distinct unavailable/disabled/limit states. Keep the existing sheet, focus trap and Escape restoration. |
| Loading | Match the compact source-progress panel and static line skeletons. A real local NDJSON stream exercises answered/searching/queued states; no shimmer or animated spinner is added. |
| PartialCoverage | Put the source-specific notice before counts/results, show answered-source coverage, and retry only that source without discarding previous results. |
| SourcesDown | Match the centered unavailable illustration, explicit non-absence wording and full-width retry/library actions. The state stays an alert rather than a zero-result list. |
| NoFreeCopy | Suppress redundant default filters/zero-count header, retain the cautious no-verified-copy claim, show a full-width library action and list each answered source with zero matches. Active filters stay available to clear. |
| BudgetUsed | Put the wide-search notice before specialist results, state the tomorrow reset and avoid provider branding. Do not also show a duplicate generic failure notice for the quota alone. |
| ChildrensPilot | Use the children's heading/back link, language chips, publisher-level control and two-column story cards. Preserve supplied contributor roles and licences. Keep the owner's separately labelled free-account group. |
| DeskFreeSearch | Move the detail pane beside the first result area, add the selected-row treatment, retain URL/Back selection and keep a selected item visible when resizing to a phone. Remove underlined cover text and prevent the Sources label from splitting. |

The visual pass also found AA contrast failures in amber correction pills and
green access text on selected rows. The foregrounds were darkened in Daylight;
Lamplight/Ink retain their reading-light status colors. No status relies on color
alone. React review checked hook cleanup, stale-request abortion, semantic links,
bookmark state, bounded client memory and absence of new dependencies.

## Evidence and limits

- The comparison fixtures are explicitly synthetic for papers/stories; they do
  not establish source access or represent the actual reviewed children's set.
  Their metadata is isolated in `client/e2e/free-content-ui-fixture.js`.
- The [actual-source app flows](evidence/2026-11-01/ui-review/actual-source-flow/expanded-sources-app-flow.json)
  separately exercise the real Tamil StoryWeaver record and Book Dash edition:
  search → detail → supplied source URL → save → reload → reopen, on desktop and
  phone, including 320px/200% text. Their credits and free-account condition are
  preserved. No source account was created and post-login reading is untested.
- Sources, counts, levels and available relations differ from the board samples.
  Only source-supplied versions/downloads/relations render; no v1/v2 list, recording,
  translation, cover art or licence is inferred to imitate sample data.
- The shared four-tab shell, desktop navigation rail and browser safe-area
  handling remain the existing app. The source sheet keeps its shared Close
  control. Catalog-subset disclosure and the owner-approved free-account group
  add necessary content beyond the original sample boards.
- Recent query history is bounded and lost on reload. It is not written to
  local storage, an account, analytics or a server history store.
- Automated contrast/layout checks do not replace a screen-reader usability
  session. Firefox was not run locally. Remote CI covers WebKit as well.
- Hosted feature enablement, Redis-backed hosted paper journeys and the first
  scheduled refresh remain the previously recorded release gates. No flags,
  hosted credentials, storage or production deployment settings were changed.

## Verification

- 537 server tests, real Redis, zero skips; 141 client tests.
- 262 broad feature-enabled desktop/mobile browser journeys passed, followed by
  50 focused feature journeys after the last empty/outage layout refinements.
- All 84 final state/theme/device captures pass axe and overflow checks.
- Typecheck, feature-enabled production build, SEO and deployment checks pass.
- Keyboard bookmark activation; sheet focus/Escape; source-only retry; type
  filtering including resetting an empty filter; unknown show/hide; selected
  result Back/resize; save/reload/reopen; 320px/200% text in all lights pass.

Reproduce with Node 22, a feature-enabled build and local preview/reference
servers (use available free ports):

```sh
VITE_CONTENT_DISCOVERY_ENABLED=true VITE_CHILDREN_PILOT_ENABLED=true npm run build
npm run preview --workspace=client -- --host 127.0.0.1 --port 4183
python3 -m http.server 4197 --bind 127.0.0.1
node tools/content/review-ui.mjs --base-url=http://127.0.0.1:4183 --reference-url=http://127.0.0.1:4197
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4183 FREE_CONTENT_E2E=true npm run test:e2e --workspace=client -- free-content --project=chromium --project=mobile-chromium
```

The capture helper defaults to the cloud image's system Chromium; set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for another installation. It writes to
`/tmp/free-content-ui-review` by default. Normal browser journeys retain the
repository's Playwright configuration.
