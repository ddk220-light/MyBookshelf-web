import { describe, expect, it, vi } from 'vitest';
import { PublicApiError } from '../../api';
import { candidatesFor, queryForCandidates, shelfMatchesFor } from '../../searchMemory';
import type { PublicBook, RecentBook } from '../../types';
import { matchesQuery, ownMatches, resultEntries } from './searchResults';
import { runBookSearch } from './useBookSearch';

const saved = (key: string, title: string, authors: string[], day: number, isbn13?: string): RecentBook =>
  ({ bookKey: key, title, authors, isbn13, source: 'search', viewedAt: new Date(Date.UTC(2026, 0, day)).toISOString() });
const book = (key: string, title: string, authors: string[], extra: Partial<PublicBook> = {}): PublicBook => ({ bookKey: key, title, authors, ...extra });

const KALAM = saved('v1:isbn:9788173711466', 'Wings of Fire: An Autobiography', ['A. P. J. Abdul Kalam'], 3, '9788173711466');
const GUIDE = saved('v1:openlibrary:OL1W', 'The Guide', ['R. K. Narayan'], 5);
const OLDER = saved('v1:openlibrary:OL2W', 'Wings of Fire', ['Tui T. Sutherland'], 1);

describe('own matches', () => {
  it('match every query word against the start of a title or author word, accents folded', () => {
    expect(matchesQuery(KALAM, 'wings of fire')).toBe(true);
    expect(matchesQuery(KALAM, 'wing fir')).toBe(true);
    expect(matchesQuery(KALAM, 'apj kalam')).toBe(true);
    expect(matchesQuery(KALAM, 'wings of water')).toBe(false);
    expect(matchesQuery(saved('k', 'Les Misérables', ['Victor Hugo'], 1), 'miserables')).toBe(true);
    expect(matchesQuery(KALAM, '  ')).toBe(false);
  });

  it('come first, most recently added first, then public results without the records already shown', () => {
    const shelf = [OLDER, GUIDE, KALAM];
    const publicBooks = [
      book('v1:openlibrary:OL9W', 'Wings of Fire', ['Dale Brown']),
      // The same record as a saved book, by bookKey: shown once, as mine.
      book(OLDER.bookKey, 'Wings of Fire', ['Tui T. Sutherland']),
      // The same record by ISBN-13 under another key: shown once, as mine.
      book('v1:googlebooks:abc', 'Wings of Fire', ['A. P. J. Abdul Kalam'], { isbn13: '9788173711466' }),
    ];
    const own = ownMatches(shelf, 'wings of fire', publicBooks);
    expect(own.map(item => item.bookKey)).toEqual([KALAM.bookKey, OLDER.bookKey]);
    const entries = resultEntries({ savedBooks: shelf, ownKeys: own.map(item => item.bookKey), publicBooks, candidateId: 'c1' });
    expect(entries.map(entry => [entry.key, entry.mine])).toEqual([[KALAM.bookKey, true], [OLDER.bookKey, true], ['v1:openlibrary:OL9W', false]]);
    expect(entries[0].state).toMatchObject({ from: 'search', searchState: { candidateId: 'c1', shelf: true } });
  });

  it('a saved book that is the same record as a public result is listed even when its title words differ', () => {
    const renamed = saved('v1:isbn:9780000000002', 'Agni Siragugal', ['Kalam'], 2, '9780000000002');
    const own = ownMatches([renamed], 'wings of fire', [book('v1:googlebooks:x', 'Wings of Fire', ['Kalam'], { isbn13: '9780000000002' })]);
    expect(own).toEqual([renamed]);
  });

  it('never treat a same-title edition as the saved book: identity is bookKey or ISBN-13 only', () => {
    const shelf = [KALAM];
    const otherEdition = book('v1:isbn:9788173711467', 'Wings of Fire: An Autobiography', ['A. P. J. Abdul Kalam'], { isbn13: '9788173711467' });
    const entries = resultEntries({ savedBooks: shelf, ownKeys: ownMatches(shelf, 'wings of fire', [otherEdition]).map(item => item.bookKey), publicBooks: [otherEdition], candidateId: 'c2' });
    expect(entries.map(entry => [entry.key, entry.mine])).toEqual([[KALAM.bookKey, true], [otherEdition.bookKey, false]]);
  });

  it('a public result saved later keeps its place and gains the badge; a removed own match drops out', () => {
    const publicBooks = [book('v1:openlibrary:OL5W', 'Wings', ['Someone'])];
    const later = saved('v1:openlibrary:OL5W', 'Wings', ['Someone'], 9);
    const entries = resultEntries({ savedBooks: [later], ownKeys: [GUIDE.bookKey], publicBooks, candidateId: 'c3' });
    expect(entries.map(entry => [entry.key, entry.mine])).toEqual([['v1:openlibrary:OL5W', true]]);
  });

  it('show nine at most and group duplicate records for display as the search page does', () => {
    const publicBooks = [
      book('v1:openlibrary:OL100W', 'Same Book', ['Same Author'], { workId: 'OL100W' }),
      book('v1:isbn:9781111111111', 'Same Book', ['Same Author'], { workId: 'OL100W', isbn13: '9781111111111' }),
      ...Array.from({ length: 12 }, (_, index) => book('v1:openlibrary:OL' + (200 + index) + 'W', 'Title ' + index, ['Author ' + index])),
    ];
    const entries = resultEntries({ savedBooks: [], ownKeys: [], publicBooks, candidateId: 'c4' });
    expect(entries).toHaveLength(9);
    expect(entries[0].key).toBe('v1:openlibrary:OL100W');
    expect(entries[1].key).toBe('v1:openlibrary:OL200W');
  });
});

describe('runBookSearch', () => {
  const signal = () => new AbortController().signal;

  it('offline: fails without a request', async () => {
    const api = { searchBooks: vi.fn() };
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(await runBookSearch('wings', [], signal(), api)).toEqual({ kind: 'failed' });
      expect(api.searchBooks).not.toHaveBeenCalled();
    } finally { online.mockRestore(); }
  });

  it('a server or network failure is "failed", never an empty result', async () => {
    for (const failure of [new PublicApiError({ code: 'METADATA_UNAVAILABLE', status: 503 }), new PublicApiError({ code: 'NETWORK_ERROR' }), new Error('boom')]) {
      const api = { searchBooks: vi.fn().mockRejectedValue(failure) };
      expect(await runBookSearch('wings', [], signal(), api)).toEqual({ kind: 'failed' });
    }
    const partial = { searchBooks: vi.fn().mockResolvedValue({ kind: 'candidates', candidates: [], partial: true }) };
    expect(await runBookSearch('wings', [], signal(), partial)).toEqual({ kind: 'failed' });
  });

  it('a definite "no book" is an empty result; the text stays in same-tab memory', async () => {
    const api = { searchBooks: vi.fn().mockRejectedValue(new PublicApiError({ code: 'BOOK_NOT_FOUND', status: 404 })) };
    const answer = await runBookSearch('wngs fyre kalm', [], signal(), api);
    expect(answer.kind).toBe('results');
    const id = (answer as { id: string }).id;
    expect(candidatesFor(id)).toEqual([]);
    expect(queryForCandidates(id)).toBe('wngs fyre kalm');
  });

  it('searches public data only and remembers the saved books that matched', async () => {
    const api = { searchBooks: vi.fn().mockResolvedValue({ kind: 'candidates', candidates: [book('v1:openlibrary:OL9W', 'Wings of Fire', ['Dale Brown'])] }) };
    const answer = await runBookSearch('wings of fire', [GUIDE, KALAM], signal(), api);
    expect(api.searchBooks).toHaveBeenCalledWith('wings of fire', expect.any(AbortSignal));
    expect(api.searchBooks.mock.calls[0]).toHaveLength(2);
    expect(shelfMatchesFor((answer as { id: string }).id)).toEqual([KALAM.bookKey]);
  });

  it('an ISBN that resolves to one book answers exact', async () => {
    const found = book('v1:isbn:9788173711466', 'Wings of Fire', ['Kalam']);
    const api = { searchBooks: vi.fn().mockResolvedValue({ kind: 'exact', book: found }) };
    expect(await runBookSearch('81-7371-146-1', [], signal(), api)).toEqual({ kind: 'exact', book: found });
  });

  it('an aborted search throws instead of answering', async () => {
    const controller = new AbortController();
    const api = { searchBooks: vi.fn(() => { controller.abort(); return Promise.reject(new DOMException('Aborted', 'AbortError')); }) };
    await expect(runBookSearch('wings', [], controller.signal, api)).rejects.toThrow();
  });
});
