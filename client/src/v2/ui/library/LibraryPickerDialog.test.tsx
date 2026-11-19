import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function stubApi({ request = () => Promise.resolve(json({}, 202)), discover }: { request?: () => Promise<Response>; discover?: (body: Record<string, unknown>) => Response } = {}) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: [ANNA, IIT].find(item => item.id === body.libraryId) }));
    if (path.endsWith('/libraries/discover')) {
      if (discover) return Promise.resolve(discover(body));
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
  return render(<MemoryRouter initialEntries={['/app/shelf']}><AnonymousWebApp /><Location /></MemoryRouter>);
}
async function openFromPanel(title = 'Find your library') {
  fireEvent.click(await screen.findByRole('button', { name: 'Account and settings' }));
  const panel = await screen.findByRole('dialog', { name: 'Account and settings' });
  fireEvent.click(within(panel).getByRole('button', { name: /library/ }));
  return screen.findByRole('dialog', { name: title });
}
const everything = () => {
  let text = screen.getByTestId('location').textContent || '';
  for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1) text += store.getItem(store.key(index)!);
  return text;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('library pop-up', () => {
  it('opens from the side panel’s Change as "Change library"; typed text fills the list with a count; choosing keeps the shelf', async () => {
    const calls = stubApi();
    renderShelf(IIT.id);
    expect(await screen.findByText(IIT.name, { selector: '.home-library' })).toBeInTheDocument();
    const dialog = await openFromPanel('Change library');
    expect(screen.queryByRole('dialog', { name: 'Account and settings' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('"overlay":"library"');
    // On a phone the keyboard waits for a tap: focus starts on "Libraries near me", not the field.
    expect(within(dialog).getByRole('button', { name: 'Libraries near me' })).toHaveFocus();
    expect(dialog.querySelector('.library-current')).toHaveTextContent('Your library nowIIT Madras Central Library, Chennai');
    const field = within(dialog).getByLabelText('City, town or library name');
    // A neutral id and name, and a caption rather than a <label>, so Safari does not offer contact AutoFill.
    expect(field).toHaveAttribute('id', 'library-lookup');
    expect(field).toHaveAttribute('name', 'library-lookup');
    expect(dialog.querySelector('label')).toBeNull();
    fireEvent.change(field, { target: { value: 'Chennai' } });
    const list = await within(dialog).findByRole('region', { name: 'Libraries' });
    const rows = await within(list).findAllByRole('button');
    expect(rows.map(row => row.textContent)).toEqual(['Anna Centenary LibraryKotturpuram · Tamil Nadu', 'IIT Madras Central LibraryYour library']);
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(dialog.querySelector('.library-count')).toHaveTextContent('2 libraries match');
    // No more pages: no "Show more".
    expect(within(dialog).queryByRole('button', { name: /^Show \d+ more$/ })).not.toBeInTheDocument();
    // No area browse and no place suggestions: one list.
    expect(calls.some(call => call.path.endsWith('/libraries/areas') || call.path.endsWith('/places/search'))).toBe(false);
    expect(calls.filter(call => call.path.endsWith('/libraries/discover')).map(call => call.body)).toEqual([{ query: 'Chennai', limit: 25 }]);
    // The typed text is nowhere but the field.
    expect(everything()).not.toContain('Chennai');

    fireEvent.click(rows[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change library' })).not.toBeInTheDocument());
    expect(await screen.findByText(ANNA.name, { selector: '.home-library' })).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
    expect(stored.selectedLibraryId).toBe(ANNA.id);
    expect(stored.savedBooks).toHaveLength(1);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf\|null$/);
    expect(screen.getByRole('button', { name: 'Account and settings' })).toHaveFocus();
    // The badges refill for the new library.
    await waitFor(() => expect(calls.filter(call => call.path.endsWith('/holdings/lookup')).map(call => call.body.libraryId)).toEqual([IIT.id, ANNA.id]));
  });

  it('Remove leaves no library chosen; the shelf stays and the title becomes "Find your library"', async () => {
    stubApi();
    renderShelf(IIT.id);
    expect(await screen.findByText(IIT.name, { selector: '.home-library' })).toBeInTheDocument();
    const dialog = await openFromPanel('Change library');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(dialog.querySelector('.library-current')).toBeNull());
    expect(within(dialog).getByRole('heading', { name: 'Find your library' })).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Find your library' })).toBe(dialog);
    const stored = JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!);
    expect(stored.selectedLibraryId).toBeNull();
    expect(stored.savedBooks).toHaveLength(1);
    expect(everything()).not.toContain(IIT.name);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Find your library' })).not.toBeInTheDocument());
    expect(document.querySelector('.home-library')).toBeNull();
  });

  it('a long list shows how many of how many, and "Show 25 more" adds the next page of the same search', async () => {
    const many = (from: number, count: number) => Array.from({ length: count }, (_, index) => lib('koha:lib' + (from + index), 'Chennai Library ' + (from + index)));
    const area = { id: 'place:chennai', label: 'Chennai, Tamil Nadu', lat: 13, lon: 80, scope: 'locality', requestedRadiusKm: 10, radiusKm: 10, expanded: false };
    const calls = stubApi({ discover: body => body.offset === 25
      ? json({ libraries: many(25, 25), total: 61, nextOffset: 50, area })
      : body.offset === 50 ? json({ libraries: many(50, 11), total: 61, nextOffset: null, area }) : json({ libraries: many(0, 25), total: 61, nextOffset: 25, area }) });
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    const list = await within(dialog).findByRole('region', { name: 'Libraries in Chennai' });
    expect(await within(list).findAllByRole('button')).toHaveLength(25);
    expect(dialog.querySelector('.library-count')).toHaveTextContent('Showing 25 of 61 libraries in Chennai. Type a library’s name to narrow the list.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 25 more' }));
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(50));
    // Focus moves to the first new library.
    expect(within(list).getAllByRole('button')[25]).toHaveFocus();
    expect(dialog.querySelector('.library-count')).toHaveTextContent('Showing 50 of 61 libraries in Chennai.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 11 more' }));
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(61));
    expect(within(dialog).queryByRole('button', { name: /^Show \d+ more$/ })).not.toBeInTheDocument();
    expect(dialog.querySelector('.library-count')).toHaveTextContent('61 libraries in Chennai');
    expect(calls.filter(call => call.path.endsWith('/libraries/discover')).map(call => call.body))
      .toEqual([{ query: 'Chennai', limit: 25 }, { query: 'Chennai', offset: 25, limit: 25 }, { query: 'Chennai', offset: 50, limit: 25 }]);
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
    expect(dialog.querySelector('.library-count')).toHaveTextContent('2 libraries near you');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ maximumAge: 0 });
    expect(calls.filter(call => call.body?.lat !== undefined)).toHaveLength(1);
    expect(everything()).not.toMatch(/13\.01|80\.23/);
    // No request button without typed text; the form is still offered.
    expect(within(dialog).queryByRole('button', { name: /Request to add/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'My library isn’t listed' })).toBeInTheDocument();
  });

  it('a refused position says so and offers typing instead', async () => {
    stubApi();
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { geolocation: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) } }));
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Libraries near me' }));
    expect(await within(dialog).findByText(/^Location unavailable\./, { selector: 'p:not([role])' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Type your city or library name instead' }));
    expect(within(dialog).getByLabelText('City, town or library name')).toHaveFocus();
  });

  it('nothing found: "Request to add" opens the form and nothing is sent before Send request; the text is kept nowhere', async () => {
    const calls = stubApi();
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: '  Tirunelveli ' } });
    expect(await within(dialog).findByText('No libraries here yet', { selector: 'p:not([role])' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Request to add “Tirunelveli”' }));
    expect(within(dialog).getByRole('heading', { name: 'Ask us to add a library' })).toHaveFocus();
    expect(calls.filter(call => call.path.endsWith('/library-requests'))).toEqual([]);
    expect(within(dialog).getByLabelText('Library name and city')).toHaveValue('Tirunelveli');
    expect(within(dialog).getByText(/We delete them after 90 days\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing is sent until you press Send request\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Request sent. Thank you.')).toBeInTheDocument();
    expect(within(dialog).getByText(/We have your request for “Tirunelveli”/)).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/library-requests')).map(call => call.body)).toEqual([{ text: 'Tirunelveli' }]);
    expect(everything()).not.toContain('Tirunelveli');
    expect(within(dialog).getByRole('button', { name: 'Done' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /library/ })).not.toBeInTheDocument());
  });

  it('the form: the library text can be changed, the name and email are optional, and a bad email sends nothing', async () => {
    const calls = stubApi();
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'My library isn’t listed' }));
    const text = within(dialog).getByLabelText('Library name and city');
    expect(text).toHaveValue('Chennai');
    fireEvent.change(text, { target: { value: 'Kendriya Vidyalaya Narimedu, Madurai' } });
    expect(within(dialog).getByLabelText('Your name (optional)')).toHaveAttribute('autocomplete', 'name');
    fireEvent.change(within(dialog).getByLabelText('Your name (optional)'), { target: { value: ' Asha ' } });
    fireEvent.change(within(dialog).getByLabelText('Your email (optional)'), { target: { value: 'asha@example' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Check the email address, or leave it empty.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Your email (optional)')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(within(dialog).getByLabelText('Your email (optional)'), { target: { value: 'asha@example.org' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText(/We will write to you when it is added\./)).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/library-requests')).map(call => call.body))
      .toEqual([{ text: 'Kendriya Vidyalaya Narimedu, Madurai', name: 'Asha', email: 'asha@example.org' }]);
    // Typed details are kept nowhere but the form.
    expect(everything()).not.toMatch(/Narimedu|asha@example/);
  });

  it('text the server would refuse is not sent; Cancel goes back to the list with nothing sent', async () => {
    const calls = stubApi();
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Chennai' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'My library isn’t listed' }));
    fireEvent.change(within(dialog).getByLabelText('Library name and city'), { target: { value: 'me@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText(/Type the library’s name and city/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await within(dialog).findByRole('button', { name: 'My library isn’t listed' })).toHaveFocus();
    expect(within(dialog).getByLabelText('City, town or library name')).toHaveValue('Chennai');
    expect(calls.filter(call => call.path.endsWith('/library-requests'))).toEqual([]);
  });

  it('a request that fails can be sent again; a refused one says what to check', async () => {
    let reply = json({ error: { code: 'INTERNAL' } }, 500);
    const calls = stubApi({ request: () => Promise.resolve(reply) });
    renderShelf();
    const dialog = await openFromPanel();
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Tirunelveli' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Request to add “Tirunelveli”' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Couldn’t send. Try again.')).toBeInTheDocument();
    reply = json({ error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } }, 400);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Couldn’t send this. Check the library name and the email.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Request sent/)).not.toBeInTheDocument();
    reply = json({}, 202);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Request sent. Thank you.')).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/library-requests'))).toHaveLength(3);
  });

  it('the sheet follows the area above the keyboard while it is open, and stops listening when closed', async () => {
    stubApi();
    const viewport = Object.assign(new EventTarget(), { height: 500, offsetTop: 0, scale: 1 });
    vi.stubGlobal('visualViewport', viewport);
    const layout = vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800);
    try {
      renderShelf();
      const dialog = await openFromPanel();
      expect(dialog.style.getPropertyValue('--sheet-height')).toBe('500px');
      expect(dialog.style.getPropertyValue('--sheet-lift')).toBe('300px');
      // The keyboard grows and the page is scrolled under it.
      Object.assign(viewport, { height: 400, offsetTop: 50 });
      act(() => { viewport.dispatchEvent(new Event('resize')); });
      expect(dialog.style.getPropertyValue('--sheet-height')).toBe('400px');
      expect(dialog.style.getPropertyValue('--sheet-lift')).toBe('350px');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Find your library' })).not.toBeInTheDocument());
      expect(dialog.style.getPropertyValue('--sheet-height')).toBe('');
      Object.assign(viewport, { height: 300 });
      act(() => { viewport.dispatchEvent(new Event('scroll')); });
      expect(dialog.style.getPropertyValue('--sheet-height')).toBe('');
    } finally {
      layout.mockRestore();
    }
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
    for (const text of ['', 'a', '12345', 'me@example.com', 'https://example.com', 'www.example.org', 'mylibrary.org', 'Call 9876543210', 'x'.repeat(81), 'a!', 'Tirunel\u0000veli', '\u202ETirunelveli']) expect(requestableText(text)).toBeNull();
    for (const text of ['St. Louis', 'Tirunelveli', 'திருநெல்வேலி', 'Sector 17 Chandigarh']) expect(requestableText(text)).toBe(text);
  });
  it('area line is the place and region only', () => {
    expect(libraryArea(ANNA as never)).toBe('Kotturpuram · Tamil Nadu');
    expect(libraryArea({ ...ANNA, city: null, district: 'Chennai' } as never)).toBe('Chennai · Tamil Nadu');
    expect(libraryArea({ ...ANNA, city: 'Delhi', region: 'Delhi' } as never)).toBe('Delhi');
  });
});
