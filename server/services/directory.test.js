import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import hiddenList from '../data/india-catalog-hidden.json' with { type: 'json' };
import { getAllLibraries, getLibrariesByRegion, getLibraryById, getListedLibraries, haversineKm, nearbyLibraries, publicLibrary, searchLibraries } from './directory.js';
import { createPublicDirectoryService } from '../public-v2/directory.js';
import { createDiscoveryService } from '../public-v2/discovery.js';
import { indiaLibraryPlace } from '../public-v2/indiaPlaces.js';
import { libraryLinks } from '../public-v2/libraryLinks.js';
import { createPublicV2Router } from '../public-v2/router.js';
import { makeTestApp } from '../test/helpers.js';

test('directory derives stable platform-scoped ids and searches India entries', () => {
  const anna = getLibraryById('koha:anna-centenary-library');
  assert.equal(anna.name, 'Anna Centenary Library');
  assert.equal(searchLibraries('Anna')[0].id, anna.id);
});

test('web patron capabilities are exposed only for SMCL', () => {
  assert.ok(publicLibrary(getLibraryById('bc:smcl')).capabilities.includes('patronLogin'));
  assert.ok(!publicLibrary(getLibraryById('bc:sjpl')).capabilities.includes('accountSync'));
});

test('nearby validates coordinates and applies distance ordering/cutoff', () => {
  assert.equal(nearbyLibraries('bad', 80), null);
  const chennai = nearbyLibraries(13.01, 80.24);
  assert.ok(chennai.some((library) => library.id === 'koha:anna-centenary-library'));
  assert.ok(chennai.every((library) => library.distanceKm <= 80.5));
  assert.ok(haversineKm(13.01, 80.24, 13.01, 80.24) < 0.001);
});

// Hidden list: e-Granthalaya libraries whose fifty audit searches were all
// valid and empty (server/data/india-catalog-hidden.json).
const HIDDEN_COUNT = 1890;
const hiddenIds = new Set(hiddenList.libraryIds);
const hiddenEntries = getAllLibraries().filter((entry) => hiddenIds.has(entry.id));

function csvRows(path) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const text = readFileSync(new URL(path, import.meta.url), 'utf8');
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

test('hidden list is exactly the audit libraries with fifty valid empty searches', () => {
  const needsWork = csvRows('../../docs/research/india-library-hardening/egranthalaya-audit-20261110/needs-work-libraries.csv');
  const empty = needsWork.filter((row) => row.emptyQueries === '50' && row.failedQueries === '0').map((row) => row.libraryId);
  const errors = needsWork.filter((row) => !empty.includes(row.libraryId)).map((row) => row.libraryId);
  assert.equal(needsWork.length, 1901);
  assert.equal(errors.length, 11);
  assert.equal(hiddenList.libraryIds.length, HIDDEN_COUNT);
  assert.equal(hiddenList.count, HIDDEN_COUNT);
  assert.equal(hiddenIds.size, HIDDEN_COUNT);
  assert.deepEqual([...hiddenList.libraryIds].sort(), [...empty].sort());
  for (const id of errors) assert.equal(hiddenIds.has(id), false, id);
});

test('every hidden ID is an e-Granthalaya library in the directory', () => {
  const byId = new Map(getAllLibraries().map((entry) => [entry.id, entry]));
  for (const id of hiddenList.libraryIds) {
    assert.ok(byId.has(id), id);
    assert.equal(byId.get(id).platform, 'egranthalaya', id);
  }
  assert.equal(hiddenEntries.length, HIDDEN_COUNT);
  assert.equal(getListedLibraries().length, getAllLibraries().length - HIDDEN_COUNT);
  assert.equal(getListedLibraries().some((entry) => hiddenIds.has(entry.id)), false);
});

test('hidden libraries never appear in search, browse or near-me results', () => {
  const discovery = createDiscoveryService();
  const full = createDiscoveryService({ entries: getAllLibraries });
  const directory = createPublicDirectoryService();
  const noneHidden = (libraries, label) => assert.equal(libraries.filter((library) => hiddenIds.has(library.id)).length, 0, label);

  // Every listing the discovery service can produce, unpaged.
  noneHidden(discovery.search({ limit: Infinity }).libraries, 'discovery');
  const fullIndia = full.search({ country: 'IN', limit: Infinity }).libraries;
  assert.equal(fullIndia.filter((library) => hiddenIds.has(library.id)).length, HIDDEN_COUNT);
  const areaCounts = discovery.areas({ country: 'IN' }).counts.countries.IN;
  assert.equal(areaCounts, discovery.search({ country: 'IN' }).total);
  assert.equal(areaCounts, full.areas({ country: 'IN' }).counts.countries.IN - HIDDEN_COUNT);

  // Browse every region that holds a hidden library.
  for (const region of new Set(hiddenEntries.map((entry) => entry.region).filter(Boolean))) {
    noneHidden(directory.browse({ country: 'IN', region, offset: 0, limit: Infinity }).libraries, `browse ${region}`);
    noneHidden(getLibrariesByRegion('IN', region), `region ${region}`);
    noneHidden(discovery.search({ country: 'IN', region, limit: Infinity }).libraries, `discover ${region}`);
  }

  // Search by name: a hidden library never matches, though the full directory would find it.
  for (const entry of hiddenEntries.filter((_, index) => index % 190 === 0)) {
    assert.ok(full.search({ query: entry.name, limit: Infinity }).libraries.some((library) => library.id === entry.id), entry.id);
    noneHidden(discovery.search({ query: entry.name, limit: Infinity }).libraries, `discover ${entry.id}`);
    noneHidden(directory.search(entry.name, 50), `search ${entry.id}`);
    noneHidden(searchLibraries(entry.name, 50), `legacy ${entry.id}`);
  }

  // Near me at the localities of hidden libraries.
  const places = [...new Map(hiddenEntries.map(indiaLibraryPlace).filter(Boolean).map((place) => [place.id, place])).values()].slice(0, 10);
  assert.ok(places.length > 0);
  for (const place of places) {
    noneHidden(discovery.search({ lat: place.lat, lon: place.lon, limit: Infinity }).libraries, `near ${place.id}`);
    noneHidden(discovery.search({ placeId: place.id, limit: Infinity }).libraries, `place ${place.id}`);
    noneHidden(nearbyLibraries(place.lat, place.lon, 50), `legacy near ${place.id}`);
  }
  assert.ok(places.some((place) => full.search({ placeId: place.id, limit: Infinity }).libraries.some((library) => hiddenIds.has(library.id))));
});

test('a hidden library ID and its selection link still resolve', async () => {
  const [entry] = hiddenEntries;
  const directory = createPublicDirectoryService();
  assert.equal(getLibraryById(entry.id), entry);
  assert.equal(directory.resolve(entry.id).id, entry.id);
  assert.equal(directory.entry(entry.id), entry);
  const slug = decodeURIComponent(libraryLinks.pathFor(entry.id).replace('/select/', ''));
  assert.equal(directory.resolveSelection(slug).id, entry.id);
  for (const id of hiddenList.libraryIds) assert.equal(directory.resolve(id)?.id, id);

  const app = makeTestApp((target) => target.use('/api/v2', createPublicV2Router({ rateLimit: { limit: 100 } })));
  const resolved = await request(app).post('/api/v2/libraries/resolve').send({ libraryId: entry.id });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.library.id, entry.id);
  const linked = await request(app).post('/api/v2/libraries/resolve-link').send({ slug });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.library.id, entry.id);
  const searched = await request(app).post('/api/v2/libraries/search').send({ query: entry.name, limit: 25 });
  assert.equal(searched.body.libraries.some((library) => library.id === entry.id), false);
  const discovered = await request(app).post('/api/v2/libraries/discover').send({ query: entry.name });
  assert.equal(discovered.body.libraries.some((library) => library.id === entry.id), false);
});
