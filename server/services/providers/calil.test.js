import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAvailability, parseCalilAvailability } from './calil.js';
import { clearHttpCache } from './http.js';

const isbn = '9784103534228';
const systemId = 'Tokyo_Setagaya';
const attribution = { label: 'Calil', url: 'https://calil.jp/' };
const library = { id: `calil:${systemId}`, platform: 'calil', slug: systemId };
const options = { isbn, systemId };
const originalFetch = global.fetch;
const capture = (name) => JSON.parse(fs.readFileSync(new URL(`../../../testdata/calil/${name}`, import.meta.url), 'utf8'));
const answer = (libkey, extra = {}) => ({
  continue: 0,
  books: { [isbn]: { [systemId]: { status: 'OK', libkey, ...extra } } },
});
const response = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

afterEach(() => {
  global.fetch = originalFetch;
  clearHttpCache();
});

test('recorded Calil holdings preserve exact-ISBN evidence, branch states, and attribution', () => {
  const result = parseCalilAvailability(capture('check-final-ok.json'), options);
  assert.equal(result.outcome, 'available');
  assert.equal(result.matchKind, 'exact_isbn');
  assert.equal(result.recognizedExact, true);
  assert.equal(result.locations.length, 18);
  assert.deepEqual(result.locations[0], { name: '中央図書館', status: 'available' });
  assert.deepEqual(result.attribution, attribution);
  assert.equal(result.catalogUrl, 'https://libweb.city.setagaya.tokyo.jp/bookdetail?ctg=1&num=4676468');
  assert.equal(Object.hasOwn(result, 'availableCopies'), false);
});

test('only a complete successful empty holdings answer confirms not found and retains attribution', () => {
  const absent = parseCalilAvailability(capture('check-not-held.json'), { isbn: '9780593135204', systemId });
  assert.deepEqual(absent, { outcome: 'not_found', matchKind: 'none', recognizedExact: true, attribution });
  assert.deepEqual(parseCalilAvailability(answer({}), options), absent);
  assert.deepEqual(parseCalilAvailability(answer({ '中央': '蔵書なし' }), options), absent);
  assert.equal(parseCalilAvailability(answer({ '中央': '貸出可' }, { status: 'Cache' }), options).outcome, 'available');
});

test('partial, missing, malformed, and failed envelopes never become not found', () => {
  const valid = answer({});
  const cases = [
    null, [], {}, { books: {} }, { continue: 0, books: [] },
    capture('check-first-running.json'),
    { ...valid, continue: 1 }, { ...valid, continue: '0' }, { ...valid, continue: false },
    { continue: 0, books: { '9780000000002': { [systemId]: { status: 'OK', libkey: {} } } } },
    { continue: 0, books: { [isbn]: { Osaka_Osaka: { status: 'OK', libkey: {} } } } },
    { continue: 0, books: { [isbn]: [] } },
    { continue: 0, books: { [isbn]: { [systemId]: [] } } },
    answer(undefined), answer(null), answer([]), answer(''),
    answer({}, { status: undefined }), answer({}, { status: 'Running' }),
    answer({ '中央': '貸出可' }, { status: 'Error' }), answer({}, { status: 'Unexpected' }),
    answer({ ' ': '貸出可' }), answer({ '中央': { status: '貸出可' } }),
  ];
  for (const payload of cases) assert.equal(parseCalilAvailability(payload, options), null, JSON.stringify(payload));
});

test('all unavailable branches confirm none available; uncertain lending states remain unknown', () => {
  assert.equal(parseCalilAvailability(answer({ '中央': '貸出中', '東': '館内のみ', '西': '準備中', '南': '予約中' }), options).outcome, 'none_available');
  for (const label of ['蔵書あり', '休館中', '行方不明', '']) {
    const result = parseCalilAvailability(answer({ '中央': label, '東': '貸出中' }), options);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.matchKind, 'exact_isbn');
    assert.deepEqual(result.attribution, attribution);
    assert.deepEqual(result.locations[0], { name: '中央', status: 'unknown' });
  }
  const mixed = parseCalilAvailability(answer({ '中央': '蔵書あり', '東': '貸出可', '西': '蔵書なし' }), options);
  assert.equal(mixed.outcome, 'available');
  assert.equal(mixed.locations.length, 2);
});

test('client polls a running response at the documented interval and reuses a completed lookup', async () => {
  const requests = [];
  global.fetch = async (url, config) => {
    requests.push({ url: new URL(url), config, at: Date.now() });
    return response(capture(requests.length === 1 ? 'check-first-running.json' : 'check-final-ok.json'));
  };
  const result = await checkAvailability(library, isbn, { appKey: 'test-only-key' });
  assert.equal(result.outcome, 'available');
  assert.equal(requests.length, 2);
  assert.ok(requests[1].at - requests[0].at >= 1990);
  assert.equal(requests[0].url.searchParams.get('systemid'), systemId);
  assert.equal(requests[1].url.searchParams.get('isbn'), null);
  assert.ok(requests[1].url.searchParams.get('session'));
  assert.equal(requests[0].config.redirect, 'manual');
  assert.match(requests[0].config.headers['User-Agent'], /^MyBookshelf\//);
  assert.equal(JSON.stringify(result).includes('test-only-key'), false);
  assert.deepEqual(await checkAvailability(library, isbn, { appKey: 'test-only-key' }), result);
  assert.equal(requests.length, 2);
});

test('client preserves completed unknown lending states and rejects missing polling sessions', async () => {
  global.fetch = async () => response(answer({ '中央': '蔵書あり' }));
  const result = await checkAvailability(library, isbn, { appKey: 'test-only-key' });
  assert.equal(result.outcome, 'unknown');
  assert.deepEqual(result.attribution, attribution);
  clearHttpCache();
  global.fetch = async () => response({ continue: 1, books: {} });
  await assert.rejects(checkAvailability(library, isbn, { appKey: 'test-only-key' }), { code: 'CATALOG_UNRECOGNIZED' });
});

test('client rejects unreadable answers, access blocks, and redirects without extra requests', async () => {
  for (const [body, status, code] of [
    [{ continue: 0, books: {} }, 200, 'CATALOG_UNRECOGNIZED'],
    ['not JSON', 200, 'CATALOG_UNRECOGNIZED'],
    ['blocked', 403, 'CATALOG_PROVIDER_BLOCKED'],
    ['limited', 429, 'CATALOG_PROVIDER_BLOCKED'],
    ['', 302, 'CATALOG_UNAVAILABLE'],
    ['', 503, 'CATALOG_UNAVAILABLE'],
  ]) {
    let requests = 0;
    global.fetch = async () => { requests += 1; return response(body, status); };
    await assert.rejects(checkAvailability(library, isbn, { appKey: 'test-only-key' }), { code });
    assert.equal(requests, 1);
    clearHttpCache();
  }
});

test('network and timeout errors cannot expose the app key or request URL', async () => {
  for (const timeout of [false, true]) {
    global.fetch = async (url) => {
      const error = new Error(`Failed request ${url}`);
      if (timeout) error.name = 'AbortError';
      throw error;
    };
    await assert.rejects(checkAvailability(library, isbn, { appKey: 'test-only-secret' }), (error) => {
      assert.equal(error.code, timeout ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE');
      assert.equal(error.message.includes('test-only-secret'), false);
      assert.equal(error.message.includes('appkey='), false);
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    });
  }
});

test('missing configuration or ISBN fails before sending any request', async () => {
  let requests = 0;
  global.fetch = async () => { requests += 1; return response(answer({})); };
  await assert.rejects(checkAvailability(library, isbn, { appKey: '' }), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  await assert.rejects(checkAvailability(library, null, { appKey: 'test-only-key' }), { code: 'CATALOG_EXACT_ISBN_REQUIRED' });
  await assert.rejects(checkAvailability({}, isbn, { appKey: 'test-only-key' }), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  assert.equal(requests, 0);
});
