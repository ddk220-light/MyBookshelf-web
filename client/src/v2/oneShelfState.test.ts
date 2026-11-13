import { describe, expect, it, vi } from 'vitest';
import { ANONYMOUS_WEB_STORAGE_KEY, readAnonymousWebStateWithStatus } from './localState';
import { DOG_ANIMATION_STORAGE_KEY } from './localState';
import { READING_LIGHT_STORAGE_KEY, APPEARANCE_STORAGE_KEY } from './readingLight';
import { AVAILABILITY_CACHE_KEY, LOOKUP_PREFERENCES_KEY, READER_PREFERENCES_KEY, removeRetiredReaderCaches } from './readerState';
import { ONE_SHELF_STORAGE_KEY, dismissAccountInvite, findSavedBook, isOnShelf, readOneShelfState, runOneShelfMigration, writeOneShelfState } from './oneShelfState';
import type { RecentBook } from './types';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const book = (bookKey: string, title: string, viewedAt: string, isbn13?: string): RecentBook =>
  ({ bookKey, title, authors: ['Synthetic author'], ...(isbn13 ? { isbn13 } : {}), source: 'direct', viewedAt });
const content = { kind: 'content', contentKey: 'fcd:v1:gutenberg:1342', itemKind: 'book', title: 'Pride and Prejudice', authors: ['Jane Austen'], host: 'gutenberg.org', savedAt: '2026-10-03T00:00:00.000Z' };
const now = () => '2026-11-12T10:00:00.000Z';
const noReaderCaches = () => {};

function productionProfile(savedBooks: RecentBook[]) {
  const storage = new MemoryStorage();
  storage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: 'koha:anna-centenary-library',
    recentBooks: [book('v1:isbn:9780141439518', 'Viewed book', '2026-10-05T00:00:00.000Z', '9780141439518')], savedBooks, savedContent: [content] }));
  storage.setItem(READER_PREFERENCES_KEY, JSON.stringify({ version: 1, shelfView: 'list', shelfSort: 'title', selectedLibrary: { id: 'koha:anna-centenary-library', name: 'Anna Centenary Library' } }));
  storage.setItem(READING_LIGHT_STORAGE_KEY, 'lamplight');
  storage.setItem(APPEARANCE_STORAGE_KEY, 'ink');
  storage.setItem(AVAILABILITY_CACHE_KEY, JSON.stringify({ version: 1, entries: [] }));
  storage.setItem(LOOKUP_PREFERENCES_KEY, JSON.stringify({ version: 1, entries: [] }));
  storage.setItem(DOG_ANIMATION_STORAGE_KEY, 'true');
  return storage;
}

describe('one-shelf browser migration', () => {
  it('keeps a production profile byte-for-byte when it has no duplicates', async () => {
    const storage = productionProfile([book('v1:isbn:9780262033848', 'Saved book', '2026-10-02T00:00:00.000Z', '9780262033848')]);
    const before = storage.getItem(ANONYMOUS_WEB_STORAGE_KEY);
    const removeReaderCaches = vi.fn(() => { for (const key of [AVAILABILITY_CACHE_KEY, LOOKUP_PREFERENCES_KEY]) storage.removeItem(key); });
    expect(await runOneShelfMigration({ storage, now, removeReaderCaches })).toBe('migrated');
    expect(storage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(before);
    expect(removeReaderCaches).toHaveBeenCalledOnce();
    expect(storage.getItem(AVAILABILITY_CACHE_KEY)).toBeNull();
    expect(storage.getItem(LOOKUP_PREFERENCES_KEY)).toBeNull();
    expect(storage.getItem(DOG_ANIMATION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(READING_LIGHT_STORAGE_KEY)).toBe('lamplight');
    expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe('ink');
    expect(JSON.parse(storage.getItem(READER_PREFERENCES_KEY)!).selectedLibrary.id).toBe('koha:anna-centenary-library');
    expect(JSON.parse(storage.getItem(ONE_SHELF_STORAGE_KEY)!)).toEqual({ version: 1, migratedAt: now() });
  });

  it('collapses duplicate saved books to the newest, and an old bundle still reads the result', async () => {
    const storage = productionProfile([
      book('v1:isbn:9780262033848', 'Older save', '2026-10-01T00:00:00.000Z', '9780262033848'),
      book('v1:isbn:9780140449136', 'Other book', '2026-10-03T00:00:00.000Z', '9780140449136'),
      book('v1:isbn:9780262033848', 'Newer save', '2026-10-04T00:00:00.000Z', '9780262033848'),
    ]);
    await runOneShelfMigration({ storage, now, removeReaderCaches: noReaderCaches });
    const stored = JSON.parse(storage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
    expect(stored.version).toBe(2);
    expect(Object.keys(stored)).toEqual(['version', 'selectedLibraryId', 'recentBooks', 'savedBooks', 'savedContent']);
    expect(stored.savedBooks.map((item: RecentBook) => item.title)).toEqual(['Other book', 'Newer save']);
    // The reader used by the current (and an older) bundle opens it without recovery mode.
    const old = readAnonymousWebStateWithStatus(storage);
    expect(old.status).toBe('ok');
    expect(old.state.selectedLibraryId).toBe('koha:anna-centenary-library');
    expect(old.state.recentBooks.map(item => item.title)).toEqual(['Viewed book']);
    expect(old.state.savedContent.map(item => item.contentKey)).toEqual([content.contentKey]);
  });

  it('loads a version 1 record unchanged and does not rewrite it', async () => {
    const storage = new MemoryStorage();
    const v1 = JSON.stringify({ version: 1, selectedLibraryId: 'calil:setagaya', recentBooks: [book('v1:isbn:9780262033848', 'Viewed', '2026-01-01T00:00:00.000Z')] });
    storage.setItem(ANONYMOUS_WEB_STORAGE_KEY, v1);
    expect(await runOneShelfMigration({ storage, now, removeReaderCaches: noReaderCaches })).toBe('migrated');
    expect(storage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(v1);
    expect(readAnonymousWebStateWithStatus(storage).state.selectedLibraryId).toBe('calil:setagaya');
  });

  it('leaves a damaged shelf for the recovery screen', async () => {
    const storage = new MemoryStorage();
    storage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 3, recentBooks: [] }));
    await runOneShelfMigration({ storage, now, removeReaderCaches: noReaderCaches });
    expect(storage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(JSON.stringify({ version: 3, recentBooks: [] }));
    expect(readAnonymousWebStateWithStatus(storage).status).toBe('corrupt');
  });

  it('runs once', async () => {
    const storage = productionProfile([]);
    await runOneShelfMigration({ storage, now, removeReaderCaches: noReaderCaches });
    storage.setItem(DOG_ANIMATION_STORAGE_KEY, 'true');
    const removeReaderCaches = vi.fn();
    expect(await runOneShelfMigration({ storage, now: () => '2027-01-01T00:00:00.000Z', removeReaderCaches })).toBe('already-migrated');
    expect(removeReaderCaches).not.toHaveBeenCalled();
    expect(storage.getItem(DOG_ANIMATION_STORAGE_KEY)).toBe('true');
    expect(readOneShelfState(storage).migratedAt).toBe(now());
  });

  it('reports unavailable storage without throwing', async () => {
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(await runOneShelfMigration({ storage: blocked, now, removeReaderCaches: noReaderCaches })).toBe('unavailable');
    expect(await runOneShelfMigration({ storage: null, now, removeReaderCaches: noReaderCaches })).toBe('unavailable');
  });
});

describe('mybookshelf.one-shelf.v1', () => {
  it('reads defaults when missing or damaged', () => {
    const storage = new MemoryStorage();
    expect(readOneShelfState(storage)).toEqual({ version: 1 });
    storage.setItem(ONE_SHELF_STORAGE_KEY, '{not json');
    expect(readOneShelfState(storage)).toEqual({ version: 1 });
    storage.setItem(ONE_SHELF_STORAGE_KEY, JSON.stringify({ version: 2, accountInviteDismissed: true }));
    expect(readOneShelfState(storage)).toEqual({ version: 1 });
    storage.setItem(ONE_SHELF_STORAGE_KEY, JSON.stringify({ version: 1, accountInviteDismissed: 'yes', migratedAt: 'never' }));
    expect(readOneShelfState(storage)).toEqual({ version: 1 });
  });

  it('ignores unknown fields on read and keeps them on write', () => {
    const storage = new MemoryStorage();
    storage.setItem(ONE_SHELF_STORAGE_KEY, JSON.stringify({ version: 1, futureSetting: 'kept', migratedAt: now() }));
    expect(readOneShelfState(storage)).toEqual({ version: 1, migratedAt: now() });
    expect(dismissAccountInvite(storage)).toBe(true);
    expect(JSON.parse(storage.getItem(ONE_SHELF_STORAGE_KEY)!)).toEqual({ version: 1, futureSetting: 'kept', migratedAt: now(), accountInviteDismissed: true });
    expect(readOneShelfState(storage).accountInviteDismissed).toBe(true);
    expect(writeOneShelfState({ accountInviteDismissed: undefined }, storage)).toBe(true);
    expect(readOneShelfState(storage).accountInviteDismissed).toBeUndefined();
  });

  it('never holds search text', () => {
    const storage = new MemoryStorage();
    dismissAccountInvite(storage);
    expect(Object.keys(JSON.parse(storage.getItem(ONE_SHELF_STORAGE_KEY)!)).sort()).toEqual(['accountInviteDismissed', 'version']);
  });
});

describe('retired reader caches', () => {
  it('removes availability and edition settings but keeps reader preferences', () => {
    localStorage.setItem(AVAILABILITY_CACHE_KEY, '{"version":1,"entries":[]}');
    localStorage.setItem(LOOKUP_PREFERENCES_KEY, '{"version":1,"entries":[]}');
    localStorage.setItem(READER_PREFERENCES_KEY, '{"version":1,"shelfView":"list","shelfSort":"recent"}');
    removeRetiredReaderCaches();
    expect(localStorage.getItem(AVAILABILITY_CACHE_KEY)).toBeNull();
    expect(localStorage.getItem(LOOKUP_PREFERENCES_KEY)).toBeNull();
    expect(localStorage.getItem(READER_PREFERENCES_KEY)).not.toBeNull();
    localStorage.clear();
  });
});

describe('saved-book identity', () => {
  const shelf = [book('v1:isbn:9780262033848', 'Algorithms', '2026-10-01T00:00:00.000Z', '9780262033848'), book('v1:google:abc', 'No ISBN', '2026-10-01T00:00:00.000Z')];
  it('matches by bookKey or ISBN-13 only', () => {
    expect(isOnShelf(shelf, { bookKey: 'v1:google:abc' })).toBe(true);
    expect(findSavedBook(shelf, { bookKey: 'v1:catalog:koha:x:1', isbn13: '978-0-262-03384-8' })?.title).toBe('Algorithms');
    expect(isOnShelf(shelf, { bookKey: 'v1:google:other', isbn13: null })).toBe(false);
    expect(isOnShelf(shelf, { bookKey: 'v1:google:other', isbn13: '9780140449136' })).toBe(false);
  });
  it('never matches on title or author', () => {
    expect(isOnShelf(shelf, { bookKey: 'v1:google:another-edition', isbn13: undefined })).toBe(false);
    expect(isOnShelf([book('v1:a', 'Same', '2026-10-01T00:00:00.000Z')], { bookKey: 'v1:b' })).toBe(false);
  });
});
