import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  getCurrentAdapter,
  tryGetCurrentAuthEndpointContext,
} from "@better-auth/core/context";
import {
  APIError,
  getOAuthState,
  addOAuthServerContext,
  createAuthMiddleware,
} from "better-auth/api";

export const oauthCallbackContext = new AsyncLocalStorage();
export const oauthStartContext = new AsyncLocalStorage();
export const beforeOAuth = createAuthMiddleware(async (ctx) => {
  if (!["/sign-in/social", "/link-social"].includes(ctx.path)) return;
  const server = oauthStartContext.getStore();
  if (server) await addOAuthServerContext(server);
});
export async function fenceOAuthIdentity(adapter, authUserId) {
  let app = await adapter.findOne({
    model: "appUser",
    where: [{ field: "authUserId", value: authUserId }],
  });
  if (!app)
    app = await adapter.create({
      model: "appUser",
      forceAllowId: true,
      data: {
        id: randomUUID(),
        authUserId,
        status: "active",
        profileRevision: 0,
        createdAt: new Date(),
      },
    });
  const locked = await adapter.update({
    model: "appUser",
    where: [
      { field: "id", value: app.id },
      { field: "status", value: "active" },
    ],
    update: { status: "active" },
  });
  if (!locked)
    throw APIError.fromStatus("FORBIDDEN", {
      code: "ACCOUNT_UNAVAILABLE",
      message: "This account is unavailable.",
    });
  return locked;
}
export function oauthDatabaseHooks(getAuth) {
  const stateAndAdapter = async () => {
    if (!tryGetCurrentAuthEndpointContext()) return null;
    const state = await getOAuthState();
    if (!state) return null;
    if (!oauthCallbackContext.getStore())
      throw APIError.fromStatus("FORBIDDEN", {
        code: "CALLBACK_UNAVAILABLE",
        message: "Restart this sign-in from MyBookshelf.",
      });
    if (state.link && !oauthCallbackContext.getStore().intent)
      throw APIError.fromStatus("FORBIDDEN", {
        code: "LINK_UNAVAILABLE",
        message: "Use account settings to connect a sign-in method.",
      });
    const auth = getAuth(),
      context = await auth.$context;
    return {
      state,
      auth,
      context,
      adapter: await getCurrentAdapter(context.adapter),
    };
  };
  return {
    account: {
      create: {
        before: async (data) => {
          const flow = await stateAndAdapter();
          if (flow) {
            if (
              flow.state.link &&
              (data.userId !==
                oauthCallbackContext.getStore().intent.authUserId ||
                oauthCallbackContext.getStore().intent.mode === "reauth")
            )
              throw APIError.fromStatus("FORBIDDEN");
            await fenceOAuthIdentity(flow.adapter, data.userId);
          }
          // ID tokens are used by the native verifier, then discarded. The library
          // encrypts the access/refresh tokens it retains for revocation.
          return { data: { ...data, idToken: null } };
        },
      },
      update: {
        before: async (data) => {
          await stateAndAdapter();
          return { data: { ...data, idToken: null } };
        },
      },
    },
    session: {
      create: {
        before: async (data, endpoint) => {
          const flow = await stateAndAdapter();
          if (!flow) return;
          if (flow.state.link) return { data };
          await fenceOAuthIdentity(flow.adapter, data.userId);
          const before = flow.state.serverContext;
          const remembered =
            typeof before?.previousSessionId === "string" &&
            typeof before?.previousAuthUserId === "string"
              ? await flow.adapter.findOne({
                  model: "session",
                  where: [
                    { field: "id", value: before.previousSessionId },
                    { field: "userId", value: before.previousAuthUserId },
                  ],
                })
              : null;
          const previous =
            remembered ??
            (
              await flow.auth.api.getSession({
                headers: endpoint?.headers ?? new Headers(),
                query: { disableRefresh: true },
              })
            )?.session;
          if (previous?.token && previous.token !== data.token)
            await flow.context.internalAdapter.deleteSession(previous.token);
          oauthCallbackContext.getStore().authenticatedUserId = data.userId;
          return { data };
        },
      },
    },
  };
}
export function mergeDatabaseHooks(first, second = {}) {
  const merged = {};
  for (const model of new Set([
    ...Object.keys(first),
    ...Object.keys(second),
  ])) {
    merged[model] = {};
    for (const action of new Set([
      ...Object.keys(first[model] || {}),
      ...Object.keys(second[model] || {}),
    ])) {
      const a = first[model]?.[action] || {},
        b = second[model]?.[action] || {};
      merged[model][action] = {
        ...a,
        ...b,
        before: async (data, context) => {
          let value = data;
          for (const hook of [a.before, b.before])
            if (hook) {
              const reply = await hook(value, context);
              if (reply === false) return false;
              if (reply?.data) value = { ...value, ...reply.data };
            }
          return { data: value };
        },
      };
      if (a.after && b.after)
        merged[model][action].after = async (data, context) => {
          await a.after(data, context);
          await b.after(data, context);
        };
    }
  }
  return merged;
}
