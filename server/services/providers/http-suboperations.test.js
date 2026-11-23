import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { catalogOperation, clearHttpCache, getText, withCatalogOperation, withCatalogSuboperation } from './http.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const reply = (url, status = 200) => ({ ok: status < 400, status, url, headers: new Headers(), text: async () => 'public catalog' });
const read = path => getText(`https://routes.example.invalid/${path}`, { retries: 0 });
const cancelled = () => Object.assign(new Error('Request cancelled'), { name: 'AbortError' });

test('ordinary nesting keeps the outer budget while explicit suboperations add a local cap', async () => {
  let sent = 0;
  global.fetch = async url => { sent++; return reply(url); };
  await withCatalogOperation({ maxRequests: 3 }, async outer => {
    await withCatalogOperation({ maxRequests: 0 }, async nested => {
      assert.equal(nested, outer);
      await read('ordinary');
    });
    await withCatalogSuboperation({ maxRequests: 1 }, async child => {
      await read('route');
      await assert.rejects(read('over-route-cap'), { code: 'CATALOG_REQUEST_BUDGET' });
      assert.equal(child.requests, 1);
    });
    assert.equal(outer.requests, 2);
    await read('remaining-outer-budget');
    await assert.rejects(read('over-outer-cap'), { code: 'CATALOG_REQUEST_BUDGET' });
    assert.equal(outer.requests, 3);
  });
  assert.equal(sent, 3);
});

test('parallel route scopes cannot race past their shared outer request cap', async () => {
  let sent = 0, entered = 0, open;
  const barrier = new Promise(resolve => { open = resolve; });
  const gate = async () => { if (++entered === 6) open(); await barrier; };
  global.fetch = async url => { sent++; return reply(url); };
  await withCatalogOperation({ maxRequests: 3, gate }, async outer => {
    const children = [];
    const run = prefix => withCatalogSuboperation({ maxRequests: 2 }, async child => {
      children.push(child);
      return Promise.allSettled([0, 1, 2].map(i => read(`${prefix}-${i}`)));
    });
    const results = (await Promise.all([run('a'), run('b')])).flat();
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
    assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'CATALOG_REQUEST_BUDGET'));
    assert.equal(outer.requests, 3);
    assert.equal(children.reduce((sum, child) => sum + child.requests, 0), 3);
    assert.ok(children.every(child => child.requests <= 2));
  });
  assert.equal(sent, 3);
});

test('every ancestor cap is enforced without charging a sibling for another route', async () => {
  global.fetch = async url => reply(url);
  await withCatalogOperation({ maxRequests: 4 }, async outer => {
    await withCatalogSuboperation({ maxRequests: 2 }, async child => {
      await withCatalogSuboperation({ maxRequests: 4 }, async grandchild => {
        await read('first');
        await read('second');
        await assert.rejects(read('child-exhausted'), { code: 'CATALOG_REQUEST_BUDGET' });
        assert.equal(grandchild.requests, 2);
      });
      assert.equal(child.requests, 2);
    });
    await withCatalogSuboperation({ maxRequests: 2 }, async sibling => {
      await read('third');
      await read('fourth');
      assert.equal(sibling.requests, 2);
    });
    assert.equal(outer.requests, 4);
  });
});

test('cancelling a route aborts its request and leaves a sibling fallback usable', async () => {
  const parent = new AbortController(), route = new AbortController();
  let started, sent = 0, requestSignal;
  const ready = new Promise(resolve => { started = resolve; });
  global.fetch = async (url, options) => {
    sent++;
    if (!url.endsWith('/slow')) return reply(url);
    requestSignal = options.signal;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(cancelled()), { once: true });
      started();
    });
  };
  await withCatalogOperation({ maxRequests: 3, signal: parent.signal }, async outer => {
    const work = withCatalogSuboperation({ maxRequests: 2, signal: route.signal }, () => read('slow'));
    await ready;
    route.abort();
    await assert.rejects(work, { name: 'AbortError' });
    assert.equal(requestSignal.aborted, true);
    assert.equal(parent.signal.aborted, false);
    await withCatalogSuboperation({ maxRequests: 1 }, () => read('fallback'));
    assert.equal(outer.requests, 2);
  });
  assert.equal(sent, 2);
});

test('parent cancellation reaches an active child and prevents a new child request', async () => {
  const parent = new AbortController(), route = new AbortController();
  let started, sent = 0, requestSignal;
  const ready = new Promise(resolve => { started = resolve; });
  global.fetch = async (url, options) => {
    sent++;
    requestSignal = options.signal;
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(cancelled()), { once: true });
      started();
    });
  };
  await withCatalogOperation({ maxRequests: 3, signal: parent.signal }, async outer => {
    const work = withCatalogSuboperation({ signal: route.signal }, () => read('slow'));
    await ready;
    parent.abort();
    await assert.rejects(work, { name: 'AbortError' });
    assert.equal(requestSignal.aborted, true);
    assert.equal(route.signal.aborted, false);
    await assert.rejects(withCatalogSuboperation({}, () => read('after-cancellation')), { code: 'CATALOG_ABORTED' });
    assert.equal(outer.requests, 1);
  });
  assert.equal(sent, 1);
});

test('a cancelled child cannot send a request after waiting in the shared HTTP queue', async () => {
  const queuedRoute = new AbortController();
  let started, finish;
  const ready = new Promise(resolve => { started = resolve; });
  const sent = [];
  global.fetch = async url => {
    sent.push(url);
    if (!url.endsWith('/first')) return reply(url);
    return new Promise(resolve => { finish = () => resolve(reply(url)); started(); });
  };
  await withCatalogOperation({ maxRequests: 3 }, async outer => {
    const first = withCatalogSuboperation({}, () => read('first'));
    await ready;
    const queued = withCatalogSuboperation({ signal: queuedRoute.signal }, () => read('queued'));
    await new Promise(resolve => setImmediate(resolve));
    queuedRoute.abort();
    finish();
    await first;
    await assert.rejects(queued, { code: 'CATALOG_ABORTED' });
    assert.equal(outer.requests, 2, 'scheduled requests remain charged even when cancelled in the queue');
    await withCatalogSuboperation({}, () => read('fallback'));
  });
  assert.deepEqual(sent, ['https://routes.example.invalid/first', 'https://routes.example.invalid/fallback']);
});

test('suboperations intersect robots policies and inherit stricter spacing and retry restrictions', async () => {
  let sent = 0, parentGates = 0;
  const reservations = [];
  global.fetch = async url => { sent++; return reply(url, 500); };
  await withCatalogOperation({ maxRequests: 4, minIntervalMs: 25, noRetries: true,
    robots: async url => ({ allowed: !url.endsWith('/blocked'), delayMs: 10 }),
    gate: async () => { parentGates++; },
  }, async () => {
    await withCatalogSuboperation({ minIntervalMs: 1, noRetries: false,
      robots: async () => ({ allowed: true, delayMs: 30 }),
      gate: async (host, options) => { reservations.push({ host, ...options }); },
    }, async child => {
      assert.equal(catalogOperation(), child);
      await getText('https://routes.example.invalid/allowed', { retries: 2 });
      await assert.rejects(read('blocked'), { code: 'CATALOG_PROVIDER_BLOCKED' });
      assert.equal(child.requests, 1);
    });
    await withCatalogSuboperation({}, () => read('inherited-gate'));
  });
  assert.equal(sent, 2);
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].spacingMs, 30);
  assert.equal(parentGates, 1, 'a replacement gate must not reserve a second host slot');
});

test('pacing history survives switching between sibling routes on the same host', async () => {
  const sentAt = [];
  global.fetch = async url => { sentAt.push(Date.now()); return reply(url); };
  await withCatalogOperation({ maxRequests: 2, minIntervalMs: 50 }, async () => {
    await withCatalogSuboperation({}, () => read('route-one'));
    await withCatalogSuboperation({ minIntervalMs: 0 }, () => read('route-two'));
  });
  assert.equal(sentAt.length, 2);
  assert.ok(sentAt[1] - sentAt[0] >= 40, `Sibling request gap was ${sentAt[1] - sentAt[0]}ms`);
});

test('a standalone suboperation keeps ordinary operation behavior', async () => {
  let sent = 0;
  global.fetch = async url => { sent++; return reply(url); };
  await withCatalogSuboperation({ maxRequests: 1 }, async scope => {
    await read('standalone');
    await assert.rejects(read('exhausted'), { code: 'CATALOG_REQUEST_BUDGET' });
    assert.equal(scope.requests, 1);
  });
  assert.equal(sent, 1);
});

test('a book check caps each request (requestTimeoutMs) and carries its deadline to nested scopes', async () => {
  global.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(cancelled()), { once: true });
  });
  const started = Date.now();
  await withCatalogOperation({ requestTimeoutMs: 40, deadlineAt: started + 5_000 }, async outer => {
    // The adapter allows 30 s; the check's per-request cap ends it after 40 ms.
    await assert.rejects(getText('https://slow.example.invalid/a', { retries: 0, timeoutMs: 30_000 }), { name: 'AbortError' });
    assert.ok(Date.now() - started < 1_000);
    await withCatalogSuboperation({ deadlineAt: started + 9_000, requestTimeoutMs: 60_000 }, async child => {
      // The tighter of the two applies to both.
      assert.equal(child.deadlineAt, started + 5_000);
      assert.equal(child.requestTimeoutMs, 40);
    });
    assert.equal(outer.deadlineAt, started + 5_000);
  });
});

// 20 November 2026: a host lane runs one request at a time unless the
// operation allows more (`hostRequests`, a reader's check on a catalog with
// plain GET searches); first come, first served either way.
test('a host lane runs one task at a time by default and up to the task\'s own limit when it allows more', async () => {
  const { enqueueTask } = await import('./http.js');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const run = async (lane, concurrency) => {
    let active = 0, peak = 0;
    const order = [];
    await Promise.all([1, 2, 3, 4].map(n => enqueueTask(lane, async () => {
      active++; peak = Math.max(peak, active); order.push(n);
      await sleep(10);
      active--;
    }, { concurrency })));
    return { peak, order };
  };
  const single = await run('lane:single');
  assert.equal(single.peak, 1);
  assert.deepEqual(single.order, [1, 2, 3, 4]);
  const pair = await run('lane:pair', 2);
  assert.equal(pair.peak, 2);
  assert.deepEqual(pair.order, [1, 2, 3, 4]);
  // A task past its deadline while waiting is refused without running.
  let ran = false;
  const first = enqueueTask('lane:late', () => sleep(30));
  await assert.rejects(enqueueTask('lane:late', async () => { ran = true; }, { deadlineAt: Date.now() + 5 }));
  await first;
  await sleep(5);
  assert.equal(ran, false);
});
