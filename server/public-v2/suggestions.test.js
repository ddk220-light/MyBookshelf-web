import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import seed from '../../shared/suggestions-seed.json' with { type: 'json' };
import { makeTestApp } from '../test/helpers.js';
import { createPublicV2Router } from './router.js';
import { createRedactedTelemetrySink } from './telemetry.js';
import { chooseSubjects, foundIdentities, isGenericSubject, OUTBOUND_CAP, SUGGESTION_CACHE_TTL_MS, SUGGESTIONS_RETURNED } from './suggestions.js';
import { createCatalogStore } from '../catalog-store/index.js';
import { readCatalogStoreConfig } from '../catalog-store/config.js';
import { createCatalogPolicy } from '../catalog-store/policy.js';
import { createOpenLibrarySuggestionReads, parseEditions, parseSubjectWorks, readOpenLibrary } from '../services/openLibrarySuggestions.js';
import { clearHttpCache } from '../services/providers/http.js';

const LIBRARY = 'koha:test-library';
const OPTED_OUT = 'koha:opted-out';
const library = id => ({ id, name: 'Test Library', capabilities: { catalogLookup: true, publicAvailability: true } });
const directory = { resolve: id => ([LIBRARY, OPTED_OUT].includes(id) ? library(id) : null), entry: () => { throw new Error('no catalog entry is needed'); },
  search: () => [], browse: () => ({ libraries: [], total: 0, nextOffset: null }) };

// Valid ISBN-13s (978 + 9 digits + check digit).
const isbn = n => { const body = '978' + String(n).padStart(9, '0'); const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0); return body + ((10 - (sum % 10)) % 10); };
const work = n => `OL${n}W`;
const cover = n => `https://covers.openlibrary.org/b/id/${n}-M.jpg`;

// Fake Open Library: every call is counted by kind.
function fakeOpenLibrary({ editions = {}, works = {}, isbnWorks = {}, subjects = {}, fail = false, hang = false } = {}) {
  const calls = [];
  const answer = async (kind, value, result) => {
    calls.push([kind, value]);
    if (hang) return new Promise(() => {});
    if (fail) throw Object.assign(new Error('down'), { code: 'SUGGESTIONS_UPSTREAM' });
    return result();
  };
  return {
    calls,
    count: kind => calls.filter(([name]) => !kind || name === kind).length,
    reads: {
      editionsByIsbn: isbns => answer('editions', isbns, () => new Map(isbns.map(value => [value, editions[value] || null]))),
      workSubjects: id => answer('work', id, () => ({ workId: id, subjects: works[id] || [] })),
      isbnSubjects: value => answer('isbn', value, () => isbnWorks[value] || { subjects: [] }),
      subjectWorks: subject => answer('subject', subject, () => subjects[subject] || []),
    },
  };
}

function harness({ openLibrary = fakeOpenLibrary(), usageLogEnabled = false, answers = [], now = () => Date.now(), deadlineMs, storeDown = false, telemetry,
  peek = () => undefined, listFound = null } = {}) {
  const logged = [];
  const pending = [];
  const defer = task => { pending.push(Promise.resolve().then(task).catch(() => {})); };
  const config = { ...readCatalogStoreConfig({}), usageLogEnabled };
  const policies = { schemaVersion: 1, libraries: { [OPTED_OUT]: { storeAnswers: false, reason: 'Test', reviewedOn: '2026-11-14' } } };
  const memory = createCatalogStore({ config, db: null, defer, usageSink: row => logged.push(row), policy: createCatalogPolicy({ policies }) });
  const down = async () => { throw Object.assign(new Error('down'), { code: 'CATALOG_STORE_TIMEOUT' }); };
  const store = { ...memory, answers: { ...memory.answers, listFound: storeDown ? down : listFound ? listFound(memory.answers.listFound) : memory.answers.listFound } };
  const lookupCalls = [];
  const refuse = name => (...args) => { lookupCalls.push(name); throw new Error(`no catalog request: ${name}`); };
  const lookup = { lookupBook: refuse('lookupBook'), markResults: refuse('markResults'), readRecord: refuse('readRecord'), storedFor: refuse('storedFor') };
  const books = { search: refuse('search'), resolve: refuse('resolve'), summary: refuse('summary'), searchProfile: refuse('searchProfile') };
  const app = makeTestApp(express => express.use('/api/v2', createPublicV2Router({ directory, books, lookup, catalogStore: store, rateLimit: { limit: 1000 },
    ...(telemetry ? { telemetry } : {}),
    suggestionOptions: { reads: openLibrary.reads, now, peek, ...(deadlineMs ? { deadlineMs } : {}) } })));
  const ready = store.answers.writeAnswers(answers);
  return { app, store, logged, lookupCalls, openLibrary, ready, settle: async () => { while (pending.length) await Promise.all(pending.splice(0)); } };
}

// A stored "found" for a work (found by one of its ISBNs), as the lookup layer writes it.
const foundWork = (n, libraryId = LIBRARY) => [
  { libraryId, kind: 'ol_work', value: work(n), answer: 'found', evidence: 'work_isbn', matchedIsbn13: isbn(n), expiresAt: Date.now() + 1e10 },
  { libraryId, kind: 'isbn13', value: isbn(n), answer: 'found', evidence: 'work_isbn', expiresAt: Date.now() + 1e10 },
];
const edition = (n, author = 'Library Author ' + n) => ({ title: 'Library Book ' + n, authors: [author], coverUrl: cover(n) });
const relatedWork = (n, author = 'Related Author ' + n) => ({ bookKey: `v1:openlibrary:${work(n)}`, workId: work(n), title: 'Related ' + n, authors: [author], coverUrl: cover(n) });
const post = (app, body) => request(app).post('/api/v2/suggestions').send(body);
const keys = response => response.body.books.map(book => book.bookKey);

test('validation: only libraryId, recentBookKeys (≤3) and excludeKeys (≤200) of valid book keys', async () => {
  const { app } = harness();
  const ok = { recentBookKeys: [], excludeKeys: [] };
  assert.equal((await post(app, ok)).status, 200);
  assert.equal((await post(app, { ...ok, libraryId: LIBRARY })).status, 200);
  const many = Array.from({ length: 200 }, (_, index) => `v1:isbn:${isbn(index + 1)}`);
  assert.equal((await post(app, { recentBookKeys: many.slice(0, 3), excludeKeys: many })).status, 200);
  for (const body of [
    {}, [], { recentBookKeys: [] }, { excludeKeys: [] },
    { ...ok, extra: true }, { ...ok, query: 'wings of fire' }, { ...ok, accountId: 'a' },
    { recentBookKeys: many.slice(0, 4), excludeKeys: [] },
    { recentBookKeys: [], excludeKeys: [...many, `v1:isbn:${isbn(999)}`] },
    { recentBookKeys: ['not a key'], excludeKeys: [] }, { recentBookKeys: [], excludeKeys: [42] },
    { recentBookKeys: [], excludeKeys: [`v1:isbn:9780000000001`] }, // bad check digit
    { recentBookKeys: [], excludeKeys: ['v1:catalog:koha:x:' + 'a'.repeat(600)] },
    { recentBookKeys: 'v1:openlibrary:OL1W', excludeKeys: [] },
    { ...ok, libraryId: 'not a library' }, { ...ok, libraryId: 7 }, { ...ok, libraryId: null },
  ]) {
    const response = await post(app, body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 120));
    assert.equal(response.body.error.code, 'INVALID_REQUEST');
  }
  const event = body => request(app).post('/api/v2/suggestions/events').send(body);
  assert.equal((await event({ event: 'opened', bookKey: 'v1:openlibrary:OL1W' })).status, 202);
  assert.equal((await event({ event: 'saved', bookKey: `v1:isbn:${isbn(1)}` })).status, 202);
  for (const body of [{}, { event: 'shown', bookKey: 'v1:openlibrary:OL1W' }, { event: 'opened' }, { event: 'opened', bookKey: 'x' },
    { event: 'opened', bookKey: 'v1:openlibrary:OL1W', libraryId: LIBRARY }]) assert.equal((await event(body)).status, 400, JSON.stringify(body));
});

test('order: books the library is known to have first (inLibrary), then related works; exclusions and one book per author', async () => {
  const openLibrary = fakeOpenLibrary({
    editions: { [isbn(1)]: edition(1), [isbn(2)]: edition(2, 'Shared Author'), [isbn(3)]: edition(3), [isbn(4)]: edition(4) },
    works: { [work(100)]: ['Fiction', 'Accessible book', 'Rocketry', 'Presidents'] },
    subjects: { Rocketry: [relatedWork(100), relatedWork(201), relatedWork(202, 'shared author'), relatedWork(3), relatedWork(203)] },
  });
  const { app, ready } = harness({ openLibrary, answers: [...foundWork(4), ...foundWork(3), ...foundWork(2), ...foundWork(1)] });
  await ready;
  const response = await post(app, { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL100W'],
    // Saved: work 4 itself, and the ISBN of work 3's found edition.
    excludeKeys: ['v1:openlibrary:OL4W', `v1:isbn:${isbn(3)}`] });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.books.slice(0, 2), [
    { bookKey: 'v1:openlibrary:OL1W', title: 'Library Book 1', authors: ['Library Author 1'], coverUrl: cover(1), workId: 'OL1W', inLibrary: true },
    { bookKey: 'v1:openlibrary:OL2W', title: 'Library Book 2', authors: ['Shared Author'], coverUrl: cover(2), workId: 'OL2W', inLibrary: true },
  ]);
  // Related: not the recent book itself, not a second book by "Shared Author",
  // and work 3 (saved as an edition) is left out from both sources.
  assert.deepEqual(keys(response).slice(2), ['v1:openlibrary:OL201W', 'v1:openlibrary:OL203W']);
  assert.ok(response.body.books.slice(2).every(book => !('inLibrary' in book)));
  // The generic subjects were skipped: the first good one was asked for.
  assert.deepEqual(openLibrary.calls.filter(([kind]) => kind === 'subject'), [['subject', 'Rocketry']]);
});

test('an ISBN-only find is suggested as that edition; a related work the library has keeps its badge; at most 15', async () => {
  const many = Array.from({ length: 30 }, (_, index) => relatedWork(300 + index));
  const openLibrary = fakeOpenLibrary({ editions: { [isbn(7)]: edition(7) }, works: { [work(100)]: ['Indian fiction (English)'] },
    subjects: { 'Indian fiction (English)': [relatedWork(8), ...many] } });
  const { app, ready } = harness({ openLibrary, answers: [
    { libraryId: LIBRARY, kind: 'isbn13', value: isbn(7), answer: 'found', evidence: 'exact_isbn', expiresAt: Date.now() + 1e10 },
    // Found, but its display data is not cached and the batch only covered…
    { libraryId: LIBRARY, kind: 'ol_work', value: work(8), answer: 'found', evidence: 'work_isbn', matchedIsbn13: isbn(8), expiresAt: Date.now() + 1e10 },
  ] });
  await ready;
  const response = await post(app, { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL100W'], excludeKeys: [] });
  assert.equal(response.body.books.length, SUGGESTIONS_RETURNED);
  assert.deepEqual(response.body.books[0], { bookKey: `v1:isbn:${isbn(7)}`, title: 'Library Book 7', authors: ['Library Author 7'], coverUrl: cover(7), isbn13: isbn(7), inLibrary: true });
  // …work 8 has no edition record, so it comes from the related list, with the library's badge.
  assert.deepEqual(response.body.books[1], { ...relatedWork(8), inLibrary: true });
});

test('never a "not found", never another library’s answer, nothing for a library whose answers may not be stored', async () => {
  const openLibrary = fakeOpenLibrary({ editions: { [isbn(1)]: edition(1), [isbn(2)]: edition(2), [isbn(3)]: edition(3) } });
  const { app, ready } = harness({ openLibrary, answers: [
    { libraryId: LIBRARY, kind: 'isbn13', value: isbn(1), answer: 'not_found', evidence: 'isbn_not_listed', expiresAt: Date.now() + 1e10 },
    { libraryId: LIBRARY, kind: 'ol_work', value: work(2), answer: 'not_found', evidence: 'work_no_match', expiresAt: Date.now() + 1e10 },
    { libraryId: LIBRARY, kind: 'catalog_record', value: `${LIBRARY}:123`, answer: 'found', evidence: 'catalog_record', expiresAt: Date.now() + 1e10 },
    { libraryId: LIBRARY, kind: 'isbn13', value: isbn(4), answer: 'found', evidence: 'exact_isbn', expiresAt: Date.now() - 1 },
    ...foundWork(3, 'koha:another-library'), ...foundWork(3, OPTED_OUT),
  ] });
  await ready;
  for (const libraryId of [LIBRARY, OPTED_OUT, 'koha:unknown-library']) {
    const response = await post(app, { libraryId, recentBookKeys: [], excludeKeys: [] });
    assert.deepEqual(response.body, { books: [] }, libraryId);
  }
  assert.equal(openLibrary.count(), 0, 'no display data was needed');
});

test('no library catalog is ever asked: only the store and Open Library', async () => {
  const openLibrary = fakeOpenLibrary({ editions: { [isbn(1)]: edition(1) }, works: { [work(100)]: ['Rocketry'] }, subjects: { Rocketry: [relatedWork(201)] } });
  const { app, ready, lookupCalls } = harness({ openLibrary, answers: foundWork(1) });
  await ready;
  const response = await post(app, { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL100W', `v1:isbn:${isbn(50)}`,
    'v1:catalog:koha:test-library:123'], excludeKeys: ['v1:catalog:koha:test-library:999'] });
  assert.deepEqual(keys(response), ['v1:openlibrary:OL1W', 'v1:openlibrary:OL201W']);
  assert.deepEqual(lookupCalls, []);

  // The real reads ask openlibrary.org only, with the app's User-Agent.
  clearHttpCache();
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push({ host: new URL(url).host, agent: options.headers['User-Agent'] });
    return new Response(JSON.stringify({ docs: [], [`ISBN:${isbn(1)}`]: { title: 'X' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const reads = createOpenLibrarySuggestionReads();
    await reads.editionsByIsbn([isbn(1)]);
    await reads.workSubjects(work(1));
    await reads.isbnSubjects(isbn(1));
    await reads.subjectWorks('Rocketry');
  } finally { globalThis.fetch = realFetch; }
  assert.equal(seen.length, 4);
  assert.ok(seen.every(({ host, agent }) => host === 'openlibrary.org' && /^MyBookshelf\/1\.0 \(book suggestions; https:\/\/mybookshelf\.cloud\/privacy\)$/.test(agent)), JSON.stringify(seen));
});

test(`at most ${OUTBOUND_CAP} Open Library requests per suggestion request, however much is uncached`, async () => {
  const answers = Array.from({ length: 30 }, (_, index) => foundWork(index + 1)).flat();
  const editions = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [isbn(index + 1), edition(index + 1)]));
  const openLibrary = fakeOpenLibrary({ editions, works: { [work(101)]: ['Rocketry', 'Space'], [work(102)]: ['Rocketry'], [work(103)]: ['Space'] },
    subjects: { Rocketry: [relatedWork(201)], Space: [relatedWork(202)] } });
  const { app, ready } = harness({ openLibrary, answers });
  await ready;
  const body = { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL101W', 'v1:openlibrary:OL102W', 'v1:openlibrary:OL103W'], excludeKeys: [] };
  const first = await post(app, body);
  assert.equal(first.status, 200);
  assert.equal(openLibrary.count(), OUTBOUND_CAP);
  // One batch for the library's editions, one subject read (the newest recent book), one subject list.
  assert.deepEqual(openLibrary.calls.map(([kind]) => kind).sort(), ['editions', 'subject', 'work']);
  assert.equal(openLibrary.calls.find(([kind]) => kind === 'editions')[1].length, 20);
  assert.deepEqual(openLibrary.calls.find(([kind]) => kind === 'work'), ['work', work(101)]);
  // The library's books come first and fill the fifteen.
  assert.equal(first.body.books.length, SUGGESTIONS_RETURNED);
  assert.ok(first.body.books.every(book => book.inLibrary));
  // Without a library, the spare slot can go to a second subject list.
  const second = harness({ openLibrary: fakeOpenLibrary({ works: { [work(101)]: ['Rocketry', 'Space'] }, subjects: { Rocketry: [relatedWork(201)], Space: [relatedWork(202)] } }) });
  const response = await post(second.app, { recentBookKeys: body.recentBookKeys, excludeKeys: [] });
  assert.equal(second.openLibrary.count(), OUTBOUND_CAP);
  assert.deepEqual(keys(response), ['v1:openlibrary:OL201W', 'v1:openlibrary:OL202W']);
});

test('answers are cached for 24 hours: a second request asks nothing, a day later it asks again', async () => {
  let clock = Date.parse('2026-11-14T10:00:00Z');
  const openLibrary = fakeOpenLibrary({ editions: { [isbn(1)]: edition(1) }, works: { [work(100)]: ['Rocketry'] }, subjects: { Rocketry: [relatedWork(201)] } });
  let listed = 0;
  const { app, ready } = harness({ openLibrary, answers: foundWork(1), now: () => clock, listFound: original => (...args) => { listed += 1; return original(...args); } });
  await ready;
  const body = { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL100W'], excludeKeys: [] };
  const first = await post(app, body);
  assert.equal(openLibrary.count(), 3);
  assert.equal(listed, 1);
  clock += SUGGESTION_CACHE_TTL_MS - 1000;
  const again = await post(app, body);
  assert.deepEqual(again.body, first.body);
  assert.equal(openLibrary.count(), 3, 'display data, subjects and the subject list came from the cache');
  assert.equal(listed, 1, 'the library’s found list came from the cache');
  clock += 2000;
  await post(app, body);
  assert.equal(openLibrary.count(), 6);
  assert.equal(listed, 2);
});

test('a work record this instance already read costs no request', async () => {
  const openLibrary = fakeOpenLibrary({ subjects: { Rocketry: [relatedWork(201)] } });
  const peeked = [];
  const { app } = harness({ openLibrary, peek: path => { peeked.push(path); return path === '/works/OL100W.json' ? { title: 'W', subjects: ['Rocketry'] } : undefined; } });
  const response = await post(app, { recentBookKeys: ['v1:openlibrary:OL100W'], excludeKeys: [] });
  assert.deepEqual(keys(response), ['v1:openlibrary:OL201W']);
  assert.deepEqual(peeked, ['/works/OL100W.json']);
  assert.deepEqual(openLibrary.calls, [['subject', 'Rocketry']]);
});

test('fails open: store down, Open Library down or slow, all give 200 quickly with what is known', async () => {
  const subjects = { works: { [work(100)]: ['Rocketry'] }, subjects: { Rocketry: [relatedWork(201)] } };
  const body = { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL100W'], excludeKeys: [] };
  // Store down: the related works still come.
  const storeDown = harness({ openLibrary: fakeOpenLibrary({ editions: { [isbn(1)]: edition(1) }, ...subjects }), storeDown: true });
  const a = await post(storeDown.app, body);
  assert.equal(a.status, 200);
  assert.deepEqual(keys(a), ['v1:openlibrary:OL201W']);
  // `partial`: the app keeps its last answer instead of taking this one as the whole truth.
  assert.equal(a.body.partial, true);
  // Open Library down: no books, and nothing cached as an answer.
  const down = harness({ openLibrary: fakeOpenLibrary({ fail: true }), answers: foundWork(1) });
  await down.ready;
  const b = await post(down.app, body);
  assert.deepEqual([b.status, b.body], [200, { books: [], partial: true }]);
  const c = await post(down.app, body);
  assert.deepEqual([c.status, c.body], [200, { books: [], partial: true }]);
  assert.equal(down.openLibrary.count('editions'), 2, 'a failure is not cached');
  // Open Library never answers: the reply still comes by the deadline.
  const slow = harness({ openLibrary: fakeOpenLibrary({ hang: true }), answers: foundWork(1), deadlineMs: 150 });
  await slow.ready;
  const startedAt = Date.now();
  const d = await post(slow.app, body);
  assert.deepEqual([d.status, d.body], [200, { books: [], partial: true }]);
  assert.ok(Date.now() - startedAt < 1500, `answered in ${Date.now() - startedAt} ms`);
  // A store that never answers is bounded by the same deadline.
  const stuck = harness({ openLibrary: fakeOpenLibrary(subjects), deadlineMs: 150, listFound: () => () => new Promise(() => {}) });
  const e = await post(stuck.app, body);
  assert.equal(e.status, 200);
  assert.deepEqual(keys(e), ['v1:openlibrary:OL201W']);
  assert.equal(e.body.partial, true);
  // Everything answered: not partial, even when nothing is known.
  const fine = harness({ openLibrary: fakeOpenLibrary(subjects) });
  assert.deepEqual((await post(fine.app, body)).body, { books: [relatedWork(201)] });
  assert.deepEqual((await post(fine.app, { recentBookKeys: [], excludeKeys: [] })).body, { books: [] });
});

test('the anonymous log gets counts only: the five shown (seed list included), opened and saved; nothing when it is off', async () => {
  const openLibrary = fakeOpenLibrary({ editions: { [isbn(1)]: edition(1) }, works: { [work(100)]: ['Rocketry'] }, subjects: { Rocketry: [relatedWork(201)] } });
  const { app, ready, logged } = harness({ openLibrary, answers: foundWork(1), usageLogEnabled: true });
  await ready;
  const saved = seed.books[0].bookKey;
  const response = await request(app).post('/api/v2/suggestions').set('User-Agent', 'Synthetic-Agent/1.0').set('X-Forwarded-For', '203.0.113.7')
    .send({ libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL100W'], excludeKeys: [saved] });
  assert.equal(response.status, 200);
  await new Promise(resolve => setImmediate(resolve));
  // The two server books, then the seed list without the saved one.
  const shown = ['v1:openlibrary:OL1W', 'v1:openlibrary:OL201W', ...seed.books.slice(1, 4).map(book => book.bookKey)];
  assert.deepEqual(logged.map(row => [row.kind, row.bookKey, row.outcome]), shown.map(bookKey => ['suggestion', bookKey, 'shown']));
  for (const row of logged) {
    assert.deepEqual([row.queryText, row.libraryId, row.resultCount, row.foundCount, row.source, row.durationMs, row.appVersion], [null, null, null, null, null, null, null]);
  }
  await request(app).post('/api/v2/suggestions/events').send({ event: 'opened', bookKey: 'v1:openlibrary:OL1W' });
  await request(app).post('/api/v2/suggestions/events').send({ event: 'saved', bookKey: 'v1:openlibrary:OL1W' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(logged.slice(5).map(row => [row.kind, row.bookKey, row.outcome]), [['suggestion', 'v1:openlibrary:OL1W', 'opened'], ['suggestion', 'v1:openlibrary:OL1W', 'saved']]);
  const stored = JSON.stringify(logged);
  for (const secret of ['203.0.113.7', 'Synthetic-Agent', 'OL100W', LIBRARY, saved]) assert.ok(!stored.includes(secret), secret);
  // A refused request logs nothing.
  await post(app, { recentBookKeys: [], excludeKeys: [], extra: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(logged.length, 7);

  // An empty partial answer (Open Library down) counts nothing as shown: the app keeps its last books.
  const down = harness({ openLibrary: fakeOpenLibrary({ fail: true }), usageLogEnabled: true });
  assert.equal((await post(down.app, { recentBookKeys: ['v1:openlibrary:OL100W'], excludeKeys: [] })).body.partial, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(down.logged, []);

  const off = harness({ openLibrary: fakeOpenLibrary() });
  await post(off.app, { recentBookKeys: [], excludeKeys: [] });
  await request(off.app).post('/api/v2/suggestions/events').send({ event: 'opened', bookKey: 'v1:openlibrary:OL1W' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(off.logged, []);
});

test('the router never writes the request body to platform logs or telemetry', async () => {
  const telemetry = createRedactedTelemetrySink();
  const { app, ready } = harness({ telemetry, openLibrary: fakeOpenLibrary({ fail: true }), answers: foundWork(1), storeDown: true });
  await ready;
  const printed = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const original = Object.fromEntries(methods.map(name => [name, console[name]]));
  for (const name of methods) console[name] = (...args) => { printed.push(args.map(String).join(' ')); };
  const body = { libraryId: LIBRARY, recentBookKeys: ['v1:openlibrary:OL777W'], excludeKeys: ['v1:openlibrary:OL888W'] };
  try {
    await post(app, body);
    await post(app, { ...body, extra: 'v1:openlibrary:OL999W' });
    await request(app).post('/api/v2/suggestions/events').send({ event: 'opened', bookKey: 'v1:openlibrary:OL666W' });
  } finally { Object.assign(console, original); }
  assert.deepEqual(printed, []);
  const events = JSON.stringify(telemetry.events());
  for (const value of ['OL777W', 'OL888W', 'OL999W', 'OL666W', LIBRARY]) assert.ok(!events.includes(value), value);
  assert.deepEqual(telemetry.events().map(event => [event.operation, event.outcome]), [['suggestions', '200'], ['suggestions', '400'], ['suggestion_event', '202']]);
});

test('subjects: generic ones and tags are skipped; shared subjects and the newest book come first', () => {
  for (const subject of ['Fiction', 'Accessible book', 'Protected DAISY', 'In library', 'Large type books', 'Fiction, general', 'nyt:combined-print=2008',
    'Reading Level-Grade 11', 'Open Library Staff Picks', 'Juvenile fiction', 'Long Now Manual for Civilization', '1947', 'History']) {
    assert.equal(isGenericSubject(subject), true, subject);
  }
  for (const subject of ['Rocketry', 'Indian fiction (English)', 'Partition of India', 'Space flight']) assert.equal(isGenericSubject(subject), false, subject);
  assert.deepEqual(chooseSubjects([['Fiction', 'Rocketry', 'India'], ['India', 'Cricket']]), ['India', 'Rocketry']);
  assert.deepEqual(chooseSubjects([['Fiction', 'Accessible book'], []]), []);
  assert.deepEqual(chooseSubjects([['Rocketry', 'rocketry', 'Space']], 1), ['Rocketry']);
});

test('found rows become works shown with the found edition, or that ISBN edition alone', () => {
  assert.deepEqual(foundIdentities([
    { kind: 'isbn13', value: isbn(1) }, { kind: 'ol_work', value: work(1), matchedIsbn13: isbn(1) },
    { kind: 'isbn13', value: isbn(2) }, { kind: 'ol_work', value: work(3) }, { kind: 'catalog_record', value: 'x:1' }, { kind: 'isbn13', value: '978000000000X' },
  ]), [
    { bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W', matchedIsbn13: isbn(1), isbn: isbn(1) },
    { bookKey: `v1:isbn:${isbn(2)}`, isbn13: isbn(2), isbn: isbn(2) },
  ]);
});

test('Open Library answers are read defensively: covers on the covers host, works need a cover and an author', () => {
  const editions = parseEditions({ [`ISBN:${isbn(1)}`]: { title: ' Wings of Fire ', authors: [{ name: 'A. P. J. Abdul Kalam' }], cover: { medium: 'http://covers.openlibrary.org/b/id/1-M.jpg' } },
    [`ISBN:${isbn(2)}`]: { title: 'Elsewhere', cover: { medium: 'https://evil.example/c.jpg' } } }, [isbn(1), isbn(2), isbn(3)]);
  assert.deepEqual([...editions], [[isbn(1), { title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], coverUrl: 'https://covers.openlibrary.org/b/id/1-M.jpg' }],
    [isbn(2), { title: 'Elsewhere', authors: [] }], [isbn(3), null]]);
  assert.deepEqual(parseSubjectWorks({ docs: [{ key: '/works/OL1W', title: 'A', author_name: ['X'], cover_i: 5 }, { key: '/works/OL2W', title: 'No cover', author_name: ['Y'] },
    { key: '/works/OL3W', title: 'No author', cover_i: 6 }, { key: '/books/OL4M', title: 'Edition', author_name: ['Z'], cover_i: 7 }] }),
  [{ bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W', title: 'A', authors: ['X'], coverUrl: cover(5) }]);
});

test('Suggestions skip books for adults, and related books need a title in Latin letters', () => {
  const doc = (n, extra) => ({ key: `/works/OL${n}W`, author_name: ['Author ' + n], cover_i: n, ...extra });
  const kept = parseSubjectWorks({ docs: [
    doc(1, { title: 'कामसूत्र' }),
    doc(2, { title: 'The Kama Sutra' }),
    doc(3, { title: 'A Quiet Book', subject: ['Fiction', 'Erotic literature'] }),
    doc(4, { title: 'Sex and the City' }),
    doc(5, { title: 'Pride and Prejudice', subject: ['Courtship', 'Essex (England)'] }),
    doc(6, { title: 'Les Misérables', subject: ['France'] }),
    doc(7, { title: 'Train to Pakistan: 1947', subject: ['Partition'] }),
  ] }).map(book => book.title);
  assert.deepEqual(kept, ['Pride and Prejudice', 'Les Misérables', 'Train to Pakistan: 1947']);
  const editions = parseEditions({ [`ISBN:${isbn(1)}`]: { title: 'A Manual', subjects: [{ name: 'Sex instruction' }] },
    [`ISBN:${isbn(2)}`]: { title: 'பொன்னியின் செல்வன்', subjects: [{ name: 'Fiction' }] } }, [isbn(1), isbn(2)]);
  assert.equal(editions.get(isbn(1)), null);
  assert.deepEqual(editions.get(isbn(2)), { title: 'பொன்னியின் செல்வன்', authors: [] });
});

test('Open Library reads are sent once, never retried, and a 404 is no record', async () => {
  clearHttpCache();
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response('busy', { status: calls === 1 ? 503 : 404 }); };
  try {
    await assert.rejects(readOpenLibrary('/works/OL1W.json'), { code: 'SUGGESTIONS_UPSTREAM' });
    assert.equal(calls, 1);
    assert.equal(await readOpenLibrary('/works/OL2W.json'), null);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = realFetch; }
});
