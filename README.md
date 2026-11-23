# MyBookshelf

Find a book, check a supported library catalog, and save your next read.

[Use MyBookshelf](https://mybookshelf.cloud) · [Featured libraries](https://mybookshelf.cloud/libraries) · [Privacy](https://mybookshelf.cloud/privacy)

The web app requires no account. A guest shelf and preferences stay in your browser.
The full library directory is available inside the app; reviewed public library
guides and Indian library shelf pages form the public site. A failed catalog
lookup means unknown, not that a library lacks a book. Membership and borrowing
rules belong to libraries.

This repository is a public copy of the MyBookshelf web source, published from
the maintainers' working repository. Issues and pull requests are welcome here;
accepted changes are applied upstream and arrive in the next sync.

## Run locally

Use Node 22 and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:5173/ (the reading shelf). For the complete built public site:

```sh
npm run build
npm start
```

Open http://localhost:3000. Public pages work without JavaScript. Interactive
book search uses `/api/v2` and the React app.

No keys are needed to run or test the app. Optional server environment
variables: `GOOGLE_BOOKS_API_KEY`, `CALIL_APP_KEY`. Keep these in a local `.env`
or hosting configuration, never in `VITE_` variables. See
[.env.example](.env.example) for every setting; accounts and the catalog store
stay off until configured.

The app is one screen: your shelf, with search, scan, the library pop-up and
the side panel as overlays. Old `/app/search`, `/app/libraries` and
`/app/settings` links redirect to it. Free-to-read search and library-catalog
search are hidden; free reading returns with `VITE_CONTENT_DISCOVERY_ENABLED=true`
plus its server settings.

## Verify

```sh
npm run typecheck:client
npm run test:client
npm test --workspace=server
npm run build
npm run test:seo
node --test tools/deployment/*.test.mjs
node tools/deployment/client-bundle-env.mjs   # after a build: no Vercel/build-host variables in client/dist
node --test tools/catalog-hardening/*.test.mjs
node --test tools/accounts/*.test.mjs
node --test tools/content/*.test.mjs
python3 -m unittest discover -s tools/content
npx playwright install chromium webkit
npm run test:e2e --workspace=client -- --project=chromium --project=mobile-chromium --project=webkit
# Hidden free reading and analytics have their own builds:
VITE_CONTENT_DISCOVERY_ENABLED=true FREE_CONTENT_E2E=true npm run test:e2e --workspace=client -- --project=chromium
VITE_ANALYTICS_ENABLED=true ANALYTICS_E2E=true npm run test:e2e --workspace=client -- analytics.spec.js --project=chromium
```

Database suites (accounts and the catalog store) are skipped unless you point
`ACCOUNT_TEST_DATABASE_URL` / `CATALOG_TEST_DATABASE_URL` at a disposable
Postgres whose database name ends in `_test`; `tools/accounts/README.md` shows a
local one with Docker. `.github/workflows/web.yml` runs everything, databases
included. Stop any server on port 4173 between browser runs: Playwright reuses a
running preview, which would test the previous build.

## Repository layout

| Path | What it is |
| --- | --- |
| `client/` | React/Vite app, Vitest unit tests (`src/**/*.test.*`), Playwright journeys (`e2e/`) |
| `server/` | Express anonymous API (`public-v2/`), catalog providers (`services/providers/`), catalog lookup, optional accounts and catalog store; tests beside the code, captured catalog pages in `test/fixtures/` |
| `server/data/` | Runtime library directory and catalog snapshots (versioned build inputs) |
| `shared/` | Data and code used by both the app and the static page generator |
| `data/` | Reviewed directory corrections, place data and their licence |
| `docs/policy/` | Privacy, terms and about texts, rendered into the app and public pages |
| `tools/seo/` | Static public pages (`build-pages.mjs`, run by `npm run build`) and the library shelf generator |
| `tools/catalog-hardening/` | Live catalog checks and the listed-library generator |
| `tools/deployment/` | Vercel build checks |
| `tools/accounts/` | Local account database and real-account browser harness |
| `tools/content/` | Free-content metadata importers |
| `testdata/` | Captured Calil responses |

Runtime directory snapshots in `server/data/` and the review files in `data/`
are versioned build inputs; the app and the page generator use the same public
projection. `shared/seo-libraries.json` lists the reviewed guides and
`shared/seo-shelves.json` (written by `tools/seo/library-shelves.mjs`) the Indian
library and book pages; adding a directory entry does not publish a page. Some
generators (`tools/catalog-hardening/library-status.mjs`,
`tools/directory/india-regions.mjs`, `tools/seo/library-shelves.mjs`) read
research evidence that is not part of this repository; their outputs are
committed here, so the build and tests do not need it.

## Corrections and contributions

Use a library-correction issue with the library name, corrected field and official
source URL. See CONTRIBUTING.md. Report security issues privately as described in
SECURITY.md. Do not put library card numbers, PINs or credentials in issues.

## Licence and attribution

Original code: **AGPL-3.0-only**. Commercial use is permitted; covered modified
network services must offer corresponding source to their users. See LICENSE.
Original directory contributions: **CC BY 4.0**, subject to third-party source
rights. GeoNames, Calil, fonts and other third-party material retain their own
terms and credits; see NOTICE and data/LICENSE. Fixture samples are retained only
for interoperability tests and are not relicensed as original application code.

Created by **Deepak Ravikumar**, Product Manager.
[LinkedIn](https://www.linkedin.com/in/deepakdhanavel/) · privacy@mybookshelf.cloud
