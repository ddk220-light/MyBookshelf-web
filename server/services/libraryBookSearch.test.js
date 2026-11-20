import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MATCHES, mainTitle, orderMatches, searchLibraryBook, titleMatches } from './libraryBookSearch.js';

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

test('a found answer lists up to five matching rows; a row of another author still counts', async () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ recordId: String(index), title: index ? `Wings of Fire ${index}` : 'Wings', authors: [`Author ${index}`] }));
  const result = await searchLibraryBook(catalog(rows), { title: 'Wings of Fire' });
  assert.equal(result.matches.length, MAX_MATCHES);
  assert.deepEqual(result.matches.map(match => match.title), ['Wings of Fire 1', 'Wings of Fire 2', 'Wings of Fire 3', 'Wings of Fire 4', 'Wings of Fire 5']);
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
