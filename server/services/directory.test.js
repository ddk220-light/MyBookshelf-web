import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import hiddenList from '../data/india-catalogs-hidden.json' with { type: 'json' };
import seoLibraries from '../../shared/seo-libraries.json' with { type: 'json' };
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

// Hidden list (server/data/india-catalogs-hidden.json): Indian libraries whose
// public catalog search showed no books, each platform by its own evidence.
const PLATFORM_COUNTS = { egranthalaya: 1889, libman: 155 };
const HIDDEN_COUNT = 2044;
const hiddenIds = new Set(hiddenList.libraryIds);
const hiddenEntries = getAllLibraries().filter((entry) => hiddenIds.has(entry.id));
const hiddenOf = (platform) => hiddenList.libraryIds.filter((id) => id.startsWith(`${platform}:`));
const evidence = (name) => JSON.parse(readFileSync(new URL(`../../docs/research/india-library-hardening/${name}`, import.meta.url), 'utf8'));

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

// Any library or route with a book verified by the strict standard.
const verifiedIds = new Set(evidence('summary.json').libraries.flatMap((library) => [
  ...(library.verifiedBooks > 0 ? [library.libraryId] : []),
  ...library.routes.filter((route) => route.verifiedBooks > 0).map((route) => route.libraryId),
]));

test('hidden e-Granthalaya IDs are exactly the audit libraries with fifty valid empty searches and no later verified book', () => {
  const needsWork = csvRows('../../docs/research/india-library-hardening/egranthalaya-audit-20261110/needs-work-libraries.csv');
  const empty = needsWork.filter((row) => row.emptyQueries === '50' && row.failedQueries === '0').map((row) => row.libraryId);
  const errors = needsWork.filter((row) => !empty.includes(row.libraryId)).map((row) => row.libraryId);
  assert.equal(needsWork.length, 1901);
  assert.equal(empty.length, 1890);
  assert.equal(errors.length, 11);
  // IUCAA's audit searches were empty, but a later strict check verified a book.
  assert.deepEqual(empty.filter((id) => verifiedIds.has(id)), ['egranthalaya:universities-iucaa']);
  assert.equal(hiddenList.platforms.egranthalaya.count, PLATFORM_COUNTS.egranthalaya);
  assert.deepEqual([...hiddenOf('egranthalaya')].sort(), empty.filter((id) => !verifiedIds.has(id)).sort());
  for (const id of errors) assert.equal(hiddenIds.has(id), false, id);
});

test('hidden LIBMAN IDs are exactly the unverified tenants whose latest seed searches were all clean and empty', () => {
  const files = ['libman-sweep-results.json', 'libman-recheck-results.json', 'libman-followup-results.json', 'libman-universities-results.json'];
  for (const file of files) assert.ok(hiddenList.platforms.libman.evidence.includes(`docs/research/india-library-hardening/${file}`), file);
  const verified = new Map(evidence('summary.json').libraries.map((library) => [library.libraryId, library.verifiedBooks]));
  const latest = new Map();
  for (const file of files) {
    for (const attempt of evidence(file).libraries) {
      const previous = latest.get(attempt.libraryId);
      if (!previous || String(attempt.finishedAt) > String(previous.finishedAt)) latest.set(attempt.libraryId, attempt);
    }
  }
  const cleanEmpty = (attempt) => attempt.discovery?.length > 0
    && attempt.discovery.every((query) => query.ok === true && query.records === 0) && !attempt.books?.length;
  const expected = [...latest.values()].filter((attempt) => !(verified.get(attempt.libraryId) > 0) && cleanEmpty(attempt)).map((attempt) => attempt.libraryId);
  assert.equal(expected.length, PLATFORM_COUNTS.libman);
  assert.equal(hiddenList.platforms.libman.count, PLATFORM_COUNTS.libman);
  assert.deepEqual([...hiddenOf('libman')].sort(), [...expected].sort());

  // 147 clean-empty tenants of the sweep plus 8 host-busy tenants that came back clean empty.
  const sweepEmpty = evidence('libman-sweep-results.json').libraries.filter(cleanEmpty).map((attempt) => attempt.libraryId);
  assert.equal(sweepEmpty.length, 147);
  const recheckedEmpty = ['348', '353', '354', '355', '360', '361', '362', '363'].map((n) => `libman:${n}`);
  assert.deepEqual([...new Set([...sweepEmpty, ...recheckedEmpty])].sort(), [...hiddenOf('libman')].sort());

  // Never hidden: a verified tenant, a tenant whose latest attempt has an error, or an excluded test/foreign tenant.
  for (const [id, attempt] of latest) {
    if (verified.get(id) > 0 || attempt.discovery?.some((query) => query.ok !== true)) assert.equal(hiddenIds.has(id), false, id);
  }
  for (const id of ['libman:202', 'libman:579', 'libman:708']) assert.equal(hiddenIds.has(id), false, id);
});

test('every hidden ID is a directory library of a platform with stated criteria and is not a public guide', () => {
  const byId = new Map(getAllLibraries().map((entry) => [entry.id, entry]));
  assert.deepEqual(Object.keys(hiddenList.platforms).sort(), Object.keys(PLATFORM_COUNTS).sort());
  for (const [platform, header] of Object.entries(hiddenList.platforms)) {
    assert.ok(header.criteria && header.evidence && header.auditDate, platform);
    assert.equal(hiddenOf(platform).length, header.count, platform);
  }
  for (const id of hiddenList.libraryIds) {
    assert.ok(byId.has(id), id);
    assert.ok(Object.hasOwn(hiddenList.platforms, byId.get(id).platform), id);
    assert.equal(byId.get(id).country, 'IN', id);
  }
  assert.equal(hiddenList.libraryIds.length, HIDDEN_COUNT);
  assert.equal(hiddenList.count, HIDDEN_COUNT);
  assert.equal(hiddenIds.size, HIDDEN_COUNT);
  assert.equal(hiddenEntries.length, HIDDEN_COUNT);
  assert.equal(getListedLibraries().length, getAllLibraries().length - HIDDEN_COUNT);
  assert.equal(getListedLibraries().some((entry) => hiddenIds.has(entry.id)), false);
  for (const guide of seoLibraries) assert.equal(hiddenIds.has(guide.id), false, guide.id);
  for (const id of hiddenList.libraryIds) assert.equal(verifiedIds.has(id), false, id);
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
  const samples = Object.keys(PLATFORM_COUNTS).flatMap((platform) => {
    const ofPlatform = hiddenEntries.filter((entry) => entry.platform === platform);
    return ofPlatform.filter((_, index) => index % Math.ceil(ofPlatform.length / 10) === 0);
  });
  for (const entry of samples) {
    assert.ok(full.search({ query: entry.name, limit: Infinity }).libraries.some((library) => library.id === entry.id), entry.id);
    noneHidden(discovery.search({ query: entry.name, limit: Infinity }).libraries, `discover ${entry.id}`);
    noneHidden(directory.search(entry.name, 50), `search ${entry.id}`);
    noneHidden(searchLibraries(entry.name, 50), `legacy ${entry.id}`);
  }

  // Near me at the localities of hidden libraries.
  const placesOf = (platform) => [...new Map(hiddenEntries.filter((entry) => entry.platform === platform)
    .map(indiaLibraryPlace).filter(Boolean).map((place) => [place.id, place])).values()].slice(0, 10);
  const places = Object.keys(PLATFORM_COUNTS).flatMap(placesOf);
  for (const platform of Object.keys(PLATFORM_COUNTS)) assert.ok(placesOf(platform).length > 0, platform);
  for (const place of places) {
    noneHidden(discovery.search({ lat: place.lat, lon: place.lon, limit: Infinity }).libraries, `near ${place.id}`);
    noneHidden(discovery.search({ placeId: place.id, limit: Infinity }).libraries, `place ${place.id}`);
    noneHidden(nearbyLibraries(place.lat, place.lon, 50), `legacy near ${place.id}`);
  }
  assert.ok(places.some((place) => full.search({ placeId: place.id, limit: Infinity }).libraries.some((library) => hiddenIds.has(library.id))));
});

test('hidden library IDs and their selection links still resolve, for every platform', async () => {
  const directory = createPublicDirectoryService();
  for (const id of hiddenList.libraryIds) assert.equal(directory.resolve(id)?.id, id);
  const app = makeTestApp((target) => target.use('/api/v2', createPublicV2Router({ rateLimit: { limit: 100 } })));
  for (const platform of Object.keys(PLATFORM_COUNTS)) {
    const entry = hiddenEntries.find((candidate) => candidate.platform === platform);
    assert.equal(getLibraryById(entry.id), entry);
    assert.equal(directory.resolve(entry.id).id, entry.id);
    assert.equal(directory.entry(entry.id), entry);
    const slug = decodeURIComponent(libraryLinks.pathFor(entry.id).replace('/select/', ''));
    assert.equal(directory.resolveSelection(slug).id, entry.id);

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
  }
});
