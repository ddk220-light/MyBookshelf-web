import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { AccountSessionProvider } from '../auth/AccountSessionProvider';
import { LibraryStateProvider, useLibrary, type LibraryState } from '../context';
import { accountCode, markSignIn, MERGED_KEY, mergeRetryAt, planGuestMerge, readMerged, SIGN_IN_MARK_KEY, signInMarkMatches } from './guestMerge';
import type { ReadingSnapshot } from './AccountRepository';

// Plan B5: the automatic merge at sign-in. The browser's books the account
// lacks go over quietly; what was sent is remembered for that account so a
// book removed from it later is not added again; a failure never holds the
// shelf and waits longer each time; an account this browser did not ask to
// sign in to is asked first.

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const GUEST_KEY = 'mybookshelf.anonymous-web.v1';
type User = { id: string; name: string; email: string; emailVerified: boolean };
const USER: User = { id: 'reader-1', name: 'Reader', email: 'reader@example.test', emailVerified: true };
const OTHER: User = { id: 'reader-2', name: 'Reader', email: 'other@example.test', emailVerified: true };
const book = (n: number, isbn = '978000000000' + n) => ({ bookKey: 'v1:isbn:' + isbn, isbn13: isbn, title: 'Book ' + n, authors: ['Author'], source: 'direct' as const, viewedAt: `2026-10-0${n}T00:00:00.000Z` });
const guest = (state: { savedBooks?: unknown[]; recentBooks?: unknown[]; selectedLibraryId?: string | null }) =>
  localStorage.setItem(GUEST_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, savedBooks: [], recentBooks: [], savedContent: [], ...state }));

type Account = {
  books: Array<Record<string, unknown>>; recent: Array<Record<string, unknown>>; library: string | null; shelfRevision: number;
  user?: User; fail?: number; failState?: boolean;
  /** Answers an import before it is applied (a refusal), or undefined to apply it. */
  refuse?: (body: Record<string, unknown>) => Response | undefined;
  /** Holds each import until the test lets it go. */
  hold?: Promise<void>;
};
function account(state: Account) {
  const imports: Array<Record<string, unknown>> = [], views: Array<Record<string, unknown>> = [], saves: Array<Record<string, unknown>> = [];
  const versions = () => ({ settingsRevision: state.library ? 1 : 0, shelfRevision: state.shelfRevision, historyGeneration: 0, historyEnabled: true });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input), user = state.user ?? USER;
    if (path.endsWith('/api/account/session')) return json({ status: 'authenticated', user, csrfToken: 'csrf-1' });
    if (path.endsWith('/api/account/state')) {
      if (state.failState) return json({ error: { code: 'ACCOUNT_UNAVAILABLE', message: 'Accounts are temporarily unavailable.' } }, 503);
      return json({ profile: { ...user, profileRevision: 0 }, selectedLibraryId: state.library, selectedLibrary: state.library ? { id: state.library, name: 'Library ' + state.library } : null, libraryRemoved: false, counts: { saved: state.books.length, recent: 0 }, ...versions() });
    }
    if (path.includes('/api/account/books?')) return json({ books: state.books, nextCursor: null, ...versions() });
    if (path.endsWith('/api/account/history')) return json({ books: state.recent, ...versions() });
    if (path.endsWith('/api/account/history/views')) { views.push(JSON.parse(String(init?.body))); return json({ status: 'recorded', ...versions() }); }
    if (path.endsWith('/api/account/imports')) {
      const body = JSON.parse(String(init?.body));
      imports.push(body);
      if (state.hold) await state.hold;
      if (state.fail && state.fail-- > 0) return json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts.' } }, 429);
      const refused = state.refuse?.(body);
      if (refused) return refused;
      if (body.shelfRevision !== state.shelfRevision) return json({ error: { code: 'VERSION_CONFLICT', message: 'Your account changed on another device. Refresh and try again.' } }, 409);
      const snapshot = body.snapshot as { savedBooks: Array<Record<string, unknown>>; recentBooks: Array<Record<string, unknown>>; selectedLibraryId: string | null };
      state.books = [...state.books, ...snapshot.savedBooks.map((item, index) => ({ ...item, referenceId: 'ref-import-' + imports.length + '-' + index }))];
      state.recent = [...state.recent, ...snapshot.recentBooks.map((item, index) => ({ ...item, referenceId: 'ref-recent-' + index }))];
      if (body.libraryPolicy === 'use-device') state.library = snapshot.selectedLibraryId;
      state.shelfRevision++;
      return json({ status: 'imported', savedAdded: snapshot.savedBooks.length, historyAccepted: snapshot.recentBooks.length, historyExpired: 0, ...versions() });
    }
    if (path.endsWith('/api/account/books') && init?.method === 'PUT') { saves.push(JSON.parse(String(init.body))); state.shelfRevision++; return json({ status: 'saved', ...versions() }); }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  }));
  return Object.assign(imports, { views, saves });
}
function mount() {
  let library!: LibraryState;
  function Probe() { library = useLibrary(); return null; }
  const view = render(<AccountSessionProvider><LibraryStateProvider><Probe /></LibraryStateProvider></AccountSessionProvider>);
  return { library: () => library, unmount: view.unmount };
}
// The Web Locks API, as browsers have it: one holder at a time, in order.
function stubLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
    locks: { request: (_name: string, _options: unknown, work: () => unknown) => { const run = tail.then(() => work()); tail = run.catch(() => {}); return run; } },
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it('sends only the books the account lacks (an ISBN match counts), uses the browser library only when the account has none, and says what was added', async () => {
  const onAccount = { ...book(1), bookKey: 'v1:openlibrary:OL1W', referenceId: 'ref-1', savedAt: '2026-10-01T00:00:00.000Z' };
  guest({ savedBooks: [book(1), book(2), book(3)], recentBooks: [book(4)], selectedLibraryId: 'bc:smcl' });
  markSignIn(' Reader@Example.test ');
  const imports = account({ books: [onAccount], recent: [], library: null, shelfRevision: 1 });
  const view = mount();
  await waitFor(() => expect(view.library().mergeResult).toEqual({ savedAdded: 2 }));
  expect(imports).toHaveLength(1);
  expect(imports[0]).toMatchObject({ includeHistory: true, libraryPolicy: 'use-device', shelfRevision: 1 });
  const snapshot = imports[0].snapshot as { savedBooks: Array<{ bookKey: string }>; recentBooks: Array<{ bookKey: string }>; selectedLibraryId: string };
  expect(snapshot.savedBooks.map(item => item.bookKey)).toEqual([book(2).bookKey, book(3).bookKey]);
  expect(snapshot.recentBooks.map(item => item.bookKey)).toEqual([book(4).bookKey]);
  expect(snapshot.selectedLibraryId).toBe('bc:smcl');
  await waitFor(() => expect(view.library().state.savedBooks).toHaveLength(3));
  expect(view.library().mutationNotice).toBe('Added 2 books from this device to your account');
  expect(view.library().recoveryMode).toBe(false);
  expect(view.library().mergeOffer ?? null).toBeNull();
  // Everything settled is remembered for this account, the book that was already there too.
  const account1 = accountCode(USER.id);
  expect(readMerged(account1)).toEqual({ version: 2, account: account1, consent: 'yes', saved: [book(1).bookKey, book(2).bookKey, book(3).bookKey], viewed: [book(4).bookKey], libraries: ['bc:smcl'] });
  // Only opaque codes: no address, no plain account ID, no search text.
  const stored = localStorage.getItem(MERGED_KEY)!;
  expect(stored).not.toContain(USER.id);
  expect(stored).not.toContain(USER.email);
  // The mark was used.
  expect(localStorage.getItem(SIGN_IN_MARK_KEY)).toBeNull();
  // The browser keeps its own guest shelf (shown again after logging out).
  expect(JSON.parse(localStorage.getItem(GUEST_KEY)!).savedBooks).toHaveLength(3);
});

it('the account’s library wins; a book removed from the account later is not sent again from this browser', async () => {
  guest({ savedBooks: [book(1), book(2)], selectedLibraryId: 'bc:smcl' });
  markSignIn(USER.email);
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

it('the merged record belongs to one account: another account on this browser still gets the browser’s books', async () => {
  guest({ savedBooks: [book(1), book(2)] });
  markSignIn(USER.email);
  const state: Account = { books: [], recent: [], library: null, shelfRevision: 0 };
  const imports = account(state);
  const first = mount();
  await waitFor(() => expect(first.library().mergeResult).toEqual({ savedAdded: 2 }));
  first.unmount();
  // A second account (or a new one after the first was deleted elsewhere).
  markSignIn(OTHER.email);
  Object.assign(state, { user: OTHER, books: [], shelfRevision: 0 });
  const second = mount();
  await waitFor(() => expect(second.library().mergeResult).toEqual({ savedAdded: 2 }));
  expect(imports).toHaveLength(2);
  expect(readMerged(accountCode(OTHER.id)).saved).toEqual([book(1).bookKey, book(2).bookKey]);
  // Reading as the first account again starts afresh too (one record per browser).
  expect(readMerged(accountCode(USER.id)).saved).toEqual([]);
});

it('an account this browser did not ask for (a link someone else sent) is asked first; nothing is sent, and “Not now” is remembered', async () => {
  guest({ savedBooks: [book(1), book(2)], recentBooks: [book(3)] });
  markSignIn(USER.email); // This browser asked for its own account…
  const state: Account = { user: OTHER, books: [], recent: [], library: null, shelfRevision: 0 };
  const imports = account(state); // …and someone else's link signed it in.
  const first = mount();
  await waitFor(() => expect(first.library().mergeOffer).toEqual({ count: 2, email: OTHER.email }));
  expect(first.library().mergeResult).toEqual({ savedAdded: 0 });
  expect(imports).toHaveLength(0);
  await act(async () => { await first.library().answerMerge?.(false); });
  expect(first.library().mergeOffer ?? null).toBeNull();
  expect(imports).toHaveLength(0);
  expect(readMerged(accountCode(OTHER.id)).consent).toBe('not-now');
  first.unmount();
  const second = mount();
  await waitFor(() => expect(second.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(second.library().mergeOffer ?? null).toBeNull();
  expect(imports).toHaveLength(0);
  // Its own account's mark is still there for when it signs in.
  expect(signInMarkMatches(USER.email)).toBe(true);
});

it('“Add them” sends the books to the account the reader named', async () => {
  guest({ savedBooks: [book(1)] });
  const imports = account({ user: OTHER, books: [], recent: [], library: null, shelfRevision: 0 });
  const view = mount();
  await waitFor(() => expect(view.library().mergeOffer).toEqual({ count: 1, email: OTHER.email }));
  await act(async () => { await view.library().answerMerge?.(true); });
  await waitFor(() => expect(view.library().mergeResult).toEqual({ savedAdded: 1 }));
  expect(imports).toHaveLength(1);
  expect(view.library().mergeOffer ?? null).toBeNull();
  expect(readMerged(accountCode(OTHER.id)).consent).toBe('yes');
});

it('a mark from another address, or an old one, does not count', () => {
  markSignIn('reader@example.test', 1_000);
  expect(signInMarkMatches('READER@example.test', 2_000)).toBe(true);
  expect(signInMarkMatches('other@example.test', 2_000)).toBe(false);
  expect(signInMarkMatches('reader@example.test', 1_000 + 26 * 3600_000)).toBe(false);
  expect(localStorage.getItem(SIGN_IN_MARK_KEY)).not.toContain('reader');
});

it('a failed merge never holds the shelf, then waits before it is tried again (checked at the next load, no timers)', async () => {
  guest({ savedBooks: [book(1)] });
  markSignIn(USER.email);
  const state: Account = { books: [], recent: [], library: null, shelfRevision: 0, fail: 1 };
  const imports = account(state);
  const first = mount();
  await waitFor(() => expect(first.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(imports).toHaveLength(1);
  expect(first.library().recoveryMode).toBe(false);
  expect(first.library().retryMutation).toBeUndefined();
  expect(first.library().mutationNotice ?? null).toBeNull();
  const record = readMerged(accountCode(USER.id));
  expect(record.saved).toEqual([]);
  expect(record.failures).toBe(1);
  expect(mergeRetryAt(record) - record.failedAt!).toBe(5 * 60_000);
  // The shelf still takes changes.
  let saved: string | undefined;
  await act(async () => { saved = await first.library().saveBook({ bookKey: 'v1:isbn:9780262033848', title: 'New', authors: [] } as never); });
  expect(saved).toBe('saved');
  first.unmount();
  // Reloading at once does not spend another import.
  const second = mount();
  await waitFor(() => expect(second.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(imports).toHaveLength(1);
  second.unmount();
  // Later, the next load tries again.
  localStorage.setItem(MERGED_KEY, JSON.stringify({ ...record, failedAt: Date.now() - 6 * 60_000 }));
  const third = mount();
  await waitFor(() => expect(third.library().mergeResult).toEqual({ savedAdded: 1 }));
  expect(imports).toHaveLength(2);
  expect(readMerged(accountCode(USER.id)).failedAt).toBeUndefined();
});

it('a refused library is left out once, then only the refused books; the rest still go and nothing is retried later', async () => {
  guest({ savedBooks: [book(1), book(2), book(3)], selectedLibraryId: 'zz:gone' });
  markSignIn(USER.email);
  const refuse = (body: Record<string, unknown>) => {
    const snapshot = body.snapshot as { savedBooks: Array<{ bookKey: string }> };
    if (body.libraryPolicy === 'use-device') return json({ error: { code: 'INVALID_INPUT', message: 'Choose a library currently listed in the directory.', rejected: { library: true } } }, 422);
    const bad = snapshot.savedBooks.findIndex(item => item.bookKey === book(2).bookKey);
    if (bad >= 0) return json({ error: { code: 'INVALID_INPUT', message: 'A device book has invalid details.', rejected: { savedBooks: [bad], recentBooks: [] } } }, 422);
    return undefined;
  };
  const imports = account({ books: [], recent: [], library: null, shelfRevision: 0, refuse });
  const view = mount();
  await waitFor(() => expect(view.library().mergeResult).toEqual({ savedAdded: 2 }));
  expect(imports).toHaveLength(3);
  expect(imports.map(body => body.libraryPolicy)).toEqual(['use-device', 'keep-account', 'keep-account']);
  expect((imports[2].snapshot as { savedBooks: Array<{ bookKey: string }> }).savedBooks.map(item => item.bookKey)).toEqual([book(1).bookKey, book(3).bookKey]);
  const record = readMerged(accountCode(USER.id));
  expect(record.saved).toEqual([book(1).bookKey, book(2).bookKey, book(3).bookKey]);
  expect(record.libraries).toEqual(['zz:gone']);
  view.unmount();
  const again = mount();
  await waitFor(() => expect(again.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(imports).toHaveLength(3);
});

it('several tabs merge one at a time: only one of them sends the books', async () => {
  stubLocks();
  guest({ savedBooks: [book(1), book(2)] });
  markSignIn(USER.email);
  const imports = account({ books: [], recent: [], library: null, shelfRevision: 0 });
  const tabs = [mount(), mount(), mount()];
  await waitFor(() => tabs.forEach(tab => expect(tab.library().mergeResult).toBeDefined()));
  expect(imports).toHaveLength(1);
  expect(tabs.map(tab => tab.library().mergeResult?.savedAdded).sort()).toEqual([0, 0, 2]);
});

it('while the merge runs, a book opened is still recorded in Viewed before and a save does not wait for it', async () => {
  guest({ savedBooks: [book(1)] });
  markSignIn(USER.email);
  let release!: () => void;
  const state: Account = { books: [], recent: [], library: null, shelfRevision: 0, hold: new Promise<void>(resolve => { release = resolve; }) };
  const imports = account(state);
  const view = mount();
  await waitFor(() => expect(imports).toHaveLength(1));
  expect(view.library().mergeResult).toBeUndefined();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  let remembered: boolean | undefined, saved: string | undefined;
  await act(async () => { remembered = await view.library().rememberBook({ bookKey: 'v1:isbn:9780262033848', title: 'Opened', authors: [] } as never, 'direct'); });
  expect(remembered).toBe(true);
  expect(imports.views).toHaveLength(1);
  await act(async () => { saved = await view.library().saveBook({ bookKey: 'v1:isbn:9780131103627', title: 'Saved', authors: [] } as never); });
  expect(saved).toBe('saved');
  expect(view.library().mergeResult).toBeUndefined();
  // The merge meets the newer shelf, plans again and still finishes.
  state.hold = undefined;
  release();
  await waitFor(() => expect(view.library().mergeResult).toEqual({ savedAdded: 1 }));
  expect(imports).toHaveLength(2);
  expect(imports[1].shelfRevision).toBe(1);
});

it('Welcome stops “Bringing over the books…” when the account cannot be loaded', async () => {
  guest({ savedBooks: [book(1)] });
  markSignIn(USER.email);
  const imports = account({ books: [], recent: [], library: null, shelfRevision: 0, failState: true });
  const view = mount();
  await waitFor(() => expect(view.library().mergeResult).toEqual({ savedAdded: 0 }));
  expect(imports).toHaveLength(0);
});

it('plans nothing when the browser holds nothing new, and nothing from an unreadable shelf', () => {
  const snapshot = { summary: { selectedLibraryId: null }, books: [], recent: [] } as unknown as ReadingSnapshot;
  const empty = { version: 2 as const, selectedLibraryId: null, savedBooks: [], recentBooks: [], savedContent: [] };
  const none = { saved: [], viewed: [], libraries: [] };
  expect(planGuestMerge(snapshot, { status: 'ok', state: empty }, none)).toBeNull();
  expect(planGuestMerge(snapshot, { status: 'corrupt', state: { ...empty, savedBooks: [book(1)] } }, none)).toBeNull();
  expect(planGuestMerge(snapshot, { status: 'ok', state: { ...empty, savedBooks: [book(1)] } }, { saved: [book(1).bookKey], viewed: [], libraries: [] })).toBeNull();
});
