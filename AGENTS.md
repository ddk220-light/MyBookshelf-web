# Working on MyBookshelf web

This repository (`ddk220-light/MyBookshelf-web`) is the active source for all
MyBookshelf web work. Read [docs/STATUS.md](docs/STATUS.md) before continuing a
previous task, then the relevant documents linked from [docs/README.md](docs/README.md).
Keep the handoff accurate when completing substantial work.

- Edit this repository directly. No private repository, native app checkout or
  export script is required to build, test or release the web app.
- Use Node 22 and npm workspaces. README.md lists development and verification
  commands. Run checks appropriate to the files changed; release checks include
  client/server tests, type checking, build, SEO and browser journeys.
- Keep provider credentials server-side. Never commit secrets, local environment
  values, account data or browser state. `.env.example` contains names only.
- `shared/seo-libraries.json` controls public SEO publication: seven India, four
  US and one Japan guide. Indian libraries are offered when finding a
  library only if `server/data/india-catalogs-listed.json` lists them (a
  strictly verified book or an e-Granthalaya audit that found books; generated
  by `tools/catalog-hardening/library-status.mjs`; listed IDs are kept when a
  later check fails, except a `blocked` library, and never re-added once in the
  hand-kept `removed` list with id, reason and date). Unlisted IDs stay resolvable for readers who already chose one;
  libraries outside India are not affected. Indian libraries without a source
  state get one from `server/data/india-library-regions.json`
  (`tools/directory/india-regions.mjs`): published state, a single-state PIN or
  address evidence only, never a library's name.
- Preserve edition/catalog identities. Do not merge works or editions from
  similar titles for identity, ISBNs or availability (search cards may show
  same-title, same-author records together for display only; see
  docs/work-aware-search.md), infer absence from failed checks, or show
  approximate locations as precise. An exact title-and-author agreement in
  the chosen library's own catalog counts as found, like an ISBN (owner
  decision, 19 November 2026); similar titles never do.
- Respect catalog restrictions, keyboard access and reduced motion. Compare UI
  work against the one-shelf boards (docs/design/2026-11-one-shelf/) and the
  owner decisions in the plan (docs/plans/2026-11-12-one-shelf-redesign-implementation-plan.md).
  Mobile in Daylight is designed; desktop, Lamplight and Ink are backlog and
  must stay usable and legible until then.
- Privacy: search text may be stored only in the anonymous operational log
  (server/catalog-store/usageLog.js; no account ID, IP or device identifier;
  12 months, then totals). Never put it in URLs, browser storage, platform
  logs or analytics. Accounts hold only the reader's own data; no log or
  analytics is linked to an account. Location is used once, never stored.
- Account PRD/UX/engineering/UI and Claude canvas version 4 are approved at R02.
  Expand concrete tasks for each story as it is reached, then implement and test.
  Preserve the reviewed contracts; R03 still gates production release. Social
  expansion still needs separately reviewed requirements and definitions.
- Production and preview are distinct. Check current deployment configuration
  before releasing; the handoff records the last verified state.
