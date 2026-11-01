import { readFile } from 'node:fs/promises';

// Only called after each integration suite checks its disposable local *_test URL.
export async function prepareTestRoles(admin) {
  const c = await admin.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('mybookshelf-test-roles'))");
    await c.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='mybookshelf_reading') THEN CREATE ROLE mybookshelf_reading LOGIN PASSWORD 'local-isolated-reading-tests' NOSUPERUSER NOBYPASSRLS NOCREATEROLE; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='mybookshelf_auth') THEN CREATE ROLE mybookshelf_auth LOGIN PASSWORD 'local-isolated-auth-tests' NOSUPERUSER NOBYPASSRLS NOCREATEROLE; END IF;
      END $$`);
    await c.query(await readFile(new URL('../db/runtime-grants.sql', import.meta.url), 'utf8'));
    await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}

export function testRoleURL(connectionString, role) {
  const url = new URL(connectionString);
  url.username = `mybookshelf_${role}`;
  url.password = `local-isolated-${role}-tests`;
  return url.href;
}
