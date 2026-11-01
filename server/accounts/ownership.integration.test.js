import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../db/migrate.js';
import { prepareTestRoles, testRoleURL } from './test-database.js';
import { withOwner, assertReadingRole } from '../db/owner-transaction.js';

const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;

test('real roles: RLS, pooled context, transaction rollback, private metadata and maximum keys', {
  skip: !connectionString && 'Set ACCOUNT_TEST_DATABASE_URL to a disposable local *_test database.', timeout: 30_000,
}, async (t) => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.endsWith('_test'));
  const users = [randomUUID(), randomUUID()];
  const admin = new Pool({ connectionString }); let reader, auth;
  t.after(async () => {
    for (const id of users) await admin.query('DELETE FROM \"user\" WHERE id=$1', [id]);
    if (reader) await reader.end(); if (auth) await auth.end(); await admin.end();
  });
  await migrate(admin); await migrate(admin);
  await prepareTestRoles(admin);
  reader = new Pool({ connectionString: testRoleURL(connectionString, 'reading'), max: 1 });
  auth = new Pool({ connectionString: testRoleURL(connectionString, 'auth'), max: 1 });
  await assertReadingRole(reader); await assert.rejects(assertReadingRole(admin));
  await assert.rejects(reader.query('SELECT * FROM "account"'));
  await assert.rejects(auth.query('SELECT * FROM user_books'));
  for (const id of users) {
    await auth.query('INSERT INTO "user" (id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,true,now())', [id, 'Synthetic reader', `${id}@example.test`]);
    await auth.query('INSERT INTO app_users(id,auth_user_id) VALUES ($1::uuid,$1::text)', [id]);
    await auth.query('INSERT INTO user_settings(user_id) VALUES ($1)', [id]);
  }
  assert.equal((await reader.query('SELECT * FROM app_users')).rowCount, 0);
  const key = 'vpl:' + 'a'.repeat(4092);
  const digest = createHash('sha256').update(key).digest();
  const ref = (await reader.query('INSERT INTO book_refs(book_key,key_digest) VALUES ($1,$2) RETURNING id', [key, digest])).rows[0].id;
  await withOwner(reader, users[0], async (c) => {
    await c.query('INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES ($1,$2,$3)', [users[0], ref, { title: 'A private hint' }]);
    assert.equal((await c.query('SELECT * FROM user_books')).rowCount, 1);
    await assert.rejects(c.query('INSERT INTO user_books(user_id,reference_id) VALUES ($1,$2)', [users[1], ref]));
    // The denied statement aborts this transaction; outer helper must roll back.
  }).catch((e) => { assert.match(e.message, /aborted|transaction/i); });
  // A failed transaction cannot leak a partial save or owner context.
  assert.equal((await reader.query('SELECT * FROM user_books')).rowCount, 0);
  await withOwner(reader, users[0], async (c) => {
    await c.query('INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES ($1,$2,$3)', [users[0], ref, { title: 'A private hint' }]);
  });
  await withOwner(reader, users[1], async (c) => {
    assert.equal((await c.query('SELECT * FROM user_books')).rowCount, 0);
    await c.query('INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES ($1,$2,$3)', [users[1], ref, { title: 'B private hint' }]);
    assert.equal((await c.query('SELECT display_snapshot FROM user_books')).rows[0].display_snapshot.title, 'B private hint');
  });
  assert.equal((await reader.query('SELECT * FROM user_books')).rowCount, 0);
  assert.deepEqual((await reader.query('SELECT provider_metadata FROM book_refs WHERE id=$1', [ref])).rows[0].provider_metadata, {});
  await assert.rejects(withOwner(reader, users[0], async (c) => {
    await c.query('UPDATE user_settings SET revision=99 WHERE user_id=$1', [users[0]]); throw Error('forced rollback');
  }), /forced rollback/);
  await withOwner(reader, users[0], async (c) => assert.equal((await c.query('SELECT revision FROM user_settings')).rows[0].revision, '0'));
  await auth.query("UPDATE app_users SET status='deleting' WHERE id=$1", [users[0]]);
  await assert.rejects(withOwner(reader, users[0], async () => { throw Error('must not run'); }), /unavailable/);
  await admin.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [users]);
  await admin.query('DELETE FROM book_refs WHERE id=$1', [ref]);
});
