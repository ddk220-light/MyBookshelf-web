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
- `shared/seo-libraries.json` controls public SEO publication: four India, four
  US and one Japan guide. The full directory remains available inside the app.
- Preserve edition/catalog identities. Do not merge works from similar titles,
  infer absence from failed checks, or show approximate locations as precise.
- Respect catalog restrictions, keyboard access and reduced motion. Compare UI
  work against the reference boards and the approved decisions, on desktop and
  mobile in all three reading lights.
- Account architecture is planning material. PRD/UX/engineering/UI specifications
  and story decomposition come first. Social expansion still needs requirements
  and definitions. Do not treat proposed tables as approved migrations.
- Production and preview are distinct. Check current deployment configuration
  before releasing; the handoff records the last verified state.
