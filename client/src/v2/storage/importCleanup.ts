import {
  readAnonymousWebStateWithStatus,
  writeAnonymousWebState,
  type AnonymousWebState,
} from "../localState";
import { guestStorageLocksAvailable, withGuestStorageLock } from "./guestLock";
// Read again after acknowledgement and compare each frozen item. Concurrent
// guest additions/edits and a changed library selection must survive cleanup.
export async function removeAcknowledgedDeviceCopy(
  frozen: AnonymousWebState,
  options: {
    includeHistory: boolean;
    deviceLibrary: boolean;
    retainedHistory: Set<string>;
    isCurrent?: () => boolean;
  },
): Promise<boolean> {
  // Without a cross-tab write lock we retain the copy. Reading and comparing
  // alone cannot prevent another guest tab from writing between read and erase.
  if (!guestStorageLocksAvailable()) return false;
  try {
    return await withGuestStorageLock(() => {
      if (options.isCurrent && !options.isCurrent()) return false;
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
    });
  } catch {
    return false;
  }
}
