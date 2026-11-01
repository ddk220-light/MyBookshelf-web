import express from "express";
import {
  AccountRequestError,
  requireOrigin,
  requireMutation,
  requireIdentityView,
  requestIP,
} from "./security.js";
import { readAccountConfig } from "./config.js";
import { readingRoute } from "./reading-routes.js";

const RESERVED_AUTH =
  /^\/api\/auth\/(?:ok|get-session|sign-up\/email|sign-in\/(?:email|social)|sign-out|verify-email|send-verification-email|request-password-reset|reset-password|callback\/[^/]+|change-password|change-email|link-social|unlink-account|delete-user|list-sessions|revoke-session|revoke-sessions|revoke-other-sessions|update-user|set-password)(?:\/|$)/;
const unavailable = (res) =>
  res
    .status(503)
    .json({
      error: {
        code: "ACCOUNT_UNAVAILABLE",
        message:
          "Accounts are temporarily unavailable. You can continue browsing.",
      },
    });

// Lazy initialization is scoped to the app, not to public catalog requests.
export function createAccountMiddleware({
  env = process.env,
  initialize = async (config) => {
    const { createAccountService } = await import("./service.js");
    return createAccountService(config);
  },
  retryAfterMs = 5000,
} = {}) {
  let service,
    pending,
    retryAt = 0;
  const parser = express.json({ limit: "32kb", strict: true });
  const importParser = express.json({ limit: "2mb", strict: true });
  const postPaths = new Set([
    "/api/account/sign-up",
    "/api/account/sign-in",
    "/api/account/verify-email",
    "/api/account/resend-verification",
    "/api/account/sign-out",
    "/api/account/forgot-password",
    "/api/account/reset-password",
    "/api/account/reauth/password",
    "/api/account/password",
    "/api/account/sessions/revoke",
    "/api/account/sign-out-all",
    "/api/account/email-change",
    "/api/account/email-change/cancel",
    "/api/account/email-change/confirm",
  ]);
  return async function accounts(req, res, next) {
    const path = req.path;
    if (
      !(
        path === "/api/account" ||
        path.startsWith("/api/account/") ||
        RESERVED_AUTH.test(path)
      )
    )
      return next();
    res.set({
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    });
    try {
      const config = readAccountConfig(env);
      if (!config.enabled) return unavailable(res);
      // Auth protocol and sensitive routes stay closed until their individual
      // policy/mail/lifecycle stories are implemented. /get-session returns raw
      // library rows, so browsers must use the narrow /api/account/session facade.
      const isPost = postPaths.has(path);
      const profile = path === "/api/account/profile";
      const reading = readingRoute(path, req.method);
      const mutation = isPost || ((reading || profile) && req.method !== "GET");
      if (
        !isPost &&
        !reading &&
        !profile &&
        ![
          "/api/auth/ok",
          "/api/account/session",
          "/api/account/capabilities",
          "/api/account/sessions",
        ].includes(path)
      )
        return unavailable(res);
      if (
        profile
          ? !["GET", "PATCH"].includes(req.method)
          : reading
            ? !reading.action
            : req.method !== (isPost ? "POST" : "GET")
      )
        return res
          .status(405)
          .json({
            error: {
              code: "METHOD_NOT_ALLOWED",
              message: "This method is not supported.",
            },
          });
      if (mutation) {
        requireOrigin(req, config.baseURL);
        if (!req.is("application/json"))
          throw new AccountRequestError(
            415,
            "JSON_REQUIRED",
            "Send a JSON request.",
          );
        await new Promise((resolve, reject) =>
          (path === "/api/account/imports" ? importParser : parser)(
            req,
            res,
            (error) => (error ? reject(error) : resolve()),
          ),
        );
      }
      const origin = req.get("Origin");
      if (origin && origin !== config.baseURL)
        return res
          .status(403)
          .json({
            error: {
              code: "ORIGIN_REJECTED",
              message: "The request origin is not allowed.",
            },
          });
      if (!service) {
        if (Date.now() < retryAt) return unavailable(res);
        pending ??= initialize(config)
          .then((value) => {
            service = value;
            return value;
          })
          .catch(() => {
            retryAt = Date.now() + retryAfterMs;
            throw new Error("Account initialization failed.");
          })
          .finally(() => {
            pending = undefined;
          });
        await pending;
      }
      if (path === "/api/auth/ok") return await service.handleAuth(req, res);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const setCookie = (cookie) => res.append("Set-Cookie", cookie);
      if (profile) {
        const identity = await service.identity(headers, setCookie);
        if (identity.status !== "authenticated")
          throw new AccountRequestError(
            401,
            "SIGN_IN_REQUIRED",
            "Sign in to continue.",
          );
        requireIdentityView(req, identity);
        if (mutation) {
          requireMutation(req, identity, config);
          await service.limitPrivate(identity);
        }
        return res.json(
          mutation
            ? await service.actions.updateProfile(
                req.body,
                identity,
                headers,
                setCookie,
              )
            : await service.actions.profile(identity, headers),
        );
      }
      if (reading) {
        if (!service.reading) return unavailable(res);
        const identity = await service.identity(headers, setCookie);
        if (identity.status !== "authenticated")
          throw new AccountRequestError(
            401,
            "SIGN_IN_REQUIRED",
            "Sign in to continue.",
          );
        requireIdentityView(req, identity);
        if (mutation) {
          requireMutation(req, identity, config);
          await service.limitPrivate(identity, reading.action);
        }
        const args =
          reading.action === "state"
            ? [identity]
            : [
                req.method === "GET" ? req.query : req.body,
                identity,
                reading.referenceId,
              ];
        return res.json(await service.reading[reading.action](...args));
      }
      if (path === "/api/account/capabilities")
        return res.json(service.actions.capabilities());
      if (path === "/api/account/sign-up")
        return res
          .status(202)
          .json(await service.actions.signup(req.body, requestIP(req, env)));
      if (path === "/api/account/resend-verification")
        return res
          .status(202)
          .json(await service.actions.resend(req.body, requestIP(req, env)));
      if (path === "/api/account/verify-email")
        return res.json(
          await service.actions.verify(req.body, requestIP(req, env)),
        );
      if (path === "/api/account/sign-in")
        return res.json(
          await service.actions.signin(
            req.body,
            requestIP(req, env),
            headers,
            setCookie,
          ),
        );
      if (path === "/api/account/forgot-password")
        return res
          .status(202)
          .json(await service.actions.recover(req.body, requestIP(req, env)));
      if (path === "/api/account/reset-password")
        return res.json(
          await service.actions.reset(req.body, requestIP(req, env)),
        );
      if (path === "/api/account/email-change/confirm")
        return res.json(
          await service.actions.confirmEmailChange(
            req.body,
            requestIP(req, env),
            headers,
            setCookie,
          ),
        );
      if (
        [
          "/api/account/reauth/password",
          "/api/account/password",
          "/api/account/sessions",
          "/api/account/sessions/revoke",
          "/api/account/sign-out-all",
          "/api/account/email-change",
          "/api/account/email-change/cancel",
        ].includes(path)
      ) {
        const identity = await service.identity(headers, setCookie);
        if (identity.status !== "authenticated")
          throw new AccountRequestError(
            401,
            "SIGN_IN_REQUIRED",
            "Sign in to continue.",
          );
        requireIdentityView(req, identity);
        if (isPost) requireMutation(req, identity, config);
        if (path === "/api/account/email-change")
          return res
            .status(202)
            .json(
              await service.actions.requestEmailChange(
                req.body,
                identity,
                headers,
              ),
            );
        if (path === "/api/account/email-change/cancel")
          return res.json(
            await service.actions.cancelEmailChange(
              req.body,
              identity,
              headers,
            ),
          );
        if (path === "/api/account/reauth/password")
          return res.json(
            await service.actions.confirmPassword(
              req.body,
              identity,
              headers,
              setCookie,
            ),
          );
        if (path === "/api/account/password")
          return res.json(
            await service.actions.changePassword(
              req.body,
              identity,
              headers,
              setCookie,
            ),
          );
        if (path === "/api/account/sessions")
          return res.json(await service.actions.list(identity, headers));
        if (path === "/api/account/sessions/revoke")
          return res.json(
            await service.actions.revoke(
              req.body,
              identity,
              headers,
              setCookie,
            ),
          );
        return res.json(
          await service.actions.revokeAll(
            req.body,
            identity,
            headers,
            setCookie,
          ),
        );
      }
      if (path === "/api/account/sign-out") {
        const identity = await service.identity(headers, setCookie);
        if (identity.status === "authenticated")
          requireMutation(req, identity, config);
        return res.json(await service.actions.signout(headers, setCookie));
      }
      return res.json(await service.session(headers, setCookie));
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error instanceof AccountRequestError) {
        if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
        return res
          .status(error.status)
          .json({ error: { code: error.code, message: error.message } });
      }
      if (error?.type === "entity.too.large")
        return res
          .status(413)
          .json({
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: "This request is too large.",
            },
          });
      if (error?.type === "entity.parse.failed")
        return res
          .status(400)
          .json({
            error: {
              code: "INVALID_JSON",
              message: "Check the submitted fields.",
            },
          });
      if (error?.statusCode === 403)
        return res
          .status(403)
          .json({
            error: {
              code: "VERIFY_EMAIL_REQUIRED",
              message: "Verify your email before signing in.",
            },
          });
      if (error?.statusCode === 401)
        return res
          .status(401)
          .json({
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Check your email and password.",
            },
          });
      return unavailable(res);
    }
  };
}
