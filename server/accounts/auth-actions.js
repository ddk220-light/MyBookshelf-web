import {
  AccountRequestError,
  consumeLimits,
  safeReturnPath,
} from "./security.js";
import {
  strictObject,
  privateName,
  emailAddress,
  accountPassword,
  accountToken,
} from "./validation.js";
import { challengeDigest } from "../jobs/mail.js";
import { authTransaction } from "../auth/transaction.js";
import { accountCapabilities } from './capabilities.js';
import { createHash } from "node:crypto";

// The magic-link plugin stores only this digest of a link's token
// (storeToken: "hashed": SHA-256, base64url without padding).
const magicLinkDigest = async (token) =>
  createHash("sha256").update(token).digest("base64url");

const ack = Object.freeze({
  status: "check-email",
  message: "Check your email for the next step.",
});
const wrongCredentials = () =>
  new AccountRequestError(
    401,
    "INVALID_CREDENTIALS",
    "Check your email and password.",
  );
const linkExpired = () =>
  new AccountRequestError(
    400,
    "LINK_EXPIRED",
    "This link has expired or was already used.",
  );
const magicAck = Object.freeze({
  status: "check-email",
  message: "If that address has an account, a link is on its way.",
});
export function createAuthActions({ auth, pool, config }) {
  const mailReady = () =>
    Boolean(
      config.jobSecret?.length >= 32 && config.mailFrom && config.resendKey,
    );
  const requireMail = () => {
    if (!mailReady())
      throw new AccountRequestError(
        503,
        "MAIL_UNAVAILABLE",
        "Account email is temporarily unavailable. Try again shortly.",
      );
  };
  const limits = async (action, email, ip) =>
    consumeLimits(pool, config.secret, [
      { scope: action + ":address", subject: email, max: 5, seconds: 3600 },
      { scope: action + ":ip", subject: ip, max: 30, seconds: 3600 },
    ]);
  return {
    capabilities() {
      return accountCapabilities(config);
    },
    async signup(body, ip) {
      requireMail();
      strictObject(body, ["name", "email", "password"]);
      const name = privateName(body.name),
        email = emailAddress(body.email),
        password = accountPassword(body.password);
      await limits("signup", email, ip);
      const started = new Date();
      await auth.api.signUpEmail({
        body: {
          name,
          email,
          password,
          callbackURL: config.baseURL + "/app/account/verify",
        },
      });
      // The pinned library catches mail callback errors. Confirm the durable
      // postcondition before claiming an email was queued, including duplicates.
      const queued = await pool.query(
        `SELECT 1 FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId"
        WHERE u.email=$1 AND j."createdAt">=$2 AND j.kind IN ('verify','duplicate') LIMIT 1`,
        [email, started],
      );
      if (!queued.rowCount)
        throw new AccountRequestError(
          503,
          "MAIL_UNAVAILABLE",
          "We could not queue the email. Try again shortly.",
        );
      return ack;
    },
    async resend(body, ip) {
      requireMail();
      strictObject(body, ["email"]);
      const email = emailAddress(body.email);
      await limits("verification", email, ip);
      await consumeLimits(pool, config.secret, [
        { scope: "verification:cooldown", subject: email, max: 1, seconds: 60 },
      ]);
      await auth.api.sendVerificationEmail({
        body: { email, callbackURL: config.baseURL + "/app/account/verify" },
      });
      return ack;
    },
    async verify(body, ip, headers = new Headers(), setCookie = () => {}) {
      await consumeLimits(pool, config.secret, [
        { scope: "verify:ip", subject: ip, max: 30, seconds: 60 },
      ]);
      strictObject(body, ["token"]);
      const token = accountToken(body.token);
      const candidate = (
        await pool.query(
          "SELECT \"authUserId\" FROM account_email_challenges WHERE digest=$1 AND purpose='verify'",
          [challengeDigest(token)],
        )
      ).rows[0];
      if (!candidate)
        throw new AccountRequestError(
          400,
          "LINK_EXPIRED",
          "This link has expired or was already used.",
        );
      return authTransaction(
        auth,
        pool,
        candidate.authUserId,
        async (adapter, context) => {
          const challenge = await adapter.findOne({
            model: "accountChallenge",
            where: [
              { field: "digest", value: challengeDigest(token) },
              { field: "purpose", value: "verify" },
            ],
          });
          if (
            !challenge ||
            challenge.usedAt ||
            new Date(challenge.expiresAt) <= new Date()
          )
            throw new AccountRequestError(
              400,
              "LINK_EXPIRED",
              "This link has expired or was already used. Request a new email.",
            );
          const user = await context.internalAdapter.findUserById(
            challenge.authUserId,
          );
          if (!user || user.emailVerified)
            throw new AccountRequestError(
              400,
              "LINK_EXPIRED",
              "This link has expired or was already used.",
            );
          // The link signs the reader in (owner's decision): one use, 24 hours.
          const previous = await auth.api.getSession({
            headers,
            query: { disableRefresh: true },
          });
          const verified = await auth.api.verifyEmail({
            query: { token },
            headers,
            returnHeaders: true,
          });
          await adapter.update({
            model: "accountChallenge",
            where: [{ field: "id", value: challenge.id }],
            update: { usedAt: new Date() },
          });
          const cookies = verified.headers.getSetCookie();
          // Another account's session in this browser ends here, as at sign-in.
          if (cookies.length && previous?.session?.token && previous.user.id !== user.id)
            await context.internalAdapter.deleteSession(previous.session.token);
          return { cookies, email: user.email };
        },
      ).then(({ cookies, email }) => {
        for (const cookie of cookies) setCookie(cookie);
        return { status: "verified", signedIn: cookies.length > 0, email };
      });
    },
    // Log in with an emailed link (B10): existing, verified, active accounts
    // only. The answer is the same whether or not the address has one.
    async requestMagicLink(body, ip, headers) {
      requireMail();
      strictObject(body, ["email"]);
      const email = emailAddress(body.email);
      const started = Date.now();
      // Limited like password resets.
      await consumeLimits(pool, config.secret, [
        { scope: "magic-link:address", subject: email, max: 5, seconds: 3600 },
        { scope: "magic-link:ip", subject: ip, max: 30, seconds: 3600 },
      ]);
      try {
        const user = (
          await pool.query(
            `SELECT u.id FROM "user" u LEFT JOIN app_users a ON a.auth_user_id=u.id
            WHERE u.email=$1 AND u."emailVerified" AND coalesce(a.status,'active')='active'`,
            [email],
          )
        ).rows[0];
        if (user)
          await auth.api.signInMagicLink({ body: { email }, headers });
      } catch {
        /* Existence-neutral response. */
      }
      if (Date.now() - started < 500)
        await new Promise((r) => setTimeout(r, 500 - (Date.now() - started)));
      return magicAck;
    },
    async magicLinkSignIn(body, ip, headers, setCookie) {
      await consumeLimits(pool, config.secret, [
        { scope: "magic-link:complete", subject: ip, max: 10, seconds: 900 },
      ]);
      strictObject(body, ["token"]);
      const token = accountToken(body.token);
      const context = await auth.$context;
      const stored = await context.internalAdapter.findVerificationValue(
        "magic-link:" + (await magicLinkDigest(token)),
      );
      let email = null;
      try {
        email = JSON.parse(stored?.value || "null")?.email ?? null;
      } catch {
        /* Unreadable: expired below. */
      }
      if (!stored || !email || new Date(stored.expiresAt) <= new Date())
        throw linkExpired();
      const user = (
        await pool.query('SELECT id,"emailVerified" FROM "user" WHERE email=$1', [email])
      ).rows[0];
      if (!user?.emailVerified) throw linkExpired();
      let result;
      try {
        result = await authTransaction(auth, pool, user.id, async (adapter, context) => {
          const previous = await auth.api.getSession({
            headers,
            query: { disableRefresh: true },
          });
          const signed = await auth.api.magicLinkVerify({
            query: { token },
            headers,
            returnHeaders: true,
          });
          if (previous?.session?.token && previous.session.token !== signed.response?.token)
            await context.internalAdapter.deleteSession(previous.session.token);
          return signed;
        });
      } catch (error) {
        // A used, expired or refused link (the library answers with a status,
        // a deleted account with ACCOUNT_UNAVAILABLE). Anything else, such as
        // a database failure, stays an error ("Couldn't connect").
        if (
          (error instanceof AccountRequestError && error.code === "ACCOUNT_UNAVAILABLE") ||
          (!(error instanceof AccountRequestError) && typeof error?.statusCode === "number")
        )
          throw linkExpired();
        throw error;
      }
      if (!result?.response?.token) throw linkExpired();
      for (const cookie of result.headers.getSetCookie()) setCookie(cookie);
      return { status: "signed-in", email };
    },
    async signin(body, ip, headers, setCookie) {
      strictObject(body, ["email", "password", "returnTo"]);
      const email = emailAddress(body.email);
      if (typeof body.password !== "string" || body.password.length > 256)
        throw new AccountRequestError(
          400,
          "INVALID_CREDENTIALS",
          "Check your email and password.",
        );
      await consumeLimits(pool, config.secret, [
        { scope: "signin:ip", subject: ip, max: 30, seconds: 900 },
        { scope: "signin:address", subject: email, max: 5, seconds: 900 },
      ]);
      const user = (
        await pool.query('SELECT id FROM \"user\" WHERE email=$1', [email])
      ).rows[0];
      // A deleted (or deleting) account answers exactly like a wrong
      // password (owner's decision 9), before the password is looked at.
      const result = await authTransaction(
        auth,
        pool,
        user?.id,
        async (adapter, context) => {
          const signed = await auth.api.signInEmail({
            body: { email, password: body.password },
            headers,
            returnHeaders: true,
          });
          const previous = await auth.api.getSession({
            headers,
            query: { disableRefresh: true },
          });
          if (
            previous?.session?.token &&
            previous.session.token !== signed.response.token
          )
            await context.internalAdapter.deleteSession(previous.session.token);
          return signed;
        },
      ).catch((error) => {
        if (error instanceof AccountRequestError && error.code === "ACCOUNT_UNAVAILABLE")
          throw wrongCredentials();
        throw error;
      });
      // Reject deleting identities even if a valid credential still exists.
      const lifecycle = await pool.query(
        "SELECT status FROM app_users WHERE auth_user_id=$1",
        [result.response.user.id],
      );
      if (lifecycle.rowCount && lifecycle.rows[0].status !== "active") {
        await pool.query('DELETE FROM "session" WHERE token=$1', [
          result.response.token,
        ]);
        throw wrongCredentials();
      }
      for (const cookie of result.headers.getSetCookie()) setCookie(cookie);
      return { status: "signed-in", returnTo: safeReturnPath(body.returnTo) };
    },
    async signout(headers, setCookie) {
      const result = await auth.api.signOut({ headers, returnHeaders: true });
      for (const cookie of result.headers.getSetCookie()) setCookie(cookie);
      return { status: "signed-out" };
    },
  };
}
