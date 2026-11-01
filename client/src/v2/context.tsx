import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { publicApi, PublicApiError } from './api';
import {
  readAnonymousWebStateWithStatus,
  withRecentBook,
  withSavedBook,
  withSelectedLibrary,
  withoutSavedBook,
  writeAnonymousWebState,
  ANONYMOUS_WEB_STORAGE_KEY,
  SAVED_BOOKS_CAP,
  emptyState,
  isSaved,
  withSavedContent,
  type AnonymousWebState,
} from './localState';
import type { PublicBook, PublicLibrary, RecentBook, RecentSource } from './types';
import type { ContentItem } from './contentTypes';
import { readReaderPreferences, writeReaderPreferences } from './readerState';

export type SaveResult = 'saved' | 'already-saved' | 'full' | 'recovery';

export type LibraryState = {
  state: AnonymousWebState;
  library: PublicLibrary | null;
  loadingLibrary: boolean;
  libraryError: string | null;
  storageNotice: string | null;
  recoveryMode: boolean;
  reloadShelf: () => void;
  startNewShelf: () => void;
  removedLibraryNotice: string | null;
  removedBook: RecentBook | null;
  undoRemoval: () => void;
  reportStorageFailure: () => void;
  selectLibrary: (library: PublicLibrary) => void;
  retryLibrary: () => void;
  rememberBook: (book: PublicBook, source: RecentSource) => void;
  removeRecentBook: (bookKey: string) => void;
  clearRecentBooks: () => void;
  clearSavedBooks: () => void;
  saveBook: (book: PublicBook) => SaveResult;
  unsaveBook: (bookKey: string) => void;
  saveContent: (item: ContentItem) => SaveResult;
  unsaveContent: (key: string) => void;
};

const LibraryStateContext = createContext<LibraryState | null>(null);

export function useLibrary(): LibraryState {
  const value = useContext(LibraryStateContext);
  if (!value) throw new Error('Library state is unavailable.');
  return value;
}

export function LibraryStateProvider({ children }: { children: ReactNode }) {
  const [initialBrowserState] = useState(readAnonymousWebStateWithStatus);
  const [state, setState] = useState<AnonymousWebState>(initialBrowserState.state);
  const stateRef = useRef(state);
  const [library, setLibrary] = useState<PublicLibrary | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(Boolean(state.selectedLibraryId));
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryRetry, setLibraryRetry] = useState(0);
  const [storageNotice, setStorageNotice] = useState<string | null>(() => storageNoticeFor(initialBrowserState.status));
  const [recoveryMode, setRecoveryMode] = useState(initialBrowserState.status === 'corrupt');
  const recovery = useRef(recoveryMode);
  // A session that could not read or write the shelf must never resume automatic
  // persistence: the stored shelf may contain books absent from session memory.
  const sessionOnly = useRef(initialBrowserState.status === 'unavailable');
  const [removedLibraryNotice, setRemovedLibraryNotice] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ book: RecentBook; index: number } | null>(null);
  const reportStorageFailure = useCallback(() => setStorageNotice(storageNoticeFor('unavailable')), []);

  const reloadShelf = useCallback(() => {
    const next = readAnonymousWebStateWithStatus();
    if (next.status === 'unavailable') {
      sessionOnly.current = true;
      setStorageNotice(storageNoticeFor(recovery.current ? 'corrupt' : 'unavailable'));
      return;
    }
    sessionOnly.current = false;
    recovery.current = next.status === 'corrupt';
    setRecoveryMode(recovery.current);
    setStorageNotice(storageNoticeFor(next.status));
    stateRef.current = next.state; setState(next.state);
  }, []);
  const startNewShelf = useCallback(() => {
    const next = emptyState();
    recovery.current = false;
    setRecoveryMode(false);
    sessionOnly.current = !writeAnonymousWebState(next);
    setStorageNotice(sessionOnly.current ? storageNoticeFor('unavailable') : null);
    stateRef.current = next;
    setState(next);
    setRemoved(null);
  }, []);

  const commit = useCallback((change: (current: AnonymousWebState) => AnonymousWebState) => {
    const stored = sessionOnly.current ? null : readAnonymousWebStateWithStatus();
    if (recovery.current || stored?.status === 'corrupt') {
      recovery.current = true;
      setRecoveryMode(true);
      setStorageNotice(storageNoticeFor('corrupt'));
      return false;
    }
    if (stored?.status === 'unavailable') sessionOnly.current = true;
    const next = change(stateRef.current);
    if (next === stateRef.current) return true;
    stateRef.current = next;
    if (!sessionOnly.current && !writeAnonymousWebState(next)) sessionOnly.current = true;
    if (sessionOnly.current) setStorageNotice(storageNoticeFor('unavailable'));
    setState(next);
    return true;
  }, []);

  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (!sessionOnly.current && (event.key === ANONYMOUS_WEB_STORAGE_KEY || event.key === null)) reloadShelf(); };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [reloadShelf]);

  useEffect(() => {
    let current = true;
    const libraryId = state.selectedLibraryId;
    if (!libraryId) {
      setLibrary(null);
      setLibraryError(null);
      setLoadingLibrary(false);
      return () => { current = false; };
    }
    setLoadingLibrary(true);
    setLibraryError(null);
    publicApi.resolveLibrary(libraryId)
      .then((resolved) => {
        if (current) {
          setLibrary(resolved);
          if (!writeReaderPreferences({ selectedLibrary: { id: resolved.id, name: resolved.name } })) reportStorageFailure();
        }
      })
      .catch((error: unknown) => {
        if (!current) return;
        setLibrary(null);
        if (error instanceof PublicApiError && error.code === 'LIBRARY_NOT_FOUND') {
          const previous = readReaderPreferences().selectedLibrary;
          setRemovedLibraryNotice(`${previous?.id === libraryId ? previous.name : 'Your selected library'} is no longer listed. Choose another library.`);
          commit((saved) => saved.selectedLibraryId === libraryId ? withSelectedLibrary(saved, null) : saved);
        } else {
          setLibraryError('We could not load your selected library. Please try again.');
        }
      })
      .finally(() => { if (current) setLoadingLibrary(false); });
    return () => { current = false; };
  }, [state.selectedLibraryId, libraryRetry, commit, reportStorageFailure]);

  const selectLibrary = useCallback((selected: PublicLibrary) => {
    if (!commit((saved) => withSelectedLibrary(saved, selected.id))) return;
    if (!writeReaderPreferences({ selectedLibrary: { id: selected.id, name: selected.name } })) reportStorageFailure();
    setRemovedLibraryNotice(null);
    setLibrary(selected);
    setLibraryError(null);
  }, [commit, reportStorageFailure]);
  const retryLibrary = useCallback(() => setLibraryRetry((count) => count + 1), []);
  const rememberBook = useCallback((book: PublicBook, source: RecentSource) => {
    commit((saved) => withRecentBook(saved, book, source));
  }, [commit]);
  const removeRecentBook = useCallback((bookKey: string) => {
    commit((saved) => ({ ...saved, recentBooks: saved.recentBooks.filter((item) => item.bookKey !== bookKey) }));
  }, [commit]);
  const clearRecentBooks = useCallback(() => commit((saved) => ({ ...saved, recentBooks: [] })), [commit]);
  const clearSavedBooks = useCallback(() => { if (commit(saved => ({ ...saved, savedBooks: [], savedContent: [] }))) setRemoved(null); }, [commit]);
  const saveBook = useCallback((book: PublicBook): SaveResult => {
    if (recovery.current) return 'recovery';
    if (isSaved(stateRef.current, book.bookKey)) return 'already-saved';
    if (stateRef.current.savedBooks.length + stateRef.current.savedContent.length >= SAVED_BOOKS_CAP) return 'full';
    return commit((saved) => withSavedBook(saved, book)) ? 'saved' : 'recovery';
  }, [commit]);
  const saveContent = useCallback((item: ContentItem): SaveResult => {
    if (recovery.current) return 'recovery';
    if (stateRef.current.savedContent.some(value => value.contentKey === item.key)) return 'already-saved';
    if (stateRef.current.savedBooks.length + stateRef.current.savedContent.length >= SAVED_BOOKS_CAP) return 'full';
    if (withSavedContent(stateRef.current, item) === stateRef.current) return 'recovery';
    return commit(saved => withSavedContent(saved, item)) ? 'saved' : 'recovery';
  }, [commit]);
  const unsaveContent = useCallback((key: string) => { commit(saved => ({ ...saved, savedContent: saved.savedContent.filter(item => item.contentKey !== key) })); }, [commit]);
  const unsaveBook = useCallback((bookKey: string) => {
    const index = stateRef.current.savedBooks.findIndex(book => book.bookKey === bookKey);
    const book = stateRef.current.savedBooks[index];
    if (book && commit(saved => withoutSavedBook(saved, bookKey))) setRemoved({ book, index });
  }, [commit]);
  const undoRemoval = useCallback(() => {
    if (!removed) return;
    if (!isSaved(stateRef.current, removed.book.bookKey) && stateRef.current.savedBooks.length + stateRef.current.savedContent.length >= SAVED_BOOKS_CAP) {
      setStorageNotice('Your shelf is full. Remove an item before restoring this book.');
      setRemoved(null);
      return;
    }
    if (commit(saved => {
      if (isSaved(saved, removed.book.bookKey)) return saved;
      const books = [...saved.savedBooks];
      books.splice(Math.min(removed.index, books.length), 0, removed.book);
      return { ...saved, savedBooks: books };
    })) setRemoved(null);
  }, [commit, removed]);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 10_000);
    return () => clearTimeout(timer);
  }, [removed]);

  const value = useMemo<LibraryState>(() => ({
    state,
    library,
    loadingLibrary,
    libraryError,
    storageNotice,
    recoveryMode, reloadShelf, startNewShelf, removedLibraryNotice, removedBook: removed?.book || null, undoRemoval, reportStorageFailure,
    selectLibrary,
    retryLibrary,
    rememberBook,
    removeRecentBook,
    clearRecentBooks,
    clearSavedBooks,
    saveBook,
    unsaveBook,
    saveContent,
    unsaveContent,
  }), [state, library, loadingLibrary, libraryError, storageNotice, recoveryMode, reloadShelf, startNewShelf, removedLibraryNotice, removed, undoRemoval, reportStorageFailure, selectLibrary, retryLibrary, rememberBook, removeRecentBook, clearRecentBooks, clearSavedBooks, saveBook, unsaveBook, saveContent, unsaveContent]);

  return <LibraryStateContext.Provider value={value}>{children}</LibraryStateContext.Provider>;
}

export function isbnSource(value: string): RecentSource {
  return /^[\d\s-]+$/.test(value) ? 'isbn' : 'search';
}

export function isValidIsbn13(value: string): boolean {
  if (!/^97[89]\d{10}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

export function sourceFromLocation(value: unknown): RecentSource {
  const source = (value as { source?: unknown } | null)?.source;
  return source === 'camera' || source === 'isbn' || source === 'search' || source === 'direct' ? source : 'direct';
}

export function messageFor(failure: unknown, fallback: string): string {
  if (!(failure instanceof PublicApiError)) return fallback;
  if (failure.code === 'NETWORK_ERROR') return 'Couldn’t connect. Check your connection and try again.';
  if (failure.code === 'INVALID_REQUEST' && failure.message.startsWith('Enter a valid ISBN')) return 'Enter a valid ISBN or search by title or author.';
  if (failure.code === 'INVALID_ISBN') return 'Enter a valid ISBN.';
  if (failure.code === 'BOOK_NOT_FOUND') return 'Book not found. Try another title or ISBN.';
  if (failure.status === 429) return 'Please wait a moment, then try again.';
  return fallback;
}

export function goodreadsUrl(book: PublicBook): string {
  const query = book.isbn13 || [book.title, ...book.authors].filter(Boolean).join(' ');
  return `https://www.goodreads.com/search?q=${encodeURIComponent(query)}`;
}

export function storageNoticeFor(status: 'ok' | 'unavailable' | 'corrupt'): string | null {
  if (status === 'unavailable') return 'Your changes can’t be saved in this browser. They may be lost when you leave.';
  if (status === 'corrupt') return 'Your saved books couldn’t be loaded in this browser.';
  return null;
}

export function recentSourceLabel(source: RecentSource): string {
  return source === 'camera' ? 'Camera scan' : source === 'isbn' ? 'ISBN lookup' : source === 'search' ? 'Search result' : 'Direct link';
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'time unavailable';
}
