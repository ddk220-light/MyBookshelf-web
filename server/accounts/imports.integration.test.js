import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { migrate } from "../db/migrate.js";
import { prepareTestRoles, testRoleURL } from "./test-database.js";
import { createReadingActions } from "./reading.js";
import { createShelfActions } from "./books.js";
import { createHistoryActions } from "./history.js";
import {
  createImportActions,
  validateImport,
  IMPORT_BYTE_LIMIT,
} from "./imports.js";
import { createTitleAuthorId } from "../services/titleAuthorIdentity.js";
const connectionString = process.env.ACCOUNT_TEST_DATABASE_URL;
test(
  "guest import is atomic, private, versioned and retryable without changing tracking consent",
  {
    skip:
      !connectionString && "Set disposable local ACCOUNT_TEST_DATABASE_URL.",
    timeout: 30_000,
  },
  async (t) => {
    const url = new URL(connectionString);
    assert.ok(
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.pathname.endsWith("_test"),
    );
    const admin = new Pool({ connectionString }),
      id = randomUUID(),
      keys = [];
    let pool;
    t.after(async () => {
      await admin.query('DELETE FROM "user" WHERE id=$1', [id]);
      await admin.query(
        "DELETE FROM book_refs WHERE book_key=ANY($1::text[])",
        [keys],
      );
      if (pool) await pool.end();
      await admin.end();
    });
    await migrate(admin);
    await prepareTestRoles(admin);
    pool = new Pool({
      connectionString: testRoleURL(connectionString, "reading"),
      max: 3,
    });
    await admin.query(
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
      [id, "Synthetic reader", id + "@example.test"],
    );
    await admin.query(
      "INSERT INTO app_users(id,auth_user_id) VALUES($1::uuid,$1::text)",
      [id],
    );
    const identity = {
      sessionId: randomUUID(),
      authUserId: id,
      user: { id, name: "Synthetic reader", email: id + "@example.test" },
    };
    const reading = createReadingActions({ pool }),
      shelf = createShelfActions({
        owned: reading.owned,
        secret: "only-a-test-secret-longer-than-32-characters",
      }),
      history = createHistoryActions({ owned: reading.owned }),
      imports = createImportActions(reading);
    const book = (age = 0) => {
      const bookKey = "v1:googlebooks:" + randomUUID().replaceAll("-", "");
      keys.push(bookKey);
      return {
        bookKey,
        title: "சோதனை புத்தகம்",
        authors: ["Synthetic author"],
        source: "search",
        viewedAt: new Date(Date.now() - age).toISOString(),
      };
    };
    await reading.selectLibrary(
      { libraryId: "bc:smcl", settingsRevision: 0, operationId: randomUUID() },
      identity,
    );
    const shared = book(),
      old = book(31 * 86400000),
      recent = book(86400000);
    const payload = {
      importId: randomUUID(),
      snapshot: {
        version: 1,
        selectedLibraryId: "bc:sfpl",
        savedBooks: [shared, shared],
        recentBooks: [recent, old],
      },
      includeHistory: true,
      libraryPolicy: "keep-account",
      settingsRevision: 1,
      shelfRevision: 0,
      historyGeneration: 0,
    };
    const imported = await imports.importGuest(payload, identity);
    assert.equal(imported.savedAdded, 1);
    // Guest Viewed before comes over whatever its age (plan 4.7).
    assert.equal(imported.historyAccepted, 2);
    assert.equal(imported.historyExpired, 0);
    assert.equal(imported.historyEnabled, true);
    assert.deepEqual(await imports.importGuest(payload, identity), imported);
    assert.equal((await reading.state(identity)).selectedLibraryId, "bc:smcl");
    assert.equal((await history.history({}, identity)).books.length, 2);
    assert.ok(
      Date.parse((await shelf.books({}, identity)).books[0].savedAt) >
        Date.parse(shared.viewedAt) - 1000,
    );
    await assert.rejects(
      imports.importGuest({ ...payload, includeHistory: false }, identity),
      (e) => e.code === "IMPORT_CONFLICT",
    );
    await assert.rejects(
      imports.importGuest({ ...payload, importId: randomUUID() }, identity),
      (e) => e.code === "VERSION_CONFLICT",
    );
    const fresh = await reading.state(identity);
    const base = {
      ...payload,
      importId: randomUUID(),
      snapshot: {
        version: 1,
        selectedLibraryId: "bc:sfpl",
        savedBooks: [book()],
        recentBooks: [],
      },
      includeHistory: false,
      libraryPolicy: "use-device",
      settingsRevision: fresh.settingsRevision,
      shelfRevision: fresh.shelfRevision,
      historyGeneration: fresh.historyGeneration,
    };
    const malformed = structuredClone(base);
    malformed.snapshot.savedBooks.push({
      ...book(),
      viewedAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await assert.rejects(
      imports.importGuest(malformed, identity),
      (e) => e.code === "INVALID_INPUT",
    );
    assert.equal((await reading.state(identity)).counts.saved, 1);
    const changed = await imports.importGuest(base, identity);
    assert.equal(changed.savedAdded, 1);
    assert.equal((await reading.state(identity)).selectedLibraryId, "bc:sfpl");
    // The maximum Unicode/long-key envelope is bounded by UTF-8 bytes, not JS length.
    const longKey =
      "v1:catalog:vpl:visakhapatnam-public-library:" +
      createTitleAuthorId("அ".repeat(500), "ஆ".repeat(240));
    const maximum = {
      ...base,
      importId: randomUUID(),
      snapshot: {
        ...base.snapshot,
        savedBooks: Array.from({ length: 100 }, () => ({
          ...shared,
          bookKey: longKey,
          title: "😀".repeat(250),
          authors: Array.from({ length: 20 }, () => "அ".repeat(240)),
        })),
        recentBooks: Array.from({ length: 50 }, () => ({
          ...recent,
          bookKey: longKey,
          title: "😀".repeat(250),
          authors: Array.from({ length: 20 }, () => "அ".repeat(240)),
        })),
      },
    };
    assert.ok(
      Buffer.byteLength(JSON.stringify(maximum), "utf8") > IMPORT_BYTE_LIMIT,
    );
    assert.throws(
      () => validateImport(maximum, reading.validateLibrary),
      (e) => e.status === 413,
    );
    const allowed = structuredClone(maximum);
    allowed.snapshot.savedBooks.forEach(
      (b) => (b.authors = b.authors.slice(0, 1)),
    );
    allowed.snapshot.recentBooks.forEach(
      (b) => (b.authors = b.authors.slice(0, 1)),
    );
    assert.ok(
      Buffer.byteLength(JSON.stringify(allowed), "utf8") < IMPORT_BYTE_LIMIT,
    );
    assert.equal(
      validateImport(allowed, reading.validateLibrary).saved.length,
      1,
    );
    // Near quota, a two-book import applies neither the first item nor its library choice.
    for (let n = 0; n < 997; n++) {
      const row = book(),
        ref = randomUUID();
      await admin.query(
        "INSERT INTO book_refs(id,book_key,key_digest) VALUES($1,$2,$3)",
        [ref, row.bookKey, createHash("sha256").update(row.bookKey).digest()],
      );
      await admin.query(
        "INSERT INTO user_books(user_id,reference_id) VALUES($1,$2)",
        [id, ref],
      );
    }
    const current = await reading.state(identity),
      overflow = {
        ...base,
        importId: randomUUID(),
        snapshot: {
          version: 1,
          selectedLibraryId: "bc:smcl",
          savedBooks: [book(), book()],
          recentBooks: [],
        },
        settingsRevision: current.settingsRevision,
        shelfRevision: current.shelfRevision,
        historyGeneration: current.historyGeneration,
      };
    await assert.rejects(
      imports.importGuest(overflow, identity),
      (e) => e.code === "SHELF_FULL",
    );
    assert.equal((await reading.state(identity)).counts.saved, 999);
    assert.equal((await reading.state(identity)).selectedLibraryId, "bc:sfpl");
    assert.equal(
      (
        await admin.query(
          "SELECT 1 FROM guest_imports WHERE user_id=$1 AND import_id=$2",
          [id, overflow.importId],
        )
      ).rowCount,
      0,
    );
  },
);
