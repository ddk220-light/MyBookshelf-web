import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAccountAuth } from '../auth/auth.js';
import { enqueueAccountMail, decryptMail } from '../jobs/mail.js';
import { migrate } from '../db/migrate.js';
import { prepareTestRoles, testRoleURL } from './test-database.js';
import { createAuthActions } from './auth-actions.js';

const connectionString=process.env.ACCOUNT_TEST_DATABASE_URL;
test('signup facade queues durable mail, hides duplicates, requires deliberate one-use verification and returns no session token',{
 skip:!connectionString&&'Set disposable local ACCOUNT_TEST_DATABASE_URL.',timeout:30_000,
},async(t)=>{
 const url=new URL(connectionString);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.endsWith('_test'));
 const admin=new Pool({connectionString});let pool;const email=`${randomUUID()}@example.test`;
 t.after(async()=>{await admin.query('DELETE FROM "user" WHERE email=$1',[email]);if(pool)await pool.end();await admin.end();});
 await migrate(admin);await prepareTestRoles(admin);
 pool=new Pool({connectionString:testRoleURL(connectionString,'auth'),max:4});
 const config={baseURL:'http://localhost:3000',secret:'only-test-auth-secret-more-than-32-characters'+randomUUID(),jobSecret:'only-test-jobs-secret-more-than-32-characters',resendKey:'test-key-not-used',mailFrom:'accounts@example.test',secureCookies:false};
 let auth;auth=createAccountAuth({pool,config,sendVerificationEmail:(d)=>enqueueAccountMail(auth,config,'verify',d,d.token),onExistingUserSignUp:(d)=>enqueueAccountMail(auth,config,'duplicate',d)});
 const actions=createAuthActions({auth,pool,config,checkPassword:async()=>{}});
 const body={email,name:'Private reader',password:`a unique long password ${randomUUID()}`};
 const first=await actions.signup(body,'192.0.2.5');const second=await actions.signup(body,'192.0.2.5');assert.deepEqual(first,second);
 assert.ok(!JSON.stringify(first).includes(email));assert.ok(!JSON.stringify(first).includes('token'));
 await assert.rejects(actions.signin({email,password:body.password},'192.0.2.5',new Headers(),()=>{}));
 const job=(await pool.query(`SELECT j.* FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId" WHERE u.email=$1 AND kind='verify'`,[email])).rows[0];
 const token=decryptMail(job.payload,config.jobSecret).token;
 assert.equal((await pool.query('SELECT "emailVerified" FROM "user" WHERE email=$1',[email])).rows[0].emailVerified,false);
 assert.deepEqual(await actions.verify({token}),{status:'verified'});
 await assert.rejects(actions.verify({token}),e=>e.code==='LINK_EXPIRED');
 const cookies=[];const signed=await actions.signin({email,password:body.password,returnTo:'//attacker.test'},'192.0.2.5',new Headers(),c=>cookies.push(c));
 assert.equal(signed.returnTo,'/app/shelf');assert.equal(signed.status,'signed-in');assert.ok(cookies.length);
 assert.ok(!JSON.stringify(signed).includes('token'));
 const uid=(await pool.query('SELECT id FROM "user" WHERE email=$1',[email])).rows[0].id;
 await pool.query('DELETE FROM account_mail_jobs WHERE "authUserId"=$1',[uid]);await pool.query('DELETE FROM account_email_challenges WHERE "authUserId"=$1',[uid]);
});
