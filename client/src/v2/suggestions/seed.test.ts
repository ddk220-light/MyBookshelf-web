import { describe, expect, it } from 'vitest';
import seed from '../../../../shared/suggestions-seed.json';
import { authorKey } from './pickSuggestions';
import { SEED_SUGGESTIONS } from './seed';

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
