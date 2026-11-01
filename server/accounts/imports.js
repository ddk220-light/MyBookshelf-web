import { strictObject } from "./validation.js";
import {
  operationId,
  revision,
  payloadHash,
  versions,
  invalid,
  conflict,
} from "./operations.js";
import { bookSnapshot, reference } from "./books.js";
import { historySources, trimHistory } from "./history.js";
import { AccountRequestError } from "./security.js";

export const IMPORT_BYTE_LIMIT = 2 * 1024 * 1024;
export function validateImport(body, validateLibrary, now = Date.now()) {
  strictObject(body, [
    "importId",
    "snapshot",
    "includeHistory",
    "libraryPolicy",
    "settingsRevision",
    "shelfRevision",
    "historyGeneration",
  ]);
  operationId(body.importId);
  revision(body.settingsRevision);
  revision(body.shelfRevision);
  revision(body.historyGeneration);
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > IMPORT_BYTE_LIMIT)
    throw new AccountRequestError(
      413,
      "PAYLOAD_TOO_LARGE",
      "This device snapshot is larger than the 2 MiB import limit. Your device data is unchanged.",
    );
  if (
    typeof body.includeHistory !== "boolean" ||
    !["keep-account", "use-device"].includes(body.libraryPolicy)
  )
    throw invalid("Choose what to import into this account.");
  const snapshot = strictObject(body.snapshot, [
    "version",
    "selectedLibraryId",
    "savedBooks",
    "recentBooks",
  ]);
  if (
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.savedBooks) ||
    snapshot.savedBooks.length > 100 ||
    !Array.isArray(snapshot.recentBooks) ||
    snapshot.recentBooks.length > 50
  )
    throw invalid(
      "Import supports up to 100 device saves and 50 recent books.",
    );
  if (
    snapshot.selectedLibraryId !== null &&
    (typeof snapshot.selectedLibraryId !== "string" ||
      snapshot.selectedLibraryId.length > 200)
  )
    throw invalid("This device library is invalid.");
  const parse = (entry) => {
    const book = bookSnapshot(entry);
    if (
      !historySources.has(entry.source) ||
      typeof entry.viewedAt !== "string" ||
      !Number.isFinite(Date.parse(entry.viewedAt)) ||
      Date.parse(entry.viewedAt) > now
    )
      throw invalid("A device book has an invalid or future timestamp.");
    return {
      ...book,
      source: entry.source,
      viewedAt: new Date(entry.viewedAt).toISOString(),
    };
  };
  const distinct = (rows) => [
    ...new Map(rows.map((row) => [row.bookKey, row])).values(),
  ];
  return {
    saved: distinct(snapshot.savedBooks.map(parse)),
    recent: distinct(snapshot.recentBooks.map(parse)),
  };
}
export function createImportActions({ owned, validateLibrary }) {
  return {
    async importGuest(body, identity) {
      const now = Date.now(),
        snapshot = validateImport(body, validateLibrary, now),
        hash = payloadHash(body);
      return owned(identity, async (client, settings, id) => {
        const prior = (
          await client.query(
            "SELECT payload_hash,result,expires_at FROM guest_imports WHERE user_id=$1 AND import_id=$2",
            [id, body.importId],
          )
        ).rows[0];
        if (prior) {
          if (!hash.equals(prior.payload_hash))
            throw new AccountRequestError(
              409,
              "IMPORT_CONFLICT",
              "This import identifier was already used with different choices or device data.",
            );
          if (new Date(prior.expires_at) <= new Date()) throw conflict();
          return prior.result;
        }
        if (
          Number(settings.revision) !== body.settingsRevision ||
          Number(settings.shelf_revision) !== body.shelfRevision ||
          Number(settings.history_generation) !== body.historyGeneration
        )
          throw conflict();
        if (body.libraryPolicy === "use-device")
          validateLibrary(body.snapshot.selectedLibraryId);
        const current = new Set(
          (
            await client.query(
              "SELECT r.book_key FROM user_books b JOIN book_refs r ON r.id=b.reference_id WHERE b.user_id=$1",
              [id],
            )
          ).rows.map((r) => r.book_key),
        );
        const incoming = snapshot.saved.filter(
          (book) => !current.has(book.bookKey),
        );
        if (current.size + incoming.length > 1000)
          throw new AccountRequestError(
            422,
            "SHELF_FULL",
            "This import would exceed 1,000 saved books. Nothing has been imported.",
          );
        for (const book of incoming) {
          const ref = await reference(client, book.bookKey);
          await client.query(
            "INSERT INTO user_books(user_id,reference_id,display_snapshot) VALUES($1,$2,$3)",
            [id, ref, book.snapshot],
          );
        }
        let historyExpired = 0,
          historyAccepted = 0;
        if (body.includeHistory) {
          for (const book of snapshot.recent) {
            if (Date.parse(book.viewedAt) <= now - 30 * 86400000) {
              historyExpired++;
              continue;
            }
            historyAccepted++;
            const ref = await reference(client, book.bookKey);
            await client.query(
              `INSERT INTO recent_book_views(user_id,reference_id,viewed_at,display_snapshot) VALUES($1,$2,$3,$4)
              ON CONFLICT(user_id,reference_id) DO UPDATE SET viewed_at=excluded.viewed_at,display_snapshot=excluded.display_snapshot
              WHERE recent_book_views.viewed_at<excluded.viewed_at`,
              [
                id,
                ref,
                book.viewedAt,
                { ...book.snapshot, source: book.source },
              ],
            );
          }
          await trimHistory(client, id);
        }
        if (body.libraryPolicy === "use-device") {
          await client.query(
            "UPDATE user_libraries SET selected=false WHERE user_id=$1 AND selected",
            [id],
          );
          if (body.snapshot.selectedLibraryId !== null)
            await client.query(
              "INSERT INTO user_libraries(user_id,directory_id,selected) VALUES($1,$2,true) ON CONFLICT(user_id,directory_id) DO UPDATE SET selected=true",
              [id, body.snapshot.selectedLibraryId],
            );
        }
        const updated = (
          await client.query(
            `UPDATE user_settings SET shelf_revision=shelf_revision+$2,revision=revision+$3,history_generation=history_generation+$4 WHERE user_id=$1 RETURNING *`,
            [
              id,
              incoming.length ? 1 : 0,
              body.libraryPolicy === "use-device" ? 1 : 0,
              body.includeHistory ? 1 : 0,
            ],
          )
        ).rows[0];
        const result = {
          status: "imported",
          savedAdded: incoming.length,
          savedAlreadyPresent: snapshot.saved.length - incoming.length,
          historyAccepted,
          historyExpired,
          deviceLibraryApplied: body.libraryPolicy === "use-device",
          ...versions(updated),
        };
        await client.query(
          "INSERT INTO guest_imports(user_id,import_id,payload_hash,result) VALUES($1,$2,$3,$4)",
          [id, body.importId, hash, result],
        );
        return result;
      });
    },
  };
}
