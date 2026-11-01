import { strictObject, privateName } from "./validation.js";
import { revision, conflict } from "./operations.js";
import { authTransaction } from "../auth/transaction.js";
import { AccountRequestError } from "./security.js";
import {configuredProviders} from '../auth/providers.js';
export function createProfileActions({ auth, pool, config={} }) {
  return {
    async profile(identity, headers) {
      return authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter, context) => {
          const current = await auth.api.getSession({ headers });
          if (
            current?.session.id !== identity.sessionId ||
            !current.user.emailVerified
          )
            throw new AccountRequestError(
              401,
              "SIGN_IN_REQUIRED",
              "Sign in to continue.",
            );
          const user = await context.internalAdapter.findUserById(
            identity.authUserId,
          );
          const app = await adapter.findOne({
            model: "appUser",
            where: [{ field: "authUserId", value: identity.authUserId }],
          });
          const accounts = await context.internalAdapter.findAccounts(
            identity.authUserId,
          );
          const pending = await adapter.findOne({
            model: "accountChallenge",
            where: [
              { field: "authUserId", value: identity.authUserId },
              { field: "purpose", value: "email-change" },
              { field: "expiresAt", operator: "gt", value: new Date() },
              { field: "usedAt", value: null },
            ],
          });
          return {
            name: user.name,
            email: user.email,
            profileRevision: Number(app.profileRevision),
            pendingEmail: pending
              ? { email: pending.targetEmail, expiresAt: pending.expiresAt }
              : null,
            methods: accounts
              .filter((a) =>
                ["credential", "google", "apple"].includes(a.providerId),
              )
              .map((a) => ({
                provider:
                  a.providerId === "credential" ? "password" : a.providerId,
                usable:
                  a.providerId === "credential" ?
                  Boolean(a.password && user.emailVerified):Boolean(configuredProviders(config)[a.providerId]&&(a.providerId!=='apple'||config.secureCookies)),
              })),
          };
        },
      );
    },
    async updateProfile(body, identity, headers, setCookie) {
      strictObject(body, ["name", "profileRevision"]);
      const name = privateName(body.name),
        expected = revision(body.profileRevision);
      const reply = await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter) => {
          const changed = await adapter.updateMany({
            model: "appUser",
            where: [
              { field: "authUserId", value: identity.authUserId },
              { field: "profileRevision", value: expected },
            ],
            update: { profileRevision: expected + 1 },
          });
          if (changed !== 1) throw conflict();
          return auth.api.updateUser({
            body: { name },
            headers,
            returnHeaders: true,
          });
        },
      );
      for (const cookie of reply.headers.getSetCookie()) setCookie(cookie);
      return { name, profileRevision: expected + 1 };
    },
  };
}
