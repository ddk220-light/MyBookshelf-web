import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { ONE_SHELF_STORAGE_KEY } from '../../oneShelfState';
import { READER_PREFERENCES_KEY } from '../../readerState';
import { SEED_SUGGESTIONS } from '../../suggestions/seed';
import { forgetSuggestionVisit, SUGGESTION_HOLD_MS } from '../../suggestions/useShelfSuggestions';
import { shouldInviteAccount } from '../shelf/AccountInvite';
import { forgetSuggestionMotion } from '../shelf/useSuggestionMotion';

const LIBRARY = { id: 'koha:anna', name: 'Anna Centenary Library', city: 'Chennai', region: null, country: 'IN', health: 'operational',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const book = (index: number) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Book ' + index, authors: ['Author ' + index], source: 'direct', viewedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString() });

function stubApi({ email = true, found = [] as string[], suggestions = null as null | ((body: any) => unknown[]) } = {}) {
  const calls: Array<{ path: string; body: any }> = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (suggestions && path.endsWith('/suggestions')) return Promise.resolve(json({ books: suggestions(body) }));
    if (suggestions && path.endsWith('/suggestions/events')) return Promise.resolve(json({}, 202));
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: LIBRARY }));
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: Object.fromEntries(body.books.map((item: { bookKey: string }) => [item.bookKey, found.includes(item.bookKey) ? 'found' : 'not_found'])) }));
    if (path.endsWith('/holdings/check')) return Promise.resolve(json({ answer: found.includes(body.bookKey) ? 'found' : 'not_found' }));
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return calls;
}
function seed({ saved = [] as unknown[], recent = [] as unknown[], libraryId = null as string | null } = {}) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: recent, savedBooks: saved, savedContent: [] }));
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
const renderHome = (path = '/app/shelf') => render(<MemoryRouter initialEntries={[path]}><AnonymousWebApp /><Location /></MemoryRouter>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); forgetSuggestionVisit(); forgetSuggestionMotion(); });
const SUGGESTED = SEED_SUGGESTIONS.slice(0, 5).map(item => item.title + ' by ' + item.authors[0] + ', suggested');
const suggestedLinks = () => screen.getAllByRole('link', { name: /, suggested$/ });

describe('one-shelf home', () => {
  it('first open: "Ready to search", one larger search bar with scan inside it, five suggested books and no tab bar', async () => {
    stubApi();
    renderHome();
    const heading = await screen.findByRole('heading', { name: 'Ready to search' });
    expect(screen.getByText('Add books to your shelf and search in your library')).toBeInTheDocument();
    const input = screen.getByRole('searchbox', { name: 'Search for a book' });
    expect(input).toHaveAttribute('placeholder', 'Title, author or ISBN');
    // The heading stands above the larger search bar (SuggestFirstOpen board), which holds the scan button.
    expect(heading.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.closest('.home-top')).toHaveClass('home-top-cold');
    expect(within(input.closest('form')!).getByRole('button', { name: 'Scan a barcode' })).toBeInTheDocument();
    // The search bar does both: no separate search or scan buttons.
    expect(screen.queryByRole('button', { name: 'Search for a book' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Scan the barcode/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument();
    // Five suggested books from the bundled list, three to a bay, one "Suggested" tag per bay.
    expect(suggestedLinks().map(link => link.getAttribute('aria-label'))).toEqual(SUGGESTED);
    expect(suggestedLinks()[0]).toHaveAttribute('href', '/app/books/' + encodeURIComponent(SEED_SUGGESTIONS[0].bookKey));
    expect(document.querySelectorAll('.bay-books')).toHaveLength(2);
    const tags = [...document.querySelectorAll('.bay-tag')];
    expect(tags.map(tag => [tag.textContent, (tag as HTMLElement).style.gridColumn])).toEqual([['Suggested', '1 / span 3'], ['Suggested', '1 / span 2']]);
    for (const tag of tags) expect(tag.closest('[aria-hidden="true"]')).not.toBeNull();
    // No "My shelf" heading or count for suggestions.
    expect(screen.queryByRole('heading', { name: 'My shelf' })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d books?$/)).not.toBeInTheDocument();
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
    // The count is of saved books only.
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
    // The five suggestions continue after them, faded, and wrap like books: 4 + 5 = 3 bays of 3.
    const all = [...document.querySelectorAll('.bay-books a')];
    expect(all.map(link => link.getAttribute('aria-label'))).toEqual([...covers.map(link => link.getAttribute('aria-label')), ...SUGGESTED]);
    expect(all.map(link => link.classList.contains('is-suggested'))).toEqual([false, false, false, false, true, true, true, true, true]);
    expect(document.querySelectorAll('.bay-books')).toHaveLength(3);
    expect([...document.querySelectorAll('.bay-tag')].map(tag => (tag as HTMLElement).style.gridColumn)).toEqual(['2 / span 2', '1 / span 3']);
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
    // Suggestions come last, faded, with "Suggested" where a year would be.
    expect(within(list as HTMLElement).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['Book 2 by Author 2', 'Book 1 by Author 1', ...SUGGESTED]);
    expect(within(list as HTMLElement).getByText('Author 2')).toBeInTheDocument();
    expect(within(list as HTMLElement).getByText(SEED_SUGGESTIONS[0].authors[0] + ' · Suggested')).toBeInTheDocument();
    expect(list.querySelectorAll('.shelf-list-cover.is-suggested')).toHaveLength(5);
    expect(screen.getByText('2 books')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(READER_PREFERENCES_KEY)!).shelfView).toBe('list');
  });

  it('invites a guest after the first saved book; Not now hides it for good', async () => {
    stubApi();
    seed({ saved: [book(1)] });
    const view = renderHome();
    expect(await screen.findByRole('heading', { name: 'Take your shelf with you' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/app/account/sign-up');
    // One book: no view switch; the count says it is the reader's only book (SuggestShelf board).
    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();
    expect(screen.getByText('1 book')).toBeInTheDocument();
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

  it('a suggestion opens like any book; added, it is an ordinary saved book in front, and the next suggestion takes its place at the end', async () => {
    const calls = stubApi();
    const view = renderHome();
    const first = SEED_SUGGESTIONS[0];
    fireEvent.click((await screen.findAllByRole('link', { name: /, suggested$/ }))[0]);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(first.bookKey)));
    // The book page shows the suggestion's record while it looks the book up (here it cannot).
    expect(await screen.findByRole('heading', { level: 1, name: first.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to my shelf' }));
    expect(await screen.findByRole('button', { name: 'On my shelf' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!).savedBooks.map((item: { bookKey: string }) => item.bookKey)).toEqual([first.bookKey]);
    view.unmount();
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    const all = [...document.querySelectorAll('.bay-books a')];
    expect(all[0]).toHaveAccessibleName(first.title + ' by ' + first.authors[0]);
    expect(all[0]).not.toHaveClass('is-suggested');
    expect(all.slice(1).map(link => link.getAttribute('aria-label'))).toEqual(SEED_SUGGESTIONS.slice(1, 6).map(item => item.title + ' by ' + item.authors[0] + ', suggested'));
    expect(screen.getByText('1 book')).toBeInTheDocument();
    // Just saved: it turns solid; the new suggestion fades in (none under reduced motion, home.css).
    expect(all[0]).toHaveClass('is-turning-solid');
    expect(all[5]).toHaveClass('is-arriving');
    expect(document.querySelectorAll('.is-arriving, .is-turning-solid')).toHaveLength(2);
    // Opening a suggestion is the book page's own check only; nothing was asked for the shelf.
    expect(calls.filter(call => call.path.endsWith('/holdings/lookup'))).toHaveLength(0);
  });

  it('suggestions are never sent for a library answer; a badge only from an answer already held', async () => {
    const pick = SEED_SUGGESTIONS[1];
    const calls = stubApi({ found: [book(1).bookKey, pick.bookKey] });
    seed({ saved: [book(1)], libraryId: LIBRARY.id });
    const view = renderHome();
    expect(await screen.findByRole('link', { name: 'Book 1 by Author 1, in Anna Centenary Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: pick.title + ' by ' + pick.authors[0] + ', suggested' })).toBeInTheDocument();
    expect(document.querySelectorAll('.cover-badge-library')).toHaveLength(1);
    const lookups = calls.filter(call => call.path.endsWith('/holdings/lookup'));
    expect(lookups.flatMap(call => call.body.books.map((item: { bookKey: string }) => item.bookKey))).toEqual([book(1).bookKey]);
    expect(calls.some(call => /\/holdings\/(check|search)$/.test(call.path))).toBe(false);
    // Opening the suggestion checks it on its page, as for any book; that answer then shows on the shelf.
    fireEvent.click(screen.getByRole('link', { name: pick.title + ' by ' + pick.authors[0] + ', suggested' }));
    await waitFor(() => expect(calls.filter(call => call.path.endsWith('/holdings/check')).map(call => call.body.bookKey)).toEqual([pick.bookKey]));
    fireEvent.click(await screen.findByRole('link', { name: 'Back' }));
    const badged = await screen.findByRole('link', { name: pick.title + ' by ' + pick.authors[0] + ', in Anna Centenary Library, suggested' });
    // The badge is not faded with the cover.
    expect(badged).toHaveClass('is-suggested');
    expect(badged.querySelector('.cover-badge-library')).not.toBeNull();
    expect(calls.filter(call => call.path.endsWith('/holdings/lookup')).flatMap(call => call.body.books.map((item: { bookKey: string }) => item.bookKey))).not.toContain(pick.bookKey);
    view.unmount();
  });

  it('server suggestions come first; one the library is known to have shows its badge with no check; opened and saved are counted', async () => {
    const inLibrary = { bookKey: 'v1:openlibrary:OL900W', title: 'Found Here', authors: ['Library Author'], workId: 'OL900W', inLibrary: true };
    const related = { bookKey: 'v1:openlibrary:OL901W', title: 'Related Book', authors: ['Related Author'], workId: 'OL901W' };
    const calls = stubApi({ suggestions: body => body.excludeKeys.includes(inLibrary.bookKey) ? [related] : [inLibrary, related] });
    seed({ saved: [book(1)], recent: [{ ...book(2), viewedAt: '2026-02-01T00:00:00.000Z' }], libraryId: LIBRARY.id });
    const view = renderHome();
    const badged = await screen.findByRole('link', { name: 'Found Here by Library Author, in Anna Centenary Library, suggested' });
    expect(badged.querySelector('.cover-badge-library')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Related Book by Related Author, suggested' }).querySelector('.cover-badge-library')).toBeNull();
    // After the server's books, the seed list: five in all.
    expect(suggestedLinks().map(link => link.getAttribute('aria-label')).slice(2)).toEqual(SUGGESTED.slice(0, 3));
    const asked = calls.filter(call => call.path === '/api/v2/suggestions');
    expect(asked.map(call => call.body)).toEqual([{ libraryId: LIBRARY.id, recentBookKeys: [book(2).bookKey, book(1).bookKey], excludeKeys: [book(1).bookKey] }]);
    // No library check for any suggestion: only the saved book's stored answer was asked for.
    expect(calls.filter(call => call.path.endsWith('/holdings/lookup')).flatMap(call => call.body.books.map((item: { bookKey: string }) => item.bookKey))).toEqual([book(1).bookKey]);
    expect(calls.some(call => /\/holdings\/(check|search)$/.test(call.path))).toBe(false);
    expect(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)).not.toContain('OL900W');
    expect(sessionStorage.length).toBe(0);
    // The five drawn are counted as shown, once, by the app.
    const events = (kind?: string) => calls.filter(call => call.path.endsWith('/suggestions/events')).map(call => call.body).filter(body => !kind || body.event === kind);
    const drawn = [inLibrary.bookKey, related.bookKey, ...SEED_SUGGESTIONS.slice(0, 3).map(item => item.bookKey)];
    await waitFor(() => expect(events('shown')).toEqual([{ event: 'shown', bookKeys: drawn }]));

    fireEvent.click(badged);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(inLibrary.bookKey)));
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my shelf' }));
    expect(await screen.findByRole('button', { name: 'On my shelf' })).toBeInTheDocument();
    await waitFor(() => expect(events().filter(body => body.event !== 'shown'))
      .toEqual([{ event: 'opened', bookKey: inLibrary.bookKey }, { event: 'saved', bookKey: inLibrary.bookKey }]));
    // Remembered as a direct open, as before.
    expect(JSON.parse(localStorage.getItem(ANONYMOUS_WEB_STORAGE_KEY)!).recentBooks[0]).toMatchObject({ bookKey: inLibrary.bookKey, source: 'direct' });
    fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    // Saving refreshed the suggestions once, with the saved book left out.
    await screen.findByRole('heading', { name: 'My shelf' });
    const shelfCovers = () => [...document.querySelectorAll('.bay-books a')].map(link => link.getAttribute('aria-label'));
    await waitFor(() => expect(shelfCovers()[0]).toBe('Found Here by Library Author'));
    await waitFor(() => expect(calls.filter(call => call.path === '/api/v2/suggestions')).toHaveLength(2));
    expect(calls.filter(call => call.path === '/api/v2/suggestions')[1].body.excludeKeys).toEqual([inLibrary.bookKey, book(1).bookKey]);
    expect(screen.getByRole('link', { name: 'Related Book by Related Author, suggested' })).toBeInTheDocument();
    // The refresh after saving: its five counted once more.
    await waitFor(() => expect(events('shown')).toHaveLength(2));
    expect(events('shown')[1]).toEqual({ event: 'shown', bookKeys: [related.bookKey, ...SEED_SUGGESTIONS.slice(0, 4).map(item => item.bookKey)] });
    // An ordinary book opened from the shelf is not counted.
    fireEvent.click(document.querySelector<HTMLElement>('.bay-books a[aria-label^="Book 1 by Author 1"]')!);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/books/' + encodeURIComponent(book(1).bookKey)));
    await screen.findByRole('link', { name: 'Back' });
    expect(events().filter(body => body.event !== 'shown')).toHaveLength(2);
    // Back again: the same results drawn again are not counted again.
    fireEvent.click(screen.getByRole('link', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'My shelf' });
    expect(events('shown')).toHaveLength(2);
    view.unmount();
  });

  it('with a library chosen, the suggestion slots stay empty until the first answer, and nothing below moves', async () => {
    let answer!: (books: unknown[]) => void;
    const calls = stubApi();
    const fetchStub = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const fallback = fetchStub.getMockImplementation() as unknown as (path: string, init?: RequestInit) => Promise<Response>;
    fetchStub.mockImplementation((path: string, init?: RequestInit) => path === '/api/v2/suggestions'
      ? new Promise<Response>(resolve => { calls.push({ path, body: JSON.parse(String(init!.body)) }); answer = books => resolve(json({ books })); })
      : fallback(path, init));
    seed({ saved: [book(1)], libraryId: LIBRARY.id });
    renderHome();
    expect(await screen.findByRole('heading', { name: 'My shelf' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some(call => call.path === '/api/v2/suggestions')).toBe(true));
    // The saved book at once; the five slots keep their places, empty: no cover, no tag, no text.
    expect(screen.getByRole('link', { name: /^Book 1 by Author 1/ })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /, suggested$/ })).toHaveLength(0);
    expect(document.querySelectorAll('.bay-books')).toHaveLength(2);
    const held = [...document.querySelectorAll('.bay-books > li')].slice(1);
    expect(held).toHaveLength(5);
    for (const slot of held) { expect(slot).toBeEmptyDOMElement(); expect(slot).toHaveAttribute('aria-hidden', 'true'); }
    expect(document.querySelectorAll('.bay-tag')).toHaveLength(0);
    expect(calls.filter(call => call.path.endsWith('/suggestions/events'))).toHaveLength(0);
    act(() => answer([{ bookKey: 'v1:openlibrary:OL901W', title: 'Related Book', authors: ['Related Author'] }]));
    await waitFor(() => expect(suggestedLinks()).toHaveLength(5));
    expect(suggestedLinks()[0]).toHaveAccessibleName('Related Book by Related Author, suggested');
    // The first suggestions of a visit appear without motion.
    expect(document.querySelectorAll('.is-arriving, .is-turning-solid')).toHaveLength(0);
  });

  it(`an answer later than ${SUGGESTION_HOLD_MS} ms: the seed list stands in, and stays once the reader has pressed one of its books`, async () => {
    let answer!: (books: unknown[]) => void;
    stubApi();
    const fetchStub = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const fallback = fetchStub.getMockImplementation() as unknown as (path: string, init?: RequestInit) => Promise<Response>;
    fetchStub.mockImplementation((path: string, init?: RequestInit) => path === '/api/v2/suggestions'
      ? new Promise<Response>(resolve => { answer = books => resolve(json({ books })); }) : fallback(path, init));
    seed({ libraryId: LIBRARY.id });
    renderHome();
    expect(await screen.findByRole('heading', { name: 'Ready to search' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /, suggested$/ })).toHaveLength(0);
    await waitFor(() => expect(suggestedLinks()).toHaveLength(5), { timeout: SUGGESTION_HOLD_MS + 1000 });
    expect(suggestedLinks().map(link => link.getAttribute('aria-label'))).toEqual(SUGGESTED);
    // The reader presses a suggestion (and focus lands on it); the late answer then arrives.
    const pressed = suggestedLinks()[2];
    fireEvent.pointerDown(pressed);
    pressed.focus();
    await act(async () => { answer([{ bookKey: 'v1:openlibrary:OL901W', title: 'Related Book', authors: ['Related Author'] }]); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(suggestedLinks().map(link => link.getAttribute('aria-label'))).toEqual(SUGGESTED);
    expect(pressed).toHaveFocus();
  });

  it('/app/settings opens the shelf with the side panel', async () => {
    stubApi();
    renderHome('/app/settings');
    expect(await screen.findByRole('dialog', { name: 'Account and settings' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/);
  });
});
