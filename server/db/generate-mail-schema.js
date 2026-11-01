import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../auth/auth.js';
import { accountMailSchema } from '../auth/mail-schema.js';
const pool = new Pool({ connectionString: process.env.ACCOUNTS_MIGRATION_DATABASE_URL });
try {
  const plan = await getMigrations({ ...authOptions({ pool, config: { baseURL: 'http://localhost:3000', secret: 'schema-only-not-a-runtime-secret-32-characters', secureCookies: false } }), plugins: [accountMailSchema] });
  if (plan.toBeCreated.length !== 2 || plan.toBeAdded.length) throw Error('Expected just the new account mail models.');
  await writeFile(new URL('./migrations/004-mail.sql', import.meta.url), '-- App mail models generated with Better Auth 1.7.14.\n' + await plan.compileMigrations() + '\n');
} finally { await pool.end(); }
