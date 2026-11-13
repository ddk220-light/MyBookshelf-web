> Archived Claude proposal, retained for rationale. Licence, publication scope, routing, biography and availability decisions were superseded by [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). This is not the current implementation checklist.

# Plan: make MyBookshelf findable, readable and trusted

**Goal:** when someone searches for a library we support ("Anna Centenary
Library book search", "Alameda County Library catalog", "IIT Madras library
books"), a MyBookshelf page for that library appears in the results. That page
says what the library offers and what MyBookshelf can check there, and it
starts a search of the library's books in one tap. Around it, plain pages say
what MyBookshelf is, who makes it, how it treats readers and libraries, and
where the code lives.

The designs are on the canvas row "SEO — public pages for every library" and in
`docs/design/2026-10-mobile/images/Seo*.jpg`:

- site structure and sitemap
- landing page
- library page, on laptop and phone
- area page
- About page template
- 404 page

The About copy template is [ABOUT_TEMPLATE.md](ABOUT_TEMPLATE.md).

Checked against production (`d9d0af7`) on 29–31 October 2026.

## Decisions

| Question | Decision |
| --- | --- |
| Licences | Apache-2.0 for code, and CC BY 4.0 for directory data we wrote. Third-party data keeps its own licence, with attribution. |
| Repository | A new, clean public repository started from a reviewed snapshot of `main`. The current repository stays private, keeping its history and the native-app branches. |
| Addresses | `/libraries/…` belongs to the public directory pages. The app moves under `/app/…`, with permanent redirects from today's app paths. |
| Thin pages | Every library gets a page. Pages without enough real detail are `noindex, follow` until their data improves. |
| About | A real person and contact, from the template; you fill in the details. |
| Search preview, map, suggest-a-library | Not added. Corrections go through a public "Correct a library's details" GitHub issue. |

## Where we are today

- **Every app URL returns the same empty page.** `/`, `/libraries`, `/scan`,
  `/books/…`, `/select/…` and any made-up path all return the same 416-byte
  HTML shell titled "MyBookshelf", with status 200 and no text until
  JavaScript runs.
- **No robots file or sitemap.** `/robots.txt` and `/sitemap.xml` return that
  same HTML page.
- **Only `/support` and `/privacy` are real pages.** They have a title and a
  description.
- **No sharing or search metadata:** no description, canonical URL, share
  preview, favicon, manifest or structured data.
- **The `www` redirect is temporary.** `www.mybookshelf.cloud` sends a 307
  redirect to the apex domain.
- **The repository is private and has no licence.**
- **There's plenty to describe:** 7,071 libraries (India 6,686 · US 232 ·
  Canada 132 · Japan 20 · New Zealand 1). Each has a stable slug
  (`/select/<slug>`), and most have capabilities, a catalog system, and a city
  or district. Many also have an address with a source, an access note and
  classified branches.

## Site structure

```
mybookshelf.cloud
├─ /                                   landing                            index
├─ /about  /how-it-works  /open-source                                    index
├─ /privacy  /support                                                     index
├─ /libraries                          countries                          index
│  ├─ /libraries/in                    country: states                    index
│  │  ├─ /libraries/in/tamil-nadu      state: districts                   index
│  │  │  └─ /libraries/in/tamil-nadu/chennai   district: libraries        index (?page=2 self-canonical)
│  └─ /libraries/<library-slug>        one library (flat, never nested)   index or noindex,follow
├─ /libraries/search?q=…               results for the landing form       noindex
├─ /app/shelf  /app/books/…  /app/privacy  /app/terms  /app/about   noindex
│    (old /app/search, /app/libraries, /app/settings redirect to the shelf)
├─ /select/<library-slug>?next=…&q=…   choose a library, then open the app   noindex
├─ /robots.txt   /sitemap.xml   /sitemaps/*.xml
└─ anything else → 404 page, status 404
```

- **Library pages use flat slugs,** so a library's address doesn't change if
  its area data is corrected. Areas link down and libraries link back up
  through the breadcrumb.
- **Country segments** use ISO codes in lower case (`in`, `us`, `ca`, `jp`,
  `nz`). **Region and district segments** are slugged names after district
  normalisation (A3).
- **Same-name libraries** get readable suffixes: the city, then the region,
  then a short id only if still needed (for example
  `richmond-public-library-british-columbia`). Today's hashed `/select` slugs
  keep working as aliases.
- **Every library is reachable in three clicks** from `/`: home → country →
  state → district → library, plus "Nearby libraries" links between library
  pages.

## Sitemap

```
/sitemap.xml                         sitemap index
├─ /sitemaps/pages.xml               /, /about, /how-it-works, /open-source, /privacy, /support
├─ /sitemaps/areas.xml               /libraries and every country, state and district page (page 1 only)
├─ /sitemaps/libraries-in-1.xml      India libraries, split every 10,000 URLs
├─ /sitemaps/libraries-us.xml
├─ /sitemaps/libraries-ca.xml
├─ /sitemaps/libraries-jp.xml
└─ /sitemaps/libraries-nz.xml
```

- **Only indexable pages are listed.** A `noindex` library page is left out
  until it becomes indexable. Listing pages we ask search engines to skip
  sends mixed signals.
- **`lastmod` is the date the page's content last changed:** a library's
  verification date (`probedAt` or `verification.*.lastChecked`), or the latest
  change in an area. Never the build date, which would make every page look
  changed every deploy.
- **Leave out `changefreq` and `priority`.** Search engines ignore them.
- **Limits:** each file stays under 50,000 URLs and 50 MB (uncompressed).
  Country files split at 10,000 so a single change rewrites a small file.
- **Images:** the per-library share image can be listed with `<image:image>`
  later.
- **Sitemap and robots stay in sync.** The generator writes the sitemap and
  `robots.txt` from the same list of indexable pages. CI fails if a URL in a
  sitemap returns anything but 200, or carries `noindex`.

`robots.txt`:

```
User-agent: *
Disallow: /api/
Disallow: /app/
Disallow: /select/
Disallow: /libraries/search
Sitemap: https://mybookshelf.cloud/sitemap.xml
```

### When a library page is indexed

| Rule | Result |
| --- | --- |
| Working catalog connection (we can check availability or search the catalog) | `index, follow` |
| No connection, but a verified place plus at least one more real fact (address with source, classified branches, access note) | `index, follow` |
| Anything less (name and region only, website-only with no place) | `noindex, follow`: still published, linked from its area, and out of the sitemap |

The generator prints a report of how many pages are in each group by country,
and the fields that would lift a page into the indexable group. That report is
a to-do list for the directory.

## Trust

These are the things that make the pages trustworthy to readers, libraries and
search engines. Each is built into a template, not left to copy:

- **Independence:** every library page says MyBookshelf isn't run by or
  affiliated with the library, and that borrowing rules and records belong to
  the library. No library logos.
- **No invented facts:**
  - No ratings, reviews, opening hours, collection sizes or popularity.
  - Only details we hold, each with its source (address) or date ("Connection
    checked 27 October 2026").
  - Live availability is never cached on a public page.
- **Honest limits:** each page says plainly what we can't check there
  ("doesn't share which branch has a copy").
- **Openness:** a GitHub link and the licence in every footer. The library list
  is public data. A "Report a problem with these details" link opens a
  prefilled public GitHub issue.
- **A real person and a contact** on About, and libraries can ask for a
  correction or removal.
- **Privacy in plain words:** no account needed, no ads, a shelf in your browser
  (or in an optional account), search text kept only in an anonymous log with no
  account, IP or device identifier (12 months, then totals), location used once
  for Near me and not stored. Analytics count page visits only, with no cookies
  and no IP addresses (docs/policy/privacy.md).
- **Security basics:** HTTPS only, strict CSP, catalog links that aren't secure
  are labelled ("not a secure link"), and a `SECURITY.md` in the repository.

---

# Part A — Backend, data and repository

## A1. The new public repository

1. **Snapshot.**
   - Rename the private repository first, for example to
     `ddk220-light/MyBookshelf-archive`. GitHub names are case-insensitive, so
     this frees the name for the public repository.
   - Then create a public `ddk220-light/MyBookshelf` from a reviewed export of
     `main`: `git archive`, or a fresh `git init` with one initial commit.
   - Don't push the private history or any other branch.
   - Open pull requests and branches stay in the archive. Finish or close them
     first.
2. **Choose what goes public.**
   - Keep `client/`, `server/`, `tools/` (build, directory and deployment
     scripts), `data/` (directory and its evidence summaries), `docs/design/`,
     `docs/seo/` and tests.
   - Leave out the native-app archives, App Store and Play material,
     `Dockerfile.bak`, Railway files, `mockups/`, and internal agent notes. Also
     leave out research files that read like scouting a library's systems
     (port scans, private contacts, people's names).
3. **Scan before the first push.** Run gitleaks and trufflehog over the
   snapshot, and over the full private history to find anything to rotate.
   Check for `.env*`, keys, tokens, signing material, Vercel team and project
   IDs, and catalog credentials. Rotate anything found, even if it isn't
   exported.
4. **Repository settings:**
   - description, topics (`libraries`, `library-catalog`, `opac`, `koha`,
     `books`, `open-data`) and homepage `https://mybookshelf.cloud`
   - branch protection on `main`, private vulnerability reporting, Dependabot
     alerts, and CodeQL
5. **Deployments:** point the Vercel project `mybookshelf` at the new
   repository (production follows `main`, as today). Keep secrets only in
   Vercel. Update `CLAUDE.md` and the README for the new location; public
   `CLAUDE.md` content stays free of team IDs.
6. **Keep the private repository** read-only, for history and native work. Its
   README links to the public one.

## A2. Licences and attribution files

- `LICENSE`: Apache-2.0, for code.
- `data/LICENSE`: CC BY 4.0, for directory data we created.
- `NOTICE`: third-party attributions.
  - GeoNames (CC BY 4.0).
  - Calil (Japan). Check its terms before republishing; drop fields we may
    not redistribute.
  - Anything else used to build the directory.
- `README.md` (public):
  - what MyBookshelf is, with a link and a screenshot
  - how to run it
  - how the directory is built and verified
  - how to correct a library's details
  - the licences
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant) and
  `SECURITY.md`.
- Issue templates:
  - "Correct a library's details": library slug, field, correct value,
    source link.
  - "Bug".

  No "suggest a library" template, as decided.

## A3. Directory data the pages need

All of this is produced from the existing directory build (`data/`,
`tools/library-directory/`, `server/services/directory.js`). Keep it in one
shared module so the API and the pages never disagree.

- **Page slugs:** reuse `libraryLinks`. For same-name libraries, add readable
  place suffixes, with the hashed forms kept as aliases. Store published slugs
  in `data/library-page-slugs.json` so they never change. Renames and merges
  add aliases that redirect (308).
- **District and state names:** normalise duplicates, for example Ahmadabad /
  Ahmedabad and Belagavi / Belgaum / Belgavi. Keep the variants as search
  aliases. This is backend issue #7.
- **Area tree with counts:** country → region → district → library ids,
  sorted by name, with counts. The same data serves `/api/v2/libraries/areas`
  (issue #10).
- **Per-library page facts,** each nullable and never guessed:
  - display place
  - address, its scope and its source URL
  - branch count and names, plus lockers and mobile libraries
  - access note
  - catalog system
  - catalog URL and whether it is secure
  - capabilities: what we can and can't check
  - last verified date
  - attribution
- **Nearby libraries:** up to six in the same district or city, by name.
  Distance only where both points are published.
- **Indexability:** the rule above, with the reason recorded per library for
  the report.
- **Health:** not shown until it is measured (issue #4).

## A4. The page generator

- **The build step:** `tools/seo/build-pages.mjs` runs before `vite build`
  and writes static HTML into the web build output.
- **Templates:** plain template literals in `tools/seo/templates/`, one per
  page type, with every value escaped. No React and no client JavaScript,
  except the small optional `site.js` (B4).
- **Each page has:**
  - a unique `<title>` and meta description
  - a canonical URL on the apex domain
  - the robots meta (`index` or `noindex, follow`)
  - Open Graph and Twitter tags
  - JSON-LD (B3)
  - the breadcrumb, header and footer
- **Output:**
  - 7,071 library pages
  - one page per country, region and district
  - the site pages and a 404 page
  - `robots.txt`, the sitemap index and the sitemaps
  - `seo-report.json`
- **Library search without JavaScript:** `/libraries/search?q=` is a small
  server route in the API service that renders HTML results (`noindex`). It
  uses the directory search the app already uses, so the landing form works
  without JavaScript.
- **Builds:** `tools/deployment/ignore-web-build.mjs` must rebuild the web
  service when directory data, the generator or templates change, not only
  client files.

## A5. Hosting and routing (`vercel.json`)

- **Serving order:**
  1. Static files with clean URLs: `/robots.txt`, `/sitemap.xml`,
     `/sitemaps/*`, `/libraries/**`, `/about`, `/how-it-works`,
     `/open-source`, `/privacy`, `/support`.
  2. `/libraries/search` goes to the API service.
  3. `/app/*` and `/select/*` rewrite to the app shell.
  4. Permanent redirects (308): `/shelf`, `/scan`, `/books/*`, `/settings`
     and `/libraries?…` (app query forms) to their `/app/…` equivalents, so
     existing bookmarks and shared links keep working.
  5. Everything else returns the static 404 page with status 404. Remove the
     catch-all rewrite to `index.html`.
- **Redirects:** `www` → apex becomes a permanent 308. Slug aliases redirect
  with 308.
- **Headers:**
  - Public pages: `Cache-Control: public, max-age=300, s-maxage=86400,
    stale-while-revalidate=604800`.
  - App shell: `no-cache`, as now.
  - `X-Robots-Tag: noindex` on `/api/*`, `/app/*`, `/select/*` and
    `/libraries/search`.
  - The CSP stays strict. JSON-LD is a non-executed
    `<script type="application/ld+json">`, so `script-src 'self'` still holds.
    `site.js` is a file, not inline.

## A6. Search engines and monitoring

- Verify the domain in Google Search Console and Bing Webmaster Tools with DNS
  TXT records, and submit `/sitemap.xml`. Ping IndexNow (Bing, Yandex) on
  deploy with changed URLs.
- Watch:
  - indexed vs submitted pages
  - impressions and clicks for queries containing a supported library name
  - Core Web Vitals
  - crawl errors
- Analytics on public pages only, cookie-free and without IP storage (Vercel
  Web Analytics or Plausible). None on `/app`.
- Early target: library pages with a working catalog connection indexed within
  4–6 weeks of launch.

## A7. Tests and CI

- Generator unit tests:
  - escaping
  - slug stability across builds
  - aliases
  - indexability rules and their reasons
  - no field shown when its data is missing
- API vs page consistency: for a sample of libraries, the page's capabilities
  and branch count match `/api/v2/libraries/resolve`.
- Output checks:
  - no broken internal links
  - every library reachable from `/libraries`
  - every sitemap URL returns 200 and is indexable
  - `robots.txt` doesn't block a sitemap URL
  - unknown paths return 404
- Crawl the built site locally with a link checker, and validate structured
  data with the schema.org validator in CI.

---

# Part B — Frontend

## B1. Public page templates

| Template | Board | Content |
| --- | --- | --- |
| Landing `/` | SeoLanding | Promise: "Find out if your library has a book, before you go". A library search form (works without JavaScript), coverage counts, how it works in three steps, "Built to be trusted", libraries by country, and **Open the app**. |
| Library `/libraries/<slug>` | SeoLibrary, SeoLibraryPhone | Breadcrumb, name and place, one-line summary. **Search this library's books** (deep link) and **Library's own catalog**. What MyBookshelf can check here. About the library (address with source, branches, borrowing, catalog system, connection checked). How it works. Nearby libraries. The independence notice, plus Report a problem. |
| Area `/libraries/<country>/<region>/<district>` | SeoArea | Breadcrumb, "Libraries in Chennai, Tamil Nadu", a count, a two-column list (name · place · what we can check), pagination at 50, other districts, and **Search books in Chennai libraries**. |
| Country and state | (as Area) | Child areas with counts, plus the libraries list if short. |
| About `/about` | SeoAbout | Built from [ABOUT_TEMPLATE.md](ABOUT_TEMPLATE.md). |
| How it works `/how-it-works` | — | What happens when you search, check and save. The four levels of "what we can check". Where data comes from. Privacy in plain words. |
| Open source `/open-source` | — | Licences, GitHub, how to run it, how to correct a library's details, attributions. |
| Not found | Seo404 | "We couldn't find that page", library search, links. |
| Privacy, Support | — | Keep the content. Move them onto the shared header and footer. |

Copy rules:

- Titles follow "<Library>, <City> — search the catalog for books |
  MyBookshelf".
- Descriptions are 140–160 characters, built from the library's own facts.
- Keep shared boilerplate short, so most of each page is about that library.

## B2. Shared look

- `site.css` built from `reading-lights.css`. Daylight by default; Lamplight
  under `prefers-color-scheme: dark`. No theme picker on public pages.
- Header: logo, Libraries, How it works, About, GitHub, and **Open the app**.
  Phone header: logo and **Open the app**.
- Footer:
  - "An independent, open-source project. Not affiliated with any library.
    Free, no account, no ads."
  - links: Libraries, How it works, About, Open source, Privacy, Help &
    support, GitHub
  - the GeoNames credit
- Type: Newsreader for headings, system type for text. Self-host Newsreader,
  subset, and preload it only on the landing page.
- 44 px targets, a skip link, `lang="en"`, visible focus rings, no motion.

## B3. Structured data and meta

| Page | JSON-LD | Notes |
| --- | --- | --- |
| Landing | `WebSite`, `Organization` (name, url, logo, `sameAs` GitHub) | Open Graph image: the bookcase on Daylight. |
| Library | `Library` (`name`, `address` as `PostalAddress`, `geo` only when published, `url` set to this page), `BreadcrumbList` | No ratings, hours or phone numbers unless sourced. `sameAs` the library's own website if we hold it. |
| Area | `BreadcrumbList`, `ItemList` of library pages | Pages 2 and later are self-canonical. |
| About, How it works, Open source | `BreadcrumbList`, `AboutPage` on About | |

Every page also has:

- a canonical URL
- robots meta matching the indexability rule
- `og:title`, `og:description`, `og:url`, `og:image` and `twitter:card`
- `theme-color`

## B4. Changes in the app

- **Move under `/app/…`:** update React Router paths and internal links, the
  share-link builders, and the e2e tests. Today's paths redirect (A5).
- **Deep links:**
  - `/select/<slug>?next=/app/shelf`: choose the library silently (it
    replaces any earlier choice; the library name under the search bar shows
    it), then open the shelf. Old `?next=/app/search` links do the same.
  - `&q=<title>` also runs the search.
  - `next` must be a local `/app/` path, as for book returns today.
- **Returning visitors:** `/` is the landing page for everyone. A small
  `/site.js` sends visitors with a saved shelf or library to `/app/shelf`. It
  reads localStorage, which crawlers don't have. The canonical URL of `/` stays
  the landing page.
- **Links back out:** the library detail gets "About this library ↗" to its
  public page (FixLibDetail). Settings gets an About section with the GitHub
  link and licence.
- **App shell (`client/index.html`):**
  - a real title and description
  - Open Graph tags and an image
  - SVG and PNG favicons, `apple-touch-icon` and `manifest.webmanifest`
  - `theme-color` per reading light
  - `<meta name="robots" content="noindex">`
  - a `<noscript>` paragraph linking to `/`, `/libraries` and `/about`
- **Per-route `document.title`,** for example "Search · Anna Centenary
  Library — MyBookshelf".
- **The UI review fixes** in `docs/design/2026-10-mobile/UI_REVIEW.md`. The
  Libraries tab fixes go first, because the deep links land there.

## B5. Share images

- Start with one site image (1200 × 630).
- Later, a card per indexable library ("Anna Centenary Library · Chennai ·
  Search its books on MyBookshelf"), rendered at build time with Playwright or
  satori, to `/og/libraries/<slug>.png`.

## B6. Quality bar

- Lighthouse 95+ on Performance, Accessibility, Best Practices and SEO for the
  landing, library and area pages, on mobile.
- Library pages readable with JavaScript disabled, as checked in Playwright.
- No layout shift.
- Pages work at 320 px and at 200 % zoom.

---

## Work order

| Stage | Part | Work | Size |
| --- | --- | --- | --- |
| 1 | A | New public repository: snapshot, secret scan, licences, README, contribution files, issue templates, settings | 1 day, plus review |
| 2 | A | Routing basics: real 404, robots.txt, permanent `www` redirect, noindex headers | ½ day |
| 3 | A | Directory page data: slugs, district normalisation, area tree and counts, page facts, indexability report | 1–2 days |
| 4 | A + B | Generator, templates, `site.css`, sitemaps, structured data | 2–3 days |
| 5 | B | Landing, About (from the template), How it works, Open source, 404; restyle Privacy and Support | 1–2 days, plus writing |
| 6 | B | App under `/app`, redirects, deep links, About-this-library links, app shell meta, per-route titles | 1 day |
| 7 | B | UI review fixes, starting with the Libraries tab | 2 days |
| 8 | A | Search Console, Bing, IndexNow, monitoring | ½ day |
| 9 | B | Share images per library | ½ day |

Stages 1–2 can ship on their own. Stages 3–6 ship together, because the app
move and the public `/libraries` pages depend on each other.
