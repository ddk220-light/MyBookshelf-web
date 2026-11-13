import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCatalogPage, checkPublicRecordAvailability, searchPublicCatalog, searchBookCandidates, catalogPhrase, configureVisakhapatnamPacing, lendingStatus } from './visakhapatnam.js';
import { createTitleAuthorId, parseTitleAuthorId } from '../titleAuthorIdentity.js';
import { clearHttpCache } from './http.js';
import { createCatalogBookKey, parsePublicBookKey } from '../../public-v2/contracts.js';

const library = { id: 'vpl:visakhapatnam-public-library', baseUrl: 'https://visakhapatnampubliclibrary.org' };
const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/vpl/${name}.html`, import.meta.url), 'utf8');
const urlFor = (query, field = 'title') => {
  const url = new URL('/books', library.baseUrl);
  for (const name of ['title', 'subject', 'author']) url.searchParams.set(name, name === field ? query : '');
  url.searchParams.set('search', 'search');
  return url;
};
const originalFetch = global.fetch;
// The production crawl delay is 20 s; tests that do not measure it use none.
configureVisakhapatnamPacing({ crawlDelayMs: 0 });
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const response = (url, html, status = 200) => ({ url, text: async () => html, status, ok: status === 200, headers: new Headers() });
const title = 'Premante enti ? - nee drustilo';
const author = 'Ganesh Molugooori';
const id = createTitleAuthorId(title, author);
// Captured full-title search, with only the echoed query adjusted to the
// adapter's punctuation-safe phrase; the actual row remains unchanged.
const issued = fixture('title-9').replace('value="Premante enti ? - nee drustilo"', 'value="Premante enti"');

test('title/author identities survive Unicode and punctuation without unstable row numbers or URLs', () => {
  const encoded = createTitleAuthorId('தமிழ் புத்தகம்', 'ஆசிரியர்');
  assert.deepEqual(parseTitleAuthorId(encoded), { title: 'தமிழ் புத்தகம்', author: 'ஆசிரியர்' });
  const key = createCatalogBookKey(library.id, encoded);
  assert.equal(parsePublicBookKey(key).lookupKind, 'title_author');
  for (const bad of [encoded + '=', 'https://elsewhere/', Buffer.from('["Title","Author","extra"]').toString('base64url')]) assert.equal(parseTitleAuthorId(bad), null);
  assert.equal(parsePublicBookKey(key.replace('vpl:visakhapatnam-public-library', 'vpl:unconfigured')), null);
  assert.throws(() => createTitleAuthorId(' Title ', 'Author'));
  assert.throws(() => createTitleAuthorId('x'.repeat(501), 'Author'));
});

test('captured catalog rows require the expected form echoes and exact table structure', () => {
  const page = parseCatalogPage(issued, urlFor('Premante enti'));
  assert.equal(page.rows[0].recordId, id);
  assert.equal(page.rows[0].status, 'Issued');
  assert.equal(parseCatalogPage(issued.replace(title, 'Hidden stories'), urlFor('Premante enti')).rows[0].title, 'Hidden stories');
  assert.equal(parseCatalogPage(issued, urlFor('Another book')), null);
  for (const html of [issued.replace('<th>Status</th>', '<th>Count</th>'), issued.replace('name="form1"', 'name="login"'), issued + '<table></table>', issued.replace('<td>1</td>', '<td colspan="2">1</td>')]) assert.equal(parseCatalogPage(html, urlFor('Premante enti')), null);
  assert.equal(parseCatalogPage(fixture('empty-search'), urlFor('MyBookshelfNoSuchTitle263729')).rows.length, 0);
  assert.equal(parseCatalogPage(fixture('empty-search').replace('No Records', 'Please sign in'), urlFor('MyBookshelfNoSuchTitle263729')), null);
});

test('issued and available General-section books are reported without fabricated copy counts', async () => {
  global.fetch = async url => response(url, issued);
  const result = await checkPublicRecordAvailability(library, id);
  assert.equal(result.outcome, 'none_available');
  assert.equal(result.matchKind, 'verified_work');
  assert.equal(result.totalCopies, undefined);
  clearHttpCache();
  global.fetch = async url => response(url, issued.replace('>Issued<', '>Available<'));
  const available = await checkPublicRecordAvailability(library, id);
  assert.equal(available.outcome, 'available');
  assert.equal(available.availableCopies, undefined);
});

test('reference shelves remain non-lending and unverified shelf codes do not claim borrowability', async () => {
  global.fetch = async url => response(url, issued.replace('GS-1  R3  S63', 'Reference Section').replace('>Issued<', '>Available<'));
  assert.equal((await checkPublicRecordAvailability(library, id)).loanRestriction, 'not_for_loan');
  clearHttpCache();
  global.fetch = async url => response(url, issued.replace('GS-1  R3  S63', 'CA').replace('>Issued<', '>Available<'));
  const result = await checkPublicRecordAvailability(library, id);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.loanRestriction, undefined);
  assert.equal(result.locations[0].name, 'CA');
  clearHttpCache();
  global.fetch = async url => response(url, issued.replace('GS-1  R3  S63', '').replace('>Issued<', '>Available<'));
  const noLocation = await checkPublicRecordAvailability(library, id);
  assert.equal(noLocation.outcome, 'unknown');
  assert.deepEqual(noLocation.locations, []);
});

test('conflicting or paginated rows cannot assert availability for an unidentified edition', async () => {
  const row = issued.match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
  global.fetch = async url => response(url, issued.replace('</tbody>', row.replace('>Issued<', '>Available<') + '</tbody>'));
  assert.equal((await checkPublicRecordAvailability(library, id)).outcome, 'unknown');
});

test('author search is offered when a title search is empty and apostrophes never reach the fragile upstream query', async () => {
  assert.equal(catalogPhrase("Mum, what's wrong with you ? 101 things only mothers of teenage girl's know"), '101 things only mothers of teenage girl');
  global.fetch = async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.match(options.headers['User-Agent'], /^MyBookshelf\//);
    const parsed = new URL(url);
    if (parsed.searchParams.get('title')) return response(url, fixture('empty-search').replace('MyBookshelfNoSuchTitle263729', 'Candy Lorriane'));
    return response(url, fixture('fallback-author-41'));
  };
  const result = await searchPublicCatalog(library, 'Candy Lorriane');
  assert.equal(result.records.length, 1);
  assert.match(result.records[0].title, /Mum, what's wrong/);
});

test('mismatched authors, missing records, redirects and access restrictions fail closed', async () => {
  global.fetch = async url => response(url, issued.replace('Ganesh Molugooori', 'Other author'));
  await assert.rejects(checkPublicRecordAvailability(library, id), { code: 'CATALOG_UNRECOGNIZED' });
  clearHttpCache();
  global.fetch = async url => response('https://elsewhere.test/books', issued);
  await assert.rejects(checkPublicRecordAvailability(library, id), { code: 'CATALOG_UNRECOGNIZED' });
  global.fetch = async url => response(url, '', 403);
  await assert.rejects(checkPublicRecordAvailability(library, id), { code: 'CATALOG_PROVIDER_BLOCKED' });
  await assert.rejects(checkPublicRecordAvailability({ ...library, baseUrl: 'http://127.0.0.1' }, id), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
});

// Saved from https://visakhapatnampubliclibrary.org/books?title=wings+of+fire on
// 12 November 2026; only the echoed query is adjusted to the adapter's phrase.
const wings = fixture('wings-of-fire').replace('value="wings of fire"', 'value="Wings of Fire"');

test('rack and shelf codes on General Section racks count as lendable shelves, as the library shows them', async () => {
  const id = createTitleAuthorId('Wings of Fire', 'Kalam APJ Abdul.');
  let calls = 0;
  global.fetch = async url => { calls++; return response(url, wings); };
  const result = await checkPublicRecordAvailability(library, id);
  assert.equal(result.outcome, 'available');
  assert.deepEqual(result.locations.map(location => [location.name, location.status]),
    [['R11 S224', 'available'], ['R11 S223', 'available'], ['R241 S3', 'available']]);
  assert.equal(result.availableCopies, undefined);
  assert.equal(calls, 1);
  // Evidence comes from the page: subject "GS"/"(G S)" or the same rack written as "GS-1 R11 …".
  const racks = new Set(['R11']);
  assert.equal(lendingStatus({ location: 'R11 S229', subject: 'Biography', status: 'Available' }, racks), 'available');
  assert.equal(lendingStatus({ location: 'R241 S4', subject: 'Biography', status: 'Issued' }, racks), 'unknown');
  assert.equal(lendingStatus({ location: 'R241 S4', subject: 'Biography(G S)', status: 'Issued' }, racks), 'unavailable');
  assert.equal(lendingStatus({ location: 'R63 S4', subject: 'Autobiography / History', status: 'Available' }, racks), 'unknown');
  assert.equal(lendingStatus({ location: 'R', subject: 'GS', status: 'Available' }, racks), 'unknown');
  assert.equal(lendingStatus({ location: 'R11 S224', subject: 'GS', status: 'Lost' }, racks), 'unknown');
});

test('search rows are shown with clean authors while the record identity keeps the catalog text', async () => {
  global.fetch = async url => response(url, wings);
  const result = await searchPublicCatalog(library, 'Wings of Fire');
  const nulled = result.records.find(record => parseTitleAuthorId(record.recordId).author === 'NULL, Abdul Kalam.A.P.J.');
  assert.deepEqual(nulled.authors, ['Abdul Kalam.A.P.J.']);
  assert.ok(result.records.every(record => record.authors.every(author => !/NULL/.test(author))));
});

test('availability candidates reuse the search page: one request, observations from its rows', async () => {
  let calls = 0;
  global.fetch = async url => { calls++; return response(url, wings); };
  const { records } = await searchBookCandidates(library, { title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam' });
  assert.equal(calls, 1);
  const kalam = records.find(record => record.recordId === createTitleAuthorId('Wings of Fire', 'Kalam APJ Abdul.'));
  assert.equal(kalam.observation.outcome, 'available');
  assert.ok(records.every(record => record.observation?.recognizedTitleAuthor));
});

test('Telugu-script searches are reported as unsupported without sending a request that the catalog fails', async () => {
  let calls = 0;
  global.fetch = async url => { calls++; return response(url, '', 500); };
  await assert.rejects(searchPublicCatalog(library, 'వేయి పడగలు'), { code: 'CATALOG_QUERY_UNSUPPORTED' });
  await assert.rejects(searchBookCandidates(library, { title: 'వేయి పడగలు' }), { code: 'CATALOG_QUERY_UNSUPPORTED' });
  assert.equal(calls, 0);
  // A romanised search is still sent, and a real upstream failure is still an outage.
  await assert.rejects(searchPublicCatalog(library, 'veyi padagalu'), { code: 'CATALOG_UNAVAILABLE' });
  assert.equal(calls, 1);
});

test('the robots.txt crawl delay spaces successive requests within one search, not separate searches', async () => {
  configureVisakhapatnamPacing({ crawlDelayMs: 120 });
  try {
    const times = [];
    global.fetch = async url => {
      times.push(Date.now());
      const parsed = new URL(url);
      if (parsed.searchParams.get('title')) return response(url, fixture('empty-search').replace('MyBookshelfNoSuchTitle263729', 'Candy Lorriane'));
      return response(url, fixture('fallback-author-41'));
    };
    await searchPublicCatalog(library, 'Candy Lorriane');
    assert.equal(times.length, 2);
    assert.ok(times[1] - times[0] >= 115, `second request after ${times[1] - times[0]} ms`);
    clearHttpCache();
    const started = Date.now();
    global.fetch = async url => response(url, wings);
    await searchPublicCatalog(library, 'Wings of Fire');
    assert.ok(Date.now() - started < 100);
  } finally { configureVisakhapatnamPacing({ crawlDelayMs: 0 }); }
});
