import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { makeTestApp } from '../test/helpers.js';
import { createPublicV2Router } from './router.js';
import { createRedactedTelemetrySink } from './telemetry.js';

const library = {
  id: 'koha:example', name: 'Example Library', city: 'Chennai', region: 'Tamil Nadu', country: 'India',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: false },
  health: 'operational',
};
const book = { bookKey: 'v1:isbn:9781625275868', isbn13: '9781625275868', title: 'Example', authors: ['Author'] };

function app(telemetry) {
  const directory = { search: () => [library], resolve: (id) => id === library.id ? library : null, browse: ({ country, region }) => ({ libraries: country === 'IN' && region === 'Tamil Nadu' ? [library] : [], total: country === 'IN' && region === 'Tamil Nadu' ? 1 : 0, nextOffset: null }) };
  const books = {
    search: async ({ isbnLike, isbn13 }) => isbnLike && !isbn13 ? { kind: 'invalid' } : { kind: 'exact', book },
    resolve: async (key) => key === book.bookKey ? book : null,
  };
  const availability = { check: async () => ({ kind: 'result', response: { outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh', observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z' } }) };
  return makeTestApp((expressApp) => expressApp.use('/api/v2', createPublicV2Router({ directory, books, availability, telemetry, rateLimit: { limit: 100 } })));
}

test('public v2 routes work without consuming or setting an identity cookie', async () => {
  const telemetry = createRedactedTelemetrySink();
  const response = await request(app(telemetry))
    .post('/api/v2/books/search')
    .set('Cookie', ['mb_session=old-session', 'mb_key=old-key'])
    .send({ query: '9781625275868' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { kind: 'exact', book });
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(telemetry.events(), [{ operation: 'book_search', outcome: '200', durationMs: telemetry.events()[0].durationMs }]);
});

test('public v2 returns bounded structured errors and public-only results', async () => {
  const target = app();
  assert.equal((await request(target).post('/api/v2/libraries/search').send({ query: 'chennai' })).body.libraries[0].id, library.id);
  assert.equal((await request(target).post('/api/v2/libraries/resolve').send({ libraryId: 'koha:missing' })).status, 404);
  const invalid = await request(target).post('/api/v2/books/search').send({ query: '9781625275869' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_REQUEST');
  const missing = await request(target).post('/api/v2/books/resolve').send({ bookKey: 'v1:isbn:9781625275869' });
  assert.equal(missing.status, 404);
  const availability = await request(target).post('/api/v2/availability').send({ libraryId: library.id, bookKey: book.bookKey });
  assert.equal(availability.body.outcome, 'available');
});

test('regional browse is anonymous and validates its scope', async () => {
  const response = await request(app()).post('/api/v2/libraries/browse').set('Cookie', 'mb_session=old-session').send({ country: 'IN', region: 'Tamil Nadu' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { libraries: [library], total: 1, nextOffset: null });
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal((await request(app()).post('/api/v2/libraries/browse').send({ country: 'IN' })).status, 400);
});

test('catalog timeouts survive search and availability response boundaries', async () => {
  const timeout = async () => { throw Object.assign(new Error('upstream timed out'), { code: 'CATALOG_TIMEOUT' }); };
  const target = makeTestApp(app => app.use('/api/v2', createPublicV2Router({ books: { search: timeout }, availability: { check: timeout } })));
  for (const [path, body] of [['/books/search', { query: 'Wings of Fire' }], ['/availability', { libraryId: 'koha:example', bookKey: book.bookKey }]]) {
    const response = await request(target).post('/api/v2' + path).send(body);
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, 'CATALOG_TIMEOUT');
  }
});

test('a native-script query a catalog cannot run is a 400 explanation, not a 503 outage', async () => {
  const unsupported = async () => { throw Object.assign(new Error('Latin letters only'), { code: 'CATALOG_QUERY_UNSUPPORTED' }); };
  const target = makeTestApp(app => app.use('/api/v2', createPublicV2Router({ books: { search: unsupported }, availability: { check: unsupported } })));
  const response = await request(target).post('/api/v2/books/search').send({ query: 'వేయి పడగలు' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'CATALOG_QUERY_UNSUPPORTED');
  assert.match(response.body.error.message, /romanised spelling/);
});

// Plan 4.6.2: search text reaches storage only through the anonymous
// operational log, scrubbed, and never with an address, agent or position.
test('the anonymous log receives scrubbed search text and never the IP, user agent or coordinates', async () => {
  const { createCatalogStore } = await import('../catalog-store/index.js');
  const rows = [];
  // The log is written after the response is sent: wait for each row itself.
  let rowWritten = () => {};
  const nextRow = () => new Promise(resolve => { rowWritten = resolve; });
  const catalogStore = createCatalogStore({ env: { USAGE_LOG_ENABLED: 'true' }, db: null, defer: task => task(), usageSink: row => { rows.push(row); rowWritten(); } });
  const telemetry = createRedactedTelemetrySink();
  const directory = { search: () => [library], resolve: id => id === library.id ? library : null, browse: () => ({ libraries: [], total: 0, nextOffset: null }) };
  const books = { search: async () => ({ kind: 'candidates', candidates: [book] }), resolve: async () => book };
  const target = makeTestApp(expressApp => expressApp.use('/api/v2', createPublicV2Router({ directory, books, telemetry, catalogStore, rateLimit: { limit: 100 } })));
  let written = nextRow();
  const response = await request(target).post('/api/v2/books/search')
    .set('User-Agent', 'Synthetic-Agent/1.0').set('X-Forwarded-For', '203.0.113.7')
    .send({ query: 'wings of fire reader@example.test 98765432101' });
  assert.equal(response.status, 200);
  await written;
  const search = rows.find(row => row.kind === 'book_search');
  assert.ok(search, 'one book_search row');
  assert.equal(search.queryText, 'wings of fire [removed] [removed]');
  const stored = JSON.stringify(rows);
  for (const secret of ['203.0.113.7', 'Synthetic-Agent', 'reader@example.test', '98765432101']) assert.ok(!stored.includes(secret), secret);
  // Telemetry never carries the text.
  assert.ok(!JSON.stringify(telemetry.events()).includes('wings'));
  written = nextRow();
  await request(target).post('/api/v2/libraries/discover').send({ lat: 13.08, lon: 80.27 });
  await written;
  assert.ok(rows.some(row => row.kind === 'near_me'), 'one near_me row');
  assert.ok(!JSON.stringify(rows).includes('13.08') && !JSON.stringify(rows).includes('80.27'));
});
