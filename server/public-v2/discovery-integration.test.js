import test from 'node:test';
import assert from 'node:assert/strict';
import discovered from '../data/discovered-catalogs.json' with { type: 'json' };
import { getAllLibraries, getLibraryById } from '../services/directory.js';
import { getProvider } from '../services/providers/index.js';
import { createPublicDirectoryService } from './directory.js';
import { createDiscoveryService } from './discovery.js';
import { catalogHandoffFor } from './catalog-handoff.js';

test('every imported inline library has search, durable reopening, and availability methods', () => {
  const directory = createPublicDirectoryService();
  for (const r of discovered.libraries) {
    const entry = getLibraryById(r.directoryId), dto = directory.resolve(r.directoryId), provider = getProvider(entry);
    assert.ok(dto.capabilities.catalogLink, r.directoryId);
    assert.equal('alternateCatalogs' in dto, false);
    assert.equal('baseUrl' in dto, false);
    if (r.publicCatalogSearch.mode === 'inline') {
      assert.ok(dto.capabilities.publicAvailability, r.directoryId);
      for (const method of ['searchCatalog', 'resolveCatalogRecord', 'checkAvailability']) assert.equal(typeof provider?.[method], 'function', r.directoryId + ' ' + method);
    } else {
      assert.equal(provider, null);
      assert.equal(dto.capabilities.publicAvailability, false);
    }
  }
  // Only the 4,138 Indian libraries on the allowlist (server/data/india-catalogs-listed.json)
  // are offered: 1,033 with a verified book and 3,105 e-Granthalaya audit-found
  // (LBSNAA was removed by hand on 19 November 2026: robots.txt).
  // The finder counts 6,701 of the 6,704 Indian entries (three have no finder record).
  assert.equal(createDiscoveryService().search({ country: 'IN' }).total, 4138);
  // The 16 US entries in server/data/us-catalogs-listed.json `removed` are
  // not offered either (23 November 2026; gapines, split into its member
  // systems, 24 November 2026), nor the 248 waiting on their identity (TLC 7,
  // Koha 23, Aspen 178, Polaris 40), nor the 280 connected ones whose hosts'
  // front-page results (the production run of 24 November 2026) show a wall,
  // no answer or a move (15 Koha, 259 Aspen with CLEVNET and MAIN, 6
  // Polaris). Offered: the 212 legacy entries, the 37 TLC entries confirmed by
  // a published page (Grand Island by its own homepage) and the 7 TLC DNS
  // leads, 14 Koha and 99 Aspen entries (Greenville; Nashville, Orange County
  // FL, Metro OKC and SWAN's 95, their hosts found open), 285 Polaris entries
  // (Denver, Fairfax, Miami-Dade, Livingston Parish, Carroll County,
  // Riverside, SHARE's 208 members, the front-page hosts found open, and the
  // Southern Adirondack, Mohawk Valley and Finger Lakes members their
  // catalog's own list names), the 10 Apollo entries and the 51 Georgia PINES
  // systems. The directory has 51 TLC, 52 US Koha, 532 Aspen, 331 Polaris, 10
  // Apollo and 51 Evergreen entries from server/data/us-catalogs.json.
  assert.equal(createDiscoveryService().search({ country: 'US' }).total, 212 + 37 + 7 + 14 + 99 + 285 + 10 + 51);
  assert.equal(createDiscoveryService().search({}).total, 7086 + 51 + 52 + 532 + 331 + 10 + 51 - 6701 + 4138 - 16 - 248 - 280);
  assert.equal(createDiscoveryService({ entries: getAllLibraries }).search({}).total, 7086 + 51 + 52 + 532 + 331 + 10 + 51);
  assert.equal(new Set(getAllLibraries().map(r => r.id)).size, getAllLibraries().length);
});

test('duplicate identities resolve to one saved library while known alternate routes retain original IDs', () => {
  assert.equal(getLibraryById('libman:781'), getLibraryById('libman:389'));
  assert.equal(getLibraryById('libman:660'), getLibraryById('libman:530'));
  const ignou = getLibraryById('koha:ignou-ldd');
  assert.equal(ignou.id, 'indcat:indcat-ignu-110068');
  assert.ok(ignou.alternateCatalogs.some(route => route.academicCatalogId === undefined && route.kohaBranchCode === 'LDD'));
});

test('catalog handoff preserves selected VuFind and Koha scopes, including alternate providers', () => {
  const book = { isbn13: '9788173711466', title: 'Wings of Fire' };
  for (const entry of getAllLibraries().filter(r => r.platform === 'vufind' || r.alternateCatalogs?.some(a => a.platform === 'vufind' && a.preferForLookup))) {
    const route = entry.alternateCatalogs?.find(a => a.preferForLookup) || entry;
    if (route.platform !== 'vufind') continue;
    const handoff = catalogHandoffFor({ entry, book }), url = new URL(handoff.catalogUrl);
    assert.equal(url.searchParams.get('lookfor'), book.isbn13);
    assert.ok(url.searchParams.getAll('filter[]').includes(`institution:"${route.vufindInstitution}"`));
    if (route.vufindBuilding) assert.ok(url.searchParams.getAll('filter[]').includes(`building:"${route.vufindBuilding}"`));
  }
  const handoff = catalogHandoffFor({ entry: getLibraryById('koha:ignou-ldd'), book });
  assert.equal(new URL(handoff.catalogUrl).searchParams.get('limit'), 'branch:LDD');
  const goa = catalogHandoffFor({ entry: getLibraryById('koha:goa-dhe-gcc'), book });
  assert.equal(new URL(goa.catalogUrl).searchParams.has('limit'), false);
});
