import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseIndcatSearch, parseIndcatRecord, searchCatalog, resolveCatalogRecord, checkAvailability, checkAvailabilityForIsbns } from './indcat.js';
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

// Andhra University (ANDH_530003), 19 November 2026: a free all-fields search
// for "8173711461 9788173711466" returned the union of the two exact ISBN
// searches (records 12442695, 12515226 and 578503); record 578503 states
// ISBN 8173711461 and holds accession 414836 for this institution.
const ANDH = { name: 'Andhra University, Waltair', baseUrl: 'https://indcat.inflibnet.ac.in', indcatInstitutionCode: 'ANDH_530003' };
const andhSearch = fs.readFileSync(new URL('../../test/fixtures/indcat/andh-isbn-pair-search.html', import.meta.url), 'utf8');
const andhRecord = fs.readFileSync(new URL('../../test/fixtures/indcat/andh-578503-record.html', import.meta.url), 'utf8');
const scopePage = '<input name="part_uni" value="ANDH_530003"><input name="csrf_test_name" value="anonymous_fixture_token_1">';
const emptySearch = '<input name="part_uni" value="ANDH_530003"><p>Total 0 Records found in 0 ms</p>';
function indcatSite({ failFirstPost = false, searchFor = () => andhSearch } = {}) {
  const log = { scope: 0, posts: [], records: [] };
  global.fetch = async (url, options = {}) => {
    const headers = new Headers();
    let body;
    if (options.method === 'POST') {
      log.posts.push({ form: new URLSearchParams(options.body), cookie: options.headers.Cookie });
      if (failFirstPost && log.posts.length === 1) return { url, ok: false, status: 500, headers, text: async () => '<h1>An Error Was Encountered</h1>' };
      body = searchFor(new URLSearchParams(options.body).get('title'));
    } else if (url.includes('/book_search?')) {
      const id = JSON.parse(Buffer.from(new URL(url).searchParams.get('getDetails'), 'base64').toString()).book_detail;
      log.records.push(id);
      body = id === '578503' ? andhRecord : '<h1>Other record</h1>';
    } else {
      log.scope++;
      headers.append('set-cookie', `ci_session=anonymous_session_${log.scope}; path=/`);
      headers.append('set-cookie', `csrf_cookie_name=anonymous_fixture_token_${log.scope}; path=/`);
      body = scopePage.replace('anonymous_fixture_token_1', `anonymous_fixture_token_${log.scope}`);
    }
    return { url, ok: true, status: 200, headers, text: async () => body };
  };
  return log;
}

test('IndCat checks both forms of an ISBN in one scoped search and proves the edition on the record page', async () => {
  const log = indcatSite();
  const result = await checkAvailability(ANDH, '9788173711466');
  assert.equal(result.outcome, 'in_catalog');
  assert.equal(result.matchKind, 'exact_isbn');
  assert.equal(log.scope, 1);
  assert.equal(log.posts.length, 1);
  const form = log.posts[0].form;
  assert.equal(form.get('title'), '9788173711466 8173711461');
  assert.equal(form.get('field'), 'allfields');
  assert.equal(form.get('opt'), 'free');
  assert.equal(form.get('part_uni'), 'ANDH_530003');
  assert.equal(form.get('csrf_test_name'), 'anonymous_fixture_token_1');
  assert.match(log.posts[0].cookie, /ci_session=anonymous_session_1/);
  // Records that do not show this institution's holding are skipped, not trusted.
  assert.deepEqual(log.records, ['12442695', '12515226', '578503']);
});

test('one IndCat form session serves later searches, for any institution, until the catalog rejects it', async () => {
  const log = indcatSite({ searchFor: query => (/^9780262033848/.test(query) ? emptySearch : andhSearch) });
  assert.equal((await checkAvailability(ANDH, '9780262033848')).outcome, 'not_found');
  await searchCatalog(ANDH, 'Wings of Fire');
  assert.equal(log.scope, 1, 'one search page read for two searches');
  assert.equal(log.posts.length, 2);
  // A wrong institution in the answer is still refused.
  global.fetch = async (url, options = {}) => ({ url, ok: true, status: 200, headers: new Headers(),
    text: async () => (options.method === 'POST' ? andhSearch : scopePage) });
  await assert.rejects(searchCatalog({ ...ANDH, indcatInstitutionCode: 'GOAU_403206' }, 'Godaan'), { code: 'CATALOG_UNRECOGNIZED' });
});

test('a rejected IndCat session token is replaced once with a fresh search page', async () => {
  indcatSite();
  await searchCatalog(ANDH, 'Malgudi days');
  const log = indcatSite({ failFirstPost: true });
  const records = await searchCatalog(ANDH, 'Wings of Fire');
  assert.equal(records.length, 3);
  assert.equal(log.scope, 1, 'the cached session failed, so one new search page was read');
  assert.equal(log.posts.length, 2);
  assert.equal(log.posts[1].form.get('csrf_test_name'), 'anonymous_fixture_token_1');
  // A fresh session that fails is a catalog failure, not a retry loop.
  clearHttpCache();
  const fresh = indcatSite({ failFirstPost: true });
  await assert.rejects(searchCatalog(ANDH, 'Godaan'), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(fresh.posts.length, 1);
});

test('IndCat record pages prove any ISBN in their ISBN row or MARC 020 $a, never a cancelled $z', () => {
  const html = andhRecord.replace('|a81-7371-146-1</td></tr>',
    '|a81-7371-146-1</td></tr><tr ><td style="padding: 3px;">020</td><td style="padding: 3px;">__</td><td style="padding: 3px;">|a9788173715181|q(pbk.)|z9780000000002</td></tr>');
  const result = parseIndcatRecord(html, ANDH, '578503', '9788173715181');
  assert.deepEqual(result.isbns, ['9788173711466', '9788173715181']);
  assert.equal(result.observation.matchKind, 'exact_isbn');
  assert.equal(parseIndcatRecord(html, ANDH, '578503', '9780000000002'), null);
  assert.equal(parseIndcatRecord(andhRecord, ANDH, '578503', '9788173715181'), null);
});

test('several editions are checked in one IndCat search; a listed record counts only for an ISBN it states', async () => {
  let log = indcatSite({ searchFor: () => emptySearch });
  const none = await checkAvailabilityForIsbns(ANDH, ['9781408855652', '9780262033848']);
  assert.equal(none.outcome, 'not_found');
  assert.deepEqual(none.isbns, ['9781408855652', '9780262033848']);
  assert.equal(log.posts.length, 1);
  assert.equal(log.posts[0].form.get('title'), '9781408855652 1408855658 9780262033848 0262033844');
  clearHttpCache();
  log = indcatSite();
  const found = await checkAvailabilityForIsbns(ANDH, ['9781408855652', '9788173711466']);
  assert.equal(found.outcome, 'in_catalog');
  assert.equal(found.matchKind, 'exact_isbn');
  assert.equal(found.isbn13, '9788173711466');
  clearHttpCache();
  indcatSite();
  await assert.rejects(checkAvailabilityForIsbns(ANDH, ['9781408855652']), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});
