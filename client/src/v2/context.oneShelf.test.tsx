import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { LibraryStateProvider, useLibrary, type LibraryState } from './context';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import type { PublicBook } from './types';

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const onShelf = { bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title: 'Saved edition', authors: ['Synthetic author'], source: 'direct', viewedAt: '2026-10-01T00:00:00.000Z' };
const sameIsbn = { bookKey: 'v1:google:synthetic-volume', isbn13: '9780262033848', title: 'Another record', authors: ['Synthetic author'] } as PublicBook;

function renderShelf(oneShelf: boolean) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [onShelf, { ...onShelf, title: 'Older duplicate', viewedAt: '2026-09-01T00:00:00.000Z' }], savedContent: [] }));
  let library!: LibraryState;
  function Probe() { library = useLibrary(); return null; }
  render(<LibraryStateProvider oneShelf={oneShelf}><Probe /></LibraryStateProvider>);
  return () => library;
}

it('with the flag on, reads one entry per saved book and treats the same ISBN-13 as already saved', async () => {
  const library = renderShelf(true);
  expect(library().state.savedBooks.map(book => book.title)).toEqual(['Saved edition']);
  let result: string | undefined;
  await act(async () => { result = await library().saveBook(sameIsbn); });
  expect(result).toBe('already-saved');
  // Any write stores the collapsed shelf, still as version 2.
  const stored = JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
  expect(stored.version).toBe(2);
  expect(stored.savedBooks.map((book: { title: string }) => book.title)).toEqual(['Saved edition']);
});

it('with the flag off, behaves as before', async () => {
  const library = renderShelf(false);
  expect(library().state.savedBooks).toHaveLength(2);
  let result: string | undefined;
  await act(async () => { result = await library().saveBook(sameIsbn); });
  expect(result).toBe('saved');
});
