import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { isDeskPath, isSlotPath } from './layoutMode';
import { railColumns } from './useBayColumns';

// This file renders at a desktop width: every (min-width) query up to 1440 px
// matches. The cached media lists (useMediaQuery) belong to this file only.
const WIDTH = 1440;
// (Set on window directly: vi.unstubAllGlobals after each test must not remove it.)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return { matches: min ? WIDTH >= Number(min[1]) : false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false };
  } });
});

const LIBRARY = { id: 'koha:anna', name: 'Anna Centenary Library', city: 'Chennai', region: null, country: 'IN', health: 'operational',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const book = (index: number) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Book ' + index, authors: ['Author ' + index], source: 'direct', viewedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString() });

function stubApi() {
  vi.stubGlobal('fetch', vi.fn((path: string) => {
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: LIBRARY }));
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: { ...book(1), description: 'About it.' } }));
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: {} }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
}
function seed(saved: unknown[] = [], libraryId: string | null = null) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: saved, savedContent: [] }));
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}</output>; }
const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AnonymousWebApp /><Location /></MemoryRouter>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('desk layout routes', () => {
  it('draws the shelf and every middle-slot page, and leaves other pages alone', () => {
    for (const path of ['/app/shelf', '/app/books/v1%3Aisbn%3A9781625275868', '/app/privacy', '/app/terms', '/app/about', '/app/report', '/app/settings/account', '/app/account/sign-in'])
      expect(isDeskPath(path), path).toBe(true);
    expect(isSlotPath('/app/shelf')).toBe(false);
    for (const path of ['/app/settings/account/more', '/app/admin', '/app/read/x', '/select/anna']) expect(isDeskPath(path), path).toBe(false);
  });

  it('fits three to six rail covers to the width', () => {
    expect(railColumns(300)).toBe(3);
    expect(railColumns(520)).toBe(4);
    expect(railColumns(620)).toBe(5);
    expect(railColumns(888)).toBe(6);
    expect(railColumns(2000)).toBe(6);
  });
});

describe('desk layout at 1440 px', () => {
  it('cold open: the left column, the search, no scan button, no person icon and no empty shelves', async () => {
    stubApi();
    renderAt('/app/shelf');
    expect(await screen.findByRole('heading', { name: 'Ready to search' })).toBeInTheDocument();
    const column = screen.getByRole('complementary', { name: 'Library and account' });
    expect(within(column).getByRole('button', { name: 'Find my library' })).toBeInTheDocument();
    expect(within(column).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/app/account/sign-up');
    expect(within(column).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/app/privacy');
    expect(screen.queryByRole('button', { name: 'Scan a barcode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scan the barcode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Account and settings' })).not.toBeInTheDocument();
    expect(document.querySelector('.bay')).toBeNull();
    expect(document.querySelector('.cold-open-suggestions')).not.toBeNull();
  });

  it('shelf: six books a bay and no account invite', async () => {
    stubApi();
    seed(Array.from({ length: 8 }, (_, index) => book(index + 1)), LIBRARY.id);
    renderAt('/app/shelf');
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    const bays = document.querySelectorAll('.home-bookcase .bay-books');
    expect(bays).toHaveLength(2);
    expect(bays[0].querySelectorAll('.cover3d')).toHaveLength(6);
    expect(screen.queryByRole('heading', { name: 'Take your shelf with you' })).not.toBeInTheDocument();
    expect(await screen.findByText(LIBRARY.name)).toBeInTheDocument();
  });

  it('a book address opens the book in the middle slot beside the shelf; × goes to the shelf', async () => {
    stubApi();
    seed([book(1), book(2)]);
    renderAt('/app/books/' + encodeURIComponent(book(1).bookKey));
    const close = await screen.findByRole('button', { name: 'Close the book' });
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
    expect(close.closest('.desk-slot')).not.toBeNull();
    const area = document.querySelector('.desk-shelf-area')!;
    expect(area).toHaveAttribute('aria-hidden', 'true');
    expect(area.hasAttribute('inert')).toBe(true);
    expect(area.querySelector('.cover3d.is-open')).not.toBeNull();
    // Focus moving into the slot is checked in a real browser (one-shelf-desktop.spec.js):
    // jsdom lets a closed dialog's autofocus button take it.
    fireEvent.click(close);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/));
    expect(document.querySelector('.desk-slot')).toBeNull();
    expect(document.querySelector('.desk-shelf-area')!.hasAttribute('inert')).toBe(false);
  });

  it('Privacy opens in the middle slot with a close button instead of Back', async () => {
    stubApi();
    renderAt('/app/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' }).closest('.desk-slot')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Back' })).not.toBeInTheDocument();
  });
});
