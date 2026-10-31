import { browserStorage, type StorageLike } from './browserStorage';
import { APPEARANCE_STORAGE_KEY, READING_LIGHT_STORAGE_KEY } from './readingLight';
import { DOG_ANIMATION_STORAGE_KEY } from './dogAnimation';
import { clearReaderState } from './readerState';
import type { PublicBook, RecentBook, RecentSource } from './types';

export const ANONYMOUS_WEB_STORAGE_KEY = 'mybookshelf.anonymous-web.v1';
const VERSION = 1;
const HISTORY_LIMIT = 50;
export const SAVED_BOOKS_CAP = 100;
const SOURCES: ReadonlySet<string> = new Set(['camera', 'isbn', 'search', 'direct']);

export type AnonymousWebState = {
  version: typeof VERSION;
  selectedLibraryId: string | null;
  recentBooks: RecentBook[];
  savedBooks: RecentBook[];
};

export type AnonymousWebStateRead = {
  state: AnonymousWebState;
  status: 'ok' | 'unavailable' | 'corrupt';
};

export const emptyState = (): AnonymousWebState => ({ version: VERSION, selectedLibraryId: null, recentBooks: [], savedBooks: [] });

function text(value: unknown, maximum: number): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum ? value.trim() : undefined;
}

function isRecentBook(value: unknown): value is RecentBook {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RecentBook>;
  return Boolean(
    text(item.bookKey, typeof item.bookKey === 'string' && item.bookKey.startsWith('v1:catalog:vpl:visakhapatnam-public-library:') ? 4096 : 512)
    && text(item.title, 500)
    && Array.isArray(item.authors)
    && item.authors.every((author) => Boolean(text(author, 240)))
    && typeof item.viewedAt === 'string'
    && Number.isFinite(Date.parse(item.viewedAt))
    && typeof item.source === 'string'
    && SOURCES.has(item.source),
  );
}

function normalizeRecentBook(value: RecentBook): RecentBook {
  return {
    bookKey: value.bookKey.trim(),
    title: value.title.trim(),
    authors: value.authors.map((author) => author.trim()).slice(0, 20),
    ...(text(value.isbn13, 13) ? { isbn13: value.isbn13!.trim() } : {}),
    ...(text(value.coverUrl, 2_000) ? { coverUrl: value.coverUrl!.trim() } : {}),
    source: value.source,
    viewedAt: value.viewedAt,
  };
}

export function readAnonymousWebState(storage: StorageLike | null = browserStorage()): AnonymousWebState {
  return readAnonymousWebStateWithStatus(storage).state;
}

export function readAnonymousWebStateWithStatus(storage: StorageLike | null = browserStorage()): AnonymousWebStateRead {
  if (!storage) return { state: emptyState(), status: 'unavailable' };
  let raw: string | null;
  try { raw = storage.getItem(ANONYMOUS_WEB_STORAGE_KEY); }
  catch { return { state: emptyState(), status: 'unavailable' }; }
  try {
    if (!raw) return { state: emptyState(), status: 'ok' };
    const parsed = JSON.parse(raw) as Partial<AnonymousWebState>;
    if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.recentBooks)) return { state: emptyState(), status: 'corrupt' };
    const recentBooks = parsed.recentBooks.filter(isRecentBook).map(normalizeRecentBook);
    const savedBooks = (Array.isArray(parsed.savedBooks) ? parsed.savedBooks : []).filter(isRecentBook).map(normalizeRecentBook);
    const damaged = recentBooks.length !== parsed.recentBooks.length
      || (parsed.savedBooks !== undefined && (!Array.isArray(parsed.savedBooks) || savedBooks.length !== parsed.savedBooks.length))
      || (parsed.selectedLibraryId != null && !text(parsed.selectedLibraryId, 160));
    return {
      state: { version: VERSION, selectedLibraryId: text(parsed.selectedLibraryId, 160) || null, recentBooks, savedBooks },
      status: damaged ? 'corrupt' : 'ok',
    };
  } catch {
    return { state: emptyState(), status: 'corrupt' };
  }
}

export function writeAnonymousWebState(state: AnonymousWebState, storage: StorageLike | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({
      version: VERSION,
      selectedLibraryId: text(state.selectedLibraryId, 160) || null,
      recentBooks: state.recentBooks.filter(isRecentBook).map(normalizeRecentBook).slice(0, HISTORY_LIMIT),
      savedBooks: state.savedBooks.map(normalizeRecentBook),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearAnonymousWebState(storage: StorageLike | null = browserStorage()): void {
  clearReaderState();
  if (!storage) return;
  try {
    storage.removeItem(ANONYMOUS_WEB_STORAGE_KEY);
    storage.removeItem(READING_LIGHT_STORAGE_KEY);
    storage.removeItem(APPEARANCE_STORAGE_KEY);
    storage.removeItem(DOG_ANIMATION_STORAGE_KEY);
  } catch { /* storage unavailable — nothing to clear */ }
}

export function withSelectedLibrary(state: AnonymousWebState, selectedLibraryId: string | null): AnonymousWebState {
  return { ...state, selectedLibraryId: text(selectedLibraryId, 160) || null };
}

export function toRecentBook(book: PublicBook, source: RecentSource, viewedAt = new Date().toISOString()): RecentBook {
  return {
    bookKey: book.bookKey,
    title: book.title,
    authors: book.authors,
    ...(book.isbn13 ? { isbn13: book.isbn13 } : {}),
    ...(book.coverUrl ? { coverUrl: book.coverUrl } : {}),
    source,
    viewedAt,
  };
}

export function withRecentBook(state: AnonymousWebState, book: PublicBook, source: RecentSource, viewedAt = new Date().toISOString()): AnonymousWebState {
  const recent = toRecentBook(book, source, viewedAt);
  const retained = state.recentBooks.filter((item) => item.bookKey !== recent.bookKey);
  return { ...state, recentBooks: [recent, ...retained].slice(0, HISTORY_LIMIT) };
}

export function withSavedBook(state: AnonymousWebState, book: PublicBook): AnonymousWebState {
  if (isSaved(state, book.bookKey) || state.savedBooks.length >= SAVED_BOOKS_CAP) return state;
  const entry = toRecentBook(book, 'direct');
  return { ...state, savedBooks: [entry, ...state.savedBooks] };
}

export function withoutSavedBook(state: AnonymousWebState, bookKey: string): AnonymousWebState {
  return { ...state, savedBooks: state.savedBooks.filter((item) => item.bookKey !== bookKey) };
}

export function isSaved(state: AnonymousWebState, bookKey: string): boolean {
  return state.savedBooks.some((item) => item.bookKey === bookKey);
}
