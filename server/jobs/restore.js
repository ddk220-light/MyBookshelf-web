// Called only by the isolated migration/restore command, never a web route.
// The external ledger must be readable before any restored account can serve.
export async function reconcileAccountRestore(
  pool,
  ledger,
  { isolated = false, snapshotCreatedAt, now = new Date() } = {},
) {
  const snapshot = new Date(snapshotCreatedAt);
  if (
    !isolated ||
    !Number.isFinite(snapshot.getTime()) ||
    snapshot > now ||
    now - snapshot > 30 * 86400000
  )
    throw Error(
      "Restore requires isolation and a snapshot within the supported 30-day window.",
    );
  if (!ledger)
    throw Error(
      "Independent suppression ledger unavailable; account traffic must remain disabled.",
    );
  const records = await ledger.records(),
    providerJobs = await ledger.providerJobs(),
    pending = [];
  const role = (
    await pool.query(
      `SELECT pg_has_role(current_user,c.relowner,'USAGE') AS owns_schema,r.rolsuper,r.rolbypassrls FROM pg_class c CROSS JOIN pg_roles r WHERE c.oid='account_schema_migrations'::regclass AND r.rolname=current_user`,
    )
  ).rows[0];
  if (!role?.owns_schema || (!role.rolsuper && !role.rolbypassrls))
    throw Error(
      "The isolated restore command requires the migration administrator with restore access to forced-RLS rows.",
    );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('mybookshelf-accounts-restore'))",
    );
    // Invalidate restored authentication and outstanding token mail globally.
    for (const table of [
      "account_mail_jobs",
      "account_email_challenges",
      "account_recent_proofs",
      "account_provider_intents",
      "session",
      "verification",
    ])
      await client.query('DELETE FROM "' + table + '"');
    for (const record of records) {
      if (record.suppressUntil && new Date(record.suppressUntil) <= now)
        continue;
      const existing = (
        await client.query("SELECT auth_user_id FROM app_users WHERE id=$1", [
          record.appUserId,
        ])
      ).rows[0];
      if (existing && existing.auth_user_id !== record.authUserId)
        throw Error("Suppression identity mismatch.");
      await client.query('DELETE FROM "user" WHERE id=$1', [record.authUserId]);
      const cleanedAt = record.cleanedAt ? new Date(record.cleanedAt) : now;
      await client.query(
        `INSERT INTO account_deletions(id,"authUserId","appUserId","receiptDigest",status,"requestedAt","cleanedAt","ledgerCompletedAt","availableAt") VALUES($1,$2,$3,$4,'cleaned',$5,$6,$7,$6)
    ON CONFLICT(id) DO UPDATE SET status='cleaned',"cleanedAt"=excluded."cleanedAt","ledgerCompletedAt"=excluded."ledgerCompletedAt","availableAt"=excluded."availableAt","leaseUntil"=NULL,"leaseOwner"=NULL`,
        [
          record.operationId,
          record.authUserId,
          record.appUserId,
          "0".repeat(64),
          record.requestedAt,
          cleanedAt,
          record.cleanedAt ? now : null,
        ],
      );
      if (!record.cleanedAt)
        pending.push({ ...record, id: record.operationId, cleanedAt });
    }
    for (const job of providerJobs) {
      if (new Date(job.expiresAt) <= now) continue;
      await client.query(
        `INSERT INTO account_provider_cleanup(id,"authUserId","deletionId",provider,payload,status,"availableAt","expiresAt","createdAt") VALUES($1,$2,$3,$4,$5,'queued',$6,$7,$8)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,status='queued',"availableAt"=excluded."availableAt","expiresAt"=excluded."expiresAt","leaseUntil"=NULL,"leaseOwner"=NULL`,
        [
          job.id,
          job.authUserId,
          job.deletionId,
          job.provider,
          job.payload,
          now,
          job.expiresAt,
          job.createdAt,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  for (const record of pending) {
    await ledger.persistCompletion(record);
    await pool.query(
      'UPDATE account_deletions SET "ledgerCompletedAt"=$2 WHERE id=$1',
      [record.id, now],
    );
  }
  return {
    suppressed: records.filter(
      (r) => !r.suppressUntil || new Date(r.suppressUntil) > now,
    ).length,
    providerJobs: providerJobs.length,
  };
}
