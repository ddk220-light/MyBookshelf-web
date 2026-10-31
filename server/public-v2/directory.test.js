import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicDirectoryService, toPublicLibrary } from './directory.js';

test('scoped browse keeps every usable library reachable beyond one page and hides provider internals', () => {
  const entries = Array.from({ length: 29 }, (_, i) => ({ ...linked, id: `catalog:tn-${i}`, name: `Library ${String(i).padStart(2, '0')}`, platform: 'catalog', baseUrl: 'https://internal.example.test', address: `Campus ${i}, Tamil Nadu`, addressScope: 'campus', addressSourceUrl: 'https://official.example.test/contact' }));
  const calls = [];
  const service = createPublicDirectoryService({ listByRegion: (...scope) => { calls.push(scope); return [...entries, { id: 'catalog:unusable', name: 'No public catalog', platform: 'catalog' }]; } });
  const first = service.browse({ country: 'IN', region: 'Tamil Nadu', offset: 0, limit: 25 });
  const last = service.browse({ country: 'IN', region: 'Tamil Nadu', offset: first.nextOffset, limit: 25 });
  assert.deepEqual(calls, [['IN', 'Tamil Nadu'], ['IN', 'Tamil Nadu']]);
  assert.equal(first.total, 29);
  assert.equal(first.libraries.length, 25);
  assert.equal(last.libraries.length, 4);
  assert.equal(last.nextOffset, null);
  assert.equal(new Set([...first.libraries, ...last.libraries].map(row => row.id)).size, 29);
  assert.equal(first.libraries[0].address, 'Campus 0, Tamil Nadu');
  assert.equal(first.libraries[0].addressScope, 'campus');
  assert.equal(first.libraries[0].addressSourceUrl, 'https://official.example.test/contact');
  assert.equal('baseUrl' in first.libraries[0], false);
  assert.equal('platform' in first.libraries[0], false);
  assert.equal(toPublicLibrary({ ...linked, address: 'Example public address', addressSourceUrl: 'javascript:alert(1)' }).addressSourceUrl, undefined);
});

const linked = {
  id: 'koha:example', name: 'Example Library', city: 'Chennai', region: 'Tamil Nadu', country: 'India',
  catalogUrl: 'https://catalog.example.test', publicCatalogValidated: true,
  publicCatalogCapabilities: { copyCounts: true, callNumber: true, catalogLink: true },
};

test('public directory advertises availability only after explicit public validation', () => {
  const publicLibrary = toPublicLibrary(linked);
  assert.equal(publicLibrary.capabilities.publicAvailability, true);
  assert.equal(publicLibrary.capabilities.copyCounts, true);
  assert.equal(publicLibrary.catalogUrl, 'https://catalog.example.test/');

  const unvalidated = toPublicLibrary({ ...linked, publicCatalogValidated: false });
  assert.equal(unvalidated.capabilities.catalogLookup, false);
  assert.equal(unvalidated.capabilities.publicAvailability, false);
  assert.equal(unvalidated.capabilities.catalogLink, true);

  const insecure = toPublicLibrary({ ...linked, baseUrl: 'http://catalog.example.test', publicCatalogValidated: true });
  assert.equal(insecure.capabilities.publicAvailability, false);

  const httpOnlyCatalog = toPublicLibrary({ ...linked, catalogUrl: 'http://catalog.example.test', baseUrl: 'http://catalog.example.test', publicCatalogValidated: false });
  assert.equal(httpOnlyCatalog.catalogUrl, 'http://catalog.example.test/');
  assert.equal(httpOnlyCatalog.capabilities.catalogLink, true);
});

test('unmeasured BiblioCommons health is unknown and explicit health is retained', () => {
  const bibliocommons = toPublicLibrary({
    id: 'bc:example', name: 'Example Biblio', platform: 'bc', catalogUrl: 'https://example.bibliocommons.com',
  });
  assert.equal(bibliocommons.capabilities.publicAvailability, true);
  assert.equal(bibliocommons.health, 'unknown');

  const demo = toPublicLibrary({
    id: 'aspen:example', name: 'Example Aspen', platform: 'aspen', baseUrl: 'https://catalog.example.test',
    catalogUrl: 'https://catalog.example.test', publicCatalogDemo: true, publicCatalogHealth: 'degraded',
  });
  assert.equal(demo.capabilities.publicAvailability, true);
  assert.equal(demo.health, 'degraded');
});

test('reviewed HTTP catalogs still need live validation before advertising availability', () => {
  const entry = { ...linked, id: 'koha:anna-centenary-library', platform: 'koha', baseUrl: 'http://118.185.210.241:8001', catalogUrl: 'http://118.185.210.241:8001' };
  assert.equal(toPublicLibrary(entry).capabilities.publicAvailability, true);
  assert.equal(toPublicLibrary({ ...entry, publicCatalogValidated: false }).capabilities.publicAvailability, false);
  assert.equal(toPublicLibrary({ ...entry, id: 'koha:other' }).capabilities.publicAvailability, false);
});

test('directory DTO exposes classified branch details and hides provider internals', () => {
  const entry = { ...linked, platform: 'koha', slug: 'example', baseUrl: 'https://private.example.test', branches: [{ name: 'Main' }] };
  const service = createPublicDirectoryService({
    findById: (id) => id === entry.id ? entry : null,
    search: () => [{ id: entry.id }],
  });
  const [result] = service.search('example', 10);
  assert.equal(result.id, 'koha:example');
  for (const key of ['platform', 'slug', 'baseUrl']) assert.equal(key in result, false);
  assert.equal(result.branches[0].kind, 'unknown');
  assert.equal(result.branchCount, null);
  assert.deepEqual(service.resolve(entry.id), result);
});

test('Japanese systems are discoverable by English aliases with honest validation and attribution', () => {
  const service = createPublicDirectoryService();
  assert.equal(service.search('Japan', 25).filter(row => row.id.startsWith('calil:')).length, 20);
  const [yokohama] = service.search('Yokohama', 25);
  assert.equal(yokohama.id, 'calil:Kanagawa_Yokohama');
  assert.equal(yokohama.capabilities.publicAvailability, true);
  assert.deepEqual(yokohama.attribution, { label: 'Calil', url: 'https://calil.jp/' });
  const [nagoya] = service.search('Nagoya City', 25);
  assert.equal(nagoya.health, 'unknown');
  assert.equal(nagoya.capabilities.copyCounts, false);
  assert.equal(nagoya.capabilities.callNumber, false);
  assert.equal(service.resolve('bc:poudrelibraries').country, 'US');
});

test('access notes are public but unsafe attribution links are not', () => {
  const result = toPublicLibrary({ ...linked, publicAccessNote: 'Reference use only.',
    attribution: { label: 'Source', url: 'https://secret@example.test/' } });
  assert.equal(result.accessNote, 'Reference use only.');
  assert.equal(result.attribution, undefined);
});

test('manual catalogs remain browser links even if availability flags are incorrectly set', () => {
  const result = toPublicLibrary({ ...linked, id: 'catalog:manual', platform: 'catalog', publicCatalogDemo: true });
  assert.equal(result.capabilities.catalogLink, true);
  assert.equal(result.capabilities.catalogLookup, false);
  assert.equal(result.capabilities.publicAvailability, false);
  assert.equal(result.health, 'unknown');
});


test('only reviewed Koha HTTP pins advertise public availability without exposing the pin', () => {
  const baseUrl = 'http://122.184.84.190:1011';
  const entry = { ...linked, platform: 'koha', baseUrl, publicCatalogHttpOrigin: baseUrl };
  const result = toPublicLibrary(entry);
  assert.equal(result.capabilities.publicAvailability, true);
  assert.equal('publicCatalogHttpOrigin' in result, false);
  for (const overrides of [{ platform: 'aspen' }, { publicCatalogHttpOrigin: null }, { baseUrl: 'http://10.1.1.1' }]) {
    assert.equal(toPublicLibrary({ ...entry, ...overrides }).capabilities.publicAvailability, false);
  }
});
