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
  /**
   * The library whose stored answers say "found" for this book (the server
   * source's `inLibrary`, for the library it was asked about). Its badge shows
   * only while that library is the chosen one; never a live check.
   */
  foundIn?: string;
};

/** Always five suggestions (plan Part 2, decision 2). */
export const SUGGESTION_COUNT = 5;

/** The first author, compared without case, spaces or full stops ("A. P. J. Abdul Kalam" = "a.p.j. abdul kalam"). */
export function authorKey(name: string | undefined): string {
  return (name || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[\s.]+/g, '');
}

/** A title compared without case, punctuation or extra spaces ("Wings of Fire." = "wings of fire"). */
export function titleKey(title: string | undefined): string {
  return (title || '').normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** A saved book as the pick sees it: its identity and, when known, its title and authors. */
export type SavedForPick = BookIdentity & { title?: string; authors?: readonly string[] };

// Title and first author together, when both are known.
const titleAuthor = (book: { title?: string; authors?: readonly string[] }) => {
  const title = titleKey(book.title), author = authorKey(book.authors?.[0]);
  return title && author ? title + '\n' + author : null;
};

/**
 * Up to `count` suggestions from ordered candidate lists (sources); earlier
 * sources win, and within a source its own order is kept. Never a book on the
 * shelf: same book key, same ISBN-13 or, for display only, the same Open
 * Library work or the same title by the same first author (Open Library can
 * hold one book as several works). Never two books whose first author is the
 * same, nor the same book twice. Callers put the bundled seed list last, so
 * five books stand even when every other source is empty or offline. None of
 * this changes what counts as "on my shelf" anywhere else (findSavedBook).
 */
export function pickSuggestions(sources: ReadonlyArray<readonly SuggestedBook[]>, savedBooks: readonly SavedForPick[], count = SUGGESTION_COUNT): SuggestedBook[] {
  const picked: SuggestedBook[] = [];
  const authors = new Set<string>();
  const savedTitles = new Set(savedBooks.map(titleAuthor).filter((key): key is string => Boolean(key)));
  for (const source of sources) {
    for (const book of source) {
      if (picked.length >= count) return picked;
      if (!book?.bookKey || !book.title?.trim() || !Array.isArray(book.authors)) continue;
      if (findSavedBook(savedBooks, book, { sameWork: true }) || findSavedBook(picked, book, { sameWork: true })) continue;
      const sameTitle = titleAuthor(book);
      if (sameTitle && savedTitles.has(sameTitle)) continue;
      const author = authorKey(book.authors[0]);
      if (author && authors.has(author)) continue;
      picked.push(book);
      if (author) authors.add(author);
    }
  }
  return picked;
}
