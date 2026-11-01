import { randomUUID } from "node:crypto";
export async function runDeletionBatch(
  pool,
  { ledger, purge },
  { limit = 5, jobId = null } = {},
) {
  if (!ledger) throw Error("Suppression ledger is unavailable.");
  const lease = randomUUID(),
    { rows } = await pool.query(
      `WITH ready AS (
  SELECT id FROM account_deletions WHERE "availableAt"<=now() AND "ledgerCompletedAt" IS NULL AND ($3::text IS NULL OR id=$3)
   AND ("leaseUntil" IS NULL OR "leaseUntil"<now()) ORDER BY "requestedAt",id FOR UPDATE SKIP LOCKED LIMIT $1
 ) UPDATE account_deletions d SET "leaseOwner"=$2,"leaseUntil"=now()+interval '120 seconds',attempts=d.attempts+1 FROM ready WHERE d.id=ready.id RETURNING d.*`,
      [limit, lease, jobId],
    );
  for (let job of rows) {
    try {
      await ledger.persistRequest(job);
      for (const cleanup of (
        await pool.query(
          'SELECT * FROM account_provider_cleanup WHERE "deletionId"=$1 AND payload<>$2',
          [job.id, ""],
        )
      ).rows)
        await ledger.persistProviderJob(cleanup);
      if (job.status === "pending-ledger") {
        const updated = await pool.query(
          `UPDATE account_deletions SET status='queued' WHERE id=$1 AND "leaseOwner"=$2 RETURNING *`,
          [job.id, lease],
        );
        if (!updated.rowCount) throw Error("Deletion lease lost.");
        job = updated.rows[0];
      }
      if (job.status !== "cleaned") job = await purge(job);
      await ledger.persistCompletion(job);
      await pool.query(
        `UPDATE account_deletions SET "ledgerCompletedAt"=now(),"leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"=NULL WHERE id=$1 AND "leaseOwner"=$2`,
        [job.id, lease],
      );
    } catch {
      await pool.query(
        `UPDATE account_deletions SET "leaseOwner"=NULL,"leaseUntil"=NULL,"lastError"='cleanup_failed',"availableAt"=now()+LEAST(3600,power(2,LEAST(attempts,10))*30)*interval '1 second' WHERE id=$1 AND "leaseOwner"=$2`,
        [job.id, lease],
      );
    }
  }
  return { processed: rows.length };
}
