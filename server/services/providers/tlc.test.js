import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_CONFIG, HITS_PER_PAGE, SEARCH_FIELD, librarySearch, parseTlcSearch, recordUrl, searchBody, searchTerm, tlcSite } from './tlc.js';
import { clearHttpCache, USER_AGENT } from './http.js';
import { getProvider } from './index.js';
import { searchLibraryBook } from '../libraryBookSearch.js';
import { formatKind } from '../rowFormats.js';
import { platformFor, hostFor } from '../catalog-lookup/platforms.js';
import { getAllLibraries, getLibraryById } from '../directory.js';

// Saved TLC answers (server/test/fixtures/tlc/): the research's rows cut to
// title, author and format (23 November 2026), and five live answers from the
// adapter itself (24 November 2026: LAPL and Frederick, rows cut to id,
// title, author, format and standard numbers; holdings removed).
const fixture = name => JSON.parse(fs.readFileSync(new URL(`../../test/fixtures/tlc/${name}`, import.meta.url), 'utf8'));
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

const lapl = { id: 'tlc:test-lapl', platform: 'tlc', baseUrl: 'https://ls2pac.lapl.org/', tlcConfig: 'LAPL', tlcProduct: 'carl-connect' };
const fcpl = { id: 'tlc:test-fcpl', platform: 'tlc', baseUrl: 'https://catalog.fcpl.org/', tlcConfig: 'default', tlcProduct: 'carl-connect' };
const owl = { id: 'tlc:test-owl', platform: 'tlc', baseUrl: 'https://owl.tlcdelivers.com/', tlcConfig: 'kpl', tlcProduct: 'ls2pac', tlcConfigInLinks: true };

function serve(...answers) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    if (answer instanceof Error) throw answer;
    if (answer instanceof Response) return answer;
    return new Response(typeof answer === 'string' ? answer : JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
const coded = async (promise, code) => assert.rejects(promise, error => error.code === code);

test('one any-field search: a single cold POST to /search with the site\'s configuration, no cookie, no redirect followed', async () => {
  const calls = serve(fixture('lapl-live-remarkably-bright-creatures.json'));
  const rows = await librarySearch(lapl, 'Remarkably Bright Creatures');
  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(url, 'https://ls2pac.lapl.org/search');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers['User-Agent'], USER_AGENT);
  assert.equal(options.headers['Ls2pac-config-type'], 'pac');
  assert.equal(options.headers['Ls2pac-config-name'], 'LAPL');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers.Cookie, undefined);
  assert.deepEqual(JSON.parse(options.body), { searchTerm: 'Remarkably Bright Creatures', hitsPerPage: HITS_PER_PAGE, startIndex: 0, sortCriteria: 'Relevancy',
    facetFilters: [], branchFilters: [], dbCodes: [], searchedFromKids: false, frbrSearch: false });
  assert.equal(SEARCH_FIELD, 'AnyField');
  assert.equal(rows.length, 23);
  assert.deepEqual(rows[0], { recordId: '3865570863', title: 'Remarkably bright creatures : a novel', authors: ['Van Pelt, Shelby'],
    isbns: ['9780063204157', '9780063204164', '0063204150', '0063204169'], format: 'Book', catalogUrl: 'https://ls2pac.lapl.org/?section=resource&resourceid=3865570863', catalogLinkKind: 'record' });
  // Every row has an id, a title, a format the app reads, and the record's own link.
  for (const row of rows) {
    assert.match(row.recordId, /^\d+$/);
    assert.ok(row.title && row.catalogUrl.endsWith(`resourceid=${row.recordId}`));
    assert.notEqual(formatKind(row.format), 'other', row.format);
  }
});

test('the site configuration: the stored name, the default where none could be read, and record links in each product\'s form', () => {
  assert.equal(tlcSite({ ...fcpl, tlcConfig: undefined }).config, DEFAULT_CONFIG);
  assert.equal(DEFAULT_CONFIG, 'default');
  assert.equal(recordUrl(tlcSite(owl), '42', { product: 'ls2pac', configInLinks: true }), 'https://owl.tlcdelivers.com/?config=kpl#section=resource&resourceid=42');
  assert.equal(recordUrl(tlcSite(owl), '42', { product: 'ls2pac' }), 'https://owl.tlcdelivers.com/#section=resource&resourceid=42');
  assert.equal(recordUrl(tlcSite(fcpl), '42', { product: 'carl-connect' }), 'https://catalog.fcpl.org/?section=resource&resourceid=42');
  for (const bad of [{ tlcConfig: 'a b' }, { tlcConfig: '' }, { tlcBranchFilters: '4' }, { tlcBranchFilters: [4] }, { baseUrl: 'https://catalog.fcpl.org/pac/' },
    { baseUrl: 'http://catalog.fcpl.org/' }, { baseUrl: undefined }]) {
    assert.throws(() => tlcSite({ ...fcpl, ...bad }), error => error.code === 'CATALOG_CONFIGURATION_REQUIRED', JSON.stringify(bad));
  }
  // An http catalog only on its reviewed origin (providers/public-catalog-http-origins.json).
  const tangipahoa = getLibraryById('tlc:tangipahoa');
  assert.equal(tlcSite(tangipahoa).origin, 'http://opac.tangipahoa.lib.la.us:8080');
  assert.throws(() => tlcSite({ ...tangipahoa, id: 'tlc:other' }), error => error.code === 'CATALOG_CONFIGURATION_REQUIRED');
});

test('the term is plain words: query syntax becomes spaces, words and inner hyphens stay', () => {
  assert.equal(searchTerm('Oh, the Places You\'ll Go!'), 'Oh, the Places You\'ll Go');
  assert.equal(searchTerm('author: "Kinney" -wimpy Spider-Man [a TO z] (x) ~y* ?'), 'author Kinney wimpy Spider-Man a TO z x y');
  assert.equal(searchTerm('Cien años de soledad'), 'Cien años de soledad');
  assert.equal(searchTerm('9780385547345'), '9780385547345');
  assert.deepEqual(searchBody('x', ['4']).branchFilters, ['4']);
});

test('a member limited to its branches sends them; the catalog then lists what those branches hold, with its e-books', async () => {
  const calls = serve(fixture('fcpl-live-lessons-in-chemistry-branch-4.json'));
  const rows = await librarySearch({ ...fcpl, tlcBranchFilters: ['4'] }, 'Lessons in Chemistry');
  assert.deepEqual(JSON.parse(calls[0].options.body).branchFilters, ['4']);
  const all = parseTlcSearch(fixture('fcpl-live-lessons-in-chemistry.json'), tlcSite(fcpl));
  const ids = new Set(rows.map(row => row.recordId));
  // The large print and the Spanish edition are not at branch 4; the e-book and e-audiobook stay.
  assert.equal(ids.has('150824278'), false);
  assert.equal(ids.has('403599615'), false);
  for (const id of ['39346659', '414024703', '45208599', '45211308']) assert.ok(ids.has(id), id);
  assert.ok(all.some(row => row.recordId === '150824278'));
});

test('an empty answer is an answer; anything the app cannot read is never "not found"', async () => {
  serve(fixture('fcpl-live-no-hits.json'));
  assert.deepEqual(await librarySearch(fcpl, 'Qzxvbn Wrrtplk Mmnoqz'), []);
  for (const body of ['<html><body>Server error</body></html>', { totalHits: 3 }, { totalHits: 3, resources: [] }, { resources: 'none' }, 'null',
    { totalHits: 2, resources: [{ id: 1, name: 'x' }, { id: 2 }] }]) {
    clearHttpCache();
    serve(body);
    await coded(librarySearch(fcpl, 'Lessons in Chemistry'), 'CATALOG_UNRECOGNIZED');
  }
});

test('walls, refusals, moves, server errors and timeouts are "couldn\'t check", and a move is never followed', async () => {
  const cases = [
    [new Response('denied', { status: 403 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('slow down', { status: 429 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('<html><title>Just a moment...</title></html>', { status: 200 }), 'CATALOG_PROVIDER_BLOCKED'],
    [new Response('', { status: 302, headers: { location: 'https://elsewhere.example/search' } }), 'CATALOG_UNAVAILABLE'],
    [new Response('oops', { status: 500 }), 'CATALOG_UNAVAILABLE'],
    [Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), 'CATALOG_UNAVAILABLE'],
    [Object.assign(new Error('request deadline exceeded'), { name: 'AbortError' }), 'CATALOG_TIMEOUT'],
  ];
  for (const [answer, code] of cases) {
    clearHttpCache();
    const calls = serve(answer);
    await coded(librarySearch(fcpl, 'Lessons in Chemistry'), code);
    assert.equal(calls.length, 1, code);
  }
  serve(fixture('fcpl-live-no-hits.json'));
  await coded(librarySearch(fcpl, '!!! ()'), 'CATALOG_QUERY_UNSUPPORTED');
});

test('live-only: nothing is cached between checks, but two readers at once share the one request', async () => {
  const calls = serve(fixture('fcpl-live-lessons-in-chemistry.json'));
  await librarySearch(getLibraryById('tlc:fcpl'), 'Lessons in Chemistry');
  await librarySearch(getLibraryById('tlc:fcpl'), 'Lessons in Chemistry');
  assert.equal(calls.length, 2);
  await Promise.all([librarySearch(getLibraryById('tlc:fcpl'), 'Atomic Habits'), librarySearch(getLibraryById('tlc:fcpl'), 'Atomic Habits')]);
  assert.equal(calls.length, 3);
});

test('the book check: the provider\'s one search finds the book, the ISBN\'s row first, every format kept, films and music last', async () => {
  const provider = getProvider(getLibraryById('tlc:lapl'));
  assert.equal(provider.searchBy, undefined);
  serve(fixture('lapl-live-remarkably-bright-creatures.json'));
  const found = await searchLibraryBook(provider, { title: 'Remarkably Bright Creatures', authors: ['Shelby Van Pelt'], isbn13: '9780063204171' });
  assert.equal(found.outcome, 'in_catalog');
  assert.equal(found.matchKind, 'verified_work');
  // Five rows pass the title rule (the book in four formats, and a summary).
  assert.equal(found.matches.length, 5);
  // The row carrying the book's ISBN (the e-book) is first, with its own record link.
  assert.deepEqual(found.matches[0], { title: 'Remarkably bright creatures : a novel', author: 'Van Pelt, Shelby', url: 'https://ls2pac.lapl.org/?section=resource&resourceid=4010830705' });
  assert.equal(found.catalogUrl, 'https://ls2pac.lapl.org/?section=resource&resourceid=4010830705');

  // A scanned ISBN with no title known: the ISBN's digits are the term, and the record found by them is a find.
  clearHttpCache();
  const calls = serve(fixture('lapl-live-isbn-9780385547345.json'));
  const byIsbn = await searchLibraryBook(provider, { title: '' }, { readerIsbn: '9780385547345' });
  assert.equal(JSON.parse(calls[0].options.body).searchTerm, '9780385547345');
  assert.equal(byIsbn.matchKind, 'exact_isbn');
  assert.equal(byIsbn.matches[0].title, 'Lessons in chemistry : a novel');

  // The research rows: guides that LAPL lists first still pass, and the novel is first on the card.
  clearHttpCache();
  serve(fixture('lapl-02-to-kill-a-mockingbird.json'));
  const mockingbird = await searchLibraryBook(provider, { title: 'To Kill a Mockingbird', authors: ['Harper Lee'] });
  assert.equal(mockingbird.outcome, 'in_catalog');
  assert.match(mockingbird.matches[0].title, /^To kill a mockingbird/i);
  assert.equal(mockingbird.matches[0].author, 'Lee, Harper');

  // Nothing matching in a well-formed answer is "not found"; a failed search is not.
  clearHttpCache();
  serve(fixture('fcpl-live-no-hits.json'));
  assert.deepEqual(await searchLibraryBook(getProvider(getLibraryById('tlc:fcpl')), { title: 'Qzxvbn Wrrtplk Mmnoqz' }), { outcome: 'no_match' });
  clearHttpCache();
  serve(new Response('oops', { status: 500 }));
  assert.deepEqual(await searchLibraryBook(getProvider(getLibraryById('tlc:fcpl')), { title: 'Lessons in Chemistry' }), { outcome: 'unknown', errorCode: 'CATALOG_UNAVAILABLE' });
});

test('pacing: one TLC descriptor, each library its own host, the hosts\' own Crawl-delay through the robots policy', () => {
  const platform = platformFor(getLibraryById('tlc:lapl'));
  assert.equal(platform.id, 'tlc');
  assert.equal(platform.results.strategy, 'search');
  assert.ok(platform.perMinute > 0 && platform.perMinute <= 30);
  assert.equal(hostFor(getLibraryById('tlc:lapl')), 'ls2pac.lapl.org');
  assert.equal(hostFor(getLibraryById('tlc:kingsport')), 'owl.tlcdelivers.com');
  assert.equal(hostFor(getLibraryById('tlc:tangipahoa')), 'opac.tangipahoa.lib.la.us:8080');
  // Every TLC entry can be searched as it stands.
  for (const entry of getAllLibraries().filter(item => item.platform === 'tlc')) assert.ok(tlcSite(entry).origin, entry.id);
});

test('an empty list is not found only with the catalog\'s own count of 0; without a count it is couldn\'t check', () => {
  const site = tlcSite(fcpl);
  assert.deepEqual(parseTlcSearch(fixture('fcpl-live-no-hits.json'), site), []);
  assert.deepEqual(parseTlcSearch({ totalHits: 0, resources: [] }, site), []);
  for (const answer of [{ resources: [] }, { totalHits: '0x', resources: [] }, { totalHits: null, resources: [] }, { totalHits: 3, resources: [] }]) {
    assert.throws(() => parseTlcSearch(answer, site), { code: 'CATALOG_UNRECOGNIZED' }, JSON.stringify(answer));
  }
});
