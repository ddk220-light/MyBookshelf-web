# Production-ready: root causes, design and implementation plan

19 November 2026. Branch `claude/production-ready-checks` (documents only).
For the implementation agent that makes the changes, and for the owner who
approves them. Nothing in this plan has been built.

Read with:
- [the backlog](2026-11-18-production-ready-backlog.md): the owner's items,
  decisions and rules;
- [the end-to-end run](../research/2026-11-production-ready/README.md): what
  was seen on two phones and desktop, with screenshots and timings;
- [the screens](../design/2026-11-production-ready/README.md): the mock-ups
  this plan builds.

## 1. The shape of the work

Three releases, each one deployment, in this order:

| Release | What it fixes | Backlog items |
|---|---|---|
| A. Make the core work | Library answers are kept; slow catalogs still give an answer; the answer is in words; a library can be chosen on a phone; search is faster and readable | 20, 21, 22, 15, 27, 25, 26, 14, 30, 31, 32, 33, 28, the 10-second suggestions wait |
| B. Account and settings | Simple account creation, automatic merge, one account screen, settings behind a gear, library name and Change on the shelf | 16, 17, 18, 19, 34 |
| C. Pages and policy | The app at the root address, About, help, privacy policy, polish | 11, 12, 13, 35, 36 |

Release A comes first because it changes what the others describe. Every
package below lists its cause, the change, the files, the tests and how to
tell it is done.

Rules for all three (from CLAUDE.md and the backlog): answers are found / not
found / couldn't check only; a failed check is never shown as absence;
editions are never merged for identity or availability; search text only in
the anonymous log; no log linked to an account; be gentle with catalogs; no
new timers or recurring work; secrets never in chat, files or output; one
deployment per release, with every check passing first.

## 2. Root causes

| # | What the reader sees | Cause | Where |
|---|---|---|---|
| R1 | Marks vanish; every book opening re-checks; devices disagree; nothing is logged | Production's three catalog database settings hold an address with `-pooler` written twice. The setup script of 13 November added `-pooler` to a host that already had it. That address resolves but refuses the login, and the store fails open in silence | Vercel production settings `CATALOG_DATABASE_URL`, `CATALOG_WORKER_DATABASE_URL`, `CATALOG_ADMIN_DATABASE_URL` |
| R2 | A slow catalog ends "couldn't check" even when the book was found | A proven match found early is thrown away when the time limit arrives: the search stops early only for an available copy, waits for the paired title search, and the deadline wins | `server/services/libraryBookSearch.js:114`, `:244-248`; `server/services/catalog-lookup/check.js:45,62` |
| R3 | e-Granthalaya takes 25 s every time; Anna Centenary 45 s | These are our own limits (25 s; 20 s raised to the library's 45 s). Requests run one at a time; e-Granthalaya waits 1 s between them and re-fetches the home page at every step (6 or more requests for one ISBN). The server is in San Francisco | `server/services/catalog-lookup/platforms.js:32,57,159-164`; `server/services/providers/egranthalaya.js:609-739`; `server/data/libraries.json:1160` |
| R4 | A check that runs out of time is lost | Checks are cancelled at the deadline and when the reader leaves; nothing finishes in the background | `server/public-v2/holdings.js:150-151` |
| R5 | A fourth answer, "Couldn't confirm" | The server returns `unconfirmed` when the catalog answered but proved nothing; the client draws it with its own icon | `server/public-v2/holdings.js:62-67`; `client/src/v2/ui/book/LibraryAnswerCard.tsx:11,43` |
| R6 | Results, the book page and the link disagree | The results mark carries no link, so the card shows the catalog's home page until a second check replies; the book page always sends that check | `server/public-v2/holdings.js:240`; `client/src/v2/ui/book/useLibraryAnswer.ts:47-76` |
| R7 | Shelf and results show only "found" | Only `found` is drawn; "couldn't check" is never kept, even for the visit; the results stream reports only `found` | `client/src/v2/ui/home/shelfItems.ts:74-80`; `server/public-v2/holdings.js:108-113,189,238-243` |
| R8 | On a phone the picker hides the field and results | The sheet is sized to the page, not to the area above the keyboard, and the whole sheet scrolls instead of the list | `client/src/v2/ui/scan/scan.css:15-17`; `client/src/v2/ui/library/libraryPicker.css:22` |
| R9 | "Request to add" sends on one tap | The button calls the request directly with the typed text | `client/src/v2/ui/library/LibraryPickerDialog.tsx:121-126,180-182` |
| R10 | First search takes 4 to 7 s | Three Open Library searches start together but pass through one lane, one at a time and 1 s apart; Google Books is always awaited | `server/services/workDiscovery.js:25-41,134-147` |
| R11 | The title and author change a second after a book opens | The record passed in is replaced wholesale by the resolved one | `client/src/v2/ui/book/ShelfBookPage.tsx:84-95` |
| R12 | The camera may start after Cancel | Two camera requests can be pending at once; the first one's refusal is dropped | `client/src/v2/ui/scan/ScanDialog.tsx:117-121,156-169`; `client/src/v2/camera.ts:98` |
| R13 | "Stylesheet refused" in WebKit | The test tool, not the app: Playwright adds a style element for each WebKit screenshot. Seven screenshots, seven messages | No change; confirm once in real Safari |

Account causes are in section 5.

File and line references for every row, and the smaller causes, are in
`docs/research/2026-11-production-ready/root-causes/`: [checks](../research/2026-11-production-ready/root-causes/checks.md),
[client UI](../research/2026-11-production-ready/root-causes/ui.md),
[accounts](../research/2026-11-production-ready/root-causes/accounts.md),
[pages and reports](../research/2026-11-production-ready/root-causes/pages.md).

## 3. Release A: make the core work

### A1. Reconnect production to its catalog database (items 20, 21)

Cause: R1. This is settings work, then proof.

1. In Neon, give `catalog_runtime`, `catalog_worker` and `catalog_admin` new
   passwords (this also closes item 21: the old ones were printed in a
   session).
2. In Vercel, set the three production settings again with the correct host
   (one `-pooler`) and the new passwords. They take effect at the next
   deployment, which is Release A itself.
3. The database already has migrations 001 and 002. No junk request needs
   deleting: nothing was ever stored.
4. Preview's settings were written by an earlier script; check them the same
   way.

Then make a silent failure impossible:
- `GET /api/health` reports the catalog store as `ok` or `failed` (a word, no
  detail), from one cheap query with a short limit. The existing six-hourly
  health workflow fails when it says `failed`.
- The admin page shows the same word and the time of the last stored answer.
- Files: `server/catalog-store/index.js`, `server/index.js` or the health
  route, `server/admin/queries.js`, `client` admin page, the health workflow,
  tests beside each.

Done when, on production after the deployment:
- a "found" answer is still on the shelf after a reload and on a second
  device;
- opening that book again sends no new request to the library;
- the search log, the failure log, a library request and a problem report
  each gain a row (read-only counts);
- `/api/health` says the store is `ok`.

### A2. Slow catalogs still give an answer (item 22)

Causes: R2, R3, R4. In this order; measure after each on the two known cases
(Wings of Fire at KV Narimedu and at Anna Centenary), with no more than a
handful of live checks.

1. **Keep what was proven.** Stop at the first proven match, and at the
   deadline return the best proven match instead of nothing.
   `server/services/libraryBookSearch.js`, `server/services/catalog-lookup/check.js`. Small.
2. **One e-Granthalaya session per check.** Fetch the home page once and reuse
   it, instead of at every step. `server/services/providers/egranthalaya.js`.
   Medium. The request cap (12) and the 1 s spacing stay.
3. **Finish in the background.** At the deadline the reader gets "Couldn't
   check right now"; the same capped check carries on under the platform's
   `waitUntil` and stores its answer, so the next look has it. Leaving the
   page no longer cancels a check that has started. `check.js`,
   `server/services/catalog-lookup/index.js`, `server/public-v2/holdings.js`.
   Medium. Needs A1.
4. **Then decide the region.** Measure the same two checks from an Indian
   region on a preview. Moving only the library-check routes needs their own
   function entry point; moving everything puts the server far from its
   databases (the host gate allows 300 ms per database call,
   `server/catalog-store/hostGate.js:82`). Recommendation: do steps 1 to 3
   first; move the region only if e-Granthalaya still cannot answer inside its
   limit.
5. Run the strict check for the e-Granthalaya libraries that were listed from
   the audit only, once checks finish.

Done when: both known cases end in "In your library" or "Not in your
library", at the first look or the second.

### A3. The answer in words (items 15, 27)

Causes: R5, R6, R7. Screens: `BookFound`, `BookNotFound`, `BookChecking`,
`BookCouldntCheck`, `Main`, `Results`, `DeskShelf`.

Wording, used everywhere:

| State | Words | Under them | Actions |
|---|---|---|---|
| Found | In your library | Library name and place; "Checked today" | "See this book in the library's catalog" (the book's own record); Change library |
| Not found | Not in your library | "We looked for this book in the library's catalog and did not find it. The library may still have another edition." | "Search the library's catalog yourself"; Try another library |
| Checking | Checking your library… | Library name; a moving bar; "This library's catalog can take up to half a minute to answer. You can go back to your shelf: the answer will be there when it arrives." | "Open the library's catalog instead" |
| Couldn't check | Couldn't check right now | "The library's catalog did not answer in time. This does not mean the book is missing." | "Try again" (a text button); "Open catalog" |
| Link-only library | (no answer shown) | "This library can't be checked from here." | "Open the library's catalog" |

Changes:
- `unconfirmed` is shown as "Couldn't check right now", with no "Try again"
  (it would repeat the same requests for the same answer). The value stays on
  the wire. Never shown as "not found".
- The results mark carries the record's address; the client keeps it and
  skips the second check when it already holds "found" with a link. Koha
  search rows gain their record address. A mark belongs to one work; it is
  never extended to other records with the same title.
- The catalog link's label says where it goes: the book's record, or a search.
  A plain-HTTP catalog (Anna Centenary's is on a bare IP address) gets a note
  under the link: "This catalog does not use a secure connection."
- Shelf and list view: words under each saved book ("In your library", "Not
  in your library", "Couldn't check"); nothing under a book not yet checked.
  "Couldn't check" is kept for the visit in the client's store; across visits
  it comes from A2 step 3 storing the late answer, not from storing failures.
- Results: one summary line ("1 of these 9 books is in <library>"; "None of
  these 9 books was found in <library>. Open a book to check it."), and the
  results stream gains `notFound` and `couldntCheck` lists.
- Files: `client/src/v2/ui/book/LibraryAnswerCard.tsx`, `book.css`,
  `useLibraryAnswer.ts`, `client/src/v2/holdings.ts`, `api.ts`,
  `ui/shelf/BookCover3D.tsx`, `ui/shelf/ShelfList.tsx`,
  `ui/home/shelfItems.ts`, `ui/search/ResultsShelf.tsx`,
  `ui/search/useLibraryMarks.ts`, `server/public-v2/holdings.js`,
  `server/services/providers/koha.js`; the public pages that promise three
  answers stay true.

### A4. Choosing a library on a phone (items 25, 26, 14)

Causes: R8, R9. Screens: `PickerTyping`, `PickerResults`, `RequestLibrary`,
`ReportProblem`.

- **Layout.** The sheet's header and field stay put; only the list scrolls;
  the sheet's height follows the area above the keyboard (`visualViewport`,
  set as CSS variables; add `interactive-widget=resizes-content` for Chrome).
  `libraryPicker.css`, `LibraryPickerDialog.tsx`, `client/index.html`.
- **Field.** Focus goes to the field on desktop; on phones the keyboard does
  not open until the reader taps. Stop Safari's "AutoFill Contact" (a neutral
  field name; check on a device).
- **List.** A visible count ("Showing 25 of 61 libraries in Chennai"), "Show
  25 more" (the server already returns `total` and `nextOffset`), the current
  library at the top with "Remove" (a new `clearLibrary`), and a next step
  when location is refused ("Type your city or library name instead").
- **Request.** "My library isn't listed" opens a form: library name and city
  (editable), optional name and email, "Send request", "Cancel". Nothing is
  sent before Send.
- **Optional contact details (item 14).** Migration 003: `contact_name` and
  `contact_email` on `problem_reports`; a new `library_request_contacts`
  table, because requests are merged into one row per text. Validation: name
  up to 80 characters, one email up to 254. Deletion after 90 days in the
  catalog store's existing **daily** job
  (`server/catalog-store/maintenance.js`). The owner asked for "the existing
  hourly job"; that job only touches the account database, so the daily
  catalog job is the one that fits, with no new schedule. The admin page shows
  the details. Wording that calls this store anonymous changes in CLAUDE.md
  (owner's approval), `requests.js`, the migrations' comments and the docs.
- **Report a problem.** A prompt, a line saying what is sent with the message
  (screen, library, book), the optional fields, and the advice to leave out
  passwords and card numbers.

### A5. Search and the book page (items 30, 31, 32)

Causes: R10, R11. Screens: `Results`, `NoResults`, `BookNotFound`.

- Pace Open Library per search, not per read, so the three reads go together.
  `server/services/workDiscovery.js:25-41`. Check Open Library's limit first.
- Title, author and year under every result cover.
- "No books found" lists three things to try and keeps the scanner.
- "On my shelf" becomes a status; "Remove from my shelf" is a separate text
  button. Saving stays on the book page only (owner's decision).
- A book keeps the title and author it was opened with; the resolved record
  adds only the description, date and ISBN.
- The browser tab shows the book's title.

### A6. Smaller fixes in the same release

- **The 10-second suggestions wait** (ready on `claude/nifty-feynman-4qwocr`,
  commit `91ea737c82`): merge it in.
- **Reset link (item 33).** See section 5, B4; it ships in A because it loses
  readers today.
- **Scanner (item 28).** Share one pending camera request so a refusal always
  reaches the screen. Then check by hand on the iPhone: a fresh private tab,
  Cancel, and no camera.

## 4. Design

The screens are in `docs/design/2026-11-production-ready/` and on the design
canvas the owner reviews. What they change, in one place:

1. **Words beside every state.** No icon stands alone. Each screen says what
   it is and what the reader can do next.
2. **The library is visible and changeable where it is shown**: a row on the
   shelf with the name (opens the catalog), a logo tile and "Change"; "Change
   library" on the book page's answer card.
3. **A gear, not a person.** Settings holds My library, Account, Reading light
   and Help, each with one line of explanation.
4. **A new reader is asked to choose a library** on the shelf, once, and can
   decline.
5. **Account screens share one form style**, start with a sentence about what
   the screen is for, and end by saying what happens next.
6. **Nothing is sent by accident**: requests and reports go only on a Send
   button.

Library logos: a tile with a generic building until a logo is held. Logos are
collected once, checked for permission, stored in the repository and served
from our own site; they are never loaded from a library's site.

## 5. Release B: account and settings

Screens: `Settings`, `CreateAccount`, `Welcome`, `Account`, `DeleteAccount`,
`Main`, `FirstVisit`. File and line references for every point are in
[root-causes/accounts.md](../research/2026-11-production-ready/root-causes/accounts.md).

**B1. No password rules (item 16).**
- Cause: a 15-character minimum in two places on the server
  (`server/accounts/validation.js:19`, `server/auth/auth.js:42`) and on the
  client, plus a leaked-password check (`validation.js:26-48`).
- Change: the minimum becomes 1, the smallest the sign-in library accepts;
  the maximum stays. The leaked-password check, its calls, messages and tests
  go. Every password field uses the existing Show/Hide field. Both server
  checks change together: a mismatch shows as "Couldn't connect".
- Kept: the limit of 5 sign-in attempts per address per 15 minutes. With
  short passwords it is the only guard, so it must be tested.

**B2. Account creation is fast, and shows that it is working.**
- Cause (likely, unmeasured): a cold start. A guest's visits never start the
  account service, so the sign-up request itself loads the sign-in library,
  opens two database pools and wakes a sleeping database, then runs the
  leaked-password check (up to 4 s).
- Change: remove the leak check (B1); start the service when the Create
  account or Log in screen opens (one request caused by the reader, not a
  timer); open the two pools together; show "Creating your account…" on the
  button; add timing headers so one cold and one warm sign-up can be measured.
- Cost: opening the form wakes the account database once. The request-budget
  test changes to allow it.

**B3. Signed in after the email link and after a reset.**
- Cause: automatic sign-in is switched off, and both pages end with a link to
  an empty Log in form.
- Change: the verification link signs the reader in and lands on `Welcome`;
  a password reset signs in with the new password in the same step. Where
  sign-in fails, Log in opens with the email filled.
- To weigh: a verification link then signs in whoever opens it (single use,
  24 hours). A reset link already has that power.

**B4. Links survive a reload (item 33; ships in Release A).**
- Cause: the page moves the token out of the address into memory, so a
  reload, a restored tab or a restarted browser has none and says "Link
  expired". The same happens to verify and change-email links.
- Change: emails carry the token in the part of the address after `#`, which
  never reaches server logs; the page reads it there and clears it only after
  success. Old links with `?token=` keep working. "Send a new link" becomes
  "Request a new link" and keeps the email.

**B5. Automatic merge at sign-in (item 17).**
- Cause of the jumping screen: a "Loading your account shelf…" bar enters and
  leaves above the form.
- Change: the "Bring books over" screen goes. After sign-in, once the account
  shelf has loaded, the browser quietly sends the books the account lacks
  through the existing import (safe to repeat). The browser's library is used
  only when the account has none. `Welcome` and a short notice on the shelf
  say what was added.
- One problem to design for: the browser keeps its guest copy, so a book later
  removed from the account would come back at the next sign-in on that
  browser. The browser keeps a list of what it has already merged and never
  sends those again.
- A merge that fails is retried at the next load and never blocks the shelf.
  Imports are limited to 5 an hour; the quiet merge must stay within that.
- Unchanged: free books and papers stay in the browser; logging out brings
  back the browser's own guest shelf.

**B6. One account screen (item 19).**
- Today: "Account settings" (`AccountSettingsSmall.tsx`) and, behind "More",
  "Your account" (`AccountSettingsPage.tsx`), with two delete flows and two
  change-password flows.
- Change: one screen as on `Account`: email, password, your shelf (download),
  devices signed in, log out, delete. The largest piece of Release B.

**B7. Delete account.**
- The screen says what is deleted, what stays and offers the download
  (`DeleteAccount`). A "deletion started" email is sent at once; today the
  only email goes up to an hour later, when the hourly job removes the data.
- A deleted account answers "Wrong email or password", like any failed
  sign-in (decision 9).

**B8. Settings behind a gear; the library on the shelf (item 18).**
- The person icon becomes a gear labelled "Settings"; the panel is organised
  as on `Settings`. Between 640 and 1099 px the gear replaces the three rail
  icons.
- The shelf gets a library row: logo tile, the name as a link to the catalog,
  and "Change" (`Main`, `DeskShelf`). With no library the same place asks the
  reader to choose one (`FirstVisit`), once; "Not now" is remembered.
- A Help link inside the app.

**B9. Account edges (item 34).**
- Other devices: on focus the app asks only for the account's revision
  numbers and reloads the shelf when they differ, no more often than every 10
  seconds. No timers.
- "Confirm it's you" is skipped when the reader signed in within the last 10
  minutes, except for deleting the account.
- "Saved" clears itself; "You've been signed out" can be dismissed and does
  not show on the sign-in screens.
- The logged-out device still listed: cause not found; reproduce first.
- Emails get a unique reference so they do not thread together.

## 6. Release C: pages and policy

- **C1. The app at the root (item 11).** The builder writes an indexable app
  page at `/` (title, description, canonical link, site data, a link to
  `/about` for readers without scripts); `/app/shelf` keeps working and stays
  out of the index; today's landing content moves into `/about`. The other way
  (`/` redirecting to `/app/shelf`) drops the root from search and is not
  recommended. `tools/seo/build-pages.mjs`, `client/src/v2/App.tsx` and the
  path checks in `AppFrame.tsx`, `DeskLayout.tsx`, `layoutMode.ts`,
  `vite.config.js`; tests in `tools/seo/build-pages.test.mjs` and
  `client/e2e/seo-launch.spec.js`, `redirects.spec.js`, `analytics.spec.js`.
- **C2. About and help (item 12).** One About text for the public page and
  the app, describing the app as it is after Releases A and B. The help page
  is rewritten for phone and desktop. One spelling of the name, and the app's
  wordmark links to `/about`.
- **C3. Privacy policy (item 13).** Standard sections, the agreed key points,
  the contact address `privacy@mybookshelf.cloud`, the optional name and
  email (90 days), no Have I Been Pwned. The page parsers accept headings,
  paragraphs, lists, tables and bold only, so the text stays within those.
- **C4. Polish (items 35, 36).** Hover and pressed states from one shared
  rule; nothing under 12 px; WOFF2 fonts in the app; touch targets of 44 px on
  the public pages; the small items in the run's findings 26 to 33.

## 7. Decisions for the owner

| # | Question | Recommendation |
|---|---|---|
| 1 | Three releases (three deployments), in the order A, B, C? | Yes |
| 2 | The 90-day deletion runs in the catalog store's daily job, not the hourly account job | Yes; it is the job that already cleans that database |
| 3 | A "couldn't confirm" answer shows "Couldn't check right now" with no "Try again" | Yes |
| 4 | Shelf and list show words under every checked book | Yes, as on `Main` |
| 5 | A new reader is asked once to choose a library and can decline | Yes |
| 6 | Server region: measure after A2, move only if e-Granthalaya still fails | Yes |
| 7 | At sign-in, if the browser and the account have different libraries, the account's wins | Yes |
| 8 | Free books and papers stay in the browser for now | Yes; adding them to accounts is a separate piece of work |
| 9 | A deleted account answers "Wrong email or password", like any other failed sign-in, and deletion sends one email | Yes |
| 10 | The app is served at `/`; `/app/shelf` keeps working | Yes |
| 11 | CLAUDE.md wording for the catalog store, once it can hold optional contact details | Proposed text comes with Release A |
| 12 | A typed ISBN appears in a book's address (it is the book's identity) | Keep; say so in CLAUDE.md |

## 8. How each release is checked

Before merging: type checking, client and server tests (with the test
databases), the tools and SEO tests, the build, and the browser journeys in
Chromium, phone-sized Chromium and WebKit. After the deployment: the "done
when" checks of each package on the live site, then the short phone pass from
the run (shelf, a search, a book at each of the three known libraries, the
picker with the keyboard open) on both phones.

## 9. Handing over

For the implementation agent:

1. Read CLAUDE.md, AGENTS.md, `docs/STATUS.md`, the backlog, this plan and the
   four root-cause files in
   `docs/research/2026-11-production-ready/root-causes/` (`checks.md`,
   `ui.md`, `accounts.md`, `pages.md`). They hold the file and line references.
2. Work on one branch per release, cut from `main`. Do not push to `main` or
   `staging`; the owner merges, or asks for it.
3. Release A, step A1, needs the owner: new database passwords in Neon and the
   three settings in Vercel. Ask for them through the secure settings; never
   print or store a value.
4. Build each package with its tests, then run every check in section 8. Open
   one pull request per release.
5. Anything in section 7 without the owner's answer is decided by the owner,
   not by the agent.

What was not investigated: the real time split of account creation; the
logged-out device in the list; whether Safari's AutoFill bar can be stopped;
the real answer times from an Indian region; Open Library's request limit.
Each is named in its package.

