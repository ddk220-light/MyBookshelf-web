import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { selectionTarget } from './SelectLibraryLink';

const ANNA = { id: 'koha:anna-centenary-library', name: 'Anna Centenary Library', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', health: 'operational', selectionPath: '/select/anna-centenary-library',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } };
const OLD = { ...ANNA, id: 'koha:previous', name: 'Previously chosen library', selectionPath: undefined };
const BOOK = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };
const SAVED = { ...BOOK, source: 'direct', viewedAt: '2026-01-01T00:00:00.000Z' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function stubApi({ link = 'ok' as 'ok' | 'missing' | 'down' } = {}) {
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve-link')) {
      if (link === 'down') return Promise.resolve(json({ error: { code: 'UNAVAILABLE' } }, 503));
      return Promise.resolve(link === 'ok' && body.slug === 'anna-centenary-library' ? json({ library: ANNA }) : json({ error: { code: 'LIBRARY_NOT_FOUND' } }, 404));
    }
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: [ANNA, OLD].find(item => item.id === body.libraryId) }));
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: BOOK }));
    if (path.endsWith('/holdings/check')) return Promise.resolve(json({ answer: 'found' }));
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: {} }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND' } }, 404));
  }));
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
function open(path: string) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 1, selectedLibraryId: OLD.id, recentBooks: [SAVED], savedBooks: [SAVED] }));
  return render(<MemoryRouter initialEntries={[path]}><AnonymousWebApp /><Location /></MemoryRouter>);
}
const stored = () => JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('library links in the one-shelf app', () => {
  it('a guide page’s link chooses the library without asking and opens the shelf; the shelf stays', async () => {
    stubApi();
    open('/select/anna-centenary-library?next=/app/search');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/));
    expect(await screen.findByText(ANNA.name, { selector: '.home-library' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stored().selectedLibraryId).toBe(ANNA.id);
    expect(stored().savedBooks.map((item: { bookKey: string }) => item.bookKey)).toEqual([BOOK.bookKey]);
  });

  it('a shared book link opens the book with that library’s answer', async () => {
    stubApi();
    open('/select/anna-centenary-library?book=' + encodeURIComponent(BOOK.bookKey));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(BOOK.bookKey)));
    expect(await screen.findByRole('group', { name: 'Found in Anna Centenary Library' })).toBeInTheDocument();
  });

  for (const [link, message] of [['missing', 'This library link isn’t available.'], ['down', 'We couldn’t open this library link just now.']] as const)
    it(`a link that cannot be opened (${link}) lands on the shelf with the notice and keeps the library`, async () => {
      stubApi({ link });
      open('/select/no-such-library');
      expect(await screen.findByText(new RegExp(message))).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/);
      expect(stored().selectedLibraryId).toBe(OLD.id);
    });

  it('targets: a book, an allowed next, else the shelf; search text is never carried on', () => {
    expect(selectionTarget('?book=' + encodeURIComponent(BOOK.bookKey), null)).toBe('/app/books/' + encodeURIComponent(BOOK.bookKey));
    expect(selectionTarget('?next=/app/search&q=wings', null)).toBe('/app/shelf');
    expect(selectionTarget('?next=' + encodeURIComponent('/app/books/' + encodeURIComponent(BOOK.bookKey)), null)).toBe('/app/books/' + encodeURIComponent(BOOK.bookKey));
    expect(selectionTarget('?next=https://evil.example', null)).toBe('/app/shelf');
    expect(selectionTarget('', null)).toBe('/app/shelf');
  });
});
