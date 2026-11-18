import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AccountSessionProvider } from '../auth/AccountSessionProvider';
import { LibraryStateProvider, useLibrary, type LibraryState } from '../context';
import { MERGED_KEY, planGuestMerge, readMerged } from './guestMerge';
import type { ReadingSnapshot } from './AccountRepository';

// Plan B5: the automatic merge at sign-in. The browser's books the account
// lacks go over quietly; what was sent is remembered so a book removed from
// the account later is not added again; a failure never holds the shelf.

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const GUEST_KEY = 'mybookshelf.anonymous-web.v1';
const USER = { id: 'reader-1', name: 'Reader', email: 'reader@example.test', emailVerified: true };
const book = (n: number, isbn = '978000000000' + n) => ({ bookKey: 'v1:isbn:' + isbn, isbn13: isbn, title: 'Book ' + n, authors: ['Author'], source: 'direct' as const, viewedAt: `2026-10-0${n}T00:00:00.000Z` });
const guest = (state: { savedBooks?: unknown[]; recentBooks?: unknown[]; selectedLibraryId?: string | null }) =>
  localStorage.setItem(GUEST_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, savedBooks: [], recentBooks: [], savedContent: [], ...state }));

type Account = { books: Array<Record<string, unknown>>; recent: Array<Record<string, unknown>>; library: string | null; shelfRevision: number; fail?: number };
function account(state: Account) {
  const imports: Array<Record<string, unknown>> = [];
  const versions = () => ({ settingsRevision: state.library ? 1 : 0, shelfRevision: state.shelfRevision, historyGeneration: 0, historyEnabled: true });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    if (path.endsWith('/api/account/session')) return json({ status: 'authenticated', user: USER, csrfToken: 'csrf-1' });
    if (path.endsWith('/api/account/state')) return json({ profile: { ...USER, profileRevision: 0 }, selectedLibraryId: state.library, selectedLibrary: state.library ? { id: state.library, name: 'Library ' + state.library } : null, libraryRemoved: false, counts: { saved: state.books.length, recent: 0 }, ...versions() });
    if (path.includes('/api/account/books?')) return json({ books: state.books, nextCursor: null, ...versions() });
    if (path.endsWith('/api/account/history')) return json({ books: state.recent, ...versions() });
    if (path.endsWith('/api/account/imports')) {
      const body = JSON.parse(String(init?.body));
      imports.push(body);
      if (state.fail && state.fail-- > 0) return json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts.' } }, 429);
      const snapshot = body.snapshot as { savedBooks: Array<Record<string, unknown>>; recentBooks: Array<Record<string, unknown>>; selectedLibraryId: string | null };
      state.books = [...state.books, ...snapshot.savedBooks.map((item, index) => ({ ...item, referenceId: 'ref-import-' + index }))];
      state.recent = [...state.recent, ...snapshot.recentBooks.map((item, index) => ({ ...item, referenceId: 'ref-recent-' + index }))];
      if (body.libraryPolicy === 'use-device') state.library = snapshot.selectedLibraryId;
      state.shelfRevision++;
      return json({ status: 'imported', savedAdded: snapshot.savedBooks.length, historyAccepted: snapshot.recentBooks.length, historyExpired: 0, ...versions() });
    }
    if (path.endsWith('/api/account/books') && init?.method === 'PUT') { state.shelfRevision++; return json({ status: 'saved', ...versions() }); }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  }));
  return imports;
}
function mount() {
  let library!: LibraryState;
  function Probe() { library = useLibrary(); return null; }
  const view = render(<AccountSessionProvider><LibraryStateProvider><Probe /></LibraryStateProvider></AccountSessionProvider>);
  return { library: () => library, unmount: view.unmount };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it('sends only the books the account lacks (an ISBN match counts), uses the browser library only when the account has none, and says what was added', async () => {
  const onAccount = { ...book(1), bookKey: 'v1:openlibrary:OL1W', referenceId: 'ref-1', savedAt: '2026-10-01T00:00:00.000Z' };
  guest({ savedBooks: [book(1), book(2), book(3)], recentBooks: [book(4)], selectedLibraryId: 'bc:smcl' });
  const imports = account({ books: [onAccount], recent: [], library: null, shelfRevision: 1 });
  const view = mount();
  await waitFor(() => expect(view.library().mergeResult).toEqual({ savedAdded: 2 }));
  expect(imports).toHaveLength(1);
  expect(imports[0]).toMatchObject({ includeHistory: true, libraryPolicy: 'use-device', shelfRevision: 1 });
  const snapshot = imports[0].snapshot as { savedBooks: Array<{ bookKey: string }>; recentBooks: Array<{ bookKey: string }>; selectedLibraryId: string };
  expect(snapshot.savedBooks.map(item => item.bookKey)).toEqual([book(2).bookKey, book(3).bookKey]);
  expect(snapshot.recentBooks.map(item => item.bookKey)).toEqual([book(4).bookKey]);
  expect(snapshot.selectedLibraryId).toBe('bc:smcl');
  expect(view.library().state.savedBooks).toHaveLength(3);
  expect(view.library().mutationNotice).toBe('Added 2 books from this device to your account');
  expect(view.library().recoveryMode).toBe(false);
  // Everything settled is remembered, the book that was already there too.
  expect(readMerged()).toEqual({ version: 1, saved: [book(1).bookKey, book(2).bookKey, book(3).bookKey], viewed: [book(4).bookKey], libraries: ['bc:smcl'] });
  // The browser keeps its own guest shelf (shown again after logging out).
  expect(JSON.parse(localStorage.getItem(GUEST_KEY)!).savedBooks).toHaveLength(3);
});

it('the account’s library wins; a book removed from the account later is not sent again from this browser', async () => {
  guest({ savedBooks: [book(1), book(2)], selectedLibraryId: 'bc:smcl' });
  const state: Account = { books: [], recent: [], library: 'in:anna', shelfRevision: 0 };
  const imports = account(state);
  const first = mount();
  await waitFor(() => expect(first.library().mergeResult).toEqual({ savedAdded: 2 }));
  expect(imports[0]).toMatchObject({ libraryPolicy: 'keep-account', includeHistory: false });
  expect((imports[0].snapshot as { selectedLibraryId: string | null }).selectedLibraryId).toBeNull();
  first.unmount();
  // Removed on another device.
  state.books = state.books.filter(item => item.bookKey !== book(1).bookKey);
  state.shelfRevision++;
  const second = mount();
  await waitFor(() => expect(second.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(imports).toHaveLength(1);
  expect(second.library().state.savedBooks.map(item => item.bookKey)).toEqual([book(2).bookKey]);
});

it('a failed merge never holds the shelf and is tried again at the next load', async () => {
  guest({ savedBooks: [book(1)] });
  const state: Account = { books: [], recent: [], library: null, shelfRevision: 0, fail: 1 };
  const imports = account(state);
  const first = mount();
  await waitFor(() => expect(first.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(imports).toHaveLength(1);
  expect(first.library().recoveryMode).toBe(false);
  expect(first.library().retryMutation).toBeUndefined();
  expect(first.library().mutationNotice ?? null).toBeNull();
  expect(localStorage.getItem(MERGED_KEY)).toBeNull();
  // The shelf still takes changes.
  let saved: string | undefined;
  await act(async () => { saved = await first.library().saveBook({ bookKey: 'v1:isbn:9780262033848', title: 'New', authors: [] } as never); });
  expect(saved).toBe('saved');
  first.unmount();
  const second = mount();
  await waitFor(() => expect(second.library().mergeResult).toEqual({ savedAdded: 1 }));
  expect(imports).toHaveLength(2);
});

it('plans nothing when the browser holds nothing new, and nothing from an unreadable shelf', () => {
  const snapshot = { summary: { selectedLibraryId: null }, books: [], recent: [] } as unknown as ReadingSnapshot;
  const empty = { version: 2 as const, selectedLibraryId: null, savedBooks: [], recentBooks: [], savedContent: [] };
  expect(planGuestMerge(snapshot, { status: 'ok', state: empty })).toBeNull();
  expect(planGuestMerge(snapshot, { status: 'corrupt', state: { ...empty, savedBooks: [book(1)] } })).toBeNull();
  expect(planGuestMerge(snapshot, { status: 'ok', state: { ...empty, savedBooks: [book(1)] } }, { version: 1, saved: [book(1).bookKey], viewed: [], libraries: [] })).toBeNull();
});
