# MyBookshelf: product, infrastructure and adoption review

Date: 2026-11-11. Reviewed: `main` at `8337f50` (the commit live at
https://mybookshelf.cloud, deployment `dpl_BjQWfUieszCG3iNFJPEL4MsrRivJ`) and
the audit branch `feat/library-connector-audit`.

Method: seven read-only subagents (backend, library connectors, search UI,
library-picking UI, public pages, free sources, adoption readiness) plus spot
checks by the lead. Live checks were limited to small numbers of requests.
Paths like `shots/...` refer to each area's folder under
`scratchpad/analysis/<area>/` in the review session and are not in the repo.
Code references are relative to the repository root.

Legend: **[V]** = re-checked by the lead against the live site, code or data;
otherwise reported by one subagent with the evidence shown.

---

## 1. Verdict

The product is ready to show to a reader. It is not yet ready to ask a library
to endorse it. Three things stand in the way:

1. **Search does not reliably put the obvious book first**, and several failure
   states read as "we couldn't find this book".
2. **Nothing on the site speaks to a librarian.** The shared library link opens
   a bare confirmation box, with a generic link preview.
3. **Library data is rough at scale**: 3,277 libraries lack a usable name or
   place, and 92% of libraries are offered as "working" on the strength of a
   network-level check, not a check of that library.

Separately, one feature is broken in production today: **Free to read returns
no books for any query [V]**.

## 2. What is in good shape

- Calm, distinctive visual design; landing page and nine library guide pages
  are polished and honest in tone.
- Book page for catalog records: copies, call number, floor, catalog link.
- Back from a book restores query, scroll position and expanded groups.
- Fast on a small throttled phone: landing ready in 0.4 s (Slow 4G), search
  page 2.4 s first visit, 0.7 s repeat; shelf survives reload.
- Automated accessibility checks (axe-core) found no violations on eight
  screens; visible focus, 44 px targets, no horizontal scroll at 320 px.
- No ads, trackers or guest cookies. Strict CSP, HSTS, previews protected.
- CI is broad (typecheck, client/server tests, build, SEO, three browsers,
  account journeys on Postgres). Server suite: 594 pass, 15 skipped (need
  Postgres), 0 fail. `npm audit --omit=dev`: 0 vulnerabilities.
- Public pages are complete static HTML, self-canonical, correct noindex for
  app routes, lab LCP 0.35–0.6 s.
- Papers search is good for topics and DOIs (0.5–1.4 s), with a clear sources
  sheet and a strong detail page.
- Failed availability lookups return "unknown" plus a catalog link, never a
  false "not found" at the API level.

---

## 3. Broken or misleading today (fix first)

**Status, 2026-11-11:** items 3.1 to 3.8 are fixed on branch
`claude/nifty-feynman-4qwocr` and not yet released. For 3.1 the evidence window
for the three bundled catalogs is now 30 days; importing the complete Gutenberg
catalog (9.2) is still open, so well-known classics remain missing.

| # | Problem | Evidence | Fix |
|---|---|---|---|
| 3.1 | **Free to read returns zero books [V].** Every query shows "0 free books shown"; Browse "Classic literature" shows "181 results have unclear access". | API response `freshness: stale`, `items: 0`; `server/services/content/contracts.js:78` treats evidence older than 24 h as unknown; snapshots imported 5 Nov. | Accept bulk-catalog evidence for 30–45 days with a "checked <date>" note; keep a "check at source" link when stale. |
| 3.2 | **Daily free-content refresh has failed 10 of 10 runs [V].** | GitHub Actions `free-content-refresh.yml`, runs 1–10 Nov all `failure`; it fails at the StoryWeaver recheck, a retired source (`tools/content/refresh_children.mjs:61`). It also only opens a draft PR. | Remove the retired step, auto-merge validated refreshes, alert on failure. |
| 3.3 | **Catalog failure shown as absence.** "We couldn't find this book. Try again." when the catalog did not answer. | `client/src/v2/ui/scan/ScanPage.tsx:79`; `client/src/v2/context.tsx:290-298` discards server messages; `shots/09-egr-wings_of_fire.png`. | Use the approved SearchCatalogDown board: "couldn't check", retry, catalog link. |
| 3.4 | **Chosen library is dropped after a reload.** Scope flips to "All books", query clears, next search goes to public data. | `ScanPage.tsx:42`; `shots/06-anna-after-reload-scope.png`. | Default to the selected library; keep `q` and scope in the URL. |
| 3.5 | **Scan sheet ISBN field is invisible** (25.6 px wide, no border). | `client/src/v2/reader.css:193` leaks into the sheet; `shots/17-scanner-mobile-typed.png`. | Scope the rule to `> input`; add a form so Enter works. |
| 3.6 | **Lamplight contrast failures**: error notice 1.82:1, book-page field label 1.92:1. | `client/src/v2/styles.css:208,73` not themed. | Theme both. |
| 3.7 | **Copy bugs**: "1 libraries", "Japan 1 guides", "6700" without separator, raw `<p>&quot;` from Google Books descriptions, "N o description available." drop cap, raw dates "2024-12-03". | `tools/seo/build-pages.mjs:47`, `ui/book/BookPage.tsx:68`, `reader.css:403`; [V] for "1 libraries". | Route plurals, numbers and dates through `Intl`; sanitise descriptions. |
| 3.8 | **Hindi/Tamil title matching ignores vowel signs [V].** "राम" equals "रोम", "கடல்" equals "கடலை". | `server/services/libraryBookSearch.js:5` strips all combining marks. | Strip only Latin diacritics; keep Indic vowel signs. |

---

## 4. Search and book pages

### Relevance and grouping (High)
- **Famous book buried.** "harry potter": *Philosopher's Stone* (400 editions)
  is candidate 21, three "Show more" taps away. "The Alchemist" at San
  Francisco Public Library: Coelho's book is fifth, behind a book dated "1656"
  [V, screenshot]. Cause: `server/services/searchRelevance.js:109-115,123`
  (exact title 1300 vs contains 1100; edition count only breaks ties).
  Fix: add log-scaled popularity to the score; drop the extra-word penalty for
  author matches.
- **False "No matching edition found".** SFPL, "the alchemist coelho": the top
  card is a 2-edition stub that reports no match; the 141-edition record
  (candidate 16) reports "Available". Fix: ranking, plus link same-title
  siblings on a no-match.
- **Duplicates and wrong merges.** One novel as five cards; 15 different
  *Wings of Fire* volumes as one "View n versions". Cause:
  `client/src/v2/searchGroups.ts:5-52` keys on exact title plus raw author
  string. Fix: group by work ID, normalise authors, label rows by volume.
- **Search and availability disagree.** Anna Centenary lists ISBN
  9788173711466 as available in search; the book page for the same ISBN takes
  26 s and says "Check the edition". Cause: 20 s budget in
  `server/services/libraryBookSearch.js:47` and two parallel requests from
  `client/src/v2/ui/book/useBookScreen.ts:31,66-85`. A 20 s Koha check
  returned "No matching edition found" although flagged partial.
  Fix: one request; reuse catalog search results.

### Scopes and navigation
- **"Library books" means different things per library (High).** Anna
  Centenary searches the catalog; SFPL silently searches public book data,
  flagged only by a small grey line after the list. Fix: one source line under
  the search field in every case.
- Four scopes with no explanation; "All knowledge" is a superset of the other
  two; labels wrap at 12 px on a phone (Medium).
- Header rearranges between scopes; query is lost when leaving Library scope;
  toggling scope blanks the page (`ScanPage.tsx:98-99,114` vs
  `ui/content/ContentSearchPage.tsx:23,88-91`). Fix: one shared header.
- "Show more" dead end on spelling matches (`server/services/workDiscovery.js:65,77`).
- "Not in this library" is a dead end although the server returns
  `catalogSearchUrl` (`server/public-v2/metadata.js:186-190`), unused by the client.
- Transliteration: "ponniyin selvan" at Anna Centenary returns two English
  retellings; Tamil script returns 32+ records; no hint.
- Five cards per step leaves desktop mostly empty (`client/src/v2/searchMemory.ts:40`).

### Loading, speed, polish
- Silent skeletons for 6–16 s; the boards specify "Searching <library>…".
- Timings: public search 2.3–5.4 s; Anna Centenary catalog search 5.7–16.2 s;
  availability 4–26 s; eGranthalaya school library 13–31 s with one error in
  three; All knowledge complete in 17–38 s (first results 1.2–3.6 s).
- Every visible catalog card calls `/books/enrich` (up to 9 s), so covers pop in.
- Cards lack the board's "1937 · 482 editions" line and result count; three
  placeholder styles; mixed name order and case; search field collapses when
  "Cancel" appears.
- Skip link is desktop-only (`ui/AppFrame.tsx:89`); tab order reaches "Choose a
  library" before the search field.

### Design drift
Production lacks several approved boards: CatalogDown card, NotInLibrary
fallback, "Did you mean", "Ways to find a book", scope control under the field.
The references have no board for: a library whose catalog cannot be
title-searched, grouped records, All knowledge, or an aged free-content snapshot.

---

## 5. Library picking

### Finding a library
- **Substring matching, alphabetical ranking (High).** "Anna University"
  returns 14, of which 13 are "Jag*anna*th"/"P*anna*" colleges. "public
  library" (450 results) puts "Air Force School Bagdogra Library" second.
  Cause: `server/public-v2/discovery.js:40-42,61,78`. Fix: match word starts,
  weight name above city above address.
- **Rows cannot be told apart (High) [V, screenshot].** "Central Library"
  gives seven identical rows reading "· checks availability". 4,317 Indian
  libraries have no city and 2,298 no state. `ui/library/LibrariesPage.tsx:89`
  renders a leading " · ". Fix: always show a second line, falling back to the
  network or institution already in `searchAliases`.
- **Place suggestions come first and are mostly noise (High).** "94103" lists
  Lithuania, Poland and Iran; desktop "public library" shows Lima, Finland and
  Boston above 450 libraries. Cause: `LibrariesPage.tsx:70`;
  `server/public-v2/places.js:13-31` does not filter by covered country.
- "Libraries in Chennai" has three answers: 45 (typed), 14 (browse), 12 (near me).
- Zero-result copy is wrong for names (`LibrariesPage.tsx:86` ignores the
  server's `empty.reason`); a US postcode shows "0 of 0" until a place is tapped.

### Browsing at scale
- **India opens on the worst rows (High) [V, screenshot]**: ".Kendriya
  Vidyalaya No2.", "#GWFGCK", "+2 GIRIDIH…". 29 names start with punctuation,
  1,164–1,179 are ALL CAPS, one is a 237-character paragraph.
- **A third of India cannot be browsed (High).** State counts total 4,402 of
  6,700, with no "unknown" bucket (`discovery.js:19-36`).
- Duplicate areas ("Jammu & Kashmir"/"Jammu and Kashmir", three spellings of
  Raebareli); three stacked selects fill the phone screen; an empty "District"
  select shows for the US, Canada and Japan.

### Near me
- **Wrong order (High).** In San Francisco, Hayward ranks above SFPL: 251 of
  2,175 US/Canada branch points are more than 80 km from their own library.
- **No distances anywhere (High)** (`discovery.js:47,53-54` needs reviewed
  points; the data has none).
- Units inconsistent (km by geolocation, miles after "94103"); a chosen place
  is labelled "Nearest to you"; denied location is a red error with no retry;
  London gets a generic empty state with no coverage statement.

### Detail and selection
- **Website-only libraries are not explained (High).** After choosing one,
  Search looks the same as for a connected library. Three labels for one
  state; `catalogOnlyHint` exists but is never rendered
  (`client/src/v2/uiMessages.ts:59`).
- No confirmation after choosing; focus lands on `<body>`.
- Thin detail page: no type, country, official site or "cannot check" list;
  `LibraryMap.tsx` is unused; full names inside buttons give six-line buttons;
  Settings offers no way to clear the library.
- "Libraries near me" label disappears when pressed
  (`client/src/v2/styles.css:134` outranks `reader.css:241`); place-row arrow
  drops to its own line (`discovery.css:104`).

---

## 6. Share link and the librarian's first impression

- **The shared link has no introduction (High) [V, screenshot].** `/select/<slug>`
  shows name, place, Choose and Cancel over a blank grey page. It does not say
  what the service is, that it is free, who runs it, or that it is independent.
  The guide page says all of this; the approved board is far warmer.
- **The link preview is generic for every library (High) [V].** Fetched as
  WhatsApp: `og:title` "MyBookshelf — Your next read", no library name, no
  `og:url` (`server/anonymousApp.js:114`). "Copy library link" always copies
  this URL (`ui/library/CopyLibraryLink.tsx:11-18`).
- **64 links are hashed**; Indian-script names give links up to 791 characters
  (`server/public-v2/libraryLinks.js:5-24`).
- Guides and links are disconnected: only nine guides; "Paste a library link"
  rejects a guide URL.

### What a librarian would ask, and whether the site answers

| Question | Answered? |
|---|---|
| Who runs it | Yes (`/about`) |
| Is it affiliated with us | Yes on public pages; no on the shared link |
| Cost | Yes |
| Patron data | Partly: `/privacy` opens with archived native-app text |
| Load on our catalog | Not publicly. One book open made 6–15 catalog queries |
| Accuracy and freshness | Partly; no "checked at" time shown |
| What happens when it is wrong | Partly: email or GitHub issue; nothing in the app |
| Correct or remove our listing | Promised on `/about`; no process |
| Link, QR code, poster | Copy link only |
| Embeddable search box | No (`frame-ancestors 'none'`) |
| Accessibility statement, terms, children, languages | No; `/terms` is 404 |

### Missing surface
"For libraries" page; terms of use; accessibility statement; in-app "report a
problem"; per-library share kit (short link, QR, poster); "checked at" time;
per-library usage counts (telemetry has no library field); dedicated contact
address (currently a personal Gmail); proper app icons.

### Trust pages out of date
- `/privacy` leads with "You do not create an account" (native apps); accounts
  are live on the web. Library administrators are sent to this page by the
  catalog user agent.
- `/about` says "Your saved shelf stays in your browser"; accounts now sync it.
- `/support` uses labels the web app lacks ("Open Scan").

### Accounts
Email sign-up is live, is the first card on mobile Settings, and has no age
question, terms or consent step. Nothing requires an account. Recommendation
for a pilot: turn it off (`ACCOUNTS_ENABLED`) or move it down, especially for
school libraries.

---

## 7. Library data and readiness

### Counts (7,088 libraries: India 6,703, US 232, Canada 132, Japan 20, NZ 1)

| Platform | Libraries | App offers | 20-record pass | ≥1 record | Zero results | Blocked in audit | Untested |
|---|---:|---|---:|---:|---:|---:|---:|
| eGranthalaya (IN) | 5,036 | title search + availability | 1,594 | 1,580 | 1,855 | 6 | 1 |
| Libman (IN) | 639 | same | 40 | 413 | 179 | 0 | 7 |
| IndCat (IN) | 407 | same | 41 | 1 | 3 | 0 | 362 |
| Koha (IN) | 383 | 335 full, 37 ISBN only, 11 link only | 19 | 1 | 0 | 355 | 8 |
| VuFind (IN) | 130 | full | 0 | 0 | 0 | 130 | 0 |
| Small India platforms | 108 | 86 full, 1 ISBN, 21 link | 44 | 4 | 3 | 22 | 35 |
| BiblioCommons (US/CA/NZ) | 356 | ISBN availability | never audited; 5 checked live | | | | |
| Calil (JP) | 20 | ISBN availability by branch | never audited; 1 checked live | | | | |
| Vega, Aspen, Evergreen (US) | 9 | 7 ISBN, 2 link | none | | | | |

Five hosts serve 94% of libraries; `eg4.nic.in` alone serves 5,036.

### Findings
1. **92% of libraries are advertised as working on network-level evidence.**
   6,547 of 6,632 "full" libraries rely on a flag saying the network's method
   was checked once (`server/public-v2/directory.js:38-42`). Only 147 records
   were checked individually. Fix: per-library status (verified, unverified,
   failing, link only) with a last-checked date, shown in the UI.
2. **Nothing maintains the directory.** Data files were committed once
   (31 Oct); their generator is not in the repo; no scheduled catalog check;
   production telemetry does not record which library failed; all adapter
   tests are offline; the health field is static and never shown.
3. **Names and places are the largest blocker: 3,277 libraries fail.** No city
   or district on 2,285 eGranthalaya, 416 Libman, 221 Koha, 129 IndCat, 120
   VuFind; 19 Japanese entries are prefecture-and-city strings.
4. **The audit and production disagree.** Anna Centenary and KALNET were
   "blocked" in the audit but worked from production; IDEAL (195 Koha
   libraries) failed from production. Health checks must run through the
   production adapters from production.
5. **No robots policy in production adapters**, while the audit found about
   115 libraries on routes robots.txt disallows.
6. **264 catalog links are plain HTTP**; two guide libraries link to raw IP
   addresses (`http://118.185.210.241:8001`, `http://14.139.211.151:9000`).
7. **Load on eg4.nic.in is unbounded across server instances** (queue is per
   instance, `server/services/providers/http.js:47`; timeout 100 s).
8. **Ten-result cap** in four adapters (`koha.js:267`, `vufind.js:194`,
   `egranthalaya.js:411`, `indcat.js:55`).
9. Quick wins: two link-only Koha libraries (CMD Kerala, St. Xavier's Jaipur)
   have live 20-record passes; IIT Bhubaneswar is ISBN-only and could get
   title search.

### Proposed acceptance bar for "show to a library contact"
1. Name is the library's own, with city and state; the `/select/…` link opens it.
2. A production-path search returns its records (≥20 distinct in 30 days).
3. Availability matches its own catalog on three titles, or says "check the catalog".
4. Catalog link opens over HTTPS on a host name.
5. Typical response under 5 s, nearly all under 15 s.
6. robots.txt does not disallow the route, or the library has agreed.
7. Passed a production check within 7 days.
8. Membership and reference-only rules are stated.

On the items computable from the repo (1, 2, 4, 6): **960 India libraries
pass** (870 eGranthalaya, of which 636 are schools; 30 IndCat; 27 academic;
14 Koha; 13 community; 5 Libman; 1 Visakhapatnam). Another 938 pass on name,
link and policy with weaker evidence. 273 BiblioCommons libraries probably
pass (inferred from one code path and five checks).

### Pilot shortlist

| Library | Why | Fix first |
|---|---|---|
| Visakhapatnam Public Library | Guide page; 10 results in 1.2 s | List stops at 10 |
| Central State Library, Prayagraj (+76 UP district libraries) | Real public libraries; 45 with 20-record pass | 15 s search; no authors; government host |
| Anna Centenary Library | Flagship; 18 results in 5.7 s | Raw-IP HTTP link; intermittent timeouts |
| IIT Bhubaneswar | Guide page; HTTPS | ISBN only; enable title search |
| Kumaraguru College of Technology | Passed all three audit runs | City misspelt |
| National Science Library, CSIR-NIScPR | HTTPS; 20-record pass | Not checked from production |
| Alliance Française network (16) | One contact; 13 passes | Not checked from production |
| San Mateo County, Alameda County, San Francisco | Guide pages; SFPL 3.7 s | No terms review on record |
| Richmond Public Library, BC | Reviewed Canadian record; 3.3 s | Ugly link slug |
| Setagaya City Library | Guide page; 14 branches in 7.2 s | Via Calil; no Japanese name on page |

Do not contact yet: British Council, Rayat, MES and Somaiya networks (robots
disallow); Kalaignar Centenary and Ernakulam (plain HTTP, unreachable); any
IDEAL library (host failed from production).

### Ongoing maintenance design
- Every 6 h: one known title per host (~120 hosts).
- Weekly rolling: one stored query per library expecting a stored record ID
  (~1,000/day; one request every 2 minutes to eg4.nic.in).
- Monthly (weekly for pilots): open one record and parse its status.
- Three consecutive failures over 48 h → "failing": still selectable, inline
  call skipped, page shows "catalog not responding since <date>". Thirty days
  failing → link only. Never delete: saved shelves and links hold IDs.
- Keep state outside Git; commit a daily summary only.

---

## 8. Public pages and discoverability

| # | Severity | Finding | Fix |
|---|---|---|---|
| 8.1 | High | **Not submitted to search engines; no sign of indexing.** No verification tag, file or DNS record live; `docs/STATUS.md:93` lists it as open. | Search Console Domain property by DNS TXT; import to Bing; submit sitemap. |
| 8.2 | High | **9 of 7,088 libraries have a page.** | See scaling proposal. |
| 8.3 | Medium | Beta domain `mybookshelf-beta.vercel.app` is an indexable duplicate. | Host-conditional `X-Robots-Tag: noindex` or redirect. |
| 8.4 | Medium | `www` redirects with 307, not permanent. | 308 in Vercel domain settings. |
| 8.5 | Medium | Library pages are thin and templated (29–46 hand-written words; identical H2s; no review date; address in JSON-LD on 2 of 9). | Generate library-specific sentences; add review date and `geo`. |
| 8.6 | Medium | Titles target the library's own query ("<Library> — books and catalog"). | e.g. "Anna Centenary Library catalogue (OPAC): check if a book is available". |
| 8.7 | Medium | Free-to-read content has no public page; the landing never mentions it. | Static `/free-books` hub and per-source pages outside `/app`. |
| 8.8 | Medium | Guide pages share one preview image. | Per-library card generated at build time. |
| 8.9 | Medium | Fonts are nearly all the page weight (Newsreader 216 KB of 224 KB). | Subset; `unicode-range`; system font ahead of Work Sans. |
| 8.10 | Low | No `lastmod` in sitemap; `/seo-report.json` public; `/favicon.ico` 404; four descriptions cut mid-sentence; Setagaya has no Japanese name or `lang="ja"`. | — |

### Scaling proposal
- **Publish individually:** the 408 libraries with a proven or provider-level
  connection plus city and region (US 187, IN 109, CA 91, JP 20, NZ 1). Roll
  out 9 → ~50 → 356 → 408.
- **Do not publish individually:** the 6,548 Indian entries with only a
  method-level validation. List them on area hubs only.
- **Quality gate in the build:** passing live probe with a date (becomes
  `lastmod` and "last checked"); city, region, country; hostname not raw IP;
  two of (address, ≥2 branches, access note, native name); not a school,
  military or restricted library; unique name and place; slug ≤ 80 characters.
- **URLs:** keep flat `/libraries/<slug>`; add `/libraries/in`,
  `/libraries/in/tamil-nadu`, `/libraries/us/california`; city hubs where ≥3
  libraries (171 cities); split the sitemap into an index.
- Add a static filter on `/libraries` falling back to `/app/libraries?q=`.

---

## 9. Free and open sources

39 sources in the registry, 34 enabled. Three scopes share one content API:
Free to read (3 bundled snapshots), Papers (one live index per search), All
knowledge (the browser queries all 34, three at a time).

| # | Severity | Finding | Fix |
|---|---|---|---|
| 9.1 | High | Free to read empty (see 3.1, 3.2). | — |
| 9.2 | High | **All knowledge buries the answer.** "pride and prejudice": 34 results, 4 free; Gutenberg returned nothing because its 1,000-record sample lacks the novel. "children stories hindi" led with a Federal Register rule. | Import complete Gutenberg; default to reading sources; rank free first. |
| 9.3 | High | **Unclear-access results shown by default** from 20 metadata-only sources (`knowledgeSearch.js:39`), against the approved decision; genuinely free textbooks are hidden. Only 11 of 34 sources can produce a "Free" label. | Hide unclear by default; mark when shown. |
| 9.4 | Medium | Papers: arXiv ID gives "This paper source isn't connected here" (`search.js:38`); author search returns papers about the author; Europe PMC timed out at 8 s in 2 of 3 tries with no fallback. | Route both through OpenAlex; fall back on timeout. |
| 9.5 | Medium | Free text labelled unclear (Project Madurai, OpenStax); OpenStax detail has no reading button. | — |
| 9.6 | Medium | "Also free to read" cannot appear on library book pages: only 697 textbook ISBNs are matchable; Gutenberg carries no ISBN or Open Library ID. | Add identifiers. |
| 9.7 | Medium | All knowledge page: 34 sections, 31 empty on one query; filters fill the first phone screen; Back re-runs all 34 sources. | Collapse empty sources; cache results. |
| 9.8 | Medium | No transliteration ("thirukkural" finds nothing; திருக்குறள் finds 6); no cross-source grouping. | — |
| 9.9 | Medium | Every All knowledge search calls OpenAlex twice and Google Books once, on the same key as core book metadata; no cache. | Cache; separate keys. |
| 9.10 | Medium | Adding a source touches about 8 places; no per-source switch (one flag switches 29); `source-catalog.md` omits 17 deployed sources. | Per-source flags; update docs. |
| 9.11 | Low | Odd labels: Google Books shows "5.5.2.0.preview.1" as the edition; "cc by"; raw HTML entities in Europe PMC titles; duplicate sentence on Papers error. | — |

**Recommendation: stop adding sources.** Order: restore Free to read →
complete core catalogs (full Gutenberg, full Open Textbook Library) and add
identifiers → reshape All knowledge → fix arXiv and author search → per-source
flags, telemetry, daily smoke test → then add by audience (India: StoryWeaver,
NCERT, National Digital Library of India; US/Canada: Gutenberg + LibriVox,
Standard Ebooks, OpenStax).

---

## 10. Backend, operations and documentation

One Express app on a single Vercel function (Pro plan, Node 22, region `iad1`,
120 s limit) plus a static Vite site. The public API has no database or shared
store: the directory is ~14 MB of bundled JSON and every cache, queue and rate
limit lives in one instance's memory. Accounts are live (Better Auth on Neon
Postgres, Resend mail, Blob deletion ledger, 5-minute cron).

| # | Severity | Finding | Fix |
|---|---|---|---|
| 10.1 | High | **No visibility into the public API.** Telemetry is an in-memory list nothing reads (`server/public-v2/telemetry.js:32-46`); unexpected errors become a 503 with no log line (`router.js:71-73`); no error tracker, analytics or uptime check. | One structured log line per request; error tracker with a 5xx alert; external probe on `/api/health` plus one canary search. |
| 10.2 | High | **Rate limiting is unreliable.** Coded as 60 requests/min per IP per instance (`router.js:24-38`, applied to all `/api/v2` routes [V]); one All knowledge search sends 34 calls. Yet two subagents made ~70 calls in under a minute with no 429. So it neither reliably protects nor behaves predictably on a shared library network. Not load-tested. | Key on `x-vercel-forwarded-for`; per-route limits; fan out server-side. |
| 10.3 | High | **No shared cache or global per-catalog budget.** One availability check made 15 catalog requests (IIT Bhubaneswar, 11.1 s). Caches last 60 s per instance. | Shared cache (availability 5–15 min, metadata 24 h); global per-host budget; fail-fast breaker. |
| 10.4 | High | **The "five-minute" account monitor runs every 4–10 hours** (41 runs in 10 days). | External uptime monitor. |
| 10.5 | Medium | **CI does not gate production.** The `main` run for `4c24530` failed while its deployment went live. | Required check on `main`, or promote after CI. |
| 10.6 | Medium | Single region `iad1`; an Anna Centenary check took 20.2 s and timed out (one sample). | Measure each catalog from `iad1` vs an Asian region. |
| 10.7 | Medium | Production accounts on Neon Free (per docs), backup retention and second-operator restore open. | Confirm limits; paid plan before promoting accounts. |
| 10.8 | Medium | Quota single points of failure: OpenAlex capped at $1/day; every uncached text search calls Google Books. | Record quotas; alert on quota errors. |
| 10.9 | Medium | Preview build cost: 800 preview builds from one branch in ~50 hours. Now blocked for that branch [V]. | Turn off automatic previews for agent branches. |
| 10.10 | Medium | **Docs contradict production.** `README.md:21-22` says accounts are not implemented; `CLAUDE.md` calls the API anonymous; `docs/STATUS.md` is 223 lines with ~35 current; no architecture overview, no public-API incident runbook, no "add a library" guide; the tooling that produced `server/data/libraries.json` is not in the repo. | Rewrite STATUS as current-state; add the three missing docs. |
| 10.11 | Low | `openLibrary.js` fetches and the browser `fetch` have no timeout; `x-powered-by` exposed; no `Permissions-Policy`; docs-only merges redeploy production. | — |
| 10.12 | Medium | 21 of 54 Vercel variables are stored as ordinary encrypted values, readable by an API token, including a production ledger token and admin database credentials [V, names only]. | Mark as Sensitive. |

Audit branch (from the earlier review in this session): 5.7 GB of evidence in
Git; unit tests depend on that folder; triage and Python tests not in CI; the
eGranthalaya run sends 250 requests at once to one government host; the audit
uses Title search while the app uses All-fields with a fresh session per search.

---

## 11. Localization

- No i18n mechanism: `lang="en"` fixed; 230 message keys in two files (about
  105 unreferenced) plus about 900 hard-coded strings in ~40 components.
- Newsreader and Work Sans have no Devanagari, Tamil or Japanese glyphs; system
  fallback rendered all three without missing glyphs (in the test sandbox, not
  on Android).
- Hindi, Tamil and Japanese queries work in public book search (3–5 s).
- One `name` field per library; no local-language field.

Recommended order:
1. **English done properly now**: plurals, dates, PIN/ZIP wording.
2. **Hindi**: Hindi-belt states hold about 2,380 of about 4,370 placed Indian
   records, plus about 1,100 Kendriya Vidyalaya libraries.
3. **Japanese** when a Japanese library joins the pilot.
4. **Tamil** when a Tamil Nadu library joins (84 libraries).
5. Canadian French later: no Quebec libraries in the data.

Approach: no framework. Keep the typed catalog as the English source, add
partial per-language files loaded on demand, a small locale provider that sets
`lang`, `Intl` for numbers/dates/plurals, client-side mapping of server error
codes, and a test that fails on new literal text. Estimated size: about 450
strings (2,500–3,000 words) for the core app; 4–6 days of extraction and
plumbing, then 1–2 days per language. Keep accounts, free-content screens and
legal text in English for now.

---

## 12. Not verified

- Real Android or iPhone devices, Safari, real screen readers, formal WCAG
  conformance.
- Google or Bing index status; how link previews render inside chat apps.
- Behaviour under load: 429 rates, scale-out, cold starts.
- Whether BiblioCommons, Calil, NIC, INFLIBNET or MasterSoft permit this use.
- Whether shown availability matches each library's own catalog.
- 351 other BiblioCommons libraries, 19 Calil systems, Vega/Aspen/Evergreen.
- Whether all 195 IDEAL libraries are down (one call failed).
- Whether the 24-hour evidence expiry is intended policy.
- Paywall status of several publisher links (bot challenges blocked the test browser).
- Vercel log drains, spend alerts, branch protection settings.

For a legal professional: children's data in school libraries (India DPDP Act,
US COPPA and student-privacy laws); absence of terms of use; data controller,
storage location and cross-border transfer; whether catalog providers' terms
permit automated lookups.
