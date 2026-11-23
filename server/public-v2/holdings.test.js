import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { makeTestApp } from '../test/helpers.js';
import { createCatalogBookKey } from './contracts.js';
import { createPublicV2Router } from './router.js';
import { createPublicBookService } from './metadata.js';
import { answerReason } from './holdings.js';
import { createCatalogStore } from '../catalog-store/index.js';
import { readCatalogStoreConfig } from '../catalog-store/config.js';
import { createCatalogPolicy } from '../catalog-store/policy.js';
import { createCheckBudget } from '../catalog-store/checkBudget.js';
import { createCatalogLookup, createLookupRecorder, PLATFORMS } from '../services/catalog-lookup/index.js';
import { catalogOperation } from '../services/providers/http.js';
import shippedPolicies from '../data/catalog-policies.json' with { type: 'json' };

const UNPACED = Object.fromEntries(Object.entries(PLATFORMS).map(([id, value]) => [id, { ...value, minIntervalMs: 0 }]));
const vega = { id: 'vega:test', platform: 'vega', catalogUrl: 'https://catalog.example/' };
const optedOut = { id: 'vega:optout', platform: 'vega', catalogUrl: 'https://optout.example/' };
const biblio = { id: 'bc:sfpl', platform: 'bc', slug: 'sfpl', catalogUrl: 'https://sfpl.bibliocommons.com/' };
const publicOf = entry => ({ id: entry.id, name: 'Test Library', catalogUrl: entry.catalogUrl,
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } });
const entries = new Map([vega, optedOut, biblio].map(entry => [entry.id, entry]));
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
  searchCapMs, backgroundChecksEnabled = true, finishInBackground = false, bookDeadlineMs, functionWorkMs, searches = null, bookService = books, checkLimits = null } = {}) {
  const pending = [];
  const defer = task => { pending.push(Promise.resolve().then(task).catch(() => {})); };
  const logged = [];
  const counted = [];
  const calls = [];
  const config = { ...readCatalogStoreConfig({}), usageLogEnabled, backgroundChecksEnabled };
  const built = createCatalogStore({ config, db: null, defer, usageSink: row => logged.push(row), outcomeSink: row => counted.push(row), policy: createCatalogPolicy({ policies }) });
  const store = checkLimits ? { ...built, checkBudget: createCheckBudget({ limits: checkLimits }) } : built;
  const provider = { checkAvailability: async isbn => { calls.push(isbn); return observe(isbn); }, ...(searches || {}) };
  const platforms = bookDeadlineMs ? { ...UNPACED, vega: { ...UNPACED.vega, book: { ...UNPACED.vega.book, deadlineMs: bookDeadlineMs } } } : UNPACED;
  const lookup = createCatalogLookup({ providerFor: () => provider, robots: null, platforms, env: {}, ...(finishInBackground ? { defer } : {}),
    recorder: createLookupRecorder({ answers: store.answers, health: store.health, policyFor: store.policyFor, defer }), hostGate: store.hostGate });
  const app = makeTestApp(express => {
    express.set('trust proxy', 1);
    express.use('/api/v2', createPublicV2Router({ directory, books: bookService, catalogStore: store, lookup, rateLimit: { limit: 1000 },
      holdingsOptions: { ...(searchCapMs ? { searchCapMs } : {}), ...(functionWorkMs ? { functionWorkMs } : {}) } }));
  });
  return { app, store, calls, logged, counted, settle: async () => { while (pending.length) await Promise.all(pending.splice(0)); } };
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

test('a found answer lists the library\'s matching catalog rows: title and author as the catalog shows them, a record link only on its own catalog', async () => {
  const held = { outcome: 'in_catalog' };
  const searched = [];
  const searches = {
    search: async term => { searched.push(term); return [
      { title: 'Wings of fire : an autobiography', authors: ['Kalam, A. P. J. Abdul', 'Tiwari, Arun'], catalogUrl: 'https://catalog.example/record/7', catalogLinkKind: 'record', observation: held },
      { title: 'Wings of Fire #07', authors: ['Sutherland, Tui T.'], catalogUrl: 'https://elsewhere.example/record/8', catalogLinkKind: 'record', observation: held },
      { title: 'Wing Of Fire', authors: [], observation: held }]; },
  };
  const { app, logged } = harness({ searches, usageLogEnabled: true });
  const reply = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.deepEqual(searched, ['Wings of Fire']);
  assert.equal(reply.body.answer, 'found');
  assert.deepEqual(reply.body.matches, [
    { title: 'Wings of fire : an autobiography', author: 'Kalam, A. P. J. Abdul; Tiwari, Arun', url: 'https://catalog.example/record/7' },
    { title: 'Wings of Fire #07', author: 'Sutherland, Tui T.' },
  ]);
  assert.deepEqual([reply.body.catalogUrl, reply.body.catalogLinkKind], ['https://catalog.example/record/7', 'record']);
  // Catalog titles never go into the anonymous log.
  assert.ok(!JSON.stringify(logged).includes('Sutherland'));
});

test('a found answer links the book’s record only when the catalog said the link is its record, live and stored', async () => {
  const search = 'https://catalog.example/search?q=9788173711466';
  const record = 'https://catalog.example/record/7';
  for (const [observed, expectRecord] of [
    [{ catalogUrl: search, catalogLinkKind: 'search' }, false],
    [{ catalogUrl: 'https://catalog.example/' }, false],
    [{ catalogUrl: record, catalogLinkKind: 'record' }, true],
  ]) {
    const { app, calls, settle } = harness({ observe: () => ({ outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true, ...observed }) });
    for (const look of ['live', 'stored']) {
      const response = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
      assert.equal(response.body.answer, 'found');
      if (expectRecord) assert.deepEqual([response.body.catalogUrl, response.body.catalogLinkKind], [record, 'record'], look);
      else {
        assert.notEqual(response.body.catalogLinkKind, 'record', `${look}: ${observed.catalogUrl}`);
        assert.notEqual(response.body.catalogUrl, observed.catalogUrl === search ? search : undefined);
      }
      await settle();
    }
    assert.equal(calls.length, 1, 'the second look is a store read');
  }
});

test('a timed-out check is unknown, stores no answer and writes one health event', async () => {
  const { app, store, calls, settle } = harness({ observe: () => { throw Object.assign(new Error('slow'), { code: 'CATALOG_TIMEOUT' }); } });
  const response = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(response.body.answer, 'unknown');
  assert.equal(response.body.reason, 'timeout');
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

test('an unknown answer says why: the reason the check could not answer, and never with found or not found', async () => {
  for (const [code, reason] of [['CATALOG_ROBOTS_DISALLOWED', 'blocked'], ['CATALOG_HOST_BUSY', 'busy'], ['CATALOG_UNSUPPORTED', 'unsupported'],
    ['CATALOG_UNAVAILABLE', 'unavailable'], ['CATALOG_UNRECOGNIZED', 'unrecognized'], ['CATALOG_REQUEST_BUDGET', 'budget']]) {
    const { app } = harness({ observe: () => { throw Object.assign(new Error('x'), { code }); } });
    const response = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
    assert.deepEqual([response.body.answer, response.body.reason], ['unknown', reason], code);
    assert.deepEqual(Object.keys(response.body).sort(), ['answer', 'catalogLinkKind', 'catalogUrl', 'reason'], code);
  }
  const { app, settle } = harness();
  for (const look of ['live', 'stored']) {
    const found = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
    assert.equal(found.body.answer, 'found', look);
    assert.equal('reason' in found.body, false, look);
    await settle();
  }
  // Every "unknown" names a reason: one that names none, or one the app does
  // not know, is "unavailable", as outcome.js couldntCheck() gives it.
  for (const answer of [null, {}, { outcome: 'couldnt_check' }, { outcome: 'couldnt_check', reason: 'surprise' }]) {
    assert.equal(answerReason('unknown', answer), 'unavailable', JSON.stringify(answer));
  }
  assert.equal(answerReason('unknown', { reason: 'details' }), 'details');
  for (const value of ['found', 'not_found']) assert.equal(answerReason(value, { reason: 'timeout' }), undefined, value);
});

// 23 November 2026: every live check of a BiblioCommons library from the
// California pages answered {"answer":"unknown"} with no reason, after about
// 10.7 s. The book's details (Open Library, for a work key with no ISBN) had
// failed, so the catalog was never asked and nothing said why. It is now
// `details`, the library's health is untouched, and the same check finds the
// book once its details can be read.
test('a no-store library check whose book details fail is unknown with reason "details", asks no catalog, and finds the book once they read', async () => {
  const searched = [];
  const rows = [{ title: 'The Hunger Games', authors: ['Collins, Suzanne'], catalogUrl: 'https://sfpl.bibliocommons.com/v2/record/S2', catalogLinkKind: 'record' }];
  const { app, store, logged, settle } = harness({ usageLogEnabled: true, policies: shippedPolicies,
    searches: { search: async term => { searched.push(term); return rows; } } });
  const bookKey = 'v1:openlibrary:OL5735363W';
  const original = books.resolve;
  let detailsUp = false;
  books.resolve = async key => {
    if (key !== bookKey) return original(key);
    if (!detailsUp) throw Object.assign(new Error('Book discovery is temporarily unavailable'), { code: 'BOOK_METADATA_UNAVAILABLE' });
    return { bookKey, workId: 'OL5735363W', title: 'The Hunger Games', authors: ['Suzanne Collins'] };
  };
  try {
    for (const libraryId of [biblio.id, vega.id]) {
      const failed = await request(app).post('/api/v2/holdings/check').send({ libraryId, bookKey });
      assert.deepEqual(failed.body, { answer: 'unknown', reason: 'details', catalogUrl: entries.get(libraryId).catalogUrl, catalogLinkKind: 'catalog' }, libraryId);
      await settle();
      assert.equal(await store.health.libraryHealth(libraryId), null, `${libraryId}: not the library's failure`);
    }
    assert.deepEqual(searched, [], 'no catalog is asked without the book\'s details');
    detailsUp = true;
    const found = await request(app).post('/api/v2/holdings/check').send({ libraryId: biblio.id, bookKey });
    assert.equal(found.body.answer, 'found');
    assert.equal('reason' in found.body, false);
    assert.deepEqual(searched, ['The Hunger Games']);
    await settle();
    assert.equal(store.answers.size(), 0, 'nothing stored for a BiblioCommons library');
    assert.deepEqual(logged.filter(row => row.libraryId === biblio.id).map(row => [row.bookKey, row.outcome]), [[null, 'unknown'], [null, 'found']]);
  } finally {
    books.resolve = original;
  }
});

// 23 November 2026: the California pages' books and the Indian shelf books
// have their title and authors in the repository (knownBooks.js), so their
// check asks the catalog without waiting on Open Library. Any other work is
// still resolved from Open Library first. The real book service is used here;
// the only network is a stub that counts Open Library reads.
test('a known book is checked by its committed title with no Open Library read; any other work still reads Open Library first', async () => {
  const unlisted = 'OL987654321W';
  const reads = [], searched = [];
  const original = global.fetch;
  global.fetch = async url => {
    const address = new URL(String(url));
    if (address.hostname !== 'openlibrary.org') throw new Error(`unexpected request to ${address.hostname}`);
    reads.push(address.pathname);
    const body = address.pathname === `/works/${unlisted}.json` ? { title: 'A Book Nobody Listed', authors: [] }
      : address.pathname === '/search.json' ? { docs: [{ key: `/works/${unlisted}`, title: 'A Book Nobody Listed', author_name: ['A. Writer'] }] } : null;
    return new Response(JSON.stringify(body || {}), { status: body ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  };
  const rows = [
    { title: 'To kill a mockingbird', authors: ['Lee, Harper'], catalogUrl: 'https://sfpl.bibliocommons.com/v2/record/S1', catalogLinkKind: 'record' },
    { title: 'A book nobody listed', authors: ['Writer, A.'], catalogUrl: 'https://sfpl.bibliocommons.com/v2/record/S2', catalogLinkKind: 'record' },
  ];
  const { app, store, settle } = harness({ bookService: createPublicBookService(), policies: shippedPolicies,
    searches: { search: async term => { searched.push(term); return rows; } } });
  try {
    // To Kill a Mockingbird (the US list and the shelf pool): found by its title.
    const known = await request(app).post('/api/v2/holdings/check').send({ libraryId: biblio.id, bookKey: 'v1:openlibrary:OL3140822W' });
    assert.equal(known.body.answer, 'found');
    assert.deepEqual(known.body.matches, [{ title: 'To kill a mockingbird', author: 'Lee, Harper', url: 'https://sfpl.bibliocommons.com/v2/record/S1' }]);
    // Braiding Sweetgrass, not in these rows: not found, and the catalog link
    // searches the title and author, never the list's one-edition ISBN.
    const missing = await request(app).post('/api/v2/holdings/check').send({ libraryId: biblio.id, bookKey: 'v1:openlibrary:OL16819897W' });
    assert.equal(missing.body.answer, 'not_found');
    assert.equal(missing.body.catalogUrl, 'https://sfpl.bibliocommons.com/search?query=Braiding+Sweetgrass+Robin+Wall+Kimmerer&searchType=keyword');
    assert.deepEqual(searched, ['To Kill a Mockingbird', 'Braiding Sweetgrass']);
    assert.deepEqual(reads, [], 'no Open Library read for a known book');

    const other = await request(app).post('/api/v2/holdings/check').send({ libraryId: biblio.id, bookKey: `v1:openlibrary:${unlisted}` });
    assert.equal(other.body.answer, 'found');
    assert.deepEqual(searched.slice(2), ['A Book Nobody Listed']);
    assert.ok(reads.includes(`/works/${unlisted}.json`), 'an unlisted work is resolved from Open Library');
    await settle();
    assert.equal(store.answers.size(), 0, 'nothing stored for a BiblioCommons library');
  } finally {
    global.fetch = original;
  }
});

test('a slow book-page check answers "unknown" now, finishes in the background and the next look reads it from the store', async () => {
  const slow = () => new Promise(resolve => setTimeout(() => resolve({ outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }), 150));
  const { app, calls, settle } = harness({ observe: slow, finishInBackground: true, bookDeadlineMs: 100 });
  const first = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(first.body.answer, 'unknown');
  await settle();
  const second = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(second.body.answer, 'found');
  assert.equal(calls.length, 1, 'the second look is a store read');

  // The kill switch also stops checks finishing in the background.
  const off = harness({ observe: slow, finishInBackground: true, bookDeadlineMs: 100, backgroundChecksEnabled: false });
  assert.equal((await request(off.app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` })).body.answer, 'unknown');
  await off.settle();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(off.store.answers.size(), 0);
});

test('a book-page check, background included, ends within the function’s time limit', async () => {
  let stopped = false;
  const never = () => new Promise((_, reject) => { catalogOperation()?.signal.addEventListener('abort', () => { stopped = true; reject(new Error('stopped')); }, { once: true }); });
  const { app, settle } = harness({ observe: never, finishInBackground: true, bookDeadlineMs: 200, functionWorkMs: 60 });
  const startedAt = Date.now();
  const response = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(response.body.answer, 'unknown');
  await settle();
  assert.equal(stopped, true);
  assert.ok(Date.now() - startedAt < 180, `work ended at ${Date.now() - startedAt} ms, not at the 200 ms check deadline`);
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

test('one ISBN not listed is "not found" for the book page that asked it; result marking never says not found for a work', async () => {
  const { app, settle } = harness({ observe: () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }) });
  // A catalog searched only by ISBN (Vega) that answers "not listed" for the
  // reader's ISBN: every search made was answered, nothing matched.
  const edition = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  assert.equal(edition.body.answer, 'not_found');
  assert.equal(edition.body.reason, undefined);
  await settle();
  const search = await request(app).post('/api/v2/holdings/search').buffer(true).parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); })
    .send({ libraryId: vega.id, query: 'matilda', books: [{ bookKey: 'v1:openlibrary:OL1W' }, { bookKey: 'v1:openlibrary:OL2W' }] });
  // Vega checks each result's ISBN: "not listed" for one ISBN of a work gives
  // no mark and leaves the work unchecked.
  assert.deepEqual(lines(search.body), [{ type: 'done', unchecked: ['v1:openlibrary:OL1W', 'v1:openlibrary:OL2W'], notFound: [], couldntCheck: [] }]);
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
    // The catalog's answer for OL1W's ISBN could not be read: couldn't check.
    { type: 'done', unchecked: ['v1:openlibrary:OL1W'], notFound: [], couldntCheck: ['v1:openlibrary:OL1W'] },
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
  // The catalog never answered: the run ends just before the response cap and
  // reports the book as "couldn't check" (never "not found").
  assert.deepEqual(lines(response.body), [{ type: 'done', unchecked: [`v1:isbn:${ISBN_A}`], notFound: [], couldntCheck: [`v1:isbn:${ISBN_A}`] }]);
  const off = harness({ backgroundChecksEnabled: false });
  const skipped = await request(off.app).post('/api/v2/holdings/search').buffer(true).parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); })
    .send({ libraryId: vega.id, query: 'wings', books: [{ bookKey: `v1:isbn:${ISBN_A}` }] });
  assert.deepEqual(lines(skipped.body), [{ type: 'done', unchecked: [`v1:isbn:${ISBN_A}`], notFound: [], couldntCheck: [] }]);
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
    assert.deepEqual(lines(response.text).at(-1), { type: 'done', unchecked: catalogKeys, notFound: [], couldntCheck: [] });
    assert.deepEqual(resolved, []);
  } finally {
    books.resolve = original;
  }
});

test('the book page reads a record key only for its own library, inside that library\'s catalog operation (no request cap)', async () => {
  const { app } = harness();
  const resolved = [];
  const original = books.resolve;
  books.resolve = async key => { resolved.push({ key, cap: catalogOperation()?.maxRequests ?? null }); return original(key); };
  try {
    // Another library's record: not read, and answered "couldn't check".
    const other = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: createCatalogBookKey('koha:other', '1') });
    assert.equal(other.status, 200);
    assert.equal(other.body.answer, 'unknown');
    assert.equal(other.body.reason, 'unsupported');
    assert.deepEqual(resolved, []);
    // This library's own record: read inside a catalog operation (its host
    // slot, pacing and deadline), with no request cap: a reader's tap.
    const own = createCatalogBookKey(vega.id, '7');
    await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: own });
    assert.deepEqual(resolved, [{ key: own, cap: Infinity }]);
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
  assert.equal((await send({ text: 'Valid', email: 'not an email' })).status, 400);
  await settle();
  // The second text was the same request from the same address today: not counted again.
  assert.deepEqual(store.submissions.held().requests.map(item => [item.requestKey, item.displayText, item.count]),
    [['anna centenary library', 'Anna Centenary Library', 1]]);
  for (let i = 0; i < 3; i += 1) assert.equal((await send({ text: `Library ${String.fromCharCode(65 + i)}` })).status, 202);
  assert.equal((await send({ text: 'One too many' })).status, 429);
  assert.equal((await send({ text: 'Another address', name: 'Asha', email: 'reader@example.org' }, '198.51.100.9')).status, 202);
  await settle();
  assert.deepEqual(store.submissions.held().requestContacts.map(item => [item.requestKey, item.name, item.email]),
    [['another address', 'Asha', 'reader@example.org']]);

  const report = body => request(app).post('/api/v2/problem-reports').set('X-Forwarded-For', '192.0.2.1').send(body);
  assert.equal((await report({ text: 'The library badge is wrong', screen: 'book', libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}`, appVersion: '1.2.3' })).status, 202);
  // A NUL cannot be stored: refused rather than accepted and silently lost.
  for (const body of [{ text: '' }, { text: 'x'.repeat(2001) }, { text: 'ok', screen: 'elsewhere' }, { text: 'ok', email: 'a@b' },
    { text: 'ok', email: 'a@b.co, c@d.co' }, { text: 'ok', name: 'n'.repeat(81) }, { text: 'ok', phone: '98765 43210' },
    { text: 'broken\u0000page' }, { text: 'see \u202Ethis' }]) {
    assert.equal((await report(body)).status, 400);
  }
  // A reader who wants a reply may leave a name and one email.
  assert.equal((await report({ text: 'Please write back', name: 'Asha', email: 'reader@example.org' })).status, 202);
  for (let i = 0; i < 3; i += 1) assert.equal((await report({ text: `report ${i}` })).status, 202);
  assert.equal((await report({ text: 'sixth' })).status, 429);
  await settle();
  const held = store.submissions.held().reports;
  assert.deepEqual(Object.keys(held[0]).sort(), ['appVersion', 'body', 'bookKey', 'createdOn', 'libraryId', 'screen']);
  assert.deepEqual(held[1].contact, { name: 'Asha', email: 'reader@example.org' });
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

test('result marking identifies results from the search that produced them, without resolving each work again', async () => {
  // A full resolution costs paced Open Library reads per book (about two
  // seconds each): nine of them used to outlast the wait, and a book without
  // an identity is never matched.
  const config = { ...readCatalogStoreConfig({}), backgroundChecksEnabled: true };
  const store = createCatalogStore({ config, db: null, defer: () => {}, policy: createCatalogPolicy({ policies: { schemaVersion: 1, libraries: {} } }) });
  const rowsLibrary = { id: 'vufind:rows', platform: 'vufind', catalogUrl: 'https://rows.example/' };
  const rowsDirectory = { ...directory, resolve: id => (id === rowsLibrary.id ? publicOf(rowsLibrary) : null), entry: id => (id === rowsLibrary.id ? rowsLibrary : null) };
  const provider = { checkAvailability: async () => ({}), search: async () => [{ recordId: 'R1', title: 'Matilda', authors: ['Dahl, Roald'], isbn: ISBN_B,
    catalogUrl: 'https://rows.example/Record/R1', catalogLinkKind: 'record' }] };
  const lookup = createCatalogLookup({ providerFor: () => provider, robots: null, platforms: UNPACED, env: {},
    recorder: createLookupRecorder({ answers: store.answers, health: store.health, policyFor: store.policyFor, defer: () => {} }), hostGate: store.hostGate });
  const summaries = { 'v1:openlibrary:OL1W': known['v1:openlibrary:OL1W'], 'v1:openlibrary:OL2W': known['v1:openlibrary:OL2W'] };
  const fromSearch = { ...books, resolve: () => new Promise(() => {}), summary: async key => summaries[key] || null,
    searchProfile: async key => books.searchProfile(key) };
  const app = makeTestApp(express => {
    express.use('/api/v2', createPublicV2Router({ directory: rowsDirectory, books: fromSearch, catalogStore: store, lookup, rateLimit: { limit: 1000 },
      holdingsOptions: { searchCapMs: 2_000 } }));
  });
  const startedAt = Date.now();
  const response = await request(app).post('/api/v2/holdings/search')
    .send({ libraryId: rowsLibrary.id, query: 'matilda', books: [{ bookKey: 'v1:openlibrary:OL1W' }, { bookKey: 'v1:openlibrary:OL2W' }] });
  assert.ok(Date.now() - startedAt < 1_500, 'no wait on a full resolution');
  assert.deepEqual(lines(response.text), [
    // The mark carries the matching row's own record address.
    { type: 'mark', bookKey: 'v1:openlibrary:OL1W', answer: 'found', catalogUrl: 'https://rows.example/Record/R1', catalogLinkKind: 'record' },
    // No matching row is neither "not found" nor "couldn't check".
    { type: 'done', unchecked: ['v1:openlibrary:OL2W'], notFound: [], couldntCheck: [] },
  ]);
});

test('a mark carries a link only when the catalog said it is the book’s record, never a search or the catalog home', async () => {
  for (const [row, expected] of [
    [{ catalogUrl: 'https://rows.example/Search?q=matilda', catalogLinkKind: 'search' }, {}],
    [{ catalogUrl: 'https://rows.example/Record/R1' }, {}],
    [{ observation: { catalogUrl: 'https://rows.example/', catalogLinkKind: 'catalog' } }, {}],
    [{ observation: { catalogUrl: 'https://rows.example/Record/R1', catalogLinkKind: 'record' } }, { catalogUrl: 'https://rows.example/Record/R1', catalogLinkKind: 'record' }],
  ]) {
    const config = { ...readCatalogStoreConfig({}), backgroundChecksEnabled: true };
    const store = createCatalogStore({ config, db: null, defer: () => {}, policy: createCatalogPolicy({ policies: { schemaVersion: 1, libraries: {} } }) });
    const rowsLibrary = { id: 'vufind:rows', platform: 'vufind', catalogUrl: 'https://rows.example/' };
    const rowsDirectory = { ...directory, resolve: id => (id === rowsLibrary.id ? publicOf(rowsLibrary) : null), entry: id => (id === rowsLibrary.id ? rowsLibrary : null) };
    const provider = { checkAvailability: async () => ({}), search: async () => [{ recordId: 'R1', title: 'Matilda', authors: ['Dahl, Roald'], isbn: ISBN_B, ...row }] };
    const lookup = createCatalogLookup({ providerFor: () => provider, robots: null, platforms: UNPACED, env: {},
      recorder: createLookupRecorder({ answers: store.answers, health: store.health, policyFor: store.policyFor, defer: () => {} }), hostGate: store.hostGate });
    const app = makeTestApp(express => {
      express.use('/api/v2', createPublicV2Router({ directory: rowsDirectory, books, catalogStore: store, lookup, rateLimit: { limit: 1000 } }));
    });
    const response = await request(app).post('/api/v2/holdings/search').send({ libraryId: rowsLibrary.id, query: 'matilda', books: [{ bookKey: 'v1:openlibrary:OL1W' }] });
    assert.deepEqual(lines(response.text)[0], { type: 'mark', bookKey: 'v1:openlibrary:OL1W', answer: 'found', ...expected });
  }
});

test('the done line lists definite "not found" answers and books the catalog could not answer for, never an unmatched row', async () => {
  const stream = (app, body) => request(app).post('/api/v2/holdings/search').buffer(true)
    .parse((res, done) => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => done(null, text)); }).send(body);
  // Vega checks each result's ISBN: a book asked by its ISBN that is not
  // listed is a definite "not found"; an unreadable answer is "couldn't check".
  const { app } = harness({ observe: isbn => (isbn === ISBN_A ? { outcome: 'not_found', matchKind: 'none', recognizedExact: true }
    : isbn === ISBN_B ? { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true, catalogUrl: 'https://catalog.example/record/9', catalogLinkKind: 'record' }
      : { outcome: 'unknown', matchKind: null }) });
  const response = await stream(app, { libraryId: vega.id, query: 'q', books: [{ bookKey: `v1:isbn:${ISBN_A}` }, { bookKey: 'v1:openlibrary:OL1W' },
    { bookKey: 'v1:openlibrary:OL2W' }] });
  assert.deepEqual(lines(response.body), [
    { type: 'mark', bookKey: 'v1:openlibrary:OL1W', answer: 'found', catalogUrl: 'https://catalog.example/record/9', catalogLinkKind: 'record' },
    { type: 'done', unchecked: ['v1:openlibrary:OL2W'], notFound: [`v1:isbn:${ISBN_A}`], couldntCheck: ['v1:openlibrary:OL2W'] },
  ]);

  // A results search that fails: every book asked about is "couldn't check".
  const config = { ...readCatalogStoreConfig({}), backgroundChecksEnabled: true };
  const store = createCatalogStore({ config, db: null, defer: () => {}, policy: createCatalogPolicy({ policies: { schemaVersion: 1, libraries: {} } }) });
  const rowsLibrary = { id: 'vufind:down', platform: 'vufind', catalogUrl: 'https://down.example/' };
  const rowsDirectory = { ...directory, resolve: id => (id === rowsLibrary.id ? publicOf(rowsLibrary) : null), entry: id => (id === rowsLibrary.id ? rowsLibrary : null) };
  const failing = async () => { throw Object.assign(new Error('down'), { code: 'CATALOG_UNAVAILABLE' }); };
  const lookup = createCatalogLookup({ providerFor: () => ({ checkAvailability: async () => ({}), search: failing }), robots: null, platforms: UNPACED, env: {},
    recorder: createLookupRecorder({ answers: store.answers, health: store.health, policyFor: store.policyFor, defer: () => {} }), hostGate: store.hostGate });
  const down = makeTestApp(express => {
    express.use('/api/v2', createPublicV2Router({ directory: rowsDirectory, books, catalogStore: store, lookup, rateLimit: { limit: 1000 } }));
  });
  const failed = await stream(down, { libraryId: rowsLibrary.id, query: 'matilda', books: [{ bookKey: 'v1:openlibrary:OL1W' }] });
  assert.deepEqual(lines(failed.body), [{ type: 'done', unchecked: ['v1:openlibrary:OL1W'], notFound: [], couldntCheck: ['v1:openlibrary:OL1W'] }]);
});

test('a mark never carries a link off the library’s catalog address, or for a library that allows no links', async () => {
  const config = { ...readCatalogStoreConfig({}), backgroundChecksEnabled: true };
  const store = createCatalogStore({ config, db: null, defer: () => {}, policy: createCatalogPolicy({ policies: { schemaVersion: 1, libraries: {} } }) });
  const rowsLibrary = { id: 'vufind:links', platform: 'vufind', catalogUrl: 'https://rows.example/' };
  let allowLinks = true;
  const rowsDirectory = { ...directory, entry: id => (id === rowsLibrary.id ? rowsLibrary : null),
    resolve: id => (id === rowsLibrary.id ? { ...publicOf(rowsLibrary), capabilities: { ...publicOf(rowsLibrary).capabilities, catalogLink: allowLinks } } : null) };
  let url = 'https://elsewhere.example/Record/R1';
  const provider = { checkAvailability: async () => ({}), search: async () => [{ recordId: 'R1', title: 'Matilda', authors: ['Dahl, Roald'], isbn: ISBN_B, catalogUrl: url }] };
  const lookup = createCatalogLookup({ providerFor: () => provider, robots: null, platforms: UNPACED, env: {},
    recorder: createLookupRecorder({ answers: store.answers, health: store.health, policyFor: store.policyFor, defer: () => {} }), hostGate: store.hostGate });
  const app = makeTestApp(express => {
    express.use('/api/v2', createPublicV2Router({ directory: rowsDirectory, books, catalogStore: store, lookup, rateLimit: { limit: 1000 } }));
  });
  const marks = async query => lines((await request(app).post('/api/v2/holdings/search').send({ libraryId: rowsLibrary.id, query, books: [{ bookKey: 'v1:openlibrary:OL1W' }] })).text);
  assert.deepEqual((await marks('matilda one'))[0], { type: 'mark', bookKey: 'v1:openlibrary:OL1W', answer: 'found' });
  url = 'https://rows.example/Record/R1';
  allowLinks = false;
  assert.deepEqual((await marks('matilda two'))[0], { type: 'mark', bookKey: 'v1:openlibrary:OL1W', answer: 'found' });
});

// 20 November 2026: the library's deadline counts from the reader's tap, so
// a slow book resolution comes out of it instead of adding to the wait.
test('the book page answers within the library deadline from the request, however long the book took to resolve', async () => {
  const { app } = harness({ observe: () => new Promise(() => {}), bookDeadlineMs: 300 });
  const original = books.resolve;
  books.resolve = async key => { await new Promise(resolve => setTimeout(resolve, 200)); return original(key); };
  try {
    const started = Date.now();
    const reply = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
    const waited = Date.now() - started;
    assert.deepEqual([reply.body.answer, reply.body.reason], ['unknown', 'timeout']);
    // 300 ms from the request, not 200 ms of resolving plus 300 ms of checking.
    assert.ok(waited >= 280 && waited < 450, `${waited} ms`);
  } finally {
    books.resolve = original;
  }
});

// Owner decision, 23 November 2026: BiblioCommons' terms forbid storing
// availability (server/data/catalog-policies.json), so its libraries are
// checked live every time and nothing about a book is kept for them.
test('a no-store library (BiblioCommons): live every time, no stored answers for the shelf, live marks, no book key in the log', async () => {
  const searched = [];
  const rows = [{ title: 'Matilda', authors: ['Roald Dahl'], catalogUrl: 'https://sfpl.bibliocommons.com/v2/record/S1', catalogLinkKind: 'record' }];
  const { app, store, logged, settle } = harness({ usageLogEnabled: true, policies: shippedPolicies,
    searches: { search: async term => { searched.push(term); return rows; } } });
  // An answer stored before the rule is never served, nor used for the shelf.
  await store.answers.writeAnswers([{ libraryId: biblio.id, kind: 'ol_work', value: 'OL1W', answer: 'not_found', evidence: 'work_no_match', expiresAt: Date.now() + 60_000 }]);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const check = await request(app).post('/api/v2/holdings/check').send({ libraryId: biblio.id, bookKey: 'v1:openlibrary:OL1W' });
    assert.equal(check.body.answer, 'found');
    await settle();
  }
  assert.deepEqual(searched, ['Matilda', 'Matilda'], 'one live search per check');
  const shelf = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: biblio.id, books: [{ bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W' }] });
  assert.deepEqual(shelf.body, { answers: {} });
  // The search-list mark comes from the live search, with no rows kept for the book page.
  const marks = await request(app).post('/api/v2/holdings/search').send({ libraryId: biblio.id, query: 'matilda', books: [{ bookKey: 'v1:openlibrary:OL1W' }] });
  assert.deepEqual(lines(marks.text).map(line => [line.type, line.answer]), [['mark', 'found'], ['done', undefined]]);
  await request(app).post('/api/v2/holdings/check').send({ libraryId: biblio.id, bookKey: 'v1:openlibrary:OL1W' });
  await settle();
  assert.equal(searched.length, 4);
  // Nothing new was written: only the old row is there, and it is never read.
  const kept = await store.answers.readAnswers(biblio.id, [{ kind: 'ol_work', value: 'OL1W' }, { kind: 'isbn13', value: ISBN_B }]);
  assert.deepEqual(kept.map(row => row.answer), ['not_found']);
  // The log keeps the library and the outcome, never the book or a found count.
  const own = logged.filter(row => row.libraryId === biblio.id);
  assert.deepEqual(own.map(row => [row.kind, row.bookKey, row.outcome]), [['book_check', null, 'found'], ['book_check', null, 'found'],
    ['result_marks', null, 'done'], ['book_check', null, 'found']]);
  assert.equal(own.find(row => row.kind === 'result_marks').foundCount, null);
  // Other libraries are unchanged: the answer is stored and the log names the book.
  const other = await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: 'v1:openlibrary:OL1W' });
  assert.equal(other.body.answer, 'found');
  await settle();
  assert.equal((await request(app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: 'v1:openlibrary:OL1W' })).body.answer, 'found');
  assert.equal(searched.length, 5, 'the second vega check is the stored answer');
  assert.ok(logged.some(row => row.libraryId === vega.id && row.kind === 'book_check' && row.bookKey === 'v1:openlibrary:OL1W'));
  const vegaShelf = await request(app).post('/api/v2/holdings/lookup').send({ libraryId: vega.id, books: [{ bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W' }] });
  assert.deepEqual(vegaShelf.body, { answers: { 'v1:openlibrary:OL1W': 'found' } });
});

// USA plan, section 10 ("Abuse"): the tap-to-check pages let anyone make our
// server call a small library, so live checks have a budget per library and
// per client. Over it: "couldn't check" (busy), and the catalog is not asked.
test('the book check has a budget per library and per client; over it the answer is busy and the catalog is not asked', async () => {
  const { app, calls, settle } = harness({ checkLimits: { perLibraryPerMinute: 2, perClientPerMinute: 10, perClientPerDay: 100 } });
  const check = (bookKey, ip = '203.0.113.20') => request(app).post('/api/v2/holdings/check').set('X-Forwarded-For', ip).send({ libraryId: vega.id, bookKey });
  assert.equal((await check(`v1:isbn:${ISBN_A}`)).body.answer, 'found');
  assert.equal((await check('v1:openlibrary:OL1W', '198.51.100.20')).body.answer, 'found');
  await settle();
  const busy = await check('v1:openlibrary:OL2W', '192.0.2.20');
  assert.deepEqual([busy.body.answer, busy.body.reason], ['unknown', 'busy']);
  assert.equal(calls.length, 2, 'the third live check never reached the catalog');
  // A stored answer asks no catalog and is not counted against the budget.
  assert.equal((await check(`v1:isbn:${ISBN_A}`)).body.answer, 'found');
  assert.equal(calls.length, 2);
  // Another library has its own budget.
  const other = await request(app).post('/api/v2/holdings/check').send({ libraryId: optedOut.id, bookKey: 'v1:openlibrary:OL2W' });
  assert.equal(other.body.answer, 'found');

  const client = harness({ checkLimits: { perLibraryPerMinute: 100, perClientPerMinute: 1, perClientPerDay: 100 } });
  const ask = (bookKey, ip) => request(client.app).post('/api/v2/holdings/check').set('X-Forwarded-For', ip).send({ libraryId: vega.id, bookKey });
  assert.equal((await ask(`v1:isbn:${ISBN_A}`, '203.0.113.30')).body.answer, 'found');
  assert.equal((await ask('v1:openlibrary:OL1W', '203.0.113.30')).body.reason, 'busy');
  assert.equal((await ask('v1:openlibrary:OL1W', '203.0.113.31')).body.answer, 'found', 'another client is not limited');
  assert.equal(client.calls.length, 2);
});

test('the client budget keeps no address: only keyed digests of the address and the day, as the submission limits do', async () => {
  const taken = [];
  const budget = createCheckBudget({ secret: 's'.repeat(32), db: { query: async (sql, [buckets, seconds]) => {
    taken.push({ sql, buckets, seconds });
    return { rows: buckets.map(bucket => ({ bucket, count: 1 })) };
  } } });
  assert.equal(await budget.take({ libraryId: vega.id, address: '203.0.113.40' }), 'ok');
  assert.equal(taken.length, 1, 'one statement for the three buckets');
  assert.deepEqual(taken[0].seconds, [60, 60, 86_400]);
  for (const bucket of taken[0].buckets) {
    assert.equal(bucket.length, 32);
    assert.ok(!bucket.toString('latin1').includes('203.0.113.40'));
  }
  assert.ok(!taken[0].sql.includes('203.0.113.40') && /submission_buckets/.test(taken[0].sql));
  // The same address another day gives other digests.
  let day = Date.parse('2026-11-23T10:00:00Z');
  const seen = [];
  const daily = createCheckBudget({ secret: 's'.repeat(32), now: () => day, db: { query: async (sql, [buckets]) => { seen.push(buckets); return { rows: buckets.map(bucket => ({ bucket, count: 1 })) }; } } });
  await daily.take({ libraryId: vega.id, address: '203.0.113.40' });
  day += 24 * 60 * 60 * 1000;
  await daily.take({ libraryId: vega.id, address: '203.0.113.40' });
  assert.equal(seen[0][0].equals(seen[1][0]), true, 'the library bucket is the library');
  assert.equal(seen[0][1].equals(seen[1][1]), false);
  assert.equal(seen[0][2].equals(seen[1][2]), false);
  // A slow or failing store: this instance's limits apply, and the check is never blocked.
  const failing = createCheckBudget({ secret: 's'.repeat(32), limits: { perLibraryPerMinute: 1, perClientPerMinute: 5, perClientPerDay: 5 },
    db: { query: async () => { throw new Error('down'); } } });
  assert.equal(await failing.take({ libraryId: vega.id, address: 'a' }), 'ok');
  assert.equal(await failing.take({ libraryId: vega.id, address: 'b' }), 'library');
  // Over budget in the store: which budget is spent.
  const full = createCheckBudget({ secret: 's'.repeat(32), db: { query: async (sql, [buckets]) => ({ rows: buckets.map((bucket, index) => ({ bucket, count: index === 0 ? 21 : 1 })) }) } });
  assert.equal(await full.take({ libraryId: vega.id, address: 'c' }), 'library');
});

// Decision 17 (23 November 2026): the log may keep daily counts per library
// for no-store catalogs, with no book, no text and no reader.
test('every live book check adds to the library\'s daily outcome count, with no book, text or reader in it', async () => {
  const searched = [];
  const rows = [{ title: 'Matilda', authors: ['Roald Dahl'], catalogUrl: 'https://sfpl.bibliocommons.com/v2/record/S1', catalogLinkKind: 'record' }];
  const { app, counted, logged, settle } = harness({ usageLogEnabled: true, policies: shippedPolicies,
    checkLimits: { perLibraryPerMinute: 4, perClientPerMinute: 100, perClientPerDay: 100 },
    searches: { search: async term => { searched.push(term); if (term === 'Mockingjay') throw Object.assign(new Error('x'), { code: 'CATALOG_TIMEOUT' }); return rows; } } });
  const check = bookKey => request(app).post('/api/v2/holdings/check').set('X-Forwarded-For', '203.0.113.50').set('User-Agent', 'Private Agent')
    .send({ libraryId: biblio.id, bookKey });
  assert.equal((await check('v1:openlibrary:OL1W')).body.answer, 'found');
  assert.equal((await check(`v1:isbn:${ISBN_A}`)).body.answer, 'not_found');
  assert.equal((await check('v1:openlibrary:OL2W')).body.reason, 'timeout');
  assert.equal((await check('v1:openlibrary:OL1W')).body.answer, 'found');
  assert.equal((await check('v1:openlibrary:OL1W')).body.reason, 'busy');
  await settle();
  assert.deepEqual(counted, [
    { libraryId: biblio.id, operation: 'book_check', outcome: 'found', reason: '' },
    { libraryId: biblio.id, operation: 'book_check', outcome: 'not_found', reason: '' },
    { libraryId: biblio.id, operation: 'book_check', outcome: 'couldnt_check', reason: 'timeout' },
    { libraryId: biblio.id, operation: 'book_check', outcome: 'found', reason: '' },
    { libraryId: biblio.id, operation: 'book_check', outcome: 'couldnt_check', reason: 'busy' }]);
  for (const row of counted) assert.deepEqual(Object.keys(row).sort(), ['libraryId', 'operation', 'outcome', 'reason']);
  const text = JSON.stringify(counted);
  for (const value of ['OL1W', 'OL2W', ISBN_A, 'Matilda', 'Mockingjay', 'Wings', '203.0.113.50', 'Private Agent']) assert.ok(!text.includes(value), value);
  assert.ok(logged.length > 0);
  // A stored answer is not a check of the catalog today: not counted.
  const stored = harness({ usageLogEnabled: true });
  await request(stored.app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  await stored.settle();
  await request(stored.app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  await stored.settle();
  assert.deepEqual(stored.counted.map(row => row.outcome), ['found']);
  // Off with the operational log.
  const off = harness();
  await request(off.app).post('/api/v2/holdings/check').send({ libraryId: vega.id, bookKey: `v1:isbn:${ISBN_A}` });
  await off.settle();
  assert.deepEqual(off.counted, []);
});
