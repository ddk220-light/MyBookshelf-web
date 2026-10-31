import type { PublicBook } from './types';

export type SearchGroup = { book: PublicBook; versions: PublicBook[] };

const titleKey = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Catalog display cards use the explicitly listed lead author. Additional
// contributors remain on each record; no ISBNs, work IDs or holdings are merged.
const authorKey = (book: PublicBook) => (book.bookKey.startsWith('v1:catalog:') ? book.authors.slice(0, 1) : book.authors).map(author => titleKey(author)
  .replace(/^(?:dr|prof)\s+/, '')).filter(Boolean).sort().join('|');

// Presentation groups only: retain every record's key and availability lookup.
// Similar titles or author surnames do not establish a shared work identity.
export function groupSearchResults(books: PublicBook[]): SearchGroup[] {
  const titles = new Map<string, Array<{ book: PublicBook; index: number }>>();
  const seen = new Set<string>();
  books.forEach((book, index) => {
    if (seen.has(book.bookKey)) return;
    seen.add(book.bookKey);
    // This only collapses the presentation. Each catalog record stays a
    // separate selectable version with its own key and holdings lookup.
    const key = titleKey(book.title);
    const entries = titles.get(key) || [];
    entries.push({ book, index });
    titles.set(key, entries);
  });
  const groups: Array<SearchGroup & { index: number }> = [];
  for (const entries of titles.values()) {
    const authors = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = authorKey(entry.book);
      const versions = authors.get(key) || [];
      versions.push(entry);
      authors.set(key, versions);
    }
    const anonymous = authors.get('');
    const named = [...authors.keys()].filter(Boolean);
    // Missing authors may sit under the same title only when there is no
    // conflicting attribution. They never inherit the other record's author.
    if (anonymous && named.length === 1 && !entries.some(({ book }) => book.bookKey.startsWith('v1:catalog:'))) {
      authors.get(named[0])!.push(...anonymous);
      authors.delete('');
    }
    for (const versions of authors.values()) {
      versions.sort((a, b) => a.index - b.index);
      groups.push({
        book: versions.find(({ book }) => book.authors.length)?.book || versions[0].book,
        versions: versions.map(({ book }) => book),
        index: versions[0].index,
      });
    }
  }
  return groups.sort((a, b) => a.index - b.index).map(({ book, versions }) => ({ book, versions }));
}
