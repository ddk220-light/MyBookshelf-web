import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicDirectoryService } from './directory.js';
import { createPublicAvailabilityService } from './availability.js';
import { getProvider } from '../services/providers/index.js';
import { readFileSync } from 'node:fs';
import { parseHoldings } from '../services/providers/egranthalaya.js';
import { createPublicBookService } from './metadata.js';
import { clearHttpCache } from '../services/providers/http.js';

test('Thiruvarur discovery preserves exact Koha holdings and excludes reference copies from lending counts', async () => {
  const directory = createPublicDirectoryService();
  const [library] = directory.search('Thiruvarur', 25);
  assert.equal(library.id, 'koha:cutn');
  assert.equal(directory.search('Tiruvarur', 25)[0].id, library.id);
  assert.equal(library.capabilities.publicAvailability, true);
  assert.match(library.accessNote, /CUTN membership/);
  const record = readFileSync(new URL('../test/fixtures/koha/cutn-record.html', import.meta.url), 'utf8');
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    const search = url.includes('/opac-search.pl');
    return { ok: !search, status: search ? 302 : 200, url,
      headers: new Headers(search ? { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=22365' } : {}),
      text: async () => search ? '' : record };
  };
  try {
    const books = { resolve: async () => ({ title: 'Introduction to algorithms', isbn13: '9780262033848', authors: [] }) };
    const service = createPublicAvailabilityService({ directory, books });
    const { response } = await service.check({ libraryId: library.id, bookKey: 'v1:isbn:9780262033848' });
    assert.equal(response.outcome, 'available');
    assert.equal(response.matchKind, 'exact_isbn');
    assert.equal(response.availableCopies, 4);
    assert.equal(response.totalCopies, 5);
    assert.equal(response.callNumber, '005.1 COR');
    assert.equal(response.catalogLinkKind, 'record');
    assert.equal(response.catalogUrl, 'https://library.cutn.ac.in/cgi-bin/koha/opac-detail.pl?biblionumber=22365');
    assert.deepEqual(response.locations.find(row => row.name.endsWith('Reference')),
      { name: 'CUTN Central Library Reference', status: 'unknown', totalCopies: 1, notForLoanCopies: 1 });
    assert.deepEqual(response.locations.find(row => row.name.endsWith('Generalia')),
      { name: 'CUTN Central Library Generalia', status: 'available', availableCopies: 4, totalCopies: 4 });
    assert.equal(requests.length, 2);
  } finally {
    global.fetch = originalFetch;
    clearHttpCache();
  }
});

test('Karaikudi discovery offers the working title catalog without attempting unsupported availability', async () => {
  const directory = createPublicDirectoryService();
  const [library] = directory.search('Karaikudi', 25);
  assert.equal(library.id, 'catalog:alagappa-university');
  assert.equal(directory.search('Karaikkudi', 25)[0].id, library.id);
  assert.equal(library.capabilities.publicAvailability, false);
  assert.equal(library.capabilities.catalogLink, true);
  assert.equal(getProvider(directory.entry(library.id)), null);
  const service = createPublicAvailabilityService({ directory,
    books: { resolve: async () => ({ title: 'Introduction to algorithms', isbn13: '9780262033848', authors: [] }) },
    providerFor: () => { assert.fail('A manual catalog must never invoke an automated provider'); } });
  const { response } = await service.check({ libraryId: library.id, bookKey: 'v1:isbn:9780262033848' });
  assert.equal(response.outcome, 'unknown');
  assert.equal(response.errorCode, 'CATALOG_UNSUPPORTED');
  assert.equal(response.catalogLinkKind, 'catalog');
  assert.equal(response.catalogUrl, 'https://library.alagappauniversity.ac.in/cl/Web_OPAC');
});

test('manual Tamil Nadu handoffs preserve tenant, cluster and legacy URLs without invoking providers', async () => {
  const directory = createPublicDirectoryService();
  const cases = [
    ['Kalavai', 'catalog:adhiparasakthi-kalavai', 'https://portal.vmedulife.com/public/library/#/Apce-ranipet'],
    ['Pennalur', 'catalog:svce-pennalur', 'https://libcloud.mastersofterp.in/OPACNEW?Library=Sri%20Venkateswara%20College%20of%20Engineering'],
    ['Tiruchengode', 'catalog:ksrct-tiruchengode', 'http://ctcms.ksrct.net/Library/Book_Search.asp'],
    ['Chinna Sooriyur', 'libsys:iim-tiruchirappalli', 'https://iimtopac.libsys10.in/home/dashboard'],
    ['Viruthachalam', 'egranthalaya:tamilnadu-tkgacm', 'https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=TAMILNADU&LIB_CODE=TKGACM'],
  ];
  const service = createPublicAvailabilityService({ directory,
    books: { resolve: async () => ({ title: 'Introduction to algorithms', isbn13: '9780262033848', authors: [] }) },
    providerFor: () => { assert.fail('Manual catalogs must not invoke an availability provider'); } });
  for (const [query, id, url] of cases) {
    const [library] = directory.search(query, 25);
    assert.equal(library.id, id);
    assert.equal(library.capabilities.publicAvailability, false);
    assert.equal(library.capabilities.copyCounts, false);
    const { response } = await service.check({ libraryId: id, bookKey: 'v1:isbn:9780262033848' });
    assert.equal(response.outcome, 'unknown');
    assert.equal(response.errorCode, 'CATALOG_UNSUPPORTED');
    assert.equal(response.catalogLinkKind, 'catalog');
    assert.equal(response.catalogUrl, url);
  }
  assert.match(directory.resolve('egranthalaya:tamilnadu-tkgacm').accessNote, /select TKGACM Library \(TKGACM\)/);
  assert.equal(directory.resolve('koha:nec-kovilpatti').capabilities.publicAvailability, false);
});

test('Tamil Nadu discovery connects IIT Madras with exact copy and reading-hall evidence', async () => {
  const directory = createPublicDirectoryService();
  const [library] = directory.search('IIT Madras', 25);
  assert.equal(library.id, 'chamo:iit-madras');
  assert.equal(library.country, 'IN');
  assert.equal(library.region, 'Tamil Nadu');
  assert.equal(library.capabilities.publicAvailability, true);
  assert.equal(library.capabilities.locationAvailability, true);
  assert.match(library.accessNote, /membership rules/);
  const record = readFileSync(new URL('../test/fixtures/chamo/iitm-record.html', import.meta.url), 'utf8');
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url) => {
    requests.push(url);
    return { ok: true, status: 200, url, headers: new Headers(), text: async () => url.includes('/search/query')
      ? '<a href="../lib/item?id=chamo:187479&amp;theme=iitm">Delay-doppler communications</a>'
      : record };
  };
  try {
    const books = { resolve: async () => ({ title: 'Delay-doppler communications', isbn13: '9780323850285', authors: [] }) };
    const service = createPublicAvailabilityService({ directory, books });
    const { response } = await service.check({ libraryId: library.id, bookKey: 'v1:isbn:9780323850285' });
    assert.equal(response.outcome, 'available');
    assert.equal(response.matchKind, 'exact_isbn');
    assert.equal(response.availableCopies, 1);
    assert.equal(response.totalCopies, 2);
    assert.equal(response.callNumber, '621.391:681.32 HON');
    assert.equal(response.catalogLinkKind, 'record');
    assert.match(response.catalogUrl, /chamo:187479/);
    assert.deepEqual(response.locations, [{ name: 'Central Library -- Reading Hall 1', status: 'available', availableCopies: 1, totalCopies: 2 }]);
    assert.equal(requests.length, 2);
  } finally {
    global.fetch = originalFetch;
    clearHttpCache();
  }
});

test('validated Chennai and Madurai public catalogs expose their measured availability capabilities', () => {
  const directory = createPublicDirectoryService();
  for (const id of ['koha:anna-centenary-library', 'koha:kalaignar-centenary-library']) {
    const library = directory.resolve(id);
    assert.equal(library.capabilities.catalogLink, true);
    assert.equal(library.capabilities.publicAvailability, true);
    assert.equal(library.capabilities.copyCounts, true);
    assert.equal(library.capabilities.locationAvailability, true);
    assert.equal(library.capabilities.callNumber, true);
    assert.equal(directory.entry(id).publicCatalogValidated, true);
  }
});

test('PINES member discovery selects the explicit network scope and its web provider', async () => {
  const directory = createPublicDirectoryService();
  const [library] = directory.search('Athens Regional Library System', 25);
  assert.equal(library.id, 'evergreen:gapines');
  assert.equal(library.name, 'Georgia PINES library network');
  assert.match(library.accessNote, /whole Georgia PINES network/);
  assert.equal(library.capabilities.copyCounts, true);
  assert.equal(library.capabilities.locationAvailability, false);
  assert.equal(library.capabilities.callNumber, false);
  assert.equal(library.evergreenOrgId, undefined);
  assert.equal(typeof getProvider(directory.entry(library.id)).checkAvailability, 'function');
  const books = { resolve: async () => ({ title: 'Fixture book', isbn13: '9780735219090', authors: [] }) };
  let received;
  const service = createPublicAvailabilityService({ directory, books, providerFor: (entry) => {
    received = entry;
    return { checkAvailability: async () => ({ outcome: 'available', matchKind: 'exact_isbn',
      recognizedExact: true, availableCopies: 303, totalCopies: 327,
      catalogUrl: 'https://gapines.org/eg/opac/record/6107812?locg=1' }) };
  } });
  const { response } = await service.check({ libraryId: library.id, bookKey: 'v1:isbn:9780735219090' });
  assert.equal(received.evergreenOrgId, 1);
  assert.equal(response.availableCopies, 303);
  assert.equal(response.totalCopies, 327);
  assert.equal(response.catalogLinkKind, 'record');
  assert.equal(response.locations, undefined);
});

test('India pilot keeps reference restrictions and scoped holdings through the public service', async () => {
  const directory = createPublicDirectoryService();
  const [library] = directory.search('HKMSLIB', 25);
  assert.equal(library.id, 'egranthalaya:publiclibraries-hkmslib');
  assert.equal(library.health, 'degraded');
  assert.match(library.accessNote, /cannot be borrowed/);
  assert.equal(library.egranthalayaLibraryCode, undefined);
  assert.equal(typeof getProvider(directory.entry(library.id)).checkAvailability, 'function');
  const fixture = readFileSync(new URL('../test/fixtures/egranthalaya/holdings-available.html', import.meta.url), 'utf8');
  const observation = parseHoldings(fixture, { isbn: '9788131313459', libraryCode: 'HKMSLIB',
    libraryName: library.name, recordId: '519750', referenceOnly: true, format: 'Print' });
  // The live pilot ISBN is absent from Google/Open Library. Its lack of public
  // book metadata must not prevent the library's independently verified lookup.
  const books = createPublicBookService({ lookupByIsbn: async () => ({ book: null }) });
  const service = createPublicAvailabilityService({ directory, books,
    providerFor: () => ({ checkAvailability: async () => observation }) });
  const { response } = await service.check({ libraryId: library.id, bookKey: 'v1:isbn:9788131313459' });
  assert.equal(response.outcome, 'available');
  assert.equal(response.availableCopies, 1);
  assert.equal(response.totalCopies, 1);
  assert.equal(response.callNumber, 'BC SRI-K');
  assert.match(response.format, /reference use only/);
  assert.equal(response.catalogLinkKind, 'catalog');
  assert.match(response.catalogUrl, /CL_NAME=PUBLICLIBRARIES/);
});


test('new Koha libraries are discoverable, while unverified cloud catalogs remain manual', async () => {
  const directory = createPublicDirectoryService();
  for (const [query, id, automated] of [
    ['British Council', 'koha:british-council-india', true],
    ['Kumaraguru', 'koha:kct-mgcl', true],
    ['VIT Chennai', 'koha:vit-chennai', false],
    ['NEC', 'koha:nec-kovilpatti', false],
    ['IIT BBS', 'koha:iit-bhubaneswar', true],
    ['IIMV', 'koha:iim-visakhapatnam', true],
    ['Karnataka Sanskrit', 'koha:karnataka-samskrit-university', true],
    ['IIT Goa', 'koha:iit-goa', true],
    ['IIA', 'koha:indian-institute-astrophysics', false],
    ['CURAJ', 'koha:central-university-rajasthan', false],
    ['St Xavier Jaipur', 'koha:st-xaviers-jaipur', false],
    ['CMD Kerala', 'koha:cmd-kerala', false],
    ['UAS Dharwad', 'koha:uas-dharwad', true],
  ]) {
    const library = directory.search(query, 25).find((row) => row.id === id);
    assert.ok(library, query);
    assert.equal(library.capabilities.publicAvailability, automated);
    assert.equal(library.capabilities.catalogLink, true);
  }
});

test('British Council exact ISBN reaches the public availability DTO with branch counts', async () => {
  const directory = createPublicDirectoryService();
  const originalFetch = global.fetch;
  const record = readFileSync(new URL('../test/fixtures/koha/british-206571.html', import.meta.url), 'utf8');
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    const search = url.includes('/opac-search.pl');
    return { ok: !search, status: search ? 302 : 200, url,
      headers: new Headers(search ? {location:'/cgi-bin/koha/opac-detail.pl?biblionumber=206571'} : {}),
      text: async () => search ? '' : record };
  };
  try {
    const books = {resolve: async () => ({title:'Nineteen eighty-four', isbn13:'9780141036144', authors:['George Orwell']})};
    const {response} = await createPublicAvailabilityService({directory,books}).check({libraryId:'koha:british-council-india',bookKey:'v1:isbn:9780141036144'});
    assert.equal(response.outcome, 'none_available');
    assert.equal(response.freshness, 'fresh');
    assert.equal(response.totalCopies, 1);
    assert.equal(response.availableCopies, 0);
    assert.equal(response.locations[0].name, 'Kolkata');
    assert.equal(response.catalogLinkKind, 'record');
    assert.ok(calls.every((url) => url.startsWith('https://library.britishcouncil.org.in/')));
  } finally { global.fetch = originalFetch; clearHttpCache(); }
});


test('verified Indian Koha directories route captured exact-edition holdings through the public service', async () => {
  const directory = createPublicDirectoryService();
  const originalFetch = global.fetch;
  const cases = [
    ['oriental-theological-seminary', '9788192234977', '6945', 'oriental-theological-seminary-6945', 4, 4],
    ['national-science-library', '9783540854333', '5236', 'national-science-library-5236', 1, 1],
    ['sree-sankaracharya-sanskrit', '9780195683219', '179820', 'sree-sankaracharya-sanskrit-179820', 1, 1],
    ['iihmr-delhi', '9788188973118', '1502', 'iihmr-delhi-1502', 2, 1],
    ['iit-bhubaneswar', '9781032721910', '14696', 'iitbbs-14696', 1, 1],
    ['iim-visakhapatnam', '9789390727865', '6276', 'iimv-6276', 1, 1],
    ['karnataka-samskrit-university', '9788124605936', '846', 'ksu-846', 1, 1],
    ['assam-womens-university', '9780195658408', '370', 'assam-womens-university-370', 1, 1],
    ['iilm-lodhi-road', '9789391028558', '13834', 'iilm-lodhi-road-13834', 1, 0],
    ['nlu-meghalaya', '9788183704915', '1520', 'nlu-meghalaya-1520', 1, 1],
    ['lbsnaa-gandhi-smriti', '9788123701479', '73480', 'lbsnaa-gandhi-smriti-73480', 1, 1],
    ['goa-institute-management', '9788120307117', '910', 'goa-institute-management-910', 1, 1],
    ['modern-college-pune', '9789353949297', '87530', 'modern-college-pune-87530', 15, 12],
    ['klh-global-business-school', '9789355013521', '51', 'klh-global-business-school-51', 6, 6],
  ];
  try {
    for (const [slug, isbn, recordId, fixtureName, total, available] of cases) {
      clearHttpCache();
      const libraryId = `koha:${slug}`;
      const library = directory.resolve(libraryId);
      assert.equal(library.capabilities.publicAvailability, true, slug);
      assert.ok(directory.search(library.name, 25).some((row) => row.id === libraryId), slug);
      const origin = new URL(directory.entry(libraryId).baseUrl).origin;
      const record = readFileSync(new URL(`../test/fixtures/koha/${fixtureName}.html`, import.meta.url), 'utf8');
      global.fetch = async (url) => {
        assert.equal(new URL(url).origin, origin);
        const search = url.includes('/opac-search.pl');
        return {url, ok:!search, status:search ? 302 : 200,
          headers:new Headers(search ? {location:`/cgi-bin/koha/opac-detail.pl?biblionumber=${recordId}`} : {}),
          text:async () => search ? '' : record};
      };
      const books = {resolve:async () => ({title:'Captured record', isbn13:isbn, authors:[]})};
      const {response} = await createPublicAvailabilityService({directory,books}).check({libraryId,bookKey:`v1:isbn:${isbn}`});
      assert.equal(response.outcome, available ? 'available' : 'none_available', slug);
      assert.equal(response.matchKind, 'exact_isbn', slug);
      assert.equal(response.totalCopies, total, slug);
      assert.equal(response.availableCopies, available, slug);
      assert.equal(response.catalogLinkKind, 'record', slug);
    }
  } finally {global.fetch = originalFetch; clearHttpCache();}
});

test('reopened public Koha catalogs are discoverable and HTTP records survive the full public service', async () => {
  const directory = createPublicDirectoryService();
  for (const [query, slug] of [
    ['IIT Dharwad', 'iit-dharwad'], ['NIT Calicut', 'nit-calicut'], ['CVM University', 'cvmu'],
    ['Japan Foundation', 'japan-foundation-new-delhi'], ['DIET Dhemaji', 'diet-dhemaji'],
    ['Arunachal University', 'arunachal-university'], ['Anna Centenary', 'anna-centenary-library'],
    ['Kalaignar Centenary', 'kalaignar-centenary-library'], ['KLEF Hyderabad', 'klh'],
  ]) {
    const found = directory.search(query, 25).find(row => row.id === 'koha:' + slug);
    assert.ok(found?.capabilities.publicAvailability, query);
    assert.equal('publicCatalogHttpOrigin' in found, false);
  }
  // Carmel's newly reviewed host now supplies an alternate under its saved ID.
  assert.equal(directory.resolve('koha:carmel-mala').capabilities.publicAvailability, true);
  assert.equal(new URL(directory.resolve('koha:carmel-mala').catalogUrl).hostname, 'opac.carmelcollegemala.ac.in');
  for (const slug of ['dbit-bangalore', 'dharmaram']) {
    assert.equal(directory.resolve('koha:' + slug).capabilities.publicAvailability, false);
    assert.equal(directory.resolve('koha:' + slug).capabilities.catalogLink, true);
  }
  const originalFetch = global.fetch;
  const record = readFileSync(new URL('../test/fixtures/koha/kalaignar-record-161170.html', import.meta.url), 'utf8');
  const requests = [];
  global.fetch = async url => {
    requests.push(url);
    const search = url.includes('opac-search.pl');
    return { url, ok: !search, status: search ? 302 : 200,
      headers: new Headers(search ? { location: '/cgi-bin/koha/opac-detail.pl?biblionumber=161170' } : {}),
      text: async () => search ? '' : record };
  };
  try {
    const service = createPublicAvailabilityService({ directory,
      books: { resolve: async () => ({ title: 'The Alchemist', isbn13: '9788172234980', authors: [] }) } });
    const { response } = await service.check({ libraryId: 'koha:kalaignar-centenary-library', bookKey: 'v1:isbn:9788172234980' });
    assert.equal(response.outcome, 'available');
    assert.equal(response.availableCopies, 1);
    assert.equal(response.totalCopies, 3);
    assert.equal(response.catalogLinkKind, 'record');
    assert.equal(response.catalogUrl, 'http://122.184.84.190:1011/cgi-bin/koha/opac-detail.pl?biblionumber=161170');
    assert.equal(requests.length, 2);
  } finally { global.fetch = originalFetch; clearHttpCache(); }
});

test('Prayagraj selects one Uttar Pradesh library and excludes the other library holdings', async () => {
  const directory = createPublicDirectoryService();
  const [library] = directory.search('SCLALD', 25);
  assert.equal(library.id, 'egranthalaya:uplibraries-sclald');
  assert.equal(library.capabilities.publicAvailability, true);
  const entry = directory.entry(library.id);
  assert.equal(entry.egranthalayaCluster, 'UPLIBRARIES');
  assert.equal(entry.egranthalayaLibraryCode, 'SCLALD');
  const fixture = readFileSync(new URL('../test/fixtures/egranthalaya/up-wings-record-451490.html', import.meta.url), 'utf8');
  const holdings = parseHoldings(fixture, { isbn: '9788173711466', libraryCode: 'SCLALD', libraryName: library.name, recordId: '451490' });
  assert.equal(holdings.availableCopies, 1);
  assert.equal(holdings.totalCopies, 1);
  const service = createPublicAvailabilityService({ directory,
    books: { resolve: async () => ({ title: 'Wings of Fire', isbn13: '9788173711466', authors: [] }) },
    providerFor: () => ({ checkAvailability: async () => holdings }) });
  const { response } = await service.check({ libraryId: library.id, bookKey: 'v1:isbn:9788173711466' });
  assert.equal(response.outcome, 'available');
  assert.equal(response.availableCopies, undefined);
  assert.equal(response.totalCopies, undefined);
  assert.equal(response.catalogUrl, 'https://eg4.nic.in/OPAC/Default.aspx?CL_NAME=UPLIBRARIES&LIB_CODE=SCLALD');
  assert.equal(response.catalogLinkKind, 'catalog');
});
