import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalogLookup, createLookupRecorder, createMemoryAnswerStore, createMemoryHealthRecord, createHostGuard, PLATFORMS } from './index.js';
import { cachedTask, clearHttpCache, getText } from '../providers/http.js';
import { clearEgranthalayaRefusals } from '../providers/egranthalaya.js';
import { createPublicAvailabilityService } from '../../public-v2/availability.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); clearEgranthalayaRefusals(); });
const read = (dir, name) => fs.readFileSync(new URL(`../../test/fixtures/${dir}/${name}`, import.meta.url), 'utf8');
const response = (url, body, { status = 200, headers = {} } = {}) => ({ ok: status >= 200 && status < 300, status, url,
  headers: new Headers(headers), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const coded = (message, code) => Object.assign(new Error(message), { code });

// Platform descriptors without pacing, so budget tests run quickly. Pacing has
// its own test in providers/robots.test.js.
const UNPACED = Object.fromEntries(Object.entries(PLATFORMS).map(([id, value]) => [id, { ...value, minIntervalMs: 0 }]));

function harness({ providerFor, answers = createMemoryAnswerStore(), health = createMemoryHealthRecord(), robots = null, guard = createHostGuard(), platforms = UNPACED } = {}) {
  const pending = [];
  const recorder = createLookupRecorder({ answers, health, defer: task => pending.push(task()) });
  const lookup = createCatalogLookup({ providerFor, recorder, robots, guard, platforms, env: { CATALOG_LOOKUP_V2: 'all' } });
  return { lookup, answers, health, guard, settle: () => Promise.all(pending) };
}

async function collect(iterable) {
  const items = [];
  for await (const item of iterable) items.push(item);
  return items;
}

const profileOf = ({ isbn13, isbns = [isbn13], title, authors = [], complete = true }) => ({
  book: { isbn13, title, authors }, isbns, titles: [title], authors, language: '', complete, expansionFailed: false });

// --- Book page: one interface, three outcomes --------------------------------

test('lookupBook projects provider observations to found, not found and couldn’t check', async () => {
  const cases = [
    [{ outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }, 'found'],
    [{ outcome: 'not_found', matchKind: 'none', recognizedExact: true }, 'not_found'],
    // A negative without parser proof is not an answer.
    [{ outcome: 'not_found', matchKind: 'none' }, 'couldnt_check'],
    [{ status: 'not_found' }, 'couldnt_check'],
    [{ outcome: 'available', matchKind: 'possible_match' }, 'couldnt_check'],
    [{ outcome: 'unknown', matchKind: null }, 'couldnt_check'],
  ];
  for (const [observation, outcome] of cases) {
    const { lookup } = harness({ providerFor: () => ({ checkAvailability: async () => observation }) });
    const answer = await lookup.lookupBook({ library: { id: 'koha:x', platform: 'koha', catalogUrl: 'https://c.example' },
      book: { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466' }, editionScope: 'exact' });
    assert.equal(answer.outcome, outcome, JSON.stringify(observation));
    assert.equal(answer.source, 'live');
  }
});

test('timeouts, refusals, unreadable pages and outages are couldn’t check, never not found, and count as health failures', async () => {
  const failures = {
    timeout: () => new Promise(() => {}),
    blocked: async () => { throw coded('refused', 'CATALOG_PROVIDER_BLOCKED'); },
    unrecognized: async () => { throw coded('page changed', 'CATALOG_UNRECOGNIZED'); },
    unavailable: async () => { throw new Error('ECONNRESET'); },
    configuration: async () => { throw coded('no key', 'CATALOG_CONFIGURATION_REQUIRED'); },
  };
  for (const [reason, checkAvailability] of Object.entries(failures)) {
    const { lookup, health, settle } = harness({ providerFor: () => ({ checkAvailability }) });
    const entry = { id: `vega:${reason}`, platform: 'vega', catalogUrl: 'https://v.example' };
    const answer = await lookup.lookupBook({ library: entry, book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact',
      deadlineAt: Date.now() + 50 });
    assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', reason]);
    await settle();
    assert.equal((await health.libraryHealth(entry.id)).failuresSinceSuccess, 1, reason);
  }
  // Unsupported is not a failure of the catalog.
  const { lookup, health, settle } = harness({ providerFor: () => ({ checkAvailability: async () => { throw coded('ISBN needed', 'CATALOG_EXACT_ISBN_REQUIRED'); } }) });
  assert.equal((await lookup.lookupBook({ library: { id: 'vega:u', platform: 'vega' }, book: { bookKey: 'k' } })).reason, 'unsupported');
  await settle();
  assert.equal(await health.libraryHealth('vega:u'), null);
});

test('every platform’s book-page check stops at its request cap and reports couldn’t check', async () => {
  for (const [id, platform] of Object.entries(PLATFORMS)) {
    let fetches = 0;
    global.fetch = async url => { fetches++; return response(url, 'page'); };
    const provider = { checkAvailability: async () => {
      for (let i = 0; ; i++) await getText(`https://catalog.example/${id}/${i}`, { retries: 0 });
    } };
    const { lookup } = harness({ providerFor: () => provider });
    const answer = await lookup.lookupBook({ library: { id: `${id}:lib`, platform: id, catalogUrl: 'https://catalog.example' },
      book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact' });
    assert.equal(fetches, platform.book.maxRequests, id);
    assert.equal(answer.requests, platform.book.maxRequests, id);
    assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'budget'], id);
    clearHttpCache();
  }
});

test('the work search finds another edition by ISBN within the budget, and a stored answer then needs no request', async () => {
  const alternate = '9788173711466';
  let calls = 0;
  const provider = { checkAvailability: async isbn => {
    calls++;
    return isbn === alternate ? { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true } : { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
  } };
  const { lookup, settle } = harness({ providerFor: () => provider });
  const library = { id: 'evergreen:x', platform: 'evergreen', catalogUrl: 'https://e.example' };
  const book = { bookKey: 'v1:isbn:9780140328721', isbn13: '9780140328721', workId: 'OL1W', title: 'Wings of Fire', authors: ['Kalam'] };
  const profile = profileOf({ isbn13: book.isbn13, isbns: [book.isbn13, alternate], title: book.title, authors: book.authors });
  const first = await lookup.lookupBook({ library, book, profile });
  assert.deepEqual([first.outcome, first.evidence, first.matchedIsbn13, first.source], ['found', 'work_isbn', alternate, 'live']);
  await settle();
  const afterFirst = calls;
  const again = await lookup.lookupBook({ library, book, profile });
  assert.deepEqual([again.outcome, again.source, again.requests], ['found', 'stored', 0]);
  assert.equal(calls, afterFirst);
});

test('a complete work search with no match is a stored not found; an incomplete one is not', async () => {
  const provider = { checkAvailability: async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }) };
  const library = { id: 'evergreen:y', platform: 'evergreen', catalogUrl: 'https://e.example' };
  const book = { bookKey: 'v1:isbn:9780140328721', isbn13: '9780140328721', workId: 'OL2W', title: 'Matilda', authors: ['Dahl'] };
  const complete = harness({ providerFor: () => provider });
  const answer = await complete.lookup.lookupBook({ library, book, profile: profileOf({ isbn13: book.isbn13, title: book.title }) });
  assert.deepEqual([answer.outcome, answer.evidence], ['not_found', 'work_no_match']);
  await complete.settle();
  assert.equal((await complete.lookup.lookupBook({ library, book, profile: profileOf({ isbn13: book.isbn13, title: book.title }) })).source, 'stored');
  const partial = harness({ providerFor: () => provider });
  const unsure = await partial.lookup.lookupBook({ library, book, profile: profileOf({ isbn13: book.isbn13, title: book.title, complete: false }) });
  assert.deepEqual([unsure.outcome, unsure.reason], ['couldnt_check', 'unconfirmed']);
  await partial.settle();
  assert.equal(partial.answers.size(), 0);
});

test('aborting a book check stops further catalog requests', async () => {
  const calls = [];
  const controller = new AbortController();
  global.fetch = async (url, options) => {
    calls.push(url);
    if (calls.length === 2) controller.abort();
    return new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      setTimeout(() => resolve(response(url, 'page')), 5);
    });
  };
  const provider = { checkAvailability: async () => { for (let i = 0; i < 10; i++) await getText(`https://k.example/${i}`, { retries: 0 }); return { outcome: 'unknown' }; } };
  const { lookup, health, settle } = harness({ providerFor: () => provider });
  const answer = await lookup.lookupBook({ library: { id: 'koha:abort', platform: 'koha', catalogUrl: 'https://k.example' },
    book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact', signal: controller.signal });
  assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'cancelled']);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(calls.length, 2);
  await settle();
  // A reader leaving is not the catalog's failure.
  assert.equal(await health.libraryHealth('koha:abort'), null);
});

test('robots rules are checked before any catalog request', async () => {
  let fetches = 0;
  global.fetch = async url => { fetches++; return response(url, 'page'); };
  const provider = { checkAvailability: async () => { await getText('https://k.example/cgi-bin/koha/opac-search.pl?q=1'); return { outcome: 'unknown' }; } };
  const { lookup } = harness({ providerFor: () => provider, robots: { check: async () => ({ allowed: false, delayMs: 0 }) } });
  const answer = await lookup.lookupBook({ library: { id: 'koha:r', platform: 'koha', catalogUrl: 'https://k.example' }, book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact' });
  assert.deepEqual([answer.outcome, answer.reason, fetches], ['couldnt_check', 'blocked', 0]);
});

// --- Result marking: per-platform strategies on saved catalog pages ----------

const kalamProfile = (isbns = ['9788173711466', '8173711461']) => profileOf({ isbn13: isbns[0], isbns, title: 'Wings of fire: an autobiography', authors: ['A. P. J. Abdul Kalam'] });

test('e-Granthalaya: one member search (2 requests) marks the result whose ISBN the row shows', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push(url);
    return response(url, read('egranthalaya', options.method === 'POST' ? 'search-hit.html' : 'form.html'),
      { headers: options.method === 'POST' ? {} : { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
  };
  const library = { id: 'egranthalaya:publiclibraries-hkmslib', platform: 'egranthalaya', name: 'Harekrushna Mahtab State Library', capabilities: ['availability'],
    baseUrl: 'https://eg4.nic.in', catalogUrl: 'https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=PUBLICLIBRARIES', egranthalayaCluster: 'PUBLICLIBRARIES', egranthalayaLibraryCode: 'HKMSLIB' };
  const { lookup, answers, settle } = harness({ providerFor: undefined });
  const books = [
    { bookKey: 'a', isbn13: '9788131313459', workId: 'OL9W', profile: profileOf({ isbn13: '9788131313459', title: '101 great lives who shaped the world' }) },
    { bookKey: 'b', isbn13: '9788173711466', profile: kalamProfile() },
    { bookKey: 'c' },
  ];
  const items = await collect(lookup.markResults({ library, query: '101 great lives', books }));
  assert.equal(calls.length, 2);
  assert.deepEqual(items.filter(item => !item.done).map(item => [item.bookKey, item.outcome, item.evidence, item.recordId]), [['a', 'found', 'exact_isbn', '519750']]);
  assert.deepEqual(items.at(-1), { done: true, notAttempted: ['c'], unmatched: ['b'] });
  await settle();
  // Unmatched rows write nothing; the match is stored for the ISBN.
  assert.deepEqual((await answers.readAnswers(library.id, [{ kind: 'isbn13', value: '9788131313459' }, { kind: 'isbn13', value: '9788173711466' }])).map(row => row.answer), ['found']);
  // The same query within ten minutes reuses the rows; stored answers come first.
  const again = await collect(lookup.markResults({ library, query: '101  GREAT lives', books }));
  assert.equal(calls.length, 2);
  assert.deepEqual(again[0], { bookKey: 'a', outcome: 'found', evidence: 'exact_isbn', source: 'stored' });
});

test('e-Granthalaya rows without ISBNs (Romain Rolland, Wings of Fire) give no badge even when titles and authors agree', async () => {
  global.fetch = async (url, options = {}) => response(url, read('egranthalaya', options.method === 'POST' ? 'rrlpy-search-wings-of-fire.html' : 'rrlpy-form.html'),
    { headers: options.method === 'POST' ? {} : { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
  const library = { id: 'egranthalaya:pylib-rrlpy', platform: 'egranthalaya', name: 'Romain Rolland Library', capabilities: ['availability'], baseUrl: 'https://eg4.nic.in',
    egranthalayaCluster: 'PYLIB', egranthalayaLibraryCode: 'RRLPY', egranthalayaSearchScope: 'cluster' };
  const { lookup, answers, settle } = harness();
  const items = await collect(lookup.markResults({ library, query: 'wings of fire', books: [{ bookKey: 'k', isbn13: '9788173711466', profile: kalamProfile() }] }));
  assert.deepEqual(items, [{ done: true, notAttempted: [], unmatched: ['k'] }]);
  await settle();
  assert.equal(answers.size(), 0);
});

const anna = { id: 'koha:anna-centenary-library', platform: 'koha', name: 'Anna Centenary Library', capabilities: ['availability'],
  baseUrl: 'http://118.185.210.241:8001', catalogUrl: 'http://118.185.210.241:8001', publicCatalogCapabilities: { titleSearch: true }, publicCatalogTimeoutMs: 45_000 };

test('Koha: one keyword search page (1 request) marks the edition shown by ISBN; same title, other edition or other work, no badge', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(url, read('koha', 'chennai-wings-search.html')); };
  const { lookup } = harness();
  const books = [
    { bookKey: 'kalam', isbn13: '9788173711466', profile: kalamProfile() },
    // Same title and author, but an ISBN this catalog does not show.
    { bookKey: 'other-edition', isbn13: '9780140328721', profile: kalamProfile(['9780140328721']) },
    // Same title, another work.
    { bookKey: 'sutherland', isbn13: '9780545685351', profile: profileOf({ isbn13: '9780545685351', title: 'Wings of Fire', authors: ['Tui T. Sutherland'] }) },
  ];
  const items = await collect(lookup.markResults({ library: anna, query: 'wings of fire', books }));
  assert.equal(calls.length, 1);
  assert.deepEqual(items.filter(item => !item.done).map(item => [item.bookKey, item.outcome, item.recordId]), [['kalam', 'found', '497990']]);
  assert.deepEqual(items.at(-1).unmatched, ['other-edition', 'sutherland']);
});

test('Koha RSS rows carry ISBNs (IIT Bhubaneswar) and mark in one request where a library opts in', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(url, read('koha', 'iitbbs-rss-wings.xml')); };
  const library = { id: 'koha:iitbbs', platform: 'koha', capabilities: ['availability'], baseUrl: 'https://koha.iitbbs.ac.in', catalogUrl: 'https://koha.iitbbs.ac.in', kohaRssRows: true };
  const { lookup } = harness();
  // The matching row names only the co-author (Tiwari); Open Library lists both.
  const profile = { ...kalamProfile(), authors: ['A. P. J. Abdul Kalam', 'Arun Tiwari'] };
  const items = await collect(lookup.markResults({ library, query: 'wings of fire', books: [{ bookKey: 'k', isbn13: '9788173711466', profile }] }));
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('format'), 'rss');
  assert.deepEqual(items.filter(item => !item.done).map(item => [item.bookKey, item.outcome, item.evidence]), [['k', 'found', 'exact_isbn']]);
});

test('Koha libraries whose rows cannot prove the branch (unscoped shared catalogs, IIT Hyderabad API) do not mark results', async () => {
  global.fetch = async () => assert.fail('no catalog request');
  const { lookup } = harness();
  for (const library of [{ ...anna, id: 'koha:shared', kohaSearchUnscoped: true, kohaBranchCode: 'MAIN', kohaBranchName: 'Main' },
    { ...anna, id: 'koha:iith', publicCatalogApi: 'iith-opac-v1', publicCatalogCapabilities: {} }]) {
    const items = await collect(lookup.markResults({ library, query: 'wings', books: [{ bookKey: 'k', profile: kalamProfile() }] }));
    assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [] }]);
  }
});

test('VuFind: one title search (1 request) marks rows by their COinS ISBN', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(url, read('vufind', 'somaiya-search.html')); };
  const library = { id: 'vufind:somaiya', platform: 'vufind', name: 'The Somaiya School Library', capabilities: ['availability'], baseUrl: 'https://koha-opac.somaiya.edu',
    catalogUrl: 'https://koha-opac.somaiya.edu', vufindInstitution: 'TSS', vufindInstitutionLabel: 'The Somaiya School Library' };
  const { lookup } = harness();
  const items = await collect(lookup.markResults({ library, query: 'wings of fire', books: [{ bookKey: 'k', isbn13: '9788173711466', profile: kalamProfile() }] }));
  assert.equal(calls.length, 1);
  assert.equal(items[0].outcome, 'found');
});

test('LIBMAN and BiblioCommons: one search request; rows carry ISBNs', async () => {
  const libmanRows = JSON.parse(read('libman', 'search-known.json')).map(row => ({ ...row, ISBN: '9780670087488' }));
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(url, libmanRows); };
  const libman = { id: 'libman:22', platform: 'libman', name: 'Arka Jain University Library', capabilities: ['availability'], baseUrl: 'https://libcloud.mastersofterp.in/OPAC_V3',
    libmanLibraryId: '22', catalogUrl: 'https://libcloud.mastersofterp.in/OPAC_V3/?library=Arka+Jain+University+Library' };
  const murty = profileOf({ isbn13: '9780670087488', title: 'A Better India: A Better World', authors: ['N. R. Narayana Murty'] });
  let items = await collect(harness().lookup.markResults({ library: libman, query: 'a better india', books: [{ bookKey: 'm', isbn13: '9780670087488', profile: murty }] }));
  assert.deepEqual([calls.length, items[0].outcome], [1, 'found']);
  calls.length = 0;
  global.fetch = async url => { calls.push(url); return response(url, { catalogSearch: { pagination: { count: 2 }, results: [{ representative: 'S1' }, { representative: 'S2' }] },
    entities: { bibs: { S1: { briefInfo: { title: 'Wings of Fire', subtitle: 'An Autobiography', authors: ['Kalam, A. P. J. Abdul'], isbns: ['8173711461'], format: 'BK' } },
      S2: { briefInfo: { title: 'Wings of Fire', authors: ['Sutherland, Tui T.'], isbns: [], format: 'BK' } } } } }); };
  const bc = { id: 'bc:smcl', platform: 'bc', slug: 'smcl', capabilities: ['availability'], catalogUrl: 'https://smcl.bibliocommons.com' };
  items = await collect(harness().lookup.markResults({ library: bc, query: 'wings of fire', books: [{ bookKey: 'k', isbn13: '9788173711466', profile: kalamProfile() }] }));
  assert.equal(calls.length, 1);
  assert.deepEqual([items[0].bookKey, items[0].outcome, items[0].recordId], ['k', 'found', 'S1']);
});

test('Calil: one batch call answers every result ISBN separately; a missing ISBN is never not found', async () => {
  const previous = process.env.CALIL_APP_KEY;
  process.env.CALIL_APP_KEY = 'fixture-key';
  try {
    const calls = [];
    const held = '9784103534228', absent = '9780593135204', missing = '9780140328721';
    global.fetch = async url => {
      calls.push(new URL(url));
      return response(url, { continue: 0, books: {
        [held]: { Tokyo_Setagaya: { status: 'OK', libkey: { '中央図書館': '貸出可' } } },
        [absent]: { Tokyo_Setagaya: { status: 'OK', libkey: {} } },
        [missing]: { Tokyo_Setagaya: { status: 'Running' } } } });
    };
    const library = { id: 'calil:Tokyo_Setagaya', platform: 'calil', slug: 'Tokyo_Setagaya', capabilities: ['availability'], baseUrl: 'https://api.calil.jp', catalogUrl: 'https://calil.jp/' };
    const { lookup, answers, settle } = harness();
    const items = await collect(lookup.markResults({ library, query: 'x', books: [
      { bookKey: 'held', isbn13: held }, { bookKey: 'absent', isbn13: absent }, { bookKey: 'missing', isbn13: missing }] }));
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].searchParams.get('isbn').split(','), [held, absent, missing]);
    assert.deepEqual(items.filter(item => !item.done).map(item => [item.bookKey, item.outcome]), [['held', 'found'], ['absent', 'not_found']]);
    assert.deepEqual(items.at(-1), { done: true, notAttempted: ['missing'], unmatched: [] });
    await settle();
    const stored = await answers.readAnswers(library.id, [held, absent, missing].map(value => ({ kind: 'isbn13', value })));
    assert.deepEqual(stored.map(row => [row.value, row.answer]), [[held, 'found'], [absent, 'not_found']]);
    // The app key never appears in what the lookup layer returns.
    assert.ok(!JSON.stringify(items).includes('fixture-key'));
  } finally {
    if (previous === undefined) delete process.env.CALIL_APP_KEY; else process.env.CALIL_APP_KEY = previous;
  }
});

test('Vega and Evergreen check the top results one ISBN at a time within the results budget', async () => {
  for (const [id, top] of [['vega', 9], ['evergreen', 3]]) {
    let calls = 0;
    const provider = { checkAvailability: async isbn => { calls++; return isbn.endsWith('6') ? { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }
      : { outcome: 'not_found', matchKind: 'none', recognizedExact: true }; } };
    const { lookup } = harness({ providerFor: () => provider });
    const books = Array.from({ length: 12 }, (_, i) => ({ bookKey: `b${i}`, isbn13: i === 0 ? '9788173711466' : '9780140328721' }));
    const items = await collect(lookup.markResults({ library: { id: `${id}:x`, platform: id, catalogUrl: 'https://v.example' }, query: 'q', books }));
    assert.equal(calls, top, id);
    assert.deepEqual(items[0], { bookKey: 'b0', outcome: 'found', evidence: 'exact_isbn', source: 'live' });
    assert.equal(items.at(-1).notAttempted.length, 12 - top, id);
  }
});

test('platforms without a results strategy, an open circuit, or a second run on the same host make no request', async () => {
  global.fetch = async () => assert.fail('no catalog request');
  const book = { bookKey: 'k', isbn13: '9788173711466', profile: kalamProfile() };
  for (const platform of ['indcat', 'vpl', 'chamo', 'libsys', 'aspen']) {
    const items = await collect(harness().lookup.markResults({ library: { id: `${platform}:x`, platform, catalogUrl: 'https://x.example' }, query: 'wings', books: [book] }));
    assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [] }], platform);
  }
  const guard = createHostGuard();
  for (let i = 0; i < 3; i++) guard.recordFailure('118.185.210.241:8001');
  assert.deepEqual(await collect(harness({ guard }).lookup.markResults({ library: anna, query: 'wings', books: [book] })), [{ done: true, notAttempted: ['k'], unmatched: [] }]);
  const busy = createHostGuard();
  const finish = busy.tryStartMarking('118.185.210.241:8001');
  assert.deepEqual(await collect(harness({ guard: busy }).lookup.markResults({ library: anna, query: 'wings', books: [book] })), [{ done: true, notAttempted: ['k'], unmatched: [] }]);
  finish();
});

test('result marking never exceeds the platform’s results budget, and a failed search marks nothing and is a health event', async () => {
  for (const [id, platform] of Object.entries(PLATFORMS).filter(([, value]) => value.results.strategy === 'search_rows')) {
    let fetches = 0;
    global.fetch = async url => { fetches++; return response(url, 'page'); };
    const search = async () => { for (let i = 0; ; i++) await getText(`https://s.example/${id}/${i}`, { retries: 0 }); };
    const { lookup, health, settle } = harness({ providerFor: () => ({ checkAvailability: async () => ({}), searchResultRows: search, searchBookCandidates: search, searchCatalog: search }) });
    const items = await collect(lookup.markResults({ library: { id: `${id}:b`, platform: id, catalogUrl: 'https://s.example' }, query: 'wings', books: [{ bookKey: 'k', profile: kalamProfile() }] }));
    assert.equal(fetches, platform.results.maxRequests, id);
    assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [] }], id);
    await settle();
    assert.equal((await health.libraryHealth(`${id}:b`)).failuresSinceSuccess, 1, id);
    clearHttpCache();
  }
});

test('aborting result marking stops further requests and marks nothing', async () => {
  const controller = new AbortController();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    controller.abort();
    return new Promise((_, reject) => { options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); if (options.signal.aborted) reject(new Error('aborted')); });
  };
  const items = await collect(harness().lookup.markResults({ library: anna, query: 'wings of fire', signal: controller.signal, books: [{ bookKey: 'k', profile: kalamProfile() }] }));
  assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [] }]);
  assert.equal(calls.length, 1);
});

// --- /availability: old and new paths agree ---------------------------------

const publicLibrary = { id: 'koha:example', catalogUrl: 'https://catalog.example.test',
  capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
const publicEntry = { id: 'koha:example', platform: 'koha', catalogUrl: 'https://catalog.example.test' };
const publicBook = { bookKey: 'v1:isbn:9781625275868', isbn13: '9781625275868', workId: 'OL5W', title: 'Example', authors: ['Author'] };

function availabilityPair(provider, books) {
  const directory = { resolve: id => (id === publicLibrary.id ? publicLibrary : null), entry: id => (id === publicLibrary.id ? publicEntry : null) };
  const old = createPublicAvailabilityService({ directory, books, providerFor: () => provider });
  const { lookup, settle } = harness({ providerFor: () => provider });
  const next = createPublicAvailabilityService({ directory, books, providerFor: () => provider, lookup });
  return { old, next, settle };
}

test('/availability gives the same response on the old and new paths for every observation shape', async () => {
  const observations = [
    { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true, availableCopies: 2, totalCopies: 3, callNumber: '920 KAL', catalogUrl: 'https://catalog.example.test/r/1' },
    { outcome: 'none_available', matchKind: 'exact_isbn', recognizedExact: true, totalCopies: 1 },
    { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true },
    { outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true, totalCopies: 2 },
    { outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true, loanRestriction: 'not_for_loan', totalCopies: 1, availableCopies: 0 },
    { outcome: 'not_found', matchKind: 'none', recognizedExact: true },
    { outcome: 'not_found', matchKind: 'none' },
    { outcome: 'available', matchKind: 'possible_match' },
    { status: 'available', copies: 2, availableCopies: 1 },
    { status: 'not_found' },
    null,
  ];
  const strip = ({ attemptedAt, observedAt, ...rest }) => rest;
  for (const observation of observations) {
    for (const scope of ['exact', 'work']) {
      const profile = { book: publicBook, isbns: [publicBook.isbn13], titles: [publicBook.title], authors: publicBook.authors, complete: true };
      const books = { resolve: async () => publicBook, ...(scope === 'work' ? { searchProfile: async () => profile } : {}) };
      const provider = { checkAvailability: async () => observation };
      const { old, next } = availabilityPair(provider, books);
      const input = { libraryId: publicLibrary.id, bookKey: publicBook.bookKey, editionScope: scope };
      const before = await old.check(input);
      const after = await next.check(input);
      const clean = value => { const response = strip(value.response); if (response.searchSummary) response.searchSummary = { ...response.searchSummary, requests: 0 }; return response; };
      assert.deepEqual(clean(after), clean(before), `${scope} ${JSON.stringify(observation)}`);
    }
  }
  // Failures keep the same error codes.
  for (const code of ['CATALOG_TIMEOUT', 'CATALOG_PROVIDER_BLOCKED', 'CATALOG_UNRECOGNIZED']) {
    const books = { resolve: async () => publicBook };
    const { old, next } = availabilityPair({ checkAvailability: async () => { throw coded(code, code); } }, books);
    const input = { libraryId: publicLibrary.id, bookKey: publicBook.bookKey, editionScope: 'exact' };
    assert.equal((await next.check(input)).response.errorCode, (await old.check(input)).response.errorCode);
  }
});

test('/availability on real saved pages: e-Granthalaya ISBN record, old and new paths agree', async () => {
  const library = { id: 'egranthalaya:publiclibraries-hkmslib', catalogUrl: 'https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=PUBLICLIBRARIES',
    capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: true, locationAvailability: true, callNumber: true, catalogLink: true } };
  const entry = { id: library.id, platform: 'egranthalaya', name: 'Harekrushna Mahtab State Library', capabilities: ['availability'], baseUrl: 'https://eg4.nic.in',
    catalogUrl: library.catalogUrl, egranthalayaCluster: 'PUBLICLIBRARIES', egranthalayaLibraryCode: 'HKMSLIB', egranthalayaReferenceOnly: true };
  const book = { bookKey: 'v1:isbn:9788131313459', isbn13: '9788131313459', title: '101 great lives', authors: [] };
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push(url);
    if (url.includes('Details.aspx')) return response(url, read('egranthalaya', 'holdings-available.html'));
    return response(url, read('egranthalaya', options.method === 'POST' ? 'search-hit.html' : 'form.html'),
      { headers: options.method === 'POST' ? {} : { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/; HttpOnly; Secure' } });
  };
  const directory = { resolve: id => (id === library.id ? library : null), entry: id => (id === library.id ? entry : null) };
  const books = { resolve: async () => book };
  const old = await createPublicAvailabilityService({ directory, books }).check({ libraryId: library.id, bookKey: book.bookKey, editionScope: 'exact' });
  const oldCalls = calls.length;
  clearHttpCache(); clearEgranthalayaRefusals();
  const { lookup, settle, answers } = harness();
  const next = await createPublicAvailabilityService({ directory, books, lookup }).check({ libraryId: library.id, bookKey: book.bookKey, editionScope: 'exact' });
  const strip = ({ attemptedAt, observedAt, ...rest }) => rest;
  assert.deepEqual(strip(next.response), strip(old.response));
  assert.ok(['available', 'in_catalog', 'none_available', 'unknown'].includes(old.response.outcome));
  assert.ok(calls.length - oldCalls <= PLATFORMS.egranthalaya.book.maxRequests);
  await settle();
  if (['available', 'in_catalog', 'none_available'].includes(old.response.outcome)) assert.equal(answers.size(), 1);
});

test('without CATALOG_LOOKUP_V2 the new layer is not used', async () => {
  let used = false;
  const lookup = { enabledFor: () => false, checkBook: async () => { used = true; } };
  const directory = { resolve: () => publicLibrary, entry: () => publicEntry };
  const service = createPublicAvailabilityService({ directory, books: { resolve: async () => publicBook }, providerFor: () => ({ checkAvailability: async () => ({ outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true }) }), lookup });
  assert.equal((await service.check({ libraryId: publicLibrary.id, bookKey: publicBook.bookKey, editionScope: 'exact' })).response.outcome, 'in_catalog');
  assert.equal(used, false);
});

// --- Checker findings ---------------------------------------------------------

test('an exact-edition lookup is not answered by a stored work-level found from another ISBN', async () => {
  const answers = createMemoryAnswerStore();
  await answers.writeAnswers([{ libraryId: 'vega:exact', kind: 'ol_work', value: 'OL9W', answer: 'found', evidence: 'work_isbn',
    matchedIsbn13: '9780140328721', expiresAt: Date.now() + 60_000 }]);
  let calls = 0;
  const { lookup } = harness({ answers, providerFor: () => ({ checkAvailability: async () => { calls++; return { outcome: 'not_found', matchKind: 'none', recognizedExact: true }; } }) });
  const library = { id: 'vega:exact', platform: 'vega', catalogUrl: 'https://v.example' };
  const book = { bookKey: 'k', isbn13: '9788173711466', workId: 'OL9W' };
  const exact = await lookup.lookupBook({ library, book, editionScope: 'exact' });
  assert.deepEqual([exact.outcome, exact.source, calls], ['not_found', 'live', 1]);
  // The work-level question may still use it.
  assert.deepEqual([(await lookup.lookupBook({ library, book })).source, calls], ['stored', 1]);
});

test('a reader who leaves does not cancel the request another reader is sharing', async () => {
  global.fetch = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    setTimeout(() => resolve(response(url, 'page')), 60);
  });
  const provider = { checkAvailability: isbn => cachedTask(`shared:${isbn}`, async () => {
    await getText('https://k.example/shared', { retries: 0 });
    return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true };
  }) };
  const { lookup, health, settle } = harness({ providerFor: () => provider });
  const library = { id: 'koha:shared', platform: 'koha', catalogUrl: 'https://k.example' };
  const book = { bookKey: 'k', isbn13: '9788173711466' };
  const leaving = new AbortController();
  const first = lookup.lookupBook({ library, book, editionScope: 'exact', signal: leaving.signal });
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = lookup.lookupBook({ library, book, editionScope: 'exact' });
  setTimeout(() => leaving.abort(), 15);
  const [left, stayed] = await Promise.all([first, second]);
  assert.deepEqual([left.outcome, left.reason], ['couldnt_check', 'cancelled']);
  assert.equal(stayed.outcome, 'found');
  await settle();
  assert.equal((await health.libraryHealth('koha:shared')).failuresSinceSuccess, 0);
});

test('a per-ISBN marking run whose answers were all unreadable is a failure, not a success', async () => {
  const guard = createHostGuard();
  const { lookup, health, settle } = harness({ guard, providerFor: () => ({ checkAvailability: async () => ({ outcome: 'unknown', matchKind: null }) }) });
  for (let i = 0; i < 3; i++) {
    await collect(lookup.markResults({ library: { id: 'vega:unread', platform: 'vega', catalogUrl: 'https://unread.example' }, query: 'q',
      books: [{ bookKey: 'a', isbn13: '9788173711466' }] }));
  }
  await settle();
  const state = await health.libraryHealth('vega:unread');
  assert.deepEqual([state.lastSuccessAt, state.failuresSinceSuccess], [null, 3]);
  assert.equal(guard.circuitOpen('unread.example'), true);
});

test('result marking ends by its deadline when an edition profile never arrives, and frees the host', async () => {
  let searched = 0;
  const provider = { checkAvailability: async () => ({}), searchResultRows: async () => { searched++; return []; }, checkMany: async () => assert.fail('no catalog call') };
  const { lookup, guard, health, settle } = harness({ providerFor: () => provider });
  for (const [platform, host] of [['vufind', 'slow-profile.example'], ['calil', 'api.calil.jp']]) {
    const library = { id: `${platform}:slow`, platform, slug: 'S', catalogUrl: `https://${host}` };
    const run = collect(lookup.markResults({ library, query: 'q', books: [{ bookKey: 'a', profile: new Promise(() => {}) }], deadlineAt: Date.now() + 50 }));
    const settled = await Promise.race([run, new Promise(resolve => setTimeout(() => resolve('still waiting'), 1_000))]);
    assert.deepEqual(settled, [{ done: true, notAttempted: ['a'], unmatched: [] }], platform);
    const slot = guard.tryStartMarking(host);
    assert.ok(slot, platform);
    slot();
  }
  assert.equal(searched, 1);
  await settle();
  // Waiting on Open Library is not the Calil catalog's failure.
  assert.equal(await health.libraryHealth('calil:slow'), null);
});

test('a reader who stops reading marks does not hold the host’s marking slot', async () => {
  const provider = { checkAvailability: async () => ({}), searchResultRows: async () => [{ recordId: '1', title: 'Wings of fire', isbn: '9788173711466' }] };
  const { lookup, guard } = harness({ providerFor: () => provider });
  const iterator = lookup.markResults({ library: { id: 'vufind:walk', platform: 'vufind', catalogUrl: 'https://walk.example' }, query: 'wings',
    books: [{ bookKey: 'a', profile: kalamProfile() }] })[Symbol.asyncIterator]();
  assert.equal((await iterator.next()).value.outcome, 'found');
  const slot = guard.tryStartMarking('walk.example');
  assert.ok(slot);
  slot();
});

test('an edition profile that fails or is too slow is not counted against the catalog', async () => {
  let catalogCalls = 0;
  const provider = { checkAvailability: async () => { catalogCalls++; return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }; } };
  const guard = createHostGuard();
  const { lookup, health, settle } = harness({ guard, providerFor: () => provider });
  const entry = { id: 'vega:profile', platform: 'vega', catalogUrl: 'https://profile.example' };
  const book = { isbn13: '9788173711466', title: 'Wings of fire', authors: [] };
  const failing = { searchProfile: async () => { throw coded('Open Library is down', 'METADATA_UNAVAILABLE'); } };
  const slow = { searchProfile: () => new Promise(() => {}) };
  for (let i = 0; i < 3; i++) {
    const down = await lookup.checkBook({ entry, book, bookKey: 'k', lookupKind: 'exact_isbn', books: failing, attemptedAt: 'now' });
    assert.equal(down.answer.outcome, 'couldnt_check');
    const late = await lookup.checkBook({ entry, book, bookKey: 'k', lookupKind: 'exact_isbn', books: slow, attemptedAt: 'now', deadlineAt: Date.now() + 30 });
    assert.deepEqual([late.answer.outcome, late.answer.reason], ['couldnt_check', 'timeout']);
  }
  await settle();
  assert.equal(catalogCalls, 0);
  assert.equal(await health.libraryHealth(entry.id), null);
  assert.equal(guard.circuitOpen('profile.example'), false);
  assert.equal(guard.activeCount('profile.example'), 0);
});

test('waiting for a busy host slot on this instance is couldn’t check, but not the catalog’s failure', async () => {
  const guard = createHostGuard();
  const { lookup, health, settle } = harness({ guard, providerFor: () => ({ checkAvailability: async () => assert.fail('no catalog request') }) });
  const entry = { id: 'evergreen:busy', platform: 'evergreen', catalogUrl: 'https://busy.example' };
  const release = await guard.acquire('busy.example', 1);
  for (let i = 0; i < 3; i++) {
    const answer = await lookup.lookupBook({ library: entry, book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact', deadlineAt: Date.now() + 20 });
    assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'timeout']);
  }
  release();
  await settle();
  assert.equal(await health.libraryHealth(entry.id), null);
  assert.equal(guard.circuitOpen('busy.example'), false);
});
