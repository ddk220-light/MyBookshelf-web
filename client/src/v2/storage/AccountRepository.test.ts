import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountRepository } from "./AccountRepository";
import type { AccountSession } from "../auth/AccountSessionProvider";
import {
  setReaderIdentityScope,
  cacheAvailability,
  readCachedAvailability,
  rememberBookLookup,
  LOOKUP_PREFERENCES_KEY,
  AVAILABILITY_CACHE_KEY,
  writeReaderPreferences,
  READER_PREFERENCES_KEY,
} from "../readerState";
const versions = {
  settingsRevision: 0,
  shelfRevision: 0,
  historyGeneration: 0,
  historyEnabled: false,
};
const summary = {
  ...versions,
  profile: {
    id: "owner-a",
    name: "Private A",
    email: "a@example.test",
    profileRevision: 0,
  },
  selectedLibraryId: null,
  selectedLibrary: null,
  libraryRemoved: false,
  counts: { saved: 0, recent: 0 },
};
const session: AccountSession = {
  status: "authenticated",
  epoch: 1,
  user: {
    id: "owner-a",
    name: "Private A",
    email: "a@example.test",
    emailVerified: true,
  },
  csrfToken: "synthetic-csrf",
};
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const reads = (path: string) =>
  path === "/api/account/state"
    ? summary
    : path.startsWith("/api/account/books")
      ? { ...versions, books: [], nextCursor: null }
      : { ...versions, books: [] };
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setReaderIdentityScope(null);
});
describe("private reading repository", () => {
  it("ignores an already-resolved A response after its identity epoch is disposed", async () => {
    let finish: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string) =>
        path.endsWith("/state")
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve(response(reads(path))),
      ),
    );
    let current = true;
    const repo = new AccountRepository(
        () => session,
        () => current,
      ),
      loaded = repo.loadSnapshot();
    current = false;
    repo.dispose();
    finish(response(summary));
    await expect(loaded).rejects.toMatchObject({ code: "IDENTITY_CHANGED" });
    expect(repo.snapshot).toBeNull();
    expect(repo.pending).toBeNull();
  });
  it("keeps the exact mutation identity on a lost-response retry and sends the CSRF header", async () => {
    const writes: Array<{ body: string; headers: Record<string, string> }> = [];
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, options: RequestInit) => {
        if (options.method === "PUT") {
          writes.push({
            body: String(options.body),
            headers: options.headers as Record<string, string>,
          });
          if (fail) {
            fail = false;
            throw Error("lost response");
          }
          return response({ status: "saved", shelfRevision: 1 });
        }
        return response(reads(path));
      }),
    );
    const repo = new AccountRepository(
      () => session,
      () => true,
    );
    await repo.loadSnapshot();
    await expect(
      repo.saveBook({
        bookKey: "v1:isbn:9780262033848",
        title: "Private title",
        authors: [],
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(repo.pending).not.toBeNull();
    await expect(repo.retry()).resolves.toMatchObject({ status: "saved" });
    expect(writes[0].body).toBe(writes[1].body);
    expect(writes[0].headers["X-Account-CSRF"]).toBe("synthetic-csrf");
    expect(repo.pending).toBeNull();
    expect(localStorage.length).toBe(0);
    repo.dispose();
  });
  it("keeps account lookup/library/availability data in memory and clears it on switch", () => {
    setReaderIdentityScope("account-a");
    writeReaderPreferences({
      selectedLibrary: { id: "private-library", name: "Private library" },
      shelfSort: "title",
    });
    rememberBookLookup("private-book", { editionScope: "exact" });
    cacheAvailability("private-library", "private-book", undefined, {
      outcome: "unknown",
      lookupKind: "exact_isbn",
      matchKind: null,
      freshness: "none",
      attemptedAt: new Date().toISOString(),
    });
    expect(localStorage.getItem(LOOKUP_PREFERENCES_KEY)).toBeNull();
    expect(localStorage.getItem(AVAILABILITY_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(READER_PREFERENCES_KEY)).not.toContain(
      "Private",
    );
    expect(
      readCachedAvailability("private-library", "private-book"),
    ).not.toBeNull();
    setReaderIdentityScope("account-b");
    expect(
      readCachedAvailability("private-library", "private-book"),
    ).toBeNull();
  });
});
