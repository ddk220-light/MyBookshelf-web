import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { getAllLibraries } from '../services/directory.js';
import { makeTestApp } from '../test/helpers.js';
import { createPublicDirectoryService } from './directory.js';
import { createLibraryLinkIndex, libraryLinks, libraryNameSlug } from './libraryLinks.js';
import { parseLibrarySelection } from './validation.js';
import { createPublicV2Router } from './router.js';
import { createRedactedTelemetrySink } from './telemetry.js';

test('every directory library has a unique, valid link resolving to the same public library', () => {
  const directory = createPublicDirectoryService();
  const paths = new Set();
  for (const entry of getAllLibraries()) {
    const path = libraryLinks.pathFor(entry.id);
    assert.ok(path?.startsWith('/select/'), entry.id);
    assert.ok(!paths.has(path), path);
    paths.add(path);
    const { slug } = parseLibrarySelection({ slug: decodeURIComponent(path.slice('/select/'.length)) });
    assert.deepEqual(directory.resolveSelection(slug), directory.resolve(entry.id), path);
  }
  assert.equal(paths.size, getAllLibraries().length);
});

test('pilot libraries and IIT Madras have readable name-only URLs', () => {
  for (const [id, slug] of [
    ['koha:anna-centenary-library', 'anna-centenary-library'],
    ['koha:kalaignar-centenary-library', 'kalaignar-centenary-library'],
    ['koha:ernakulam-public-library', 'ernakulam-public-library'],
    ['vpl:visakhapatnam-public-library', 'visakhapatnam-public-library'],
    ['chamo:iit-madras', 'indian-institute-of-technology-madras'],
  ]) assert.equal(libraryLinks.pathFor(id), `/select/${slug}`);
});

test('duplicate names, including identical towns, have stable distinct links without guessing', () => {
  const entries = [
    { id: 'catalog:one', name: 'Carmel College Library', city: 'Mala' },
    { id: 'catalog:two', name: 'Carmel College Library', city: 'Mala' },
    { id: 'catalog:three', name: 'Carmel College Library', city: 'Goa' },
  ];
  const index = createLibraryLinkIndex(entries), reversed = createLibraryLinkIndex([...entries].reverse());
  assert.equal(index.resolve('carmel-college-library'), null);
  assert.equal(new Set(entries.map(e => index.pathFor(e.id))).size, 3);
  for (const entry of entries) {
    assert.equal(index.pathFor(entry.id), reversed.pathFor(entry.id));
    assert.equal(index.resolve(decodeURIComponent(index.pathFor(entry.id).slice(8))), entry.id);
  }
});

test('names preserve native scripts and normalize punctuation and Latin accents', () => {
  assert.equal(libraryNameSlug('Bibliothèque St. John’s (Central)'), 'bibliotheque-st-john-s-central');
  assert.equal(libraryNameSlug('தமிழ் நூலகம்'), 'தமிழ்-நூலகம்');
  const index = createLibraryLinkIndex([{ id: 'catalog:tamil', name: 'தமிழ் நூலகம்' }]);
  assert.equal(index.resolve(parseLibrarySelection({ slug: decodeURIComponent(index.pathFor('catalog:tamil').slice(8)) }).slug), 'catalog:tamil');
  assert.equal(parseLibrarySelection({ slug: 'ANNA-CENTENARY-LIBRARY' }).slug, 'anna-centenary-library');
});

test('unknown, ambiguous and excluded libraries cannot be selected through a link', () => {
  const directory = createPublicDirectoryService();
  for (const slug of ['unknown-library', 'carmel-college-library', 'kerala-state-central-library', 'state-central-library-kerala', 'tirunelveli-district-central-library']) {
    assert.equal(directory.resolveSelection(slug), null, slug);
  }
});

test('link resolution is anonymous, bounded and does not log raw names', async () => {
  const telemetry = createRedactedTelemetrySink();
  const app = makeTestApp(target => target.use('/api/v2', createPublicV2Router({ telemetry })));
  const response = await request(app).post('/api/v2/libraries/resolve-link')
    .set('Cookie', 'mb_session=old-session').send({ slug: 'anna-centenary-library' });
  assert.equal(response.status, 200);
  assert.equal(response.body.library.id, 'koha:anna-centenary-library');
  assert.equal(response.body.library.selectionPath, '/select/anna-centenary-library');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.body.library.baseUrl, undefined);
  const missing = await request(app).post('/api/v2/libraries/resolve-link').send({ slug: 'missing-library' });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'LIBRARY_NOT_FOUND');
  for (const slug of ['', '../anna-centenary-library', 'https://example.com', 'a'.repeat(401), ['anna'], null]) {
    assert.equal((await request(app).post('/api/v2/libraries/resolve-link').send({ slug })).status, 400);
  }
  assert.ok(telemetry.events().every(event => event.operation === 'directory_resolve'));
  assert.equal(JSON.stringify(telemetry.events()).includes('anna'), false);
});
