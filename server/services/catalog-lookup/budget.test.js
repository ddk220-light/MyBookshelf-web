import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostGuard, CIRCUIT_OPEN_MS, CIRCUIT_WINDOW_MS } from './budget.js';
import { PLATFORMS, platformFor, hostFor, bookDeadlineMs, lookupV2Platforms, lookupV2Enabled } from './platforms.js';

test('three failures within ten minutes open a ten-minute circuit; a success closes it', () => {
  let clock = 0;
  const guard = createHostGuard({ now: () => clock });
  guard.recordFailure('eg4.nic.in');
  clock += CIRCUIT_WINDOW_MS; // the first failure has aged out
  guard.recordFailure('eg4.nic.in');
  guard.recordFailure('eg4.nic.in');
  assert.equal(guard.circuitOpen('eg4.nic.in'), false);
  guard.recordFailure('eg4.nic.in');
  assert.equal(guard.circuitOpen('eg4.nic.in'), true);
  assert.equal(guard.circuitOpen('other.example'), false);
  clock += CIRCUIT_OPEN_MS;
  assert.equal(guard.circuitOpen('eg4.nic.in'), false);
  for (let i = 0; i < 3; i++) guard.recordFailure('h');
  guard.recordSuccess('h');
  assert.equal(guard.circuitOpen('h'), false);
});

test('host concurrency waits for a slot until the deadline, and abort releases the wait', async () => {
  const guard = createHostGuard();
  const first = await guard.acquire('h', 1);
  const waiting = guard.acquire('h', 1, { deadlineAt: Date.now() + 1_000 });
  let granted = false;
  waiting.then(() => { granted = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(granted, false);
  first();
  const second = await waiting;
  assert.equal(guard.activeCount('h'), 1);
  await assert.rejects(guard.acquire('h', 1, { deadlineAt: Date.now() + 10 }), { code: 'CATALOG_TIMEOUT' });
  const controller = new AbortController();
  const aborted = guard.acquire('h', 1, { signal: controller.signal });
  controller.abort();
  await assert.rejects(aborted, { code: 'CATALOG_ABORTED' });
  second();
  second(); // releasing twice is harmless
  assert.equal(guard.activeCount('h'), 0);
});

test('only one result-marking run per host at a time', () => {
  const guard = createHostGuard();
  const done = guard.tryStartMarking('h');
  assert.ok(done);
  assert.equal(guard.tryStartMarking('h'), null);
  assert.ok(guard.tryStartMarking('other'));
  done();
  assert.ok(guard.tryStartMarking('h'));
});

test('every platform in the directory has a descriptor with bounded budgets', () => {
  for (const id of ['egranthalaya', 'libman', 'indcat', 'koha', 'bc', 'vufind', 'discovery-community', 'discovery-academic', 'calil', 'vega', 'evergreen', 'chamo', 'libsys', 'aspen', 'vpl']) {
    const platform = platformFor({ platform: id });
    assert.ok(platform, id);
    assert.ok(platform.book.maxRequests > 0 && platform.book.maxRequests <= 15, id);
    assert.ok(platform.book.deadlineMs > 0 && platform.book.deadlineMs <= 60_000, id);
    assert.ok(['search_rows', 'batch_isbn', 'per_isbn', 'none'].includes(platform.results.strategy), id);
    assert.ok(platform.results.deadlineMs <= 30_000, id);
    // "Few requests" means at most three for all nine results.
    if (Number.isInteger(platform.results.fewRequests)) assert.ok(platform.results.fewRequests <= 3, id);
  }
  assert.equal(platformFor({ platform: 'bibliocommons' }).id, 'bc');
  assert.equal(platformFor({ platform: 'catalog' }), null);
  assert.equal(Object.keys(PLATFORMS).length, 15);
});

test('shared hosts share one key; slow libraries keep their reviewed budget up to 45 s', () => {
  assert.equal(hostFor({ platform: 'egranthalaya', baseUrl: 'https://eg4.nic.in' }), 'eg4.nic.in');
  assert.equal(hostFor({ platform: 'bc', catalogUrl: 'https://aclibrary.bibliocommons.com' }), 'gateway.bibliocommons.com');
  assert.equal(hostFor({ platform: 'koha', baseUrl: 'http://118.185.210.241:8001' }), '118.185.210.241:8001');
  assert.equal(bookDeadlineMs({ platform: 'egranthalaya' }), 25_000);
  assert.equal(bookDeadlineMs({ platform: 'egranthalaya', publicCatalogTimeoutMs: 45_000 }), 45_000);
  assert.equal(bookDeadlineMs({ platform: 'koha', publicCatalogTimeoutMs: 60_000 }), 45_000);
  assert.equal(bookDeadlineMs({ platform: 'libman', publicCatalogTimeoutMs: 45_000 }), 20_000);
  assert.equal(bookDeadlineMs({ platform: 'vpl' }), 45_000);
});

test('CATALOG_LOOKUP_V2 takes a comma list of platforms or all; unset keeps the old path', () => {
  assert.deepEqual([...lookupV2Platforms({})], []);
  assert.deepEqual([...lookupV2Platforms({ CATALOG_LOOKUP_V2: 'koha, bibliocommons,unknown' })].sort(), ['bc', 'koha']);
  assert.equal(lookupV2Platforms({ CATALOG_LOOKUP_V2: 'all' }).size, 15);
  assert.equal(lookupV2Enabled({ platform: 'koha' }, { CATALOG_LOOKUP_V2: 'koha' }), true);
  assert.equal(lookupV2Enabled({ platform: 'egranthalaya' }, { CATALOG_LOOKUP_V2: 'koha' }), false);
  assert.equal(lookupV2Enabled({ platform: 'catalog' }, { CATALOG_LOOKUP_V2: 'all' }), false);
});
