import { strictObject, emailAddress, accountToken } from "./validation.js";
import { AccountRequestError, consumeLimits } from "./security.js";
import { authTransaction } from "../auth/transaction.js";
import { challengeDigest, enqueueAccountMail } from "../jobs/mail.js";
const expired = () =>
  new AccountRequestError(
    400,
    "LINK_EXPIRED",
    "This email-change link has expired or was already used. Your current email stays valid.",
  );
export function createEmailActions({ auth, pool, config, consumeProof }) {
  const requireMail = () => {
    if (!config.resendKey || !config.mailFrom || config.jobSecret?.length < 32)
      throw new AccountRequestError(
        503,
        "MAIL_UNAVAILABLE",
        "Account email is temporarily unavailable.",
      );
  };
  return {
    async requestEmailChange(body, identity, headers) {
      requireMail();
      strictObject(body, ["newEmail", "proof"]);
      const newEmail = emailAddress(body.newEmail);
      if (newEmail === identity.user.email)
        throw new AccountRequestError(
          422,
          "SAME_EMAIL",
          "Choose a different email address.",
        );
      await consumeLimits(pool, config.secret, [
        {
          scope: "email-change:user",
          subject: identity.authUserId,
          max: 3,
          seconds: 900,
        },
        {
          scope: "email-change:address",
          subject: newEmail,
          max: 3,
          seconds: 900,
        },
      ]);
      await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter, context) => {
          await consumeProof(adapter, identity, body.proof, "email-change");
          const user = await context.internalAdapter.findUserById(
            identity.authUserId,
          );
          await adapter.deleteMany({
            model: "accountChallenge",
            where: [
              { field: "authUserId", value: user.id },
              { field: "purpose", value: "email-change" },
            ],
          });
          const occupied = await adapter.findOne({
            model: "user",
            where: [{ field: "email", value: newEmail }],
          });
          await auth.api.changeEmail({ body: { newEmail }, headers });
          const challenge = await adapter.findOne({
            model: "accountChallenge",
            where: [
              { field: "authUserId", value: user.id },
              { field: "purpose", value: "email-change" },
              { field: "targetEmail", value: newEmail },
            ],
          });
          if (!occupied && !challenge)
            throw new AccountRequestError(
              503,
              "MAIL_UNAVAILABLE",
              "We could not queue the new-address verification. Your current email is unchanged.",
            );
          if (challenge)
            await adapter.update({
              model: "accountChallenge",
              where: [{ field: "id", value: challenge.id }],
              update: { sessionId: identity.sessionId },
            });
          // Required old-address notice and new-address verification commit together.
          await enqueueAccountMail(auth, config, "emailRequested", {
            user,
            newEmail,
          });
        },
      );
      return {
        status: "check-email",
        message:
          "If this address is available, check it for the next step. Your current email stays valid until you confirm.",
      };
    },
    async cancelEmailChange(body, identity, headers) {
      strictObject(body, []);
      await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter) => {
          const current = await auth.api.getSession({ headers });
          if (current?.session.id !== identity.sessionId)
            throw new AccountRequestError(
              401,
              "SIGN_IN_REQUIRED",
              "Sign in to continue.",
            );
          await adapter.deleteMany({
            model: "accountChallenge",
            where: [
              { field: "authUserId", value: identity.authUserId },
              { field: "purpose", value: "email-change" },
            ],
          });
        },
      );
      return { status: "cancelled" };
    },
    async confirmEmailChange(body, ip, headers, setCookie) {
      requireMail();
      strictObject(body, ["token"]);
      const token = accountToken(body.token);
      await consumeLimits(pool, config.secret, [
        { scope: "email-change:confirm", subject: ip, max: 30, seconds: 60 },
      ]);
      const candidate = (
        await pool.query(
          "SELECT \"authUserId\" FROM account_email_challenges WHERE digest=$1 AND purpose='email-change'",
          [challengeDigest(token)],
        )
      ).rows[0];
      if (!candidate) throw expired();
      let outcome;
      try {
        outcome = await authTransaction(
          auth,
          pool,
          candidate.authUserId,
          async (adapter, context) => {
            const challenge = await adapter.findOne({
              model: "accountChallenge",
              where: [
                { field: "digest", value: challengeDigest(token) },
                { field: "purpose", value: "email-change" },
              ],
            });
            if (
              !challenge ||
              challenge.usedAt ||
              new Date(challenge.expiresAt) <= new Date() ||
              !challenge.sessionId
            )
              throw expired();
            const original = await adapter.findOne({
              model: "session",
              where: [
                { field: "id", value: challenge.sessionId },
                { field: "userId", value: candidate.authUserId },
              ],
            });
            if (
              !original ||
              new Date(original.expiresAt) <= new Date() ||
              Date.now() - new Date(original.createdAt).getTime() >=
                30 * 86400000
            )
              throw expired();
            const existing = await auth.api.getSession({ headers });
            if (existing && existing.user.id !== candidate.authUserId)
              throw new AccountRequestError(
                409,
                "ACCOUNT_MISMATCH",
                "This link is for a different account. Sign out before continuing.",
              );
            const oldUser = await context.internalAdapter.findUserById(
              candidate.authUserId,
            );
            const occupied = await adapter.findOne({
              model: "user",
              where: [{ field: "email", value: challenge.targetEmail }],
            });
            if (occupied)
              throw new AccountRequestError(
                409,
                "EMAIL_UNAVAILABLE",
                "This email change could not be completed. Your current email is unchanged.",
              );
            await adapter.update({
              model: "accountChallenge",
              where: [{ field: "id", value: challenge.id }],
              update: { usedAt: new Date() },
            });
            const cleanHeaders = new Headers(headers);
            cleanHeaders.delete("cookie");
            cleanHeaders.set("origin", config.baseURL);
            const verified = await auth.api.verifyEmail({
              query: { token },
              headers: cleanHeaders,
              returnHeaders: true,
            });
            const freshHeaders = new Headers(cleanHeaders);
            freshHeaders.set(
              "cookie",
              verified.headers
                .getSetCookie()
                .map((c) => c.split(";")[0])
                .join("; "),
            );
            const current = await auth.api.getSession({
              headers: freshHeaders,
            });
            if (
              current?.user.id !== candidate.authUserId ||
              current.user.email !== challenge.targetEmail
            )
              throw new Error("New-email session postcondition failed.");
            await auth.api.revokeOtherSessions({ headers: freshHeaders });
            const app = await adapter.findOne({
              model: "appUser",
              where: [{ field: "authUserId", value: candidate.authUserId }],
            });
            await adapter.update({
              model: "appUser",
              where: [{ field: "id", value: app.id }],
              update: { profileRevision: Number(app.profileRevision) + 1 },
            });
            await enqueueAccountMail(auth, config, "emailChanged", {
              user: oldUser,
              newEmail: challenge.targetEmail,
            });
            return verified;
          },
        );
      } catch (error) {
        if (error?.code === "23505")
          throw new AccountRequestError(
            409,
            "EMAIL_UNAVAILABLE",
            "This email change could not be completed. Your current email is unchanged.",
          );
        if ([400, 401].includes(error?.statusCode)) throw expired();
        throw error;
      }
      for (const cookie of outcome.headers.getSetCookie()) setCookie(cookie);
      return { status: "email-updated" };
    },
  };
}
