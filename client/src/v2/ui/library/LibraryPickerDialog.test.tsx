import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { libraryArea, requestableText } from './LibraryPickerDialog';

const lib = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, city: 'Chennai', region: 'Tamil Nadu', country: 'IN', health: 'operational',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true }, ...extra });
const ANNA = lib('koha:anna', 'Anna Centenary Library', { city: 'Kotturpuram' });
const IIT = lib('chamo:iitm', 'IIT Madras Central Library');
const NEAR = [{ ...ANNA, distanceKm: 2.1 }, { ...IIT, distanceKm: 3.44 }];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

function stubApi({ request = () => Promise.resolve(json({}, 202)) } = {}) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: [ANNA, IIT].find(item => item.id === body.libraryId) }));
    if (path.endsWith('/libraries/discover')) {
      if (body.lat !== undefined) return Promise.resolve(json({ libraries: NEAR, total: 2, nextOffset: null, nearby: true }));
      if (/tirunelveli/i.test(body.query)) return Promise.resolve(json({ libraries: [], total: 0, nextOffset: null }));
      return Promise.resolve(json({ libraries: [ANNA, IIT], total: 2, nextOffset: null }));
    }
    if (path.endsWith('/library-requests')) return request();
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: {} }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return calls;
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search + '|' + JSON.stringify(location.state)}</output>; }
const book = { bookKey: 'v1:openlibrary:OL1W', title: 'Book 1', authors: ['Author 1'], source: 'direct', viewedAt: '2026-01-01T00:00:00.000Z' };
function renderShelf(libraryId: string | null = null) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: [book], savedContent: [] }));
  return render(<MemoryRouter initialEntries={['/app/shelf']}><AnonymousWebApp oneShelf /><Location /></MemoryRouter>);
}
async function openFromPanel() {
  fireEvent.click(await screen.findByRole('button', { name: 'Account and settings' }));
  const panel = await screen.findByRole('dialog', { name: 'Account and settings' });
  fireEvent.click(within(panel).getByRole('button', { name: /library/ }));
  return screen.findByRole('dialog', { name: 'Find your library' });
}
const everything = () => {
  let text = screen.getByTestId('location').textContent || '';
  for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1) text += store.getItem(store.key(index)!);
  return text;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('library pop-up', () => {
  it('opens from the side panel’s Change; typed text fills the list in place; choosing keeps the shelf', async () => {
    const calls = stubApi();
    renderShelf(IIT.id);
    expect(await screen.findByText(IIT.name, { selector: '.home-library' })).toBeInTheDocument();
    const dialog = await openFromPanel();
    expect(screen.queryByRole('dialog', { name: 'Account and settings' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('"overlay":"library"');
    expect(within(dialog).getByRole('button', { name: 'Libraries near me' })).toHaveFocus();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    const list = await within(dialog).findByRole('region', { name: 'Libraries' });
    const rows = await within(list).findAllByRole('button');
    expect(rows.map(row => row.textContent)).toEqual(['Anna Centenary LibraryKotturpuram · Tamil Nadu', 'IIT Madras Central LibraryChennai · Tamil Nadu']);
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    // No area browse and no place suggestions: one list.
    expect(calls.some(call => call.path.endsWith('/libraries/areas') || call.path.endsWith('/places/search'))).toBe(false);
    expect(calls.filter(call => call.path.endsWith('/libraries/discover')).map(call => call.body)).toEqual([{ query: 'Chennai', limit: 25 }]);
    // The typed text is nowhere but the field.
    expect(everything()).not.toContain('Chennai');

    fireEvent.click(rows[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Find your library' })).not.toBeInTheDocument());
    expect(await screen.findByText(ANNA.name, { selector: '.home-library' })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
    expect(stored.selectedLibraryId).toBe(ANNA.id);
    expect(stored.savedBooks).toHaveLength(1);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf\|null$/);
    expect(screen.getByRole('button', { name: 'Account and settings' })).toHaveFocus();
    // The badges refill for the new library.
    await waitFor(() => expect(calls.filter(call => call.path.endsWith('/holdings/lookup')).map(call => call.body.libraryId)).toEqual([IIT.id, ANNA.id]));
  });

  it('near me uses the position once, shows distances nearest first, and keeps no coordinates', async () => {
    const calls = stubApi();
    const getCurrentPosition = vi.fn((success: PositionCallback, _failure?: PositionErrorCallback, _options?: PositionOptions) => success({ coords: { latitude: 13.0123456, longitude: 80.2345678 } } as GeolocationPosition));
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { geolocation: { getCurrentPosition } }));
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    await within(dialog).findAllByRole('button', { name: /Library/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Libraries near me' }));
    const list = await within(dialog).findByRole('region', { name: 'Nearest first' });
    expect(within(dialog).getByLabelText('City, town or library name')).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Libraries near me' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(list).getByText('2.1 km')).toBeInTheDocument();
    expect(within(list).getByText('3.4 km')).toBeInTheDocument();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 0 });
    expect(calls.filter(call => call.body?.lat !== undefined)).toHaveLength(1);
    expect(everything()).not.toMatch(/13\.01|80\.23/);
    // No request button without typed text.
    expect(within(dialog).queryByRole('button', { name: /Request to add/ })).not.toBeInTheDocument();
  });

  it('a refused position says so in one line', async () => {
    stubApi();
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { geolocation: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) } }));
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Libraries near me' }));
    expect(await within(dialog).findByText('Location unavailable', { selector: 'p:not([role])' })).toBeInTheDocument();
  });

  it('nothing found: "No libraries here yet" and one tap sends the request; the text is kept nowhere', async () => {
    const calls = stubApi();
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: '  Tirunelveli ' } });
    expect(await within(dialog).findByText('No libraries here yet', { selector: 'p:not([role])' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request to add “Tirunelveli”' }));
    expect(await within(dialog).findByText('Received your request, thank you.', { selector: 'p:not([role])' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Request to add/ })).not.toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/library-requests')).map(call => call.body)).toEqual([{ text: 'Tirunelveli' }]);
    expect(everything()).not.toContain('Tirunelveli');
    // A new text can be requested again.
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Tirunelveli Junction' } });
    expect(await within(dialog).findByRole('button', { name: 'Request to add “Tirunelveli Junction”' })).toBeInTheDocument();
  });

  it('a request that fails can be sent again', async () => {
    let fail = true;
    stubApi({ request: () => Promise.resolve(fail ? json({ error: { code: 'RATE_LIMITED' } }, 429) : json({}, 202)) });
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Tirunelveli' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Request to add “Tirunelveli”' }));
    expect(await within(dialog).findByText('Couldn’t send. Try again.', { selector: 'p:not([role])' })).toBeInTheDocument();
    fail = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request to add “Tirunelveli”' }));
    expect(await within(dialog).findByText('Received your request, thank you.', { selector: 'p:not([role])' })).toBeInTheDocument();
  });

  it('text the server refuses gets no thank-you and no misleading line; the button stays', async () => {
    const calls = stubApi({ request: () => Promise.resolve(json({ error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } }, 400)) });
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Tirunelveli' } });
    const button = await within(dialog).findByRole('button', { name: 'Request to add “Tirunelveli”' });
    fireEvent.click(button);
    await waitFor(() => expect(calls.filter(call => call.path.endsWith('/library-requests'))).toHaveLength(1));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(within(dialog).queryByText(/Received your request/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Couldn’t send/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Request to add “Tirunelveli”' })).toBeInTheDocument();
  });

  it('"My library isn’t listed" shows the request button with the current text', async () => {
    stubApi();
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'My library isn’t listed' }));
    expect(within(dialog).getByRole('button', { name: 'Request to add “Chennai”' })).toBeInTheDocument();
  });

  it('Escape and Back close it; opening again starts empty', async () => {
    stubApi();
    renderShelf();
    let dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Find your library' })).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf\|null$/);
    dialog = await openFromPanel();
    expect(within(dialog).getByLabelText('City, town or library name')).toHaveValue('');
  });
});

describe('library pop-up helpers', () => {
  it('requests only text the server accepts', () => {
    expect(requestableText('  Tirunelveli  ')).toBe('Tirunelveli');
    for (const text of ['', 'a', '12345', 'me@example.com', 'https://example.com', 'www.example.org', 'mylibrary.org', 'Call 9876543210', 'x'.repeat(81), 'a!']) expect(requestableText(text)).toBeNull();
    for (const text of ['St. Louis', 'Tirunelveli', 'திருநெல்வேலி', 'Sector 17 Chandigarh']) expect(requestableText(text)).toBe(text);
  });
  it('area line is the place and region only', () => {
    expect(libraryArea(ANNA as never)).toBe('Kotturpuram · Tamil Nadu');
    expect(libraryArea({ ...ANNA, city: null, district: 'Chennai' } as never)).toBe('Chennai · Tamil Nadu');
    expect(libraryArea({ ...ANNA, city: 'Delhi', region: 'Delhi' } as never)).toBe('Delhi');
  });
});
