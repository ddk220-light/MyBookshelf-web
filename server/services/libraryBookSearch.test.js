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

test('display order: within each title group, books, then e-books and audiobooks, then other formats; then rows with the book\'s author', () => {
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
    // The exact main title (before ":" or "/"): the book rows (and the row
    // with no format), the author's first, then the catalog's order...
    ['Wings of fire', '-'], ['Wings of fire : a guide', 'Book'], ['Wings of fire', 'Book'],
    // ...then the e-book and the audiobook, the author's first, then the kit...
    ['Wings of fire', 'eBook'], ['Wings of fire', 'Book on CD'], ['Wings of fire', 'Kit'],
    // ...then the other match.
    ['Kalam: Wings of Fire', 'Book'],
    // Films and music after every other row, ranked the same way among themselves.
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
  // The exact main title: print and large print first (Harper Lee's, then the
  // study, the record with no author and the graphic novel in the catalog's
  // order), then e-books and audiobooks; the film last.
  assert.deepEqual(ranked.slice(0, 17).map(row => mainTitle(row.title)), Array(17).fill('To kill a mockingbird'));
  assert.deepEqual([...new Set(ranked.slice(0, 11).map(row => row.format))].sort(), ['Book', 'Large Print']);
  assert.deepEqual(ranked.slice(8, 11).map(row => row.title), ['To kill a mockingbird : threatening boundaries', 'To kill a mockingbird',
    'To kill a mockingbird : a graphic novel']);
  assert.deepEqual([...new Set(ranked.slice(11, 17).map(row => row.format))].sort(), ['Book on CD', 'eAudioBook', 'eBook']);
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
