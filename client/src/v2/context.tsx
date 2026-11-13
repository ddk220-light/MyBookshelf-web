import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { publicApi, PublicApiError } from './api';
import {
  readDedupedAnonymousWebStateWithStatus,
  withRecentBook,
  withSavedBook,
  withSelectedLibrary,
  withoutSavedBook,
  writeAnonymousWebState,
  ANONYMOUS_WEB_STORAGE_KEY,
  SAVED_BOOKS_CAP,
  HISTORY_LIMIT,
  emptyState,
  isSaved,
  withSavedContent,
  toRecentBook,
  type AnonymousWebState,
} from './localState';
import type { PublicBook, PublicLibrary, RecentBook, RecentSource } from './types';
import type { ContentItem } from './contentTypes';
import { readReaderPreferences, writeReaderPreferences } from './readerState';
import {useAccountSession} from './auth/AccountSessionProvider';
import {AccountLibraryStateProvider,UnavailableLibraryStateProvider} from './storage/AccountLibraryStateProvider';
import {withGuestStorageLock} from './storage/guestLock';
import {isOnShelf} from './oneShelfState';

export type SaveResult = 'saved' | 'already-saved' | 'full' | 'recovery' | 'failed';

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
  undoRemoval: () => Promise<boolean>;
  /** Hides "Removed … · Undo" when another undo notice takes its place (one at a time). */
  dismissRemoval?: () => void;
  reportStorageFailure: () => void;
  selectLibrary: (library: PublicLibrary) => Promise<boolean>;
  retryLibrary: () => void;
  rememberBook: (book: PublicBook, source: RecentSource) => Promise<boolean>;
  updateRecentDisplay?: (book: PublicBook) => Promise<boolean>;
  removeRecentBook: (bookKey: string) => Promise<boolean>;
  clearRecentBooks: () => Promise<boolean>;
  /** Puts cleared Viewed before books back (Undo); newer views stay first. Guests and accounts. */
  restoreRecentBooks?: (books: RecentBook[]) => Promise<boolean>;
  clearSavedBooks: () => Promise<boolean>;
  saveBook: (book: PublicBook) => Promise<SaveResult>;
  unsaveBook: (bookKey: string) => Promise<boolean>;
  // Native content references stay on the browser shelf; the account wire
  // contract still accepts library books only.
  saveContent?: (item: ContentItem) => Promise<SaveResult>;
  unsaveContent?: (key: string) => Promise<boolean>;
  pending?:boolean;
  loadingAccount?:boolean;
  mutationNotice?:string|null;
  mutationError?:string|null;
  pendingImportId?:string;
  retryMutation?:()=>Promise<boolean>;
  historyEnabled?:boolean;
  setHistoryEnabled?:(enabled:boolean)=>Promise<boolean>;
  importGuest?:(id:string,snapshot:AnonymousWebState,history:boolean,policy:'keep-account'|'use-device')=>Promise<{savedAdded:number;historyAccepted:number;historyExpired:number}|null>;
};

export const LibraryStateContext = createContext<LibraryState | null>(null);

export function useLibrary(): LibraryState {
  const value = useContext(LibraryStateContext);
  if (!value) throw new Error('Library state is unavailable.');
  return value;
}

// Plan 3.3/3.4: the guest shelf is read with duplicate saved books collapsed,
// and a book whose bookKey or ISBN-13 is already on the shelf counts as saved.
export function LibraryStateProvider({children,entryMode=false}:{children:ReactNode;entryMode?:boolean}) {
  const {session}=useAccountSession();
  if(entryMode)return <UnavailableLibraryStateProvider>{children}</UnavailableLibraryStateProvider>;
  if(session.status==='guest')return <GuestLibraryStateProvider>{children}</GuestLibraryStateProvider>;
  if(session.status==='authenticated')return <AccountLibraryStateProvider>{children}</AccountLibraryStateProvider>;
  return <UnavailableLibraryStateProvider>{children}</UnavailableLibraryStateProvider>;
}
function GuestLibraryStateProvider({ children }: { children: ReactNode }) {
  const [initialBrowserState] = useState(() => readDedupedAnonymousWebStateWithStatus());
  const [state, setState] = useState<AnonymousWebState>(initialBrowserState.state);
  const stateRef = useRef(state);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
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
    const next = readDedupedAnonymousWebStateWithStatus();
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
    return withGuestStorageLock(()=>{
    if(!alive.current)return;
    const next = emptyState();
    recovery.current = false;
    setRecoveryMode(false);
    sessionOnly.current = !writeAnonymousWebState(next);
    setStorageNotice(sessionOnly.current ? storageNoticeFor('unavailable') : null);
    stateRef.current = next;
    setState(next);
    setRemoved(null);
    }).catch(reportStorageFailure);
  }, [reportStorageFailure]);

  const commit = useCallback(async(change: (current: AnonymousWebState) => AnonymousWebState) => {
    try{return await withGuestStorageLock(()=>{
    if(!alive.current)return false;
    const stored = sessionOnly.current ? null : readDedupedAnonymousWebStateWithStatus();
    if (recovery.current || stored?.status === 'corrupt') {
      recovery.current = true;
      setRecoveryMode(true);
      setStorageNotice(storageNoticeFor('corrupt'));
      return false;
    }
    if (stored?.status === 'unavailable') sessionOnly.current = true;
    const base=stored?.status==='ok'?stored.state:stateRef.current;
    const next = change(base);
    stateRef.current = next;
    if (!sessionOnly.current && !writeAnonymousWebState(next)) sessionOnly.current = true;
    if (sessionOnly.current) setStorageNotice(storageNoticeFor('unavailable'));
    setState(next);
    return true;
    });}catch{if(alive.current)setStorageNotice(storageNoticeFor('unavailable'));return false;}
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
          void commit((saved) => saved.selectedLibraryId === libraryId ? withSelectedLibrary(saved, null) : saved);
        } else {
          setLibraryError('We could not load your selected library. Please try again.');
        }
      })
      .finally(() => { if (current) setLoadingLibrary(false); });
    return () => { current = false; };
  }, [state.selectedLibraryId, libraryRetry, commit, reportStorageFailure]);

  const selectLibrary = useCallback(async(selected: PublicLibrary) => {
    if (!await commit((saved) => withSelectedLibrary(saved, selected.id))) return false;
    if (!writeReaderPreferences({ selectedLibrary: { id: selected.id, name: selected.name } })) reportStorageFailure();
    setRemovedLibraryNotice(null);
    setLibrary(selected);
    setLibraryError(null);return true;
  }, [commit, reportStorageFailure]);
  const retryLibrary = useCallback(() => setLibraryRetry((count) => count + 1), []);
  const rememberBook = useCallback(async(book: PublicBook, source: RecentSource) => {
    return commit((saved) => withRecentBook(saved, book, source));
  }, [commit]);
  const updateRecentDisplay=useCallback(async(book:PublicBook)=>commit(saved=>{
    if(book.metadataStatus&&/^ISBN[:\s-]*\d{10,13}$/.test(book.title))return saved;
    let changed=false;
    const recentBooks=saved.recentBooks.map(previous=>{
      if(previous.bookKey!==book.bookKey)return previous;
      const next=toRecentBook(book,previous.source,previous.viewedAt);
      if(JSON.stringify(previous)===JSON.stringify(next))return previous;
      changed=true;return next;
    });return changed?{...saved,recentBooks}:saved;
  }),[commit]);
  const removeRecentBook = useCallback(async(bookKey: string) => {
    return commit((saved) => ({ ...saved, recentBooks: saved.recentBooks.filter((item) => item.bookKey !== bookKey) }));
  }, [commit]);
  const clearRecentBooks = useCallback(async() => commit((saved) => ({ ...saved, recentBooks: [] })), [commit]);
  const restoreRecentBooks = useCallback(async(books: RecentBook[]) => commit((saved) => ({ ...saved,
    recentBooks: [...saved.recentBooks, ...books.filter(book => !saved.recentBooks.some(item => item.bookKey === book.bookKey))].slice(0, HISTORY_LIMIT) })), [commit]);
  const clearSavedBooks = useCallback(async() => { const ok=await commit(saved => ({ ...saved, savedBooks: [], savedContent: [] }));if(ok&&alive.current)setRemoved(null);return ok; }, [commit]);
  const saveBook = useCallback(async(book: PublicBook): Promise<SaveResult> => {
    if (recovery.current) return 'recovery';
    let result:SaveResult='saved';
    const ok=await commit(saved=>{if(isOnShelf(saved.savedBooks,book)){result='already-saved';return saved;}if(saved.savedBooks.length+saved.savedContent.length>=SAVED_BOOKS_CAP){result='full';return saved;}return withSavedBook(saved,book);});
    // A removed book added back: its "Removed … Undo" notice no longer applies.
    if(ok&&result==='saved'&&alive.current)setRemoved(current=>current&&isOnShelf([current.book],book)?null:current);
    return ok?result:'recovery';
  }, [commit]);
  const saveContent = useCallback(async(item: ContentItem): Promise<SaveResult> => {
    if(recovery.current)return 'recovery';
    let result:SaveResult='saved';
    const ok=await commit(saved=>{
      if(saved.savedContent.some(value=>value.contentKey===item.key)){result='already-saved';return saved;}
      if(saved.savedBooks.length+saved.savedContent.length>=SAVED_BOOKS_CAP){result='full';return saved;}
      const next=withSavedContent(saved,item);if(next===saved)result='failed';return next;
    });
    return ok?result:'recovery';
  },[commit]);
  const unsaveContent = useCallback(async(key:string)=>commit(saved=>({...saved,savedContent:saved.savedContent.filter(item=>item.contentKey!==key)})),[commit]);
  const unsaveBook = useCallback(async(bookKey: string) => {
    let removed:{book:RecentBook;index:number}|null=null;
    const ok=await commit(saved=>{const index=saved.savedBooks.findIndex(book=>book.bookKey===bookKey),book=saved.savedBooks[index];if(book)removed={book,index};return withoutSavedBook(saved,bookKey);});
    if(ok&&removed&&alive.current){setRemoved(removed);return true;}return false;
  }, [commit]);
  const dismissRemoval = useCallback(() => setRemoved(null), []);
  const undoRemoval = useCallback(async() => {
    if (!removed) return false;
    let full=false;
    if (await commit(saved => {
      if (isSaved(saved, removed.book.bookKey)) return saved;
      if(saved.savedBooks.length+saved.savedContent.length>=SAVED_BOOKS_CAP){full=true;return saved;}
      const books = [...saved.savedBooks];
      books.splice(Math.min(removed.index, books.length), 0, removed.book);
      return { ...saved, savedBooks: books };
    })&&!full&&alive.current){setRemoved(null);return true;}return false;
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
    recoveryMode, reloadShelf, startNewShelf, removedLibraryNotice, removedBook: removed?.book || null, undoRemoval, dismissRemoval, reportStorageFailure,
    selectLibrary,
    retryLibrary,
    rememberBook,
    updateRecentDisplay,
    removeRecentBook,
    clearRecentBooks,
    restoreRecentBooks,
    clearSavedBooks,
    saveBook,
    unsaveBook,
    saveContent,
    unsaveContent,
  }), [state, library, loadingLibrary, libraryError, storageNotice, recoveryMode, reloadShelf, startNewShelf, removedLibraryNotice, removed, undoRemoval, dismissRemoval, reportStorageFailure, selectLibrary, retryLibrary, rememberBook, updateRecentDisplay, removeRecentBook, clearRecentBooks, restoreRecentBooks, clearSavedBooks, saveBook, unsaveBook, saveContent, unsaveContent]);

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
  if (failure.code === 'CATALOG_QUERY_UNSUPPORTED') return 'This library’s catalog searches only in English letters. Try a romanised spelling (for example “veyi padagalu”), or search All books.';
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

