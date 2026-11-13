import { browserStorage, type StorageLike } from './browserStorage';
import { APPEARANCE_STORAGE_KEY, READING_LIGHT_STORAGE_KEY } from './readingLight';
import { clearReaderState } from './readerState';
import type { PublicBook, RecentBook, RecentSource } from './types';
import type { ContentItem, SavedContent } from './contentTypes';

/** The retired companion's on/off setting (plan 3.4): only ever removed now. */
export const DOG_ANIMATION_STORAGE_KEY = 'mybookshelf.anonymous-web.dog-animation';

export const ANONYMOUS_WEB_STORAGE_KEY = 'mybookshelf.anonymous-web.v1';
const VERSION = 2;
export const HISTORY_LIMIT = 50;
export const SAVED_BOOKS_CAP = 100;
const SOURCES: ReadonlySet<string> = new Set(['camera', 'isbn', 'search', 'direct']);

export type AnonymousWebState = {
  version: typeof VERSION;
  selectedLibraryId: string | null;
  recentBooks: RecentBook[];
  savedBooks: RecentBook[];
  savedContent: SavedContent[];
};

export type AnonymousWebStateRead = {
  state: AnonymousWebState;
  status: 'ok' | 'unavailable' | 'corrupt';
};

export const emptyState = (): AnonymousWebState => ({ version: VERSION, selectedLibraryId: null, recentBooks: [], savedBooks: [], savedContent: [] });

function isSavedContent(value: unknown): value is SavedContent {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SavedContent>;
  return item.kind === 'content' && typeof item.contentKey === 'string'
    && /^fcd:v1:[a-z0-9-]+:[A-Za-z0-9:_.-]{1,150}$/.test(item.contentKey)
    && Boolean(text(item.title, 500)) && Array.isArray(item.authors) && item.authors.length <= 20
    && item.authors.every(a => Boolean(text(a, 240))) && Boolean(text(item.host, 240))
    && ['book','chapter','article','preprint','thesis','report','learning_resource','audiobook','other'].includes(item.itemKind || '')
    && typeof item.savedAt === 'string' && Number.isFinite(Date.parse(item.savedAt));
}

function normalizeSavedContent(item: SavedContent): SavedContent {
  return { kind: 'content', contentKey: item.contentKey, itemKind: item.itemKind, title: item.title.trim(),
    authors: item.authors.map(a => a.trim()), host: item.host.trim(), savedAt: item.savedAt };
}

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
    if (!parsed || ![1, VERSION].includes(parsed.version as number) || !Array.isArray(parsed.recentBooks)) return { state: emptyState(), status: 'corrupt' };
    const recentBooks = parsed.recentBooks.filter(isRecentBook).map(normalizeRecentBook);
    const savedBooks = (Array.isArray(parsed.savedBooks) ? parsed.savedBooks : []).filter(isRecentBook).map(normalizeRecentBook);
    const rawContent = parsed.version === VERSION ? parsed.savedContent : [];
    const savedContent = (Array.isArray(rawContent) ? rawContent : []).filter(isSavedContent).map(normalizeSavedContent);
    const damaged = recentBooks.length !== parsed.recentBooks.length
      || (parsed.savedBooks !== undefined && (!Array.isArray(parsed.savedBooks) || savedBooks.length !== parsed.savedBooks.length))
      || (parsed.selectedLibraryId != null && !text(parsed.selectedLibraryId, 160))
      || (rawContent !== undefined && (!Array.isArray(rawContent) || savedContent.length !== rawContent.length));
    return {
      state: { version: VERSION, selectedLibraryId: text(parsed.selectedLibraryId, 160) || null, recentBooks, savedBooks, savedContent },
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
      savedContent: state.savedContent.filter(isSavedContent).map(normalizeSavedContent),
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
  if (isSaved(state, book.bookKey) || state.savedBooks.length + state.savedContent.length >= SAVED_BOOKS_CAP) return state;
  const entry = toRecentBook(book, 'direct');
  return { ...state, savedBooks: [entry, ...state.savedBooks] };
}

export function withoutSavedBook(state: AnonymousWebState, bookKey: string): AnonymousWebState {
  return { ...state, savedBooks: state.savedBooks.filter((item) => item.bookKey !== bookKey) };
}

export function isSaved(state: AnonymousWebState, bookKey: string): boolean {
  return state.savedBooks.some((item) => item.bookKey === bookKey);
}

export function withSavedContent(state: AnonymousWebState, item: ContentItem, savedAt = new Date().toISOString()): AnonymousWebState {
  if (state.savedContent.some(value => value.contentKey === item.key)
    || state.savedContent.length + state.savedBooks.length >= SAVED_BOOKS_CAP) return state;
  const entry: SavedContent = { kind: 'content', contentKey: item.key, itemKind: item.kind, title: item.title,
    authors: item.contributors.filter(c => c.role === 'author').map(c => c.name).slice(0,20),
    host: item.locations.find(location => location.id === item.readingActions[0]?.locationId)?.host || item.locations[0]?.host || item.provenance[0]?.sourceId || 'Source', savedAt };
  return isSavedContent(entry) ? { ...state, savedContent: [normalizeSavedContent(entry), ...state.savedContent] } : state;
}

// One-shelf redesign (plan 3.4). The stored record keeps its version and shape
// so an older bundle can still read it; duplicate saved books (same bookKey)
// collapse to the most recently saved entry, which keeps its place in the list.
export function dedupeSavedBooks(state: AnonymousWebState): AnonymousWebState {
  const newest = new Map<string, RecentBook>();
  for (const book of state.savedBooks) {
    const kept = newest.get(book.bookKey);
    if (!kept || Date.parse(book.viewedAt) > Date.parse(kept.viewedAt)) newest.set(book.bookKey, book);
  }
  if (newest.size === state.savedBooks.length) return state;
  const placed = new Set<string>();
  return { ...state, savedBooks: state.savedBooks.filter((book) => {
    if (newest.get(book.bookKey) !== book || placed.has(book.bookKey)) return false;
    placed.add(book.bookKey);
    return true;
  }) };
}

export function readDedupedAnonymousWebStateWithStatus(storage: StorageLike | null = browserStorage()): AnonymousWebStateRead {
  const read = readAnonymousWebStateWithStatus(storage);
  return read.status === 'ok' ? { ...read, state: dedupeSavedBooks(read.state) } : read;
}
