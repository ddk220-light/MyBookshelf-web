import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { ONE_SHELF_STORAGE_KEY } from '../../oneShelfState';
import { READER_PREFERENCES_KEY } from '../../readerState';
import { shouldInviteAccount } from '../shelf/AccountInvite';

const LIBRARY = { id: 'koha:anna', name: 'Anna Centenary Library', city: 'Chennai', region: null, country: 'IN', health: 'operational',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const book = (index: number) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Book ' + index, authors: ['Author ' + index], source: 'direct', viewedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString() });

function stubApi({ email = true, found = [] as string[] } = {}) {
  const calls: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: LIBRARY }));
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: Object.fromEntries(body.books.map((item: { bookKey: string }) => [item.bookKey, found.includes(item.bookKey) ? 'found' : 'not_found'])) }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return calls;
}
function seed({ saved = [] as unknown[], recent = [] as unknown[], libraryId = null as string | null } = {}) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: recent, savedBooks: saved, savedContent: [] }));
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
const renderHome = (path = '/app/shelf') => render(<MemoryRouter initialEntries={[path]}><AnonymousWebApp /><Location /></MemoryRouter>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('one-shelf home', () => {
  it('first open shows the empty shelf, the search bar and no tab bar', async () => {
    stubApi();
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Ready to search' })).toBeInTheDocument();
    expect(screen.getByText('Add books to your shelf and search in your library')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveAttribute('placeholder', 'Title, author or ISBN');
    expect(screen.getByRole('button', { name: 'Scan a barcode' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search for a book' }));
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveFocus();
    // No library chosen: no library line.
    expect(screen.queryByText('Anna Centenary Library')).not.toBeInTheDocument();
  });

  it('typed search text stays out of the URL and browser storage', async () => {
    stubApi();
    renderHome();
    const input = await screen.findByRole('searchbox', { name: 'Search for a book' });
    fireEvent.change(input, { target: { value: 'wings of fire' } });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/);
    for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1)
      expect(store.getItem(store.key(index)!)).not.toContain('wings of fire');
  });

  it('saved books stand as covers named "Title by Author", with nothing written under them', async () => {
    stubApi();
    seed({ saved: [book(1), book(2), book(3), book(4)] });
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    expect(screen.getByText('4 books')).toBeInTheDocument();
    const covers = screen.getAllByRole('link', { name: /^Book \d by Author \d$/ });
    // Most recently added first.
    expect(covers.map(link => link.getAttribute('aria-label'))).toEqual(['Book 4 by Author 4', 'Book 3 by Author 3', 'Book 2 by Author 2', 'Book 1 by Author 1']);
    expect(covers[0]).toHaveAttribute('href', '/app/books/' + encodeURIComponent('v1:openlibrary:OL4W'));
    for (const item of document.querySelectorAll('.bay-books > li')) {
      // Each bay slot holds the book link only; its typeset text is part of the cover.
      expect(item.children).toHaveLength(1);
      expect(item.firstElementChild?.tagName).toBe('A');
    }
    expect(document.querySelectorAll('.bay-books')).toHaveLength(2);
  });

  it('shows the library name and badges only books the library has', async () => {
    stubApi({ found: [book(1).bookKey] });
    seed({ saved: [book(1), book(2)], libraryId: LIBRARY.id });
    renderHome();
    expect(await screen.findByRole('link', { name: 'Book 1 by Author 1, in Anna Centenary Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Book 2 by Author 2' })).toBeInTheDocument();
    expect(screen.getByText('Anna Centenary Library', { selector: '.home-library' })).toBeInTheDocument();
    expect(document.querySelectorAll('.cover-badge-library')).toHaveLength(1);
  });

  it('a failed library lookup adds no badge and no "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string) => path.endsWith('/holdings/lookup') ? Promise.reject(new TypeError('offline'))
      : path.endsWith('/libraries/resolve') ? Promise.resolve(json({ library: LIBRARY })) : Promise.resolve(json({ status: 'guest' }))));
    seed({ saved: [book(1), book(2)], libraryId: LIBRARY.id });
    renderHome();
    expect(await screen.findByRole('link', { name: 'Book 1 by Author 1' })).toBeInTheDocument();
    expect(document.querySelectorAll('.cover-badge-library')).toHaveLength(0);
  });

  it('switches to the list view and remembers it', async () => {
    stubApi();
    seed({ saved: [book(1), book(2)] });
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    const list = document.querySelector('.shelf-list')!;
    expect(within(list as HTMLElement).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['Book 2 by Author 2', 'Book 1 by Author 1']);
    expect(within(list as HTMLElement).getByText('Author 2')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(READER_PREFERENCES_KEY)!).shelfView).toBe('list');
  });

  it('invites a guest after the first saved book; Not now hides it for good', async () => {
    stubApi();
    seed({ saved: [book(1)] });
    const view = renderHome();
    expect(await screen.findByRole('heading', { name: 'Take your shelf with you' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/app/account/sign-up');
    // One book: no view switch and no count.
    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('heading', { name: 'Take your shelf with you' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ONE_SHELF_STORAGE_KEY)!).accountInviteDismissed).toBe(true);
    view.unmount();
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole('heading', { name: 'Take your shelf with you' })).not.toBeInTheDocument();
  });

  it('invite rules: guests with a saved book, email accounts on, not dismissed', () => {
    expect(shouldInviteAccount({ guest: true, savedCount: 1, emailAccounts: true, dismissed: false })).toBe(true);
    expect(shouldInviteAccount({ guest: true, savedCount: 0, emailAccounts: true, dismissed: false })).toBe(false);
    expect(shouldInviteAccount({ guest: false, savedCount: 3, emailAccounts: true, dismissed: false })).toBe(false);
    expect(shouldInviteAccount({ guest: true, savedCount: 3, emailAccounts: false, dismissed: false })).toBe(false);
    expect(shouldInviteAccount({ guest: true, savedCount: 3, emailAccounts: null, dismissed: false })).toBe(false);
    expect(shouldInviteAccount({ guest: true, savedCount: 3, emailAccounts: true, dismissed: true })).toBe(false);
  });

  it('no invite when the service has no email accounts', async () => {
    stubApi({ email: false });
    seed({ saved: [book(1)] });
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole('heading', { name: 'Take your shelf with you' })).not.toBeInTheDocument();
  });

  it('Viewed before shows spines; Clear empties it and Undo puts it back', async () => {
    stubApi();
    seed({ saved: [book(1)], recent: [book(7), book(8)] });
    renderHome();
    const section = await screen.findByRole('region', { name: 'Viewed before' });
    expect(within(section).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['Book 7 by Author 7', 'Book 8 by Author 8']);
    fireEvent.click(within(section).getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Viewed before' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('region', { name: 'Viewed before' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!).recentBooks).toHaveLength(2);
  });

  it('the side panel opens from the person icon and closes with Escape, returning focus', async () => {
    stubApi();
    seed({ saved: [book(1)], libraryId: LIBRARY.id });
    renderHome();
    const person = await screen.findByRole('button', { name: 'Account and settings' });
    fireEvent.click(person);
    const panel = await screen.findByRole('dialog', { name: 'Account and settings' });
    expect(within(panel).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/app/account/sign-up');
    expect(within(panel).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/app/account/sign-in');
    expect(await within(panel).findByText('Anna Centenary Library')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Change library' })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(within(panel).getByRole('button', { name: 'Daylight' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(panel).getByRole('button', { name: 'Ink' }));
    expect(document.documentElement.dataset.readingLight).toBe('ink');
    for (const name of ['Report a problem', 'Privacy', 'About']) expect(within(panel).getByRole('link', { name })).toBeInTheDocument();
    fireEvent(panel, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Account and settings' })).not.toBeInTheDocument());
    expect(person).toHaveFocus();
  });

  it('/app/settings opens the shelf with the side panel', async () => {
    stubApi();
    renderHome('/app/settings');
    expect(await screen.findByRole('dialog', { name: 'Account and settings' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/);
  });
});
