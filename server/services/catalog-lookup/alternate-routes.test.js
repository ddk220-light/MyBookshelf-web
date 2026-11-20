import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogLookup, createHostGuard } from './index.js';
import { providerWithAlternates } from '../providers/index.js';
import { catalogOperation, clearHttpCache, getText } from '../providers/http.js';
import { createCatalogBookKey } from '../../public-v2/contracts.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const isbn = '9788173711466';
const code = value => Object.assign(new Error(value), { code: value });
const positive = { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true };
const negative = { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
const observation = { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true };
const profile = { book: { title: 'Book', authors: ['Author'], isbn13: isbn }, titles: ['Book'], authors: ['Author'], isbns: [isbn], complete: true };
const table = {
  indcat: { book: { maxRequests: 8, deadlineMs: 500 }, results: { strategy: 'search_rows', maxRequests: 4, deadlineMs: 500 }, hostConcurrency: 2, minIntervalMs: 0, perMinute: 30 },
  'discovery-academic': { book: { maxRequests: 6, deadlineMs: 500 }, results: { strategy: 'search_rows', maxRequests: 3, deadlineMs: 500 }, hostConcurrency: 1, minIntervalMs: 0, perMinute: 10 },
};
function harness(forRoute, { platforms = table } = {}) {
  const alternate = { id: 'indcat:routed', platform: 'discovery-academic', catalogUrl: 'https://academic.example.test/',
    sourceConnectionId: 'academic:one', preferForLookup: true, capabilities: ['availability'] };
  const entry = { id: 'indcat:routed', platform: 'indcat', catalogUrl: 'https://indcat.inflibnet.ac.in/',
    capabilities: ['availability'], alternateCatalogs: [alternate] };
  const requests = [], slots = [], acquired = [], failures = [], recorded = [];
  global.fetch = async url => { requests.push(String(url)); return new Response('ok'); };
  const provider = providerWithAlternates(entry, forRoute);
  const baseGuard = createHostGuard();
  const guard = { ...baseGuard, acquire: async (host, limit, options) => {
    acquired.push({ host, limit }); return baseGuard.acquire(host, limit, options);
  }, recordFailure: host => { failures.push(host); baseGuard.recordFailure(host); } };
  const lookup = createCatalogLookup({ providerFor: () => provider, platforms, robots: null, guard,
    hostGate: { reserve: async (host, options) => { slots.push({ host, ...options }); await new Promise(resolve => setImmediate(resolve)); } },
    recorder: { readAnswers: async () => [], record: value => recorded.push(value) } });
  const recordId = provider.catalogRoutes.find(route => route.entry === alternate).prefix + '7';
  const ownBook = { bookKey: createCatalogBookKey(entry.id, recordId), recordId, recordLibraryId: entry.id, title: 'Book', authors: ['Author'] };
  const check = (extra = {}) => lookup.lookupBook({ library: entry, book: { bookKey: `v1:isbn:${isbn}`, isbn13: isbn, title: 'Book', authors: ['Author'] }, editionScope: 'exact', storedChecked: true, ...extra });
  return { entry, alternate, provider, lookup, guard, check, ownBook, recordId, requests, slots, acquired, failures, recorded };
}
const read = (route, path = 'search') => getText(new URL(path, route.catalogUrl).toString(), { retries: 0 });

test('an alternate-owned record keeps its institution key and uses its actual host policy', async () => {
  const h = harness(route => ({ checkAvailability: async () => positive, resolveCatalogRecord: async id => {
    assert.equal(route.platform, 'discovery-academic'); await read(route);
    return { recordId: id, title: 'Book', observation: { ...observation, catalogUrl: new URL('record/7', route.catalogUrl).href } };
  } }));
  const answer = await h.check({ book: h.ownBook, editionScope: 'work' });
  assert.equal(answer.outcome, 'found'); assert.equal(answer.recordId, h.recordId);
  assert.deepEqual(h.acquired, [{ host: 'academic.example.test', limit: 1 }]);
  assert.equal(h.slots[0].perMinute, 10);
  assert.equal(h.recorded[0].entry.id, h.entry.id);
  assert.equal(h.recorded[0].book.recordId, h.recordId);
  assert.equal(h.recorded[0].host, 'academic.example.test');
  assert.equal(h.recorded[0].platform, 'discovery-academic');
});

test('strict record observations resolved by an alternate are healthy catalog evidence', async () => {
  const strict = { outcome: 'available', matchKind: 'catalog_record', recognizedRecord: true, totalCopies: 1 };
  const h = harness(route => ({ checkAvailability: async () => positive,
    ...(route.platform === 'discovery-academic' ? { checkRecordAvailability: async () => strict } : {}),
    resolveCatalogRecord: async id => ({ recordId: id, title: 'Book', observation: strict }),
  }));
  const answer = await h.check({ book: h.ownBook, editionScope: 'work' });
  assert.equal(answer.outcome, 'found');
  assert.deepEqual(h.failures, []);
  assert.equal(h.recorded[0].host, 'academic.example.test');
});

test('a primary checker does not force its record-confidence shape onto an alternate resolver', async () => {
  const h = harness(route => ({ checkAvailability: async () => positive,
    ...(route.platform === 'indcat' ? { checkRecordAvailability: async () => { throw new Error('wrong catalog'); } } : {}),
    resolveCatalogRecord: async id => ({ recordId: id, title: 'Book', observation }),
  }));
  const answer = await h.check({ book: h.ownBook, editionScope: 'work' });
  assert.equal(answer.outcome, 'found');
  assert.deepEqual(h.failures, []);
});

test('academic failures cannot open the retained IndCat host circuit', async () => {
  const h = harness(route => ({ checkAvailability: async () => {
    await read(route);
    if (route.platform === 'discovery-academic') throw code('CATALOG_UNAVAILABLE');
    return negative;
  } }));
  for (let attempt = 0; attempt < 3; attempt++) assert.equal((await h.check()).reason, 'unavailable');
  assert.equal(h.guard.circuitOpen('academic.example.test'), true);
  assert.equal(h.guard.circuitOpen('indcat.inflibnet.ac.in'), false);
  assert.deepEqual(h.failures, Array(3).fill('academic.example.test'));
  assert.ok(h.recorded.every(item => item.host === 'academic.example.test'));
  assert.deepEqual([...new Set(h.slots.filter(slot => slot.host === 'academic.example.test').map(slot => slot.perMinute))], [10]);
  assert.deepEqual([...new Set(h.slots.filter(slot => slot.host === 'indcat.inflibnet.ac.in').map(slot => slot.perMinute))], [30]);
});

test('a failed preferred route still falls back to the primary without changing answer identity', async () => {
  const calls = [];
  const h = harness(route => ({ checkAvailability: async () => {
    calls.push(route.platform); await read(route);
    if (route.platform === 'discovery-academic') throw code('CATALOG_UNAVAILABLE');
    return positive;
  } }));
  const answer = await h.check();
  assert.equal(answer.outcome, 'found'); assert.equal(answer.evidence, 'exact_isbn');
  assert.deepEqual(calls, ['discovery-academic', 'indcat']);
  assert.equal(h.recorded[0].host, 'indcat.inflibnet.ac.in');
  assert.equal(h.recorded[0].entry.id, h.entry.id);
});

test('a reader’s check has no request cap on any route: a route that needs more requests than a descriptor’s old cap still answers', async () => {
  // A `book.maxRequests` left in a descriptor is ignored for a reader's check
  // (owner decision, 20 November 2026); every request still takes the host's slot.
  const platforms = { ...table, indcat: { ...table.indcat, book: { maxRequests: 4, deadlineMs: 500 } },
    'discovery-academic': { ...table['discovery-academic'], book: { maxRequests: 2, deadlineMs: 500 } } };
  const h = harness(route => ({ checkAvailability: async () => {
    for (let i = 0; i < 3; i++) await read(route, `read/${i}`);
    return positive;
  } }), { platforms });
  const answer = await h.check();
  assert.equal(answer.outcome, 'found');
  assert.equal(h.requests.filter(url => url.includes('academic.example.test')).length, 3);
  assert.equal(h.requests.filter(url => url.includes('indcat.inflibnet.ac.in')).length, 0);
  assert.equal(h.slots.length, 3);
  assert.deepEqual(h.failures, []);
});

test('an alternate deadline cancels that route before release and leaves time for primary fallback', async () => {
  const platforms = { ...table, 'discovery-academic': { ...table['discovery-academic'], book: { maxRequests: 6, deadlineMs: 15 } } };
  let routeSignal;
  const h = harness(route => ({ checkAvailability: async () => {
    if (route.platform === 'indcat') { assert.equal(routeSignal.aborted, true); await read(route); return positive; }
    routeSignal = catalogOperation().signal;
    return new Promise((resolve, reject) => routeSignal.addEventListener('abort', () => reject(code('CATALOG_ABORTED')), { once: true }));
  } }), { platforms });
  assert.equal((await h.check()).outcome, 'found');
  assert.equal(routeSignal.aborted, true);
  assert.equal(h.guard.activeCount('academic.example.test'), 0);
  assert.deepEqual(h.failures, ['academic.example.test']);
});

test('parallel methods cannot restart the route-wide deadline after waiting for its host', async () => {
  const platforms = { ...table, 'discovery-academic': { ...table['discovery-academic'], book: { maxRequests: 6, deadlineMs: 100 } } };
  let secondCancelled = false;
  const h = harness(route => ({
    searchIsbn: async () => {
      if (route.platform === 'discovery-academic') await new Promise(resolve => setTimeout(resolve, 60));
      return [];
    },
    searchTitle: async () => {
      if (route.platform === 'indcat') {
        assert.equal(secondCancelled, true);
        return [{ recordId: '8', title: 'Book', authors: ['Author'], isbn, observation: { ...observation, outcome: 'available' } }];
      }
      const signal = catalogOperation().signal;
      return new Promise((resolve, reject) => {
        const abort = () => { secondCancelled = true; clearTimeout(timer); reject(code('CATALOG_ABORTED')); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve([]); }, 60);
        signal.addEventListener('abort', abort, { once: true });
      });
    },
  }), { platforms });
  assert.equal((await h.check({ editionScope: 'work' })).outcome, 'found');
  assert.equal(secondCancelled, true);
});

test('metadata reads use a supplied record route and preserve opaque-callback compatibility', async () => {
  const platforms = { ...table, indcat: { ...table.indcat, book: { maxRequests: 1, deadlineMs: 500 } },
    'discovery-academic': { ...table['discovery-academic'], book: { maxRequests: 3, deadlineMs: 500 } } };
  const h = harness(route => ({ resolveCatalogRecord: async id => {
    await read(route, 'record/1'); await read(route, 'record/2'); return { recordId: id, title: 'Book', observation };
  } }), { platforms });
  const record = await h.lookup.readRecord({ library: h.entry, recordId: h.recordId, read: () => h.provider.resolveCatalogRecord(h.recordId) });
  assert.equal(record.recordId, h.recordId);
  assert.equal(h.slots.length, 2); assert.ok(h.slots.every(slot => slot.perMinute === 10));
  // A reader's record read has no request cap either (the old `maxRequests: 1`
  // is ignored); it keeps the route's host pacing.
  const again = await h.lookup.readRecord({ library: h.entry, read: () => h.provider.resolveCatalogRecord(h.recordId) });
  assert.equal(again.recordId, h.recordId);
  assert.ok(h.slots.length >= 3 && h.slots.every(slot => slot.perMinute === 10));
  assert.deepEqual(h.failures, []);
});

test('a successful preliminary search does not hide its later record-read failure', async () => {
  const h = harness(route => ({
    searchTitle: async () => route.platform === 'indcat' ? [] : [{ recordId: '7', title: 'Book', authors: ['Author'] }],
    readRecord: async () => { throw code('CATALOG_TIMEOUT'); },
  }));
  const answer = await h.check({ editionScope: 'work', bookKey: 'v1:openlibrary:OL1W', isbn13: undefined });
  assert.equal(answer.outcome, 'couldnt_check'); assert.equal(answer.reason, 'timeout');
  assert.deepEqual(h.failures, ['academic.example.test']);
  assert.equal(h.guard.circuitOpen('academic.example.test'), false, 'one reader cannot supply three circuit failures');
});

test('a found search row is attributed to its route despite a concurrent failing fallback', async () => {
  // The ISBN routes fail before the row arrives (a proven row ends the check
  // and cancels whatever is still in flight).
  const h = harness(route => ({
    searchIsbn: async () => { await new Promise(resolve => setImmediate(resolve)); throw code('CATALOG_UNAVAILABLE'); },
    searchTitle: async () => { await new Promise(resolve => setTimeout(resolve, 20));
      return route.platform === 'indcat' ? [] : [{ recordId: '7', title: 'Book', authors: ['Author'], isbn, observation }]; },
  }));
  const answer = await h.check({ editionScope: 'work' });
  assert.equal(answer.outcome, 'found');
  assert.equal(h.recorded[0].host, 'academic.example.test');
  assert.equal(h.recorded[0].platform, 'discovery-academic');
  assert.deepEqual(h.failures, ['indcat.inflibnet.ac.in']);
});

test('two positive routes are attributed to the actual winning catalog link', async () => {
  // The preferred route's ISBN answer proves the holding first. The check ends
  // at that first proven match (it no longer reads on for a copy marked
  // available), and the answer, its link and its attribution agree.
  const h = harness(route => ({
    searchIsbn: async () => [{ title: 'Book', isbn, observation: { ...positive, catalogUrl: new URL('record/1', route.catalogUrl).href, catalogLinkKind: 'record' } }],
    searchTitle: async () => {
      if (route.platform === 'discovery-academic') throw code('CATALOG_UNAVAILABLE');
      return [{ recordId: '8', title: 'Book', authors: ['Author'], isbn,
        observation: { ...observation, outcome: 'available', catalogUrl: new URL('record/2', route.catalogUrl).href } }];
    },
  }));
  const answer = await h.check({ editionScope: 'work' });
  assert.equal(answer.outcome, 'found');
  assert.equal(answer.catalogUrl, 'https://academic.example.test/record/1');
  assert.equal(h.recorded[0].host, 'academic.example.test');
  assert.equal(h.recorded[0].platform, 'discovery-academic');
  assert.deepEqual(h.failures, []);
});

test('result marking uses the actual route despite an unrelated primary circuit', async () => {
  const h = harness(route => ({ checkAvailability: async () => positive,
    searchCatalog: async () => { await read(route); return [{ recordId: '7', title: 'Book', authors: ['Author'], isbn, observation }]; },
  }));
  for (let i = 0; i < 3; i++) h.guard.recordFailure('indcat.inflibnet.ac.in');
  const marks = [];
  for await (const mark of h.lookup.markResults({ library: h.entry, query: 'Book',
    books: [{ bookKey: `v1:isbn:${isbn}`, isbn13: isbn, profile: Promise.resolve(profile) }] })) marks.push(mark);
  assert.equal(marks[0].outcome, 'found');
  assert.equal(h.slots[0].host, 'academic.example.test');
  assert.equal(h.slots[0].perMinute, 10);
  const health = h.recorded.find(item => item.writeAnswers === false);
  assert.equal(health.host, 'academic.example.test');
  assert.equal(health.platform, 'discovery-academic');
  const release = h.guard.tryStartMarking('academic.example.test');
  assert.equal(typeof release, 'function'); release();
});

// Only a live reader makes a reader-less check give way. A routed check whose
// reader has gone must not, on its next route, cancel itself (or another
// reader-less check) as if it were a waiting reader.
test('a reader-less routed check never makes itself give way on its next route', async () => {
  const fast = { indcat: { ...table.indcat, book: { maxRequests: 8, deadlineMs: 40 } },
    'discovery-academic': { ...table['discovery-academic'], book: { maxRequests: 6, deadlineMs: 40 } } };
  const alternate = { id: 'indcat:routed', platform: 'discovery-academic', catalogUrl: 'https://academic.example.test/',
    sourceConnectionId: 'academic:one', preferForLookup: true, capabilities: ['availability'] };
  const entry = { id: 'indcat:routed', platform: 'indcat', catalogUrl: 'https://indcat.inflibnet.ac.in/', capabilities: ['availability'], alternateCatalogs: [alternate] };
  let letAcademicAnswer;
  const academicAnswers = new Promise(resolve => { letAcademicAnswer = resolve; });
  const provider = providerWithAlternates(entry, route => ({ checkAvailability: async () => {
    if (route.platform === 'discovery-academic') { await academicAnswers; return negative; }
    return positive;
  } }));
  // Every slot looks taken, so any call to make a reader-less check give way would cancel it.
  const guard = { ...createHostGuard(), activeCount: () => 99 };
  const recorded = [], deferred = [];
  const lookup = createCatalogLookup({ providerFor: () => provider, platforms: fast, robots: null, guard,
    defer: task => { deferred.push(Promise.resolve().then(task)); },
    recorder: { readAnswers: async () => [], record: value => recorded.push(value) } });
  // The reader's answer is due before the first route's own 40 ms deadline,
  // so which timer fires first never depends on the machine's load.
  const answer = await lookup.lookupBook({ library: entry, book: { bookKey: `v1:isbn:${isbn}`, isbn13: isbn }, editionScope: 'exact',
    storedChecked: true, background: true, deadlineAt: Date.now() + 15 });
  assert.equal(answer.reason, 'timeout');
  // The reader has gone; the check runs on and reaches its second route.
  letAcademicAnswer();
  while (deferred.length) await Promise.all(deferred.splice(0));
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].answer.outcome, 'found', 'the check was not cancelled by itself');
});
