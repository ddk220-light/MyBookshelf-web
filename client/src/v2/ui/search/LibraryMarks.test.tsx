import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { clearSearchMemory } from '../../searchMemory';
import type { PublicBook } from '../../types';
import { entryMarkKeys, forgetLibraryMarks, markBookKeys } from './useLibraryMarks';
import type { ResultEntry } from './searchResults';

const LIBRARY = { id: 'koha:anna', name: 'Anna Centenary Library', city: 'Chennai', region: null, country: 'IN', health: 'operational',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const UNREADABLE = { ...LIBRARY, id: 'directory:plain', name: 'Plain Library', capabilities: { ...LIBRARY.capabilities, publicAvailability: false } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const result = (index: number, title: string, author: string, extra: Partial<PublicBook> = {}) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title, authors: [author], ...extra });
const PUBLIC = [result(1, 'Wings of Fire', 'A. P. J. Abdul Kalam'), result(10, 'The Dragonet Prophecy', 'Tui T. Sutherland'), result(11, 'Wings of Fire', 'Dale Brown')];

/** A stream the test writes NDJSON lines into, then ends or breaks. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } }),
    line: (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n')),
    raw: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => { try { controller.close(); } catch { /* already closed */ } },
    fail: () => { try { controller.error(new TypeError('network')); } catch { /* closed */ } },
  };
}

type Marks = { body: { libraryId: string; query: string; books: Array<{ bookKey: string }> }; signal?: AbortSignal | null; stream: ReturnType<typeof controlledStream> };
function stubApi({ library = LIBRARY, marksStatus = 200, check = 'found' }: { library?: typeof LIBRARY; marksStatus?: number; check?: string } = {}) {
  const marks: Marks[] = [];
  const checks: unknown[] = [];
  const searches: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: false, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library }));
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: {} }));
    if (path.endsWith('/books/search')) { searches.push(body); return Promise.resolve(json({ kind: 'candidates', candidates: PUBLIC })); }
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: PUBLIC.find(item => item.bookKey === body.bookKey) }));
    if (path.endsWith('/holdings/check')) { checks.push(body); return Promise.resolve(json({ answer: check })); }
    if (path.endsWith('/holdings/search')) {
      if (marksStatus !== 200) return Promise.resolve(json({ error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } }, marksStatus));
      const stream = controlledStream();
      marks.push({ body, signal: init?.signal, stream });
      init?.signal?.addEventListener('abort', () => stream.fail());
      return Promise.resolve(stream.response);
    }
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return { marks, checks, searches };
}
function seed(libraryId: string | null = LIBRARY.id) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: [], savedContent: [] }));
}
let navigateRef: ReturnType<typeof useNavigate> | null = null;
function Location() {
  const location = useLocation();
  navigateRef = useNavigate();
  return <output data-testid="location">{location.pathname + '|' + JSON.stringify(location.state)}</output>;
}
const renderHome = () => render(<MemoryRouter initialEntries={['/app/shelf']}><AnonymousWebApp /><Location /></MemoryRouter>);
const searchFor = async (text: string) => {
  const input = await screen.findByRole('searchbox', { name: 'Search for a book' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
};
const status = () => screen.getByText((_, element) => element?.getAttribute('role') === 'status' && element.getAttribute('aria-live') === 'polite');
const line = () => document.querySelector('.results-library');
const badges = () => [...document.querySelectorAll('.search-results .cover-badge-library')].map(badge => badge.closest('a')!.getAttribute('aria-label'));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); forgetLibraryMarks(); clearSearchMemory(); });

describe('background check for search results', () => {
  it('asks the chosen library once, says "Looking in…", adds badges as marks arrive, then "In <library>"', async () => {
    const { marks, searches } = stubApi();
    seed();
    renderHome();
    await screen.findByText('Anna Centenary Library');
    await searchFor('  wings   of fire ');
    await screen.findByRole('region', { name: 'Search results' });
    await waitFor(() => expect(marks).toHaveLength(1));
    // The search itself stays public; the check carries the typed text and the result keys.
    expect(searches[0]).not.toHaveProperty('libraryId');
    expect(marks[0].body).toEqual({ libraryId: LIBRARY.id, query: 'wings of fire', books: PUBLIC.map(book => ({ bookKey: book.bookKey })) });
    await waitFor(() => expect(line()).toHaveTextContent('Looking in Anna Centenary Library…'));
    expect(line()).toHaveAttribute('aria-hidden', 'true');
    expect(status()).toHaveTextContent('3 books. Looking in Anna Centenary Library');
    expect(badges()).toEqual([]);

    marks[0].stream.line({ type: 'mark', bookKey: PUBLIC[2].bookKey, answer: 'found' });
    await waitFor(() => expect(badges()).toEqual(['Wings of Fire by Dale Brown, in Anna Centenary Library']));
    // Only "found" marks, and only for books that were asked about.
    marks[0].stream.line({ type: 'mark', bookKey: PUBLIC[0].bookKey, answer: 'not_found' });
    marks[0].stream.line({ type: 'mark', bookKey: 'v1:openlibrary:OL99W', answer: 'found' });
    marks[0].stream.line({ type: 'done', unchecked: [PUBLIC[0].bookKey, PUBLIC[1].bookKey] });
    marks[0].stream.end();
    await waitFor(() => expect(line()).toHaveTextContent('In Anna Centenary Library'));
    expect(line()).not.toHaveTextContent('Looking');
    expect(badges()).toHaveLength(1);
    expect(status()).toHaveTextContent('3 books. 1 book in Anna Centenary Library');
    // Nothing reads as "not in the library".
    expect(document.body.textContent).not.toMatch(/not (found|in)/i);
    // The text is nowhere in browser storage, the URL or history state.
    for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1)
      expect(store.getItem(store.key(index)!)).not.toContain('wings');
    expect(screen.getByTestId('location').textContent).not.toContain('wings');

    // List view shows the same badge.
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    const results = screen.getByRole('region', { name: 'Search results' });
    expect(within(results).getByRole('link', { name: 'Wings of Fire by Dale Brown, in Anna Centenary Library' }).querySelector('.cover-badge-library')).not.toBeNull();
    expect(results.querySelectorAll('.cover-badge-library')).toHaveLength(1);
  });

  it('opening a book stops the check; the book shows the mark at once; Back keeps the marks and does not ask again', async () => {
    const { marks, checks } = stubApi({ check: 'unknown' });
    seed();
    renderHome();
    await screen.findByText('Anna Centenary Library');
    await searchFor('wings of fire');
    await waitFor(() => expect(marks).toHaveLength(1));
    marks[0].stream.line({ type: 'mark', bookKey: PUBLIC[1].bookKey, answer: 'found' });
    const results = await screen.findByRole('region', { name: 'Search results' });
    const marked = await within(results).findByRole('link', { name: 'The Dragonet Prophecy by Tui T. Sutherland, in Anna Centenary Library' });
    fireEvent.click(marked);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/'));
    expect(marks[0].signal?.aborted).toBe(true);
    // Only the opened book is checked; a failed check does not take the mark away.
    await waitFor(() => expect(checks).toEqual([{ libraryId: LIBRARY.id, bookKey: PUBLIC[1].bookKey }]));
    expect(await screen.findByRole('group', { name: 'Found in Anna Centenary Library' })).toBeInTheDocument();

    navigateRef!(-1);
    const again = await screen.findByRole('region', { name: 'Search results' });
    expect(within(again).getByRole('link', { name: 'The Dragonet Prophecy by Tui T. Sutherland, in Anna Centenary Library' })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(marks).toHaveLength(1);
    expect(line()).toHaveTextContent('In Anna Centenary Library');
    // Coming back, the badge is simply there (no pop).
    expect(again.querySelector('.cover-badge-pop')).toBeNull();
  });

  it('a new search, clearing and changing library each stop the running check', async () => {
    const { marks } = stubApi();
    seed();
    renderHome();
    await screen.findByText('Anna Centenary Library');
    await searchFor('wings of fire');
    await waitFor(() => expect(marks).toHaveLength(1));
    await searchFor('dragonet');
    await waitFor(() => expect(marks).toHaveLength(2));
    expect(marks[0].signal?.aborted).toBe(true);
    expect(marks[1].body.query).toBe('dragonet');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and go back to my shelf' }));
    expect(await screen.findByRole('heading', { name: /Ready to search|My shelf/ })).toBeInTheDocument();
    expect(marks[1].signal?.aborted).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(marks).toHaveLength(2);
  });

  it('any failure ends quietly: the line goes, badges already shown stay, nothing says "not found"', async () => {
    const { marks } = stubApi();
    seed();
    renderHome();
    await screen.findByText('Anna Centenary Library');
    await searchFor('wings of fire');
    await waitFor(() => expect(marks).toHaveLength(1));
    marks[0].stream.line({ type: 'mark', bookKey: PUBLIC[0].bookKey, answer: 'found' });
    await waitFor(() => expect(badges()).toHaveLength(1));
    marks[0].stream.raw('{"type":"mark","bookKey":');
    marks[0].stream.end();
    await waitFor(() => expect(line()).not.toHaveTextContent('Looking'));
    expect(badges()).toEqual(['Wings of Fire by A. P. J. Abdul Kalam, in Anna Centenary Library']);
    expect(document.body.textContent).not.toMatch(/not (found|in)|couldn/i);
  });

  it('an HTTP error leaves no line and no badges', async () => {
    const { marks } = stubApi({ marksStatus: 503 });
    seed();
    renderHome();
    await screen.findByText('Anna Centenary Library');
    await searchFor('wings of fire');
    await screen.findByRole('region', { name: 'Search results' });
    await waitFor(() => expect(status()).toHaveTextContent(/^3 books$/));
    expect(line()?.textContent || '').toBe('');
    expect(badges()).toEqual([]);
    expect(marks).toHaveLength(0);
  });

  it('no library chosen, or one whose catalog cannot be read: no request and no line', async () => {
    for (const [libraryId, library] of [[null, LIBRARY], [UNREADABLE.id, UNREADABLE]] as const) {
      const { marks } = stubApi({ library });
      seed(libraryId);
      renderHome();
      if (libraryId) await screen.findByText(library.name);
      await searchFor('wings of fire');
      await screen.findByRole('region', { name: 'Search results' });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(marks).toHaveLength(0);
      expect(line()).toBeNull();
      expect(status()).toHaveTextContent(/^3 books$/);
      cleanup(); vi.unstubAllGlobals(); localStorage.clear(); forgetLibraryMarks(); clearSearchMemory();
    }
  });
});

describe('which records a card stands for', () => {
  const entry = (book: PublicBook, alternatives: PublicBook[] = []): ResultEntry => ({ key: book.bookKey, kind: 'book', title: book.title, authors: book.authors,
    href: '', state: { book }, addedAt: 0, alternatives, mine: false });
  it('a card takes marks from records of the same work only', () => {
    const main = { bookKey: 'v1:isbn:9780000000001', title: 'Wings', authors: ['A'], workId: 'OL1W' };
    const sameWork = { bookKey: 'v1:isbn:9780000000002', title: 'Wings', authors: ['A'], workId: 'OL1W' };
    const otherWork = { bookKey: 'v1:openlibrary:OL2W', title: 'Wings', authors: ['A'] };
    const noWork = { bookKey: 'v1:googlebooks:x', title: 'Wings', authors: ['A'] };
    expect(entryMarkKeys(entry(main, [main, sameWork, otherWork, noWork]))).toEqual([main.bookKey, sameWork.bookKey]);
    // Without a work ID of its own, a card is marked by its own record only.
    expect(entryMarkKeys(entry(noWork, [noWork, sameWork]))).toEqual([noWork.bookKey]);
  });
  it('sends every card first, then other records of the same work, twelve at most', () => {
    const cards = Array.from({ length: 9 }, (_, index) => entry({ bookKey: 'v1:openlibrary:OL' + (index + 1) + 'W', title: 'T' + index, authors: ['A'] },
      Array.from({ length: 3 }, (_, n) => ({ bookKey: 'v1:isbn:97800000' + String(index * 10 + n).padStart(5, '0'), title: 'T' + index, authors: ['A'], workId: 'OL' + (index + 1) + 'W' }))));
    const keys = markBookKeys(cards);
    expect(keys).toHaveLength(12);
    expect(keys.slice(0, 9)).toEqual(cards.map(card => card.key));
    expect(keys.slice(9)).toEqual(cards[0].alternatives!.map(book => book.bookKey));
  });
});
