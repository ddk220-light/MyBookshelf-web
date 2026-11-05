import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import request from "supertest";
import { createApplication } from "../application.js";
import { createJobMiddleware } from "../jobs/middleware.js";
import { createAccountHealthMiddleware } from "../jobs/health.js";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";

const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "partial maintenance cannot report a successful production cleanup run",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 30000,
  },
  async (t) => {
    const base = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(base.hostname) &&
        base.pathname.endsWith("_test"),
    );
    const database =
      "maintenance_" + randomUUID().replaceAll("-", "") + "_test";
    const admin = new Pool({ connectionString });
    await admin.query('CREATE DATABASE "' + database + '"');
    const target = new URL(base);
    target.pathname = "/" + database;
    const isolated = new Pool({ connectionString: target.href });
    const middlewares = [];
    const owned = (middleware) => {
      middlewares.push(middleware);
      return middleware;
    };
    t.after(async () => {
      for (const middleware of middlewares) await middleware.close();
      await isolated.end();
      await admin.query('DROP DATABASE "' + database + '"');
      await admin.end();
    });
    await migrate(isolated);
    await prepareTestRoles(isolated);
    const secret = "synthetic-maintenance-secret-" + randomUUID();
    const env = {
      NODE_ENV: "test",
      ACCOUNTS_ENABLED: "false",
      ACCOUNTS_ENVIRONMENT: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: secret,
      ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(target.href, "auth"),
      ACCOUNTS_WORKER_DATABASE_URL: testRoleURL(target.href, "worker"),
      ACCOUNTS_JOB_SECRET: secret,
      CRON_SECRET: secret,
    };
    const monitoredEnv = {
      ...env,
      ACCOUNTS_READING_DATABASE_URL: "synthetic-configured",
      RESEND_API_KEY: "synthetic-configured",
      ACCOUNTS_MAIL_FROM: "accounts@example.test",
      ACCOUNTS_DELETION_LEDGER_READ_WRITE_TOKEN: "synthetic-configured",
    };
    const monitored = createApplication({
      accountHealth: owned(createAccountHealthMiddleware({ env: monitoredEnv })),
    });
    const healthPath = "/api/account/health";
    assert.equal(
      (await request(monitored).get(healthPath)).status,
      503,
      "absent successful run is unavailable",
    );
    await isolated.query(
      "INSERT INTO account_job_health(name,last_started,last_succeeded) VALUES('account-maintenance',now(),now()-interval '16 minutes')",
    );
    assert.equal(
      (await request(monitored).get(healthPath)).status,
      503,
      "stale worker is unavailable",
    );
    await isolated.query("UPDATE account_job_health SET last_succeeded=now()");
    const ready = await request(monitored).get(healthPath);
    assert.equal(ready.status, 200);
    assert.deepEqual(ready.body, { status: "ready" });
    assert.equal(ready.headers["cache-control"], "private, no-store");
    assert.equal(ready.headers["x-robots-tag"], "noindex");
    assert.equal((await request(monitored).post(healthPath)).status, 405);
    const privileged = createApplication({
      accountHealth: owned(createAccountHealthMiddleware({
        env: { ...monitoredEnv, ACCOUNTS_WORKER_DATABASE_URL: target.href },
      })),
    });
    assert.equal(
      (await request(privileged).get(healthPath)).status,
      503,
      "administrator must not be used by monitor",
    );
    const missing = createApplication({
      accountHealth: owned(createAccountHealthMiddleware({ env })),
    });
    assert.equal(
      (await request(missing).get(healthPath)).status,
      503,
      "missing mail is unavailable even with a recent success",
    );
    await isolated.query("DELETE FROM account_job_health");
    const app = createApplication({ jobs: owned(createJobMiddleware({ env })) });
    const path = "/api/internal/account-jobs";
    assert.equal((await request(app).get(path)).status, 403);
    assert.equal(
      (await isolated.query("SELECT count(*) FROM account_job_health")).rows[0]
        .count,
      "0",
    );
    const run = await request(app)
      .get(path)
      .set("Authorization", "Bearer " + secret);
    assert.equal(run.status, 503);
    assert.equal(run.body.mail.unavailable, true);
    assert.equal(run.body.deletion.unavailable, true);
    assert.equal(run.headers["cache-control"], "private, no-store");
    const health = (
      await isolated.query(
        "SELECT last_started,last_succeeded FROM account_job_health WHERE name='account-maintenance'",
      )
    ).rows[0];
    assert.ok(health.last_started);
    assert.equal(health.last_succeeded, null);
    assert.equal((await request(app).get("/api/health")).status, 200);
  },
);
