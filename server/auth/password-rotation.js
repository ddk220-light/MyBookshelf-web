import { AsyncLocalStorage } from "node:async_hooks";
import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
export const verifiedPasswordContext = new AsyncLocalStorage();
export const passwordRotation = {
  id: "mybookshelf-verified-password-change",
  endpoints: {
    changeVerifiedPassword: createAuthEndpoint.serverOnly(
      { method: "POST", use: [sensitiveSessionMiddleware] },
      async (ctx) => {
        const proof = verifiedPasswordContext.getStore(),
          current = ctx.context.session;
        if (
          !proof ||
          current.user.id !== proof.authUserId ||
          current.session.id !== proof.sessionId
        )
          throw APIError.fromStatus("FORBIDDEN");
        const credential =
          await ctx.context.internalAdapter.findCredentialAccount(
            current.user.id,
          );
        if (!credential?.password) throw APIError.fromStatus("BAD_REQUEST");
        const hash = await ctx.context.password.hash(proof.password);
        await ctx.context.internalAdapter.updatePassword(current.user.id, hash);
        await ctx.context.internalAdapter.deleteUserSessions(current.user.id);
        const session = await ctx.context.internalAdapter.createSession(
          current.user.id,
        );
        if (!session) throw APIError.fromStatus("INTERNAL_SERVER_ERROR");
        await setSessionCookie(ctx, { session, user: current.user });
        return ctx.json({ status: true });
      },
    ),
  },
};
