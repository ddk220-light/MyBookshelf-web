import { StrictMode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { ANONYMOUS_WEB_STORAGE_KEY } from '../../localState';
import { forgetDeskMemory } from '../desk/DeskLayout';

// This file crosses the phone and desktop layouts: the media lists the app
// caches (useMediaQuery) belong to this file only and follow `width`.
let width = 390;
const mediaLists: Array<{ query: string; listeners: Set<() => void> }> = [];
const matches = (query: string) => { const min = /min-(width|height):\s*(\d+)px/.exec(query); return min ? (min[1] === 'width' ? width : 900) >= Number(min[2]) : false; };
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (query: string) => {
    const list = { query, listeners: new Set<() => void>() };
    mediaLists.push(list);
    return { get matches() { return matches(query); }, media: query, onchange: null, dispatchEvent: () => false, addListener() {}, removeListener() {},
      addEventListener: (_: string, listener: () => void) => list.listeners.add(listener), removeEventListener: (_: string, listener: () => void) => list.listeners.delete(listener) };
  } });
});
async function resizeTo(next: number) {
  await act(async () => {
    const changed = mediaLists.map(list => ({ list, before: matches(list.query) }));
    width = next;
    for (const { list, before } of changed) if (matches(list.query) !== before) for (const listener of [...list.listeners]) listener();
  });
}
const wait = (ms = 30) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

const LIBRARY = { id: 'bc:denver', name: 'Denver Public Library', city: 'Denver', region: 'Colorado', country: 'US', health: 'operational', catalogUrl: 'https://catalog.example.test/',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const OTHER = { ...LIBRARY, id: 'bc:boulder', name: 'Boulder Public Library', city: 'Boulder', catalogUrl: 'https://other.example.test/' };
const BOOK = { bookKey: 'v1:openlibrary:OL66554W', workId: 'OL66554W', title: 'Pride and Prejudice', authors: ['Jane Austen'] };
const SECOND = { bookKey: 'v1:openlibrary:OL77W', workId: 'OL77W', title: 'Emma', authors: ['Jane Austen'] };
const RECORD = 'https://catalog.example.test/record/1';
const ROWS = [{ title: 'Pride and prejudice', author: 'Austen, Jane', url: RECORD }, { title: 'Pride and prejudice : a graphic novel' }];
const FOUND = { answer: 'found', catalogUrl: RECORD, catalogLinkKind: 'record', matches: ROWS };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

type Check = { libraryId: string; bookKey: string; signal: AbortSignal; answer: (reply: unknown) => Promise<void> };
/** The app's API; a check waits for `answer()` unless `reply` answers at once. */
function stubApi({ reply, held = [] as string[], resolveBook = (body: { bookKey: string }) => Promise.resolve(json({ book: [BOOK, SECOND].find(book => book.bookKey === body.bookKey) })) }: {
  reply?: (index: number) => unknown; held?: string[]; resolveBook?: (body: { bookKey: string }) => Promise<Response>;
} = {}) {
  const checks: Check[] = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path.endsWith('/capabilities')) return Promise.resolve(json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin }));
    if (path.endsWith('/session')) return Promise.resolve(json({ status: 'guest' }));
    if (path.endsWith('/libraries/resolve')) return Promise.resolve(json({ library: [LIBRARY, OTHER].find(library => library.id === body.libraryId) }));
    if (path.endsWith('/libraries/discover')) return Promise.resolve(json({ libraries: [LIBRARY, OTHER], total: 2, nextOffset: null }));
    if (path.endsWith('/books/resolve')) return resolveBook(body);
    if (path.endsWith('/holdings/lookup')) return Promise.resolve(json({ answers: Object.fromEntries(body.books.filter((book: { bookKey: string }) => held.includes(book.bookKey)).map((book: { bookKey: string }) => [book.bookKey, 'found'])) }));
    if (path.endsWith('/holdings/check')) return new Promise<Response>((resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      const answer = (data: unknown) => act(async () => { resolve(json(data)); await new Promise(done => setTimeout(done, 0)); });
      checks.push({ ...body, signal: init!.signal!, answer });
      if (reply) resolve(json(reply(checks.length)));
    });
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return checks;
}
let go: ReturnType<typeof useNavigate>;
function Nav() { go = useNavigate(); return <output data-testid="location">{useLocation().pathname}</output>; }
function open({ saved = [] as unknown[], at = [BOOK.bookKey], strict = false } = {}) {
  localStorage.setItem(ANONYMOUS_WEB_STORAGE_KEY, JSON.stringify({ version: 2, selectedLibraryId: LIBRARY.id, recentBooks: [], savedBooks: saved, savedContent: [] }));
  const app = <MemoryRouter initialEntries={at.map(key => key === '/' ? key : '/app/books/' + encodeURIComponent(key))}><AnonymousWebApp /><Nav /></MemoryRouter>;
  return render(strict ? <StrictMode>{app}</StrictMode> : app);
}
const SAVED = { ...BOOK, source: 'search', viewedAt: '2026-01-01T00:00:00.000Z' };
const card = (name: string) => screen.findByRole('group', { name });
const entries = () => [...document.querySelectorAll('.library-answer-matches li')].map(item => item.firstChild?.firstChild?.textContent);
/** The book's cover on the reading shelf (not its spine under Viewed before). */
const shelf = async (marked = '') => within(await screen.findByRole('region', { name: 'My reading shelf' }))
  .findByRole('link', { name: new RegExp('^Pride and Prejudice by Jane Austen' + marked) });
const TITLES = ROWS.map(row => row.title);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); forgetDeskMemory(); width = 390; });

describe('a found book’s entries', () => {
  it('open, back, open again: the entries show with no second request', async () => {
    const checks = stubApi({ reply: () => FOUND });
    open({ saved: [SAVED], at: ['/'] });
    fireEvent.click(await shelf());
    await card('In your library');
    expect(entries()).toEqual(TITLES);
    await act(async () => { go(-1); });
    fireEvent.click(await shelf());
    const again = await card('In your library');
    expect(entries()).toEqual(TITLES);
    expect(within(again).getByRole('link', { name: /^See this book/ })).toHaveAttribute('href', RECORD);
    await wait();
    expect(checks).toHaveLength(1);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('graphic novel');
  });

  it('a find the server stored has no entries: its link only, and it is not asked for again', async () => {
    const checks = stubApi({ reply: () => ({ ...FOUND, matches: undefined }) });
    open({ saved: [SAVED], at: ['/'] });
    for (let visit = 0; visit < 2; visit += 1) {
      fireEvent.click(await shelf());
      const group = await card('In your library');
      await waitFor(() => expect(within(group).getByRole('link', { name: /^See this book/ })).toHaveAttribute('href', RECORD));
      expect(entries()).toEqual([]);
      await act(async () => { go(-1); });
    }
    expect(checks).toHaveLength(1);
  });

  it('without a record link a second open asks again, with the entries shown meanwhile, and a reply without entries keeps them', async () => {
    const checks = stubApi();
    open({ saved: [SAVED], at: ['/'] });
    fireEvent.click(await shelf());
    await waitFor(() => expect(checks).toHaveLength(1));
    await checks[0].answer({ answer: 'found', matches: ROWS.map(({ title }) => ({ title })) });
    expect(entries()).toEqual(TITLES);
    await act(async () => { go(-1); });
    fireEvent.click(await shelf());
    await waitFor(() => expect(checks).toHaveLength(2));
    await card('In your library');
    expect(entries()).toEqual(TITLES);
    await checks[1].answer({ answer: 'found' });
    expect(entries()).toEqual(TITLES);
  });

  it('a check that fails or says otherwise never takes a known find away', async () => {
    for (const reply of [{ answer: 'unknown', reason: 'timeout' }, { answer: 'unconfirmed' }, { answer: 'not_found' }, { answer: 'nonsense' }]) {
      const checks = stubApi({ held: [BOOK.bookKey] });
      open({ saved: [SAVED], at: ['/'] });
      fireEvent.click(await shelf(', in Denver Public Library'));
      await waitFor(() => expect(checks).toHaveLength(1));
      await card('In your library');
      await checks[0].answer(reply);
      const group = await card('In your library');
      expect(within(group).queryByRole('button', { name: 'Try again' })).toBeNull();
      await act(async () => { go(-1); });
      expect(await shelf()).toHaveAccessibleName('Pride and Prejudice by Jane Austen, in Denver Public Library');
      cleanup(); vi.unstubAllGlobals(); localStorage.clear();
    }
  });
});

describe('one check per opening of a book', () => {
  it('crossing the phone and desktop layouts keeps the running check, then its answer', async () => {
    const checks = stubApi();
    open();
    await waitFor(() => expect(checks).toHaveLength(1));
    await resizeTo(1280);
    expect(document.querySelector('.desk-slot .shelf-book')).not.toBeNull();
    await resizeTo(390);
    await resizeTo(800);
    await wait();
    expect(checks).toHaveLength(1);
    expect(checks[0].signal.aborted).toBe(false);
    await checks[0].answer({ answer: 'not_found' });
    await card('Not in your library');
    for (const next of [390, 1280, 390]) {
      await resizeTo(next);
      await card('Not in your library');
    }
    await wait();
    expect(checks).toHaveLength(1);
  });

  it('a direct visit whose book details are read again after the crossing keeps its check meanwhile', async () => {
    const waiting: Array<() => void> = [];
    let slow = false;
    const checks = stubApi({ resolveBook: () => slow ? new Promise(resolve => waiting.push(() => resolve(json({ book: BOOK })))) : Promise.resolve(json({ book: BOOK })) });
    open();
    await waitFor(() => expect(checks).toHaveLength(1));
    slow = true;
    await resizeTo(1280);
    await wait(60);
    expect(waiting).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Checking your library…' })).toBeNull();
    expect(checks[0].signal.aborted).toBe(false);
    await checks[0].answer(FOUND);
    await act(async () => { waiting[0](); });
    await card('In your library');
    expect(entries()).toEqual(TITLES);
    await wait();
    expect(checks).toHaveLength(1);
  });

  it('StrictMode (the page’s effects run twice as it opens) asks once', async () => {
    const checks = stubApi();
    open({ saved: [SAVED], at: ['/'], strict: true });
    fireEvent.click(await shelf());
    await waitFor(() => expect(checks).toHaveLength(1));
    await wait();
    expect(checks).toHaveLength(1);
    expect(checks[0].signal.aborted).toBe(false);
    await checks[0].answer({ answer: 'not_found' });
    await card('Not in your library');
  });

  it('Try again asks; the crossing after it keeps that second check and its answer', async () => {
    const checks = stubApi();
    open();
    await waitFor(() => expect(checks).toHaveLength(1));
    await checks[0].answer({ answer: 'unknown', reason: 'busy' });
    await resizeTo(1280);
    fireEvent.click(within(await card('Couldn’t check right now')).getByRole('button', { name: 'Try again' }));
    await card('Checking your library…');
    await waitFor(() => expect(checks).toHaveLength(2));
    await resizeTo(390);
    await wait();
    expect(checks).toHaveLength(2);
    expect(checks[1].signal.aborted).toBe(false);
    await checks[1].answer({ answer: 'not_found' });
    await card('Not in your library');
    await resizeTo(1280);
    await card('Not in your library');
    expect(checks).toHaveLength(2);
  });

  it('leaving the book cancels its check, and coming back asks again', async () => {
    const checks = stubApi();
    open({ at: ['/', BOOK.bookKey] });
    await act(async () => { go(-1); });
    await act(async () => { go(1); });
    await waitFor(() => expect(checks.length).toBeGreaterThan(0));
    const first = checks[checks.length - 1];
    await act(async () => { go(-1); });
    await waitFor(() => expect(first.signal.aborted).toBe(true));
    const asked = checks.length;
    await act(async () => { go(1); });
    await waitFor(() => expect(checks).toHaveLength(asked + 1));
    await checks[checks.length - 1].answer({ answer: 'not_found' });
    await card('Not in your library');
    await act(async () => { go(-1); });
    await wait();
    await act(async () => { go(1); });
    await waitFor(() => expect(checks).toHaveLength(asked + 2));
  });

  it('another book and another library each ask, and cancel the check they replace', async () => {
    const checks = stubApi();
    open({ at: [BOOK.bookKey] });
    await waitFor(() => expect(checks).toHaveLength(1));
    await act(async () => { go('/app/books/' + encodeURIComponent(SECOND.bookKey)); });
    await waitFor(() => expect(checks).toHaveLength(2));
    await waitFor(() => expect(checks[0].signal.aborted).toBe(true));
    expect(checks[1].bookKey).toBe(SECOND.bookKey);
    await checks[1].answer({ answer: 'not_found' });
    fireEvent.click(within(await card('Not in your library')).getByRole('button', { name: 'Try another library' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change library' });
    fireEvent.change(within(dialog).getByLabelText('City, town or library name'), { target: { value: 'Boulder' } });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Boulder Public Library/ }));
    await waitFor(() => expect(checks).toHaveLength(3));
    expect(checks[2]).toMatchObject({ libraryId: OTHER.id, bookKey: SECOND.bookKey });
    await card('Checking your library…');
    await checks[2].answer({ answer: 'found' });
    await card('In your library');
    await wait();
    expect(checks).toHaveLength(3);
  });
});
