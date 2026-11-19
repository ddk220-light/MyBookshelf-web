import { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { createAccountAuth } from "../auth/auth.js";
import { assertAuthRole, resolveAppIdentity } from "../db/identity.js";
import { csrfForSession, consumeLimits } from "./security.js";
import { enqueueAccountMail } from "../jobs/mail.js";
import { createAuthActions } from "./auth-actions.js";
import { createCredentialActions } from "./credential-actions.js";
import { createReadingActions } from "./reading.js";
import { assertReadingRole } from "../db/owner-transaction.js";
import { createShelfActions } from "./books.js";
import { createHistoryActions } from "./history.js";
import { createImportActions } from "./imports.js";
import { createProfileActions } from "./profile-actions.js";
import { createEmailActions } from "./email-actions.js";
import {createSocialActions} from './social-actions.js';
import {privateName} from './validation.js';
import {createMethodActions} from './method-actions.js';
import {createDeletionActions} from './deletion-actions.js';
import {createDeletionLedger} from '../jobs/deletion-ledger.js';
import {statementTimeoutOption} from '../db/pool-options.js';

const ABSOLUTE_SESSION_MS = 30 * 86400 * 1000;

export async function createAccountService(config, { ledger=createDeletionLedger(config) } = {}) {
  const pool = new Pool({
    connectionString: config.databaseURL,
    max: 4,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    ...statementTimeoutOption(config.databaseURL, 5000),
  });
  // Keep background pool errors from becoming uncaught exceptions; never log values.
  pool.on("error", () => {});
  const readingPool = config.readingDatabaseURL
    ? new Pool({
        connectionString: config.readingDatabaseURL,
        max: 4,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30000,
        ...statementTimeoutOption(config.readingDatabaseURL, 5000),
      })
    : undefined;
  readingPool?.on("error", () => {});
  try {
    // No request-time DDL. A missing migration fails only the account service.
    // The two pools open together: a cold start waits for the slower one only.
    await Promise.all([
      (async () => {
        await pool.query('SELECT 1 FROM "session" LIMIT 0');
        await assertAuthRole(pool);
      })(),
      readingPool ? assertReadingRole(readingPool) : null,
    ]);
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
      // The log-in link (B10). Only requested for an existing, verified account.
      sendMagicLink: async ({ email, token }) => {
        const user = (
          await pool.query('SELECT id,email,name FROM "user" WHERE email=$1', [email])
        ).rows[0];
        if (user) await mail("magicLink")({ user, token });
      },
    });
    const credentials = createCredentialActions({ auth, pool, config });
    const actions = {
      ...createAuthActions({ auth, pool, config }),
      ...credentials,
      ...createSocialActions({auth,pool,config}),
      ...createMethodActions({auth,pool,config,consumeProof:credentials.consumeProof}),
      ...createDeletionActions({auth,pool,config,consumeProof:credentials.consumeProof,ledger}),
      ...createProfileActions({ auth, pool, config }),
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
        createImportActions({
          ...reading,
          limit: (identity, rule) =>
            consumeLimits(pool, config.secret, [{ ...rule, subject: identity.user.id }]),
        }),
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
      let needsProfileCompletion=false;try{privateName(value.user.name);}catch{needsProfileCompletion=true;}
      return {
        needsProfileCompletion,
        status: value.user.emailVerified ? "authenticated" : "unverified",
        sessionId: value.session.id,
        authUserId: value.user.id,
        csrfToken: csrfForSession(config.secret, value.session.id),
        // When this session began: within 10 minutes the account screens do
        // not ask for the password again (deleting the account always does).
        signedInAt: new Date(value.session.createdAt).toISOString(),
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
      maintenance:{ledger,purgeDeletion:actions.purgeDeletion},
      // The import allowance is counted by the import itself, once the import
      // is known to be valid (accounts/imports.js).
      limitPrivate: (identity) =>
        consumeLimits(pool, config.secret, [
          {
            scope: "private-mutations",
            subject: identity.user.id,
            max: 120,
            seconds: 60,
          },
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
