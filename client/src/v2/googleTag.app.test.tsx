// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://mybookshelf.cloud/"}
// The app as main.tsx starts it (StrictMode, BrowserRouter): the key events
// each action gives the Google tag, once each, and never search text. Page
// views come from the tag itself, which jsdom never loads.
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AnonymousWebApp } from './App';
import { ANONYMOUS_WEB_STORAGE_KEY } from './localState';
import { forgetSuggestionVisit } from './suggestions/useShelfSuggestions';
import { forgetAccountWarmUp } from './ui/account/AccountEntryGate';
import { ScanDialog, type ScanAnswer } from './ui/scan/ScanDialog';

const LIBRARY = { id: 'koha:anna-centenary-library', name: 'Anna Centenary Library', city: 'Chennai', region: 'Tamil Nadu', country: 'IN', health: 'operational', catalogUrl: 'https://catalog.example.test/',
  selectionPath: '/select/anna-centenary-library',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } };
const OTHER = { ...LIBRARY, id: 'bc:sfpl', name: 'San Francisco Public Library', city: 'San Francisco', region: 'California', country: 'US' };
const BOOK = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };
const SECOND = { bookKey: 'v1:openlibrary:OL77W', title: 'Ignited Minds', authors: ['A. P. J. Abdul Kalam'] };
const recent = (book: object) => ({ ...book, source: 'direct', viewedAt: '2026-01-01T00:00:00.000Z' });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const EMAIL = 'reader@example.org';

type Stub = { search?: () => Response; check?: () => Response; discover?: () => Response; session?: () => unknown };
function stubApi({ search = () => json({ kind: 'candidates', candidates: [BOOK, SECOND] }), check = () => json({ answer: 'found', catalogUrl: 'https://catalog.example.test/record/1', catalogLinkKind: 'record' }),
  discover = () => json({ libraries: [LIBRARY, OTHER], total: 2, nextOffset: null }), session = () => ({ status: 'guest' }) }: Stub = {}) {
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    if (path.endsWith('/capabilities')) return json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin });
    if (path.endsWith('/session')) return json(session());
    if (path.endsWith('/sign-in')) return json({ returnTo: '/' });
    if (path.endsWith('/link-info')) return json({ email: EMAIL });
    if (/\/(verify-email|magic-link\/verify|reset-password)$/.test(path)) return json({ signedIn: true, email: EMAIL });
    if (path.endsWith('/libraries/resolve-link')) return json({ library: LIBRARY });
    if (path.endsWith('/libraries/resolve')) return json({ library: [LIBRARY, OTHER].find(item => item.id === body.libraryId) });
    if (path.endsWith('/libraries/discover')) return discover();
    if (path.endsWith('/books/search')) return search();
    if (path.endsWith('/books/resolve')) return json({ book: [BOOK, SECOND].find(item => item.bookKey === body.bookKey) || BOOK });
    if (path.endsWith('/holdings/check')) return check();
    if (path.endsWith('/holdings/lookup')) return json({ answers: {} });
    if (path.endsWith('/library-requests') || path.endsWith('/problem-reports')) return json({}, 202);
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  }));
}
function seed({ saved = [] as unknown[], viewed = [] as unknown[], libraryId = null as string | null } = {}) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: viewed, savedBooks: saved, savedContent: [] }));
}
let queue: any[][] = [];
/** The events since the test started, as JSON keeps them (a missing parameter is not sent). */
const events = () => queue.map(([command, name, params]) => { expect(command).toBe('event'); return [name, JSON.parse(JSON.stringify(params))]; });

// Each visit has its own history entry key, so one test's book open is not another's.
let visit = 0;
function open(path: string) {
  window.history.pushState({ usr: null, key: 'visit' + (visit += 1), idx: 0 }, '', path);
  return render(<StrictMode><BrowserRouter useTransitions={false}><AnonymousWebApp /></BrowserRouter></StrictMode>);
}
const searchFor = async (text: string) => {
  const input = await screen.findByRole('searchbox', { name: 'Search for a book' });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form')!);
};
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });

beforeEach(() => {
  queue = [];
  window.gtag = (...command) => { queue.push(command); };
  stubApi();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear(); sessionStorage.clear();
  forgetSuggestionVisit(); forgetAccountWarmUp();
  // Whatever happened: no search text, ISBN, book, place, email or token.
  expect(JSON.stringify(queue)).not.toMatch(/wings|fire|ignited|kalam|9788173711466|OL77W|v1:|chennai|13\.08|80\.27|example\.(org|test)|token|secret|hunter2|broken spine/i);
});

describe('the app', () => {
  it('a visit, a search, a book, its library’s answer, the catalog, Add and Remove: one event each', async () => {
    seed({ libraryId: LIBRARY.id });
    open('/');
    await searchFor('wings of fire');
    const results = await screen.findByRole('region', { name: 'Search results' });
    fireEvent.click(await within(results).findByRole('link', { name: /^Wings of Fire/ }));
    const card = await screen.findByRole('group', { name: 'In your library' });
    const link = await within(card).findByRole('link', { name: /See this book/ });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
    fireEvent.click(screen.getByRole('button', { name: 'Add to my reading shelf' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from my reading shelf' }));
    await screen.findByRole('button', { name: 'Add to my reading shelf' });
    await settle();
    const library = { library_id: LIBRARY.id, library_country: 'IN' };
    expect(events()).toEqual([
      ['book_search', { outcome: 'results', result_band: '1-5', method: 'typed' }],
      ['book_open', { event_source: 'search' }],
      ['library_check', { outcome: 'found', ...library, event_source: 'book_page' }],
      ['catalog_open', { outcome: 'found', ...library, event_source: 'book_page' }],
      ['book_save', { event_source: 'search' }],
      ['book_remove', { event_source: 'search' }],
    ]);
  });

  it('a search with nothing, and one that fails: Try again is the same search', async () => {
    let answer = () => json({ kind: 'candidates', candidates: [] });
    stubApi({ search: () => answer() });
    seed();
    open('/');
    await searchFor('wings of fire');
    await screen.findByRole('heading', { name: 'No books found' });
    answer = () => json({ error: { code: 'UNAVAILABLE' } }, 503);
    await searchFor('wings of fire again');
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await settle();
    answer = () => json({ kind: 'candidates', candidates: Array.from({ length: 21 }, (_, index) => ({ ...SECOND, bookKey: `v1:openlibrary:OL${index + 900}W`, title: 'Book ' + index })) });
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('region', { name: 'Search results' });
    await searchFor('more wings');
    await waitFor(() => expect(events()).toHaveLength(3));
    expect(events()).toEqual([['book_search', { outcome: 'none', result_band: '0', method: 'typed' }], ['book_search', { outcome: 'error', method: 'typed' }],
      ['book_search', { outcome: 'results', result_band: '21+', method: 'typed' }]]);
  });

  it('a library search and a pick are one event each; the same library again is not a change', async () => {
    seed({ saved: [recent(BOOK)] });
    open('/');
    const pick = async (type: (dialog: HTMLElement) => void, name: RegExp) => {
      fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
      const panel = await screen.findByRole('dialog', { name: 'Settings' });
      fireEvent.click(within(panel).getByRole('button', { name: /library/ }));
      const dialog = await screen.findByRole('dialog', { name: /your library|Change library/ });
      type(dialog);
      fireEvent.click(await within(dialog).findByRole('button', { name }, { timeout: 2000 }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    };
    const typeText = (dialog: HTMLElement) => { for (const value of ['c', 'ch', 'Chennai']) fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value } }); };
    await pick(typeText, /^Anna Centenary/);
    await pick(typeText, /^Anna Centenary/);
    const nearMe = (dialog: HTMLElement) => {
      vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { geolocation: { getCurrentPosition: (ok: (position: unknown) => void) => ok({ coords: { latitude: 13.0827, longitude: 80.2707 } }) } }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Libraries near me' }));
    };
    await pick(nearMe, /^San Francisco/);
    expect(events()).toEqual([
      ['library_search', { outcome: 'results', method: 'typed' }], ['select_library', { library_id: LIBRARY.id, library_country: 'IN', method: 'search' }],
      ['library_search', { outcome: 'results', method: 'typed' }],
      ['library_search', { outcome: 'results', method: 'near_me' }], ['select_library', { library_id: OTHER.id, library_country: 'US', method: 'near_me' }]]);
  });

  it('a library search with nothing or a failure; a request to add a library, accepted', async () => {
    let answer = () => json({ libraries: [], total: 0, nextOffset: null });
    stubApi({ discover: () => answer() });
    seed({ saved: [recent(BOOK)] });
    open('/app/libraries');
    const dialog = await screen.findByRole('dialog', { name: 'Find your library' });
    const field = within(dialog).getByLabelText('City, town or library name');
    fireEvent.change(field, { target: { value: 'Chennai' } });
    await within(dialog).findByText('No libraries here yet', { selector: '.library-line' }, { timeout: 2000 });
    answer = () => json({ error: { code: 'UNAVAILABLE' } }, 503);
    fireEvent.change(field, { target: { value: 'Chennai city' } });
    await within(dialog).findByText('Couldn’t load libraries', { selector: 'span' }, { timeout: 2000 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'My library isn’t listed' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Send request' }));
    await within(dialog).findByText('Request sent. Thank you.');
    expect(events()).toEqual([['library_search', { outcome: 'none', method: 'typed' }], ['library_search', { outcome: 'error', method: 'typed' }], ['library_request', {}]]);
  });

  it('a library link: its page, the library picked by it, then the book; opened again it changes nothing', async () => {
    seed();
    const path = '/select/anna-centenary-library?book=' + encodeURIComponent(BOOK.bookKey);
    const view = open(path);
    await screen.findByRole('group', { name: 'In your library' });
    await settle();
    const library = { library_id: LIBRARY.id, library_country: 'IN' };
    const shown = [['book_open', { event_source: 'link' }], ['library_check', { outcome: 'found', ...library, event_source: 'book_page' }]];
    expect(events()).toEqual([['select_library', { ...library, method: 'link' }], ...shown]);
    view.unmount();
    queue = [];
    open(path);
    await screen.findByRole('group', { name: 'In your library' });
    await settle();
    expect(events().map(([name]) => name)).not.toContain('select_library');
  });

  it('answers shown: each reason, again after Try again; a restored library and the shelf’s own marks are not picks or checks', async () => {
    let answer: object = { answer: 'unknown', reason: 'timeout' };
    stubApi({ check: () => json(answer) });
    seed({ saved: [recent(BOOK)], libraryId: OTHER.id });
    open('/');
    fireEvent.click(await screen.findByRole('link', { name: /^Wings of Fire/ }));
    const again = await screen.findByRole('button', { name: 'Try again' });
    answer = { answer: 'unconfirmed', reason: 'busy' };
    fireEvent.click(again);
    await screen.findByText(/could not tell whether it has this book/);
    expect(events()).toHaveLength(3);
    const check = { library_id: OTHER.id, library_country: 'US', event_source: 'book_page' };
    expect(events()).toEqual([['book_open', { event_source: 'shelf' }], ['library_check', { outcome: 'unknown', reason: 'timeout', ...check }],
      ['library_check', { outcome: 'unknown', reason: 'busy', ...check }]]);
  });

  it('an answer already known when the book opens is shown, and counted, once', async () => {
    seed({ saved: [recent(BOOK)], libraryId: LIBRARY.id });
    open('/');
    for (const times of [1, 2]) {
      fireEvent.click((await screen.findAllByRole('link', { name: /^Wings of Fire/ }))[0]);
      await screen.findByRole('group', { name: 'In your library' });
      await settle();
      expect(events().filter(([name]) => name === 'library_check')).toHaveLength(times);
      expect(events().filter(([name]) => name === 'book_open')).toHaveLength(times);
      fireEvent.click(screen.getByRole('link', { name: 'Back' }));
      await screen.findByRole('heading', { name: 'My reading shelf' });
    }
  });

  it('where a book was opened from: a suggestion, Viewed before; the library’s own link on the shelf', async () => {
    seed({ viewed: [recent(SECOND)], libraryId: LIBRARY.id });
    open('/');
    fireEvent.click((await screen.findAllByRole('link', { name: /, suggested$/ }))[0]);
    await screen.findByRole('button', { name: 'Add to my reading shelf' });
    fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    const catalog = await screen.findByRole('link', { name: 'Anna Centenary Library, opens in a new tab' });
    catalog.addEventListener('click', event => event.preventDefault());
    fireEvent.click(catalog);
    fireEvent.click(await screen.findByRole('link', { name: 'Ignited Minds by A. P. J. Abdul Kalam' }));
    await screen.findByRole('button', { name: 'Add to my reading shelf' });
    expect(events().filter(([name]) => name !== 'library_check')).toEqual([['book_open', { event_source: 'suggestion' }],
      ['catalog_open', { library_id: LIBRARY.id, library_country: 'IN', event_source: 'shelf' }], ['book_open', { event_source: 'viewed' }]]);
  });

  it('scan: opened; a typed ISBN is a typed search, and asking again for the same one is not another', async () => {
    let answer = () => json({ error: { code: 'UNAVAILABLE' } }, 503);
    stubApi({ search: () => answer() });
    seed({ saved: [recent(SECOND)] });
    open('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Scan a barcode' }));
    const dialog = await screen.findByRole('dialog', { name: 'Type the ISBN' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'ISBN' }), { target: { value: BOOK.isbn13 } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }));
    await within(dialog).findByText('Couldn’t search. Try again.');
    answer = () => json({ kind: 'exact', book: BOOK });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }));
    await screen.findByRole('heading', { level: 1, name: 'Wings of Fire' });
    await settle();
    expect(events()).toEqual([['barcode_scan', { step: 'opened' }], ['book_search', { outcome: 'error', method: 'typed' }], ['book_open', { event_source: 'search' }]]);
  });

  it('an ISBN with no known book is a search with nothing', async () => {
    stubApi({ search: () => json({ kind: 'exact', book: { ...BOOK, title: 'ISBN ' + BOOK.isbn13, authors: [], metadataStatus: 'missing' } }) });
    seed({ saved: [recent(SECOND)] });
    open('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Scan a barcode' }));
    const dialog = await screen.findByRole('dialog', { name: 'Type the ISBN' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'ISBN' }), { target: { value: BOOK.isbn13 } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Find' }));
    await screen.findByRole('dialog', { name: 'Couldn’t match that barcode' });
    expect(events()).toEqual([['barcode_scan', { step: 'opened' }], ['book_search', { outcome: 'none', result_band: '0', method: 'typed' }]]);
  });

  it('camera results: found, failed, refused; a lookup that could not run is not a scan result', async () => {
    window.history.pushState(null, '', '/');
    let read: ((code: string) => void) | undefined, failure: unknown;
    const scanner = { start: vi.fn(async (_video: HTMLVideoElement, callback: (code: string) => void) => { if (failure) throw failure; read = callback; }), stop: vi.fn() };
    let answer: ScanAnswer = 'failed';
    const dialog = (key: number) => <StrictMode><ScanDialog key={key} open onClose={() => {}} onIsbn={async () => answer} onSearchByTitle={() => {}} createScanner={() => scanner} hasCamera={() => true} /></StrictMode>;
    const view = render(dialog(1));
    await settle();
    await act(async () => { read?.(BOOK.isbn13); });
    expect(events()).toEqual([]);
    answer = 'opened';
    view.rerender(dialog(2));
    await settle();
    await act(async () => { read?.(BOOK.isbn13); });
    answer = 'unknown';
    view.rerender(dialog(3));
    await settle();
    await act(async () => { read?.(BOOK.isbn13); });
    view.rerender(dialog(4));
    await settle();
    await act(async () => { read?.('5012345678900'); });
    await act(async () => { read?.('5012345678917'); });
    failure = { name: 'NotAllowedError' };
    view.rerender(dialog(5));
    await settle();
    failure = { name: 'NotReadableError' };
    view.rerender(dialog(6));
    await settle();
    expect(events().map(([name, params]) => [name, params.step])).toEqual([['barcode_scan', 'found'], ['barcode_scan', 'failed'], ['barcode_scan', 'failed'], ['barcode_scan', 'denied'], ['barcode_scan', 'failed']]);
  });

  it('a problem report, accepted', async () => {
    seed();
    open('/app/report');
    fireEvent.change(await screen.findByRole('textbox', { name: 'What happened?' }), { target: { value: 'A broken spine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByRole('button', { name: 'Sent' });
    expect(events()).toEqual([['problem_report', {}]]);
  });

  it('logging in and confirming an email, with no account', async () => {
    let status = 'guest';
    stubApi({ session: () => (status === 'guest' ? { status } : { status, csrfToken: 'csrf', user: { id: 'account-1', name: 'Reader', email: EMAIL, emailVerified: true } }) });
    seed();
    const logIn = open('/app/account/sign-in');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: EMAIL } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
    status = 'authenticated';
    fireEvent.click(screen.getByRole('button', { name: 'Log in with password' }));
    await waitFor(() => expect(events()).toEqual([['login', { method: 'password' }]]));
    logIn.unmount();

    for (const [page, button, name, params] of [['verify', /^Log in as/, 'sign_up', { method: 'password' }], ['magic-link', /^Log in as/, 'login', { method: 'link' }]] as const) {
      queue = [];
      status = 'guest';
      const view = open('/app/account/' + page + '#token=secret');
      const submit = await screen.findByRole('button', { name: button });
      status = 'authenticated';
      fireEvent.click(submit);
      await screen.findByRole('link', { name: 'Go to my reading shelf' });
      await waitFor(() => expect(events()).toEqual([[name, params]]));
      view.unmount();
    }
  });
});
