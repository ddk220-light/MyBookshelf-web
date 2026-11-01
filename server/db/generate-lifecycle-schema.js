import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../auth/auth.js';
const pool=new Pool({connectionString:process.env.ACCOUNTS_MIGRATION_DATABASE_URL});
try {
 const plan=await getMigrations(authOptions({pool,config:{baseURL:'http://localhost:3000',secret:'schema-only-not-runtime-32-characters-long',secureCookies:false}}));
 if(plan.toBeCreated.length!==1||plan.toBeAdded.length)throw Error('Expected only the new recent-auth model.');
 await writeFile(new URL('./migrations/005-recent-proof.sql',import.meta.url),'-- App recent-auth model generated with Better Auth 1.7.14.\n'+await plan.compileMigrations()+'\n');
}finally{await pool.end();}
