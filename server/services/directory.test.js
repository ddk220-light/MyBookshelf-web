import test from 'node:test';
import assert from 'node:assert/strict';
import { getLibraryById, haversineKm, nearbyLibraries, publicLibrary, searchLibraries } from './directory.js';

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
