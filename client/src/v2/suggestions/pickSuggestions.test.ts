import { describe, expect, it } from 'vitest';
import type { RecentBook } from '../types';
import { bayRows, suggestedRun } from '../ui/shelf/shelfLayout';
import { authorKey, pickSuggestions, SUGGESTION_COUNT, type SuggestedBook } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';

const suggestion = (id: number | string, author: string, extra: Partial<SuggestedBook> = {}): SuggestedBook =>
  ({ bookKey: 'v1:openlibrary:OL' + id + 'W', title: 'Title ' + id, authors: [author], ...extra });
const saved = (bookKey: string, extra: Partial<RecentBook> = {}): RecentBook =>
  ({ bookKey, title: 'Saved', authors: ['Someone'], source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z', ...extra });
const keys = (books: readonly SuggestedBook[]) => books.map(book => book.bookKey);
const withSeed = (...sources: SuggestedBook[][]) => [...sources, SEED_SUGGESTIONS];

describe('shelf suggestions: which five', () => {
  it('cold open: the first five of the bundled seed list, with no other source (offline too)', () => {
    expect(pickSuggestions(withSeed(), [])).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    expect(SUGGESTION_COUNT).toBe(5);
  });

  it('earlier sources win; the seed list fills in after them', () => {
    const library = [suggestion(1, 'A'), suggestion(2, 'B')];
    const related = [suggestion(3, 'C')];
    expect(keys(pickSuggestions(withSeed(library, related), []))).toEqual([...keys(library), ...keys(related), ...keys(SEED_SUGGESTIONS.slice(0, 2))]);
  });

  it('one book per author, compared without case or spaces on the first author', () => {
    const books = [suggestion(1, 'R. K. Narayan'), suggestion(2, 'r.k.  narayan'), suggestion(3, 'Someone Else', { authors: ['Someone Else', 'R. K. Narayan'] }),
      suggestion(4, ' R.K. NARAYAN '), suggestion(5, 'Kalki'), suggestion(6, 'KALKI'), suggestion(7, 'Amish'), suggestion(8, 'Roy')];
    expect(keys(pickSuggestions([books], []))).toEqual(keys([books[0], books[2], books[4], books[6], books[7]]));
    expect(authorKey('A. P. J. Abdul Kalam')).toBe(authorKey('a.p.j. abdul  kalam'));
    // An earlier source's author also rules out the seed list's book by them.
    const kalam = suggestion(9, 'A.P.J. Abdul Kalam');
    expect(keys(pickSuggestions(withSeed([kalam]), []))).not.toContain(SEED_SUGGESTIONS[0].bookKey);
  });

  it('never a saved book: same book key, same ISBN-13, or the same Open Library work (another edition)', () => {
    const books = [
      suggestion(1, 'A'),
      suggestion(2, 'B', { bookKey: 'v1:isbn:9780000000002', isbn13: '9780000000002' }),
      suggestion(3, 'C', { bookKey: 'v1:googlebooks:three', workId: 'OL3W' }),
      suggestion(4, 'D'),
      suggestion(5, 'E'), suggestion(6, 'F'), suggestion(7, 'G'), suggestion(8, 'H'),
    ];
    const shelf = [
      saved('v1:openlibrary:OL1W'),
      // Saved under another record with the same ISBN-13.
      saved('v1:catalog:koha:anna-centenary-library:2', { isbn13: '978-0-00-000000-2' }),
      // Saved as the Open Library work the suggestion is an edition of.
      saved('v1:openlibrary:OL3W'),
      // An ISBN record whose ISBN the work suggestion carries.
      saved('v1:isbn:9780000000004', { isbn13: '9780000000004' }),
    ];
    books[3] = { ...books[3], isbn13: '9780000000004' };
    expect(keys(pickSuggestions([books], shelf))).toEqual(keys(books.slice(4, 9)));
  });

  it('never the same book twice, even from two sources', () => {
    const first = suggestion(1, 'A');
    const again = { ...suggestion(1, 'Other'), title: 'Another record' };
    const edition = suggestion('x', 'Third', { bookKey: 'v1:isbn:9780000000009', workId: 'OL1W' });
    expect(keys(pickSuggestions([[first], [again, edition]], []))).toEqual([first.bookKey]);
  });

  it('a saved suggestion leaves; the others keep their order and the next one arrives at the end', () => {
    const before = pickSuggestions(withSeed(), []);
    const after = pickSuggestions(withSeed(), [saved(before[0].bookKey)]);
    expect(keys(after)).toEqual([...keys(before.slice(1)), SEED_SUGGESTIONS[5].bookKey]);
    // Removed from the shelf again: it can be suggested again.
    expect(pickSuggestions(withSeed(), [])).toEqual(before);
  });

  it('skips unusable records and stops at five; fewer only when every source runs out', () => {
    const broken = [{ bookKey: '', title: 'No key', authors: ['X'] }, { bookKey: 'v1:openlibrary:OL9W', title: ' ', authors: ['Y'] }] as SuggestedBook[];
    expect(pickSuggestions(withSeed(broken), [])).toEqual(SEED_SUGGESTIONS.slice(0, 5));
    expect(keys(pickSuggestions([[suggestion(1, 'A'), suggestion(2, 'B')]], []))).toHaveLength(2);
    // A whole seed list on the shelf: the next ones stand in.
    const shelf = SEED_SUGGESTIONS.slice(0, 18).map(book => saved(book.bookKey));
    expect(pickSuggestions(withSeed(), shelf)).toEqual(SEED_SUGGESTIONS.slice(18, 20));
  });
});

describe('shelf suggestions: fill and wrap like books', () => {
  const shelfWith = (savedCount: number, perBay: number) => {
    const items = [...Array.from({ length: savedCount }, (_, index) => ({ key: 'saved' + index, suggested: false })),
      ...pickSuggestions(withSeed(), []).map(book => ({ key: book.bookKey, suggested: true }))];
    return bayRows(items, perBay).map(row => ({ books: row.map(item => item.suggested ? 's' : 'S').join(''), tag: suggestedRun(row, item => item.suggested) }));
  };

  it('three a bay on phones', () => {
    expect(shelfWith(0, 3)).toEqual([{ books: 'sss', tag: { from: 0, span: 3 } }, { books: 'ss', tag: { from: 0, span: 2 } }]);
    // One saved book: the suggestions share its bay (SuggestShelf board).
    expect(shelfWith(1, 3)).toEqual([{ books: 'Sss', tag: { from: 1, span: 2 } }, { books: 'sss', tag: { from: 0, span: 3 } }]);
    expect(shelfWith(3, 3)).toEqual([{ books: 'SSS', tag: null }, { books: 'sss', tag: { from: 0, span: 3 } }, { books: 'ss', tag: { from: 0, span: 2 } }]);
    expect(shelfWith(4, 3)).toEqual([{ books: 'SSS', tag: null }, { books: 'Sss', tag: { from: 1, span: 2 } }, { books: 'sss', tag: { from: 0, span: 3 } }]);
  });

  it('six a bay at wide widths', () => {
    expect(shelfWith(0, 6)).toEqual([{ books: 'sssss', tag: { from: 0, span: 5 } }]);
    expect(shelfWith(1, 6)).toEqual([{ books: 'Ssssss', tag: { from: 1, span: 5 } }]);
    // Four saved (DeskSuggestShelf board): two suggestions share their bay, three go on.
    expect(shelfWith(4, 6)).toEqual([{ books: 'SSSSss', tag: { from: 4, span: 2 } }, { books: 'sss', tag: { from: 0, span: 3 } }]);
    expect(shelfWith(6, 6)).toEqual([{ books: 'SSSSSS', tag: null }, { books: 'sssss', tag: { from: 0, span: 5 } }]);
  });
});
