import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('mybookshelf-accounts-migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS account_schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = new URL('./migrations/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => /^\d+-[a-z-]+\.sql$/.test(f)).sort();
    for (const name of files) {
      const sql = await readFile(new URL(name, dir), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT checksum FROM account_schema_migrations WHERE name = $1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) throw new Error('An applied account migration changed.');
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO account_schema_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
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
