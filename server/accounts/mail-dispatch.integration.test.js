import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createApplication } from "../application.js";
import { createAccountMiddleware } from "./middleware.js";
import { createAccountService } from "./service.js";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createMailDispatcher } from "../jobs/mail-dispatch.js";
import { runMailBatch } from "../jobs/mail.js";
import { readAccountConfig } from "./config.js";

const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "account mail is sent by the worker role right after the response; failures and missing settings leave it queued for the job",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 30_000,
  },
  async (t) => {
    const url = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_test"),
    );
    const admin = new Pool({ connectionString });
    const emails = [],
      closers = [];
    t.after(async () => {
      for (const close of closers) await close();
      const ids = (
        await admin.query('SELECT id FROM "user" WHERE email=ANY($1::text[])', [emails])
      ).rows.map((r) => r.id);
      await admin.query('DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])', [ids]);
      await admin.query('DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])', [ids]);
      await admin.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [ids]);
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    const base = {
      NODE_ENV: "test",
      ACCOUNTS_ENABLED: "true",
      ACCOUNTS_ENVIRONMENT: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-only-secret-longer-than-32-characters" + randomUUID(),
      ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(connectionString, "auth"),
      ACCOUNTS_JOB_SECRET: "test-only-jobs-secret-longer-than-32-characters",
      RESEND_API_KEY: "test-transport-only",
      ACCOUNTS_MAIL_FROM: "accounts@example.test",
    };
    async function start(env, transport) {
      let service;
      const deferred = [];
      const mail = createMailDispatcher({
        transport,
        defer: (task) => deferred.push(Promise.resolve().then(task)),
      });
      const app = createApplication({
        accounts: createAccountMiddleware({
          env,
          mail,
          initialize: async (config) => {
            service = await createAccountService(config);
            return service;
          },
        }),
      });
      const server = await new Promise((resolve) => {
        const s = app.listen(0, "127.0.0.1", () => resolve(s));
      });
      closers.push(async () => {
        await new Promise((resolve) => server.close(resolve));
        await mail.close();
        await service?.close();
      });
      const signup = async () => {
        const email = randomUUID() + "@example.test";
        emails.push(email);
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/account/sign-up`, {
          method: "POST",
          headers: { Origin: env.BETTER_AUTH_URL, "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Synthetic reader", email, password: "a long synthetic password " + randomUUID() }),
        });
        assert.equal(response.status, 202);
        return email;
      };
      return { signup, settle: async () => { while (deferred.length) await deferred.shift(); } };
    }
    const job = async (email) =>
      (
        await admin.query(
          'SELECT j.* FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId" WHERE u.email=$1',
          [email],
        )
      ).rows;
    const worker = { ...base, ACCOUNTS_WORKER_DATABASE_URL: testRoleURL(connectionString, "worker") };

    // Sent once, by the worker, with the same idempotency key the job uses.
    const sent = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const one = await start(worker, async (claimed, rendered) => {
      await gate;
      sent.push([claimed.id, rendered.to]);
    });
    const email = await one.signup();
    // While the immediate send holds its lease, the scheduled job cannot take it.
    for (let i = 0; i < 100 && (await job(email))[0]?.status !== "running"; i++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal((await job(email))[0].status, "running");
    const workerPool = new Pool({ connectionString: worker.ACCOUNTS_WORKER_DATABASE_URL });
    closers.push(() => workerPool.end());
    const config = readAccountConfig(worker);
    let jobSends = 0;
    await runMailBatch(workerPool, config, { transport: async () => { jobSends++; } });
    release();
    await one.settle();
    assert.equal(jobSends, 0);
    const [row] = await job(email);
    assert.deepEqual(sent, [[row.id, email]]);
    assert.equal(row.status, "sent");
    assert.equal(row.payload, "");
    assert.equal(row.attempts, 1);

    // A failed immediate send leaves the mail queued for the scheduled job.
    const failing = await start(worker, async () => { throw Error("provider unavailable"); });
    const failed = await failing.signup();
    await failing.settle();
    const [queued] = await job(failed);
    assert.equal(queued.status, "queued");
    assert.equal(queued.lastError, "delivery_failed");
    assert.ok(queued.payload.length > 0);
    await admin.query('UPDATE account_mail_jobs SET "availableAt"=now() WHERE id=$1', [queued.id]);
    let retried = 0;
    await runMailBatch(workerPool, config, { transport: async () => { retried++; }, jobId: queued.id });
    assert.equal(retried, 1);

    // Without worker settings, mail waits for the scheduled job as before.
    let called = 0;
    const plain = await start(base, async () => { called++; });
    const waiting = await plain.signup();
    await plain.settle();
    assert.equal(called, 0);
    const [untouched] = await job(waiting);
    assert.equal(untouched.status, "queued");
    assert.equal(untouched.attempts, 0);

    // A privileged worker connection is never used to send.
    const owner = await start({ ...base, ACCOUNTS_WORKER_DATABASE_URL: connectionString }, async () => { called++; });
    const refused = await owner.signup();
    await owner.settle();
    assert.equal(called, 0);
    assert.equal((await job(refused))[0].attempts, 0);
  },
);
