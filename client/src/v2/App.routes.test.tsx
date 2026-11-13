import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from './App';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import { AVAILABILITY_CACHE_KEY } from './readerState';
import { ONE_SHELF_STORAGE_KEY } from './oneShelfState';
import { startOneShelfMigration } from './OneShelfRoot';
import { peekLegacyText } from './legacyHandoff';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const LIBRARY = { id: 'koha:anna', name: 'Anna Centenary Library', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', health: 'operational',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const BOOK = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };

function stubApi() {
  const calls: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.includes('/books/search')) return Promise.resolve(json({ kind: 'candidates', candidates: [BOOK] }));
    if (path.includes('/books/resolve')) return Promise.resolve(json({ book: BOOK }));
    if (path.includes('/libraries/discover')) return Promise.resolve(json({ libraries: [LIBRARY], nextOffset: null }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return calls;
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search + location.hash}</output>; }
const open = (path: string) => render(<MemoryRouter initialEntries={[path]}><AnonymousWebApp /><Location /></MemoryRouter>);
const at = (path: RegExp) => waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(path));
const saved = (title: string, viewedAt: string) => ({ bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title, authors: ['Synthetic author'], source: 'direct', viewedAt });
const record = JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [saved('Older copy', '2026-10-01T00:00:00.000Z'), saved('Newer copy', '2026-10-02T00:00:00.000Z')], savedContent: [] });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('the one-shelf app', () => {
  it('/app serves the home over the migrated browser state, with no tab bar', async () => {
    stubApi();
    localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, record);
    localStorage.setItem(AVAILABILITY_CACHE_KEY, JSON.stringify({ version: 1, entries: [] }));
    open('/app');
    await at(/^\/app\/shelf$/);
    // The duplicate is collapsed to the newer copy.
    expect(await screen.findAllByRole('link', { name: 'Newer copy by Synthetic author' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: /Older copy/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument();
    await startOneShelfMigration();
    expect(JSON.parse(localStorage.getItem(ONE_SHELF_STORAGE_KEY)!)).toMatchObject({ version: 1 });
    expect(localStorage.getItem(AVAILABILITY_CACHE_KEY)).toBeNull();
  });

  it('an unknown page says so and leads back to the shelf', async () => {
    stubApi();
    open('/no-such-page');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My shelf' })).toHaveAttribute('href', '/app/shelf');
  });
});

// Plan Phase 12 redirect table: every old address lands on the new screens.
describe('old addresses', () => {
  it('/app/search: the shelf with the search bar focused', async () => {
    stubApi();
    open('/app/search');
    await at(/^\/app\/shelf$/);
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveFocus());
  });

  it('/app/search?q=: runs the search once; the text never stays in the address or storage', async () => {
    const calls = stubApi();
    open('/app/search?q=Wings%20of%20Fire');
    await at(/^\/app\/shelf$/);
    expect(await screen.findByRole('link', { name: /Wings of Fire/ })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('Wings of Fire');
    expect(calls.filter(call => call.path.includes('/books/search'))).toHaveLength(1);
    expect(screen.getByTestId('location')).not.toHaveTextContent('Wings');
    expect(peekLegacyText('search')).toBeUndefined();
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i)!)).not.toContain('Wings of Fire');
  });

  it('/app/search?scope=free (free reading off in this build): the shelf, without searching', async () => {
    const calls = stubApi();
    open('/app/search?scope=free&q=literature');
    await at(/^\/app\/shelf$/);
    await screen.findByRole('searchbox', { name: 'Search for a book' });
    expect(calls.some(call => call.path.includes('search'))).toBe(false);
  });

  it('/app/libraries?q=: the shelf with the library pop-up, the text in its field only', async () => {
    stubApi();
    open('/app/libraries?q=Chennai');
    await at(/^\/app\/shelf$/);
    const dialog = await screen.findByRole('dialog', { name: 'Find your library' });
    expect(within(dialog).getByLabelText('City, town or library name')).toHaveValue('Chennai');
    expect(screen.getByTestId('location')).not.toHaveTextContent('Chennai');
    await waitFor(() => expect(peekLegacyText('library')).toBeUndefined());
  });

  it('/app/libraries: the shelf with an empty library pop-up', async () => {
    stubApi();
    open('/app/libraries');
    await at(/^\/app\/shelf$/);
    const dialog = await screen.findByRole('dialog', { name: 'Find your library' });
    expect(within(dialog).getByLabelText('City, town or library name')).toHaveValue('');
  });

  it('/app/libraries?book=: that book with the library pop-up over it', async () => {
    stubApi();
    open('/app/libraries?book=' + encodeURIComponent(BOOK.bookKey));
    await at(/^\/app\/books\/v1%3Aisbn%3A9788173711466$/);
    expect(await screen.findByRole('dialog', { name: 'Find your library' })).toBeInTheDocument();
  });

  it('/app/settings: the shelf with the side panel; #privacy opens Privacy', async () => {
    stubApi();
    const view = open('/app/settings');
    expect(await screen.findByRole('dialog', { name: 'Account and settings' })).toBeInTheDocument();
    await at(/^\/app\/shelf$/);
    view.unmount();
    open('/app/settings#privacy');
    await at(/^\/app\/privacy$/);
  });

  it('/find and /privacy', async () => {
    stubApi();
    const view = open('/find');
    await at(/^\/app\/shelf$/);
    view.unmount();
    open('/privacy');
    await at(/^\/app\/privacy$/);
  });
});
