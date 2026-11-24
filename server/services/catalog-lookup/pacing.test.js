import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAllLibraries, pacingHostOf, sharedPacingHosts } from '../directory.js';
import { PLATFORMS, hostFor, platformFor } from './platforms.js';
import { createCatalogLookup, createHostGuard, createLookupRecorder, createMemoryAnswerStore, createMemoryHealthRecord } from './index.js';
import { createMemoryHostGate } from '../../catalog-store/hostGate.js';
import { request, clearHttpCache } from '../providers/http.js';
import { CHECK_LIMITS } from '../../catalog-store/checkBudget.js';

// Pacing at volume (pre-release review, 24 November 2026): hundreds of US
// libraries share a few catalog hosts. The tap budget is per library (20 live
// checks a minute each), so across a shared catalog's members it allows far
// more than one host should get; the host gate, counted by host name and
// shared by every member, is what holds the host to its platform's rate.

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });

const members = name => getAllLibraries().filter(entry => entry.country === 'US' && entry.sharedCatalog === name);

test('every member of each large shared catalog is paced as one host', () => {
  for (const [name, platform, least] of [
    ['SHARE (Illinois Heartland Library System)', 'polaris', 208],
    ['C/W MARS (Central/Western Massachusetts Automated Resource Sharing)', 'aspen', 159],
    ['Minuteman Library Network', 'aspen', 37],
    ['Monroe County Library System', 'tlc', 20],
    ['Georgia PINES', 'evergreen', 51],
  ]) {
    const list = members(name);
    assert.ok(list.length >= least, `${name}: ${list.length}`);
    assert.ok(list.every(entry => entry.platform === platform), name);
    const paced = new Set(list.map(entry => pacingHostOf(hostFor(entry))));
    assert.equal(paced.size, 1, `${name}: ${[...paced].join(', ')}`);
  }
  // The members on another name of the same catalog are paced as its main host.
  assert.deepEqual(Object.fromEntries(sharedPacingHosts()), {
    'cambridge.minlib.net': 'catalog.minlib.net',
    'warwicklibrary.oslri.net': 'catalog.oslri.net',
    'mybrary.aspendiscovery.org': 'carsoncity.aspendiscovery.org',
    'nvcoop.aspendiscovery.org': 'carsoncity.aspendiscovery.org',
  });
  // Nothing outside the US, and no single-host library, is paced as another.
  assert.ok(getAllLibraries().filter(entry => entry.country !== 'US').every(entry => pacingHostOf(hostFor(entry)) === hostFor(entry)));
  assert.equal(pacingHostOf('ls2pac.lapl.org'), 'ls2pac.lapl.org');
});

test('"Check all 10" on every SHARE member page at once: the shared host still gets at most its per-minute rate plus the burst', () => {
  // 208 pages, ten taps each, four PowerPAC requests per check, all asked in the same second, each with the book page's 45 s.
  const platform = platformFor({ platform: 'polaris' });
  const host = pacingHostOf('search.illinoisheartland.org');
  let clock = 0;
  const gate = createMemoryHostGate({ now: () => clock });
  const deadlineAt = 45_000;
  const pages = members('SHARE (Illinois Heartland Library System)').length;
  // The per-library tap budget lets every one of these checks through (10 taps a page, 20 a minute allowed).
  assert.ok(10 <= CHECK_LIMITS.perLibraryPerMinute);
  const slots = [];
  let busy = 0;
  for (let request = 0; request < pages * 10 * 4; request += 1) {
    try { slots.push(gate.reserveSlot(host, { perMinute: platform.perMinute, deadlineAt })); }
    catch (error) { assert.equal(error.code, 'CATALOG_HOST_BUSY'); busy += 1; }
  }
  const inFirstMinute = slots.filter(at => at < 60_000).length;
  assert.ok(inFirstMinute <= platform.perMinute + 4, `${inFirstMinute} requests in the first minute`);
  assert.ok(slots.every(at => at <= deadlineAt));
  assert.equal(slots.length + busy, pages * 40);
  // The rest are "busy" (couldn't check), never sent.
  assert.ok(busy > pages * 40 - 50);
  // Members on another host name of one catalog take from the same schedule.
  clock = 120_000;
  const before = gate.reserveSlot(pacingHostOf('catalog.minlib.net'), { perMinute: PLATFORMS.aspen.perMinute, deadlineAt: Infinity });
  const after = gate.reserveSlot(pacingHostOf('cambridge.minlib.net'), { perMinute: PLATFORMS.aspen.perMinute, deadlineAt: Infinity });
  assert.equal(pacingHostOf('cambridge.minlib.net'), 'catalog.minlib.net');
  assert.ok(after >= before);
});

test('a check on a member with its own host name takes its host slot and concurrency as the shared catalog\'s main host', async () => {
  const reserved = [];
  const hostGate = { reserve: async host => { reserved.push(host); } };
  const guard = createHostGuard();
  const acquired = [];
  const acquire = guard.acquire;
  const spy = Object.freeze({ ...guard, acquire: (host, ...rest) => { acquired.push(host); return acquire(host, ...rest); } });
  const recorder = createLookupRecorder({ answers: createMemoryAnswerStore(), health: createMemoryHealthRecord() });
  global.fetch = async url => new Response(`<html>${url}</html>`, { status: 200 });
  const provider = { search: async () => { await request('https://cambridge.minlib.net/Search/Results?lookfor=x', { retries: 0 }); return []; } };
  const lookup = createCatalogLookup({ providerFor: () => provider, recorder, guard: spy, hostGate, robots: null, env: { CATALOG_LOOKUP_V2: 'all' } });
  const entry = getAllLibraries().find(item => item.id === 'aspen:minuteman-cambridge-public-library-ma');
  assert.ok(entry, 'Cambridge (Minuteman) is in the directory');
  const answer = await lookup.lookupBook({ library: entry, book: { bookKey: 'v1:isbn:9780385547345', title: 'Lessons in Chemistry', authors: [] } });
  assert.equal(answer.outcome, 'not_found');
  assert.deepEqual(reserved, ['catalog.minlib.net']);
  assert.deepEqual(acquired, ['catalog.minlib.net']);
});
