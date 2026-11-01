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
  checkCompromisedPassword,
} from "./validation.js";
import { challengeDigest } from "../jobs/mail.js";
import { authTransaction } from "../auth/transaction.js";
import {configuredProviders} from '../auth/providers.js';

const ack = Object.freeze({
  status: "check-email",
  message: "Check your email for the next step.",
});
export function createAuthActions({
  auth,
  pool,
  config,
  checkPassword = checkCompromisedPassword,
}) {
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
      const providers=configuredProviders(config);return { email: mailReady(), google:Boolean(providers.google), apple:Boolean(providers.apple&&config.secureCookies),canonicalOrigin:config.baseURL };
    },
    async signup(body, ip) {
      requireMail();
      strictObject(body, ["name", "email", "password"]);
      const name = privateName(body.name),
        email = emailAddress(body.email),
        password = accountPassword(body.password);
      await limits("signup", email, ip);
      await checkPassword(password);
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
    async verify(body, ip) {
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
          await auth.api.verifyEmail({ query: { token } });
          await adapter.update({
            model: "accountChallenge",
            where: [{ field: "id", value: challenge.id }],
            update: { usedAt: new Date() },
          });
          return { status: "verified" };
        },
      );
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
      );
      // Reject deleting identities even if a valid credential still exists.
      const lifecycle = await pool.query(
        "SELECT status FROM app_users WHERE auth_user_id=$1",
        [result.response.user.id],
      );
      if (lifecycle.rowCount && lifecycle.rows[0].status !== "active") {
        await pool.query('DELETE FROM "session" WHERE token=$1', [
          result.response.token,
        ]);
        throw new AccountRequestError(
          403,
          "ACCOUNT_UNAVAILABLE",
          "This account is unavailable.",
        );
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
