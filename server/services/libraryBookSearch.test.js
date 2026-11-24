import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAX_MATCHES, carriesAuthor, mainTitle, matchingRows, orderMatches, searchLibraryBook, titleMatches } from './libraryBookSearch.js';
import pool from '../../shared/us-book-pool.json' with { type: 'json' };

// TLC LS2 PAC rows saved by the US research on 23 November 2026: 80 searches
// (the 40 pool books at Los Angeles PL and Frederick County PL), 1,665 rows
// with the catalog's format label and, for rows passing the title rule, a
// hand-judged kind (`work` is the book itself). Titles, authors and formats only.
const tlcFixture = name => new URL(`../test/fixtures/tlc/${name}`, import.meta.url);
const tlcRows = fs.readFileSync(tlcFixture('rows.tsv'), 'utf8').trim().split('\n').slice(1).map(line => {
  const [book, host, pos, format, kind, title, author] = line.split('\t');
  return { book: Number(book), host, pos: Number(pos), format, kind, title, authors: author ? [author] : [] };
});
const tlcSearch = name => JSON.parse(fs.readFileSync(tlcFixture(name), 'utf8')).resources
  .map(row => ({ title: row.shortTitle, authors: row.shortAuthor ? [row.shortAuthor] : [], format: row.format }));

const ISBN = '9788173711466';
const coded = code => Object.assign(new Error(code), { code });

// A catalog that counts its searches: `rows` is what each search answers (or
// an Error it fails with, or a function of the term).
function catalog(rows, extra = {}) {
  const asked = [];
  return { asked, ...extra, search: term => {
    asked.push(term);
    if (rows instanceof Error) return Promise.reject(rows);
    return Promise.resolve(typeof rows === 'function' ? rows(term) : rows);
  } };
}

test('the matcher: 80% of the title\'s words among the row title\'s words, in any order', () => {
  assert.equal(mainTitle('Wings of Fire: An Autobiography'), 'Wings of Fire');
  assert.equal(mainTitle('Wings of Fire / A. P. J. Abdul Kalam'), 'Wings of Fire');
  assert.equal(titleMatches('JAWAHARLAL NEHRU : The Discovery of India', 'The Discovery of India'), true);
  assert.equal(titleMatches('Discovery of India', 'The Discovery of India'), true);
  assert.equal(titleMatches('Wings of Fire: The dark secret', 'Wings of Fire'), true);
  assert.equal(titleMatches('Wing Of Fire', 'Wings of Fire'), false);
  for (const row of ['WINGS OF FIRE', 'Wings of fire : an autobiography', 'Fire, wings of', 'The Wings of Fire'])
    assert.equal(titleMatches(row, 'Wings of Fire: An Autobiography'), true, row);
  // Four of five words is 80%: a match. Three of five is not.
  assert.equal(titleMatches('Harry Potter and Philosopher\'s Stone', 'Harry Potter and the Philosopher\'s Stone'), true);
  assert.equal(titleMatches('Harry Potter Stone', 'Harry Potter and the Philosopher\'s Stone'), false);
  assert.equal(titleMatches('Timeless Malgudi Days', 'Malgudi Days'), true);
  for (const row of ['Malgudi', 'Days', '']) assert.equal(titleMatches(row, 'Malgudi Days'), false, row);
  assert.equal(titleMatches('Les Misérables', 'Les Miserables'), true);
  // Other scripts keep their vowel signs: different words stay different.
  assert.equal(titleMatches('रोम', 'राम'), false);
  assert.equal(titleMatches('गोदान', 'गोदान'), true);
});

test('display order: the ISBN row first, then the exact title, then titles that start with it, then the rest', () => {
  const rows = [{ title: 'Kalam: Wings of Fire' }, { title: 'Wings of Fire 2' }, { title: 'Wings of fire' }, { title: 'Fire wings of', isbn: ISBN }];
  assert.deepEqual(orderMatches(rows, 'Wings of Fire', ISBN).map(row => row.title), ['Fire wings of', 'Wings of fire', 'Wings of Fire 2', 'Kalam: Wings of Fire']);
  assert.deepEqual(orderMatches(rows, 'Wings of Fire').map(row => row.title), ['Wings of fire', 'Wings of Fire 2', 'Kalam: Wings of Fire', 'Fire wings of']);
});

test('display order: rows with the book\'s author first; within them and the rest, the title groups; within each, books, then e-books and audiobooks, then other formats', () => {
  const rows = [
    { title: 'Wings of fire', format: 'eBook', authors: ['Kalam, A. P. J. Abdul'] },
    { title: 'Wings of fire : a guide', format: 'Book', authors: ['Guide, Some'] },
    { title: 'Wings of fire', format: 'Book', authors: [] },
    { title: 'Kalam: Wings of Fire', format: 'Book', authors: ['Kalam, A. P. J. Abdul'] },
    { title: 'Wings of fire', authors: ['Kalam, Abdul'] },
    { title: 'Wings of fire', format: 'Book on CD', authors: [] },
    { title: 'Wings of fire', format: 'Kit', authors: ['Kalam, Abdul'] },
    { title: 'Wings of fire : the film', format: 'DVD', authors: ['Kalam, Abdul'] },
    { title: 'Wings of fire', format: 'DVD', authors: [] },
  ];
  assert.deepEqual(orderMatches(rows, 'Wings of Fire', null, ['A. P. J. Abdul Kalam']).map(row => [row.title, row.format || '-']), [
    // Kalam's rows: the exact main title (before ":" or "/") as the row with
    // no format, the e-book and the kit, then his other match...
    ['Wings of fire', '-'], ['Wings of fire', 'eBook'], ['Wings of fire', 'Kit'], ['Kalam: Wings of Fire', 'Book'],
    // ...then the other rows: the exact main title as books in the catalog's
    // order, then the audiobook.
    ['Wings of fire : a guide', 'Book'], ['Wings of fire', 'Book'], ['Wings of fire', 'Book on CD'],
    // Films and music after every other row, the author's included, ranked the same way among themselves.
    ['Wings of fire : the film', 'DVD'], ['Wings of fire', 'DVD']]);
  // With no author known, the title groups and formats alone, then the catalog's order.
  assert.deepEqual(orderMatches(rows, 'Wings of Fire').map(row => row.format || '-'), ['Book', 'Book', '-', 'eBook', 'Book on CD', 'Kit', 'Book', 'DVD', 'DVD']);
  // A print record with a subtitle is an exact title: before the audiobook titled exactly the same.
  assert.deepEqual(orderMatches([{ title: 'Atomic habits', format: 'eAudioBook' }, { title: 'Atomic habits : tiny changes, remarkable results', format: 'Book' },
    { title: 'Atomic habits for teens', format: 'Book' }], 'Atomic Habits').map(row => row.format), ['Book', 'eAudioBook', 'Book']);
  // The ISBN row is this edition: still first, whatever its format.
  assert.equal(orderMatches([...rows, { title: 'Wings of fire', format: 'eBook', isbn: ISBN }], 'Wings of Fire', ISBN, ['Kalam'])[0].isbn, ISBN);
  // A better title match goes ahead of a book row with a lesser one.
  assert.deepEqual(orderMatches([{ title: 'Harper Lee\'s To kill a mockingbird', format: 'Book' }, { title: 'To kill a mockingbird', format: 'eAudioBook' }], 'To Kill a Mockingbird')
    .map(row => row.format), ['eAudioBook', 'Book']);
});

test('an author is matched by family name, never decides a find', () => {
  assert.equal(carriesAuthor({ authors: ['Lee, Harper'] }, ['Harper Lee']), true);
  assert.equal(carriesAuthor({ authors: ['Van Pelt, Shelby'] }, ['Shelby Van Pelt']), true);
  assert.equal(carriesAuthor({ authors: ['García Márquez, Gabriel, 1927-2014'] }, ['Gabriel García Márquez']), true);
  assert.equal(carriesAuthor({ author: 'Seuss, Dr.' }, ['Dr. Seuss']), true);
  assert.equal(carriesAuthor({ authors: ['Hartley, Mary'] }, ['Harper Lee']), false);
  assert.equal(carriesAuthor({ authors: [] }, ['Harper Lee']), false);
  assert.equal(carriesAuthor({ authors: ['Lee, Harper'] }, []), false);
});

// Gandhi's "An autobiography": the check searches the main title, and other
// people's autobiographies pass the title rule too (24 November 2026: they
// ranked above "Gandhi : an autobiography", whose main title is "Gandhi").
const GANDHI = { title: 'An autobiography', authors: ['Mahatma Gandhi'] };
const GANDHI_ISBN = '9780143039679';
const gandhiRows = () => [
  { title: 'Autobiography of a yogi', format: 'Book', authors: ['Yogananda, Paramahansa, 1893-1952'] },
  { title: 'The autobiography of Malcolm X', format: 'Book', authors: ['X, Malcolm, 1925-1965'] },
  { title: 'An autobiography', format: 'Book', authors: ['Nehru, Jawaharlal, 1889-1964'] },
  { title: 'Gandhi : an autobiography', format: 'Book', authors: ['Gandhi, Mahatma, 1869-1948'] },
  { title: 'An autobiography, or the story of my experiments with truth / M.K. Gandhi', format: 'Book', authors: ['Gandhi, M. K.'] },
].map((row, index) => ({ ...row, recordId: String(index + 1), catalogUrl: `https://c.example/${index + 1}`, catalogLinkKind: 'record' }));

test('display order: rows with the book\'s author go before the title groups (Gandhi\'s "An autobiography")', async () => {
  const ranked = matchingRows(gandhiRows(), GANDHI);
  assert.deepEqual(ranked.map(row => row.title), [
    // Gandhi's rows: the title that starts with the book's title, then the other match...
    'An autobiography, or the story of my experiments with truth / M.K. Gandhi', 'Gandhi : an autobiography',
    // ...then the other authors' rows: the exact main title, then the titles that start with it.
    'An autobiography', 'Autobiography of a yogi', 'The autobiography of Malcolm X']);
  // With no author known, the title groups alone (the order of every row before 24 November 2026).
  assert.deepEqual(matchingRows(gandhiRows(), { title: GANDHI.title }).map(row => row.recordId), ['3', '1', '2', '5', '4']);
  // The first row is the card's first entry and the found answer's catalog
  // link; every row is still a find (ranking only).
  const result = await searchLibraryBook(catalog(gandhiRows()), GANDHI);
  assert.deepEqual([result.outcome, result.catalogUrl, result.catalogLinkKind, result.matchedBook.title],
    ['in_catalog', 'https://c.example/5', 'record', 'An autobiography, or the story of my experiments with truth / M.K. Gandhi']);
  assert.deepEqual(result.matches.map(match => match.url), ['https://c.example/5', 'https://c.example/4', 'https://c.example/3', 'https://c.example/1', 'https://c.example/2']);
  assert.equal((await searchLibraryBook(catalog(gandhiRows()), { title: GANDHI.title })).matches.length, 5);
});

test('display order: the ISBN row still goes first, before the author\'s rows', () => {
  const isbnRow = { title: 'The story of my experiments with truth : an autobiography', format: 'eBook', authors: [], isbn: GANDHI_ISBN };
  for (const rows of [[...gandhiRows(), isbnRow], [isbnRow, ...gandhiRows()]]) {
    const ranked = matchingRows(rows, GANDHI, { isbn: GANDHI_ISBN });
    assert.equal(ranked[0], isbnRow);
    assert.deepEqual(ranked.slice(1, 3).map(row => row.recordId), ['5', '4']);
  }
  // Without the book's ISBN it is one of the other rows, after the author's.
  assert.equal(matchingRows([isbnRow, ...gandhiRows()], GANDHI).at(-1), isbnRow);
});

test('display order: a film row by the author still goes last, and still counts', async () => {
  const film = { title: 'Gandhi : an autobiography', format: 'DVD', authors: ['Gandhi, Mahatma, 1869-1948'], recordId: '6', catalogUrl: 'https://c.example/6', catalogLinkKind: 'record' };
  for (const rows of [[film, ...gandhiRows()], [...gandhiRows(), film]]) {
    const ranked = matchingRows(rows, GANDHI);
    assert.equal(ranked.length, 6);
    assert.equal(ranked.at(-1), film);
    assert.deepEqual(ranked.slice(0, 2).map(row => row.recordId), ['5', '4']);
  }
  // A film showing the book's ISBN goes last too.
  assert.equal(matchingRows([{ ...film, isbn: GANDHI_ISBN }, ...gandhiRows()], GANDHI, { isbn: GANDHI_ISBN }).at(-1).recordId, '6');
  const result = await searchLibraryBook(catalog([film, ...gandhiRows()]), GANDHI);
  assert.deepEqual([result.catalogUrl, result.matches.at(-1).url, result.matches.length], ['https://c.example/5', 'https://c.example/6', 6]);
});

test('every row passing the title rule is a find, whatever its format: films and music count, and come last', async () => {
  const film = [{ title: 'The Hobbit', format: 'DVD' }, { title: 'The Hobbit', format: 'Blu-ray' }, { title: 'The Hobbit : the desolation of Smaug', format: 'MUSIC_CD' },
    { title: 'The Hobbit', format: 'Score' }, { title: 'The Hobbit', format: 'eVideo' }];
  // A library with only the films and the soundtrack: found ("wrongly saying something is found is okay").
  const only = await searchLibraryBook(catalog(film.map((row, index) => ({ ...row, recordId: String(index) }))), { title: 'The Hobbit' });
  assert.equal(only.outcome, 'in_catalog');
  assert.equal(only.matches.length, 5);
  for (const format of ['eBook', 'eAudioBook', 'Book on CD', 'Playaway', 'EAUDIOBOOK', undefined, '0', 'Book']) {
    const result = await searchLibraryBook(catalog([...film, { title: 'The Hobbit', format }].map((row, index) => ({ ...row, recordId: String(index) }))), { title: 'The Hobbit' });
    assert.equal(result.outcome, 'in_catalog', String(format));
    assert.equal(result.matches.length, 6, String(format));
    // The one row that is not a film or music comes first.
    assert.equal(matchingRows([...film, { title: 'The Hobbit', format }], { title: 'The Hobbit' })[0].format, format, String(format));
  }
  // The same for the rows of an ISBN search.
  assert.equal((await searchLibraryBook(catalog([{ title: 'A record', format: 'DVD' }]), { title: '' }, { readerIsbn: ISBN })).outcome, 'in_catalog');
  assert.deepEqual(matchingRows([{ title: 'Malgudi days', format: 'Video cassette' }, { title: 'Malgudi days', format: 'Text book' }], { title: 'Malgudi Days' })
    .map(row => row.format), ['Text book', 'Video cassette']);
});

// SFPL labels soundtrack rows MUSIC_DOWNLOAD (live check, 23 November 2026).
// It was read as an e-book ("download") and ranked before the print rows.
test('a MUSIC_DOWNLOAD soundtrack ranks after every book, e-book and audio row, and still counts', async () => {
  const soundtrack = { title: "Charlotte's Web (Original Motion Picture Soundtrack)", format: 'MUSIC_DOWNLOAD' };
  const others = [{ title: "Charlotte's web", format: 'BK' }, { title: "Charlotte's web", format: 'LPRINT' }, { title: "Charlotte's web", format: 'EBOOK' },
    { title: "Charlotte's web", format: 'EAUDIOBOOK' }, { title: "Charlotte's web", format: 'BOOK_CD' }, { title: "Charlotte's web", format: 'AB' },
    { title: "Charlotte's web : a study guide", format: 'BK' }, { title: "Charlotte's web", format: undefined },
    // Rows the soundtrack outranked as an "e-book": later title groups.
    { title: "Charlotte's web (unabridged)", format: 'EAUDIOBOOK' }, { title: "The annotated Charlotte's web", format: 'BK' },
    { title: "E. B. White's Charlotte's web", format: 'EBOOK' }];
  const book = { title: "Charlotte's Web", authors: ['E. B. White'] };
  for (const rows of [[soundtrack, ...others], [...others, soundtrack], [others[0], soundtrack, ...others.slice(1)]]) {
    const ranked = matchingRows(rows, book);
    assert.equal(ranked.length, others.length + 1, 'the soundtrack is still a find');
    assert.equal(ranked.at(-1), soundtrack);
  }
  // Ranking only: a library with only the soundtrack still has a find.
  const only = await searchLibraryBook(catalog([{ ...soundtrack, recordId: '1' }]), book);
  assert.equal(only.outcome, 'in_catalog');
});

test('TLC rows: all 80 finds and every matching row stay, the exact main title comes first, and films and music come last', () => {
  const searches = new Map();
  for (const row of tlcRows) {
    const key = `${row.book}:${row.host}`;
    if (!searches.has(key)) searches.set(key, []);
    searches.get(key).push(row);
  }
  assert.equal(searches.size, 80);
  const VIDEO_OR_MUSIC = ['DVD', 'Video Recording', 'eVideo', 'Music CD', 'eMusic', 'Score'];
  const exactKey = value => value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^(?:the|an?) /, '');
  let shownRows = 0, passingRows = 0, filmRows = 0, exactSearches = 0;
  const printFirst = [];
  for (const [key, rows] of searches) {
    const book = pool.books[Number(key.split(':')[0]) - 1];
    assert.equal(rows[0].book, Number(key.split(':')[0]));
    const shown = matchingRows(rows, { title: book.title, authors: [book.author] });
    // Every search still finds the book itself...
    assert.ok(shown.some(row => row.kind === 'work'), key);
    // ...and every row passing the title rule is still a find (the rule is unchanged).
    const passing = rows.filter(row => titleMatches(row.title, book.title));
    assert.deepEqual(new Set(shown), new Set(passing), key);
    shownRows += shown.length; passingRows += passing.length;
    // Films and music come after every other row.
    const films = shown.map(row => VIDEO_OR_MUSIC.includes(row.format));
    filmRows += films.filter(Boolean).length;
    assert.ok(films.indexOf(true) === -1 || films.indexOf(true) > films.lastIndexOf(false), key);
    // Where a row (not a film) has exactly the book's title as its main title, the card starts with one.
    if (shown.some(row => !VIDEO_OR_MUSIC.includes(row.format) && exactKey(mainTitle(row.title)) === exactKey(book.title))) {
      exactSearches += 1;
      assert.equal(exactKey(mainTitle(shown[0].title)), exactKey(book.title), key);
    }
    if (shown[0].kind === 'work' && ['Book', 'Large Print'].includes(shown[0].format)) printFirst.push(key);
  }
  assert.deepEqual([shownRows, passingRows, filmRows, exactSearches], [903, 903, 81, 80]);
  // The print book itself is first in 76 of 80. Left: the young readers'
  // edition of Killers of the Flower Moon, listed before the book with the
  // same main title, and Diary of a Wimpy Kid, whose main title starts every
  // book of the series (decision 12).
  assert.equal(printFirst.length, 76);
});

test('TLC fixtures: LAPL lists study guides above the novel; the card starts with the novel by its author, the film last', async () => {
  const mockingbird = tlcSearch('lapl-02-to-kill-a-mockingbird.json');
  const result = await searchLibraryBook(catalog(mockingbird), { title: 'To Kill a Mockingbird', authors: ['Harper Lee'] });
  // Rows with no record ID are listed once per title.
  assert.deepEqual(result.matches.map(match => [match.title, match.author || '']), [
    ['To kill a mockingbird', 'Lee, Harper'], ['To kill a mockingbird : threatening boundaries', 'Johnson, Claudia Durst'],
    ['To kill a mockingbird : a graphic novel', 'Fordham, Fred'], ['Harper Lee\'s To kill a mockingbird', 'Hartley, Mary'],
    ['CliffsNotes Lee\'s To kill a mockingbird', 'Castleman, Tamara'], ['An Introduction to To kill a mockingbird by Harper Lee : audio guide', 'Stone, Dan']]);
  const ranked = matchingRows(mockingbird, { title: 'To Kill a Mockingbird', authors: ['Harper Lee'] });
  assert.equal(ranked.length, 25);
  // The exact main title first: Harper Lee's 13 rows (print and large print,
  // then her e-books and audiobooks), then the others' (the study, the record
  // with no author and the graphic novel in the catalog's order, then an
  // e-book); the film last.
  assert.deepEqual(ranked.slice(0, 17).map(row => mainTitle(row.title)), Array(17).fill('To kill a mockingbird'));
  assert.deepEqual(ranked.map(row => carriesAuthor(row, ['Harper Lee'])), [...Array(13).fill(true), ...Array(12).fill(false)]);
  assert.deepEqual([...new Set(ranked.slice(0, 8).map(row => row.format))].sort(), ['Book', 'Large Print']);
  assert.deepEqual([...new Set(ranked.slice(8, 13).map(row => row.format))].sort(), ['Book on CD', 'eAudioBook', 'eBook']);
  assert.deepEqual(ranked.slice(13, 17).map(row => [row.title, row.format]), [['To kill a mockingbird : threatening boundaries', 'Book'],
    ['To kill a mockingbird', 'Book'], ['To kill a mockingbird : a graphic novel', 'Book'], ['To kill a mockingbird', 'eBook']]);
  assert.deepEqual([ranked[24].format, ranked[24].title], ['DVD', 'To kill a mockingbird']);
  // Frederick: the print book, then the Spanish edition is not a match, unrelated rows never are.
  const bright = await searchLibraryBook(catalog(tlcSearch('fcpl-01-remarkably-bright-creatures.json')), { title: 'Remarkably Bright Creatures', authors: ['Shelby Van Pelt'] });
  assert.deepEqual(bright.matches, [{ title: 'Remarkably bright creatures', author: 'Van Pelt, Shelby' }]);
  assert.deepEqual(matchingRows(tlcSearch('fcpl-01-remarkably-bright-creatures.json'), { title: 'Remarkably Bright Creatures' }).map(row => row.format),
    ['Book', 'Large Print', 'Book on CD', 'eBook', 'eAudioBook']);
  // Diary of a Wimpy Kid: every series book passes the title rule; the card shows ten.
  const wimpySearch = tlcSearch('lapl-24-diary-of-a-wimpy-kid.json');
  const wimpy = matchingRows(wimpySearch, { title: 'Diary of a Wimpy Kid', authors: ['Jeff Kinney'] });
  assert.equal(wimpy.length, 25);
  assert.deepEqual(wimpy.slice(0, 2).map(row => row.format), ['Large Print', 'Large Print']);
  assert.equal((await searchLibraryBook(catalog(wimpySearch), { title: 'Diary of a Wimpy Kid', authors: ['Jeff Kinney'] })).matches.length, MAX_MATCHES);
});

test('a check is exactly one catalog search, with the book\'s main title, whatever key reached the book', async () => {
  const rows = [{ recordId: '1', title: 'Wings of fire : an autobiography', authors: ['Kalam, A. P. J. Abdul'], catalogUrl: 'https://c.example/1', catalogLinkKind: 'record' }];
  for (const options of [{}, { readerIsbn: ISBN }]) {
    const provider = catalog(rows);
    const result = await searchLibraryBook(provider, { title: 'Wings of Fire: An Autobiography' }, options);
    assert.deepEqual(provider.asked, ['Wings of Fire']);
    assert.deepEqual([result.outcome, result.matchKind, result.lookupKind, result.foundBy, result.catalogUrl], ['in_catalog', 'verified_work', 'title', 'title', 'https://c.example/1']);
    assert.deepEqual(result.matches, [{ title: 'Wings of fire : an autobiography', author: 'Kalam, A. P. J. Abdul', url: 'https://c.example/1' }]);
  }
});

test('a found answer lists up to ten matching rows; a row of another author still counts', async () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({ recordId: String(index), title: index ? `Wings of Fire ${index}` : 'Wings', authors: [`Author ${index}`] }));
  const result = await searchLibraryBook(catalog(rows), { title: 'Wings of Fire' });
  assert.equal(MAX_MATCHES, 10);
  assert.equal(result.matches.length, MAX_MATCHES);
  assert.deepEqual(result.matches.map(match => match.title), Array.from({ length: 10 }, (_, index) => `Wings of Fire ${index + 1}`));
});

test('no title: the term is the ISBN, and a row that shows only other ISBNs does not match', async () => {
  const provider = catalog([{ title: 'Another book', isbn: '9780262033848' }, { title: 'A record', recordId: '7' }]);
  const result = await searchLibraryBook(provider, { title: `ISBN ${ISBN}` }, { readerIsbn: ISBN });
  assert.deepEqual(provider.asked, [ISBN]);
  assert.deepEqual([result.matchKind, result.matchedBook.isbn13, result.matches], ['exact_isbn', ISBN, [{ title: 'A record' }]]);
  assert.deepEqual(await searchLibraryBook(catalog([{ title: 'Other', isbn: '9780262033848' }]), { title: '' }, { readerIsbn: ISBN }), { outcome: 'no_match' });
  // No title and no ISBN: nothing to search.
  const none = catalog([]);
  assert.deepEqual(await searchLibraryBook(none, { title: '' }), { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', notCatalogFailure: true });
  assert.deepEqual(none.asked, []);
});

test('a catalog asked only by ISBN is handed the reader\'s ISBN, else the work\'s latest; every returned row matches', async () => {
  const held = { outcome: 'available', catalogUrl: 'https://c.example/r', catalogLinkKind: 'record' };
  const provider = catalog([{ title: '', observation: held }], { searchBy: 'isbn' });
  const byKey = await searchLibraryBook(provider, { title: 'Wings of Fire' }, { readerIsbn: ISBN, latestIsbn: () => assert.fail('not needed') });
  assert.deepEqual(provider.asked, [ISBN]);
  assert.deepEqual([byKey.outcome, byKey.matchKind, byKey.catalogUrl, byKey.matches], ['available', 'exact_isbn', 'https://c.example/r', [{ title: 'Wings of Fire', url: 'https://c.example/r' }]]);
  const work = catalog([], { searchBy: 'isbn' });
  assert.deepEqual(await searchLibraryBook(work, { title: 'Wings of Fire' }, { latestIsbn: async () => '9780000000002' }), { outcome: 'no_match' });
  assert.deepEqual(work.asked, ['9780000000002']);
  assert.deepEqual(await searchLibraryBook(catalog([], { searchBy: 'isbn' }), { title: 'X' }, { latestIsbn: async () => null }),
    { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', notCatalogFailure: true });
  // Open Library failing is not the catalog's failure.
  const failed = await searchLibraryBook(catalog([], { searchBy: 'isbn' }), { title: 'X' }, { latestIsbn: async () => { throw coded('BOOK_METADATA_UNAVAILABLE'); } });
  assert.equal(failed.notCatalogFailure, true);
});

test('the three answers: found, not found when the search answered without a match, couldn\'t check when it failed', async () => {
  assert.deepEqual(await searchLibraryBook(catalog([{ title: 'Wing Of Fire' }]), { title: 'Wings of Fire' }), { outcome: 'no_match' });
  assert.deepEqual(await searchLibraryBook(catalog([]), { title: 'Wings of Fire' }), { outcome: 'no_match' });
  assert.deepEqual(await searchLibraryBook(catalog(coded('CATALOG_PROVIDER_BLOCKED')), { title: 'Wings of Fire' }), { outcome: 'unknown', errorCode: 'CATALOG_PROVIDER_BLOCKED' });
  assert.deepEqual(await searchLibraryBook(catalog(new Error('socket hang up')), { title: 'Wings of Fire' }), { outcome: 'unknown', errorCode: 'CATALOG_UNAVAILABLE' });
  assert.deepEqual(await searchLibraryBook(catalog({ nothing: true }), { title: 'Wings of Fire' }), { outcome: 'unknown', errorCode: 'CATALOG_UNRECOGNIZED' });
  assert.deepEqual(await searchLibraryBook(catalog(() => new Promise(() => {})), { title: 'Malgudi Days' }, { timeoutMs: 20 }), { outcome: 'unknown', errorCode: 'CATALOG_TIMEOUT' });
});

test('the search can go through a caller\'s rows function (the shared rows cache)', async () => {
  const provider = catalog(() => assert.fail('the cache answered'));
  const terms = [];
  const result = await searchLibraryBook(provider, { title: 'Malgudi Days' }, { rows: async term => { terms.push(term); return [{ title: 'Malgudi Days' }]; } });
  assert.deepEqual([terms, result.outcome], [['Malgudi Days'], 'in_catalog']);
});
