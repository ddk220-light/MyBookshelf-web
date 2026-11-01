import { randomUUID, randomBytes } from "node:crypto";
import { strictObject, accountPassword } from "./validation.js";
import {
  AccountRequestError,
  consumeLimits,
  csrfForSession,
} from "./security.js";
import { authTransaction } from "../auth/transaction.js";
import { oauthStartContext } from "../auth/oauth-hooks.js";
import { configuredProviders } from "../auth/providers.js";
import { challengeDigest, enqueueAccountMail } from "../jobs/mail.js";

const actions = new Set([
  "password-change",
  "password-setup",
  "email-change",
  "provider-link",
  "provider-unlink",
  "export",
  "delete",
  "signout-all",
  "session-revoke",
]);
export function createMethodActions({
  auth,
  pool,
  config,
  consumeProof,
  checkPassword,
}) {
  const requireMail = () => {
    if (!config.resendKey || !config.mailFrom || !config.jobSecret)
      throw new AccountRequestError(
        503,
        "MAIL_UNAVAILABLE",
        "Account email is temporarily unavailable.",
      );
  };
  const enabled = (provider) =>
    ["google", "apple"].includes(provider) &&
    Boolean(configuredProviders(config)[provider]) &&
    (provider !== "apple" || config.secureCookies);
  const requireSession = async (adapter, identity) => {
    const session = await adapter.findOne({
      model: "session",
      where: [
        { field: "id", value: identity.sessionId },
        { field: "userId", value: identity.authUserId },
      ],
    });
    if (
      !session ||
      new Date(session.expiresAt) <= new Date() ||
      Date.now() - new Date(session.createdAt) >= 30 * 86400000
    )
      throw new AccountRequestError(
        401,
        "SIGN_IN_REQUIRED",
        "Sign in to continue.",
      );
    return session;
  };
  return {
    async startProviderAction(body, identity, headers, setCookie) {
      strictObject(body, ["provider", "mode", "action", "target", "proof"]);
      const { provider, mode, action } = body;
      if (!enabled(provider))
        throw new AccountRequestError(
          503,
          "PROVIDER_UNAVAILABLE",
          "This provider is temporarily unavailable.",
        );
      if (
        !["link", "reauth"].includes(mode) ||
        !actions.has(action) ||
        (mode === "link" && action !== "provider-link") ||
        (body.target !== undefined &&
          (typeof body.target !== "string" || body.target.length > 200))
      )
        throw new AccountRequestError(
          422,
          "INVALID_ACTION",
          "Choose a valid account action.",
        );
      requireMail();
      await consumeLimits(pool, config.secret, [
        {
          scope: "provider-action",
          subject: identity.sessionId,
          max: 5,
          seconds: 900,
        },
      ]);
      const outcome = await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter, context) => {
          await requireSession(adapter, identity);
          const accounts = await context.internalAdapter.findAccounts(
            identity.authUserId,
          );
          if (mode === "link") {
            await consumeProof(adapter, identity, body.proof, "provider-link");
            if (accounts.some((a) => a.providerId === provider))
              throw new AccountRequestError(
                409,
                "METHOD_ALREADY_CONNECTED",
                "This provider is already connected.",
              );
          } else if (!accounts.some((a) => a.providerId === provider))
            throw new AccountRequestError(
              403,
              "METHOD_NOT_CONNECTED",
              "Confirm with a sign-in method already connected to your account.",
            );
          const now = new Date(),
            id = randomUUID();
          await adapter.create({
            model: "providerIntent",
            forceAllowId: true,
            data: {
              id,
              authUserId: identity.authUserId,
              sessionId: identity.sessionId,
              provider,
              mode,
              action,
              target: body.target,
              expiresAt: new Date(now.getTime() + 300000),
              createdAt: now,
            },
          });
          const target = new URL("/app/account/return", config.baseURL);
          target.searchParams.set("flow", id);
          const reply = await oauthStartContext.run({ intentId: id }, () =>
            auth.api.linkSocialAccount({
              headers,
              body: {
                provider,
                callbackURL: target.href,
                errorCallbackURL: new URL("/app/account/return", config.baseURL)
                  .href,
                disableRedirect: true,
              },
              returnHeaders: true,
            }),
          );
          const url = new URL(reply.response.url);
          if (
            url.protocol !== "https:" ||
            url.hostname !==
              (provider === "google"
                ? "accounts.google.com"
                : "appleid.apple.com")
          )
            throw new Error("Invalid provider destination.");
          return { reply, url: url.href };
        },
      );
      const stateName = (await auth.$context).createAuthCookie("state").name;
      for (let cookie of outcome.reply.headers.getSetCookie()) {
        if (provider === "apple" && cookie.startsWith(stateName + "="))
          cookie = cookie.replace(/;\s*SameSite=Lax/i, "; SameSite=None");
        setCookie(cookie);
      }
      return { url: outcome.url };
    },
    async providerResult(body, identity) {
      strictObject(body, ["flowId"]);
      if (
        typeof body.flowId !== "string" ||
        !/^[0-9a-f-]{36}$/.test(body.flowId)
      )
        throw new AccountRequestError(
          422,
          "INVALID_ACTION",
          "Restart this change from settings.",
        );
      return authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter) => {
          await requireSession(adapter, identity);
          const intent = await adapter.findOne({
            model: "providerIntent",
            where: [
              { field: "id", value: body.flowId },
              { field: "authUserId", value: identity.authUserId },
              { field: "sessionId", value: identity.sessionId },
            ],
          });
          if (!intent?.verifiedAt || new Date(intent.expiresAt) <= new Date())
            throw new AccountRequestError(
              403,
              "RECENT_AUTH_REQUIRED",
              "Restart this change from account settings.",
            );
          if (intent.mode === "link" && intent.consumedAt)
            return { kind: "linked", provider: intent.provider };
          if (intent.consumedAt)
            throw new AccountRequestError(
              403,
              "RECENT_AUTH_REQUIRED",
              "Confirm it’s you again to continue.",
            );
          const now = new Date(),
            proof = randomBytes(32).toString("base64url");
          await adapter.update({
            model: "providerIntent",
            where: [{ field: "id", value: intent.id }],
            update: { consumedAt: now },
          });
          await adapter.create({
            model: "recentProof",
            forceAllowId: true,
            data: {
              id: randomUUID(),
              digest: challengeDigest(proof),
              authUserId: identity.authUserId,
              sessionId: identity.sessionId,
              action: intent.action,
              expiresAt: new Date(
                Math.min(
                  new Date(intent.verifiedAt).getTime() + 300000,
                  new Date(intent.expiresAt).getTime(),
                ),
              ),
              verifiedAt: intent.verifiedAt,
              createdAt: now,
            },
          });
          return {
            kind: "confirmed",
            action: intent.action,
            target: intent.target ?? undefined,
            proof,
            csrfToken: csrfForSession(config.secret, identity.sessionId),
          };
        },
      );
    },
    async unlinkMethod(body, identity, headers) {
      requireMail();
      strictObject(body, ["provider", "proof"]);
      const provider = body.provider;
      if (!["google", "apple", "password"].includes(provider))
        throw new AccountRequestError(
          422,
          "INVALID_METHOD",
          "Choose a connected method.",
        );
      await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter, context) => {
          await requireSession(adapter, identity);
          await consumeProof(adapter, identity, body.proof, "provider-unlink");
          const user = await context.internalAdapter.findUserById(
              identity.authUserId,
            ),
            accounts = await context.internalAdapter.findAccounts(
              identity.authUserId,
            ),
            native = provider === "password" ? "credential" : provider;
          const selected = accounts.find((a) => a.providerId === native);
          if (!selected)
            throw new AccountRequestError(
              409,
              "METHOD_NOT_CONNECTED",
              "This method is no longer connected. Refresh settings.",
            );
          const remaining = accounts
            .filter((a) => a.id !== selected.id)
            .some((a) =>
              a.providerId === "credential"
                ? Boolean(a.password && user.emailVerified)
                : enabled(a.providerId),
            );
          if (!remaining)
            throw new AccountRequestError(
              409,
              "LAST_SIGN_IN_METHOD",
              "Connect another usable sign-in method before removing this one.",
            );
          await auth.api.unlinkAccount({
            headers,
            body: { accountId: selected.id },
          });
          await enqueueAccountMail(auth, config, "methodChanged", { user });
        },
      );
      return { status: "method-disconnected" };
    },
    async setFirstPassword(body, identity, headers) {
      requireMail();
      strictObject(body, ["password", "proof"]);
      const password = accountPassword(body.password);
      await checkPassword(password);
      await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter, context) => {
          await requireSession(adapter, identity);
          await consumeProof(adapter, identity, body.proof, "password-setup");
          const user = await context.internalAdapter.findUserById(
            identity.authUserId,
          );
          if (!user.emailVerified)
            throw new AccountRequestError(
              403,
              "VERIFY_EMAIL_REQUIRED",
              "Verify your email first.",
            );
          await auth.api.setPassword({
            headers,
            body: { newPassword: password },
          });
          await enqueueAccountMail(auth, config, "methodChanged", { user });
        },
      );
      return { status: "password-set" };
    },
  };
}
