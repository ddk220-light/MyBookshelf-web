# MyBookshelf public web repository, UI improvements, and SEO launch

Status: implemented on `codex/ui-seo-launch`; see VALIDATION.md for verification and external launch requirements.

Source: Claude's `claude/charming-cray-1gekuz` branch, especially `SEO_PLAN.md`
and `UI_REVIEW.md`, reconciled with current `main` and the owner's decisions.
Apply recommendations onto current main; do not merge the older design branch
wholesale or restore its older application implementation.

## 1. Confirmed decisions and defaults

- Create a separate public repository for the web application. Keep the current
  repository, history, and native applications private and unchanged.
- Code licence: AGPL-3.0. Use SPDX `AGPL-3.0-only` as the default interpretation.
  Commercial use is permitted; covered modified network deployments must offer
  corresponding source to their users. Do not describe AGPL as noncommercial.
- Publish nine library SEO pages initially: four India, four US, one Japan.
- The full directory remains available through app discovery and existing APIs.
  Only public SEO publication is restricted. Unpublished public-library paths
  return 404; do not generate thousands of hidden or noindex library pages.
- Move the app under `/app/` without old-route redirects or migration work.
  Keep existing storage keys where practical, but do not build migration machinery.
- Returning visitors with a valid saved shelf or selected library automatically
  move from `/` to `/app/shelf`. This applies only to the root landing page.
- Verified work dates may use “First published.” Edition dates remain “Published.”
- Saved availability is labelled as a last result and refreshed on book open.
- Distances use miles in the US and kilometres elsewhere. Approximate locations
  retain explicit uncertainty; city matches do not receive invented distances.
- Public repository name default: `ddk220-light/MyBookshelf-web`. Check availability
  before creation; do not rename or replace the existing repository.

### Proposed launch-library defaults

The owner selected the country counts, not these eight individual India/US names.
Use this proposed set unless the owner substitutes specific libraries before work.
Setagaya is the Japanese library represented by the existing Calil test fixtures.

| Country | Library | Stable directory ID |
| --- | --- | --- |
| India | Anna Centenary Library | `koha:anna-centenary-library` |
| India | Visakhapatnam Public Library | `vpl:visakhapatnam-public-library` |
| India | Aliah University Library | `koha:aliah-university` |
| India | Central Library, IIT Bhubaneswar | `koha:iit-bhubaneswar` |
| US | Alameda County Library | `bc:aclibrary` |
| US | San Mateo County Libraries | `bc:smcl` |
| US | San Francisco Public Library | `bc:sfpl` |
| US | Santa Clara County Library | `bc:sccl` |
| Japan | Setagaya City Library | `calil:Tokyo_Setagaya` |

Review official facts, access restrictions, attribution, and a representative live
lookup for each before launch. Configured capability flags and old health labels
are not proof of current working connections. Record failures honestly and fix
inaccurate claims; do not silently substitute another library or claim availability.

## 2. Public repository and licensing

Prepare a clean export of the web app and its public API, required build tooling,
runtime directory, reproducible data inputs, tests, and relevant documentation.
Audit runtime imports so exclusions do not break the clean build. Exclude private
Git history, native-app archives, account/patron legacy code not used by the web
app, credentials, browser state, internal notes, and unrelated research artifacts.

Include the full AGPL-3.0 licence, copyright attribution to Deepak Ravikumar, README,
CONTRIBUTING, SECURITY, third-party notices, and bug/library-correction templates.
Provide a visible Source code link, including the release commit, from public
pages and app settings. Do not apply AGPL to dependencies or third-party assets.
Use CC BY 4.0 for original directory data as proposed by Claude; preserve upstream
licences and attribution. Review redistribution rights for Calil data, fixtures,
fonts, images, and other bundled material before publication. Unclear rights block
publication of the affected material; remove or replace it and verify the build.

Scan the exact export for secrets and sensitive material before the initial public
push. Establish clean-install CI, protected main, dependency alerts, and private
vulnerability reporting where available. Keep secrets in runtime configuration.
Publishing the new repository does not itself switch production deployment.

## 3. Public pages, data contract, and routing

Create an explicit SEO publication manifest containing the nine stable library
IDs, fixed public slugs, reviewed descriptive copy, source URLs, and content-change
dates. Missing IDs, duplicate slugs, or missing reviewed launch content fail the
build. This manifest is the single publication gate for pages, links, and sitemap
entries; it does not filter the application's directory service.

Reuse the API's normalized public-library projection for capabilities and public
facts. Do not export internal provider credentials or configuration. Keep published
slugs stable rather than recomputing them from names on each build. Existing
selection links continue as the app's selection interface, without maintaining
old application route aliases.

Build static HTML after Vite finishes. Generate `/`, `/about`, `/how-it-works`,
`/open-source`, `/libraries`, the nine `/libraries/<slug>` pages, shared privacy
and support layouts, and a real 404 page. At nine libraries, the public directory
is one country-grouped hub. Defer country/state/district pages, pagination, public
directory search, and per-library share images until the publication set grows.
The hub links to full discovery inside the app and distinguishes featured-page
counts from total application coverage.

Each library page includes sourced place information, supported capabilities,
known limitations, access restrictions, a catalog link, the app CTA, attribution,
and an independence notice. Include addresses, branches, dates, and coordinates
only when supported by published evidence. Academic libraries must not imply
unrestricted public borrowing. Do not publish cached live book availability.
Use “Search this library” only for supported title search; otherwise guide users
to find a book and then check it at the selected library.

Use the reading-light visual language, Daylight by default and Lamplight for dark
system preferences. Self-host licensed fonts; maintain visible keyboard focus,
44-pixel controls, skip navigation, and readable 320-pixel layouts. Use one local
1200 × 630 share image initially, plus favicons, touch icon, and app manifest.

Every indexable page receives its own title, description, apex canonical URL,
Open Graph/Twitter metadata, and applicable JSON-LD. Library data describes the
actual institution and links its official website without implying affiliation.
Escape both HTML and JSON-LD safely; verify JSON-LD with the deployed CSP.

Generate `robots.txt` and a sitemap from the published, indexable page registry.
Only include canonical 200 pages. Use meaningful content-change dates for
`lastmod`; omit it where unknown. Do not treat routine probes as page updates.
App/selection/API responses receive `X-Robots-Tag: noindex`; HTML app pages also
receive robots metadata. Allow crawling of noindex HTML so crawlers can read it.
Block API crawling separately; never list app, API, or selection URLs in sitemaps.

Replace the global SPA fallback with rewrites only for `/app/*` and `/select/*`.
Serve public HTML and SEO assets directly. Unknown public paths return HTTP 404.
Move app paths to `/app/shelf`, `/app/search`, `/app/libraries`, `/app/settings`,
and `/app/books/:bookKey`; update all internal navigation and share builders.
Old `/scan`, `/shelf`, `/books/*`, and `/settings` require no compatibility layer.
Make `www` redirect permanently to the apex domain and retain HTTPS and strict CSP.
Update build-ignore rules so publication data, templates, tooling, and directory
changes rebuild the web service.

Deep links use `/select/<slug>?next=/app/search&q=...`. Keep library-replacement
confirmation, focus search after selection, and run a supplied query once.
Accept only validated same-origin app destinations; reject external, protocol-
relative, and malformed return paths. Preserve new-route book-return context.
Do not change existing catalog API contracts to implement SEO publication.

## 4. App UI and public copy

Implement the complete UI review, with these clarified behaviors:

- Search scope buttons stay side by side, with a shortened visual library name
  and full accessible label. Remove focus outlines only from programmatically
  focused result headings; keep keyboard focus visible on controls.
- Libraries starts with search and Near me, then the selected library, country
  browsing/counts, and paste-link entry. Remove hard-coded city chips and duplicate
  headings. Retain keyboard navigation, URL-selected details, and error recovery.
- Library detail shows capabilities, “Your library · Change” for the current
  selection, and named choose/replacement actions for alternatives. Show five
  classified branch names, then the remaining count; summarize lockers/mobile
  services separately without misclassifying unknown locations as branches.
- Show “About this library” only when that library has a published SEO page.
  Other libraries remain fully usable in the app without a broken public link.
- Near me uses a clear pressed state, nearest-branch ordering, local units, and
  city grouping where exact points are absent. Radius labels and request values
  must represent the same distance; preserve API kilometres internally.
- Shelf lists omit redundant “Saved.” Display stored availability only for the
  selected library and with “Last checked” context. Book opening performs a fresh
  check; failed refreshes must not present an old result as current.
- Loading covers are tinted placeholders with `aria-busy`, missing covers use
  typesetting, and small thumbnails contain no status text. Reserve geometry.
- Align “Check the edition” with other availability states, keep sort controls
  compact, and use the designed library-search/Near me card when no library is set.
- Only verified work-level dates use “First published”; uncertain edition dates
  may use “c.” without claiming they represent the first publication.
- Add route-specific titles, app-shell metadata/noindex/noscript links, and About,
  source, and licence information in Settings. Retain reduced-motion support.

About identifies Deepak Ravikumar, Product Manager, with
`deepakdhanavel@gmail.com` and `https://www.linkedin.com/in/deepakdhanavel/`.
Do not invent a personal origin story. Public privacy text must match the existing
policy's distinction between local storage and hosting/network logs. Preserve
native-app policy/support content for archived applications. Add no analytics in
this release; Search Console and Bing provide the initial SEO monitoring.

The small external homepage script reads existing validated local state without
writing it. Redirect only when a saved shelf or selected library exists. Missing,
corrupt, or blocked storage leaves the landing page readable. Do not redirect
About, directory, or individual library pages. JavaScript-disabled visitors and
crawlers receive complete public HTML.

## 5. Validation, release, and completion criteria

Implement on a branch based on current main. Sequence: publication manifest and
UI fixes; static pages plus coordinated app routes; clean public export; preview
verification; production release. Keep deployment attached to the current source
until the public repository builds and its preview passes. Then link the existing
Vercel `mybookshelf` project to the public repository's main branch, retaining the
domain and server-side secrets. Record the previous production deployment for
rollback. Do not create a second competing production site.

Required verification:

- Unit checks for publication allowlisting, stable slugs, escaping, no invented
  fields, valid source/capability rendering, and sitemap/indexability agreement.
- Built-site crawl: all links resolve, exactly nine library SEO pages exist,
  unpublished library URLs are 404, app routes are noindex, SEO files have correct
  content types, and every sitemap URL is canonical, indexable, and HTTP 200.
- Browser journeys: landing to library selection to search/book to saved shelf;
  different-library confirmation, safe return paths, direct new-route visits,
  return-visitor redirect, blocked/corrupt storage, and no-JavaScript public pages.
- Confirm representative unpublished libraries remain searchable and selectable
  in the app and resolvable through existing APIs.
- Desktop/mobile UI checks in all three reading lights, keyboard navigation,
  reduced motion, 320-pixel width, 200% zoom, and automated accessibility checks.
- Regression coverage for failed catalog checks, cached availability context,
  work versus edition dates, approximate distances, and Calil pending responses.
- Run client type checking and tests, server tests, production build, deployment
  tests, directory checks, and Chromium/mobile Chromium/WebKit journeys.
- Verify the clean public export installs, builds, and tests independently; check
  licences/notices and secret-scan results before publishing.
- Target Lighthouse 95+ for performance, accessibility, best practices, and SEO
  on landing, directory, and representative library pages; inspect failures and
  fix material issues before release rather than treating a score as index proof.

After deployment, verify release SHA, domain, headers/statuses, public HTML, and
live API journeys. Verify Google Search Console and Bing ownership and submit the
sitemap using existing access where available; if external account/DNS access is
missing, document the exact outstanding verification action. No indexing-date or
ranking guarantee. Defer IndexNow, analytics, additional pages, and per-library
share images until the nine-page launch is verified.
