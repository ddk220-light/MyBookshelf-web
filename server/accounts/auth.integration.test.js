import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createApplication } from '../application.js';
import { createAccountMiddleware } from './middleware.js';
import { toNodeHandler } from 'better-auth/node';
import { createAccountAuth } from '../auth/auth.js';
import { createAccountService } from './service.js';
import { migrate } from '../db/migrate.js';
import { prepareTestRoles, testRoleURL } from './test-database.js';

const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;

test('pinned auth: real Postgres transactions, raw Express body, verification, cookie revocation and reset rollback', {
  skip: !connectionString && 'Set ACCOUNT_TEST_DATABASE_URL to a disposable local *_test database.', timeout: 60_000,
}, async (t) => {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && target.pathname.endsWith('_test'), 'Integration suite requires a disposable local *_test database.');
  const pool = new Pool({ connectionString, max: 4 });
  let service;
  t.after(async () => {
    await pool.query('DROP TRIGGER IF EXISTS account_test_password_failure ON "account"');
    await pool.query('DROP FUNCTION IF EXISTS account_test_fail_password()');
    if (service) await service.close();
    await pool.end();
  });
  await migrate(pool); await migrate(pool);
  await prepareTestRoles(pool);
  const verification = [], resets = [];
  const config = { baseURL: 'http://localhost:3000', secret: 'integration-only-secret-32-characters-long-not-for-deployment', secureCookies: false, databaseURL: connectionString };
  const auth = createAccountAuth({ pool, config,
    sendVerificationEmail: async (value) => { verification.push(value); },
    sendResetPassword: async (value) => { resets.push(value); } });
  const raw = express();
  raw.all('/api/auth/*', toNodeHandler(auth)); // No JSON parser before the auth handler.
  const email = `reader-${randomUUID()}@example.test`, oldPassword = `old-password-${randomUUID()}`, newPassword = `new-password-${randomUUID()}`;
  const started = performance.now();
  const signup = await request(raw).post('/api/auth/sign-up/email').set('Origin', config.baseURL)
    .send({ email, name: 'Private reader', password: oldPassword });
  assert.equal(signup.status, 200); assert.equal(signup.body.token, null); assert.equal(verification.length, 1);
  t.diagnostic(`Signup/hash duration: ${Math.round(performance.now() - started)}ms (local, one operation).`);
  const denied = await request(raw).post('/api/auth/sign-in/email').set('Origin', config.baseURL).send({ email, password: oldPassword });
  assert.equal(denied.status, 403);
  await auth.api.verifyEmail({ query: { token: verification[0].token } });
  const signin = await request(raw).post('/api/auth/sign-in/email').set('Origin', config.baseURL).send({ email, password: oldPassword });
  assert.equal(signin.status, 200);
  const cookie = signin.headers['set-cookie'].map((v) => v.split(';')[0]).join('; ');
  assert.match(cookie, /mybookshelf_auth/); assert.ok(!cookie.includes('mb_session='));
  assert.match(signin.headers['set-cookie'].join(';'), /HttpOnly/);
  assert.match(signin.headers['set-cookie'].join(';'), /SameSite=Lax/i);
  const headers = new Headers({ cookie, origin: config.baseURL });
  await assert.rejects(createAccountService(config), /role is not isolated/);
  service = await createAccountService({ ...config, databaseURL: testRoleURL(connectionString, 'auth') });
  const app = createApplication({ accounts: createAccountMiddleware({
    env: { ACCOUNTS_ENABLED: 'true', ACCOUNTS_ENVIRONMENT: 'development', BETTER_AUTH_URL: config.baseURL,
      BETTER_AUTH_SECRET: config.secret, ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(connectionString, 'auth') },
    initialize: async () => service,
  }) });
  assert.equal((await request(app).get('/api/auth/ok')).status, 200);
  const bootstrap = await request(app).get('/api/account/session').set('Cookie', cookie).set('Origin', config.baseURL);
  assert.equal(bootstrap.status, 200); assert.equal(bootstrap.body.status, 'authenticated');
  assert.ok(!bootstrap.text.includes(signin.body.token));
  const session = await service.session(headers);
  assert.equal(session.status, 'authenticated'); assert.equal(session.user.email, email);
  assert.ok(!JSON.stringify(session).includes(signin.body.token));
  const hostile = await request(raw).post('/api/auth/sign-in/email').set('Origin', 'https://attacker.test').send({ email, password: oldPassword });
  assert.equal(hostile.status, 403);

  await auth.api.requestPasswordReset({ body: { email, redirectTo: '/app/account/reset-password' } });
  assert.equal(resets.length, 1);
  // A DB failure after reset-token consumption and session deletion must roll
  // back all three effects, not spend the token and strand the reader.
  await pool.query(`CREATE OR REPLACE FUNCTION account_test_fail_password() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected password update failure'; END $$`);
  await pool.query('CREATE TRIGGER account_test_password_failure BEFORE UPDATE OF password ON "account" FOR EACH ROW EXECUTE FUNCTION account_test_fail_password()');
  await assert.rejects(auth.api.resetPassword({ body: { token: resets[0].token, newPassword } }));
  assert.ok(await auth.api.getSession({ headers }));
  assert.equal((await pool.query('SELECT 1 FROM verification WHERE identifier=$1', [`reset-password:${resets[0].token}`])).rowCount, 1);
  await pool.query('DROP TRIGGER account_test_password_failure ON "account"');
  await auth.api.resetPassword({ body: { token: resets[0].token, newPassword } });
  assert.equal(await auth.api.getSession({ headers }), null);
  assert.deepEqual(await service.session(headers), { status: 'guest' });
  await assert.rejects(auth.api.resetPassword({ body: { token: resets[0].token, newPassword: oldPassword } }));
  // The pinned library applies a shared DB-backed default sensitive-route
  // limiter. Clear only this disposable test database's counters before the
  // remaining credential checks; do not disable the production limiter.
  assert.ok((await pool.query('SELECT 1 FROM "rateLimit"')).rowCount > 0);
  await pool.query('DELETE FROM "rateLimit"');
  const oldLogin = await request(raw).post('/api/auth/sign-in/email').set('Origin', config.baseURL).send({ email, password: oldPassword });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request(raw).post('/api/auth/sign-in/email').set('Origin', config.baseURL).send({ email, password: newPassword });
  assert.equal(newLogin.status, 200);
  // Renewal must forward the refreshed cookie through the narrow facade.
  const renewedSession = await auth.api.getSession({ headers: new Headers({ cookie: newLogin.headers['set-cookie'].map((v) => v.split(';')[0]).join('; ') }) });
  await pool.query(`UPDATE "session" SET "updatedAt"=now()-interval '2 days', "expiresAt"=now()+interval '5 days' WHERE id=$1`, [renewedSession.session.id]);
  const renewal = await request(app).get('/api/account/session').set('Cookie', newLogin.headers['set-cookie'].map((v) => v.split(';')[0]).join('; '));
  assert.equal(renewal.status, 200); assert.ok(renewal.headers['set-cookie']?.some((v) => v.includes('mybookshelf_auth')));

  // Application identity provisioning is idempotent and cannot revive deleting users.
  const newCookie = newLogin.headers['set-cookie'].map((v) => v.split(';')[0]).join('; ');
  const newHeaders = new Headers({ cookie: newCookie, origin: config.baseURL });
  const [identityA, identityB] = await Promise.all([service.session(newHeaders), service.session(newHeaders)]);
  assert.equal(identityA.user.id, identityB.user.id);
  await pool.query("UPDATE app_users SET status='deleting' WHERE id=$1", [identityA.user.id]);
  assert.deepEqual(await service.session(newHeaders), { status: 'unavailable' });
  await pool.query("UPDATE app_users SET status='active' WHERE id=$1", [identityA.user.id]);
  const current = await auth.api.getSession({ headers: newHeaders });
  await pool.query(`UPDATE "session" SET "createdAt"=now()-interval '31 days' WHERE id=$1`, [current.session.id]);
  assert.deepEqual(await service.session(newHeaders), { status: 'guest' });
  await pool.query('DELETE FROM "user" WHERE email=$1', [email]);
});
