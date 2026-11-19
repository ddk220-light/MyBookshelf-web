import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createAccountService } from "./service.js";
import { decryptMail, renderAccountMail } from "../jobs/mail.js";

// Plan B1 and B10: no password rules (the sign-in limit is the only guard),
// and logging in with an emailed link.
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "one-character passwords, the sign-in limit, and the single-use 15-minute log-in link for existing accounts only",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 60000,
  },
  async (t) => {
    const url = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_test"),
    );
    const admin = new Pool({ connectionString }),
      emails = [];
    let service;
    t.after(async () => {
      await service?.close();
      const ids = (
        await admin.query('SELECT id FROM "user" WHERE email=ANY($1::text[])', [emails])
      ).rows.map((r) => r.id);
      await admin.query('DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])', [ids]);
      await admin.query('DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])', [ids]);
      await admin.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [emails]);
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    const config = {
      databaseURL: testRoleURL(connectionString, "auth"),
      readingDatabaseURL: testRoleURL(connectionString, "reading"),
      baseURL: "http://localhost:3000",
      secureCookies: false,
      secret: "synthetic-magic-link-secret-more-than-32-" + randomUUID(),
      jobSecret: "synthetic-magic-link-jobs-more-than-32-characters",
      resendKey: "synthetic-only",
      mailFrom: "accounts@example.test",
    };
    service = await createAccountService(config, { ledger: { async persistRequest() {} } });
    const { actions } = service;
    const ip = () => "192.0.2." + Math.floor(Math.random() * 200 + 1);
    const create = async (password, verified = true) => {
      const email = randomUUID() + "@example.test";
      emails.push(email);
      await actions.signup({ email, name: "Reader", password }, ip());
      const user = (
        await admin.query('UPDATE "user" SET "emailVerified"=$2 WHERE email=$1 RETURNING id', [email, verified])
      ).rows[0];
      return { email, authUserId: user.id };
    };
    const mails = async (authUserId, kind) =>
      (
        await admin.query(
          'SELECT * FROM account_mail_jobs WHERE "authUserId"=$1 AND kind=$2 ORDER BY "createdAt"',
          [authUserId, kind],
        )
      ).rows;
    const cookieHeaders = (cookies) =>
      new Headers({ cookie: cookies.map((c) => c.split(";")[0]).join("; ") });

    // B1: one character is a valid password; five wrong tries per address in
    // 15 minutes, then even the right password waits.
    const short = await create("a");
    const signed = [];
    assert.equal(
      (await actions.signin({ email: short.email, password: "a" }, ip(), new Headers(), (c) => signed.push(c))).status,
      "signed-in",
    );
    for (let attempt = 0; attempt < 4; attempt++)
      await assert.rejects(
        actions.signin({ email: short.email, password: "b" }, ip(), new Headers(), () => {}),
        // The library's 401, which the HTTP layer answers as INVALID_CREDENTIALS.
        (error) => error.statusCode === 401,
      );
    await assert.rejects(
      actions.signin({ email: short.email, password: "a" }, ip(), new Headers(), () => {}),
      (error) => error.status === 429 && error.code === "RATE_LIMITED",
    );

    // B10: an existing, verified account gets a link; any other address gets
    // the same answer and no email.
    const reader = await create("another synthetic password");
    const unverified = await create("an unverified synthetic password", false);
    const known = await actions.requestMagicLink({ email: reader.email }, ip(), new Headers());
    const unknown = await actions.requestMagicLink({ email: randomUUID() + "@example.test" }, ip(), new Headers());
    const pending = await actions.requestMagicLink({ email: unverified.email }, ip(), new Headers());
    assert.deepEqual(known, unknown);
    assert.deepEqual(known, pending);
    assert.deepEqual(known, { status: "check-email", message: "If that address has an account, a link is on its way." });
    assert.equal((await mails(unverified.authUserId, "magicLink")).length, 0);
    const [job] = await mails(reader.authUserId, "magicLink");
    assert.ok(job, "a log-in email is queued");
    const lifetime = new Date(job.expiresAt) - new Date(job.createdAt);
    assert.ok(lifetime > 14 * 60000 && lifetime <= 15 * 60000, "the email expires with the link");
    const payload = decryptMail(job.payload, config.jobSecret);
    const rendered = renderAccountMail(payload);
    assert.ok(rendered.html.includes("/app/account/magic-link#token="));
    assert.ok(!rendered.text.includes("?token="));
    // Only a digest of the token is stored.
    assert.equal(
      (await admin.query("SELECT 1 FROM verification WHERE identifier LIKE $1", ["%" + payload.token + "%"])).rowCount,
      0,
    );

    const cookies = [];
    assert.deepEqual(
      await actions.magicLinkSignIn({ token: payload.token }, ip(), new Headers(), (c) => cookies.push(c)),
      { status: "signed-in", email: reader.email },
    );
    const session = await service.identity(cookieHeaders(cookies));
    assert.equal(session.status, "authenticated");
    assert.equal(session.user.email, reader.email);
    // Single use.
    await assert.rejects(
      actions.magicLinkSignIn({ token: payload.token }, ip(), new Headers(), () => {}),
      (error) => error.code === "LINK_EXPIRED",
    );
    // Expired after 15 minutes.
    await actions.requestMagicLink({ email: reader.email }, ip(), new Headers());
    const second = decryptMail((await mails(reader.authUserId, "magicLink"))[1].payload, config.jobSecret);
    await admin.query(
      "UPDATE verification SET \"expiresAt\"=now()-interval '1 second' WHERE identifier LIKE 'magic-link:%' AND value LIKE $1",
      ["%" + reader.email + "%"],
    );
    await assert.rejects(
      actions.magicLinkSignIn({ token: second.token }, ip(), new Headers(), () => {}),
      (error) => error.code === "LINK_EXPIRED",
    );
    // An account being deleted gets no link, and an earlier link no longer works.
    await actions.requestMagicLink({ email: reader.email }, ip(), new Headers());
    const third = decryptMail((await mails(reader.authUserId, "magicLink"))[2].payload, config.jobSecret);
    await admin.query("UPDATE app_users SET status='deleting' WHERE auth_user_id=$1", [reader.authUserId]);
    await assert.rejects(
      actions.magicLinkSignIn({ token: third.token }, ip(), new Headers(), () => {}),
      (error) => error.code === "LINK_EXPIRED",
    );
    assert.deepEqual(await actions.requestMagicLink({ email: reader.email }, ip(), new Headers()), known);
    assert.equal((await mails(reader.authUserId, "magicLink")).length, 3);
    await admin.query("UPDATE app_users SET status='active' WHERE auth_user_id=$1", [reader.authUserId]);

    // The link pages name the account before the reader taps ("Log in as
    // <email>"): a working link gives its address and is not used up; any
    // other link gets one answer that says nothing.
    const expired = async (body) => {
      const error = await actions.linkInfo(body, ip()).then(() => null, (e) => e);
      assert.ok(error, "refused");
      return { status: error.status, code: error.code, message: error.message };
    };
    const nothing = await expired({ kind: "magic-link", token: "x".repeat(43) });
    assert.deepEqual(nothing, { status: 400, code: "LINK_EXPIRED", message: "This link has expired or was already used." });
    await actions.requestMagicLink({ email: reader.email }, ip(), new Headers());
    const fourth = decryptMail((await mails(reader.authUserId, "magicLink"))[3].payload, config.jobSecret);
    for (let look = 0; look < 2; look++)
      assert.deepEqual(await actions.linkInfo({ kind: "magic-link", token: fourth.token }, ip()), { status: "valid", email: reader.email });
    for (const kind of ["verify", "reset", "other"])
      assert.deepEqual(await expired({ kind, token: fourth.token }), nothing, kind);
    await admin.query("UPDATE app_users SET status='deleting' WHERE auth_user_id=$1", [reader.authUserId]);
    assert.deepEqual(await expired({ kind: "magic-link", token: fourth.token }), nothing);
    await admin.query("UPDATE app_users SET status='active' WHERE auth_user_id=$1", [reader.authUserId]);
    const linked = [];
    await actions.magicLinkSignIn({ token: fourth.token }, ip(), new Headers(), (c) => linked.push(c));
    assert.deepEqual(await expired({ kind: "magic-link", token: fourth.token }), nothing);
    // A verification link: for an address not yet verified only.
    const newcomer = await create("a newcomer synthetic password", false);
    const [verifyJob] = await mails(newcomer.authUserId, "verify");
    const verifyToken = decryptMail(verifyJob.payload, config.jobSecret).token;
    assert.deepEqual(await actions.linkInfo({ kind: "verify", token: verifyToken }, ip()), { status: "valid", email: newcomer.email });
    const [readerVerify] = await mails(reader.authUserId, "verify");
    assert.deepEqual(await expired({ kind: "verify", token: decryptMail(readerVerify.payload, config.jobSecret).token }), nothing);
    // A reset link.
    await actions.recover({ email: reader.email }, ip());
    const [resetJob] = await mails(reader.authUserId, "reset");
    const resetToken = decryptMail(resetJob.payload, config.jobSecret).token;
    assert.deepEqual(await actions.linkInfo({ kind: "reset", token: resetToken }, ip()), { status: "valid", email: reader.email });
    assert.deepEqual(await expired({ kind: "reset", token: resetToken + "x" }), nothing);

    // No IP address or device identifier is kept on a session, and the
    // library keeps no per-address rows; the app's own limits above still
    // hold (they keep only one-way codes).
    const privateHeaders = new Headers({ "user-agent": "Synthetic browser/1.0", "x-forwarded-for": "192.0.2.77" });
    await actions.signin({ email: reader.email, password: "another synthetic password" }, ip(), privateHeaders, () => {});
    const rows = (await admin.query('SELECT "ipAddress","userAgent" FROM "session" WHERE "userId"=$1', [reader.authUserId])).rows;
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((row) => row.ipAddress === null && row.userAgent === null));
    assert.equal((await admin.query('SELECT 1 FROM "rateLimit" WHERE key LIKE $1', ["192.0.2.77%"])).rowCount, 0);

    // A deleted account answers like a wrong password, after the same one
    // password hash a wrong password costs (no timing tell).
    const context = await service.auth.$context;
    const hash = context.password.hash;
    let hashed = 0;
    context.password.hash = async (value) => { hashed++; return hash(value); };
    try {
      await admin.query("UPDATE app_users SET status='deleting' WHERE auth_user_id=$1", [reader.authUserId]);
      await assert.rejects(
        actions.signin({ email: reader.email, password: "another synthetic password" }, ip(), new Headers(), () => {}),
        (error) => error.code === "INVALID_CREDENTIALS" && error.status === 401,
      );
      assert.equal(hashed, 1);
    } finally {
      context.password.hash = hash;
      await admin.query("UPDATE app_users SET status='active' WHERE auth_user_id=$1", [reader.authUserId]);
    }

    // Limited like password resets: five requests per address an hour.
    const limited = await create("a limited synthetic password");
    for (let attempt = 0; attempt < 5; attempt++)
      await actions.requestMagicLink({ email: limited.email }, ip(), new Headers());
    await assert.rejects(
      actions.requestMagicLink({ email: limited.email }, ip(), new Headers()),
      (error) => error.status === 429 && error.code === "RATE_LIMITED",
    );
    assert.equal((await mails(limited.authUserId, "magicLink")).length, 5);
  },
);
