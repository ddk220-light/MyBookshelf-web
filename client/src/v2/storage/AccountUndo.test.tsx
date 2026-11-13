import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AccountSessionProvider } from '../auth/AccountSessionProvider';
import { LibraryStateProvider, useLibrary, type LibraryState } from '../context';
import type { PublicBook } from '../types';

// Signed-in readers: the "Removed … · Undo" notice follows the same rules as a
// guest's (context.shelfIdentity.test.tsx).

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const USER = { id: 'reader-1', name: null, email: 'reader@example.test', emailVerified: true };
const BOOK = { bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title: 'Synthetic book', authors: ['Synthetic author'] } as PublicBook;
const OTHER = { bookKey: 'v1:isbn:9780000000002', title: 'Opened book', authors: ['Synthetic author'] } as PublicBook;

function account() {
  let shelf: Array<Record<string, unknown>> = [{ ...BOOK, referenceId: 'ref-1', savedAt: '2026-10-01T00:00:00.000Z' }];
  let shelfRevision = 1;
  const versions = () => ({ settingsRevision: 0, shelfRevision, historyGeneration: 0, historyEnabled: true });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input), method = init?.method || 'GET';
    if (path.endsWith('/api/account/capabilities')) return json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin });
    if (path.endsWith('/api/account/session')) return json({ status: 'authenticated', user: USER, csrfToken: 'csrf-1' });
    if (path.endsWith('/api/account/state')) return json({ profile: { ...USER, profileRevision: 0 }, selectedLibraryId: null, selectedLibrary: null, libraryRemoved: false, counts: { saved: shelf.length, recent: 0 }, ...versions() });
    if (path.includes('/api/account/books?')) return json({ books: shelf, nextCursor: null, ...versions() });
    if (path.endsWith('/api/account/history')) return json({ books: [], ...versions() });
    if (path.endsWith('/api/account/history/views') && method === 'POST') return json({ status: 'recorded', ...versions() });
    if (path.endsWith('/api/account/books/ref-1') && method === 'DELETE') {
      shelf = []; shelfRevision += 1;
      return json({ status: 'removed', referenceId: 'ref-1', undoUntil: new Date(Date.now() + 10_000).toISOString(), ...versions() });
    }
    if (path.endsWith('/api/account/books') && method === 'PUT') {
      shelf = [{ ...BOOK, referenceId: 'ref-2', savedAt: '2026-11-01T00:00:00.000Z' }]; shelfRevision += 1;
      return json({ status: 'saved', referenceId: 'ref-2', ...versions() });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  }));
}

function renderAccount() {
  let library!: LibraryState;
  function Probe() { library = useLibrary(); return null; }
  render(<AccountSessionProvider><LibraryStateProvider><Probe /></LibraryStateProvider></AccountSessionProvider>);
  return () => library;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it('signed in: opening another book keeps the Undo; adding the removed book back drops it', async () => {
  account();
  const library = renderAccount();
  await waitFor(() => expect(library().state.savedBooks).toHaveLength(1));
  await act(async () => { await library().unsaveBook(BOOK.bookKey); });
  expect(library().removedBook?.bookKey).toBe(BOOK.bookKey);
  // A quiet Viewed before entry does not touch the shelf, so Undo still applies.
  await act(async () => { await library().rememberBook(OTHER, 'search'); });
  expect(library().removedBook?.bookKey).toBe(BOOK.bookKey);
  let result: string | undefined;
  await act(async () => { result = await library().saveBook(BOOK); });
  expect(result).toBe('saved');
  expect(library().removedBook).toBeNull();
});
