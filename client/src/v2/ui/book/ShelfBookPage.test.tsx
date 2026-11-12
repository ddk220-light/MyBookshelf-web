import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY, SAVED_BOOKS_CAP } from '../../localState';
import { firstPublishedYear, openLibraryUrl, publishedLine } from './ShelfBookPage';
import { CHECK_TIMEOUT_MS } from './useLibraryAnswer';

const LIBRARY = { id: 'koha:anna', name: 'Anna Centenary Library', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', health: 'operational', catalogUrl: 'https://catalog.example.test/',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const OTHER = { ...LIBRARY, id: 'koha:other', name: 'Kalaignar Centenary Library', city: 'Madurai', catalogUrl: 'https://other.example.test/' };
const BOOK = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', workId: 'OL1037811W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'],
  publishedDate: '1999', description: 'Kalam’s own account of his life.' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
type Check = (body: { libraryId: string; bookKey: string }, signal?: AbortSignal | null) => Promise<Response>;

function stubApi({ check = (() => Promise.resolve(json({ answer: 'found' }))) as Check, book = BOOK as Record<string, unknown>, others = [] as Array<Record<string, unknown>>, libraries = [LIBRARY, OTHER] } = {}) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) { const found = libraries.find(item => item.id === body.libraryId); return Promise.resolve(found ? json({ library: found }) : json({ error: { code: 'LIBRARY_NOT_FOUND' } }, 404)); }
    if (path.endsWith('/libraries/discover')) return Promise.resolve(json({ libraries, total: libraries.length, nextOffset: null }));
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: others.find(item => item.bookKey === body.bookKey) || book }));
    if (path.endsWith('/holdings/check')) return check(body, init?.signal);
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: {} }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return calls;
}
function seed({ saved = [] as unknown[], libraryId = null as string | null } = {}) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: saved, savedContent: [] }));
}
let navigateRef: ((delta: number) => void) | null = null;
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + '|' + JSON.stringify(location.state)}</output>; }
const renderBook = (key = BOOK.bookKey) => render(<MemoryRouter initialEntries={['/app/books/' + encodeURIComponent(key)]}><AnonymousWebApp oneShelf /><Location /></MemoryRouter>);
const card = () => document.querySelector<HTMLElement>('.library-answer');
const stored = () => JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear(); sessionStorage.clear(); navigateRef = null; });

describe('one-shelf book page', () => {
  it('shows the book, Add to my shelf and "Is it in your library?" before a library is chosen', async () => {
    const calls = stubApi();
    renderBook();
    expect(await screen.findByRole('heading', { level: 1, name: 'Wings of Fire' })).toBeInTheDocument();
    expect(screen.getByText('A. P. J. Abdul Kalam', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('Published 1999')).toBeInTheDocument();
    expect(screen.getByText('ISBN 9788173711466')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to my shelf' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Is it in your library?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find my library' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'About this book' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reviews on Goodreads/ })).toHaveAttribute('href', 'https://www.goodreads.com/search?q=9788173711466');
    expect(screen.getByRole('link', { name: /All editions on Open Library/ })).toHaveAttribute('href', 'https://openlibrary.org/works/OL1037811W');
    // No share, edition settings, details table or bookmark icon; no catalog request without a library.
    expect(screen.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Edition settings/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Details' })).not.toBeInTheDocument();
    expect(calls.some(call => call.path.endsWith('/holdings/check') || call.path.endsWith('/availability'))).toBe(false);
  });

  for (const [answer, label, tone] of [
    ['found', 'Found in Anna Centenary Library', 'found'],
    ['not_found', 'Not found in Anna Centenary Library', 'not-found'],
    ['unconfirmed', 'Couldn’t confirm in Anna Centenary Library', 'grey'],
    ['unknown', 'Couldn’t check Anna Centenary Library', 'grey'],
  ] as const) it(`shows "${answer}" as one row with an accessible label`, async () => {
    const calls = stubApi({ check: () => Promise.resolve(json({ answer, catalogUrl: 'https://catalog.example.test/record/1' })) });
    seed({ libraryId: LIBRARY.id });
    renderBook();
    const group = await screen.findByRole('group', { name: label });
    expect(group).toHaveClass('library-answer-' + tone);
    expect(within(group).getByText('Anna Centenary Library')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: /^Catalog/ })).toHaveAttribute('href', 'https://catalog.example.test/record/1');
    // Only the answer: no copies, due dates, floors or shelf numbers.
    expect(group.textContent).toBe('Anna Centenary LibraryCatalog');
    expect(Boolean(within(group).queryByRole('button', { name: 'Try again' }))).toBe(answer === 'unknown');
    expect(calls.filter(call => call.path.endsWith('/holdings/check')).map(call => call.body)).toEqual([{ libraryId: LIBRARY.id, bookKey: BOOK.bookKey }]);
    expect(screen.getByText(label, { selector: '[role="status"]' })).toBeInTheDocument();
  });

  it('shows Checking while the library looks, then the answer', async () => {
    let answer!: (response: Response) => void;
    stubApi({ check: () => new Promise(resolve => { answer = resolve; }) });
    seed({ libraryId: LIBRARY.id });
    renderBook();
    const checking = await screen.findByRole('group', { name: 'Checking Anna Centenary Library' });
    expect(checking).toHaveAttribute('aria-busy', 'true');
    expect(checking).toHaveClass('library-answer-grey');
    expect(within(checking).getByRole('link', { name: /^Catalog/ })).toHaveAttribute('href', LIBRARY.catalogUrl);
    answer(json({ answer: 'found' }));
    expect(await screen.findByRole('group', { name: 'Found in Anna Centenary Library' })).toBeInTheDocument();
  });

  it('a failed, refused, unreadable or unrecognised check is grey "couldn’t check", never white', async () => {
    const replies: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.resolve(json({ error: { code: 'CATALOG_TIMEOUT' } }, 503)),
      () => Promise.resolve(json({ error: { code: 'RATE_LIMITED' } }, 429)),
      () => Promise.resolve(new Response('not json', { status: 200 })),
      () => Promise.resolve(json({ answer: 'not-found' })),
      () => Promise.resolve(json({ answer: 'checking' })),
    ];
    for (const reply of replies) {
      stubApi({ check: reply });
      seed({ libraryId: LIBRARY.id });
      renderBook();
      const group = await screen.findByRole('group', { name: 'Couldn’t check Anna Centenary Library' });
      expect(group).toHaveClass('library-answer-grey');
      expect(document.querySelector('.library-answer-not-found')).toBeNull();
      cleanup(); vi.unstubAllGlobals(); localStorage.clear();
    }
  });

  it('a check that runs too long becomes "couldn’t check", and Try again asks once more', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let attempts = 0;
    stubApi({ check: (_body, signal) => {
      attempts += 1;
      if (attempts > 1) return Promise.resolve(json({ answer: 'found' }));
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    } });
    seed({ libraryId: LIBRARY.id });
    renderBook();
    await screen.findByRole('group', { name: 'Checking Anna Centenary Library' });
    await act(async () => { vi.advanceTimersByTime(CHECK_TIMEOUT_MS + 10); });
    const group = await screen.findByRole('group', { name: 'Couldn’t check Anna Centenary Library' });
    fireEvent.click(within(group).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'Found in Anna Centenary Library' })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('a library whose catalog cannot be read is "couldn’t check" with no Try again, linking its catalog search for this book', async () => {
    const closed = { ...LIBRARY, capabilities: { ...LIBRARY.capabilities, publicAvailability: false } };
    const search = 'https://catalog.example.test/search?q=9788173711466';
    let release: (response: Response) => void = () => {};
    stubApi({ libraries: [closed], check: () => new Promise(resolve => { release = resolve; }) });
    seed({ libraryId: LIBRARY.id });
    renderBook();
    // While the server is asked, the card already says it couldn't check, with the catalog's home page.
    let group = await screen.findByRole('group', { name: 'Couldn’t check Anna Centenary Library' });
    expect(within(group).getByRole('link', { name: /^Catalog/ })).toHaveAttribute('href', LIBRARY.catalogUrl);
    await act(async () => { release(json({ answer: 'unknown', catalogUrl: search })); });
    group = await screen.findByRole('group', { name: 'Couldn’t check Anna Centenary Library' });
    await waitFor(() => expect(within(group).getByRole('link', { name: /^Catalog/ })).toHaveAttribute('href', search));
    expect(within(group).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(group).toHaveClass('library-answer-grey');
  });

  it('never shows one edition’s answer for another, and drops answers that arrive after the book changes', async () => {
    const pending = new Map<string, (response: Response) => void>();
    const second = { ...BOOK, bookKey: 'v1:isbn:9788173715181', isbn13: '9788173715181', title: 'Wings of Fire (Universities Press)' };
    stubApi({ others: [second], check: body => new Promise(resolve => { pending.set(body.bookKey, resolve); }) });
    seed({ libraryId: LIBRARY.id });
    const view = render(<MemoryRouter initialEntries={['/app/books/' + encodeURIComponent(BOOK.bookKey), '/app/books/' + encodeURIComponent(second.bookKey)]} initialIndex={0}>
      <AnonymousWebApp oneShelf /><Navigator /></MemoryRouter>);
    await screen.findByRole('group', { name: 'Checking Anna Centenary Library' });
    await waitFor(() => expect(pending.has(BOOK.bookKey)).toBe(true));
    act(() => navigateRef!(1));
    await waitFor(() => expect(pending.has(second.bookKey)).toBe(true));
    // The first edition's answer arrives late: it is not shown for the second.
    pending.get(BOOK.bookKey)!(json({ answer: 'found' }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.getByRole('group', { name: 'Checking Anna Centenary Library' })).toBeInTheDocument();
    pending.get(second.bookKey)!(json({ answer: 'not_found' }));
    expect(await screen.findByRole('group', { name: 'Not found in Anna Centenary Library' })).toBeInTheDocument();
    view.unmount();
  });

  it('adds with a tick and the "See my shelf" toast, and removes on the next tap without asking', async () => {
    stubApi();
    renderBook();
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my shelf' }));
    const on = await screen.findByRole('button', { name: 'On my shelf' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on.querySelector('.tick-pop')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'See my shelf' })).toHaveAttribute('href', '/app/shelf');
    expect(screen.getByText('Added to your shelf', { selector: '[role="status"]' })).toBeInTheDocument();
    expect(stored().savedBooks.map((item: { bookKey: string }) => item.bookKey)).toEqual([BOOK.bookKey]);
    fireEvent.click(on);
    expect(await screen.findByRole('button', { name: 'Add to my shelf' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stored().savedBooks).toEqual([]);
    expect(screen.queryByRole('link', { name: 'See my shelf' })).not.toBeInTheDocument();
    // The existing Undo puts it back.
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'On my shelf' })).toBeInTheDocument();
  });

  it('a saved book with the same ISBN-13 under another key counts as on my shelf, and removing takes that one off', async () => {
    stubApi();
    seed({ saved: [{ bookKey: 'v1:googlebooks:abc', isbn13: BOOK.isbn13, title: 'Wings of Fire', authors: [], source: 'search', viewedAt: '2026-01-01T00:00:00.000Z' }] });
    renderBook();
    fireEvent.click(await screen.findByRole('button', { name: 'On my shelf' }));
    await screen.findByRole('button', { name: 'Add to my shelf' });
    expect(stored().savedBooks).toEqual([]);
  });

  it('at the guest cap Add is disabled with "Shelf full" as its reason', async () => {
    stubApi();
    seed({ saved: Array.from({ length: SAVED_BOOKS_CAP }, (_, index) => ({ bookKey: 'v1:openlibrary:OL' + (index + 1) + 'W', title: 'B' + index, authors: [], source: 'direct', viewedAt: '2026-01-01T00:00:00.000Z' })) });
    renderBook();
    const add = await screen.findByRole('button', { name: 'Add to my shelf' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('Shelf full');
  });

  it('a placeholder record shows what is known and no About section', async () => {
    const placeholder = { bookKey: 'v1:isbn:9780306406157', isbn13: '9780306406157', title: 'ISBN 9780306406157', authors: [], metadataStatus: 'missing', description: 'Not to be shown.' };
    stubApi({ book: placeholder });
    renderBook(placeholder.bookKey);
    expect(await screen.findByRole('heading', { level: 1, name: 'ISBN 9780306406157' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'About this book' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Published/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All editions on Open Library/ })).toHaveAttribute('href', 'https://openlibrary.org/isbn/9780306406157');
    expect(screen.getByRole('button', { name: 'Add to my shelf' })).toBeEnabled();
  });

  it('Find my library opens the pop-up over the book; choosing one checks this book without leaving the page', async () => {
    const calls = stubApi();
    renderBook();
    fireEvent.click(await screen.findByRole('button', { name: 'Find my library' }));
    const dialog = await screen.findByRole('dialog', { name: 'Find your library' });
    expect(screen.getByTestId('location')).toHaveTextContent('"overlay":"library"');
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Anna Centenary Library/ }));
    expect(await screen.findByRole('group', { name: 'Found in Anna Centenary Library' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(BOOK.bookKey));
    expect(screen.getByTestId('location')).not.toHaveTextContent('overlay');
    expect(stored().selectedLibraryId).toBe(LIBRARY.id);
    expect(calls.filter(call => call.path.endsWith('/holdings/check')).map(call => call.body)).toEqual([{ libraryId: LIBRARY.id, bookKey: BOOK.bookKey }]);
    await waitFor(() => expect(card()).toHaveFocus());
  });
});

function Navigator() {
  const location = useLocation();
  const navigate = useNavigate();
  navigateRef = (delta: number) => navigate(delta);
  return <output data-testid="location">{location.pathname}</output>;
}

describe('book page helpers', () => {
  it('first published is the year only', () => {
    expect(firstPublishedYear('1999')).toBe('1999');
    expect(firstPublishedYear('2016-10-04')).toBe('2016');
    expect(firstPublishedYear('May 1999')).toBe('1999');
    expect(firstPublishedYear(undefined)).toBeNull();
    // Only a work's date is its first publication; an edition's is just when that edition came out.
    expect(publishedLine({ bookKey: 'v1:openlibrary:OL1037811W', publishedDate: '1999' })).toBe('First published 1999');
    expect(publishedLine({ bookKey: 'v1:isbn:9788173711466', publishedDate: '2002' })).toBe('Published 2002');
    expect(publishedLine({ bookKey: 'v1:isbn:9788173711466' })).toBeNull();
  });
  it('Open Library: the work page, else the ISBN page, else nothing', () => {
    expect(openLibraryUrl({ bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', workId: 'OL1W' })).toBe('https://openlibrary.org/works/OL1W');
    expect(openLibraryUrl({ bookKey: 'v1:openlibrary:OL29062473W' })).toBe('https://openlibrary.org/works/OL29062473W');
    expect(openLibraryUrl({ bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466' })).toBe('https://openlibrary.org/isbn/9788173711466');
    expect(openLibraryUrl({ bookKey: 'v1:googlebooks:abc' })).toBeNull();
  });
});
