import { describe, expect, it } from 'vitest';
import { groupSearchResults } from './searchGroups';
import type { PublicBook } from './types';

const reasoning: PublicBook[] = [
  { bookKey: 'v1:openlibrary:OL20774896W', title: 'A Modern Approach To Logical Reasoning', authors: ['Dr. R S Aggarwal'], publishedDate: '2014' },
  { bookKey: 'v1:openlibrary:OL29062473W', title: 'A Modern Approach to Logical Reasoning', authors: ['R. S. Aggarwal'], publishedDate: '2007' },
  { bookKey: 'v1:openlibrary:OL24612560W', title: 'A Modern Approach to Logical Reasoning', authors: [], publishedDate: '2017' },
];

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
});
