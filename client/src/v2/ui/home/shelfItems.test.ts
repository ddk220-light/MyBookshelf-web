import { describe, expect, it } from 'vitest';
import { entryLabel, suggestionEntry } from './shelfItems';

const WINGS = { bookKey: 'v1:openlibrary:OL1037811W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], coverUrl: 'https://covers.openlibrary.org/b/id/9153819-M.jpg' };

describe('shelf entries and their names', () => {
  it('a suggestion opens like any book, with the shelf’s own navigation state', () => {
    const entry = suggestionEntry(WINGS);
    expect(entry).toMatchObject({ key: WINGS.bookKey, kind: 'book', suggested: true, title: WINGS.title, authors: WINGS.authors, coverUrl: WINGS.coverUrl,
      href: '/app/books/' + encodeURIComponent(WINGS.bookKey) });
    // An existing RecentSource value ('direct'), as for a saved book.
    expect(entry.state).toEqual({ from: 'shelf', source: 'direct', book: WINGS });
  });

  it('a suggestion’s name ends with ", suggested", after the library', () => {
    const entry = suggestionEntry(WINGS);
    expect(entryLabel(entry)).toBe('Wings of Fire by A. P. J. Abdul Kalam, suggested');
    expect(entryLabel(entry, 'Anna Centenary Library')).toBe('Wings of Fire by A. P. J. Abdul Kalam, in Anna Centenary Library, suggested');
    expect(entryLabel({ ...entry, suggested: undefined }, 'Anna Centenary Library')).toBe('Wings of Fire by A. P. J. Abdul Kalam, in Anna Centenary Library');
    expect(entryLabel({ title: 'Untitled', authors: [], suggested: true })).toBe('Untitled, suggested');
  });
});
