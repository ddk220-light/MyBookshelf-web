# Production-ready checks: backlog and analysis path

18 November 2026. Branch `claude/production-ready-checks` (documents only; this
branch never builds on Vercel).

## Goal

Get MyBookshelf ready for real readers. The owner listed what to fix; a first
look at production found more. The work runs in this order:

1. **Analysis first.** Nothing in the app changes during it.
   - Connect the owner's Android phone and iPhone to a session on the owner's
     Mac and walk the whole product end to end (item 23, then item 24).
   - Prove that every kind of record is written in production (item 20).
   - Review the backlog below against what the run finds.
2. **Design plan.** Write the design for every item, with the open questions
   resolved with the owner.
3. **Hand over.** An implementation agent makes the changes from the agreed
   plan, tests them, and releases them in as few deployments as possible.

This file is the handover for step 1. A session opened on the owner's Mac
starts at "Start here on the Mac".

## Rules that still apply

- No change to the app, and no deployment, until the owner agrees the plan.
  Vercel builds only `main` and `staging`; do not push to either.
- Release in as few deployments as possible; finish and test everything first.
- Nothing that adds cost without value: no new timers or recurring work.
- CLAUDE.md rules: answers are found / not found / couldn't check only; a
  failed check is never shown as "not in the library"; no copy counts, due
  dates or shelf numbers; editions are never merged for identity or
  availability; catalog access restrictions and reduced motion are respected;
  search text only in the anonymous log, never in web addresses, browser
  storage, platform logs or analytics; no log is linked to an account.
- Secrets go only through secure settings, never into chat, files or command
  output. Changes to CLAUDE.md need the owner's approval.
- Be gentle with library catalogs: few requests, no load tests.

## What is live, and what is ready but not deployed

- **Live (17 November, PR #197):** the desktop layout, shelf suggestions with a
  "Suggested" label under each book, related lists cached by the CDN, and the
  Indian library allowlist.
- **Ready, not deployed:** suggestions wait up to 10 seconds for Open Library
  instead of 3 (branch `claude/nifty-feynman-4qwocr`, commit `91ea737c82`). On a
  slow Open Library day, books with long author lists (Wings of Fire, Harry
  Potter) got no suggestions; with every read slowed by 3.5 s the new wait
  returns 23 books where the old one returned none. Ship it with the next
  release.
- **Done outside the app:** `privacy@mybookshelf.cloud` forwards to the
  owner's Gmail (ImprovMX; MX and SPF records are in Vercel DNS). Optional,
  later: reply as that address from Gmail through Resend's SMTP.

## Found in production on 18 November

1. **The database noted as production is not the one the live app uses.** The
   Neon catalog database in the setup notes has no rows in any table. A live
   library check answered "found" and stored nothing there, and the app never
   connected to it. The app does connect to a Postgres database (driver
   warnings appear in the runtime logs), most likely one created by Vercel's
   Neon integration. Until that database is found, nobody has seen whether
   searches, cached answers or failed checks are recorded. Catalog migration
   `002-suggestion-counts.sql` went to the unused database, so the real one
   probably lacks it, and "opened" and "saved" suggestion counts are then
   refused silently. Settings in production: `CATALOG_STORE_ENABLED`,
   `USAGE_LOG_ENABLED` and `HOLDINGS_BACKGROUND_ENABLED` are all `true`.
2. **e-Granthalaya checks time out.** Wings of Fire at PM SHRI Kendriya
   Vidyalaya No.1 Narimedu (`egranthalaya:kvs3-kvnarimedu`) takes 25 to 28
   seconds and ends as "couldn't check", by ISBN and by work. The server runs in
   San Francisco (`sfo1`); the government servers (`eg4.nic.in`) are slow from
   outside India (8.6 s for one page from a US cloud machine). The library was
   listed from an audit that found books in 16 of 50 titles; the strict check
   was never run for it. A phone does not change this: the check runs on the
   server.
3. **Other catalogs work.** Anna Centenary Library (Koha) answered "found" in
   12 seconds with a link to the book's own catalog record.
4. **Passwords to change.** A diagnostic command printed the saved passwords of
   the three roles of the unused catalog database into a session transcript.
   Nothing live uses them, but they must be changed (item 21).
5. **Suggestion quality, seen live.** A book already on the shelf was suggested
   again under a second Open Library record, and an edition in another language
   appeared. The owner chose to fix only the wait for now; both are recorded
   under "Decided against, for now".

## Backlog, in working order

### Phase 1: see the real picture

**23. Control the owner's Android phone and iPhone from a session.**
Run on the owner's Mac (a cloud session could not reach either computer).
- Android: Developer options, USB debugging on; Android platform tools
  (`adb`); Chrome on the phone driven through Chrome's remote debugging.
- iPhone: Xcode on the Mac; Safari's Web Inspector on in the phone's settings;
  Appium with WebDriverAgent signed with a free Apple ID (the profile lasts 7
  days), or inspection only through Safari's Develop menu.
- Done when the session can open mybookshelf.cloud, tap, type and take
  screenshots on each phone.

**20. Find production's real databases and prove all logging works.**
- With the owner's OK, read only the server name in production's database
  settings (never a password), or the owner looks in Vercel and Neon.
- Read-only: which migrations are applied, and the row counts.
- Each of these must be shown to work:
  - accounts: accounts created (the owner made two), saved books, Viewed
    before, account email jobs;
  - searches: the anonymous log (hourly rows now, daily totals after 12 months);
  - failures: `library_check_events` (90 days);
  - cache: stored library answers (`holdings_answers`) and the CDN cache for
    related lists;
  - suggestion opened and saved counts, library requests, problem reports.
- Apply migration 002 where it is missing. Fix whatever is not recording.
  Correct the setup notes.
- Repeat after the end-to-end run and confirm its actions appear.

**21. Change the exposed catalog role passwords.** In Neon, for
`catalog_runtime`, `catalog_worker` and `catalog_admin` on the unused database;
update any setting that holds them in the same step. Or delete that database
if item 20 shows nothing needs it.

**24. End-to-end run on both phones and desktop.**
- As a new reader: create an account with a plus-address of the owner's Gmail
  (so it stays separate), read the verification email, sign in and out.
- Save books before and after signing in; search by title, author and ISBN;
  scan a barcode; choose and change between several libraries (Koha,
  e-Granthalaya, libraries outside India); open book pages and catalog links;
  use suggestions; change password and email; delete the test account.
- For each step record the time taken and anything broken, confusing or
  off in the design, with screenshots.
- Check the owner's call-outs (items 15 to 19 and 22).
- Output: a findings report ranked by severity, each finding tied to a backlog
  item or a new one. Nothing in the app changes.

### Phase 2: make the core work

**22. e-Granthalaya checks time out from the US region.** Options to weigh:
run catalog checks from an Indian region (`bom1`), for those routes only if
the plan allows, else for the project (then weigh the distance to the
databases); a longer time budget for e-Granthalaya hosts; finishing a slow
check in the background so the next look has the answer. Then run the strict
check for listed e-Granthalaya libraries that were listed from the audit only.

**15. Library status in words, with a direct catalog link.**
- Replaces the tick, question mark and retry icons on book cards and the book
  page with text under the library: "In your library", "Not in your library",
  and "Couldn't check right now" with a Retry text button.
- When the book is in the library, the catalog link opens that book's own
  record where we have it.
- To plan: the exact words, where they sit on cards and on the book page,
  link-only libraries, and how many libraries return a record link today.

**The 10-second suggestions wait** (ready; see above).

### Phase 3: account and settings

**19. Design mock-ups for settings and the account area.** One consistent,
professional look for settings, create account, sign in, "this is your
account", change password, change email, delete account and sign out, on phone
and desktop. One line at the top of settings and of each screen saying what it
is for; fuller wording for creating an account (what it adds) and deleting one
(what goes, when, what stays). Includes items 16, 17 and 18. The owner reviews
the mock-ups before anything changes.

**16. Simpler, friendlier account flow.** No password rules (no 15-character
minimum, no conditions); no leaked-password check (Have I Been Pwned then
leaves the privacy policy); a show/hide toggle on password fields; no
"re-enter password"; a welcome when creating an account. Keep the limit on
repeated sign-in attempts. The owner will send more detailed feedback.

**17. Sign-in merges a browser's books into the account automatically.** No
"Bring books over" screen: saved books are combined and deduplicated, nothing
is deleted, Viewed before is combined newest first up to 50. The existing
import (safe to repeat, with receipts) stays underneath. A failed merge keeps
the browser's copy and retries quietly.

**18. Shelf page: library and settings.** A visible "Change library" button;
the library's name opens its catalog in a new tab; the library's logo beside
its name where we have one; a settings gear at the top right in place of the
profile icon, with everything changeable inside settings.

**14. Optional name and email on problem reports and library requests.**
Decided: stored with the report or request in the same database; deleted after
90 days, always; no pre-fill from an account. The deletion runs inside the
existing hourly job.

### Phase 4: pages and policy (last, so they describe what ships)

**11. mybookshelf.cloud opens the app.** Visitors land on the shelf with
search. Today's landing page becomes the static `/about` page that search
engines index. The root keeps a proper title and description; the sitemap,
canonical links and structured data point to the right pages.

**12. Rewrite the About page.** Clean and current: one shelf screen, search,
barcode scan, choosing a library, found / not found / couldn't check,
suggestions, the optional account.

**13. Privacy policy in a professional, standard form.** The key points are
agreed. Decided: no "What changed" section (this is the original policy); the
rights section stays general, naming no law; the age rule stays (18 or older,
or with a parent's or guardian's permission); the contact is
`privacy@mybookshelf.cloud`. It must describe the optional name and email
(item 14) and drop Have I Been Pwned if item 16 removes that check.

## Open questions for the owner

1. **Item 20:** may the session read the server name from production's
   database settings, or will the owner look it up?
2. **Search logging:** the search log stays anonymous (no account, IP address
   or device), as the policy and CLAUDE.md say. Confirm that "prove logging
   works" does not mean linking searches to accounts.
3. **Item 17, library conflict:** if the browser and the account have
   different libraries, keep the account's, and take the browser's only when
   the account has none?
4. **Item 17, signing out:** does the device go back to an empty guest shelf?
5. **Item 17, free books and papers:** these stay in the browser today and are
   not in accounts. Keep that, or add them to accounts (a larger change)?
6. **Item 16:** the detailed account feedback. Also the shortest password the
   sign-in library allows will be the minimum; is one character acceptable if
   it allows that?
7. **Item 18:** where do Create account and Log in go once the profile icon is
   gone: inside settings only, or also on the shelf for a signed-out reader?
8. **Item 18, logos:** logos must be collected once, checked for permission
   and served from our own site (loading them from a library's site would show
   that site who our readers are). Is a generic icon acceptable where no logo
   can be used?
9. **Item 22:** is moving catalog checks, or the whole project, to an Indian
   region acceptable if the plan charges the same?
10. **Item 15:** are the three wordings right ("In your library", "Not in
    your library", "Couldn't check right now")?
11. **Item 11:** should the app itself be served at `mybookshelf.cloud/`, or
    should the root send visitors on to `/app/shelf`?
12. **Item 14:** CLAUDE.md calls the catalog store anonymous. With optional
    contact details in it, the wording needs a small change, for the owner's
    approval.

## Decided against, for now

- Leaving out suggestions whose title and author match a book already on the
  shelf.
- Preferring suggestions in the reader's language.
- Fixing the robots check that fails closed (owner's earlier decision).

## Start here on the Mac

1. Open this repository in a session on the Mac and read `AGENTS.md`,
   `docs/STATUS.md` and this file.
2. **Before plugging in the phones:**
   - Android: Settings, About phone, tap "Build number" seven times; then
     Developer options, USB debugging on.
   - iPhone: Settings, Safari, Advanced, Web Inspector on.
   - Install Xcode from the App Store if it is not there (a large download).
3. Do item 23, then item 24 against `https://mybookshelf.cloud`. Take
   screenshots into a folder outside the repository, or one that is ignored.
4. Do item 20 with the owner present for the database settings.
5. Write the findings into `docs/research/2026-11-production-ready/` on this
   branch, update this file's backlog and open questions, and push this branch
   only.
6. Then write the design plan as `docs/plans/2026-11-production-ready-design.md`
   and resolve the open questions with the owner.

Things a Mac session does not have: the cloud session's scratch files
(database notes, the staging bypass secret). Anything that needs a secret goes
through the owner or the project's settings.

## Still open from earlier work

- The owner checks the admin page at `/app/admin`; their account ID must be in
  `ADMIN_ACCOUNT_IDS`.
- Recheck the blocked Indian library groups (IDEAL, KALNET and others), due 22
  November.
- Backups, Search Console and the legal review.
- Remove `/availability` on 13 December.
- Upgrade Playwright for Ubuntu 26.04.
