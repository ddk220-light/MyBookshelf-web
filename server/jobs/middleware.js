import { createHash, timingSafeEqual } from 'node:crypto';

export function createJobMiddleware({ env = process.env } = {}) {
  let pool;
  return async (req,res,next) => {
    if (req.path !== '/api/internal/account-jobs') return next();
    res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'});
    const secret=env.ACCOUNTS_CRON_SECRET;
    const provided=req.get('Authorization') || '';
    if (typeof secret !== 'string' || secret.length<32 || !timingSafeEqual(
      createHash('sha256').update(provided).digest(),createHash('sha256').update('Bearer '+secret).digest())) return res.status(403).json({error:{code:'FORBIDDEN',message:'This endpoint is private.'}});
    if(req.method!=='GET')return res.status(405).end();
    if(!env.ACCOUNTS_WORKER_DATABASE_URL || !env.RESEND_API_KEY || !env.ACCOUNTS_MAIL_FROM || !env.ACCOUNTS_JOB_SECRET)return res.status(503).json({error:{code:'JOBS_UNAVAILABLE',message:'Account jobs are unavailable.'}});
    try {
      const [{Pool},{runMailBatch}]=await Promise.all([import('pg'),import('./mail.js')]);
      if(!pool){pool=new Pool({connectionString:env.ACCOUNTS_WORKER_DATABASE_URL,max:2,connectionTimeoutMillis:3000,statement_timeout:5000});pool.on('error',()=>{});}
      const roles=await pool.query(`SELECT rolsuper,rolbypassrls,pg_has_role(current_user,c.relowner,'USAGE') AS owns_jobs
        FROM pg_roles r CROSS JOIN pg_class c WHERE rolname=current_user AND c.oid='account_mail_jobs'::regclass`);
      if(!roles.rowCount || roles.rows[0].rolsuper || roles.rows[0].rolbypassrls || roles.rows[0].owns_jobs)throw Error('Privileged worker role.');
      const outcome=await runMailBatch(pool,{jobSecret:env.ACCOUNTS_JOB_SECRET,resendKey:env.RESEND_API_KEY,mailFrom:env.ACCOUNTS_MAIL_FROM});
      await pool.query('DELETE FROM account_email_challenges WHERE "expiresAt"<now()');
      await pool.query("DELETE FROM account_rate_buckets WHERE reset_at<now()-interval '24 hours'");
      return res.json(outcome);
    }catch{return res.status(503).json({error:{code:'JOBS_UNAVAILABLE',message:'Account jobs are unavailable.'}});}
  };
}
