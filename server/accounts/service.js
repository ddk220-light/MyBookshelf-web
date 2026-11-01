import { Pool } from 'pg';
import { toNodeHandler } from 'better-auth/node';
import { createAccountAuth } from '../auth/auth.js';
import { assertAuthRole, resolveAppIdentity } from '../db/identity.js';

const ABSOLUTE_SESSION_MS = 30 * 86400 * 1000;

export async function createAccountService(config) {
  const pool = new Pool({ connectionString: config.databaseURL, max: 4,
    connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, statement_timeout: 5000 });
  // Keep background pool errors from becoming uncaught exceptions; never log values.
  pool.on('error', () => {});
  try {
    // No request-time DDL. A missing migration fails only the account service.
    await pool.query('SELECT 1 FROM "session" LIMIT 0');
    await assertAuthRole(pool);
    const auth = createAccountAuth({ pool, config });
    return {
      auth, handleAuth: toNodeHandler(auth),
      async session(headers, setCookie = () => {}) {
        const result = await auth.api.getSession({ headers, returnHeaders: true });
        const value = result.response;
        if (!value) return { status: 'guest' };
        if (Date.now() - new Date(value.session.createdAt).getTime() >= ABSOLUTE_SESSION_MS) {
          await pool.query('DELETE FROM "session" WHERE id = $1', [value.session.id]);
          return { status: 'guest' };
        }
        const appId = value.user.emailVerified ? await resolveAppIdentity(pool, value.user.id) : null;
        if (value.user.emailVerified && !appId) return { status: 'unavailable' };
        for (const cookie of result.headers.getSetCookie()) setCookie(cookie);
        // Session tokens and raw auth rows never leave this facade.
        return { status: value.user.emailVerified ? 'authenticated' : 'unverified',
          user: { id: appId ?? value.user.id, name: value.user.name, email: value.user.email,
            emailVerified: value.user.emailVerified } };
      },
      async close() { await pool.end(); },
    };
  } catch (error) { await pool.end(); throw error; }
}
