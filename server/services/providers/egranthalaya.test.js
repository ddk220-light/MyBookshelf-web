import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAvailability, clearEgranthalayaRefusals, clusterIsbnQuery, hyphenatedIsbn, isEmptyRecordPage, parseCatalogSearch, parseHoldings, parseSearch, librarySearch, resolveCatalogRecord, searchCatalog, searchForm, setEmptyRecordRetryDelayForTests } from './egranthalaya.js';
import { clearHttpCache, USER_AGENT, withCatalogOperation } from './http.js';

const fixture = (name) => fs.readFileSync(new URL(`../../test/fixtures/egranthalaya/${name}.html`, import.meta.url), 'utf8');
const isbn = '9788131313459';
const library = {
  id: 'egranthalaya:publiclibraries-hkmslib', name: 'Harekrushna Mahtab State Library',
  baseUrl: 'https://eg4.nic.in', egranthalayaCluster: 'PUBLICLIBRARIES',
  egranthalayaLibraryCode: 'HKMSLIB', egranthalayaReferenceOnly: true,
};
const context = { isbn, libraryCode: 'HKMSLIB', libraryName: library.name, recordId: '519750', referenceOnly: true, format: 'Print' };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); clearEgranthalayaRefusals(); });
const response = (body, url, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300, status, url, headers: new Headers(headers), text: async () => body,
});

// The member's form page for GETs, `search` (a page or a function of the
// POST's fields) for searches, holdings for record pages.
function successfulFetch(calls, { search = 'search-hit', form = fixture('form') } = {}) {
  return async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('Details.aspx')) return response(fixture('holdings-available'), url);
    if (options.method !== 'POST') return response(form, url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/; HttpOnly; Secure' } });
    const page = typeof search === 'function' ? search(new URLSearchParams(options.body)) : fixture(search);
    return typeof page === 'object' ? page : response(page, url);
  };
}
const posts = calls => calls.filter(call => call.options.method === 'POST').map(call => new URLSearchParams(call.options.body));
const gets = calls => calls.filter(call => call.options.method !== 'POST' && !call.url.includes('Details.aspx')).length;
// A recognized HKMSLIB result page with `count` records and no rows.
const hkmsZero = (count = 0) => memberPage(fixture('form'), 'HKMSLIB').replace('</form>', `<span id="Label37">Your Search Returned ${count} Record(s)</span></form>`);

test('ISBN hyphenation uses official Indian and English registration ranges and validates checksum', () => {
  assert.equal(hyphenatedIsbn(isbn), '978-81-313-1345-9');
  assert.equal(hyphenatedIsbn('9788173711466'), '978-81-7371-146-6');
  assert.equal(hyphenatedIsbn('9788172234980'), '978-81-7223-498-0');
  assert.equal(hyphenatedIsbn('9780140328721'), '978-0-14-032872-1');
  assert.equal(hyphenatedIsbn('813131345X'), '978-81-313-1345-9');
  assert.equal(hyphenatedIsbn('9788131313458'), null);
  assert.equal(hyphenatedIsbn('9784103534228'), null); // unbundled Japanese registration group
});

test('full anonymous form replay selects one library, the catalog\'s own search field and match, and omits other actions', () => {
  const form = searchForm(fixture('form'), { libraryCode: 'HKMSLIB', query: '978-81-313-1345-9' });
  assert.equal(form.get('__VIEWSTATE'), 'fixture-state');
  assert.equal(form.get('DDL_Library'), 'HKMSLIB');
  assert.equal(form.get('DDL_Field'), 'ALL');
  assert.equal(form.get('DDL_Boolean'), 'LIKE');
  assert.equal(form.get('txt_Search'), '978-81-313-1345-9');
  assert.equal(form.get('Basic_Search_Bttn'), 'Search');
  assert.equal(form.get('txtPassword'), '');
  assert.equal(form.has('bttn_LogIn'), false);
  assert.equal(form.has('AccordionPaneUnion_content$CB_Union'), false);
  assert.equal(form.has('HomeBttn'), false);
  assert.equal(form.has('hfArtSource'), true); // nonobvious hidden fields are required by eG4
  assert.equal(searchForm(fixture('form'), { libraryCode: 'All Libraries', query: isbn }), null);
  assert.equal(searchForm(fixture('form'), { libraryCode: 'MISSING', query: isbn }), null);
  assert.equal(searchForm('<h1>Please log in</h1>', { libraryCode: 'HKMSLIB', query: isbn }), null);
  const title = searchForm(fixture('form'), { libraryCode: 'HKMSLIB', query: 'Wings of Fire', field: 'TITLE' });
  assert.equal(title.get('DDL_Field'), 'TITLE');
  assert.equal(searchForm(fixture('form'), { libraryCode: 'HKMSLIB', query: '1 2', boolean: 'OR' }).get('DDL_Boolean'), 'OR');
  for (const options of [{ field: 'ACCESSION_NO' }, { boolean: 'AND' }, { field: 'TITLE', boolean: 'SW' }]) {
    assert.equal(searchForm(fixture('form'), { libraryCode: 'HKMSLIB', query: 'x', ...options }), null);
  }
  assert.equal(searchForm(fixture('form').replace('<option value="OR">Any Word</option>', ''), { libraryCode: 'HKMSLIB', query: 'x', boolean: 'OR' }), null);
});

test('search trusts only a record ISBN and the selected library, never query echoes', () => {
  assert.deepEqual(parseSearch(fixture('search-hit'), context), { kind: 'record', recordId: '519750', format: 'Print' });
  const wrong = fixture('search-hit').replace(/978-81-313-1345-9/g, '978-81-7223-498-0');
  assert.deepEqual(parseSearch(`<input value="${isbn}">${wrong}`, context), { kind: 'unconfirmed' });
  assert.equal(parseSearch(fixture('search-hit'), { ...context, libraryCode: 'OTHER' }), null);
  assert.deepEqual(parseSearch(fixture('search-empty'), { ...context, libraryCode: 'CCLSZJYNGR' }), { kind: 'empty' });
  assert.equal(parseSearch('There is an error on the Page', context), null);
  assert.deepEqual(parseSearch(fixture('search-hit').replace('1  Record(s)', '21  Record(s)'), context), { kind: 'unconfirmed' });
});

test('real public holdings fixture preserves exact ISBN, one library, count, shelf and reference restriction', () => {
  assert.deepEqual(parseHoldings(fixture('holdings-available'), context), {
    outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true,
    availableCopies: 1, totalCopies: 1, callNumber: 'BC SRI-K', format: 'Print (reference use only)',
    locations: [{ name: 'Harekrushna Mahtab State Library — SLIC', status: 'available' }],
  });
  assert.equal(parseHoldings(fixture('holdings-available'), { ...context, isbn: '9788172234980' }), null);
  assert.equal(parseHoldings(fixture('holdings-available'), { ...context, libraryCode: 'OTHER' }), null);
  assert.equal(parseHoldings(fixture('holdings-available'), { ...context, recordId: '999' }), null);
});

test('status and completeness are conservative: unfamiliar, truncated and paginated holdings are not zero availability', () => {
  const source = fixture('holdings-available');
  const issued = source.replace('>Available<', '>Issued<');
  assert.equal(parseHoldings(issued, context).outcome, 'none_available');
  assert.equal(parseHoldings(source.replace('>Available<', '>Processing<'), context).outcome, 'in_catalog');
  assert.equal(parseHoldings(issued.replace('Total Holding Records : 1', 'Total Holding Records : 2'), context).outcome, 'in_catalog');
  const incomplete = parseHoldings(source.replace('Total Holding Records : 1', 'Total Holding Records : 2'), context);
  assert.equal(incomplete.outcome, 'available');
  assert.equal(incomplete.totalCopies, undefined);
  assert.equal(incomplete.availableCopies, undefined);
  assert.equal(parseHoldings(source.replace('>Status<', '>Unexpected<'), context), null);
});


function memberPage(source, code) {
  return source.replace(/<option selected="selected" value="All Libraries">/, '<option value="All Libraries">')
    .replace(new RegExp(`<option value="${code}">`), `<option selected="selected" value="${code}">`);
}

const upIsbn = '9788173711466';
const upLibrary = {
  id: 'egranthalaya:uplibraries-dlsitapur', name: 'Government District Library, Sitapur',
  baseUrl: 'https://eg4.nic.in', egranthalayaCluster: 'UPLIBRARIES',
  egranthalayaLibraryCode: 'DLSITAPUR', egranthalayaSearchScope: 'cluster',
};

test('cluster parser follows both valid ISBN forms and rejects the malformed ISBN substring hit', () => {
  const result = parseSearch(fixture('up-wings-stem-search'), { isbn: upIsbn, libraryCode: 'DLSITAPUR', clusterSearch: true });
  assert.deepEqual(result, { kind: 'records', records: [
    { recordId: '451490', format: 'Print' }, { recordId: '79083', format: 'Print' },
  ] });
  const source = fixture('up-wings-stem-search');
  for (const page of [

    source.replace('id="Repeater1_ISBNLbl_2"', 'id="Repeater1_ISBNLbl_1"'),
    source.replace('showValues(79083,false)', 'showValues(451490,false)'),
  ]) assert.notEqual(parseSearch(page, { isbn: upIsbn, libraryCode: 'DLSITAPUR', clusterSearch: true })?.kind, 'records');
  assert.equal(parseSearch(source, { isbn: upIsbn, libraryCode: 'OTHER', clusterSearch: true }), null);
  const partial = parseSearch(source.replace('3  Record(s)', '23  Record(s)'), { isbn: upIsbn, libraryCode: 'DLSITAPUR', clusterSearch: true });
  assert.equal(partial.partial, true);
  assert.equal(partial.records.length, 2);
});


// ---- ISBN check: one OR search of both spellings on the kept member form ----

test('an ISBN check is one cookie-less OR search of both spellings, scoped to the member, with no record page', async () => {
  const calls = [];
  global.fetch = successfulFetch(calls);
  const result = await checkAvailability(library, isbn);
  assert.deepEqual(result, { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true, format: 'Print (reference use only)',
    locations: [{ name: library.name, status: 'unknown' }] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['User-Agent'], USER_AGENT);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(new URL(calls[0].url).searchParams.get('LIB_CODE'), 'HKMSLIB');
  const [form] = posts(calls);
  assert.equal(form.get('DDL_Library'), 'HKMSLIB');
  assert.equal(form.get('DDL_Field'), 'ALL');
  assert.equal(form.get('DDL_Boolean'), 'OR');
  assert.equal(form.get('txt_Search'), '813131345 81-313-1345');
  assert.equal(form.get('__VIEWSTATE'), 'fixture-state');
  assert.equal(calls[1].options.headers.Cookie, undefined, 'no session is carried from the form page');
  assert.equal(calls[1].options.redirect, 'manual');
  assert.ok(!calls.some(call => call.url.includes('Details.aspx')));
  assert.equal(result.catalogUrl, undefined); // session-bound record URLs are not shareable
  await checkAvailability(library, isbn);
  await checkAvailability(library, '813131345X');
  assert.equal(calls.length, 2, 'the same edition is answered from the kept result');
});

test('the member form is kept between checks; one the server rejects costs one fresh form and one more search, and a fresh form is never retried', async () => {
  const calls = [];
  let state = 'fixture-state';
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method !== 'POST') return response(fixture('form').replaceAll('fixture-state', state), url);
    const fields = new URLSearchParams(options.body);
    return fields.get('__VIEWSTATE') === state ? response(fixture('search-hit'), url) : response('Validation of viewstate MAC failed', url, { status: 500 });
  };
  await checkAvailability(library, isbn);
  assert.equal(calls.length, 2);
  // The hit page shows another ISBN, so these are no proof; only the requests matter here.
  await assert.rejects(checkAvailability(library, '9780140328721'));
  assert.deepEqual(calls.slice(2).map(call => call.options.method || 'GET'), ['POST'], 'the kept form: no form page');
  state = 'new-state';
  await assert.rejects(checkAvailability(library, '9788172234980'));
  assert.deepEqual(calls.slice(3).map(call => call.options.method || 'GET'), ['POST', 'GET', 'POST']);
  assert.deepEqual(posts(calls).map(fields => fields.get('__VIEWSTATE')), ['fixture-state', 'fixture-state', 'fixture-state', 'new-state']);
  // A form fetched for this very search that the server rejects is the catalog's failure.
  clearHttpCache(); calls.length = 0; state = 'other-state';
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return options.method === 'POST' ? response('error', url, { status: 500 }) : response(fixture('form'), url);
  };
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(calls.length, 2);
});

test('an ISBN zero is "not found" only in a check that also searched the member by title', async () => {
  const calls = [];
  global.fetch = successfulFetch(calls, { search: fields => (fields.get('DDL_Field') === 'TITLE' ? hkmsZero() : hkmsZero()) });
  // Alone (an exact-edition check): the member's ISBN search misses shared records.
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_QUERY_UNSUPPORTED' });
  assert.equal(posts(calls).length, 1);
  // Beside a title search of the same check (started together, as a work check does).
  const together = await withCatalogOperation({ maxRequests: 6 }, () => Promise.all([checkAvailability(library, isbn), searchCatalog(library, 'Atomic Habits')]));
  assert.deepEqual(together[0], { outcome: 'not_found', matchKind: 'none', recognizedExact: true });
  assert.deepEqual(together[1], []);
  assert.deepEqual(posts(calls).map(fields => [fields.get('DDL_Field'), fields.get('txt_Search')]),
    [['ALL', '813131345 81-313-1345'], ['TITLE', 'Atomic Habits'], ['ALL', 'Atomic Habits']], 'the zero ISBN result is kept, not asked again');
  // A title search that failed proves nothing.
  clearHttpCache(); calls.length = 0;
  global.fetch = successfulFetch(calls, { search: fields => (fields.get('DDL_Field') === 'TITLE' ? '<p>error</p>' : hkmsZero()) });
  const failed = await withCatalogOperation({ maxRequests: 6 }, () => Promise.allSettled([checkAvailability(library, isbn), searchCatalog(library, 'Atomic Habits')]));
  assert.equal(failed[0].reason.code, 'CATALOG_QUERY_UNSUPPORTED');
  assert.equal(failed[1].reason.code, 'CATALOG_UNRECOGNIZED');
});

test('rows that match the digits but show another ISBN are neither found nor absent; a row showing it on a longer list is found', async () => {
  global.fetch = successfulFetch([], { search: () => fixture('search-hit').replaceAll('978-81-313-1345-9', '978-81-7223-498-0') });
  const settled = await withCatalogOperation({ maxRequests: 6 }, () => Promise.allSettled([checkAvailability(library, isbn), searchCatalog(library, 'x')]));
  assert.equal(settled[0].reason?.code, 'CATALOG_QUERY_UNSUPPORTED');
  clearHttpCache();
  global.fetch = successfulFetch([], { search: () => fixture('search-hit').replace('1  Record(s)', '21  Record(s)') });
  assert.equal((await checkAvailability(library, isbn)).outcome, 'in_catalog');
});

test('no-results, CAPTCHA-only pages, other scopes and malformed forms are unknown, never not_found', async () => {
  for (const page of [
    hkmsZero().replace('0 Record(s)', 'Unknown'),
    hkmsZero().replaceAll('HKMSLIB', 'OTHER'),
    '<form>Enter CAPTCHA to search</form>',
  ]) {
    clearHttpCache();
    const calls = [];
    global.fetch = successfulFetch(calls, { search: () => page });
    await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(calls.length, 2, 'a form fetched for this search is not fetched again');
  }
  clearHttpCache();
  global.fetch = async (url) => response('<form><img src="../Captcha.aspx">Enter code</form>', url);
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNRECOGNIZED' });
});

for (const status of [401, 403, 429]) {
  test(`HTTP ${status} disables the shared origin for all future library lookups`, async () => {
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response('blocked', url, { status }); };
    await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_PROVIDER_BLOCKED' });
    await assert.rejects(checkAvailability(library, '9788172234980'), { code: 'CATALOG_PROVIDER_BLOCKED' });
    await assert.rejects(checkAvailability({ ...library, egranthalayaLibraryCode: 'CCLSZJYNGR' }, isbn), { code: 'CATALOG_PROVIDER_BLOCKED' });
    await assert.rejects(searchCatalog(library, 'India'), { code: 'CATALOG_PROVIDER_BLOCKED' });
    assert.equal(calls, 1, 'the refusal prevents later requests across the NIC origin');
  });
}

test('queued lookups stop after a refusal partway through the active lookup', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    calls += 1;
    if (options.method === 'POST') return response('rate limited', url, { status: 429 });
    return response(fixture('form'), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture;' } });
  };
  const results = await Promise.allSettled([
    checkAvailability(library, isbn),
    checkAvailability(library, '9788172234980'),
    checkAvailability({ ...library, egranthalayaLibraryCode: 'CCLSZJYNGR' }, '9788173711466'),
  ]);
  assert.ok(results.every((result) => result.status === 'rejected' && result.reason.code === 'CATALOG_PROVIDER_BLOCKED'));
  assert.equal(calls, 2, 'only the first lookup form and refused POST reach NIC');
  await assert.rejects(checkAvailability(library, '9780140328721'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  assert.equal(calls, 2, 'new lookups also make zero requests after refusal');
});

test('a refusal takes precedence over previously cached successful observations', async () => {
  const calls = [];
  global.fetch = successfulFetch(calls);
  await checkAvailability(library, isbn);
  assert.equal(calls.length, 2);
  let refusedCalls = 0;
  global.fetch = async (url) => { refusedCalls += 1; return response('blocked', url, { status: 403 }); };
  await assert.rejects(checkAvailability(library, '9788172234980'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_PROVIDER_BLOCKED' });
  assert.equal(refusedCalls, 1, 'cached successes cannot bypass a disabled provider');
});

test('redirected requests are not followed or retried', async () => {
  let calls = 0;
  global.fetch = async (url) => { calls += 1; return response('redirect', url, { status: 302, headers: { Location: 'https://other.example/' } }); };
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(calls, 1);
});

test('rejects unsafe/incomplete configuration and invalid ISBN before network access', async () => {
  global.fetch = async () => assert.fail('must not fetch');
  for (const changes of [{ baseUrl: 'http://eg4.nic.in' }, { baseUrl: 'https://evil.example' }, { egranthalayaCluster: '../x' }, { egranthalayaLibraryCode: 'All Libraries' }, { egranthalayaLibraryCode: '' }]) {
    await assert.rejects(checkAvailability({ ...library, ...changes }, isbn), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
    await assert.rejects(searchCatalog({ ...library, ...changes }, 'India'), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  }
  await assert.rejects(checkAvailability(library, '9788131313458'), { code: 'CATALOG_EXACT_ISBN_REQUIRED' });
});

test('timeouts do not erase uncertainty and stay inside the check\'s request cap', async () => {
  global.fetch = async () => { throw Object.assign(new Error('deadline exceeded'), { name: 'AbortError' }); };
  await assert.rejects(checkAvailability(library, isbn), { name: 'AbortError' });
  clearHttpCache();
  const calls = [];
  global.fetch = successfulFetch(calls);
  await assert.rejects(withCatalogOperation({ maxRequests: 1 }, () => checkAvailability(library, isbn)), { code: 'CATALOG_REQUEST_BUDGET' });
  assert.equal(calls.length, 1);
});

test('the ISBN check shares a hyphen-indexed member\'s spelling and the plain digits in one search', () => {
  assert.equal(clusterIsbnQuery('9788173711466'), '817371146');
  assert.equal(clusterIsbnQuery('9798998881152'), '9798998881152');
});

// SITAPUR, 19 November 2026 (fixture README): its TITLE search returned two
// shared records it holds; its ALL search does not return them. The one
// library search asks ALL (owner decision, 20 November 2026), so those shared
// records are not seen there (a known loss, reported).
test('Sitapur: the library search is one member ALL search after the kept form', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return response(fixture(options.method !== 'POST' ? 'dlsitapur-form' : 'dlsitapur-isbn-zero'), url);
  };
  assert.deepEqual(await withCatalogOperation({}, () => librarySearch({ ...upLibrary }, 'Wings of Fire')), []);
  assert.deepEqual(posts(calls).map(fields => [fields.get('DDL_Field'), fields.get('DDL_Boolean'), fields.get('txt_Search'), fields.get('DDL_Library')]),
    [['ALL', 'LIKE', 'Wings of Fire', upLibrary.egranthalayaLibraryCode]]);
  assert.equal(gets(calls), 1, 'one kept public form');
});

// Romain Rolland Library, Puducherry (PYLIB cluster). Fixtures are public
// pages saved on 12 November 2026; see the fixture README.
const rrl = {
  id: 'egranthalaya:pylib-rrlpy', name: 'Romain Rolland Library', baseUrl: 'https://eg4.nic.in',
  egranthalayaCluster: 'PYLIB', egranthalayaLibraryCode: 'RRLPY', egranthalayaReferenceOnly: false, egranthalayaSearchScope: 'cluster',
};
const rrlSearches = { 'wings of fire': 'rrlpy-search-wings-of-fire', 'பொன்னியின் செல்வன்': 'rrlpy-search-ponniyin-selvan-tamil', 'ponniyin selvan': 'rrlpy-search-ponniyin-selvan-latin' };
// `records` maps a record ID to the pages its successive reads return.
function rrlFetch(calls, records = {}) {
  const reads = new Map();
  return async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('Details.aspx')) {
      const id = new URL(url).searchParams.get('ctr'), pages = records[id] || [];
      const count = reads.get(id) || 0; reads.set(id, count + 1);
      return response(fixture(pages[Math.min(count, pages.length - 1)]), url);
    }
    if (options.method === 'POST') return response(fixture(rrlSearches[new URLSearchParams(options.body).get('txt_Search')]), url);
    return response(fixture('rrlpy-form'), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
  };
}
const detailReads = calls => calls.filter(call => call.url.includes('Details.aspx')).length;

test('Romain Rolland title search reads Latin rows with authors, copy totals and the member scope', async () => {
  setEmptyRecordRetryDelayForTests(0);
  const calls = [];
  global.fetch = rrlFetch(calls);
  const books = (await searchCatalog(rrl, 'wings of fire')).map(({ observation, ...book }) => book);
  assert.equal(calls.length, 3, 'the form, then the TITLE and ALL searches');
  assert.equal(new URLSearchParams(calls[2].options.body).get('DDL_Field'), 'ALL');
  const body = new URLSearchParams(calls[1].options.body);
  assert.equal(body.get('DDL_Library'), 'RRLPY');
  assert.equal(body.get('DDL_Field'), 'TITLE', 'the catalog\'s own default search field');
  assert.equal(body.get('txt_Search'), 'wings of fire');
  assert.equal(calls[1].options.headers.Cookie, undefined);
  assert.equal(books.length, 5);
  assert.deepEqual(books[0], { recordId: '165629', title: 'Wings of Fire', authors: ['APJ ABDUL KALAM'], isbn: null, totalCopies: 1 });
  assert.deepEqual(books.find(book => book.recordId === '79863'), { recordId: '79863', title: 'Wings of Fire : An Autobiography.', authors: ['Abdul Kalam (APJ)'], isbn: null, totalCopies: 1 });
  // Every row is this member's record: catalog presence, copy status unknown.
  assert.deepEqual((await searchCatalog(rrl, 'Wings of  FIRE'))[0].observation, { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true,
    totalCopies: 1, locations: [{ name: 'Romain Rolland Library', status: 'unknown' }] });
  assert.equal(calls.length, 3, 'the same search, differently typed, is kept');
  // Each catalog record stays its own record; same-title rows are not merged.
  assert.equal(new Set(books.map(book => book.recordId)).size, 5);
});

test('Romain Rolland finds Ponniyin Selvan in Tamil script and in English letters', async () => {
  const calls = [];
  global.fetch = rrlFetch(calls);
  const tamil = await searchCatalog(rrl, 'பொன்னியின் செல்வன்');
  assert.equal(new URLSearchParams(calls[1].options.body).get('txt_Search'), 'பொன்னியின் செல்வன்');
  assert.equal(tamil.length, 20, 'the first page: twenty of 124 records');
  assert.equal(tamil.hasMore, true);
  const { observation, ...ponniyin } = tamil.find(book => book.recordId === '101722');
  assert.deepEqual(ponniyin, { recordId: '101722', title: 'பொன்னியின் செல்வன்', authors: ['KALKI'], isbn: null, totalCopies: 3 });
  assert.equal(observation.outcome, 'in_catalog');
  assert.equal(tamil.find(book => book.recordId === '108078').isbn, '9788183451536');
  const latin = await searchCatalog(rrl, 'ponniyin selvan');
  assert.equal(latin.length, 8);
  assert.equal(latin.hasMore, undefined);
  assert.equal(latin[1].title, 'Ponniyin Selvan Muthal Pagam');
  assert.deepEqual(latin[1].authors, ['KALKI']);
});

test('a displayed title with a subtitle retries a clean zero with the main title on the same member form', async () => {
  const calls = [], hit = fixture('hkms-subtitle-search');
  const title = parseCatalogSearch(hit, 'HKMSLIB')[0].title;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method !== 'POST') return response(fixture('form'), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=first; path=/' } });
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('DDL_Library'), 'HKMSLIB');
    assert.equal(options.headers.Cookie, undefined);
    if (body.get('txt_Search') === title) return response(hkmsZero(), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=next; path=/' } });
    assert.equal(body.get('txt_Search'), '10 Daniel Thorner & memorial lectures');
    assert.equal(body.get('__VIEWSTATE'), 'fixture-state');
    return response(hit, url);
  };
  const books = await searchCatalog(library, title);
  assert.equal(calls.length, 5, 'form; TITLE and ALL for the displayed title; TITLE and ALL for the main title');
  assert.equal(books.length, 1);
  assert.equal(books[0].recordId, '526126');
  assert.equal(books[0].title, title);
});

test('subtitle recovery never retries a changed member scope or bypasses the request budget', async () => {
  const title = 'India: A history';
  const zero = memberPage(fixture('form'), 'HKMSLIB') + '<span id="Label37">Your Search Returned 0 Record(s)</span>';
  for (const wrongScope of [true, false]) {
    clearHttpCache();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return response(options.method === 'POST' ? wrongScope ? zero.replaceAll('HKMSLIB', 'OTHER') : zero : fixture('form'), url,
        { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
    };
    await assert.rejects(withCatalogOperation({ maxRequests: 2 }, () => searchCatalog(library, title)),
      { code: wrongScope ? 'CATALOG_UNRECOGNIZED' : 'CATALOG_REQUEST_BUDGET' });
    assert.equal(calls.length, 2);
  }
});

test('subtitle recovery stops after a positive full-title search or two clean zeros', async () => {
  for (const positive of [true, false]) {
    clearHttpCache();
    const calls = [], zero = memberPage(fixture('form'), 'HKMSLIB')
      + '<span id="Label37">Your Search Returned 0 Record(s)</span>';
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return response(options.method === 'POST' ? positive ? fixture('hkms-subtitle-search') : zero : fixture('form'), url,
        { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
    };
    const books = await searchCatalog(library, '10 Daniel Thorner & memorial lectures: Land labour & rights');
    assert.equal(calls.length, positive ? 3 : 5);
    assert.equal(books.length, positive ? 1 : 0);
  }
});

test('subtitle recovery preserves Hindi, Tamil and Odia vowel marks in the main-title query', async () => {
  for (const title of ['भारत: स्वतंत्रता का इतिहास', 'हिंदी: साहित्य', 'மழை: கதைகள்', 'இந்தியா: வரலாறு', 'ଭାରତ: ଇତିହାସ']) {
    clearHttpCache();
    const calls = [], mainTitle = title.split(':')[0];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (options.method !== 'POST') return response(fixture('form'), url,
        { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
      const query = new URLSearchParams(options.body).get('txt_Search');
      if (query === title) return response(memberPage(fixture('form'), 'HKMSLIB')
        + '<span id="Label37">Your Search Returned 0 Record(s)</span>', url);
      assert.equal(query, mainTitle);
      return response(fixture('hkms-subtitle-search').replace('10 Daniel Thorner &amp; memorial lectures: Land labour &amp; rights', title), url);
    };
    const books = await searchCatalog(library, title);
    assert.equal(calls.length, 5);
    assert.equal(books[0].title, title);
  }
});

test('a full Romain Rolland record page gives the copy, its status and the call number', async () => {
  setEmptyRecordRetryDelayForTests(0);
  const calls = [];
  global.fetch = rrlFetch(calls, { 79863: ['rrlpy-record-79863'] });
  const record = await resolveCatalogRecord(rrl, '79863');
  assert.equal(calls.length, 2);
  assert.equal(record.title, 'Wings of Fire : An Autobiography.');
  assert.deepEqual(record.authors, ['Abdul Kalam (APJ)']);
  assert.equal(record.observation.outcome, 'available');
  assert.equal(record.observation.availableCopies, 1);
  assert.equal(record.observation.totalCopies, 1);
  assert.equal(record.observation.callNumber, 'V2,1Y7N31P3');
  assert.deepEqual(record.observation.locations, [{ name: 'Romain Rolland Library', status: 'available' }]);
});

test('a shared record uses its main title and all twenty member rows to confirm catalog membership', async () => {
  for (const mode of ['confirmed', 'wrong-record', 'wrong-member']) {
    clearHttpCache();
    const calls = [];
    const rows = Array.from({ length: 11 }, (_, index) => {
      const id = index === 10 && mode !== 'wrong-record' ? '79863' : String(90000 + index);
      return `<a id="Repeater1_lnkDetails3_${index}" onclick="showValues(${id}, false); return false;">Details</a>`
        + `<span id="Repeater1_Lbl_Title_${index}">Wings of Fire</span>`;
    }).join('');
    const memberCode = mode === 'wrong-member' ? 'OTHER' : 'RRLPY';
    const search = `<select name="DDL_Library"><option selected="selected" value="${memberCode}">Member</option></select>`
      + '<span id="Label37">Your Search Returned 11 Record(s)</span>' + rows;
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      if (url.includes('Details.aspx')) return response(fixture('rrlpy-record-79863').replaceAll('RRLPY', 'OTHER'), url);
      if (options.method === 'POST') {
        assert.equal(new URLSearchParams(options.body).get('txt_Search'), 'Wings of Fire');
        assert.equal(new URLSearchParams(options.body).get('DDL_Field'), 'TITLE');
        return response(search, url);
      }
      return response(fixture('rrlpy-form'), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
    };
    if (mode !== 'confirmed') await assert.rejects(resolveCatalogRecord(rrl, '79863'), { code: 'CATALOG_UNRECOGNIZED' });
    else {
      assert.equal(parseCatalogSearch(search, 'RRLPY').length, 10, 'public search still returns ten rows');
      const record = await resolveCatalogRecord(rrl, '79863');
      assert.equal(record.observation.outcome, 'in_catalog');
      assert.equal(record.observation.availableCopies, undefined, 'another member copy never becomes this member’s available copy');
      assert.deepEqual(record.observation.locations, [{ name: rrl.name, status: 'unknown' }]);
    }
    assert.equal(calls.length, 3);
  }
});

test('an ambiguous main title retains exact ISBN confirmation (both spellings) on the member form', async () => {
  const calls = [];
  const row = (index, id) => `<a id="Repeater1_lnkDetails3_${index}" onclick="showValues(${id}, false); return false;">Details</a>`
    + `<span id="Repeater1_Lbl_Title_${index}">India: a history</span>`;
  const others = Array.from({ length: 20 }, (_, index) => row(index, 90000 + index)).join('');
  const page = (count, rows) => fixture('rrlpy-form').replace('</form>', `<span id="Label37">Your Search Returned ${count} Record(s)</span>${rows}</form>`);
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('Details.aspx')) return response(fixture('rrlpy-record-79863').replaceAll('RRLPY', 'OTHER')
      .replace('Wings of Fire : An Autobiography.', 'India: a history')
      .replace('</form>', `<span id="Lbl_ISBN">${upIsbn}</span></form>`), url);
    if (options.method === 'POST') {
      const fields = new URLSearchParams(options.body);
      if (fields.get('txt_Search') === 'India') return response(page(20, others), url);
      assert.deepEqual([fields.get('DDL_Field'), fields.get('DDL_Boolean'), fields.get('txt_Search')], ['ALL', 'OR', '817371146 81-7371-146']);
      assert.equal(fields.get('__VIEWSTATE'), 'fixture-state');
      return response(page(1, row(0, 79863)), url);
    }
    return response(fixture('rrlpy-form'), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/' } });
  };
  const record = await resolveCatalogRecord(rrl, '79863');
  assert.equal(record.observation.outcome, 'in_catalog');
  assert.equal(record.observation.availableCopies, undefined);
  assert.equal(calls.length, 4);
});

test('empty record pages are recognised only for the requested record and never for full pages', () => {
  assert.equal(isEmptyRecordPage(fixture('rrlpy-record-79863-empty'), '79863'), true);
  assert.equal(isEmptyRecordPage(fixture('rrlpy-record-101722-empty'), '101722'), true);
  assert.equal(isEmptyRecordPage(fixture('rrlpy-record-101722-empty'), '79863'), false);
  assert.equal(isEmptyRecordPage(fixture('rrlpy-record-79863'), '79863'), false);
  assert.equal(isEmptyRecordPage(fixture('holdings-available'), '519750'), false);
  assert.equal(isEmptyRecordPage(fixture('rrlpy-form'), '79863'), false);
});

test('an empty record page is read once more and the second, full page is used', async () => {
  setEmptyRecordRetryDelayForTests(0);
  const calls = [];
  global.fetch = rrlFetch(calls, { 79863: ['rrlpy-record-79863-empty', 'rrlpy-record-79863'] });
  const record = await resolveCatalogRecord(rrl, '79863');
  assert.equal(detailReads(calls), 2);
  assert.equal(calls.length, 3);
  assert.equal(record.observation.outcome, 'available');
  assert.equal(record.observation.availableCopies, 1);
});

test('a record page that stays empty falls back to this library\'s search row with copy status unconfirmed', async () => {
  setEmptyRecordRetryDelayForTests(0);
  const calls = [];
  global.fetch = rrlFetch(calls, { 101722: ['rrlpy-record-101722-empty'] });
  await searchCatalog(rrl, 'பொன்னியின் செல்வன்');
  const record = await resolveCatalogRecord(rrl, '101722');
  assert.equal(detailReads(calls), 2, 'one retry, no more');
  assert.equal(calls.length, 6);
  assert.equal(record.title, 'பொன்னியின் செல்வன்');
  assert.deepEqual(record.authors, ['KALKI']);
  assert.deepEqual(record.observation, { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true, totalCopies: 3,
    locations: [{ name: 'Romain Rolland Library', status: 'unknown' }] });
  assert.notEqual(record.observation.outcome, 'not_found');
  assert.equal(record.observation.availableCopies, undefined);
});

test('without a search row an empty record page is an unavailable catalog, not a missing title or absence', async () => {
  setEmptyRecordRetryDelayForTests(0);
  const calls = [];
  global.fetch = rrlFetch(calls, { 101722: ['rrlpy-record-101722-empty'] });
  await assert.rejects(resolveCatalogRecord(rrl, '101722'), error => error.code === 'CATALOG_UNAVAILABLE' && !/Missing record title/.test(error.message));
  assert.equal(detailReads(calls), 2);
  // A search row from another member never vouches for this one.
  clearHttpCache(); calls.length = 0;
  await searchCatalog(rrl, 'பொன்னியின் செல்வன்');
  await assert.rejects(resolveCatalogRecord({ ...rrl, egranthalayaLibraryCode: 'SRGPLKKL' }, '101722'), { code: 'CATALOG_UNAVAILABLE' });
});

test('the empty-page retry stays inside a check\'s request cap', async () => {
  setEmptyRecordRetryDelayForTests(0);
  const calls = [];
  global.fetch = rrlFetch(calls, { 101722: ['rrlpy-record-101722-empty', 'rrlpy-record-101722-empty'] });
  await searchCatalog(rrl, 'பொன்னியின் செல்வன்');
  calls.length = 0;
  const record = await withCatalogOperation({ maxRequests: 2 }, () => resolveCatalogRecord(rrl, '101722'));
  assert.equal(calls.length, 2, 'no retry once the cap is spent');
  assert.equal(record.observation.outcome, 'in_catalog');
});


// SRS Jammu, 19 November 2026: the TITLE search for "Wings of Fire" returned
// 0; the member's own record 31499 (ISBN 9788173711466) is found by its ALL
// search, which the library search uses.
test('SRS Jammu: the one ALL search finds the member\'s own record', async () => {
  const calls = [];
  const srs = { id: 'egranthalaya:jklibraries-srsjammu', name: 'SRS Central Library', baseUrl: 'https://eg4.nic.in',
    egranthalayaCluster: 'JKLIBRARIES', egranthalayaLibraryCode: 'SRSJAMMU', egranthalayaSearchScope: 'cluster' };
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (options.method !== 'POST') return response(fixture('srsjammu-form'), url);
    return response(fixture(new URLSearchParams(options.body).get('DDL_Field') === 'TITLE' ? 'srsjammu-title-wings-of-fire' : 'srsjammu-all-wings-of-fire'), url);
  };
  const rows = await librarySearch(srs, 'Wings of Fire');
  assert.deepEqual(rows.map(row => [row.recordId, row.isbn, row.observation.outcome]), [['31499', upIsbn, 'in_catalog']]);
  assert.deepEqual(posts(calls).map(fields => fields.get('DDL_Field')), ['ALL']);
});
