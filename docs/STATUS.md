**Production-ready work resumed, 18 November 2026:** the four saved workstreams are integrated locally on `codex/production-ready`. The app opens the reading shelf at `/`, and the old shelf address forwards there. Library answers, account entry and Settings, the picker and reports, and the About and policy pages are included. The [current implementation handoff](plans/2026-11-production-ready-progress.md#local-integration) records the branch tips, verification and remaining launch work.

**Production-ready implementation paused, 19 November 2026:** the work is on `claude/production-ready` (integration branch) and four worker branches (`claude/production-ready-w1-library-checks`, `-w2-accounts`, `-w3-picker-reports`, `-w5-pages`), some with unfinished WIP commits. Nothing is deployed. What each branch holds, what is left, the merge order and the launch steps: [plans/2026-11-production-ready-progress.md](plans/2026-11-production-ready-progress.md).

**Suggestions wait longer for Open Library, 18 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released; the owner asked not to deploy yet):** after release #197, a slow Open Library (3 to 4 s a request) left books with long author lists (Wings of Fire, Harry Potter) with empty partial answers in production every time, since each request met a fresh instance and the 3 s deadline. `SUGGESTIONS_DEADLINE_MS` is now 10 s (the function may run 120 s). With every read slowed by 3.5 s, Wings of Fire went from 0 books (partial, 3.0 s) to 23 (complete, 7.8 s). Not done, by the owner's choice: dropping suggestions that match a shelf book's title and author, and preferring the reader's language.
**Later on 19 November:** no staging step: the finished production-ready branch goes straight to `main` after a full test run and a local run opened from both phones; the live checks follow at once, with rollback in Vercel if needed. An About page mock-up was added to the screens (20 boards).

**Owner's decisions of 19 November on the production-ready plan:** one deployment for everything (built in three stages on one branch, rehearsed once on staging with the owner's go-ahead); log in by emailed link as well as by password; signed in directly after the email link or a reset; the shelf is called "My reading shelf" everywhere and lives at the root address (the old shelf address forwards there); the landing page's content moves to the About page; no data download, no device list, Log out for the current device only; deleting an account also clears the browser's copy; optional contact details are removed after 90 days inside the existing daily clean-up, with no new job. Details: [plans/2026-11-production-ready-design.md](plans/2026-11-production-ready-design.md), sections 1 and 7.

**Production-ready plan written, 19 November 2026 (branch `claude/production-ready-checks`, documents only; nothing built):** [plans/2026-11-production-ready-design.md](plans/2026-11-production-ready-design.md) has the root causes, three releases and the owner's open decisions; the 18 screens are in [design/2026-11-production-ready](design/2026-11-production-ready/README.md); file-level notes are in `research/2026-11-production-ready/root-causes/`. Main cause found: production's three catalog database settings carry an address with `-pooler` twice (a setup script error of 13 November), so the store has refused every connection and failed open in silence; migrations 001 and 002 are on the right database. Second: a proven library match is thrown away when a check hits its time limit. Next: the owner reviews the plan and screens, then an implementation agent starts Release A.

**Production-ready analysis read and backlog updated (branch `claude/production-ready-checks`):** the end-to-end run on both phones and desktop is in [research/2026-11-production-ready](research/2026-11-production-ready/README.md); its reading, the priorities and the new items (34 to 36, open questions 16 to 19) are in [the backlog](plans/2026-11-18-production-ready-backlog.md) under "What the run shows" and "Priority after the run". Largest finding, confirmed again after the run: production keeps no library answers (a "found" was gone two hours later), so marks vanish, every book opening re-checks the library, and the logs in the same database are very likely empty too. Item 20 comes first.

**Account flows on production, 18 November 2026 (same branch, documents only):** one test account was created on the iPhone, verified from the email, signed in on the Pixel, synced both ways, logged out, had its email changed and its password reset, and was deleted; all of it works. Findings: [research/2026-11-production-ready/accounts.md](research/2026-11-production-ready/accounts.md). Most serious: a 14-character password-manager suggestion is rejected (15 minimum); a reloaded reset page says "Link expired" for a valid link and "Send a new link" sends nothing (new item 33); "Bring books over" moves under the finger; creating the account takes about 10 s. Not done: account flows on desktop, item 20, the design plan.

**End-to-end run as a guest reader, 18 November 2026 (branch `claude/production-ready-checks`, documents only):** both phones are driven from the owner's Mac over Wi-Fi (item 23 done) and the product was walked as a new reader on a Pixel 6 Pro, an iPhone 16 Pro Max and desktop at six widths (item 24, guest part). Findings and timings: [research/2026-11-production-ready](research/2026-11-production-ready/README.md); the 824 screenshots, timings and raw logs are in the same folder ([index](research/2026-11-production-ready/screenshots/INDEX.md)). Most serious: library answers are not kept between visits (no mark on the shelf after a reload, and a new check each time); e-Granthalaya checks fail after 25 to 26 s and Anna Centenary twice ran 45 s or more; the phone library picker hides the field and results behind the keyboard; "Request to add" sends on one tap (one junk request, "Zzqqxx", went to production and needs deleting); status has no words. The backlog has new items 25 to 32 and open questions 13 and 14. Not done: account flows (the owner types the password), item 20, the design plan.

**Production-ready checks, 18 November 2026 (branch `claude/production-ready-checks`, documents only):** the owner's backlog and the analysis path are in [plans/2026-11-18-production-ready-backlog.md](plans/2026-11-18-production-ready-backlog.md). Analysis comes first (phones connected on the owner's Mac, an end-to-end run, proof that production records accounts, searches, failures and cached answers), then a design plan with the owner's answers, then the fixes. Found on 18 November: the catalog database in the setup notes is not the one production uses (it is empty, and migration 002 went there), and e-Granthalaya checks time out from the US region. Ready but not deployed: the 10-second suggestions wait (`claude/nifty-feynman-4qwocr`, `91ea737c82`).

**Release candidate, 17 November 2026 (branch `claude/nifty-feynman-4qwocr`):** one release carrying the desktop layout (plan Part 1) with its five follow-up fixes (no stray history entry; shelf state kept across 640 px; one scroll area on the rail; book opens after the first under 50 ms; the old `/app/libraries` link opens the pop-up once), shelf suggestions (plan Part 2) with a "Suggested" label under each book, related lists served from `GET /api/v2/suggestions/related` with CDN caching (empty lists one hour, partial one minute), anthologies and textbooks filtered out, and the live work merged in (idle-work fixes, Indian library hardening, tracker and allowlist). An independent browser walkthrough passed all 20 release items. Before merging: apply catalog migration `002-suggestion-counts.sql` to production. Opened and saved counts are recorded only once `USAGE_LOG_ENABLED` is on.

**One-shelf release, 48-hour check (15 November 2026):** runtime errors over the two days were only the pg driver's SSL-mode notice (9 times, harmless). The production catalog store had no library health rows and no stored answers: almost no real use yet, so the watch had nothing to judge. `HOLDINGS_BACKGROUND_ENABLED` is set to `true` in Production without a redeploy (no extra build); background badges switch on with the next production deploy. To stop them, set `false` and redeploy.

**Accounts database compute, 15 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** Neon's free plan sleeps a database after 5 idle minutes; the account job (`vercel.json`, every 5 minutes) and the "Production account health" workflow (every 5 minutes) kept the production accounts database awake, using 80% of the 100 CU-hours with no real users. Fixed in the repository, not by switching things off. (A) Account mail is sent right after it is queued: once the response of the request that queued it has finished (so its transaction has committed), the worker role leases and sends it through the platform's waitUntil (`server/jobs/mail-dispatch.js`), with the job's lease, idempotency key, encryption and role guard; a failure leaves it queued; without `ACCOUNTS_WORKER_DATABASE_URL` nothing changes. (B) The job runs hourly at minute 43; retries are the next hourly run (5 a run) until the link expires; "mail delayed" fires after two hours. (C) The health workflow runs every six hours at minute 46 and passes when the job succeeded within three hours. (D) `GET /api/account/session` without the auth session cookie (`mybookshelf_auth.session_token`, or with `__Secure-`; checked against the library) answers `{status:"guest"}` without starting the account service, and `/api/account/capabilities` is answered from configuration; a plain guest tab no longer re-checks its session on focus/visibility/online, signed-in or uncertain tabs at most once a minute, and a page restored from the back/forward cache always. (E) The signed-in shelf reloads on focus at most once a minute. (F) Suggestions "shown" is no longer reported or accepted (opened and saved stay; migration 002's constraint unchanged; privacy text now "opened and saved"). (G) Stored library answers (`/holdings/lookup`) and the capabilities check are asked once a visit, not again after each book page. Not changed: `/libraries/resolve` on load: the browser caches only the library's id and name, while the app needs the full record (health, capabilities, access notes), so a 24-hour cache would mean a new stored record and stale health; left as it is. The daily free-content refresh workflow's schedule is paused (run by hand; the comment says how to restore it) while free reading is hidden. Guards: `tools/deployment/schedules.test.mjs` fails on any schedule more often than hourly; a server test that a cookie-less guest never initializes the account service; `client/e2e/request-budget.spec.js` pins the request budget. With nobody using the app the accounts database is now woken about 24 times a day, by the hourly job (the six-hourly check usually lands while it is still awake). Checks on this branch: server 800 passed, 0 skipped (database tests on Postgres 16), client 372, type checking, build (main JS 423.3 kB, CSS 121.5 kB), SEO 7, deployment 4, accounts tools 4, browser journeys Chromium + mobile Chromium 287 passed, 141 skipped, real-account journeys 15 + 15 (Chromium, mobile Chromium). Not run: WebKit, Firefox. Owner: nothing to set; after release, check the next "Production account health" run is green and that Neon shows the database suspending between runs.

# MyBookshelf web handoff

**Shelf suggestions, owner review items 1 and 2, 17 November 2026 (branch `claude/suggestions-final` from `claude/nifty-feynman-4qwocr`, not released):** (1) Each suggested book now has a small "Suggested" label on the plank directly below it, on phone, rail and desktop; the one tag per bay is gone (`ui/shelf/Bookcase.tsx`, `.suggested-label` in `home.css`/`desk.css`). Not faded, `aria-hidden`, the old tag's colours (4.5:1 or more in all three lights, checked in the journeys), positioned over the plank so bay height and rhythm are unchanged. (2) Suggestions come from Vercel's cache: `GET /api/v2/suggestions/related?book=<ISBN or Open Library work key>` returns one book's related list (same filters as before, no reader data, never the catalog store), with `Cache-Control: public, max-age=86400` for the browser and `Vercel-CDN-Cache-Control: public, max-age=86400, stale-while-revalidate=604800` for the CDN (a partial answer: `no-store`, one minute at the CDN). The app asks for up to three recent books' lists, merges them newest first, then the seed list, leaves out saved books, and with a library chosen asks `POST /holdings/lookup` once for the candidates (at most 100; stored answers only) to lift and badge the "found" ones. `POST /api/v2/suggestions` and its server code are removed; `POST /suggestions/events` stays. A returning reader with a library: 3 related GETs (no function run on a repeat) and 2 stored-answers lookups (the shelf's and the suggestions'), instead of 1 suggestions POST (up to 3 Open Library reads) and 1 lookup. Privacy text: one sentence added (the related list may be kept by the hosting cache and the browser under the book's identifier). Plan Part 2 and "Owner review fixes" updated. Checks: server 880 tests, 856 passed, 24 skipped (database tests, no local Postgres), client 379, type checking, build (main JS 424.4 kB, CSS 121.2 kB), SEO 7, deployment 4, browser journeys Chromium + mobile Chromium 289 passed, 143 skipped. Not run: WebKit, Firefox; no live requests. No new Vercel settings.

**Shelf suggestions, step B (plan Part 2), 14 November 2026, with the independent review's fixes (branch `claude/nifty-feynman-4qwocr`, not released):** The server source is built. `POST /api/v2/suggestions` (`server/public-v2/suggestions.js`) takes exactly `{ libraryId?, recentBookKeys ≤3, excludeKeys ≤200 }`, ISBN keys and Open Library work keys only (a `v1:catalog:…` key, which names a library, is refused, as in the counts), and returns up to 15 candidates; the app's own pick stays the authority and its seed list stays last. Candidates come from public lists only: books related to the newest recent book, then the seed list (`shared/suggestions-seed.json`, now read by the server too; `.vercelignore` keeps `shared/` and the API bundle traces the JSON import, as for `data/library-presentation-reviews.json`). With a library chosen, the catalog store is asked once (`readAnswers`) which of these candidates' works and ISBN-13s it holds an unexpired "found" answer for there: those come first with `inLibrary: true`, the rest keep their order. **Privacy fix:** the store only lifts and badges listed books and never adds a title, so one reader's lookups never become another reader's suggestions (before, the library's newest "found" answers were the first suggestions); `listFound` and the Books API display read are gone. Nothing for an opted-out library or one not in the directory; a "not found" or a slow store is just no badge. Related books are "same author, then same subject and place": the work record (or the search by ISBN, which now reads `place`, `subject_place` only as a fallback), the first author's most-read other works, then the subject in its place (`q=subject:"Biography" place:"India"`), or two specific subjects together, never one alone. Covers only, Latin-letter titles, no adult or extremist titles or subjects. At most 3 Open Library requests per suggestion request (record, author list, subject list; `server/services/openLibrarySuggestions.js`), each cached per instance for 24 hours; with a library chosen they stop 750 ms before the 3 s deadline so the store's read has time. `partial: true` marks an answer cut short; the app then puts its books before the last ones and picks five. Client fixes: saved and viewed browser records keep the book page's Open Library `workId` (display only; older records read as before; accounts ignore it, so signed-in shelves rely on the next rule), its work key goes into `excludeKeys`, and the display-only "already on my shelf" match also takes the title up to its subtitle and the first author's name words in any order ("Kalam, A. P. J. Abdul"), so *Wings of Fire* is no longer suggested next to a saved "Wings of Fire: An Autobiography"; `findSavedBook`, saving and library answers are unchanged. First refresh of a visit: with no library and no recent books the seed list shows at once and nothing is asked; otherwise the five slots keep their places empty (saved books at once, no placeholder text) until the first answer or 1.5 s, then the seed list stands in, and a later answer replaces it without motion only if no suggestion has been focused or pressed. Later refreshes are as before. A focused suggestion that leaves hands focus to the saved book that took its place, else the "My shelf" heading. Each motion plays once (marks cleared after 600 ms), so search and "Back to my shelf" or a view switch replay nothing. Faded plain covers reach 4.5:1 under the cover's full 16% sheen; the shades this needs are very dark (#1d1c18 to #311310; plain covers show only when a suggestion's cover image fails). Anonymous log (`USAGE_LOG_ENABLED`): kind `suggestion`, one row per book with its key and shown, opened or saved, nothing else. "Shown" now comes from the app, `POST /api/v2/suggestions/events { event: 'shown', bookKeys ≤5 }`, for the books it draws, once per refresh result, only while the shelf is shown and never for an aborted refresh; the server no longer writes it. "Opened" is counted once per history entry (`location.key`, memory only). **Before release:** apply catalog migration `002-suggestion-counts.sql` to production (`npm run catalog:migrate --workspace=server`, owner role); it is applied on the preview (staging) branch. Until then suggestion count rows are refused and dropped, and nothing else changes. No new Vercel settings. Privacy text (`docs/policy/privacy.md`) is unchanged and still matches. Checks after the review fixes: server 796 passed, 0 skipped (database tests on Postgres 16), client 367, type checking, build (main JS 422.9 kB, CSS 121.1 kB), SEO 7, browser journeys Chromium + mobile Chromium 282 passed, 140 skipped (run from `client/` with `npx playwright test --project=chromium --project=mobile-chromium`: the root `npm run test:e2e -- --project=…` does not pass the project flags on). Not run: WebKit, Firefox (not installed here); no live Open Library or catalog requests. Open: the admin usage view does not show the new counts yet.

**Shelf suggestions, step A (plan Part 2), 14 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** Five faded suggested books now stand after the saved books and on the cold open, built to [Part 2 of the plan](plans/2026-11-14-desktop-and-shelf-suggestions.md) and boards S1–S4, from a bundled list: `shared/suggestions-seed.json` (twenty popular Indian books, one per author, real Open Library work keys and checked cover IDs). Pick rules and the hook are in `client/src/v2/suggestions/` (`SUGGESTION_SOURCES` is the seam for the server source; memory only). Cold open: "Ready to search", a larger search bar with scan inside on phones and the rail, then the books; the separate search and scan buttons are gone. Suggestions: 75% covers with darker plain-cover shades (4.5:1 in all three lights, unit-tested), names ending ", suggested", one "Suggested" plank tag per bay, last in the list view, badges only from answers already held, no library check for them. Counts and the view switch count saved items only; "1 book" now shows (S2). Checks: client 333 tests, type checking, build (main JS 415.7 kB, CSS 121.1 kB), SEO 7, browser journeys Chromium + mobile Chromium 278 passed, 140 skipped. Not run: WebKit, Firefox, server tests (server unchanged). Next: step B, the server source (books found in the chosen library, then books related to what the reader viewed).

**Desktop layout (plan Part 1), 14 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** Built to [Part 1 of the desktop and suggestions plan](plans/2026-11-14-desktop-and-shelf-suggestions.md) and boards D2–D5 (`docs/design/2026-11-one-shelf/Desk*.dc.html`). Breakpoints (`client/src/v2/ui/desk/layoutMode.ts`): below 640 px the phone layout as released; 640–1099 px an icon rail (My library, Account, Reading light, Help; pop-overs beside it) with a book or side page covering the shelf; from 1100 px the permanent left column (wordmark, My library with Change, Account, Reading light, Report a problem / Privacy / About; no side panel, person icon, scan button or account invite) and the shelf with six books a bay (120 px covers from 1280 px, 104 px below). A book, Account settings, Report a problem, Privacy, Terms, About and the account forms open in a 600 px middle slot at their own addresses (`/app/books/…`, `/app/privacy`, …): the column narrows to 248 px and the shelf moves right, cut off, with the open book outlined (D4 push, no motion under reduced motion); ×, Escape, a click on the shelf or Back closes it, focus moves in and back to what opened it; a direct visit shows the shelf with the page open; from a column link while a page is open the new page takes its place. The library picker opens in the left column (D5; a pop-over on the rail) as a history entry, reusing the pop-up's picker. Search results replace the shelf six a bay with "Back to my shelf" beside the library line (D3). Account forms still run without the shelf (App.tsx entry mode); beside them the last shelf drawn in the tab is shown read-only, for the same reader only. Cold open on every width: no empty shelves (D1 superseded); `ColdOpenSuggestions` in `ui/shelf/EmptyShelf.tsx` marks where Part 2's five suggestions go. Playwright: `chromium`, `firefox` and `webkit` now run the existing journeys at 390 × 844 (they are phone journeys); `client/e2e/one-shelf-desktop.spec.js` sets 1440 × 900 and 1024 × 768 itself. Checks: client 305 tests, type checking, build (main JS 408.5 kB, CSS 117.4 kB), SEO 7, browser journeys Chromium + mobile Chromium 270 passed (20 of them desktop), 138 skipped (flag-gated specs; the desktop spec on mobile). Not run: WebKit and Firefox (not installed here). Next: Part 2 (suggestions).

Desktop layout follow-up from the independent check: the rail and wide layouts also need a window at least 480 px tall, so a phone turned on its side keeps the phone layout instead of redrawing the shelf (owner can reverse). Fixed (owner decisions, 14 November): an account form opened with no shelf drawn yet in the tab (an email link, a provider return, a reload) stands alone at desktop widths, centred, with no shelf beside it until it is finished or closed; Escape while typing in any field of a middle-slot page no longer closes the page. Fixed (17 November, branch `claude/desktop-final`, not released), each shown failing first by a Playwright test (`one-shelf-desktop.spec.js` "Desktop layout follow-up", `redirects.spec.js`): (1) a book opened by its address, the library picker, then ×: Back now closes the picker first and the shelf takes the book's place, so no entry for the book is left (it was left at index 0). (2) Crossing 640 px in a tall window keeps the shelf drawn: the phone shelf screen is drawn through the same elements as the rail and wide layouts (`DeskLayout`, wrappers with `display: contents` on phones, so it looks and scrolls as released), so scroll place (the first book in view, `ui/desk/ShelfPlace.tsx`), typed text, focus, a running search and its results survive both ways; nothing moves. (3) One scroll area on the rail: while a page is open the shelf behind it no longer scrolls (it showed a second scrollbar beside the page's); it keeps its place, and its gutter is reserved. (4) Opening a book beside 100 saved books: every cover was drawn again two or three times (every guest change re-read storage and replaced the equal saved list; every address change reached all cover links), and the new slot forced a layout of the whole shelf. Now unchanged lists keep their identity (`keepUnchanged`), covers are memoised, the shelf keeps the address it was drawn for while a page is open (`UNSAFE_LocationContext`, the router's own context), the new slot is not scrolled, and focus and `inert` move at the next frame. Measured at 1440 × 900, 4× CPU, five books opened in turn (`PERF_E2E=true`, `perf.spec.js`, 4 runs): before, longest task per open 50–128 ms (median of each run 57–69 ms); after, no long task in 16 of the 20 opens, and 74–101 ms for the first open of a visit (code run for the first time, router matching, and Playwright's click sent as one task). Guards: the perf test (median under 50 ms) and a unit test that only the opened book's cover is drawn again. (5) The library pop-up from `/app/libraries` opens once: the old address becomes the plain shelf (or book) with the pop-up as its own entry on top, so Back closes it, and a picker entry a book or page was opened beside is passed over when Back, Forward or × returns to it (it reopened before). Checks: client 377 tests, type checking, build (main JS 426.7 kB, CSS 121.6 kB), SEO 7, browser journeys Chromium + mobile Chromium 296 passed, 150 skipped. The client test `/app/search?q=` in `App.routes.test.tsx` sometimes fails when the whole suite runs at once, here and on the base commit alike; it passes alone. Not run: WebKit, Firefox, server tests (server unchanged). Owner review build: the `staging` branch (same commit as this branch), at the Vercel branch address `mybookshelf-git-staging-ddk220.vercel.app` behind Vercel sign-in; accounts are off there.

**Indian library allowlist, states and failure logging, 15–16 November 2026 (branch `claude/india-library-allowlist` from `main`, not deployed):**

*What readers can find*
- The hide list is replaced by an allowlist, `server/data/india-catalogs-listed.json`.
- It holds 4,139 Indian libraries:
  - 1,034 with a strictly verified book: a specific book was searched, its catalog record resolved, and the app's own live lookup answered "found".
  - 3,105 where the 10 November e-Granthalaya audit found books for at least one of fifty titles, with no record or lookup confirmation (`egranthalayaAuditOnly`).
- `tools/catalog-hardening/library-status.mjs` generates the list. A listed ID stays when a later check fails. It leaves only through the hand-kept `removed` list (`id`, `reason`, `date`; empty now), which wins even over a new verification, or when its current status is `blocked` (robots refusal, access challenge, login), which the retained rule never keeps. This changed no listed ID: none of the 4,139 is blocked or retained.
- Unlisted IDs still resolve, and libraries outside India are unaffected.
- The old hidden list now lives at `docs/research/india-library-status/empty-catalogs.json` as evidence.
- Finder totals: India 4,657 → 4,139, all countries 5,042 → 4,524.

*KALNET correction*
- Commit `ad655ab96b` on `main` counted 98 KALNET verifications.
- KALNET's robots.txt says `User-agent: * Disallow: /`. The app never saw it: its robots fetch failed on KALNET's incomplete TLS chain, and RFC 9309 treats an unreachable robots.txt as allow-all for five minutes.
- Those results are withdrawn (`local-20261115-kalnet-withdrawn.json`), KALNET is `blocked`, and the KALNET TLS transport now also covers `/robots.txt`.
- `tools/catalog-hardening/robots-audit.mjs` compared the app's fetch with curl on all 74 listed origins. Before and after evidence: `robots-audit-20261115-*.json`.

*Recovered and not recovered*
- 7 e-Granthalaya libraries recovered from the local recheck.
- Not recoverable:
  - KALNET and SCERT Assam: robots refusal.
  - Goa DHE: too slow, and branch search answers HTTP 410.
  - IIT Madras and National Science Library: campus-only DNS.
  - IDEAL: unreachable.
  - Somaiya: regional CloudFront refusal.

*Connection fix*
- `server/services/providers/network.js` gives library-catalog connections a 2.5 s per-address happy-eyeballs attempt: the fetch dispatcher and legacy-renegotiation agents in `http.js`, the robots.txt read and the KALNET transport. Node's process-wide default is unchanged, so databases and book-metadata reads (Open Library passes `catalogConnection: false`) keep Node's 250 ms.
- Hosts with an unreachable AAAA record and a ~270 ms IPv4 round trip had been failing in under 300 ms.

*States*
- Before: 1,555 listed libraries had no state. Now: 159, of which 151 are LIBMAN tenants. 46 of those had been filled from one town name unique only in the place index (Nerul as Goa, Ghogaon as Madhya Pradesh, both in Maharashtra); an address-place fill now needs two agreeing parts or a district (64 fills dropped, 46 listed).
- Fills come from `server/data/india-library-regions.json`, generated by `tools/directory/india-regions.mjs`. Evidence: each library's published state, a single-state PIN, or address place names (two agreeing parts or a district, never one town name); never a library's name.
- 1,108 e-Granthalaya contact pages were captured politely and kept to address, city and state only.
- See the [regions README](research/india-library-regions/README.md).

*Failure logging for manual review*
- Failed lookups now record an error code (for example `CATALOG_UNAVAILABLE:ECONNREFUSED`) in `library_check_events` (kept 90 days).
- The admin Library health view and `/api/admin/library-health.csv?days=` take a 7, 30, 60 or 90-day window. The CSV adds listing, window and error-code columns.
- The [tracker README](research/india-library-status/README.md) has the review steps.

*Checks*
- Server: 827 passed, 24 database skips, 1 failure. The failure is `admin/admin.test.js:57`, a pre-existing flake that also fails on `main` about 1 run in 5: supertest's `127.0.0.1` connection can land on another local loopback listener.
- Client 303; type checking; build; SEO 7; deployment 4; catalog and directory tooling 28.
- After the state, allowlist-removal and connection fixes (16 November): server 832 passed, 24 database skips, 0 failures; client 303; type checking; build; SEO 7; deployment 4; catalog and directory tooling 34. Browser journeys not rerun.
- WebKit journeys: 121 passed, 5 failed. The same 5 keyboard and focus journeys fail on `main` on this Mac.
- Chromium journeys not run (Playwright Chromium not installed locally).

**Indian library tracker, empty LIBMAN tenants hidden and host recheck, 15 November 2026 (branch `claude/india-library-tracker` from `main`, not deployed):**
The hidden list is now `server/data/india-catalogs-hidden.json`, one list and
one filter with criteria and evidence per platform in its header. It adds the
155 LIBMAN tenants with no verified book whose latest seed searches all answered
with zero records and no errors (147 from the sweep plus 8 host-busy tenants
that came back empty on recheck). IUCAA (`egranthalaya:universities-iucaa`)
passed a one-book check after the audit and is listed again, so 1,889
e-Granthalaya libraries stay hidden: 2,044 in all, none a public guide. Finder
totals: India 4,811 to 4,657, all countries 5,196 to 5,042. A generated
[status tracker](research/india-library-status/README.md) gives every Indian
directory entry a status, recorded reason and revisit date
(`node tools/catalog-hardening/library-status.mjs`). The
[host recheck](research/india-library-hardening/recheck-20261115.md) found IIM
Visakhapatnam answering again (one book verified); KALNET, IDEAL, IIT Madras,
National Science Library, KLH GBS and IIA still unreachable and Somaiya still
CloudFront-refused from the test environment. One production check each: KALNET
answered (not found), so production reaches it; IDEAL and Somaiya couldn't check.
Nothing was found permanently gone. Checks: server 822 passed, 24 database skips
(no test database configured); client 303; type checking; build; SEO 7;
deployment 4; catalog tooling 20. Browser journeys not run.

**Empty e-Granthalaya libraries hidden from finding a library, 15 November 2026 (branch `claude/india-directory-cleanup` from `hardening-indian-libraries`, not deployed):**
The 10 November audit searched all 5,036 e-Granthalaya libraries for fifty titles:
3,135 returned books, 1,890 returned valid empty results for all fifty, 11 had
request or setup errors. By owner decision the 1,890 are listed in
`server/data/india-catalog-hidden.json` and filtered once in
`server/services/directory.js`: left out of pop-up search, browse, near me and
the public API listings, still resolvable by ID and selection link. The 11 stay
listed; none of the 1,890 is a public library page. Library finder totals: India
6,701 to 4,811, all countries 7,086 to 5,196. Evidence:
[audit summary](research/india-library-hardening/egranthalaya-audit-20261110/README.md).
To restore a library, remove its ID from the list once its catalog shows books.
Checks: server 818 passed, 24 database skips (no test database configured);
client 303; type checking; build; SEO 7; deployment 4; audit tooling 13;
Chromium + mobile Chromium 254 passed, 118 env-gated skips.

**Indian library hardening, 15 November 2026 (completed, not deployed):**
`hardening-indian-libraries` carries the runtime fixes (`f29eeda`) and reproducible
evidence (`d3ac08a`) from `harden-india-top50-2026-11-14`, plus
[how access was unlocked](research/india-library-hardening/UNLOCKS.md).
Live evidence: 67 institutions passed ten books each. The frozen size-led cohort
finished at 48/50; National Science Library and IIT Madras remain unreachable
from the test environment. IIT Roorkee and Anna University are explicit extra
ten-book reserves. Mixed collection units and missing physical-size evidence
mean this is not a definitive national ranking. Outside that cohort, 612
connections passed at least one book out of 848 attempted / 1,168 reviewed,
including 19 additional ten-book passes. See the
[method, fixes and evidence](research/india-library-hardening/README.md) and
[validation handoff](research/india-library-hardening/VALIDATION.md).
Server checks: 814 passed, 24 database-dependent skips; audit tooling: 13 passed.
Preserve blocked/unconfirmed outcomes, explicit reserve labels, and institution/
edition identity. The branch is excluded by Vercel's existing deployment rules;
no release or preview is part of this task.

**One-shelf redesign built (phases 0–12), 13 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** The app is now one screen, built to the [plan](plans/2026-11-12-one-shelf-redesign-implementation-plan.md) and the [approved boards](design/2026-11-one-shelf/README.md). What exists: a catalog lookup layer where every platform answers "does library X have book Y" as found / not found / couldn't check within its own request budget (phase 1, `CATALOG_LOOKUP_V2`); a separate anonymous catalog store for six-month answers, library health with the 3-failures-on-2-days flag, the anonymous search log, library requests and problem reports, all failing open (phase 2, `CATALOG_STORE_ENABLED`, `USAGE_LOG_ENABLED`); a backward-compatible browser-storage migration (phase 3); the wooden shelf home with Viewed before, list view and account invite (4); search on the shelf with own books first (5); the scan pop-up (6); the rewritten book page with the library card and the library pop-up, and silent `/select/<slug>` pre-select (7); background library badges on results (8, `HOLDINGS_BACKGROUND_ENABLED`); the side panel, Privacy/Terms/About from `docs/policy/`, Report a problem, small Account settings and Viewed before saved to accounts automatically (9, account migration 012); the owner-only admin view (10, `ADMIN_ACCOUNT_IDS`); cookieless page-visit analytics and Search Console token (11, `VITE_ANALYTICS_ENABLED`, `GOOGLE_SITE_VERIFICATION`). Phase 12 removed the old screens and the `VITE_ONE_SHELF` flag: a default build is the one-shelf app (what staging showed), so production needs no client setting for it (`VITE_ONE_SHELF` is now ignored and can be deleted from Vercel). Removed: tab bar, old shelf, Search, Libraries (map, cards, copy link), Settings, the companion, the old book page and its availability card (`DueSlip`), old account entry forms and their tests/e2e specs; about three quarters of the old stylesheets; `leaflet`. Hidden, code kept: free reading (returns with `VITE_CONTENT_DISCOVERY_ENABLED=true` plus its server settings) and library-catalog search (server `libraryId` path). Old addresses redirect: `/app/search` → shelf with search focused, `?q=` searches once then leaves the address; `?scope=free|papers|knowledge` → free reading only when enabled, else the shelf; `/app/libraries` (`?q=`) → shelf with the library pop-up (text in its field only); `?book=` → that book with the pop-up; `/app/settings` → shelf with the side panel (`#privacy` → `/app/privacy`); `/find` → shelf (now also served by Vercel and `npm start`); `/privacy` (app route) → `/app/privacy`; `/select/<slug>?next=/app/search` → silent select, shelf. Typed text from old addresses passes through same-tab memory only, never history state or storage. Public pages: the landing form is a "Find my library" button (no typed text in a URL), guides link `?next=/app/shelf` and no longer list copy counts, locations or call numbers (seven guide summaries reworded), support page describes the new screens and automatic account Viewed before. Privacy wording: CLAUDE.md and AGENTS.md now state the anonymous-log rule; a router test checks the log gets scrubbed text and never IP, user agent or coordinates. Main JS chunk 504.9 kB → 394.9 kB (155.0 → 124.2 kB gzip), CSS 191.1 → 97.8 kB. Checks: server 767 (database tests run on Postgres 16), client 296, type checking, build, SEO 6, deployment 1, browser journeys Chromium + mobile Chromium: default build 222 passed, free-reading build 286, analytics build 36. Not run: WebKit/Firefox, the real-account harness specs (`accounts-real`, `accounts-visual`, still written for the old account screens). Open for phase 13: the release itself (8.6: publish the policy texts with their effective date, `USAGE_LOG_ENABLED`, analytics, background marks after 48 h), the legal review, account backups/restore, the public landing step "On the shelf, all on loan…", How it works and `/about` copy and `privacy.html` still describe the old model, the account contract documents (PRD AC-11/12, DEC-03/04, ENGINEERING_DESIGN history rows) still say history is opt-in for 30 days, no catalog attribution on the new library card (Calil), CSP still allows the map tile host, removing `/availability` 30 days after release.

**Romain Rolland Library, 12 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** The fifth South India pilot library, Romain Rolland Library in Puducherry (e-Granthalaya `PYLIB:RRLPY`), is in the directory with title search in Tamil script or English letters, record reads and availability (health degraded, 45 s check budget), and has a public guide (twelve guides, nineteen sitemap URLs). e-Granthalaya record pages often come back as an empty page frame (10 of 13 reads in the 12 November probe of three libraries); the adapter now reads such a page once more after 2 s, within the check's request cap, and if it is still empty opens the book from this library's own search row (title, author, ISBN, copy total) and reports "Listed in the catalog" with copy status unknown. Without a remembered search row (another server instance, or more than 30 minutes later) opening the record says the catalog is unavailable, never "not held". ISBN and cluster checks also retry an empty page once. This also applies to Harekrushna Mahtab State Library (Odisha). Replays of saved pages: *Wings of Fire* opens on the second read with one copy available (3 requests); பொன்னியின் செல்வன் record 101722 stays empty and opens from its search row (3 requests). Open: whether a 2 s pause helps live was not measured (the probe's successful second read came about 9 s after the first); the official website https://libraries.py.gov.in/ could not be reached from this environment; ISBN lookup at this library was not exercised; member landing pages take 6–16 s, so whole-work checks may often end as unknown within 45 s; browser journeys were not run.

**South Indian pilot libraries, 12 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** Fixes from the production pilot of Anna Centenary, Kalaignar Centenary, Ernakulam and Visakhapatnam. (1) Work availability checks on catalogs with a structured candidate search (Koha title search, Visakhapatnam) now run title-first and one request at a time: one search, then only rows the search page does not rule out, rows showing one of the work's ISBNs first; they stop at a verified available copy and try ISBNs only when the search found nothing. The check budget comes from `publicCatalogTimeoutMs` (Anna and Kalaignar now 45 s), capped at 45 s, default 20 s. (2) Every check has a hard upstream request cap (6 title-first, 12 other providers) enforced in `providers/http.js`; an exhausted cap is unknown, never "not found". Replays of saved pages: Anna 2 requests (was 3, timed out at 20 s), Ernakulam 4 (was 8–14), Visakhapatnam 1 (was 4). (3) Visakhapatnam: rack/shelf codes ("R11 S224") count as General Section shelves when the page shows that rack under GS or the row's subject says GS; Telugu-script searches return 400 `CATALOG_QUERY_UNSUPPORTED` (the catalog answers HTTP 500) instead of an outage; robots.txt `Crawl-Delay: 20` is honoured between successive requests of one operation and pages are cached for 10 minutes; the author fallback search runs only when a title search is empty. (4) Catalog leftovers are cleaned at the adapter boundary (`providers/catalogText.js`): trailing ISBD "/", NULL authors, edition "0" and physical descriptions, "2008/01/01" and "2019." dates, "GRATIS" formats, one-letter call numbers, and fully capitalised Latin titles. (5) Ernakulam is marked operational with coordinates from its official location map; Anna/Kalaignar notes mention ISBN lookup; Kalaignar Centenary and Ernakulam public guides were added (eleven guides, eighteen sitemap URLs). Open: no saved Kalaignar search page, so its request count is from code (2 requests when the first ISBN-matching record has a copy available, up to 4); Visakhapatnam's search still cannot find native-script titles; Ernakulam records carry no ISBNs, so its matches remain "similar edition"; AGENTS.md still says four India guides; browser journeys were not run.

**Search ranking and grouping, 11 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** Public book search now orders results by text match blended with Open Library reader counts, edition counts and the source's own order; the text filter is unchanged. Author-name searches list the author's best-known works first, and a misspelled search with no direct match also runs the spelling search. Results group by Open Library work ID, otherwise by normalised title, volume and authors; different work IDs never merge. Measured on 52 golden searches with captured responses (`server/services/searchRanking.eval.test.js`): top-1 37 to 51, top-3 41 to 52. An independent check on 22 held-out live searches: top-1 15 to 21. Known gaps: duplicate Open Library work records for one book still show as separate cards (for example three Coelho *Alchemist* cards); a well-known work can appear under a foreign alias title; catalog volumes written only in an unrecognised edition field can still merge; grouping was not seen in a browser with Google Books or library catalog records. Ranking weights were tuned by hand on the golden list. Details in [work-aware search](work-aware-search.md).

**First adoption-readiness fixes, 11 November 2026 (branch `claude/nifty-feynman-4qwocr`, not released):** The [adoption readiness review](plans/2026-11-11-adoption-readiness-review.md) found six things broken or misleading in production; this change fixes them. (1) Free to read returned no books: bundled Gutenberg, Open Textbook Library and Book Dash evidence now stays valid for 30 days instead of 24 hours and search shows "Reading links last checked <date>"; the daily refresh workflow no longer runs the retired StoryWeaver recheck that failed all ten scheduled runs. This changes a documented policy, see `server/data/content/README.md`. (2) A library catalog that fails or times out now shows "<Library>’s catalog isn’t answering" with retry, the library's website and "Search all books instead", never "We couldn’t find this book". (3) After a reload, search keeps the selected library instead of switching to All books; search text is still never stored or put in the URL. (4) The scan sheet's ISBN field is visible again and Enter looks up the ISBN. (5) Hindi and Tamil vowel signs are no longer stripped when matching titles. (6) Counts and dates are formatted ("1 library", "6,700 libraries", "3 Dec 2024"), provider descriptions are shown as plain text, the "No description available." placeholder has no drop cap, and Lamplight error notices and the book page's library prompt are readable. Checks: server tests, client tests, type checking, build, SEO tests and Chromium browser journeys; WebKit was not run in this environment. The complete Gutenberg catalog is still not imported, so famous classics such as Pride and Prejudice remain missing from Free to read.

**Source removal, 7 November 2026:** The owner requested removing the five sources that failed the 20-result target even with checkbox diagnostics. The scoped release removes them from discovery, denies retired search routes and preserves saved-book resolution. 34 enabled sources remain; legacy children’s pilot links redirect to All knowledge, and the other three local catalogs remain available. [Scope and verification](research/free-content/SOURCE_REMOVAL_RELEASE.md). PR #185 is merged at `c801088` and deployed as `dpl_4VSELLwipf6YMPAZRJNGikJ1UHrw`. All five retirement guards and the 34-source directory passed hosted checks; retained NASA pagination and saved OpenStax resolution also pass. Research scheduling remains paused.

**Full-collection release, 6 November 2026:** PR #182 is merged at `3cc37e6` and deployed to mybookshelf.cloud as `dpl_Fcr6nFnKSB63LFjwHDNAjA3YouV2`. All 18 added connectors passed anonymous production searches; 39 sources are enabled in total. Full CI and mobile WebKit source-link checks pass. The owner’s full-collection restriction excludes limited research subsets. [Release scope, production evidence and exclusions](research/free-content/FULL_COLLECTION_RELEASE.md). The two public-ID secret-scanning false positives were resolved with explicit owner approval. Research scheduling remains paused.

**Metadata search release, 6 November 2026:** Five completed connectors are integrated for production release: Open Book Publishers, Helsinki University Press, Project Madurai, OpenStax and Sugamya Pustakalaya. Live queries, detail/source links, client/server tests, type checking, build, SEO and desktop/mobile browser journeys pass. [Release scope and evidence](research/free-content/METADATA_CONNECTOR_RELEASE.md). Released as PR #180/main d406469 to mybookshelf.cloud, Vercel deployment dpl_9ACDFzr9QNmqq9yNg4hzzKCcq9EZ. All five anonymous production queries and four detail lookups pass; iPhone/WebKit source-link journeys pass. There are 21 enabled app sources. The separate research branch owns the 44-item recovery goal. Earlier entries are historical.

**Cross-source knowledge search, 2026-11-05:** the owner authorized implementation and production release in the separate `feat/free-knowledge-search` worktree. [Release design and verification](research/free-content/KNOWLEDGE_RELEASE.md) records the new All knowledge view, ten additional supported integrations, independent source paging/errors, policy exclusions and hosted release state. The research registry completion goal continues separately; no candidate count is treated as proof of production readiness.

**Current free-content direction, 2026-11-03:** the owner requested a simpler
free live implementation with no datastore until a specific need is proven.
Use [the active plan](research/free-content/SIMPLE_LIVE_PLAN.md) / #156 on
`research/free-content-discovery-live` in the existing free-content worktree.
Replace Redis/federated sessions with one live source and signed provider paging;
retain provider cost/access rules. Older Redis release gates below are superseded.
Do not provision storage or change existing account resources/security.

Updated 2026-11-05. Active repository:
**https://github.com/ddk220-light/MyBookshelf-web**, default branch `main`.
The owner has chosen to do all future web work in this repository. Build, test,
plan and implement here directly. Do not depend on the previous private checkout
or copy its Git history/native applications into this repository.

**Current account rollout, 2026-11-05:** email accounts are enabled at
`https://mybookshelf.cloud`. Real received-mail signup/verification/recovery,
cross-device shelf/library sync, history consent, profile/email/password changes,
export, session revocation and native-worker deletion cleanup have been exercised.
Release acceptance found and repaired startup-verification, aged-session settings
and deletion-confirmation defects (#163/#172/#175/#176). The existing Vercel project
now connects to `MyBookshelf-web/main`. Google/Apple remain disabled by owner choice.
Read the [release acceptance](accounts/RELEASE_ACCEPTANCE.md) and
[current production record](accounts/PRODUCTION_ROLLOUT.md). Actual Neon history/
snapshot settings and a second operator's restore exercise remain open; the full
project is not declared complete. Preserve unrelated free-content work.

## 13 November 2026: one-shelf release to production

- Rollback point: Production deployment `dpl_BjQWfUieszCG3iNFJPEL4MsrRivJ` (commit `8337f50a`). Vercel Instant Rollback to it restores the old app; database changes below are not undone and the old app ignores them.
- Accounts database (production and staging): migration `012-viewed-before.sql` and the grants applied; 12 migrations recorded.
- Catalog database `mybookshelf-catalog`: schema and grants on the main branch; production uses the main branch with its own role passwords, previews use the `preview` branch.
- Production settings added: catalog store on, usage log on, policy effective date 13 November 2026, admin owner account, background badges off for the first 48 hours, analytics off until Web Analytics is enabled for the project.
- Legal review of `docs/policy/` is deferred by the owner's decision to release now; complete it and publish any changes with a new effective date.
- Not yet set up: the nightly accounts backup (job is off until its secrets exist), Search Console verification.
- Follow-ups: turn on `HOLDINGS_BACKGROUND_ENABLED` after 48 hours; remove `/availability` on 13 December 2026; restore drill once the backup runs.

## What is implemented

The anonymous React/Vite app and Express catalog API, work/edition discovery,
browser-saved shelves, library selection, desktop/mobile reading layouts,
three reading lights, static public pages and SEO metadata are present.
App routes live under `/app/` and are noindex. Failed catalog requests mean
unknown; cached availability has last-result context and refreshes on book open.

The public guides are Anna Centenary, Kalaignar Centenary, Ernakulam Public,
Visakhapatnam, Aliah University, IIT Bhubaneswar, Alameda County, San Mateo
County, San Francisco, Santa Clara County, Setagaya City and Romain Rolland
(Kalaignar, Ernakulam and Romain Rolland added 12 November 2026). This is **SEO publication only**: other libraries stay
searchable/selectable inside the app. `shared/seo-libraries.json` is the gate.
There are nineteen indexable public URLs. Unpublished guide paths return 404.

Code licence is AGPL-3.0-only. Original directory contributions use CC BY 4.0;
third-party material keeps its own terms. About identifies Deepak Ravikumar,
Product Manager, using the public contact details already supplied by the owner.

The UI follows Claude's reference layouts, with product decisions reconciled in
[seo/IMPLEMENTATION_PLAN.md](seo/IMPLEMENTATION_PLAN.md). No numerical 99% pixel
match has been demonstrated. [The screen review](seo/SCREEN_REVIEW.md) explains
the intentional differences and [the reference boards](design/2026-10-mobile/index.html)
are available here without the private branch.

## Release state: recheck before changing production

The owner authorized the free-content merge/deployment on 2026-11-01. Its
[release record](research/free-content/RELEASE.md) identifies the existing
production project/domain and rollback deployment. PR #110 now targets `main`
and integrates the account production baseline at `7ab9d89`. Actual deployment
and hosted checks are recorded in [#127](https://github.com/ddk220-light/MyBookshelf-web/issues/127).
The release is now merged at `1c16815` and deployed on `mybookshelf.cloud` with
four book sources enabled; live papers remain disabled pending Redis. The owner
then reported irrelevant free-book results and the misleading paper-outage UI.
The fix is on `research/free-content-discovery-relevance` in the same worktree,
tracked by [#154](https://github.com/ddk220-light/MyBookshelf-web/issues/154).
Read [search relevance and verification](research/free-content/SEARCH_RELEVANCE.md).
The following older release observations are historical checkpoints.

- Reviewed preview: https://mybookshelf-jh0o69edr-ddk220.vercel.app/,
  deployment `dpl_4WuSysFWU4wQhHqNhEGksvU7W9FA`, application commit
  `02aa0d6d7673c449d1b138b38c64053b0d7bc29c`.
- Public baseline `83b481d22a72525048051702ac562695299435d8` adds a test-fixture
  ordering fix. Its CI run succeeded:
  https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41180235295.
- Last release verification recorded a passing client suite, 484 server tests,
  318 browser scenarios and 168 layout captures. See
  [seo/VALIDATION.md](seo/VALIDATION.md) and its evidence; these are dated results,
  not a claim that a future commit has been tested.
- Vercel project `mybookshelf` was checked again during this handoff. It still
  connects to the original `MyBookshelf` repository, production branch `main`.
  Production is `dpl_G6GaQUUqD7q6w7s8BcmX5n3EyHBd` at the time of checking.
  Moving development here does not switch that deployment connection.
- Remaining launch actions: verify a fresh public-repo preview, reconnect the
  existing Vercel project to this repo when releasing, retain domains and server
  credentials, verify production URLs/headers/source commit, recheck catalog
  connections, and complete Search Console/Bing ownership and sitemap submission.
  Repository protection and vulnerability-reporting settings also need owner
  administration. Keep the previous production deployment as the rollback target.

## Free-content discovery: implementation in progress

The [source research](research/free-content/README.md) covers free ebooks,
scientific papers, textbooks, children's books and related collections. It
defines metadata imports plus bounded live API search, with reading links to
original hosts. This chat is exclusively for the free-content feature; account
work belongs to its separate branch and project.

Branch `research/free-content-discovery` was recreated on this repository after
the previous environment's unpushed commit `ee7d88e` could not be recovered.
The documents and historical probe outcomes were reconstructed from the retained
conversation; the original raw responses and complete fetch ledger are unavailable.
The research overview records these limits. Future work continues here directly.

UI artifacts and implementation are approved (2026-11-01):
[boards and implementation handoff](design/2026-11-free-content/README.md), with
the owner's nine decisions. Worktree: `/workspace/MyBookshelf-web-free-sources-implementation`;
branch: `research/free-content-discovery-implementation`, based on approved
artifact commit `760863a`. Track [project 4](https://github.com/users/ddk220-light/projects/4)
and [index #73](https://github.com/ddk220-light/MyBookshelf-web/issues/73).

Implemented: source-native identity/access contracts, bounded official Gutenberg
metadata import and local search/resolve, Europe PMC adapter and atomic shared
Redis coordination, search scopes, content reader pages and browser shelf v2
migration. The optional library bridge requires exact ISBN/work evidence.
See [implementation decisions and story state](research/free-content/IMPLEMENTATION.md)
and [validation](research/free-content/VALIDATION.md). Open Textbook Library is
implemented with 1,909 real metadata records, combined catalog search and ISBN
links. DOAJ, arXiv and OpenAlex adapters, bounded multi-source paging, shared
record caching, source progress and source-only retry are implemented and tested.
The reviewed children’s pilot now has source records; intended hosted enablement is pending.

The pilot now contains three reviewed real English/Hindi/Tamil source records,
with exact current credits, levels and original-story relations. The owner has
accepted free source login; cards and reader actions disclose that requirement.
Post-login reading has not been tested. Source research and curation belong to
Codex; no owner-supplied feed or metadata is pending. See [the source review gate](research/free-content/CHILDREN_REVIEW.md).
Latest UI review: 537 server tests, 141 client tests, 262 broad desktop/mobile
browser journeys, 50 final feature browser checks and 84 board/theme/device
captures pass, with typecheck/build/SEO/deployment. See the [screen comparison](research/free-content/UI_REVIEW.md).
The unchanged importers previously passed 12 Python checks; workflow lint passed.
All-source exact lookups and a 40-result real-paper flow
also passed locally with actual Redis; this is separate from hosted enablement.

Book Dash now adds 30 real English-language editions with original creator roles
and anonymous reading links; see [additional sources](research/free-content/ADDITIONAL_SOURCES.md).
The four local book sources contain 2,942 metadata records in disclosed subsets.

Both client and backend flags default off. Live paper search additionally needs
shared Redis REST credentials and explicit budget configuration; no hosted store
has been provisioned. The local Gutenberg snapshot needs daily refresh because
positive access evidence expires after 24 hours. A reviewed daily refresh workflow
is implemented; it becomes schedulable only when merged onto the default branch.
It proposes a draft metadata PR and runs CI. Production enablement and verification
for the owner's authorized release are tracked in the [release record](research/free-content/RELEASE.md).

## Account work: implemented; staging release exits pending

Deepak approved the document packet and Claude canvas v4 at R02 (`36a1436`),
then authorized progressive story/task implementation. Feature code in
[PR #57](https://github.com/ddk220-light/MyBookshelf-web/pull/57) now includes
email/password, Google/Apple protocol and method management, verified email
change, private library/shelf/history, explicit guest import, identity-isolated
UI, streaming export, durable deletion, independent restore suppression and
bounded maintenance tooling. See [implementation](accounts/IMPLEMENTATION.md),
[validation](accounts/VALIDATION.md) and [operations](accounts/OPERATIONS.md).

Node 22 checks include 514 server tests with actual local Postgres roles and
143 client tests, type checking, production build and zero audit findings.
Browser and hosted evidence are dated in VALIDATION.md; controlled provider/mail
transports do not prove live delivery. Guest/public behavior and exact catalog
identities remain required contracts.

The subsequent [account screen review](accounts/SCREEN_REVIEW.md) fixes form/card
layout, field/focus errors and failed clear/import retries, adds paired artifact
captures, and checks narrow/zoomed layouts in three lights. The owner's phone-type
review sets account headings to 28px with 16px body/input text. Default-size images
and enlarged-text stress images are labelled separately in the gallery.

Isolated staging uses `mybookshelf-accounts-staging` in iad1, Neon and a separate
private deletion ledger. Real staging migration checksums 001–011 match the repo;
private ledger writes/reads/encrypted cleanup and anonymous-read denial pass.
Runtime credentials are Preview/account-settings only, administrator Development
only. Existing production resources/Git connection remain unchanged.

## Resume this free-content branch

1. Use `/workspace/MyBookshelf-web-free-sources-implementation` on
   `research/free-content-discovery-relevance`, based on released main `1c16815`.
   [PR #110](https://github.com/ddk220-light/MyBookshelf-web/pull/110) is merged.
   Preserve other worktrees and use #154 for the relevance/disabled-state repair.
2. Read [implementation/story state](research/free-content/IMPLEMENTATION.md),
   [operations](research/free-content/OPERATIONS.md) and
   [validation](research/free-content/VALIDATION.md). Existing native tasks belong
   to [project 4](https://github.com/users/ddk220-light/projects/4) / index #73.
3. The owner postponed hosted Redis configuration. The existing OpenAlex key is
   present and accepted. Free source login is explicitly allowed; do not ask the
   owner to curate the children’s records. See #139 and the current source evidence.
4. Complete the remaining FCD07 hosted checks when Redis is configured; local
   book catalogs and the reviewed children’s set remain independent of Redis.
   Keep the bounded Gutenberg subset/OTL export coverage explicit. Account work
   has its own branch/project; its historical planning section above is context.

## Account release context
The owner subsequently instructed: Resend only for production; keep Google/Apple
disabled and add their credentials later. These are deliberate activation deferrals,
not current staging setup requests. Live staging capabilities confirm all three
methods remain disabled. The GitHub workflow is an optional staging scheduler;
its Actions-secret HTTP 403 does not require a permission change to finish coding.
See [current rollout choices](accounts/OPERATIONS.md#owners-current-rollout-choices).
Production still needs real mail, active cleanup/alerts, hosted backup/restore,
retention proof and final accessibility/operator/R03 review before account enablement.
Provider-specific live checks apply before those methods are enabled later.

Worktree: `/workspace/worktrees/MyBookshelf-web-account-settings`, branch
`account-settings`. The existing
[project](https://github.com/users/ddk220-light/projects/3) tracks epics, stories,
progressively linked tasks and remaining validation.

## This handoff's verification

The public repo matched the latest reviewed web export. An additional startup
audit found and fixed its missing local environment loader; a real-server smoke
test now runs with the standard suite. Fresh Node 22 install, client type check,
120 client tests, 485 server tests, production build, SEO/deployment checks,
documentation/reference link checks and secret scan passed. No browser UI code
changed in this handoff. See [the audit](development/2026-10-31-repository-handoff.md).
