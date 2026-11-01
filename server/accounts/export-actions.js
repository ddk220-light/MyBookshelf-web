import { strictObject, accountToken } from "./validation.js";
import { operationId } from "./operations.js";
import { challengeDigest } from "../jobs/mail.js";
import { AccountRequestError, consumeLimits } from "./security.js";
export function createExportActions({ owned, pool, config }) {
  return {
    async exportAccount(body, identity) {
      strictObject(body, ["proof", "operationId"]);
      const id = operationId(body.operationId),
        digest = challengeDigest(accountToken(body.proof));
      await consumeLimits(pool, config.secret, [
        { scope: "export", subject: identity.user.id, max: 3, seconds: 3600 },
      ]);
      try {
        return await owned(
          identity,
          async (client, settings, owner) => {
            const profile = (
              await client.query(
                "SELECT public.account_export_authorize($1,$2,$3) AS profile",
                [identity.sessionId, digest, id],
              )
            ).rows[0].profile;
            const libraries = (
              await client.query(
                'SELECT directory_id AS "directoryId",selected FROM user_libraries WHERE user_id=$1 ORDER BY directory_id',
                [owner],
              )
            ).rows;
            const savedBooks = (
              await client.query(
                'SELECT r.book_key AS "bookKey",b.saved_at AS "savedAt",b.display_snapshot AS display FROM user_books b JOIN book_refs r ON r.id=b.reference_id WHERE b.user_id=$1 ORDER BY b.saved_at,b.reference_id',
                [owner],
              )
            ).rows;
            const recentlyViewed = (
              await client.query(
                'SELECT r.book_key AS "bookKey",v.viewed_at AS "viewedAt",v.display_snapshot AS display FROM recent_book_views v JOIN book_refs r ON r.id=v.reference_id WHERE v.user_id=$1 AND v.viewed_at>now()-interval \'30 days\' ORDER BY v.viewed_at DESC,v.reference_id DESC LIMIT 50',
                [owner],
              )
            ).rows;
            return {
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              profile,
              preferences: { historyEnabled: settings.history_enabled },
              libraries,
              savedBooks,
              recentlyViewed,
            };
          },
          { repeatableRead: true },
        );
      } catch (error) {
        if (error.code === "P0001")
          throw new AccountRequestError(
            403,
            "RECENT_AUTH_REQUIRED",
            "Confirm it’s you again before downloading.",
          );
        if (error.code === "40001")
          throw new AccountRequestError(
            409,
            "VERSION_CONFLICT",
            "Your account changed during export. Try again.",
          );
        throw error;
      }
    },
  };
}
