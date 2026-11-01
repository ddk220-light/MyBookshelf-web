import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createAccountService } from "./service.js";
import { runDeletionBatch } from "../jobs/deletions.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "private export and durable deletion use real roles, one-use proof, coherent owned data and nonce-only recovery",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 30000,
  },
  async (t) => {
    const url = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_test"),
    );
    const admin = new Pool({ connectionString }),
      emails = [],
      keys = [],
      ids = [],
      records = new Map();
    let service,
      failLedger = false;
    const ledger = {
      async persistRequest(job) {
        if (failLedger) throw Error("Synthetic ledger outage");
        records.set(job.id, {
          appUserId: job.appUserId,
          authUserId: job.authUserId,
          requestedAt: job.requestedAt,
        });
      },
      async persistCompletion(job) {
        if (failLedger) throw Error("Synthetic completion outage");
        records.set(job.id, {
          ...records.get(job.id),
          cleanedAt: job.cleanedAt,
        });
      },
    };
    t.after(async () => {
      await service?.close();
      await admin.query(
        'DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query(
        'DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query(
        'DELETE FROM account_deletions WHERE "authUserId"=ANY($1::text[])',
        [ids],
      );
      await admin.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [
        emails,
      ]);
      await admin.query(
        "DELETE FROM book_refs WHERE book_key=ANY($1::text[])",
        [keys],
      );
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    const config = {
      databaseURL: testRoleURL(connectionString, "auth"),
      readingDatabaseURL: testRoleURL(connectionString, "reading"),
      baseURL: "http://localhost:3000",
      secureCookies: false,
      secret: "synthetic-lifecycle-secret-more-than-32-" + randomUUID(),
      jobSecret: "synthetic-lifecycle-jobs-more-than-32-characters",
      resendKey: "synthetic-only",
      mailFrom: "accounts@example.test",
    };
    service = await createAccountService(config, {
      checkPassword: async () => {},
      ledger,
    });
    const cookieHeaders = (cookies) =>
      new Headers({ cookie: cookies.map((c) => c.split(";")[0]).join("; ") });
    const password = "Synthetic lifecycle password 9214";
    const create = async () => {
      const email = randomUUID() + "@example.test";
      emails.push(email);
      await service.actions.signup(
        { email, name: "Private synthetic reader", password },
        randomUUID(),
      );
      const user = (
        await admin.query(
          'UPDATE "user" SET "emailVerified"=true WHERE email=$1 RETURNING id',
          [email],
        )
      ).rows[0];
      ids.push(user.id);
      const cookies = [];
      await service.actions.signin(
        { email, password },
        randomUUID(),
        new Headers(),
        (c) => cookies.push(c),
      );
      const headers = cookieHeaders(cookies),
        identity = await service.identity(headers);
      return { headers, identity, email };
    };
    const proof = async (account, action) => {
      const cookies = [],
        result = await service.actions.confirmPassword(
          { password, action },
          account.identity,
          account.headers,
          (c) => cookies.push(c),
        );
      const headers = cookieHeaders(cookies);
      return {
        ...account,
        headers,
        identity: await service.identity(headers),
        ...result,
      };
    };
    const a = await create(),
      b = await create();
    const book = (label) => {
      const bookKey = "v1:googlebooks:" + randomUUID().replaceAll("-", "");
      keys.push(bookKey);
      return { bookKey, title: label, authors: ["Synthetic author"] };
    };
    const own = book("Owner A private title"),
      other = book("Owner B private title");
    await service.reading.save(
      { book: own, shelfRevision: 0, operationId: randomUUID() },
      a.identity,
    );
    await service.reading.save(
      { book: other, shelfRevision: 0, operationId: randomUUID() },
      b.identity,
    );
    await service.reading.selectLibrary(
      { libraryId: "bc:smcl", settingsRevision: 0, operationId: randomUUID() },
      a.identity,
    );
    await service.reading.historySettings(
      { enabled: true, settingsRevision: 1, operationId: randomUUID() },
      a.identity,
    );
    await service.reading.view(
      {
        book: own,
        source: "direct",
        historyGeneration: 1,
        operationId: randomUUID(),
      },
      a.identity,
    );
    await admin.query(
      "UPDATE recent_book_views SET viewed_at=now()-interval '31 days' WHERE user_id=$1",
      [a.identity.user.id],
    );
    const exported = await proof(a, "export"),
      operationId = randomUUID(),
      request = { proof: exported.proof, operationId };
    const data = await service.reading.exportAccount(
      request,
      exported.identity,
    );
    assert.equal(data.schemaVersion, 1);
    assert.equal(data.profile.email, a.email);
    assert.deepEqual(data.profile.signInMethods, ["password"]);
    assert.equal(data.savedBooks.length, 1);
    assert.equal(data.savedBooks[0].bookKey, own.bookKey);
    assert.equal(data.recentlyViewed.length, 0);
    assert.deepEqual(data.libraries, [
      { directoryId: "bc:smcl", selected: true },
    ]);
    const serialized = JSON.stringify(data);
    for (const forbidden of [
      other.bookKey,
      b.email,
      "sessionId",
      "authUserId",
      "accessToken",
      "passwordHash",
      "csrfToken",
      exported.identity.sessionId,
      exported.proof,
    ])
      assert.ok(!serialized.includes(forbidden));
    assert.equal(
      (await service.reading.exportAccount(request, exported.identity))
        .savedBooks.length,
      1,
      "lost download can retry same operation within original proof lifetime",
    );
    await assert.rejects(
      service.reading.exportAccount(
        { ...request, operationId: randomUUID() },
        exported.identity,
      ),
      (e) => e.code === "RECENT_AUTH_REQUIRED",
    );
    const deleting = await proof(exported, "delete"),
      receiptNonce = randomBytes(32).toString("base64url"),
      deletionId = randomUUID();
    const deletion = {
      operationId: deletionId,
      receiptNonce,
      proof: deleting.proof,
      confirmation: "delete-account",
    };
    failLedger = true;
    const response = await service.actions.deleteAccount(
      deletion,
      deleting.identity,
      deleting.headers,
      () => {},
    );
    assert.equal(response.status, "pending");
    assert.equal(response.accessEnded, true);
    assert.equal(response.cleanupComplete, false);
    assert.equal((await service.identity(deleting.headers)).status, "guest");
    assert.equal(
      (
        await admin.query("SELECT status FROM app_users WHERE id=$1", [
          a.identity.user.id,
        ])
      ).rows[0].status,
      "deleting",
    );
    await assert.rejects(
      service.reading.save(
        {
          book: book("Late save"),
          shelfRevision: 1,
          operationId: randomUUID(),
        },
        deleting.identity,
      ),
    );
    await assert.rejects(
      service.actions.signin(
        { email: a.email, password },
        randomUUID(),
        new Headers(),
        () => {},
      ),
    );
    const status = await service.actions.deletionStatus(
      { operationId: deletionId, receiptNonce },
      randomUUID(),
    );
    assert.deepEqual(status, response);
    assert.deepEqual(
      await service.actions.deletionStatus(
        {
          operationId: deletionId,
          receiptNonce: randomBytes(32).toString("base64url"),
        },
        randomUUID(),
      ),
      { status: "unavailable" },
    );
    await runDeletionBatch(
      admin,
      { ledger, purge: service.maintenance.purgeDeletion },
      { jobId: deletionId },
    );
    assert.equal(
      (
        await admin.query('SELECT 1 FROM "user" WHERE id=$1', [
          a.identity.authUserId,
        ])
      ).rowCount,
      1,
      "ledger outage prevents purge",
    );
    failLedger = false;
    await admin.query(
      'UPDATE account_deletions SET "availableAt"=now() WHERE id=$1',
      [deletionId],
    );
    await runDeletionBatch(
      admin,
      { ledger, purge: service.maintenance.purgeDeletion },
      { jobId: deletionId },
    );
    assert.equal(
      (
        await admin.query('SELECT 1 FROM "user" WHERE id=$1', [
          a.identity.authUserId,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await admin.query("SELECT 1 FROM user_books WHERE user_id=$1", [
          a.identity.user.id,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await service.actions.deletionStatus(
          { operationId: deletionId, receiptNonce },
          randomUUID(),
        )
      ).cleanupComplete,
      true,
    );
    assert.ok(records.get(deletionId).cleanedAt);
    assert.equal(records.get(deletionId).authUserId, a.identity.authUserId);
    assert.equal(
      (await service.reading.books({}, b.identity)).books[0].bookKey,
      other.bookKey,
    );
    assert.equal(
      (
        await admin.query(
          'SELECT payload FROM account_mail_jobs WHERE "authUserId"=$1',
          [a.identity.authUserId],
        )
      ).rowCount,
      1,
      "only the final encrypted security notice remains",
    );
  },
);
