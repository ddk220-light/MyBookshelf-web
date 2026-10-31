import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryService } from './discovery.js';
import { parseDiscovery } from './validation.js';
import { getAllLibraries } from '../services/directory.js';

const row = (id, extra = {}) => ({ id: `koha:${id}`, name: `Library ${id}`, platform: 'koha',
  catalogUrl: 'https://catalog.example.test/', country: 'IN', region: 'Assam', district: 'Bongaigaon', ...extra });

test('unsupported listings are excluded before filtering and pagination', () => {
  const entries = [row('unsupported', { platform: 'catalog', catalogUrl: null }), row('one'), row('two'), row('three')];
  const service = createDiscoveryService({ entries: () => entries });
  const first = service.search({ country: 'IN', region: 'Assam', district: 'Bongaigaon', limit: 2 });
  assert.equal(first.total, 3); assert.equal(first.nextOffset, 2);
  assert.deepEqual(first.libraries.map(l => l.id), ['koha:one', 'koha:three']);
  assert.equal(service.search({ offset: 2, limit: 2 }).nextOffset, null);
});
test('nearby excludes unreviewed points, bounds distance, and orders closest first', () => {
  const entries = [row('far', { lat: 26, lon: 91, nearbyEligible: true, addressScope: 'campus' }), row('near', { lat: 26.01, lon: 91, nearbyEligible: true, addressScope: 'campus' }),
    row('unknown', { lat: 26.02, lon: 91 }), row('outside', { lat: 12, lon: 80, nearbyEligible: true })];
  const page = createDiscoveryService({ entries: () => entries }).search({ lat: 26.01, lon: 91 });
  assert.deepEqual(page.libraries.map(l => l.id), ['koha:near', 'koha:far']);
  assert.equal(page.libraries[0].distanceKm, 0);
  assert.equal(page.libraries[0].distanceApproximate, true);
});
test('name search matches aliases and locality words in any order', () => {
  const service = createDiscoveryService({ entries: () => [row('one', { name: 'Université Library', searchAliases: ['ABC College'] })] });
  assert.equal(service.search({ query: 'Assam ABC' }).total, 1);
  assert.equal(service.search({ query: 'Universite' }).total, 1);
});
test('discovery validates coordinate pairs and pagination', () => {
  for (const invalid of [{ lat: 10 }, { lat: 91, lon: 80 }, { lat: '26', lon: 80 }, { offset: -1 }, { limit: 26 }]) assert.throws(() => parseDiscovery(invalid));
});
test('network methods admit unsampled members, while research-only listings stay out', () => {
  const entries = getAllLibraries();
  const kvs = entries.find(l => l.egranthalayaCluster === 'KVS3');
  assert.ok(kvs?.publicCatalogMethodValidated);
  const service = createDiscoveryService();
  assert.ok(service.search({ query: kvs.name }).libraries.some(l => l.id === kvs.id));
  assert.ok(service.search({ country: 'IN' }).total > 5000);
  assert.equal(entries.filter(l => l.egranthalayaCluster === 'UPSC').length, 0);
});
