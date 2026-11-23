import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { createAnonymousApp } from '../anonymousApp.js';
import { createCatalogBookKey, parsePublicBookKey } from './contracts.js';
import { clearHttpCache } from '../services/providers/http.js';
import { createPublicV2Router } from './router.js';
import { createRedactedTelemetrySink } from './telemetry.js';
import { createTitleAuthorId } from '../services/titleAuthorIdentity.js';
import { createPublicBookService } from './metadata.js';

test('optional metadata endpoint accepts only catalog keys and preserves the selected record', async () => {
  const key = 'v1:catalog:koha:anna-centenary-library:497990';
  const books = createPublicBookService({ catalogs: { supports: () => true, resolve: async parsed => parsed.recordId === '497990'
    ? { bookKey: key, title: 'Library title', authors: ['Library author'], isbn13: '9788173711466' } : null },
  enrichCatalogIsbn: async () => ({ description: 'Additional book information', coverUrl: 'https://covers.openlibrary.org/b/id/9153819-M.jpg' }) });
  const app = createAnonymousApp({ publicRouter: createPublicV2Router({ books }) });
  const result = await request(app).post('/api/v2/books/enrich').send({ bookKey: key, title: 'Client supplied replacement' });
  assert.equal(result.status, 200);
  assert.equal(result.body.book.bookKey, key);
  assert.equal(result.body.book.title, 'Library title');
  assert.equal(result.body.book.description, 'Additional book information');
  assert.equal((await request(app).post('/api/v2/books/enrich').send({ bookKey: 'v1:isbn:9788173711466' })).status, 400);
  assert.equal((await request(app).post('/api/v2/books/enrich').send({ bookKey: 'https://private.example' })).status, 400);
  assert.equal((await request(app).post('/api/v2/books/enrich').send({ bookKey: 'v1:catalog:koha:anna-centenary-library:999' })).status, 404);
});

test('title/author catalog keys resolve after a fresh app start and preserve qualified availability', async () => {
  const libraryId = 'vpl:visakhapatnam-public-library';
  const title = "Mum, what's wrong with you ? 101 things only mothers of teenage girl's know";
  const author = 'Candy Lorriane';
  const phrase = '101 things only mothers of teenage girl';
  const html = fs.readFileSync(new URL('../test/fixtures/vpl/fallback-author-41.html', import.meta.url), 'utf8')
    .replace('name="title" placeholder="Title" value=""', `name="title" placeholder="Title" value="${phrase}"`)
    .replace('value="Candy Lorriane"', 'value=""');
  global.fetch = async url => response(url, html);
  const bookKey = createCatalogBookKey(libraryId, createTitleAuthorId(title, author));
  assert.ok(bookKey.length > 160);
  const app = createAnonymousApp();
  const resolved = await request(app).post('/api/v2/books/resolve').send({ bookKey, libraryId });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.book.title, title);
  const result = await request(app).post('/api/v2/availability').send({ libraryId, bookKey });
  assert.equal(result.body.outcome, 'available');
  assert.equal(result.body.lookupKind, 'title_author');
  assert.equal(result.body.matchKind, 'verified_work');
  assert.equal(result.body.totalCopies, undefined);
  assert.equal(result.body.catalogLinkKind, 'search');
  assert.ok(!JSON.stringify(result.body).includes('exact_isbn'));
});

const originalFetch = global.fetch;
const chennai = 'koha:anna-centenary-library';
const madurai = 'koha:kalaignar-centenary-library';
const tamil = fs.readFileSync(new URL('../test/fixtures/koha/chennai-catalog-101413.html', import.meta.url), 'utf8');
const mixed = fs.readFileSync(new URL('../test/fixtures/koha/madurai-catalog-56886.html', import.meta.url), 'utf8');
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const response = (url, html, status = 200, headers = {}) => ({ url, text: async () => html, status, ok: status === 200, headers: new Headers(headers) });

test('catalog keys bind a canonical record to its library and cannot encode URLs', () => {
  assert.deepEqual(parsePublicBookKey(createCatalogBookKey(chennai, '101413')), { version: 'v1', kind: 'catalog', libraryId: chennai, recordId: '101413' });
  assert.notEqual(createCatalogBookKey(chennai, '101413'), createCatalogBookKey(madurai, '101413'));
  for (const key of ['v1:catalog:koha:example:01', 'v1:catalog:koha:example:../1', 'v1:catalog:koha:example:1?x=2', 'v1:catalog:https://example:1', 'v1:catalog:bc:example:1']) assert.equal(parsePublicBookKey(key), null);
  assert.throws(() => createCatalogBookKey(chennai, 'http://127.0.0.1'));
});

test('anonymous title search, record resolution and mixed availability work without an ISBN', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, 'http://122.184.84.190:1011');
    return url.includes('opac-search') ? response(url, '', 302, { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=56886' }) : response(url, mixed);
  };
  const telemetry = createRedactedTelemetrySink();
  const app = createAnonymousApp({ publicRouter: createPublicV2Router({ telemetry }) });
  const search = await request(app).post('/api/v2/books/search').send({ query: 'History of Bombay Karnataka', libraryId: madurai });
  assert.equal(search.status, 200);
  assert.equal(search.body.kind, 'candidates');
  assert.deepEqual(search.body.catalog, { libraryId: madurai, name: 'Kalaignar Centenary Library', hasMore: false });
  const candidate = search.body.candidates[0];
  assert.equal(candidate.bookKey, createCatalogBookKey(madurai, '56886'));
  assert.equal(candidate.isbn13, undefined);
  assert.equal(candidate.recordId, undefined);
  const resolved = await request(app).post('/api/v2/books/resolve').send({ bookKey: candidate.bookKey, libraryId: madurai });
  assert.equal(resolved.status, 200);
  const observed = await request(app).post('/api/v2/availability').send({ libraryId: madurai, bookKey: candidate.bookKey });
  assert.equal(observed.body.lookupKind, 'catalog_record');
  assert.equal(observed.body.matchKind, 'catalog_record');
  assert.equal(observed.body.availableCopies, 1);
  assert.equal(observed.body.notForLoanCopies, 1);
  assert.equal(observed.body.locations.length, 2);
  assert.equal(observed.body.catalogLinkKind, 'record');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ options }) => !options.headers.Cookie && !options.headers.Authorization));
  assert.ok(telemetry.events().every(event => !JSON.stringify(event).includes('History of Bombay')));
  const otherLibrary = await request(app).post('/api/v2/availability').send({ libraryId: chennai, bookKey: candidate.bookKey });
  assert.equal(otherLibrary.body.outcome, 'unknown');
  assert.equal(otherLibrary.body.errorCode, 'CATALOG_UNAVAILABLE');
  assert.ok(calls.slice(2).every(({ url }) => url.includes('opac-search.pl')), 'the same numeric record must never be fetched in another library');
});

test('a catalog book deep link resolves independently of a previous search or memory cache', async () => {
  let calls = 0, robots = 0;
  // The record read now goes through the catalog's gate, robots rules included.
  global.fetch = async url => { if (String(url).endsWith('/robots.txt')) { robots++; return response(url, '', 404); } calls++; return response(url, tamil); };
  const app = createAnonymousApp();
  const key = createCatalogBookKey(chennai, '101413');
  // A record is read only for its own library, named in the request.
  for (const libraryId of [undefined, madurai]) {
    const refused = await request(app).post('/api/v2/books/resolve').send({ bookKey: key, ...(libraryId ? { libraryId } : {}) });
    assert.equal(refused.status, 503);
    assert.equal(refused.body.error.code, 'METADATA_UNAVAILABLE');
  }
  assert.equal(calls, 0);
  const result = await request(app).post('/api/v2/books/resolve').send({ bookKey: key, libraryId: chennai });
  assert.equal(result.status, 200);
  assert.match(result.body.book.title, /அலுவலக மேலாண்மை/);
  assert.equal(result.body.book.bookKey, key);
  assert.equal(result.body.book.isbn13, undefined);
  assert.equal(calls, 1);
  assert.equal(robots, 1);
  const unknown = await request(app).post('/api/v2/books/resolve').send({ bookKey: createCatalogBookKey('koha:unconfigured', '101413'), libraryId: 'koha:unconfigured' });
  assert.equal(unknown.status, 404);
  assert.equal(calls, 1);
});

test('invalid library scopes and record URLs are rejected before any upstream request', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Unexpected upstream request'); };
  const app = createAnonymousApp();
  for (const libraryId of ['http://127.0.0.1', '../library', null]) {
    const result = await request(app).post('/api/v2/books/search').send({ libraryId, query: 'Tamil' });
    assert.equal(result.status, 400);
  }
  assert.equal((await request(app).post('/api/v2/books/search').send({ libraryId: 'koha:missing', query: 'Tamil' })).status, 404);
  assert.equal((await request(app).post('/api/v2/books/resolve').send({ bookKey: `v1:catalog:${chennai}:1&account=2` })).status, 404);
  assert.equal(calls, 0);
});
