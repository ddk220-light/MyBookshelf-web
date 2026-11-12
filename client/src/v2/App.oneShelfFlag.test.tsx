import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from './App';
import { oneShelfEnabled } from './featureFlags';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import { AVAILABILITY_CACHE_KEY, LOOKUP_PREFERENCES_KEY } from './readerState';
import { ONE_SHELF_STORAGE_KEY } from './oneShelfState';
import { startOneShelfMigration } from './OneShelfRoot';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function guestSession() {
  vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(path.endsWith('/capabilities')
    ? json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin })
    : path.endsWith('/session') ? json({ status: 'guest' }) : json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404))));
}
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
const saved = (title: string, viewedAt: string) => ({ bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title, authors: ['Synthetic author'], source: 'direct', viewedAt });
const record = JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [saved('Older copy', '2026-10-01T00:00:00.000Z'), saved('Newer copy', '2026-10-02T00:00:00.000Z')], savedContent: [] });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('VITE_ONE_SHELF flag', () => {
  it('is on only for the exact string "true"', () => {
    expect(oneShelfEnabled({})).toBe(false);
    expect(oneShelfEnabled({ VITE_ONE_SHELF: 'false' })).toBe(false);
    expect(oneShelfEnabled({ VITE_ONE_SHELF: '1' })).toBe(false);
    expect(oneShelfEnabled({ VITE_ONE_SHELF: 'TRUE' })).toBe(false);
    expect(oneShelfEnabled({ VITE_ONE_SHELF: 'true' })).toBe(true);
    // Unit tests build without the flag, like production.
    expect(oneShelfEnabled()).toBe(false);
  });

  it('flag off renders today’s routes and leaves browser storage as it was', async () => {
    guestSession();
    localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, record);
    localStorage.setItem(AVAILABILITY_CACHE_KEY, JSON.stringify({ version: 1, entries: [] }));
    localStorage.setItem(LOOKUP_PREFERENCES_KEY, JSON.stringify({ version: 1, entries: [] }));
    render(<MemoryRouter initialEntries={['/app']}><AnonymousWebApp /><Location /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/shelf'));
    // Today's tab bar and shelf page, with the duplicate still listed as before.
    expect(await screen.findAllByRole('link', { name: 'Older copy' })).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: /^Search/ })).toBeInTheDocument();
    expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).toBe(record);
    expect(localStorage.getItem(AVAILABILITY_CACHE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LOOKUP_PREFERENCES_KEY)).not.toBeNull();
    expect(localStorage.getItem(ONE_SHELF_STORAGE_KEY)).toBeNull();
  });

  it('flag off keeps the not-found and legacy redirect routes', async () => {
    guestSession();
    const view = render(<MemoryRouter initialEntries={['/no-such-page']}><AnonymousWebApp /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    view.unmount();
    render(<MemoryRouter initialEntries={['/find']}><AnonymousWebApp /><Location /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/search'));
  });

  it('flag on serves the same routes over the migrated browser state', async () => {
    guestSession();
    localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, record);
    localStorage.setItem(AVAILABILITY_CACHE_KEY, JSON.stringify({ version: 1, entries: [] }));
    render(<MemoryRouter initialEntries={['/app']}><AnonymousWebApp oneShelf /><Location /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/shelf'));
    expect(await screen.findAllByRole('link', { name: 'Newer copy' })).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Older copy' })).not.toBeInTheDocument();
    await startOneShelfMigration();
    expect(JSON.parse(localStorage.getItem(ONE_SHELF_STORAGE_KEY)!)).toMatchObject({ version: 1 });
    expect(localStorage.getItem(AVAILABILITY_CACHE_KEY)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
    expect(stored.version).toBe(2);
    expect(stored.savedBooks.map((book: { title: string }) => book.title)).toEqual(['Newer copy']);
  });
});
