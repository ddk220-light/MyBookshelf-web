import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkPublicAvailability, parseKohaPublicRecord, searchCatalog, resolveCatalogRecord, scopeSearch } from './koha.js';
import { clearHttpCache } from './http.js';

const ISBN = '9780262033848';
const ORIGIN = 'https://library.cutn.ac.in';
const RECORD = '/cgi-bin/koha/opac-detail.pl?biblionumber=22365';
const RECORD_URL = `${ORIGIN}${RECORD}`;
const library = { id: 'koha:cutn', platform: 'koha', slug: 'cutn', baseUrl: ORIGIN };
const fixture = fs.readFileSync(new URL('../../test/fixtures/koha/cutn-record.html', import.meta.url), 'utf8');
const chennaiFixture = fs.readFileSync(new URL('../../test/fixtures/koha/chennai-record.html', import.meta.url), 'utf8');
const maduraiFixture = fs.readFileSync(new URL('../../test/fixtures/koha/madurai-record.html', import.meta.url), 'utf8');
const originalFetch = global.fetch;
const response = (url, text = '', status = 200, headers = {}) => ({ url, text: async () => text, status, ok: status >= 200 && status < 300, headers: new Headers(headers) });
const isSearch = (url) => url.includes('/opac-search.pl?');
const emptySearch = (url) => `<body id="results"><h1 id="numresults">No results found!</h1><a href="${url}&amp;format=rss">Subscribe</a></body>`;
const expected = {
  outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true,
  totalCopies: 5, availableCopies: 4, notForLoanCopies: 1, callNumber: '005.1 COR', format: 'Reference Books / General Books',
  locations: [
    { name: 'CUTN Central Library Reference', status: 'unknown', totalCopies: 1, notForLoanCopies: 1 },
    { name: 'CUTN Central Library Generalia', status: 'available', totalCopies: 4, availableCopies: 4 },
  ],
};
const unknownStatuses = fixture.replaceAll('>Available </span>', '>In processing</span>');

function selectColumns(html, order) {
  return html.replace(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi, (row, attrs, content) => {
    const cells = [...content.matchAll(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi)];
    return cells.length === 19 ? `<tr${attrs}>${order.map((index) => cells[index][0]).join('')}</tr>` : row;
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  clearHttpCache();
});

test('reopened Koha records retain author metadata when the ISBN is missing', async () => {
  const html = '<h1 class="title">Wings of Fire</h1><span property="author"><a href="/cgi-bin/koha/opac-search.pl?q=au:Kalam">Kalam, A. P. J.</a></span>' + fixture.replaceAll(ISBN, '');
  global.fetch = async url => response(url, html);
  const record = await resolveCatalogRecord(library, '22365');
  assert.equal(record.isbn, null);
  assert.deepEqual(record.authors, ['Kalam, A. P. J.']);
  assert.equal(record.observation.outcome, 'available');
});

test('captured CUTN holdings show four borrowable copies and one reference-only physical copy', () => {
  assert.deepEqual(parseKohaPublicRecord(fixture, ISBN), expected);
  assert.equal(Object.hasOwn(expected.locations[0], 'availableCopies'), false);
  assert.doesNotMatch(expected.callNumber, /Browse shelf/);
});

test('captured Chennai and Madurai records preserve floors and non-lending holdings', () => {
  const chennai = parseKohaPublicRecord(chennaiFixture, '9780521095808');
  assert.equal(chennai.outcome, 'available');
  assert.equal(chennai.availableCopies, 1);
  assert.equal(chennai.locations[0].name, 'Anna Centenary Library 3RD FLOOR, A WING');
  assert.equal(chennai.callNumber, '153.8 VER');
  const madurai = parseKohaPublicRecord(maduraiFixture, '9788180692703');
  assert.equal(madurai.outcome, 'unknown');
  assert.equal(madurai.loanRestriction, 'not_for_loan');
  assert.equal(madurai.totalCopies, 1);
  assert.equal(madurai.availableCopies, undefined);
  assert.equal(madurai.locations[0].name, 'Kalaignar Centenary Library Madurai · ஆறாம் தளம் / Sixth floor');
  assert.equal(madurai.callNumber, '630.954 ALI');
});

test('only record-owned ISBN metadata proves an exact edition; query echoes and cover identifiers cannot', () => {
  for (const record of [
    fixture.replace(ISBN, '9780735219090'),
    fixture.replace(ISBN, '9780262033847'),
    fixture.replace('results_summary isbn', 'results_summary issn'),
    fixture.replace(/<span class="results_summary isbn">[\s\S]*?<\/ul><\/span>/, ''),
  ]) {
    assert.equal(parseKohaPublicRecord(`${record}<p>Search: ${ISBN}</p><img data-isbn="${ISBN}"><script>const isbn='${ISBN}'</script>`, ISBN), null);
  }
  assert.equal(parseKohaPublicRecord(fixture, '9780262033847'), null);
  assert.equal(parseKohaPublicRecord(fixture, '9780735219090'), null);
  assert.equal(parseKohaPublicRecord(fixture.replace(ISBN, '0262033844'), ISBN)?.outcome, 'available');
  assert.equal(parseKohaPublicRecord(`<div class="details">${fixture}</div>`, ISBN)?.outcome, 'available');
});

test('ambiguous ISBN metadata from multiple records cannot prove the requested edition', () => {
  const other = fixture.replace(ISBN, '9780735219090');
  const related = `<span class="results_summary isbn"><span class="label">ISBN:</span>${ISBN}</span>`;
  assert.equal(parseKohaPublicRecord(`${other}<section class="related-records">${related}</section>`, ISBN), null);
});

test('holdings use column headers even after columns are reordered or optional columns disappear', () => {
  assert.deepEqual(parseKohaPublicRecord(selectColumns(fixture, [11, 2, 6, 1]), ISBN), expected);
  assert.deepEqual(parseKohaPublicRecord(selectColumns(fixture, [...Array(19).keys()].reverse()), ISBN), expected);
});

test('holdings accept the current-location header used by other Koha catalogs', () => {
  const locationRecord = fixture.replace('>Current library</th>', '>Current location</th>');
  assert.notEqual(locationRecord, fixture);
  assert.deepEqual(parseKohaPublicRecord(locationRecord, ISBN), expected);
  assert.deepEqual(parseKohaPublicRecord(selectColumns(locationRecord, [11, 2, 6, 1]), ISBN), expected);
});

test('current library takes precedence over a separate shelving-location column', () => {
  const withShelf = fixture.replace('>Collection</th>', '>Current location</th>');
  assert.notEqual(withShelf, fixture);
  assert.deepEqual(parseKohaPublicRecord(withShelf, ISBN), expected);
});

test('duplicate location headers cannot turn ambiguous holdings into a confirmed count', () => {
  const ambiguous = fixture.replace('>Current library</th>', '>Current location</th>')
    .replace('>Collection</th>', '>Current location</th>');
  assert.equal(parseKohaPublicRecord(ambiguous, ISBN), null);
});

test('unknown and restricted statuses never imply unavailable copies or exact borrowable counts', () => {
  const unknown = parseKohaPublicRecord(unknownStatuses, ISBN);
  assert.equal(unknown.outcome, 'unknown');
  assert.equal(unknown.totalCopies, 5);
  assert.equal(unknown.locations[1].status, 'unknown');
  assert.equal(Object.hasOwn(unknown, 'availableCopies'), false);
  assert.equal(Object.hasOwn(unknown.locations[1], 'availableCopies'), false);
  const mixed = parseKohaPublicRecord(fixture.replace('>Available </span>', '>In processing</span>'), ISBN);
  assert.equal(mixed.outcome, 'available');
  assert.equal(Object.hasOwn(mixed, 'availableCopies'), false);
  const restricted = parseKohaPublicRecord(fixture.replaceAll('General Books', 'Reference Books'), ISBN);
  assert.equal(restricted.outcome, 'unknown');
  assert.equal(Object.hasOwn(restricted, 'availableCopies'), false);
  const checkedOut = parseKohaPublicRecord(fixture.replaceAll('Reference Books', 'General Books')
    .replace('>Not For Loan </span>', '>Checked out</span>').replaceAll('>Available </span>', '>Checked out</span>'), ISBN);
  assert.equal(checkedOut.outcome, 'none_available');
  assert.equal(checkedOut.availableCopies, 0);
  assert.equal(checkedOut.totalCopies, 5);
});

test('empty, hidden, paginated and partial holdings never produce guessed totals', () => {
  for (const html of [
    fixture.replace(/<tbody>[\s\S]*?<\/tbody>/, '<tbody></tbody>'),
    fixture.replace('id="holdingst"', 'id="holdingst" data-ajax="/items"'),
    fixture.replace('id="holdingst"', 'id="holdingst" data-server-side="true"'),
    `${fixture}<div class="pagination"><a href="?page=2">2</a></div>`,
    `${fixture}<a rel="next" href="?page=2">Next</a>`,
    `${fixture}<button aria-controls="holdingst" id="holdingst_next">Next</button>`,
    fixture.replace('<tr vocab=', '<tr hidden vocab='),
    fixture.replace('<td class="itype">', '<td colspan="2" class="itype">'),
    fixture.replace('</tbody>', '<tr><td>Loading another copy</td></tbody>'),
    fixture.replace(/<table[\s\S]*<\/table>/, ''),
  ]) {
    const result = parseKohaPublicRecord(html, ISBN);
    assert.ok(!result || result.outcome === 'unknown');
    assert.equal(Object.hasOwn(result || {}, 'totalCopies'), false);
    assert.equal(Object.hasOwn(result || {}, 'availableCopies'), false);
  }
});

test('ambiguous or malformed table headers reject the shape instead of guessing column positions', () => {
  for (const html of [
    fixture.replace('>Status</th>', '>Progress</th>'),
    fixture.replace('>Barcode</th>', '>Status</th>'),
    fixture.replace('<th id="item_status"', '<th colspan="2" id="item_status"'),
    fixture.replace('<tbody>', '<tbody><tr><td><table><tr><td>Other copies</td></tr></table></td></tr>'),
  ]) assert.equal(parseKohaPublicRecord(html, ISBN), null);
});

test('unique ISBN redirect produces exactly two honest reads and shares a cached confirmed result', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return isSearch(url) ? response(url, '', 302, { location: RECORD }) : response(url, fixture);
  };
  const [first, concurrent] = await Promise.all([
    checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN),
  ]);
  assert.deepEqual(first, { ...expected, catalogUrl: RECORD_URL });
  assert.deepEqual(concurrent, first);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get('idx'), 'nb');
  assert.equal(new URL(calls[0].url).searchParams.get('q'), ISBN);
  assert.equal(calls[1].url, RECORD_URL);
  assert.ok(calls.every((call) => call.options.redirect === 'manual'));
  assert.ok(calls.every((call) => /^MyBookshelf\//.test(call.options.headers['User-Agent'])));
  assert.deepEqual(await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), first);
  assert.equal(calls.length, 2);
});

test('a single linked search record is verified independently and unrelated URL parameters are discarded', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return response(url, isSearch(url)
      ? `<a href="${RECORD}&amp;query=${ISBN}&amp;shelfbrowse_itemnumber=1#holdings">Title</a><a href="${RECORD}">Details</a>`
      : fixture);
  };
  assert.equal((await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN)).availableCopies, 4);
  assert.deepEqual(calls.slice(1), [RECORD_URL]);
});

test('reviewed HTTP catalogs use anonymous same-origin reads and reject redirect escapes', async () => {
  const httpLibrary = { id: 'koha:anna-centenary-library', platform: 'koha', baseUrl: 'http://118.185.210.241:8001' };
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return isSearch(url) ? response(url, '', 302, { location: RECORD }) : response(url, fixture);
  };
  assert.equal((await checkPublicAvailability(httpLibrary, ISBN)).availableCopies, 4);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url, options }) => new URL(url).origin === httpLibrary.baseUrl
    && options.redirect === 'manual' && !options.headers.Authorization && !options.headers.Cookie));
  for (const target of ['http://127.0.0.1' + RECORD, 'http://118.185.210.241' + RECORD,
    'http://reader@118.185.210.241:8001' + RECORD, 'https://118.185.210.241:8001' + RECORD]) {
    clearHttpCache();
    let count = 0;
    global.fetch = async (url) => { count += 1; return response(url, '', 302, { location: target }); };
    await assert.rejects(checkPublicAvailability(httpLibrary, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(count, 1);
  }
});

test('complete duplicate ISBN records are independently verified before combining copies', async () => {
  const calls = [];
  const title = '<h1 class="title">Introduction to Algorithms</h1>';
  const listing = `<h1 id="numresults">Your search returned 2 results.</h1><a href="${RECORD}">One</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=5">Two</a>`;
  global.fetch = async (url) => { calls.push(url); return response(url, isSearch(url) ? listing : title + fixture); };
  const result = await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN);
  assert.equal(calls.length, 3);
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, 10);
  assert.equal(result.availableCopies, 8);
  assert.equal(result.catalogMatchCount, 2);
  assert.equal(result.catalogLinkKind, 'search');
  assert.match(result.catalogUrl, /opac-search\.pl\?idx=nb&q=/);
  assert.equal(result.locations[1].availableCopies, 8);

  clearHttpCache();
  global.fetch = async (url) => response(url, isSearch(url) ? listing : title + (url.endsWith('=5') ? fixture.replace(ISBN, '9780735219090') : fixture));
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

test('shared ISBNs across volumes never turn one available volume into a borrowable set', async () => {
  const listing = `<h1 id="numresults">Your search returned 2 results.</h1><a href="${RECORD}">One</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=5">Two</a>`;
  global.fetch = async (url) => response(url, isSearch(url) ? listing
    : `<h1 class="title">Encyclopedia</h1>${fixture}<table><tr><td class="vol_info">${url.endsWith('=5') ? 'Vol. 2' : 'Vol. 1'}</td></tr></table>`);
  const result = await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.totalCopies, 10);
  assert.equal(result.catalogMatchCount, 2);
  assert.equal(result.availableCopies, undefined);
  assert.ok(result.locations.every((location) => location.status === 'unknown' && location.availableCopies === undefined));
});

test('multiple non-lending records retain their restriction and complete physical counts', async () => {
  const listing = `<h1 id="numresults">Your search returned 2 results.</h1><a href="${RECORD}">One</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=5">Two</a>`;
  global.fetch = async (url) => response(url, isSearch(url) ? listing : maduraiFixture);
  const result = await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, '9788180692703');
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.loanRestriction, 'not_for_loan');
  assert.equal(result.totalCopies, 2);
  assert.equal(result.availableCopies, undefined);
});

test('ISBN-10-only indexes are searched before declaring an ISBN-13 absent', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (!isSearch(url)) return response(url, fixture.replace(ISBN, '0262033844'));
    return new URL(url).searchParams.get('q') === ISBN ? response(url, emptySearch(url)) : response(url, '', 302, { location: RECORD });
  };
  assert.equal((await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN)).availableCopies, 4);
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[1]).searchParams.get('q'), '0262033844');
});

test('captured Tamil ISBN-10 record provides its title after an ISBN-13 search miss', async () => {
  const html = fs.readFileSync(new URL('../../test/fixtures/koha/chennai-tamil-record.html', import.meta.url), 'utf8');
  global.fetch = async (url) => {
    if (!isSearch(url)) return response(url, html);
    return new URL(url).searchParams.get('q') === '9788123413419' ? response(url, emptySearch(url)) : response(url, '', 302, { location: RECORD });
  };
  const result = await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, '9788123413419');
  assert.equal(result.outcome, 'available');
  assert.match(result.catalogTitle, /பரமார்த்த குரு கதைகள்/);
  assert.equal(result.matchKind, 'exact_isbn');
});

test('not-found requires recognized empty responses for both equivalent ISBN forms', async () => {
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return response(url, emptySearch(url)); };
  const result = await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN);
  assert.equal(result.outcome, 'not_found');
  assert.equal(result.matchKind, 'none');
  assert.equal(result.recognizedExact, true);
  assert.equal(calls.length, 2);
  assert.equal(result.catalogLinkKind, 'search');
  clearHttpCache();
  global.fetch = async (url) => response(url, emptySearch(url).replace('id="results"', 'id="login"'));
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  global.fetch = async (url) => response(url, emptySearch(url.replace(ISBN, '9780735219090')));
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

test('multi-record counts must be complete and bounded before reading any records', async () => {
  const links = `<a href="${RECORD}">One</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=5">Two</a>`;
  for (const listing of [
    `<h1 id="numresults">Your search returned 2 results.</h1><a href="${RECORD}">Only one linked record</a>`,
    '<h1 id="numresults">Your search returned 2 results.</h1><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=5">One</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=05">Same record</a>',
    `<h1 id="numresults">Your search returned 3 results.</h1>${links}`,
    `<h1 id="numresults">Your search returned 2 results.</h1>${links}<nav class="pagination">Next</nav>`,
    `<h1 id="numresults">Your search returned 9 results.</h1>${Array.from({ length: 9 }, (_, i) => `<a href="/cgi-bin/koha/opac-detail.pl?biblionumber=${i + 1}">Book</a>`).join('')}`,
  ]) {
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response(url, listing); };
    await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(calls, 1);
  }
});

test('different record ISBNs, empty results, multiple matches and partial searches stay unconfirmed', async () => {
  global.fetch = async (url) => isSearch(url) ? response(url, '', 302, { location: RECORD }) : response(url, fixture.replace(ISBN, '9780735219090'));
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  for (const html of [
    '<p>No results found</p>', '<p>Loading</p>',
    `<a href="${RECORD}">One</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=5">Two</a>`,
    `<a href="${RECORD}">One</a><nav class="pagination">More records</nav>`,
  ]) {
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response(url, html); };
    await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
    assert.equal(calls, 1);
  }
});

test('unsafe redirect destinations and record links are rejected before any second request', async () => {
  for (const href of [
    `https://elsewhere.example${RECORD}`, `http://library.cutn.ac.in${RECORD}`,
    `https://reader@library.cutn.ac.in${RECORD}`, `${RECORD}&biblionumber=8`,
    '/cgi-bin/koha/opac-user.pl?biblionumber=22365', '/cgi-bin/koha/opac-detail.pl?biblionumber=invalid',
  ]) {
    for (const status of [200, 302]) {
      let calls = 0;
      global.fetch = async (url) => { calls += 1; return response(url, `<a href="${href}">Title</a>`, status, { location: href }); };
      await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
      assert.equal(calls, 1);
    }
  }
});

test('blocks, failures and automatic redirect attempts return typed errors with no retries', async () => {
  for (const status of [401, 403, 429, 500, 503, 301, 307]) {
    let calls = 0;
    global.fetch = async (url) => { calls += 1; return response(url, '', status, { location: RECORD }); };
    await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: [401, 403, 429].includes(status) ? 'CATALOG_PROVIDER_BLOCKED' : 'CATALOG_UNAVAILABLE' });
    assert.equal(calls, 1);
  }
  for (const html of ['<title>Just a moment…</title>', '<script src="/koha_fast_challenge.js"></script>']) {
    global.fetch = async (url) => response(url, html);
    await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_PROVIDER_BLOCKED' });
  }
  let calls = 0;
  global.fetch = async (url) => { calls += 1; return response(url, '', 302, { location: RECORD }); };
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(calls, 2);
  global.fetch = async () => response('https://elsewhere.example/', fixture);
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

test('timeouts, oversized responses and invalid configuration fail safely without exposing upstream error details', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw Object.assign(new Error('private upstream address; deadline exceeded'), { name: 'AbortError' }); };
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), (error) => error.code === 'CATALOG_TIMEOUT' && !error.message.includes('private'));
  assert.equal(calls, 1);
  calls = 0;
  global.fetch = async (url) => { calls += 1; return response(url, fixture, 200, { 'content-length': 4 * 1024 * 1024 }); };
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, '9780262033847'), { code: 'CATALOG_EXACT_ISBN_REQUIRED' });
  for (const baseUrl of ['http://library.cutn.ac.in', `${ORIGIN}/private`, `https://reader@library.cutn.ac.in`, `${ORIGIN}?account=1`]) {
    await assert.rejects(checkPublicAvailability({ ...library, baseUrl }, ISBN), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  }
  assert.equal(calls, 0);
});

test('complete unknown lending responses retain exact edition identity and are not cached', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    return isSearch(url) ? response(url, '', 302, { location: RECORD }) : response(url, unknownStatuses);
  };
  for (let i = 0; i < 2; i += 1) {
    const result = await checkPublicAvailability({ ...library, publicCatalogCapabilities: { titleSearch: true } }, ISBN);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.matchKind, 'exact_isbn');
    assert.equal(result.recognizedExact, true);
    assert.equal(result.totalCopies, 5);
    assert.equal(Object.hasOwn(result, 'availableCopies'), false);
  }
  assert.equal(calls, 4);
});

const captured = (name) => fs.readFileSync(new URL(`../../test/fixtures/koha/${name}.html`, import.meta.url), 'utf8');
const ALCHEMIST = '9788172234980';
const multiSearch = (numbers) => `<body id="results"><h1 id="numresults">Your search returned ${numbers.length} results.</h1>${numbers.map((id) => `<a href="/cgi-bin/koha/opac-detail.pl?biblionumber=${id}">Book</a>`).join('')}</body>`;

test('ISBN-13 and equivalent ISBN-10 use one Koha OR search; 979 identifiers have no ISBN-10', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(new URL(url));
    return isSearch(url) ? response(url, '', 302, { location: RECORD }) : response(url, fixture);
  };
  await checkPublicAvailability(library, ISBN);
  assert.deepEqual(calls[0].searchParams.getAll('idx'), ['nb', 'nb']);
  assert.deepEqual(calls[0].searchParams.getAll('q'), [ISBN, '0262033844']);
  assert.equal(calls[0].searchParams.get('op'), 'or');
  calls.length = 0;
  global.fetch = async (url) => { calls.push(new URL(url)); return response(url, captured('british-search')); };
  await checkPublicAvailability(library, '9791090636071');
  assert.deepEqual(calls[0].searchParams.getAll('q'), ['9791090636071']);
  assert.equal(calls[0].searchParams.has('op'), false);
});

test('verified empty Koha search is not-found, while arbitrary empty pages stay unconfirmed', async () => {
  global.fetch = async (url) => response(url, captured('british-search'));
  const result = await checkPublicAvailability(library, ISBN);
  assert.equal(result.outcome, 'not_found');
  assert.equal(result.matchKind, 'none');
  assert.equal(result.catalogLinkKind, 'search');
  assert.deepEqual(new URL(result.catalogUrl).searchParams.getAll('q'), ['978-0-262-03384-8', '0-262-03384-4']);
  clearHttpCache();
  global.fetch = async (url) => response(url, captured('british-search').replace('id="results"', 'id="unrelated"'));
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

test('VIT duplicate ISBN records combine one checked-out and one available copy', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return response(url, isSearch(url) ? captured('vit-search') : captured(`vit-${new URL(url).searchParams.get('biblionumber')}`));
  };
  const result = await checkPublicAvailability(library, ALCHEMIST);
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, 2);
  assert.equal(result.availableCopies, 1);
  assert.deepEqual(result.locations, [
    {name: 'VIT Central Library · STACK_ROW5_COLUMN 20', status: 'unavailable', totalCopies: 1, availableCopies: 0},
    {name: 'VIT Central Library · ISSUE BOOKS_16-06-2025', status: 'available', totalCopies: 1, availableCopies: 1},
  ]);
  assert.equal(result.callNumber, '823.92 COE');
  assert.equal(result.catalogLinkKind, 'search');
  assert.equal(calls.length, 3);
});

test('British Council records aggregate checked-out copies by branch without inventing a shared call number', async () => {
  global.fetch = async (url) => response(url, isSearch(url) ? captured('british-alchemist') : captured(`british-${new URL(url).searchParams.get('biblionumber')}`));
  const result = await checkPublicAvailability(library, ALCHEMIST);
  assert.equal(result.outcome, 'none_available');
  assert.equal(result.totalCopies, 5);
  assert.equal(result.availableCopies, 0);
  assert.deepEqual(result.locations, [
    {name: 'Ahmedabad', status: 'unavailable', totalCopies: 4, availableCopies: 0},
    {name: 'New Delhi', status: 'unavailable', totalCopies: 1, availableCopies: 0},
  ]);
  assert.equal(Object.hasOwn(result, 'callNumber'), false);
});

test('duplicate links are read once, including record URLs with leading zeroes', async () => {
  let reads = 0;
  global.fetch = async (url) => {
    if (isSearch(url)) return response(url, multiSearch(['8379', '08379', '12249']).replace('3 results', '2 results'));
    reads += 1;
    return response(url, captured(`vit-${new URL(url).searchParams.get('biblionumber')}`));
  };
  const result = await checkPublicAvailability(library, ALCHEMIST);
  assert.equal(result.totalCopies, 2);
  assert.equal(reads, 2);
});

test('later wrong editions and failed records preserve confirmed catalog presence; access refusals still stop', async () => {
  for (const mode of ['wrong-isbn', 'timeout', 'block']) {
    clearHttpCache();
    global.fetch = async (url) => {
      if (isSearch(url)) return response(url, captured('vit-search'));
      if (url.endsWith('8379')) return response(url, captured('vit-8379'));
      if (mode === 'timeout') throw Object.assign(new Error('deadline'), {name: 'AbortError'});
      if (mode === 'block') return response(url, '', 403);
      return response(url, captured('vit-12249').replace(ALCHEMIST, ISBN));
    };
    if (mode === 'block') await assert.rejects(checkPublicAvailability(library, ALCHEMIST), { code: 'CATALOG_PROVIDER_BLOCKED' });
    else {
      const result = await checkPublicAvailability(library, ALCHEMIST);
      assert.equal(result.outcome, 'in_catalog');
      assert.equal(result.totalCopies, undefined);
      assert.equal(result.availableCopies, undefined);
    }
  }
});

test('unknown or incomplete records never become complete aggregate availability counts', async () => {
  for (const incomplete of [false, true]) {
    clearHttpCache();
    global.fetch = async (url) => response(url, isSearch(url) ? captured('vit-search')
      : url.endsWith('8379') ? captured('vit-8379')
      : incomplete ? captured('vit-12249').replace('id="holdingst"', 'id="holdingst" data-ajax="/items"')
      : captured('vit-12249').replace('>Available </span>', '>In processing</span>'));
    const result = await checkPublicAvailability(library, ALCHEMIST);
    assert.equal(result.outcome, incomplete ? 'in_catalog' : 'unknown');
    assert.equal(Object.hasOwn(result, 'availableCopies'), false);
    if (incomplete) assert.equal(Object.hasOwn(result, 'totalCopies'), false);
  }
});

test('contradictory search counts are rejected before reading a record', async () => {
  let calls = 0;
  global.fetch = async url => { calls++; return response(url, multiSearch([1, 2]).replace('2 results', '1 results')); };
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  assert.equal(calls, 1);
});

test('large and paginated searches read bounded records and preserve a verified positive', async () => {
  for (const html of [multiSearch(Array.from({length:9}, (_, i) => i + 1)),
    multiSearch([1, 2]).replace('2 results', '100 results'),
    multiSearch([1, 2]).replace('2 results', '3 results'),
    `${multiSearch([1, 2])}<a rel="next" href="?page=2">Next</a>`]) {
    clearHttpCache();
    let calls = 0;
    global.fetch = async url => { calls++; return response(url, isSearch(url) ? html : fixture); };
    const result = await checkPublicAvailability(library, ISBN);
    assert.equal(result.outcome, 'available');
    assert.equal(result.totalCopies, undefined);
    assert.equal(result.availableCopies, undefined);
    assert.equal(calls, 2, 'first exact available record suffices');
  }
});

test('large searches cap reads at eight and cannot infer absence from nonmatching records', async () => {
  let calls = 0;
  global.fetch = async url => { calls++; return response(url, isSearch(url)
    ? multiSearch(Array.from({length:20}, (_, i) => i + 1)) : fixture.replace(ISBN, ALCHEMIST)); };
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  assert.equal(calls, 9);
});

test('a later timeout preserves an earlier verified available record without complete counts', async () => {
  global.fetch = async url => {
    if (isSearch(url)) return response(url, multiSearch([1, 2]));
    if (new URL(url).searchParams.get('biblionumber') === '1') return response(url, fixture);
    throw Object.assign(new Error('deadline'), { name: 'AbortError' });
  };
  const result = await checkPublicAvailability(library, ISBN);
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, undefined);
});

test('Anubis access challenges are reported as blocked, never not-found', async () => {
  global.fetch = async (url) => response(url, '<title>Making sure you&#39;re not a bot!</title><script id="anubis_challenge"></script>');
  await assert.rejects(checkPublicAvailability(library, ISBN), {code: 'CATALOG_PROVIDER_BLOCKED'});
});

test('captured ISBN-10 records and British Council single-copy holdings retain exact identity', () => {
  for (const [name, isbn, location, outcome] of [
    ['kct-178385', '9788120313538', 'Kumaraguru College of Technology', 'available'],
    ['nec-10673', '9788120312777', 'NEC Central Library', 'available'],
    ['british-206571', '9780141036144', 'Kolkata', 'none_available'],
    ['iitbbs-14696', '9781032721910', 'Central Library, IIT Bhubaneswar Textbook Section', 'available'],
    ['iimv-6276', '9789390727865', 'Indian Institute of Management Visakhapatnam', 'available'],
    ['ksu-846', '9788124605936', 'Karnataka Samskrit University Library', 'available'],
  ]) {
    const result = parseKohaPublicRecord(captured(name), isbn);
    assert.equal(result.outcome, outcome);
    assert.equal(result.totalCopies, 1);
    assert.ok(result.locations[0].name === location || result.locations[0].name.startsWith(location + ' · '));
  }
});


test('a genuine ISBN miss tries assigned hyphenated equivalents once before reading the exact record', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (!isSearch(url)) return response(url, fixture);
    if (new URL(url).searchParams.get('q') === ISBN) return response(url, captured('british-search'));
    return response(url, '', 302, { location: RECORD });
  };
  const result = await checkPublicAvailability(library, ISBN);
  assert.equal(result.availableCopies, 4);
  assert.equal(calls.length, 3);
  assert.deepEqual(new URL(calls[1]).searchParams.getAll('q'), ['978-0-262-03384-8', '0-262-03384-4']);
});

test('failed or ambiguous hyphenated fallbacks cannot become false not-found results', async () => {
  for (const failure of ['blocked', 'timeout', 'empty', 'wrong-isbn']) {
    clearHttpCache();
    global.fetch = async (url) => {
      if (!isSearch(url)) return response(url, fixture.replace(ISBN, '9780735219090'));
      if (new URL(url).searchParams.get('q') === ISBN) return response(url, captured('british-search'));
      if (failure === 'blocked') return response(url, '', 403);
      if (failure === 'timeout') throw Object.assign(new Error('deadline'), {name:'AbortError'});
      if (failure === 'empty') return response(url, '<p>No search results</p>');
      return response(url, '', 302, {location:RECORD});
    };
    await assert.rejects(checkPublicAvailability(library, ISBN), {code: failure === 'blocked' ? 'CATALOG_PROVIDER_BLOCKED' : failure === 'timeout' ? 'CATALOG_TIMEOUT' : 'CATALOG_UNRECOGNIZED'});
  }
});


test('explicit collapsed holdings expand once on the same record and retain reference restrictions', async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (isSearch(url)) return response(url, '', 302, {location:'/cgi-bin/koha/opac-detail.pl?biblionumber=1502'});
    return response(url, captured(url.includes('viewallitems=1') ? 'iihmr-delhi-1502' : 'iihmr-collapsed'));
  };
  const result = await checkPublicAvailability(library, '9788188973118');
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, 2);
  assert.equal(result.availableCopies, 1);
  assert.equal(calls.length, 3);
  assert.equal(result.catalogUrl, `${ORIGIN}/cgi-bin/koha/opac-detail.pl?biblionumber=1502&viewallitems=1`);
  const reference = parseKohaPublicRecord(captured('national-science-reference'), '0226775046');
  assert.equal(reference.outcome, 'unknown');
  assert.equal(reference.totalCopies, 1);
  assert.equal(Object.hasOwn(reference, 'availableCopies'), false);
});

test('expanded holdings never cross origin, select another record, or follow a loop', async () => {
  const href = '/cgi-bin/koha/opac-detail.pl?biblionumber=1502&amp;viewallitems=1';
  for (const target of ['https://other.example'+href, href.replace('1502','99'), href+'&amp;viewallitems=1', href]) {
    clearHttpCache();
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return isSearch(url) ? response(url, '', 302, {location:'/cgi-bin/koha/opac-detail.pl?biblionumber=1502'})
        : response(url, captured('iihmr-collapsed').replace(href,target));
    };
    const result = await checkPublicAvailability(library, '9788188973118');
    assert.equal(result.outcome, 'in_catalog');
    assert.equal(Object.hasOwn(result, 'totalCopies'), false);
    assert.equal(calls.length, target === href ? 3 : 2);
    assert.ok(calls.every((url) => url.startsWith(ORIGIN)));
  }
});

test('expanded record must still prove the requested ISBN', async () => {
  global.fetch = async (url) => isSearch(url) ? response(url, '', 302, {location:'/cgi-bin/koha/opac-detail.pl?biblionumber=1502'})
    : response(url, url.includes('viewallitems=1') ? fixture : captured('iihmr-collapsed'));
  await assert.rejects(checkPublicAvailability(library, '9788188973118'), {code:'CATALOG_UNRECOGNIZED'});
});


test('locally readable catalogs retain fixture coverage even when cloud access is unavailable', () => {
  for (const [name, isbn, total, available] of [
    ['curaj-26896', '9789355320520', 3, 3],
    ['indian-institute-astrophysics-9676', '9782863320433', 1, 1],
    ['st-xaviers-jaipur-14269', '9788196741471', 15, 13],
  ]) {
    const result = parseKohaPublicRecord(captured(name), isbn);
    assert.equal(result.outcome, 'available', name);
    assert.equal(result.totalCopies, total, name);
    assert.equal(result.availableCopies, available, name);
  }
});


test('reviewed HTTP-only public catalog stays pinned and verifies record-owned ISBN and holdings', async () => {
  const baseUrl = 'http://122.184.84.190:1011';
  const configured = { ...library, baseUrl, publicCatalogHttpOrigin: baseUrl };
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return isSearch(url) ? response(url, '', 302, { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=161170' })
      : response(url, captured('kalaignar-record-161170'));
  };
  const result = await checkPublicAvailability(configured, '9788172234980');
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, 3);
  assert.equal(result.availableCopies, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => new URL(url).origin === baseUrl));
  assert.equal(result.catalogUrl, baseUrl + '/cgi-bin/koha/opac-detail.pl?biblionumber=161170');
});

test('HTTP exception cannot authorize private hosts, other providers, a different origin or unsafe redirects', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
  const origin = 'http://122.184.84.190:1011';
  for (const config of [
    { baseUrl: origin }, { baseUrl: origin, publicCatalogHttpOrigin: 'http://122.184.84.190:8001' },
    { baseUrl: origin, publicCatalogHttpOrigin: origin, platform: 'aspen' },
    ...['http://localhost', 'http://127.0.0.1', 'http://10.1.1.1', 'http://172.16.0.1', 'http://169.254.169.254',
      'http://192.168.1.1', 'http://100.64.0.1', 'http://[::1]', 'http://catalog.internal',
      origin + '/private', origin + '?query=1', 'http://reader@122.184.84.190:1011']
      .map(baseUrl => ({ baseUrl, publicCatalogHttpOrigin: baseUrl })),
  ]) {
    await assert.rejects(checkPublicAvailability({ ...library, ...config }, ISBN), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  }
  assert.equal(calls, 0);
  for (const target of ['http://127.0.0.1' + RECORD, 'https://122.184.84.190:1011' + RECORD, 'http://122.184.84.190:8001' + RECORD]) {
    clearHttpCache();
    global.fetch = async url => { calls += 1; return response(url, '', 302, { location: target }); };
    await assert.rejects(checkPublicAvailability({ ...library, baseUrl: origin, publicCatalogHttpOrigin: origin }, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  }
  assert.equal(calls, 3);
});

test('explicit no-physical-items records contribute zero copies without claiming the ISBN is absent', async () => {
  const empty = captured('anna-record-404400');
  assert.deepEqual(parseKohaPublicRecord(empty, '9788172234980'), {
    outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true, totalCopies: 0, availableCopies: 0, locations: [],
  });
  for (const changed of [empty.replace('id="noitems"', 'id="message"'), empty.replace('No physical items for this record', 'No items available now')]) {
    assert.equal(Object.hasOwn(parseKohaPublicRecord(changed, '9788172234980'), 'totalCopies'), false);
  }
  assert.equal(parseKohaPublicRecord(empty, ISBN), null);
  global.fetch = async url => response(url, isSearch(url)
    ? '<body id="results"><h1 id="numresults">Your search returned 2 results.</h1><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=404400">1</a><a href="/cgi-bin/koha/opac-detail.pl?biblionumber=161170">2</a></body>'
    : captured(url.includes('404400') ? 'anna-record-404400' : 'kalaignar-record-161170'));
  const result = await checkPublicAvailability(library, '9788172234980');
  assert.equal(result.totalCopies, 3);
  assert.equal(result.availableCopies, 1);
  assert.equal(result.outcome, 'available');
});

test('new public endpoint fixtures retain lending and reference distinctions', () => {
  for (const [name, isbn, total, available, outcome] of [
    ['iit-dharwad-1864', '9788120320468', 1, 1, 'available'],
    ['nit-calicut-60834', '9788181436801', 1, 0, 'none_available'],
    ['klh-1571', '9788184884869', 1, undefined, 'unknown'],
    ['japan-foundation-15182', '9781138103726', 1, 1, 'available'],
    ['diet-dhemaji-70', '9788176256797', 1, 1, 'available'],
    ['arunachal-10926', '9789390652457', 1, undefined, 'unknown'],
    ['anna-wings-309107', '9788173711466', 3, 2, 'available'],
    ['anna-wings-497990', '9788173711466', 1, 1, 'available'],
    ...[112041,112042,112043,112044,112045,112046,112047].map(id => [`cvmu-${id}`, '9788119364268', 1, 1, 'available']),
  ]) {
    const result = parseKohaPublicRecord(captured(name), isbn);
    assert.equal(result.outcome, outcome, name);
    assert.equal(result.totalCopies, total, name);
    assert.equal(result.availableCopies, available, name);
  }
});


test('reference shelving overrides an otherwise available item without hiding its physical holding', () => {
  const reference = parseKohaPublicRecord(captured('arunachal-10926'), '9789390652457');
  assert.equal(reference.outcome, 'unknown');
  assert.equal(reference.totalCopies, 1);
  assert.equal(Object.hasOwn(reference, 'availableCopies'), false);
  const ordinary = parseKohaPublicRecord(captured('arunachal-10926').replace('Reference 2 Biography', 'General Biography'), '9789390652457');
  assert.equal(ordinary.outcome, 'available');
  assert.equal(ordinary.availableCopies, 1);
});


test('explicit home-library-only holdings are supported without claiming the current physical branch', () => {
  const home = fs.readFileSync(new URL('../../test/fixtures/koha/ramanujan-46940.html', import.meta.url), 'utf8');
  const result = parseKohaPublicRecord(home, '9788173802232');
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, 1);
  assert.equal(result.availableCopies, 1);
  assert.deepEqual(result.locations, [{ name: 'RCL (home library)', status: 'available', totalCopies: 1, availableCopies: 1 }]);
  assert.equal(parseKohaPublicRecord(home.replace('Home library', 'Library notes'), '9788173802232'), null);
  assert.deepEqual(parseKohaPublicRecord(fixture.replace('Current library', 'Current location'), ISBN), expected);
});


test('IDEAL legacy empty layout succeeds only inside the verified results main region', async () => {
  const empty = captured('ideal-empty');
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(url, empty); };
  assert.equal((await checkPublicAvailability(library, ISBN)).outcome, 'not_found');
  assert.equal(calls.length, 2, 'plain equivalents and hyphenated equivalents both checked');
  for (const html of [empty.replace('ID="results"', 'id="login"'), empty.replace('maincontent', 'footer'),
    empty.replace('<strong>No results found!</strong>', '<p>Search: No results found!</p>'),
    empty.replace('<h1>', '<h1 id="numresults">Your search returned 2 results.</h1><h1>'),
    empty.replace('</body>', '<p id="numresults"></p></body>')]) {
    clearHttpCache();
    global.fetch = async url => response(url, html);
    await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  }
});


test('legacy p#numresults supports complete multi-record searches without guessing a count', async () => {
  const page = multiSearch(['22365', '22366']).replace('<h1 id="numresults">', '<p id="numresults"><strong>').replace('</h1>', '</strong></p>');
  global.fetch = async url => response(url, isSearch(url) ? page : fixture);
  assert.equal((await checkPublicAvailability(library, ISBN)).outcome, 'available');
  clearHttpCache();
  global.fetch = async url => response(url, page.replace('2 results.', '3 results.'));
  await assert.rejects(checkPublicAvailability(library, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

test('a partial Koha search cannot turn another branch’s holding into selected-branch presence', async () => {
  global.fetch = async url => response(url, isSearch(url)
    ? multiSearch([1, 2]).replace('2 results', '100 results') : fixture);
  const result = await checkPublicAvailability({ ...library, kohaBranchCode: 'MISSING', kohaBranchName: 'A different library' }, ISBN);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.totalCopies, undefined);
  assert.equal(result.availableCopies, undefined);
});

const goaFixture = fs.readFileSync(new URL('../../test/fixtures/koha/goa-home-ownership.html', import.meta.url), 'utf8');
const goa = { platform: 'koha', baseUrl: 'http://dhegoalib.unifyed.com', publicCatalogHttpOrigin: 'http://dhegoalib.unifyed.com',
  kohaBranchCode: 'GCC', kohaBranchName: 'Government College of Commerce, Borda, Margao',
  kohaSearchUnscoped: true, kohaHomeLibraryOwnership: true };

test('reviewed home-library scope proves ownership without current-location availability', () => {
  const owned = parseKohaPublicRecord(goaFixture, '9788173711466', goa);
  assert.equal(owned.totalCopies, 1);
  assert.equal(owned.availableCopies, undefined);
  assert.equal(owned.outcome, 'unknown');
  assert.equal(owned.locations[0].status, 'unknown');
  assert.equal(parseKohaPublicRecord(goaFixture, '9788173711466', { ...goa, kohaBranchName: 'Another library' }).totalCopies, undefined);
  assert.equal(parseKohaPublicRecord(goaFixture, '9788173711466', { ...goa, kohaHomeLibraryOwnership: false }).totalCopies, undefined);
});

test('union title search returns only owned records and caches each branch independently', async () => {
  const page = '<body id="results"><a class="title" href="/cgi-bin/koha/opac-detail.pl?biblionumber=1079960">Wings of fire</a></body>';
  global.fetch = async url => response(url, isSearch(url) ? page : goaFixture);
  assert.equal(scopeSearch(new URL('/cgi-bin/koha/opac-search.pl', goa.baseUrl), goa).search, '');
  const result = await searchCatalog(goa, 'Wings of Fire');
  assert.equal(result.length, 1);
  assert.equal(result[0].observation.outcome, 'in_catalog');
  const other = { ...goa, kohaBranchCode: 'CCL', kohaBranchName: 'Carmel College Library' };
  await assert.rejects(() => searchCatalog(other, 'Wings of Fire'), /did not confirm/);
  await assert.rejects(() => resolveCatalogRecord(other, '1079960'), /did not confirm/);
});
