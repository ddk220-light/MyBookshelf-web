import { timingSafeEqual } from "node:crypto";
import {
  getCurrentAdapter,
  runWithTransaction,
} from "@better-auth/core/context";
import { authTransaction } from "../auth/transaction.js";
import { strictObject } from "./validation.js";
import { operationId } from "./operations.js";
import { AccountRequestError, consumeLimits } from "./security.js";
import { challengeDigest, enqueueAccountMail } from "../jobs/mail.js";
import { enqueueProviderCleanup } from "../jobs/provider-cleanup.js";
export function createDeletionActions({
  auth,
  pool,
  config,
  consumeProof,
  ledger,
}) {
  const nonce = (value) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
  const sameNonce = (digest, value) =>
    nonce(value) &&
    timingSafeEqual(
      Buffer.from(digest, "hex"),
      Buffer.from(challengeDigest(value), "hex"),
    );
  const summary = (job) => ({
    status: job.cleanedAt
      ? "cleaned"
      : job.status === "pending-ledger"
        ? "pending"
        : "accepted",
    accessEnded: true,
    cleanupComplete: Boolean(job.cleanedAt),
  });
  return {
    async deleteAccount(body, identity, headers, setCookie) {
      strictObject(body, [
        "proof",
        "operationId",
        "receiptNonce",
        "confirmation",
      ]);
      const id = operationId(body.operationId);
      if (!nonce(body.receiptNonce) || body.confirmation !== "delete-account")
        throw new AccountRequestError(
          422,
          "CONFIRMATION_REQUIRED",
          "Review and explicitly confirm account deletion.",
        );
      if (!ledger || !config.jobSecret || !config.resendKey || !config.mailFrom)
        throw new AccountRequestError(
          503,
          "DELETION_UNAVAILABLE",
          "Account deletion is temporarily unavailable. Try again shortly.",
        );
      await consumeLimits(pool, config.secret, [
        { scope: "delete", subject: identity.user.id, max: 3, seconds: 3600 },
      ]);
      const result = await authTransaction(
        auth,
        pool,
        identity.authUserId,
        async (adapter, context) => {
          const current = await auth.api.getSession({
            headers,
            query: { disableRefresh: true },
          });
          if (
            current?.session.id !== identity.sessionId ||
            !current.user.emailVerified
          )
            throw new AccountRequestError(
              401,
              "SIGN_IN_REQUIRED",
              "Sign in again.",
            );
          await consumeProof(adapter, identity, body.proof, "delete");
          const existing = await adapter.findOne({
            model: "accountDeletion",
            where: [{ field: "id", value: id }],
          });
          if (existing)
            throw new AccountRequestError(
              409,
              "OPERATION_CONFLICT",
              "Check the status of the existing deletion request.",
            );
          const now = new Date(),
            job = await adapter.create({
              model: "accountDeletion",
              forceAllowId: true,
              data: {
                id,
                authUserId: identity.authUserId,
                appUserId: identity.user.id,
                receiptDigest: challengeDigest(body.receiptNonce),
                status: "pending-ledger",
                requestedAt: now,
                availableAt: now,
                attempts: 0,
              },
            });
          for (const account of await context.internalAdapter.findAccounts(
            identity.authUserId,
          ))
            await enqueueProviderCleanup(auth, config, account, id);
          await adapter.update({
            model: "appUser",
            where: [{ field: "authUserId", value: identity.authUserId }],
            update: { status: "deleting" },
          });
          await context.internalAdapter.deleteUserSessions(identity.authUserId);
          const reply = await auth.api.signOut({
            headers,
            returnHeaders: true,
          });
          return { job, reply };
        },
      );
      for (const cookie of result.reply.headers.getSetCookie())
        setCookie(cookie);
      try {
        await ledger.persistRequest(result.job);
        for (const job of (
          await pool.query(
            'SELECT * FROM account_provider_cleanup WHERE "deletionId"=$1 AND payload<>$2',
            [id, ""],
          )
        ).rows)
          await ledger.persistProviderJob(job);
        await pool.query(
          `UPDATE account_deletions SET status='queued' WHERE id=$1 AND status='pending-ledger'`,
          [id],
        );
        result.job.status = "queued";
      } catch {
        /* Access has ended; the durable job retries the independent ledger. */
      }
      return summary(result.job);
    },
    async deletionStatus(body, ip) {
      strictObject(body, ["operationId", "receiptNonce"]);
      await consumeLimits(pool, config.secret, [
        { scope: "delete-status", subject: ip, max: 30, seconds: 60 },
      ]);
      if (
        typeof body.operationId !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(body.operationId) ||
        !nonce(body.receiptNonce)
      )
        return { status: "unavailable" };
      const job = (
        await pool.query(
          'SELECT status,"receiptDigest","cleanedAt" FROM account_deletions WHERE id=$1',
          [body.operationId],
        )
      ).rows[0];
      if (!job || !sameNonce(job.receiptDigest, body.receiptNonce))
        return { status: "unavailable" };
      return summary(job);
    },
    async purgeDeletion(job) {
      const context = await auth.$context;
      return runWithTransaction(context.adapter, async () => {
        const adapter = await getCurrentAdapter(context.adapter),
          current = await adapter.findOne({
            model: "accountDeletion",
            where: [
              { field: "id", value: job.id },
              { field: "leaseOwner", value: job.leaseOwner },
              { field: "status", value: "queued" },
              { field: "leaseUntil", operator: "gt", value: new Date() },
            ],
          });
        if (!current) throw Error("Deletion lease expired.");
        const app = await adapter.findOne({
          model: "appUser",
          where: [{ field: "authUserId", value: job.authUserId }],
        });
        if (app) {
          const locked = await adapter.update({
            model: "appUser",
            where: [
              { field: "authUserId", value: job.authUserId },
              { field: "status", value: "deleting" },
            ],
            update: { status: "deleting" },
          });
          if (!locked) throw Error("Deletion status changed.");
        }
        const user = await context.internalAdapter.findUserById(job.authUserId);
        for (const model of [
          "accountMail",
          "accountChallenge",
          "recentProof",
          "providerIntent",
        ])
          await adapter.deleteMany({
            model,
            where: [{ field: "authUserId", value: job.authUserId }],
          });
        await adapter.deleteMany({
          model: "verification",
          where: [{ field: "value", value: job.authUserId }],
        });
        await context.internalAdapter.deleteUser(job.authUserId);
        if (user) await enqueueAccountMail(auth, config, "deleted", { user });
        const cleanedAt = new Date();
        await adapter.update({
          model: "accountDeletion",
          where: [
            { field: "id", value: job.id },
            { field: "leaseOwner", value: job.leaseOwner },
          ],
          update: { status: "cleaned", cleanedAt },
        });
        return { ...job, status: "cleaned", cleanedAt };
      });
    },
  };
}
