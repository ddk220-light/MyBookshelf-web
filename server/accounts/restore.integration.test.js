import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createDeletionLedger } from "../jobs/deletion-ledger.js";
import { reconcileAccountRestore } from "../jobs/restore.js";
import { encryptMail } from "../jobs/mail.js";
import { memoryBlob } from "./test-ledger.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "a real isolated restore replays the independent ledger before traffic and restores only encrypted revocation work",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 30000,
  },
  async (t) => {
    const source = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(source.hostname) &&
        source.pathname.endsWith("_test"),
    );
    const control = new Pool({ connectionString }),
      database =
        "account_restore_" + randomUUID().replaceAll("-", "") + "_test";
    let admin, worker;
    t.after(async () => {
      await worker?.end();
      await admin?.end();
      await control.query("DROP DATABASE IF EXISTS " + database);
      await control.end();
    });
    // Every restore gets a separate database: global session invalidation must
    // never disrupt the concurrently running account/reading test fixtures.
    await control.query("CREATE DATABASE " + database);
    source.pathname = "/" + database;
    admin = new Pool({ connectionString: source.href });
    await migrate(admin);
    await prepareTestRoles(admin);
    const deleted = {
        id: randomUUID(),
        appUserId: randomUUID(),
        authUserId: randomUUID(),
        requestedAt: new Date(),
      },
      other = { appUserId: randomUUID(), authUserId: randomUUID() };
    for (const entry of [deleted, other]) {
      await admin.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [
          entry.authUserId,
          "Synthetic restored reader",
          entry.authUserId + "@example.test",
        ],
      );
      await admin.query(
        "INSERT INTO app_users(id,auth_user_id) VALUES($1,$2)",
        [entry.appUserId, entry.authUserId],
      );
      await admin.query(
        "INSERT INTO user_settings(user_id,history_enabled) VALUES($1,true)",
        [entry.appUserId],
      );
      await admin.query(
        'INSERT INTO "session"(id,token,"userId","expiresAt","updatedAt") VALUES($1,$2,$3,now()+interval \'7 days\',now())',
        [randomUUID(), "synthetic-session-" + randomUUID(), entry.authUserId],
      );
      const reference = randomUUID(),
        key = "v1:googlebooks:" + randomUUID().replaceAll("-", "");
      await admin.query(
        "INSERT INTO book_refs(id,book_key,key_digest) VALUES($1,$2,$3)",
        [reference, key, createHash("sha256").update(key).digest()],
      );
      await admin.query(
        "INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES($1,$2,$3)",
        [
          entry.appUserId,
          reference,
          { title: "Private restored title", authors: [] },
        ],
      );
    }
    const blob = memoryBlob(),
      ledger = createDeletionLedger(
        { deletionLedgerToken: "synthetic-private-token" },
        { blob },
      );
    await ledger.persistRequest(deleted);
    const cleanup = {
      id: randomUUID(),
      authUserId: deleted.authUserId,
      deletionId: deleted.id,
      provider: "apple",
      payload: encryptMail(
        { refreshToken: "synthetic-restored-provider-token" },
        "synthetic-restore-job-key-more-than-thirty-two-characters",
      ),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    };
    await ledger.persistProviderJob(cleanup);
    const snapshotCreatedAt = new Date(Date.now() - 86400000).toISOString();
    await assert.rejects(
      reconcileAccountRestore(admin, null, {
        isolated: true,
        snapshotCreatedAt,
      }),
    );
    await assert.rejects(
      reconcileAccountRestore(admin, ledger, {
        isolated: false,
        snapshotCreatedAt,
      }),
    );
    await assert.rejects(
      reconcileAccountRestore(admin, ledger, {
        isolated: true,
        snapshotCreatedAt: new Date(Date.now() - 31 * 86400000),
      }),
    );
    assert.equal(
      (await admin.query('SELECT 1 FROM "session"')).rowCount,
      2,
      "unsafe restore fails before changing data",
    );
    const result = await reconcileAccountRestore(admin, ledger, {
      isolated: true,
      snapshotCreatedAt,
    });
    assert.deepEqual(result, { suppressed: 1, providerJobs: 1 });
    assert.equal(
      (
        await admin.query('SELECT 1 FROM "user" WHERE id=$1', [
          deleted.authUserId,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await admin.query("SELECT 1 FROM user_books WHERE user_id=$1", [
          deleted.appUserId,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await admin.query("SELECT 1 FROM user_books WHERE user_id=$1", [
          other.appUserId,
        ])
      ).rowCount,
      1,
    );
    assert.equal(
      (await admin.query('SELECT 1 FROM "session"')).rowCount,
      0,
      "all restored sessions are invalidated",
    );
    const pending = (
      await admin.query("SELECT * FROM account_provider_cleanup WHERE id=$1", [
        cleanup.id,
      ])
    ).rows[0];
    assert.equal(pending.status, "queued");
    assert.equal(pending.payload, cleanup.payload);
    assert.ok(!pending.payload.includes("synthetic-restored-provider-token"));
    assert.ok((await ledger.records())[0].cleanedAt);
    assert.deepEqual(
      await reconcileAccountRestore(admin, ledger, {
        isolated: true,
        snapshotCreatedAt,
      }),
      result,
      "reconciliation can be retried without resurrecting a suppressed account",
    );
    worker = new Pool({ connectionString: testRoleURL(source.href, "worker") });
    await assert.rejects(worker.query('SELECT * FROM "user"'));
    await assert.rejects(worker.query("SELECT * FROM user_books"));
    await assert.rejects(
      worker.query("SELECT public.account_export_authorize($1,$2,$3)", [
        randomUUID(),
        "0".repeat(64),
        randomUUID(),
      ]),
    );
    await admin.query(
      'INSERT INTO "session"(id,token,"userId","expiresAt","updatedAt") VALUES($1,$2,$3,now()-interval \'1 minute\',now())',
      [randomUUID(), "synthetic-expired", other.authUserId],
    );
    const expiredMail=randomUUID();
    await admin.query(`INSERT INTO account_mail_jobs(id,kind,payload,status,attempts,"availableAt","expiresAt","createdAt") VALUES($1,'verify',$2,'queued',0,now(),now()-interval '1 minute',now())`,[expiredMail,'synthetic-expired-ciphertext']);
    await worker.query("SELECT public.account_retention()");
    const expired=(await admin.query('SELECT status,payload FROM account_mail_jobs WHERE id=$1',[expiredMail])).rows[0];assert.deepEqual(expired,{status:'expired',payload:''},'retention clears expired ciphertext without any mail credential');
    assert.equal((await admin.query('SELECT 1 FROM "session"')).rowCount, 0);
  },
);
