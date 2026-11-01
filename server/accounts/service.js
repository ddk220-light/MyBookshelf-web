import { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { createAccountAuth } from "../auth/auth.js";
import { assertAuthRole, resolveAppIdentity } from "../db/identity.js";
import { csrfForSession, consumeLimits } from "./security.js";
import { enqueueAccountMail } from "../jobs/mail.js";
import { createAuthActions } from "./auth-actions.js";
import { createCredentialActions } from "./credential-actions.js";
import { createSessionActions } from "./session-actions.js";
import { createReadingActions } from "./reading.js";
import { assertReadingRole } from "../db/owner-transaction.js";
import { createShelfActions } from "./books.js";
import { createHistoryActions } from "./history.js";
import { createImportActions } from "./imports.js";
import { createProfileActions } from "./profile-actions.js";
import { createEmailActions } from "./email-actions.js";

const ABSOLUTE_SESSION_MS = 30 * 86400 * 1000;

export async function createAccountService(config, { checkPassword } = {}) {
  const pool = new Pool({
    connectionString: config.databaseURL,
    max: 4,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
  });
  // Keep background pool errors from becoming uncaught exceptions; never log values.
  pool.on("error", () => {});
  let readingPool;
  try {
    // No request-time DDL. A missing migration fails only the account service.
    await pool.query('SELECT 1 FROM "session" LIMIT 0');
    await assertAuthRole(pool);
    if (config.readingDatabaseURL) {
      readingPool = new Pool({
        connectionString: config.readingDatabaseURL,
        max: 4,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30000,
        statement_timeout: 5000,
      });
      readingPool.on("error", () => {});
      await assertReadingRole(readingPool);
    }
    let auth;
    const mail = (kind) => async (data) => {
      try {
        return await enqueueAccountMail(auth, config, kind, data, data.token);
      } catch {
        throw new Error("Account mail queue is unavailable.");
      }
    };
    auth = createAccountAuth({
      pool,
      config,
      sendVerificationEmail: mail("verify"),
      sendResetPassword: mail("reset"),
      onExistingUserSignUp: mail("duplicate"),
    });
    const credentials = createCredentialActions({
      auth,
      pool,
      config,
      checkPassword,
    });
    const sessions = createSessionActions({
      auth,
      pool,
      consumeProof: credentials.consumeProof,
    });
    const actions = {
      ...createAuthActions({ auth, pool, config, checkPassword }),
      ...credentials,
      ...sessions,
      ...createProfileActions({ auth, pool }),
      ...createEmailActions({
        auth,
        pool,
        config,
        consumeProof: credentials.consumeProof,
      }),
    };
    const reading = readingPool
      ? createReadingActions({
          pool: readingPool,
          sessionActive: async (identity, client) =>
            (
              await client.query(
                "SELECT public.account_session_active($1) AS active",
                [identity.sessionId],
              )
            ).rows[0].active,
        })
      : null;
    if (reading)
      Object.assign(
        reading,
        createShelfActions({ owned: reading.owned, secret: config.secret }),
        createHistoryActions({ owned: reading.owned }),
        createImportActions(reading),
      );
    async function identity(headers, setCookie = () => {}) {
      const result = await auth.api.getSession({
        headers,
        returnHeaders: true,
      });
      const value = result.response;
      if (!value) return { status: "guest" };
      if (
        Date.now() - new Date(value.session.createdAt).getTime() >=
        ABSOLUTE_SESSION_MS
      ) {
        await pool.query('DELETE FROM "session" WHERE id = $1', [
          value.session.id,
        ]);
        return { status: "guest" };
      }
      const appId = value.user.emailVerified
        ? await resolveAppIdentity(pool, value.user.id)
        : null;
      if (value.user.emailVerified && !appId) return { status: "unavailable" };
      for (const cookie of result.headers.getSetCookie()) setCookie(cookie);
      return {
        status: value.user.emailVerified ? "authenticated" : "unverified",
        sessionId: value.session.id,
        authUserId: value.user.id,
        csrfToken: csrfForSession(config.secret, value.session.id),
        user: {
          id: appId ?? value.user.id,
          name: value.user.name,
          email: value.user.email,
          emailVerified: value.user.emailVerified,
        },
      };
    }
    return {
      auth,
      handleAuth: toNodeHandler(auth),
      identity,
      actions,
      reading,
      limitPrivate: (identity, action) =>
        consumeLimits(pool, config.secret, [
          {
            scope: "private-mutations",
            subject: identity.user.id,
            max: 120,
            seconds: 60,
          },
          ...(action === "importGuest"
            ? [
                {
                  scope: "imports",
                  subject: identity.user.id,
                  max: 5,
                  seconds: 3600,
                },
              ]
            : []),
        ]),
      async session(headers, setCookie) {
        const { sessionId, authUserId, ...summary } = await identity(
          headers,
          setCookie,
        );
        return summary;
      },
      async close() {
        await Promise.all([pool.end(), readingPool?.end()]);
      },
    };
  } catch (error) {
    await Promise.all([pool.end(), readingPool?.end()]);
    throw error;
  }
}
