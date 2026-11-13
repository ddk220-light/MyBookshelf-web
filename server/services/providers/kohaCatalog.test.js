import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseKohaCatalogRecord, parseKohaCatalogSearch, searchPublicCatalog, checkPublicRecordAvailability } from './koha.js';
import { clearHttpCache } from './http.js';

const fixture = (name) => fs.readFileSync(new URL(`../../test/fixtures/koha/${name}.html`, import.meta.url), 'utf8');
const tamil = fixture('chennai-catalog-101413');
const mixed = fixture('madurai-catalog-56886');
const emptyHoldings = fixture('chennai-catalog-415241');
const ernakulam = fixture('ernakulam-reference');
const library = { id: 'koha:anna-centenary-library', platform: 'koha', baseUrl: 'http://118.185.210.241:8001' };
const searchUrl = new URL('/cgi-bin/koha/opac-search.pl?idx=kw&q=history&count=12', library.baseUrl);
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
function response(url, html, status = 200, headers = {}) { return { url, text: async () => html, status, ok: status === 200, headers: new Headers(headers) }; }

test('Anna search keeps all 18 records and separates titles from catalog responsibility statements', () => {
  const result = parseKohaCatalogSearch(fixture('chennai-wings-search'), searchUrl);
  assert.equal(result.records.length, 18);
  assert.equal(result.hasMore, false);
  assert.equal(result.records[0].title, 'Wings of Fire: The dark secret');
  assert.deepEqual(result.records[0].authors, ['Sutherland, Tui']);
  assert.equal(result.records[0].publishedDate, '2013');
  assert.equal(result.records[0].edition, undefined);
  assert.equal(result.records[0].isbn13, '9780545349260');
  assert.equal(result.records.find(book => book.recordId === '497990').isbn13, '9788173711466');
  assert.equal(result.records.find(book => book.recordId === '573791').isbn13, undefined);
  assert.equal(result.records[2].edition, undefined);
  assert.equal(result.records.find(book => book.recordId === '497990').title, 'Wings of fire: an autobiography');
  assert.equal(new Set(result.records.map(book => book.recordId)).size, 18);
});

test('search ISBNs must belong to the exact record and title; conflicting attributes are rejected', () => {
  const html = fixture('chennai-wings-search');
  for (const altered of [
    html.replace('data-biblionumber="479740"', 'data-biblionumber="999999"'),
    html.replace('data-title="Wings of Fire: The dark secret"', 'data-title="Other book"'),
    html.replace('data-isbn="0545349265" data-isbn="0545349265"', 'data-isbn="0545349265" data-isbn="8173711461"'),
  ]) assert.equal(parseKohaCatalogSearch(altered, searchUrl).records[0].isbn13, undefined);
});

test('catalog pagination uses the actual returned page length and keeps branch filters', async () => {
  const entry = { ...library, kohaBranchCode: 'MAIN', kohaBranchName: 'Anna Centenary Library' };
  const html = fixture('chennai-wings-search');
  const first = parseKohaCatalogSearch(html, searchUrl, 12);
  assert.equal(first.nextOffset, 12);
  const nextUrl = new URL(searchUrl); nextUrl.searchParams.set('offset', '40');
  const last = parseKohaCatalogSearch(html.replace('18 results.', '58 results.'), nextUrl);
  assert.equal(last.hasMore, false);
  global.fetch = async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('offset'), '40');
    assert.equal(parsed.searchParams.get('limit'), 'branch:MAIN');
    assert.equal(parsed.searchParams.get('count'), '40');
    return response(url, html.replace('18 results.', '100 results.'));
  };
  const next = await searchPublicCatalog(entry, 'Wings of Fire', { offset: 40 });
  assert.equal(next.nextOffset, 58);
});

test('shared Koha holdings exclude partner libraries using explicit branch identity', () => {
  const scope = { libraryName: 'Ernakulam Public Library' };
  const own = parseKohaCatalogRecord(ernakulam, '174122', scope).availability;
  assert.equal(own.loanRestriction, 'not_for_loan');
  const partner = ernakulam.match(/<tbody>([\s\S]*?)<\/tbody>/)[1]
    .replaceAll('Ernakulam Public Library', 'Ernakulam Bar Association').replaceAll('Reference', 'Lending').replace('Not for loan ', 'Available ');
  const combined = parseKohaCatalogRecord(ernakulam.replace('</tbody>', partner + '</tbody>'), '174122', scope).availability;
  assert.equal(combined.totalCopies, 1);
  assert.equal(combined.loanRestriction, 'not_for_loan');
  assert.ok(combined.locations.every(location => !location.name.includes('Bar Association')));
  const unknown = parseKohaCatalogRecord(ernakulam.replace('data-name="Ernakulam Public Library"', ''), '174122', scope).availability;
  assert.equal(unknown.totalCopies, undefined);
});

test('branch-filtered searches and cached records stay scoped to the selected library', async () => {
  const entry = { id: 'koha:ernakulam-public-library', platform: 'koha', baseUrl: 'http://opac.ernakulampubliclibrary.com', kohaBranchCode: 'MAIN', kohaBranchName: 'Ernakulam Public Library' };
  global.fetch = async url => {
    if (url.includes('opac-search')) {
      assert.equal(new URL(url).searchParams.get('limit'), 'branch:MAIN');
      return response(url, '', 302, { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=174122' });
    }
    return response(url, ernakulam);
  };
  assert.equal((await searchPublicCatalog(entry, 'History')).records[0].recordId, '174122');
  assert.equal((await checkPublicRecordAvailability(entry, '174122')).totalCopies, 1);
  assert.equal((await checkPublicRecordAvailability({ ...entry, kohaBranchCode: 'EBA', kohaBranchName: 'Ernakulam Bar Association' }, '174122')).totalCopies, undefined);
});

test('title-first catalogs fall back to author search after a proven empty result', async () => {
  const entry = { id: 'koha:ernakulam-public-library', platform: 'koha', baseUrl: 'http://opac.ernakulampubliclibrary.com', kohaBranchCode: 'MAIN', kohaBranchName: 'Ernakulam Public Library', kohaTitleSearchFirst: true };
  const indexes = [];
  global.fetch = async url => {
    if (!url.includes('opac-search')) return response(url, ernakulam);
    const parsed = new URL(url), index = parsed.searchParams.get('idx');
    indexes.push(index);
    if (index === 'ti') return response(url, `<body id="results"><h1 id="numresults">No results found!</h1><a href="${url}&format=rss">RSS</a></body>`);
    return response(url, '', 302, { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=174122' });
  };
  assert.equal((await searchPublicCatalog(entry, 'Satish Chandra')).records[0].recordId, '174122');
  assert.deepEqual(indexes, ['ti', 'au']);
});

test('a captured Tamil record without an ISBN has its own verifiable identity and holdings', () => {
  const record = parseKohaCatalogRecord(tamil, '101413');
  assert.match(record.book.title, /அலுவலக மேலாண்மை/);
  assert.equal(record.book.isbn13, undefined);
  assert.equal(record.book.recordId, '101413');
  assert.equal(record.availability.matchKind, 'catalog_record');
  assert.equal(record.availability.recognizedRecord, true);
  assert.equal(record.availability.outcome, 'unknown');
  assert.equal(record.availability.loanRestriction, 'not_for_loan');
  assert.equal(record.availability.totalCopies, 1);
  assert.equal(record.availability.availableCopies, undefined);
});

test('record ownership requires the detail container and independent record identifier', () => {
  for (const html of [
    tamil.replace('data-biblionumber="101413"', 'data-biblionumber="101414"'),
    tamil.replace('koha:biblionumber:101413', 'koha:biblionumber:101414'),
    tamil.replace('id="opac-detail"', 'id="results"'),
    tamil.replace('id="catalogue_detail_biblio"', 'id="recommendation"'),
    tamil + '<abbr class="unapi-id" title="koha:biblionumber:101414"></abbr>',
  ]) assert.equal(parseKohaCatalogRecord(html, '101413'), null);
  assert.equal(parseKohaCatalogRecord(tamil, '101414'), null);
  assert.equal(parseKohaCatalogRecord(tamil, '../101413'), null);
});

test('mixed lending and reference copies keep separate counts and floors', () => {
  const { availability } = parseKohaCatalogRecord(mixed, '56886');
  assert.equal(availability.availableCopies, 1);
  assert.equal(availability.notForLoanCopies, 1);
  assert.equal(availability.totalCopies, 2);
  assert.equal(availability.outcome, 'available');
  assert.equal(availability.loanRestriction, undefined);
  assert.match(availability.locations.find(location => location.notForLoanCopies).name, /Fourth floor/);
  assert.match(availability.locations.find(location => location.availableCopies).name, /Third floor/);
  const checkedOut = parseKohaCatalogRecord(mixed.replace('Available ', 'Checked out '), '56886').availability;
  assert.equal(checkedOut.outcome, 'none_available');
  assert.equal(checkedOut.notForLoanCopies, 1);
});

test('a real record with no public items remains a known book with unknown availability', () => {
  const { book, availability } = parseKohaCatalogRecord(emptyHoldings, '415241');
  assert.match(book.title, /கோவிந்தனாரின்/);
  assert.equal(availability.outcome, 'unknown');
  assert.equal(availability.matchKind, 'catalog_record');
  assert.equal(availability.totalCopies, undefined);
});

test('bounded search candidates include author and publication details without claiming availability', () => {
  for (const site of ['chennai', 'madurai']) {
    const result = parseKohaCatalogSearch(fixture(`${site}-title-search`), searchUrl, 1);
    assert.equal(result.records.length, 1);
    assert.equal(result.hasMore, true);
    assert.ok(result.records[0].authors.length);
    assert.ok(result.records[0].publishedDate);
    assert.equal(result.records[0].availability, undefined);
    assert.equal(result.records[0].isbn13, undefined);
  }
});

test('search rejects malformed summaries and unsafe record links', () => {
  const html = fixture('chennai-title-search');
  assert.equal(parseKohaCatalogSearch(html.replace('id="results"', 'id="login"'), searchUrl), null);
  assert.equal(parseKohaCatalogSearch(html.replace('id="title_summary_523926"', 'id="title_summary_523925"'), searchUrl), null);
  assert.throws(() => parseKohaCatalogSearch(html.replace('href="/cgi-bin/koha/opac-detail.pl', 'href="http://127.0.0.1/cgi-bin/koha/opac-detail.pl'), searchUrl), { code: 'CATALOG_UNRECOGNIZED' });
});

test('a unique title result still asks the reader to choose and resolves only same-origin records', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return url.includes('opac-search') ? response(url, '', 302, { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=101413' }) : response(url, tamil);
  };
  const result = await searchPublicCatalog(library, 'அலுவலக மேலாண்மை');
  assert.equal(result.records[0].recordId, '101413');
  assert.equal(result.hasMore, false);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).searchParams.get('idx'), 'kw');
  assert.equal(new URL(calls[0].url).searchParams.get('q'), 'அலுவலக மேலாண்மை');
  assert.ok(calls.every(({ options }) => options.redirect === 'manual' && /^MyBookshelf\//.test(options.headers['User-Agent'])));
  clearHttpCache();
  global.fetch = async (url) => response(url, '', 302, { location: 'http://127.0.0.1/cgi-bin/koha/opac-detail.pl?biblionumber=101413' });
  await assert.rejects(searchPublicCatalog(library, 'Tamil'), { code: 'CATALOG_UNRECOGNIZED' });
});

test('record identifiers cannot supply paths, hosts, queries or account routes', async () => {
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Unexpected request'); };
  for (const recordId of ['0', '01', '../1', '1&account=2', 'https://elsewhere/1', '1'.repeat(13)]) {
    await assert.rejects(checkPublicRecordAvailability(library, recordId), { code: 'CATALOG_UNRECOGNIZED' });
  }
  assert.equal(calls, 0);
});

// Pages saved from the libraries' own catalogs on 12 November 2026.
test('saved Kalaignar and Anna records reach readers without catalog leftovers', () => {
  const kalaignar = parseKohaCatalogRecord(fixture('kalaignar-wings-214193'), '214193', {});
  assert.equal(kalaignar.book.title, 'Wings of fire: an autobiography');
  assert.equal(kalaignar.book.publishedDate, '2019');
  assert.equal(kalaignar.book.publisher, 'Universities Press Private Limited');
  assert.equal(kalaignar.book.edition, '23rd ed');
  assert.equal(kalaignar.book.isbn13, '9788173715488');
  // "GRATIS" is how the copy was acquired, not a book format; the copy is
  // still reported, and still not for loan.
  assert.equal(kalaignar.availability.format, undefined);
  assert.equal(kalaignar.availability.loanRestriction, 'not_for_loan');
  assert.equal(kalaignar.availability.totalCopies, 1);
  assert.equal(kalaignar.availability.callNumber, '623.092 ABD');
  const anna = parseKohaCatalogRecord(fixture('anna-wings-309106'), '309106', {});
  assert.equal(anna.book.title, 'Wings of fire: an autobiography');
  assert.deepEqual(anna.book.authors, ['Abdul Kalam, A. P. J']);
  assert.equal(anna.availability.outcome, 'available');
  assert.equal(anna.availability.availableCopies, 1);
});

test('saved Ernakulam search and record: capitals, placeholder editions and one-letter call numbers are cleaned', () => {
  const url = new URL('http://opac.ernakulampubliclibrary.com/cgi-bin/koha/opac-search.pl?idx=ti&q=Wings+of+Fire&limit=branch%3AMAIN&count=40');
  const result = parseKohaCatalogSearch(fixture('ernakulam-wings-search'), url);
  assert.equal(result.records.length, 23);
  const byId = id => result.records.find(record => record.recordId === id);
  assert.equal(byId('100942').title, 'Wings of Fire: An Autobiography');
  assert.equal(byId('100942').edition, undefined);
  assert.equal(byId('100942').publishedDate, '1999');
  assert.equal(byId('197354').title, 'WINGS OF FIRE: Autobiography'); // partly capitalised: left as catalogued
  assert.equal(byId('119903').edition, '1');
  // Mixed-case titles are the catalog's own casing and stay as written.
  assert.equal(byId('199310').title, 'WINGS OF FIRE: Darkness Of Dragons Book 10');
  assert.ok(result.records.every(record => !/\/$|^NULL$/.test(record.title) && !(record.authors || []).includes('NULL')));
  const record = parseKohaCatalogRecord(fixture('ernakulam-wings-100942'), '100942', { libraryName: 'Ernakulam Public Library' });
  assert.equal(record.availability.outcome, 'available');
  assert.equal(record.availability.callNumber, '923');
  const shelfLetter = parseKohaCatalogRecord(fixture('ernakulam-wings-100942').replace(/(<td class="call_no"[^>]*>)\s*923/, '$1 A'), '100942', { libraryName: 'Ernakulam Public Library' });
  assert.equal(shelfLetter.availability.callNumber, undefined);
  assert.equal(shelfLetter.availability.outcome, 'available');
});
