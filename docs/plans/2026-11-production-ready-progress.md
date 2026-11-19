# Production-ready release: implementation progress

## Local integration

Resumed in the active checkout on `codex/production-ready` from
`claude/production-ready` (`a8490e4c11`). The reference branches and scheduled
production configuration were left in place. The merges followed the planned
order.

| Workstream | Saved tip | Integrated work |
|---|---|---|
| w1 library checks | `7487b8ea8e` | Catalog database health, late answers via the request's existing background lifecycle, one e-Granthalaya session per check, Koha record links, and grouped Open Library pacing |
| w3 picker and reports | `7ba920f7e0` | Mobile picker, confirmed request form, optional contact fields with 90-day retention, and camera request ownership |
| w2 accounts | `94cf33a6ef` | One account screen, email log-in, verification and reset that sign the reader in, guest-book merge, deletion, and revision-based refresh |
| w5 pages | `eeea77ccfb` | Indexable shelf at the root, forwarding for old shelf addresses, static About and Help, and revised privacy text |

The client consumes the stream's `mark.catalogUrl`, `done.notFound` and
`done.couldntCheck`. A proven record link is reused for the same book and
library. Failed checks are shown separately from definite absence. The
follow-up work also adds result captions, a distinct Remove action, tab
titles, a Settings gear, a dismissible first-visit prompt, WOFF2 fonts and
touch/keyboard improvements. The signed-in refresh uses a fingerprint of the
bounded Viewed before list so opening a book on another device can trigger a
refresh without changing its clear-history generation.

### Local evidence and launch boundary

- Node 22 type checking, 405 client tests, the production build and 53 tools
  tests (including 9 SEO tests) passed. The complete server suite passed all
  905 tests against disposable PostgreSQL 16 with zero skips.
- The Chromium, mobile Chromium and WebKit run passed 474 journeys, skipped
  216 flag- or browser-gated cases and exposed three desktop search/resize
  failures. After the fixes, both desktop journeys passed on both engines
  (four cases). These were targeted reruns.
- All 16 account journeys passed on mobile Chromium. On desktop Chromium,
  15 passed in the full account run and the email-link/reset journey passed
  on rerun after a selector fix. Deletion and the small account screens
  also passed a final targeted rerun. These use the real local API, PostgreSQL
  and a synthetic mail outbox.
- The loading card avoids giving a 30-second upper bound because some
  catalogs have longer limits. The deletion screens describe immediate
  access revocation, queued email and scheduled data cleanup.
- Discovery sends an identifying User-Agent and the in-process pacer allows
  up to three starts per second. See the [Open Library API limits](https://openlibrary.org/developers/api).
- Before release, complete the two-phone run on the finished build and the
  R03 account review. Recheck the production and preview configuration, rotate
  the three catalog role passwords, set the corrected production database
  URLs and apply catalog migration 003 as described below. Hosted catalog
  persistence, real email, server-region timings and the post-deployment
  checks remain to be measured. No branch was pushed and no deployment was
  started.

### Proposed project guidance

- The reading shelf opens at `/`. The old `/app/shelf` address forwards to it.
- The catalog store is separate from accounts. It can retain a reader's
  optional name and email with a library request or problem report for 90
  days. Those details have no link to the reader's account or usage log.

### Follow-up review, 18 November 2026

- The account focus check now reads only the account's revisions. The
  Viewed before revision comes from the same owner transaction as the list it
  describes, so a view on another device is picked up on the next focus.
- The daily catalog job now rolls search rows into their UTC calendar day and
  deletes them atomically. The database test covers both ends of a UTC day
  under a non-UTC PostgreSQL session and concurrent runs. The production
  monitor requires `catalogStore: "ok"`.
- The published privacy tables fit at 320 px with doubled text. CI builds
  the effective-date version of the policy for its browser checks.
- Node 22 type checking, 405 client tests, 905 server tests against local
  PostgreSQL, 53 JavaScript tool tests, 12 Python tool tests and the isolated
  Vercel web-service build passed. The three-browser run passed 477 journeys
  with 216 skips. The synthetic outbox and database run passed 48 separate
  account journeys across the same three browser profiles.
- Vercel's live alias serves the ready `main` deployment at `d3262e2cd7`
  in `iad1`, on the Node 22 project. GitHub `main` matched. Production
  account health was `ready`. The old deployment still serves `/app/shelf`
  with HTTP 200 and returns no catalog status on `/api/health`.
- The three production catalog connection settings are Sensitive and
  were last updated on 13 November. Their values and the state of the hosted
  catalog roles still need the operator's verification. The catalog store
  flag is enabled in production and preview. Accounts and the production
  provider credentials are production-scoped. The public privacy page and
  production build setting both say 13 November 2026. The five Claude branch
  previews were canceled, as expected for branches outside `main` and
  `staging`. The release plan calls for one production deployment after
  the local phone pass and [R03](https://github.com/ddk220-light/MyBookshelf-web/issues/9).

The following sections record the saved handoff before integration.

## Original paused handoff

Paused on 19 November 2026 at the owner's request, so the work can be resumed
by anyone. Nothing has been deployed; `main` and `staging` are untouched.

Read first: [the plan](2026-11-production-ready-design.md) (what to build and
why), [the worker brief](2026-11-production-ready-worker-brief.md) (rules and
test commands every worker follows), and the root-cause notes in
`docs/research/2026-11-production-ready/root-causes/`.

## Branches

| Branch | Purpose | State |
|---|---|---|
| `claude/production-ready` | The integration branch. Cut from `main`; holds the plan, research, screens, and the 10-second suggestions wait (commit `4cf6f2401e`, cherry-picked from `91ea737c82`). Worker branches merge into it | Clean; this file |
| `claude/production-ready-w1-library-checks` | Server side of library checks and search (plan A1 code, A2 steps 1-3, A3 server, A5 server) | 4 finished commits, then 1 WIP commit |
| `claude/production-ready-w2-accounts` | Accounts, server and client (plan B1-B7, B9, B10) | 1 finished commit (server), then 1 large WIP commit (client) |
| `claude/production-ready-w3-picker-reports` | Library picker on phones, request form, optional contact details, report form, camera fix (plan A4, A6 scanner) | 3 finished commits, then 1 WIP commit (test updates) |
| `claude/production-ready-w5-pages` | Reading shelf at the root address, About page, help, privacy policy (plan C1, C1b, C2, C3) | 1 WIP commit only |

"Finished" commits were made by the worker after its own checks on that step.
"WIP" commits hold edits that were in progress when work was paused: they may
not compile and their tests have not been run. Every WIP commit is titled
"WIP: unfinished work, saved when paused".

## What each worker branch contains

### w1: library checks (server)

Finished:
- **A1 code.** `/api/health` reports the catalog store as one word (`ok`,
  `failed`, `off`); the admin page shows the same word and the newest stored
  answer's time; the health workflow fails on `failed`.
- **A2 step 1.** A proven match found before the deadline is kept and
  returned.
- **A2 step 3 and A3 server.** A book check that hits its deadline answers
  "unknown" and finishes in the background under `waitUntil`, storing its
  answer for the next look. The result-marking stream says which results were
  not found and which could not be checked.
- **A2 step 2.** One e-Granthalaya session per check.

WIP: **A5 server**, Open Library pacing per search
(`server/services/openLibraryPacer.js`, `server/services/workDiscovery.js`).

To finish: complete and test the pacer; run the full server suite; report the
final field names of the marking stream (the plan names `catalogUrl` on found
marks and `notFound`, `couldntCheck` on `done`; check the code for what was
built) and the Koha record URL work (A3 server item c), which may not be done.

### w2: accounts

Finished (server): no password rules (minimum 1), no leaked-password check,
log-in by emailed link, signed in after verifying and after a reset.

WIP (client, about 30 files): one account screen (`AccountScreens.tsx`), the
eye-icon password field (`PasswordInput.tsx`), the automatic merge at sign-in
(`guestMerge.ts` and tests), link tokens in the address fragment
(`linkToken.ts`), notices (`AccountNotice.tsx`), and removal of the old
`AccountSettingsSmall`, `AccountSummary` and import screens. The worker was
updating `PanelPages` and `AccountUndo` tests when paused.

To finish: make the client compile; finish B5 (merge), B6 (one screen), B7
(delete screen, browser clean-up, confirmation email), B9 (focus refresh by
revision, recent sign-in window, notices, email reference header), B10 (the
Log in screen); check B2 (service started when the entry screen opens,
Server-Timing, request-budget test) and B4; run client, server and account
browser tests.

### w3: picker, requests, reports

Finished:
- **Scanner.** One shared camera request, so a refusal always reaches the
  pop-up.
- **Item 14.** Migration `003` (optional `contact_name` and `contact_email` on
  problem reports, a `library_request_contacts` table), validation, grants,
  the 90-day removal inside the existing daily maintenance, the admin display,
  the report form.
- **A4.** The picker's fixed header and field, scrolling list,
  `visualViewport` sizing, count and "Show 25 more", the current library with
  Remove (`clearLibrary`), and the request form.

WIP: updates to browser tests (`one-shelf-a11y`, `one-shelf-book`,
`one-shelf-desktop`, `one-shelf-holdings`, `policy-pages`).

To finish: complete those test updates and run them; run the full client and
server suites.

### w5: pages

WIP only (about 80 files): the shelf moved from `/app/shelf` to `/` across the
router, path checks, the page builder, `vercel.json`, `client/index.html` and
most browser and unit tests; `site.js`, `support.html`, `privacy.html`
changes. The worker was adding unit tests for the `/app/shelf` forwarding and
the root route when paused.

Check before building on it: whether the About page (`/about` from the old
landing content, plan C1b), the new About text (C2), and the privacy policy
rewrite (`docs/policy/privacy.md`, C3) were started; the file list suggests
only C1 and parts of C2 were.

To finish: C1 tests; C1b; C2; C3; then `npm run build`, the SEO and tools
tests, and the browser journeys.

## Not started

- **A3 client and A5 client:** the library answer in words on the book page,
  shelf, list view and results; titles under result covers; "No books found"
  help; "On my reading shelf" as a status with a separate Remove; a book keeps
  its first title; the tab shows the book's title. Depends on w1's field
  names.
- **B8:** the settings gear, the settings panel, the library row with Change
  on the shelf, the first-visit prompt, a Help link in the app, the rail gear.
- **The "My reading shelf" rename**, everywhere at once, after the other
  branches are merged.
- **C4 polish:** hover and pressed states, nothing under 12 px, WOFF2 fonts,
  44 px touch targets on public pages, the small items from the run.
- **Proposed CLAUDE.md wording** (needs the owner's approval): the catalog
  store can now hold optional contact details kept 90 days; the shelf's
  address is `/`.

## How to resume

1. Finish each worker branch in its own worktree, using the worker brief and
   one pair of test databases per worker (names must end in `_test`, for
   example `w1_catalog_test`, `w1_accounts_test`).
2. Merge into `claude/production-ready` in this order, running the full checks
   after each: w1, w3, w2, w5. Expect conflicts between w2 and w5 in
   `client/src/v2/App.tsx`, `AppFrame.tsx`, `DeskLayout.tsx`, `layoutMode.ts`,
   `AccountPages.tsx`, `AccountEntryGate.tsx`, `AccountSettingsPage.tsx`,
   `AccountEntry.test.tsx`, `PanelPages.test.tsx` and many browser tests
   (w5 changed `/app/shelf` to `/` in them), and between w3 and w5 in the
   browser tests.
3. Then build the "not started" packages above on `claude/production-ready`:
   A3/A5 client first, then B8, then the rename, then C4.
4. Run every check in plan section 8, without deploying.

## Launch (needs the owner)

In this order, on the day of launch:
1. New passwords for `catalog_runtime`, `catalog_worker` and `catalog_admin`
   in Neon; the three production settings in Vercel
   (`CATALOG_DATABASE_URL`, `CATALOG_WORKER_DATABASE_URL`,
   `CATALOG_ADMIN_DATABASE_URL`) set to the correct host, with `-pooler` once.
   Never print or store a value.
2. Apply catalog migration `003` to the production catalog database with
   the migration owner, then apply
   [runtime-grants.sql](../../server/catalog-store/runtime-grants.sql) with
   the same role. Verify that the runtime role can insert request contacts,
   the worker can expire them and clear report contacts, and the admin can
   read them.
3. Confirm the effective date for the revised privacy text. With the phone
   pass complete and R03 approved, merge the integrated release into `main`
   for the single deployment.
4. Run the live checks in plan section 8 straight away; roll back in Vercel if
   something is badly wrong.
