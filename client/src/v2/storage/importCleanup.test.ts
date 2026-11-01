import { afterEach, expect, it } from "vitest";
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
afterEach(() => localStorage.clear());
it("removes acknowledged unchanged copies and preserves concurrent guest additions/edits", () => {
  const frozen = {
    ...emptyState(),
    selectedLibraryId: "bc:smcl",
    savedBooks: [book("a"), book("b")],
    recentBooks: [book("c"), book("expired")],
  };
  writeAnonymousWebState({
    ...frozen,
    selectedLibraryId: "bc:sfpl",
    savedBooks: [book("a"), book("b", "Edited elsewhere"), book("new")],
    recentBooks: [book("c"), book("expired"), book("new-recent")],
  });
  expect(
    removeAcknowledgedDeviceCopy(frozen, {
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
});
