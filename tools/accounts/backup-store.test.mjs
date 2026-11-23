import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createBackupStore, KEEP_MS, PREFIX } from "./backup-store.mjs";

const DAY = 24 * 60 * 60 * 1000;
function fakeBlob(items = []) {
  const calls = [];
  return {
    calls,
    async list({ prefix, cursor }) {
      calls.push(["list", prefix]);
      const page = items.filter(item => item.pathname.startsWith(prefix));
      // Two pages, to check the listing follows its cursor.
      return cursor ? { blobs: page.slice(1), hasMore: false } : { blobs: page.slice(0, 1), hasMore: page.length > 1, cursor: "next" };
    },
    async del(urls) { calls.push(["del", urls]); },
    async put(pathname, body, options) {
      calls.push(["put", pathname, options.access, options.allowOverwrite, options.addRandomSuffix]);
      for await (const _chunk of body) { /* consume */ }
      return { pathname };
    },
    async get(pathname) {
      calls.push(["get", pathname]);
      return { statusCode: 200, stream: Readable.toWeb(Readable.from([Buffer.from("age-encryption.org/v1\nsynthetic")])) };
    },
  };
}

test("does nothing without its token", () => {
  assert.throws(() => createBackupStore({ token: "", blob: fakeBlob() }), /not set\. Nothing was uploaded or deleted/);
});

test("uploads only encrypted backup files, privately and without overwriting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "backup-store-"));
  const good = join(dir, "accounts-20261113T202300Z.sql.gz.age");
  writeFileSync(good, "age-encryption.org/v1\nsynthetic");
  const blob = fakeBlob();
  const store = createBackupStore({ token: "synthetic", blob });
  assert.deepEqual(await store.upload(good, { head: "age-encryption.org/v1\n" }), { pathname: PREFIX + "accounts-20261113T202300Z.sql.gz.age", bytes: 31 });
  assert.deepEqual(blob.calls.at(-1), ["put", PREFIX + "accounts-20261113T202300Z.sql.gz.age", "private", false, false]);
  const plain = join(dir, "accounts.sql");
  writeFileSync(plain, "CREATE TABLE");
  await assert.rejects(store.upload(plain), /Only encrypted backup files/);
  await assert.rejects(store.upload(good, { head: "-- PostgreSQL database dump\n" }), /not age-encrypted/);
  assert.equal(blob.calls.filter(call => call[0] === "put").length, 1);
});

test("prune deletes only backups older than the window, across pages", async () => {
  const now = Date.UTC(2026, 10, 13, 20, 23);
  const at = days => new Date(now - days * DAY).toISOString();
  const items = [
    { pathname: PREFIX + "accounts-old.sql.gz.age", url: "https://blob.example/old", uploadedAt: at(29.01) },
    { pathname: PREFIX + "accounts-new.sql.gz.age", url: "https://blob.example/new", uploadedAt: at(28.9) },
    { pathname: PREFIX + "accounts-older.sql.gz.age", url: "https://blob.example/older", uploadedAt: at(45) },
    { pathname: "unrelated/file", url: "https://blob.example/other", uploadedAt: at(400) },
  ];
  const blob = fakeBlob(items);
  const { deleted } = await createBackupStore({ token: "synthetic", blob, now: () => now }).prune();
  assert.deepEqual(deleted, [PREFIX + "accounts-old.sql.gz.age", PREFIX + "accounts-older.sql.gz.age"]);
  assert.deepEqual(blob.calls.find(call => call[0] === "del")[1], ["https://blob.example/old", "https://blob.example/older"]);
  assert.ok(KEEP_MS < 30 * DAY);
  // Nothing old: no delete call.
  const fresh = fakeBlob([items[1]]);
  await createBackupStore({ token: "synthetic", blob: fresh, now: () => now }).prune();
  assert.equal(fresh.calls.some(call => call[0] === "del"), false);
});

test("download writes a new private file and refuses other names", async () => {
  const dir = mkdtempSync(join(tmpdir(), "backup-store-"));
  const store = createBackupStore({ token: "synthetic", blob: fakeBlob() });
  const file = join(dir, "restore.age");
  await store.download("accounts-20261113T202300Z.sql.gz.age", file);
  assert.equal(readFileSync(file, "utf8"), "age-encryption.org/v1\nsynthetic");
  await assert.rejects(store.download("../../etc/passwd", file), /Name a stored backup/);
  // Never overwrites an existing file.
  await assert.rejects(store.download("accounts-20261113T202300Z.sql.gz.age", file));
});
