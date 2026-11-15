import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseIndcatSearch, parseIndcatRecord, searchCatalog, resolveCatalogRecord } from './indcat.js';
import { clearHttpCache, withCatalogOperation } from './http.js';

const search = fs.readFileSync(new URL('../../test/fixtures/indcat/bhu-title-search.html', import.meta.url), 'utf8');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

test('IndCat title results retain each scoped record’s author from the public search page', () => {
  const result = parseIndcatSearch(search, 'BHUL_221005');
  assert.equal(result.total, 62750);
  assert.deepEqual(result.records, [
    { recordId: '13009762', title: 'The discovery of India', authors: ['Nehru, Jawahar Lal'] },
    { recordId: '12903641', title: 'Discovery of India Gandhi', authors: ['Dhawan, S. K'] },
    { recordId: '13244344', title: 'Discovery of India', authors: ['Nehru, Jawaharlal'] },
  ]);
  assert.ok(result.records.every(record => !record.observation));
});

test('IndCat missing author metadata does not borrow an author from the next result', () => {
  const without = search.replace('<p>Author : Nehru, Jawahar Lal</p>', '<p>Publication Details : Oxford University Press, 1996</p>');
  const result = parseIndcatSearch(without, 'BHUL_221005');
  assert.deepEqual(result.records[0].authors, []);
  assert.deepEqual(result.records[1].authors, ['Dhawan, S. K']);
});

test('IndCat author metadata does not relax institution scope checks', () => {
  assert.throws(() => parseIndcatSearch(search, 'AMUL_202002'), { code: 'CATALOG_UNRECOGNIZED' });
});

test('IndCat preserves explicit serial material type even in the Books union catalog', () => {
  const html = fs.readFileSync(new URL('../../test/fixtures/indcat/bhu-weatherwise-serial.html', import.meta.url), 'utf8');
  const library = { name: 'Banaras Hindu University,Varanasi', baseUrl: 'https://indcat.inflibnet.ac.in', indcatInstitutionCode: 'BHUL_221005' };
  const result = parseIndcatRecord(html, library, '13097433', null, { confirmedMemberRecord: true });
  assert.equal(result.title, 'Weatherwise');
  assert.equal(result.format, 'Serial');
  assert.equal(result.observation.outcome, 'in_catalog');
  assert.equal(parseIndcatRecord(html.replace('00201ass a0000073ua 4500', '|a00201ass a0000073ua 4500'), library, '13097433', null,
    { confirmedMemberRecord: true }).format, 'Serial');
  assert.equal(parseIndcatRecord(html.replace('00201ass a0000073ua 4500', '00201asm a0000073ua 4500'), library, '13097433', null,
    { confirmedMemberRecord: true }).format, 'Book');
  assert.equal(parseIndcatRecord(html.replace('00201ass a0000073ua 4500', ''), library, '13097433', null,
    { confirmedMemberRecord: true }).format, undefined);
});

test('IndCat reads the observed subfield-prefixed monograph leader', () => {
  const html = fs.readFileSync(new URL('../../test/fixtures/indcat/gndu-prefixed-leader.html', import.meta.url), 'utf8');
  const library = { name: 'Guru Nanak Dev University, Amritsar', baseUrl: 'https://indcat.inflibnet.ac.in', indcatInstitutionCode: 'GNDU_143005' };
  const result = parseIndcatRecord(html, library, '5911381', null, { confirmedMemberRecord: true });
  assert.equal(result.title, 'History and the history teacher');
  assert.equal(result.format, 'Book');
  assert.equal(result.observation.outcome, 'in_catalog');
});

test('opening a search result reuses its bounded institution proof instead of searching the same membership again', async () => {
  const code = 'ALHB_211002';
  const library = { name: 'University of Allahabad, Allahabad', baseUrl: 'https://indcat.inflibnet.ac.in', indcatInstitutionCode: code };
  const record = fs.readFileSync(new URL('../../test/fixtures/indcat/allahabad-shared-record.html', import.meta.url), 'utf8');
  const data = Buffer.from(JSON.stringify({ book_detail: '12539158', university: 'IIMI_453556', singleclg: code })).toString('base64');
  let searches = 0, reads = 0;
  global.fetch = async (url, options = {}) => {
    const body = url.includes('/book_search?') ? (reads++, record) : options.method === 'POST' ? (searches++,
      `<input name="part_uni" value="${code}"><p>Total 1 Records found</p><a href="https://indcat.inflibnet.ac.in/index.php/search/book_search?getDetails=${data}">Wings of Fire</a>`)
      : `<input name="part_uni" value="${code}"><input name="csrf_test_name" value="anonymous_fixture_token">`;
    return { url, ok: true, status: 200, headers: new Headers(), text: async () => body };
  };
  await searchCatalog(library, 'Wings of Fire');
  // One record read suffices: it still has to prove the selected owner's
  // accession, but the previous scoped search proves its membership.
  const resolved = await withCatalogOperation({ maxRequests: 1 }, () => resolveCatalogRecord(library, '12539158'));
  assert.equal(resolved.observation.outcome, 'in_catalog');
  assert.equal(searches, 1);
  assert.equal(reads, 1);
  clearHttpCache();
  // Once the proof expires or is evicted, a durable link must confirm again.
  await assert.rejects(withCatalogOperation({ maxRequests: 1 }, () => resolveCatalogRecord(library, '12539158')), { code: 'CATALOG_REQUEST_BUDGET' });
});
