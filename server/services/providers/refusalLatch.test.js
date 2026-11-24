import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRefusalLatch, REFUSAL_LATCH_MS } from './refusalLatch.js';
import { checkAvailability as evergreenCheck, clearEvergreenRefusals, librarySearch as evergreenSearch } from './evergreen.js';
import { checkAvailability as egranthalayaCheck, clearEgranthalayaRefusals } from './egranthalaya.js';
import { clearIndcatRefusals, librarySearch as indcatSearch } from './indcat.js';
import { clearHttpCache } from './http.js';

const originalFetch = global.fetch;
const reply = (body, url, status) => { const value = new Response(body, { status }); Object.defineProperty(value, 'url', { value: String(url) }); return value; };
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); clearEvergreenRefusals(); clearEgranthalayaRefusals(); clearIndcatRefusals(); });

test('a refusal latch lasts 15 minutes, then the key is asked again', () => {
  let at = 1_000_000;
  const latch = createRefusalLatch({ now: () => at });
  assert.equal(REFUSAL_LATCH_MS, 15 * 60 * 1000);
  assert.equal(latch.has('https://gapines.org'), false);
  latch.add('https://gapines.org');
  assert.equal(latch.has('https://gapines.org'), true);
  assert.equal(latch.has('https://other.example.org'), false);
  at += REFUSAL_LATCH_MS - 1;
  assert.equal(latch.has('https://gapines.org'), true);
  at += 1;
  assert.equal(latch.has('https://gapines.org'), false, 'expired');
  // A second refusal latches it again, from then.
  latch.add('https://gapines.org');
  at += REFUSAL_LATCH_MS / 2;
  assert.equal(latch.has('https://gapines.org'), true);
  latch.clear();
  assert.equal(latch.has('https://gapines.org'), false);
});

// Each adapter that latches a refusal: one refused request, the host is left
// alone while the latch lasts, and after 15 minutes the next check asks once.
async function expires(t, { refuse, answer, check, label }) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-24T06:00:00Z') });
  let calls = 0;
  global.fetch = async (url, options) => { calls += 1; return refuse(url, options); };
  await assert.rejects(check(), { code: 'CATALOG_PROVIDER_BLOCKED' }, label);
  const refused = calls;
  assert.ok(refused >= 1, label);
  await assert.rejects(check(), { code: 'CATALOG_PROVIDER_BLOCKED' }, label);
  t.mock.timers.tick(REFUSAL_LATCH_MS - 1000);
  await assert.rejects(check(), { code: 'CATALOG_PROVIDER_BLOCKED' }, label);
  assert.equal(calls, refused, `${label}: no request while latched`);
  t.mock.timers.tick(1000);
  global.fetch = async (url, options) => { calls += 1; return answer(url, options); };
  clearHttpCache();
  await check();
  assert.ok(calls > refused, `${label}: asked again after the latch ended`);
}

test('Georgia PINES (Evergreen): a 429 pauses gapines.org for 15 minutes, for every system, then it is asked again', async t => {
  const system = { id: 'evergreen:athens-regional-ga', platform: 'evergreen', baseUrl: 'https://gapines.org', evergreenOrgId: 6, evergreenSite: 'ARL' };
  const empty = { status: 200, payload: [{ count: 0, ids: [], global_summary: { total: 0, canonicalized_query: 'badge_orgs(6,1) site(ARL) (keyword: qzxvbn)' } }] };
  await expires(t, {
    label: 'evergreen',
    refuse: () => new Response('rate limited', { status: 429 }),
    answer: () => new Response(JSON.stringify(empty), { status: 200 }),
    check: () => evergreenSearch(system, 'Qzxvbn'),
  });
  // The exact-edition check shares the same latch.
  global.fetch = async () => new Response('rate limited', { status: 429 });
  await assert.rejects(evergreenSearch(system, 'Lessons in Chemistry'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  let calls = 0;
  global.fetch = async () => { calls += 1; return new Response('{}'); };
  await assert.rejects(evergreenCheck(system, '9780385547345'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  assert.equal(calls, 0);
});

test('e-Granthalaya: a 403 pauses eg4.nic.in for 15 minutes, then it is asked again', async t => {
  const library = { id: 'egranthalaya:publiclibraries-hkmslib', platform: 'egranthalaya', name: 'Harekrushna Mahtab State Library', baseUrl: 'https://eg4.nic.in',
    egranthalayaCluster: 'PUBLICLIBRARIES', egranthalayaLibraryCode: 'HKMSLIB' };
  let asked = false;
  await expires(t, {
    label: 'egranthalaya',
    refuse: (url) => reply('blocked', url, 403),
    answer: (url) => { asked = true; return reply('unavailable', url, 503); },
    check: () => egranthalayaCheck(library, '9780140328721').catch(error => { if (!asked) throw error; }),
  });
  assert.equal(asked, true);
});

test('IndCat: a 401 pauses IndCat for 15 minutes, then it is asked again', async t => {
  const library = { id: 'indcat:andh', platform: 'indcat', name: 'Andhra University', baseUrl: 'https://indcat.inflibnet.ac.in', indcatInstitutionCode: 'ANDH_530003' };
  let asked = false;
  await expires(t, {
    label: 'indcat',
    refuse: (url) => reply('no', url, 401),
    answer: (url) => { asked = true; return reply('unavailable', url, 503); },
    check: () => indcatSearch(library, 'Wings of Fire').catch(error => { if (!asked) throw error; }),
  });
  assert.equal(asked, true);
});
