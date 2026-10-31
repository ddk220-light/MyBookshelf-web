import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCatalogPage, checkPublicRecordAvailability, searchPublicCatalog, catalogPhrase } from './visakhapatnam.js';
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
