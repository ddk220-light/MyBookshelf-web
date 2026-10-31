import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAvailability, checkClusterAvailability, clearEgranthalayaRefusals, clusterIsbnQuery, hyphenatedIsbn, parseHoldings, parseSearch, searchForm } from './egranthalaya.js';
import { clearHttpCache, USER_AGENT } from './http.js';

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

function successfulFetch(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.includes('Details.aspx')) return response(fixture('holdings-available'), url);
    return response(fixture(options.method === 'POST' ? 'search-hit' : 'form'), url, {
      headers: options.method === 'POST' ? {} : { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/; HttpOnly; Secure' },
    });
  };
}

test('ISBN hyphenation uses official Indian and English registration ranges and validates checksum', () => {
  assert.equal(hyphenatedIsbn(isbn), '978-81-313-1345-9');
  assert.equal(hyphenatedIsbn('9788173711466'), '978-81-7371-146-6');
  assert.equal(hyphenatedIsbn('9788172234980'), '978-81-7223-498-0');
  assert.equal(hyphenatedIsbn('9780140328721'), '978-0-14-032872-1');
  assert.equal(hyphenatedIsbn('813131345X'), '978-81-313-1345-9');
  assert.equal(hyphenatedIsbn('9788131313458'), null);
  assert.equal(hyphenatedIsbn('9784103534228'), null); // unbundled Japanese registration group
});

test('full anonymous form replay selects one library and omits other actions', () => {
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

test('lookup uses three bounded public requests, honest identity and lookup-local anonymous session', async () => {
  const calls = [];
  global.fetch = successfulFetch(calls);
  const result = await checkAvailability(library, isbn);
  assert.equal(result.availableCopies, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers['User-Agent'], USER_AGENT);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.Cookie, undefined);
  assert.equal(calls[1].options.method, 'POST');
  const form = new URLSearchParams(calls[1].options.body);
  assert.equal(form.get('DDL_Library'), 'HKMSLIB');
  assert.equal(form.get('txt_Search'), '978-81-313-1345-9');
  assert.equal(calls[1].options.headers.Cookie, 'ASP.NET_SessionId=anonymous-fixture');
  assert.equal(calls[2].options.headers.Cookie, 'ASP.NET_SessionId=anonymous-fixture');
  assert.equal(new URL(calls[2].url).searchParams.get('ctr'), '519750');
  assert.equal(result.catalogUrl, undefined); // session-bound record URLs are not shareable
  await checkAvailability(library, isbn);
  assert.equal(calls.length, 3); // 60-second single-flight/response cache
});

test('no-results, CAPTCHA-only pages and malformed forms are unknown, never not_found', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    calls += 1;
    return response(options.method === 'POST'
      ? fixture('search-empty').replaceAll('CCLSZJYNGR', 'HKMSLIB') : fixture('form'), url,
    { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture;' } });
  };
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNRECOGNIZED' });
  assert.equal(calls, 2);
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
  assert.equal(calls.length, 3);
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
  }
  await assert.rejects(checkAvailability(library, '9788131313458'), { code: 'CATALOG_EXACT_ISBN_REQUIRED' });
});

test('timeouts and malformed record responses do not erase uncertainty', async () => {
  global.fetch = async () => { throw Object.assign(new Error('deadline exceeded'), { name: 'AbortError' }); };
  await assert.rejects(checkAvailability(library, isbn), { name: 'AbortError' });
  const calls = [];
  const successful = successfulFetch(calls);
  global.fetch = (url, options) => url.includes('Details.aspx') ? response('<p>Unexpected maintenance</p>', url) : successful(url, options);
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNRECOGNIZED' });
});

function emptyForm() {
  return fixture('form')
    .replace('selected="selected" value="All Libraries"', 'value="All Libraries"')
    .replace('<option value="HKMSLIB">', '<option selected="selected" value="HKMSLIB">')
    .replace('</form>', '<span id="Label37">Your Search Returned 0 Record(s)</span></form>');
}

test('clean zero retries plain ISBN once with fresh form state, session, and the same library', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return response(fixture('form'), url, { headers: { 'Set-Cookie': 'ASP.NET_SessionId=first;' } });
    if (calls.length === 2) return response(emptyForm().replaceAll('fixture-state', 'fresh-state'), url,
      { headers: { 'Set-Cookie': 'ASP.NET_SessionId=updated;' } });
    if (calls.length === 3) return response(fixture('search-hit'), url);
    return response(fixture('holdings-available'), url);
  };
  const result = await checkAvailability(library, isbn);
  assert.equal(result.availableCopies, 1);
  assert.equal(calls.length, 4);
  const posts = calls.filter(({ options }) => options.method === 'POST');
  assert.deepEqual(posts.map(({ options }) => new URLSearchParams(options.body).get('txt_Search')), ['978-81-313-1345-9', isbn]);
  assert.ok(posts.every(({ options }) => new URLSearchParams(options.body).get('DDL_Library') === 'HKMSLIB'));
  assert.equal(new URLSearchParams(posts[1].options.body).get('__VIEWSTATE'), 'fresh-state');
  assert.equal(posts[1].options.headers.Cookie, 'ASP.NET_SessionId=updated');
  assert.equal(calls[3].options.headers.Cookie, 'ASP.NET_SessionId=updated');
});

test('two clean zeros exhaust the bounded search and remain unknown', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    return response(options.method === 'POST' ? emptyForm() : fixture('form'), url,
      { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture;' } });
  };
  await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNRECOGNIZED' });
  assert.equal(calls, 3);
});

test('ambiguous, malformed, contradictory and differently scoped results never trigger fallback', async () => {
  for (const page of [
    fixture('search-hit').replace('1  Record(s)', '21  Record(s)'),
    fixture('search-hit').replaceAll('978-81-313-1345-9', '978-81-7223-498-0'),
    emptyForm().replace('0 Record(s)', 'Unknown'),
    emptyForm().replaceAll('HKMSLIB', 'OTHER'),
    emptyForm().replace('</form>', '<span id="Repeater1_ISBNLbl_0">9788131313459</span></form>'),
    '<form>Enter CAPTCHA to search</form>',
  ]) {
    clearHttpCache();
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      return response(options.method === 'POST' ? page : fixture('form'), url,
        { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture;' } });
    };
    await assert.rejects(checkAvailability(library, isbn), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(calls, 2);
  }
});

for (const status of [401, 403, 429, 500]) {
  test(`fallback HTTP ${status} stops immediately and does not continue to holdings`, async () => {
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      if (calls === 3) return response('unavailable', url, { status });
      return response(options.method === 'POST' ? emptyForm() : fixture('form'), url,
        { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture;' } });
    };
    await assert.rejects(checkAvailability(library, isbn),
      { code: status === 500 ? 'CATALOG_UNAVAILABLE' : 'CATALOG_PROVIDER_BLOCKED' });
    assert.equal(calls, 3);
  });
}

test('clean-zero fallback shares the original 100 second deadline', async () => {
  const originalNow = Date.now;
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  try {
    global.fetch = async (url, options) => {
      calls++;
      if (options.method === 'POST') now += 100001;
      return response(options.method === 'POST' ? emptyForm() : fixture('form'), url,
        { headers: { 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture;' } });
    };
    await assert.rejects(checkAvailability(library, isbn), { name: 'AbortError' });
    assert.equal(calls, 2, 'the expired shared budget prevents another network request');
  } finally { Date.now = originalNow; }
});

const upIsbn = '9788173711466';
const upLibrary = {
  id: 'egranthalaya:uplibraries-dlsitapur', name: 'Government District Library, Sitapur',
  baseUrl: 'https://eg4.nic.in', egranthalayaCluster: 'UPLIBRARIES',
  egranthalayaLibraryCode: 'DLSITAPUR', egranthalayaSearchScope: 'cluster',
};
function clusterFetch(calls, { search = fixture('up-wings-stem-search'), transformDetail = (html) => html } = {}) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.includes('Details.aspx')) {
      const recordId = new URL(url).searchParams.get('ctr');
      return response(transformDetail(fixture(`${recordId === '472855' ? 'up-godan' : 'up-wings'}-stem-record-${recordId}`), recordId), url);
    }
    const completeSearch = /<form\b/i.test(search) ? search : fixture('up-cluster-form')
      .replace(/<select name="DDL_Library"[\s\S]*?<\/select>/, '')
      .replace('</form>', `${search}</form>`);
    return response(options.method === 'POST' ? completeSearch : fixture('up-cluster-form'), url,
      { headers: { 'Set-Cookie': 'ASP.NET_SessionId=cluster-fixture;' } });
  };
}

test('current-cluster search leaves member and cross-cluster selectors unused', () => {
  const fields = searchForm(fixture('up-cluster-form'), { libraryCode: 'DLSITAPUR', query: '817371146', clusterSearch: true });
  assert.equal(fields.get('DDL_Library'), 'All Libraries');
  assert.equal(fields.get('DDL_Field'), 'ALL');
  assert.equal(fields.get('DDL_Boolean'), 'LIKE');
  assert.equal(fields.get('AccordionPaneUnion_content$DDL_Clusters'), '');
  assert.equal(fields.get('AccordionPaneUnion_content$DDL_ClusterLibraries'), '');
  assert.equal(fields.has('AccordionPaneUnion_content$CB_Union'), false);
  assert.equal(fields.get('txtMemberNo'), '');
  assert.equal(fields.get('txtPassword'), '');
  assert.equal(searchForm(fixture('up-cluster-form'), { libraryCode: 'OTHER', query: '817371146', clusterSearch: true }), null);
});

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

test('all 77 official UP codes share one reader lookup with exact positive and negative scope filtering', async () => {
  const calls = [];
  global.fetch = clusterFetch(calls);
  const select = fixture('up-cluster-form').match(/<select name="DDL_Library"[\s\S]*?<\/select>/)[0];
  const codes = [...select.matchAll(/<option[^>]*value="([A-Z0-9_]+)"/g)].map((match) => match[1]);
  assert.equal(codes.length, 77);
  const expected = new Set(['SCLALD', 'DLSITAPUR', 'DLKHERI', 'DLETAH', 'DLFBD', 'DLJHANSI', 'DLMATHURA', 'DLUNNAO']);
  for (const code of codes) {
    const name = `Selected ${code}`;
    const lookup = checkClusterAvailability({ ...upLibrary, egranthalayaLibraryCode: code, name }, upIsbn);
    if (!expected.has(code)) {
      await assert.rejects(lookup, { code: 'CATALOG_HOLDING_UNCONFIRMED' });
      continue;
    }
    const result = await lookup;
    assert.equal(result.outcome, 'available');
    assert.equal(result.totalCopies, undefined);
    assert.equal(result.availableCopies, undefined);
    assert.ok(result.locations.every((location) => location.name.startsWith(name)));
    if (code === 'DLSITAPUR') assert.equal(result.locations.length, 2);
    else assert.equal(result.locations.length, 1);
  }
  assert.equal(calls.length, 5, 'one anonymous form, two ISBN searches, two deduplicated records; no per-library search');
  assert.equal(new URLSearchParams(calls[1].options.body).get('txt_Search'), '817371146');
  assert.equal(new URLSearchParams(calls[1].options.body).get('DDL_Library'), 'All Libraries');
  assert.equal(new URL(calls[0].url).searchParams.get('LIB_CODE'), codes[0], 'small member landing page still precedes the explicit shared search');
  await assert.rejects(checkClusterAvailability({ ...upLibrary, egranthalayaLibraryCode: 'OTHER' }, upIsbn), { code: 'CATALOG_UNRECOGNIZED' });
  assert.equal(calls.length, 5);
});

test('concurrent cluster selectors share a single anonymous lookup and filter separately', async () => {
  const calls = [];
  global.fetch = clusterFetch(calls);
  const results = await Promise.all([
    checkClusterAvailability(upLibrary, upIsbn),
    checkClusterAvailability({ ...upLibrary, egranthalayaLibraryCode: 'DLUNNAO', name: 'Unnao' }, '8173711461'),
  ]);
  assert.equal(calls.length, 5);
  assert.equal(results[0].locations.length, 2);
  assert.equal(results[1].locations.length, 1);
  assert.equal(results[1].locations[0].name, 'Unnao — 9-6');
});

test('cluster search never invents absence from missing, unknown, or issued holdings', async () => {
  for (const state of ['Issued', 'Processing']) {
    clearHttpCache();
    const calls = [];
    global.fetch = clusterFetch(calls, { transformDetail: (html) => html.replaceAll('>Available<', `>${state}<`) });
    const observation = await checkClusterAvailability(upLibrary, upIsbn);
    assert.equal(observation.outcome, 'in_catalog');
    assert.equal(observation.availableCopies, undefined);
    assert.equal(calls.length, 5);
  }
});

test('cluster result rejects query echoes and foreign record actions', async () => {
  for (const search of [
    fixture('up-wings-stem-search').replaceAll('9788173711466', '9788172234980').replaceAll('8173711461', '8172234988'),
  ]) {
    clearHttpCache();
    const calls = [];
    global.fetch = clusterFetch(calls, { search });
    await assert.rejects(checkClusterAvailability(upLibrary, upIsbn), { code: 'CATALOG_PARTIAL_RESULTS' });
    assert.equal(calls.length, 3);
  }
  clearHttpCache();
  const calls = [];
  global.fetch = clusterFetch(calls, { transformDetail: (html) => html.replace('./Details.aspx', 'https://foreign.example/OPAC/Details.aspx') });
  await assert.rejects(checkClusterAvailability(upLibrary, upIsbn), { code: 'CATALOG_PARTIAL_RESULTS' });
  assert.equal(calls.length, 5);
});

test('cluster HTTP refusals stop remaining records and disable cached observations', async () => {
  const calls = [];
  global.fetch = clusterFetch(calls);
  await checkClusterAvailability(upLibrary, upIsbn);
  let refused = 0;
  global.fetch = async (url) => { refused++; return response('forbidden', url, { status: 403 }); };
  await assert.rejects(checkClusterAvailability(upLibrary, '9788172234980'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  await assert.rejects(checkClusterAvailability(upLibrary, upIsbn), { code: 'CATALOG_PROVIDER_BLOCKED' });
  assert.equal(refused, 1);
});

test('cluster records and search share one 100-second deadline', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const calls = [];
    const normal = clusterFetch(calls);
    global.fetch = async (url, options) => {
      const result = await normal(url, options);
      if (options.method === 'POST') now += 100001;
      return result;
    };
    await assert.rejects(checkClusterAvailability(upLibrary, upIsbn), { name: 'AbortError' });
    assert.equal(calls.length, 2);
  } finally { Date.now = originalNow; }
});


test('cluster retrieval terms preserve checksum validation and distinguish 979 ISBNs', () => {
  assert.equal(clusterIsbnQuery('9788173711466'), '817371146');
  assert.equal(clusterIsbnQuery('8173711461'), '817371146');
  assert.equal(clusterIsbnQuery('9790000000001'), '9790000000001');
  assert.equal(clusterIsbnQuery('9788173711467'), null);
});

test('completed empty ISBN variants report no catalog match and share results across members', async () => {
  const calls = [];
  const search = fixture('up-cluster-form').replace('</form>', '<span id="Label37">Your Search Returned 0 Record(s)</span></form>');
  global.fetch = clusterFetch(calls, { search });
  assert.equal((await checkClusterAvailability(upLibrary, upIsbn)).outcome, 'not_found');
  assert.equal((await checkClusterAvailability({ ...upLibrary, egranthalayaLibraryCode: 'SCLALD' }, upIsbn)).outcome, 'not_found');
  assert.equal(calls.length, 3);
});


test('second live book is available only in Mahoba, with other district scopes unknown', async () => {
  const calls = [];
  global.fetch = clusterFetch(calls, { search: fixture('up-godan-stem-search') });
  const mahoba = { ...upLibrary, egranthalayaLibraryCode: 'DLMAHOBA', name: 'Government District Library, Mahoba' };
  const result = await checkClusterAvailability(mahoba, '9789389742152');
  assert.equal(result.outcome, 'available');
  assert.deepEqual(result.locations, [{ name: mahoba.name, status: 'available' }]);
  assert.equal(result.totalCopies, undefined);
  await assert.rejects(checkClusterAvailability(upLibrary, '9789389742152'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  assert.equal(calls.length, 4);
  assert.equal(new URLSearchParams(calls[1].options.body).get('txt_Search'), '938974215');
});


test('cluster mixed holdings do not imply unavailable locations from a punctuation-incomplete search', async () => {
  const calls = [];
  global.fetch = clusterFetch(calls, {
    transformDetail: (html, recordId) => recordId === '451490' ? html.replaceAll('>Available<', '>Issued<') : html,
  });
  const result = await checkClusterAvailability(upLibrary, upIsbn);
  assert.equal(result.outcome, 'available');
  assert.deepEqual(result.locations, [
    { name: `${upLibrary.name} — A136 S3`, status: 'unknown' },
    { name: `${upLibrary.name} — A114 S2`, status: 'available' },
  ]);
  assert.equal(result.availableCopies, undefined);
  assert.equal(result.totalCopies, undefined);
});


test('cluster lookup accepts a valid 1–4 MiB form and preserves issued holdings as catalog presence', async () => {
  const calls = [], normal = clusterFetch(calls, { transformDetail: html => html.replaceAll('>Available<', '>Issued<') });
  global.fetch = async (url, options) => {
    const result = await normal(url, options);
    if (options.method !== 'POST' && !url.includes('Details.aspx')) {
      const body = await result.text();
      result.text = async () => body + ' '.repeat(1100 * 1024);
    }
    return result;
  };
  const result = await checkClusterAvailability(upLibrary, upIsbn);
  assert.equal(result.outcome, 'in_catalog');
  assert.equal(result.availableCopies, undefined);
  assert.ok(result.locations.every(x => x.status === 'unknown'));
});

test('cluster fallback finds hyphenated ISBNs after a plain-stem miss and deduplicates records', async () => {
  const calls = [], normal = clusterFetch(calls);
  global.fetch = async (url, options) => {
    if (options.method === 'POST' && new URLSearchParams(options.body).get('txt_Search') === '817371146') {
      calls.push({ url, options });
      return response(fixture('up-cluster-form').replace('</form>', '<span id="Label37">Your Search Returned 0 Record(s)</span></form>'), url);
    }
    return normal(url, options);
  };
  assert.equal((await checkClusterAvailability(upLibrary, upIsbn)).outcome, 'available');
  assert.deepEqual(calls.filter(c => c.options.method === 'POST').map(c => new URLSearchParams(c.options.body).get('txt_Search')), ['817371146', '81-7371-146']);
});

test('failed fallback preserves confirmed holdings but never declares an unmatched branch absent', async () => {
  const calls = [], normal = clusterFetch(calls);
  global.fetch = async (url, options) => {
    if (options.method === 'POST' && new URLSearchParams(options.body).get('txt_Search') === '81-7371-146') throw Object.assign(new Error('deadline exceeded'), { name: 'AbortError' });
    return normal(url, options);
  };
  assert.equal((await checkClusterAvailability(upLibrary, upIsbn)).outcome, 'available');
  await assert.rejects(checkClusterAvailability({ ...upLibrary, egranthalayaLibraryCode: 'DLLUCAMR' }, upIsbn), { code: 'CATALOG_PARTIAL_RESULTS' });
});

function memberPage(source, code) {
  return source.replace(/<option selected="selected" value="All Libraries">/, '<option value="All Libraries">')
    .replace(new RegExp(`<option value="${code}">`), `<option selected="selected" value="${code}">`);
}
function memberFetch(calls, { search = fixture('up-wings-stem-search'), detail = html => html } = {}) {
  const normal = clusterFetch([], { search, transformDetail: detail });
  return async (url, options) => {
    calls.push({ url, options });
    const result = await normal(url, options);
    if (!url.includes('Details.aspx') && new URL(url).searchParams.has('LIB_CODE')
        && !(options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries')) {
      const body = memberPage(await result.text(), new URL(url).searchParams.get('LIB_CODE'));
      result.text = async () => body;
    }
    return result;
  };
}
const emptyMemberSearch = () => fixture('up-cluster-form').replace('</form>', '<span id="Label37">Your Search Returned 0 Record(s)</span></form>');

test('reader lookup opens the selected member and returns its first available copy immediately', async () => {
  const calls = [];
  global.fetch = memberFetch(calls);
  const result = await checkAvailability(upLibrary, upIsbn);
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, undefined, 'early results cannot claim complete counts');
  assert.equal(calls.length, 3, 'one form, one ISBN search, first positive detail');
  assert.equal(new URL(calls[0].url).searchParams.get('LIB_CODE'), 'DLSITAPUR');
  assert.equal(new URLSearchParams(calls[1].options.body).get('DDL_Library'), 'DLSITAPUR');
  assert.equal(new URLSearchParams(calls[1].options.body).get('txt_Search'), '817371146');
  assert.ok(result.locations.every(row => row.name.startsWith(upLibrary.name)));
});

test('member exact catalog match survives missing, malformed and failed copy details', async () => {
  for (const kind of ['missing', 'malformed', 'timeout', 'server error']) {
    clearHttpCache();
    const calls = [], normal = memberFetch(calls, { detail: html => kind === 'missing' ? html.replaceAll('DLSITAPUR', 'OTHER') : '<p>maintenance</p>' });
    global.fetch = async (url, options) => {
      if (url.includes('Details.aspx') && kind === 'timeout') throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      if (url.includes('Details.aspx') && kind === 'server error') return response('unavailable', url, { status: 500 });
      return normal(url, options);
    };
    const result = await checkAvailability(upLibrary, upIsbn);
    assert.equal(result.outcome, 'in_catalog', kind);
    assert.equal(result.availableCopies, undefined);
    assert.equal(result.totalCopies, undefined);
    assert.deepEqual(result.locations, [{ name: upLibrary.name, status: 'unknown' }]);
  }
});

test('member partial search reads bounded exact records and retains the first useful response', async () => {
  const calls = [];
  global.fetch = memberFetch(calls, {
    search: fixture('up-wings-stem-search').replace('3  Record(s)', '23  Record(s)'),
    detail: (html, recordId) => recordId === '451490' ? '<p>Record unavailable</p>' : html,
  });
  assert.equal((await checkAvailability(upLibrary, upIsbn)).outcome, 'available');
  assert.equal(calls.length, 4);
});

test('member zeros require complete shared search before reporting no match', async () => {
  const calls = [], empty = memberFetch(calls, { search: emptyMemberSearch() }), positive = memberFetch(calls);
  global.fetch = (url, options) => {
    if (options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries') {
      calls.push({ url, options }); return response(emptyMemberSearch(), url);
    }
    return new URL(url).searchParams.get('LIB_CODE') === 'SCLALD' ? positive(url, options) : empty(url, options);
  };
  assert.equal((await checkAvailability(upLibrary, upIsbn)).outcome, 'not_found');
  assert.equal((await checkAvailability({ ...upLibrary, egranthalayaLibraryCode: 'SCLALD' }, upIsbn)).outcome, 'available');
  assert.equal(calls.length, 9, 'member zero requires the shared cross-check; another member retains its positive');
  assert.deepEqual(calls.filter(c => c.options.method === 'POST').slice(0, 2).map(c => new URLSearchParams(c.options.body).get('txt_Search')), ['817371146', '81-7371-146']);
});

test('concurrent identical member lookups deduplicate but never share another member response', async () => {
  const calls = [];
  global.fetch = memberFetch(calls);
  const [a, b] = await Promise.all([checkAvailability(upLibrary, upIsbn), checkAvailability(upLibrary, '8173711461')]);
  assert.deepEqual(a, b);
  assert.equal(calls.length, 3);
  await checkAvailability({ ...upLibrary, egranthalayaLibraryCode: 'DLUNNAO' }, upIsbn);
  assert.ok(calls.length > 3);
});

test('member query never converts scope drift, a wrong ISBN or an unfinished fallback into no match', async () => {
  for (const kind of ['scope', 'wrong ISBN', 'timeout']) {
    clearHttpCache();
    const calls = [], normal = memberFetch(calls, { search: kind === 'timeout' ? emptyMemberSearch()
      : kind === 'wrong ISBN' ? fixture('up-wings-stem-search').replaceAll('9788173711466', '9788172234980').replaceAll('8173711461', '8172234988')
      : fixture('up-wings-stem-search') });
    global.fetch = async (url, options) => {
      if (kind === 'timeout' && options.method === 'POST' && new URLSearchParams(options.body).get('txt_Search') === '81-7371-146') throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      const result = await normal(url, options);
      if (kind === 'scope' && options.method === 'POST') {
        const body = (await result.text()).replaceAll('DLSITAPUR', 'OTHER'); result.text = async () => body;
      }
      return result;
    };
    await assert.rejects(checkAvailability(upLibrary, upIsbn), kind === 'timeout' ? { name: 'AbortError' }
      : { code: kind === 'scope' ? 'CATALOG_UNRECOGNIZED' : 'CATALOG_PARTIAL_RESULTS' });
  }
});

test('member fallback cannot obtain a new deadline and refusals invalidate a known match', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const calls = [], normal = memberFetch(calls, { search: emptyMemberSearch() });
    global.fetch = async (url, options) => { const r = await normal(url, options); if (options.method === 'POST') now += 100001; return r; };
    await assert.rejects(checkAvailability(upLibrary, upIsbn), { name: 'AbortError' });
    assert.equal(calls.length, 2);
  } finally { Date.now = originalNow; }
  clearHttpCache();
  const calls = [], normal = memberFetch(calls);
  global.fetch = (url, options) => url.includes('Details.aspx') ? response('refused', url, { status: 429 }) : normal(url, options);
  await assert.rejects(checkAvailability(upLibrary, upIsbn), { code: 'CATALOG_PROVIDER_BLOCKED' });
  await assert.rejects(checkAvailability({ ...upLibrary, egranthalayaLibraryCode: 'SCLALD' }, upIsbn), { code: 'CATALOG_PROVIDER_BLOCKED' });
});

test('retry resumes an unfinished ISBN variant using a fresh session and cached completed zero', async () => {
  const calls = [], positive = memberFetch(calls), empty = memberFetch(calls, { search: emptyMemberSearch() });
  let failAlternate = true;
  global.fetch = async (url, options) => {
    const query = new URLSearchParams(options.body).get('txt_Search');
    if (options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries' && failAlternate) throw Object.assign(new Error('timeout'), { name: 'AbortError' });
    if (options.method === 'POST' && query === '817371146') return empty(url, options);
    if (options.method === 'POST' && failAlternate) {
      calls.push({ url, options });
      throw Object.assign(new Error('deadline'), { name: 'AbortError' });
    }
    return positive(url, options);
  };
  await assert.rejects(checkAvailability(upLibrary, upIsbn), { name: 'AbortError' });
  failAlternate = false;
  const result = await checkAvailability(upLibrary, upIsbn);
  assert.equal(result.outcome, 'available');
  const queries = calls.filter(c => c.options.method === 'POST').map(c => new URLSearchParams(c.options.body).get('txt_Search'));
  assert.deepEqual(queries, ['817371146', '81-7371-146', '81-7371-146']);
  assert.equal(calls.filter(c => c.options.method !== 'POST' && !c.url.includes('Details.aspx')).length, 3, 'retry obtains fresh anonymous form/session');
});

test('a zero member search never hides its positive holding on a shared record', async () => {
  const calls = [], member = memberFetch(calls, { search: emptyMemberSearch() }), shared = clusterFetch(calls);
  global.fetch = (url, options) => options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries' || url.includes('Details.aspx') ? shared(url, options) : member(url, options);
  const result = await checkAvailability(upLibrary, upIsbn);
  assert.equal(result.outcome, 'available');
  assert.equal(calls.length, 6, 'member form/two queries, shared form/first query/first own holding');
  assert.equal(result.totalCopies, undefined);
});

test('no shared holding proves no match only after complete search and holding pages', async () => {
  const absent = { ...upLibrary, egranthalayaLibraryCode: 'DLLUCAMR' };
  for (const partial of [false, true]) {
    clearHttpCache();
    const calls = [], member = memberFetch(calls, { search: emptyMemberSearch() });
    const shared = clusterFetch(calls, { transformDetail: html => partial ? html.replace(/Total Holding Records\s*:\s*\d+/, 'Total Holding Records : 999') : html });
    global.fetch = (url, options) => options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries' || url.includes('Details.aspx') ? shared(url, options) : member(url, options);
    if (partial) await assert.rejects(checkAvailability(absent, upIsbn), { code: 'CATALOG_PARTIAL_RESULTS' });
    else assert.equal((await checkAvailability(absent, upIsbn)).outcome, 'not_found');
    assert.equal(calls.length, 8);
  }
});

test('a retry resumes the unfinished shared query and does not cache an unconfirmed member failure', async () => {
  const selected = { ...upLibrary, egranthalayaLibraryCode: 'DLLUCAMR' };
  const calls = [], normal = clusterFetch(calls);
  let failAlternate = true;
  global.fetch = async (url, options) => {
    if (options.method === 'POST' && new URLSearchParams(options.body).get('txt_Search') === '81-7371-146' && failAlternate) {
      calls.push({url, options}); throw Object.assign(new Error('timeout'), { name: 'AbortError' });
    }
    return normal(url, options);
  };
  await assert.rejects(checkClusterAvailability(selected, upIsbn, { confirmAbsence: true }), { code: 'CATALOG_PARTIAL_RESULTS' });
  failAlternate = false;
  assert.equal((await checkClusterAvailability(selected, upIsbn, { confirmAbsence: true })).outcome, 'not_found');
  assert.deepEqual(calls.filter(c => c.options.method === 'POST').map(c => new URLSearchParams(c.options.body).get('txt_Search')),
    ['817371146', '81-7371-146', '81-7371-146']);
  assert.equal(calls.filter(c => c.url.includes('Details.aspx')).length, 2, 'only sanitized exact holding observations are reused');
});

test('shared fallback checks later returned records before settling for an issued copy', async () => {
  const calls = [], member = memberFetch(calls, { search: emptyMemberSearch() });
  const shared = clusterFetch(calls, { transformDetail: (html, id) => id === '451490' ? html.replaceAll('>Available<', '>Issued<') : html });
  global.fetch = (url, options) => options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries' || url.includes('Details.aspx') ? shared(url, options) : member(url, options);
  const result = await checkAvailability(upLibrary, upIsbn);
  assert.equal(result.outcome, 'available');
  assert.equal(calls.filter(c => c.url.includes('Details.aspx')).length, 2);
  assert.equal(result.totalCopies, undefined);
});

test('a slow member probe leaves the rest of the original budget for shared holdings', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const calls = [], member = memberFetch(calls), shared = clusterFetch(calls);
  try {
    global.fetch = async (url, options) => {
      const fields = new URLSearchParams(options.body);
      if (options.method === 'POST' && fields.get('DDL_Library') !== 'All Libraries') {
        calls.push({url, options}); now += 15001;
        throw Object.assign(new Error('probe deadline'), { name: 'AbortError' });
      }
      return options.method === 'POST' || url.includes('Details.aspx') ? shared(url, options) : member(url, options);
    };
    assert.equal((await checkAvailability(upLibrary, upIsbn)).outcome, 'available');
    assert.equal(calls.length, 5);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 2);
  } finally { Date.now = originalNow; }
});

test('a timed-out member probe cannot become no-match just because other members own the shared record', async () => {
  const selected = { ...upLibrary, egranthalayaLibraryCode: 'DLLUCAMR' };
  const calls = [], member = memberFetch(calls), shared = clusterFetch(calls);
  global.fetch = async (url, options) => {
    if (options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') !== 'All Libraries') throw Object.assign(new Error('probe timeout'), { name: 'AbortError' });
    return options.method === 'POST' || url.includes('Details.aspx') ? shared(url, options) : member(url, options);
  };
  await assert.rejects(checkAvailability(selected, upIsbn), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('after shared queries complete, a retry can spend its remaining budget confirming the member', async () => {
  const selected = { ...upLibrary, egranthalayaLibraryCode: 'DLLUCAMR' };
  const calls = [], member = memberFetch(calls, { search: emptyMemberSearch() }), shared = clusterFetch(calls);
  let slowProbe = true;
  const originalNow = Date.now; let now = originalNow(); Date.now = () => now;
  try {
    global.fetch = async (url, options) => {
      if (options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') !== 'All Libraries') {
        if (slowProbe) throw Object.assign(new Error('probe timeout'), { name: 'AbortError' });
        now += 20_000;
      }
      return options.method === 'POST' && new URLSearchParams(options.body).get('DDL_Library') === 'All Libraries' || url.includes('Details.aspx') ? shared(url, options) : member(url, options);
    };
    await assert.rejects(checkAvailability(selected, upIsbn), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
    slowProbe = false;
    assert.equal((await checkAvailability(selected, upIsbn)).outcome, 'not_found');
    assert.equal(calls.filter(c => c.options.method === 'POST' && new URLSearchParams(c.options.body).get('DDL_Library') === 'All Libraries').length, 2, 'completed shared variants are reused');
  } finally { Date.now = originalNow; }
});
