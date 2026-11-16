import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import hiddenList from '../../docs/research/india-library-status/empty-catalogs.json' with { type: 'json' };
import allowlist from '../data/india-catalogs-listed.json' with { type: 'json' };
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

// Empty-catalog list (docs/research/india-library-status/empty-catalogs.json):
// Indian libraries whose public catalog search showed no books, each platform by
// its own evidence. The directory no longer reads it; the India allowlist below
// decides what is offered. These tests keep its criteria honest.
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

test('empty-catalog e-Granthalaya IDs are exactly the audit libraries with fifty valid empty searches and no later verified book', () => {
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

test('empty-catalog LIBMAN IDs are exactly the unverified tenants whose latest seed searches were all clean and empty', () => {
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

test('every empty-catalog ID is an Indian directory library of a platform with stated criteria, never verified and never listed', () => {
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
    assert.equal(verifiedIds.has(id), false, id);
    assert.equal(listedIds.has(id), false, id);
  }
  assert.equal(hiddenList.libraryIds.length, HIDDEN_COUNT);
  assert.equal(hiddenList.count, HIDDEN_COUNT);
  assert.equal(hiddenEntries.length, HIDDEN_COUNT);
});

// India allowlist (server/data/india-catalogs-listed.json): the only Indian
// libraries offered when finding a library. Generated by
// tools/catalog-hardening/library-status.mjs from strict verifications and the
// e-Granthalaya fifty-title audit; IDs are only ever added.
const LISTED_COUNT = 4139;
const AUDIT_ONLY_COUNT = 3105;
const listedIds = new Set(allowlist.libraryIds);
const indiaEntries = getAllLibraries().filter((entry) => entry.country === 'IN');
const unlistedEntries = indiaEntries.filter((entry) => !listedIds.has(entry.id));
const unlistedPlatforms = [...new Set(unlistedEntries.map((entry) => entry.platform))];

test('the India allowlist holds every verified and audit-found library, sorted, with stated criteria', () => {
  const byId = new Map(getAllLibraries().map((entry) => [entry.id, entry]));
  assert.deepEqual(allowlist.libraryIds, [...listedIds].sort());
  assert.equal(allowlist.libraryIds.length, LISTED_COUNT);
  assert.equal(allowlist.count, LISTED_COUNT);
  assert.equal(allowlist.egranthalayaAuditOnly.length, AUDIT_ONLY_COUNT);
  assert.equal(allowlist.counts.verified + allowlist.counts.egranthalayaAuditOnly, LISTED_COUNT);
  assert.ok(allowlist.criteria.verified && allowlist.criteria.egranthalayaAudit && allowlist.rules.length);
  for (const id of allowlist.libraryIds) {
    assert.ok(byId.has(id), id);
    assert.equal(byId.get(id).country, 'IN', id);
  }
  for (const id of allowlist.egranthalayaAuditOnly) {
    assert.ok(listedIds.has(id), id);
    assert.equal(byId.get(id).platform, 'egranthalaya', id);
  }
  // Every Indian directory library with a strictly verified book is listed.
  for (const id of verifiedIds) if (byId.get(id)?.country === 'IN') assert.ok(listedIds.has(id), id);
  // Every library the tracker marks verified or audit-found is listed, and the
  // audit-found ones are e-Granthalaya libraries whose audit found books.
  const status = csvRows('../../docs/research/india-library-status/status.csv');
  const audit = new Map(csvRows('../../docs/research/india-library-hardening/egranthalaya-audit-20261110/libraries.csv').map((row) => [row.libraryId, row]));
  for (const row of status.filter((item) => ['verified', 'audit-found'].includes(item.status))) assert.ok(listedIds.has(row.library_id), row.library_id);
  for (const row of status.filter((item) => item.status === 'audit-found')) assert.ok(Number(audit.get(row.library_id)?.nonemptyQueries) > 0, row.library_id);
  assert.equal(status.filter((item) => item.status === 'audit-found').length, AUDIT_ONLY_COUNT);
  // KALNET's robots.txt refuses all user agents: its scopes are never listed.
  assert.equal(allowlist.libraryIds.some((id) => id.startsWith('vufind:kalnet-')), false);
});

test('every public library guide is offered when finding a library', () => {
  for (const guide of seoLibraries) {
    const entry = getLibraryById(guide.id);
    assert.ok(entry, guide.id);
    assert.ok(getListedLibraries().includes(entry), guide.id);
  }
});

test('libraries outside India are not affected by the allowlist', () => {
  const abroad = getAllLibraries().filter((entry) => entry.country !== 'IN');
  const listed = new Set(getListedLibraries());
  assert.ok(abroad.length > 0);
  for (const entry of abroad) assert.ok(listed.has(entry), entry.id);
  assert.equal(getListedLibraries().length, abroad.length + LISTED_COUNT);
});

test('unlisted Indian libraries never appear in search, browse or near-me results', () => {
  const discovery = createDiscoveryService();
  const full = createDiscoveryService({ entries: getAllLibraries });
  const directory = createPublicDirectoryService();
  const unlisted = new Set(unlistedEntries.map((entry) => entry.id));
  const noneUnlisted = (libraries, label) => assert.equal(libraries.filter((library) => unlisted.has(library.id)).length, 0, label);

  noneUnlisted(discovery.search({ limit: Infinity }).libraries, 'discovery');
  const areaCounts = discovery.areas({ country: 'IN' }).counts.countries.IN;
  assert.equal(areaCounts, discovery.search({ country: 'IN' }).total);
  assert.equal(areaCounts, LISTED_COUNT);
  assert.ok(full.areas({ country: 'IN' }).counts.countries.IN > areaCounts);

  // Browse every region that holds an unlisted library.
  for (const region of new Set(unlistedEntries.map((entry) => entry.region).filter(Boolean))) {
    noneUnlisted(directory.browse({ country: 'IN', region, offset: 0, limit: Infinity }).libraries, `browse ${region}`);
    noneUnlisted(getLibrariesByRegion('IN', region), `region ${region}`);
    noneUnlisted(discovery.search({ country: 'IN', region, limit: Infinity }).libraries, `discover ${region}`);
  }

  // Search by name: an unlisted library never matches, though the full directory would find it.
  // (Three Indian entries have no finder record at all, listed or not.)
  const inFinder = new Set(full.search({ country: 'IN', limit: Infinity }).libraries.map((library) => library.id));
  const samples = unlistedPlatforms.flatMap((platform) => {
    const ofPlatform = unlistedEntries.filter((entry) => entry.platform === platform && inFinder.has(entry.id));
    return ofPlatform.filter((_, index) => index % Math.ceil(ofPlatform.length / 5) === 0);
  });
  for (const entry of samples) {
    assert.ok(full.search({ query: entry.name, limit: Infinity }).libraries.some((library) => library.id === entry.id), entry.id);
    noneUnlisted(discovery.search({ query: entry.name, limit: Infinity }).libraries, `discover ${entry.id}`);
    noneUnlisted(directory.search(entry.name, 50), `search ${entry.id}`);
    noneUnlisted(searchLibraries(entry.name, 50), `legacy ${entry.id}`);
  }

  // Near me at the localities of unlisted libraries.
  const places = [...new Map(unlistedEntries.map(indiaLibraryPlace).filter(Boolean).map((place) => [place.id, place])).values()].slice(0, 40);
  assert.ok(places.length > 0);
  for (const place of places) {
    noneUnlisted(discovery.search({ lat: place.lat, lon: place.lon, limit: Infinity }).libraries, `near ${place.id}`);
    noneUnlisted(discovery.search({ placeId: place.id, limit: Infinity }).libraries, `place ${place.id}`);
    noneUnlisted(nearbyLibraries(place.lat, place.lon, 50), `legacy near ${place.id}`);
  }
  assert.ok(places.some((place) => full.search({ placeId: place.id, limit: Infinity }).libraries.some((library) => unlisted.has(library.id))));
});

test('unlisted library IDs and their selection links still resolve, for every platform', async () => {
  const directory = createPublicDirectoryService();
  for (const entry of unlistedEntries) assert.equal(directory.resolve(entry.id)?.id, entry.id);
  const app = makeTestApp((target) => target.use('/api/v2', createPublicV2Router({ rateLimit: { limit: 100 } })));
  for (const platform of unlistedPlatforms) {
    const entry = unlistedEntries.find((candidate) => candidate.platform === platform);
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
