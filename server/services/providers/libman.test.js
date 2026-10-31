import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLibmanSearch, parseLibmanRecord, searchCatalog, resolveCatalogRecord, checkAvailability } from './libman.js';
import { clearHttpCache } from './http.js';

const fixture = name => JSON.parse(fs.readFileSync(new URL(`../../test/fixtures/libman/${name}.json`, import.meta.url), 'utf8'));
const library = { name: 'Arka Jain University Library', baseUrl: 'https://libcloud.mastersofterp.in/OPAC_V3', libmanLibraryId: '22', catalogUrl: 'https://libcloud.mastersofterp.in/OPAC_V3/?library=Arka+Jain+University+Library' };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const response = (url, json, status = 200) => ({ url, ok: status === 200, status, headers: new Headers(), text: async () => typeof json === 'string' ? json : JSON.stringify(json) });

test('LIBMAN recognizes numeric zero but rejects error sentinels and non-JSON catalog pages', () => {
  assert.deepEqual(parseLibmanSearch(0), { records: [], total: 0 });
  assert.throws(() => parseLibmanSearch(-100));
  assert.throws(() => parseLibmanSearch('0'));
  assert.throws(() => parseLibmanSearch({ error: 'offline' }));
});

test('LIBMAN search strips unrelated website credentials and does not expose quantity as copies', () => {
  const source = fixture('search-known');
  Object.assign(source[0], { WEBSITELINK_USERNAME: 'must-not-appear', WEBSITELINK_PASSWORD: 'must-not-appear', Quantity: 99 });
  const result = parseLibmanSearch(source);
  assert.equal(result.records[0].recordId, '5568736');
  assert.equal(result.records[0].title, 'A BETTER INDIA A BETTER WORLD');
  assert.equal(JSON.stringify(result).includes('must-not-appear'), false);
  assert.equal(result.records[0].totalCopies, undefined);
});

test('LIBMAN item-level PRESENT confirms an available copy only after tenant ownership proof', () => {
  const raw = fixture('record-known');
  assert.equal(parseLibmanRecord(raw, library, '5568736'), null);
  const result = parseLibmanRecord(raw, library, '5568736', { confirmedMemberRecord: true, matchKind: 'exact_isbn' });
  assert.equal(result.isbn, '9780670082834');
  assert.equal(result.observation.outcome, 'available');
  assert.equal(result.observation.availableCopies, 1);
  assert.equal(result.observation.catalogUrl, library.catalogUrl);
  assert.equal(result.observation.catalogLinkKind, 'search');
});

test('LIBMAN unknown, lost, reference, missing and duplicated item rows cannot imply all copies are checked out', () => {
  for (const transform of [
    x => { x.IIDropDownList[0].STATUSNAME = 'LOST'; },
    x => { x.DOCUMENTTYPE = 'Reference'; },
    x => { x.TOTAL_COPIES = 3; x.IIDropDownList[0].STATUSNAME = 'ISSUED'; },
    x => { x.TOTAL_COPIES = 2; x.IIDropDownList.push({ ...x.IIDropDownList[0] }); x.IIDropDownList.forEach(r => { r.STATUSNAME = 'ISSUED'; }); },
  ]) {
    const raw = fixture('record-known'); transform(raw);
    const result = parseLibmanRecord(raw, library, '5568736', { confirmedMemberRecord: true });
    assert.equal(result.observation.outcome, 'in_catalog');
    assert.equal(result.observation.availableCopies, undefined);
  }
  const raw = fixture('record-known'); raw.IIDropDownList[0].STATUSNAME = 'ISSUED';
  assert.equal(parseLibmanRecord(raw, library, '5568736', { confirmedMemberRecord: true }).observation.outcome, 'none_available');
});

test('LIBMAN durable resolver rechecks the selected tenant after search cache expiry', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(new URL(url)); return response(url, url.includes('GetBookDetails') ? fixture('record-known') : fixture('search-known')); };
  const [book] = await searchCatalog(library, 'A BETTER INDIA');
  clearHttpCache();
  assert.equal((await resolveCatalogRecord(library, book.recordId)).isbn, '9780670082834');
  assert.ok(calls.filter(u => u.pathname.includes('GetBookSearchData')).every(u => u.searchParams.get('Libraryid') === '22'));
  assert.ok(calls.filter(u => u.pathname.includes('GetBookDetails')).every(u => u.searchParams.get('LibId') === '22'));
  assert.equal(calls.filter(u => u.pathname.includes('GetBookSearchData')).length, 2);
});

test('LIBMAN uses the published punctuation-free title search without treating error -100 as empty', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(new URL(url)); return response(url, fixture('search-known')); };
  await searchCatalog(library, 'The Bird With Golden Wings : Stories Of Wit And Magic');
  assert.equal(calls[0].searchParams.get('SearchText'), 'The Bird With Golden Wings');
});

test('LIBMAN guessed global record IDs cannot show another tenant’s book', async () => {
  global.fetch = async url => response(url, url.includes('GetBookDetails') ? fixture('record-known') : 0);
  await assert.rejects(resolveCatalogRecord(library, '5568736'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
  await assert.rejects(resolveCatalogRecord(library, '../123'));
  await assert.rejects(searchCatalog({ ...library, baseUrl: 'https://example.com/OPAC_V3' }, 'Wings'));
});

test('LIBMAN equivalent ISBN fallback validates record ISBN before claiming an exact match', async () => {
  const queries = [];
  global.fetch = async url => {
    const u = new URL(url); const q = u.searchParams.get('SearchText');
    if (q) queries.push(q);
    return response(url, url.includes('GetBookDetails') ? fixture('record-known') : q === '9780670082834' ? 0 : fixture('search-known'));
  };
  const result = await checkAvailability(library, '9780670082834');
  assert.equal(result.matchKind, 'exact_isbn'); assert.equal(result.outcome, 'available');
  assert.deepEqual(queries, ['9780670082834', '067008283X']);
});

test('LIBMAN successful equivalent-ISBN zero queries are not-found; blocked responses remain errors', async () => {
  global.fetch = async url => response(url, 0);
  assert.equal((await checkAvailability(library, '9788173711466')).outcome, 'not_found');
  clearHttpCache();
  global.fetch = async url => response(url, 'Blocked', 403);
  await assert.rejects(checkAvailability(library, '9788173711466'), { code: 'CATALOG_PROVIDER_BLOCKED' });
});

test('LIBMAN mismatching ISBN results cannot turn into not-found or exact availability', async () => {
  global.fetch = async url => response(url, url.includes('GetBookDetails') ? fixture('record-known') : fixture('search-known'));
  await assert.rejects(checkAvailability(library, '9788173711466'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('LIBMAN matching title without ISBN remains a possible match', async () => {
  const selected = { ...library, name: 'Lanja Library', libmanLibraryId: '8' };
  global.fetch = async url => {
    const u = new URL(url);
    return response(url, url.includes('GetBookDetails') ? fixture('record-missing-isbn') : u.searchParams.get('SearchCriteria') === 'ISBN' ? 0 : fixture('search-missing-isbn'));
  };
  const result = await checkAvailability(selected, '9788173711466', 'Wings Of Fine');
  assert.equal(result.matchKind, 'possible_match'); assert.equal(result.outcome, 'in_catalog');
});

test('LIBMAN partial detail failures preserve an early confirmed book without claiming a complete copy count', async () => {
  global.fetch = async url => {
    const u = new URL(url);
    if (u.searchParams.get('TitleNo') === '999') return response(url, 'unavailable', 503);
    if (url.includes('GetBookDetails')) return response(url, fixture('record-known'));
    return response(url, [...fixture('search-known'), { TitleNo: 999, Title1: 'A BETTER INDIA A BETTER WORLD' }]);
  };
  const result = await checkAvailability(library, '9780670082834');
  assert.equal(result.outcome, 'available'); assert.equal(result.matchKind, 'exact_isbn');
  assert.equal(result.availableCopies, undefined); assert.equal(result.totalCopies, undefined);
});

test('LIBMAN title fallback checks later exact-ISBN candidates before declaring none available', async () => {
  global.fetch = async url => {
    const u = new URL(url);
    if (url.includes('GetBookDetails')) {
      const value = fixture('record-known'); value.TITLENO = Number(u.searchParams.get('TitleNo'));
      if (value.TITLENO === 5568736) value.IIDropDownList[0].STATUSNAME = 'ISSUED';
      return response(url, value);
    }
    if (u.searchParams.get('SearchCriteria') === 'ISBN') return response(url, 0);
    return response(url, [...fixture('search-known'), { ...fixture('search-known')[0], TitleNo: 999 }]);
  };
  const result = await checkAvailability(library, '9780670082834', 'A BETTER INDIA A BETTER WORLD');
  assert.equal(result.outcome, 'available'); assert.equal(result.matchKind, 'exact_isbn'); assert.equal(result.availableCopies, 1);
});
