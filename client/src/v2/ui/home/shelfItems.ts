// What the one-shelf home shows: saved books and saved free items together,
// most recently added first (plan 3.4: shelf order is most recent first).
import type { BookNavigation } from '../../bookNavigation';
import type { SavedContent } from '../../contentTypes';
import type { HoldingsStore } from '../../holdings';
import type { SuggestedBook } from '../../suggestions/pickSuggestions';
import type { PublicBook, RecentBook } from '../../types';

export type ShelfEntry = {
  /** bookKey for library books, contentKey for saved free items. */
  key: string;
  kind: 'book' | 'content';
  title: string;
  authors: string[];
  coverUrl?: string;
  isbn13?: string;
  href: string;
  /** Router state passed with the link, as the existing shelf does. */
  state: unknown;
  addedAt: number;
  book?: RecentBook;
  /** Search results: other records of the same work, tried for a cover. */
  alternatives?: PublicBook[];
  /** Search results: year of publication, shown in list view only. */
  year?: string;
  /** A shelf suggestion (plan 2026-11-14, Part 2): drawn faded after the saved books. */
  suggested?: true;
  /** A suggestion the stored answers of this library list as found (server source). */
  foundIn?: string;
  /** A suggestion slot held empty while the first suggestions of a visit are on their way: nothing is drawn in it. */
  held?: true;
};

const time = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; };

export function bookEntry(book: RecentBook): ShelfEntry {
  return { key: book.bookKey, kind: 'book', title: book.title, authors: book.authors, coverUrl: book.coverUrl, isbn13: book.isbn13,
    href: '/app/books/' + encodeURIComponent(book.bookKey), state: { from: 'shelf', source: 'direct', book }, addedAt: time(book.viewedAt), book };
}

/**
 * A suggested book on the shelf. It opens like any book: its page, with the
 * suggestion as the record to show until the page has looked the book up.
 * `suggested` in the router state tells the page it was opened from a
 * suggestion (counted in the anonymous log); the source the book is
 * remembered with stays "direct".
 */
export function suggestionEntry(suggestion: SuggestedBook): ShelfEntry {
  const book: PublicBook = { bookKey: suggestion.bookKey, title: suggestion.title, authors: suggestion.authors,
    ...(suggestion.coverUrl ? { coverUrl: suggestion.coverUrl } : {}), ...(suggestion.isbn13 ? { isbn13: suggestion.isbn13 } : {}),
    ...(suggestion.workId ? { workId: suggestion.workId } : {}) };
  const state: BookNavigation = { from: 'shelf', source: 'direct', book, suggested: true };
  return { key: book.bookKey, kind: 'book', title: book.title, authors: book.authors, coverUrl: book.coverUrl, isbn13: book.isbn13,
    href: '/app/books/' + encodeURIComponent(book.bookKey), state, addedAt: 0, suggested: true,
    ...(suggestion.foundIn ? { foundIn: suggestion.foundIn } : {}) };
}

/**
 * The five suggestion slots while the first suggestions of a visit are on
 * their way (useShelfSuggestions `held`): they keep their places on the
 * shelf, so nothing below moves, but nothing is drawn in them.
 */
export function heldSuggestionSlots(count: number): ShelfEntry[] {
  return Array.from({ length: count }, (_, index) => ({ key: 'held:' + index, kind: 'book' as const, title: '', authors: [], href: '', state: null, addedAt: 0,
    suggested: true as const, held: true as const }));
}

/**
 * Whether the chosen library's badge goes on a shelf cover: the holdings
 * store holds "found" for it, or (a suggestion) the server's stored answers
 * for this same library say found and nothing newer here says otherwise. A
 * "couldn't check" never takes the badge away and is never shown as absence.
 */
export function shelfBadge(entry: Pick<ShelfEntry, 'key' | 'kind' | 'foundIn'>, holdings: Pick<HoldingsStore, 'get' | 'libraryId'>): boolean {
  if (entry.kind !== 'book') return false;
  const answer = holdings.get(entry.key);
  if (answer === 'found') return true;
  const library = holdings.libraryId();
  return Boolean(entry.foundIn && library && entry.foundIn === library) && answer !== 'not_found' && answer !== 'unconfirmed';
}

export function shelfEntries(savedBooks: readonly RecentBook[], savedContent: readonly SavedContent[]): ShelfEntry[] {
  const content: ShelfEntry[] = savedContent.map(item => ({ key: item.contentKey, kind: 'content', title: item.title, authors: item.authors,
    href: '/app/read/' + encodeURIComponent(item.contentKey), state: { returnTo: '/app/shelf' }, addedAt: time(item.savedAt) }));
  return [...savedBooks.map(bookEntry), ...content].sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * "Title by Author", plus ", on my shelf" for a search result the reader has
 * saved, ", in <library>" when the chosen library has the book and, last,
 * ", suggested" for a shelf suggestion (its fade is not the only signal).
 */
export function entryLabel(entry: Pick<ShelfEntry, 'title' | 'authors' | 'suggested'>, libraryName?: string | null, mine = false): string {
  const author = entry.authors.filter(Boolean).join(', ');
  return entry.title + (author ? ' by ' + author : '') + (mine ? ', on my shelf' : '') + (libraryName ? ', in ' + libraryName : '')
    + (entry.suggested ? ', suggested' : '');
}
