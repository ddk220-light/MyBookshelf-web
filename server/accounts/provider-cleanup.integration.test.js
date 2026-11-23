import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createDeletionLedger } from "../jobs/deletion-ledger.js";
import { runProviderCleanupBatch } from "../jobs/provider-cleanup.js";
import { encryptMail } from "../jobs/mail.js";
import { memoryBlob } from "./test-ledger.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "provider revocation survives transport failure, uses fenced worker leases and clears both encrypted copies on success",
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
      id = randomUUID(),
      authUserId = randomUUID(),
      jobSecret = "synthetic-worker-secret-longer-than-thirty-two-characters";
    let worker;
    t.after(async () => {
      await worker?.end();
      await admin.query("DELETE FROM account_provider_cleanup WHERE id=$1", [
        id,
      ]);
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    worker = new Pool({
      connectionString: testRoleURL(connectionString, "worker"),
    });
    const blob = memoryBlob(),
      ledger = createDeletionLedger(
        { deletionLedgerToken: "synthetic-private-token" },
        { blob },
      ),
      payload = encryptMail(
        { refreshToken: "synthetic-revocation-token" },
        jobSecret,
      );
    await admin.query(
      `INSERT INTO account_provider_cleanup(id,"authUserId","deletionId",provider,payload,status,"availableAt","expiresAt","createdAt") VALUES($1,$2,$3,'apple',$4,'queued',now(),now()+interval '30 days',now())`,
      [id, authUserId, randomUUID(), payload],
    );
    let calls = 0;
    await runProviderCleanupBatch(
      worker,
      { jobSecret },
      {
        jobId: id,
        ledger,
        revoke: async () => {
          calls++;
          throw Error("Synthetic provider outage");
        },
      },
    );
    let row = (
      await admin.query("SELECT * FROM account_provider_cleanup WHERE id=$1", [
        id,
      ])
    ).rows[0];
    assert.equal(row.status, "queued");
    assert.equal(row.payload, payload);
    assert.equal((await ledger.providerJobs())[0].payload, payload);
    await admin.query(
      'UPDATE account_provider_cleanup SET "availableAt"=now() WHERE id=$1',
      [id],
    );
    const transport = async (provider, tokens) => {
      assert.equal(provider, "apple");
      assert.equal(tokens.refreshToken, "synthetic-revocation-token");
      calls++;
    };
    await Promise.all([
      runProviderCleanupBatch(
        worker,
        { jobSecret },
        { jobId: id, ledger, revoke: transport },
      ),
      runProviderCleanupBatch(
        worker,
        { jobSecret },
        { jobId: id, ledger, revoke: transport },
      ),
    ]);
    row = (
      await admin.query("SELECT * FROM account_provider_cleanup WHERE id=$1", [
        id,
      ])
    ).rows[0];
    assert.equal(row.status, "done");
    assert.equal(row.payload, "");
    assert.equal(calls, 2, "two workers do not repeat a live lease");
    assert.equal((await ledger.providerJobs()).length, 0);
  },
);
