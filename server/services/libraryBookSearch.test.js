import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MATCHES, MAX_RECORD_READS, mainTitle, searchLibraryBook, titleMatches } from './libraryBookSearch.js';

const ISBN = '9788173711466';
const held = { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true };
const coded = code => Object.assign(new Error(code), { code });

// A provider that counts its requests: `title` and `isbn` are the rows each
// search answers (or an Error it fails with), `records` the record pages.
function catalog({ title, isbn, records } = {}) {
  const asked = [];
  const answer = (kind, query, value) => {
    asked.push([kind, query]);
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(typeof value === 'function' ? value(query) : value);
  };
  return {
    asked,
    ...(title !== undefined ? { searchTitle: query => answer('title', query, title) } : {}),
    ...(isbn !== undefined ? { searchIsbn: query => answer('isbn', query, isbn) } : {}),
    ...(records !== undefined ? { readRecord: id => answer('record', id, records[id] ?? coded('CATALOG_HOLDING_UNCONFIRMED')) } : {}),
  };
}

test('the matcher: the main title, or the main title followed by a subtitle or a statement of responsibility', () => {
  assert.equal(mainTitle('Wings of Fire: An Autobiography'), 'Wings of Fire');
  assert.equal(mainTitle('Wings of Fire / A. P. J. Abdul Kalam'), 'Wings of Fire');
  for (const row of ['Wings of Fire', 'WINGS OF FIRE', 'Wings of fire : an autobiography', 'Wings of Fire / Kalam', 'Wings of Fire.',
    'The Wings of Fire', 'Wings of Fire: Darkness of Dragons']) assert.equal(titleMatches(row, 'Wings of Fire: An Autobiography'), true, row);
  assert.equal(titleMatches('DISCOVERY OF INDIA', 'The Discovery of India'), true);
  assert.equal(titleMatches('Les Misérables', 'Les Miserables'), true);
  for (const row of ['Timeless Malgudi Days', 'Malgudi', 'Wings', 'Fire', '', 'Malgudi Dayss']) assert.equal(titleMatches(row, 'Malgudi Days'), false, row);
  // Other scripts keep their vowel signs: different words stay different.
  assert.equal(titleMatches('रोम', 'राम'), false);
  assert.equal(titleMatches('गोदान', 'गोदान'), true);
});

test('a book reached by ISBN: one ISBN search and one title search, started together; the ISBN match leads the list', async () => {
  const provider = catalog({
    isbn: [{ recordId: '1', title: 'Wings of fire : an autobiography', authors: ['Kalam, A. P. J. Abdul'], isbn: ISBN, observation: held, catalogUrl: 'https://c.example/1', catalogLinkKind: 'record' }],
    title: [{ recordId: '9', title: 'Wings of Fire #07: Winter Turning', authors: ['Sutherland, Tui T.'], observation: held }],
  });
  let started = 0;
  const both = { searchIsbn: async query => { started++; await new Promise(resolve => setTimeout(resolve, 10)); return provider.searchIsbn(query); },
    searchTitle: async query => { started++; assert.equal(started, 2, 'the title search starts before the ISBN search answers'); await new Promise(resolve => setTimeout(resolve, 20)); return provider.searchTitle(query); } };
  const result = await searchLibraryBook(both, { title: 'Wings of Fire: An Autobiography' }, { readerIsbn: ISBN });
  assert.equal(started, 2);
  assert.deepEqual(provider.asked, [['isbn', ISBN]], 'the ISBN find ended the check before the title search answered');
  assert.deepEqual([result.outcome, result.matchKind, result.foundBy, result.catalogUrl], ['in_catalog', 'exact_isbn', 'isbn', 'https://c.example/1']);
  assert.deepEqual(result.matches, [{ title: 'Wings of fire : an autobiography', author: 'Kalam, A. P. J. Abdul', url: 'https://c.example/1' }]);
  // Both answering together: the ISBN row first, then the title rows.
  const together = catalog({ isbn: [{ recordId: '1', title: 'Wings of fire', observation: held }], title: [{ recordId: '9', title: 'Wings of Fire 7', observation: held }, { recordId: '1', title: 'Wings of fire', observation: held }] });
  const listed = await searchLibraryBook({ ...together, searchIsbn: together.searchIsbn, searchTitle: together.searchTitle }, { title: 'Wings of Fire' }, { readerIsbn: ISBN });
  assert.equal(together.asked.length, 2);
  assert.equal(listed.matches[0].title, 'Wings of fire');
});

test('a book reached by title: one title search, no ISBN search; a title match with any author is found and listed', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => ({ recordId: String(index), title: index ? `Wings of Fire ${index}` : 'Timeless Wings of Fire', authors: [`Author ${index}`], observation: held }));
  const provider = catalog({ title: rows, isbn: [] });
  const result = await searchLibraryBook(provider, { title: 'Wings of Fire' });
  assert.deepEqual(provider.asked, [['title', 'Wings of Fire']]);
  assert.deepEqual([result.outcome, result.matchKind, result.lookupKind, result.foundBy], ['in_catalog', 'verified_work', 'title', 'title']);
  assert.equal(result.matches.length, MAX_MATCHES);
  assert.deepEqual(result.matches.map(match => match.title), ['Wings of Fire 1', 'Wings of Fire 2', 'Wings of Fire 3', 'Wings of Fire 4', 'Wings of Fire 5']);
  assert.equal(result.matches[0].author, 'Author 1');
});

test('the list: the ISBN match first, then rows whose main title is exactly the book\'s, then the rest, each in catalog order', async () => {
  const row = (recordId, title) => ({ recordId, title, observation: held });
  const titleRows = [row('a', 'Wings of Fire #07: Winter Turning'), row('b', 'Wings of fire : an autobiography'), row('c', 'Wings of Fire Book 2'), row('d', 'The Wings of Fire')];
  const both = catalog({ isbn: [row('i', 'Wings of fire / Kalam')], title: titleRows });
  const result = await searchLibraryBook(both, { title: 'Wings of Fire' }, { readerIsbn: ISBN });
  assert.equal(both.asked.length, 2);
  assert.deepEqual(result.matches.map(match => match.title),
    ['Wings of fire / Kalam', 'Wings of fire : an autobiography', 'The Wings of Fire', 'Wings of Fire #07: Winter Turning', 'Wings of Fire Book 2']);
  const titled = await searchLibraryBook(catalog({ title: titleRows }), { title: 'Wings of Fire: An Autobiography' });
  assert.deepEqual(titled.matches.map(match => match.title),
    ['Wings of fire : an autobiography', 'The Wings of Fire', 'Wings of Fire #07: Winter Turning', 'Wings of Fire Book 2']);
});

test('a catalog without a title search: one ISBN search, the reader\'s or the work\'s latest edition\'s', async () => {
  const provider = catalog({ isbn: [{ title: '', observation: held }] });
  const byKey = await searchLibraryBook(provider, { title: 'Wings of Fire' }, { readerIsbn: ISBN, latestIsbn: () => assert.fail('not needed') });
  assert.deepEqual(provider.asked, [['isbn', ISBN]]);
  assert.deepEqual([byKey.matchKind, byKey.matches], ['exact_isbn', [{ title: 'Wings of Fire' }]]);
  const work = catalog({ isbn: [] });
  const none = await searchLibraryBook(work, { title: 'Wings of Fire' }, { latestIsbn: async () => '9780000000002' });
  assert.deepEqual(work.asked, [['isbn', '9780000000002']]);
  assert.deepEqual(none, { outcome: 'no_match' });
  // No edition with an ISBN: nothing this catalog can be asked.
  assert.deepEqual(await searchLibraryBook(catalog({ isbn: [] }), { title: 'X' }, { latestIsbn: async () => null }), { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED' });
  // Open Library failing is not the catalog's failure.
  const failed = await searchLibraryBook(catalog({ isbn: [] }), { title: 'X' }, { latestIsbn: async () => { throw coded('BOOK_METADATA_UNAVAILABLE'); } });
  assert.equal(failed.notCatalogFailure, true);
});

test('an ISBN-search row that shows only other ISBNs is not the reader\'s ISBN', async () => {
  const provider = catalog({ isbn: [{ title: 'Another book', isbn: '9780262033848', observation: held }], title: [] });
  assert.deepEqual(await searchLibraryBook(provider, { title: 'Wings of Fire' }, { readerIsbn: ISBN }), { outcome: 'no_match' });
});

test('a union catalog: rows without the holding are opened, at most two record reads, ISBN rows first', async () => {
  const records = { 3: { recordId: '3', title: 'Wings of fire', authors: ['Kalam'], catalogUrl: 'https://u.example/3', catalogLinkKind: 'record', observation: held } };
  const rows = ['1', '2', '3'].map(recordId => ({ recordId, title: 'Wings of Fire' }));
  const provider = catalog({ title: rows, isbn: [{ recordId: '2', title: 'Wings of Fire' }], records });
  const result = await searchLibraryBook(provider, { title: 'Wings of Fire' }, { readerIsbn: ISBN });
  assert.deepEqual(provider.asked.filter(([kind]) => kind === 'record'), [['record', '2'], ['record', '1']]);
  assert.equal(MAX_RECORD_READS, 2);
  assert.deepEqual(result, { outcome: 'no_match' }, 'two reads showed other libraries\' records; the third row is not read');
  assert.equal(provider.asked.length, 4);
  const found = catalog({ title: rows.slice(2), records });
  const answer = await searchLibraryBook(found, { title: 'Wings of Fire' });
  assert.deepEqual([answer.foundBy, answer.catalogUrl, answer.matches], ['record', 'https://u.example/3', [{ title: 'Wings of fire', author: 'Kalam', url: 'https://u.example/3' }]]);
  // A record page that fails is couldn't check, never not found.
  const failing = catalog({ title: rows.slice(0, 1), records: { 1: coded('CATALOG_UNAVAILABLE') } });
  assert.deepEqual(await searchLibraryBook(failing, { title: 'Wings of Fire' }), { outcome: 'unknown', errorCode: 'CATALOG_UNAVAILABLE' });
  // Rows that cannot show the holding, at a catalog with no record pages.
  assert.equal((await searchLibraryBook(catalog({ title: rows }), { title: 'Wings of Fire' })).errorCode, 'CATALOG_HOLDING_UNCONFIRMED');
});

test('the three answers: found, not found when every search answered, couldn\'t check when one failed', async () => {
  const titleRow = { title: 'Wings of Fire', observation: held };
  // A failed ISBN search does not spoil a title search that found the book.
  assert.equal((await searchLibraryBook(catalog({ isbn: coded('CATALOG_UNAVAILABLE'), title: [titleRow] }), { title: 'Wings of Fire' }, { readerIsbn: ISBN })).outcome, 'in_catalog');
  // Nothing from the title search and a failed ISBN search: couldn't check.
  assert.deepEqual(await searchLibraryBook(catalog({ isbn: coded('CATALOG_PROVIDER_BLOCKED'), title: [] }), { title: 'Wings of Fire' }, { readerIsbn: ISBN }),
    { outcome: 'unknown', errorCode: 'CATALOG_PROVIDER_BLOCKED' });
  assert.deepEqual(await searchLibraryBook(catalog({ isbn: [], title: new Error('socket hang up') }), { title: 'Wings of Fire' }, { readerIsbn: ISBN }),
    { outcome: 'unknown', errorCode: 'CATALOG_UNAVAILABLE' });
  // Both answered, nothing matched ("Timeless Malgudi Days" is not "Malgudi Days").
  assert.deepEqual(await searchLibraryBook(catalog({ isbn: [], title: [{ title: 'Timeless Malgudi Days', observation: held }] }), { title: 'Malgudi Days' }, { readerIsbn: ISBN }),
    { outcome: 'no_match' });
  // Out of time.
  assert.deepEqual(await searchLibraryBook(catalog({ title: () => new Promise(() => {}) }), { title: 'Malgudi Days' }, { timeoutMs: 20 }), { outcome: 'unknown', errorCode: 'CATALOG_TIMEOUT' });
  // Nothing this catalog can be asked: a book whose title is unknown at a
  // catalog with a title search is never sent to the latest-edition ISBN.
  const untitled = catalog({ title: [], isbn: [] });
  assert.deepEqual(await searchLibraryBook(untitled, { title: '' }, { latestIsbn: async () => assert.fail('rule 3 only') }),
    { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', notCatalogFailure: true });
  assert.deepEqual(untitled.asked, []);
  // A placeholder title ("ISBN …"): only the reader's ISBN is asked, and its miss is not "not found".
  const placeholder = catalog({ title: [], isbn: [] });
  assert.deepEqual(await searchLibraryBook(placeholder, { title: `ISBN ${ISBN}` }, { readerIsbn: ISBN }),
    { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', notCatalogFailure: true });
  assert.deepEqual(placeholder.asked, [['isbn', ISBN]]);
});

test('the first held match ends the check; a found answer is offered to a caller whose deadline comes first', async () => {
  const progress = {};
  const provider = catalog({ isbn: [{ title: 'Wings of Fire', observation: held }], title: () => new Promise(() => {}) });
  const result = await searchLibraryBook(provider, { title: 'Wings of Fire' }, { readerIsbn: ISBN, progress });
  assert.equal(result.foundBy, 'isbn');
  assert.equal(progress.best, result);
});
