import {
  readAnonymousWebStateWithStatus,
  writeAnonymousWebState,
  type AnonymousWebState,
} from "../localState";
// Read again after acknowledgement and compare each frozen item. Concurrent
// guest additions/edits and a changed library selection must survive cleanup.
export function removeAcknowledgedDeviceCopy(
  frozen: AnonymousWebState,
  options: {
    includeHistory: boolean;
    deviceLibrary: boolean;
    retainedHistory: Set<string>;
  },
): boolean {
  const current = readAnonymousWebStateWithStatus();
  if (current.status !== "ok") return false;
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const saved = new Map(frozen.savedBooks.map((b) => [b.bookKey, b])),
    recent = new Map(frozen.recentBooks.map((b) => [b.bookKey, b]));
  return writeAnonymousWebState({
    ...current.state,
    savedBooks: current.state.savedBooks.filter(
      (b) => !same(saved.get(b.bookKey), b),
    ),
    recentBooks: current.state.recentBooks.filter(
      (b) =>
        !options.includeHistory ||
        !options.retainedHistory.has(b.bookKey) ||
        !same(recent.get(b.bookKey), b),
    ),
    selectedLibraryId:
      options.deviceLibrary &&
      current.state.selectedLibraryId === frozen.selectedLibraryId
        ? null
        : current.state.selectedLibraryId,
  });
}
