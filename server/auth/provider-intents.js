import { getCurrentAdapter } from "@better-auth/core/context";
import { APIError, createAuthEndpoint, getOAuthState } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { oauthCallbackContext, fenceOAuthIdentity } from "./oauth-hooks.js";

const deny = () => {
  throw APIError.fromStatus("FORBIDDEN", {
    code: "PROVIDER_INTENT_EXPIRED",
    message: "Restart this change from account settings.",
  });
};
export async function authorizeProviderSubject(provider, subject) {
  const state = await getOAuthState();
  if (!state?.link) return;
  const scope = oauthCallbackContext.getStore();
  if (!scope?.auth) return deny();
  const context = await scope.auth.$context,
    adapter = await getCurrentAdapter(context.adapter);
  const id = state.serverContext?.intentId;
  if (typeof id !== "string") return deny();
  const intent = await adapter.findOne({
    model: "providerIntent",
    where: [{ field: "id", value: id }],
  });
  if (
    !intent ||
    intent.provider !== provider ||
    intent.authUserId !== state.link.userId ||
    intent.consumedAt ||
    intent.verifiedAt ||
    new Date(intent.expiresAt) <= new Date()
  )
    return deny();
  await fenceOAuthIdentity(adapter, intent.authUserId);
  const session = await adapter.findOne({
    model: "session",
    where: [
      { field: "id", value: intent.sessionId },
      { field: "userId", value: intent.authUserId },
    ],
  });
  const owner = await context.internalAdapter.findUserById(intent.authUserId);
  if (
    !session ||
    new Date(session.expiresAt) <= new Date() ||
    Date.now() - new Date(session.createdAt) >= 30 * 86400000 ||
    !owner?.emailVerified
  )
    return deny();
  const current = await scope.auth.api.getSession({
    headers: scope.headers,
    query: { disableRefresh: true },
  });
  if (
    current &&
    (current.user.id !== intent.authUserId ||
      current.session.id !== intent.sessionId)
  )
    return deny();
  const accounts = await context.internalAdapter.findAccounts(
    intent.authUserId,
  );
  if (
    intent.mode === "reauth" &&
    !accounts.some(
      (a) => a.providerId === provider && a.accountId === String(subject),
    )
  )
    return deny();
  if (intent.mode === "link" && accounts.some((a) => a.providerId === provider))
    return deny();
  scope.intent = intent;
  scope.intentUser = owner;
  scope.intentSession = session;
}

export const providerIntents = {
  id: "mybookshelf-provider-intents",
  schema: {
    providerIntent: {
      modelName: "account_provider_intents",
      fields: {
        authUserId: { type: "string", required: true },
        sessionId: {
          type: "string",
          required: true,
          references: { model: "session", field: "id", onDelete: "cascade" },
        },
        mode: { type: "string", required: true },
        provider: { type: "string", required: true },
        action: { type: "string", required: true },
        target: { type: "string", required: false },
        expiresAt: { type: "date", required: true },
        verifiedAt: { type: "date", required: false },
        consumedAt: { type: "date", required: false },
        createdAt: { type: "date", required: true },
      },
    },
  },
  endpoints: {
    rotateProviderSession: createAuthEndpoint.serverOnly(
      { method: "POST" },
      async (ctx) => {
        const scope = oauthCallbackContext.getStore();
        if (!scope?.intent || scope.intent.mode !== "reauth") return deny();
        const adapter = await getCurrentAdapter(ctx.context.adapter);
        const fresh = await ctx.context.internalAdapter.createSession(
          scope.intent.authUserId,
        );
        if (!fresh) return deny();
        await adapter.update({
          model: "providerIntent",
          where: [{ field: "id", value: scope.intent.id }],
          update: { sessionId: fresh.id, verifiedAt: new Date() },
        });
        await ctx.context.internalAdapter.deleteSession(
          scope.intentSession.token,
        );
        await setSessionCookie(ctx, { session: fresh, user: scope.intentUser });
        return ctx.json({ status: true });
      },
    ),
  },
};
