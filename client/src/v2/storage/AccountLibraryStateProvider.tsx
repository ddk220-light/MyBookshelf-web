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
import { emptyState } from "../localState";
import type { AnonymousWebState } from "../localState";
import type {
  PublicBook,
  PublicLibrary,
  RecentBook,
  RecentSource,
} from "../types";

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
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    book: RecentBook;
    id: string;
    revision: number;
    until: number;
  } | null>(null);
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
      setMutationError(message);
      if (error instanceof AccountApiError && error.status === 401)
        account.invalidate();
    },
    [account.invalidate],
  );
  const refresh = useCallback(async () => {
    const repo = repository.current;
    if (!repo) return;
    try {
      const next = await repo.loadSnapshot();
      if (active.current && repository.current === repo) {
        setSnapshot(next);
        setLoading(false);
      }
    } catch (error) {
      if (repository.current === repo) {
        fail(error);
        setLoading(false);
      }
    }
  }, [fail]);
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
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      active.current = false;
      repo.dispose();
      if (repository.current === repo) repository.current = null;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  const run = useCallback(
    async <T,>(
      label: string,
      action: (repo: AccountRepository) => Promise<T>,
      after?: (value: T) => void,
    ): Promise<T | null> => {
      const repo = repository.current;
      if (!repo || busy.current || !snapshotRef.current) return null;
      busy.current = true;
      setPending(true);
      setMutationError(null);
      setNotice(label + "…");
      onRetrySuccess.current = after as ((value: unknown) => void) | undefined;
      try {
        const result = await action(repo);
        if (!active.current || repository.current !== repo) return null;
        setUndo(null);
        after?.(result);
        setNotice("Saved");
        onRetrySuccess.current = undefined;
        try {
          const next = await repo.loadSnapshot();
          if (active.current && repository.current === repo) setSnapshot(next);
        } catch (error) {
          if (active.current)
            setNotice(
              "Your change was saved. Couldn’t refresh your account. Try refreshing.",
            );
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
  const saveBook = useCallback(
    async (book: PublicBook): Promise<SaveResult> => {
      const result = await run("Saving book", (r) => r.saveBook(book));
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
        !snapshotRef.current?.summary.historyEnabled ||
        document.visibilityState !== "visible" ||
        busy.current ||
        repository.current?.pending
      )
        return false;
      return (
        (await run("Updating recently viewed", (r) =>
          r.recordView(book, source),
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
      (await run("Clearing recently viewed books", (r) => r.clearHistory())) !==
      null,
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
  const importGuest = useCallback(
    async (
      id: string,
      frozen: AnonymousWebState,
      history: boolean,
      policy: "keep-account" | "use-device",
    ) =>
      run("Importing books", (r) => r.importGuest(id, frozen, history, policy)),
    [run],
  );
  const value: LibraryState = {
    state: snapshot
      ? {
          version: 1,
          selectedLibraryId: snapshot.summary.selectedLibraryId,
          savedBooks: snapshot.books,
          recentBooks: snapshot.recent,
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
    reportStorageFailure: () => {},
    selectLibrary,
    retryLibrary: () => void refresh(),
    rememberBook,
    removeRecentBook,
    clearRecentBooks,
    clearSavedBooks,
    saveBook,
    unsaveBook,
    pending,
    loadingAccount: loading,
    mutationNotice: notice,
    mutationError,
    pendingImportId:
      repository.current?.pending?.path === "/imports"
        ? String(repository.current.pending.body.importId)
        : undefined,
    retryMutation: repository.current?.pending ? retryMutation : undefined,
    historyEnabled: snapshot?.summary.historyEnabled ?? false,
    setHistoryEnabled,
    importGuest,
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
