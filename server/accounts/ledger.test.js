import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDeletionLedger } from "../jobs/deletion-ledger.js";
import { encryptMail } from "../jobs/mail.js";
import { revokeProvider } from "../jobs/provider-cleanup.js";
import { memoryBlob } from "./test-ledger.js";
test("independent private ledger is immutable, retains suppression for 35 days and bounds encrypted provider material to 30 days", async () => {
  const blob = memoryBlob(),
    ledger = createDeletionLedger(
      { deletionLedgerToken: "synthetic-private-token" },
      { blob },
    ),
    now = new Date();
  const job = {
    id: randomUUID(),
    authUserId: randomUUID(),
    appUserId: randomUUID(),
    requestedAt: now,
  };
  await ledger.persistRequest(job);
  await ledger.persistRequest(job);
  await assert.rejects(
    ledger.persistRequest({ ...job, authUserId: randomUUID() }),
  );
  assert.equal((await ledger.records())[0].cleanedAt, undefined);
  const cleanedAt = new Date(now.getTime() + 60000);
  await ledger.persistCompletion({ ...job, cleanedAt });
  const record = (await ledger.records())[0];
  assert.equal(
    Date.parse(record.suppressUntil) - Date.parse(record.cleanedAt),
    35 * 86400000,
  );
  assert.equal(
    await ledger.removeExpired(
      record,
      new Date(cleanedAt.getTime() + 34 * 86400000),
    ),
    false,
  );
  const cleanup = {
    id: randomUUID(),
    authUserId: job.authUserId,
    deletionId: job.id,
    provider: "apple",
    payload: encryptMail(
      { refreshToken: "synthetic-provider-token" },
      "synthetic-key-longer-than-thirty-two-characters",
    ),
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 86400000),
  };
  await ledger.persistProviderJob(cleanup);
  assert.equal((await ledger.providerJobs())[0].id, cleanup.id);
  assert.ok(
    !JSON.stringify([...blob.files.values()]).includes(
      "synthetic-provider-token",
    ),
  );
  await ledger.removeProviderJob(cleanup.id);
  assert.equal((await ledger.providerJobs()).length, 0);
  assert.equal(
    await ledger.pruneExpired(new Date(cleanedAt.getTime() + 35 * 86400000)),
    1,
  );
  assert.equal(blob.files.size, 0);
});
test("provider cleanup uses fixed revocation endpoints and treats only invalid_token as idempotent failure", async () => {
  const calls = [],
    fetcher = async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 200 });
    };
  await revokeProvider(
    "google",
    { refreshToken: "synthetic-google-refresh" },
    {},
    { fetcher },
  );
  assert.equal(calls[0].url, "https://oauth2.googleapis.com/revoke");
  assert.equal(calls[0].options.body.get("token"), "synthetic-google-refresh");
  assert.equal(calls[0].options.redirect, "error");
  await revokeProvider(
    "apple",
    { accessToken: "synthetic-apple-access" },
    {
      appleClientId: "synthetic-client",
      appleClientSecret: "synthetic-secret",
    },
    { fetcher },
  );
  assert.equal(calls[1].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(calls[1].options.body.get("token_type_hint"), "access_token");
  await revokeProvider(
    "google",
    { accessToken: "already-revoked" },
    {},
    {
      fetcher: async () =>
        Response.json({ error: "invalid_token" }, { status: 400 }),
    },
  );
  await assert.rejects(
    revokeProvider(
      "apple",
      { refreshToken: "synthetic" },
      {
        appleClientId: "synthetic-client",
        appleClientSecret: "expired-secret",
      },
      {
        fetcher: async () =>
          Response.json({ error: "invalid_client" }, { status: 400 }),
      },
    ),
  );
});
