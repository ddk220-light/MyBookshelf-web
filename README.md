# MyBookshelf

Find a book, check a supported library catalog, and save your next read.

[Use MyBookshelf](https://mybookshelf.cloud) · [Featured libraries](https://mybookshelf.cloud/libraries) · [Privacy](https://mybookshelf.cloud/privacy)

The web app requires no account. Shelves and preferences stay in your browser.
The full library directory is available inside the app; twelve reviewed public
library guides form the SEO launch. A failed catalog lookup means unknown,
not that a library lacks a book. Membership and borrowing rules belong to libraries.

## Continue development

**This repository is the source of truth for MyBookshelf web.** Make all web
changes here directly; a private repository or export step is not required.

Start with [the handoff and next work](docs/STATUS.md), then the
[documentation index](docs/README.md). These include the account architecture,
book identity research, planned epics/stories, UI/SEO decisions, Claude reference
boards and release evidence. Accounts and social features are planned work;
they are not implemented in the running app.

## Run locally

Use Node 22 and npm:

```sh
npm ci
npm run dev
```

Open http://localhost:5173/app/shelf. For the complete built public site:

```sh
npm run build
npm start
```

Open http://localhost:3000. Public pages work without JavaScript. Interactive
book search uses `/api/v2` and the React app under `/app/`.

Optional server environment variables: `GOOGLE_BOOKS_API_KEY`, `CALIL_APP_KEY`.
Keep these in local `.env` or hosting configuration, never in `VITE_` variables.
See [.env.example](.env.example) and [credential setup](docs/development/credentials.md).

## Verify

```sh
npm run typecheck:client
npm run test:client
npm test --workspace=server
npm run build
npm run test:seo
node --test tools/deployment/*.test.mjs
npx playwright install chromium webkit
npm run test:e2e --workspace=client -- --project=chromium --project=mobile-chromium --project=webkit
```

Runtime directory snapshots in `server/data/` and the documented public review
files in `data/` are versioned build inputs. The app and SEO generator use the
same public projection. `shared/seo-libraries.json` is the publication allowlist;
adding an app directory entry does not publish a new SEO page. The broader
research corpus and native application history are not part of this repository.

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
[LinkedIn](https://www.linkedin.com/in/deepakdhanavel/) · deepakdhanavel@gmail.com
