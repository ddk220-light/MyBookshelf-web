import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrateCatalog } from '../catalog-store/migrate.js';
import { createCatalogDatabase } from '../catalog-store/pool.js';
import { assertAdminRole } from './queries.js';
import { withTestSetupLock } from '../accounts/test-database.js';

// The admin role guard against a real database: a role that can become the
// table owner, or owns any table in the schema, is refused even when it holds
// no write grant itself. Disposable local *_test database only.
const connectionString = process.env.CATALOG_TEST_DATABASE_URL;
const skip = !connectionString && 'Set disposable local CATALOG_TEST_DATABASE_URL.';
// catalog-store/catalog.integration.test.js grants on, and truncates, the same
// tables in a parallel process; grant changes here wait for its setup.
const CATALOG_SETUP_LOCK = 'mybookshelf-catalog-test-setup';

test('the role guard refuses a NOINHERIT member of the owner role and the owner of any other table', { skip, timeout: 60_000 }, async t => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.endsWith('_test'), 'a disposable local *_test database only');
  const owner = new Pool({ connectionString, max: 1 });
  await migrateCatalog(owner);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const member = `admin_guard_member_${suffix}`, tableOwner = `admin_guard_owner_${suffix}`, probe = `admin_guard_probe_${suffix}`;
  const password = 'local-isolated-' + suffix;
  const ownerRole = (await owner.query('SELECT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.oid = $1::regclass', ['holdings_answers'])).rows[0].rolname;
  const pools = [];
  const as = role => { const target = new URL(connectionString); target.username = role; target.password = password; const db = createCatalogDatabase(target.href, { max: 1 }); pools.push(db); return db; };
  t.after(async () => {
    await Promise.all(pools.map(pool => pool.end()));
    await withTestSetupLock(owner, CATALOG_SETUP_LOCK, async c => {
      await c.query(`DROP TABLE IF EXISTS ${probe}`);
      for (const role of [member, tableOwner]) {
        await c.query(`DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}; REVOKE USAGE ON SCHEMA public FROM ${role}; DROP ROLE ${role}; END IF; END $$`);
      }
    });
    await owner.end();
  });
  await withTestSetupLock(owner, CATALOG_SETUP_LOCK, async c => {
    for (const role of [member, tableOwner]) {
      await c.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
    }
    // Can SET ROLE to the owner, but inherits nothing from it.
    await c.query(`GRANT ${ownerRole} TO ${member}`);
    // Owns one table that is not holdings_answers.
    await c.query(`CREATE TABLE ${probe} (id int)`);
    await c.query(`ALTER TABLE ${probe} OWNER TO ${tableOwner}`);
  });
  for (const role of [member, tableOwner]) {
    await assert.rejects(assertAdminRole(as(role)), { code: 'STORE_ROLE_REJECTED' }, role);
  }
});
