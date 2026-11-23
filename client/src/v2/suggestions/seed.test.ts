import { describe, expect, it } from 'vitest';
import seed from '../../../../shared/suggestions-seed.json';
import { authorKey } from './pickSuggestions';
import usList from '../../../../shared/us-book-pool.json';
import { SEED_SUGGESTIONS, seedFor, US_SEED_SIZE, US_SEED_SUGGESTIONS, usSeedFrom } from './seed';

describe('bundled suggestions seed list (shared/suggestions-seed.json)', () => {
  it('holds about twenty Open Library works with real cover images, one book per author', () => {
    expect(SEED_SUGGESTIONS.length).toBeGreaterThanOrEqual(15);
    expect(SEED_SUGGESTIONS.length).toBeLessThanOrEqual(25);
    expect(SEED_SUGGESTIONS).toHaveLength(seed.books.length);
    for (const book of SEED_SUGGESTIONS) {
      expect(book.bookKey, book.title).toMatch(/^v1:openlibrary:OL\d+W$/);
      expect(book.title.trim(), book.bookKey).not.toBe('');
      expect(book.authors.length, book.title).toBeGreaterThan(0);
      // A cover image on a host the app's security policy allows; never the
      // ISBN-based fallback (the seed list only includes books with covers).
      expect(book.coverUrl, book.title).toMatch(/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg$/);
      if (book.isbn13) expect(book.isbn13, book.title).toMatch(/^97[89]\d{10}$/);
    }
    expect(new Set(SEED_SUGGESTIONS.map(book => book.bookKey)).size).toBe(SEED_SUGGESTIONS.length);
    expect(new Set(SEED_SUGGESTIONS.map(book => book.coverUrl)).size).toBe(SEED_SUGGESTIONS.length);
    expect(new Set(SEED_SUGGESTIONS.map(book => authorKey(book.authors[0]))).size).toBe(SEED_SUGGESTIONS.length);
  });

  it('opens with the five books on the approved first-open boards', () => {
    expect(SEED_SUGGESTIONS.slice(0, 5).map(book => book.title)).toEqual(['Wings of Fire', 'Ponniyin Selvan', 'The God of Small Things', 'Malgudi Days', 'The White Tiger']);
  });
});

describe('the US seed list (shared/us-book-pool.json, 23 November 2026)', () => {
  it('is the US list’s first twenty books in its order, one per author, each an Open Library work with its cover', () => {
    expect(US_SEED_SIZE).toBe(20);
    expect(US_SEED_SUGGESTIONS).toHaveLength(20);
    expect(keysOf(US_SEED_SUGGESTIONS)).toEqual(usList.books.slice(0, 20).map(book => book.bookKey));
    for (const book of US_SEED_SUGGESTIONS) {
      expect(book.bookKey, book.title).toMatch(/^v1:openlibrary:OL\d+W$/);
      expect(book.coverUrl, book.title).toMatch(/^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg$/);
      expect(book.authors).toHaveLength(1);
      // The list's ISBN is one edition of the work; the seed names the work only.
      expect(book.isbn13).toBeUndefined();
    }
    expect(new Set(US_SEED_SUGGESTIONS.map(book => authorKey(book.authors[0]))).size).toBe(20);
    // None of today's list: the two seeds are separate.
    expect(US_SEED_SUGGESTIONS.some(book => SEED_SUGGESTIONS.some(other => other.bookKey === book.bookKey))).toBe(false);
  });

  it('skips a second book by the same author and a book without a key or cover', () => {
    const list = [{ title: 'A', author: 'Ann', bookKey: 'v1:openlibrary:OL1W', coverId: '1' }, { title: 'B', author: 'ann', bookKey: 'v1:openlibrary:OL2W', coverId: '2' },
      { title: 'C', author: 'Cy', coverId: '3' }, { title: 'D', author: 'Di', bookKey: 'v1:openlibrary:OL4W' }, { title: 'E', author: 'Ed', bookKey: 'v1:openlibrary:OL5W', coverId: '5' }];
    expect(usSeedFrom(list, 5).map(book => book.title)).toEqual(['A', 'E']);
  });

  it('is the seed for a US library only; India, other countries and no library keep today’s list', () => {
    expect(seedFor('US')).toBe(US_SEED_SUGGESTIONS);
    for (const country of ['IN', 'JP', 'CA', null, undefined]) expect(seedFor(country)).toBe(SEED_SUGGESTIONS);
  });
});

const keysOf = (books: readonly { bookKey: string }[]) => books.map(book => book.bookKey);
