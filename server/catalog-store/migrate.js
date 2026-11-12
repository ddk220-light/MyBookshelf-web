import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { migrate } from '../db/migrate.js';

// `npm run catalog:migrate --workspace=server`, from an operator machine with
// the catalog owner role (CATALOG_MIGRATION_DATABASE_URL). Runtime, worker
// and admin credentials are never used for migrations. Apply
// catalog-store/runtime-grants.sql afterwards with the same role.
export const CATALOG_MIGRATIONS = Object.freeze({
  directory: new URL('./migrations/', import.meta.url),
  lock: 'mybookshelf-catalog-migrations',
  table: 'catalog_schema_migrations',
  label: 'catalog',
});

export function migrateCatalog(pool) {
  return migrate(pool, CATALOG_MIGRATIONS);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.CATALOG_MIGRATION_DATABASE_URL) throw new Error('CATALOG_MIGRATION_DATABASE_URL is required. Runtime credentials are never used for migrations.');
  const pool = new Pool({ connectionString: process.env.CATALOG_MIGRATION_DATABASE_URL });
  try { console.log(`Catalog migration set ready (${await migrateCatalog(pool)} migrations).`); }
  catch { console.error('Catalog migration failed; no credentials or database details are logged.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
