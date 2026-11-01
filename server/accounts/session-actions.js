import { AccountRequestError } from './security.js';
import { strictObject } from './validation.js';
import { authTransaction } from '../auth/transaction.js';

function label(agent='') {
  const browser=/Firefox/i.test(agent)?'Firefox':/Edg\//.test(agent)?'Edge':/Chrome/i.test(agent)?'Chrome':/Safari/i.test(agent)?'Safari':'Browser';
  return browser+(/iPhone|iPad|Android|Mobile/i.test(agent)?' on mobile':'');
}
export function createSessionActions({auth,pool,consumeProof}) {
  return {
    async list(identity,headers){
      const sessions=await auth.api.listSessions({headers});
      return {sessions:sessions.filter(s=>Date.now()-new Date(s.createdAt).getTime()<30*86400000).map(s=>({id:s.id,device:label(s.userAgent),current:s.id===identity.sessionId,createdAt:s.createdAt,expiresAt:s.expiresAt}))};
    },
    async revoke(body,identity,headers,setCookie){
      strictObject(body,['sessionId','proof']);
      if(typeof body.sessionId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(body.sessionId))throw new AccountRequestError(404,'NOT_FOUND','This signed-in device is unavailable.');
      const result=await authTransaction(auth,pool,identity.authUserId,async(adapter)=>{
        const target=await adapter.findOne({model:'session',where:[{field:'id',value:body.sessionId},{field:'userId',value:identity.authUserId}]});
        if(!target)throw new AccountRequestError(404,'NOT_FOUND','This signed-in device is unavailable.');
        await consumeProof(adapter,identity,body.proof,'session-revoke');
        if(target.id===identity.sessionId)return {current:true,reply:await auth.api.signOut({headers,returnHeaders:true})};
        await auth.api.revokeSession({body:{token:target.token},headers});return {current:false};
      });
      for(const cookie of result.reply?.headers.getSetCookie()||[])setCookie(cookie);
      return {status:result.current?'signed-out':'revoked'};
    },
    async revokeAll(body,identity,headers,setCookie){
      strictObject(body,['proof']);
      const result=await authTransaction(auth,pool,identity.authUserId,async(adapter)=>{
        await consumeProof(adapter,identity,body.proof,'signout-all');
        await auth.api.revokeSessions({headers});
        return auth.api.signOut({headers,returnHeaders:true});
      });
      for(const cookie of result.headers.getSetCookie())setCookie(cookie);
      return {status:'signed-out-all'};
    },
  };
}
