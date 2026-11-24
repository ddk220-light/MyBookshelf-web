import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import request from 'supertest';
import { makeTestApp } from '../test/helpers.js';
import { createPublicV2Router } from './router.js';
import { createRedactedTelemetrySink } from './telemetry.js';
import { OUTBOUND_CAP, RELATED_CACHE, RELATED_RETURNED, SUGGESTION_CACHE_TTL_MS } from './suggestions.js';
import { createCatalogStore } from '../catalog-store/index.js';
import { readCatalogStoreConfig } from '../catalog-store/config.js';
import { blockedBook, collectionOrTextbook, createOpenLibrarySuggestionReads, isBroadSubject, isJunkSubject, MIN_SUGGESTED_READERS, parseSubjectWorks, parseWorkRecord,
  readOpenLibrary, relatedQuery } from '../services/openLibrarySuggestions.js';
import { clearHttpCache } from '../services/providers/http.js';

const LIBRARY = 'koha:test-library';
const directory = { resolve: id => (id === LIBRARY ? { id, name: 'Test Library' } : null), entry: () => { throw new Error('no catalog entry is needed'); },
  search: () => [], browse: () => ({ libraries: [], total: 0, nextOffset: null }) };

// Valid ISBN-13s (978 + 9 digits + check digit).
const isbn = n => { const body = '978' + String(n).padStart(9, '0'); const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0); return body + ((10 - (sum % 10)) % 10); };
const work = n => `OL${n}W`;
const cover = n => `https://covers.openlibrary.org/b/id/${n}-M.jpg`;

// A work's record as workRecord gives it.
const record = (n, { subjects = [], places = [], authorKeys = [`OL${n}A`], title = 'Recent ' + n } = {}) => ({ workId: work(n), title, subjects, places, authorKeys });
const NO_RECORD = { title: '', subjects: [], places: [], authorKeys: [] };
// The book most tests ask about: one subject in one place, so its related query is this.
const RECENT = { [work(100)]: record(100, { subjects: ['Rocketry'], places: ['India'] }) };
const ROCKETRY_IN_INDIA = 'subject:"Rocketry" place:"India"';

// Fake Open Library: every call is counted by kind.
function fakeOpenLibrary({ works = {}, isbnWorks = {}, authors = {}, related = {}, fail = false, hang = false } = {}) {
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
      workRecord: id => answer('work', id, () => works[id] || { workId: id, ...NO_RECORD }),
      isbnRecord: value => answer('isbn', value, () => isbnWorks[value] || NO_RECORD),
      authorWorks: key => answer('author', key, () => authors[key] || []),
      relatedWorks: query => answer('related', query, () => related[query] || []),
    },
  };
}

// The related list never touches the catalog store or a library catalog:
// every store read and catalog call is recorded (and refused).
function harness({ openLibrary = fakeOpenLibrary(), usageLogEnabled = false, now = () => Date.now(), deadlineMs, telemetry, peek = () => undefined } = {}) {
  const logged = [];
  const pending = [];
  const defer = task => { pending.push(Promise.resolve().then(task).catch(() => {})); };
  const config = { ...readCatalogStoreConfig({}), usageLogEnabled };
  const memory = createCatalogStore({ config, db: null, defer, usageSink: row => logged.push(row) });
  const storeReads = [];
  const refuseStore = name => (...args) => { storeReads.push(name); throw new Error(`no store read: ${name}`); };
  const store = { ...memory, answers: { ...memory.answers, readAnswers: refuseStore('readAnswers'), writeAnswers: refuseStore('writeAnswers') } };
  const lookupCalls = [];
  const refuse = name => (...args) => { lookupCalls.push(name); throw new Error(`no catalog request: ${name}`); };
  const lookup = { lookupBook: refuse('lookupBook'), markResults: refuse('markResults'), readRecord: refuse('readRecord'), storedFor: refuse('storedFor') };
  const books = { search: refuse('search'), resolve: refuse('resolve'), summary: refuse('summary'), searchProfile: refuse('searchProfile') };
  const app = makeTestApp(express => express.use('/api/v2', createPublicV2Router({ directory, books, lookup, catalogStore: store, rateLimit: { limit: 1000 },
    ...(telemetry ? { telemetry } : {}),
    suggestionOptions: { reads: openLibrary.reads, now, peek, ...(deadlineMs ? { deadlineMs } : {}) } })));
  return { app, store, storeReads, logged, lookupCalls, openLibrary, settle: async () => { while (pending.length) await Promise.all(pending.splice(0)); } };
}

const relatedWork = (n, author = 'Related Author ' + n) => ({ bookKey: `v1:openlibrary:${work(n)}`, workId: work(n), title: 'Related ' + n, authors: [author], coverUrl: cover(n) });
const related = (app, book) => request(app).get('/api/v2/suggestions/related').query({ book });
const keys = response => response.body.books.map(book => book.bookKey);
const event = (app, body) => request(app).post('/api/v2/suggestions/events').send(body);
const cacheHeaders = response => [response.headers['cache-control'], response.headers['vercel-cdn-cache-control']];

test('validation: exactly one `book`, an ISBN key or an Open Library work key; nothing else in the address', async () => {
  const { app } = harness();
  for (const book of ['v1:openlibrary:OL1W', `v1:isbn:${isbn(1)}`]) assert.equal((await related(app, book)).status, 200, book);
  const bad = [
    '', '?', '?book=', '?book=not%20a%20key', `?book=v1:isbn:9780000000001`, // bad check digit
    '?book=v1:isbn:0306406152', // an ISBN-10 is not a key
    '?book=v1:openlibrary:OL1M', '?book=v1:openlibrary:OL1A', '?book=v1:googlebooks:abc',
    // A library's own record (its key names the library) is refused.
    '?book=v1:catalog:' + Buffer.from('koha:test-library\n123').toString('base64url'),
    '?book=v1:openlibrary:OL1W&book=v1:openlibrary:OL2W', '?book[]=v1:openlibrary:OL1W', '?book[a]=v1:openlibrary:OL1W',
    // Nothing about the reader, and never search text, can ride along.
    '?book=v1:openlibrary:OL1W&q=wings%20of%20fire', '?book=v1:openlibrary:OL1W&libraryId=koha:test-library', '?book=v1:openlibrary:OL1W&_=1',
    '?book=v1:openlibrary:OL' + '1'.repeat(600) + 'W',
  ];
  for (const query of bad) {
    const response = await request(app).get('/api/v2/suggestions/related' + query);
    assert.equal(response.status, 400, query.slice(0, 120));
    assert.equal(response.body.error.code, 'INVALID_REQUEST');
    // An error is never cached.
    assert.deepEqual(cacheHeaders(response), ['no-store', undefined], query.slice(0, 120));
  }
  // The old POST is gone.
  assert.equal((await request(app).post('/api/v2/suggestions').send({ recentBookKeys: [], excludeKeys: [] })).status, 404);
  assert.equal((await request(app).post('/api/v2/suggestions/related').send({ book: 'v1:openlibrary:OL1W' })).status, 404);

  assert.equal((await event(app, { event: 'opened', bookKey: 'v1:openlibrary:OL1W' })).status, 202);
  assert.equal((await event(app, { event: 'saved', bookKey: `v1:isbn:${isbn(1)}` })).status, 202);
  // "Shown" is no longer counted, in either shape.
  for (const body of [{}, { event: 'opened' }, { event: 'opened', bookKey: 'x' }, { event: 'clicked', bookKey: 'v1:openlibrary:OL1W' },
    { event: 'opened', bookKey: 'v1:openlibrary:OL1W', libraryId: LIBRARY }, { event: 'opened', bookKeys: ['v1:openlibrary:OL1W'] },
    { event: 'opened', bookKey: 'v1:catalog:koha:test-library:123' }, { event: 'saved', bookKey: 'v1:googlebooks:abc' },
    { event: 'shown', bookKey: 'v1:openlibrary:OL1W' }, { event: 'shown', bookKeys: ['v1:openlibrary:OL1W'] },
    { event: 'shown', bookKeys: [1, 2, 3, 4, 5].map(n => `v1:openlibrary:${work(n)}`) },
  ]) assert.equal((await event(app, body)).status, 400, JSON.stringify(body));
});

test('cache headers: a complete answer is kept a day by the browser and Vercel’s CDN; an empty one an hour by the CDN only; a partial one a minute by the CDN only', async () => {
  assert.deepEqual(RELATED_CACHE.complete, { 'Cache-Control': 'public, max-age=86400', 'Vercel-CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' });
  assert.deepEqual(RELATED_CACHE.empty, { 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'public, max-age=3600' });
  assert.deepEqual(RELATED_CACHE.partial, { 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'public, max-age=60' });
  const fine = harness({ openLibrary: fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: [relatedWork(201)] } }) });
  const good = await related(fine.app, 'v1:openlibrary:OL100W');
  assert.equal(good.status, 200);
  assert.deepEqual(good.body, { books: [relatedWork(201)] });
  assert.deepEqual(cacheHeaders(good), ['public, max-age=86400', 'public, max-age=86400, stale-while-revalidate=604800']);
  // Never a cookie, and nothing that varies by reader.
  assert.equal(good.headers['set-cookie'], undefined);
  assert.ok(!/cookie|authorization/i.test(good.headers.vary || ''), good.headers.vary);
  // A complete answer with no related books (a book Open Library does not know, or a 404 or empty
  // list that may be passing) is kept an hour at the CDN and never by the browser, not a day.
  const none = await related(harness().app, 'v1:openlibrary:OL99999999999W');
  assert.deepEqual([none.status, none.body, ...cacheHeaders(none)], [200, { books: [] }, 'no-store', 'public, max-age=3600']);
  // Lists that answered but left nothing to suggest (only the book itself, or no cover) count as empty too.
  const leftOut = harness({ openLibrary: fakeOpenLibrary({ works: RECENT, authors: { OL100A: [relatedWork(100)] },
    related: { [ROCKETRY_IN_INDIA]: [{ ...relatedWork(202), coverUrl: undefined }] } }) });
  const nothing = await related(leftOut.app, 'v1:openlibrary:OL100W');
  assert.deepEqual([nothing.body, ...cacheHeaders(nothing)], [{ books: [] }, 'no-store', 'public, max-age=3600']);
  // Open Library down: partial, kept a minute at the CDN and not at all in the browser.
  const down = harness({ openLibrary: fakeOpenLibrary({ fail: true }) });
  const partial = await related(down.app, 'v1:openlibrary:OL100W');
  assert.deepEqual([partial.status, partial.body], [200, { books: [], partial: true }]);
  assert.deepEqual(cacheHeaders(partial), ['no-store', 'public, max-age=60']);
  // The events endpoint is never cached.
  assert.deepEqual(cacheHeaders(await event(fine.app, { event: 'opened', bookKey: 'v1:openlibrary:OL1W' })), ['no-store', undefined]);
});

test('no reader data: the answer is the book’s own, the same for every reader, and nothing reaches the store or a catalog', async () => {
  const openLibrary = fakeOpenLibrary({ works: RECENT, authors: { OL100A: [relatedWork(200)] }, related: { [ROCKETRY_IN_INDIA]: [relatedWork(201)] } });
  const { app, storeReads, lookupCalls } = harness({ openLibrary });
  const plain = await related(app, 'v1:openlibrary:OL100W');
  const reader = await request(app).get('/api/v2/suggestions/related').query({ book: 'v1:openlibrary:OL100W' })
    .set('Cookie', 'mybookshelf_auth.session_token=secret-session').set('User-Agent', 'Synthetic-Agent/1.0').set('X-Forwarded-For', '203.0.113.7');
  assert.deepEqual(reader.body, plain.body);
  assert.deepEqual(cacheHeaders(reader), cacheHeaders(plain));
  // Only the public book fields.
  const fields = new Set(plain.body.books.flatMap(book => Object.keys(book)));
  assert.deepEqual([...fields].sort(), ['authors', 'bookKey', 'coverUrl', 'title', 'workId']);
  assert.deepEqual(Object.keys(plain.body), ['books']);
  const text = JSON.stringify(reader.body);
  for (const secret of ['secret-session', '203.0.113.7', 'Synthetic-Agent', LIBRARY, 'inLibrary']) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(storeReads, []);
  assert.deepEqual(lookupCalls, []);
});

test('related: the same author’s most-read other works first, then the same subject in the same place; one work per title, never the book itself', async () => {
  const kalam = 'A. P. J. Abdul Kalam';
  const book = (id, title, author = kalam) => ({ bookKey: `v1:openlibrary:${id}`, workId: id, title, authors: [author], coverUrl: cover(1) });
  const openLibrary = fakeOpenLibrary({
    works: { OL1037811W: { workId: 'OL1037811W', title: 'Wings of Fire', subjects: ['Biography', 'Presidents', 'Scientists'], places: ['India'], authorKeys: ['OL101656A'] } },
    authors: { OL101656A: [book('OL1037811W', 'Wings of Fire'), book('OL11W', 'Wings of fire.'), book('OL12W', 'Ignited Minds'), book('OL13W', 'Ignited minds'),
      book('OL14W', 'Ignited Minds'), book('OL15W', 'My Journey')] },
    related: { 'subject:"Biography" place:"India"': [book('OL1037811W', 'Wings of Fire'), book('OL21W', 'Autobiography of a Yogi', 'Paramahansa Yogananda'),
      book('OL22W', 'The Jungle Book', 'Rudyard Kipling'), book('OL23W', 'Ignited Minds')] },
  });
  const { app } = harness({ openLibrary });
  const response = await related(app, 'v1:openlibrary:OL1037811W');
  // Never Wings of Fire again, never a second Ignited Minds; every Kalam book stays (the app keeps one per author).
  assert.deepEqual(response.body.books.map(item => item.title), ['Ignited Minds', 'My Journey', 'Autobiography of a Yogi', 'The Jungle Book']);
  assert.deepEqual(openLibrary.calls, [['work', 'OL1037811W'], ['author', 'OL101656A'], ['related', 'subject:"Biography" place:"India"']]);
  // A book known only by its ISBN: the search-by-ISBN record, then the same two lists.
  const byIsbn = fakeOpenLibrary({ isbnWorks: { [isbn(9)]: { workId: 'OL9W', title: 'Nine', subjects: ['Fiction'], places: ['Kerala'], authorKeys: ['OL9A'] } },
    authors: { OL9A: [relatedWork(9), relatedWork(10)] } });
  const nine = await related(harness({ openLibrary: byIsbn }).app, `v1:isbn:${isbn(9)}`);
  assert.deepEqual(byIsbn.calls, [['isbn', isbn(9)], ['author', 'OL9A'], ['related', 'subject:"Fiction" place:"Kerala"']]);
  // Its own work is left out too.
  assert.deepEqual(keys(nine), ['v1:openlibrary:OL10W']);
});

test('related: a work with one specific subject and no place gets only its author’s list; never a single-subject list', async () => {
  const openLibrary = fakeOpenLibrary({ works: { [work(100)]: record(100, { subjects: ['Presidents', 'Biography', 'Accessible book'] }) },
    authors: { OL100A: [relatedWork(201)] } });
  const response = await related(harness({ openLibrary }).app, 'v1:openlibrary:OL100W');
  assert.deepEqual(keys(response), ['v1:openlibrary:OL201W']);
  assert.deepEqual(openLibrary.calls.map(([kind]) => kind), ['work', 'author']);
  // A book that names extremism or is for adults leads to nothing related at all (a complete answer, kept as an empty one).
  for (const subjects of [['National socialism', 'Germany'], ['Erotic literature', 'France']]) {
    const blocked = fakeOpenLibrary({ works: { [work(100)]: record(100, { subjects, places: ['Germany'] }) }, authors: { OL100A: [relatedWork(201)] } });
    const answer = await related(harness({ openLibrary: blocked }).app, 'v1:openlibrary:OL100W');
    assert.deepEqual(answer.body, { books: [] });
    assert.deepEqual(cacheHeaders(answer), ['no-store', 'public, max-age=3600']);
    assert.deepEqual(blocked.calls.map(([kind]) => kind), ['work']);
  }
});

test('filters: covers only, an author, Latin-letter titles, nothing for adults or naming extremism', async () => {
  // Docs as Open Library's search gives them, through the real parser.
  const doc = (n, extra = {}) => ({ key: `/works/OL${n}W`, title: 'Book ' + n, author_name: ['Author ' + n], cover_i: n, readinglog_count: 100, ...extra });
  const docs = [doc(201), doc(202, { cover_i: undefined }), doc(203, { author_name: [] }), doc(204, { title: 'कामसूत्र' }), doc(205, { title: 'The Kama Sutra' }),
    doc(206, { subject: ['Erotic literature'] }), doc(207, { title: 'The Rise of the Nazi Party' }), doc(208, { subject: ['Antisemitism'] }), doc(209, { title: 'Les Misérables' })];
  const openLibrary = fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: parseSubjectWorks({ docs }) } });
  const response = await related(harness({ openLibrary }).app, 'v1:openlibrary:OL100W');
  assert.deepEqual(response.body.books.map(book => book.title), ['Book 201', 'Les Misérables']);
  // And a book without a cover or an author from any list is dropped here as well.
  const loose = fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: [{ ...relatedWork(301), coverUrl: undefined }, { ...relatedWork(302), authors: [] }, relatedWork(303)] } });
  assert.deepEqual(keys(await related(harness({ openLibrary: loose }).app, 'v1:openlibrary:OL100W')), ['v1:openlibrary:OL303W']);
});

test(`at most ${RELATED_RETURNED} books`, async () => {
  const many = Array.from({ length: 40 }, (_, index) => relatedWork(300 + index));
  const { app } = harness({ openLibrary: fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: many } }) });
  assert.deepEqual(keys(await related(app, 'v1:openlibrary:OL100W')), many.slice(0, RELATED_RETURNED).map(book => book.bookKey));
});

test('the real reads ask openlibrary.org only, with the app’s User-Agent', async () => {
  clearHttpCache();
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    seen.push({ url: new URL(url), agent: options.headers['User-Agent'] });
    return new Response(JSON.stringify({ docs: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const reads = createOpenLibrarySuggestionReads();
    await reads.workRecord(work(1));
    await reads.isbnRecord(isbn(1));
    await reads.authorWorks('OL101656A');
    await reads.relatedWorks('subject:"Biography" place:"India"');
    // Nothing is asked for a bad author key or anything but a subject query.
    assert.deepEqual(await reads.authorWorks('Kalam'), []);
    assert.deepEqual(await reads.relatedWorks('Presidents'), []);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(seen.length, 4);
  assert.ok(seen.every(({ url, agent }) => url.host === 'openlibrary.org' && /^MyBookshelf\/1\.0 \(book suggestions; https:\/\/mybookshelf\.cloud\/privacy\)$/.test(agent)), JSON.stringify(seen));
  // The queries: the work record; the ISBN's work with its subjects, places and authors;
  // the author's works and the subject-and-place works by readers, with subjects for the filters
  // and the reader count for the floor (no subtitle: titles are Open Library's, unchanged).
  const [workRead, isbnRead, authorRead, relatedRead] = seen.map(({ url }) => url);
  assert.equal(workRead.pathname, '/works/OL1W.json');
  assert.deepEqual([isbnRead.pathname, isbnRead.searchParams.get('isbn'), isbnRead.searchParams.get('fields')], ['/search.json', isbn(1), 'key,title,subject,place,subject_place,author_key']);
  const listFields = 'key,title,author_name,cover_i,subject,readinglog_count';
  assert.deepEqual(Object.fromEntries(authorRead.searchParams), { author_key: 'OL101656A', sort: 'readinglog', fields: listFields, limit: '10' });
  assert.deepEqual(Object.fromEntries(relatedRead.searchParams), { q: 'subject:"Biography" place:"India"', sort: 'readinglog', fields: listFields, limit: '20' });
});

test('the search by ISBN reads the work’s places from `place`, and `subject_place` only when `place` is missing', async () => {
  const doc = extra => ({ docs: [{ key: '/works/OL9W', title: 'Nine', subject: ['Fiction'], author_key: ['OL9A'], ...extra }] });
  const answers = [doc({ place: ['Kerala'], subject_place: ['Elsewhere'] }), doc({ subject_place: ['Goa'] }), doc({})];
  const reads = createOpenLibrarySuggestionReads({ read: async () => answers.shift() });
  assert.deepEqual(await reads.isbnRecord(isbn(9)), { workId: 'OL9W', title: 'Nine', subjects: ['Fiction'], places: ['Kerala'], authorKeys: ['OL9A'] });
  assert.deepEqual((await reads.isbnRecord(isbn(9))).places, ['Goa']);
  assert.deepEqual((await reads.isbnRecord(isbn(9))).places, []);
});

test(`at most ${OUTBOUND_CAP} Open Library requests per answer`, async () => {
  const openLibrary = fakeOpenLibrary({ works: { [work(101)]: record(101, { subjects: ['Rocketry'], places: ['India'] }) },
    authors: { OL101A: [relatedWork(201)] }, related: { [ROCKETRY_IN_INDIA]: [relatedWork(202)] } });
  const { app } = harness({ openLibrary });
  const first = await related(app, 'v1:openlibrary:OL101W');
  assert.equal(first.status, 200);
  assert.equal(OUTBOUND_CAP, 3);
  assert.equal(openLibrary.count(), OUTBOUND_CAP);
  // The book's record, its author's list and its subject-and-place list.
  assert.deepEqual(openLibrary.calls, [['work', work(101)], ['author', 'OL101A'], ['related', ROCKETRY_IN_INDIA]]);
  assert.deepEqual(keys(first), ['v1:openlibrary:OL201W', 'v1:openlibrary:OL202W']);
});

test('Open Library answers are also cached in the instance for 24 hours', async () => {
  let clock = Date.parse('2026-11-14T10:00:00Z');
  const openLibrary = fakeOpenLibrary({ works: RECENT, authors: { OL100A: [relatedWork(200)] }, related: { [ROCKETRY_IN_INDIA]: [relatedWork(201)] } });
  const { app } = harness({ openLibrary, now: () => clock });
  const first = await related(app, 'v1:openlibrary:OL100W');
  assert.deepEqual(first.body.books, [relatedWork(200), relatedWork(201)]);
  assert.equal(openLibrary.count(), 3);
  clock += SUGGESTION_CACHE_TTL_MS - 1000;
  const again = await related(app, 'v1:openlibrary:OL100W');
  assert.deepEqual(again.body, first.body);
  assert.equal(openLibrary.count(), 3, 'the work record and both lists came from the cache');
  clock += 2000;
  await related(app, 'v1:openlibrary:OL100W');
  assert.equal(openLibrary.count(), 6);
});

test('a work record this instance already read costs no request', async () => {
  const openLibrary = fakeOpenLibrary({ authors: { OL7A: [relatedWork(200)] }, related: { [ROCKETRY_IN_INDIA]: [relatedWork(201)] } });
  const peeked = [];
  const work100 = { title: 'W', subjects: ['Rocketry'], subject_places: ['India'], authors: [{ author: { key: '/authors/OL7A' } }] };
  const { app } = harness({ openLibrary, peek: path => { peeked.push(path); return path === '/works/OL100W.json' ? work100 : undefined; } });
  const response = await related(app, 'v1:openlibrary:OL100W');
  assert.deepEqual(keys(response), ['v1:openlibrary:OL200W', 'v1:openlibrary:OL201W']);
  assert.deepEqual(peeked, ['/works/OL100W.json']);
  assert.deepEqual(openLibrary.calls, [['author', 'OL7A'], ['related', ROCKETRY_IN_INDIA]]);
});

test('fails open: Open Library down or slow gives 200 quickly with what is known, marked partial and not cached for long', async () => {
  // One list fails: the other's books, partial.
  const half = fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: [relatedWork(201)] } });
  half.reads.authorWorks = async () => { throw new Error('down'); };
  const a = await related(harness({ openLibrary: half }).app, 'v1:openlibrary:OL100W');
  assert.deepEqual([a.status, a.body, ...cacheHeaders(a)], [200, { books: [relatedWork(201)], partial: true }, 'no-store', 'public, max-age=60']);
  // Open Library down: nothing, partial, and the failure is not cached.
  const down = harness({ openLibrary: fakeOpenLibrary({ fail: true }) });
  const b = await related(down.app, 'v1:openlibrary:OL100W');
  assert.deepEqual([b.status, b.body], [200, { books: [], partial: true }]);
  await related(down.app, 'v1:openlibrary:OL100W');
  assert.equal(down.openLibrary.count('work'), 2, 'a failure is not cached');
  // Open Library never answers: the reply still comes by the deadline.
  const slow = harness({ openLibrary: fakeOpenLibrary({ hang: true }), deadlineMs: 300 });
  const startedAt = Date.now();
  const d = await related(slow.app, 'v1:openlibrary:OL100W');
  assert.deepEqual([d.status, d.body, d.headers['cache-control']], [200, { books: [], partial: true }, 'no-store']);
  assert.ok(Date.now() - startedAt < 1500, `answered in ${Date.now() - startedAt} ms`);
});

test('the anonymous log gets counts only, from the app: the books opened and saved; nothing when it is off', async () => {
  const openLibrary = fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: [relatedWork(201)] } });
  const { app, logged } = harness({ openLibrary, usageLogEnabled: true });
  const response = await request(app).get('/api/v2/suggestions/related').query({ book: 'v1:openlibrary:OL100W' })
    .set('User-Agent', 'Synthetic-Agent/1.0').set('X-Forwarded-For', '203.0.113.7');
  assert.equal(response.status, 200);
  await new Promise(resolve => setImmediate(resolve));
  // The related list itself writes nothing, and neither do "shown" reports.
  assert.deepEqual(logged, []);
  assert.equal((await event(app, { event: 'shown', bookKeys: ['v1:openlibrary:OL201W'] }).set('X-Forwarded-For', '203.0.113.7')).status, 400);
  await event(app, { event: 'opened', bookKey: 'v1:openlibrary:OL201W' }).set('X-Forwarded-For', '203.0.113.7');
  await event(app, { event: 'saved', bookKey: 'v1:openlibrary:OL201W' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(logged.map(row => [row.kind, row.bookKey, row.outcome]),
    [['suggestion', 'v1:openlibrary:OL201W', 'opened'], ['suggestion', 'v1:openlibrary:OL201W', 'saved']]);
  for (const row of logged) {
    assert.deepEqual([row.queryText, row.libraryId, row.resultCount, row.foundCount, row.source, row.durationMs, row.appVersion], [null, null, null, null, null, null, null]);
  }
  const stored = JSON.stringify(logged);
  for (const secret of ['203.0.113.7', 'Synthetic-Agent', 'OL100W']) assert.ok(!stored.includes(secret), secret);
  // A refused event logs nothing.
  await event(app, { event: 'opened', bookKey: 'v1:catalog:koha:test-library:1' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(logged.length, 2);

  const off = harness({ openLibrary: fakeOpenLibrary() });
  await related(off.app, 'v1:openlibrary:OL1W');
  await event(off.app, { event: 'opened', bookKey: 'v1:openlibrary:OL1W' });
  await event(off.app, { event: 'saved', bookKey: 'v1:openlibrary:OL1W' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(off.logged, []);
});

test('the router never writes the address or the request body to platform logs or telemetry', async () => {
  const telemetry = createRedactedTelemetrySink();
  const { app } = harness({ telemetry, openLibrary: fakeOpenLibrary({ fail: true }) });
  const printed = [];
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const original = Object.fromEntries(methods.map(name => [name, console[name]]));
  for (const name of methods) console[name] = (...args) => { printed.push(args.map(String).join(' ')); };
  try {
    await related(app, 'v1:openlibrary:OL777W');
    await request(app).get('/api/v2/suggestions/related?book=v1:openlibrary:OL888W&extra=OL999W');
    await event(app, { event: 'opened', bookKey: 'v1:openlibrary:OL666W' });
    await event(app, { event: 'saved', bookKey: 'v1:openlibrary:OL555W' });
  } finally { Object.assign(console, original); }
  assert.deepEqual(printed, []);
  const events = JSON.stringify(telemetry.events());
  for (const value of ['OL777W', 'OL888W', 'OL999W', 'OL666W', 'OL555W']) assert.ok(!events.includes(value), value);
  assert.deepEqual(telemetry.events().map(item => [item.operation, item.outcome]),
    [['suggestions_related', '200'], ['suggestions_related', '400'], ['suggestion_event', '202'], ['suggestion_event', '202']]);
});

test('subjects: tags are never used; broad subjects only with a place', () => {
  for (const subject of ['Accessible book', 'Protected DAISY', 'In library', 'Large type books', 'nyt:combined-print=2008', 'Reading Level-Grade 11',
    'Open Library Staff Picks', 'Long Now Manual for Civilization', '1947', 'Internet Archive Wishlist']) assert.equal(isJunkSubject(subject), true, subject);
  for (const subject of ['Fiction', 'Biography', 'History', 'Juvenile fiction', 'Fiction, general']) {
    assert.deepEqual([isJunkSubject(subject), isBroadSubject(subject)], [false, true], subject);
  }
  for (const subject of ['Rocketry', 'Indian fiction (English)', 'Presidents', 'Space flight']) {
    assert.deepEqual([isJunkSubject(subject), isBroadSubject(subject)], [false, false], subject);
  }
});

test('the related query: subject and place, else two specific subjects, never one subject alone', () => {
  // With a place: the first subject that is not a tag, broad or not, in the first place.
  assert.equal(relatedQuery({ subjects: ['Accessible book', 'Biography', 'Presidents', 'Scientists'], places: ['India', 'Tamil Nadu'] }), 'subject:"Biography" place:"India"');
  assert.equal(relatedQuery({ subjects: ['Fiction'], places: ['India'] }), 'subject:"Fiction" place:"India"');
  // Without one: the first two specific subjects together.
  assert.equal(relatedQuery({ subjects: ['Biography', 'Presidents', 'Fiction', 'Scientists'], places: [] }), 'subject:"Presidents" subject:"Scientists"');
  // Fewer than two specific subjects and no place, or no usable subject: no query.
  for (const value of [{ subjects: ['Presidents', 'Biography', 'Fiction'] }, { subjects: ['Rocketry', 'rocketry'] }, { subjects: [] }, { subjects: ['Accessible book'], places: ['India'] },
    { subjects: [], places: ['India'] }, {}]) assert.equal(relatedQuery(value), null, JSON.stringify(value));
  // Quotes in a subject cannot break out of the phrase.
  assert.equal(relatedQuery({ subjects: ['Say "hi" \\ now', 'B side'] }), 'subject:"Say hi now" subject:"B side"');
  // Never a single-subject query, whatever the work holds.
  const pool = ['Fiction', 'Biography', 'Accessible book', 'Presidents', 'Scientists', 'Rocketry', 'nyt:x', 'History'];
  for (let mask = 0; mask < 2 ** pool.length; mask += 1) {
    const subjects = pool.filter((_, index) => mask & (1 << index));
    for (const places of [[], ['India']]) {
      const query = relatedQuery({ subjects, places });
      assert.ok(query === null || /^subject:"[^"]+" (place|subject):"[^"]+"$/.test(query), `${subjects} ${places}: ${query}`);
    }
  }
});

test('records: a work record and a search doc give the same title, subjects, places and author keys', () => {
  assert.deepEqual(parseWorkRecord({ title: 'Wings of Fire', subjects: ['Biography'], subject_places: ['India'], authors: [{ author: { key: '/authors/OL101656A' } }, { author: {} }] }, 'OL1037811W'),
    { workId: 'OL1037811W', title: 'Wings of Fire', subjects: ['Biography'], places: ['India'], authorKeys: ['OL101656A'] });
  assert.deepEqual(parseWorkRecord({ key: '/works/OL1W', title: 'One', subject: ['Fiction'], place: ['Kerala'], author_key: ['OL2A', 'bad'] }),
    { workId: 'OL1W', title: 'One', subjects: ['Fiction'], places: ['Kerala'], authorKeys: ['OL2A'] });
  assert.deepEqual(parseWorkRecord({}), { title: '', subjects: [], places: [], authorKeys: [] });
});

test('deny-lists: nothing for adults or naming extremism, in a title or a subject; one work per title', () => {
  const doc = (n, title, subject = []) => ({ key: `/works/OL${n}W`, title, author_name: ['Author ' + n], cover_i: n, subject, readinglog_count: 100 });
  const kept = parseSubjectWorks({ docs: [doc(1, 'Mein Kampf', ['National socialism', 'Germany']), doc(2, 'The Rise of the Nazi Party'), doc(3, 'A History', ['Antisemitism']),
    doc(4, 'White Supremacy Explained'), doc(5, 'Neo-Nazis in Europe'), doc(6, 'Ignited Minds'), doc(7, 'Ignited minds'), doc(8, 'Ignited  Minds!'), doc(9, 'India 2020', ['India'])] });
  assert.deepEqual(kept.map(book => book.title), ['Ignited Minds', 'India 2020']);
  assert.equal(blockedBook('Wings of Fire', ['Biography']), false);
  assert.equal(blockedBook('Diary', ['World War, 1939-1945', 'Anti-Semitism']), true);
});

test('Open Library answers are read defensively: works need a cover and an author', () => {
  const readers = { readinglog_count: 30 };
  assert.deepEqual(parseSubjectWorks({ docs: [{ key: '/works/OL1W', title: 'A', author_name: ['X'], cover_i: 5, ...readers }, { key: '/works/OL2W', title: 'No cover', author_name: ['Y'], ...readers },
    { key: '/works/OL3W', title: 'No author', cover_i: 6, ...readers }, { key: '/books/OL4M', title: 'Edition', author_name: ['Z'], cover_i: 7, ...readers }] }),
  [{ bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W', title: 'A', authors: ['X'], coverUrl: cover(5) }]);
});

test(`list works need at least ${MIN_SUGGESTED_READERS} readers on Open Library; a missing count is none`, () => {
  assert.equal(MIN_SUGGESTED_READERS, 25);
  const doc = (n, readers) => ({ key: `/works/OL${n}W`, title: 'Book ' + n, author_name: ['Author ' + n], cover_i: n, ...(readers === undefined ? {} : { readinglog_count: readers }) });
  assert.deepEqual(parseSubjectWorks({ docs: [doc(1, 548), doc(2, 25), doc(3, 24), doc(4, 0), doc(5), doc(6, '30'), doc(7, -40), doc(8, 'many')] }).map(book => book.workId),
    ['OL1W', 'OL2W', 'OL6W']);
});

test('one work per title: case, punctuation and a leading The/A/An are ignored, the most-read first; titles stay as Open Library gives them', async () => {
  const doc = (n, title, readers, extra = {}) => ({ key: `/works/OL${n}W`, title, author_name: ['Author ' + n], cover_i: n, readinglog_count: readers, ...extra });
  const kept = parseSubjectWorks({ docs: [
    // Open Library's main record of Gandhi's book and a small import, as on 24 November 2026.
    doc(298031, 'An autobiography', 548, { subtitle: 'the story of my experiments with truth' }),
    doc(1, 'The Story of My Experiments with Truth', 60), doc(2, 'Story of My Experiments with Truth', 30),
    doc(3, 'A Suitable Boy', 286), doc(4, 'Suitable Boy', 40), doc(5, 'The Guide', 65), doc(6, 'An Guide', 30),
    // Only a leading article followed by a word goes: "Theory" stays, and "The" or "A" alone is a title.
    doc(7, 'Theory', 50), doc(8, 'The', 50), doc(9, 'A', 50) ] });
  assert.deepEqual(kept.map(book => book.title), ['An autobiography', 'The Story of My Experiments with Truth', 'A Suitable Boy', 'The Guide', 'Theory', 'The', 'A']);
  // The title is Open Library's own: no subtitle is added to it.
  assert.equal(kept[0].title, 'An autobiography');
  // Through the route: never the book itself or its title with or without "The"; across lists, the first wins.
  const openLibrary = fakeOpenLibrary({ works: { [work(100)]: record(100, { subjects: ['Rocketry'], places: ['India'], title: 'The discovery of India' }) },
    authors: { OL100A: [{ ...relatedWork(201), title: 'Discovery of India' }, { ...relatedWork(202), title: 'The Glimpses' }] },
    related: { [ROCKETRY_IN_INDIA]: [{ ...relatedWork(203), title: 'Glimpses' }, { ...relatedWork(204), title: 'A Suitable Boy' }] } });
  assert.deepEqual((await related(harness({ openLibrary }).app, 'v1:openlibrary:OL100W')).body.books.map(book => book.title), ['The Glimpses', 'A Suitable Boy']);
});

// The related list for The Discovery of India (subject:"Civilización"
// place:"India") as Open Library gave it on 24 November 2026: most of it is
// works a few readers have logged, which filled the suggestion slots ahead of
// the reader's other books' lists.
const CIVILIZATION_INDIA = JSON.parse(readFileSync(new URL('../test/fixtures/suggestions/subject-civilization-india.json', import.meta.url), 'utf8')).response;

test('the reader floor on a real list: only Sapiens and the book itself pass; the book itself is never suggested', async () => {
  assert.equal(CIVILIZATION_INDIA.docs.length, 16);
  const parsed = parseSubjectWorks(CIVILIZATION_INDIA);
  assert.deepEqual(parsed.map(book => book.title), ['Sapiens', 'The discovery of India']);
  const openLibrary = fakeOpenLibrary({ works: { OL296039W: { workId: 'OL296039W', title: 'The discovery of India', subjects: ['Civilización'], places: ['India'], authorKeys: ['OL741A'] } },
    related: { 'subject:"Civilización" place:"India"': parsed } });
  assert.deepEqual((await related(harness({ openLibrary }).app, 'v1:openlibrary:OL296039W')).body.books.map(book => book.title), ['Sapiens']);
});

test('Suggestions skip books for adults, and related books need a title in Latin letters', () => {
  const doc = (n, extra) => ({ key: `/works/OL${n}W`, author_name: ['Author ' + n], cover_i: n, readinglog_count: 100, ...extra });
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

// R. K. Narayan's most-read works as Open Library gave them on 17 November 2026
// (author_name trimmed to 24 names): two "Prentice Hall Literature" school
// anthologies came back among his novels after viewing Malgudi Days.
const NARAYAN = JSON.parse(readFileSync(new URL('../test/fixtures/suggestions/author-rk-narayan.json', import.meta.url), 'utf8')).response;

test('anthologies and textbooks: the Prentice Hall anthologies after Malgudi Days are left out; Narayan’s novels stay', async () => {
  const prenticeHall = NARAYAN.docs.filter(doc => /^Prentice Hall Literature/.test(doc.title));
  assert.equal(prenticeHall.length, 2);
  assert.ok(prenticeHall.every(doc => doc.author_name.length > 20), 'each lists dozens of authors');
  assert.ok(prenticeHall.every(doc => doc.readinglog_count >= MIN_SUGGESTED_READERS), 'the anthology rule, not the reader floor, leaves them out');
  const parsed = parseSubjectWorks(NARAYAN);
  assert.deepEqual(parsed.map(book => book.title), ['Malgudi days', 'Swami and Friends', 'The painter of signs', 'The English teacher', 'The Guide',
    'The dark room', 'The vendor of sweets']);
  // Through the route: the viewed book's author list as parsed, never an anthology, never the book itself.
  const openLibrary = fakeOpenLibrary({ works: { OL1057177W: { workId: 'OL1057177W', title: 'Malgudi days', subjects: ['India', 'fiction', 'classics'], places: [],
    authorKeys: ['OL5911201A'] } }, authors: { OL5911201A: parsed } });
  const response = await related(harness({ openLibrary }).app, 'v1:openlibrary:OL1057177W');
  assert.deepEqual(response.body.books.map(book => book.title), ['Swami and Friends', 'The painter of signs', 'The English teacher', 'The Guide', 'The dark room',
    'The vendor of sweets']);
  // The route checks every list again (as for covers and authors): an anthology from any list is dropped.
  const raw = fakeOpenLibrary({ works: RECENT, related: { [ROCKETRY_IN_INDIA]: [
    { ...relatedWork(401), authors: ['A', 'B', 'C', 'D'] }, { ...relatedWork(402), title: 'Prentice Hall Literature Grade 8' }, relatedWork(403)] } });
  assert.deepEqual(keys(await related(harness({ openLibrary: raw }).app, 'v1:openlibrary:OL100W')), ['v1:openlibrary:OL403W']);
});

test('anthologies and textbooks: more than three authors, or a title naming a collection or school book; near-miss titles stay', () => {
  const one = ['Some Author'];
  // More than three different authors; three is still a book.
  assert.equal(collectionOrTextbook('Stories', ['A', 'B', 'C', 'D']), true);
  assert.equal(collectionOrTextbook('Good Omens', ['Terry Pratchett', 'Neil Gaiman']), false);
  assert.equal(collectionOrTextbook('Three Hands', ['A', 'B', 'C']), false);
  assert.equal(collectionOrTextbook('Same Name Twice', ['A', 'a', 'B', 'C']), false);
  for (const title of [
    'Prentice Hall Literature--Timeless Voices, Timeless Themes--Gold Level', 'Prentice Hall Literature Grade 8', 'Prentice Hall Literature, Penguin Edition, Grade 10',
    'The Norton Anthology of English Literature', 'An Anthology of Indian Poetry', 'Anthologies for Young Readers',
    'Mathematics Textbook for Class 10', 'NCERT Science Class 7', 'English Workbook', 'Spelling Work Book Grades K-2', 'Text Book of Botany',
    'Grade 5 Reading Comprehension', 'Elements of Literature: Third Course', 'Literature, Silver Level',
    'Penguin Readers Level 2: The Railway Children', 'Level 3 Reader: Animals', 'Holt Literature and Language Arts, Student Edition',
    "Literature: Teacher's Edition", 'Teachers’ Edition: World History', "Annotated Teacher's Edition",
  ]) assert.equal(collectionOrTextbook(title, one), true, title);
  for (const title of [
    'The Reader', 'Reading Lolita in Tehran', 'A Grade of Gold', 'Sixth Grade Secrets', 'The English Teacher', 'Teacher Man', 'The Anthologist',
    'Level 26: Dark Origins', 'A Class Apart', 'First Class Murder', 'The Class', 'Malgudi Days', 'The Literature Police', 'The Student',
    'The Book Thief', 'Wings of Fire', 'Classic Stories', 'The Text', 'Class of 1999', 'The Reader’s Edition',
  ]) assert.equal(collectionOrTextbook(title, one), false, title);
});
