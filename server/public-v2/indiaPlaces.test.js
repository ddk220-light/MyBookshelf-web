import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { createPlaceSearch } from './places.js';
import { searchIndiaPlaces } from './indiaPlaces.js';
import { createDiscoveryService } from './discovery.js';
import { getLibraryById } from '../services/directory.js';
import { createPublicDirectoryService } from './directory.js';
import { libraryLinks } from './libraryLinks.js';
import { makeTestApp } from '../test/helpers.js';
import { createPublicV2Router } from './router.js';
import { createRedactedTelemetrySink } from './telemetry.js';
import historicalLinks from '../../data/library-selection-aliases.json' with { type: 'json' };
import index from '../data/india-places.json' with { type: 'json' };
import sources from '../../data/india-place-sources.json' with { type: 'json' };
import coverage from '../../data/india-location-coverage.json' with { type: 'json' };

const discovery = createDiscoveryService();
const cases = [
  ['Chennai', 'koha:anna-centenary-library'], ['Madurai', 'koha:kalaignar-centenary-library'],
  ['Kochi', 'koha:ideal-cift'], ['Bengaluru', 'koha:dharmaram'], ['Karaikudi', 'catalog:alagappa-university'],
  ['Tirunelveli', 'egranthalaya:kvs3-pmskvvnm'], ['Jorhat', 'koha:ideal-aauj'],
  ['Kottayam', 'discovery-community:santhom-kottayam'], ['Sivaganga', 'egranthalaya:kvs3-kvsvgtn'],
];
for (const [city, id] of cases) test(`${city}: typed place and GPS find published libraries without library coordinates`, async () => {
  let externalCalls = 0;
  const places = await createPlaceSearch({ fetcher: () => { externalCalls++; throw new Error('offline'); } })({ query: city, country: 'IN' });
  const place = places[0];
  assert.ok(place?.id.startsWith('geonames:'));
  assert.equal(externalCalls, 0);
  for (const query of [{ placeId: place.id }, { lat: place.lat, lon: place.lon }]) {
    const page = discovery.search({ ...query, limit: 25 });
    const all = [...page.libraries];
    for (let offset = page.nextOffset; offset != null;) {
      const next = discovery.search({ ...query, offset, limit: 25 }); all.push(...next.libraries); offset = next.nextOffset;
    }
    assert.ok(all.some(library => library.id === id), id);
    assert.equal(new Set(all.map(library => library.id)).size, all.length);
    assert.ok(all.every(library => library.distanceKm === undefined));
    assert.ok(all.every(library => ['locality', 'postcode', 'district'].includes(library.locationMatch.scope)));
    assert.ok(page.area?.label);
  }
});
test('Indian postcodes and ambiguous towns preserve administrative identity', async () => {
  const places = searchIndiaPlaces('630003');
  assert.ok(places.some(p => p.region === 'Tamil Nadu' && p.district === 'Sivaganga'));
  assert.ok(discovery.search({ placeId: places[0].id }).libraries.some(l => l.id === 'catalog:alagappa-university'));
  const towns = searchIndiaPlaces('Kottayam');
  assert.ok(new Set(towns.map(p => p.id)).size > 1);
  assert.ok(new Set(towns.map(p => p.label)).size > 1);
});
test('published postal localities do not turn district addresses into city or building points', () => {
  const binding = index.libraries['egranthalaya:kvs3-pmskvvnm'];
  assert.equal(binding.basis, 'published_postal_locality');
  assert.equal(binding.city, 'Vijayanarayanam Naval Base');
  const page = discovery.search({ placeId: searchIndiaPlaces('Tirunelveli')[0].id });
  const school = page.libraries.find(library => library.id === 'egranthalaya:kvs3-pmskvvnm');
  assert.equal(page.radiusKm, 50);
  assert.equal(school.locationMatch.label, 'Around Vijayanarayanam Naval Base');
  assert.equal(school.distanceKm, undefined);
  assert.equal(index.libraries['egranthalaya:kvs2-kvkdt'].city, 'Kaduthuruthy');
  const kochi = discovery.search({ placeId: searchIndiaPlaces('Kochi')[0].id, limit: 100 });
  assert.ok(kochi.libraries.some(library => library.id === 'koha:ernakulam-public-library'));
  assert.ok(coverage.unresolved.some(library => library.reason === 'conflicting_postcode_admin'));
});
test('radii expand only when empty and district fallback does not depend on coordinates', () => {
  const chennai = searchIndiaPlaces('Chennai')[0];
  const farPoint = { id: 'catalog:point', name: 'Reviewed point', platform: 'catalog', catalogUrl: 'https://example.org', country: 'IN', nearbyEligible: true, addressScope: 'library', lat: chennai.lat + 0.35, lon: chennai.lon };
  const near = createDiscoveryService({ entries: () => [farPoint] }).search({ placeId: chennai.id });
  assert.equal(near.radiusKm, 50); assert.equal(near.area.expanded, true); assert.equal(near.libraries[0].locationMatch.scope, 'point');
  assert.equal(near.libraries[0].distanceApproximate, false);
  const district = createDiscoveryService({ entries: () => [{ ...farPoint, id: 'catalog:district', lat: undefined, lon: undefined, region: 'Tamil Nadu', district: 'Chennai' }] }).search({ placeId: chennai.id });
  assert.equal(district.radiusKm, 100); assert.equal(district.libraries[0].locationMatch.scope, 'district');
  assert.equal(district.libraries[0].distanceKm, undefined);
});
test('counts include website catalogs, normalize aliases and keep stable pagination', () => {
  assert.equal(discovery.search({ query: 'Alagappa' }).libraries[0].capabilities.publicAvailability, false);
  assert.equal(discovery.areas({ country: 'IN' }).counts.countries.IN, discovery.search({ country: 'IN' }).total);
  assert.deepEqual(discovery.search({ country: 'IN', region: 'Gujarat', district: 'Ahmadabad' }), discovery.search({ country: 'IN', region: 'Gujarat', district: 'Ahmedabad' }));
  const first = discovery.search({ country: 'IN', limit: 2 });
  assert.deepEqual(discovery.search({ country: 'IN', limit: 4 }).libraries.slice(2), discovery.search({ country: 'IN', offset: 2, limit: 2 }).libraries);
  assert.equal(first.nextOffset, 2);
});
test('branch counts classify physical branches independently of coordinate availability and pagination', () => {
  const directory = createPublicDirectoryService();
  for (const [id, count] of [['bc:aclibrary', 10], ['bc:pcin', 7], ['bc:spl', 7], ['bc:yourlibrary', 4]]) {
    const library = directory.resolve(id);
    assert.equal(library.branchCount, count);
    assert.equal(library.branchClassification, 'complete');
    const page = createDiscoveryService({ entries: () => [getLibraryById(id)] }).search({ limit: 1 });
    assert.equal(page.libraries[0].branchCount, count);
  }
  assert.equal(directory.resolve('bc:sitka').branchCount, null);
  for (const [slug, id] of Object.entries(historicalLinks)) assert.equal(libraryLinks.resolve(slug), id);
});
test('international places still use the fallback and existing nearby catalogs remain discoverable', async () => {
  let calls = 0;
  const places = await createPlaceSearch({ fetcher: async () => { calls++; return { ok: true, json: async () => ({ features: [{ properties: { name: 'London', country: 'United Kingdom', countrycode: 'gb', osm_id: 1 }, geometry: { coordinates: [-0.12, 51.5] } }] }) }; } })({ query: 'London United Kingdom' });
  assert.equal(calls, 1); assert.equal(places[0].country, 'GB');
  assert.ok(discovery.search({ country: 'US', lat: 37.5506, lon: -121.9712 }).libraries.some(l => l.id === 'bc:aclibrary'));
});
test('nearby coordinates are only in the request body and never enter telemetry', async () => {
  const telemetry = createRedactedTelemetrySink();
  const app = makeTestApp(app => app.use('/api/v2', createPublicV2Router({ telemetry })));
  const response = await request(app).post('/api/v2/libraries/discover').send({ lat: 13.08784, lon: 80.27847 });
  assert.equal(response.status, 200);
  assert.ok(response.body.total > 0);
  assert.equal(/13\.08784|80\.27847|Chennai/.test(JSON.stringify(telemetry.events())), false);
});
test('generated data records its source checksums and unresolved location coverage', () => {
  for (const [name, source] of Object.entries(sources.sources)) assert.equal(index.sourceChecksums[name], source.sha256);
  const hash = createHash('sha256').update(readFileSync(new URL('../../data/india-administrative-aliases.json', import.meta.url))).digest('hex');
  assert.equal(index.aliasesSha256, hash);
  assert.equal(coverage.eligibleLibraries, discovery.search({ country: 'IN' }).total);
  assert.equal(coverage.localityMatched + coverage.unresolvedLocalities, coverage.eligibleLibraries);
});
