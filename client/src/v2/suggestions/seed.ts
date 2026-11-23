// The bundled seed lists, shipped inside the app so the cold open shows five
// books even offline: popular Indian books (shared/suggestions-seed.json),
// and for a United States library the first twenty books of the US list
// (shared/us-book-pool.json), one per first author. Which one stands last in
// the suggestions follows the chosen library's country (seedFor).
import seed from '../../../../shared/suggestions-seed.json';
import usList from '../../../../shared/us-book-pool.json';
import { authorKey, type SuggestedBook } from './pickSuggestions';

export const SEED_SUGGESTIONS: readonly SuggestedBook[] = Object.freeze(seed.books.map((book): SuggestedBook => ({
  bookKey: book.bookKey,
  title: book.title,
  authors: [...book.authors],
  ...(book.coverUrl ? { coverUrl: book.coverUrl } : {}),
  ...('isbn13' in book && typeof book.isbn13 === 'string' ? { isbn13: book.isbn13 } : {}),
})));

/** How many books the US seed list takes from the US list. */
export const US_SEED_SIZE = 20;

type ListBook = { title: string; author: string; bookKey?: string; coverId?: string };

/**
 * The first `size` books of the US list in its order, each an Open Library
 * work with its cover, at most one per first author. The list's ISBN (one
 * edition of the work) is not used: the work key is the book.
 */
export function usSeedFrom(books: readonly ListBook[], size = US_SEED_SIZE): SuggestedBook[] {
  const authors = new Set<string>();
  const out: SuggestedBook[] = [];
  for (const book of books) {
    if (out.length >= size) break;
    if (!book.bookKey || !/^v1:openlibrary:OL\d+W$/.test(book.bookKey) || !/^\d+$/.test(book.coverId || '') || authors.has(authorKey(book.author))) continue;
    authors.add(authorKey(book.author));
    out.push({ bookKey: book.bookKey, title: book.title, authors: [book.author], coverUrl: `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg` });
  }
  return out;
}

export const US_SEED_SUGGESTIONS: readonly SuggestedBook[] = Object.freeze(usSeedFrom(usList.books));

/**
 * The seed list for the chosen library's country: the US list for a library
 * in the United States, else today's list (India, every other country, and
 * no library chosen).
 */
export function seedFor(country: string | null | undefined): readonly SuggestedBook[] {
  return country === 'US' ? US_SEED_SUGGESTIONS : SEED_SUGGESTIONS;
}
