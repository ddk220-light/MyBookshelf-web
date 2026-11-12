// What the one-shelf home shows: saved books and saved free items together,
// most recently added first (plan 3.4: shelf order is most recent first).
import type { SavedContent } from '../../contentTypes';
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
};

const time = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; };

export function bookEntry(book: RecentBook): ShelfEntry {
  return { key: book.bookKey, kind: 'book', title: book.title, authors: book.authors, coverUrl: book.coverUrl, isbn13: book.isbn13,
    href: '/app/books/' + encodeURIComponent(book.bookKey), state: { from: 'shelf', source: 'direct', book }, addedAt: time(book.viewedAt), book };
}

export function shelfEntries(savedBooks: readonly RecentBook[], savedContent: readonly SavedContent[]): ShelfEntry[] {
  const content: ShelfEntry[] = savedContent.map(item => ({ key: item.contentKey, kind: 'content', title: item.title, authors: item.authors,
    href: '/app/read/' + encodeURIComponent(item.contentKey), state: { returnTo: '/app/shelf' }, addedAt: time(item.savedAt) }));
  return [...savedBooks.map(bookEntry), ...content].sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * "Title by Author", plus ", on my shelf" for a search result the reader has
 * saved and ", in <library>" when the chosen library has the book.
 */
export function entryLabel(entry: Pick<ShelfEntry, 'title' | 'authors'>, libraryName?: string | null, mine = false): string {
  const author = entry.authors.filter(Boolean).join(', ');
  return entry.title + (author ? ' by ' + author : '') + (mine ? ', on my shelf' : '') + (libraryName ? ', in ' + libraryName : '');
}
