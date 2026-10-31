import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaceSearch } from './places.js';
import { parsePlaceSearch } from './validation.js';
const feature = (name, countrycode) => ({ properties: { name, countrycode, country: countrycode, osm_id: name }, geometry: { coordinates: [-123, 45] } });
test('country-scoped names use the right provider and isolate cached results', async () => {
  const urls = [];
  const search = createPlaceSearch({ fetcher: async url => { urls.push(url); return { ok: true, json: async () => ({ features: [feature('Salem', 'us'), feature('Salem', 'in')] }) }; } });
  assert.ok((await search({ query: 'Salem', country: 'IN' })).every(p => p.country === 'IN'));
  assert.equal(urls.length, 0);
  assert.deepEqual((await search({ query: 'Salem', country: 'US' })).map(p => p.country), ['US']);
  assert.equal(urls[0].searchParams.get('countrycode'), 'us');
  const global = await search({ query: 'Salem' });
  assert.ok(global.some(p => p.country === 'IN'));
  assert.ok(global.some(p => p.country === 'US'));
});
test('six-digit foreign postcodes reach the external fallback', async () => {
  let calls = 0;
  const search = createPlaceSearch({ fetcher: async () => { calls++; return { ok: true, json: async () => ({ features: [feature('Singapore 159906', 'sg')] }) }; } });
  assert.equal((await search({ query: '159906' }))[0].country, 'SG');
  assert.equal(calls, 1);
  assert.deepEqual(await search({ query: '159906', country: 'IN' }), []);
  assert.equal(calls, 1);
});
test('external geocoder failure never removes local India matches', async () => {
  const search = createPlaceSearch({ fetcher: async () => { throw new Error('offline'); } });
  assert.ok((await search({ query: 'Chennai' })).some(p => p.country === 'IN'));
  await assert.rejects(search({ query: 'London', country: 'GB' }), { code: 'PLACE_SEARCH_UNAVAILABLE' });
});
test('place country validation is additive and rejects malformed countries', () => {
  assert.deepEqual(parsePlaceSearch({ query: 'Salem', country: 'us' }), { query: 'Salem', country: 'US' });
  assert.deepEqual(parsePlaceSearch({ query: 'Salem' }), { query: 'Salem' });
  for (const country of ['USA', 123, [], '1!']) assert.throws(() => parsePlaceSearch({ query: 'Salem', country }));
});
