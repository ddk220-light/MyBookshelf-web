# UI and SEO release validation

Preview: https://mybookshelf-jh0o69edr-ddk220.vercel.app/
Deployment: `dpl_4WuSysFWU4wQhHqNhEGksvU7W9FA`
Deployed public source: `02aa0d6d7673c449d1b138b38c64053b0d7bc29c`

The public repository is https://github.com/ddk220-light/MyBookshelf-web.
Its subsequent commit `83b481d` changes only cover-test setup order, with no
application changes. Final CI:
https://github.com/ddk220-light/MyBookshelf-web/actions/runs/41180235295

CI completion status: success. All required checks completed.

## Implemented scope

- Nine public library guides: four India, four US, Setagaya in Japan. Sixteen
  indexable URLs in total. Unpublished guides return a real 404; the full
  directory remains available inside the app.
- Static public pages include canonical, social and structured metadata,
  sitemap and robots files. The browser bookshelf runs under `/app/` and is
  noindex. Public content is usable without JavaScript.
- Desktop and mobile reader layouts follow Claude's reference package, with
  three reading lights, readable fallbacks and conservative availability copy.
  See `SCREEN_REVIEW.md` for the screen comparison and accuracy limits.
- The clean web export contains 433 allowlisted files without private Git
  history or retired account/native code. Code is AGPL-3.0-only. Original-data
  and third-party notices are retained. Gitleaks found no secrets in the export.

## Verification

- TypeScript and the client unit tests passed. The fresh public-repository
  handoff run confirms 120 tests across 23 files, correcting the earlier 121 count.
- The public server suite contains 484 tests and passed in CI.
- All four SEO generator/output checks passed, including publication scope,
  escaping, canonical/sitemap agreement and local-link integrity.
- The complete browser suite contains 318 scenarios across Chromium, mobile
  Chromium and WebKit. Focused verification of the final fixes passed 70
  mobile Chromium/WebKit scenarios and nine cover/enrichment scenarios.
- `layout-checks.json` records 168 captures at 320, 390, 1024, 1280, 1366, 1440
  and 1920px: five app screens in three themes and nine public screens. No
  horizontal overflow was found.
- `deployed-checks.json` records 21 successful checks: all 16 indexable URLs,
  the excluded Toronto guide's 404, API health, sitemap, robots and app noindex.
  Public source links point to the exact deployed commit.
- Real deployed search returned five book cards. Opening a book, saving it
  and reloading the shelf retained the saved book. About, a library guide and
  Settings were rendered at 1440px and 390px without overflow.
- The landing page scored 100 for Lighthouse accessibility and SEO. External
  cover requests encounter this environment's proxy certificate, so local
  performance/best-practices scores are not production measurements.

Visual fixtures intentionally use missing covers and sample availability;
they do not establish live catalog health. The deployed browser check used
actual HTML, assets and API responses through Node's existing verified HTTP
transport. No permanent browser trust setting was changed. CI allows one retry
for transient WebKit engine navigation errors; repeatable assertions still fail.

The loaded-cover fixture is installed before initial example cards request the
same URL. This avoids WebKit retaining a decoded one-pixel missing-cover image
when a test later installs a loaded-cover response. Cover-specific tests remain
independent of third-party image hosts.

## Launch state

Production is unchanged: the Vercel project still connects to the original
`MyBookshelf` repository and deployment `dpl_G6GaQUUqD7q6w7s8BcmX5n3EyHBd`,
confirmed through the project API. Production release remains a separate step.

Earlier live checks for all nine libraries returned HTTP 200. Anna Centenary
returned a timeout and Visakhapatnam an unknown lending state; public pages do
not promise a successful live check. The real public-book search also reported
partial provider results with a retry option. See `live-checks.json` for the
catalog observations and recheck connections before release.

Search Console/Bing ownership verification and sitemap submission remain
external launch steps. Branch protection, private vulnerability reporting and
vulnerability-alert administration require owner access: the integration
returned 403, and those repository settings were not changed.
