import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseIndcatRecord, parseIndcatSearch, searchCatalog, resolveCatalogRecord, checkAvailability as checkIndcat } from './indcat.js';
import { parseKohaPublicRecord, scopeSearch } from './koha.js';
import { parseCatalogSearch, resolveCatalogRecord as resolveEg4 } from './egranthalaya.js';
import { clearHttpCache } from './http.js';

const library = { name: 'Abhayapuri College', baseUrl: 'https://indcat.inflibnet.ac.in', indcatInstitutionCode: 'ABHA_783384' };
const record = fs.readFileSync(new URL('../../test/fixtures/indcat/abhayapuri-record.html', import.meta.url), 'utf8');
const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/egranthalaya/${name}.html`, import.meta.url), 'utf8');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

test('IndCat requires the full owning institution code and own ISBN, not catalogue agency', () => {
  const value = parseIndcatRecord(record, library, '24736067', '9788120350670');
  assert.equal(value.observation.outcome, 'in_catalog');
  assert.equal(value.observation.availableCopies, undefined);
  assert.equal(parseIndcatRecord(record, { ...library, indcatInstitutionCode: 'ABHA_000000' }, '24736067', '9788120350670'), null);
  assert.equal(parseIndcatRecord(record, library, '24736067', '9788173711466'), null);
  assert.equal(parseIndcatRecord(record.replaceAll('name="ucode"', 'name="other"'), library, '24736067'), null);
});
function searchHtml(code = 'ABHA_783384') {
  const data = Buffer.from(JSON.stringify({ book_detail: '24736067', university: 'OTHER_123', singleclg: code })).toString('base64');
  return `<input name="part_uni" value="${code}"><p>Total 1 Records found</p><a href="https://indcat.inflibnet.ac.in/index.php/search/book_search?getDetails=${data}">Fundamentals of Computers</a>`;
}
test('IndCat uses selected search scope even when cataloguing agency differs', () => {
  assert.equal(parseIndcatSearch(searchHtml(), 'ABHA_783384').records[0].recordId, '24736067');
  assert.throws(() => parseIndcatSearch(searchHtml('OTHER_123'), 'ABHA_783384'));
});
test('IndCat replays anonymous search only and resolves durable records after cache expiry', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const body = url.includes('book_search') ? record : options.method === 'POST' ? searchHtml()
      : '<input name="part_uni" value="ABHA_783384"><input name="csrf_test_name" value="fixture_anonymous_token">';
    return { url, ok: true, status: 200, headers: new Headers({ 'Set-Cookie': 'anonymous=fixture; Path=/; Secure' }), text: async () => body };
  };
  const books = await searchCatalog(library, 'Fundamentals');
  assert.equal(books.length, 1);
  const posted = new URLSearchParams(calls.find(c => c.options.method === 'POST').options.body);
  assert.equal(posted.get('part_uni'), 'ABHA_783384'); assert.equal(posted.get('field'), 'allfields');
  clearHttpCache();
  assert.equal((await resolveCatalogRecord(library, books[0].recordId)).isbn, '9788120350670');
  assert.equal(calls.some(c => c.url.includes('/bookrequest/')), false);
});
test('IndCat recovers one transient record-read disconnect within the original deadline', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    if (++calls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } });
    return { url, ok: true, status: 200, headers: new Headers(), text: async () => record };
  };
  assert.equal((await resolveCatalogRecord(library, '24736067')).observation.outcome, 'in_catalog');
  assert.equal(calls, 2);
});
test('IndCat does not replay a failed anonymous search POST', async () => {
  let posts = 0;
  global.fetch = async (url, options = {}) => {
    if (options.method === 'POST') { posts++; throw new TypeError('fetch failed'); }
    return { url, ok: true, status: 200, headers: new Headers({ 'Set-Cookie': 'anonymous=fixture' }),
      text: async () => '<input name="part_uni" value="ABHA_783384"><input name="csrf_test_name" value="fixture_anonymous_token">' };
  };
  await assert.rejects(searchCatalog(library, 'Fundamentals'), /fetch failed/);
  assert.equal(posts, 1);
});
test('Koha shared holdings never include another branch’s copies', () => {
  const html = '<span property="isbn">9788171640966</span><table class="holdingst"><thead><tr><th>Current location</th><th>Status</th></tr></thead><tbody><tr><td>Branch A</td><td>Available</td></tr><tr><td>Branch B</td><td>Checked out</td></tr></tbody></table>';
  const branch = { kohaLegacyHoldings: true, kohaBranchCode: 'B', kohaBranchName: 'Branch B' };
  const value = parseKohaPublicRecord(html, '9788171640966', branch);
  assert.equal(value.outcome, 'none_available'); assert.equal(value.totalCopies, 1); assert.equal(value.availableCopies, 0);
  assert.equal(parseKohaPublicRecord(html, '9788171640966', { ...branch, kohaBranchName: 'Missing' }).outcome, 'unknown');
  assert.equal(scopeSearch(new URL('https://catalog.example.test/search'), branch).searchParams.get('branch_group_limit'), 'branch:B');
});
test('eG4 title search rejects a different selected member', () => {
  const html = fixture('up-godan-stem-search');
  assert.throws(() => parseCatalogSearch(html, 'OTHER'));
});

test('eG4 opens ISBN-less catalog records only after a member-scoped confirmation', async () => {
  const selected = { name: 'Library', baseUrl: 'https://eg4.nic.in', egranthalayaCluster: 'PUBLICLIBRARIES', egranthalayaLibraryCode: 'HKMSLIB' };
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const body = url.includes('Details.aspx') ? '<span id="Lbl_TITLE">Godan: A Novel</span><span id="Lbl_AUTHOR">Premchand</span>No Accessioned Copy available!'
      : options.method === 'POST' ? '<select name="DDL_Library"><option selected value="HKMSLIB">Library</option></select><span id="Label37">Your Search Returned 1 Record(s)</span><span id="Repeater1_Lbl_Title_0">Godan: A Novel</span><a id="Repeater1_lnkDetails3_0" onclick="showValues(299889, false); return false;">Details</a>' : fixture('form');
    return { url, ok: true, status: 200, headers: new Headers({ 'Set-Cookie': 'ASP.NET_SessionId=anonymous-fixture; path=/; Secure' }), text: async () => body };
  };
  const book = await resolveEg4(selected, '299889');
  assert.equal(book.isbn, null); assert.equal(book.title, 'Godan: A Novel');
  assert.equal(book.observation.outcome, 'in_catalog');
  assert.equal(book.observation.availableCopies, undefined);
  const form = new URLSearchParams(calls.find(c => c.options.method === 'POST').options.body);
  assert.equal(form.get('DDL_Library'), 'HKMSLIB'); assert.equal(form.get('txt_Search'), 'Godan');
});


function mockIndcatSearch(choose) {
  const queries = [];
  global.fetch = async (url, options = {}) => {
    let body;
    if (url.includes('book_search')) body = record;
    else if (options.method === 'POST') {
      const params = new URLSearchParams(options.body);
      assert.equal(params.get('part_uni'), library.indcatInstitutionCode);
      assert.equal(params.get('field'), 'isbn');
      queries.push(params.get('title'));
      body = choose(params.get('title'));
    } else body = '<input name="part_uni" value="ABHA_783384"><input name="csrf_test_name" value="fixture_anonymous_token">';
    return { url, ok: true, status: 200, headers: new Headers({ 'Set-Cookie': 'anonymous=fixture' }), text: async () => body };
  };
  return queries;
}
const indcatEmpty = '<input name="part_uni" value="ABHA_783384"><p>Total 0 Records found</p>';
test('IndCat equivalent ISBN fallback proves the returned edition and institution', async () => {
  const queries = mockIndcatSearch(q => q === '8120350677' ? searchHtml() : indcatEmpty);
  const result = await checkIndcat(library, '9788120350670');
  assert.equal(result.outcome, 'in_catalog');
  assert.equal(result.matchKind, 'exact_isbn');
  assert.deepEqual(queries, ['9788120350670', '8120350677']);
});
test('IndCat complete equivalent-ISBN zero searches are no-match, never a connection error', async () => {
  const queries = mockIndcatSearch(() => indcatEmpty);
  const result = await checkIndcat(library, '9788173711466');
  assert.equal(result.outcome, 'not_found');
  assert.equal(result.matchKind, 'none');
  assert.equal(queries.length, 4);
  assert.equal(result.availableCopies, undefined);
});
test('IndCat query hits with a different record ISBN cannot become no-match or availability', async () => {
  mockIndcatSearch(() => searchHtml());
  await assert.rejects(checkIndcat(library, '9788173711466'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

const allahabad = { ...library, name: 'University of Allahabad, Allahabad', indcatInstitutionCode: 'ALHB_211002' };
const sharedRecord = fs.readFileSync(new URL('../../test/fixtures/indcat/allahabad-shared-record.html', import.meta.url), 'utf8');
test('IndCat shared agency code requires both an own named accession and independent scoped search', () => {
  const context = { confirmedMemberRecord: true };
  assert.equal(parseIndcatRecord(sharedRecord, allahabad, '12539158', '9788173711466'), null);
  const result = parseIndcatRecord(sharedRecord, allahabad, '12539158', '9788173711466', context);
  assert.equal(result.observation.outcome, 'in_catalog');
  assert.equal(result.observation.availableCopies, undefined);
  assert.equal(parseIndcatRecord(sharedRecord, library, '12539158', '9788173711466', context), null);
  assert.equal(parseIndcatRecord(sharedRecord, { ...library, name: 'Indian Institute of Management Indore',
    indcatInstitutionCode: 'IIMI_453556' }, '12539158', '9788173711466', context), null);
  assert.equal(parseIndcatRecord(sharedRecord, allahabad, '12539158', '9788120350670', context), null);
  assert.equal(parseIndcatRecord(sharedRecord.replaceAll('name="accno"', 'name="unused"'), allahabad, '12539158', null, context), null);
  assert.equal(parseIndcatRecord(sharedRecord.replaceAll('bk_12539158', 'bk_123'), allahabad, '12539158', null, context), null);
});

test('opening an IndCat shared record rechecks membership and never submits an ILL request', async () => {
  for (const scopedMatch of [true, false]) {
    clearHttpCache();
    const calls = [];
    const data = Buffer.from(JSON.stringify({ book_detail: '12539158', university: 'IIMI_453556', singleclg: 'ALHB_211002' })).toString('base64');
    global.fetch = async (url, options = {}) => {
      calls.push({url, options});
      const body = url.includes('book_search') ? sharedRecord : options.method === 'POST'
        ? `<input name="part_uni" value="ALHB_211002"><p>Total ${scopedMatch ? 1 : 0} Records found</p>${scopedMatch ? `<a href="https://indcat.inflibnet.ac.in/index.php/search/book_search?getDetails=${data}">Wings of Fire</a>` : ''}`
        : '<input name="part_uni" value="ALHB_211002"><input name="csrf_test_name" value="fixture_anonymous_token">';
      return { url, ok: true, status: 200, headers: new Headers({'Set-Cookie':'anonymous=fixture'}), text: async () => body };
    };
    if (scopedMatch) assert.equal((await resolveCatalogRecord(allahabad, '12539158')).observation.outcome, 'in_catalog');
    else await assert.rejects(resolveCatalogRecord(allahabad, '12539158'), { code: 'CATALOG_UNRECOGNIZED' });
    assert.ok(calls.some(c => c.options.method === 'POST'));
    assert.ok(calls.every(c => !c.url.includes('/bookrequest/')));
  }
});

test('IndCat own unaccessioned record requires source identity and an independent scoped match', () => {
  const source = fs.readFileSync(new URL('../../test/fixtures/indcat/pune-unaccessioned-record.html', import.meta.url), 'utf8');
  const pune = { ...library, name: 'Savitribai Phule Pune University', indcatInstitutionCode: 'PUNE_411007' };
  const proof = { confirmedMemberRecord: true };
  assert.equal(parseIndcatRecord(source, pune, '3267656', '9788173711466'), null);
  const result = parseIndcatRecord(source, pune, '3267656', '9788173711466', proof);
  assert.equal(result.observation.outcome, 'in_catalog');
  assert.equal(result.observation.availableCopies, undefined);
  assert.equal(parseIndcatRecord(source, library, '3267656', '9788173711466', proof), null);
  assert.equal(parseIndcatRecord(source.replace('name="university_uri"', 'name="unused"'), pune, '3267656', null, proof), null);
  assert.equal(parseIndcatRecord(source.replace('name="control_no"', 'name="unused"'), pune, '3267656', null, proof), null);
});
