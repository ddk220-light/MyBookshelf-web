// Loopback-only browser harness. Never imported by either deployment entry point.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createApplication } from "../../server/application.js";
import { createAccountMiddleware } from "../../server/accounts/middleware.js";
import { createAccountService } from "../../server/accounts/service.js";
import { migrate } from "../../server/db/migrate.js";
import {
  prepareTestRoles,
  testRoleURL,
} from "../../server/accounts/test-database.js";
import { decryptMail } from "../../server/jobs/mail.js";
const require = createRequire(
  new URL("../../server/package.json", import.meta.url),
);
const { Pool } = require("pg"),
  express = require("express");
const url = new URL(process.env.ACCOUNT_TEST_DATABASE_URL || "http://invalid");
if (
  process.env.ACCOUNT_E2E !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test") ||
  !["postgres:", "postgresql:"].includes(url.protocol)
)
  throw Error(
    "Explicit local disposable account browser test environment required.",
  );
const admin = new Pool({ connectionString: url.href });
await migrate(admin);
await prepareTestRoles(admin);
const port = Number(process.env.ACCOUNT_E2E_PORT || 4300),
  origin = "http://127.0.0.1:" + port;
const env = {
  NODE_ENV: "test",
  ACCOUNTS_ENABLED: "true",
  ACCOUNTS_ENVIRONMENT: "development",
  BETTER_AUTH_URL: origin,
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(url.href, "auth"),
  ACCOUNTS_READING_DATABASE_URL: testRoleURL(url.href, "reading"),
  ACCOUNTS_JOB_SECRET: randomBytes(48).toString("base64url"),
  RESEND_API_KEY: "synthetic-transport-only",
  ACCOUNTS_MAIL_FROM: "accounts@example.test",
};
let service;
const accounts = createAccountMiddleware({
  env,
  initialize: async (config) => {
    service = await createAccountService(config, {
      checkPassword: async () => {},
    });
    return service;
  },
});
const parser = express.json({ limit: "1kb" });
const app = createApplication({
  clientDist: fileURLToPath(new URL("../../client/dist/", import.meta.url)),
  accounts: (req, res, next) => {
    if (
      req.path !== "/__accounts_test__/mail" &&
      req.path !== "/__accounts_test__/cleanup"
    )
      return accounts(req, res, next);
    if (req.method !== "POST") return res.sendStatus(405);
    parser(req, res, async (error) => {
      if (error || !/^pw-[a-z0-9-]+@example\.test$/.test(req.body?.email || ""))
        return res.sendStatus(400);
      try {
        const email = req.body.email;
        if (req.path.endsWith("/cleanup")) {
          const ids = (
            await admin.query('SELECT id FROM "user" WHERE email=$1', [email])
          ).rows.map((r) => r.id);
          await admin.query(
            'DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])',
            [ids],
          );
          await admin.query(
            'DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])',
            [ids],
          );
          await admin.query('DELETE FROM "user" WHERE email=$1', [email]);
          return res.json({ ok: true });
        }
        const job = (
          await admin.query(
            `SELECT j.payload FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId" WHERE u.email=$1 AND j.kind='verify' AND j.status='queued' AND j."expiresAt">now() ORDER BY j."createdAt" DESC LIMIT 1`,
            [email],
          )
        ).rows[0];
        if (!job) return res.sendStatus(404);
        const { token } = decryptMail(job.payload, env.ACCOUNTS_JOB_SECRET);
        res.set("Cache-Control", "no-store").json({ token });
      } catch {
        res.sendStatus(500);
      }
    });
  },
});
const server = app.listen(port, "127.0.0.1", () =>
  console.log("Local account browser harness ready. Synthetic test data only."),
);
async function close() {
  await new Promise((resolve) => server.close(resolve));
  await service?.close();
  await admin.end();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
