import { randomUUID } from "node:crypto";
import { symmetricDecrypt } from "better-auth/crypto";
import { getCurrentAdapter } from "@better-auth/core/context";
import { encryptMail, decryptMail } from "./mail.js";
export async function enqueueProviderCleanup(
  auth,
  config,
  account,
  deletionId = null,
) {
  if (!["google", "apple"].includes(account.providerId)) return;
  const context = await auth.$context,
    adapter = await getCurrentAdapter(context.adapter);
  const decode = async (token) =>
    token
      ? await symmetricDecrypt({ key: context.secretConfig, data: token })
      : null;
  const refreshToken = await decode(account.refreshToken),
    accessToken = await decode(account.accessToken);
  if (!refreshToken && !accessToken) return;
  const now = new Date();
  await adapter.create({
    model: "providerCleanup",
    forceAllowId: true,
    data: {
      id: randomUUID(),
      authUserId: account.userId,
      deletionId,
      provider: account.providerId,
      payload: encryptMail({ refreshToken, accessToken }, config.jobSecret),
      status: "queued",
      availableAt: now,
      expiresAt: new Date(now.getTime() + 30 * 86400000),
      attempts: 0,
      createdAt: now,
    },
  });
}
export async function revokeProvider(
  provider,
  tokens,
  config,
  { fetcher = fetch } = {},
) {
  const token = tokens.refreshToken || tokens.accessToken;
  if (!token) throw Error('Provider cleanup material is unavailable.');
  const body = new URLSearchParams({ token });
  let endpoint;
  if (provider === "google") endpoint = "https://oauth2.googleapis.com/revoke";
  else if (provider === "apple") {
    if (!config.appleClientId || !config.appleClientSecret)
      throw Error("Provider cleanup configuration is unavailable.");
    endpoint = "https://appleid.apple.com/auth/revoke";
    body.set("client_id", config.appleClientId);
    body.set("client_secret", config.appleClientSecret);
    body.set(
      "token_type_hint",
      tokens.refreshToken ? "refresh_token" : "access_token",
    );
  } else throw Error("Unsupported cleanup provider.");
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (response.ok) return;
  const error = await response.json().catch(() => null);
  if (response.status === 400 && error?.error === "invalid_token") return;
  throw Error("Provider cleanup failed.");
}
export async function runProviderCleanupBatch(
  pool,
  config,
  { revoke = revokeProvider, limit = 10, jobId = null, ledger = null } = {},
) {
  const lease = randomUUID(),
    { rows } = await pool.query(
      `WITH ready AS (
  SELECT id FROM account_provider_cleanup WHERE "availableAt"<=now() AND "expiresAt">now() AND ($3::text IS NULL OR id=$3)
   AND (status='queued' OR (status='running' AND "leaseUntil"<now())) ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT $1
 ) UPDATE account_provider_cleanup j SET status='running',"leaseOwner"=$2,"leaseUntil"=now()+interval '60 seconds',attempts=j.attempts+1 FROM ready WHERE j.id=ready.id RETURNING j.*`,
      [limit, lease, jobId],
    );
  for (const job of rows) {
    try {
      if (job.deletionId && !ledger)
        throw Error("Independent cleanup ledger unavailable.");
      if (ledger) await ledger.persistProviderJob(job);
      await revoke(
        job.provider,
        decryptMail(job.payload, config.jobSecret),
        config,
      );
      if (ledger) await ledger.removeProviderJob(job.id);
      await pool.query(
        `UPDATE account_provider_cleanup SET status='done',payload='',"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL WHERE id=$1 AND "leaseOwner"=$2`,
        [job.id, lease],
      );
    } catch {
      await pool.query(
        `UPDATE account_provider_cleanup SET status='queued',"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"='revocation_failed',"availableAt"=now()+LEAST(3600,power(2,LEAST(attempts,10))*30)*interval '1 second' WHERE id=$1 AND "leaseOwner"=$2`,
        [job.id, lease],
      );
    }
  }
  await pool.query(
    `UPDATE account_provider_cleanup SET status='expired',payload='',"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"='cleanup_deadline_exceeded' WHERE "expiresAt"<=now() AND status IN ('queued','running')`,
  );
  await pool.query(
    `DELETE FROM account_provider_cleanup WHERE status='done' AND "createdAt"<now()-interval '2 days'`,
  );
  return { processed: rows.length };
}
