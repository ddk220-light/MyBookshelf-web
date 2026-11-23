import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogMetadata } from './catalogMetadata.js';
import { createPublicBookService } from '../public-v2/metadata.js';

const isbn = '9788173711466';
const uncached = (_key, run) => run();
const catalog = { bookKey: 'v1:catalog:koha:anna-centenary-library:497990', title: 'Wings of fire: an autobiography',
  authors: ['Abdul Kalam, A. P. J'], isbn13: isbn, publisher: 'Catalog publisher', publishedDate: '2021' };

test('enrichment follows the ISBN edition to its authoritative work and fills gaps from Google', async () => {
  const paths = [];
  const lookup = createCatalogMetadata({ cache: uncached, read: async path => {
    paths.push(path);
    return path.startsWith('/isbn/') ? { title: 'Wings of Fire', isbn_10: ['8173711461'], works: [{ key: '/works/OL1037811W' }], number_of_pages: 180 }
      : { covers: [9153819], description: { value: 'An autobiography.' }, subjects: ['Biography'] };
  }, google: async () => ({ title: 'Wings of Fire', isbn, publisher: 'Universities Press' }) });
  const result = await lookup(isbn);
  assert.deepEqual(paths, ['/isbn/9788173711466.json', '/works/OL1037811W.json']);
  assert.equal(result.description, 'An autobiography.');
  assert.equal(result.coverUrl, 'https://covers.openlibrary.org/b/id/9153819-M.jpg');
  assert.equal(result.publisher, 'Universities Press');
  assert.equal(result.pageCount, 180);
  assert.equal(result.workId, undefined);
});

test('same-title books with a different ISBN cannot provide a cover or details', async () => {
  const wrong = { title: 'Wings of Fire', isbn: '9780545349260', isbn_13: ['9780545349260'], covers: [999], description: 'Wrong book' };
  const lookup = createCatalogMetadata({ cache: uncached, read: async () => wrong, google: async () => wrong });
  assert.deepEqual(await lookup(isbn), {});
  assert.deepEqual(await lookup('invalid'), {});
});

test('a failed work or secondary source preserves verified edition metadata', async () => {
  const lookup = createCatalogMetadata({ cache: uncached, read: async path => {
    if (path.startsWith('/works')) throw new Error('offline');
    return { title: 'Wings of Fire', isbn_13: [isbn], covers: [123], works: [{ key: '/works/OL1037811W' }] };
  }, google: async () => { throw new Error('offline'); } });
  assert.equal((await lookup(isbn)).coverUrl, 'https://covers.openlibrary.org/b/id/123-M.jpg');
});

test('catalog identity, authors and publication data survive enrichment without a holdings lookup', async () => {
  let resolved = 0;
  const service = createPublicBookService({
    catalogs: { search: async () => ({ kind: 'candidates', candidates: [catalog] }), supports: () => true,
      resolve: async () => { resolved++; return catalog; } },
    enrichCatalogIsbn: async value => {
      assert.equal(value, isbn);
      return { bookKey: 'wrong', title: 'Wrong title', authors: ['Wrong author'], isbn13: '9780545349260', workId: 'OL999W',
        coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg', description: 'Verified description', pageCount: 180,
        publisher: 'Other publisher', publishedDate: '1999', availableCopies: 100 };
    },
  });
  await service.search({ query: 'Wings of fire', libraryId: 'koha:anna-centenary-library' });
  const book = await service.enrich(catalog.bookKey);
  assert.equal(resolved, 0, 'search metadata can enrich without repeating the library request');
  for (const field of ['bookKey', 'title', 'authors', 'isbn13', 'publisher', 'publishedDate']) assert.deepEqual(book[field], catalog[field]);
  assert.equal(book.description, 'Verified description');
  assert.equal(book.workId, undefined);
  assert.equal(book.availableCopies, undefined);
  await service.resolve(catalog.bookKey);
  assert.equal(resolved, 1, 'opening the book still resolves its canonical catalog record');
});

test('metadata outages and missing ISBNs leave catalog books usable', async () => {
  let calls = 0;
  const service = createPublicBookService({ catalogs: { supports: () => true, resolve: async ({ recordId }) =>
    ({ ...catalog, ...(recordId === '1' ? { isbn13: undefined } : {}) }) }, enrichCatalogIsbn: async () => { calls++; throw new Error('offline'); } });
  const missing = await service.enrich('v1:catalog:koha:anna-centenary-library:1');
  assert.equal(missing.title, catalog.title); assert.equal(calls, 0);
  const offline = await service.enrich(catalog.bookKey);
  assert.equal(offline.title, catalog.title); assert.equal(calls, 1);
  assert.equal(await service.enrich(`v1:isbn:${isbn}`), null);
});
