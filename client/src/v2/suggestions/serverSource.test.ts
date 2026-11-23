import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOLDINGS_LOOKUP_LIMIT } from '../api';
import type { RecentBook } from '../types';
import type { SuggestedBook } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';
import { CANDIDATE_LIMIT, isSuggestionKey, liftFound, mergeCandidates, parseServerSuggestions, recentBookKeys, reportSuggestion, serverHasSomethingToAdd, serverKeys,
  serverSuggestions, validIsbn13 } from './serverSource';

// Valid ISBN-13s (978 + 9 digits + check digit).
const isbn = (n: number) => { const body = '978' + String(n).padStart(9, '0'); const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0); return body + ((10 - (sum % 10)) % 10); };
const at = (day: number) => new Date(Date.UTC(2026, 10, day)).toISOString();
const book = (bookKey: string, day: number, extra: Partial<RecentBook> = {}): RecentBook => ({ bookKey, title: 'T', authors: ['A'], source: 'direct', viewedAt: at(day), ...extra });
const related = (n: number, author = 'Author ' + n): SuggestedBook => ({ bookKey: 'v1:openlibrary:OL' + n + 'W', title: 'Related ' + n, authors: [author], workId: 'OL' + n + 'W' });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const keys = (books: readonly SuggestedBook[]) => books.map(item => item.bookKey);
const SEED_KEYS = keys(SEED_SUGGESTIONS);
const RELATED_PATH = '/api/v2/suggestions/related?book=';

type Call = { path: string; init: RequestInit; body: any };
/**
 * The API as the source sees it: `lists` answers each related GET by book key
 * (a function may throw for a failed request), `found` the stored answers.
 */
function stubApi({ lists = {} as Record<string, unknown>, found = [] as string[], lookupFails = false } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, init, body });
    if (path.startsWith(RELATED_PATH)) {
      const answer = lists[new URLSearchParams(path.slice(path.indexOf('?'))).get('book')!];
      if (answer instanceof Error) return Promise.reject(new TypeError('offline'));
      if (answer && typeof answer === 'object' && 'status' in answer) return Promise.resolve(json({ error: { code: 'RATE_LIMITED', message: 'Wait.' } }, (answer as { status: number }).status));
      return Promise.resolve(json(answer ?? { books: [] }));
    }
    if (path === '/api/v2/holdings/lookup') {
      if (lookupFails) return Promise.resolve(json({ error: { code: 'LIBRARY_NOT_FOUND', message: 'No.' } }, 404));
      return Promise.resolve(json({ answers: Object.fromEntries(body.books.map((item: { bookKey: string }) => [item.bookKey, found.includes(item.bookKey) ? 'found' : 'not_found'])) }));
    }
    return Promise.resolve(json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404));
  }));
  return {
    calls,
    gets: () => calls.filter(call => call.path.startsWith(RELATED_PATH)).map(call => new URLSearchParams(call.path.slice(call.path.indexOf('?'))).get('book')),
    lookups: () => calls.filter(call => call.path === '/api/v2/holdings/lookup').map(call => call.body),
  };
}
const load = (context: Parameters<typeof serverSuggestions.load>[0], previous: readonly SuggestedBook[] = []) =>
  serverSuggestions.load(context, new AbortController().signal, previous);

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe('which related lists are asked for', () => {
  it('up to three recent books, viewed or saved, newest first, each by a key the server reads', () => {
    const saved = [book('v1:openlibrary:OL1W', 3), book('v1:isbn:' + isbn(2), 5), book('v1:googlebooks:abc', 9, { isbn13: isbn(3) })];
    const recent = [book('v1:openlibrary:OL7W', 8), book('v1:openlibrary:OL1W', 10), book('v1:catalog:koha:x:1', 11), book('v1:openlibrary:OL8W', 1)];
    // OL1W (viewed on the 10th), the Google Books record by its ISBN (saved on the 9th), OL7W (8th).
    // A catalog record names no Open Library work or ISBN, so it is skipped.
    expect(recentBookKeys({ savedBooks: saved, recentBooks: recent, libraryId: 'koha:anna' })).toEqual(['v1:openlibrary:OL1W', 'v1:isbn:' + isbn(3), 'v1:openlibrary:OL7W']);
    expect(recentBookKeys({ savedBooks: [], libraryId: null })).toEqual([]);
  });

  it('a book’s keys: its own work or ISBN key, its ISBN-13, its Open Library work (display only); never one the server would refuse', () => {
    const wings = book('v1:isbn:9788173711466', 3, { isbn13: '9788173711466', workId: 'OL1037811W' });
    expect(serverKeys(wings)).toEqual(['v1:isbn:9788173711466', 'v1:openlibrary:OL1037811W']);
    expect(serverKeys(book('v1:catalog:koha:x:1', 2, { workId: 'OL2W' }))).toEqual(['v1:openlibrary:OL2W']);
    expect(serverKeys(book('v1:openlibrary:OL3W', 1, { workId: 'OL3W' }))).toEqual(['v1:openlibrary:OL3W']);
    expect(serverKeys(book('v1:isbn:9788173711466', 1, { workId: 'not a work' }))).toEqual(['v1:isbn:9788173711466']);
    expect(validIsbn13('978-81-7371-146-6')).toBe('9788173711466');
    expect(validIsbn13('9788173711467')).toBeNull();
    expect(serverKeys(book('v1:isbn:9788173711467', 1))).toEqual([]);
    expect(serverKeys(book('v1:catalog:koha:x:1', 1, { isbn13: '9788173711466' }))).toEqual(['v1:isbn:9788173711466']);
  });

  it('the source is asked only when it could add something: a chosen library or a recent book it can read', () => {
    const book1 = book('v1:openlibrary:OL7W', 1);
    expect(serverHasSomethingToAdd({ savedBooks: [], libraryId: null })).toBe(false);
    expect(serverHasSomethingToAdd({ savedBooks: [], recentBooks: [book('v1:catalog:koha:x:1', 1)], libraryId: null })).toBe(false);
    expect(serverHasSomethingToAdd({ savedBooks: [], libraryId: 'koha:anna' })).toBe(true);
    expect(serverHasSomethingToAdd({ savedBooks: [], recentBooks: [book1], libraryId: null })).toBe(true);
    expect(serverHasSomethingToAdd({ savedBooks: [book('v1:isbn:' + isbn(2), 1)], libraryId: null })).toBe(true);
    expect(serverSuggestions.wanted).toBe(serverHasSomethingToAdd);
  });
});

describe('the merge and the pick', () => {
  it('related lists in recency order, then the seed list; never a saved book or another edition of one, never one twice; bounded for the lookup', () => {
    const newest = [related(1), related(2), { ...related(3), isbn13: isbn(3) }];
    const older = [related(2), related(4), { ...related(5), title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] }];
    // Saved: work 4 itself, an edition of work 1 (its workId), and "Wings of Fire: An Autobiography".
    const saved = [book('v1:openlibrary:OL4W', 1), book('v1:isbn:' + isbn(1), 2, { workId: 'OL1W' }),
      book('v1:isbn:' + isbn(9), 3, { title: 'Wings of Fire: An Autobiography', authors: ['Kalam, A. P. J. Abdul'] })];
    const candidates = mergeCandidates([newest, older], saved);
    expect(keys(candidates).slice(0, 2)).toEqual(['v1:openlibrary:OL2W', 'v1:openlibrary:OL3W']);
    // The seed list follows (its Wings of Fire is left out too: the saved edition's title and author).
    expect(keys(candidates).slice(2)).toEqual(SEED_KEYS.slice(1));
    expect(CANDIDATE_LIMIT).toBe(HOLDINGS_LOOKUP_LIMIT);
    expect(HOLDINGS_LOOKUP_LIMIT).toBe(100);
    const many = Array.from({ length: 3 }, (_, list) => Array.from({ length: 40 }, (_, index) => related(1000 + list * 100 + index)));
    expect(mergeCandidates(many, [])).toHaveLength(CANDIDATE_LIMIT);
  });

  it('those the library is known to have come first, badged for that library; the rest keep their order', () => {
    const books = [related(1), related(2), related(3)];
    expect(liftFound(books, new Set(['v1:openlibrary:OL3W']), 'koha:anna')).toEqual([{ ...related(3), foundIn: 'koha:anna' }, related(1), related(2)]);
    expect(liftFound(books, new Set(), 'koha:anna')).toEqual(books);
  });

  it('a related list is read defensively: work and ISBN keys with a title only; no badge from the server', () => {
    expect(parseServerSuggestions([
      { bookKey: 'v1:openlibrary:OL1W', title: ' Wings of Fire ', authors: ['A. P. J. Abdul Kalam', 7], coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg', workId: 'OL1W', inLibrary: true },
      { bookKey: 'v1:isbn:' + isbn(2), title: 'An edition', authors: [], coverUrl: 'https://evil.example/c.jpg', isbn13: isbn(2) },
      { bookKey: 'not a key', title: 'X', authors: [] }, { bookKey: 'v1:openlibrary:OL3W', title: '', authors: [] }, null, 'text',
      { bookKey: 'v1:catalog:koha:x:1', title: 'A catalog record', authors: [] }, { bookKey: 'v1:googlebooks:abc', title: 'Google', authors: [] },
      { bookKey: 'v1:isbn:9788173711467', title: 'Bad check digit', authors: [] },
      { bookKey: 'v1:openlibrary:OL4W', title: 'Bad fields', authors: 'Someone', isbn13: '123', workId: 'W' },
    ])).toEqual([
      { bookKey: 'v1:openlibrary:OL1W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg', workId: 'OL1W' },
      { bookKey: 'v1:isbn:' + isbn(2), title: 'An edition', authors: [], isbn13: isbn(2) },
      { bookKey: 'v1:openlibrary:OL4W', title: 'Bad fields', authors: [] },
    ]);
  });
});

describe('the server source', () => {
  const context = { savedBooks: [book('v1:openlibrary:OL1W', 1)], recentBooks: [book('v1:openlibrary:OL2W', 2), book('v1:openlibrary:OL3W', 3), book('v1:openlibrary:OL9W', 0)],
    libraryId: 'koha:anna' };

  it('one GET per recent book (three at most), book key only, no cookies; then one stored-answers lookup for the candidates only', async () => {
    const api = stubApi({ lists: { 'v1:openlibrary:OL3W': { books: [related(30), related(31)] }, 'v1:openlibrary:OL2W': { books: [related(20), related(30)] } },
      found: [related(20).bookKey, SEED_KEYS[4]] });
    const books = await load(context);
    // Newest first: OL3W (the 3rd), OL2W, OL1W (saved on the 1st); OL9W is the fourth and is not asked.
    expect(api.gets()).toEqual(['v1:openlibrary:OL3W', 'v1:openlibrary:OL2W', 'v1:openlibrary:OL1W']);
    for (const call of api.calls.filter(item => item.path.startsWith(RELATED_PATH))) {
      expect(call.path).toMatch(/^\/api\/v2\/suggestions\/related\?book=v1%3Aopenlibrary%3AOL\d+W$/);
      expect(call.init).toMatchObject({ method: 'GET', credentials: 'omit' });
      expect(call.init.body).toBeUndefined();
    }
    // One lookup: the candidates in merge order (never the saved OL1W), the chosen library.
    expect(api.lookups()).toHaveLength(1);
    expect(api.lookups()[0]).toEqual({ libraryId: 'koha:anna', books: [30, 31, 20].map(n => ({ bookKey: related(n).bookKey })).concat(SEED_KEYS.map(bookKey => ({ bookKey }))) });
    // Found ones first with the badge, then the rest in order.
    expect(books.slice(0, 2)).toEqual([{ ...related(20), foundIn: 'koha:anna' }, { ...SEED_SUGGESTIONS[4], foundIn: 'koha:anna' }]);
    expect(keys(books.slice(2, 4))).toEqual([related(30).bookKey, related(31).bookKey]);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('no library: no lookup; a library and nothing recent: only the lookup, for the seed list; the lookup body fits its limits', async () => {
    const noLibrary = stubApi({ lists: { 'v1:openlibrary:OL2W': { books: [related(20)] } } });
    expect(keys(await load({ ...context, libraryId: null })).slice(0, 1)).toEqual([related(20).bookKey]);
    expect(noLibrary.lookups()).toEqual([]);
    const onlyLibrary = stubApi({ found: [SEED_KEYS[2]] });
    const books = await load({ savedBooks: [], libraryId: 'koha:anna' });
    expect(onlyLibrary.gets()).toEqual([]);
    expect(onlyLibrary.lookups()).toHaveLength(1);
    expect(books[0]).toEqual({ ...SEED_SUGGESTIONS[2], foundIn: 'koha:anna' });
    // The largest candidate list: at most 100 books, and well under the server's 10 kB body limit.
    const big = Array.from({ length: 40 }, (_, index) => ({ ...related(100000000 + index), isbn13: isbn(index + 1) }));
    const bigApi = stubApi({ lists: { 'v1:openlibrary:OL2W': { books: big }, 'v1:openlibrary:OL3W': { books: big.map((item, index) => ({ ...item, ...related(200000000 + index), isbn13: isbn(100 + index) })) },
      'v1:openlibrary:OL1W': { books: big.map((item, index) => ({ ...item, ...related(300000000 + index), isbn13: isbn(200 + index) })) } } });
    await load(context);
    expect(bigApi.lookups()[0].books).toHaveLength(HOLDINGS_LOOKUP_LIMIT);
    expect(JSON.stringify(bigApi.lookups()[0]).length).toBeLessThan(10 * 1024);
  });

  it('every related list failing rejects (the hook keeps the last books); the lookup is then not asked', async () => {
    const api = stubApi({ lists: { 'v1:openlibrary:OL3W': new Error(), 'v1:openlibrary:OL2W': { status: 429 }, 'v1:openlibrary:OL1W': { status: 503 } } });
    await expect(load(context, [related(1)])).rejects.toThrow();
    expect(api.lookups()).toEqual([]);
  });

  it('some lists failing or partial: the fresh books first, then the last ones; a complete answer is the truth', async () => {
    const previous = [related(1), related(2)];
    stubApi({ lists: { 'v1:openlibrary:OL3W': new Error(), 'v1:openlibrary:OL2W': { books: [related(9), related(2)] } }, found: [SEED_KEYS[0]] });
    const merged = await load(context, previous);
    // Those the library has and the related books, then the last ones not among them; the seed list follows in the pick.
    expect(keys(merged)).toEqual([SEED_KEYS[0], related(9).bookKey, related(2).bookKey, related(1).bookKey]);
    stubApi({ lists: { 'v1:openlibrary:OL3W': { books: [related(9)], partial: true } } });
    expect(keys(await load({ ...context, libraryId: null }, previous))).toEqual([related(9).bookKey, related(1).bookKey, related(2).bookKey]);
    // Complete: no last books, the seed list after the related ones.
    stubApi({ lists: { 'v1:openlibrary:OL3W': { books: [related(9)] } } });
    expect(keys(await load({ ...context, libraryId: null }, previous))).toEqual([related(9).bookKey, ...SEED_KEYS]);
  });

  it('a failed lookup is no badge, never "not found"; an aborted refresh rejects', async () => {
    stubApi({ lists: { 'v1:openlibrary:OL3W': { books: [related(9)] } }, lookupFails: true });
    const books = await load(context);
    expect(keys(books)).toEqual([related(9).bookKey, ...SEED_KEYS]);
    expect(books.some(item => 'foundIn' in item)).toBe(false);
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_path: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = serverSuggestions.load(context, controller.signal, []);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it('counts are fire-and-forget, work and ISBN keys only, opened and saved only', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((path: string, init: RequestInit) => { sent.push([path, JSON.parse(String(init.body))]); return Promise.reject(new TypeError('offline')); }));
    expect(() => reportSuggestion('opened', 'v1:openlibrary:OL1W')).not.toThrow();
    reportSuggestion('saved', 'v1:catalog:koha:x:1');
    reportSuggestion('saved', 'v1:isbn:' + isbn(2));
    await Promise.resolve();
    expect(sent).toEqual([
      ['/api/v2/suggestions/events', { event: 'opened', bookKey: 'v1:openlibrary:OL1W' }],
      ['/api/v2/suggestions/events', { event: 'saved', bookKey: 'v1:isbn:' + isbn(2) }],
    ]);
    expect(isSuggestionKey('v1:openlibrary:OL1W')).toBe(true);
    expect(isSuggestionKey('v1:openlibrary:OL1M')).toBe(false);
    expect(isSuggestionKey('v1:isbn:' + isbn(2))).toBe(true);
    expect(isSuggestionKey('v1:catalog:koha:x:1')).toBe(false);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
