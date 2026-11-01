import { afterEach, expect, it, vi } from "vitest";
import { withGuestStorageLock } from "./guestLock";
import {
  emptyState,
  readAnonymousWebState,
  writeAnonymousWebState,
} from "../localState";
import { removeAcknowledgedDeviceCopy } from "./importCleanup";
const book = (key: string, title = key) => ({
  bookKey: key,
  title,
  authors: [],
  source: "direct" as const,
  viewedAt: "2026-01-01T00:00:00Z",
});
const content = (key: string) => ({kind:'content' as const,contentKey:'fcd:v1:gutenberg:'+key,itemKind:'book' as const,title:'Reviewed source book',authors:['Source Author'],host:'Project Gutenberg',savedAt:'2026-01-01T00:00:00Z'});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
function useLocks() {
  let queue = Promise.resolve();
  vi.stubGlobal("navigator", {
    locks: {
      request: (_name: string, _options: unknown, run: () => unknown) => {
        const next = queue.then(run);
        queue = next.then(
          () => undefined,
          () => undefined,
        );
        return next;
      },
    },
  });
}
it("removes acknowledged unchanged copies and preserves concurrent guest additions/edits", async () => {
  useLocks();
  const frozen = {
    ...emptyState(),
    selectedLibraryId: "bc:smcl",
    savedBooks: [book("a"), book("b")],
    savedContent: [content('1342')],
    recentBooks: [book("c"), book("expired")],
  };
  writeAnonymousWebState({
    ...frozen,
    selectedLibraryId: "bc:sfpl",
    savedBooks: [book("a"), book("b", "Edited elsewhere"), book("new")],
    savedContent: [content('1342'),content('158')],
    recentBooks: [book("c"), book("expired"), book("new-recent")],
  });
  expect(
    await removeAcknowledgedDeviceCopy(frozen, {
      includeHistory: true,
      deviceLibrary: true,
      retainedHistory: new Set(["c"]),
    }),
  ).toBe(true);
  const remaining = readAnonymousWebState();
  expect(remaining.savedBooks.map((b) => b.title)).toEqual([
    "Edited elsewhere",
    "new",
  ]);
  expect(remaining.recentBooks.map((b) => b.bookKey)).toEqual([
    "expired",
    "new-recent",
  ]);
  expect(remaining.selectedLibraryId).toBe("bc:sfpl");
  expect(remaining.savedContent.map(item=>item.contentKey)).toEqual(['fcd:v1:gutenberg:1342','fcd:v1:gutenberg:158']);
});
it("retains the guest copy when cross-tab coordination is unavailable", async () => {
  vi.stubGlobal("navigator", {});
  const frozen = { ...emptyState(), savedBooks: [book("keep")] };
  writeAnonymousWebState(frozen);
  expect(
    await removeAcknowledgedDeviceCopy(frozen, {
      includeHistory: false,
      deviceLibrary: false,
      retainedHistory: new Set(),
    }),
  ).toBe(false);
  expect(readAnonymousWebState().savedBooks).toHaveLength(1);
});
it("serializes cleanup with a pending guest edit and cancels cleanup after leaving the import", async () => {
  useLocks();
  const frozen = { ...emptyState(), savedBooks: [book("edit")] };
  writeAnonymousWebState(frozen);
  const edit = withGuestStorageLock(() =>
    writeAnonymousWebState({
      ...readAnonymousWebState(),
      savedBooks: [book("edit", "Newer guest edit"), book("new")],
    }),
  );
  const cleanup = removeAcknowledgedDeviceCopy(frozen, {
    includeHistory: false,
    deviceLibrary: false,
    retainedHistory: new Set(),
  });
  await edit;
  expect(await cleanup).toBe(true);
  expect(readAnonymousWebState().savedBooks.map((b) => b.title)).toEqual([
    "Newer guest edit",
    "new",
  ]);
  expect(
    await removeAcknowledgedDeviceCopy(readAnonymousWebState(), {
      includeHistory: false,
      deviceLibrary: false,
      retainedHistory: new Set(),
      isCurrent: () => false,
    }),
  ).toBe(false);
  expect(readAnonymousWebState().savedBooks).toHaveLength(2);
});
