import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApplication } from '../application.js';
import { createAccountMiddleware } from './middleware.js';
import { readAccountConfig, AccountConfigurationError } from './config.js';

const enabled = { ACCOUNTS_ENABLED: 'true', ACCOUNTS_ENVIRONMENT: 'development', BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'test-only-account-secret-with-more-than-32-characters', ACCOUNTS_AUTH_DATABASE_URL: 'postgres://test:test@localhost/accounts_test' };

test('account configuration rejects unsafe origins, preview production access and incomplete secrets', () => {
  assert.deepEqual(readAccountConfig({}), { enabled: false });
  assert.equal(readAccountConfig(enabled).baseURL, 'http://localhost:3000');
  for (const invalid of [ { BETTER_AUTH_URL: 'https://user:password@example.test' }, { BETTER_AUTH_URL: 'https://example.test/path' },
    { BETTER_AUTH_URL: 'http://example.test' }, { BETTER_AUTH_URL: 'https://*.vercel.app' },
    { BETTER_AUTH_SECRET: 'short' }, { ACCOUNTS_AUTH_DATABASE_URL: 'https://example.test' },
    { NODE_ENV: 'production' }, { VERCEL_ENV: 'preview', ACCOUNTS_ENVIRONMENT: 'production' } ]) {
    assert.throws(() => readAccountConfig({ ...enabled, ...invalid }), AccountConfigurationError);
  }
});

test('public catalog never initializes accounts; disabled accounts fail privately', async () => {
  let calls = 0;
  const app = createApplication({ accounts: createAccountMiddleware({ env: {}, initialize: async () => { calls++; throw Error(); } }) });
  assert.equal((await request(app).get('/api/health')).status, 200);
  const catalog = await request(app).post('/api/v2/libraries/search').send({ query: 'Chennai' });
  assert.equal(catalog.status, 200); assert.equal(catalog.headers['set-cookie'], undefined);
  const response = await request(app).get('/api/account/session');
  assert.equal(response.status, 503); assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.equal(response.body.error.code, 'ACCOUNT_DISABLED');
  assert.equal(response.headers['x-robots-tag'], 'noindex'); assert.equal(calls, 0);
  assert.equal((await request(app).post('/api/auth/login').send({})).status, 410);
});

test('database initialization failures are bounded and retry without blocking public routes', async () => {
  let calls = 0;
  const app = createApplication({ accounts: createAccountMiddleware({ env: enabled, retryAfterMs: 60_000,
    initialize: async () => { calls++; throw Error('sensitive connection string'); } }) });
  const response = await request(app).get('/api/auth/ok');
  assert.equal(response.status, 503); assert.ok(!response.text.includes('sensitive'));
  assert.equal(response.body.error.code, 'ACCOUNT_UNAVAILABLE');
  assert.equal((await request(app).get('/api/account/session')).status, 503); assert.equal(calls, 1);
  assert.equal((await request(app).get('/api/health')).status, 200);
});

test('sensitive raw routes remain gated; origin rejects precede database work', async () => {
  let calls = 0;
  const app = createApplication({ accounts: createAccountMiddleware({ env: enabled, initialize: async () => {
    calls++; return { session: async () => ({ status: 'guest' }) };
  } }) });
  for (const path of ['/api/auth/sign-up/email', '/api/auth/change-password', '/api/auth/get-session']) {
    assert.equal((await request(app).post(path).send({})).status, 503);
  }
  for(const path of ['/api/account/export','/api/account/deletion','/api/account/deletion/status'])assert.equal((await request(app).post(path).send({})).status,403);
  assert.equal((await request(app).get('/api/account/session').set('Origin', 'https://attacker.test')).status, 403);
  assert.equal(calls, 0);
  assert.deepEqual((await request(app).get('/api/account/session').set('Origin', enabled.BETTER_AUTH_URL)).body, { status: 'guest' });
});
