# Root causes: pages, policy, reports

Read from the code on 19 November 2026; nothing was changed, and no request was made to production or to a library catalog. Paths are under the repository root.

## Item 11 root opens the app
- client/package.json:8 runs Vite then tools/seo/build-pages.mjs. Builder copies app shell to dist/app/index.html (:48), overwrites dist/index.html with landing (:69, WebSite structured data, /site.js).
- vercel.json: no rule for "/", filesystem step (:95) serves landing. :87-88 maps about, how-it-works, open-source, privacy, terms, support, libraries to .html; :91-92 guides; :72-73 /app* to app shell with noindex header (:51-55).
- client/index.html:8 noindex. client/src/v2/App.tsx:72-76 /app -> /app/shelf and old redirects.
- Canonical build-pages.mjs:63; robots and sitemap :101-102.
- client/public-app/site.js:2-12 redirects returning visitors from "/" only for stored version 1; app writes version 2 (client/src/v2/localState.ts:11) so it rarely fires.
- (a) App at "/": builder writes an indexable root app shell (robots, canonical "/", title, description, WebSite data, Search Console tag from :46, noscript link to /about); app/index.html stays noindex; landing content merges into /about (:77). Router: add "/" rendering the shelf; path checks AppFrame.tsx:111,113, DeskLayout.tsx:102, layoutMode.ts:50. Keep /app/shelf as the shelf's address (38 source refs, 220 in tests). Also vite.config.js:25,33-39, index.html:19. vercel.json needs no new rule.
- (b) "/" redirects to /app/shelf: vercel.json one redirect (:173); builder drops page('/'), WebSite data to /about; sitemap loses "/". "/" leaves the index; the home-page-only Search Console tag (:46) has nowhere to live.
- Tests: tools/seo/build-pages.test.mjs:29-33, :41, :60-63, :75, :91; client/e2e/seo-launch.spec.js:29-33, :41-51, :55; redirects.spec.js:204-214; analytics.spec.js:23.
- Recommend (a) with "/" as an alias of the shelf. Size medium.

## Item 12 About and help
- Public /about: inline HTML in build-pages.mjs:77; does not use about.md.
- In-app /app/about: docs/policy/about.md:5-13 rendered by client/src/v2/ui/panel/PolicyPages.tsx:35-50; [VERSION] is commit hash (vite.config.js:10-17).
- Help: client/public-app/support.html framed at build-pages.mjs:80-85. /how-it-works :78.
- Out of date: no mention of one shelf, suggestions, desktop; support.html:14 "tap the barcode button", :16 "the person icon", :20 "does not automatically import a guest copy", :23 "More", :26-40 native-app help; about.md:1 "Not yet published".
- Tests: PanelPages.test.tsx:86-91, policy-pages.spec.js:42-46, seo-launch.spec.js:46-47.

## Item 13 privacy
- Default build: /privacy is body of client/public-app/privacy.html (build-pages.mjs:80-85). With VITE_POLICY_EFFECTIVE_DATE: :86-98 renders docs/policy/privacy.md through tools/seo/policy-html.mjs:22-25 (fills [EFFECTIVE DATE], throws on other placeholders), keeps native-app section from privacy.html (:92-94), publishes /terms.
- In-app: raw import PolicyPages.tsx:1,13, parsed by policyText.tsx:28-48; date from buildInfo.ts:12.
- Parsers take only #, ##, paragraphs, - lists, tables, bold.
- Lines to change in privacy.md: 9-16, 55-61, 91, 108-109, 124-125, 139, 134-135.
- Tests: build-pages.test.mjs:117-122; PanelPages.test.tsx:72-76; policy-pages.spec.js:30,34. Also build-pages.mjs:95, :78, support.html:25, docs/RELEASE-one-shelf.md:102-107.

## Item 14 optional name and email
- server/catalog-store/requests.js:43-54 request accepts text only (:45), refuses an email in it (:49). :56-81 report accepts text, screen, libraryId, bookKey, appVersion. SQL :119-122.
- Tables: migrations/001-catalog.sql:103-113, :116-127. Routes router.js:266-267, holdings.js:257-276.
- Client: ReportProblemPage.tsx:42; LibraryPickerDialog.tsx:121-125, 177-184; api.ts:232-239.
- Admin: server/admin/queries.js:42-55, 71-80; AdminPage.tsx:251, 270, 302-310.
- Jobs: the hourly job (vercel.json:11-13, server/jobs/middleware.js:7) touches only the account database. The catalog store's job is DAILY (vercel.json:15-17, server/catalog-store/maintenance.js:61-66).
- Changes: migration 003 contact_name, contact_email on problem_reports; requests are one merged row per text with a count, so a new library_request_contacts table (request_key, name, email, created_at). runtime-grants.sql:19-20, :33. requests.js allow name (<=80) and email (<=254). maintenance.js after :66 nulls report contacts and deletes request contacts older than 90 days. queries.js:71-75, AdminPage.tsx:304-310. ReportProblemPage.tsx:53-60.
- Tests: holdings.test.js:216-243, catalog.integration.test.js:177-233, PanelPages.test.tsx:129, policy-pages.spec.js:91-92.
- Rewording: CLAUDE.md:7; 001-catalog.sql:1-2, :102; requests.js:3-7; queries.js:8-9; holdings.js:9,14; router.js:101-102; ReportProblemPage.tsx:19-22; docs/STATUS.md:130; docs/design/2026-11-one-shelf/README.md:20; privacy.md.
- Note: a same-day repeat request is dropped before storing (requests.js:155). Suggest the daily catalog job for the 90-day deletion.

## Item 26 Request to add
- POST /api/v2/library-requests with { text } (2-80 chars, a letter, no email, link or 7+ digits); other keys 400; 202 {} also for silent duplicate; 429 when limited. Button sends at once (LibraryPickerDialog.tsx:180).
- Change: button opens a confirm step showing the text, optional name and email, Send and Cancel; posts { text, name?, email? }. Files LibraryPickerDialog.tsx:101-125, 177-184; api.ts:231-234; requests.js:43-54. Tests LibraryPickerDialog.test.tsx:117-153; api.test.ts:42-43; one-shelf-book.spec.js:315; one-shelf-desktop.spec.js:259-261.
