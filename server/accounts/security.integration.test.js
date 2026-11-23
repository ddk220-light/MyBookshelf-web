import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../db/migrate.js';
import { prepareTestRoles, testRoleURL } from './test-database.js';
import { consumeLimits } from './security.js';

const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test('two independent instances share bounded DB abuse counters without raw identity data', {
  skip: !connectionString && 'Set a disposable local ACCOUNT_TEST_DATABASE_URL.', timeout: 20_000,
}, async (t) => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname.endsWith('_test'));
  const admin = new Pool({ connectionString }); let a, b;
  t.after(async () => { if (a) await a.end(); if (b) await b.end(); await admin.end(); });
  await migrate(admin); await prepareTestRoles(admin);
  a = new Pool({ connectionString: testRoleURL(connectionString, 'auth'), max: 1 });
  b = new Pool({ connectionString: testRoleURL(connectionString, 'auth'), max: 1 });
  const subject = `${randomUUID()}@example.test`, secret = randomUUID();
  const rule = [{ scope: 'test-sign-in', subject, max: 2, seconds: 60 }];
  const results = await Promise.allSettled([a,b,a,b].map((p) => consumeLimits(p, secret, rule)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
  for (const r of results.filter((r) => r.status === 'rejected')) {
    assert.equal(r.reason.status, 429); assert.ok(r.reason.retryAfter > 0);
  }
  const rows = (await admin.query('SELECT bucket,count FROM account_rate_buckets')).rows;
  assert.ok(rows.every((r) => /^[a-f0-9]{64}$/.test(r.bucket)));
  assert.ok(!JSON.stringify(rows).includes(subject));
  assert.ok(rows.some((r) => r.count === 3));
});
