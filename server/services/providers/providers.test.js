import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProvider } from './index.js';
import { checkAvailability as checkBc, checkPublicAvailability as checkBcPublic, searchBookCandidates, searchResultRows, login } from './bibliocommons.js';
import { checkAvailability as checkKoha, parseBiblioNumber } from './koha.js';
import { checkAvailability as checkChamo, parseChamoRecord, parseChamoSearch } from './chamo.js';
import { checkAvailability as checkLibsys, clearLibsysCache, cookiesFrom, parseLibsysAvailability } from './libsys.js';
import { aspenSearchUrl, checkAvailability as checkAspen } from './aspen.js';
import { checkAvailability as checkCalil, parseCalilAvailability } from './calil.js';
import { checkAvailability as checkVega, parseVegaAvailability } from './vega.js';
import { cachedTask, clearHttpCache, request } from './http.js';
import { isbnMatches, normalizeAvailability } from './contract.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (...parts) => fs.readFileSync(path.join(dirname, '../../test/fixtures', ...parts), 'utf8');
const originalFetch = global.fetch;

test('BiblioCommons checks the returned ISBN and considers later search hits', async () => {
  global.fetch = async url => {
    if (url.includes('/bibs/search')) return response({ catalogSearch: { pagination: { count: 2 }, results: [{ representative: 'wrong' }, { representative: 'right' }] },
      entities: { bibs: { wrong: { briefInfo: { format: 'BK', isbns: ['9788173711466'] } }, right: { briefInfo: { format: 'BK', isbns: ['9781625275868'] } } } } }, { url });
    assert.ok(url.includes('/bibs/right/availability'));
    return response({ entities: { availabilities: { right: { availableCopies: 1, totalCopies: 1 } } } }, { url });
  };
  assert.equal((await checkBcPublic('smcl', '9781625275868', '', '')).matchKind, 'exact_isbn');
});

test('BiblioCommons candidate metadata preserves ISBNs without inferring circulation from holdings alone', async () => {
  global.fetch = async url => response({ catalogSearch: { results: [{ representative: 'S1' }] }, entities: { bibs: { S1: {
    briefInfo: { title: 'Wings of Fire', authors: ['Kalam'], isbns: ['8173711461'], format: 'BK', primaryLanguage: 'eng' }, availability: { totalCopies: 2 },
  } } } }, { url });
  const [record] = await searchBookCandidates('smcl', 'Wings of Fire');
  assert.deepEqual(record.isbns, ['8173711461']);
  assert.equal(record.observation.outcome, 'in_catalog');
  assert.equal(record.catalogUrl, 'https://smcl.bibliocommons.com/v2/record/S1');
});

test('BiblioCommons picks print rows from the whole search page before any row cap', async () => {
  // Seattle, "the hobbit": the first ten of 25 results are recordings, films,
  // e-books and graphic novels; the novel's print records come 15th to 17th.
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(JSON.parse(fixture('bibliocommons', 'seattle-search-the-hobbit.json')), { url }); };
  const rows = await searchResultRows('seattle', 'the hobbit');
  assert.deepEqual(rows.map(row => [row.recordId, row.format]), [
    ['S246C1349814', 'Graphic novel'], ['S246C1092054', 'Graphic novel'], ['S246C306534', 'Graphic novel'],
    ['S246C395812', 'Book'], ['S246C1348703', 'Book'], ['S246C103196', 'Book'],
    ['S246C530683', 'Book'], ['S246C212899', 'Book'], ['S246C129902', 'Book']]);
  assert.ok(rows.find(row => row.recordId === 'S246C395812').isbns.includes('9780618968633'));
  // The book page's candidate list comes from the same single request.
  const candidates = await searchBookCandidates('seattle', 'the hobbit');
  assert.ok(candidates.some(row => row.recordId === 'S246C103196'));
  assert.equal(calls.length, 1);
});

afterEach(() => {
  global.fetch = originalFetch;
  clearHttpCache();
  clearLibsysCache();
});

function response(body, { status = 200, headers = {}, url = 'https://catalog.example/result' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    url,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
    json: async () => typeof body === 'string' ? JSON.parse(body) : body,
  };
}

const catalogOnly = (platform, extra = {}) => ({
  slug: `test-${platform}`,
  platform,
  baseUrl: 'https://catalog.example',
  capabilities: ['catalogSearch', 'availability'],
  ...extra,
});

test('normalized contract rejects invalid status, URL, and negative counts', () => {
  assert.deepEqual(normalizeAvailability({ status: 'surprise', branch: '  Main ', url: 'javascript:alert(1)', copies: -2 }), {
    status: 'unknown', branch: 'Main', callNumber: null, url: null,
  });
  assert.equal(isbnMatches('81-312-0050-7', '8131200507'), true);
});

test('provider factory requires availability and selects supported platforms', () => {
  assert.equal(getProvider(null), null);
  assert.equal(getProvider({ platform: 'koha', capabilities: ['catalogSearch'] }), null);
  assert.equal(getProvider({ platform: 'unknown', capabilities: ['availability'] }), null);
  for (const platform of ['bc', 'bibliocommons', 'koha', 'chamo', 'libsys', 'vega', 'aspen', 'calil']) {
    assert.equal(typeof getProvider(catalogOnly(platform)).checkAvailability, 'function');
  }
});

test('Vega maps an exact ISBN to branch-level public availability', async () => {
  const payload = {
    totalResults: 1,
    data: [{
      identifiers: { isbn: '9780593135204' },
      materialTabs: [{
        name: 'Book', type: 'physical', callNumber: 'SFF WEIR',
        availability: { status: { general: 'Available' } },
        locations: [
          { label: '58th Street', availabilityStatus: 'Available' },
          { label: 'Belmont', availabilityStatus: 'Unavailable' },
        ],
      }],
    }],
  };
  const parsed = parseVegaAvailability(payload, '9780593135204');
  assert.equal(parsed.outcome, 'available');
  assert.equal(parsed.matchKind, 'exact_isbn');
  assert.deepEqual(parsed.locations, [
    { name: '58th Street', status: 'available' },
    { name: 'Belmont', status: 'unavailable' },
  ]);
  assert.equal(parseVegaAvailability({ totalResults: 0, data: [] }, '9780593135204').outcome, 'not_found');
  assert.equal(parseVegaAvailability({ totalResults: 1, data: [{ identifiers: { isbn: '9780000000000' }, materialTabs: [] }] }, '9780593135204'), null);
});

test('Vega uses server-configured origins and rejects unproven responses', async () => {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return response({ totalResults: 1, data: [{ identifiers: { isbn: '9780593135204' }, materialTabs: [{
      name: 'Book', type: 'physical', availability: { status: { general: 'CheckedOut' } },
    }] }] }, { url });
  };
  const result = await checkVega(catalogOnly('vega', {
    id: 'vega:nypl', baseUrl: 'https://na2.iiivega.com',
    vegaCustomerDomain: 'nypl.na2.iiivega.com', vegaHostDomain: 'borrow.nypl.org',
  }), '9780593135204');
  assert.equal(result.outcome, 'none_available');
  assert.equal(request.url, 'https://na2.iiivega.com/api/search-result/search/format-groups');
  assert.equal(request.options.headers['iii-customer-domain'], 'nypl.na2.iiivega.com');
  assert.deepEqual(JSON.parse(request.options.body), { searchText: '9780593135204', searchType: 'everything', pageNum: 0, pageSize: 3 });
  await assert.rejects(
    checkVega(catalogOnly('vega', { id: 'vega:broken', baseUrl: 'http://not-secure.example', vegaCustomerDomain: 'x', vegaHostDomain: 'y' }), '9780593135204'),
    { code: 'CATALOG_CONFIGURATION_REQUIRED' },
  );
});

test('Aspen reports a provider block without claiming a missing book', async () => {
  assert.equal(aspenSearchUrl('https://search.cpl.org', '9780593135204'), 'https://search.cpl.org/Search/Results?lookfor=9780593135204&searchIndex=ISBN');
  global.fetch = async (url) => response('challenge', { status: 403, url });
  await assert.rejects(
    checkAspen(catalogOnly('aspen', { id: 'aspen:cleveland', baseUrl: 'https://search.cpl.org' }), '9780593135204'),
    { code: 'CATALOG_PROVIDER_BLOCKED' },
  );
});

test('Calil maps Japanese branch labels and protects its configured key', async () => {
  const payload = {
    continue: 0,
    books: {
      '9784103534228': {
        Tokyo_Setagaya: {
          status: 'OK', reserveurl: 'https://catalog.example.test/record/1',
          libkey: { '中央図書館': '貸出可', '経堂図書館': '貸出中' },
        },
      },
    },
  };
  const parsed = parseCalilAvailability(payload, { isbn: '9784103534228', systemId: 'Tokyo_Setagaya' });
  assert.equal(parsed.outcome, 'available');
  assert.deepEqual(parsed.locations, [
    { name: '中央図書館', status: 'available' },
    { name: '経堂図書館', status: 'unavailable' },
  ]);
  assert.deepEqual(parsed.attribution, { label: 'Calil', url: 'https://calil.jp/' });
  assert.equal(parseCalilAvailability({ books: {} }, { isbn: '9784103534228', systemId: 'Tokyo_Setagaya' }), null);
  let requestUrl;
  global.fetch = async (url) => {
    requestUrl = url;
    return response(payload, { url });
  };
  const result = await checkCalil(catalogOnly('calil', { id: 'calil:Tokyo_Setagaya', slug: 'Tokyo_Setagaya' }), '9784103534228', { appKey: 'test-only-key' });
  assert.equal(result.outcome, 'available');
  assert.match(requestUrl, /appkey=test-only-key/);
  await assert.rejects(
    checkCalil(catalogOnly('calil', { id: 'calil:unconfigured', slug: 'Tokyo_Setagaya' }), '9784103534228', { appKey: '' }),
    { code: 'CATALOG_CONFIGURATION_REQUIRED' },
  );
});

test('BiblioCommons preserves branch and returns normalized availability', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    if (url.includes('/bibs/search')) return response({
      catalogSearch: { pagination: { count: 1 }, results: [{ representative: 'S123' }] },
      entities: { bibs: { S123: { briefInfo: { format: 'BK', callNumber: 'FIC ROY' } } } },
    }, { url });
    return response({ entities: {
      availabilities: { S123: { availableCopies: 1, totalCopies: 2, heldCopies: 0 } },
      bibItems: { one: { branchName: 'Main', availability: { status: 'AVAILABLE' } } },
    } }, { url });
  };
  const result = await checkBc('smcl', '9788172234980');
  assert.equal(result.status, 'available');
  assert.equal(result.branch, 'Main');
  assert.equal(result.callNumber, 'FIC ROY');
  assert.equal(result.availableCopies, 1);
  // iOS/Android always issue both public keyword searches before availability.
  assert.equal(calls, 3);
});

test('BiblioCommons distinguishes upstream failure from a reachable miss', async () => {
  global.fetch = async () => response('gateway down', { status: 503 });
  assert.equal((await checkBc('smcl', '9780000000000')).status, 'unknown');
  clearHttpCache();
  global.fetch = async () => response({ catalogSearch: { pagination: { count: 0 }, results: [] }, entities: { bibs: {} } });
  assert.equal((await checkBc('smcl', '9780000000000')).status, 'not_found');
});

test('BiblioCommons availability uses a 60-second single-flight cache', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (url.includes('/bibs/search')) return response({
      catalogSearch: { pagination: { count: 1 }, results: [{ representative: 'S1' }] },
      entities: { bibs: { S1: { briefInfo: { format: 'BK' } } } },
    }, { url });
    return response({ entities: { availabilities: { S1: { availableCopies: 0, totalCopies: 1 } } } }, { url });
  };
  const results = await Promise.all([
    checkBc('smcl', '9781111111111'),
    checkBc('smcl', '9781111111111'),
    checkBc('smcl', '9781111111111'),
  ]);
  assert.deepEqual(results.map((item) => item.status), ['checked_out', 'checked_out', 'checked_out']);
  assert.equal(calls, 3);
  await checkBc('smcl', '9781111111111');
  assert.equal(calls, 3);
});

test('Koha resolver and full flow use effective item status', async () => {
  assert.equal(parseBiblioNumber({ headers: new Headers({ location: '/cgi-bin/koha/opac-detail.pl?biblionumber=42' }), text: '' }), '42');
  assert.equal(parseBiblioNumber({ headers: new Headers(), text: '<a href="opac-detail.pl?biblionumber=99">record</a>' }), '99');
  const items = fixture('koha', 'items.json');
  global.fetch = async (url) => {
    if (url.includes('opac-search')) return response('', { status: 302, headers: { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=42' }, url });
    if (url.includes('/items')) return response(items, { url });
    return response([{ library_id: 'ANNA', name: 'Anna Centenary Library' }], { url });
  };
  const result = await checkKoha(catalogOnly('koha', { slug: 'anna' }), '9788172234980');
  assert.equal(result.status, 'available');
  assert.equal(result.branch, 'Anna Centenary Library');
  assert.equal(result.callNumber, '823 RUS');
});

test('Chamo search selection does not trust echoed ISBN; record parser does', () => {
  const search = fixture('chamo', 'search-hit.html');
  assert.equal(parseChamoSearch(search), '/record/itm-123');
  assert.equal(parseChamoSearch(fixture('chamo', 'search-miss.html')), null);
  const good = parseChamoRecord(fixture('chamo', 'record-available.html'), '9788172234980');
  assert.equal(good.isbnMatch, true);
  assert.equal(good.availableCopies, 1);
  assert.equal(good.copies, 2);
  assert.equal(parseChamoRecord(fixture('chamo', 'record-wrong-isbn.html'), '9788172234980').isbnMatch, false);
});

test('Chamo fetches and verifies the record before reporting availability', async () => {
  global.fetch = async (url) => response(url.includes('/search/query')
    ? fixture('chamo', 'search-hit.html')
    : fixture('chamo', 'record-available.html'), { url });
  const result = await checkChamo(catalogOnly('chamo', { slug: 'iit-madras' }), '9788172234980');
  assert.equal(result.status, 'available');
  assert.equal(result.branch, 'Central Library');
  assert.equal(result.url, 'https://catalog.example/record/itm-123');
});

test('Chamo returns not_found for a fuzzy wrong record and unknown for unreadable holdings', async () => {
  global.fetch = async (url) => response(url.includes('/search/query')
    ? fixture('chamo', 'search-hit.html')
    : fixture('chamo', 'record-wrong-isbn.html'), { url });
  assert.equal((await checkChamo(catalogOnly('chamo'), '9788172234980')).status, 'not_found');
  clearHttpCache();
  global.fetch = async (url) => response(url.includes('/search/query')
    ? fixture('chamo', 'search-hit.html')
    : '<table><tr><th>ISBN</th><td>9788172234980</td></tr></table>', { url });
  assert.equal((await checkChamo(catalogOnly('chamo'), '9788172234980')).status, 'unknown');
});

test('LibSys cookie jar preserves prior values and replaces named cookies', () => {
  const headers = new Headers({ 'set-cookie': 'session=new; Path=/' });
  assert.equal(cookiesFrom(headers, 'session=old; tenant=NITT'), 'session=new; tenant=NITT');
  const parsed = parseLibsysAvailability({ clr: '1', siteInfoStrHover: 'Central Library' }, null);
  assert.equal(parsed.availableCopies, 1);
  assert.equal(parsed.branch, 'Central Library');
});

test('LibSys performs bootstrap, token rotation, location filter, search, and details', async () => {
  const settings = fixture('libsys', 'property-settings.json');
  const discovery = fixture('libsys', 'discovery.json');
  const location = fixture('libsys', 'location.json');
  const search = fixture('libsys', 'search-result.json');
  const details = fixture('libsys', 'details.json');
  const requests = [];
  let discoveryCalls = 0;
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/property-settings.json')) return response(settings, { url, headers: { 'set-cookie': 'session=one; Path=/' } });
    if (url.endsWith('/isLSDiscovery')) {
      discoveryCalls++;
      return response(discovery, { url, headers: { authorization: `Bearer jwt-discovery-${discoveryCalls}` } });
    }
    if (url.endsWith('/getLocationDetailByUrl')) return response(location, { url, headers: { 'set-cookie': 'tenant=NITT; Path=/' } });
    if (url.endsWith('/searchResult/')) return response(search, { url });
    if (url.endsWith('/details/')) return response(details, { url });
    throw new Error(`unexpected URL ${url}`);
  };
  const result = await checkLibsys(catalogOnly('libsys', { slug: 'nit-trichy', baseUrl: 'https://nittrichyopac.libsys10.in' }), '8131200507');
  assert.equal(result.status, 'available');
  assert.equal(result.availableCopies, 1);
  assert.equal(result.copies, 2);
  assert.equal(result.callNumber, '005.1 TAN');
  assert.equal(discoveryCalls, 2);
  const locationRequest = requests.find((item) => item.url.endsWith('/getLocationDetailByUrl'));
  const firstDiscovery = requests.find((item) => item.url.endsWith('/isLSDiscovery'));
  assert.equal(firstDiscovery.options.headers.Authorization, 'jwt-settings');
  assert.match(locationRequest.options.headers.Cookie, /session=one/);
  assert.match(locationRequest.options.headers.Authorization, /jwt-discovery-1/);
  const searchRequest = requests.find((item) => item.url.endsWith('/searchResult/'));
  assert.deepEqual(JSON.parse(searchRequest.options.body).appliedFilters, { NITT: ['NITT'] });
  assert.match(searchRequest.options.headers.Cookie, /tenant=NITT/);
  assert.match(searchRequest.options.headers.Authorization, /jwt-discovery-2/);
});

test('LibSys exact ISBN matching ignores IDs that merely contain the query', async () => {
  global.fetch = async (url) => {
    if (url.endsWith('/property-settings.json')) return response({ serviceUrl: 'https://cluster1opacservices.libsys10.in' }, { url });
    if (url.endsWith('/isLSDiscovery')) return response({ token: 'jwt' }, { url });
    if (url.endsWith('/getLocationDetailByUrl')) return response({ locationId: 'NITT' }, { url });
    if (url.endsWith('/searchResult/')) return response({ results: [{ id: '8131200507', isbn: '9780123456472', clr: '1' }] }, { url });
    throw new Error(`unexpected URL ${url}`);
  };
  assert.equal((await checkLibsys(catalogOnly('libsys'), '8131200507')).status, 'not_found');
});

test('BiblioCommons anonymous availability follows the native public keyword sequence', async () => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/bibs/search')) {
      const isIsbnSearch = parsed.searchParams.get('query') === '9781625275868';
      const metadataId = isIsbnSearch ? 'isbn-hit' : 'title-hit';
      return response({
        catalogSearch: { pagination: { count: 1 }, results: [{ representative: metadataId }] },
        entities: { bibs: { [metadataId]: { briefInfo: { format: 'BK', callNumber: 'HD 57.7 W38', isbns: isIsbnSearch ? ['9781625275868'] : [] } } } },
      }, { url });
    }
    if (parsed.pathname.endsWith('/bibs/isbn-hit/availability')) {
      return response({
        entities: {
          availabilities: { 'isbn-hit': { availableCopies: 2, totalCopies: 4, heldCopies: 0 } },
          bibItems: {
            a: { branchName: 'Burlingame-Main', availability: { status: 'AVAILABLE' } },
            b: { branchName: 'Burlingame-Easton', availability: { status: 'UNAVAILABLE' } },
          },
        },
      }, { url });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await checkBcPublic('burlingame', '9781625275868', 'The First 90 Days', 'Michael Watkins');
  assert.equal(result.outcome, 'available');
  assert.equal(result.matchKind, 'exact_isbn');
  assert.equal(result.availableCopies, 2);
  assert.deepEqual(result.locations, [
    { name: 'Burlingame-Main', status: 'available' },
    { name: 'Burlingame-Easton', status: 'unavailable' },
  ]);

  const searchRequests = requests.filter(({ url }) => new URL(url).pathname.endsWith('/bibs/search'));
  assert.equal(searchRequests.length, 2);
  assert.deepEqual(searchRequests.map(({ url }) => new URL(url).searchParams.get('searchType')), ['keyword', 'keyword']);
  assert.deepEqual(new Set(searchRequests.map(({ url }) => new URL(url).searchParams.get('query'))), new Set(['9781625275868', 'The First 90 Days Michael Watkins']));
  assert.equal(searchRequests[0].options.headers['User-Agent'], 'MyBookshelf/1.0 (Web; +https://mybookshelf.cloud/privacy)');
  assert.match(requests.at(-1).url, /\/bibs\/isbn-hit\/availability$/);
});

test('BiblioCommons title fallback is explicitly a possible match, never an exact ISBN claim', async () => {
  global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/bibs/search')) {
      if (parsed.searchParams.get('query') === '9781625275868') {
        return response({ catalogSearch: { pagination: { count: 0 }, results: [] }, entities: { bibs: {} } }, { url });
      }
      return response({
        catalogSearch: { pagination: { count: 1 }, results: [{ representative: 'title-hit' }] },
        entities: { bibs: { 'title-hit': { briefInfo: { format: 'BK' } } } },
      }, { url });
    }
    if (parsed.pathname.endsWith('/bibs/title-hit/availability')) {
      return response({
        entities: {
          availabilities: { 'title-hit': { availableCopies: 0, totalCopies: 3, heldCopies: 0 } },
          bibItems: { a: { branchName: 'Burlingame-Main', availability: { status: 'UNAVAILABLE' } } },
        },
      }, { url });
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await checkBcPublic('burlingame', '9781625275868', 'The First 90 Days', 'Michael Watkins');
  assert.equal(result.outcome, 'none_available');
  assert.equal(result.matchKind, 'possible_match');
});

test('BiblioCommons public catalog outages preserve a specific error code', async () => {
  global.fetch = async (url) => response({ error: { message: 'Internal Server Error' } }, { url, status: 500 });
  await assert.rejects(
    checkBcPublic('burlingame', '9781625275868', 'The First 90 Days', 'Michael Watkins'),
    (error) => error.code === 'CATALOG_UNAVAILABLE',
  );
  assert.deepEqual(await checkBc('burlingame', '9781625275868', 'The First 90 Days', 'Michael Watkins'), {
    status: 'unknown', branch: null, callNumber: null, url: null,
  });
});

test('HTTP helper enforces declared response-size limits', async () => {
  global.fetch = async () => response('ignored', { headers: { 'content-length': '1000' } });
  await assert.rejects(request('https://catalog.example/large', { maxResponseBytes: 10 }), /too large/);
});

test('HTTP helper retries a transient GET failure within one deadline', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return calls === 1 ? response('busy', { status: 503 }) : response('ok');
  };
  const result = await request('https://catalog.example/retry');
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('HTTP helper serializes requests to the same host', async () => {
  let active = 0;
  let maximum = 0;
  global.fetch = async (url) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return response('ok', { url });
  };
  await Promise.all([
    request('https://fragile.example/one'),
    request('https://fragile.example/two'),
    request('https://fragile.example/three'),
  ]);
  assert.equal(maximum, 1);
});

test('HTTP helper deadline aborts a stalled upstream request', async () => {
  global.fetch = async (_url, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  await assert.rejects(request('https://stalled.example/book', { timeoutMs: 10 }), /deadline|aborted/);
});

test('BiblioCommons login is slug-parameterized in the Firecrawl payload', async () => {
  const previousKey = process.env.FIRECRAWL_API_KEY;
  process.env.FIRECRAWL_API_KEY = 'test-key';
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return response({ data: { html: '<a href="/user_dashboard">My Account</a>' } });
  };
  try {
    assert.deepEqual(await login('iit-library', '123', '456'), { valid: true, reason: 'ok' });
    assert.match(body.url, /^https:\/\/iit-library\.bibliocommons\.com\/user\/login/);
  } finally {
    if (previousKey === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = previousKey;
  }
});


test('an expired cache deadline consumes a scheduled task rejection', async () => {
  await assert.rejects(cachedTask('expired-failure', async () => { throw new Error('late upstream failure'); },
    { deadlineAt: Date.now() - 1 }), { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
});
