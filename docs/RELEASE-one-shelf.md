# Releasing the one-shelf app

The checklist for plan section 8.6, as it stands after phases 0–13 (13 November
2026). Follow it top to bottom. Each step says what to check before going on.
Setting values are never written here; only names. Mark sensitive values
"Sensitive" in Vercel.

The flag `VITE_ONE_SHELF` is gone: whatever is deployed to Production is the new
app. Everything else that changes what readers see or what is stored has its
own setting, listed below.

## Before you start (needs the owner)

- [ ] **Legal review.** Have `docs/policy/privacy.md`, `terms.md` and `about.md`
      reviewed (plan 10.3), or write in `docs/STATUS.md` that you defer it, with
      the date.
- [ ] **Effective date.** Choose the date the new Privacy and Terms take effect.
      It must be the release day or later. It goes into
      `VITE_POLICY_EFFECTIVE_DATE` (step 4). The policy texts have no separate
      version number; About shows the app version from the build automatically.
- [ ] **Privacy text, two gaps found in phase 13** (only you can change
      `docs/policy/`): the nightly backup runs on GitHub Actions and stores
      encrypted files in a Vercel Blob store. The processors table names Vercel
      but not GitHub; add GitHub ("runs the nightly encrypted backup; sees the
      data only while encrypting it"), and add "encrypted backups" to Vercel's row.
      And confirm the native-app section of today's privacy page should stay on
      `/privacy` (plan 9, row 14). The prepared page keeps it under "MyBookshelf
      native apps (iPhone and Android)".
- [ ] **Rollback point.** In Vercel → Deployments, note the current Production
      deployment ID in `docs/STATUS.md`.
- [ ] **Backups.** Set up the nightly accounts backup
      (`docs/accounts/OPERATIONS.md`, "Nightly backup"), run it once by hand and
      see one file listed. Keep the age private key offline.
- [ ] **Your account ID** for the admin view: sign in at mybookshelf.cloud and
      read `user.id` from `/api/account/session`. It goes into
      `ADMIN_ACCOUNT_IDS`.
- [ ] **Search Console.** Verify the domain with a DNS TXT record (preferred),
      or get the HTML-tag token for `GOOGLE_SITE_VERIFICATION`.

## 1. Catalog database (Neon project `mybookshelf-catalog`, main branch)

Production uses the catalog project's **main branch**; previews use a branch of
it. This database holds no reader data.

- [ ] Create three LOGIN roles in the Neon console (no SUPERUSER, no BYPASSRLS,
      not the owner): `catalog_runtime`, `catalog_worker`, `catalog_admin`.
- [ ] From your machine, with the owner role's direct connection string:
      `CATALOG_MIGRATION_DATABASE_URL=… npm run catalog:migrate --workspace=server`
- [ ] Apply the grants as the owner: `psql "<owner, direct>" -v ON_ERROR_STOP=1 -f server/catalog-store/runtime-grants.sql`.
      If it prints a notice about `statement_timeout`, set 1500ms for
      `catalog_runtime` and 30s for `catalog_worker` in the console.
- [ ] Check: `\dt` shows the catalog tables, and the runtime role can
      `SELECT 1 FROM holdings_answers LIMIT 1`.

## 2. Accounts database (production Neon `misty-cake-69893992`)

- [ ] With the migration administrator's direct connection string:
      `ACCOUNTS_MIGRATION_DATABASE_URL=… npm run accounts:migrate --workspace=server`
      It applies `012-viewed-before.sql` (Viewed before is on for new accounts and
      no longer expires after 30 days; additive, no rows changed).
- [ ] Apply the grants again: `psql "<admin, direct>" -v ON_ERROR_STOP=1 -f server/db/runtime-grants.sql`.
      New in this release: it sets `statement_timeout = 5s` on the
      `mybookshelf_auth`, `mybookshelf_reading` and `mybookshelf_worker` roles,
      and grants read access to `mybookshelf_backup` if you created it. On a
      direct connection nothing changes (the app still sends its own 5 s / 3 s
      limit at connect). The role setting is what applies if you ever switch
      the account connection strings to Neon's `-pooler` endpoint, which the app
      now supports (it no longer sends `statement_timeout` to a `-pooler` host).
- [ ] Check: the migration command reports 12 migrations;
      `GET /api/account/health` still answers `ready`.

## 3. Vercel → Project → Settings → Environment Variables (Production)

Add or change, then redeploy in step 4. Server settings unless marked "build".

| Name | Value | Notes |
|---|---|---|
| `CATALOG_STORE_ENABLED` | `true` | New. |
| `CATALOG_DATABASE_URL` | `catalog_runtime`, **pooled** (`-pooler`) string, main branch | New. Sensitive. |
| `CATALOG_WORKER_DATABASE_URL` | `catalog_worker` string, main branch | New. Sensitive. Daily maintenance job. |
| `CATALOG_ADMIN_DATABASE_URL` | `catalog_admin` string, main branch | New. Sensitive. Admin view only. |
| `CATALOG_BUCKET_SECRET` | 32+ random characters | New. Sensitive. Limits for library requests and problem reports. |
| `CRON_SECRET` | existing | Check it exists (the account jobs use it); the catalog's daily job uses it too. |
| `HOLDINGS_BACKGROUND_ENABLED` | `false` | New. **Must be set explicitly**: unset means on. Turn on after 48 h (step 6). |
| `USAGE_LOG_ENABLED` | `false` now; `true` with the publication (step 4) | Never `true` before `VITE_POLICY_EFFECTIVE_DATE` is set. |
| `VITE_ANALYTICS_ENABLED` (build) | `false` now; `true` with the publication | Also turn on Web Analytics for the project (Vercel → Analytics). |
| `VITE_POLICY_EFFECTIVE_DATE` (build) | e.g. `1 December 2026` | **The publication switch** (step 4). |
| `ADMIN_ACCOUNT_IDS` | your account ID | New. |
| `GOOGLE_SITE_VERIFICATION` (build) | token, only if not using DNS | Optional. |
| `VITE_ONE_SHELF` | delete | Ignored since phase 12. |

Unchanged: the account settings (`ACCOUNTS_*`, `BETTER_AUTH_*`, `RESEND_API_KEY`),
`GOOGLE_BOOKS_API_KEY`, `CALIL_APP_KEY`, `CATALOG_LOOKUP_V2` (it affects only the
old `/availability` route). `CATALOG_MIGRATION_DATABASE_URL` and the accounts
migration administrator are **never** set in Vercel.

## 4. Deploy and publish (one deploy)

The in-app Privacy, Terms and About pages already carry the new texts, so the
new app and the new public `/privacy` go live together.

**The publication switch is `VITE_POLICY_EFFECTIVE_DATE`.** When a build has
it: the public `/privacy` is built from `docs/policy/privacy.md` with the date
filled in (the native-app section kept below it), `/terms` is published and
added to the sitemap, and the app's Privacy and Terms show the same date.
Without it, `/privacy` stays today's `client/public-app/privacy.html` and the
app's pages show `[EFFECTIVE DATE]`.

- [ ] Set `VITE_POLICY_EFFECTIVE_DATE`, `USAGE_LOG_ENABLED=true` and
      `VITE_ANALYTICS_ENABLED=true` (or keep the last two `false` for a first
      day and turn them on later with a redeploy; never before the date).
- [ ] Merge the branch to `main` (one push; Vercel builds Production).
- [ ] Check after the deploy:
  - `/app/shelf` shows the one-shelf app; `/app/search`, `/app/libraries`,
    `/app/settings` redirect to it.
  - `/privacy` says "Effective <date>"; `/terms` loads; `/sitemap.xml` has 20 URLs.
  - In the app: side panel → Privacy shows the same date.
  - Open a book, choose a library: the card answers; opening it again answers
    at once (from the store).
  - `/app/admin` opens for your account only and shows Summary and Library
    health, not "Catalog store not configured" or "Wrong database role".
  - `GET /api/account/health` is `ready`; the production health workflow stays green.
  - The next day: Vercel Cron ran `/api/internal/catalog-maintenance` (200).
  - With analytics on: page visits appear in Vercel Analytics; no cookies set.

## 5. Watch for 48 hours

- [ ] Vercel runtime errors and function duration; Neon compute hours for the
      catalog project (it is on the Free plan; it suspends if the quota runs out,
      and the app then checks live, failing open).
- [ ] Admin view: library health flags (3 failures on 2 days).

## 6. After 48 hours: background badges

- [ ] Set `HOLDINGS_BACKGROUND_ENABLED=true` and redeploy. Check that search
      results get library badges and that function duration stays reasonable.
      To stop it again, set `false` and redeploy (kill switch).

## Rolling back

Use Vercel Instant Rollback to the deployment noted before step 1. It brings
back the old app at once. It does **not** undo data changes:

- Catalog database: stored answers, health records, requests, reports and log
  rows stay (no reader data). The old app ignores them.
- Accounts database: migration 012 stays. New accounts start with history on,
  and Viewed before no longer expires after 30 days, while the old privacy page
  says 30 days. If the rollback lasts, ask an agent for a forward fix rather
  than editing the database by hand.
- Readers' browsers: the shelf storage migration is backward compatible
  (plan 3.4); the old app reads it.
- The public `/privacy` returns to the old page with the rollback. If the new
  text was published, say so in `docs/STATUS.md` and restore it with a
  roll-forward.

For one feature only: `HOLDINGS_BACKGROUND_ENABLED=false`, `USAGE_LOG_ENABLED=false`
(stops writing the log) or `VITE_ANALYTICS_ENABLED=false` (needs a redeploy).

## After the release

- [ ] Same day: record the release (deployment ID, date, settings changed) in
      `docs/STATUS.md`; resubmit the sitemap in Search Console.
- [ ] Within a week: run a restore drill from a real nightly backup into an
      isolated database (`docs/accounts/OPERATIONS.md`), and record it.
- [ ] If the legal review was deferred: complete it and publish any changes
      with a new effective date.
- [ ] 30 days after release: remove `/availability` (server route, its client
      types and tests). Keep `client/public-app/privacy.html`: the published page
      takes its native-app section from it.
- [ ] When the pilot brings real accounts: move the accounts database to the
      paid plan (owner decision) and record the history window.

## Not checked by the agent before release

- WebKit (Safari) and Firefox browser journeys: only Chromium was available in
  the build environment. CI runs WebKit; check it passes on the merge.
- The nightly backup on GitHub against production (only a local dry run).
- A real Android phone and an iPhone against the boards (plan 8.6, step 2).
