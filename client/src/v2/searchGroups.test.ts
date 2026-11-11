import { describe, expect, it } from 'vitest';
import { groupSearchResults, normalizeAuthor, versionLabels, volumeKey } from './searchGroups';
import type { PublicBook } from './types';

// Records without a work ID (Google Books volumes) fall back to title + author.
const reasoning: PublicBook[] = [
  { bookKey: 'v1:googlebooks:ReasonA2014', title: 'A Modern Approach To Logical Reasoning', authors: ['Dr. R S Aggarwal'], publishedDate: '2014' },
  { bookKey: 'v1:googlebooks:ReasonB2007', title: 'A Modern Approach to Logical Reasoning', authors: ['R. S. Aggarwal'], publishedDate: '2007' },
  { bookKey: 'v1:googlebooks:ReasonC2017', title: 'A Modern Approach to Logical Reasoning', authors: [], publishedDate: '2017' },
];
// The same title as three different Open Library works (as returned in production).
const reasoningWorks: PublicBook[] = [
  { ...reasoning[0], bookKey: 'v1:openlibrary:OL20774896W', workId: 'OL20774896W' },
  { ...reasoning[1], bookKey: 'v1:openlibrary:OL29062473W', workId: 'OL29062473W' },
  { ...reasoning[2], bookKey: 'v1:openlibrary:OL24612560W', workId: 'OL24612560W' },
];
const catalogKey = (id: number) => `v1:catalog:koha:anna-centenary-library:${id}`;

describe('search result presentation groups', () => {
  it('keeps catalog coauthors on their individual records inside one exact title and lead-author card', () => {
    const books = [
      { bookKey: 'v1:catalog:koha:anna-centenary-library:309106', title: 'Wings of fire: an autobiography', authors: ['Abdul Kalam, A. P. J'] },
      { bookKey: 'v1:catalog:koha:anna-centenary-library:309107', title: 'Wings of fire: an autobiography', authors: ['Abdul Kalam, A. P. J', 'Tiwari, Arun'] },
      { bookKey: 'v1:catalog:koha:anna-centenary-library:97054', title: 'Wings of fire: an autobiography', authors: ['Brown, Dale'] },
    ];
    const groups = groupSearchResults(books);
    expect(groups).toHaveLength(2);
    expect(groups[0].versions).toEqual(books.slice(0, 2));
    expect(groups[0].versions[1].authors).toEqual(['Abdul Kalam, A. P. J', 'Tiwari, Arun']);
  });
  it('shows the reported reasoning title once while retaining all three distinct record identities', () => {
    const groups = groupSearchResults(reasoning);
    expect(groups).toHaveLength(1);
    expect(groups[0].versions).toEqual(reasoning);
    expect(groups[0].book).toEqual(reasoning[0]);
    expect(groups[0].versions[2].authors).toEqual([]);
  });

  it('keeps conflicting authors and ambiguous missing-author records separate', () => {
    const books = [
      { ...reasoning[0], title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] },
      { ...reasoning[1], title: 'Wings of Fire', authors: ['Tui T. Sutherland'] },
      { ...reasoning[2], title: 'Wings of Fire' },
    ];
    expect(groupSearchResults(books).map(group => group.versions.length)).toEqual([1, 1, 1]);
    expect(groupSearchResults([{ ...reasoning[0], authors: ['R S Aggarwal'] }, { ...reasoning[1], authors: ['S R Aggarwal'] }])).toHaveLength(2);
  });

  it('preserves subtitle, revision and adaptation distinctions', () => {
    const books = ['Wings of Fire', 'Wings of Fire: The Dragonet Prophecy', 'Wings of Fire: Graphic Novel', 'Wings of Fire: Revised Edition']
      .map((title, index) => ({ ...reasoning[0], title, bookKey: `v1:openlibrary:OL${index + 1}W` }));
    expect(groupSearchResults(books)).toHaveLength(4);
  });

  it('preserves result order and uses known authors in a group headed by an incomplete record', () => {
    const groups = groupSearchResults([reasoning[2], { ...reasoning[0], bookKey: 'v1:openlibrary:OL1W', title: 'Another book' }, reasoning[0], reasoning[1]]);
    expect(groups[0].book).toEqual(reasoning[0]);
    expect(groups[0].versions).toEqual([reasoning[2], reasoning[0], reasoning[1]]);
    expect(groups[1].book.title).toBe('Another book');
  });

  it('groups catalog presentation while keeping every independent record selectable', () => {
    expect(groupSearchResults(reasoning.concat(reasoning))).toHaveLength(1);
    expect(groupSearchResults(reasoning.concat(reasoning))[0].versions).toHaveLength(3);
    const catalog = reasoning.map((book, index) => ({ ...book, bookKey: `v1:catalog:koha:example:${index}` }));
    const groups = groupSearchResults(catalog);
    expect(groups).toHaveLength(2); // Missing authors remain separate for catalog records.
    expect(groups.flatMap(group => group.versions).map(book => book.bookKey).sort()).toEqual(catalog.map(book => book.bookKey).sort());
  });

  it('merges author spelling variants of one novel without a work ID', () => {
    const variants = ['Paulo Coelho', 'Coelho, Paulo', 'Paulo Coelho (Author)', 'PAULO COELHO', 'Coelho, Paulo, 1947-', 'Coelho, Paulo.', 'Paulo Coélho', 'Coelho, Paulo, author', 'by Paulo Coelho']
      .map((author, index) => ({ bookKey: `v1:googlebooks:Alchemist${index}`, title: index % 2 ? 'The Alchemist.' : 'the alchemist', authors: [author] }));
    const groups = groupSearchResults(variants);
    expect(groups).toHaveLength(1);
    expect(groups[0].versions.map(book => book.bookKey)).toEqual(variants.map(book => book.bookKey));
    expect(groupSearchResults(variants.map(book => ({ ...book, bookKey: book.bookKey.replace('v1:googlebooks:', 'v1:catalog:x:') })))).toHaveLength(1);
  });

  it('normalises initials, name order, roles, dates and multiple-author order', () => {
    expect(normalizeAuthor('Abdul Kalam, A. P. J.')).toBe(normalizeAuthor('APJ Abdul Kalam'));
    expect(normalizeAuthor('A.P.J. Abdul Kalam')).toBe(normalizeAuthor('A. P. J. Abdul Kalam'));
    expect(normalizeAuthor('Tolkien, J. R. R. (John Ronald Reuel), 1892-1973')).toBe(normalizeAuthor('J.R.R. Tolkien'));
    expect(normalizeAuthor('King, Martin Luther, Jr.')).toBe(normalizeAuthor('Martin Luther King Jr'));
    expect(normalizeAuthor('Dr. R S Aggarwal')).toBe(normalizeAuthor('R. S. Aggarwal'));
    expect(normalizeAuthor('R S Aggarwal')).not.toBe(normalizeAuthor('S R Aggarwal'));
    expect(normalizeAuthor('Tui T. Sutherland')).not.toBe(normalizeAuthor('Tui Sutherland'));
    const pair = [
      { bookKey: 'v1:googlebooks:Good1', title: 'Good Omens', authors: ['Terry Pratchett', 'Neil Gaiman'] },
      { bookKey: 'v1:googlebooks:Good2', title: 'Good Omens', authors: ['Gaiman, Neil', 'Pratchett, Terry'] },
    ];
    expect(groupSearchResults(pair)).toHaveLength(1);
  });

  it('groups records by shared work ID even when the displayed author differs', () => {
    const books = [
      { bookKey: 'v1:openlibrary:OL15358691W', workId: 'OL15358691W', title: 'The Alchemist', authors: ['Paulo Coelho'] },
      { bookKey: 'v1:isbn:9780062315007', workId: 'OL15358691W', title: 'The Alchemist', authors: ['Paulo Coelho', 'Alan R. Clarke'] },
    ];
    const groups = groupSearchResults(books);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('g1:work:OL15358691W');
  });

  it('never merges different work IDs because their titles and authors match', () => {
    const groups = groupSearchResults(reasoningWorks);
    expect(groups.map(group => group.versions.map(book => book.bookKey))).toEqual(reasoningWorks.map(book => [book.bookKey]));
    // A record without a work ID cannot pick between two matching works.
    const loose = { ...reasoning[1], bookKey: 'v1:googlebooks:Loose' };
    expect(groupSearchResults([...reasoningWorks, loose])).toHaveLength(4);
    // With exactly one matching work, it is shown with that work.
    const joined = groupSearchResults([reasoningWorks[0], loose]);
    expect(joined).toHaveLength(1);
    expect(joined[0].versions).toEqual([reasoningWorks[0], loose]);
  });

  it('keeps series volumes and conflicting volume statements as separate cards', () => {
    const titles = ['Wings of Fire: The Dragonet Prophecy', 'Wings of Fire: The Lost Heir', 'Wings of Fire Vol. 2', 'Wings of Fire, Volume 3', 'Wings of Fire Part II', 'Wings of Fire Book 3', 'Wings of Fire'];
    const books = titles.map((title, index) => ({ bookKey: catalogKey(index), title, authors: ['Sutherland, Tui T.'] }));
    expect(groupSearchResults(books)).toHaveLength(titles.length);
    // Identical series title; the volume is only in the edition statement.
    const editions = ['Book 1', 'Book 2', 'Book three', undefined].map((edition, index) => ({ bookKey: catalogKey(100 + index), title: 'Wings of fire', authors: ['Sutherland, Tui T.'], edition }));
    expect(groupSearchResults(editions)).toHaveLength(4);
    // The same volume written differently does still group.
    expect(volumeKey({ title: 'Harry Potter, Part II' })).toBe(volumeKey({ title: 'Harry Potter', edition: 'pt. 2' }));
    expect(groupSearchResults([
      { bookKey: catalogKey(200), title: 'Mahabharata', authors: ['Rajagopalachari, C.'], edition: 'Vol. 2' },
      { bookKey: catalogKey(201), title: 'Mahabharata', authors: ['C. Rajagopalachari'], edition: 'Volume II, 3rd ed.' },
    ])).toHaveLength(1);
    expect(volumeKey({ title: 'No Country for Old Men' })).toBe('');
    expect(volumeKey({ title: 'Nineteen Eighty-Four', edition: '2nd ed.' })).toBe('');
  });

  it('keeps Hindi and Tamil titles that differ only by vowel signs apart and folds only Latin accents', () => {
    const pairs = [['राम', 'रोम'], ['கடல்', 'கடலை'], ['कहानी', 'कहानियाँ']];
    for (const [left, right] of pairs) {
      expect(groupSearchResults([
        { bookKey: catalogKey(1), title: left, authors: ['प्रेमचंद'] },
        { bookKey: catalogKey(2), title: right, authors: ['प्रेमचंद'] },
      ])).toHaveLength(2);
    }
    expect(normalizeAuthor('கல்கி')).not.toBe(normalizeAuthor('கலகி'));
    expect(groupSearchResults([
      { bookKey: catalogKey(3), title: 'Les Misérables', authors: ['Hugo, Victor'] },
      { bookKey: catalogKey(4), title: 'Les Miserables', authors: ['Victor Hugo'] },
    ])).toHaveLength(1);
  });

  it('uses group keys that cannot be confused with record keys and survive later pages', () => {
    const first = groupSearchResults(reasoning);
    expect(first[0].key.startsWith('g1:')).toBe(true);
    expect(first.every(group => !group.versions.some(book => book.bookKey === group.key))).toBe(true);
    const later = groupSearchResults([...reasoning, { ...reasoning[0], bookKey: 'v1:googlebooks:Later', title: 'Another book' }]);
    expect(later[0].key).toBe(first[0].key);
    expect(later[1].key).not.toBe(first[0].key);
  });
});

describe('version labels', () => {
  it('prefers edition, publisher and year', () => {
    const versions: PublicBook[] = [
      { bookKey: catalogKey(1), title: 'Wings of fire', authors: [], edition: '2nd ed.', publisher: 'Universities Press', publishedDate: 'c1999.' },
      { bookKey: catalogKey(2), title: 'Wings of fire', authors: [], publisher: 'Universities Press', publishedDate: '2021-03-01' },
    ];
    expect(versionLabels(versions).map(row => row.label)).toEqual(['2nd ed. · Universities Press · Published 1999', 'Universities Press · Published 2021']);
  });

  it('adds format, then ISBN, only where rows would otherwise read the same', () => {
    const base = { title: 'The Alchemist', authors: ['Paulo Coelho'], publisher: 'HarperOne', publishedDate: '2014' };
    const labels = versionLabels([
      { ...base, bookKey: 'v1:isbn:9780062315007', isbn13: '9780062315007', format: 'Paperback' },
      { ...base, bookKey: 'v1:isbn:9780062416216', isbn13: '9780062416216', format: 'Hardcover' },
      { ...base, bookKey: 'v1:isbn:9780062355300', isbn13: '9780062355300', format: 'Hardcover' },
      { ...base, bookKey: 'v1:isbn:9780061122415', isbn13: '9780061122415', publishedDate: '2006' },
    ]);
    expect(labels.map(row => row.label)).toEqual([
      'HarperOne · Published 2014 · Paperback',
      'HarperOne · Published 2014 · Hardcover · ISBN 9780062416216',
      'HarperOne · Published 2014 · Hardcover · ISBN 9780062355300',
      'HarperOne · Published 2006',
    ]);
    expect(labels.map(row => row.showsIsbn)).toEqual([false, true, true, false]);
  });

  it('falls back to a record number only when nothing else distinguishes rows', () => {
    const rows = [
      { bookKey: catalogKey(1), title: 'Wings of fire', authors: [] },
      { bookKey: catalogKey(2), title: 'Wings of fire', authors: [], publisher: 'Another edition' },
      { bookKey: catalogKey(3), title: 'Wings of fire', authors: [] },
    ];
    expect(versionLabels(rows).map(row => row.label)).toEqual(['Record 1', 'Another edition', 'Record 3']);
    expect(versionLabels(rows.map(row => ({ ...row, bookKey: row.bookKey.replace('catalog:koha', 'googlebooks') }))).map(row => row.label))
      .toEqual(['Version 1', 'Another edition', 'Version 3']);
    expect(versionLabels([{ ...rows[0], publishedDate: '2013' }, { ...rows[2], publishedDate: '2013' }]).map(row => row.label))
      .toEqual(['Published 2013 · Record 1', 'Published 2013 · Record 2']);
  });
});
