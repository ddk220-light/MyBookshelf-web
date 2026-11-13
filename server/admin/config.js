// Owner-only admin view settings (plan section 6). Names only in .env.example;
// values live in hosting configuration, marked Sensitive. Nothing here is logged.
//
//   ADMIN_ACCOUNT_IDS           comma list of MyBookshelf account IDs (the `user.id`
//                               that /api/account/session returns when signed in)
//                               allowed to open /app/admin. Empty: nobody can.
//   CATALOG_ADMIN_DATABASE_URL  the catalog store's admin role (catalog_admin):
//                               reads every table and updates only request and
//                               report status/notes and health acknowledgements.
//                               Never the runtime, worker or owner role.

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function readAdminConfig(env = process.env) {
  const ids = String(env.ADMIN_ACCOUNT_IDS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(value => ACCOUNT_ID.test(value));
  const databaseUrl = String(env.CATALOG_ADMIN_DATABASE_URL ?? '').trim() || null;
  return Object.freeze({ accountIds: Object.freeze([...new Set(ids)]), databaseUrl });
}
