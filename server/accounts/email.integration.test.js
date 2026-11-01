import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createAccountService } from "./service.js";
import { decryptMail } from "../jobs/mail.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "verified email change preserves old login until confirmation, revokes old devices and rejects cancelled/replayed/colliding links",
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
      emails = [
        randomUUID() + "@example.test",
        randomUUID() + "@example.test",
        randomUUID() + "@example.test",
      ];
    let service, pool;
    t.after(async () => {
      await admin.query(
        "DROP TRIGGER IF EXISTS test_email_notice_failure ON account_mail_jobs",
      );
      await admin.query("DROP FUNCTION IF EXISTS test_email_notice_failure()");
      const ids = (
        await admin.query('SELECT id FROM "user" WHERE email=ANY($1::text[])', [
          emails,
        ])
      ).rows.map((r) => r.id);
      await admin.query(
        'DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query(
        'DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [
        emails,
      ]);
      await service?.close();
      await pool?.end();
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    pool = new Pool({
      connectionString: testRoleURL(connectionString, "auth"),
    });
    const config = {
      databaseURL: testRoleURL(connectionString, "auth"),
      readingDatabaseURL: testRoleURL(connectionString, "reading"),
      baseURL: "http://localhost:3000",
      secret: "test-only-email-secret-longer-than-32-characters" + randomUUID(),
      jobSecret: "test-only-email-job-secret-longer-than-32-characters",
      resendKey: "synthetic-not-used",
      mailFrom: "accounts@example.test",
      secureCookies: false,
    };
    service = await createAccountService(config, {
      checkPassword: async () => {},
    });
    const password = "synthetic long password " + randomUUID();
    const mail = async (email, kind) => {
      const row = (
        await pool.query(
          'SELECT j.payload FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId" WHERE u.email=$1 AND j.kind=$2 ORDER BY j."createdAt" DESC LIMIT 1',
          [email, kind],
        )
      ).rows[0];
      return row ? decryptMail(row.payload, config.jobSecret) : null;
    };
    const headersFor = (cookies) =>
      new Headers({
        origin: config.baseURL,
        cookie: cookies.map((c) => c.split(";")[0]).join("; "),
      });
    const login = async (email) => {
      const cookies = [];
      await service.actions.signin(
        { email, password },
        randomUUID(),
        new Headers(),
        (c) => cookies.push(c),
      );
      return headersFor(cookies);
    };
    for (const email of emails.slice(0, 2)) {
      await service.actions.signup(
        { email, name: "Synthetic reader", password },
        randomUUID(),
      );
      const verification = await mail(email, "verify");
      await service.actions.verify({ token: verification.token }, randomUUID());
    }
    let headers = await login(emails[0]);
    const second = await login(emails[0]),
      other = await login(emails[1]);
    const prove = async () => {
      const identity = await service.identity(headers),
        cookies = [];
      const proof = await service.actions.confirmPassword(
        { password, action: "email-change" },
        identity,
        headers,
        (c) => cookies.push(c),
      );
      headers = headersFor(cookies);
      return proof.proof;
    };
    let proof = await prove(),
      identity = await service.identity(headers);
    await service.actions.requestEmailChange(
      { newEmail: emails[2], proof },
      identity,
      headers,
    );
    assert.equal(
      (await service.actions.profile(identity, headers)).pendingEmail.email,
      emails[2],
    );
    assert.ok(await mail(emails[0], "emailRequested"));
    let challenge = await mail(emails[0], "newEmail");
    const cancelledToken = challenge.token;
    assert.equal(challenge.to, emails[2]);
    assert.equal(
      (
        await pool.query('SELECT email FROM "user" WHERE id=$1', [
          identity.authUserId,
        ])
      ).rows[0].email,
      emails[0],
    );
    await assert.rejects(
      service.actions.confirmEmailChange(
        { token: challenge.token },
        randomUUID(),
        other,
        () => {},
      ),
      (e) => e.code === "ACCOUNT_MISMATCH",
    );
    await admin.query(
      "UPDATE account_email_challenges SET \"expiresAt\"=now()-interval '1 second' WHERE \"authUserId\"=$1 AND purpose='email-change'",
      [identity.authUserId],
    );
    await assert.rejects(
      service.actions.confirmEmailChange(
        { token: challenge.token },
        randomUUID(),
        headers,
        () => {},
      ),
      (e) => e.code === "LINK_EXPIRED",
    );
    assert.equal(
      (await service.actions.profile(identity, headers)).pendingEmail,
      null,
    );
    await service.actions.cancelEmailChange({}, identity, headers);
    await assert.rejects(
      service.actions.confirmEmailChange(
        { token: challenge.token },
        randomUUID(),
        headers,
        () => {},
      ),
      (e) => e.code === "LINK_EXPIRED",
    );
    proof = await prove();
    identity = await service.identity(headers);
    await service.actions.requestEmailChange(
      { newEmail: emails[2], proof },
      identity,
      headers,
    );
    challenge = await mail(emails[0], "newEmail");
    assert.notEqual(challenge.token, cancelledToken);
    await assert.rejects(
      service.actions.confirmEmailChange(
        { token: cancelledToken },
        randomUUID(),
        headers,
        () => {},
      ),
      (e) => e.code === "LINK_EXPIRED",
    );
    // The provider subject remains the auth user ID for email/password across contact changes.
    const before = (
      await pool.query('SELECT "accountId" FROM account WHERE "userId"=$1', [
        identity.authUserId,
      ])
    ).rows[0].accountId;
    await admin.query(
      `CREATE FUNCTION test_email_notice_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."authUserId"=TG_ARGV[0] THEN RAISE EXCEPTION 'injected_email_notice_failure'; END IF; RETURN NEW; END $$`,
    );
    const quotedId = identity.authUserId.replaceAll("'", "''");
    await admin.query(
      `CREATE TRIGGER test_email_notice_failure BEFORE INSERT ON account_mail_jobs FOR EACH ROW WHEN (NEW.kind='emailChanged') EXECUTE FUNCTION test_email_notice_failure('${quotedId}')`,
    );
    await assert.rejects(
      service.actions.confirmEmailChange(
        { token: challenge.token },
        randomUUID(),
        headers,
        () => {},
      ),
    );
    assert.equal((await service.identity(headers)).user.email, emails[0]);
    assert.ok(await service.auth.api.getSession({ headers: second }));
    assert.equal(
      (
        await pool.query(
          'SELECT "usedAt" FROM account_email_challenges WHERE "authUserId"=$1 AND purpose=\'email-change\'',
          [identity.authUserId],
        )
      ).rows[0].usedAt,
      null,
    );
    await admin.query(
      "DROP TRIGGER test_email_notice_failure ON account_mail_jobs",
    );
    const cookies = [];
    assert.deepEqual(
      await service.actions.confirmEmailChange(
        { token: challenge.token },
        randomUUID(),
        headers,
        (c) => cookies.push(c),
      ),
      { status: "email-updated" },
    );
    headers = headersFor(cookies);
    assert.equal((await service.identity(headers)).user.email, emails[2]);
    assert.equal(await service.auth.api.getSession({ headers: second }), null);
    assert.equal(
      (
        await pool.query('SELECT "accountId" FROM account WHERE "userId"=$1', [
          identity.authUserId,
        ])
      ).rows[0].accountId,
      before,
    );
    const completed = await mail(emails[2], "emailChanged");
    assert.equal(completed.to, emails[0]);
    await assert.rejects(
      service.actions.confirmEmailChange(
        { token: challenge.token },
        randomUUID(),
        headers,
        () => {},
      ),
      (e) => e.code === "LINK_EXPIRED",
    );
    await assert.rejects(
      service.actions.signin(
        { email: emails[0], password },
        randomUUID(),
        new Headers(),
        () => {},
      ),
    );
    assert.equal(
      (await service.identity(await login(emails[2]))).user.id,
      identity.user.id,
    );
    proof = await prove();
    identity = await service.identity(headers);
    await service.actions.requestEmailChange(
      { newEmail: emails[1], proof },
      identity,
      headers,
    );
    assert.equal(
      (await service.actions.profile(identity, headers)).pendingEmail,
      null,
    );
    assert.equal((await service.identity(headers)).user.email, emails[2]);
  },
);
