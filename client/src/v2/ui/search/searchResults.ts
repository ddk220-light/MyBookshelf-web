// What a search on the shelf shows (plan 3.3 and Phase 5): the reader's own
// saved books that match first, then public results, nine at most.
// Identity is bookKey or ISBN-13 only (oneShelfState.isOnShelf). Titles and
// authors decide which saved books *match the query*, never which records are
// the same book: two editions with the same title stay separate entries.
import { isOnShelf } from '../../oneShelfState';
import { coverAlternatives, groupSearchResults, normalizeAuthor, normalizeText } from '../../searchGroups';
import type { PublicBook, RecentBook } from '../../types';
import { bookEntry, type ShelfEntry } from '../home/shelfItems';

export const RESULT_LIMIT = 9;

export type ResultEntry = ShelfEntry & { mine: boolean };

const words = (value: string) => normalizeText(value).split(' ').filter(Boolean);
const time = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; };

/**
 * True when every word of the query starts a word of the book's title or of
 * one of its authors (Latin accents folded; "apj" matches "A. P. J.").
 */
export function matchesQuery(book: Pick<RecentBook, 'title' | 'authors'>, query: string): boolean {
  const wanted = words(query);
  if (!wanted.length) return false;
  const tokens = [...words(book.title), ...book.authors.flatMap(author => [...words(author), ...normalizeAuthor(author).split(' ')])].filter(Boolean);
  return wanted.every(word => tokens.some(token => token.startsWith(word)));
}

/**
 * Saved books shown first for this search, most recently added first: those
 * whose title or author matches every query word, and those that are the same
 * record (bookKey or ISBN-13) as a public result.
 */
export function ownMatches(savedBooks: readonly RecentBook[], query: string, publicBooks: readonly PublicBook[]): RecentBook[] {
  return savedBooks.filter(saved => matchesQuery(saved, query) || publicBooks.some(book => isOnShelf([saved], book)))
    .slice().sort((a, b) => time(b.viewedAt) - time(a.viewedAt));
}

const yearOf = (date?: string) => /(?<!\d)(1[4-9]\d{2}|20\d{2})(?!\d)/.exec(date || '')?.[1];

/**
 * The entries to draw: own matches (still on the shelf) with the bookmark
 * badge, then public results without the records already shown, grouped for
 * display as the search page groups them. Links carry the search's opaque ID
 * so the book page can return to these results.
 */
export function resultEntries({ savedBooks, ownKeys, publicBooks, candidateId, limit = RESULT_LIMIT }: {
  savedBooks: readonly RecentBook[]; ownKeys: readonly string[]; publicBooks: readonly PublicBook[]; candidateId: string; limit?: number;
}): ResultEntry[] {
  const searchState = { candidateId, shelf: true };
  const own = ownKeys.map(key => savedBooks.find(book => book.bookKey === key)).filter((book): book is RecentBook => Boolean(book));
  const ownEntries: ResultEntry[] = own.map(book => ({ ...bookEntry(book), state: { from: 'search', source: 'search', book, searchState }, mine: true }));
  const rest = publicBooks.filter(book => !isOnShelf(own, book));
  const publicEntries: ResultEntry[] = groupSearchResults(rest).map(group => {
    const book = group.book;
    return { key: book.bookKey, kind: 'book', title: book.title, authors: book.authors, coverUrl: book.coverUrl, isbn13: book.isbn13,
      alternatives: coverAlternatives(group).filter(version => version !== book), year: yearOf(book.publishedDate),
      href: '/app/books/' + encodeURIComponent(book.bookKey), state: { from: 'search', source: 'search', book, searchState },
      addedAt: 0, mine: isOnShelf(savedBooks, book) };
  });
  return [...ownEntries, ...publicEntries].slice(0, Math.max(0, limit));
}
