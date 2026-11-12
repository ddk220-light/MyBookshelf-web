import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { makeTestApp } from '../test/helpers.js';
import { createCatalogBookKey } from './contracts.js';
import { createPublicV2Router } from './router.js';
import { createCatalogStore } from '../catalog-store/index.js';
import { readCatalogStoreConfig } from '../catalog-store/config.js';
import { createCatalogPolicy } from '../catalog-store/policy.js';
import { createCatalogLookup, createLookupRecorder, PLATFORMS } from '../services/catalog-lookup/index.js';

const UNPACED = Object.fromEntries(Object.entries(PLATFORMS).map(([id, value]) => [id, { ...value, minIntervalMs: 0 }]));
const vega = { id: 'vega:test', platform: 'vega', catalogUrl: 'https://catalog.example/' };
const optedOut = { id: 'vega:optout', platform: 'vega', catalogUrl: 'https://optout.example/' };
const publicOf = entry => ({ id: entry.id, name: 'Test Library', catalogUrl: entry.catalogUrl,
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } });
const entries = new Map([vega, optedOut].map(entry => [entry.id, entry]));
const directory = { resolve: id => (entries.has(id) ? publicOf(entries.get(id)) : null), entry: id => entries.get(id) || null,
  search: () => [], browse: () => ({ libraries: [], total: 0, nextOffset: null }) };

const ISBN_A = '9788173711466';
const ISBN_B = '9780140328721';
const ISBN_C = '9780439023528';
const known = {
  [`v1:isbn:${ISBN_A}`]: { bookKey: `v1:isbn:${ISBN_A}`, isbn13: ISBN_A, title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] },
  'v1:openlibrary:OL1W': { bookKey: 'v1:openlibrary:OL1W', isbn13: ISBN_B, workId: 'OL1W', title: 'Matilda', authors: ['Roald Dahl'] },
  'v1:openlibrary:OL2W': { bookKey: 'v1:openlibrary:OL2W', isbn13: ISBN_C, workId: 'OL2W', title: 'Mockingjay', authors: ['Suzanne Collins'] },
};
const books = {
  search: async () => ({ kind: 'candidates', candidates: [] }),
  resolve: async key => known[key] || null,
  // As workDiscovery.profile: a book without a work ID has an incomplete profile.
  searchProfile: async key => (known[key] ? { book: known[key], isbns: [known[key].isbn13], titles: [known[key].title], authors: known[key].authors,
    language: '', complete: Boolean(known[key].workId), expansionFailed: false } : null),
};

function harness({ observe = () => ({ outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }), usageLogEnabled = false,
  policies = { schemaVersion: 1, libraries: { [optedOut.id]: { storeAnswers: false, reason: 'Test', reviewedOn: '2026-11-12' } } },
  searchCapMs, backgroundChecksEnabled = true } = {}) {
  const pending = [];
  const defer = task => { pending.push(Promise.resolve().then(task).catch(() => {})); };
  const logged = [];
  const calls = [];
  const config = { ...readCatalogStoreConfig({}), usageLogEnabled, backgroundChecksEnabled };
  const store = createCatalogStore({ config, db: null, defer, usageSink: row => logged.push(row), policy: createCatalogPolicy({ policies }) });
  const provider = { checkAvailability: async isbn => { calls.push(isbn); return observe(isbn); } };
  const lookup = createCatalogLookup({ providerFor: () => provider, robots: null, platforms: UNPACED, env: {},
    recorder: createLookupRecorder({ answers: store.answers, health: store.health, policyFor: store.policyFor, defer }), hostGate: store.hostGate });
  const app = makeTestApp(express => {
    express.set('trust proxy', 1);
    express.use('/api/v2', createPublicV2Router({ directory, books, catalogStore: store, lookup, rateLimit: { limit: 1000 },
      holdingsOptions: searchCapMs ? { searchCapMs } : {} }));
  });
  return { app, store, calls, logged, settle: async () => { while (pending.length) await Promise.all(pending.splice(0)); } };
}

const lines = text => text.trim().split('\n').map(line => JSON.parse(line));

test('a second open of the same book in the same library makes no catalog request', async () => {
  const { app, calls, settle } = harness();
  const first = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(first.status, 200);
  assert.equal(first.body.answer, 'found');
  assert.equal(calls.length, 1);
  await settle();
  const second = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(second.body.answer, 'found');
  assert.equal(calls.length, 1, 'answered from the store');
  // Shelf badges read the store only.
  const shelf = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: vega.id,
    books: [{ bookKey: `v1:isbn:${ISBN_A}` }, { bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W' }] });
  assert.deepEqual(shelf.body, { answers: { [`v1:isbn:${ISBN_A}`]: 'found' } });
  assert.equal(calls.length, 1);
});

test('a timed-out check is unknown, stores no answer and writes one health event', async () => {
  const { app, store, calls, settle } = harness({ observe: () => { throw Object.assign(new Error('slow'), { code: 'CATALOG_TIMEOUT' }); } });
  const response = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(response.body.answer, 'unknown');
  assert.equal(response.body.catalogUrl, 'https://catalog.example/');
  await settle();
  assert.deepEqual(await store.answers.readAnswers(vega.id, [{ kind: 'isbn13', value: ISBN_A }]), []);
  const health = await store.health.libraryHealth(vega.id);
  assert.equal(health.failuresSinceSuccess, 1);
  assert.equal(health.failures7d, 1);
  assert.deepEqual(health.failures7dByReason, { timeout: 1 });
  const shelf = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: vega.id, books: [{ bookKey: `v1:isbn:${ISBN_A}` }] });
  const checked = calls.length;
  assert.ok(checked >= 1);
  assert.deepEqual(shelf.body.answers, {});
  assert.equal(calls.length, checked, 'shelf badges never contact the catalog');
});

test('a library in the policy file never gets answer rows, but its health is still recorded', async () => {
  const { app, store, calls, settle } = harness();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(app).post('/api/v2/holdings/check').send({ libraryId: optedOut.id, bookKey: `v1:isbn:${ISBN_A}` });
    assert.equal(response.body.answer, 'found');
    await settle();
  }
  assert.equal(calls.length, 2, 'checked live each time');
  assert.equal(store.answers.size(), 0);
  assert.ok((await store.health.libraryHealth(optedOut.id)).lastSuccessAt);
});

test('one ISBN not listed is "not found" only for that edition, never for the work', async () => {
  const { app, settle } = harness({ observe: () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }) });
  // A book whose edition list is incomplete cannot be "not found".
  const edition = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(edition.body.answer, 'unconfirmed');
  await settle();
  const search = await request(app).post('/api/v2/holdings/search').buffer(true).parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); })
    .send({ libraryId: vega.id, query: 'matilda', books: [{ bookKey: 'v1:openlibrary:OL1W' }, { bookKey: 'v1:openlibrary:OL2W' }] });
  // Vega checks each result's ISBN: "not listed" for one ISBN of a work gives
  // no mark and leaves the work unchecked.
  assert.deepEqual(lines(search.body), [{ type: 'done', unchecked: ['v1:openlibrary:OL1W', 'v1:openlibrary:OL2W'] }]);
  await settle();
  // The stored row answers only that edition.
  const shelf = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: vega.id,
    books: [{ bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W', isbn13: ISBN_B }, { bookKey: `v1:isbn:${ISBN_B}` }] });
  assert.deepEqual(shelf.body.answers, { [`v1:isbn:${ISBN_B}`]: 'not_found' });
});

test('result marking streams stored answers first, then live marks, then done', async () => {
  const { app, calls, settle } = harness({ observe: isbn => (isbn === ISBN_B
    ? { outcome: 'unknown', matchKind: null } : { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }) });
  await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  await settle();
  calls.length = 0;
  const response = await request(app).post('/api/v2/holdings/search').buffer(true).parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); })
    // Client-sent identities are ignored for marking: the server resolves each key.
    .send({ libraryId: vega.id, query: 'wings', books: [{ bookKey: `v1:isbn:${ISBN_A}` }, { bookKey: 'v1:openlibrary:OL2W', workId: 'OL9W' }, { bookKey: 'v1:openlibrary:OL1W' }] });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/x-ndjson/);
  assert.deepEqual(lines(response.body), [
    { type: 'mark', bookKey: `v1:isbn:${ISBN_A}`, answer: 'found' },
    { type: 'mark', bookKey: 'v1:openlibrary:OL2W', answer: 'found' },
    { type: 'done', unchecked: ['v1:openlibrary:OL1W'] },
  ]);
  assert.deepEqual(calls.sort(), [ISBN_B, ISBN_C].sort(), 'the stored book is not checked again');
  await settle();
  const shelf = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: vega.id, books: [{ bookKey: 'v1:openlibrary:OL2W', workId: 'OL2W' }] });
  assert.deepEqual(shelf.body.answers, { 'v1:openlibrary:OL2W': 'found' });
  const spoofed = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: vega.id, books: [{ bookKey: 'v1:openlibrary:OL9W' }] });
  assert.deepEqual(spoofed.body.answers, {}, 'nothing was written for the identity the client claimed');
});

test('the result-marking response ends by its cap with a slow catalog, and the kill switch skips it', async () => {
  const { app } = harness({ observe: () => new Promise(() => {}), searchCapMs: 300 });
  const startedAt = Date.now();
  const response = await request(app).post('/api/v2/holdings/search').buffer(true).parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); })
    .send({ libraryId: vega.id, query: 'wings', books: [{ bookKey: `v1:isbn:${ISBN_A}` }] });
  assert.ok(Date.now() - startedAt < 3_000);
  assert.deepEqual(lines(response.body), [{ type: 'done', unchecked: [`v1:isbn:${ISBN_A}`] }]);
  const off = harness({ backgroundChecksEnabled: false });
  const skipped = await request(off.app).post('/api/v2/holdings/search').buffer(true).parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); })
    .send({ libraryId: vega.id, query: 'wings', books: [{ bookKey: `v1:isbn:${ISBN_A}` }] });
  assert.deepEqual(lines(skipped.body), [{ type: 'done', unchecked: [`v1:isbn:${ISBN_A}`] }]);
  assert.equal(off.calls.length, 0);
});

test('holdings routes validate input and unknown libraries', async () => {
  const { app } = harness();
  for (const [path, body] of [
    ['/holdings/lookup', { libraryId: vega.id, books: [] }],
    ['/holdings/lookup', { libraryId: vega.id, books: Array.from({ length: 101 }, (_, i) => ({ bookKey: `v1:openlibrary:OL${i}W` })) }],
    ['/holdings/lookup', { libraryId: vega.id, books: [{ bookKey: 'v1:openlibrary:OL1W', workId: 'Wings of Fire' }] }],
    ['/holdings/search', { libraryId: vega.id, query: 'x', books: Array.from({ length: 13 }, (_, i) => ({ bookKey: `v1:openlibrary:OL${i}W` })) }],
    ['/holdings/check', { libraryId: vega.id }],
    ['/holdings/check', { libraryId: 'not a library', bookKey: `v1:isbn:${ISBN_A}` }],
  ]) assert.equal((await request(app).post('/api/v2' + path).send(body)).status, 400, path);
  const missing = await request(app).post('/api/v2/holdings/check').send({ libraryId: 'vega:missing', bookKey: `v1:isbn:${ISBN_A}` });
  assert.deepEqual([missing.status, missing.body.error.code], [404, 'LIBRARY_NOT_FOUND']);
  const unknownBook = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: 'v1:openlibrary:OL404W' });
  assert.deepEqual([unknownBook.status, unknownBook.body.error.code], [404, 'BOOK_NOT_FOUND']);
});

test('result marking never resolves catalog record keys (no catalog read outside the budget and host gate)', async () => {
  const { app } = harness();
  const resolved = [];
  const original = books.resolve;
  books.resolve = async key => { resolved.push(key); return original(key); };
  try {
    const catalogKeys = Array.from({ length: 11 }, (_, index) => createCatalogBookKey('koha:other', String(index + 1))).concat(createCatalogBookKey(vega.id, '7'));
    const response = await request(app).post('/api/v2/holdings/search')
      .send({ libraryId: vega.id, query: 'wings', books: catalogKeys.map(bookKey => ({ bookKey })) });
    assert.equal(response.status, 200);
    assert.deepEqual(lines(response.text).at(-1), { type: 'done', unchecked: catalogKeys });
    assert.deepEqual(resolved, []);
  } finally {
    books.resolve = original;
  }
});

test('library requests and problem reports: text and a count, validation and per-address limits', async () => {
  const { app, store, settle } = harness();
  const send = (body, ip = '203.0.113.7') => request(app).post('/api/v2/library-requests').set('X-Forwarded-For', ip).send(body);
  assert.deepEqual([(await send({ text: '  Anna  Centenary Library ' })).status, (await send({ text: 'anna centenary library!' })).status], [202, 202]);
  for (const text of ['me@example.com', 'call 98765 43210', 'https://lib.example.org', '12345', 'x', 'a'.repeat(81), 'Anna\u0000Library', 'Anna \u202Eyrarbil']) {
    assert.equal((await send({ text })).status, 400, text);
  }
  assert.equal((await send({ text: 'Valid', country: 'IN' })).status, 400, 'no other fields are stored');
  await settle();
  // The second text was the same request from the same address today: not counted again.
  assert.deepEqual(store.submissions.held().requests.map(item => [item.requestKey, item.displayText, item.count]),
    [['anna centenary library', 'Anna Centenary Library', 1]]);
  for (let i = 0; i < 3; i += 1) assert.equal((await send({ text: `Library ${String.fromCharCode(65 + i)}` })).status, 202);
  assert.equal((await send({ text: 'One too many' })).status, 429);
  assert.equal((await send({ text: 'Another address' }, '198.51.100.9')).status, 202);

  const report = body => request(app).post('/api/v2/problem-reports').set('X-Forwarded-For', '192.0.2.1').send(body);
  assert.equal((await report({ text: 'The library badge is wrong', screen: 'book', libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}`, appVersion: '1.2.3' })).status, 202);
  // A NUL cannot be stored: refused rather than accepted and silently lost.
  for (const body of [{ text: '' }, { text: 'x'.repeat(2001) }, { text: 'ok', screen: 'elsewhere' }, { text: 'ok', email: 'a@b.c' },
    { text: 'broken\u0000page' }, { text: 'see \u202Ethis' }]) {
    assert.equal((await report(body)).status, 400);
  }
  for (let i = 0; i < 4; i += 1) assert.equal((await report({ text: `report ${i}` })).status, 202);
  assert.equal((await report({ text: 'sixth' })).status, 429);
  await settle();
  assert.deepEqual(Object.keys(store.submissions.held().reports[0]).sort(), ['appVersion', 'body', 'bookKey', 'createdOn', 'libraryId', 'screen']);
});

test('the anonymous log is off by default, and when on it gets scrubbed text and never an address, agent or coordinates', async () => {
  const off = harness();
  await request(off.app).post('/api/v2/books/search').send({ query: 'wings of fire' });
  assert.deepEqual(off.logged, []);

  const { app, logged, settle } = harness({ usageLogEnabled: true });
  await request(app).post('/api/v2/books/search').set('User-Agent', 'Private Agent').set('X-Forwarded-For', '203.0.113.5')
    .send({ query: 'wings of fire me@example.com 9876543210 978-81-7371-146-6' });
  await request(app).post('/api/v2/libraries/discover').send({ lat: 13.08, lon: 80.27 });
  await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  await settle();
  const search = logged.find(row => row.kind === 'book_search');
  assert.equal(search.queryText, 'wings of fire [removed] [removed] 978-81-7371-146-6');
  assert.deepEqual([search.outcome, search.resultCount, search.source], ['none', 0, 'public_data']);
  assert.equal(search.occurredHour % (60 * 60 * 1000), 0);
  const nearMe = logged.find(row => row.kind === 'near_me');
  assert.deepEqual([nearMe.queryText, nearMe.libraryId, nearMe.bookKey], [null, null, null]);
  const check = logged.find(row => row.kind === 'book_check');
  assert.deepEqual([check.libraryId, check.bookKey, check.outcome, check.source, check.queryText], [vega.id, `v1:isbn:${ISBN_A}`, 'found', 'live', null]);
  const text = JSON.stringify(logged);
  for (const value of ['203.0.113.5', 'Private Agent', '13.08', '80.27', 'me@example.com', '9876543210']) assert.ok(!text.includes(value), value);
});
