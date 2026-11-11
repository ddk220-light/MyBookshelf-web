import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicBookService, sanitizePublicCoverUrl, toPublicBook, plainDescription } from './metadata.js';
import { createCatalogBookKey, parsePublicBookKey } from './contracts.js';

const rawBook = {
  title: 'The Innovator’s Dilemma', author: 'Clayton M. Christensen', isbn: '9781625275868',
  cover_image_url: 'https://books.google.com/books/content?id=example&key=secret&zoom=1',
  publisher: 'Harvard Business Review Press', page_count: 288,
  categories: ['Business & Economics'], average_rating: 4, ratings_count: 10,
};

test('library title results without ISBN retain durable scoped keys after cache loss', async () => {
  const libraryId = 'indcat:example';
  const provider = { searchCatalog: async () => [{ recordId: '123', title: 'Catalog title', authors: [] }],
    resolveCatalogRecord: async id => id === '123' ? { title: 'Catalog title', authors: ['Author'] } : null };
  const options = { findLibrary: id => id === libraryId ? { id } : null, providerFor: () => provider,
    searchByText: async () => { throw new Error('Must search selected catalog'); } };
  const result = await createPublicBookService(options).search({ query: 'Catalog', libraryId });
  assert.equal(result.candidates[0].bookKey, createCatalogBookKey(libraryId, '123'));
  const resolved = await createPublicBookService(options).resolve(result.candidates[0].bookKey);
  assert.deepEqual(resolved.authors, ['Author']); assert.equal(resolved.isbn13, undefined);
  assert.equal(parsePublicBookKey(createCatalogBookKey(libraryId, '123')).libraryId, libraryId);
  assert.throws(() => createCatalogBookKey('https://evil.invalid', '123'));
  assert.throws(() => createCatalogBookKey(libraryId, '../private'));
});

test('public metadata uses a strict allowlist and sanitizes permitted covers', () => {
  const book = toPublicBook({ ...rawBook, image_path: '/uploads/private.jpg', owner_id: 1 });
  assert.equal(book.bookKey, 'v1:isbn:9781625275868');
  assert.equal(book.coverUrl, 'https://books.google.com/books/content?id=example&zoom=1');
  assert.equal('image_path' in book, false);
  assert.equal('owner_id' in book, false);
  assert.equal(sanitizePublicCoverUrl('http://books.google.com/cover.jpg'), null);
  assert.equal(sanitizePublicCoverUrl('https://untrusted.example.test/cover.jpg'), null);
});

test('book service resolves deterministic ISBN and Google volume keys after cache loss', async () => {
  const sourceOnly = { title: 'Source only', author: 'Author', source_id: 'abc_123' };
  const openLibrarySource = { title: 'Open source only', author: 'Author', source: 'openlibrary', source_id: 'OL12345W' };
  const service = createPublicBookService({
    lookupByIsbn: async () => ({ book: rawBook }),
    searchByText: async () => [sourceOnly, openLibrarySource],
    resolveGoogleVolume: async (id) => id === 'abc_123' ? sourceOnly : null,
    resolveOpenLibraryWork: async (id) => id === 'OL12345W' ? openLibrarySource : null,
  });
  const exact = await service.search({ query: '9781625275868', isbnLike: true, isbn13: '9781625275868' });
  assert.equal(exact.book.bookKey, 'v1:isbn:9781625275868');
  const candidates = await service.search({ query: 'source only', isbnLike: false, isbn13: null });
  assert.equal(candidates.candidates[0].bookKey, 'v1:googlebooks:abc_123');
  assert.equal(candidates.candidates[1].bookKey, 'v1:openlibrary:OL12345W');
  const direct = await service.resolve('v1:googlebooks:abc_123');
  assert.equal(direct.title, 'Source only');
  assert.equal(await service.resolve('v1:googlebooks:missing'), null);
  assert.equal((await service.resolve('v1:openlibrary:OL12345W')).title, 'Open source only');
});

test('valid ISBN lookups survive metadata outages without inventing book details', async () => {
  const service = createPublicBookService({
    lookupByIsbn: async () => { const error = new Error('offline'); error.code = 'BOOK_METADATA_UNAVAILABLE'; throw error; },
  });
  assert.deepEqual(await service.search({ query: '9781625275869', isbnLike: true, isbn13: null }), { kind: 'invalid' });
  const result = await service.search({ query: '9781625275868', isbnLike: true, isbn13: '9781625275868' });
  assert.equal(result.kind, 'exact');
  assert.equal(result.book.metadataStatus, 'unavailable');
  assert.equal(result.book.isbn13, '9781625275868');
  assert.equal(result.book.title, 'ISBN 9781625275868');
  assert.deepEqual(result.book.authors, []);
});

test('an ISBN absent from public metadata still resolves after cache loss', async () => {
  const service = createPublicBookService({ lookupByIsbn: async () => ({ book: null }) });
  const book = await service.resolve('v1:isbn:9788131313459');
  assert.equal(book.metadataStatus, 'missing');
  assert.equal(book.isbn13, '9788131313459');
  assert.equal(book.title, 'ISBN 9788131313459');
  assert.equal(book.coverUrl, undefined);
});

test('nearby-edition metadata cannot replace the requested ISBN', async () => {
  const service = createPublicBookService({ lookupByIsbn: async () => ({ book: rawBook }) });
  const result = await service.search({ query: '9788131313459', isbnLike: true, isbn13: '9788131313459' });
  assert.equal(result.book.bookKey, 'v1:isbn:9788131313459');
  assert.equal(result.book.metadataStatus, 'missing');
  assert.notEqual(result.book.title, rawBook.title);
});
test('external catalog handoff survives a book metadata outage', async () => {
  const service = createPublicBookService({ findLibrary: () => ({ id: 'catalog:external', platform: 'catalog', catalogUrl: 'https://library.example.org/search' }),
    providerFor: () => null,
    searchByText: async () => { throw Object.assign(new Error('Metadata unavailable'), { code: 'BOOK_METADATA_UNAVAILABLE' }); } });
  const result = await service.search({ query: 'Wings of Fire', libraryId: 'catalog:external' });
  assert.equal(result.catalogSearchUrl, 'https://library.example.org/search');
  assert.equal(result.catalogUnavailable, true);
  assert.deepEqual(result.candidates, []);
});

test('provider descriptions are shown as plain text, never as raw markup', () => {
  assert.equal(plainDescription('<p>&quot;A boy&rsquo;s journey&quot; &mdash; <b>a fable</b>.</p><p>Second paragraph.<br>Line two</p>'),
    '"A boy’s journey" — a fable.\nSecond paragraph.\nLine two');
  assert.equal(plainDescription('Plain text stays exactly as it was.'), 'Plain text stays exactly as it was.');
  // Comparison signs are text, not tags; escaped markup stays visible as text.
  assert.equal(plainDescription('Useful when a < b and b > c.'), 'Useful when a < b and b > c.');
  assert.equal(plainDescription('Write &lt;b&gt; for bold.'), 'Write <b> for bold.');
  assert.equal(plainDescription('Safe<script>alert(1)</script> text<style>p{}</style>.'), 'Safe text .');
  assert.equal(plainDescription(undefined), null);
  const book = toPublicBook({ title: 'The Alchemist', authors: ['Paulo Coelho'], isbn13: '9780061122415',
    description: '<p>&quot;Follow your dream.&quot;</p>' });
  assert.equal(book.description, '"Follow your dream."');
  assert.equal(toPublicBook({ title: 'Empty', authors: [], isbn13: '9780061122415', description: '<p> </p>' }).description, undefined);
});
