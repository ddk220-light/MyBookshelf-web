import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_WEB_STORAGE_KEY,
  clearAnonymousWebState,
  dedupeSavedBooks,
  emptyState,
  isSaved,
  readDedupedAnonymousWebStateWithStatus,
  readAnonymousWebState,
  readAnonymousWebStateWithStatus,
  withRecentBook,
  withSavedBook,
  withoutSavedBook,
  withSelectedLibrary,
  writeAnonymousWebState,
} from './localState';
import { READING_LIGHT_STORAGE_KEY } from './readingLight';
import { DOG_ANIMATION_STORAGE_KEY } from './dogAnimation';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const book = { bookKey: 'v1:isbn:9781625275868', title: 'The First 90 Days', authors: ['Michael D. Watkins'], isbn13: '9781625275868' };

describe('anonymous browser state', () => {
  it('retains long title/author catalog identities when a saved shelf is reopened', () => {
    const storage = new MemoryStorage();
    const long = { ...book, bookKey: 'v1:catalog:vpl:visakhapatnam-public-library:' + 'a'.repeat(350) };
    const state = withSavedBook(withRecentBook(readAnonymousWebState(storage), long, 'search'), long);
    expect(writeAnonymousWebState(state, storage)).toBe(true);
    const reopened = readAnonymousWebStateWithStatus(storage);
    expect(reopened.status).toBe('ok');
    expect(reopened.state.savedBooks[0].bookKey).toBe(long.bookKey);
    expect(reopened.state.recentBooks[0].bookKey).toBe(long.bookKey);
  });
  it('stores only the selected id and resolved public book history', () => {
    const storage = new MemoryStorage();
    const selected = withSelectedLibrary(readAnonymousWebState(storage), 'in:chennai-university');
    const next = withRecentBook(selected, book, 'isbn', '2026-08-03T12:00:00.000Z');

    expect(writeAnonymousWebState(next, storage)).toBe(true);
    expect(JSON.parse(storage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!)).toEqual({
      version: 2,
      selectedLibraryId: 'in:chennai-university',
      recentBooks: [{ ...book, source: 'isbn', viewedAt: '2026-08-03T12:00:00.000Z' }],
      savedBooks: [],
      savedContent: [],
    });
  });

  it('deduplicates a revisited book and retains the newest result', () => {
    const storage = new MemoryStorage();
    const first = withRecentBook(readAnonymousWebState(storage), book, 'search', '2026-08-03T10:00:00.000Z');
    const second = withRecentBook(first, { ...book, title: 'The First 90 Days: Updated' }, 'direct', '2026-08-03T11:00:00.000Z');

    expect(second.recentBooks).toEqual([{ ...book, title: 'The First 90 Days: Updated', source: 'direct', viewedAt: '2026-08-03T11:00:00.000Z' }]);
  });

  it('caps recent history at fifty records', () => {
    let state = readAnonymousWebState(new MemoryStorage());
    for (let index = 0; index < 55; index += 1) {
      state = withRecentBook(state, { ...book, bookKey: `v1:googlebooks:book${index}`, title: `Book ${index}` }, 'search', `2026-08-03T12:${String(index).padStart(2, '0')}:00.000Z`);
    }
    expect(state.recentBooks).toHaveLength(50);
    expect(state.recentBooks[0].title).toBe('Book 54');
    expect(state.recentBooks[state.recentBooks.length - 1]?.title).toBe('Book 5');
  });

  it('safely resets malformed or unavailable storage', () => {
    const corrupt = new MemoryStorage();
    corrupt.setItem(ANONYMOUS_WEB_STORAGE_KEY, '{not json');
    expect(readAnonymousWebState(corrupt)).toEqual({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [], savedContent: [] });
    expect(readAnonymousWebStateWithStatus(corrupt).status).toBe('corrupt');
    expect(readAnonymousWebStateWithStatus(null).status).toBe('unavailable');
    expect(writeAnonymousWebState(readAnonymousWebState(null), null)).toBe(false);
  });

  it('reports quota/storage failures without throwing', () => {
    const blocked = { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); }, removeItem: () => undefined };
    expect(writeAnonymousWebState(withRecentBook(readAnonymousWebState(blocked), book, 'isbn'), blocked)).toBe(false);
  });

  it('clearAnonymousWebState removes state and appearance preferences', () => {
    localStorage.clear();
    writeAnonymousWebState(withSelectedLibrary(readAnonymousWebStateWithStatus().state, 'bc:smcl'));
    localStorage.setItem(READING_LIGHT_STORAGE_KEY, 'lamplight');
    localStorage.setItem(DOG_ANIMATION_STORAGE_KEY, 'true');
    clearAnonymousWebState();
    expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(READING_LIGHT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(DOG_ANIMATION_STORAGE_KEY)).toBeNull();
  });

  const BOOK = { bookKey: 'v1:isbn:9780553418026', title: 'The Martian', authors: ['Andy Weir'] };

  it('refuses new additions at 100 without removing or reordering existing books', () => {
    let state = readAnonymousWebState(new MemoryStorage());
    for (let i = 0; i < 105; i += 1) {
      state = withSavedBook(state, { ...BOOK, bookKey: `v1:isbn:${String(9780000000000 + i)}` });
    }
    const full = state;
    state = withSavedBook(state, BOOK);
    expect(state).toBe(full);
    state = withSavedBook(state, state.savedBooks[50]);
    expect(state).toBe(full);
    expect(state.savedBooks.length).toBe(100);
    expect(state.savedBooks[0].bookKey).toBe('v1:isbn:9780000000099');
    expect(state.savedBooks[99].bookKey).toBe('v1:isbn:9780000000000');
    expect(isSaved(state, BOOK.bookKey)).toBe(false);
  });

  it('preserves shelves above the new-addition limit through upgrades', () => {
    const storage = new MemoryStorage();
    const state = readAnonymousWebState(storage);
    state.savedBooks = Array.from({ length: 105 }, (_, i) => ({ ...BOOK, bookKey: `v1:googlebooks:${i}`, source: 'direct', viewedAt: '2026-10-28T00:00:00Z' }));
    expect(writeAnonymousWebState(state, storage)).toBe(true);
    expect(readAnonymousWebStateWithStatus(storage).state.savedBooks).toHaveLength(105);
  });

  it.each(['recentBooks', 'savedBooks'])('marks damaged %s as recoverable without changing the raw record', field => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ version: 1, recentBooks: [], savedBooks: [], [field]: [{ title: 'Damaged' }] });
    storage.setItem(ANONYMOUS_WEB_STORAGE_KEY, raw);
    expect(readAnonymousWebStateWithStatus(storage).status).toBe('corrupt');
    expect(storage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(raw);
  });

  it('removes a saved book', () => {
    let state = withSavedBook(readAnonymousWebState(new MemoryStorage()), BOOK);
    state = withoutSavedBook(state, BOOK.bookKey);
    expect(isSaved(state, BOOK.bookKey)).toBe(false);
  });

  it('reads legacy state without savedBooks as an empty list and stays ok', () => {
    const legacy = new MemoryStorage();
    legacy.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, selectedLibraryId: 'bc:smcl', recentBooks: [] }));
    const read = readAnonymousWebStateWithStatus(legacy);
    expect(read.state.savedBooks).toEqual([]);
    expect(read.status).toBe('ok');
  });

  it('round-trips a saved book, independently of recent history, through write/read', () => {
    const storage = new MemoryStorage();
    let state = withRecentBook(readAnonymousWebState(storage), book, 'search', '2026-08-03T09:00:00.000Z');
    state = withSavedBook(state, BOOK);

    expect(writeAnonymousWebState(state, storage)).toBe(true);
    const read = readAnonymousWebStateWithStatus(storage);

    expect(read.status).toBe('ok');
    expect(read.state.savedBooks).toHaveLength(1);
    expect(read.state.savedBooks[0]).toMatchObject({ bookKey: BOOK.bookKey, title: BOOK.title });
    expect(read.state.recentBooks).toHaveLength(1);
    expect(read.state.recentBooks[0]).toMatchObject({ bookKey: book.bookKey, title: book.title });
  });
});

describe('one-shelf de-duplication', () => {
  const saved = (title: string, viewedAt: string, bookKey = book.bookKey) => ({ ...book, bookKey, title, source: 'direct' as const, viewedAt });
  it('collapses saved books with the same key to the newest, in place', () => {
    const state = { ...emptyState(), savedBooks: [saved('Old', '2026-01-01T00:00:00.000Z'), saved('Other', '2026-01-02T00:00:00.000Z', 'v1:isbn:9780140449136'), saved('New', '2026-01-03T00:00:00.000Z')] };
    expect(dedupeSavedBooks(state).savedBooks.map(item => item.title)).toEqual(['Other', 'New']);
    const clean = { ...emptyState(), savedBooks: [saved('Only', '2026-01-01T00:00:00.000Z')] };
    expect(dedupeSavedBooks(clean)).toBe(clean);
  });
  it('reads de-duplicated only when the record is healthy', () => {
    const storage = new MemoryStorage();
    storage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedContent: [],
      savedBooks: [saved('Old', '2026-01-01T00:00:00.000Z'), saved('New', '2026-01-03T00:00:00.000Z')] }));
    const read = readDedupedAnonymousWebStateWithStatus(storage);
    expect(read.status).toBe('ok');
    expect(read.state.savedBooks.map(item => item.title)).toEqual(['New']);
    // The plain reader (used with the flag off and by older bundles) is unchanged.
    expect(readAnonymousWebStateWithStatus(storage).state.savedBooks).toHaveLength(2);
  });
});
