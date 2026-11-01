import { createRequire } from "node:module";
import { createDeletionLedger } from "../../server/jobs/deletion-ledger.js";
import { reconcileAccountRestore } from "../../server/jobs/restore.js";
const require = createRequire(
    new URL("../../server/package.json", import.meta.url),
  ),
  { Pool } = require("pg");
if (
  process.env.ACCOUNTS_RESTORE_ISOLATED !== "true" ||
  process.env.ACCOUNTS_ENABLED === "true" ||
  !process.env.ACCOUNTS_MIGRATION_DATABASE_URL
)
  throw Error(
    "An isolated, migrated restore and disabled account traffic are required.",
  );
const pool = new Pool({
  connectionString: process.env.ACCOUNTS_MIGRATION_DATABASE_URL,
});
try {
  const result = await reconcileAccountRestore(
    pool,
    createDeletionLedger({
      deletionLedgerToken:
        process.env.ACCOUNTS_DELETION_LEDGER_READ_WRITE_TOKEN,
    }),
    {
      isolated: true,
      snapshotCreatedAt: process.env.ACCOUNTS_RESTORE_SNAPSHOT_CREATED_AT,
    },
  );
  console.log(
    "Isolated account restore reconciled:",
    result.suppressed,
    "suppression records;",
    result.providerJobs,
    "encrypted provider jobs. Validate before enabling traffic.",
  );
} catch {
  console.error(
    "Restore reconciliation failed. Keep restored account traffic disabled. No credentials or account values are logged.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
