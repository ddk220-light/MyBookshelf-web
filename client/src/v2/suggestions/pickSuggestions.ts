// Shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
// Part 2): which five books stand faded after the reader's saved books.
import { findSavedBook, type BookIdentity } from '../oneShelfState';

/** A suggested book, as a source gives it: enough to draw a cover and open the book page. */
export type SuggestedBook = {
  bookKey: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  isbn13?: string;
  /** Open Library work, when the source knows it (a work key carries its own). */
  workId?: string;
};

/** Always five suggestions (plan Part 2, decision 2). */
export const SUGGESTION_COUNT = 5;

/** The first author, compared without case, spaces or full stops ("A. P. J. Abdul Kalam" = "a.p.j. abdul kalam"). */
export function authorKey(name: string | undefined): string {
  return (name || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[\s.]+/g, '');
}

/**
 * Up to `count` suggestions from ordered candidate lists (sources); earlier
 * sources win, and within a source its own order is kept. Never a book on the
 * shelf: same book key, same ISBN-13 or, for display only, the same Open
 * Library work. Never two books whose first author is the same, nor the same
 * book twice. Callers put the bundled seed list last, so five books stand
 * even when every other source is empty or offline.
 */
export function pickSuggestions(sources: ReadonlyArray<readonly SuggestedBook[]>, savedBooks: readonly BookIdentity[], count = SUGGESTION_COUNT): SuggestedBook[] {
  const picked: SuggestedBook[] = [];
  const authors = new Set<string>();
  for (const source of sources) {
    for (const book of source) {
      if (picked.length >= count) return picked;
      if (!book?.bookKey || !book.title?.trim() || !Array.isArray(book.authors)) continue;
      if (findSavedBook(savedBooks, book, { sameWork: true }) || findSavedBook(picked, book, { sameWork: true })) continue;
      const author = authorKey(book.authors[0]);
      if (author && authors.has(author)) continue;
      picked.push(book);
      if (author) authors.add(author);
    }
  }
  return picked;
}
