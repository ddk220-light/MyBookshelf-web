import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const ACCOUNT_MIGRATIONS = Object.freeze({
  directory: new URL('./migrations/', import.meta.url),
  lock: 'mybookshelf-accounts-migrations',
  table: 'account_schema_migrations',
  label: 'account',
});

// One runner for every database: a migrations directory, an advisory lock
// name and a migrations table. Defaults to the account database; the catalog
// store passes its own (catalog-store/migrate.js).
export async function migrate(pool, { directory = ACCOUNT_MIGRATIONS.directory, lock = ACCOUNT_MIGRATIONS.lock,
  table = ACCOUNT_MIGRATIONS.table, label = ACCOUNT_MIGRATIONS.label } = {}) {
  if (!/^[a-z_]{1,63}$/.test(table)) throw new Error('Invalid migrations table name.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lock]);
    await client.query(`CREATE TABLE IF NOT EXISTS ${table} (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await readdir(directory)).filter((f) => /^\d+-[a-z-]+\.sql$/.test(f)).sort();
    for (const name of files) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(`SELECT checksum FROM ${table} WHERE name = $1`, [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error(`An applied ${label} migration changed.`);
        continue;
      }
      await client.query(sql);
      await client.query(`INSERT INTO ${table} (name, checksum) VALUES ($1, $2)`, [name, checksum]);
    }
    await client.query('COMMIT');
    return files.length;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.ACCOUNTS_MIGRATION_DATABASE_URL) throw new Error('ACCOUNTS_MIGRATION_DATABASE_URL is required. Runtime credentials are never used for migrations.');
  const pool = new Pool({ connectionString: process.env.ACCOUNTS_MIGRATION_DATABASE_URL });
  try { console.log(`Account migration set ready (${await migrate(pool)} migrations).`); }
  catch { console.error('Account migration failed; no credentials or database details are logged.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
