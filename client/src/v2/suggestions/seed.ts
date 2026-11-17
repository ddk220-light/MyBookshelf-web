// The bundled seed list (shared/suggestions-seed.json): popular Indian books
// that ship inside the app, so the cold open shows five books even offline.
import seed from '../../../../shared/suggestions-seed.json';
import type { SuggestedBook } from './pickSuggestions';

export const SEED_SUGGESTIONS: readonly SuggestedBook[] = Object.freeze(seed.books.map((book): SuggestedBook => ({
  bookKey: book.bookKey,
  title: book.title,
  authors: [...book.authors],
  ...(book.coverUrl ? { coverUrl: book.coverUrl } : {}),
  ...('isbn13' in book && typeof book.isbn13 === 'string' ? { isbn13: book.isbn13 } : {}),
})));
