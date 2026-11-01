import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryStateProvider, useLibrary } from './context';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import { cacheAvailability, clearReaderState, readCachedAvailability } from './readerState';
import { catalogStatus } from './ui/journal/DueSlip';
import type { Availability } from './types';

afterEach(() => { cleanup(); localStorage.clear(); clearReaderState(); vi.useRealTimers(); });
const book = { bookKey: 'v1:isbn:9780553418026', title: 'The Martian', authors: ['Andy Weir'] };
function Controls() {
  const { state, recoveryMode, rememberBook, saveBook, unsaveBook, removedBook, undoRemoval, reloadShelf, startNewShelf } = useLibrary();
  return <><p>{recoveryMode ? 'Recovery' : 'Ready'}</p><p>{state.savedBooks.length} saved</p>
    <button onClick={() => rememberBook(book, 'direct')}>Open</button><button onClick={() => saveBook(book)}>Save</button>
    <button onClick={() => unsaveBook(book.bookKey)}>Remove</button>{removedBook && <button onClick={undoRemoval}>Undo</button>}
    <button onClick={reloadShelf}>Reload</button><button onClick={startNewShelf}>Reset confirmed</button></>;
}
it.each(['savedBooks', 'recentBooks'])('blocks automatic and explicit writes while %s is damaged, then reloads', field => {
  const raw = JSON.stringify({ version: 1, recentBooks: [], savedBooks: [], [field]: [{ title: 'Recover me' }] });
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, raw);
  render(<LibraryStateProvider><Controls /></LibraryStateProvider>);
  fireEvent.click(screen.getByText('Open'));
  fireEvent.click(screen.getByText('Save'));
  fireEvent.click(screen.getByText('Reload'));
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(raw);
  expect(screen.getByText('Recovery')).toBeInTheDocument();
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, recentBooks: [], savedBooks: [] }));
  fireEvent.click(screen.getByText('Reload'));
  fireEvent.click(screen.getByText('Save'));
  expect(screen.getByText('1 saved')).toBeInTheDocument();
});
it('restores the original saved entry with Undo for ten seconds', async() => {
  vi.useFakeTimers();
  render(<LibraryStateProvider><Controls /></LibraryStateProvider>);
  await act(async()=>{fireEvent.click(screen.getByText('Save'));});
  const original = localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY);
  await act(async()=>{fireEvent.click(screen.getByText('Remove'));});
  act(() => vi.advanceTimersByTime(9999));
  await act(async()=>{fireEvent.click(screen.getByText('Undo'));});
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(original);
  await act(async()=>{fireEvent.click(screen.getByText('Remove'));});
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.queryByText('Undo')).toBeNull();
});
it('isolates cache entries by library, book, edition and language and replaces failed successes', () => {
  const available: Availability = { outcome: 'available', lookupKind: 'verified_work', matchKind: 'verified_work', freshness: 'fresh', attemptedAt: '2026-10-28T00:00:00Z', availableCopies: 2 };
  cacheAvailability('a', book.bookKey, { editionScope: 'work', language: 'eng' }, available);
  expect(readCachedAvailability('a', book.bookKey, { editionScope: 'work', language: 'eng' })?.outcome).toBe('available');
  for (const [library, key, editionScope, language] of [['b', book.bookKey, 'work', 'eng'], ['a', 'another', 'work', 'eng'], ['a', book.bookKey, 'exact', 'eng'], ['a', book.bookKey, 'work', 'hin']] as const) {
    expect(readCachedAvailability(library, key, { editionScope, language })).toBeNull();
  }
  cacheAvailability('a', book.bookKey, { editionScope: 'work', language: 'eng' }, { ...available, freshness: 'stale', errorCode: 'CATALOG_TIMEOUT' });
  expect(readCachedAvailability('a', book.bookKey, { editionScope: 'work', language: 'eng' })).toMatchObject({ outcome: 'unknown', errorCode: 'CATALOG_TIMEOUT' });
  expect(readCachedAvailability('a', book.bookKey, { editionScope: 'work', language: 'eng' })?.availableCopies).toBeUndefined();
});

it('keeps a session isolated when initially denied storage becomes accessible', () => {
  const original = JSON.stringify({ version: 1, selectedLibraryId: null, recentBooks: [], savedBooks: [{ ...book, bookKey: 'v1:openlibrary:OL1W', title: 'Existing shelf', source: 'direct', viewedAt: '2026-10-20T00:00:00Z' }] });
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, original);
  const get = Storage.prototype.getItem;
  let denied = true;
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
    if (key === ANONYMOUS_WEB_STORAGE_KEY && denied) throw new Error('denied');
    return get.call(this, key);
  });
  try {
    render(<LibraryStateProvider><Controls /></LibraryStateProvider>);
    fireEvent.click(screen.getByText('Open'));
    denied = false;
    fireEvent.click(screen.getByText('Save'));
    fireEvent(window, new StorageEvent('storage', { key: ANONYMOUS_WEB_STORAGE_KEY }));
    expect(screen.getByText('1 saved')).toBeInTheDocument();
    expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(original);
  } finally { spy.mockRestore(); }
});
it('does not resume persistence after a failed shelf write', () => {
  render(<LibraryStateProvider><Controls /></LibraryStateProvider>);
  const set = Storage.prototype.setItem;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === ANONYMOUS_WEB_STORAGE_KEY) throw new Error('quota');
    return set.call(this, key, value);
  });
  fireEvent.click(screen.getByText('Save'));
  spy.mockRestore();
  fireEvent.click(screen.getByText('Open'));
  expect(screen.getByText('1 saved')).toBeInTheDocument();
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBeNull();
});
it('retains the edition warning in cached shelf summaries', () => {
  const ambiguous: Availability = { outcome: 'unknown', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', catalogMatchCount: 2, freshness: 'fresh', attemptedAt: '2026-10-28T00:00:00Z' };
  cacheAvailability('a', book.bookKey, undefined, ambiguous);
  expect(catalogStatus(readCachedAvailability('a', book.bookKey)!)).toEqual(catalogStatus(ambiguous));
});
it('keeps a damaged shelf protected when Reload cannot read storage', () => {
  const original = JSON.stringify({ version: 1, savedBooks: [{ title: 'damaged' }], recentBooks: [] });
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, original);
  render(<LibraryStateProvider><Controls /></LibraryStateProvider>);
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  fireEvent.click(screen.getByText('Reload'));
  fireEvent.click(screen.getByText('Open'));
  fireEvent.click(screen.getByText('Save'));
  spy.mockRestore();
  expect(screen.getByText('Recovery')).toBeInTheDocument();
  expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(original);
});
