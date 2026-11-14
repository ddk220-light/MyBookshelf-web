import { describe, expect, it } from 'vitest';
import { createHoldingsStore } from '../../holdings';
import { entryLabel, shelfBadge, suggestionEntry } from './shelfItems';

const WINGS = { bookKey: 'v1:openlibrary:OL1037811W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], coverUrl: 'https://covers.openlibrary.org/b/id/9153819-M.jpg' };

describe('shelf entries and their names', () => {
  it('a suggestion opens like any book, with the shelf’s own navigation state', () => {
    const entry = suggestionEntry(WINGS);
    expect(entry).toMatchObject({ key: WINGS.bookKey, kind: 'book', suggested: true, title: WINGS.title, authors: WINGS.authors, coverUrl: WINGS.coverUrl,
      href: '/app/books/' + encodeURIComponent(WINGS.bookKey) });
    // An existing RecentSource value ('direct'), as for a saved book; `suggested`
    // only marks the page as opened from a suggestion (counted, never stored).
    expect(entry.state).toEqual({ from: 'shelf', source: 'direct', book: WINGS, suggested: true });
    expect(entry.foundIn).toBeUndefined();
    expect(suggestionEntry({ ...WINGS, foundIn: 'koha:anna' }).foundIn).toBe('koha:anna');
  });

  it('a suggestion’s library badge: a stored "found" for the chosen library, or the holdings store’s "found"; never another library', () => {
    const holdings = createHoldingsStore('koha:anna');
    const found = suggestionEntry({ ...WINGS, foundIn: 'koha:anna' });
    const plain = suggestionEntry(WINGS);
    expect(shelfBadge(found, holdings)).toBe(true);
    expect(shelfBadge(plain, holdings)).toBe(false);
    // Found in another library: no badge here.
    expect(shelfBadge(suggestionEntry({ ...WINGS, foundIn: 'koha:other' }), holdings)).toBe(false);
    // The holdings store's own "found" counts for any book, as for saved books.
    holdings.set('koha:anna', { [WINGS.bookKey]: 'found' });
    expect(shelfBadge(plain, holdings)).toBe(true);
    // A newer definite answer here wins over the stored one; "couldn't check" never takes the badge away.
    for (const [answer, badge] of [['not_found', false], ['unconfirmed', false], ['unknown', true], ['checking', true]] as const) {
      holdings.set('koha:anna', { [WINGS.bookKey]: answer });
      expect(shelfBadge(found, holdings), answer).toBe(badge);
    }
    // No library chosen: no badge.
    const none = createHoldingsStore(null);
    expect(shelfBadge(found, none)).toBe(false);
    expect(shelfBadge({ ...found, kind: 'content' }, holdings)).toBe(false);
  });

  it('a suggestion’s name ends with ", suggested", after the library', () => {
    const entry = suggestionEntry(WINGS);
    expect(entryLabel(entry)).toBe('Wings of Fire by A. P. J. Abdul Kalam, suggested');
    expect(entryLabel(entry, 'Anna Centenary Library')).toBe('Wings of Fire by A. P. J. Abdul Kalam, in Anna Centenary Library, suggested');
    expect(entryLabel({ ...entry, suggested: undefined }, 'Anna Centenary Library')).toBe('Wings of Fire by A. P. J. Abdul Kalam, in Anna Centenary Library');
    expect(entryLabel({ title: 'Untitled', authors: [], suggested: true })).toBe('Untitled, suggested');
  });
});
