import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { LibraryStateProvider, useLibrary, type LibraryState } from './context';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import type { PublicBook } from './types';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const onShelf = { bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title: 'Saved edition', authors: ['Synthetic author'], source: 'direct', viewedAt: '2026-10-01T00:00:00.000Z' };
const sameIsbn = { bookKey: 'v1:google:synthetic-volume', isbn13: '9780262033848', title: 'Another record', authors: ['Synthetic author'] } as PublicBook;

function renderShelf() {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [onShelf, { ...onShelf, title: 'Older duplicate', viewedAt: '2026-09-01T00:00:00.000Z' }], savedContent: [] }));
  let library!: LibraryState;
  function Probe() { library = useLibrary(); return null; }
  render(<LibraryStateProvider><Probe /></LibraryStateProvider>);
  return () => library;
}

it('reads one entry per saved book and treats the same ISBN-13 as already saved', async () => {
  const library = renderShelf();
  expect(library().state.savedBooks.map(book => book.title)).toEqual(['Saved edition']);
  let result: string | undefined;
  await act(async () => { result = await library().saveBook(sameIsbn); });
  expect(result).toBe('already-saved');
  // Any write stores the collapsed shelf, still as version 2.
  const stored = JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
  expect(stored.version).toBe(2);
  expect(stored.savedBooks.map((book: { title: string }) => book.title)).toEqual(['Saved edition']);
});

it('adding a removed book back drops its "Removed … Undo" notice', async () => {
  const library = renderShelf();
  await act(async () => { await library().unsaveBook(onShelf.bookKey); });
  expect(library().removedBook?.bookKey).toBe(onShelf.bookKey);
  let result: string | undefined;
  await act(async () => { result = await library().saveBook(onShelf as unknown as PublicBook); });
  expect(result).toBe('saved');
  // The book is back: an Undo for its removal would do nothing and hides under "Added to your shelf".
  expect(library().removedBook).toBeNull();
});
