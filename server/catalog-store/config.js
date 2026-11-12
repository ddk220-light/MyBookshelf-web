// Catalog store settings (plan 3.6, 4.1). Names only in .env.example; values
// live in hosting configuration, marked Sensitive. Nothing here is logged.
//
//   CATALOG_STORE_ENABLED        'true' to use the database (with CATALOG_DATABASE_URL)
//   CATALOG_DATABASE_URL         runtime role (catalog_runtime), pooled connection string
//   CATALOG_WORKER_DATABASE_URL  daily maintenance job (catalog_worker)
//   CATALOG_MIGRATION_DATABASE_URL  operator machine only, never deployed
//   CATALOG_BUCKET_SECRET        HMAC key for anonymous submission limits (32+ chars)
//   USAGE_LOG_ENABLED            'true' to write the anonymous operational log
//                                (off until the new privacy text is published)
//   HOLDINGS_BACKGROUND_ENABLED  'false' turns result marking off (kill switch)
//   CRON_SECRET                  Bearer secret Vercel Cron sends to the daily job
//
// Without the database the server still works: answers and the health record
// stay in this instance's memory, the log is dropped and submissions are
// accepted and held in a small in-memory list.

const flag = value => String(value ?? '').trim().toLowerCase() === 'true';
const text = value => {
  const result = String(value ?? '').trim();
  return result || null;
};

export function readCatalogStoreConfig(env = process.env) {
  const databaseUrl = text(env.CATALOG_DATABASE_URL);
  const bucketSecret = text(env.CATALOG_BUCKET_SECRET);
  return Object.freeze({
    storeEnabled: flag(env.CATALOG_STORE_ENABLED) && Boolean(databaseUrl),
    databaseUrl,
    workerDatabaseUrl: text(env.CATALOG_WORKER_DATABASE_URL),
    // A short secret is not used: limits then fall back to this instance.
    bucketSecret: bucketSecret && bucketSecret.length >= 32 ? bucketSecret : null,
    usageLogEnabled: flag(env.USAGE_LOG_ENABLED),
    backgroundChecksEnabled: String(env.HOLDINGS_BACKGROUND_ENABLED ?? '').trim().toLowerCase() !== 'false',
    cronSecret: text(env.CRON_SECRET),
  });
}
