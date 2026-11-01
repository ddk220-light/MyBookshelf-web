import { accountRequest, AccountApiError } from "../auth/accountClient";
import type { AccountSession } from "../auth/AccountSessionProvider";
import type {
  PublicBook,
  RecentBook,
  PublicLibrary,
  RecentSource,
} from "../types";
import type { AnonymousWebState } from "../localState";
export type Versions = {
  settingsRevision: number;
  shelfRevision: number;
  historyGeneration: number;
  historyEnabled: boolean;
};
export type CloudBook = RecentBook & { referenceId: string; savedAt?: string };
export type CloudState = Versions & {
  profile: { id: string; name: string; email: string; profileRevision: number };
  selectedLibraryId: string | null;
  selectedLibrary: PublicLibrary | null;
  libraryRemoved: boolean;
  counts: { saved: number; recent: number };
};
export type ReadingSnapshot = {
  summary: CloudState;
  books: CloudBook[];
  recent: CloudBook[];
};
type Pending = { path: string; method: string; body: Record<string, unknown> };
export class AccountRepository {
  snapshot: ReadingSnapshot | null = null;
  pending: Pending | null = null;
  private loadPromise: Promise<ReadingSnapshot> | null = null;
  private controller = new AbortController();
  private imports = new Map<string, Record<string, unknown>>();
  constructor(
    private session: () => AccountSession,
    private isCurrent: () => boolean,
  ) {}
  dispose() {
    this.controller.abort();
    this.snapshot = null;
    this.pending = null;
    this.imports.clear();
  }
  private guard() {
    if (!this.isCurrent() || this.controller.signal.aborted)
      throw new AccountApiError(
        "IDENTITY_CHANGED",
        "Your account changed. Refresh to continue.",
      );
  }
  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {},
  ) {
    this.guard();
    const result = await accountRequest<T>(path, {
      ...options,
      csrf: this.session().csrfToken,
      signal: AbortSignal.any([
        this.controller.signal,
        AbortSignal.timeout(15000),
      ]),
    });
    this.guard();
    return result;
  }
  loadSnapshot(): Promise<ReadingSnapshot> {
    if (this.loadPromise) return this.loadPromise;
    const run = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const [summary, first, recent] = await Promise.all([
            this.request<CloudState>("/state"),
            this.request<
              { books: CloudBook[]; nextCursor: string | null } & Versions
            >("/books?limit=100"),
            this.request<{ books: CloudBook[] } & Versions>("/history"),
          ]);
          const books = [...first.books];
          let cursor = first.nextCursor;
          if (
            summary.shelfRevision !== first.shelfRevision ||
            summary.historyGeneration !== recent.historyGeneration ||
            summary.settingsRevision !== recent.settingsRevision
          )
            throw new AccountApiError(
              "VERSION_CONFLICT",
              "Your account changed. Refresh to continue.",
              409,
            );
          while (cursor) {
            const next = await this.request<{
              books: CloudBook[];
              nextCursor: string | null;
            }>("/books?limit=100&cursor=" + encodeURIComponent(cursor));
            books.push(...next.books);
            cursor = next.nextCursor;
            if (books.length > 1000)
              throw new AccountApiError(
                "INVALID_RESPONSE",
                "Your shelf could not be loaded.",
              );
          }
          const snapshot = {
            summary,
            books: books.map((b) => ({
              ...b,
              source: b.source || "direct",
              viewedAt: b.savedAt || b.viewedAt,
            })),
            recent: recent.books,
          };
          this.guard();
          this.snapshot = snapshot;
          return snapshot;
        } catch (error) {
          if (
            !(
              error instanceof AccountApiError &&
              error.code === "VERSION_CONFLICT" &&
              attempt === 0
            )
          )
            throw error;
        }
      }
      throw new AccountApiError(
        "VERSION_CONFLICT",
        "Your account changed. Refresh to continue.",
        409,
      );
    };
    const promise = run();
    this.loadPromise = promise;
    void promise
      .finally(() => {
        if (this.loadPromise === promise) this.loadPromise = null;
      })
      .catch(() => {});
    return promise;
  }
  private state() {
    this.guard();
    if (!this.snapshot)
      throw new AccountApiError(
        "STATE_REQUIRED",
        "Wait for your account to load.",
      );
    return this.snapshot.summary;
  }
  async mutate<T>(
    path: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (this.pending)
      throw new AccountApiError(
        "PENDING_REQUEST",
        "Retry the pending change before making another.",
      );
    this.pending = { path, method, body };
    return this.retry<T>();
  }
  async retry<T>(): Promise<T> {
    const pending = this.pending;
    if (!pending)
      throw new AccountApiError(
        "NO_PENDING_REQUEST",
        "There is no pending change.",
      );
    try {
      const result = await this.request<T>(pending.path, {
        method: pending.method,
        body: pending.body,
      });
      this.pending = null;
      return result;
    } catch (error) {
      if (
        error instanceof AccountApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      )
        this.pending = null;
      throw error;
    }
  }
  selectLibrary(libraryId: string) {
    return this.mutate("/library", "PUT", {
      libraryId,
      settingsRevision: this.state().settingsRevision,
      operationId: crypto.randomUUID(),
    });
  }
  saveBook(book: PublicBook) {
    return this.mutate<{ status: "saved" | "already-saved" }>("/books", "PUT", {
      book,
      shelfRevision: this.state().shelfRevision,
      operationId: crypto.randomUUID(),
    });
  }
  removeBook(bookKey: string) {
    const book = this.snapshot?.books.find((b) => b.bookKey === bookKey);
    if (!book)
      throw new AccountApiError(
        "BOOK_MISSING",
        "Refresh your shelf to find this book.",
      );
    const operationId = crypto.randomUUID();
    return this.mutate<{ undoUntil: string | null; shelfRevision: number }>(
      "/books/" + book.referenceId,
      "DELETE",
      { shelfRevision: this.state().shelfRevision, operationId },
    ).then((result) => ({ ...result, operationId }));
  }
  undoRemove(removalId: string, shelfRevision: number) {
    return this.mutate("/books/undo", "POST", {
      removalId,
      shelfRevision,
      operationId: crypto.randomUUID(),
    });
  }
  clearSaved() {
    return this.mutate("/books/clear", "POST", {
      shelfRevision: this.state().shelfRevision,
      confirmed: true,
      operationId: crypto.randomUUID(),
    });
  }
  recordView(book: PublicBook, source: RecentSource) {
    return this.mutate("/history/views", "POST", {
      book,
      source,
      historyGeneration: this.state().historyGeneration,
      operationId: crypto.randomUUID(),
    });
  }
  removeView(bookKey: string) {
    const book = this.snapshot?.recent.find((b) => b.bookKey === bookKey);
    if (!book)
      throw new AccountApiError(
        "BOOK_MISSING",
        "Refresh to find this recent book.",
      );
    return this.mutate("/history/" + book.referenceId, "DELETE", {
      historyGeneration: this.state().historyGeneration,
      operationId: crypto.randomUUID(),
    });
  }
  clearHistory() {
    return this.mutate("/history/clear", "POST", {
      historyGeneration: this.state().historyGeneration,
      operationId: crypto.randomUUID(),
    });
  }
  setHistoryEnabled(enabled: boolean) {
    return this.mutate("/history/settings", "PATCH", {
      enabled,
      settingsRevision: this.state().settingsRevision,
      operationId: crypto.randomUUID(),
    });
  }
  importGuest(
    importId: string,
    snapshot: AnonymousWebState,
    includeHistory: boolean,
    libraryPolicy: "keep-account" | "use-device",
  ) {
    const versions = this.state();
    let body = this.imports.get(importId);
    if (!body) {
      body = {
        importId,
        snapshot: structuredClone(snapshot),
        includeHistory,
        libraryPolicy,
        settingsRevision: versions.settingsRevision,
        shelfRevision: versions.shelfRevision,
        historyGeneration: versions.historyGeneration,
      };
      this.imports.set(importId, body);
    }
    if (
      body.includeHistory !== includeHistory ||
      body.libraryPolicy !== libraryPolicy
    )
      throw new AccountApiError(
        "IMPORT_CONFLICT",
        "Your import choices changed. Open a new preview before importing.",
        409,
      );
    return this.mutate<{
      savedAdded: number;
      historyAccepted: number;
      historyExpired: number;
    }>("/imports", "POST", body);
  }
}
