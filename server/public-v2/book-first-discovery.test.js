import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryService } from './discovery.js';
import { createPlaceSearch } from './places.js';
import { parseDiscovery, parsePlaceSearch } from './validation.js';

const library = (id, extra = {}) => ({ id: `koha:${id}`, name: `Library ${id}`, platform: 'koha', catalogUrl: 'https://catalog.example.test/', country: 'US', ...extra });

test('nearby uses the actual nearby branch even when its catalog headquarters is far away', () => {
  const service = createDiscoveryService({ entries: () => [library('system', { lat: 40, lon: -74,
    branches: [{ name: 'Local branch', lat: 37.58, lon: -122.35, locationReviewed: true }, { name: 'Far branch', lat: 40, lon: -74 }] })] });
  const result = service.search({ lat: 37.58, lon: -122.35, radiusKm: 5 });
  assert.equal(result.total, 1);
  assert.equal(result.libraries[0].distanceKm, 0);
  assert.deepEqual(result.libraries[0].locations.map(p => p.name), ['Local branch']);
  assert.equal(result.libraries[0].locations[0].precision, 'branch');
});
test('map bounds include only matching locations and handle crossing the date line', () => {
  const service = createDiscoveryService({ entries: () => [library('east', { lat: 0, lon: 179 }), library('west', { lat: 0, lon: -179 }), library('outside', { lat: 0, lon: 0 })] });
  const result = service.search({ bounds: { north: 2, south: -2, west: 170, east: -170 } });
  assert.deepEqual(result.libraries.map(l => l.id), ['koha:east', 'koha:west']);
});
test('unmapped libraries stay in name search, and campus points retain their precision', () => {
  const service = createDiscoveryService({ entries: () => [library('unknown', { country: 'IN', lat: 10, lon: 10 }), library('campus', { lat: 10, lon: 10, addressScope: 'campus' })] });
  assert.equal(service.search({ query: 'unknown' }).total, 1);
  assert.deepEqual(service.search({ query: 'unknown' }).libraries[0].locations, []);
  const nearby = service.search({ lat: 10, lon: 10 });
  assert.equal(nearby.total, 1);
  assert.equal(nearby.libraries[0].locations[0].precision, 'campus');
});
test('radius can be widened and malformed map/place inputs are rejected', () => {
  const service = createDiscoveryService({ entries: () => [library('one', { lat: 1, lon: 0 })] });
  assert.equal(service.search({ lat: 0, lon: 0, radiusKm: 25 }).total, 0);
  assert.equal(service.search({ lat: 0, lon: 0, radiusKm: 200 }).total, 1);
  for (const value of [{ radiusKm: 201 }, { radiusKm: -1 }, { bounds: { north: 20, south: 30, east: 20, west: 10 } }, { bounds: { north: 40, south: 30, east: 200, west: 10 } }]) assert.throws(() => parseDiscovery(value));
  assert.throws(() => parsePlaceSearch({ query: 'a' }));
});
test('place search uses a fixed upstream, validates points, and reuses bounded cached answers', async () => {
  const calls = [];
  const search = createPlaceSearch({ fetcher: async (url) => { calls.push(url); return { ok: true, json: async () => ({ features: [
    { geometry: { coordinates: [-122.35, 37.58] }, properties: { osm_type: 'N', osm_id: 1, name: 'Burlingame', state: 'California', country: 'United States' } },
    { geometry: { coordinates: [200, 95] }, properties: { name: 'Bad coordinates' } },
  ] }) }; } });
  const result = await search({ query: 'Burlingame' });
  assert.equal(result.length, 1);
  assert.match(result[0].label, /Burlingame, California/);
  await search({ query: 'Burlingame' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, 'https://photon.komoot.io');
});
test('place provider failures remain failures rather than empty results', async () => {
  const search = createPlaceSearch({ fetcher: async () => ({ ok: false }) });
  await assert.rejects(search({ query: 'London United Kingdom' }), { code: 'PLACE_SEARCH_UNAVAILABLE' });
});
