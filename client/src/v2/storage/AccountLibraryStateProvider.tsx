import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LibraryStateContext,
  type LibraryState,
  type SaveResult,
} from "../context";
import { useAccountSession } from "../auth/AccountSessionProvider";
import { AccountApiError } from "../auth/accountClient";
import { AccountRepository, type ReadingSnapshot } from "./AccountRepository";
import { emptyState, HISTORY_LIMIT, readAnonymousWebStateWithStatus } from "../localState";
import { planGuestMerge, rememberMerged } from "./guestMerge";
import { isOnShelf } from "../oneShelfState";
import type {
  PublicBook,
  PublicLibrary,
  RecentBook,
  RecentSource,
} from "../types";

/**
 * On focus a signed-in shelf asks for the account's revision numbers at most
 * this often, and reloads only when another device changed them (plan B9).
 */
export const SHELF_RELOAD_MS = 10_000;
/** "Saved" and "Added … from this device" clear themselves after this long. */
export const DONE_NOTICE_MS = 4_000;
/** What the quiet merge at sign-in brought over from this browser (plan B5). */
export type MergeResult = { savedAdded: number };

/**
 * Plan 3.3 and 4.7: a book whose bookKey or ISBN-13 is already saved counts as
 * saved without a request; every book open is recorded in the account's
 * Viewed before quietly, with no history setting; and clearing Viewed before
 * can be undone.
 */
export function AccountLibraryStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const account = useAccountSession(),
    sessionRef = useRef(account.session);
  sessionRef.current = account.session;
  const repository = useRef<AccountRepository | null>(null),
    active = useRef(false),
    busy = useRef(false);
  const [snapshot, setSnapshot] = useState<ReadingSnapshot | null>(null),
    snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [pending, setPending] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState<string | null>(null);
  const [noticeDone, setNoticeDone] = useState(false);
  // undefined until the first load and its merge are over.
  const [mergeResult, setMergeResult] = useState<MergeResult | undefined>();
  const merging = useRef<Promise<void> | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    book: RecentBook;
    id: string;
    revision: number;
    until: number;
  } | null>(null);
  // When the account was last read (focus asks again at most every 10 s;
  // changes and explicit refreshes always reload).
  const loadedAt = useRef(0);
  const onRetrySuccess = useRef<((value: unknown) => void) | undefined>();
  const fail = useCallback(
    (error: unknown) => {
      if (!active.current) return;
      if (error instanceof AccountApiError && error.code === "STALE_READ")
        return;
      if (
        error instanceof AccountApiError &&
        error.code === "IDENTITY_CHANGED"
      ) {
        if (error.status === 409) account.invalidate();
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "Your account could not be refreshed.";
      setNotice(message);
      setNoticeDone(false);
      setMutationError(message);
      if (error instanceof AccountApiError && error.status === 401)
        account.invalidate();
    },
    [account.invalidate],
  );
  // Plan B5: once the account shelf has loaded, the books in this browser
  // that the account lacks go over quietly through the import (safe to
  // repeat). The browser's library is used only when the account has none.
  // What was sent is remembered here, so a book later removed from the
  // account does not come back. A failed merge is tried again at the next
  // load (one import at most per load, within the 5-an-hour limit) and never
  // holds the shelf.
  const mergeGuest = useCallback(async (repo: AccountRepository, loaded: ReadingSnapshot) => {
    const plan = planGuestMerge(loaded, readAnonymousWebStateWithStatus());
    if (!plan) {
      setMergeResult((current) => current ?? { savedAdded: 0 });
      return;
    }
    if (!plan.request) {
      rememberMerged(plan);
      setMergeResult((current) => current ?? { savedAdded: 0 });
      return;
    }
    try {
      const result = await repo.importGuest(
        crypto.randomUUID(),
        plan.snapshot,
        plan.snapshot.recentBooks.length > 0,
        plan.policy,
      );
      if (!active.current || repository.current !== repo) return;
      rememberMerged(plan);
      const next = await repo.loadSnapshot();
      if (!active.current || repository.current !== repo) return;
      loadedAt.current = Date.now();
      setSnapshot(next);
      setMergeResult({ savedAdded: result.savedAdded });
      if (result.savedAdded > 0) {
        setNotice(
          `Added ${result.savedAdded} ${result.savedAdded === 1 ? "book" : "books"} from this device to your account`,
        );
        setNoticeDone(true);
        setMutationError(null);
      }
    } catch {
      repo.abandonPending("/imports");
      if (active.current && repository.current === repo)
        setMergeResult((current) => current ?? { savedAdded: 0 });
    }
  }, []);
  const refresh = useCallback(async () => {
    const repo = repository.current;
    if (!repo) return;
    try {
      const next = await repo.loadSnapshot();
      if (active.current && repository.current === repo) {
        loadedAt.current = Date.now();
        setSnapshot(next);
        setLoading(false);
        if (!merging.current) {
          busy.current = true;
          const pendingMerge = mergeGuest(repo, next).finally(() => {
            if (merging.current !== pendingMerge) return;
            merging.current = null;
            busy.current = false;
          });
          merging.current = pendingMerge;
        }
      }
    } catch (error) {
      if (repository.current === repo) {
        fail(error);
        setLoading(false);
      }
    }
  }, [fail, mergeGuest]);
  // Focus: one small request for the revision numbers; the shelf and Viewed
  // before reload only when another device changed them. No timers.
  const checkRevisions = useCallback(async () => {
    const repo = repository.current,
      current = snapshotRef.current;
    if (!repo || !current || busy.current || repo.pending) return;
    loadedAt.current = Date.now();
    try {
      const revisions = await repo.loadRevisions();
      if (!active.current || repository.current !== repo) return;
      if (
        revisions.shelfRevision !== current.summary.shelfRevision ||
        revisions.historyGeneration !== current.summary.historyGeneration ||
        revisions.historyRevision !== current.summary.historyRevision ||
        revisions.settingsRevision !== current.summary.settingsRevision
      )
        await refresh();
    } catch (error) {
      if (error instanceof AccountApiError && error.status === 401)
        account.invalidate();
    }
  }, [refresh, account.invalidate]);
  useEffect(() => {
    active.current = true;
    const owner = sessionRef.current.user?.id,
      epoch = sessionRef.current.epoch;
    const repo = new AccountRepository(
      () => sessionRef.current,
      () =>
        active.current &&
        sessionRef.current.status === "authenticated" &&
        sessionRef.current.user?.id === owner &&
        sessionRef.current.epoch === epoch,
    );
    repository.current = repo;
    void refresh();
    const focus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - loadedAt.current < SHELF_RELOAD_MS) return;
      void checkRevisions();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      active.current = false;
      repo.dispose();
      if (repository.current === repo) {
        repository.current = null;
        merging.current = null;
        busy.current = false;
      }
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh, checkRevisions]);
  const run = useCallback(
    async <T,>(
      label: string,
      action: (repo: AccountRepository) => Promise<T>,
      after?: (value: T) => void,
      quiet = false,
    ): Promise<T | null> => {
      // A change made while the quiet merge runs waits for it.
      if (merging.current) await merging.current;
      const repo = repository.current;
      if (!repo || busy.current || !snapshotRef.current) return null;
      busy.current = true;
      setPending(true);
      setMutationError(null);
      // A quiet change (a Viewed before entry) shows no "Saving…" line.
      if (!quiet) {
        setNotice(label + "…");
        setNoticeDone(false);
      }
      onRetrySuccess.current = after as ((value: unknown) => void) | undefined;
      try {
        const result = await action(repo);
        if (!active.current || repository.current !== repo) return null;
        // A shelf or settings change ends "Removed … · Undo"; a quiet Viewed
        // before entry leaves the shelf as it was, so Undo still applies.
        if (!quiet) setUndo(null);
        after?.(result);
        if (!quiet) {
          setNotice("Saved");
          setNoticeDone(true);
        }
        onRetrySuccess.current = undefined;
        try {
          const next = await repo.loadSnapshot();
          if (active.current && repository.current === repo) {
            loadedAt.current = Date.now();
            setSnapshot(next);
          }
        } catch (error) {
          if (active.current) {
            const message =
              "Your change was saved. Couldn’t refresh your account. Try refreshing.";
            setNotice(message);
            setNoticeDone(false);
            setMutationError(message);
          }
          if (error instanceof AccountApiError && error.status === 401)
            account.invalidate();
        }
        return result;
      } catch (error) {
        fail(error);
        if (error instanceof AccountApiError && error.status === 409)
          void refresh();
        return null;
      } finally {
        busy.current = false;
        if (active.current) setPending(false);
      }
    },
    [fail, refresh, account.invalidate],
  );
  const retryMutation = useCallback(async () => {
    const repo = repository.current;
    if (!repo?.pending) return false;
    const request = repo.pending,
      after = onRetrySuccess.current;
    return (
      (await run(
        "Retrying",
        (r) => r.retry(),
        (result) =>
          after?.({
            ...(result as object),
            operationId: request.body.operationId,
          }),
      )) !== null
    );
  }, [run]);
  const selectLibrary = useCallback(
    async (library: PublicLibrary) =>
      (await run("Saving library", (r) => r.selectLibrary(library.id))) !==
      null,
    [run],
  );
  // The account API takes null for "no library" (server accounts/reading.js).
  const clearLibrary = useCallback(
    async () =>
      (await run("Removing library", (r) => r.selectLibrary(null))) !== null,
    [run],
  );
  const saveBook = useCallback(
    async (book: PublicBook): Promise<SaveResult> => {
      if (snapshotRef.current && isOnShelf(snapshotRef.current.books, book)) {
        // The removed book is back: its Undo would do nothing.
        setUndo((current) => (current && isOnShelf([current.book], book) ? null : current));
        return "already-saved";
      }
      const result = await run("Saving book", (r) => r.saveBook(book));
      if (result)
        setUndo((current) => (current && isOnShelf([current.book], book) ? null : current));
      return result?.status ?? "failed";
    },
    [run],
  );
  const unsaveBook = useCallback(
    async (key: string) => {
      const book = snapshotRef.current?.books.find((b) => b.bookKey === key);
      if (!book) return false;
      return (
        (await run(
          "Removing book",
          (r) => r.removeBook(key),
          (result) => {
            if (result.undoUntil)
              setUndo({
                book,
                id: result.operationId,
                revision: result.shelfRevision,
                until: Date.parse(result.undoUntil),
              });
          },
        )) !== null
      );
    },
    [run],
  );
  const undoRemoval = useCallback(async () => {
    if (!undo || undo.until <= Date.now()) return false;
    return (
      (await run("Restoring book", (r) =>
        r.undoRemove(undo.id, undo.revision),
      )) !== null
    );
  }, [run, undo]);
  // "Saved" (and what the merge added) clears itself (plan B9).
  useEffect(() => {
    if (!noticeDone || !notice) return;
    const timer = setTimeout(() => {
      setNotice((current) => (current === notice ? null : current));
      setNoticeDone(false);
    }, DONE_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice, noticeDone]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  const rememberBook = useCallback(
    async (book: PublicBook, source: RecentSource) => {
      if (
        !snapshotRef.current ||
        document.visibilityState !== "visible" ||
        busy.current ||
        repository.current?.pending
      )
        return false;
      return (
        (await run(
          "Updating recently viewed",
          (r) => r.recordView(book, source),
          undefined,
          true,
        )) !== null
      );
    },
    [run],
  );
  const removeRecentBook = useCallback(
    async (key: string) =>
      (await run("Removing recently viewed book", (r) => r.removeView(key))) !==
      null,
    [run],
  );
  const clearRecentBooks = useCallback(
    async () =>
      (await run(
        "Clearing recently viewed books",
        (r) => r.clearHistory(),
        undefined,
        true, // the home screen's "Viewed before cleared" toast says it
      )) !== null,
    [run],
  );
  // Undo after "Clear": the cleared books go back with their
  // original times through the existing import step (Viewed before only).
  const restoreRecentBooks = useCallback(
    async (books: RecentBook[]) =>
      (await run(
        "Restoring Viewed before",
        (r) =>
          r.importGuest(
            crypto.randomUUID(),
            {
              version: 2,
              selectedLibraryId: null,
              savedBooks: [],
              savedContent: [],
              recentBooks: books.slice(0, HISTORY_LIMIT),
            },
            true,
            "keep-account",
          ),
        undefined,
        true,
      )) !== null,
    [run],
  );
  const clearSavedBooks = useCallback(
    async () =>
      (await run("Clearing saved books", (r) => r.clearSaved())) !== null,
    [run],
  );
  const setHistoryEnabled = useCallback(
    async (enabled: boolean) =>
      (await run(enabled ? "Enabling history" : "Pausing history", (r) =>
        r.setHistoryEnabled(enabled),
      )) !== null,
    [run],
  );
  const value: LibraryState = {
    state: snapshot
      ? {
          version: 2,
          selectedLibraryId: snapshot.summary.selectedLibraryId,
          savedBooks: snapshot.books,
          recentBooks: snapshot.recent,
          savedContent: [],
        }
      : emptyState(),
    library: snapshot?.summary.selectedLibrary ?? null,
    loadingLibrary: loading,
    libraryError: null,
    storageNotice: null,
    recoveryMode: loading || pending || Boolean(repository.current?.pending),
    reloadShelf: () => void refresh(),
    startNewShelf: () => {},
    removedLibraryNotice: snapshot?.summary.libraryRemoved
      ? "Your selected library is no longer listed. Choose another library."
      : null,
    removedBook: undo?.book ?? null,
    undoRemoval,
    dismissRemoval: () => setUndo(null),
    reportStorageFailure: () => {},
    selectLibrary,
    clearLibrary,
    retryLibrary: () => void refresh(),
    rememberBook,
    removeRecentBook,
    clearRecentBooks,
    restoreRecentBooks,
    clearSavedBooks,
    saveBook,
    unsaveBook,
    pending,
    loadingAccount: loading,
    mutationNotice: notice,
    mutationError,
    retryMutation: repository.current?.pending ? retryMutation : undefined,
    historyEnabled: snapshot?.summary.historyEnabled ?? false,
    setHistoryEnabled,
    mergeResult,
  };
  return (
    <LibraryStateContext.Provider value={value}>
      {children}
    </LibraryStateContext.Provider>
  );
}
const denied = async () => false;
const unavailable: LibraryState = {
  state: emptyState(),
  library: null,
  loadingLibrary: false,
  libraryError: null,
  storageNotice: null,
  recoveryMode: true,
  reloadShelf: () => {},
  startNewShelf: () => {},
  removedLibraryNotice: null,
  removedBook: null,
  undoRemoval: denied,
  reportStorageFailure: () => {},
  selectLibrary: denied,
  clearLibrary: denied,
  retryLibrary: () => {},
  rememberBook: denied,
  removeRecentBook: denied,
  clearRecentBooks: denied,
  clearSavedBooks: denied,
  saveBook: async () => "failed",
  unsaveBook: denied,
};
export function UnavailableLibraryStateProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LibraryStateContext.Provider value={unavailable}>
      {children}
    </LibraryStateContext.Provider>
  );
}
