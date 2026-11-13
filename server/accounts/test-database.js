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
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='mybookshelf_worker') THEN CREATE ROLE mybookshelf_worker LOGIN PASSWORD 'local-isolated-worker-tests' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT; END IF;
      END $$`);
    await c.query(await readFile(new URL('../db/runtime-grants.sql', import.meta.url), 'utf8'));
    await c.query('COMMIT');
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}

// Test files run in parallel processes against one disposable database.
// Statements that rewrite shared catalog rows (GRANT/REVOKE on every table,
// role changes, TRUNCATE) fail with "tuple concurrently updated" or a
// deadlock when two files run them at once, so they take this lock first.
export async function withTestSetupLock(pool, name, work) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [name]);
    const value = await work(c);
    await c.query('COMMIT');
    return value;
  } catch (error) { await c.query('ROLLBACK').catch(() => {}); throw error; }
  finally { c.release(); }
}

export function testRoleURL(connectionString, role) {
  const url = new URL(connectionString);
  url.username = `mybookshelf_${role}`;
  url.password = `local-isolated-${role}-tests`;
  return url.href;
}
