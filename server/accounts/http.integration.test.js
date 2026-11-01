import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createApplication } from "../application.js";
import { createAccountMiddleware } from "./middleware.js";
import { createAccountService } from "./service.js";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { decryptMail } from "../jobs/mail.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "real HTTP → auth cookies → CSRF → private owner storage and revocation",
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
    const admin = new Pool({ connectionString }),
      email = randomUUID() + "@example.test";
    let service, server;
    t.after(async () => {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (service) await service.close();
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
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    const env = {
      NODE_ENV: "test",
      ACCOUNTS_ENABLED: "true",
      ACCOUNTS_ENVIRONMENT: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET:
        "test-only-secret-longer-than-32-characters" + randomUUID(),
      ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(connectionString, "auth"),
      ACCOUNTS_READING_DATABASE_URL: testRoleURL(connectionString, "reading"),
      ACCOUNTS_JOB_SECRET: "test-only-jobs-secret-longer-than-32-characters",
      RESEND_API_KEY: "test-transport-not-called",
      ACCOUNTS_MAIL_FROM: "accounts@example.test",
    };
    const app = createApplication({
      accounts: createAccountMiddleware({
        env,
        initialize: async (config) => {
          service = await createAccountService(config, {
            checkPassword: async () => {},
          });
          return service;
        },
      }),
    });
    server = await new Promise((resolve) => {
      const server = app.listen(0, "127.0.0.1", () => resolve(server));
    });
    const base = "http://127.0.0.1:" + server.address().port;
    const request = (path, method = "GET", body, cookie = "", csrf = "") =>
      fetch(base + "/api/account" + path, {
        method,
        headers: {
          Origin: env.BETTER_AUTH_URL,
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-Account-CSRF": csrf } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    let response = await request("/sign-up", "POST", {
      name: "Synthetic private reader",
      email,
      password: "a long synthetic password " + randomUUID(),
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await request("/state")).status, 401);
    const job = (
      await admin.query(
        'SELECT payload FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId" WHERE u.email=$1 AND kind=\'verify\'',
        [email],
      )
    ).rows[0];
    const { token } = decryptMail(job.payload, env.ACCOUNTS_JOB_SECRET);
    response = await request("/verify-email", "POST", { token });
    assert.equal(response.status, 200);
    assert.equal(
      (await request("/verify-email", "POST", { token })).status,
      400,
    );
    response = await request("/sign-in", "POST", {
      email,
      password: "wrong password",
    });
    assert.equal(response.status, 401);
    // Set the synthetic password through the native library for the successful cookie flow.
    const context = await service.auth.$context,
      user = (
        await admin.query('SELECT id FROM "user" WHERE email=$1', [email])
      ).rows[0];
    const password = "another long synthetic password " + randomUUID();
    await context.internalAdapter.updatePassword(
      user.id,
      await context.password.hash(password),
    );
    response = await request("/sign-in", "POST", { email, password });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.some((c) => /HttpOnly/i.test(c)));
    assert.ok(cookies.every((c) => !c.includes("Domain=")));
    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const session = await (
      await request("/session", "GET", undefined, cookie)
    ).json();
    assert.equal(session.status, "authenticated");
    assert.ok(session.csrfToken);
    assert.ok(!("sessionId" in session));
    assert.ok(!JSON.stringify(session).includes('token"'));
    response = await request(
      "/library",
      "PUT",
      { libraryId: "bc:smcl", settingsRevision: 0, operationId: randomUUID() },
      cookie,
    );
    assert.equal(response.status, 403);
    response = await request(
      "/library",
      "PUT",
      { libraryId: "bc:smcl", settingsRevision: 0, operationId: randomUUID() },
      cookie,
      session.csrfToken,
    );
    assert.equal(response.status, 200);
    response = await request("/state", "GET", undefined, cookie);
    assert.equal((await response.json()).selectedLibraryId, "bc:smcl");
    const profile = await (
      await request("/profile", "GET", undefined, cookie)
    ).json();
    assert.equal(profile.methods[0].provider, "password");
    response = await request(
      "/profile",
      "PATCH",
      { name: "Updated private name", profileRevision: 0 },
      cookie,
      session.csrfToken,
    );
    assert.equal(response.status, 200);
    response = await request(
      "/profile",
      "PATCH",
      { name: "Stale private name", profileRevision: 0 },
      cookie,
      session.csrfToken,
    );
    assert.equal(response.status, 409);
    response = await request(
      "/imports",
      "POST",
      { padding: "x".repeat(2 * 1024 * 1024) },
      cookie,
      session.csrfToken,
    );
    assert.equal(response.status, 413);
    response = await fetch(base + "/api/auth/change-email", {
      method: "POST",
      headers: {
        Origin: env.BETTER_AUTH_URL,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ newEmail: "never@example.test" }),
    });
    assert.equal(response.status, 503);
    response = await request(
      "/sign-out",
      "POST",
      {},
      cookie,
      session.csrfToken,
    );
    assert.equal(response.status, 200);
    assert.equal(
      (await request("/state", "GET", undefined, cookie)).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/api/v2/libraries/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ libraryId: "bc:smcl" }),
        })
      ).status,
      200,
    );
  },
);
