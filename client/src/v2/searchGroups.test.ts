import { describe, expect, it } from 'vitest';
import { coverAlternatives, groupSearchResults, normalizeAuthor, versionLabels, volumeKey } from './searchGroups';
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
    expect(groups[0].key).toBe('g2:work:OL15358691W');
    expect(groups[0].separateWorks).toBe(false);
  });

  it('shows different work IDs with the same title and authors as one card of separate records', () => {
    const groups = groupSearchResults(reasoningWorks.slice(0, 2));
    expect(groups).toHaveLength(1);
    expect(groups[0].versions).toEqual(reasoningWorks.slice(0, 2));
    expect(groups[0].separateWorks).toBe(true);
    // A record without a work ID joins them; the author-less work record does not.
    const loose = { ...reasoning[1], bookKey: 'v1:googlebooks:Loose' };
    expect(groupSearchResults([...reasoningWorks, loose]).map(group => group.versions.map(book => book.bookKey)))
      .toEqual([[reasoningWorks[0].bookKey, reasoningWorks[1].bookKey, loose.bookKey], [reasoningWorks[2].bookKey]]);
    const joined = groupSearchResults([reasoningWorks[0], loose]);
    expect(joined).toHaveLength(1);
    expect(joined[0].versions).toEqual([reasoningWorks[0], loose]);
    expect(joined[0].separateWorks).toBe(false);
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
    expect(first[0].key.startsWith('g2:')).toBe(true);
    expect(first.every(group => !group.versions.some(book => book.bookKey === group.key))).toBe(true);
    const later = groupSearchResults([...reasoning, { ...reasoning[0], bookKey: 'v1:googlebooks:Later', title: 'Another book' }]);
    expect(later[0].key).toBe(first[0].key);
    expect(later[1].key).not.toBe(first[0].key);
  });
});

// Separate Open Library work records for one book, as returned for "the alchemist".
const work = (id: string, title: string, authors: string[], extra: Partial<PublicBook> = {}): PublicBook =>
  ({ bookKey: `v1:openlibrary:${id}`, workId: id, title, authors, ...extra });
const alchemist = [
  work('OL796465W', 'The Alchemist', ['Paulo Coelho'], { editionCount: 141, languages: ['ger', 'pol', 'rus', 'fre', 'dan', 'vie'], publishedDate: '1988' }),
  work('OL1085186W', 'The Alchemist', ['Ben Jonson', 'Elizabeth Cook'], { editionCount: 200, languages: ['und', 'eng'], publishedDate: '1612' }),
  work('OL24793569W', 'The Alchemist Graphic Novel', ['Paulo Coelho'], { editionCount: 3, languages: ['eng'] }),
  work('OL24793570W', 'The Alchemist', ['Paulo Coello'], { editionCount: 1, languages: [], publishedDate: '2003' }),
  work('OL42974242W', 'The Alchemist', ['Paulo Coelho (Author)'], { editionCount: 1, languages: ['syc'], publishedDate: '2010' }),
  work('OL19944070W', 'The alchemist', ['Paolo Bacigalupi'], { editionCount: 1, languages: ['eng'] }),
];
const keysOf = (groups: ReturnType<typeof groupSearchResults>) => groups.map(group => group.versions.map(book => book.bookKey));

describe('cross-work presentation groups (owner-approved 2026-11-11)', () => {
  it('shows separate work records of one novel as one card, keeping every record, the first as main and the largest edition count', () => {
    const groups = groupSearchResults(alchemist);
    expect(keysOf(groups)).toEqual([
      [alchemist[0].bookKey, alchemist[3].bookKey, alchemist[4].bookKey], // Coelho, "Coello" typo, "(Author)" role
      [alchemist[1].bookKey], [alchemist[2].bookKey], [alchemist[5].bookKey],
    ]);
    expect(groups[0].book).toBe(alchemist[0]);
    expect(groups[0].separateWorks).toBe(true);
    expect(groups[0].editionCount).toBe(141); // Largest, not 143.
    expect(groups[0].versions.map(book => book.workId)).toEqual(['OL796465W', 'OL24793570W', 'OL42974242W']);
    expect(groups[0].key).toBe('g2:work:OL796465W');
    expect(groupSearchResults([alchemist[3], alchemist[0]])[0].book).toBe(alchemist[3]); // Ranked first stays first.
  });

  it('keeps the same title by different authors apart, including short common titles', () => {
    for (const title of ['The Alchemist', 'Poems', 'Selected Stories', 'Collected Works']) {
      const books = [work('OL1W', title, ['Ben Jonson']), work('OL2W', title, ['Paulo Coelho']), work('OL3W', title, ['Emily Dickinson']), work('OL4W', title, [])];
      expect(groupSearchResults(books)).toHaveLength(4);
    }
    // Author-less work records never join an attributed card.
    expect(groupSearchResults([work('OL1W', 'Poems', ['Emily Dickinson']), work('OL2W', 'Poems', [])])).toHaveLength(2);
  });

  it('tolerates only one obvious author typo: same title, same author count, one long token within one edit', () => {
    const pair = (left: string[], right: string[], title = 'The Alchemist', extra: Partial<PublicBook> = {}) =>
      groupSearchResults([work('OL1W', title, left), work('OL2W', title, right, extra)]).length;
    expect(pair(['Paulo Coelho'], ['Paulo Coello'])).toBe(1);
    expect(pair(['Paulo Coelho', 'Alan R. Clarke'], ['Clarke, Alan R.', 'Paulo Coello'])).toBe(1);
    expect(pair(['Coelho'], ['Coello'])).toBe(2); // A single-name author is not enough evidence.
    expect(pair(['Anne Rice'], ['Anne Rich'])).toBe(2); // Short tokens: different people.
    expect(pair(['Paulo Coelho'], ['Paulo Coelh'])).toBe(1); // One deletion.
    expect(pair(['Paulo Coelho'], ['Paulo Coellio'])).toBe(2); // Two edits.
    expect(pair(['Paulo Coelho'], ['Pablo Coello'])).toBe(2); // Two tokens differ.
    expect(pair(['John Brown'], ['John Crown'])).toBe(2); // Different first letter.
    expect(pair(['Paulo Coelho'], ['Paulo Coelho', 'Alan Clarke'])).toBe(2); // Different author count.
    expect(pair(['Paulo Coelho'], ['Paulo Coello'], 'Poems')).toBe(2); // Generic title.
    // Collections, life writing and school subjects are generic too.
    for (const title of ['Poetical Works', 'The Complete Poetical Works', 'Selected Short Stories', 'Selected Prose', 'My Autobiography', 'Mathematics', 'Physics', 'Kahaniyan', 'कहानियाँ', 'சிறுகதைகள்'])
      expect(pair(['James Thomson'], ['James Thompson'], title)).toBe(2);
    // A match on initials alone is not evidence of one person.
    expect(pair(['R. D. Sharma'], ['R. D. Sarma'], 'Objective Mathematics')).toBe(2);
    expect(pair(['S. K. Gupta'], ['S.K. Gupte'], 'Engineering Drawing')).toBe(2);
    expect(pair(['K. Verma'], ['K. Varma'], 'Indian History')).toBe(2);
    expect(pair(['Jawaharlal Nehru'], ['Jawaharlal Neharu'], 'The Discovery of India')).toBe(1);
    expect(pair(['Khushwant Singh'], ['Khuswant Singh'], 'Train to Pakistan')).toBe(1);
    expect(pair(['Paulo Coelho'], ['Paulo Coello'], 'The Alchemist', { languages: ['spa'] })).toBe(1);
    expect(groupSearchResults([work('OL1W', 'The Alchemist', ['Paulo Coelho'], { languages: ['eng'] }), work('OL2W', 'The Alchemist', ['Paulo Coello'], { languages: ['spa'] })])).toHaveLength(2);
    // Symbols that name a different book are kept: "Let Us C" is not "Let Us C++".
    expect(groupSearchResults([work('OL1W', 'Let us C', ['Yashavant Kanetkar']), work('OL2W', 'Let Us C++', ['Yashavant Kanetkar']), work('OL3W', 'Let Us C#', ['Yashavant Kanetkar'])])).toHaveLength(3);
    // Never for the title.
    expect(groupSearchResults([work('OL1W', 'The Alchemist', ['Paulo Coelho']), work('OL2W', 'The Alchemyst', ['Paulo Coelho'])])).toHaveLength(2);
  });

  it('keeps different volumes or parts apart even with the same author', () => {
    const books = [
      work('OL1W', 'Wings of Fire', ['Tui T. Sutherland'], { edition: 'Book 1' }),
      work('OL2W', 'Wings of Fire', ['Tui T. Sutherland'], { edition: 'Book 2' }),
      work('OL3W', 'Wings of Fire Book 3', ['Tui T. Sutherland']),
      work('OL4W', 'Wings of Fire', ['Tui T. Sutherland']),
      work('OL5W', 'Mahabharata', ['C. Rajagopalachari'], { edition: 'Vol. 1' }),
      work('OL6W', 'Mahabharata', ['C. Rajagopalachari'], { edition: 'Part 1' }),
    ];
    expect(groupSearchResults(books)).toHaveLength(6);
    expect(groupSearchResults([work('OL1W', 'Wings of Fire', ['Tui T. Sutherland'], { edition: 'Book 1' }), work('OL2W', 'Wings of fire', ['Sutherland, Tui T.'], { edition: 'Book one' })])).toHaveLength(1);
  });

  it('keeps adaptations, graphic novels, abridgements, study guides and box sets apart from the original', () => {
    const titles = ['The Alchemist: A Graphic Novel', 'The Alchemist (Abridged)', 'The Alchemist: Study Guide', 'SparkNotes: The Alchemist',
      'The Alchemist Box Set', 'The Alchemist: 25th Anniversary Edition', 'The Alchemist Adapted for Young Readers'];
    const books = [alchemist[0], ...titles.map((title, index) => work(`OL${index + 1}W`, title, ['Paulo Coelho']))];
    expect(groupSearchResults(books)).toHaveLength(books.length);
  });

  it('keeps an exact-match translation as a labelled row, but never tolerates a typo across languages', () => {
    const english = work('OL1W', 'The Alchemist', ['Paulo Coelho'], { language: 'eng', publisher: 'HarperOne', publishedDate: '1993' });
    const spanish = work('OL2W', 'The Alchemist', ['Coelho, Paulo'], { language: 'spa', publisher: 'HarperOne', publishedDate: '1993' });
    const groups = groupSearchResults([english, spanish]);
    expect(groups).toHaveLength(1);
    expect(versionLabels(groups[0].versions, true).map(row => row.label)).toEqual(['HarperOne · Published 1993 · English', 'HarperOne · Published 1993 · Spanish']);
    expect(groupSearchResults([english, { ...spanish, authors: ['Paulo Coello'] }])).toHaveLength(2);
    // A different title (the usual translation) is a different card.
    expect(groupSearchResults([english, work('OL3W', 'El Alquimista', ['Paulo Coelho'], { language: 'spa' })])).toHaveLength(2);
  });

  it('shows series records titled only by the series name as separate records in one card, without borrowing covers', () => {
    const series = [
      work('OL27696982W', 'Wings of Fire', ['Tui T. Sutherland'], { editionCount: 22, publishedDate: '2012', coverUrl: 'https://covers.example/1.jpg' }),
      work('OL43271781W', 'Wings of Fire', ['Tui T. Sutherland'], { editionCount: 13, publishedDate: '2016' }),
      work('OL16833236W', 'Wings of Fire', ['Tui T. Sutherland'], { editionCount: 23, publishedDate: '2012', coverUrl: 'https://covers.example/3.jpg' }),
      work('OL17423096W', 'Wings of Fire', ['Tui T. Sutherland'], { editionCount: 23, publishedDate: '2012' }),
    ];
    const kalam = work('OL1037811W', 'Wings of Fire', ['A. P. J. Abdul Kalam'], { editionCount: 9 });
    const groups = groupSearchResults([kalam, ...series]);
    expect(keysOf(groups)).toEqual([[kalam.bookKey], series.map(book => book.bookKey)]);
    const [, card] = groups;
    expect(card.separateWorks).toBe(true);
    expect(card.editionCount).toBe(23);
    expect(card.book).toBe(series[0]);
    // Rows are numbered as records, never as versions of one book; nothing is invented.
    const labels = versionLabels(card.versions, card.separateWorks);
    expect(labels.map(row => row.label)).toEqual(['Published 2012 · 22 editions', 'Published 2016', 'Published 2012 · 23 editions · Record 3', 'Published 2012 · 23 editions · Record 4']);
    expect(labels.map(row => row.showsEditions)).toEqual([true, false, true, true]);
    expect(coverAlternatives(card)).toEqual([series[0]]);
    expect(coverAlternatives(groupSearchResults(reasoning)[0])).toEqual(reasoning);
  });

  it('treats a leading English article as part of the same title only for the same authors', () => {
    const gatsby = work('OL468431W', 'The Great Gatsby', ['F. Scott Fitzgerald'], { editionCount: 1181 });
    const bare = work('OL34381078W', 'Great Gatsby', ['Fitzgerald, F. Scott'], { editionCount: 14 });
    const groups = groupSearchResults([gatsby, bare, work('OL3W', 'Great Gatsby', ['Someone Else'])]);
    expect(keysOf(groups)).toEqual([[gatsby.bookKey, bare.bookKey], ['v1:openlibrary:OL3W']]);
    expect(groups[0].book).toBe(gatsby);
    expect(groups[0].separateWorks).toBe(true);
    expect(groupSearchResults([work('OL11930W', 'A Suitable Boy', ['Vikram Seth']), work('OL9398348W', 'Suitable Boy', ['Vikram Seth'])])).toHaveLength(1);
    expect(groupSearchResults([work('OL1W', 'An Equal Music', ['Vikram Seth']), work('OL2W', 'Equal Music', ['Vikram Seth'])])).toHaveLength(1);
    // Different authors stay apart: "The Stand" (King) is not "Stand" (another writer).
    expect(groupSearchResults([work('OL1W', 'The Stand', ['Stephen King']), work('OL2W', 'Stand', ['Jane Doe'])])).toHaveLength(2);
    // Never combined with the author-typo allowance.
    expect(groupSearchResults([gatsby, work('OL5W', 'Great Gatsby', ['F. Scott Fitzgeralt'])])).toHaveLength(2);
    expect(groupSearchResults([work('OL6W', 'The Alchemist', ['Paulo Coelho']), work('OL7W', 'Alchemist', ['Paulo Coello'])])).toHaveLength(2);
    // Only a leading English article; the rest must be the same title and volume.
    expect(groupSearchResults([work('OL1W', 'The Great Gatsby', ['F. Scott Fitzgerald']), work('OL2W', 'Gatsby', ['F. Scott Fitzgerald'])])).toHaveLength(2);
    expect(groupSearchResults([work('OL1W', 'The Hobbit Vol. 1', ['J.R.R. Tolkien']), work('OL2W', 'Hobbit Vol. 2', ['J.R.R. Tolkien'])])).toHaveLength(2);
    expect(groupSearchResults([work('OL1W', 'La Peste', ['Albert Camus']), work('OL2W', 'Peste', ['Albert Camus'])])).toHaveLength(2);
    expect(groupSearchResults([work('OL1W', 'Theory', ['Ann Author']), work('OL2W', 'Ory', ['Ann Author'])])).toHaveLength(2);
    // An article is never the whole title ("The A" stays apart from "A").
    expect(groupSearchResults([work('OL1W', 'The A', ['Ann Author']), work('OL2W', 'A', ['Ann Author'])])).toHaveLength(2);
    // A generic remainder by the same author shares a card, as an exact generic title does.
    expect(groupSearchResults([work('OL1W', 'The Poems', ['Wilfred Owen']), work('OL2W', 'Poems', ['Wilfred Owen'])])).toHaveLength(1);
    expect(groupSearchResults([work('OL1W', 'The Poems', ['Wilfred Owen']), work('OL2W', 'Poems', ['Siegfried Sassoon'])])).toHaveLength(2);
    // Conflicting known languages need the exact title.
    expect(groupSearchResults([work('OL1W', 'The Great Gatsby', ['F. Scott Fitzgerald'], { language: 'eng' }),
      work('OL2W', 'Great Gatsby', ['F. Scott Fitzgerald'], { language: 'ita' })])).toHaveLength(2);
    // Author-less records do not use the article rule.
    expect(groupSearchResults([{ bookKey: 'v1:googlebooks:A', title: 'The Great Gatsby', authors: [] }, { bookKey: 'v1:googlebooks:B', title: 'Great Gatsby', authors: [] }])).toHaveLength(2);
  });

  it('keeps group keys distinct from record keys, stable as later pages arrive, and never reuses g1 keys', () => {
    const first = groupSearchResults(alchemist.slice(0, 3));
    const later = groupSearchResults([...alchemist, work('OL9W', 'The Alchemist', ['Paulo Coelho'])]);
    expect(later.slice(0, 3).map(group => group.key)).toEqual(first.map(group => group.key));
    expect(later[0].versions).toHaveLength(4);
    const all = later.flatMap(group => group.versions.map(book => book.bookKey));
    expect(later.every(group => group.key.startsWith('g2:') && !all.includes(group.key))).toBe(true);
    expect(new Set(later.map(group => group.key)).size).toBe(later.length);
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
