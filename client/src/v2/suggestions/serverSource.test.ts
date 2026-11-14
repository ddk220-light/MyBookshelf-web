import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecentBook } from '../types';
import { EXCLUDE_KEYS, isSuggestionKey, parseServerSuggestions, reportShown, reportSuggestion, serverHasSomethingToAdd, serverKeys, serverSuggestions, suggestionRequest, validIsbn13 } from './serverSource';

// Valid ISBN-13s (978 + 9 digits + check digit).
const isbn = (n: number) => { const body = '978' + String(n).padStart(9, '0'); const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0); return body + ((10 - (sum % 10)) % 10); };
const at = (day: number) => new Date(Date.UTC(2026, 10, day)).toISOString();
const book = (bookKey: string, day: number, extra: Partial<RecentBook> = {}): RecentBook => ({ bookKey, title: 'T', authors: ['A'], source: 'direct', viewedAt: at(day), ...extra });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('the suggestions request', () => {
  it('sends the chosen library, up to three recent books (viewed or saved, newest first) and the saved books’ keys', () => {
    const saved = [book('v1:openlibrary:OL1W', 3), book('v1:isbn:' + isbn(2), 5), book('v1:googlebooks:abc', 9, { isbn13: isbn(3) })];
    const recent = [book('v1:openlibrary:OL7W', 8), book('v1:openlibrary:OL1W', 10), book('v1:catalog:koha:x:1', 11), book('v1:openlibrary:OL8W', 1)];
    expect(suggestionRequest({ savedBooks: saved, recentBooks: recent, libraryId: 'koha:anna' })).toEqual({
      libraryId: 'koha:anna',
      // OL1W (viewed on the 10th), the Google Books record by its ISBN (saved on the 9th), OL7W (8th).
      // A catalog record names no Open Library work, so it is skipped.
      recentBookKeys: ['v1:openlibrary:OL1W', 'v1:isbn:' + isbn(3), 'v1:openlibrary:OL7W'],
      // Saved, newest first: only keys a server suggestion could have.
      excludeKeys: ['v1:isbn:' + isbn(3), 'v1:isbn:' + isbn(2), 'v1:openlibrary:OL1W'],
    });
    // No library chosen: no libraryId at all; nothing viewed or saved: empty lists.
    expect(suggestionRequest({ savedBooks: [], libraryId: null })).toEqual({ recentBookKeys: [], excludeKeys: [] });
  });

  it('also leaves out the Open Library work of a saved edition whose work is known (display only)', () => {
    // Wings of Fire saved as an ISBN edition from a book page that knew its work.
    const wings = book('v1:isbn:9788173711466', 3, { isbn13: '9788173711466', workId: 'OL1037811W' });
    const catalogCopy = book('v1:catalog:koha:x:1', 2, { workId: 'OL2W' });
    expect(serverKeys(wings)).toEqual(['v1:isbn:9788173711466', 'v1:openlibrary:OL1037811W']);
    expect(serverKeys(catalogCopy)).toEqual(['v1:openlibrary:OL2W']);
    expect(serverKeys(book('v1:openlibrary:OL3W', 1, { workId: 'OL3W' }))).toEqual(['v1:openlibrary:OL3W']);
    expect(serverKeys(book('v1:isbn:9788173711466', 1, { workId: 'not a work' }))).toEqual(['v1:isbn:9788173711466']);
    expect(suggestionRequest({ savedBooks: [wings, catalogCopy], libraryId: null })).toEqual({
      recentBookKeys: ['v1:isbn:9788173711466', 'v1:openlibrary:OL2W'],
      excludeKeys: ['v1:isbn:9788173711466', 'v1:openlibrary:OL1037811W', 'v1:openlibrary:OL2W'],
    });
  });

  it('is sent only when the server could add something: a chosen library or a recent book it can read', () => {
    expect(serverHasSomethingToAdd({ savedBooks: [], libraryId: null })).toBe(false);
    expect(serverHasSomethingToAdd({ savedBooks: [], recentBooks: [book('v1:catalog:koha:x:1', 1)], libraryId: null })).toBe(false);
    expect(serverHasSomethingToAdd({ savedBooks: [], libraryId: 'koha:anna' })).toBe(true);
    expect(serverHasSomethingToAdd({ savedBooks: [], recentBooks: [book('v1:openlibrary:OL7W', 1)], libraryId: null })).toBe(true);
    expect(serverHasSomethingToAdd({ savedBooks: [book('v1:isbn:' + isbn(2), 1)], libraryId: null })).toBe(true);
    expect(serverSuggestions.wanted).toBe(serverHasSomethingToAdd);
  });

  it('never sends a key the server would refuse, and at most 200 saved keys', () => {
    expect(validIsbn13('978-81-7371-146-6')).toBe('9788173711466');
    expect(validIsbn13('9788173711467')).toBeNull();
    expect(serverKeys(book('v1:isbn:9788173711467', 1))).toEqual([]);
    expect(serverKeys(book('v1:catalog:koha:x:1', 1, { isbn13: '9788173711466' }))).toEqual(['v1:isbn:9788173711466']);
    expect(serverKeys(book('v1:isbn:9788173711466', 1, { isbn13: '9788173711466' }))).toEqual(['v1:isbn:9788173711466']);
    const many = Array.from({ length: 150 }, (_, index) => book('v1:openlibrary:OL' + (index + 1) + 'W', 1, { isbn13: isbn(index + 1) }));
    const { excludeKeys } = suggestionRequest({ savedBooks: many, libraryId: null });
    expect(excludeKeys).toHaveLength(EXCLUDE_KEYS);
    expect(new Set(excludeKeys).size).toBe(EXCLUDE_KEYS);
  });
});

describe('the server’s answer', () => {
  it('is read defensively; inLibrary becomes the asked library’s badge', () => {
    const books = parseServerSuggestions([
      { bookKey: 'v1:openlibrary:OL1W', title: ' Wings of Fire ', authors: ['A. P. J. Abdul Kalam', 7], coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg', workId: 'OL1W', inLibrary: true },
      { bookKey: 'v1:isbn:' + isbn(2), title: 'An edition', authors: [], coverUrl: 'https://evil.example/c.jpg', isbn13: isbn(2), inLibrary: 'yes' },
      { bookKey: 'not a key', title: 'X', authors: [] }, { bookKey: 'v1:openlibrary:OL3W', title: '', authors: [] }, null, 'text',
      // Only work and ISBN keys: never a library's own record or another source's.
      { bookKey: 'v1:catalog:koha:x:1', title: 'A catalog record', authors: [] }, { bookKey: 'v1:googlebooks:abc', title: 'Google', authors: [] },
      { bookKey: 'v1:isbn:9788173711467', title: 'Bad check digit', authors: [] },
      { bookKey: 'v1:openlibrary:OL4W', title: 'Bad fields', authors: 'Someone', isbn13: '123', workId: 'W' },
    ], 'koha:anna');
    expect(books).toEqual([
      { bookKey: 'v1:openlibrary:OL1W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg', workId: 'OL1W', foundIn: 'koha:anna' },
      { bookKey: 'v1:isbn:' + isbn(2), title: 'An edition', authors: [], isbn13: isbn(2) },
      { bookKey: 'v1:openlibrary:OL4W', title: 'Bad fields', authors: [] },
    ]);
    // Without a chosen library there is no badge to give.
    expect(parseServerSuggestions([{ bookKey: 'v1:openlibrary:OL1W', title: 'T', authors: [], inLibrary: true }], null)[0]).not.toHaveProperty('foundIn');
  });

  it('the source posts book keys only (no search text, URL or storage) and returns the books', async () => {
    const calls: Array<{ path: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
      calls.push({ path, init });
      return Promise.resolve(json({ books: [{ bookKey: 'v1:openlibrary:OL9W', title: 'Nine', authors: ['N'], inLibrary: true }] }));
    }));
    const controller = new AbortController();
    const books = await serverSuggestions.load({ savedBooks: [book('v1:openlibrary:OL1W', 1)], recentBooks: [book('v1:openlibrary:OL2W', 2)], libraryId: 'koha:anna' }, controller.signal, []);
    expect(books).toEqual([{ bookKey: 'v1:openlibrary:OL9W', title: 'Nine', authors: ['N'], foundIn: 'koha:anna' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/v2/suggestions');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.signal).toBe(controller.signal);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ libraryId: 'koha:anna', recentBookKeys: ['v1:openlibrary:OL2W', 'v1:openlibrary:OL1W'], excludeKeys: ['v1:openlibrary:OL1W'] });
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('a failed request rejects (the hook keeps the last books); a partial answer adds its books before the last ones', async () => {
    const context = { savedBooks: [], libraryId: null };
    const previous = [{ bookKey: 'v1:openlibrary:OL1W', title: 'One', authors: ['A'] }, { bookKey: 'v1:openlibrary:OL2W', title: 'Two', authors: ['B'] }];
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ error: { code: 'RATE_LIMITED', message: 'Wait.' } }, 429))));
    await expect(serverSuggestions.load(context, new AbortController().signal, previous)).rejects.toThrow();
    // Partial and empty: the last books, unchanged.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ books: [], partial: true }))));
    expect(await serverSuggestions.load(context, new AbortController().signal, previous)).toEqual(previous);
    // Partial with books: the new ones first, then the last ones not among them (the pick chooses five).
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ books: [{ bookKey: 'v1:openlibrary:OL9W', title: 'Nine', authors: [] },
      { bookKey: 'v1:openlibrary:OL2W', title: 'Two', authors: ['B'] }], partial: true }))));
    expect((await serverSuggestions.load(context, new AbortController().signal, previous)).map(item => item.bookKey))
      .toEqual(['v1:openlibrary:OL9W', 'v1:openlibrary:OL2W', 'v1:openlibrary:OL1W']);
    // A complete answer is the truth, even an empty one.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ books: [{ bookKey: 'v1:openlibrary:OL9W', title: 'Nine', authors: [] }] }))));
    expect(await serverSuggestions.load(context, new AbortController().signal, previous)).toHaveLength(1);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({ books: [] }))));
    expect(await serverSuggestions.load(context, new AbortController().signal, previous)).toEqual([]);
  });

  it('counts are fire-and-forget, work and ISBN keys only; "shown" carries the five drawn for one refresh', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => { sent.push([path, JSON.parse(String(init.body))]); return Promise.reject(new TypeError('offline')); }));
    expect(() => reportSuggestion('opened', 'v1:openlibrary:OL1W')).not.toThrow();
    reportSuggestion('saved', 'v1:catalog:koha:x:1');
    reportShown(['v1:openlibrary:OL1W', 'v1:isbn:' + isbn(2), 'v1:openlibrary:OL1W', 'v1:googlebooks:x', 'v1:openlibrary:OL3W', 'v1:openlibrary:OL4W',
      'v1:openlibrary:OL5W', 'v1:openlibrary:OL6W']);
    reportShown(['v1:catalog:koha:x:1']);
    await Promise.resolve();
    expect(sent).toEqual([
      ['/api/v2/suggestions/events', { event: 'opened', bookKey: 'v1:openlibrary:OL1W' }],
      ['/api/v2/suggestions/events', { event: 'shown', bookKeys: ['v1:openlibrary:OL1W', 'v1:isbn:' + isbn(2), 'v1:openlibrary:OL3W', 'v1:openlibrary:OL4W', 'v1:openlibrary:OL5W'] }],
    ]);
    expect(isSuggestionKey('v1:openlibrary:OL1W')).toBe(true);
    expect(isSuggestionKey('v1:openlibrary:OL1M')).toBe(false);
    expect(isSuggestionKey('v1:isbn:' + isbn(2))).toBe(true);
    expect(isSuggestionKey('v1:catalog:koha:x:1')).toBe(false);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
