import { randomBytes, randomUUID } from 'node:crypto';
import { AccountRequestError, consumeLimits, csrfForSession } from './security.js';
import { strictObject, emailAddress, accountPassword, accountToken, checkCompromisedPassword } from './validation.js';
import { enqueueAccountMail, challengeDigest } from '../jobs/mail.js';
import { authTransaction } from '../auth/transaction.js';

const proofActions = new Set(['password-change','password-setup','email-change','provider-link','provider-unlink','export','delete','signout-all','session-revoke']);
export function createCredentialActions({auth,pool,config,checkPassword=checkCompromisedPassword}) {
  const userByEmail=async(email)=>(await pool.query('SELECT id,email,name,"emailVerified" FROM "user" WHERE email=$1',[email])).rows[0];
  const requireMail=()=>{if(!config.jobSecret?.length||!config.mailFrom||!config.resendKey)throw new AccountRequestError(503,'MAIL_UNAVAILABLE','Account email is temporarily unavailable.');};
  const confirmAction=(action)=>{if(!proofActions.has(action))throw new AccountRequestError(422,'INVALID_ACTION','Choose a valid account action.');return action;};
  const consumeProof=async(adapter,identity,proof,action)=>{
    accountToken(proof);
    const count=await adapter.updateMany({model:'recentProof',where:[
      {field:'digest',value:challengeDigest(proof)},{field:'authUserId',value:identity.authUserId},
      {field:'sessionId',value:identity.sessionId},{field:'action',value:action},
      {field:'expiresAt',operator:'gt',value:new Date()},{field:'verifiedAt',operator:'ne',value:null},
      {field:'consumedAt',value:null},
    ],update:{consumedAt:new Date()}});
    if(count!==1)throw new AccountRequestError(403,'RECENT_AUTH_REQUIRED','Confirm it’s you again to continue.');
  };
  return {
    consumeProof,
    async recover(body,ip){
      requireMail();strictObject(body,['email']);const email=emailAddress(body.email);const started=Date.now();
      await consumeLimits(pool,config.secret,[{scope:'reset:address',subject:email,max:5,seconds:3600},{scope:'reset:ip',subject:ip,max:30,seconds:3600}]);
      const user=await userByEmail(email);
      try {
        if(user){
          const methods=await pool.query('SELECT "providerId" FROM "account" WHERE "userId"=$1',[user.id]);
          if(!methods.rows.some(r=>r.providerId==='credential')){
            await enqueueAccountMail(auth,config,'socialRecovery',{user,provider:methods.rows.some(r=>r.providerId==='google')?'Google':'Apple'});
          }else await auth.api.requestPasswordReset({body:{email,redirectTo:config.baseURL+'/app/account/reset-password'}});
        }else await auth.api.requestPasswordReset({body:{email,redirectTo:config.baseURL+'/app/account/reset-password'}});
      }catch{/* Existence-neutral response; delivery recovery remains available. */}
      if(Date.now()-started<500)await new Promise(r=>setTimeout(r,500-(Date.now()-started)));
      return {status:'check-email',message:'If this address can receive a reset link, we’ll send one.'};
    },
    async reset(body,ip){
      requireMail();strictObject(body,['token','password']);const token=accountToken(body.token),password=accountPassword(body.password);
      await consumeLimits(pool,config.secret,[{scope:'reset:complete',subject:ip,max:10,seconds:900}]);await checkPassword(password);
      const context=await auth.$context;const verification=await context.internalAdapter.findVerificationValue('reset-password:'+token);
      if(!verification||new Date(verification.expiresAt)<=new Date())throw new AccountRequestError(400,'LINK_EXPIRED','This link has expired or was already used.');
      // Reset tokens cannot create a new password method for a social-only user.
      const credential=await context.internalAdapter.findCredentialAccount(verification.value);
      if(!credential?.password)throw new AccountRequestError(400,'LINK_EXPIRED','Use your existing sign-in method and set a password in Settings.');
      await authTransaction(auth,pool,verification.value,async()=>{
        const user=await context.internalAdapter.findUserById(verification.value);
        await auth.api.resetPassword({body:{token,newPassword:password}});
        await enqueueAccountMail(auth,config,'passwordChanged',{user});
      });
      return {status:'password-updated'};
    },
    async confirmPassword(body,identity,headers,setCookie){
      strictObject(body,['password','action']);const action=confirmAction(body.action);
      if(typeof body.password!=='string'||body.password.length>256)throw new AccountRequestError(400,'INVALID_PASSWORD','Check your password.');
      await consumeLimits(pool,config.secret,[{scope:'reauth',subject:identity.sessionId,max:5,seconds:900}]);
      const result=await authTransaction(auth,pool,identity.authUserId,async(adapter,context)=>{
        const active=await adapter.findOne({model:'session',where:[{field:'id',value:identity.sessionId},{field:'userId',value:identity.authUserId}]});
        if(!active)throw new AccountRequestError(401,'SIGN_IN_REQUIRED','Sign in again.');
        const signed=await auth.api.signInEmail({body:{email:identity.user.email,password:body.password},headers,returnHeaders:true});
        const fresh=await context.internalAdapter.findSession(signed.response.token);
        const proof=randomBytes(32).toString('base64url'),now=new Date();
        await adapter.create({model:'recentProof',forceAllowId:true,data:{id:randomUUID(),digest:challengeDigest(proof),authUserId:identity.authUserId,sessionId:fresh.session.id,action,expiresAt:new Date(now.getTime()+300000),verifiedAt:now,createdAt:now}});
        await context.internalAdapter.deleteSession(active.token);
        return {signed,proof,csrfToken:csrfForSession(config.secret,fresh.session.id)};
      });
      for(const cookie of result.signed.headers.getSetCookie())setCookie(cookie);
      return {status:'confirmed',proof:result.proof,action,csrfToken:result.csrfToken};
    },
    async changePassword(body,identity,headers,setCookie){
      requireMail();strictObject(body,['password','currentPassword','proof']);const password=accountPassword(body.password);await checkPassword(password);
      const outcome=await authTransaction(auth,pool,identity.authUserId,async(adapter)=>{
        await consumeProof(adapter,identity,body.proof,'password-change');
        const changed=await auth.api.changePassword({body:{newPassword:password,currentPassword:body.currentPassword,revokeOtherSessions:true},headers,returnHeaders:true});
        const context=await auth.$context;const user=await context.internalAdapter.findUserById(identity.authUserId);
        await enqueueAccountMail(auth,config,'passwordChanged',{user});return changed;
      });
      for(const cookie of outcome.headers.getSetCookie())setCookie(cookie);
      return {status:'password-updated'};
    },
  };
}
