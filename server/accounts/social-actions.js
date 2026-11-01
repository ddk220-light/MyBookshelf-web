import { runWithTransaction } from "@better-auth/core/context";
import { configuredProviders } from "../auth/providers.js";
import {
  oauthCallbackContext,
  oauthStartContext,
} from "../auth/oauth-hooks.js";
import { strictObject } from "./validation.js";
import {
  AccountRequestError,
  consumeLimits,
  safeReturnPath,
} from "./security.js";
import { enqueueAccountMail } from "../jobs/mail.js";

export function createSocialActions({ auth, pool, config }) {
  const enabled = (provider) =>
    ["google", "apple"].includes(provider) &&
    Boolean(configuredProviders(config)[provider]);
  const copyCookies = (headers, provider, setCookie, context) => {
    const stateName = context.createAuthCookie("state").name;
    for (let cookie of headers.getSetCookie()) {
      // Only Apple's short-lived native correlation cookie crosses its form
      // POST. Main sessions and Google's state cookie keep SameSite=Lax.
      if (
        provider === "apple" &&
        config.secureCookies &&
        cookie.startsWith(stateName + "=") &&
        !/Max-Age=0/i.test(cookie)
      )
        cookie = cookie.replace(/;\s*SameSite=Lax/i, "; SameSite=None");
      setCookie(cookie);
    }
  };
  return {
    providerEnabled: enabled,
    async signInSocial(body, ip, headers, setCookie) {
      strictObject(body, ["provider", "returnTo"]);
      const provider = body.provider;
      if (!enabled(provider))
        throw new AccountRequestError(
          503,
          "PROVIDER_UNAVAILABLE",
          "This sign-in method is temporarily unavailable.",
        );
      if (provider === "apple" && !config.secureCookies)
        throw new AccountRequestError(
          503,
          "PROVIDER_UNAVAILABLE",
          "Apple sign-in requires the secure account site.",
        );
      await consumeLimits(pool, config.secret, [
        { scope: "oauth:start", subject: ip, max: 20, seconds: 900 },
      ]);
      const target = new URL("/app/account/return", config.baseURL);
      target.searchParams.set("returnTo", safeReturnPath(body.returnTo));
      const previous = await auth.api.getSession({
        headers,
        query: { disableRefresh: true },
      });
      const server = previous
        ? {
            previousSessionId: previous.session.id,
            previousAuthUserId: previous.user.id,
          }
        : {};
      const reply = await oauthStartContext.run(server, () =>
        auth.api.signInSocial({
          headers,
          body: {
            provider,
            callbackURL: target.href,
            newUserCallbackURL: target.href,
            errorCallbackURL: new URL("/app/account/return", config.baseURL)
              .href,
            disableRedirect: true,
          },
          returnHeaders: true,
        }),
      );
      const url = new URL(reply.response.url);
      const host =
        provider === "google" ? "accounts.google.com" : "appleid.apple.com";
      if (url.protocol !== "https:" || url.hostname !== host)
        throw new Error("Unexpected provider authorization origin.");
      copyCookies(reply.headers, provider, setCookie, await auth.$context);
      return { url: url.href };
    },
    async oauthCallback(
      provider,
      { query = {}, body = {}, method = "GET", headers, ip },
      setCookie,
    ) {
      if (!enabled(provider))
        throw new AccountRequestError(
          503,
          "PROVIDER_UNAVAILABLE",
          "This sign-in method is temporarily unavailable.",
        );
      await consumeLimits(pool, config.secret, [
        { scope: "oauth:callback", subject: ip, max: 40, seconds: 60 },
      ]);
      const fields = [
        "code",
        "state",
        "error",
        "error_description",
        "user",
        "iss",
        "device_id",
      ];
      const input = { ...body, ...query },
        params = {};
      for (const field of fields)
        if (input[field] !== undefined) {
          if (
            typeof input[field] !== "string" ||
            input[field].length > (field === "user" ? 16000 : 8192)
          )
            throw new AccountRequestError(
              422,
              "INVALID_CALLBACK",
              "Restart sign-in from MyBookshelf.",
            );
          params[field] = input[field];
        }
      const context = await auth.$context;
      let reply;
      try {
        reply = await runWithTransaction(context.adapter, () =>
          oauthCallbackContext.run({ provider, auth, headers }, async () => {
            // The native GET callback performs state/code/nonce/signature checks.
            // Feeding Apple's bounded POST fields directly avoids its native
            // intermediate redirect containing code/profile fields in a URL.
            const response = await auth.api.callbackOAuth({
              params: { id: provider },
              query: params,
              method: "GET",
              headers,
              asResponse: true,
            });
            const location = response.headers.get("Location"),
              url = location ? new URL(location, config.baseURL) : null;
            if (response.status >= 400 || url?.searchParams.has("error"))
              throw { oauthResponse: response };
            const scope = oauthCallbackContext.getStore();
            if (scope.intent) {
              if (!config.resendKey || !config.mailFrom || !config.jobSecret)
                throw new Error("Account notices are unavailable.");
              if (scope.intent.mode === "reauth") {
                const rotated = await auth.api.rotateProviderSession({
                  headers,
                  asResponse: true,
                });
                if (rotated.status !== 200)
                  throw new Error("Provider session rotation failed.");
                for (const cookie of rotated.headers.getSetCookie())
                  response.headers.append("Set-Cookie", cookie);
              } else {
                const { getCurrentAdapter } = await import(
                  "@better-auth/core/context"
                );
                const adapter = await getCurrentAdapter(context.adapter);
                await adapter.update({
                  model: "providerIntent",
                  where: [{ field: "id", value: scope.intent.id }],
                  update: { verifiedAt: new Date(), consumedAt: new Date() },
                });
                await enqueueAccountMail(auth, config, "methodChanged", {
                  user: scope.intentUser,
                });
              }
            } else if (!scope.authenticatedUserId)
              throw new Error("OAuth identity postcondition failed.");
            if (
              !url ||
              url.origin !== config.baseURL ||
              !url.pathname.startsWith("/app/account/return")
            )
              throw new Error("Unexpected OAuth return destination.");
            return response;
          }),
        );
      } catch (error) {
        const native = error?.oauthResponse;
        let code = "provider_failed";
        try {
          const value = new URL(
            native?.headers.get("Location"),
            config.baseURL,
          ).searchParams.get("error");
          if (value && /^[a-z_]{1,80}$/.test(value)) code = value;
        } catch {}
        if (native) copyCookies(native.headers, provider, setCookie, context);
        return {
          status: 303,
          location: config.baseURL + "/app/account/return?error=" + code,
        };
      }
      copyCookies(reply.headers, provider, setCookie, context);
      return { status: 303, location: reply.headers.get("Location") };
    },
  };
}
