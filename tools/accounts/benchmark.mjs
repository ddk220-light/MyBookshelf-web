// Synthetic local load only. Never connect this tool to a hosted database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createApplication } from "../../server/application.js";
import { createAccountMiddleware } from "../../server/accounts/middleware.js";
import { createAccountService } from "../../server/accounts/service.js";
import { migrate } from "../../server/db/migrate.js";
import { passwordBudget } from "../../server/auth/password-budget.js";
import {
  prepareTestRoles,
  testRoleURL,
} from "../../server/accounts/test-database.js";
const require = createRequire(
    new URL("../../server/package.json", import.meta.url),
  ),
  { Pool } = require("pg");
const url = new URL(process.env.ACCOUNT_TEST_DATABASE_URL || "http://invalid");
if (
  process.env.ACCOUNT_BENCHMARK !== "true" ||
  process.env.NODE_ENV === "production" ||
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw Error("Explicit disposable local benchmark database required.");
const admin = new Pool({ connectionString: url.href }),
  emails = [],
  authIds = [],
  readers = [],
  keys = [];
let server, service;
const env = {
  NODE_ENV: "test",
  ACCOUNTS_ENABLED: "true",
  ACCOUNTS_ENVIRONMENT: "development",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "synthetic-benchmark-secret-" + randomUUID(),
  ACCOUNTS_JOB_SECRET: "synthetic-benchmark-mail-secret-" + randomUUID(),
  ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(url.href, "auth"),
  ACCOUNTS_READING_DATABASE_URL: testRoleURL(url.href, "reading"),
  RESEND_API_KEY: "synthetic-only",
  ACCOUNTS_MAIL_FROM: "accounts@example.test",
};
const timings = [],
  statusCounts = {};
let peakRSS = process.memoryUsage().rss;
try {
  await migrate(admin);
  await prepareTestRoles(admin);
  const app = createApplication({
    accounts: createAccountMiddleware({
      env,
      initialize: async (config) =>
        (service = await createAccountService(config, {
          checkPassword: async () => {},
        })),
    }),
  });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const coldAt = performance.now();
  assert.equal((await fetch(base + "/api/account/session")).status, 200);
  const coldMs = performance.now() - coldAt;
  const password = "Synthetic benchmark password " + randomUUID();
  for (let index = 0; index < 20; index++) {
    const email = randomUUID() + "@example.test";
    emails.push(email);
    await service.actions.signup(
      { email, name: "Synthetic load reader", password },
      randomUUID(),
    );
    const user = (
      await admin.query(
        'UPDATE "user" SET "emailVerified"=true WHERE email=$1 RETURNING id',
        [email],
      )
    ).rows[0];
    authIds.push(user.id);
    const cookies = [];
    await service.actions.signin(
      { email, password },
      randomUUID(),
      new Headers(),
      (cookie) => cookies.push(cookie),
    );
    const cookie = cookies.map((value) => value.split(";")[0]).join("; "),
      identity = await service.identity(new Headers({ cookie }));
    readers.push({ cookie, id: identity.user.id });
  }
  const prefix = "v1:googlebooks:benchmark-" + randomUUID() + "-";
  for (let index = 0; index < 1000; index++) keys.push(prefix + index);
  await admin.query(
    "INSERT INTO book_refs(book_key,key_digest) SELECT key,decode(digest,'hex') FROM unnest($1::text[],$2::text[]) fixture(key,digest)",
    [keys, keys.map((key) => createHash("sha256").update(key).digest("hex"))],
  );
  await admin.query(
    `INSERT INTO user_books(user_id,reference_id,display_snapshot) SELECT owner,id,'{"title":"Synthetic load book","authors":["Synthetic author"]}'::jsonb FROM unnest($1::uuid[]) owner CROSS JOIN book_refs WHERE book_key=ANY($2::text[])`,
    [readers.map((reader) => reader.id), keys],
  );
  const measured = async (reader, path) => {
    const start = performance.now(),
      reply = await fetch(base + path, { headers: { Cookie: reader.cookie } }),
      body = await reply.json();
    timings.push(performance.now() - start);
    statusCounts[reply.status] = (statusCounts[reply.status] || 0) + 1;
    peakRSS = Math.max(peakRSS, process.memoryUsage().rss);
    assert.equal(reply.status, 200);
    return body;
  };
  const started = performance.now();
  await Promise.all(
    readers.map(async (reader) => {
      for (let round = 0; round < 10; round++)
        assert.equal(
          (await measured(reader, "/api/account/state")).counts.saved,
          1000,
        );
      let cursor,
        count = 0;
      do {
        const page = await measured(
          reader,
          "/api/account/books?limit=100" +
            (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
        );
        count += page.books.length;
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(count, 1000);
    }),
  );
  const elapsedMs = performance.now() - started,
    sorted = timings.sort((a, b) => a - b),
    percentile = (p) =>
      Number(sorted[Math.ceil(sorted.length * p) - 1].toFixed(1));
  const hashStarted = performance.now();
  const hashes = await Promise.allSettled(
    Array.from({ length: 20 }, () => passwordBudget.hash("x".repeat(128))),
  );
  const hashRejected = hashes.filter((result) => result.status === "rejected");
  assert.ok(
    hashRejected.every((result) => result.reason.code === "PASSWORD_BUSY"),
  );
  console.log(
    JSON.stringify({
      syntheticLocalOnly: true,
      concurrentReaders: 20,
      savedBooksPerReader: 1000,
      requests: timings.length,
      statusCounts,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      maxMs: percentile(1),
      elapsedMs: Math.round(elapsedMs),
      initializationMs: Math.round(coldMs),
      processPeakRSSMiB: Math.round(peakRSS / 1024 / 1024),
      processLifetimeMaxRSSMiB: Math.round(
        process.resourceUsage().maxRSS / 1024,
      ),
      passwordBurst: {
        attempted: 20,
        completed: hashes.length - hashRejected.length,
        rejectedBusy: hashRejected.length,
        elapsedMs: Math.round(performance.now() - hashStarted),
      },
      runtimePoolLimitPerRole: 4,
      notes:
        "HTTP/API/real-role Postgres; excludes provider redirects, mail delivery and hosted cold starts. Pool wait is included in request latency, not separately instrumented.",
    }),
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await service?.close();
  await admin.query(
    'DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])',
    [authIds],
  );
  await admin.query(
    'DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])',
    [authIds],
  );
  await admin.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [emails]);
  await admin.query("DELETE FROM book_refs WHERE book_key=ANY($1::text[])", [
    keys,
  ]);
  await admin.end();
}
