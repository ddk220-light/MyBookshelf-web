import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAccountAuth } from '../auth/auth.js';
import { createCredentialActions } from './credential-actions.js';
import { createAuthActions } from './auth-actions.js';
import { migrate } from '../db/migrate.js';
import { prepareTestRoles,testRoleURL } from './test-database.js';

const connectionString=process.env.ACCOUNT_TEST_DATABASE_URL;
test('fresh proof rotates the current session; password/reset notices and revocation commit atomically',{
 skip:!connectionString&&'Set disposable local ACCOUNT_TEST_DATABASE_URL.',timeout:30_000,
},async(t)=>{
 const url=new URL(connectionString);assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.endsWith('_test'));
 const admin=new Pool({connectionString});let pool;const emails=[`${randomUUID()}@example.test`];
 t.after(async()=>{
  await admin.query('DROP TRIGGER IF EXISTS test_security_mail_failure ON account_mail_jobs');await admin.query('DROP FUNCTION IF EXISTS test_security_mail_failure()');
  const ids=(await admin.query('SELECT id FROM "user" WHERE email=ANY($1::text[])',[emails])).rows.map(r=>r.id);
  await admin.query('DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])',[ids]);await admin.query('DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])',[ids]);
  await admin.query('DELETE FROM "user" WHERE email=ANY($1::text[])',[emails]);if(pool)await pool.end();await admin.end();
 });
 await migrate(admin);await prepareTestRoles(admin);pool=new Pool({connectionString:testRoleURL(connectionString,'auth'),max:4});
 const config={baseURL:'http://localhost:3000',secret:'only-test-auth-secret-longer-than-32-characters'+randomUUID(),jobSecret:'only-test-job-secret-longer-than-32-characters',mailFrom:'accounts@example.test',resendKey:'not-used',secureCookies:false};
 const verify=[],reset=[];const auth=createAccountAuth({pool,config,sendVerificationEmail:async d=>verify.push(d),sendResetPassword:async d=>reset.push(d)});
 let password=`a synthetic long password ${randomUUID()}`;const email=emails[0];
 await auth.api.signUpEmail({body:{email,name:'Synthetic reader',password}});await auth.api.verifyEmail({query:{token:verify[0].token}});
 const actions=createAuthActions({auth,pool,config,checkPassword:async()=>{}});const credentials=createCredentialActions({auth,pool,config,checkPassword:async()=>{}});
 const cookieHeaders=(reply)=>new Headers({cookie:reply.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),origin:config.baseURL});
 let headers=cookieHeaders(await auth.api.signInEmail({body:{email,password},returnHeaders:true}));
 const second=cookieHeaders(await auth.api.signInEmail({body:{email,password},returnHeaders:true}));
 const identity=async h=>{
  const value=await auth.api.getSession({headers:h});const user=(await pool.query('SELECT id FROM app_users WHERE auth_user_id=$1',[value.user.id])).rows[0];
  return{status:'authenticated',authUserId:value.user.id,sessionId:value.session.id,user:{id:user.id,email:value.user.email,name:value.user.name}};
 };
 // Prepare the private fence through the normal facade, not by accepting IDs.
 await actions.signin({email,password},'192.0.2.10',new Headers(),()=>{});
 const oldIdentity=await identity(headers);const changedCookies=[];
 const proof=await credentials.confirmPassword({password,action:'password-change'},oldIdentity,headers,c=>changedCookies.push(c));
 assert.equal(await auth.api.getSession({headers}),null);
 headers=new Headers({cookie:changedCookies.map(v=>v.split(';')[0]).join('; '),origin:config.baseURL});
 const fresh=await identity(headers);assert.notEqual(fresh.sessionId,oldIdentity.sessionId);
 const nextPassword=`another synthetic password ${randomUUID()}`,resultCookies=[];
 assert.deepEqual(await credentials.changePassword({password:nextPassword,currentPassword:password,proof:proof.proof},fresh,headers,c=>resultCookies.push(c)),{status:'password-updated'});
 assert.equal(await auth.api.getSession({headers:second}),null);password=nextPassword;
 headers=new Headers({cookie:resultCookies.map(v=>v.split(';')[0]).join('; '),origin:config.baseURL});
 const current=await identity(headers);
 await assert.rejects(credentials.changePassword({password:nextPassword+'x',currentPassword:password,proof:proof.proof},current,headers,()=>{}),e=>e.code==='RECENT_AUTH_REQUIRED');
 const known=await credentials.recover({email},'192.0.2.10');const unknown=await credentials.recover({email:`${randomUUID()}@example.test`},'192.0.2.10');assert.deepEqual(known,unknown);assert.equal(reset.length,1);
 await admin.query(`CREATE FUNCTION test_security_mail_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='passwordChanged' THEN RAISE EXCEPTION 'injected_security_mail_failure'; END IF; RETURN NEW; END $$`);
 await admin.query('CREATE TRIGGER test_security_mail_failure BEFORE INSERT ON account_mail_jobs FOR EACH ROW EXECUTE FUNCTION test_security_mail_failure()');
 const resetPassword=`reset synthetic password ${randomUUID()}`;
 await assert.rejects(credentials.reset({token:reset[0].token,password:resetPassword},'192.0.2.10'));
 assert.ok(await auth.api.getSession({headers}));
 assert.equal((await pool.query('SELECT 1 FROM verification WHERE identifier=$1',['reset-password:'+reset[0].token])).rowCount,1);
 await admin.query('DROP TRIGGER test_security_mail_failure ON account_mail_jobs');
 await credentials.reset({token:reset[0].token,password:resetPassword},'192.0.2.10');
 assert.equal(await auth.api.getSession({headers}),null);
 await assert.rejects(credentials.reset({token:reset[0].token,password:resetPassword},'192.0.2.10'),e=>e.code==='LINK_EXPIRED');
 assert.equal((await actions.signin({email,password:resetPassword},'192.0.2.10',new Headers(),()=>{})).status,'signed-in');
});
