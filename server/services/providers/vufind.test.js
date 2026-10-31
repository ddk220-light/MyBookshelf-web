import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseVufindSearch, parseVufindRecord, vufindSearchUrl, searchCatalog, resolveCatalogRecord, checkAvailability } from './vufind.js';
import { clearHttpCache } from './http.js';
import { X509Certificate } from 'node:crypto';
import { kalnetTransportOptions, validatedKalnetIntermediate } from './kalnet-tls.js';

const fixture = name => fs.readFileSync(new URL(`../../test/fixtures/vufind/${name}.html`, import.meta.url), 'utf8');
const somaiya = { name: 'The Somaiya School Library', baseUrl: 'https://koha-opac.somaiya.edu', vufindInstitution: 'TSS', vufindInstitutionLabel: 'The Somaiya School Library' };
const kalnet = { name: 'CH Mohammed Koya Library', baseUrl: 'https://kalnet.kshec.kerala.gov.in/vufind', vufindInstitution: 'University of Calicut', vufindBuilding: 'CH Mohammed Koya Library' };
const kerala = { ...kalnet, name: 'Kerala University Library', vufindInstitution: 'University of Kerala', vufindBuilding: 'Kerala University Library' };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const response = (url, html, status = 200) => ({ url, ok: status === 200, status, headers: new Headers(), text: async () => html });

test('KALNET requests and verifies both institution and building, including encoded characters', () => {
  const url = new URL(vufindSearchUrl(kalnet, '9788173711466', 'ISN'));
  assert.deepEqual(url.searchParams.getAll('filter[]'), ['institution:"University of Calicut"', 'building:"CH Mohammed Koya Library"']);
  assert.equal(parseVufindSearch(fixture('kalnet-search'), kalnet).records[0].recordId, 'uoc.111584');
  assert.throws(() => parseVufindSearch(fixture('kalnet-search'), kerala));
  assert.throws(() => vufindSearchUrl({ ...kalnet, vufindBuilding: null }, 'Wings'));
  assert.throws(() => parseVufindSearch(fixture('kalnet-search').replaceAll('name="filter[]"', 'name="ignored"'), kalnet));
});

test('VuFind only accepts record links inside the configured public catalog and safe record IDs', () => {
  const html = fixture('somaiya-search');
  assert.throws(() => parseVufindSearch(html.replaceAll('/Record/tsskoha.20192', 'https://example.com/Record/tsskoha.20192'), somaiya));
  assert.throws(() => vufindSearchUrl({ ...somaiya, baseUrl: 'http://127.0.0.1' }, 'Wings'));
  assert.throws(() => vufindSearchUrl({ ...somaiya, vufindInstitution: 'TSS" OR *:*' }, 'Wings'));
});

test('VuFind records use COinS ISBN metadata, not highlighted query text', () => {
  const result = parseVufindSearch(fixture('somaiya-search').replaceAll('<mark>9788173711466</mark>', '<mark>9780670082834</mark>'), somaiya);
  assert.equal(result.records[0].isbn, '9788173711466');
  assert.equal(result.records[0].authors[0], 'Kalam, A.P.J. Abdul');
  assert.equal(parseVufindSearch(fixture('kalnet-search'), kalnet).records[0].isbn, null);
});

test('VuFind recognized scoped zero is a working query, while maintenance pages are errors', () => {
  assert.equal(parseVufindSearch(fixture('kalnet-zero'), kerala).total, 0);
  assert.equal(parseVufindSearch(fixture('somaiya-zero'), { ...somaiya, vufindInstitution: 'KJSAC' }).total, 0);
  assert.throws(() => parseVufindSearch('<h1>Temporarily offline</h1>', somaiya));
});

test('Somaiya named holdings expose the selected library’s two available copies out of three', () => {
  const raw = fixture('somaiya-record');
  assert.equal(parseVufindRecord(raw, somaiya, 'tsskoha.20192'), null);
  const result = parseVufindRecord(raw, somaiya, 'tsskoha.20192', { confirmedMemberRecord: true });
  assert.equal(result.observation.outcome, 'available'); assert.equal(result.observation.availableCopies, 2); assert.equal(result.observation.totalCopies, 3);
  const other = parseVufindRecord(raw, { ...somaiya, vufindInstitutionLabel: 'Other School Library' }, 'tsskoha.20192', { confirmedMemberRecord: true });
  assert.equal(other.observation.outcome, 'in_catalog'); assert.equal(other.observation.totalCopies, undefined);
});

test('Somaiya unknown copy status and truncated rows cannot become zero available', () => {
  const raw = fixture('somaiya-record').replaceAll('Available', 'Live Status Unavailable');
  const result = parseVufindRecord(raw, somaiya, 'tsskoha.20192', { confirmedMemberRecord: true });
  assert.equal(result.observation.outcome, 'in_catalog'); assert.equal(result.observation.availableCopies, undefined);
  const allOut = parseVufindRecord(fixture('somaiya-record').replaceAll('Available', 'Checked out'), somaiya, 'tsskoha.20192', { confirmedMemberRecord: true });
  assert.equal(allOut.observation.outcome, 'none_available'); assert.equal(allOut.observation.availableCopies, 0);
  const missingItemIdentity = fixture('somaiya-record').replaceAll('Available', 'Checked out').replace('property="serialNumber" content="SB11494"', 'property="unrecognized" content="SB11494"');
  const partial = parseVufindRecord(missingItemIdentity, somaiya, 'tsskoha.20192', { confirmedMemberRecord: true });
  assert.equal(partial.observation.outcome, 'in_catalog'); assert.equal(partial.observation.availableCopies, undefined); assert.equal(partial.observation.totalCopies, undefined);
});

test('KALNET university-wide holdings never imply department copies or live circulation', () => {
  const value = parseVufindRecord(fixture('kalnet-record'), kalnet, 'uoc.111584', { confirmedMemberRecord: true, isbn: '9788173711466' });
  assert.equal(value.observation.outcome, 'in_catalog'); assert.equal(value.observation.totalCopies, undefined);
  assert.equal(value.observation.availableCopies, undefined); assert.equal(value.observation.callNumber, undefined);
  assert.equal(value.observation.locations[0].name, 'CH Mohammed Koya Library');
});

test('KALNET durable resolver retrieves published Description ISBN and rechecks both filters', async () => {
  const calls = [];
  global.fetch = async url => {
    calls.push(new URL(url));
    return response(url, fixture(url.includes('/Description') ? 'kalnet-description' : url.includes('/Record/') ? 'kalnet-record' : 'kalnet-search'));
  };
  const [book] = await searchCatalog(kalnet, 'Wings of Fire');
  clearHttpCache();
  const result = await resolveCatalogRecord(kalnet, book.recordId);
  assert.equal(result.isbn, '9788173711466'); assert.equal(result.observation.outcome, 'in_catalog');
  const lastSearch = calls.filter(u => u.pathname.endsWith('/Search/Results')).at(-1);
  assert.equal(lastSearch.searchParams.get('lookfor'), '9788173711466');
  assert.equal(lastSearch.searchParams.getAll('filter[]').length, 2);
  assert.ok(calls.some(u => u.pathname.endsWith('/Description')));
});

test('KALNET durable resolver confirms the same Kerala record using ISBN-10 when ISBN-13 returns zero', async () => {
  const searches = [];
  global.fetch = async url => {
    const u = new URL(url);
    if (u.pathname.includes('/Record/')) return response(url, fixture('kalnet-kerala-record'));
    searches.push(u);
    return response(url, fixture(u.searchParams.get('type') === 'Title' || u.searchParams.get('lookfor') === '8173711461' ? 'kalnet-kerala-isbn10' : 'kalnet-zero'));
  };
  const [book] = await searchCatalog(kerala, 'Wings of Fire');
  clearHttpCache();
  searches.length = 0;
  const result = await resolveCatalogRecord(kerala, book.recordId);
  assert.equal(result.recordId, 'uok.118349');
  assert.equal(result.isbn, '9788173711466');
  assert.equal(result.observation.outcome, 'in_catalog');
  assert.equal(result.observation.availableCopies, undefined);
  assert.deepEqual(searches.map(u => [u.searchParams.get('type'), u.searchParams.get('lookfor')]), [['ISN', '9788173711466'], ['ISN', '8173711461']]);
  for (const u of searches) assert.deepEqual(u.searchParams.getAll('filter[]'), ['institution:"University of Kerala"', 'building:"Kerala University Library"']);
});

test('VuFind durable title fallback proves exact record membership when both ISBN indexes miss', async () => {
  const searches = [];
  global.fetch = async url => {
    const u = new URL(url);
    if (u.pathname.includes('/Record/')) return response(url, fixture('kalnet-kerala-record'));
    searches.push(u);
    return response(url, fixture(u.searchParams.get('type') === 'Title' ? 'kalnet-kerala-isbn10' : 'kalnet-zero'));
  };
  const result = await resolveCatalogRecord(kerala, 'uok.118349');
  assert.equal(result.recordId, 'uok.118349');
  assert.deepEqual(searches.map(u => u.searchParams.get('type')), ['ISN', 'ISN', 'Title']);
  clearHttpCache();
  global.fetch = async url => response(url, url.includes('/Record/')
    ? fixture('kalnet-kerala-record')
    : fixture('kalnet-kerala-isbn10').replaceAll('uok.118349', 'uok.999999'));
  await assert.rejects(resolveCatalogRecord(kerala, 'uok.118349'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('VuFind resolver rejects a real record outside the selected member even after a successful detail fetch', async () => {
  global.fetch = async url => response(url, fixture(url.includes('/Record/') ? 'somaiya-record' : 'somaiya-zero'));
  await assert.rejects(resolveCatalogRecord({ ...somaiya, vufindInstitution: 'KJSAC' }, 'tsskoha.20192'), { code: 'CATALOG_HOLDING_UNCONFIRMED' });
});

test('Somaiya exact ISBN and equivalent-ISBN zero paths remain distinct', async () => {
  global.fetch = async url => response(url, fixture(url.includes('/Record/') ? 'somaiya-record' : 'somaiya-search'));
  const result = await checkAvailability(somaiya, '9788173711466');
  assert.equal(result.matchKind, 'exact_isbn'); assert.equal(result.outcome, 'available'); assert.equal(result.availableCopies, 2);
  clearHttpCache();
  global.fetch = async url => response(url, fixture('somaiya-zero'));
  assert.equal((await checkAvailability({ ...somaiya, vufindInstitution: 'KJSAC' }, '9788173711466')).outcome, 'not_found');
});

test('VuFind detail failure preserves scoped COinS edition evidence without circulation claims', async () => {
  global.fetch = async url => url.includes('/Record/') ? response(url, 'offline', 503) : response(url, fixture('somaiya-search'));
  const result = await checkAvailability(somaiya, '9788173711466');
  assert.equal(result.outcome, 'in_catalog'); assert.equal(result.matchKind, 'exact_isbn'); assert.equal(result.availableCopies, undefined);
});

test('VuFind title fallback is possible-match when the actual edition differs', async () => {
  global.fetch = async url => {
    const u = new URL(url);
    if (url.includes('/Record/')) return response(url, fixture('somaiya-record'));
    return response(url, u.searchParams.get('type') === 'ISN' ? fixture('somaiya-zero').replaceAll('KJSAC', 'TSS') : fixture('somaiya-search'));
  };
  const result = await checkAvailability(somaiya, '9780670082834', 'Wings of Fire');
  assert.equal(result.matchKind, 'possible_match');
  assert.equal(result.outcome, 'in_catalog'); assert.equal(result.availableCopies, undefined);
});

test('VuFind title fallback checks later exact editions and links to their available record', async () => {
  const titleSearch = '<input name="filter[]" value="institution:&quot;TSS&quot;"><p>Showing 1 - 2 results of 2</p>'
    + '<a class="title getFull" href="/Record/tsskoha.20192">Wings of fire : an autobiography</a>'
    + '<a class="title getFull" href="/Record/tsskoha.20193">Wings of fire : an autobiography</a>';
  global.fetch = async url => {
    if (url.includes('/Record/')) return response(url, url.includes('20192') ? fixture('somaiya-record').replaceAll('Available', 'Checked out') : fixture('somaiya-record').replaceAll('tsskoha.20192', 'tsskoha.20193'));
    return response(url, new URL(url).searchParams.get('type') === 'ISN' ? fixture('somaiya-zero').replaceAll('KJSAC', 'TSS') : titleSearch);
  };
  const result = await checkAvailability(somaiya, '9788173711466', 'Wings of Fire');
  assert.equal(result.outcome, 'available'); assert.equal(result.matchKind, 'exact_isbn'); assert.equal(result.availableCopies, 2);
  assert.match(result.catalogUrl, /tsskoha\.20193$/);
});

test('VuFind blocked and redirected responses never become a no-match', async () => {
  for (const status of [403, 429, 302]) {
    clearHttpCache(); global.fetch = async url => response(url, '', status);
    await assert.rejects(checkAvailability(somaiya, '9788173711466'));
  }
});

test('KALNET supplies only a publicly rooted CA intermediate and limits the transport override to its pinned origin', () => {
  const certificate = new X509Certificate(validatedKalnetIntermediate());
  assert.equal(certificate.ca, true);
  assert.match(certificate.subject, /Sectigo Public Server Authentication CA DV R36/);
  assert.ok(kalnetTransportOptions('https://kalnet.kshec.kerala.gov.in/vufind/Search/Results').dispatcher);
  for (const url of ['https://koha-opac.somaiya.edu/Record/a', 'http://kalnet.kshec.kerala.gov.in/vufind/', 'https://kalnet.kshec.kerala.gov.in:8443/vufind/', 'https://kalnet.kshec.kerala.gov.in/other', 'https://user@kalnet.kshec.kerala.gov.in/vufind/']) {
    assert.deepEqual(kalnetTransportOptions(url), {});
  }
});
