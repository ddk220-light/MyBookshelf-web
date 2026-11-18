# Brief for implementation workers (production-ready release)

You are implementing one part of an agreed plan in the MyBookshelf web repo
(React/Vite client in `client/`, Express API in `server/`, Node 22, npm
workspaces). You work in your own git worktree, on a branch made for you from
`claude/production-ready`. Other workers change other parts at the same time;
stay inside your scope so the branches merge cleanly.

## Read first (in your worktree)

1. `CLAUDE.md` and `AGENTS.md` (project rules; they override everything here).
2. `docs/plans/2026-11-production-ready-design.md`: the plan. Your scope names
   its sections. Sections 1 and 7 hold the owner's decisions.
3. `docs/research/2026-11-production-ready/root-causes/*.md`: file and line
   references for every cause (checks.md, ui.md, accounts.md, pages.md).
4. `docs/design/2026-11-production-ready/*.dc.html` and its README: the
   approved screens. Match their wording exactly where they show text. The
   boards are HTML mock-ups with inline styles; use them for layout, words and
   hierarchy, and build with the app's existing components and CSS, not by
   copying inline styles.
5. `docs/research/2026-11-production-ready/README.md` (the end-to-end run) for
   context, as needed.

## Rules (non-negotiable)

- Library answers are found / not found / couldn't check only. A failed or
  unconfirmed check is never shown as "not in your library". Never merge
  editions for identity or availability; a mark belongs to one work.
- Search text: only in the anonymous operational log. Never in URLs, browser
  storage, platform logs or analytics. No log linked to an account.
- No new timers, polling, cron entries or scheduled jobs. Work triggered by a
  reader's action is fine.
- Be gentle with library catalogs: keep existing request caps and spacing.
- Respect reduced motion and catalog access restrictions (link-only libraries).
- Never print, log or commit secrets, passwords, connection strings or email
  addresses. Do not read `.env*` files' values into output.
- Do not change `CLAUDE.md`. If your change makes a CLAUDE.md sentence untrue,
  write the proposed new wording in your final report instead.
- Do not touch Vercel, Neon, production, staging, or any network service
  except the local test database and npm. Do not push. Do not open PRs.
- Do not make live requests to library catalogs or to mybookshelf.cloud.
- The shelf will be renamed "My reading shelf" everywhere by a later worker.
  Do NOT do that rename in your scope unless your scope says so; keep existing
  strings, so the rename can be done once, consistently.
- Keep the existing code style. Tests sit beside the code they test.
  Update or add tests for every behaviour you change. Never skip, disable or
  weaken a test to get green.

## Tests you must run before finishing (from the worktree root)

- `npm run typecheck:client`
- `npm run test:client`
- Server: `cd server && CATALOG_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/<W>_catalog_test ACCOUNT_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/<W>_accounts_test npm test`
  where `<W>` is your worker id (given in your prompt). A local Postgres 16 is
  already running on port 55432 with trust auth; use only your own two
  databases. Expect 0 failures and 0 skipped.
- If you touched tools/ or public pages: `node --test tools/**/*.test.mjs tools/*/*.test.mjs` and `npm run test:seo`, and `npm run build`.
- Browser journeys for what you touched: `cd client && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test <specs> --project=chromium --project=mobile-chromium --trace off`.
  Run the specs that cover your area, plus any spec that fails because of your
  change. (WebKit is not installed for you; skip `--project=webkit`.)
  Do not run `playwright install`.

If `node_modules` is missing in your worktree, run `npm ci` once at its root.

## Finishing

- Commit your work on your worktree branch in logical commits. End every
  commit message with exactly these two lines:
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_0171HtSqotALDukKqefeae9R
- Do not include any AI model name in code, comments or docs.
- Final report (under 600 words): your branch name; what you built, by plan
  package; tests run with pass/fail counts; anything not done and why;
  API or data-shape changes other workers must know (exact field names);
  proposed CLAUDE.md wording, if any; risks.
