import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const saved = (index: number, title: string, author: string) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title, authors: [author], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString() });
const result = (index: number, title: string, author: string) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title, authors: [author] });
const KALAM = saved(1, 'Wings of Fire', 'A. P. J. Abdul Kalam');
const NARAYAN = saved(2, 'The Guide', 'R. K. Narayan');
const PUBLIC = [result(1, 'Wings of Fire', 'A. P. J. Abdul Kalam'), result(10, 'The Dragonet Prophecy', 'Tui T. Sutherland'), result(11, 'Wings of Fire', 'Dale Brown')];

type Answer = (body: { query: string }, signal?: AbortSignal | null) => Promise<Response>;
function stubApi(search: Answer = () => Promise.resolve(json({ kind: 'candidates', candidates: PUBLIC }))) {
  const searches: Array<{ query: string; signal?: AbortSignal | null; libraryId?: string }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: false, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/books/search')) { searches.push({ ...body, signal: init?.signal }); return search(body, init?.signal); }
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: { ...PUBLIC.find(item => item.bookKey === body.bookKey) } }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return searches;
}
function seed(savedBooks: unknown[] = []) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks, savedContent: [] }));
}
let navigateRef: ReturnType<typeof useNavigate> | null = null;
function Location() {
  const location = useLocation();
  navigateRef = useNavigate();
  return <output data-testid="location">{location.pathname + location.search + '|' + JSON.stringify(location.state)}</output>;
}
const renderHome = () => render(<MemoryRouter initialEntries={['/app/shelf']}><AnonymousWebApp oneShelf /><Location /></MemoryRouter>);
const searchFor = async (text: string) => {
  const input = await screen.findByRole('searchbox', { name: 'Search for a book' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
};
const never: Answer = (_body, signal) => new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('search on the shelf', () => {
  it('shows saved matches first with the bookmark, then public results, in place of the shelf', async () => {
    const searches = stubApi();
    seed([KALAM, NARAYAN]);
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    await searchFor('wings of fire');
    const results = await screen.findByRole('region', { name: 'Search results' });
    const links = within(results).getAllByRole('link');
    expect(links.map(link => link.getAttribute('aria-label'))).toEqual([
      'Wings of Fire by A. P. J. Abdul Kalam, on my shelf', 'The Dragonet Prophecy by Tui T. Sutherland', 'Wings of Fire by Dale Brown']);
    expect(results.querySelectorAll('.cover-badge-mine')).toHaveLength(1);
    expect(results.querySelectorAll('.cover-badge-library')).toHaveLength(0);
    // Nothing written under the books.
    for (const item of results.querySelectorAll('.bay-books > li')) expect(item.children).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'My shelf' })).not.toBeInTheDocument();
    expect(screen.getByText('3 books', { selector: '[role="status"]' })).toBeInTheDocument();
    // Public data only: no library scope.
    expect(searches).toHaveLength(1);
    expect(searches[0]).not.toHaveProperty('libraryId');
    // The text is not in the URL, history state or browser storage.
    expect(screen.getByTestId('location').textContent).toMatch(/^\/app\/shelf\|\{"search":\{"pushed":true,"candidateId":"c[a-z0-9]+"\}\}$/);
    for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1)
      expect(store.getItem(store.key(index)!)).not.toContain('wings');

    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(within(results).getAllByRole('link')[0]).toHaveTextContent('Wings of Fire');
    expect(results.querySelectorAll('.shelf-list-item')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Back to my shelf' }));
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf\|null$/);
  });

  it('× and clearing the field go back to the shelf and stop the search', async () => {
    const searches = stubApi(never);
    seed([NARAYAN]);
    renderHome();
    await searchFor('wings');
    expect(await screen.findByRole('region', { name: 'Searching' })).toBeInTheDocument();
    expect(document.querySelectorAll('.ghost-book')).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and go back to my shelf' }));
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    expect(searches[0].signal?.aborted).toBe(true);

    await searchFor('guide');
    await screen.findByRole('region', { name: 'Searching' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search for a book' }), { target: { value: '' } });
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    expect(searches[1].signal?.aborted).toBe(true);
  });

  it('a newer search cancels the older one', async () => {
    let calls = 0;
    const searches = stubApi((body, signal) => ++calls === 1 ? never(body, signal) : Promise.resolve(json({ kind: 'candidates', candidates: PUBLIC.slice(1, 2) })));
    renderHome();
    await searchFor('wings');
    await screen.findByRole('region', { name: 'Searching' });
    await searchFor('dragonet');
    const results = await screen.findByRole('region', { name: 'Search results' });
    expect(within(results).getAllByRole('link')).toHaveLength(1);
    expect(searches[0].signal?.aborted).toBe(true);
    expect(searches[1].signal?.aborted).toBe(false);
  });

  it('no books found offers the scanner; a failure says Couldn’t search and Try again searches again', async () => {
    let fail = true;
    const searches = stubApi(body => body.query === 'nothing'
      ? Promise.resolve(json({ error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } }, 404))
      : Promise.resolve(fail ? json({ error: { code: 'METADATA_UNAVAILABLE', message: 'Unavailable.' } }, 503) : json({ kind: 'candidates', candidates: PUBLIC })));
    renderHome();
    await searchFor('nothing');
    expect(await screen.findByRole('heading', { name: 'No books found' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan the barcode' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();

    await searchFor('wings of fire');
    expect(await screen.findByRole('heading', { name: 'Couldn’t search' })).toBeInTheDocument();
    expect(screen.queryByText('No books found')).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Search results' })).toBeInTheDocument();
    expect(searches.map(item => item.query)).toEqual(['nothing', 'wings of fire', 'wings of fire']);
    // One history entry for the whole search: Back returns to the shelf.
    navigateRef!(-1);
    expect(await screen.findByRole('heading', { name: 'Ready to search' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('');
  });

  it('offline: Couldn’t search without a request', async () => {
    const searches = stubApi();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      renderHome();
      await searchFor('wings');
      expect(await screen.findByRole('heading', { name: 'Couldn’t search' })).toBeInTheDocument();
      expect(searches).toHaveLength(0);
    } finally { online.mockRestore(); }
  });

  it('a result opens the book page, and Back returns to the same results without searching again', async () => {
    const searches = stubApi();
    renderHome();
    await searchFor('wings of fire');
    const results = await screen.findByRole('region', { name: 'Search results' });
    fireEvent.click(within(results).getByRole('link', { name: 'Wings of Fire by Dale Brown' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/'));
    // The book page's own back link returns to the results too.
    const back = await screen.findByRole('link', { name: 'Back' });
    expect(back).toHaveAttribute('href', '/app/shelf');
    navigateRef!(-1);
    const again = await screen.findByRole('region', { name: 'Search results' });
    expect(within(again).getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('wings of fire');
    expect(searches).toHaveLength(1);

    fireEvent.click(within(again).getByRole('link', { name: 'The Dragonet Prophecy by Tui T. Sutherland' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Back' }));
    expect(await screen.findByRole('region', { name: 'Search results' })).toBeInTheDocument();
    expect(searches).toHaveLength(1);
  });

  it('an ISBN goes straight to its book', async () => {
    stubApi(() => Promise.resolve(json({ kind: 'exact', book: PUBLIC[2] })));
    renderHome();
    await searchFor('978-0-00-000000-2');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(PUBLIC[2].bookKey)));
    // The search entry was replaced by the book: Back is the shelf.
    navigateRef!(-1);
    expect(await screen.findByRole('heading', { name: 'Ready to search' })).toBeInTheDocument();
  });
});
