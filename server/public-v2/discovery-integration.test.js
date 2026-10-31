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
  assert.equal(createDiscoveryService().search({ country: 'IN' }).total, 6700);
  assert.equal(createDiscoveryService().search({}).total, 7085);
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
