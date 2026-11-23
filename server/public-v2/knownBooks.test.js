import test from 'node:test';
import assert from 'node:assert/strict';
import { knownBook, knownBookTable } from './knownBooks.js';
import { createPublicBookService } from './metadata.js';
import usList from '../../shared/us-book-pool.json' with { type: 'json' };
import shelfPool from '../../shared/seo-book-pool.json' with { type: 'json' };
import shelves from '../../shared/seo-shelves.json' with { type: 'json' };

test('every book of the US list, the shelf pool and the shelf details is known by its work key, with its title and authors and no ISBN', () => {
  const keys = new Set([...Object.keys(shelves.books), ...usList.books.map(book => book.bookKey), ...shelfPool.books.map(book => book.bookKey)]);
  assert.ok(keys.size >= 100, String(keys.size));
  for (const key of keys) {
    const book = knownBook(key);
    assert.ok(book, key);
    assert.deepEqual(Object.keys(book).sort(), ['authors', 'bookKey', 'title', 'workId'], key);
    assert.equal(book.bookKey, key);
    assert.equal(`v1:openlibrary:${book.workId}`, key);
    assert.ok(book.title.trim() && book.authors.length && book.authors.every(author => author.trim()), key);
  }
  // The shelf details (what the published shelf checks searched by) come first.
  assert.deepEqual(knownBook('v1:openlibrary:OL1054099W'), { bookKey: 'v1:openlibrary:OL1054099W', title: 'The Hungry Tide', authors: ['Amitav Ghosh', 'Yaʻel Akhmon'], workId: 'OL1054099W' });
  assert.equal(knownBook('v1:openlibrary:OL1057177W').title, 'Malgudi days');
  // A US list book.
  assert.deepEqual(knownBook('v1:openlibrary:OL3140822W'), { bookKey: 'v1:openlibrary:OL3140822W', title: 'To Kill a Mockingbird', authors: ['Harper Lee'], workId: 'OL3140822W' });
  // Anything else is not known.
  for (const key of ['v1:openlibrary:OL987654321W', 'v1:isbn:9780061120084', 'v1:googlebooks:abc', 'v1:openlibrary:OL3140822M', '', null, undefined]) assert.equal(knownBook(key), null, String(key));
  // Each answer is the caller's own copy.
  knownBook('v1:openlibrary:OL3140822W').authors.push('Someone Else');
  assert.deepEqual(knownBook('v1:openlibrary:OL3140822W').authors, ['Harper Lee']);
});

test('the table takes the first source that names a work, tidies spaces and skips entries without a work key or a title', () => {
  const table = knownBookTable({
    shelfBooks: { 'v1:openlibrary:OL1W': { title: '  Wings  of Fire ', authors: ['A. P. J. Abdul Kalam', ' '] }, 'v1:isbn:9788173711466': { title: 'An ISBN', authors: [] } },
    lists: [
      { books: [{ bookKey: 'v1:openlibrary:OL1W', title: 'Another title', author: 'Someone' }, { bookKey: 'v1:openlibrary:OL2W', title: 'Matilda', author: 'Roald Dahl' }] },
      { books: [{ bookKey: 'v1:openlibrary:OL2W', title: 'Matilda (again)', author: 'R. Dahl' }, { bookKey: 'v1:openlibrary:OL3W', title: ' ', author: 'Nobody' }, { title: 'No key', author: 'X' }] },
    ],
  });
  assert.deepEqual([...table.keys()], ['v1:openlibrary:OL1W', 'v1:openlibrary:OL2W']);
  assert.deepEqual(knownBook('v1:openlibrary:OL1W', table), { bookKey: 'v1:openlibrary:OL1W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], workId: 'OL1W' });
  assert.deepEqual(knownBook('v1:openlibrary:OL2W', table).authors, ['Roald Dahl']);
});

test('a check\'s details: a known book without any Open Library read, any other book resolved as before', async () => {
  const resolved = [];
  const service = createPublicBookService({
    resolveOpenLibraryWork: async id => { resolved.push(id); return { source: 'openlibrary', source_id: id, workId: id, title: 'Unlisted', authors: ['A. Writer'] }; },
  });
  assert.deepEqual(await service.checkDetails('v1:openlibrary:OL16819897W'),
    { bookKey: 'v1:openlibrary:OL16819897W', title: 'Braiding Sweetgrass', authors: ['Robin Wall Kimmerer'], workId: 'OL16819897W' });
  assert.deepEqual(resolved, []);
  const other = await service.checkDetails('v1:openlibrary:OL987654321W');
  assert.deepEqual([other.title, other.authors, other.workId], ['Unlisted', ['A. Writer'], 'OL987654321W']);
  assert.deepEqual(resolved, ['OL987654321W']);
  // The book page's own details still come from Open Library.
  await service.resolve('v1:openlibrary:OL16819897W');
  assert.deepEqual(resolved, ['OL987654321W', 'OL16819897W']);
});
