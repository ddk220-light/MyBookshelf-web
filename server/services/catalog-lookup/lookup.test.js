import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalogLookup, createLookupRecorder, createMemoryAnswerStore, createMemoryHealthRecord, createHostGuard, PLATFORMS } from './index.js';
import { cachedTask, catalogOperation, clearHttpCache, getText } from '../providers/http.js';
import { clearEgranthalayaRefusals } from '../providers/egranthalaya.js';
import { createPublicAvailabilityService } from '../../public-v2/availability.js';
import { WORK_ABSENCE_RULE_SINCE } from './record.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); clearEgranthalayaRefusals(); });
const read = (dir, name) => fs.readFileSync(new URL(`../../test/fixtures/${dir}/${name}`, import.meta.url), 'utf8');
const response = (url, body, { status = 200, headers = {} } = {}) => ({ ok: status >= 200 && status < 300, status, url,
  headers: new Headers(headers), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const coded = (message, code) => Object.assign(new Error(message), { code });

// Platform descriptors without pacing, so budget tests run quickly. Pacing has
// its own test in providers/robots.test.js.
const UNPACED = Object.fromEntries(Object.entries(PLATFORMS).map(([id, value]) => [id, { ...value, minIntervalMs: 0 }]));

// `clock`: the answer store's time (when answers are written and read), so a
// test can stand after WORK_ABSENCE_RULE_SINCE whatever today's date is.
function harness({ providerFor, clock, answers = createMemoryAnswerStore(clock ? { now: clock } : {}), health = createMemoryHealthRecord(), robots = null, guard = createHostGuard(),
  platforms = UNPACED, log } = {}) {
  const pending = [];
  const recorder = createLookupRecorder({ answers, health, defer: task => pending.push(task()), ...(clock ? { now: clock } : {}), ...(log ? { log } : {}) });
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

test('running out of our own request budget is couldn’t check but never counts against the library’s health', async () => {
  const guard = createHostGuard();
  const health = createMemoryHealthRecord();
  // Every response is a page the adapter keeps reading past: the cap stops it.
  global.fetch = async url => response(url, 'page');
  const provider = { checkAvailability: async () => { for (let i = 0; ; i++) await getText(`https://capped.example/${i}`, { retries: 0 }); } };
  const library = { id: 'koha:capped', platform: 'koha', catalogUrl: 'https://capped.example' };
  for (let i = 0; i < 4; i++) {
    // A fresh instance each time, so the per-minute host cap is not reached.
    const { lookup, settle } = harness({ providerFor: () => provider, guard, health });
    const answer = await lookup.lookupBook({ library, book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact' });
    assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'budget']);
    await settle();
  }
  assert.equal(await health.libraryHealth(library.id), null);
  assert.equal(guard.circuitOpen('capped.example'), false);

  // A title-first catalog whose candidate rows need more record reads than the
  // budget allows: our cap, not the library's failure.
  // (Each record names only a given name of the author: a possible match, never a find.)
  const rows = Array.from({ length: 12 }, (_, i) => ({ recordId: String(i), title: 'Wings of Fire', authors: ['Abdul Rahman'] }));
  const titleFirst = { findBookCandidates: async () => { await getText('https://rows.example/search', { retries: 0 }); return rows; },
    resolveCatalogRecord: async id => { await getText(`https://rows.example/${id}`, { retries: 0 }); return { recordId: id, title: 'Wings of Fire', authors: ['Abdul Rahman'], observation: { outcome: 'available' } }; },
    checkAvailability: async () => { await getText('https://rows.example/isbn', { retries: 0 }); return { outcome: 'not_found', recognizedExact: true }; } };
  const second = harness({ providerFor: () => titleFirst, guard, health, platforms: { ...UNPACED, koha: { ...UNPACED.koha, book: { ...UNPACED.koha.book, maxRequests: 2 } } } });
  const profile = { book: { isbn13: '9780000000002', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] }, isbns: ['9780000000002'],
    titles: ['Wings of Fire'], authors: ['A. P. J. Abdul Kalam'], language: '', complete: true, expansionFailed: false };
  const rowsLibrary = { id: 'koha:rows', platform: 'koha', catalogUrl: 'https://rows.example' };
  const capped = await second.lookup.lookupBook({ library: rowsLibrary, book: { bookKey: 'v1:openlibrary:OL9W', workId: 'OL9W', title: 'Wings of Fire' }, profile });
  assert.equal(capped.outcome, 'couldnt_check');
  await second.settle();
  assert.equal(await health.libraryHealth(rowsLibrary.id), null);

  // A catalog that answers with something unreadable within the budget is
  // still the catalog's failure.
  const unreadable = harness({ providerFor: () => ({ checkAvailability: async () => ({ outcome: 'unknown', matchKind: 'none' }) }), health });
  const multi = { ...profile, isbns: ['9788173711466', '9780140328721'] };
  const answer = await unreadable.lookup.lookupBook({ library: { id: 'vega:odd', platform: 'vega', catalogUrl: 'https://odd.example' },
    book: { bookKey: 'v1:openlibrary:OL8W', workId: 'OL8W' }, profile: multi });
  assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'unrecognized']);
  await unreadable.settle();
  assert.equal((await health.libraryHealth('vega:odd')).failuresSinceSuccess, 1);
});

test('a Vega book page spends its two requests on two editions, not on both ISBN forms of one', async () => {
  const held = '9780062316110';
  const asked = [];
  global.fetch = async (url, options) => {
    const { searchText } = JSON.parse(options.body);
    asked.push(searchText);
    return response(url, searchText === held
      ? { totalResults: 1, data: [{ identifiers: { isbn: held }, materialTabs: [{ name: 'Book', type: 'physical', availability: { status: { general: 'Available' } } }] }] }
      : { totalResults: 0, data: [] });
  };
  const { getProvider } = await import('../providers/index.js');
  // DC Public Library's directory entry; every request goes to the fixture.
  const libraries = JSON.parse(fs.readFileSync(new URL('../../data/libraries.json', import.meta.url), 'utf8'));
  const library = { id: 'vega:dc', ...(Array.isArray(libraries) ? libraries : libraries.libraries || Object.values(libraries))
    .find(entry => entry.platform === 'vega' && /DC Public/.test(entry.name)) };
  const { lookup } = harness({ providerFor: getProvider });
  const isbns = ['9780062316097', held, '9781846558238'];
  const answer = await lookup.lookupBook({ library, book: { bookKey: 'v1:openlibrary:OL7W', workId: 'OL7W', isbn13: isbns[0] },
    profile: { book: { isbn13: isbns[0], title: 'Sapiens', authors: [] }, isbns, titles: ['Sapiens'], authors: [], language: '', complete: true, expansionFailed: false } });
  assert.deepEqual(asked, [isbns[0], held], JSON.stringify(answer));
  assert.deepEqual([answer.outcome, answer.matchedIsbn13], ['found', held]);
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
  // The catalog answers the title search (nothing) and every ISBN (not listed).
  const provider = { checkAvailability: async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }), searchCatalog: async () => [] };
  const library = { id: 'evergreen:y', platform: 'evergreen', catalogUrl: 'https://e.example' };
  const book = { bookKey: 'v1:isbn:9780140328721', isbn13: '9780140328721', workId: 'OL2W', title: 'Matilda', authors: ['Dahl'] };
  const english = options => ({ ...profileOf(options), language: 'eng' });
  const complete = harness({ providerFor: () => provider, clock: () => Math.max(Date.now(), WORK_ABSENCE_RULE_SINCE + 60_000) });
  const answer = await complete.lookup.lookupBook({ library, book, profile: english({ isbn13: book.isbn13, title: book.title }) });
  assert.deepEqual([answer.outcome, answer.evidence], ['not_found', 'work_no_match']);
  await complete.settle();
  assert.equal((await complete.lookup.lookupBook({ library, book, profile: english({ isbn13: book.isbn13, title: book.title }) })).source, 'stored');
  const partial = harness({ providerFor: () => provider });
  const unsure = await partial.lookup.lookupBook({ library, book, profile: english({ isbn13: book.isbn13, title: book.title, complete: false }) });
  assert.deepEqual([unsure.outcome, unsure.reason], ['couldnt_check', 'unconfirmed']);
  await partial.settle();
  assert.equal(partial.answers.size(), 0);
});

test('a work search that could not have found the book never says not found (Godaan, Ponniyin Selvan)', async () => {
  const library = { id: 'koha:panjab-laws', platform: 'koha', catalogUrl: 'https://k.example' };
  const notListed = async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true });
  const cases = [
    // No ISBN in Open Library: no row could ever prove the book, so nothing proves it absent.
    ['no ISBN', { checkAvailability: notListed, searchCatalog: async () => [] },
      { book: { title: 'Godaan', authors: ['Munshi Premchand'] }, isbns: [], titles: ['Godaan'], authors: ['Munshi Premchand'], language: 'hin', complete: true }],
    // A Hindi work searched by a romanised title: "Godan" or "गोदान" would not be found.
    ['another script', { checkAvailability: notListed, searchCatalog: async () => [] },
      { book: { isbn13: '9789388810470', title: 'Godaan', authors: ['Munshi Premchand'] }, isbns: ['9789388810470'], titles: ['Godaan'], authors: ['Munshi Premchand'], language: 'hin', complete: true }],
    // ISBN lookups only: an edition Open Library does not list is never tried.
    ['no title search', { checkAvailability: notListed },
      { book: { isbn13: '9780140328721', title: 'Matilda', authors: ['Dahl'] }, isbns: ['9780140328721'], titles: ['Matilda'], authors: ['Dahl'], language: 'eng', complete: true }],
    // A volume of a set the title rules cannot match.
    ['related title', { checkAvailability: notListed, searchCatalog: async () => [{ recordId: '1', title: 'Ponniyin Selvan Part 1', authors: ['Kalki'], observation: { outcome: 'in_catalog' } }] },
      { book: { isbn13: '9788184931723', title: 'Ponniyin Selvan', authors: ['Kalki'] }, isbns: ['9788184931723'], titles: ['Ponniyin Selvan'], authors: ['Kalki'], language: 'eng', complete: true }],
  ];
  for (const [name, provider, profile] of cases) {
    const { lookup, answers, settle } = harness({ providerFor: () => provider });
    const book = { bookKey: 'v1:openlibrary:OL17047576W', workId: 'OL17047576W', ...profile.book };
    const answer = await lookup.lookupBook({ library, book, profile });
    assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'unconfirmed'], name);
    await settle();
    assert.equal(answers.size(), 0, name);
  }
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

test('e-Granthalaya: one member title search (the form, then TITLE and ALL searches: 3 requests) marks the result whose ISBN the row shows', async () => {
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
  assert.equal(calls.length, 3);
  assert.deepEqual(items.filter(item => !item.done).map(item => [item.bookKey, item.outcome, item.evidence, item.recordId]), [['a', 'found', 'exact_isbn', '519750']]);
  assert.deepEqual(items.at(-1), { done: true, notAttempted: ['c'], unmatched: ['b'], failed: [] });
  await settle();
  // Unmatched rows write nothing; the match is stored for the ISBN.
  assert.deepEqual((await answers.readAnswers(library.id, [{ kind: 'isbn13', value: '9788131313459' }, { kind: 'isbn13', value: '9788173711466' }])).map(row => row.answer), ['found']);
  // The same query within ten minutes reuses the rows; stored answers come first.
  const again = await collect(lookup.markResults({ library, query: '101  GREAT lives', books }));
  assert.equal(calls.length, 3);
  assert.deepEqual(again[0], { bookKey: 'a', outcome: 'found', evidence: 'exact_isbn', source: 'stored' });
});

test('e-Granthalaya rows without ISBNs (Romain Rolland, Wings of Fire) give no badge even when titles and authors agree', async () => {
  global.fetch = async (url, options = {}) => response(url, read('egranthalaya', options.method === 'POST' ? 'rrlpy-search-wings-of-fire.html' : 'rrlpy-form.html'),
    { headers: options.method === 'POST' ? {} : { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
  const library = { id: 'egranthalaya:pylib-rrlpy', platform: 'egranthalaya', name: 'Romain Rolland Library', capabilities: ['availability'], baseUrl: 'https://eg4.nic.in',
    egranthalayaCluster: 'PYLIB', egranthalayaLibraryCode: 'RRLPY', egranthalayaSearchScope: 'cluster' };
  const { lookup, answers, settle } = harness();
  const items = await collect(lookup.markResults({ library, query: 'wings of fire', books: [{ bookKey: 'k', isbn13: '9788173711466', profile: kalamProfile() }] }));
  assert.deepEqual(items, [{ done: true, notAttempted: [], unmatched: ['k'], failed: [] }]);
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
  // The mark carries the matching row's record address (A3).
  assert.equal(items.find(item => item.bookKey === 'kalam').catalogUrl, 'http://118.185.210.241:8001/cgi-bin/koha/opac-detail.pl?biblionumber=497990');
  assert.deepEqual(items.at(-1).failed, [], 'unmatched rows are not failures');
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
  // A request here would fail inside the adapter and be swallowed, so count them.
  let fetches = 0;
  global.fetch = async () => { fetches++; assert.fail('no catalog request'); };
  const { lookup } = harness();
  for (const library of [{ ...anna, id: 'koha:shared', kohaSearchUnscoped: true, kohaBranchCode: 'MAIN', kohaBranchName: 'Main' },
    { ...anna, id: 'koha:iith', publicCatalogApi: 'iith-opac-v1', publicCatalogCapabilities: {} }]) {
    const items = await collect(lookup.markResults({ library, query: 'wings', books: [{ bookKey: 'k', profile: kalamProfile() }] }));
    assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [], failed: [] }]);
  }
  assert.equal(fetches, 0);
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
    assert.deepEqual(items.at(-1), { done: true, notAttempted: [], unmatched: [], failed: ['missing'] });
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
    assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [], failed: [] }], platform);
  }
  const guard = createHostGuard();
  for (let i = 0; i < 3; i++) guard.recordFailure('118.185.210.241:8001');
  assert.deepEqual(await collect(harness({ guard }).lookup.markResults({ library: anna, query: 'wings', books: [book] })), [{ done: true, notAttempted: ['k'], unmatched: [], failed: [] }]);
  const busy = createHostGuard();
  const finish = busy.tryStartMarking('118.185.210.241:8001');
  assert.deepEqual(await collect(harness({ guard: busy }).lookup.markResults({ library: anna, query: 'wings', books: [book] })), [{ done: true, notAttempted: ['k'], unmatched: [], failed: [] }]);
  finish();
});

test('result marking never exceeds the platform’s results budget, and a failed search marks nothing and is a health event (running out of budget is not)', async () => {
  for (const [id, platform] of Object.entries(PLATFORMS).filter(([, value]) => value.results.strategy === 'search_rows')) {
    let fetches = 0;
    global.fetch = async url => { fetches++; return response(url, 'page'); };
    const search = async () => { for (let i = 0; ; i++) await getText(`https://s.example/${id}/${i}`, { retries: 0 }); };
    const { lookup, health, settle } = harness({ providerFor: () => ({ checkAvailability: async () => ({}), searchResultRows: search, searchBookCandidates: search, searchCatalog: search }) });
    const items = await collect(lookup.markResults({ library: { id: `${id}:b`, platform: id, catalogUrl: 'https://s.example' }, query: 'wings', books: [{ bookKey: 'k', profile: kalamProfile() }] }));
    assert.equal(fetches, platform.results.maxRequests, id);
    // The search did not finish within our cap: "couldn't check" for the reader, never "not found".
    assert.deepEqual(items, [{ done: true, notAttempted: [], unmatched: [], failed: ['k'] }], id);
    await settle();
    // Our own request cap ran out: not the library's failure.
    assert.equal(await health.libraryHealth(`${id}:b`), null, id);
    // A catalog that fails is.
    const failing = harness({ providerFor: () => {
      const fail = async () => { throw coded('Catalog down', 'CATALOG_UNAVAILABLE'); };
      return { checkAvailability: async () => ({}), searchResultRows: fail, searchBookCandidates: fail, searchCatalog: fail };
    } });
    const failed = await collect(failing.lookup.markResults({ library: { id: `${id}:f`, platform: id, catalogUrl: 'https://f.example' }, query: 'wings', books: [{ bookKey: 'k', profile: kalamProfile() }] }));
    assert.deepEqual(failed, [{ done: true, notAttempted: [], unmatched: [], failed: ['k'] }], id);
    await failing.settle();
    assert.equal((await failing.health.libraryHealth(`${id}:f`)).failuresSinceSuccess, 1, id);
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
  assert.deepEqual(items, [{ done: true, notAttempted: ['k'], unmatched: [], failed: [] }]);
  assert.equal(calls.length, 1);
});

// --- Plan A2, step 3: a check that runs out of time finishes in the background

function backgroundHarness({ provider, deadlineMs = 100, hostConcurrency = UNPACED.vega.hostConcurrency }) {
  const deferred = [];
  const defer = task => { deferred.push(Promise.resolve().then(task)); };
  const answers = createMemoryAnswerStore(), health = createMemoryHealthRecord();
  const platforms = { ...UNPACED, vega: { ...UNPACED.vega, hostConcurrency, book: { ...UNPACED.vega.book, deadlineMs } } };
  const recorder = createLookupRecorder({ answers, health, defer });
  const lookup = createCatalogLookup({ providerFor: () => provider, recorder, robots: null, platforms, env: {}, defer });
  const settle = async () => { while (deferred.length) await Promise.all(deferred.splice(0)); };
  return { lookup, answers, health, settle };
}
const slowLibrary = { id: 'vega:slow', platform: 'vega', catalogUrl: 'https://slow.example/' };
const slowBook = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466' };

test('a book-page check still running at its deadline answers "couldn’t check", then finishes and stores its answer for the next look', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let requests = 0;
  const started = Promise.withResolvers();
  const observation = Promise.withResolvers();
  const provider = { checkAvailability: () => { requests++; started.resolve(); return observation.promise; } };
  const { lookup, answers, health, settle } = backgroundHarness({ provider });
  const reply = lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true });
  await started.promise;
  t.mock.timers.tick(100);
  const first = await reply;
  assert.deepEqual([first.outcome, first.reason], ['couldnt_check', 'timeout']);
  assert.equal((await answers.readAnswers(slowLibrary.id, [{ kind: 'isbn13', value: slowBook.isbn13 }])).length, 0);
  observation.resolve({ outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true });
  await settle();
  // The same check finished within its own (longer) deadline and stored "found".
  assert.equal(requests, 1, 'one check, not a second one');
  const stored = await lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true });
  assert.deepEqual([stored.outcome, stored.source], ['found', 'stored']);
  assert.equal(requests, 1);
  // The late success is the health record's only event: no timeout was recorded.
  const record = await health.libraryHealth(slowLibrary.id);
  assert.equal(record.failuresSinceSuccess, 0);
  assert.ok(record.lastSuccessAt);
});

test('a reader leaving does not cancel a started background check; a check that still fails stores nothing', async () => {
  const provider = { checkAvailability: async () => { await new Promise(resolve => setTimeout(resolve, 60));
    return { outcome: 'not_found', matchKind: 'none', recognizedExact: true }; } };
  const { lookup, answers, settle } = backgroundHarness({ provider });
  const controller = new AbortController();
  const pending = lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  assert.equal((await pending).reason, 'cancelled');
  await settle();
  const rows = await answers.readAnswers(slowLibrary.id, [{ kind: 'isbn13', value: slowBook.isbn13 }]);
  assert.deepEqual(rows.map(row => row.answer), ['not_found'], 'the definite answer was stored after the reader left');

  // Never answers: at its own deadline the background check ends, a timeout
  // in the health record and no stored answer.
  const silent = backgroundHarness({ provider: { checkAvailability: () => new Promise(() => {}) } });
  const answer = await silent.lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true });
  assert.equal(answer.reason, 'timeout');
  await silent.settle();
  assert.equal(silent.answers.size(), 0);
  assert.deepEqual((await silent.health.libraryHealth(slowLibrary.id)).failures7dByReason, { timeout: 1 });
});

// --- One check per book and library; checks nobody waits for give way -------

const catalogOperationSignal = () => catalogOperation()?.signal;
const otherBook = { bookKey: 'v1:isbn:9780140328721', isbn13: '9780140328721' };
const found = { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true };

test('a second request for the same book and library joins the running check instead of starting another', async () => {
  const observation = Promise.withResolvers();
  let requests = 0;
  const provider = { checkAvailability: () => { requests++; return observation.promise; } };
  const { lookup, answers, settle } = backgroundHarness({ provider, deadlineMs: 1_000 });
  const first = lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  const second = lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  await new Promise(resolve => setTimeout(resolve, 10));
  observation.resolve(found);
  const answers2 = await Promise.all([first, second]);
  assert.deepEqual(answers2.map(answer => answer.outcome), ['found', 'found']);
  assert.equal(requests, 1, 'one catalog check for both readers');
  assert.equal(answers2[1].requests, 0, 'the joined reader is not charged the requests');
  await settle();
  assert.equal((await answers.readAnswers(slowLibrary.id, [{ kind: 'isbn13', value: slowBook.isbn13 }])).length, 1);

  // Try again after "couldn't check": the check still running in the
  // background is joined, and its late answer reaches the reader.
  const late = Promise.withResolvers();
  let calls = 0;
  const slow = backgroundHarness({ provider: { checkAvailability: () => { calls++; return late.promise; } }, deadlineMs: 60 });
  const timedOut = await slow.lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  assert.equal(timedOut.reason, 'timeout');
  const retry = slow.lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  late.resolve(found);
  assert.equal((await retry).outcome, 'found');
  assert.equal(calls, 1, 'Try again started no second check');
  await slow.settle();
});

test('a check whose reader has gone gives way to a reader waiting for the host, and stores nothing', async () => {
  const pending = new Map();
  let aborted = 0;
  const provider = { checkAvailability: isbn => new Promise((resolve, reject) => {
    pending.set(isbn, resolve);
    catalogOperationSignal()?.addEventListener('abort', () => { aborted++; reject(coded('stopped', 'CATALOG_ABORTED')); }, { once: true });
  }) };
  const { lookup, answers, settle } = backgroundHarness({ provider, deadlineMs: 60, hostConcurrency: 1 });
  // Reader A is answered "couldn't check" and leaves; A's check runs on alone.
  const a = await lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  assert.equal(a.reason, 'timeout');
  // Reader B asks for another book on the same host (one check at a time).
  const b = lookup.lookupBook({ library: slowLibrary, book: otherBook, editionScope: 'exact', background: true, storedChecked: true });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(pending.has(otherBook.isbn13), 'B did not wait behind the abandoned check');
  assert.equal(aborted, 1, 'the abandoned check was stopped');
  pending.get(slowBook.isbn13)(found); // too late: it was cancelled
  pending.get(otherBook.isbn13)(found);
  assert.equal((await b).outcome, 'found');
  await settle();
  assert.deepEqual((await answers.readAnswers(slowLibrary.id, [{ kind: 'isbn13', value: slowBook.isbn13 }])), [], 'a cancelled check stores nothing');
  assert.equal((await answers.readAnswers(slowLibrary.id, [{ kind: 'isbn13', value: otherBook.isbn13 }])).length, 1);
});

test('at most one check per host runs on without a reader', async () => {
  let aborted = 0;
  const provider = { checkAvailability: () => new Promise((resolve, reject) => {
    catalogOperationSignal()?.addEventListener('abort', () => { aborted++; reject(coded('stopped', 'CATALOG_ABORTED')); }, { once: true });
  }) };
  const { lookup, settle } = backgroundHarness({ provider, deadlineMs: 60, hostConcurrency: 4 });
  const [a, b] = await Promise.all([slowBook, otherBook].map(book =>
    lookup.lookupBook({ library: slowLibrary, book, editionScope: 'exact', background: true, storedChecked: true })));
  assert.deepEqual([a.reason, b.reason], ['timeout', 'timeout']);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(aborted, 1, 'the second reader-less check was cancelled; the first runs on');
  await settle();
});

test('a reader-less check that has ended leaves no entry behind: a later one still runs on and stores its answer', async () => {
  const resolvers = new Map();
  const provider = { checkAvailability: isbn => new Promise(resolve => { resolvers.set(isbn, resolve); }) };
  const { lookup, answers, settle } = backgroundHarness({ provider, deadlineMs: 40 });
  const hostless = { id: 'vega:hostless', platform: 'vega' };
  const first = await lookup.lookupBook({ library: hostless, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  assert.equal(first.reason, 'timeout');
  resolvers.get(slowBook.isbn13)(found);
  await settle();
  // The first check has ended. A second reader-less check is not mistaken for
  // the host's second one (it would be cancelled and store nothing).
  const second = await lookup.lookupBook({ library: hostless, book: otherBook, editionScope: 'exact', background: true, storedChecked: true });
  assert.equal(second.reason, 'timeout');
  await new Promise(resolve => setTimeout(resolve, 5));
  resolvers.get(otherBook.isbn13)(found);
  await settle();
  assert.equal((await answers.readAnswers(hostless.id, [{ kind: 'isbn13', value: otherBook.isbn13 }])).length, 1);
});

test('a reader who joined a check that was cancelled asks again within its own first deadline, not a fresh one', async () => {
  const provider = { checkAvailability: () => new Promise((_resolve, reject) => {
    catalogOperationSignal()?.addEventListener('abort', () => reject(coded('stopped', 'CATALOG_ABORTED')), { once: true });
  }) };
  const { lookup, settle } = backgroundHarness({ provider, deadlineMs: 120 });
  const leaving = new AbortController();
  const first = lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', signal: leaving.signal, storedChecked: true });
  await new Promise(resolve => setTimeout(resolve, 5));
  const joinedAt = Date.now();
  const second = lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', storedChecked: true });
  await new Promise(resolve => setTimeout(resolve, 80));
  // The first reader leaves; the check it ran stops, so the second asks again.
  leaving.abort();
  await first.catch(() => {});
  const answer = await second;
  assert.equal(answer.reason, 'timeout');
  const took = Date.now() - joinedAt;
  assert.ok(took < 170, `answered at ${took} ms, within its own 120 ms deadline (not 80 + 120 ms)`);
  await settle();
});

test('Try again that joins a background check about to time out starts a new check within the reader’s own deadline', async () => {
  let calls = 0;
  const provider = { checkAvailability: () => { calls++; return calls === 1 ? new Promise(() => {}) : Promise.resolve(found); } };
  const { lookup, answers, settle } = backgroundHarness({ provider, deadlineMs: 60 });
  const first = await lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  assert.equal(first.reason, 'timeout');
  // The background check ends at 120 ms; the reader presses Try again just before.
  await new Promise(resolve => setTimeout(resolve, 45));
  const retry = await lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  assert.equal(retry.outcome, 'found', 'not the old check’s timeout');
  assert.equal(calls, 2, 'one new check, after the old one settled');
  await settle();
  assert.equal((await answers.readAnswers(slowLibrary.id, [{ kind: 'isbn13', value: slowBook.isbn13 }])).length, 1);
  // With too little of the reader's own time left, the old timeout is the answer.
  let late = 0;
  const tight = backgroundHarness({ provider: { checkAvailability: () => { late++; return new Promise(() => {}); } }, deadlineMs: 60 });
  await tight.lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true });
  await new Promise(resolve => setTimeout(resolve, 45));
  const short = await tight.lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true,
    deadlineAt: Date.now() + 25 });
  assert.equal(short.reason, 'timeout');
  assert.equal(late, 1);
  await tight.settle();
});

test('a book-page check, background included, ends by the caller’s finishBy', async () => {
  const provider = { checkAvailability: () => new Promise(() => {}) };
  const { lookup, settle } = backgroundHarness({ provider, deadlineMs: 100 });
  const startedAt = Date.now();
  const answer = await lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact', background: true, storedChecked: true,
    finishBy: startedAt + 130 });
  assert.equal(answer.reason, 'timeout');
  await settle();
  // Without finishBy it would run on until twice its deadline (200 ms).
  assert.ok(Date.now() - startedAt < 190, `ended at ${Date.now() - startedAt} ms`);
  // finishBy before the reader's own deadline also brings the answer forward.
  const early = Date.now();
  await lookup.lookupBook({ library: slowLibrary, book: otherBook, editionScope: 'exact', background: true, storedChecked: true, finishBy: early + 40 });
  await settle();
  assert.ok(Date.now() - early < 90);
});

test('without background the deadline ends the check, as for /availability', async () => {
  let finished = false;
  const provider = { checkAvailability: async () => { await new Promise(resolve => setTimeout(resolve, 150)); finished = true;
    return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }; } };
  const { lookup, answers, settle } = backgroundHarness({ provider });
  const answer = await lookup.lookupBook({ library: slowLibrary, book: slowBook, editionScope: 'exact' });
  assert.equal(answer.reason, 'timeout');
  await settle();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(answers.size(), 0);
  assert.equal(finished, true, 'the adapter call itself settles, but nothing is stored');
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
  // The first catalog request waits until the first reader leaves; any later
  // one answers at once. No timer decides the order.
  let fetches = 0, fetched;
  const requested = new Promise(resolve => { fetched = resolve; });
  global.fetch = async (url, options) => new Promise((resolve, reject) => {
    fetches++;
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    if (fetches > 1) resolve(response(url, 'page'));
    fetched();
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
  await requested;
  const second = lookup.lookupBook({ library, book, editionScope: 'exact' });
  await new Promise(resolve => setImmediate(resolve));
  leaving.abort();
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
    assert.deepEqual(settled, [{ done: true, notAttempted: ['a'], unmatched: [], failed: [] }], platform);
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

// 15 November 2026: a slow academic catalog's timed-out cold lookup was
// recorded with `requests: 0` although its request had been sent and was
// cancelled at the deadline. A timeout must report what actually went out.
test('a lookup that times out still reports the catalog requests it sent', async () => {
  let sent = 0;
  global.fetch = (url, options) => { sent++; return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); };
  const provider = { checkAvailability: async () => { await getText('https://slow.example/search?q=1', { retries: 0 }); return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }; } };
  const { lookup } = harness({ providerFor: () => provider });
  const answer = await lookup.lookupBook({ library: { id: 'vega:slow', platform: 'vega', catalogUrl: 'https://slow.example' },
    book: { bookKey: 'k', isbn13: '9788173711466' }, editionScope: 'exact', deadlineAt: Date.now() + 60 });
  assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'timeout']);
  assert.equal(sent, 1);
  assert.equal(answer.requests, 1);
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

// Captured 2026-11-13 from The Seattle Public Library's gateway (keyword "the
// hobbit", first page of 25, trimmed to the fields the adapter reads) and Open
// Library's first edition page for each work, trimmed likewise.
test('BiblioCommons marking reads every print row of its one search, and marks a work only by its own editions’ ISBNs', async () => {
  const { getProvider } = await import('../providers/index.js');
  const { createWorkDiscovery } = await import('../workDiscovery.js');
  const calls = [];
  const gateway = read('bibliocommons', 'seattle-search-the-hobbit.json');
  global.fetch = async url => { calls.push(url); return response(url, gateway); };
  const editions = { OL27482W: JSON.parse(read('openlibrary', 'OL27482W-editions.json')), OL219602W: JSON.parse(read('openlibrary', 'OL219602W-editions.json')) };
  const discovery = createWorkDiscovery({ read: async path => editions[path.match(/\/works\/(OL\d+W)\//)?.[1]] || { size: 0, entries: [] } });
  const work = (workId, title, authors) => ({ bookKey: `v1:openlibrary:${workId}`, workId, title, authors,
    profile: discovery.profile({ bookKey: `v1:openlibrary:${workId}`, workId, title, authors, languages: ['eng'] }) });
  const books = [
    work('OL27482W', 'The Hobbit', ['J.R.R. Tolkien']),
    work('OL219602W', 'The Hobbit', ['Charles Dixon', 'Sean Deming', 'J.R.R. Tolkien']),
    // Same title, no ISBN known: never marked by title.
    work('OL19659526W', 'The Hobbit', []),
    // Same title and author, ISBNs the rows do not show: not marked.
    { ...work('OL24180247W', 'The hobbit', ['Patty Kempshall']), profile: profileOf({ isbn13: '9780582005808', title: 'The hobbit', authors: ['Patty Kempshall'] }) },
  ];
  const library = { id: 'bc:seattle', platform: 'bc', slug: 'seattle', capabilities: ['availability'], catalogUrl: 'https://seattle.bibliocommons.com' };
  const items = await collect(harness({ providerFor: getProvider }).lookup.markResults({ library, query: 'the hobbit', books, deadlineAt: Date.now() + 5_000 }));
  assert.equal(calls.length, 1, 'one gateway search');
  assert.deepEqual(items.filter(item => !item.done).map(item => [item.bookKey, item.outcome, item.matchedIsbn13, item.recordId]), [
    // The novel's first print row is the 16th result: the first ten are audiobooks, DVDs and graphic novels.
    ['v1:openlibrary:OL27482W', 'found', '9780618968633', 'S246C395812'],
    // 9780345445605 is the graphic novel's ISBN (its own Open Library work), not the novel's.
    ['v1:openlibrary:OL219602W', 'found', '9780345445605', 'S246C1092054'],
  ]);
  assert.deepEqual(items.at(-1), { done: true, notAttempted: ['v1:openlibrary:OL19659526W'], unmatched: ['v1:openlibrary:OL24180247W'], failed: [] });
});

test('edition profiles may arrive after the catalog’s part of the run, within the run’s deadline', async () => {
  const platforms = { ...UNPACED, vufind: { ...UNPACED.vufind, results: { ...UNPACED.vufind.results, deadlineMs: 30 } } };
  const provider = { checkAvailability: async () => ({}), searchResultRows: async () => [{ recordId: '1', title: 'Wings of fire', isbn: '9788173711466' }] };
  const { lookup, guard } = harness({ providerFor: () => provider, platforms });
  // Open Library reads are paced one at a time: the ninth profile of a page arrives seconds later.
  const late = new Promise(resolve => setTimeout(() => resolve(kalamProfile()), 150));
  const items = await collect(lookup.markResults({ library: { id: 'vufind:late', platform: 'vufind', catalogUrl: 'https://late.example' }, query: 'wings',
    books: [{ bookKey: 'a', profile: late }, { bookKey: 'b', profile: new Promise(() => {}) }], deadlineAt: Date.now() + 600 }));
  assert.deepEqual(items.map(item => item.done ? item : [item.bookKey, item.outcome]), [['a', 'found'], { done: true, notAttempted: ['b'], unmatched: [], failed: [] }]);
  const slot = guard.tryStartMarking('late.example');
  assert.ok(slot, 'the host slot was freed before waiting on profiles');
  slot();
});

test('every book check writes one library_check log line with its reason, never the book', async () => {
  const lines = [];
  const pending = [];
  const answers = createMemoryAnswerStore();
  const recorder = createLookupRecorder({ answers, health: createMemoryHealthRecord(), defer: task => pending.push(task()), log: line => lines.push(line) });
  let mode = 'found';
  const provider = { checkAvailability: async () => {
    if (mode === 'blocked') throw Object.assign(new Error('robots'), { code: 'CATALOG_ROBOTS_DISALLOWED' });
    return mode === 'found' ? { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true } : { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
  } };
  const lookup = createCatalogLookup({ providerFor: () => provider, recorder, platforms: UNPACED, env: { CATALOG_LOOKUP_V2: 'all' } });
  const library = { id: 'koha:log', platform: 'koha', catalogUrl: 'https://k.example' };
  const book = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['Kalam'] };
  await lookup.lookupBook({ library, book, editionScope: 'exact' });
  await Promise.all(pending);
  // The stored answer: the same line, stored, no request.
  await lookup.lookupBook({ library, book, editionScope: 'exact' });
  mode = 'blocked';
  await lookup.lookupBook({ library: { ...library, id: 'koha:log2' }, book, editionScope: 'exact' });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map(line => [line.event, line.outcome, line.reason, line.stored, line.bookKeyKind]), [
    ['library_check', 'found', null, false, 'isbn'],
    ['library_check', 'found', null, true, 'isbn'],
    ['library_check', 'couldnt_check', 'blocked', false, 'isbn'],
  ]);
  assert.deepEqual(Object.keys(lines[0]).sort(), ['afterReply', 'bookKeyKind', 'durationMs', 'errorCode', 'event', 'evidence', 'host', 'libraryId', 'lookupKind',
    'outcome', 'platform', 'reason', 'requests', 'stored'].sort());
  assert.equal(lines[0].evidence, 'exact_isbn');
  assert.equal(lines[0].lookupKind, 'exact_isbn');
  assert.equal(lines[0].host, 'k.example');
  assert.equal(lines[2].errorCode, 'CATALOG_ROBOTS_DISALLOWED');
  const text = JSON.stringify(lines);
  assert.ok(!/Wings|Kalam|9788173711466|OL\d+W/.test(text), 'no title, author, ISBN or work ID');
});

// --- Title-and-author finds (owner decision, 19 November 2026) ---------------

test('a title-and-author match in this library\'s catalog is found, stored for the work only, and logged as title_author evidence', async () => {
  const lines = [];
  const row = { recordId: '77', title: 'Wings of fire : an autobiography', authors: ['Kalam, A. P. J. Abdul'],
    catalogUrl: 'https://k.example/cgi-bin/koha/opac-detail.pl?biblionumber=77', catalogLinkKind: 'record',
    observation: { outcome: 'in_catalog', recognizedExact: true, catalogUrl: 'https://k.example/cgi-bin/koha/opac-detail.pl?biblionumber=77', catalogLinkKind: 'record' } };
  const asked = [];
  const provider = { findBookCandidates: async () => [row], checkAvailability: async isbn => { asked.push(isbn); return { outcome: 'not_found', matchKind: 'none', recognizedExact: true }; } };
  const { lookup, answers, settle } = harness({ providerFor: () => provider, log: line => lines.push(line) });
  const library = { id: 'koha:ta', platform: 'koha', catalogUrl: 'https://k.example' };
  const book = { bookKey: 'v1:openlibrary:OL1037811W', workId: 'OL1037811W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };
  const profile = profileOf({ isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] });
  const answer = await lookup.lookupBook({ library, book, profile });
  // The same answer as an ISBN find; only the evidence differs.
  assert.deepEqual([answer.outcome, answer.evidence, answer.matchedIsbn13], ['found', 'title_author', undefined]);
  assert.equal(answer.catalogLinkKind, 'record');
  // A find ends the check: no ISBN lookup after it.
  assert.deepEqual(asked, []);
  await settle();
  assert.equal(answers.size(), 1);
  const stored = await answers.readAnswers('koha:ta', [{ kind: 'ol_work', value: 'OL1037811W' }, { kind: 'isbn13', value: '9788173711466' }]);
  assert.deepEqual(stored.map(r => [r.kind, r.answer, r.evidence]), [['ol_work', 'found', 'title_author']]);
  const again = await lookup.lookupBook({ library, book, profile });
  assert.deepEqual([again.outcome, again.source], ['found', 'stored']);
  // The log line keeps the evidence apart, and never a title, ISBN or work ID.
  assert.equal(lines[0].evidence, 'title_author');
  assert.equal(lines[0].outcome, 'found');
  const text = JSON.stringify(lines);
  for (const secret of ['Wings', 'Kalam', '9788173711466', 'OL1037811W', '77']) assert.ok(!text.includes(secret), secret);
});

test('title-and-author: another author, no author, a volume or a union record held elsewhere stays couldn\'t check, never found or not found', async () => {
  const library = { id: 'koha:tb', platform: 'koha', catalogUrl: 'https://k.example' };
  const book = { bookKey: 'v1:openlibrary:OL1W', workId: 'OL1W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] };
  const profile = { ...profileOf({ isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] }), language: 'eng' };
  const held = { outcome: 'in_catalog', recognizedExact: true };
  const cases = {
    'another author': { findBookCandidates: async () => [{ recordId: '1', title: 'Wings of Fire', authors: ['Sutherland, Tui T.'], observation: held }] },
    'no author': { isbnLookup: false, searchCatalog: async () => [{ recordId: '2', title: 'Wings of Fire', observation: held }] },
    'a volume': { isbnLookup: false, searchCatalog: async () => [{ recordId: '3', title: 'Wings of Fire, Part 1', authors: ['Kalam, A. P. J. Abdul'], observation: held }] },
    // A union catalog row: the record page shows another member's copy, which the adapter refuses.
    'union record': { isbnLookup: false, searchCatalog: async () => [{ recordId: '4', title: 'Wings of Fire', authors: ['Kalam, A. P. J. Abdul'] }],
      resolveCatalogRecord: async () => { throw coded('Catalog did not confirm this institution’s holding', 'CATALOG_UNRECOGNIZED'); } },
  };
  for (const [name, provider] of Object.entries(cases)) {
    const { lookup, answers, settle } = harness({ providerFor: () => ({ checkAvailability: async () => ({ outcome: 'not_found', matchKind: 'none', recognizedExact: true }), ...provider }) });
    const answer = await lookup.lookupBook({ library, book, profile });
    assert.equal(answer.outcome, 'couldnt_check', name);
    assert.ok(['unconfirmed', 'unrecognized'].includes(answer.reason), `${name}: ${answer.reason}`);
    await settle();
    assert.equal(answers.size(), 0, name);
  }
});
