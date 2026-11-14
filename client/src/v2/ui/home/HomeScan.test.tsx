import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';

const BOOK = { bookKey: 'v1:isbn:9781625275868', isbn13: '9781625275868', title: 'The Innovator', authors: ['Walter Isaacson'] };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function stubApi({ session = { status: 200, body: { status: 'guest' } as unknown } } = {}) {
  const searches: string[] = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path.endsWith('/session')) return Promise.resolve(json(session.body, session.status));
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/books/search')) {
      searches.push(body.query);
      if (body.query === BOOK.isbn13) return Promise.resolve(json({ kind: 'exact', book: BOOK }));
      if (/^97[89]\d{10}$/.test(body.query)) return Promise.resolve(json({ kind: 'exact', book: { bookKey: 'v1:isbn:' + body.query, isbn13: body.query, title: 'ISBN ' + body.query, authors: [], metadataStatus: 'missing' } }));
      return Promise.resolve(json({ kind: 'candidates', candidates: [], nextOffset: null }));
    }
    if (path.endsWith('/books/resolve')) return Promise.resolve(json({ book: BOOK }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return searches;
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}</output>; }
const renderHome = () => render(<MemoryRouter initialEntries={['/app/shelf']}><AnonymousWebApp /><Location /></MemoryRouter>);
const typeIsbn = (value: string) => {
  const field = screen.getByRole('textbox', { name: 'ISBN' });
  fireEvent.change(field, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Find' }));
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('scan pop-up on the home screen', () => {
  it('the scan button opens the pop-up; a typed ISBN opens its book; nothing typed is stored', async () => {
    const searches = stubApi();
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Scan a barcode' }));
    // jsdom has no camera: straight to typing.
    const dialog = await screen.findByRole('dialog', { name: 'Type the ISBN' });
    expect(within(dialog).getByRole('textbox', { name: 'ISBN' })).toHaveFocus();
    typeIsbn('978-1-62527-586-8');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(BOOK.bookKey)));
    expect(searches).toEqual([BOOK.isbn13]);
    // The opened book joins Viewed before as usual; the typed text itself is kept nowhere.
    for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1)
      expect(store.getItem(store.key(index)!)).not.toContain('978-1-62527');
  });

  it('the cold open’s scan button (inside the larger search bar) opens the same pop-up; Escape closes it and focus returns', async () => {
    stubApi();
    renderHome();
    await screen.findByRole('heading', { name: 'Ready to search' });
    // The search bar does both; there is no separate scan button on the cold open.
    expect(screen.getAllByRole('button', { name: /Scan/ })).toHaveLength(1);
    const button = screen.getByRole('button', { name: 'Scan a barcode' });
    expect(button.closest('.home-top-cold form')).not.toBeNull();
    button.focus();
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog', { name: 'Type the ISBN' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Type the ISBN' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Scan a barcode' })).toHaveFocus();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/);
  });

  it('an ISBN with no known book: "Couldn’t match that barcode", then Search by title focuses the search bar', async () => {
    stubApi();
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Scan a barcode' }));
    await screen.findByRole('dialog', { name: 'Type the ISBN' });
    typeIsbn('9780306406157');
    const noMatch = await screen.findByRole('dialog', { name: 'Couldn’t match that barcode' });
    fireEvent.click(within(noMatch).getByRole('button', { name: 'Search by title' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('searchbox', { name: 'Search for a book' })).toHaveFocus();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/);
  });

  it('"No books found" offers the same pop-up', async () => {
    stubApi();
    renderHome();
    const input = await screen.findByRole('searchbox', { name: 'Search for a book' });
    fireEvent.change(input, { target: { value: 'zzzz qqqq' } });
    fireEvent.submit(input.closest('form')!);
    fireEvent.click(await screen.findByRole('button', { name: 'Scan the barcode' }));
    expect(await screen.findByRole('dialog', { name: 'Type the ISBN' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Type the ISBN' })).not.toBeInTheDocument());
    // The results are still there under the pop-up.
    expect(screen.getByRole('heading', { name: 'No books found' })).toBeInTheDocument();
  });
});

describe('accounts switched off', () => {
  const DISABLED = { status: 503, body: { error: { code: 'ACCOUNT_DISABLED', message: 'Accounts aren’t enabled here yet. You can continue browsing.' } } };

  it('accounts off: no account notice on the home screen, a working guest shelf, and no account buttons in the panel', async () => {
    stubApi({ session: DISABLED });
    localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: [{ ...BOOK, source: 'direct', viewedAt: '2026-01-01T00:00:00.000Z' }], savedContent: [] }));
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Innovator by Walter Isaacson' })).toBeInTheDocument();
    expect(screen.queryByText(/Accounts aren’t enabled/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check account availability' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue as guest' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Take your shelf with you' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account and settings' }));
    const panel = await screen.findByRole('dialog', { name: 'Account and settings' });
    expect(within(panel).queryByRole('link', { name: 'Create account' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('heading', { name: 'Account' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'My library' })).toBeInTheDocument();
  });

});
