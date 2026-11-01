# Local account development

Use Node 22 and npm workspaces. Accounts default to disabled. No production
credentials are needed for the existing anonymous catalog or local test suite.

Start disposable Postgres with:

```sh
docker compose -f tools/accounts/compose.yaml up -d --wait
```

Set `ACCOUNT_TEST_DATABASE_URL` to the local test connection from the compose
file, then run `npm run test:accounts --workspace=server` or the complete server
suite. Tests require a local database whose name ends in `_test`; they create
synthetic users, test-only roles, migration records and failure-injection triggers.
Use a dedicated disposable DB administrator, never production data. The default
suite reports these integration tests as skipped if the opt-in URL is absent;
CI supplies it and runs real Postgres. A skipped DB suite is not validation.

For runtime configuration, copy names from `.env.example`, generate a strong
random auth secret privately and configure exact origins. Run migrations only
with `ACCOUNTS_MIGRATION_DATABASE_URL` via `npm run accounts:migrate --workspace=server`.
Create distinct non-owner, non-superuser, non-BYPASSRLS LOGIN roles named
`mybookshelf_auth` and `mybookshelf_reading` privately, then apply
`server/db/runtime-grants.sql` with the migration administrator. Configure their
separate URLs for runtime; never put the administrator credential in a deployed
application environment. Keep TLS verification enabled for hosted databases.

`accounts:generate-schema` requires an empty disposable database and overwrites
only the version-generated 001 auth migration. Do not regenerate an already
applied migration; new schema changes need additive migrations. No request runs
schema changes. The owner transaction helper sets context transaction-locally;
callers must obtain the owner from the verified server session.

See `docs/accounts/IMPLEMENTATION.md` for actual evidence and remaining gates.

## Real local account browser journeys

Use a disposable loopback database whose name ends in `_test`. Build the client,
then start `tools/accounts/e2e-server.mjs` with `ACCOUNT_E2E=true` and
`ACCOUNT_TEST_DATABASE_URL` set to that database. It binds only `127.0.0.1:4300`,
uses actual auth/reading roles and refuses production/non-local databases. It is
not imported by the deployed application. Its synthetic outbox reader is a mail
transport double; this does not prove real provider delivery or Google/Apple.

Run the `accounts-real.spec.js` Playwright file with `ACCOUNT_E2E=true` and
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:4300`. The standard test configuration skips
this file unless that opt-in is present. Desktop/mobile Chromium scenarios cover
all reading lights, verification, profile, explicit import/copy cleanup,
remote refresh/revocation and email changes. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when using a system Chromium.

Start a fresh harness process for each complete run. It creates ephemeral test
signing/limiter secrets. Repeated runs against one long-lived harness deliberately
hit the real shared IP limiter; do not disable or weaken production limits to
make repeated fixtures pass. Synthetic fixture users are cleaned up by each test.
