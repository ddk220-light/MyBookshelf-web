import { withOwner } from "../db/owner-transaction.js";
import { createPublicDirectoryService } from "../public-v2/directory.js";
import { strictObject } from "./validation.js";
import {
  operation,
  revision,
  conflict,
  invalid,
  versions,
} from "./operations.js";
import { AccountRequestError } from "./security.js";

export function createReadingActions({
  pool,
  sessionActive = async () => true,
  directory = createPublicDirectoryService(),
}) {
  const owned = (identity, run, options) =>
    withOwner(pool, identity.user.id, async (client) => {
      if (!(await sessionActive(identity, client)))
        throw new AccountRequestError(
          401,
          "SIGN_IN_REQUIRED",
          "Sign in to continue.",
        );
      await client.query(
        "INSERT INTO user_settings(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [identity.user.id],
      );
      const settings = (
        await client.query("SELECT * FROM user_settings WHERE user_id=$1", [
          identity.user.id,
        ])
      ).rows[0];
      return run(client, settings, identity.user.id);
    },options);
  const validateLibrary = (id) => {
    if (
      id !== null &&
      (typeof id !== "string" || id.length > 200 || !directory.resolve(id))
    )
      throw invalid("Choose a library currently listed in the directory.");
    return id;
  };
  return {
    owned,
    validateLibrary,
    async state(identity) {
      return owned(identity, async (client, settings, id) => {
        const selected =
          (
            await client.query(
              "SELECT directory_id FROM user_libraries WHERE user_id=$1 AND selected",
              [id],
            )
          ).rows[0]?.directory_id ?? null;
        const counts = (
          await client.query(
            `SELECT (SELECT count(*)::int FROM user_books WHERE user_id=$1) AS saved,
          (SELECT count(*)::int FROM recent_book_views WHERE user_id=$1) AS recent`,
            [id],
          )
        ).rows[0];
        return {
          profile: {
            ...identity.user,
            profileRevision: Number(
              (
                await client.query(
                  "SELECT profile_revision FROM app_users WHERE id=$1",
                  [id],
                )
              ).rows[0].profile_revision,
            ),
          },
          selectedLibraryId: selected,
          selectedLibrary: selected ? directory.resolve(selected) : null,
          libraryRemoved: Boolean(selected && !directory.resolve(selected)),
          counts,
          ...versions(settings),
        };
      });
    },
    async selectLibrary(body, identity) {
      strictObject(body, ["libraryId", "settingsRevision", "operationId"]);
      revision(body.settingsRevision);
      return owned(identity, (client, settings, id) =>
        operation(client, id, "library", body, async () => {
          if (Number(settings.revision) !== body.settingsRevision)
            throw conflict();
          validateLibrary(body.libraryId);
          await client.query(
            "UPDATE user_libraries SET selected=false WHERE user_id=$1 AND selected",
            [id],
          );
          if (body.libraryId !== null)
            await client.query(
              "INSERT INTO user_libraries(user_id,directory_id,selected) VALUES($1,$2,true) ON CONFLICT(user_id,directory_id) DO UPDATE SET selected=true",
              [id, body.libraryId],
            );
          const updated = (
            await client.query(
              "UPDATE user_settings SET revision=revision+1 WHERE user_id=$1 RETURNING *",
              [id],
            )
          ).rows[0];
          return { selectedLibraryId: body.libraryId, ...versions(updated) };
        }),
      );
    },
  };
}
