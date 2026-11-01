import { writeFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../auth/auth.js';

if (!process.env.ACCOUNTS_MIGRATION_DATABASE_URL) throw new Error('Set ACCOUNTS_MIGRATION_DATABASE_URL to an empty disposable database.');
const pool = new Pool({ connectionString: process.env.ACCOUNTS_MIGRATION_DATABASE_URL });
try {
  const plan = await getMigrations(authOptions({ pool, config: {
    baseURL: 'http://localhost:3000', secret: 'schema-generation-only-not-a-runtime-secret', secureCookies: false,
  } }));
  if (plan.toBeAdded.length || plan.toBeCreated.length !== 5) throw new Error('Schema generation requires an empty disposable database.');
  const sql = await plan.compileMigrations();
  await writeFile(new URL('./migrations/001-auth.sql', import.meta.url), '-- Generated with better-auth 1.7.14; do not hand-edit auth tables.\n' + sql + '\n');
  console.log('Generated 001-auth.sql from the pinned Better Auth schema.');
} finally { await pool.end(); }
