import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAccountAuth } from '../auth/auth.js';
import { enqueueAccountMail, decryptMail, encryptMail, runMailBatch } from '../jobs/mail.js';
import { migrate } from '../db/migrate.js';
import { prepareTestRoles, testRoleURL } from './test-database.js';

const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test('durable mail joins signup transaction; two workers lease, retry idempotently and purge ciphertext', {
  skip: !connectionString && 'Set disposable local ACCOUNT_TEST_DATABASE_URL.', timeout: 30_000,
}, async (t) => {
  const url = new URL(connectionString);assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname.endsWith('_test'));
  const admin = new Pool({ connectionString });let pool;
  const ownedIds=[];
  t.after(async () => {
    for (const id of ownedIds) {
      await admin.query('DELETE FROM account_mail_jobs WHERE "authUserId"=$1',[id]);
      await admin.query('DELETE FROM account_email_challenges WHERE "authUserId"=$1',[id]);
      await admin.query('DELETE FROM "user" WHERE id=$1',[id]);
    }
    if (pool) await pool.end(); await admin.end();
  });
  await migrate(admin);await prepareTestRoles(admin);
  pool = new Pool({ connectionString: testRoleURL(connectionString, 'auth'), max: 4 });
  const config = { baseURL: 'http://localhost:3000', secret: 'only-test-auth-secret-with-32-characters', jobSecret: 'only-test-job-secret-with-32-characters', secureCookies: false };
  let failingAuth;
  const email = `${randomUUID()}@example.test`;
  failingAuth = createAccountAuth({ pool, config, databaseHooks: { account: { create: { before: async (account) => {
    ownedIds.push(account.userId);
    await enqueueAccountMail(failingAuth, config, 'duplicate', { user: { id: account.userId, email, name: 'Synthetic reader' } });
    throw Error('injected transaction failure after enqueue');
  } } } } });
  await assert.rejects(failingAuth.api.signUpEmail({ body: { email, name: 'Synthetic reader', password: 'a long unique synthetic test password' } }));
  assert.equal((await admin.query('SELECT 1 FROM "user" WHERE email=$1', [email])).rowCount, 0);
  // All jobs/challenges from the failed signup rolled back with auth rows.
  assert.equal((await admin.query('SELECT 1 FROM account_mail_jobs WHERE \"authUserId\"=$1',[ownedIds[0]])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM account_email_challenges WHERE \"authUserId\"=$1',[ownedIds[0]])).rowCount, 0);
  let auth;
  auth = createAccountAuth({ pool, config, sendVerificationEmail: (data) => enqueueAccountMail(auth, config, 'verify', data, data.token) });
  const signup=await auth.api.signUpEmail({ body: { email, name: 'Synthetic reader', password: 'a long unique synthetic test password' } });
  ownedIds.push(signup.user.id);
  const { rows: [job] } = await pool.query('SELECT * FROM account_mail_jobs WHERE \"authUserId\"=$1',[signup.user.id]);
  assert.ok(!job.payload.includes(email));
  const payload = decryptMail(job.payload, config.jobSecret);assert.equal(payload.to, email);
  assert.ok(payload.token);assert.ok(!JSON.stringify(job).includes(payload.token));
  assert.throws(() => decryptMail(job.payload, 'a different key with more than 32 characters'));
  let attempts = 0;const ids = [];
  const send = async (claimed, rendered) => { attempts++;ids.push(claimed.id);assert.equal(rendered.to,email);assert.ok(rendered.html.includes('/app/account/verify?token='));if (attempts===1) throw Error('provider response lost'); };
  await Promise.all([runMailBatch(pool, config, { transport: send, jobId: job.id }),runMailBatch(pool, config, { transport: send, jobId: job.id })]);
  assert.equal(attempts,1);
  await pool.query('UPDATE account_mail_jobs SET "availableAt"=now() WHERE id=$1', [job.id]);
  await runMailBatch(pool, config, { transport: send, jobId: job.id });
  assert.equal(attempts,2);assert.equal(ids[0],ids[1]);
  const done=(await pool.query('SELECT status,payload FROM account_mail_jobs WHERE id=$1',[job.id])).rows[0];
  assert.equal(done.status,'sent');assert.equal(done.payload,'');
  const expired = encryptMail(payload,config.jobSecret),expiredId=randomUUID();
  await pool.query(`INSERT INTO account_mail_jobs(id,kind,payload,status,attempts,"authUserId","availableAt","expiresAt","createdAt") VALUES ($1,'verify',$2,'queued',0,$3,now(),now()-interval '1 second',now())`,[expiredId,expired,signup.user.id]);
  await runMailBatch(pool, config, { jobId:expiredId,transport: async () => { throw Error('expired job must never send'); } });
  assert.equal((await pool.query("SELECT 1 FROM account_mail_jobs WHERE id=$1 AND status='expired' AND payload=''",[expiredId])).rowCount,1);
  await admin.query('DELETE FROM "user" WHERE email=$1',[email]);

});
