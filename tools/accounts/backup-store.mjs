// Nightly accounts backup, step 2 of 2: keep encrypted backups in a private
// Vercel Blob store for at most 30 days. See docs/accounts/OPERATIONS.md
// ("Nightly backup").
//
//   node tools/accounts/backup-store.mjs upload <file>    store one encrypted backup
//   node tools/accounts/backup-store.mjs prune            delete backups older than the window
//   node tools/accounts/backup-store.mjs list             list stored backups (names, sizes, times)
//   node tools/accounts/backup-store.mjs download <name> <file>
//
// Setting: ACCOUNTS_BACKUP_BLOB_READ_WRITE_TOKEN (secret), the read/write token
// of a private store used for nothing else. Only files named
// accounts-<UTC time>.sql.gz.age are accepted, so plain SQL is never uploaded.
import { createReadStream, createWriteStream, statSync } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const PREFIX = "accounts-backups/";
// Deleted a day before 30 days, so a delayed nightly run still keeps every
// copy within the 30 days the privacy text states.
export const KEEP_MS = 29 * 24 * 60 * 60 * 1000;
const NAME = /^accounts-\d{8}T\d{6}Z\.sql\.gz\.age$/;
const AGE_HEADER = "age-encryption.org/v1\n";

export function createBackupStore({ token, blob, now = () => Date.now() }) {
  if (!token) throw Error("ACCOUNTS_BACKUP_BLOB_READ_WRITE_TOKEN is not set. Nothing was uploaded or deleted.");
  const options = () => ({ token, abortSignal: AbortSignal.timeout(60_000) });
  async function all() {
    const blobs = [];
    let cursor;
    do {
      const page = await blob.list({ ...options(), prefix: PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
      blobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return blobs;
  }
  return {
    async upload(file, { head } = {}) {
      const name = basename(file);
      if (!NAME.test(name)) throw Error("Only encrypted backup files (accounts-<time>.sql.gz.age) are uploaded.");
      if (head !== undefined && !head.startsWith(AGE_HEADER)) throw Error("The file is not age-encrypted. Nothing was uploaded.");
      const result = await blob.put(PREFIX + name, createReadStream(file), {
        ...options(), access: "private", addRandomSuffix: false, allowOverwrite: false,
        contentType: "application/octet-stream", multipart: true,
      });
      return { pathname: result.pathname, bytes: statSync(file).size };
    },
    async prune() {
      const cutoff = now() - KEEP_MS;
      const old = (await all()).filter(item => new Date(item.uploadedAt).getTime() < cutoff);
      if (old.length) await blob.del(old.map(item => item.url), options());
      return { deleted: old.map(item => item.pathname) };
    },
    async list() {
      return (await all()).map(item => ({ pathname: item.pathname, size: item.size, uploadedAt: new Date(item.uploadedAt).toISOString() }))
        .sort((a, b) => a.pathname.localeCompare(b.pathname));
    },
    async download(name, file) {
      if (!NAME.test(name)) throw Error("Name a stored backup: accounts-<time>.sql.gz.age.");
      const response = await blob.get(PREFIX + name, { ...options(), access: "private", useCache: false });
      if (!response || response.statusCode !== 200) throw Error("That backup is not in the store.");
      await pipeline(Readable.fromWeb(response.stream), createWriteStream(file, { mode: 0o600, flags: "wx" }));
      return { file };
    },
  };
}

async function main([command, ...args]) {
  const require = createRequire(new URL("../../server/package.json", import.meta.url));
  const blob = require("@vercel/blob");
  const store = createBackupStore({ token: process.env.ACCOUNTS_BACKUP_BLOB_READ_WRITE_TOKEN, blob });
  if (command === "upload" && args[0]) {
    const { readFileSync } = await import("node:fs");
    const head = readFileSync(args[0]).subarray(0, AGE_HEADER.length).toString("latin1");
    const result = await store.upload(args[0], { head });
    console.log("Stored", result.pathname, result.bytes, "bytes.");
  } else if (command === "prune") {
    const { deleted } = await store.prune();
    console.log("Deleted", deleted.length, "backup(s) older than 29 days.", ...deleted);
  } else if (command === "list") {
    for (const item of await store.list()) console.log(item.pathname, item.size, item.uploadedAt);
  } else if (command === "download" && args[0] && args[1]) {
    await store.download(args[0], args[1]);
    console.log("Saved", args[1]);
  } else {
    throw Error("Use: upload <file> | prune | list | download <name> <file>");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    // Messages are ours; no token or connection value is ever printed.
    console.error(error instanceof Error ? error.message : "The backup store failed.");
    process.exitCode = 1;
  });
}
