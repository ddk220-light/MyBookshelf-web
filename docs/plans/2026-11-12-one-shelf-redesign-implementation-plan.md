# One-shelf redesign: implementation plan

Date: 2026-11-12. Branch at time of writing: `claude/nifty-feynman-4qwocr`.
Design: `docs/design/2026-11-one-shelf/` (the approved HTML mockups; `canvas.json`
lists the screens). Where a mockup and the owner decisions below differ, the
decisions win. Known differences are listed in section 9.

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
- A new small database stores "library X has book Y" for six months, library
  requests and problem reports, and serves an owner-only admin view.

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
| `/find`, `/privacy` (→ `/settings#privacy`, a broken target), `/login`, `/connect` | redirects / `NativeAppNotice` | `/find` and `/privacy` fixed, see 7.10 |

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
`candidateId` in history state; five cards per step). Search text is never
stored or put in the URL, except the legacy `?q=` entry handled by
`ScanPage`. `context.tsx` chooses `GuestLibraryStateProvider` or
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
  per-instance queues and a 60 s in-memory cache.
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
  standing rule forbids; fixed in Phase 10).

---

## 3. Target architecture

### 3.1 Client routes

| Route | Screen |
|---|---|
| `/app/shelf` (canonical; `/app` redirects) | Home: top bar + shelf, with search, results, scan pop-up, library pop-up and side panel as overlays |
| `/app/books/:bookKey` | Book page |
| `/app/settings/account` | Account settings (Change password, Delete account) |
| `/app/report` | Report a problem |
| `/app/privacy`, `/app/about` | Short Privacy and About pages |
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
panel/ReportProblemPage.tsx, panel/PrivacyPage.tsx, panel/AboutPage.tsx
account/AccountSettingsSmall.tsx  Change password, Delete account
admin/AdminPage.tsx         lazy
```

Reused unchanged or lightly changed: `camera.ts`, `barcodeDecoder.ts`,
`useLibraryDiscovery.ts` (minus area browse UI), `searchGroups.ts` (display
grouping only), `spineColors.ts` (typeset cover colours), `format.ts`,
`readingLight.ts`, `api.ts` (new methods), `auth/*`, `storage/*`.

### 3.3 Client state

- `LibraryStateProvider` (`context.tsx`) stays the single source for shelf,
  viewed-before and selected library, for guests and accounts.
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
| `mybookshelf.anonymous-web.dog-animation` | Remove once (companion retired, see 7.10). |
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
| `POST /holdings/search` | `{ libraryId, query, books: [...] }` (≤12) | NDJSON: `{type:'mark', bookKey, answer:'found'}` … `{type:'done', unchecked:[...]}` | Background check for results, section 5. |
| `POST /holdings/check` | `{ libraryId, bookKey }` | `{ answer: 'found'\|'not_found'\|'unconfirmed'\|'unknown', catalogUrl? }` | Book page. Stored answer, else one live check via the existing availability service. |
| `POST /library-requests` | `{ text }` | `202 {}` | One-tap request. |
| `POST /problem-reports` | `{ text, screen?, libraryId?, bookKey? }` | `202 {}` | Report a problem. |

Kept: `/availability` (old bundles in open tabs; remove after 30 days),
`/books/search` with `libraryId` (library-scope search, hidden in the client),
content routes (behind `CONTENT_DISCOVERY_ENABLED`). New owner-only routes
live outside `/api/v2`: `/api/admin/*` (section 6). New cron route
`/api/internal/catalog-maintenance` (daily).

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
catalog-store/requests.js    recordLibraryRequest, recordProblemReport, buckets
catalog-store/policy.js      reads server/data/catalog-policies.json (opt-outs)
catalog-store/maintenance.js expiry delete, opt-out purge, retention
catalog-store/migrations/001-catalog.sql …
catalog-store/*.test.js, *.integration.test.js (skip without CATALOG_TEST_DATABASE_URL)
```

Every call fails open: if the store is disabled, slow (>1.5 s) or down, the
API behaves as today (live check, nothing stored). A store failure is never
shown to the reader and never turns into "not found".

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
is about 0.3 GB.

Connection: Neon pooled connection string (`-pooler` host) with the existing
`pg` driver; one small pool per function instance (`max: 3`,
`idleTimeoutMillis: 10_000`, `statement_timeout` 1500 ms). Region: create the
project in AWS us-east-1 next to Vercel iad1.

Roles (created in the Neon console; no passwords in SQL):

| Role | Grants |
|---|---|
| `catalog_migrator` | owner; used only by `catalog:migrate` from an operator machine |
| `catalog_runtime` | SELECT/INSERT/UPDATE on `holdings_answers`; SELECT/UPDATE (`reports_availability*`) on `library_profiles`; INSERT/UPDATE on `library_requests`; INSERT on `problem_reports`; all on `submission_buckets` |
| `catalog_admin` | SELECT on all; UPDATE `status`, `status_note`, `resolved_at` on `library_requests` and `problem_reports` |
| `catalog_worker` | DELETE on `holdings_answers`, `problem_reports`, `submission_buckets` |

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

-- One-tap "Request to add <text>".
CREATE TABLE library_requests (
  request_key        text PRIMARY KEY CHECK (length(request_key) BETWEEN 2 AND 80),
  display_text       text NOT NULL CHECK (length(display_text) BETWEEN 2 AND 80),
  request_count      integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  countries          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"IN": 3}; ISO codes only
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
search) and robots findings.

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
| Exact ISBN definitively not listed (`not_found`, `recognizedExact`) | `isbn13` not_found (`isbn_not_listed`) | **30 days** (recommended) |
| Work-level `no_match`, profile complete, search not partial | `ol_work` not_found (`work_no_match`) | **14 days** (recommended) |
| `possible_match`, `unknown`, timeout, budget exhausted, unsupported, any error | nothing | — |

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
5. Delete library requests marked `spam` after 90 days.

Reads also filter on `expires_at`, so a missed cron run never serves an
expired answer.

### 4.5 Privacy review of stored fields

| Field | Personal? | Why kept | Notes |
|---|---|---|---|
| `holdings_answers.*` | No. Library ID, book identity, answer, timestamps, the library's public record URL. | Avoid repeat catalog requests | No reader, session, IP, query text or count of lookups. Cannot tell who looked a book up. |
| `library_profiles.*` | No | Later feature | Aggregate counters only. |
| `library_requests.display_text` / `request_key` | Usually a place or library name; could contain anything typed | Owner's admin view | Stored only after the explicit tap (this is the one exception to "library search text is never stored", and it needs the owner's sign-off, see 9). Max 80 chars; emails, phone numbers and URLs rejected. Never shown publicly. |
| `library_requests.countries` | Coarse (country from Vercel's `x-vercel-ip-country`) | Tell apart "Central Library" requests | Aggregated counts; not linked to any request event. Drop it if the owner prefers. |
| `library_requests` dates | No | Ordering | Day precision only. |
| `problem_reports.body` | May contain anything | The report | Max 2,000 chars; Privacy page says not to include personal details. Retention per 4.4. |
| `problem_reports.screen`, `library_id`, `book_key`, `app_version` | No | Reproduce the problem | No query text, no account ID, no email, no IP. |
| `submission_buckets.bucket` | Pseudonymous (HMAC of IP and day with a server secret) | Abuse limits | Expires within 24 h. |

Search text (book queries sent to `/holdings/search`) is used for the catalog
request and dropped. It is never written to the database or logs; the existing
in-memory 60 s catalog cache keeps it only in process memory, as today.

---

## 5. Background library check for search results

### 5.1 Flow

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
   c. **One catalog query** for the rest, chosen by adapter:

      | Adapter | Request | Matching |
      |---|---|---|
      | Title/candidate search (Koha title search, Visakhapatnam, e-Granthalaya, IndCat, Libman, VuFind, discovery adapters, BiblioCommons `searchBookCandidates`) | One search using the reader's query text, the adapter's normal row cap (10). e-Granthalaya's one empty-page retry counts within the budget. | Each row is matched against each book's profile with `matchCatalogRecord` from `services/libraryBookSearch.js`. A row is a match only when it shows one of that work's ISBNs (`exact_isbn` or `verified_work`). Title/author-only matches (`possible_match`) give no badge and are not stored. |
      | Calil | One `check` call with all result ISBN-13s comma-separated (Calil's API accepts several ISBNs; the adapter needs a batch function) | Per ISBN, as today. |
      | ISBN-only adapters with no batch form (Chamo, LibSys, Vega, Aspen, Evergreen, ISBN-only Koha) | **None.** These libraries are checked only when the reader opens a book. | — |

   d. Book profiles (the ISBN set of each Open Library work) come from the
      existing `books.searchProfile`, run in parallel with the catalog query.
      These are Open Library requests, not catalog requests. A profile that
      fails means that book cannot be matched (no badge), not "not found".
   e. Stream `mark` lines as matches are made. Write `found` rows for matches
      (4.3). A book with no matching row gets **no** stored answer: a capped
      title search does not prove absence.
   f. Send `done` with the unchecked keys and end the response.
4. The client shows a small round library badge on each `found` cover (with
   an accessible name "In <library>"). No badge means nothing; it never says
   "not in the library".

### 5.2 Request budget per search

| Item | Limit |
|---|---|
| Catalog requests | 1 (2 for e-Granthalaya's empty-page retry); hard cap through `withCatalogOperation({ maxRequests: 2 })` |
| Record reads | 0 |
| Open Library requests | ≤ 9 work-edition reads, served from the existing 24 h in-memory cache when present |
| Database queries | 1 read, 1 batched upsert |
| Deadline | `min(checkBudgetMs(library), 20 s)` for the catalog request; whole response ends by 25 s |
| Concurrency | At most one background search per catalog host per function instance; a second one replies `done` unchecked (no queueing) |
| Repeat queries | Same library and normalised query within 10 minutes on the same instance reuse the in-memory result (existing `cachedTask`, 60 s → 10 min for this call) |

Shelf badges use `/holdings/lookup`, which never contacts a catalog. Saved
books without an answer are checked only one at a time when the reader opens
them, plus at most three per shelf visit in the background through
`/holdings/check` (ISBN-bearing books first, most recently saved first, only
while the page is visible, paused when a search starts). This fills the shelf
slowly without bursts.

### 5.3 Cancellation when a book is picked

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

### 5.4 Slow catalogs

Some catalogs take 20 s or more per request (Anna Centenary and Kalaignar 4–9
s, e-Granthalaya member pages 6–16 s, Romain Rolland budget 45 s).

- Background search: capped at 20 s for the one catalog request. A slow
  catalog simply produces no badges for that search; nothing is shown as
  missing. Stored answers (streamed first) still appear immediately.
- Book page `/holdings/check`: uses the existing per-library budget
  (`checkBudgetMs`, 20 s default, ≤45 s) inside the 120 s function limit. The
  card shows grey "Checking" with a spinner (static under reduced motion);
  after the budget it shows grey "Couldn't check" with Try again.
- Circuit: three consecutive timeouts or errors for a host within 10 minutes
  open a 10-minute per-host circuit in memory (per instance). While open,
  background searches skip that host; the book page still tries once. A
  shared circuit across instances can be added later in the database
  (`catalog_host_health`) if logs show repeat load.
- Function cost: a held 20–25 s streaming response is billed for its
  duration. Watch Vercel function usage after release; the per-host
  concurrency limit and stored answers keep this bounded.

---

## 6. Admin view

| Item | Decision |
|---|---|
| Where | `/app/admin` in the existing app (lazy-loaded chunk, not linked from any screen, `noindex`). Server routes `/api/admin/library-requests`, `/api/admin/problem-reports`, `/api/admin/problem-reports/:id` (PATCH status), `/api/admin/library-requests/:key` (PATCH status/note), `/api/admin/summary`. |
| How protected | Mounted in `server/application.js` alongside the account middleware, outside `/api/v2`. Requires a valid account session (Better Auth), a verified email, the account's user ID in `ADMIN_ACCOUNT_IDS`, and the existing origin check (`requireOrigin`) on mutations. Responses `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`. Non-admins get 404, not 403. Uses `CATALOG_ADMIN_DATABASE_URL` (read + status updates only). |
| Contents | Library requests: text, count, countries, first/last date, status (open/added/declined/spam), note; sorted by count. Problem reports: newest first, body, screen, library, book link, status. Summary: answers stored per library, found/not-found counts, opt-out list from the policy file. |
| Fallback | If accounts are off, the owner uses SQL in the Neon console with the admin role. |
| Later | A weekly email digest through the existing Resend setup, if the owner wants it. |

---

## 7. Work breakdown

Every phase lands behind `VITE_ONE_SHELF` (client, build-time) and/or a
server flag, so production stays unchanged until Phase 11. Sizes: S ≈ 1–2
days, M ≈ 3–5 days, L ≈ 1–2 weeks of focused work.

### Phase 0 — Groundwork (S)

- Scope: copy the mockups to `docs/design/2026-11-one-shelf/` with a README of
  the owner decisions; add flag plumbing (`VITE_ONE_SHELF`); `AppRoutes`
  switch in `App.tsx` that renders the new tree when the flag is on; Vercel
  Preview env sets the flag on, Production off.
- Files: `client/src/v2/App.tsx`, `client/src/vite-env.d.ts` (if present),
  `.env.example`, `docs/design/2026-11-one-shelf/README.md`,
  `docs/STATUS.md`.
- Tests: unit test that the flag off renders today's routes.
- Acceptance: production build with the flag off is byte-identical in
  behaviour; all existing suites pass.
- Depends on: nothing.

### Phase 1 — Storage migration and state (M)

- Scope: section 3.4 migration; `mybookshelf.one-shelf.v1`; de-duplication;
  removal of availability and lookup-preference keys; holdings store skeleton
  (in-memory, no server yet); saved-identity helper (`bookKey`/`isbn13`).
- Files: `localState.ts`, `readerState.ts`, `context.tsx`, new
  `oneShelfState.ts`, new `holdings.ts`, `legacyCleanup.ts`.
- Tests: `localState.test.ts` (old v1/v2 records load unchanged; duplicate
  keys collapse; an old bundle can read what the new bundle wrote),
  `readerState` key removal, `recovery.test.tsx` unchanged.
- Acceptance: a browser profile from production keeps its shelf, viewed books,
  saved free items and library after loading the new build and after rolling
  back.
- Depends on: Phase 0.

### Phase 2 — The one-screen shell (L)

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
  when the flag is on.
- Files: new `ui/home/*`, `ui/shelf/*`, `ui/panel/SidePanel.tsx`; edits to
  `ui/AppFrame.tsx`, `ui/BookCard.tsx` (`Cover`), new `ui/home/home.css`
  (reading-light tokens for Daylight, Lamplight, Ink).
- Tests: unit tests for bay layout (`shelfLayout.test.ts` extended), empty
  state, invite show/dismiss rules, no text under covers, list view; axe on
  the home screen.
- Acceptance: matches `Main`, `FirstBook`, `Shelf` (idle) and `AccountPanel`
  boards at 390 × 844 in Daylight; usable in Lamplight and Ink; 44 px targets
  including spines; keyboard reachable; reduced motion removes transitions.
- Depends on: Phase 1.

### Phase 3 — Search on the shelf (M)

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
- Files: new `ui/search/*`, `ui/home/ShelfStage.tsx`, `searchMemory.ts`,
  `api.ts`.
- Tests: unit tests for own-match ordering and de-duplication by
  `bookKey`/`isbn13` only (two editions with the same title stay separate),
  error/offline states, abort on clear.
- Acceptance: `Results`, `SearchStates` and `Shelf` (searching) boards;
  search text never appears in the URL or storage.
- Depends on: Phase 2.

### Phase 4 — Scan pop-up (M)

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
- Depends on: Phase 2.

### Phase 5 — Book page, library card and library pop-up (L)

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
    "Find my library".
  - Until Phase 6 ships, the card uses the existing `/availability` endpoint
    and the projection in 3.5 on the client.
  - `LibraryPickerDialog`: "Libraries near me" and a "City, town or library
    name" field fill one list in place (reuse `useLibraryDiscovery.ts`;
    remove area browse selects); rows show name, area · type, distance when
    known. Selecting closes the pop-up and, from a book, checks that book.
    Nothing found: "No libraries here yet" + `Request to add “<text>”`
    (hidden until Phase 6 endpoint is live, behind `VITE_LIBRARY_REQUESTS`).
    The typed text stays in component state only.
  - `/select/:slug` becomes a silent pre-select: resolve, select, go to
    `next` (or the book in `?book=`) or the shelf. Failure shows the existing
    "link not found" notice on the shelf.
- Retire `ui/journal/DueSlip.tsx` usage (file deleted in Phase 10).
- Files: `ui/book/*`, new `ui/library/LibraryPickerDialog.tsx`,
  `ui/library/SelectLibraryPage.tsx`, `useLibraryDiscovery.ts`,
  `bookNavigation.ts`.
- Tests: rewrite `ui/book/BookPage.test.tsx` and `BookPage.test.ts` (each
  card state; a failed check is never white; unconfirmed is grey),
  `BookFirstFlow.test.tsx`, `LibraryLinks.test.tsx`, `LibrariesPage.test.tsx`
  → `LibraryPickerDialog.test.tsx`.
- Acceptance: `Book`, `BookChecked`, `BookStates`, `LibraryPicker`,
  `LibraryNearby`, `LibraryStates` boards; picking a library from a book
  shows that book's answer without leaving the page.
- Depends on: Phases 2–3.

### Phase 6 — Catalog store and holdings API (L)

- Scope: provision Neon project (owner), roles, migration 001, generalised
  migrator, `server/catalog-store/*`, policy file
  `server/data/catalog-policies.json` (empty), `/holdings/lookup`,
  `/holdings/check`, `/library-requests`, `/problem-reports`, submission
  rate limits (requests: 5 per hour per IP digest and one per text per IP per
  day; reports: 5 per hour), daily maintenance cron in `vercel.json`, flags
  `CATALOG_STORE_ENABLED` and store fail-open behaviour. Writes from the
  existing availability path (book page) go through the same `writeAnswers`.
  Client switches the book card to `/holdings/check` and shelf badges to
  `/holdings/lookup`; the library request button is enabled.
- Files: `server/catalog-store/*`, `server/db/migrate.js`,
  `server/public-v2/router.js`, `server/public-v2/validation.js`,
  `server/public-v2/availability.js` (return projection + write hook),
  `server/application.js` (cron route), `server/package.json` (scripts and
  test list), `vercel.json`, `.env.example`, `.github/workflows/web.yml`
  (create `catalog_test` database in the Postgres service, set
  `CATALOG_TEST_DATABASE_URL`), `client/src/v2/api.ts`.
- Tests: unit (identity derivation never uses titles; write rules table;
  `not_found` never overwrites `found`; opt-out blocks writes; store down →
  live check and no error; validation and limits), integration against
  Postgres (TTL filter, upsert, maintenance deletes, role grants), router tests
  for each route.
- Acceptance: second open of the same book in the same library makes no
  catalog request (verified with a fixture provider counting calls); a timed
  out check stores nothing; a library in the policy file never gets rows.
- Depends on: owner approval of the database (section 9); Phase 5 for the
  client parts.

### Phase 7 — Background check for search results (L)

- Scope: section 5. `/holdings/search` NDJSON route; adapter-specific single
  query (`findBookCandidates`/`searchCatalog`/`searchBookCandidates` with the
  query text; Calil batch function); abort signal through
  `withCatalogOperation` and `providers/http.js`; `waitUntil` writes;
  per-host concurrency and circuit; client `useLibraryMarks` (stream reader
  already exists in `api.ts` `post(…, progress)`; generalise it), badges with
  pop-in (none under reduced motion), "Looking in <library>…" status line as
  in the `Shelf` board only while running (visually small, announced politely
  once), cancel on pick, clear and refill on library change, shelf background
  fill (three per visit).
- Server flag `HOLDINGS_BACKGROUND_ENABLED` (kill switch; when off the route
  replies `done` with all unchecked).
- Files: `server/public-v2/holdings.js` (new), `server/services/libraryBookSearch.js`
  (export a row-matching helper for many profiles), `server/services/providers/http.js`,
  `server/services/providers/calil.js`, `server/services/providers/index.js`,
  `client/src/v2/ui/search/useLibraryMarks.ts`, `client/src/v2/api.ts`.
- Tests: exactly one catalog request per search (fixture counter) for each
  adapter family; zero for ISBN-only adapters; title-only rows give no badge;
  same-title different work gives no badge; abort stops further requests;
  stream ends by 25 s with a slow fixture; stored answers stream first.
- Acceptance: `Shelf` board sequence (searching → marks appear); no result is
  ever shown as "not in library".
- Depends on: Phase 6.

### Phase 8 — Side panel pages and accounts restyle (M)

- Scope: `SidePanel` content: signed out → Create account, Log in; signed in →
  email, Log out, Account settings. My library + Change (opens the picker).
  Reading light (Daylight / Lamplight / Ink). Rows: Report a problem, Privacy,
  About. `ReportProblemPage` (one text box, Send → "Sent"; attaches screen,
  library ID and book key only). `PrivacyPage` and `AboutPage` (copy in 9).
  `AccountSettingsSmall` (Change password, Delete account with "Delete account
  and shelf?" confirmation). Restyle `AccountPages.tsx` forms to the
  `AccountStates` board: wrong email or password, couldn't connect + Try
  again, forgot password → link sent, email already used (+ Log in), password
  too short (`Too short: N characters or more`, N from the existing
  validation), delete confirmation.
- Hidden, not deleted: the rest of `AccountSettingsPage.tsx` (email change,
  sessions, export, history consent, providers, profile) stays reachable at
  `/app/settings/account/more` until the owner decides (section 9).
- Files: `ui/panel/*`, `ui/account/AccountSettingsSmall.tsx`,
  `ui/account/AccountPages.tsx`, `ui/account/account.css`, `App.tsx`.
- Tests: `AccountForm.test.tsx`, `AccountEntry.test.tsx` updated; new panel
  tests; `accounts-real.spec.js` entry points changed from the tab bar to the
  panel.
- Acceptance: `AccountPanel`, `AccountSignedIn`, `AccountSettings`,
  `AccountStates`, `ReportProblem`, `Privacy`, `About` boards.
- Depends on: Phase 2; Report a problem needs Phase 6.

### Phase 9 — Admin view (S)

- Scope: section 6.
- Files: `server/admin/*` (new), `server/application.js`,
  `client/src/v2/ui/admin/AdminPage.tsx`, `App.tsx` (lazy route).
- Tests: non-admin session → 404; signed-out → 404; admin can list and change
  status; CSRF/origin enforced; no data under `/api/v2`.
- Acceptance: owner sees requests with counts and reports in production.
- Depends on: Phase 6.

### Phase 10 — Remove old surfaces, redirects, public pages (M)

- Remove (when the flag is retired): `ui/TabBar.tsx`, `ui/shelf/ShelfPage.tsx`,
  `ui/scan/ScanPage.tsx` (keep `SearchResult.tsx` only if reused),
  `ui/library/LibrariesPage.tsx`, `LibraryDetail.tsx`, `LibraryMap.tsx`,
  `CopyLibraryLink.tsx`, `ui/settings/SettingsPage.tsx`,
  `ui/journal/DueSlip.tsx`, `exampleBooks.ts`, `DogAnimation.tsx`,
  `Bucky.tsx`, `dogAnimation.ts`, `JourneySteps.tsx`, desktop sidebar CSS in
  `reader-desktop.css`/`desktop.css`, and their tests.
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
  line "Check whether this library has a book"; landing hero form replaced by
  "Open the app" and "Find my library" buttons (no typed text in a URL);
  "How it works" step 3 and copy about "on the shelf, all on loan" changed to
  found / not found / couldn't check; `/about` "stays in your browser"
  corrected; `client/public-app/privacy.html` rewritten to match the new data
  (section 9). Sitemap stays at nineteen URLs; `shared/seo-libraries.json`
  unchanged.
- Tests: `tools/seo/build-pages.test.mjs`, `client/e2e/seo-launch.spec.js`,
  redirect unit tests, `library-links.spec.js`.
- Depends on: Phases 2–8.

### Phase 11 — Hardening and release (M)

- Scope: performance work on the 3D shelf (8.4), full accessibility pass,
  Lamplight and Ink polish, desktop layout (9), e2e rewrite completion,
  documentation (`docs/STATUS.md`, `docs/README.md`, `README.md`,
  `CLAUDE.md`/`AGENTS.md` lines about tabs and pages), release (8.6).
- Depends on: all.

### Summary

| Phase | Size | Releasable alone |
|---|---|---|
| 0 Groundwork | S | yes (no visible change) |
| 1 Storage migration | M | yes (no visible change) |
| 2 One-screen shell | L | behind flag |
| 3 Search on the shelf | M | behind flag |
| 4 Scan pop-up | M | behind flag |
| 5 Book page + library pop-up | L | behind flag |
| 6 Catalog store + holdings API | L | server part yes (book page answers start being stored even on the old UI) |
| 7 Background check | L | behind `HOLDINGS_BACKGROUND_ENABLED` |
| 8 Side panel + accounts restyle | M | behind flag |
| 9 Admin view | S | yes |
| 10 Removal, redirects, public pages | M | with flag flip |
| 11 Hardening and release | M | release |

Critical path: 0 → 1 → 2 → 3 → 5 → 6 → 7 → 10 → 11. Phases 4, 8 and 9 run in
parallel once their dependencies land.

---

## 8. Testing and release

### 8.1 Unit and integration

- Server: new `catalog-store/*.test.js` and `public-v2/holdings.test.js`
  added to the `test` script in `server/package.json`; integration tests skip
  without `CATALOG_TEST_DATABASE_URL` and run in CI.
- Invariants with dedicated tests: failed/timed-out checks never become
  `not_found` (server projection and client card); no stored answer is keyed
  by title or author; same-title different works never share a badge; opt-out
  libraries are never written; search text never reaches the database, logs
  or URLs; provider keys (`GOOGLE_BOOKS_API_KEY`, `CALIL_APP_KEY`) never
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
| New `redirects.spec.js` | Every row of the Phase 10 redirect table |
| New `holdings.spec.js` | Shelf badges, result badges, library change refill |

`public-v2-fixture.js` gains holdings routes (including a streaming
`/holdings/search` fixture with delays).

### 8.3 Accessibility, motion, lights, desktop

- axe-core on every screen and pop-up in all three reading lights; keyboard
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
- Reading lights: Daylight is designed; Lamplight (dark) and Ink need tokens
  for wood, shadow, badge and card colours; contrast ≥ 4.5:1 for text and ≥
  3:1 for badge outlines and card state borders in all three.
- Desktop: test at 1280 × 800 and 1440 × 900 (see 9 for the layout).

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
before Phase 11 exits.

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
3. Production, step 1: deploy Phase 6 server with `CATALOG_STORE_ENABLED=true`
   while the old UI is still live; the book page starts storing answers.
   Watch for a week (store errors, Neon compute hours).
4. Production, step 2: set `VITE_ONE_SHELF=true` and redeploy; keep
   `HOLDINGS_BACKGROUND_ENABLED=false` for 48 hours, then turn it on.
5. Rollback: Vercel Instant Rollback to the previous production deployment
   (recorded in STATUS before release). The storage migration is
   backward-compatible (3.4) and the database is additive, so rollback needs
   no data step. The background check has its own kill switch.
6. After 30 days stable: remove the flag and old code (Phase 10 removals),
   remove `/availability`.

---

## 9. Open questions and risks

Each item has a recommended answer for the owner to confirm.

| # | Question or risk | Recommendation |
|---|---|---|
| 1 | **May "not found" be stored, and for how long?** The decision covers "library has book" for six months only. Libraries add books, so a long negative hides new stock; no negative means repeat catalog load for missing books. | Store only definitive negatives: exact-ISBN "not listed" for 30 days, complete work-level no-match for 14 days. Never store unknown, timeout, partial or title-only results. |
| 2 | **Legal and terms position on storing answers; how a library opts out.** Catalog terms (BiblioCommons, Calil API terms, NIC/e-Granthalaya, INFLIBNET, MasterSoft) were not reviewed; the adoption review lists this as unverified. | Store only the minimal fact (library, book identity, yes/no, record link), no copies or bibliographic text. Before Phase 6 goes live, read the Calil and BiblioCommons terms; if either forbids caching, put them in the policy file with `storeAnswers: false`. Publish a short "For libraries" note on `/about`: what is stored, for how long, and that a library can ask by email to stop storage; handle by adding to `catalog-policies.json` and deploying (the daily job purges). Get a legal opinion before contacting libraries. |
| 3 | **Library request text conflicts with "the reader's library search text is never stored".** | Treat the explicit tap as consent for that one string. Store only after the tap, normalised, max 80 chars, no identifiers, never in a URL. Needs the owner's explicit sign-off. |
| 4 | **Desktop layout was not designed.** | Centred column, max 960 px; bays widen to 5–6 covers; side panel as a 360 px left drawer over the page; pop-ups as centred 480 px dialogs; book page with the cover on the left and text on the right above 900 px. Review on preview before release. |
| 5 | **Lamplight (dark) and Ink were not designed.** | Derive from the existing tokens in `reading-room.css`: Lamplight darkens the wood and back panel and keeps covers unchanged; Ink is high-contrast light with flat wood. Answer-card colours must keep meaning (green/white/grey) with icons and labels, so contrast never relies on colour alone. Owner reviews screenshots of all screens in both. |
| 6 | **Default reading light.** Today the default is "system", which shows Lamplight on dark-mode phones; the panel shows three choices only. | Keep honouring an existing saved choice; for new readers default to Daylight until Lamplight is reviewed, then return to following the device. |
| 7 | **Where "clear Viewed before" lives.** | A small "Clear" text button at the right of the "Viewed before" heading, one tap, with the existing Undo toast instead of a confirmation dialog. For signed-in readers it calls `/api/account/history/clear`. |
| 8 | **Viewed before for signed-in readers.** Account history is off by default (`history_enabled = false`) and the history consent screen is in the part of Account settings the design drops. | Show Viewed before from this browser's local list for everyone; do not sync it. Keep server history code and data as is, but do not offer it in the new UI. Needs a check against the approved account privacy contract (R02). |
| 9 | **The rest of Account settings** (email change, sessions, export, provider links, profile name). | Keep them reachable from a "More" link on Account settings for now; export should remain available for data-portability requests. Decide later whether to drop any. |
| 10 | **Are accounts production-ready?** Live since 2026-11-05, but restore and snapshot evidence are open, the database is on Neon Free, and there are no terms of use or age question (adoption review recommends pausing for school-library pilots). | Keep accounts on for adults; before inviting school libraries add terms and an age statement, move the account Neon project to a paid plan with backups, and close the restore exits. Keep the catalog store in a separate project so it cannot affect accounts. |
| 11 | **Tapping narrow spines.** Mockup spines are 44–52 px wide. | Minimum spine width 44 px; hit area extends to the full spine height; each spine is a link with the full title and author as its label; "Viewed before" row scrolls horizontally with visible focus. |
| 12 | **Cover images for the typeset fallback.** Many Indian titles have no Open Library or Google cover. | Plain coloured cover from `spineColors.ts` keyed by `bookKey`, title and author typeset in the app font, colours checked for contrast in all three lights. Detect missing Open Library covers with `?default=false`. No third-party cover sources added. |
| 13 | **Library icons.** The directory has no icon or logo field. Logos are trademarks. | Launch with no icons (the card and name line work without them). Later add an optional reviewed `icon` path per library in the directory, self-hosted under `/library-icons/` (CSP `img-src 'self'` already allows it), with the library's permission. |
| 14 | **"Unconfirmed" (possible match) has no board.** The four drawn states do not include it. Libraries whose records carry no ISBNs (Ernakulam, Visakhapatnam) will often land here. | Grey card, label "Couldn't confirm", Catalog link, no Try again. Never green. |
| 15 | **Hidden edition settings.** Today a reader can ask for "only this ISBN" or a language. | Default to the work (all known ISBNs of the Open Library work, as today's default). Drop the settings sheet. A scanned ISBN still opens that exact edition, and its answer is checked by ISBN first. |
| 16 | **Background checks only for title-searchable catalogs (and Calil).** ISBN-only catalogs (BiblioCommons excepted, and Calil) get no result badges. | Accept: it follows "one catalog query per search". Revisit per adapter if a catalog supports an OR query over ISBNs. |
| 17 | **Existing readers' data.** | Shelf, Viewed before, library, reading light and saved free items are kept (3.4). Availability cache, edition settings and the companion setting are removed. Saved free items stay on the shelf as typeset covers opening `/app/read/…` even though free search is hidden. |
| 18 | **The due-slip feature.** `ui/journal/DueSlip.tsx` is the availability card, not a journal. | Remove it with the old book page; the server keeps returning availability details on `/availability` for now, and `library_profiles.reports_availability` records which libraries could show them later. |
| 19 | **The Bucky companion and "Copy library link".** Neither is in the design. | Remove the companion. Drop "Copy library link" from the app; libraries use the public guide or `/select/` links. |
| 20 | **Free text in requests and reports: abuse and duplicates.** | Normalise (NFKC, lower case, collapse spaces, strip punctuation) to merge duplicates; reject emails, phone numbers, URLs and text without letters; 80 / 2,000 char limits; IP-digest rate limits; never shown publicly; admin can mark spam; spam is deleted after 90 days. |
| 21 | **Cost ceilings.** | Catalog Neon project with compute fixed at 0.25 CU (≈ $20/month maximum on Launch, $0 on Free). Turn on Vercel Spend Management with an alert at the current monthly spend + 25%. Watch function duration after the background check ships. |
| 22 | **Privacy and About copy** (boards have placeholders). | Privacy, four rows: *What we store* — your shelf and library on this device; with an account, your email, shelf and library. Requests and reports you send. Which libraries have which books (no reader attached). *Why* — to show your shelf and check your library. *Shared with* — book searches go to Open Library and Google Books; library checks go to the library's catalog; no ads, no trackers. *Kept for* — device data until you clear it; account data until you delete the account; library answers six months; reports up to a year. *Questions* — contact email. About: "Find a book. See if your library has it.", version (commit short SHA), contact email, link to source. Use a project address (for example on `mybookshelf.cloud`) instead of the personal Gmail; owner to choose. Update the public `/privacy` page in the same release. |
| 23 | **The mockups differ from the decisions in places.** As of the last read (2026-11-12 18:13), `AccountSignedIn` and the new `AccountSettings` board (9c) match the decisions. `LibraryPicker` still has a "My library isn't listed" link even when results exist, and `LibraryNearby` shows distances that the directory has only for libraries with reviewed points. `Settings.dc.html` is in the folder but not on the canvas (superseded by the side panel). | Follow the decisions. Make "My library isn't listed" show the request button with the current text. Show a distance only when the server returns `distanceKm`. Do not copy `Settings.dc.html` into the repo, or mark it superseded. |
| 24 | **Search shows nine results only.** | Nine covers, no "more". The reader refines the query. List view also shows nine. Revisit if analytics (none today) or reports show missed books. |
| 25 | **Silent pre-select replaces a reader's existing library.** | Accept, as decided. The library name under the search bar shows the change; saved books are unaffected. |
| 26 | **Very long shelf.** Guests cap at 100, accounts at 1,000. | Virtualise bays beyond the first screens; offer list view; keep the caps. At the guest cap, "Add to my shelf" explains nothing and is disabled with an accessible reason ("Shelf full"); consider raising the guest cap later. |
| 27 | **Public API isolation.** `/api/v2` was designed with no database. | Keep cookies and account data out of `/api/v2`; the catalog store is separate infrastructure with its own roles and fails open. Update the comment in `router.js` and CLAUDE.md ("Express anonymous API") to say it uses an anonymous catalog store. |
| 28 | **Indian-script search** is out of scope. | Do not block it. Public search already handles Hindi and Tamil; catalogs that reject native script (`CATALOG_QUERY_UNSUPPORTED`) just produce no badges. |
| 29 | **Neon Free quota exhaustion suspends compute until the next month.** | Fail open (live checks continue); alert on store errors; move to Launch before wider rollout. |
| 30 | **Per-instance limits.** Caches, queues and circuits remain per instance. | Stored answers remove most repeat load. If logs show bursts on one host (for example `eg4.nic.in`), add a shared per-host budget table in the catalog database. |

### Not determined from the code

- Neon compute-hour usage of the account project, and whether the 5-minute
  cron keeps it always awake (needs the Neon console).
- Whether Calil's API terms allow storing results, and whether its batch ISBN
  form behaves as documented (needs a live check with the key).
- Whether BiblioCommons keyword search rows carry ISBNs for most titles
  (the adapter reads `briefInfo.isbns`, but coverage is unmeasured).
- Real function-duration cost of 20–25 s streaming responses on the current
  Vercel plan.
- How the design's 3D shelf performs on real low-end Android phones; the
  mockups are static HTML.
