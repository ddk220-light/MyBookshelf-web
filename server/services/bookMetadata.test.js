import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupBookMetadata, searchBookMetadataByText } from './bookMetadata.js';
import { parseOpenLibraryBook, parseOpenLibrarySearchResult, searchOpenLibraryByIsbn, searchOpenLibraryByText } from './openLibrary.js';

const ISBN = '9781625275868';

test('Open Library maps ISBN metadata into the shared book shape', () => {
  const book = parseOpenLibraryBook({
    [`ISBN:${ISBN}`]: {
      title: 'Your Strategy Needs a Strategy',
      authors: [{ name: 'Martin Reeves' }, { name: 'Knut Haanæs' }],
      number_of_pages: 271,
      publish_date: '2015',
      cover: { medium: 'https://covers.openlibrary.org/example-M.jpg' },
    },
  }, ISBN);
  assert.deepEqual(book, {
    title: 'Your Strategy Needs a Strategy',
    author: 'Martin Reeves, Knut Haanæs',
    isbn: ISBN,
    cover_image_url: 'https://covers.openlibrary.org/example-M.jpg',
    description: null,
    page_count: 271,
    publish_year: 2015,
  });
});

test('ISBN lookup falls back to Open Library when Google Books is throttled', async () => {
  const result = await lookupBookMetadata({ isbn: ISBN }, {
    googleLookup: async () => {
      const error = new Error('Google Books request failed (429)');
      error.code = 'BOOK_METADATA_UNAVAILABLE';
      throw error;
    },
    openLibraryLookup: async () => ({ title: 'Your Strategy Needs a Strategy', isbn: ISBN }),
  });
  assert.equal(result.source, 'open_library');
  assert.equal(result.book.title, 'Your Strategy Needs a Strategy');
});

test('metadata lookup distinguishes a clean miss from upstream failure', async () => {
  const miss = await lookupBookMetadata({ isbn: ISBN }, {
    googleLookup: async () => null,
    openLibraryLookup: async () => null,
  });
  assert.equal(miss.book, null);

  await assert.rejects(
    lookupBookMetadata({ isbn: ISBN }, {
      googleLookup: async () => { throw new Error('rate limited'); },
      openLibraryLookup: async () => null,
    }),
    (error) => error.code === 'BOOK_METADATA_UNAVAILABLE',
  );
});

test('Open Library sends an honest user agent and returns null for a clean miss', async () => {
  let request;
  const result = await searchOpenLibraryByIsbn(ISBN, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  assert.equal(result, null);
  assert.match(request.url, /openlibrary\.org\/api\/books/);
  assert.match(request.options.headers['User-Agent'], /MyBookshelf/);
});

test('Open Library text search produces deterministic public work candidates', async () => {
  const parsed = parseOpenLibrarySearchResult({
    key: '/works/OL17366205W',
    title: 'Your Strategy Needs a Strategy',
    author_name: ['Martin Reeves', 'Knut Haanæs'],
    cover_i: 14378645,
    first_publish_year: 2015,
  });
  assert.deepEqual(parsed, {
    title: 'Your Strategy Needs a Strategy',
    author: 'Martin Reeves, Knut Haanæs',
    isbn: null,
    cover_image_url: 'https://covers.openlibrary.org/b/id/14378645-L.jpg',
    publisher: null,
    published_date: '2015',
    page_count: null,
    categories: [],
    source: 'openlibrary',
    source_id: 'OL17366205W',
  });

  let request;
  const results = await searchOpenLibraryByText({ title: 'Your Strategy Needs a Strategy', max: 3 }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ docs: [{ key: '/works/OL17366205W', title: 'Your Strategy Needs a Strategy' }] }) };
    },
  });
  assert.equal(results[0].source_id, 'OL17366205W');
  assert.match(request.url, /openlibrary\.org\/search\.json/);
  assert.match(request.options.headers['User-Agent'], /MyBookshelf/);
});

test('title and author search falls back to Open Library when Google Books is unavailable', async () => {
  const result = await searchBookMetadataByText(
    { title: 'Your Strategy Needs a Strategy', author: '', max: 10 },
    {
      googleLookup: async () => { const error = new Error('quota'); error.code = 'BOOK_METADATA_UNAVAILABLE'; throw error; },
      openLibraryLookup: async () => [{ title: 'Your Strategy Needs a Strategy', source: 'openlibrary', source_id: 'OL17366205W' }],
    },
  );
  assert.deepEqual(result, [{ title: 'Your Strategy Needs a Strategy', source: 'openlibrary', source_id: 'OL17366205W' }]);
});
