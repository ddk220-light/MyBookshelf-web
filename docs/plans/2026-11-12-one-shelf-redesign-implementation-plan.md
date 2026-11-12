# One-shelf redesign: implementation plan

Date: 2026-11-12, revised the same day after the owner decisions listed below.
Branch at time of writing: `claude/nifty-feynman-4qwocr`.
Design: `docs/design/2026-11-one-shelf/` (the approved HTML mockups; `canvas.json`
lists the screens). Where a mockup and the owner decisions differ, the
decisions win. Known differences are listed in section 9.

Owner decisions made after the first version (authoritative; every section
below follows them):

1. Stored library answers: "found" and a definite "not found" are both kept
   for six months. Failed or timed-out checks are never stored as answers.
2. Failed and timed-out checks are logged per library in a health record, with
   a flag when a library fails on several separate attempts across a few days.
3. There is no "one catalog query per search" rule. Each platform gets its own
   lookup strategy and request budget (section 5).
4. The first phase rebuilds the catalog lookup layer, before any UI work.
5. Privacy model (section 4.6): cookieless anonymous analytics; anonymous
   operational logs including search text (no account ID, IP or device
   identifier; 12 months, then totals); accounts hold only the reader's own
   data, with Viewed before saved automatically when signed in; location used
   once and not stored; library requests store text and a count only.
6. Age: no gate. The Terms say the reader is 18 or older or has a parent's or
   guardian's permission. Account-database backups and a restore test are
   release prerequisites.
7. Desktop layout, Lamplight and Ink, and the landing page redesign move to
   the backlog (section 11).
8. Storing library answers is acceptable unless a library explicitly forbids
   it; the opt-out file and purge stay.

Guiding rule for every screen: fewer taps, less text, give tools and let the
reader decide. No explanatory sentences.

---

## 1. Summary

For a reader, MyBookshelf becomes one screen: a wooden bookshelf with a search
bar (scan button inside) at the top and a person icon that opens a side panel.

- No bottom tab bar. Search and Libraries are no longer pages. Settings is the
  side panel.
- The shelf shows saved books as face-out 3D covers, then a "Viewed before" row
  of spines. Nothing is written under books. A list view is one tap away.
- Searching slides the shelf away and drops nine result covers in. Search
  always uses public book data (Open Library, then Google Books). The reader's
  own matching saved books come first with a bookmark badge.
- With a library chosen, results quietly gain a small library badge when the
  library has the book. The book page says only "found", "not found", or
  "couldn't check" for the chosen library. No copies, due dates, floors or
  shelf numbers anywhere.
- Scanning is a pop-up. Choosing a library is a pop-up. A library that is not
  in the directory can be requested with one tap.
- Behind the screens, every library platform answers through one internal
  question, "does library X have book Y", with three outcomes: found, not
  found, couldn't check. Each platform uses its most effective way to answer
  it, within its own request budget.
- A new small database stores "library X has (or does not have) book Y" for
  six months, a health record per library, an anonymous search and
  library-check log, library requests and problem reports, and serves an
  owner-only admin view.
- Anonymous, cookieless visit counts. Short Privacy, Terms and About pages
  (drafts in `docs/policy/`).
- Mobile first. Desktop layout, the two dark reading lights and the landing
  page redesign follow after the mobile version is final (section 11).

---

## 2. Current state

### 2.1 Client (`client/src/v2/`)

Routes are defined in `client/src/v2/App.tsx` inside `AppFrame` and
`LibraryStateProvider`:

| Route | Component | Fate |
|---|---|---|
| `/app` | redirect to `/app/shelf` | keep |
| `/app/shelf` | `ui/shelf/ShelfPage.tsx` | replaced by the one-shelf home |
| `/app/search` (+ `?scope=free\|papers\|knowledge`, `?q=`) | `ui/scan/ScanPage.tsx` → `LibraryScanPage`, `ui/content/ContentSearchPage.tsx`, `ui/content/KnowledgeSearchPage.tsx` | redirect; content pages hidden behind flag |
| `/app/libraries` (+ `?q=`, `?book=`) | `ui/library/LibrariesPage.tsx` (+ `useLibraryDiscovery.ts`, `LibraryCard.tsx`, `LibraryDetail.tsx`, `LibraryMap.tsx`) | redirect; logic reused in the library pop-up |
| `/select/:slug`, `/select` | `ui/library/SelectLibraryPage.tsx` (confirmation sheet) | becomes silent pre-select |
| `/app/settings` | `ui/settings/SettingsPage.tsx` | redirect to shelf + open side panel |
| `/app/settings/account` | `ui/account/AccountSettingsPage.tsx` (1,034 lines: profile, email change, password, sessions, history consent, export, providers, deletion) | becomes the small Account settings page |
| `/app/account/*` (sign-in, sign-up, verify, forgot-password, reset-password, email-change, return, complete-profile, deletion, import) | `ui/account/AccountPages.tsx`, `AccountEntryGate.tsx`, `DeletionStatusPage.tsx` | keep, restyle to `AccountStates` |
| `/app/books/:bookKey` | `ui/book/BookPage.tsx`, `useBookScreen.ts`, `ui/journal/DueSlip.tsx` | rewritten |
| `/app/read/:contentKey` | `ui/content/ContentDetailPage.tsx` | keep (opens saved free items) |
| `/find`, `/privacy` (→ `/settings#privacy`, a broken target), `/login`, `/connect` | redirects / `NativeAppNotice` | `/find` and `/privacy` fixed, see Phase 12 |

Frame and shared UI: `ui/AppFrame.tsx` (reading light context, keyboard
shortcuts, document titles, storage/undo notices), `ui/TabBar.tsx` (four tabs;
desktop sidebar with account and support links), `ui/Sheet.tsx`,
`ui/ConfirmDialog.tsx`, `ui/Notice.tsx`, `ui/BookCard.tsx` (`Cover`,
`BookCard`), `ui/shelf/Spine.tsx`, `ui/shelf/shelfLayout.ts`,
`ui/shelf/spineColors.ts`, `ui/DogAnimation.tsx` + `Bucky.tsx` +
`dogAnimation.ts` (the "Bucky" companion), `ui/icons.tsx`,
`ui/library/CopyLibraryLink.tsx`, `ui/LibraryAttribution.tsx`.

The "due slip" (`ui/journal/DueSlip.tsx`) is not a journal feature. It is the
book page's availability card (`catalogStatus`, `CatalogDetails`: copies,
locations, call numbers, not-for-loan notes) and the shelf list's "Last
result" line.

State and storage:

| Key | Module | Contents |
|---|---|---|
| `mybookshelf.anonymous-web.v1` (VERSION 2; reader accepts 1 and 2, anything else is "corrupt" → recovery mode) | `localState.ts` | `selectedLibraryId`, `recentBooks` (≤50), `savedBooks` (guest cap `SAVED_BOOKS_CAP` = 100), `savedContent` |
| `mybookshelf.reader-preferences.v1` | `readerState.ts` | `shelfView` (`shelf`/`list`), `shelfSort`, `selectedLibrary {id,name}` |
| `mybookshelf.availability.v1` | `readerState.ts` | cached availability details per library/book |
| `mybookshelf.lookup-preferences.v1` | `readerState.ts` | per-book edition scope (`work`/`exact`) and language |
| `mybookshelf.appearance.v1`, `mybookshelf.anonymous-web.reading-light` | `readingLight.ts` | `daylight`/`lamplight`/`ink`/`system` |
| `mybookshelf.anonymous-web.dog-animation` | `dogAnimation.ts` | companion on/off |
| `mybookshelf.local-guest-override.v1`, `mybookshelf.guest-write.v1` | `auth/AccountSessionProvider.tsx`, `storage/guestLock.ts` | account/guest coordination |

Search results live in memory only (`searchMemory.ts`, keyed by a
`candidateId` in history state; five cards per step). Today search text is
never stored or put in the URL, except the legacy `?q=` entry handled by
`ScanPage` (and the hidden free-content scopes, see 4.6.2). Decision 5 changes
the storage half of this rule (4.6); the URL half stays. `context.tsx`
chooses `GuestLibraryStateProvider` or
`storage/AccountLibraryStateProvider.tsx` (signed-in readers sync shelf,
library and opt-in history through `/api/account/*`).

Client flags (build-time Vite): `VITE_CONTENT_DISCOVERY_ENABLED` (free to read,
papers, all knowledge, `AlsoFree`), `VITE_CHILDREN_PILOT_ENABLED`,
`VITE_DEPLOYMENT_ENV`, `VITE_SOURCE_URL`.

### 2.2 Server (`server/`)

- `server/application.js` composes `anonymousApp.js` with account health, jobs
  and account middleware. `server/vercel.js` is the single Vercel function
  (`maxDuration` 120 s, region iad1).
- `/api/v2/*` (`public-v2/router.js`) is deliberately isolated from cookies,
  auth and databases. Routes: `places/search`, `libraries/discover`,
  `libraries/areas`, `libraries/search`, `libraries/browse`,
  `libraries/resolve`, `libraries/resolve-link`, `books/search` (public data,
  or a library catalog when `libraryId` is given), `books/enrich`,
  `books/resolve`, `availability`, and content routes from
  `public-v2/content.js`. Per-instance IP limit of 60 requests/minute.
- Availability: `public-v2/availability.js` resolves the book, then either a
  work-level title-first search (`services/libraryBookSearch.js`
  `searchLibraryBook`, budget 20 s default, 45 s maximum, 6 or 12 upstream
  requests) or a single provider check. A failed or timed-out check is
  `unknown`, never "not found". `not_found` is only accepted for an exact ISBN
  with `recognizedExact`. It keeps a per-instance last-known map (512 entries,
  24 h) only as stale fallback.
- Providers: `services/providers/index.js` maps the directory `platform` to
  adapters. Title/candidate search exists for Koha (title-search libraries),
  Visakhapatnam, BiblioCommons (`searchBookCandidates`), e-Granthalaya,
  IndCat, Libman, VuFind and the discovery adapters. Chamo, LibSys, Vega,
  Aspen, Calil, Evergreen and ISBN-only Koha are ISBN lookups only.
  `providers/http.js` gives per-operation request caps, Crawl-Delay pacing,
  per-instance queues and a 60 s in-memory cache. The full inventory, by
  platform and connection type, is in 5.1.
- Directory: `server/data/libraries.json` (536), `india-catalogs.json`
  (5,659), `discovered-catalogs.json`, `india-places.json`; projected by
  `public-v2/directory.js` `toPublicLibrary`. There is no library icon or logo
  field and no "do not store" or robots field anywhere in the directory.
- Accounts: `server/accounts/*`, `server/auth/*`, `server/jobs/*`,
  migrations `server/db/migrations/001`–`011`, runner `server/db/migrate.js`,
  grants `server/db/runtime-grants.sql`.
- Cron: `vercel.json` runs `/api/internal/account-jobs` every five minutes.

### 2.3 Accounts system: what exists

| Item | Finding |
|---|---|
| Auth library | Better Auth 1.7.14 (`better-auth`, `@better-auth/core`), email and password. Google/Apple code present, disabled by owner choice. |
| Database | PostgreSQL via `pg` 8.23.1. Production: Neon project `misty-cake-69893992` on the **Free plan** (per `docs/accounts/PRODUCTION_ROLLOUT.md`); separate staging project. Separate login roles for auth, reading and worker, none BYPASSRLS; FORCE row-level security on private tables. |
| Other services | Resend for mail; Vercel Blob as an independent deletion ledger; Vercel Cron every 5 minutes. |
| Enabled in production | Yes, since 2026-11-05 (`ACCOUNTS_ENABLED=true`, email only). Open exits: Neon history/snapshot retention evidence and a second operator's restore exercise. AGENTS.md says R03 still gates production release, while STATUS records it as live; treat as live but not formally closed. |
| Tables | Better Auth `user`, `session`, `account`, `verification`, `rateLimit`; app tables `app_users`, `user_settings` (incl. `history_enabled`, default **false**), `user_libraries` (selected library), `book_refs`, `user_books` (saved books, cap 1,000 per account), `recent_book_views` (only when history is enabled), `guest_imports`, `account_operations`, `account_rate_buckets` (keyed digests, no raw IP/email), `account_provider_intents`, `account_deletions`, `account_provider_cleanup`, `account_job_health`, mail jobs and email challenges. |
| Client API | `/api/account/state`, `/library`, `/books`, `/books/undo`, `/books/clear`, `/history`, `/history/views`, `/history/settings`, `/history/clear`, `/imports`, plus sign-up/in/out, verify, recovery, password, email change, sessions, export, deletion. |
| Tests | `server/accounts/*.integration.test.js` skip without `ACCOUNT_TEST_DATABASE_URL`; CI (`.github/workflows/web.yml`) runs them against a `postgres:18` service. E2E: `client/e2e/accounts-real.spec.js`, `accounts-visual.spec.js`. |

### 2.4 Tests and journeys today

- Server: `npm test --workspace=server` runs an explicit file list in
  `server/package.json` (`public-v2/*.test.js`, `services/*.test.js`,
  `services/providers/*.test.js`, `services/content/*.test.js`,
  `accounts/*.test.js`, and three root files). New folders must be added there.
- Client unit (Vitest): `BookFirstFlow.test.tsx`, `LibrariesPage.test.tsx`,
  `LibraryLinks.test.tsx`, `recovery.test.tsx`, `localState.test.ts`,
  `searchGroups.test.ts`, `searchMemory.test.ts`, `camera*.test.*`,
  `ui/shelf/ShelfPage.test.tsx`, `ui/book/BookPage.test.ts(x)`,
  `ui/scan/ScanPage.catalogDown.test.tsx`, `ui/journal/DueSlip.test.tsx`,
  `ui/content/ContentFlows.test.tsx`, account tests, `readingLight.test.ts`,
  `dogAnimation.test.ts`.
- E2E (Playwright, `client/e2e/`, projects chromium, mobile-chromium (Pixel 5),
  firefox, webkit; reduced motion forced on in `playwright.config.js`): 32
  specs, fixture `public-v2-fixture.js`. See 8.2 for the rewrite map.
- SEO: `tools/seo/build-pages.mjs` + `build-pages.test.mjs`,
  `client/e2e/seo-launch.spec.js`. Guide pages link to
  `<selectionPath>?next=/app/search`; the landing hero form posts the typed
  library text to `/app/libraries?q=` (library search text in a URL, which the
  standing rule forbids; fixed with the landing page redesign, backlog in
  section 11).

---

## 3. Target architecture

### 3.1 Client routes

| Route | Screen |
|---|---|
| `/app/shelf` (canonical; `/app` redirects) | Home: top bar + shelf, with search, results, scan pop-up, library pop-up and side panel as overlays |
| `/app/books/:bookKey` | Book page |
| `/app/settings/account` | Account settings (Change password, Delete account) |
| `/app/report` | Report a problem |
| `/app/privacy`, `/app/terms`, `/app/about` | Short Privacy, Terms and About pages (section 10) |
| `/app/account/*` | Unchanged paths, restyled |
| `/app/read/:contentKey` | Kept for saved free items |
| `/app/admin` | Owner-only admin view (lazy chunk, not linked) |

Overlays (scan, library picker, side panel) do not get paths. Each opening
pushes a history entry with `state.overlay = 'scan' | 'library' | 'panel'`, so
the Android back button and browser Back close them. Search is also a history
entry (`state.search = { candidateId }`), so Back from a book returns to the
results, and Back from results returns to the shelf. Search text stays out of
the URL.

### 3.2 Component tree (new files under `client/src/v2/ui/`)

```
home/HomeScreen.tsx         one screen: TopBar + ShelfStage
home/TopBar.tsx             person icon, SearchBar, library name line (plain text)
home/SearchBar.tsx          input, clear (×), scan button inside
home/ShelfStage.tsx         slide container: saved shelf ↔ results (motion off under reduced motion)
shelf/Bookcase.tsx          3D bays, face-out covers, virtualised rows
shelf/BookCover3D.tsx       cover with page edges; typeset fallback; badges slot
shelf/SpineRow.tsx          "Viewed before" spines + Clear
shelf/ShelfList.tsx         list view (cover thumb, title, author)
shelf/ViewSwitch.tsx        shelf/list toggle
shelf/EmptyShelf.tsx        "Ready to search" + two buttons + empty bays
shelf/AccountInvite.tsx     "Take your shelf with you" card
search/ResultsShelf.tsx     nine covers or list; ghost books; empty and error states
search/useBookSearch.ts     public search, own-shelf matches first, abort
search/useLibraryMarks.ts   holdings lookup/stream, cancel on pick
scan/ScanDialog.tsx         camera frame, ISBN field, all scan states
library/LibraryPickerDialog.tsx  near me + typed search in one list; request button
book/BookPage.tsx           rewritten
book/LibraryAnswerCard.tsx  found / not found / couldn't check / checking / no library
book/SaveButton.tsx         Add to my shelf ↔ On my shelf, tick animation
panel/SidePanel.tsx         account block, My library + Change, Reading light, rows
panel/ReportProblemPage.tsx, panel/PrivacyPage.tsx, panel/TermsPage.tsx, panel/AboutPage.tsx
analytics.ts                cookieless analytics loader + URL scrubbing (4.6.1)
account/AccountSettingsSmall.tsx  Change password, Delete account
admin/AdminPage.tsx         lazy
```

Reused unchanged or lightly changed: `camera.ts`, `barcodeDecoder.ts`,
`useLibraryDiscovery.ts` (minus area browse UI), `searchGroups.ts` (display
grouping only), `spineColors.ts` (typeset cover colours), `format.ts`,
`readingLight.ts`, `api.ts` (new methods), `auth/*`, `storage/*`.

### 3.3 Client state

- `LibraryStateProvider` (`context.tsx`) stays the single source for shelf,
  viewed-before and selected library, for guests and accounts. Signed-in
  readers' Viewed before comes from the account (`/api/account/history`) and
  every book open is recorded there automatically (4.7); guests keep the
  local list.
- New `holdings.ts` store (in memory, React context): map
  `libraryId|bookKey → 'found' | 'not_found' | 'unconfirmed' | 'unknown' | 'checking'`.
  Cleared on library change. Fed by `/holdings/lookup` (shelf),
  `/holdings/search` (results) and `/holdings/check` (book page).
- Saved-book identity: a book is "on my shelf" if a saved item has the same
  `bookKey`, or the same `isbn13`. No title or author comparison. Saving an
  item already on the shelf is a no-op that shows "On my shelf".
- Own matches in search: saved books whose title or author contains every
  query word (normalised, Latin accents folded) are listed first with the
  bookmark badge; public results with the same `bookKey` or `isbn13` as a
  saved book are dropped from the public list (they are already shown).

### 3.4 Local storage shape and migration

Do **not** bump `mybookshelf.anonymous-web.v1` VERSION. The current reader
treats any version other than 1 or 2 as corrupt and opens recovery mode, so an
old bundle (rollback, stale tab) would lock the reader out. Keep the record
byte-compatible and put new fields in a new key.

| Key | Action |
|---|---|
| `mybookshelf.anonymous-web.v1` | Unchanged shape. `savedBooks` = shelf, `recentBooks` = Viewed before, `selectedLibraryId` = chosen library, `savedContent` kept and shown on the shelf as typeset covers opening `/app/read/:key`. On first read, de-duplicate saved books by `bookKey` (keep the newest). |
| `mybookshelf.one-shelf.v1` (new) | `{ version: 1, accountInviteDismissed?: true, migratedAt }`. Unknown fields ignored. |
| `mybookshelf.reader-preferences.v1` | Keep `shelfView` (default `shelf`) and `selectedLibrary` display cache. `shelfSort` no longer shown; shelf order is most recent first. |
| `mybookshelf.availability.v1`, `mybookshelf.lookup-preferences.v1` | Remove once, in the migration (they hold copy counts and edition settings that are no longer shown). Also remove from `setReaderIdentityScope`. |
| `mybookshelf.anonymous-web.dog-animation` | Remove once (companion retired, see Phase 12). |
| Reading-light keys | Unchanged. |

Existing saved books keep working: ISBN keys, Google volume keys and catalog
record keys (`v1:catalog:<library>:<record>` saved from library-scope search)
all still resolve through `/books/resolve`. Signed-in readers need no
migration; their data is on the server.

### 3.5 Server API changes

New routes under `/api/v2` (still cookie-free; they use the new catalog store,
never the account database):

| Route | Body | Response | Notes |
|---|---|---|---|
| `POST /holdings/lookup` | `{ libraryId, books: [{ bookKey, isbn13?, workId? }] }` (≤100) | `{ answers: { [bookKey]: 'found' \| 'not_found' } }` | Database only, no catalog request. Used for shelf badges. |
| `POST /holdings/search` | `{ libraryId, query, books: [...] }` (≤12) | NDJSON: `{type:'mark', bookKey, answer:'found'}` … `{type:'done', unchecked:[...]}` | Background check for results, 5.7. Uses the platform's marking strategy (5.3). |
| `POST /holdings/check` | `{ libraryId, bookKey }` | `{ answer: 'found'\|'not_found'\|'unconfirmed'\|'unknown', catalogUrl? }` | Book page. Stored answer, else one live check through the lookup layer (5.2). |
| `POST /library-requests` | `{ text }` | `202 {}` | One-tap request. Text and count only (4.6.3). |
| `POST /problem-reports` | `{ text, screen?, libraryId?, bookKey? }` | `202 {}` | Report a problem. |

Kept: `/availability` (old bundles in open tabs; remove after 30 days; from
Phase 1 it calls the lookup layer, so it also writes answers, health and the
log), `/books/search` with `libraryId` (library-scope search, hidden in the
client), content routes (behind `CONTENT_DISCOVERY_ENABLED`). New owner-only
routes live outside `/api/v2`: `/api/admin/*` (section 6). New cron route
`/api/internal/catalog-maintenance` (daily).

The operational log (4.6.2) has no client route: the server writes it from
`/books/search`, `/places/search`, `/libraries/discover`, `/holdings/*` and
`/availability` after the response is sent. The client never sends search
text anywhere it was not already sending it.

Projection from the existing availability outcome to the one answer the app
shows:

| Existing outcome / match | Answer | Book card |
|---|---|---|
| `available`, `none_available`, `in_catalog`, not-for-loan, with `exact_isbn`, `verified_work` or `catalog_record` | `found` | green |
| `not_found` (exact ISBN, `recognizedExact`) or work-level `no_match` with complete profile and non-partial search | `not_found` | white |
| `possible_match` (title/author only, or another edition the catalog cannot prove) | `unconfirmed` | grey, label "Couldn't confirm" |
| `unknown`, timeout, budget exhausted, unsupported, error | `unknown` | grey, Try again |

### 3.6 Data layer

A new catalog store module, `server/catalog-store/`:

```
catalog-store/config.js      reads CATALOG_DATABASE_URL etc.; disabled → null store
catalog-store/pool.js        lazy pg Pool (max 3, statement_timeout 1.5 s, fail-open)
catalog-store/holdings.js    readAnswers, writeAnswers, identitiesFor(book)
catalog-store/health.js      recordCheckOutcome, flag rule (4.2, 5.5)
catalog-store/usageLog.js    recordUsage (allowlisted fields only, 4.6.2), rollup
catalog-store/requests.js    recordLibraryRequest, recordProblemReport, buckets
catalog-store/policy.js      reads server/data/catalog-policies.json (opt-outs)
catalog-store/maintenance.js expiry delete, opt-out purge, retention, log rollup
catalog-store/migrations/001-catalog.sql …
catalog-store/*.test.js, *.integration.test.js (skip without CATALOG_TEST_DATABASE_URL)
```

Every call fails open: if the store is disabled, slow (>1.5 s) or down, the
API behaves as today (live check, nothing stored). A store failure is never
shown to the reader and never turns into "not found". Health and log writes
happen after the response (`waitUntil`) and are dropped, not retried, when the
store is down.

The lookup layer itself lives in `server/services/catalog-lookup/` (section 5)
and writes to the store only through `holdings.js`, `health.js` and
`usageLog.js`.

Generalise `server/db/migrate.js` to take a migrations directory, a lock name
and a migrations table (`catalog_schema_migrations`), and add
`npm run catalog:migrate --workspace=server`.

---

## 4. Database

### 4.1 Options

Scale assumptions. Pilot: 5–10 libraries, about 1,000 readers a month, 20,000
searches and 10,000 book opens a month, traffic mostly in Indian daytime.
10×: 10,000 readers, 200,000 searches, 100,000 book opens. Prices are list
prices read on 2026-11-12; recheck when provisioning.

| Option | Pilot / month | 10× / month | For | Against |
|---|---|---|---|---|
| **A. New Neon Postgres project** (`mybookshelf-catalog`), Free plan, move to Launch when needed | $0 on Free (100 CU-hours, 1 GB per project). If traffic keeps it awake ~14 h/day at 0.25 CU ≈ 105 CU-h, Free runs out near month end; on Launch ≈ $11 | Always awake at a fixed 0.25 CU = 182 CU-h × $0.106 ≈ **$19–20**, storage < $0.10 | Same vendor, driver (`pg`), SQL, migration runner and CI Postgres service as accounts. Admin queries and counts are plain SQL. Own compute quota: cannot exhaust or wake the account database. Fixed compute size is a hard cost ceiling. | Cold start of a few hundred ms after 5 min idle. On Free, exhausting the quota suspends compute until next month (we fail open, but the cache stops). |
| B. Same Neon project as accounts, separate database and roles | $0 extra if account compute is already awake (5-minute cron) | same compute, ~$0 extra | Cheapest if compute is already paid | Shares the Free plan quota: if catalog traffic exhausts it, **accounts go down**. Mixes anonymous public load with private data. Not recommended. |
| C. Upstash Redis (Vercel Marketplace) | $0 (500K commands, 250 MB free) | ≈ 1M commands ≈ $2 | Native TTL, cheapest at 10× | New vendor, no SQL; requests, reports and the admin view become hand-built key structures; no Redis in CI; durability of reports weaker. Earlier free-content work removed Redis by owner choice. |

**Recommendation: option A.** A separate Neon project on the Free plan for the
pilot, compute fixed at 0.25 CU (autoscaling off), moving to Launch before a
wider rollout. Expected cost: **$0 at pilot, about $20 a month at 10×**, with
$20 as the practical ceiling while compute stays fixed at 0.25 CU. Storage is
negligible: about 300 bytes per answer row including index, so 1 million rows
is about 0.3 GB. The operational log adds about one row per search, book
check and library-finder search (about 40,000 rows a month at pilot, roughly
12 MB; about 120 MB a month at 10×, so about 1.4 GB at the 12-month limit).
At 10× it outgrows the Free plan's storage; Launch storage at that size costs
well under $1 a month. Health events are a few thousand rows a month.

Connection: Neon pooled connection string (`-pooler` host) with the existing
`pg` driver; one small pool per function instance (`max: 3`,
`idleTimeoutMillis: 10_000`, `statement_timeout` 1500 ms). Region: create the
project in AWS us-east-1 next to Vercel iad1.

Roles (created in the Neon console; no passwords in SQL):

| Role | Grants |
|---|---|
| `catalog_migrator` | owner; used only by `catalog:migrate` from an operator machine |
| `catalog_runtime` | SELECT/INSERT/UPDATE on `holdings_answers`; SELECT/UPDATE (`reports_availability*`) on `library_profiles`; INSERT/UPDATE on `library_requests`; INSERT on `problem_reports`; all on `submission_buckets`; INSERT on `library_check_events` and `usage_events`; SELECT/INSERT/UPDATE on `library_health` and `host_request_windows` |
| `catalog_admin` | SELECT on all; UPDATE `status`, `status_note`, `resolved_at` on `library_requests` and `problem_reports`; UPDATE `acknowledged_at`, `owner_note` on `library_health` |
| `catalog_worker` | DELETE on `holdings_answers`, `problem_reports`, `library_requests`, `submission_buckets`, `library_check_events`, `usage_events`, `host_request_windows`; INSERT/UPDATE on `usage_daily_totals` |

Environment (names only; values in Vercel, marked Sensitive):
`CATALOG_STORE_ENABLED`, `CATALOG_DATABASE_URL`, `CATALOG_ADMIN_DATABASE_URL`,
`CATALOG_WORKER_DATABASE_URL`, `CATALOG_MIGRATION_DATABASE_URL` (operator
only, never deployed), `CATALOG_BUCKET_SECRET` (HMAC key for rate buckets),
`ADMIN_ACCOUNT_IDS`, `CATALOG_TEST_DATABASE_URL` (CI). Add names to
`.env.example`. Previews use a Neon branch of the catalog project, never
production.

### 4.2 Schema (`server/catalog-store/migrations/001-catalog.sql`)

```sql
-- Answers: "library X has (or does not have) book identity Y".
CREATE TABLE holdings_answers (
  library_id     text NOT NULL CHECK (length(library_id) BETWEEN 1 AND 200),
  identity_kind  text NOT NULL CHECK (identity_kind IN ('isbn13','ol_work','catalog_record')),
  identity_value text NOT NULL CHECK (length(identity_value) BETWEEN 1 AND 300),
  answer         text NOT NULL CHECK (answer IN ('found','not_found')),
  evidence       text NOT NULL CHECK (evidence IN
                   ('exact_isbn','work_isbn','catalog_record','isbn_not_listed','work_no_match')),
  matched_isbn13 text CHECK (matched_isbn13 ~ '^97[89][0-9]{10}$'),
  catalog_url    text CHECK (length(catalog_url) <= 2000),
  checked_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  PRIMARY KEY (library_id, identity_kind, identity_value)
);
CREATE INDEX holdings_answers_expiry ON holdings_answers (expires_at);

-- What we have learned about each library's catalog (kept for later).
CREATE TABLE library_profiles (
  library_id                      text PRIMARY KEY CHECK (length(library_id) BETWEEN 1 AND 200),
  reports_availability            boolean,        -- null = not yet observed
  reports_availability_checked_at timestamptz,
  answers_stored                  bigint NOT NULL DEFAULT 0,
  last_answer_at                  timestamptz
);

-- Library health (decision 2). One row per failed or timed-out check, no
-- reader data. Successes only update library_health.
CREATE TABLE library_check_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  library_id   text NOT NULL CHECK (length(library_id) BETWEEN 1 AND 200),
  host         text NOT NULL CHECK (length(host) BETWEEN 1 AND 253),
  platform     text NOT NULL CHECK (length(platform) BETWEEN 1 AND 40),
  operation    text NOT NULL CHECK (operation IN ('book_check','marks','record_read')),
  failure      text NOT NULL CHECK (failure IN
                 ('timeout','unavailable','blocked','unrecognized','budget','configuration')),
  error_code   text CHECK (length(error_code) <= 64),   -- e.g. CATALOG_TIMEOUT
  duration_ms  integer NOT NULL CHECK (duration_ms >= 0),
  requests     smallint NOT NULL CHECK (requests >= 0),
  occurred_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_check_events_recent ON library_check_events (library_id, occurred_at DESC);

CREATE TABLE library_health (
  library_id            text PRIMARY KEY CHECK (length(library_id) BETWEEN 1 AND 200),
  platform              text NOT NULL,
  last_success_at       timestamptz,
  last_failure_at       timestamptz,
  last_failure          text,
  failures_since_success integer NOT NULL DEFAULT 0,
  checks_7d             integer NOT NULL DEFAULT 0,   -- refreshed by the daily job
  failures_7d           integer NOT NULL DEFAULT 0,
  median_ms_7d          integer,
  flagged_at            timestamptz,                  -- set by the flag rule (5.5)
  flag_reason           text CHECK (length(flag_reason) <= 200),
  acknowledged_at       timestamptz,                  -- owner has seen it
  owner_note            text CHECK (length(owner_note) <= 500),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_health_flagged ON library_health (flagged_at DESC) WHERE flagged_at IS NOT NULL;

-- Anonymous operational log (decision 5b, 4.6.2). No account ID, IP, device
-- identifier, session ID, cookie, user agent or coordinates: there is no
-- column for them, and usageLog.js accepts only these fields.
CREATE TABLE usage_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_hour timestamptz NOT NULL,       -- truncated to the hour
  kind          text NOT NULL CHECK (kind IN
                  ('book_search','book_check','result_marks','library_finder','near_me')),
  query_text    text CHECK (length(query_text) <= 200),  -- scrubbed (4.6.2); null for near_me and book_check
  library_id    text CHECK (length(library_id) <= 200),
  book_key      text CHECK (length(book_key) <= 512),    -- book_check only
  outcome       text NOT NULL CHECK (length(outcome) <= 40),
  result_count  smallint CHECK (result_count >= 0),
  found_count   smallint CHECK (found_count >= 0),
  source        text CHECK (source IN ('stored','live','mixed','public_data')),
  duration_ms   integer CHECK (duration_ms >= 0),
  app_version   text CHECK (length(app_version) <= 64)
);
CREATE INDEX usage_events_hour ON usage_events (occurred_hour);

-- What is left after 12 months: totals only, no text.
CREATE TABLE usage_daily_totals (
  day          date NOT NULL,
  kind         text NOT NULL,
  library_id   text NOT NULL DEFAULT '',
  outcome      text NOT NULL,
  events       integer NOT NULL,
  results_sum  bigint NOT NULL DEFAULT 0,
  p50_ms       integer,
  p95_ms       integer,
  PRIMARY KEY (day, kind, library_id, outcome)
);

-- One-tap "Request to add <text>". Text and a count only (decision 5e).
CREATE TABLE library_requests (
  request_key        text PRIMARY KEY CHECK (length(request_key) BETWEEN 2 AND 80),
  display_text       text NOT NULL CHECK (length(display_text) BETWEEN 2 AND 80),
  request_count      integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  first_requested_on date NOT NULL DEFAULT current_date,
  last_requested_on  date NOT NULL DEFAULT current_date,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','added','declined','spam')),
  status_note        text CHECK (length(status_note) <= 500),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_requests_queue ON library_requests (status, request_count DESC, last_requested_on DESC);

-- Report a problem.
CREATE TABLE problem_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body        text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  screen      text CHECK (screen IN ('shelf','search','book','library','panel','account','scan','other')),
  library_id  text CHECK (length(library_id) <= 200),
  book_key    text CHECK (length(book_key) <= 512),
  app_version text CHECK (length(app_version) <= 64),
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','resolved','spam')),
  resolved_at timestamptz
);
CREATE INDEX problem_reports_queue ON problem_reports (status, created_at DESC);

-- Anonymous abuse limits: keyed HMAC digests, never raw IPs (as account_rate_buckets).
CREATE TABLE submission_buckets (
  bucket   bytea PRIMARY KEY CHECK (octet_length(bucket) = 32),
  count    integer NOT NULL CHECK (count > 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX submission_buckets_expiry ON submission_buckets (reset_at);

-- Cross-instance per-host request counter (5.4). One row per host per minute.
CREATE TABLE host_request_windows (
  host        text NOT NULL CHECK (length(host) BETWEEN 1 AND 253),
  window_start timestamptz NOT NULL,
  requests    integer NOT NULL CHECK (requests >= 0),
  PRIMARY KEY (host, window_start)
);
```

Library opt-out is **not** a database flag. It lives in a reviewed, versioned
file `server/data/catalog-policies.json`:

```json
{ "schemaVersion": 1, "libraries": {
  "<libraryId>": { "storeAnswers": false, "reason": "Library asked on 2026-12-01", "sourceUrl": "https://…", "reviewedOn": "2026-12-01" }
}}
```

Reasons: it is checked before every write even when the database is down,
changes are reviewed in Git, and an opt-out deploy also triggers the purge.
The same file can later carry `backgroundChecks: false` (no badge checks in
search) and robots findings. Per decision 8, answers are stored for every
library unless it explicitly forbids storage; `storeAnswers: false` stops and
purges answers only. The health record and the operational log describe our
own service and are still written for that library.

### 4.3 Reading and writing answers

`identitiesFor(book)` returns, in order: `('catalog_record', '<libraryId>:<recordId>')`
for that library's own record keys; `('isbn13', isbn13)` when the book has an
ISBN-13; `('ol_work', 'OL…W')` when the book has an Open Library work ID.
Never a title, author or normalised title. Google volume IDs are not an
identity for holdings (a volume without an ISBN gets no stored answer).

Read: one query per request:

```sql
SELECT identity_kind, identity_value, answer, catalog_url
FROM holdings_answers
WHERE library_id = $1
  AND (identity_kind, identity_value) IN (SELECT * FROM unnest($2::text[], $3::text[]))
  AND expires_at > now();
```

A book is `found` if any identity is `found`. It is `not_found` only if the
identity that was asked about is `not_found`: a `not_found` for an ISBN says
nothing about the work, and a `found` for one ISBN of a work says nothing
about another work with the same title.

Write rules:

| Check result | Rows written | Expires |
|---|---|---|
| Exact ISBN found | `isbn13` found (`exact_isbn`); also `ol_work` found when the ISBN is in that work's Open Library edition list | 180 days |
| Work-level check found a row with one of the work's ISBNs | `ol_work` found (`work_isbn`, `matched_isbn13`); `isbn13` found for the matched ISBN | 180 days |
| Own catalog record found | `catalog_record` found | 180 days |
| Exact ISBN definitively not listed (`not_found`, `recognizedExact`), including one ISBN of a batch answer (Calil) | `isbn13` not_found (`isbn_not_listed`) | 180 days |
| Work-level `no_match`, profile complete, search not partial | `ol_work` not_found (`work_no_match`) | 180 days |
| `possible_match`, `unknown`, timeout, budget exhausted, unsupported, any error | nothing (a failure goes to the health record, 5.5) | — |
| A result row that did not match during result marking (5.3) | nothing: a title search with a row cap does not prove absence | — |

Writes use `INSERT … ON CONFLICT DO UPDATE` and only replace a row when the
new answer is at least as strong (`found` replaces anything; `not_found` never
replaces an unexpired `found`). Writes are skipped when the library's policy
says `storeAnswers: false`. When an adapter returns copy counts, set
`library_profiles.reports_availability = true` (false only when the adapter
contract says it never reports availability); the UI never reads it.

A stored answer of any age up to its expiry is used exactly like a fresh one:
no age is shown and no refresh is triggered. After expiry it is ignored and
the next lookup checks the catalog again; the daily job deletes it.

### 4.4 TTL and cleanup

Daily Vercel Cron `/api/internal/catalog-maintenance` (Bearer `CRON_SECRET`,
same pattern as `server/jobs/middleware.js`), with the worker role:

1. `DELETE FROM holdings_answers WHERE expires_at < now()` in batches of 5,000.
2. Purge all rows for libraries whose policy is `storeAnswers: false`.
3. `DELETE FROM submission_buckets WHERE reset_at < now()`.
4. Delete problem reports resolved or marked spam more than 90 days ago, and
   any report older than 12 months.
5. Delete library requests marked `spam` after 90 days, and requests marked
   `added` or `declined` 12 months after their last update.
6. Roll `usage_events` older than 12 months into `usage_daily_totals` (counts,
   result sums, p50/p95 timings per day, kind, library and outcome; no text,
   no book keys), then delete those rows, in one transaction per day.
7. Refresh `library_health` 7-day counts and the flag rule (5.5); delete
   `library_check_events` older than 90 days and `host_request_windows` older
   than one hour.

Reads also filter on `expires_at`, so a missed cron run never serves an
expired answer.

### 4.5 Privacy review of stored fields

| Field | Personal? | Why kept | Notes |
|---|---|---|---|
| `holdings_answers.*` | No. Library ID, book identity, answer, timestamps, the library's public record URL. | Avoid repeat catalog requests | No reader, session, IP, query text or count of lookups. Cannot tell who looked a book up. |
| `library_profiles.*` | No | Later feature | Aggregate counters only. |
| `library_requests.display_text` / `request_key` | Usually a place or library name; could contain anything typed | Owner's admin view | Stored after the explicit tap (decision 5e: text and a count, no identity). Max 80 chars; emails, phone numbers and URLs rejected. Never shown publicly. The earlier `countries` column is dropped. |
| `library_requests` dates | No | Ordering | Day precision only. |
| `problem_reports.body` | May contain anything | The report | Max 2,000 chars; Privacy page says not to include personal details. Retention per 4.4. |
| `problem_reports.screen`, `library_id`, `book_key`, `app_version` | No | Reproduce the problem | No query text, no account ID, no email, no IP. |
| `submission_buckets.bucket` | Pseudonymous (HMAC of IP and day with a server secret) | Abuse limits | Expires within 24 h. |
| `library_check_events.*`, `library_health.*` | No. Library, host, platform, failure class, timings. | Find broken catalogs (decision 2) | No book, query, reader or IP. 90 days for events. |
| `usage_events.query_text` | Anonymous, but free text: rarely, a reader may type a name or number | Improve search and library checks (decision 5b) | Scrubbed before writing (4.6.2); no account ID, IP, device ID, session or coordinates; hour precision; 12 months, then totals only. Never in a URL, platform log or analytics event. |
| `usage_events` other fields | No | Same | `book_key` only on book checks. |

Search text is used for the catalog request and, from Phase 2, written only
to `usage_events` through `usageLog.js`. It is never written to platform logs
(`console`, Vercel runtime logs, the redacted telemetry sink), because those
sit next to request metadata such as IP addresses. The in-memory catalog cache
keeps it in process memory, as today.

### 4.6 Privacy model (decision 5)

Two separate things, never joined: anonymous analytics (4.6.1) and anonymous
operational logs (4.6.2). Neither carries an account ID, and accounts (4.7)
carry neither.

#### 4.6.1 Anonymous usage analytics

| Item | Plan |
|---|---|
| What | Page visits, referrer, device type, browser, OS, country, and daily counts of searches, book opens, saves and library choices. Never linked to an account or a person. |
| Tool (recommended) | **Vercel Web Analytics**. The project is already on Vercel Pro. It sets no cookies, counts visitors with a hash that rotates daily and is not stored, and is served from our own origin (`/_vercel/insights/*`), so the CSP `script-src 'self'` and `connect-src 'self'` should not need to change (verify on a preview). Vercel describes it as not needing a consent banner; legal review confirms (10.3). Custom events (Pro) give the daily counts: `search`, `book_open`, `save`, `library_chosen`, with no properties except `libraryId` on `library_chosen`. |
| Alternative | Google Analytics 4. It uses cookies and sends data to Google, so European visitors would need a consent banner, and the CSP would need Google hosts. Not recommended. |
| Code | `client/src/v2/analytics.ts` loads `@vercel/analytics` (new dependency, about 1 KB) only in production builds. Its `beforeSend` drops query strings and fragments from every URL, maps `/app/books/<key>` to `/app/books/[book]`, maps every `/app/account/*` path to `/app/account` (verification and reset links carry tokens), and drops `/app/admin`. The public pages from `tools/seo/build-pages.mjs` load the same script. |
| Must never | Send search text, ISBNs typed by the reader, coordinates, account or user IDs, or email addresses. The landing form that still puts library text in `?q=` (backlog) is covered by the query-string rule. |
| Search Console | Separate. Verify the domain with a DNS TXT record (preferred; no page change) or a `google-site-verification` meta tag in `build-pages.mjs`; submit the existing sitemap. No script on any page. |

#### 4.6.2 Anonymous operational logs

Written by the server into `usage_events` (4.2) through `usageLog.js`, after
the response is sent:

| Kind | Written by | Fields |
|---|---|---|
| `book_search` | `/books/search` | scrubbed query text, outcome (`results`, `none`, `error`), result count, source (`public_data`), duration |
| `result_marks` | `/holdings/search` | query text, library, found count, books checked, stored/live/mixed, duration, outcome (`done`, `partial`, `skipped`) |
| `book_check` | `/holdings/check`, `/availability` | library, book key, answer, stored/live, duration (no text) |
| `library_finder` | `/libraries/discover`, `/places/search` | typed library or place text, result count |
| `near_me` | `/libraries/discover` with coordinates | result count only; **never** coordinates |

Rules:

- No account ID, IP address, device identifier, session ID, cookie, user
  agent, referrer or coordinates. `/api/v2` is cookie-free, so the server has
  no account to attach; `usageLog.js` takes an allowlisted object (as
  `telemetry.js` does) and throws on any other key.
- Time is truncated to the hour.
- Scrubbing before write: trim, collapse spaces, cut to 200 characters, and
  replace email addresses, URLs and digit runs of 7 or more that are not a
  valid ISBN with `[removed]`.
- Search text is never put in a URL (client or server), never written to
  platform logs or the telemetry sink, and never sent to analytics.
- 12 months, then the daily job keeps only totals (4.4, step 6).
- Read only through the admin view (section 6) and the admin role.

This reverses the current rule that search text is never stored. Where that
rule is written today, and the change in each place:

| Place | Says today | Change |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md` | Neither states the rule (checked). `CLAUDE.md` calls the API "anonymous". | Add one line: "Search text may be stored only in the anonymous operational log (no account ID, IP or device identifier; 12 months, then totals). Never put it in URLs, platform logs or analytics." Mention the catalog store next to "anonymous API". |
| `client/public-app/privacy.html` | "Search terms are not saved in that storage"; "runs no advertising or analytics scripts and does not log private shelf/history contents" | Replace the website sections with `docs/policy/privacy.md` (Phase 12). |
| `tools/seo/build-pages.mjs` (`/how-it-works` "Privacy in plain words"; `/about` "Your saved shelf stays in your browser") | No storage of searches implied; history opt-in | Rewrite both to the new model (Phase 12). |
| `docs/seo/SEO_PLAN.md` line 165 | "searches not stored" | "searches logged anonymously, no account or IP" |
| `client/src/v2/uiMessages.ts` `privacyHint` | "Your reading list stays in this browser" | Removed with the old Settings page; the new Privacy page uses the policy text. |
| `client/src/v2/searchMemory.ts` comment (line 86) | "Search text stays in this bounded, same-tab memory; never in URLs, browser history state or local storage" | Still true for the browser. Add: "The server keeps an anonymous operational log (usageLog.js)." |
| `client/src/v2/ui/content/ContentSearchPage.tsx` comment (line 19) | "never persisted" | Still true in the browser; no change. |
| `docs/work-aware-search.md` line 8 | "Search text and paging state stay in bounded same-tab memory" | Add the same server-log note. |
| `server/public-v2/places.js` comment (line 2) | "Queries are not logged." | "Queries are not written to platform logs; library-finder text goes to the anonymous operational log." |
| `server/public-v2/telemetry.js` (`BLOCKED_KEY` blocks `query`, `search`, `location`) | Platform telemetry may not carry search text | Keep as is; add a comment pointing to `usageLog.js` as the only place search text is written. |
| `server/public-v2/router.test.js` (line 36, telemetry has no query) | Asserts no query in telemetry | Keep; add tests that the usage log receives scrubbed text and never IP, user agent or coordinates. |
| `client/src/v2/api.test.ts` (line 31) | Test string "Not stored anywhere" | Rename the string; no behaviour change. |
| `client/e2e/free-content-ui.spec.js` (lines 11, 14) | Hidden content search expects `q=` in the URL | Conflicts with "never in URLs". Content search is hidden; fix when it returns (backlog). |
| This plan, 8.1 | "search text never reaches the database, logs or URLs" | Updated (8.1). |
| `docs/STATUS.md` (11 November entry) | "search text is still never stored" | A dated history entry; leave it and add a new entry when the log ships. |
| `docs/accounts/PRD.md` AC-16 | "Reading behavior is never public or emitted as telemetry" | Still holds: nothing is linked to an account. No change. |

#### 4.6.3 Location, library requests

- "Libraries near me": coordinates go to `/libraries/discover` once, are used
  to sort, and are not stored or logged (only a `near_me` count). Only the
  chosen library is stored (browser, or account).
- "Request to add X": `library_requests` stores the normalised text and a
  count. No country, IP, account or date finer than a day.

### 4.7 Account changes (decisions 5c and 6)

- Accounts hold only: email, password hash, saved books, chosen library and
  Viewed before. No analytics or log is linked to an account; the admin view
  never joins the catalog store with the account database.
- **Viewed before is saved to the account automatically** when signed in. No
  consent screen; disclosed in the Privacy text. The server records every
  explicit book open from a signed-in reader through
  `/api/account/history/views`, without checking `history_enabled`. Account
  migration `012` sets `user_settings.history_enabled` default to `true`
  (section 9, question 3). The history switch, the
  separate history-import checkbox and their copy go (`AccountSettingsPage.tsx`
  history card, `AccountPages.tsx` "This does not turn on future reading
  history", `support.html`). It is deleted with the account
  (`recent_book_views` is already removed on deletion).
- Contracts to update in the same change: `docs/accounts/PRD.md` AC-11 and
  AC-12, `docs/accounts/README.md` DEC-03, `docs/accounts/IMPLEMENTATION.md`
  (history starts off), `docs/accounts/ENGINEERING_DESIGN.md`
  (`recent_book_views` retention).
- **Release prerequisites (decision 6), unchanged from the first version:**
  move the account Neon project to a paid plan with point-in-time backups;
  record the backup window; a second operator completes a restore exercise
  and records it in `docs/accounts/PRODUCTION_ROLLOUT.md`; the deletion
  ledger is re-applied after the restore. The Privacy text's backup period
  comes from this.

---

## 5. Catalog lookup layer and background checks

Phase 1 rebuilds the lookup layer before any UI work. Every later phase (book
card, result badges, shelf badges, the stored answers and the health record)
uses it.

### 5.1 Adapter inventory

Counts are directory entries with an availability capability, from
`server/data/libraries.json`, `india-catalogs.json` and
`discovered-catalogs.json` (7,133 of 7,168 entries; the other 35 are 19
link-only `platform: catalog` entries and 16 Koha, e-Granthalaya, Aspen and
LibSys entries without the capability). "Audit" is the connector audit
branch's native-search status (`docs/library-connectors/data-index/
registry-summary.json`, 10 November): it is not app eligibility, and no entry
is app-eligible yet. Speeds are the samples recorded in the adoption review
and the audit; most are single measurements.

| Platform (adapter) | Entries | Connection | Looks up | Several ISBNs in one request | Typical speed | Known limits | Audit status |
|---|---:|---|---|---|---|---|---|
| e-Granthalaya (`egranthalaya.js`) | 5,114 | Search-page extraction (ASP.NET form: GET form + POST search, session cookie) | ISBN (cluster ALL/LIKE, covers ISBN-10/13 in one query), title/keyword per member | No (one term per form) | 6–16 s; school libraries 13–31 s; audit title search 30–33 s upstream | One government host (`eg4.nic.in`) for all; 10-row cap; empty record pages need a retry; 100 s timeout; per-instance queue only | 3,135 working, 1,901 needs work (of 5,036) |
| LIBMAN (`libman.js`) | 639 | JSON (MasterSoft's public OPAC web-client endpoints, undocumented) | Title (TITLE field) and keyword; ISBN only through the row's ISBN field | No | Not measured in the app | One shared host; 10 rows, 6 detail reads, 45 s | 452 working, 187 needs work |
| IndCat (`indcat.js`) | 407 | Search-page extraction (INFLIBNET union catalog, institution-scoped) | ISBN, title | No (SRU exists but union hits cannot prove one library's holding) | Not measured in the app | One shared host; 10-row cap; contradictory pages seen | 7 working, 44 needs work, 356 not checked |
| Koha (`koha.js`, `iithKoha.js`) | 372 (42 + 216 + 114) | Search-page extraction (`opac-search.pl` HTML) plus the public REST API for items where enabled; IIT Hyderabad uses a JSON API | ISBN (`idx=nb`); keyword search on all; structured title-first search on 3 | Unverified (Koha query syntax may allow `nb:X or nb:Y`) | Anna Centenary 4–9 s (one 20.2 s timeout); IIT Bhubaneswar 11.1 s using 15 requests | HTML rows carry no ISBN, so matching a row needs a record read; 10-row cap; robots disallow on some; IDEAL (195) failed from production. The audit found Koha's RSS/XML search and public MARCXML records work on 5 sampled catalogs | 12 working, 197 needs work, 174 blocked/deferred (of 383) |
| BiblioCommons (`bibliocommons.js`) | 356 | API (public gateway JSON, `gateway.bibliocommons.com/v2`) | Keyword/title search (rows carry ISBNs), then availability per record | Unverified (keyword OR query) | 3.3–3.7 s | Terms not reviewed; `searchType=isbn` unreliable (adapter comment); 10 rows used | Not checked (5 live checks) |
| VuFind (`vufind.js`) | 130 | Search-page extraction (VuFind HTML; COinS ISBN metadata) | ISBN (`type=ISN`), title | Unverified (VuFind boolean OR) | Not measured | KALNET needs custom TLS; Somaiya search disallowed by robots; 10 rows, 6 details, 45 s | 130 blocked/deferred in the audit, but KALNET worked from production |
| Community discovery (`discoveryCommunity.js`, `communityPmb.js`) | 49 | Mixed per site: JSON (Surat, Shodhak with CSRF), page extraction (RMRL, RMC ASP.NET, PMB) | Title; ISBN on some | No | Not measured | One parser per site family | 15 working, 13 needs work, 21 blocked |
| Academic discovery (`discoveryAcademic.js`) | 36 | Mixed per site: JSON POST (SRMS), page extraction (EasyLib, Darshan and others) | Title; ISBN on some | No | Not measured | Per-site configs | 32 working, 4 needs work |
| Calil (`calil.js`) | 20 (Japan) | API (official, app key) | ISBN only, per library system and branch | **Yes**: the API takes several ISBNs and systems in one call (documented; the adapter sends one today) | 7.2 s (Setagaya, includes polling) | Polls every 2 s up to 14 times; key server-side; terms on storing results not reviewed | Not checked |
| Vega (`vega.js`) | 4 (US) | API (Vega's JSON search endpoint used by its web client) | ISBN (as search text) | Unverified | Not measured | Undocumented endpoint | Not checked |
| Aspen (`aspen.js`) | 2 (US) | Search-page extraction | ISBN | No | — | Cloudflare blocks server requests; parser deliberately unverified, so every check is "couldn't check" | Not checked |
| Evergreen (`evergreen.js`) | 1 (US) | API (OpenSRF gateway JSON) | ISBN only | No | Not measured | 2 requests per ISBN, at most 3 | Not checked |
| Chamo (`chamo.js`) | 1 (IIT Madras) | Search-page extraction | ISBN | No | Not measured | 60 s timeout; search then record page | Needs work |
| LibSys (`libsys.js`) | 1 (of 2) | API (LibSys10 OPAC JSON with a session token) | ISBN | No | Not measured | Token and settings fetch first | Needs work |
| Visakhapatnam (`visakhapatnam.js`) | 1 | Search-page extraction | Title only (records carry no ISBN) | No | 1.2 s for 10 results | robots Crawl-Delay 20 s; rows never prove an edition, so answers are at best "couldn't confirm" | Working |

Five hosts serve about 94% of entries; `eg4.nic.in` alone serves 5,036. The
audit branch adds further native adapters (Autolib, EasyLib, IUST, Surat
native, a shared `catalogNative.js`) that are not on this branch.

### 5.2 One internal interface

New module `server/services/catalog-lookup/`:

```
catalog-lookup/index.js       lookupBook, markResults (the only entry points)
catalog-lookup/platforms.js   one descriptor per platform (5.1, 5.4)
catalog-lookup/outcome.js     projection from adapter results to the three outcomes
catalog-lookup/budget.js      per-platform and per-host budgets, pacing, circuit
catalog-lookup/record.js      writes answers, health and the log (5.5)
catalog-lookup/*.test.js
```

```ts
lookupBook({ library, book, signal, deadlineAt }) → {
  outcome: 'found' | 'not_found' | 'couldnt_check',
  reason?: 'unconfirmed'          // catalog answered, edition not proven (grey "Couldn't confirm")
         | 'timeout' | 'unavailable' | 'blocked' | 'unrecognized' | 'budget'
         | 'unsupported' | 'configuration',
  evidence?: 'exact_isbn' | 'work_isbn' | 'catalog_record' | 'isbn_not_listed' | 'work_no_match',
  matchedIsbn13?, catalogUrl?, recordId?,
  requests: number, durationMs: number, source: 'stored' | 'live'
}

markResults({ library, query, books[], signal, deadlineAt })
  → async iterable of { bookKey, outcome, ... } as answers arrive,
    then { done, notAttempted: bookKey[] }
```

- Adapters keep their current functions; each platform descriptor maps them
  to the interface (`checkAvailability`, `searchCatalog`,
  `findBookCandidates`, `searchBookCandidates`, `resolveCatalogRecord`, and a
  new `checkMany` where a platform has a batch form).
- `outcome.js` is the only place adapter outcomes become answers, using the
  3.5 projection. `not_found` needs `recognizedExact` or a complete work-level
  no-match; anything else that is not `found` is `couldnt_check`.
- `couldnt_check` with `reason: 'unconfirmed'` or `'unsupported'` is not a
  failure for the health record; every other reason is.
- `/availability`, `/holdings/check`, `/holdings/search` and the shelf
  background fill all call this module. `searchLibraryBook` in
  `services/libraryBookSearch.js` becomes an internal strategy of
  `lookupBook` for title-search platforms.
- Behind server flag `CATALOG_LOOKUP_V2` per platform (comma list or `all`),
  so the old path stays available while each platform is switched.

### 5.3 Lookup strategy per platform

(a) One book on the book page; (b) marking up to nine search results.
"Few requests" means the whole result set is covered in at most three catalog
requests.

| Platform | (a) Book page | (b) Nine results | (b) in few requests? |
|---|---|---|---|
| e-Granthalaya | Member ISBN query for the edition, then the work's other ISBNs (up to 6) by the cluster ALL/LIKE form; title-first search when ISBNs miss | One member title/keyword search with the reader's query (form + search = 2 requests); rows carry ISBNs; match rows to each result's ISBN set. No per-ISBN follow-ups: one shared government host. | **Yes** (2 requests), for results the query's top rows contain |
| LIBMAN | Title search, then up to 6 detail reads to prove ISBN | One TITLE search with the reader's query; rows carry ISBN | **Yes** (1 request) |
| IndCat | ISBN query, then title search | One title search with the reader's query; rows carry ISBN | **Yes** (1 request) |
| Koha (title-first, 3) | Title-first search, record reads for candidates (budget 6–12 requests) | One keyword search; rows need record reads to show ISBNs | **To verify**: yes if the RSS/XML form (audit finding) carries ISBNs per row (1 request); otherwise no |
| Koha (others, 369) | ISBN query per ISBN (`idx=nb`), then items API | Same as above, or up to 3 ISBN queries for the top results if `nb` OR queries work | **To verify** (as above) |
| BiblioCommons | Keyword search with title/author, match by ISBN, availability read | One keyword search with the reader's query; rows carry ISBNs (`briefInfo.isbns`, coverage unmeasured) | **Yes** (1 request) |
| VuFind | ISN search, then title search, up to 6 detail reads | One title search; COinS ISBNs per row | **Yes** (1 request), where robots allow |
| Community / academic discovery | Per-site search, then record read | One search where rows carry ISBNs; otherwise none | **Partly**: per site family; families without row ISBNs give no badges |
| Calil | One `check` call for the ISBN, poll | One `check` call with all result ISBNs (needs `checkMany`), poll | **Yes** (1 call plus polls) |
| Vega | One ISBN search per ISBN (1 request each) | Up to 9 single-ISBN requests, 2 at a time, inside 10 s | **No** (up to 9), allowed by its budget unless an OR query is verified |
| Evergreen | 2–3 requests per ISBN | Top 3 results with ISBNs only (up to 9 requests) | **No** |
| Chamo | Search then record page | None | **No** |
| LibSys | Session, then one request per ISBN | None at launch (1 library) | **No** |
| Aspen | Always "couldn't check" until a parser is verified | None | **No** |
| Visakhapatnam | Title search (Crawl-Delay 20 s) | None: rows never prove an edition | **No** |

When (b) is "no", or a result is not in the rows the search returned, the
result shows no badge, and the answer appears when the reader opens the book.
No badge never means "not in the library". When (b) runs, it writes `found`
answers for matches; unmatched rows write nothing (4.3). A definite per-ISBN
`not_found` from a batch answer (Calil) or a single-ISBN API (Vega) is stored.

### 5.4 Request budgets and pacing

Numbers are starting points, set in `platforms.js` and tuned from the health
record and the log after release. "Host" is the provider origin, so shared
hosts (`eg4.nic.in`, LIBMAN, IndCat, BiblioCommons gateway, Calil) share one
limit across all their libraries.

| Platform | Book page: max requests / deadline | Results: max requests / deadline | Per host, per instance | Across instances (Phase 2) |
|---|---|---|---|---|
| e-Granthalaya | 12 / 25 s (today's budget, ≤45 s for slow members) | 2 / 20 s | 4 in flight, 1 s between requests in one operation | 60 requests/min |
| LIBMAN | 8 / 20 s | 1 / 15 s | 4 in flight | 60/min |
| IndCat | 8 / 20 s | 1 / 15 s | 2 in flight | 30/min |
| Koha (each origin) | 12 / 20 s (`publicCatalogTimeoutMs` where set) | 1–3 / 15 s | 2 in flight | 20/min per origin |
| BiblioCommons | 4 / 15 s | 1 / 10 s | 4 in flight | 60/min |
| VuFind | 8 / 20 s | 1 / 15 s | 2 in flight | 20/min |
| Community / academic | 6 / 20 s | 1 / 15 s | 1 in flight | 10/min per origin |
| Calil | 1 + 14 polls / 30 s | 1 + 14 polls / 30 s | 2 in flight | Calil API limits (to read) |
| Vega | 2 / 10 s | 9 / 10 s, 2 at a time | 2 in flight | 30/min |
| Evergreen | 3 / 15 s | 9 / 15 s | 1 in flight | 10/min |
| Chamo, LibSys, Aspen | 4 / 30 s (Chamo 60 s) | 0 | 1 in flight | 10/min |
| Visakhapatnam | 2 / 45 s, 20 s spacing (robots) | 0 | 1 in flight | 3/min |

Rules for all platforms:

- Budgets are enforced by `withCatalogOperation` (`maxRequests`) and a
  deadline; the abort signal stops scheduling (5.8).
- robots.txt is respected per host (the audit branch's transport already
  checks it; production adapters do not yet, adoption review finding 5).
- Circuit: three failures for a host within 10 minutes open a 10-minute
  circuit on that instance; while open, result marking skips the host and the
  book page tries once.
- Across instances: Phase 2 adds a per-host request counter in the catalog
  database (`host_request_windows`, one row per host per minute). If the
  store is down, per-instance limits still apply.
- Stored answers are read first in every case, so a repeat book makes no
  catalog request for six months.

### 5.5 Stored answers, health record and log

`record.js` runs after the response through `waitUntil`:

1. **Answers.** `found` and definite `not_found` go to `holdings_answers` with
   180-day expiry, by the write rules in 4.3, unless the policy file says
   `storeAnswers: false`. `couldnt_check` is never stored.
2. **Health.** Every live check updates `library_health`: success sets
   `last_success_at` and resets `failures_since_success`; a failure (timeout,
   unavailable, blocked, unrecognized, budget, configuration) inserts a
   `library_check_events` row and updates the counters. `unconfirmed` and
   `unsupported` are neither.
3. **Flag rule** (run on each failure and by the daily job): flag a library
   when it has failed on **3 or more separate attempts, on at least 2
   different days, within 7 days, with no success since the first of those
   failures**. Separate attempts are at least 30 minutes apart, so one
   reader's retries count once. Clear the flag on the next success; keep
   `acknowledged_at` and `owner_note`. Thresholds are open question 1 in section 9.
4. **Log.** One `usage_events` row (4.6.2).

All three are dropped, never retried, if the store is down, and none of them
can change what the reader sees.

### 5.6 Coordination with the connector audit

The other agent's branch `feat/library-connector-audit` (read-only here) has
built an audit-side connector service: governed transport with robots checks,
pacing and cancellation (`server/services/catalog-connectors/transport.js`),
native search entry points for e-Granthalaya, Koha (RSS/XML), IndCat, LIBMAN
and VuFind, new native adapters, a versioned library registry with
per-library status and an "eligible library" proposal
(`server/services/library-registry.js`, `docs/library-connectors/`), and the
audit results quoted in 5.1. It is not merged and nothing on it is in
production.

Phase 1 does not duplicate it:

- **Take, don't rebuild.** The adapter changes on that branch
  (`server/services/providers/*.js`, 17 files) and the transport are merged
  first, by its owner, through their own reviewed pull request, without the
  5.7 GB of evidence under `docs/research/india-library-audit/`. Phase 1
  starts after that merge, or builds against the current adapters and rebases
  if the merge slips; it never pushes to the audit branch.
- **Share vocabulary.** The three outcomes and failure classes in 5.2 are
  agreed with the audit's `contracts.js` so audit results and production
  health can be compared.
- **Divide the work.** The audit owns native search methods, qualification
  and periodic sentinel checks from its runner. Phase 1 owns the app-facing
  interface, the per-platform strategies and budgets, the batch forms
  (Calil `checkMany`, Koha RSS rows if they carry ISBNs) and the production
  health record.
- **Feed back.** The production health record answers the adoption review's
  finding that audit and production disagree (Anna Centenary, KALNET, IDEAL).
  The admin view exports it as CSV for the audit's registry.
- **Later.** Which libraries have lookup enabled moves from the directory
  flags to the registry's eligible list once it is populated (backlog).

### 5.7 Background check for search results: flow

1. The reader submits a search. The client calls `/books/search` (public data
   only, no `libraryId`) and renders own matches, then the top public results,
   nine covers in total.
2. If a library is chosen, the client immediately calls `/holdings/search`
   with `{ libraryId, query, books }` for all nine (and saved matches), using
   an `AbortController`.
3. Server, within one request:
   a. Validate the library and the policy file. If the library has no public
      lookup capability, `backgroundChecks: false`, or the per-host circuit is
      open, reply `done` with all books unchecked.
   b. **Stored answers first**: one SQL read for all identities. Stream a
      `mark` line for each `found`. Books with any unexpired answer are done.
   c. **`markResults`** (5.2) for the rest, using the platform's strategy
      (5.3) and its results budget (5.4). Title-search platforms run one
      search with the reader's query; each row is matched against each book's
      profile with `matchCatalogRecord` from `services/libraryBookSearch.js`,
      and a row is a match only when it shows one of that work's ISBNs
      (`exact_isbn` or `verified_work`). Title/author-only matches
      (`possible_match`) give no badge and are not stored. Batch platforms
      (Calil) send all result ISBNs at once. Per-ISBN platforms within budget
      (Vega, Evergreen) check the top results one by one. Platforms with no
      results strategy reply `done` with all unchecked.
   d. Book profiles (the ISBN set of each Open Library work) come from the
      existing `books.searchProfile`, run in parallel with the catalog query.
      These are Open Library requests, not catalog requests. A profile that
      fails means that book cannot be matched (no badge), not "not found".
   e. Stream `mark` lines as matches are made. Write answers by 4.3 and 5.5:
      `found` for matches; a definite per-ISBN `not_found` only from batch or
      single-ISBN answers. A book with no matching row in a title search gets
      **no** stored answer: a capped title search does not prove absence.
   f. Send `done` with the unchecked keys and end the response.
4. The client shows a small round library badge on each `found` cover (with
   an accessible name "In <library>"). No badge means nothing; it never says
   "not in the library". Unchecked books get their answer when opened.

Per search, besides the platform budget in 5.4:

| Item | Limit |
|---|---|
| Open Library requests | ≤ 9 work-edition reads, served from the existing 24 h in-memory cache when present |
| Database queries | 1 read, 1 batched upsert, then health and log writes after the response |
| Deadline | the platform's results deadline (5.4); whole response ends by 25 s |
| Concurrency | At most one result-marking run per catalog host per function instance; a second one replies `done` unchecked (no queueing) |
| Repeat queries | Same library and normalised query within 10 minutes on the same instance reuse the in-memory result (existing `cachedTask`, 60 s → 10 min for this call) |

Shelf badges use `/holdings/lookup`, which never contacts a catalog. Saved
books without an answer are checked only one at a time when the reader opens
them, plus at most three per shelf visit in the background through
`/holdings/check` (ISBN-bearing books first, most recently saved first, only
while the page is visible, paused when a search starts). This fills the shelf
slowly without bursts.

### 5.8 Cancellation when a book is picked

- Client: tapping a result aborts the `/holdings/search` fetch, then opens the
  book page. If the result already has a `found` mark, it is passed in
  navigation state and the book page shows green without a request.
- Server: `/holdings/search` listens for `req.on('close')` and aborts an
  `AbortController` that is added to the `withCatalogOperation` store.
  `providers/http.js` must check `operation.signal.aborted` before scheduling
  any request and pass the signal to the undici request. A request already
  sent cannot be recalled; if it completes and finds a match, the positive is
  still written (through `waitUntil` from `@vercel/functions`, a new
  dependency, so the write survives the closed response).
- Book page: calls `/holdings/check` for the picked book only. The background
  checks for the other results do not restart when the reader comes back; the
  marks already received are kept in the in-memory holdings store.
- Changing library aborts any running background search, clears all marks,
  re-runs `/holdings/lookup` for the shelf and, if results are open,
  `/holdings/search` for them.

### 5.9 Slow catalogs

Some catalogs take 20 s or more per request (Anna Centenary and Kalaignar 4–9
s, e-Granthalaya member pages 6–16 s, Romain Rolland budget 45 s).

- Result marking: capped at the platform's results deadline (5.4, at most
  20 s). A slow catalog simply produces no badges for that search; nothing is
  shown as missing. Stored answers (streamed first) still appear immediately.
  A timeout is a health event (5.5).
- Book page `/holdings/check`: uses the platform's book-page budget (5.4;
  today's `checkBudgetMs`, 20 s default, ≤45 s) inside the 120 s function
  limit. The card shows grey "Checking" with a spinner (static under reduced
  motion); after the budget it shows grey "Couldn't check" with Try again.
- Circuit: as in 5.4; the cross-instance counter (`host_request_windows`)
  arrives with Phase 2.
- Function cost: a held 20–25 s streaming response is billed for its
  duration. Watch Vercel function usage after release; the per-host
  concurrency limit and stored answers keep this bounded.

---

## 6. Admin view

| Item | Decision |
|---|---|
| Where | `/app/admin` in the existing app (lazy-loaded chunk, not linked from any screen, `noindex`). Server routes `/api/admin/library-requests`, `/api/admin/problem-reports`, `/api/admin/problem-reports/:id` (PATCH status), `/api/admin/library-requests/:key` (PATCH status/note), `/api/admin/library-health` (+ `.csv`), `/api/admin/library-health/:libraryId` (PATCH acknowledge/note), `/api/admin/usage`, `/api/admin/summary`. |
| How protected | Mounted in `server/application.js` alongside the account middleware, outside `/api/v2`. Requires a valid account session (Better Auth), a verified email, the account's user ID in `ADMIN_ACCOUNT_IDS`, and the existing origin check (`requireOrigin`) on mutations. Responses `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`. Non-admins get 404, not 403. Uses `CATALOG_ADMIN_DATABASE_URL` (read + status updates only). |
| Contents | **Library health** (first tab): flagged libraries first (name, platform, host, flag reason, failures in 7 days by class, last success, median time), then all libraries with checks in 7 days sorted by failure rate; Acknowledge and a note per library; CSV export for the connector audit (5.6). **Usage** (from the anonymous log): searches per day, searches with no results (text and count, last 30 days), library checks per library by outcome with p50/p95 time, result-marking coverage (books marked / books shown), library-finder searches with no results. No row links to a person. Library requests: text, count, first/last date, status (open/added/declined/spam), note; sorted by count. Problem reports: newest first, body, screen, library, book link, status. Summary: answers stored per library, found/not-found counts, opt-out list from the policy file. |
| Fallback | If accounts are off, the owner uses SQL in the Neon console with the admin role. |
| Later | A weekly email digest through the existing Resend setup (new health flags, top unmet requests), if the owner wants it. |

---

## 7. Work breakdown

Every phase lands behind `VITE_ONE_SHELF` (client, build-time) and/or a
server flag, so production stays unchanged until Phase 13. Sizes: S ≈ 1–2
days, M ≈ 3–5 days, L ≈ 1–2 weeks, XL ≈ 2–4 weeks of focused work.

The phases were renumbered after the owner decisions: the lookup layer is now
Phase 1 and the catalog store's server part is Phase 2, both before any UI
work. Old numbers are in brackets.

### Phase 0 — Groundwork (S)

- Scope: copy the mockups to `docs/design/2026-11-one-shelf/` with a README of
  the owner decisions; add flag plumbing (`VITE_ONE_SHELF`); `AppRoutes`
  switch in `App.tsx` that renders the new tree when the flag is on; Vercel
  Preview env sets the flag on, Production off. No visible change.
- Files: `client/src/v2/App.tsx`, `client/src/vite-env.d.ts` (if present),
  `.env.example`, `docs/design/2026-11-one-shelf/README.md`,
  `docs/STATUS.md`.
- Tests: unit test that the flag off renders today's routes.
- Acceptance: production build with the flag off is byte-identical in
  behaviour; all existing suites pass.
- Depends on: nothing. Runs alongside Phase 1.

### Phase 1 — Catalog lookup layer (XL) (new)

- Scope: section 5.1–5.6. Confirm the inventory in 5.1 against the code and
  the merged audit work; `server/services/catalog-lookup/` with `lookupBook`
  and `markResults`; one platform descriptor per adapter with its strategy
  (5.3) and budgets (5.4); `outcome.js` projection; Calil `checkMany`; verify
  and, if they work, add Koha RSS rows with ISBNs and OR queries for Koha,
  VuFind, BiblioCommons and Vega (each a small spike; unverified forms stay
  off); abort signal through `withCatalogOperation` and `providers/http.js`;
  per-host circuit; robots check for production adapters (reuse the audit
  transport's); a `record.js` sink interface whose Phase 1 implementation
  writes only allowlisted health counters to the redacted telemetry sink
  (library ID, platform, failure class, duration; `telemetry.js` gains
  `libraryId` and `platform` as allowed keys); `/availability` switched to the
  layer per platform behind `CATALOG_LOOKUP_V2`.
- Coordination: 5.6. Starts once the audit branch's adapter and transport
  changes are merged by their owner, or rebases onto them.
- Files: `server/services/catalog-lookup/*` (new),
  `server/services/libraryBookSearch.js`, `server/services/providers/http.js`,
  `server/services/providers/calil.js`, `server/services/providers/index.js`,
  per-adapter files only where a batch form is added,
  `server/public-v2/availability.js`, `server/public-v2/telemetry.js`,
  `server/package.json` (test list).
- Tests: per platform, with fixture providers counting requests: book-page
  and result-marking requests never exceed the budget; a timeout, block or
  unreadable page is `couldnt_check` and never `not_found`; `not_found` only
  from `recognizedExact` or a complete work-level no-match; title-only rows
  give no `found`; same-title different work gives no `found`; abort stops
  further requests; Calil batch maps each ISBN separately; the old and new
  paths give the same answers on every existing provider fixture.
- Acceptance: every platform in 5.1 answers through `lookupBook`; the
  strategy table (5.3) is confirmed or corrected with measured speeds from
  production-path checks on two libraries per platform (one sample each is
  enough for the small platforms); the "to verify" rows are resolved; old UI
  behaviour unchanged.
- Depends on: nothing (Phase 0 may run alongside).

### Phase 2 — Catalog store, holdings API, health record and log (L) [was 6, server part]

- Scope: provision the Neon project (owner), roles, migration 001, generalised
  migrator, `server/catalog-store/*` (holdings, health, usage log, requests,
  policy, maintenance), policy file `server/data/catalog-policies.json`
  (empty), the Phase 1 sink switched to the database, `host_request_windows`,
  `/holdings/lookup`, `/holdings/check`, `/library-requests`,
  `/problem-reports`, submission rate limits (requests: 5 per hour per IP
  digest and one per text per IP per day; reports: 5 per hour), daily
  maintenance cron in `vercel.json` (expiry, purge, log rollup at 12 months,
  health refresh and flag rule), flags `CATALOG_STORE_ENABLED` and
  `USAGE_LOG_ENABLED`, store fail-open behaviour. The existing book page
  (old UI) starts storing answers, health and the log.
- Files: `server/catalog-store/*`, `server/db/migrate.js`,
  `server/public-v2/router.js`, `server/public-v2/validation.js`,
  `server/public-v2/places.js` (comment, log call),
  `server/application.js` (cron route), `server/package.json` (scripts and
  test list), `vercel.json`, `.env.example`, `.github/workflows/web.yml`
  (create `catalog_test` database in the Postgres service, set
  `CATALOG_TEST_DATABASE_URL`).
- Tests: unit (identity derivation never uses titles; write rules table;
  `not_found` never overwrites `found`; both expire at 180 days; opt-out
  blocks answer writes but not health; store down → live check and no error;
  validation and limits; usage log rejects any key outside the allowlist,
  scrubs emails, URLs and long digit runs, keeps valid ISBNs, never stores
  IP, user agent or coordinates; health flag rule: 3 failures on 2 days in 7
  days flags, retries within 30 minutes count once, a success clears),
  integration against Postgres (TTL filter, upsert, maintenance deletes, log
  rollup leaves no text, role grants), router tests for each route.
- Acceptance: second open of the same book in the same library makes no
  catalog request (fixture provider counting calls); a timed-out check stores
  no answer and writes one health event; a library in the policy file never
  gets answer rows; no `usage_events` row has a field that could identify a
  reader.
- Depends on: Phase 1; owner approval of the database (option A in 4.1).

### Phase 3 — Storage migration and state (M) [was 1]

- Scope: section 3.4 migration; `mybookshelf.one-shelf.v1`; de-duplication;
  removal of availability and lookup-preference keys; holdings store skeleton
  (in-memory); saved-identity helper (`bookKey`/`isbn13`).
- Files: `localState.ts`, `readerState.ts`, `context.tsx`, new
  `oneShelfState.ts`, new `holdings.ts`, `legacyCleanup.ts`.
- Tests: `localState.test.ts` (old v1/v2 records load unchanged; duplicate
  keys collapse; an old bundle can read what the new bundle wrote),
  `readerState` key removal, `recovery.test.tsx` unchanged.
- Acceptance: a browser profile from production keeps its shelf, viewed books,
  saved free items and library after loading the new build and after rolling
  back.
- Depends on: Phases 0 and 1 (UI work starts after the lookup layer).

### Phase 4 — The one-screen shell (L) [was 2]

- Scope: `HomeScreen`, `TopBar`, `SearchBar` (input + scan button; search not
  wired yet beyond focus), library name line (plain text, icon only if the
  directory has one; none today), `Bookcase` (3D bays, face-out covers with
  page edges, back panel and shadows), `BookCover3D` with typeset fallback
  (colour from `spineColors.ts`), `SpineRow` ("Viewed before", Clear), `ShelfList`,
  `ViewSwitch`, `EmptyShelf` ("Ready to search", "Add books to your shelf and
  search in your library", Search and Scan buttons, empty bays),
  `AccountInvite` (after the first saved book; guests only; only when
  `/api/account/capabilities` reports email accounts; Not now dismisses
  forever), `SidePanel` shell (left drawer, focus trap, Esc, Back closes),
  long-shelf virtualisation (rows outside the viewport use
  `content-visibility: auto`; above 200 books render rows on demand).
  The `AppFrame` keeps reading light, notices and undo, but not `TabBar`
  when the flag is on. Mobile only; desktop gets a usable centred column
  until the desktop design (backlog).
- Files: new `ui/home/*`, `ui/shelf/*`, `ui/panel/SidePanel.tsx`; edits to
  `ui/AppFrame.tsx`, `ui/BookCard.tsx` (`Cover`), new `ui/home/home.css`
  (Daylight tokens; Lamplight and Ink keep working with derived tokens until
  designed).
- Tests: unit tests for bay layout (`shelfLayout.test.ts` extended), empty
  state, invite show/dismiss rules, no text under covers, list view; axe on
  the home screen.
- Acceptance: matches `Main`, `FirstBook`, `Shelf` (idle) and `AccountPanel`
  boards at 390 × 844 in Daylight; readable (contrast checked) in Lamplight
  and Ink; 44 px targets including spines; keyboard reachable; reduced motion
  removes transitions.
- Depends on: Phase 3.

### Phase 5 — Search on the shelf (M) [was 3]

- Scope: `useBookSearch` (public data only; aborts on new input; offline →
  "Couldn't search" without a request), own saved matches first with bookmark
  badge, nine covers, list switch, ghost books while searching, "No books
  found" + Scan button, "Couldn't search" + Try again, clear (×) returns to
  the shelf, slide motion (shelf down, results down from above; off under
  reduced motion), Back from a book restores results (history state +
  `searchMemory.ts`, visible count 9). ISBN typed or scanned that resolves
  to one book opens the book page directly (existing `kind: 'exact'`).
- Hidden, not deleted: library-scope search (server `libraryId` path,
  `catalogBooks.js`, `api.searchBooks(…, libraryId)`), free content scopes
  (`ui/content/*`, `contentApi.ts`, `SearchScopes`), `AlsoFree`.
- Files: new `ui/search/*`, `ui/home/ShelfStage.tsx`, `searchMemory.ts`
  (comment, 4.6.2), `api.ts`.
- Tests: unit tests for own-match ordering and de-duplication by
  `bookKey`/`isbn13` only (two editions with the same title stay separate),
  error/offline states, abort on clear.
- Acceptance: `Results`, `SearchStates` and `Shelf` (searching) boards;
  search text never appears in the URL or browser storage.
- Depends on: Phase 4.

### Phase 6 — Scan pop-up (M) [was 4]

- Scope: `ScanDialog` replacing `CameraLookup`'s sheet in `ScanPage.tsx`:
  camera frame + ISBN field + Find; success opens the book; camera refused →
  "Allow camera" (re-requests permission; ISBN field stays); no camera →
  "Type the ISBN" directly; non-ISBN barcode → one line "Not an ISBN. Try the
  back cover." and the camera keeps running; second miss, or a valid ISBN
  with no known book → "Couldn't match that barcode" with "Search by title"
  (closes the pop-up, focuses search) and "Scan again".
- Files: new `ui/scan/ScanDialog.tsx`; `camera.ts`, `barcodeDecoder.ts`
  (expose non-ISBN decode results), `cameraLifecycle` handling.
- Tests: `camera.test.tsx`, `cameraLifecycle.test.ts` extended; unit tests for
  each state; e2e with `camera-frames.js`.
- Acceptance: `Scan` and `ScanStates` boards; camera stops when the pop-up
  closes; Back closes the pop-up.
- Depends on: Phase 4.

### Phase 7 — Book page, library card and library pop-up (L) [was 5 + client part of 6]

- Scope:
  - `BookPage` rewrite: 3D cover, title, author, first published, ISBN;
    full-width `SaveButton` ("Add to my shelf" ↔ "On my shelf", short tick;
    tapping "On my shelf" removes, with the existing Undo toast); "Added to
    your shelf · See my shelf" toast from `BookChecked`; "About this book"
    only when a description exists; "Read more elsewhere": Goodreads
    (`goodreadsUrl`) and Open Library (work page, else ISBN page). No share
    button, edition settings, details table, companion or bookmark icon.
  - `LibraryAnswerCard`: one row with icon (if any), library name, Catalog
    link (record URL when known, else `catalogHandoffFor` search link, else
    the library's catalog home). Green found, white not found, grey checking
    or couldn't check (Try again), grey unconfirmed; each with a status icon
    and accessible label (`Found in X`, `Not found in X`, `Couldn't check X`,
    `Checking X`). Before a library is chosen: "Is it in your library?" +
    "Find my library". Uses `/holdings/check` (Phase 2); shelf badges use
    `/holdings/lookup`.
  - `LibraryPickerDialog`: "Libraries near me" and a "City, town or library
    name" field fill one list in place (reuse `useLibraryDiscovery.ts`;
    remove area browse selects); rows show name, area · type, distance when
    known. Selecting closes the pop-up and, from a book, checks that book.
    Nothing found: "No libraries here yet" + `Request to add “<text>”`
    (`/library-requests`). The typed text stays in component state only;
    coordinates are never kept after the request.
  - `/select/:slug` becomes a silent pre-select: resolve, select, go to
    `next` (or the book in `?book=`) or the shelf. Failure shows the existing
    "link not found" notice on the shelf.
  - Signed-in readers: opening a book records it in the account's Viewed
    before (4.7).
- Retire `ui/journal/DueSlip.tsx` usage (file deleted in Phase 12).
- Files: `ui/book/*`, new `ui/library/LibraryPickerDialog.tsx`,
  `ui/library/SelectLibraryPage.tsx`, `useLibraryDiscovery.ts`,
  `bookNavigation.ts`, `client/src/v2/api.ts`,
  `storage/AccountLibraryStateProvider.tsx`.
- Tests: rewrite `ui/book/BookPage.test.tsx` and `BookPage.test.ts` (each
  card state; a failed check is never white; unconfirmed is grey),
  `BookFirstFlow.test.tsx`, `LibraryLinks.test.tsx`, `LibrariesPage.test.tsx`
  → `LibraryPickerDialog.test.tsx`.
- Acceptance: `Book`, `BookChecked`, `BookStates`, `LibraryPicker`,
  `LibraryNearby`, `LibraryStates` boards; picking a library from a book
  shows that book's answer without leaving the page.
- Depends on: Phases 2, 4 and 5.

### Phase 8 — Background check for search results (L) [was 7]

- Scope: section 5.7–5.9. `/holdings/search` NDJSON route over
  `markResults`; `waitUntil` writes; per-host concurrency; client
  `useLibraryMarks` (stream reader already exists in `api.ts`
  `post(…, progress)`; generalise it), badges with pop-in (none under reduced
  motion), "Looking in <library>…" status line as in the `Shelf` board only
  while running (visually small, announced politely once), cancel on pick,
  clear and refill on library change, shelf background fill (three per
  visit).
- Server flag `HOLDINGS_BACKGROUND_ENABLED` (kill switch; when off the route
  replies `done` with all unchecked).
- Files: `server/public-v2/holdings.js` (new),
  `client/src/v2/ui/search/useLibraryMarks.ts`, `client/src/v2/api.ts`.
- Tests: per platform family, requests within the results budget (fixture
  counter); zero for platforms without a results strategy; title-only rows
  give no badge; same-title different work gives no badge; abort stops
  further requests; stream ends by 25 s with a slow fixture; stored answers
  stream first.
- Acceptance: `Shelf` board sequence (searching → marks appear); no result is
  ever shown as "not in library".
- Depends on: Phases 2, 5 and 7.

### Phase 9 — Side panel, policy pages and accounts restyle (M) [was 8]

- Scope: `SidePanel` content: signed out → Create account, Log in; signed in →
  email, Log out, Account settings. My library + Change (opens the picker).
  Reading light (Daylight / Lamplight / Ink). Rows: Report a problem, Privacy,
  About. `ReportProblemPage` (one text box, Send → "Sent"; attaches screen,
  library ID and book key only). `PrivacyPage`, `TermsPage` and `AboutPage`
  from the approved texts (section 10). Create account form: the line "By
  creating an account you agree to the Terms and Privacy" with both linked.
  `AccountSettingsSmall` (Change password, Delete account with "Delete account
  and shelf?" confirmation). Restyle `AccountPages.tsx` forms to the
  `AccountStates` board: wrong email or password, couldn't connect + Try
  again, forgot password → link sent, email already used (+ Log in), password
  too short (`Too short: N characters or more`, N from the existing
  validation, 15 today), delete confirmation. Viewed before saved to the
  account automatically (4.7): server change, account migration `012`, removal
  of the history switch and history-import checkbox and their copy, account
  contract documents.
- Hidden, not deleted: the rest of `AccountSettingsPage.tsx` (email change,
  sessions, export, providers, profile) stays reachable at
  `/app/settings/account/more` until the owner decides (section 9, question 18).
- Files: `ui/panel/*`, `ui/account/AccountSettingsSmall.tsx`,
  `ui/account/AccountPages.tsx`, `ui/account/AccountSettingsPage.tsx`,
  `ui/account/account.css`, `App.tsx`, `server/accounts/history.js`,
  `server/db/migrations/012-*.sql`, `client/public-app/support.html`,
  `docs/accounts/*` (4.7).
- Tests: `AccountForm.test.tsx`, `AccountEntry.test.tsx` updated; new panel
  tests; history integration tests (a signed-in open is recorded without any
  setting; deletion removes it); `accounts-real.spec.js` entry points changed
  from the tab bar to the panel.
- Acceptance: `AccountPanel`, `AccountSignedIn`, `AccountSettings`,
  `AccountStates`, `ReportProblem`, `Privacy`, `About` boards; the Terms line
  is on the Create account form.
- Depends on: Phase 4; Report a problem needs Phase 2; the policy pages need
  the owner-approved texts (legal review can follow, 10.3).

### Phase 10 — Admin view (M) [was 9, S]

- Scope: section 6, including library health and usage.
- Files: `server/admin/*` (new), `server/application.js`,
  `client/src/v2/ui/admin/AdminPage.tsx`, `App.tsx` (lazy route).
- Tests: non-admin session → 404; signed-out → 404; admin can list and change
  status and acknowledge a health flag; CSRF/origin enforced; no data under
  `/api/v2`; usage views never return a field outside the log allowlist.
- Acceptance: owner sees flagged libraries, usage totals, requests with
  counts and reports in production.
- Depends on: Phase 2.

### Phase 11 — Anonymous analytics and Search Console (S) (new)

- Scope: 4.6.1. Owner turns on Vercel Web Analytics for the project; add
  `analytics.ts` with URL scrubbing and the four custom events; load it on the
  app and the public pages; verify CSP on a preview; Search Console domain
  verification (DNS) and sitemap submission.
- Files: `client/src/v2/analytics.ts`, `client/src/v2/App.tsx`,
  `client/package.json`, `tools/seo/build-pages.mjs`, `vercel.json` (only if
  the CSP check fails).
- Tests: `beforeSend` unit tests (query strings and fragments removed, book
  keys and account paths collapsed, admin dropped); bundle grep that no event
  carries text; Playwright check that no cookie is set.
- Acceptance: visits and the daily counts appear in Vercel; no cookie; no
  URL with a query string in the analytics view.
- Depends on: Phase 0. Can land any time before release.

### Phase 12 — Remove old surfaces, redirects, public pages (M) [was 10]

- Remove (when the flag is retired): `ui/TabBar.tsx`, `ui/shelf/ShelfPage.tsx`,
  `ui/scan/ScanPage.tsx` (keep `SearchResult.tsx` only if reused),
  `ui/library/LibrariesPage.tsx`, `LibraryDetail.tsx`, `LibraryMap.tsx`,
  `CopyLibraryLink.tsx`, `ui/settings/SettingsPage.tsx`,
  `ui/journal/DueSlip.tsx`, `exampleBooks.ts`, `DogAnimation.tsx`,
  `Bucky.tsx`, `dogAnimation.ts`, `JourneySteps.tsx`, the old tab-bar
  desktop sidebar CSS in `reader-desktop.css`/`desktop.css`, and their tests.
- Keep, hidden: `ui/content/*`, `contentApi.ts`, `knowledgeSearch.ts`,
  content server routes; server library-scope search; `/availability`
  (remove 30 days after release).
- Redirects (client `<Navigate replace>` in `App.tsx`; no server change needed
  because `vercel.json` already sends `/app/*` and `/select/*` to the SPA):

  | Old | New |
  |---|---|
  | `/app/search` | `/app/shelf` with search focused |
  | `/app/search?q=…` | `/app/shelf`, runs the search once, then `replace` drops `q` |
  | `/app/search?scope=free\|papers\|knowledge…` | content page when `VITE_CONTENT_DISCOVERY_ENABLED`, else `/app/shelf` |
  | `/app/libraries`, `/app/libraries?q=…` | `/app/shelf` + library pop-up; `q` copied into the field, then dropped from the URL |
  | `/app/libraries?book=<key>` | `/app/books/<key>` + library pop-up |
  | `/app/settings` (+ `#privacy`) | `/app/shelf` + side panel (`/app/privacy`) |
  | `/find` | `/app/shelf` |
  | `/privacy` (client route) | `/app/privacy` (fixes the broken `/settings#privacy`) |
  | `/select/:slug?next=/app/search` | silent select, then `/app/shelf` |

- Public pages (`tools/seo/build-pages.mjs`): guide buttons link to
  `<selectionPath>?next=/app/shelf`; remove the "What MyBookshelf can check
  here" list of copy counts, locations and call numbers and replace with one
  line "Check whether this library has a book"; "How it works" step 3 and
  copy about "on the shelf, all on loan" changed to found / not found /
  couldn't check; "Privacy in plain words" and `/about` rewritten to the new
  model (4.6.2 table); `client/public-app/privacy.html` website sections
  replaced with the approved privacy text, and a terms page added (section
  10). The landing hero form is **not** redesigned here (backlog). Sitemap
  stays at nineteen URLs plus the terms page if it is public;
  `shared/seo-libraries.json` unchanged.
- Tests: `tools/seo/build-pages.test.mjs`, `client/e2e/seo-launch.spec.js`,
  redirect unit tests, `library-links.spec.js`.
- Depends on: Phases 4–11.

### Phase 13 — Hardening and release (M) [was 11]

- Scope: performance work on the 3D shelf (8.4), full accessibility pass on
  mobile in Daylight (contrast checks in Lamplight and Ink), e2e rewrite
  completion, documentation (`docs/STATUS.md`, `docs/README.md`, `README.md`,
  `CLAUDE.md`/`AGENTS.md` lines about tabs, pages and the search-text rule,
  4.6.2), release (8.6). Release prerequisites: account database backups and
  restore exercise (4.7); legal review of the policy texts done or explicitly
  deferred by the owner (10.3).
- Not in scope (backlog, section 11): desktop layout, Lamplight and Ink
  design, landing page redesign.
- Depends on: all.

### Summary

| Phase | Size | Releasable alone |
|---|---|---|
| 0 Groundwork | S | yes (no visible change) |
| 1 Catalog lookup layer | XL | yes, per platform behind `CATALOG_LOOKUP_V2` (old UI, same answers) |
| 2 Catalog store, holdings API, health, log | L | yes (old UI starts storing answers, health and the log) |
| 3 Storage migration | M | yes (no visible change) |
| 4 One-screen shell | L | behind flag |
| 5 Search on the shelf | M | behind flag |
| 6 Scan pop-up | M | behind flag |
| 7 Book page + library pop-up | L | behind flag |
| 8 Background check | L | behind `HOLDINGS_BACKGROUND_ENABLED` |
| 9 Side panel, policy pages, accounts restyle | M | behind flag (history change is server-side; ship with the flag flip) |
| 10 Admin view | M | yes |
| 11 Analytics and Search Console | S | yes |
| 12 Removal, redirects, public pages | M | with flag flip |
| 13 Hardening and release | M | release |

Critical path: 1 → 3 → 4 → 5 → 7 → 8 → 12 → 13, with 2 landing before 7
(it runs alongside 3–5). Phases 0, 6, 9, 10 and 11 run in parallel once
their dependencies land. Roughly 13–17 weeks of focused work for one person,
Phase 1 being the largest single uncertainty.

---

## 8. Testing and release

### 8.1 Unit and integration

- Server: new `catalog-lookup/*.test.js`, `catalog-store/*.test.js` and
  `public-v2/holdings.test.js` added to the `test` script in
  `server/package.json`; integration tests skip without
  `CATALOG_TEST_DATABASE_URL` and run in CI.
- Invariants with dedicated tests: failed/timed-out checks never become
  `not_found` (server projection and client card); no stored answer is keyed
  by title or author; same-title different works never share a badge; opt-out
  libraries never get answer rows; every platform stays within its request
  budget; search text reaches the database only through `usageLog.js` and
  never reaches URLs, platform logs, the telemetry sink or analytics events;
  no `usage_events` row carries an account ID, IP, user agent or coordinates;
  the analytics `beforeSend` strips query strings; provider keys (`GOOGLE_BOOKS_API_KEY`, `CALIL_APP_KEY`) never
  appear in client bundles (`npm run build` + grep in CI).

### 8.2 E2E journeys

| Spec | Action |
|---|---|
| `anonymous-journeys`, `reading-room-journey`, `reading-room-shelf`, `reading-room-search`, `shelf-first-camera`, `book-discovery`, `saved-data` | Rewrite for the one screen: empty shelf → search → results → book → add → shelf; scan; remove; clear viewed before; reload keeps everything |
| `catalog-search` | Rewrite as background-check journeys (fixture marks; slow catalog; cancel on pick) |
| `library-links` | Silent pre-select from `/select/<slug>` and from a guide page |
| `responsive-layout`, `desktop-layout`, `laptop-refinement`, `reading-polish`, `book-geometry`, `book-motion` | Rewrite against the new layout and motion |
| `reading-room-accessibility` | Extend to every new screen and pop-up |
| `search-coverage`, `metadata-search` | Keep (public search), update selectors |
| `dog-animation` | Delete with the companion |
| `free-content*`, `knowledge-search`, `full-collection-search` | Keep; run only in a build with `VITE_CONTENT_DISCOVERY_ENABLED=true` |
| `accounts-real`, `accounts-visual` | Entry through the side panel |
| `seo-launch`, `harness` | Update links; keep |
| New `redirects.spec.js` | Every row of the Phase 12 redirect table |
| New `policy-pages.spec.js` | Privacy, Terms and About open from the side panel; the Create account form links Terms and Privacy |
| New `holdings.spec.js` | Shelf badges, result badges, library change refill |

`public-v2-fixture.js` gains holdings routes (including a streaming
`/holdings/search` fixture with delays).

### 8.3 Accessibility, motion, lights, desktop

- axe-core on every screen and pop-up in Daylight, plus a contrast check in
  Lamplight and Ink until they are designed (backlog); keyboard
  only: Tab order person icon → search → scan → view switch → shelf; arrow-key
  navigation within a shelf row is optional, but every cover is a focusable
  link with "Title by Author" (and ", on my shelf" / ", in <library>").
- Pop-ups and the side panel: `role="dialog"`, `aria-modal`, focus trap,
  return focus, Esc and Back close.
- Status changes (results loaded, library badges added, answer card) are
  announced once through one polite live region.
- Reduced motion: no slide, tick, badge pop or spinner rotation (static
  "Checking" icon); Playwright already forces `reducedMotion: 'reduce'`; add
  one project with `no-preference` for the motion specs.
- Reading lights: Daylight is designed. Lamplight (dark) and Ink are designed
  after the mobile version is final (backlog); until then they use derived
  tokens and must still meet contrast ≥ 4.5:1 for text and ≥ 3:1 for badge
  outlines and card state borders, so a reader who has chosen one is not
  locked out.
- Desktop: designed later (backlog). Until then one check at 1280 × 800 that
  the centred mobile column is usable.

### 8.4 Performance budget (3D shelf on low-end Android)

Reference device: Moto E / Galaxy A0x class (2 GB RAM); lab proxy: Chrome
mobile emulation with 4× CPU slowdown and Slow 4G.

| Metric | Budget |
|---|---|
| LCP on `/app/shelf` (warm cache) | ≤ 2.5 s |
| INP (tap a cover, open search) | ≤ 200 ms |
| Scroll with 100 saved books | ≥ 50 fps, no long task > 100 ms |
| Added JS (gzip) | ≤ 25 KB over today's app bundle |
| Wood/shelf textures | ≤ 60 KB total, reuse `/textures/` with long cache |
| Composited layers | ≤ 2 per visible book; 3D transforms only on visible rows |

Techniques: one shared `perspective` per bay, not per book; page edges and
shadows drawn with gradients, not filters or stacked box-shadows; covers
`loading="lazy"`, `decoding="async"`, fixed width/height; `content-visibility`
on off-screen rows; a flat cover mode when `navigator.deviceMemory ≤ 2` or
`prefers-reduced-motion`. Measure with Lighthouse and the Performance panel
before Phase 13 exits.

### 8.5 Release checks

As README: `npm run typecheck:client`, `npm run test:client`,
`npm test --workspace=server`, `npm run build`, `npm run test:seo`,
`node --test tools/deployment/*.test.mjs`, Playwright chromium,
mobile-chromium and webkit (WebKit could not run in the last environment;
CI must run it).

### 8.6 Rollout

1. **Batch pushes.** Every push to a branch connected to Vercel creates a
   paid preview build. Work locally, run the full suite locally, and push
   once per phase (or less). Documentation-only pushes are skipped by
   `tools/deployment/ignore-web-build.mjs`; do not rely on that for code.
2. Preview: `VITE_ONE_SHELF=true` and the catalog store pointed at a Neon
   branch of the catalog project. Owner reviews against the boards on a real
   Android phone and an iPhone.
3. Production, step 0: deploy Phase 1 with `CATALOG_LOOKUP_V2` switched on
   one platform at a time while the old UI is live; compare answers and
   speeds with the previous week.
4. Production, step 1: deploy Phase 2 with `CATALOG_STORE_ENABLED=true`
   while the old UI is still live; the book page starts storing answers and
   the health record (neither holds reader data). Keep
   `USAGE_LOG_ENABLED=false`: the current Privacy page says searches are not
   stored. Watch for a week (store errors, Neon compute hours, health flags).
5. Production, step 2: publish the approved Privacy and Terms texts, then in
   the same deploy set `VITE_ONE_SHELF=true` and `USAGE_LOG_ENABLED=true`,
   ship the Viewed before change and turn on analytics; keep
   `HOLDINGS_BACKGROUND_ENABLED=false` for 48 hours, then turn it on.
6. Rollback: Vercel Instant Rollback to the previous production deployment
   (recorded in STATUS before release). The storage migration is
   backward-compatible (3.4) and the database is additive, so rollback needs
   no data step. The background check has its own kill switch.
7. After 30 days stable: remove the flag and old code (Phase 12 removals),
   remove `/availability`.

---

## 9. Open questions and risks

**Owner decisions recorded after this section was written (they override any conflicting row below):**

- The connector audit agent is no longer active. Phase 1 builds on the current adapters and takes whatever is useful from `feat/library-connector-audit` by reading it; there is no one to wait for.
- There are no existing accounts, so nothing has to be migrated or announced for account history. Viewed before is simply on for every account from the start.
- A library is flagged as failing after 3 failed attempts on 2 different days within 7 days, and the flag clears on the next success.
- The service is run by Deepak Ravikumar, India; the contact address in the policy texts is the owner's. `docs/policy/` no longer has placeholders for these.
- Still to fill before publishing the policy texts: the effective date, how long backups are kept (depends on the database plan), and how long the analytics tool keeps data.


Each item has a recommended answer for the owner to confirm. Items settled by
the owner decisions (storing "not found", library request text, desktop
layout, Lamplight and Ink, Viewed before for accounts, accounts and age, the
one-query rule, Privacy and About copy, Indian-script search) were removed;
the decisions are at the top of this document.

| # | Question or risk | Recommendation |
|---|---|---|
| 1 | **Health flag thresholds.** Decision 2 says "several separate attempts across a few days". | Flag at 3 or more failed attempts, at least 30 minutes apart, on at least 2 different days within 7 days, with no success since the first. Clear on the next success. Tune after a month of data. |
| 2 | **Catalog terms on storing answers.** Decision 8 allows storage unless a library forbids it. Calil API and BiblioCommons terms were not read; NIC/e-Granthalaya, INFLIBNET and MasterSoft have none on record. | Read the Calil and BiblioCommons terms before Phase 2 goes live; if either forbids caching, add its libraries to the policy file with `storeAnswers: false`. Publish a short "For libraries" note on `/about` saying what is stored, for how long, and that a library can ask by email to stop; handle by adding to `catalog-policies.json` and deploying (the daily job purges). |
| 3 | **Existing accounts and the history switch.** Some accounts may have history off (the default) or paused. Decision 5c makes Viewed before automatic. | Turn it on for every account at the release (migration `012`), say so in the Privacy "What changed" note, and do not backfill anything from before. |
| 4 | **Limits on the account's Viewed before.** Today: newest 50 distinct books, 30 days. | Keep newest 50; drop the 30-day expiry so it behaves like the browser list and the Privacy text ("until you clear it or delete the account"). |
| 5 | **Guest Viewed before at sign-in.** The import step asks separately about recent books today. | Include it with saved books in the existing import step, without the separate checkbox. |
| 6 | **Library-finder text in the operational log.** Decision 5b names "search text"; the old rule was about library search text. | Log typed library and place text under the same rules (`library_finder`), and "near me" as a count only. It shows which libraries readers look for and cannot find. |
| 7 | **Analytics tool and plan.** | Vercel Web Analytics. Confirm custom events are included in the current Pro plan and note its retention period for the Privacy text. If custom events cost extra, take daily search counts from the operational log instead. |
| 8 | **Time precision in the log.** | Hour. It is enough for daily totals and peak-hour load, and makes the log harder to line up with anything else. |
| 9 | **Six-month "not found" hides new stock.** | Accept (decision 1). Add a "Forget stored answers" action per library in the admin view if reports show stale answers. |
| 10 | **Unverified batch forms.** Koha RSS rows with ISBNs, and OR queries for Koha, VuFind, BiblioCommons and Vega, are not proved. | Spike each in Phase 1 against two live libraries. Anything not proved stays off; those results get answers when opened. |
| 11 | **Dependency on the audit merge.** Phase 1 wants the audit branch's adapter and transport changes merged first. | Ask the audit owner for a code-only pull request (no evidence files). If it is not ready within a week of Phase 1 starting, build on the current adapters and rebase. |
| 12 | **Cross-instance request counting adds a database write per catalog request.** | Increment with a 300 ms timeout and fail open to per-instance limits; batch increments per operation. Watch Neon compute after Phase 2. |
| 13 | **Landing form puts typed library text in a URL until the redesign** (decision 7). | Analytics and the log strip it (4.6.1). Optionally, a one-line interim change in Phase 12 so the form opens the library pop-up without `?q=`; owner to choose. |
| 14 | **The current privacy page also covers the native apps.** | If the native apps are still distributed, keep their section as is on a separate page, and use `docs/policy/privacy.md` for the website. Owner to confirm. |
| 15 | **Contact address and legal entity.** The live pages use a personal Gmail and a personal name. | Use a project address on `mybookshelf.cloud` and fill the entity and country placeholders before publishing. |
| 16 | **Default reading light.** Today the default is "system", which shows Lamplight on dark-mode phones; Lamplight is designed later. | Keep honouring an existing saved choice; for new readers default to Daylight until Lamplight is designed, then return to following the device. |
| 17 | **Where "clear Viewed before" lives.** | A small "Clear" text button at the right of the "Viewed before" heading, one tap, with the existing Undo toast instead of a confirmation dialog. For signed-in readers it calls `/api/account/history/clear`. |
| 18 | **The rest of Account settings** (email change, sessions, export, provider links, profile name). | Keep them reachable from a "More" link on Account settings for now; export should remain available for data-access requests (10.3). Decide later whether to drop any. |
| 19 | **Tapping narrow spines.** Mockup spines are 44–52 px wide. | Minimum spine width 44 px; hit area extends to the full spine height; each spine is a link with the full title and author as its label; "Viewed before" row scrolls horizontally with visible focus. |
| 20 | **Cover images for the typeset fallback.** Many Indian titles have no Open Library or Google cover. | Plain coloured cover from `spineColors.ts` keyed by `bookKey`, title and author typeset in the app font, colours checked for contrast. Detect missing Open Library covers with `?default=false`. No third-party cover sources added. |
| 21 | **Library icons.** The directory has no icon or logo field. Logos are trademarks. | Launch with no icons (the card and name line work without them). Later add an optional reviewed `icon` path per library in the directory, self-hosted under `/library-icons/` (CSP `img-src 'self'` already allows it), with the library's permission. |
| 22 | **"Unconfirmed" (possible match) has no board.** The four drawn states do not include it. Libraries whose records carry no ISBNs (Ernakulam, Visakhapatnam) will often land here. | Grey card, label "Couldn't confirm", Catalog link, no Try again. Never green. Not a health failure. |
| 23 | **Hidden edition settings.** Today a reader can ask for "only this ISBN" or a language. | Default to the work (all known ISBNs of the Open Library work, as today's default). Drop the settings sheet. A scanned ISBN still opens that exact edition, and its answer is checked by ISBN first. |
| 24 | **Existing readers' data.** | Shelf, Viewed before, library, reading light and saved free items are kept (3.4). Availability cache, edition settings and the companion setting are removed. Saved free items stay on the shelf as typeset covers opening `/app/read/…` even though free search is hidden. |
| 25 | **The due-slip feature.** `ui/journal/DueSlip.tsx` is the availability card, not a journal. | Remove it with the old book page; the server keeps returning availability details on `/availability` for now, and `library_profiles.reports_availability` records which libraries could show them later. |
| 26 | **The Bucky companion and "Copy library link".** Neither is in the design. | Remove the companion. Drop "Copy library link" from the app; libraries use the public guide or `/select/` links. |
| 27 | **Free text in requests and reports: abuse and duplicates.** | Normalise (NFKC, lower case, collapse spaces, strip punctuation) to merge duplicates; reject emails, phone numbers, URLs and text without letters; 80 / 2,000 char limits; IP-digest rate limits; never shown publicly; admin can mark spam; spam is deleted after 90 days. |
| 28 | **Cost ceilings.** | Catalog Neon project with compute fixed at 0.25 CU (≈ $20/month maximum on Launch, $0 on Free; the log needs Launch storage at 10×). Turn on Vercel Spend Management with an alert at the current monthly spend + 25%. Watch function duration after the background check ships. |
| 29 | **The mockups differ from the decisions in places.** As of the last read (2026-11-12 18:13), `AccountSignedIn` and the new `AccountSettings` board (9c) match the decisions. `LibraryPicker` still has a "My library isn't listed" link even when results exist, and `LibraryNearby` shows distances that the directory has only for libraries with reviewed points. `Settings.dc.html` is in the folder but not on the canvas (superseded by the side panel). There is no Terms board. | Follow the decisions. Make "My library isn't listed" show the request button with the current text. Show a distance only when the server returns `distanceKm`. Do not copy `Settings.dc.html` into the repo, or mark it superseded. Terms uses the Privacy board's layout. |
| 30 | **Search shows nine results only.** | Nine covers, no "more". The reader refines the query. List view also shows nine. Revisit with the log's "searches with no results" and analytics. |
| 31 | **Silent pre-select replaces a reader's existing library.** | Accept, as decided. The library name under the search bar shows the change; saved books are unaffected. |
| 32 | **Very long shelf.** Guests cap at 100, accounts at 1,000. | Virtualise bays beyond the first screens; offer list view; keep the caps. At the guest cap, "Add to my shelf" explains nothing and is disabled with an accessible reason ("Shelf full"); consider raising the guest cap later. |
| 33 | **Public API isolation.** `/api/v2` was designed with no database. | Keep cookies and account data out of `/api/v2`; the catalog store is separate infrastructure with its own roles and fails open. Update the comment in `router.js` and CLAUDE.md ("Express anonymous API") to say it uses an anonymous catalog store and log. |
| 34 | **Neon Free quota exhaustion suspends compute until the next month.** | Fail open (live checks continue); alert on store errors; move to Launch before wider rollout. |

### Not determined from the code

- Neon compute-hour usage of the account project, and whether the 5-minute
  cron keeps it always awake (needs the Neon console).
- Whether Calil's API terms allow storing results, and whether its batch ISBN
  form behaves as documented (needs a live check with the key).
- Whether BiblioCommons keyword search rows carry ISBNs for most titles
  (the adapter reads `briefInfo.isbns`, but coverage is unmeasured).
- Whether Koha's RSS search rows carry ISBNs, and whether Koha, VuFind, Vega
  or BiblioCommons accept OR queries over several ISBNs.
- Typical speeds for LIBMAN, IndCat, VuFind, the discovery families, Vega,
  Evergreen, Chamo and LibSys from production (no measurement on record).
- Real function-duration cost of 20–25 s streaming responses on the current
  Vercel plan.
- Whether Vercel Web Analytics custom events are included in the current
  plan, and its data retention.
- The account database's backup window after the plan change (needed for the
  Privacy text).
- How the design's 3D shelf performs on real low-end Android phones; the
  mockups are static HTML.

---

## 10. Policy texts

Drafts for owner and legal review, not yet published:
`docs/policy/privacy.md`, `docs/policy/terms.md`, `docs/policy/about.md`.
Facts the code cannot show are left as `[PLACEHOLDER]`s (legal entity,
country, contact email, effective date, analytics retention, backup days).

### 10.1 Where they are shown

| Text | In the app | Public site |
|---|---|---|
| Privacy | Side panel → Privacy (`/app/privacy`, `PrivacyPage`) | `client/public-app/privacy.html` website sections replaced (Phase 12) |
| Terms | Linked from the Create account form with the single line "By creating an account you agree to the Terms and Privacy" (both words are links); also at `/app/terms` | `/terms`, linked from the privacy page footer |
| About | Side panel → About (`/app/about`, `AboutPage`): the text, version (short commit SHA from the build) and contact | `/about` in `tools/seo/build-pages.mjs` rewritten to match (Phase 12) |

No age gate and no extra tap: the age line lives in the Terms (decision 6).

### 10.2 What the drafts change against today's pages

- Search text is now stored, anonymously (today: not stored).
- Viewed before is saved to the account automatically (today: off until
  turned on, 50 books, 30 days).
- Anonymous, cookieless analytics (today: "no analytics scripts").
- Age: 18 or older, or a parent's or guardian's permission (today: "not
  directed to children under 13").
- Google and Apple sign-in are not mentioned (disabled by owner choice).

### 10.3 Pre-launch legal review

A pre-launch item in Phase 13: have the three texts reviewed by a lawyer
before publishing. Things to check, without assuming the answers:

- India's Digital Personal Data Protection Act, 2023 (and its rules): notice
  content and language, the age line and parental permission, account
  deletion and data-access requests, contact for grievances, and whether
  free text in the anonymous log can count as personal data.
- For visitors from Europe, the GDPR: the basis for the anonymous log and the
  account's automatic Viewed before, whether the chosen analytics tool needs
  consent, transfers to processors outside Europe, and access, deletion and
  export rights.
- That every processor named in the Privacy text has suitable terms.

The owner either completes the review before release or explicitly defers it
in `docs/STATUS.md`.

---

## 11. Backlog

Not part of this plan's phases; designed or built after the mobile version is
final.

- Desktop layout (a starting proposal: centred column, max 960 px; bays widen
  to 5–6 covers; side panel as a 360 px left drawer; pop-ups as centred
  480 px dialogs; book page with the cover on the left above 900 px).
- Lamplight and Ink reading lights (derive from `reading-room.css` tokens;
  answer cards keep their meaning with icons and labels, not colour alone).
- Landing page redesign, including removing the typed library text from the
  URL (`/app/libraries?q=`).
- Indian-script search: catalogs that reject native script
  (`CATALOG_QUERY_UNSUPPORTED`) produce no badges today.
- Library-scope search (search one library's own catalog) and the return of
  free content (free to read, papers, all knowledge), including removing
  search text from their URLs (`free-content-ui.spec.js`).
- Lookup enabled per library from the audit registry's eligible list (5.6).
