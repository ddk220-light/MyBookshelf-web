import { getCurrentAdapter, runWithTransaction } from '@better-auth/core/context';
import { AccountRequestError } from '../accounts/security.js';

// Server-side auth.api calls preserve the library transaction context. Fence the
// active app identity before credential/session mutations so reset, sign-in and
// revocation cannot race through separate connections with an old password.
export async function authTransaction(auth, pool, authUserId, run) {
  // This empty internal fence row grants no reading access. Preparing it with
  // an upsert before the library transaction also serializes a first sign-in
  // racing a reset; private APIs still require a verified active session.
  if(authUserId)await pool.query('INSERT INTO app_users(auth_user_id) VALUES ($1) ON CONFLICT(auth_user_id) DO NOTHING',[authUserId]);
  const context=await auth.$context;
  return runWithTransaction(context.adapter,async()=>{
    const adapter=await getCurrentAdapter(context.adapter);
    if(authUserId){
      const existing=await adapter.findOne({model:'appUser',where:[{field:'authUserId',value:authUserId}]});
      if(existing){
        const locked=await adapter.update({model:'appUser',where:[{field:'authUserId',value:authUserId},{field:'status',value:'active'}],update:{status:'active'}});
        if(!locked)throw new AccountRequestError(403,'ACCOUNT_UNAVAILABLE','This account is unavailable.');
      }
    }
    return run(adapter,context);
  });
}
