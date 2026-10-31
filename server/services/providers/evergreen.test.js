import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAvailability, parseEvergreenSearch, parseEvergreenRecord, clearEvergreenRefusals } from './evergreen.js';
import { clearHttpCache, USER_AGENT } from './http.js';

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`../../test/fixtures/evergreen/${name}.json`, import.meta.url), 'utf8'));
const originalFetch = global.fetch;
const ISBN = '9780735219090';
const RECORD_ID = 6107812;
const pines = { id: 'evergreen:gapines', platform: 'evergreen', baseUrl: 'https://gapines.org', evergreenOrgId: 1 };

afterEach(() => {
  global.fetch = originalFetch;
  clearHttpCache();
  clearEvergreenRefusals();
});

function response(body, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

function record(overrides = {}, envelope = fixture('pines-record')) {
  const counts = envelope.payload[0].__p[16];
  Object.assign(counts.find((row) => row.org_unit === 1), overrides);
  return envelope;
}

function serve(search = fixture('pines-search'), records = [fixture('pines-record')]) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    return response(calls.length === 1 ? search : records[calls.length - 2]);
  };
  return calls;
}

test('PINES search fixture and scalar-ID Evergreen versions identify the same exact candidate', () => {
  assert.deepEqual(parseEvergreenSearch(fixture('pines-search')), { count: 1, recordIds: [RECORD_ID] });
  assert.deepEqual(parseEvergreenSearch({ status: 200, payload: [{ count: '1', ids: [RECORD_ID] }] }), { count: 1, recordIds: [RECORD_ID] });
});

test('incomplete pages, duplicate IDs, malformed envelopes, and API events never prove an ISBN miss', () => {
  for (const envelope of [
    { status: 200, payload: [{ count: 1, ids: [] }] },
    { status: 200, payload: [{ count: 2, ids: [RECORD_ID, RECORD_ID] }] },
    { status: 200, payload: [{ count: 0, ids: [], global_summary: { total: 3 } }] },
    { status: 200, payload: [{ count: 0, ids: [], global_summary: { total: 0, visible: 1 } }] },
    { status: 200, payload: [{ count: 0, ids: [], global_summary: null }] },
    { status: 200, payload: [{ ilsevent: 1, count: 0, ids: [] }] },
    { status: 200, payload: [] },
    { status: 500, payload: [{ count: 0, ids: [] }] },
  ]) assert.equal(parseEvergreenSearch(envelope), null);
});

test('member counts use the selected organization, never its parent consortium', () => {
  const envelope = fixture('pines-athens-record');
  assert.deepEqual(parseEvergreenRecord(envelope, { isbn: ISBN, recordId: RECORD_ID, orgId: 6 }), {
    recordId: RECORD_ID, availableCopies: 16, totalCopies: 17,
  });
  assert.equal(parseEvergreenRecord(envelope, { isbn: ISBN, recordId: RECORD_ID, orgId: 999 }), null);
  envelope.payload[0].__p[16].pop();
  assert.equal(parseEvergreenRecord(envelope, { isbn: ISBN, recordId: RECORD_ID, orgId: 6 }), null);
});

test('live PINES wrong-ISBN search hit is rejected despite available copies', () => {
  assert.deepEqual(parseEvergreenSearch(fixture('pines-mismatch-search')), { count: 1, recordIds: [307912] });
  assert.equal(parseEvergreenRecord(fixture('pines-mismatch-record'), { isbn: '9780000000002', recordId: 307912, orgId: 1 }), null);
});

test('record class, identity, duplicate organization, and invalid counts must fail closed', () => {
  const cases = [];
  const wrongClass = fixture('pines-record'); wrongClass.payload[0].__c = 'acp'; cases.push(wrongClass);
  const wrongId = fixture('pines-record'); wrongId.payload[0].__p[2] = 4; cases.push(wrongId);
  const duplicateOrg = fixture('pines-record'); duplicateOrg.payload[0].__p[16].push({ ...duplicateOrg.payload[0].__p[16][0] }); cases.push(duplicateOrg);
  cases.push(record({ count: -1 }), record({ available: null }), record({ available: 328 }), record({ transcendant: 't', count: 0, available: 0 }));
  for (const envelope of cases) assert.equal(parseEvergreenRecord(envelope, { isbn: ISBN, recordId: RECORD_ID, orgId: 1 }), null);
});

test('matching ISBN-10 and ISBN-13 metadata can prove the same edition', () => {
  const envelope = fixture('pines-record');
  envelope.payload[0].__p[5] = '0735219095 (hardcover)';
  assert.equal(parseEvergreenRecord(envelope, { isbn: ISBN, recordId: RECORD_ID, orgId: 1 }).totalCopies, 327);
});

test('successful lookup uses two anonymous bounded public reads and a scoped catalog link', async () => {
  const calls = serve();
  const result = await checkAvailability(pines, ISBN);
  assert.deepEqual(result, {
    outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true,
    totalCopies: 327, availableCopies: 303,
    catalogUrl: 'https://gapines.org/eg/opac/record/6107812?locg=1',
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ url }) => url.searchParams.get('method')), ['open-ils.search.biblio.isbn', 'open-ils.search.biblio.record.mods.retrieve']);
  assert.deepEqual(calls[0].url.searchParams.getAll('param').map(JSON.parse), [ISBN]);
  assert.deepEqual(calls[1].url.searchParams.getAll('param').map(JSON.parse), [1, RECORD_ID]);
  for (const { url, options } of calls) {
    assert.equal(url.origin, pines.baseUrl);
    assert.equal(url.pathname, '/osrf-gateway-v1');
    assert.equal(url.searchParams.get('service'), 'open-ils.search');
    assert.equal(options.headers['User-Agent'], USER_AGENT);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
  }
  assert.deepEqual(await checkAvailability(pines, ISBN), result);
  assert.equal(calls.length, 2, 'repeated human lookup reuses the short provider cache');
});

test('member lookup passes its organization into the API and does not reuse consortium counts', async () => {
  const calls = [];
  global.fetch = async (url) => {
    const request = new URL(url); calls.push(request);
    if (request.searchParams.get('method') === 'open-ils.search.biblio.isbn') return response(fixture('pines-search'));
    return response(request.searchParams.getAll('param')[0] === '6' ? fixture('pines-athens-record') : fixture('pines-record'));
  };
  assert.equal((await checkAvailability(pines, ISBN)).totalCopies, 327);
  const result = await checkAvailability({ ...pines, id: 'evergreen:gapines-arl', evergreenOrgId: 6 }, ISBN);
  assert.equal(result.totalCopies, 17);
  assert.equal(result.availableCopies, 16);
  assert.equal(result.catalogUrl, 'https://gapines.org/eg/opac/record/6107812?locg=6');
  assert.equal(calls.length, 4);
});

test('recognized complete empty ISBN search can prove not_found', async () => {
  const calls = serve({ status: 200, payload: [{ count: 0, ids: [] }] });
  assert.deepEqual(await checkAvailability(pines, ISBN), { outcome: 'not_found', matchKind: 'none', recognizedExact: true });
  assert.equal(calls.length, 1);
});

test('an exact record with zero holdings remains unknown with a record link, never catalog absence', async () => {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    return response(new URL(url).searchParams.get('method') === 'open-ils.search.biblio.isbn'
      ? fixture('pines-search') : record({ count: 0, available: 0, unshadow: 0 }));
  };
  const expected = {
    outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true,
    catalogUrl: 'https://gapines.org/eg/opac/record/6107812?locg=1',
  };
  assert.deepEqual(await checkAvailability(pines, ISBN), expected);
  assert.equal(calls, 2);
  assert.deepEqual(await checkAvailability(pines, ISBN), expected);
  assert.equal(calls, 4, 'unknown availability must not be cached as a successful observation');
});

test('zero available copies on a held ISBN means none_available rather than not_found', async () => {
  serve(fixture('pines-search'), [record({ available: 0 })]);
  const result = await checkAvailability(pines, ISBN);
  assert.equal(result.outcome, 'none_available');
  assert.equal(result.totalCopies, 327);
  assert.equal(result.availableCopies, 0);
});

test('all duplicate ISBN records must be checked within the three-request budget', async () => {
  const second = fixture('pines-record');
  second.payload[0].__p[2] = 6107813;
  Object.assign(second.payload[0].__p[16][0], { count: 3, available: 2, unshadow: 3 });
  const calls = serve({ status: 200, payload: [{ count: 2, ids: [RECORD_ID, 6107813] }] }, [record({ count: 0, available: 0, unshadow: 0 }), second]);
  const result = await checkAvailability(pines, ISBN);
  assert.equal(result.outcome, 'available');
  assert.equal(result.totalCopies, 3);
  assert.equal(result.availableCopies, 2);
  assert.match(result.catalogUrl, /6107813/);
  assert.equal(calls.length, 3);
});

test('more than two records stops after search instead of using partial availability', async () => {
  const calls = serve({ status: 200, payload: [{ count: 3, ids: [1, 2, 3] }] });
  await assert.rejects(checkAvailability(pines, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
  assert.equal(calls.length, 1);
});

test('wrong ISBN and unreadable successful HTTP responses become errors, never availability facts', async () => {
  serve(fixture('pines-mismatch-search'), [fixture('pines-mismatch-record')]);
  await assert.rejects(checkAvailability(pines, '9780000000002'), { code: 'CATALOG_UNRECOGNIZED' });
  global.fetch = async () => response('<html>Service maintenance</html>');
  await assert.rejects(checkAvailability(pines, ISBN), { code: 'CATALOG_UNRECOGNIZED' });
});

for (const status of [401, 403, 429]) {
  test(`HTTP ${status} disables the origin with no retry, including future lookups`, async () => {
    let calls = 0;
    global.fetch = async () => { calls += 1; return response('Access refused', status); };
    await assert.rejects(checkAvailability(pines, ISBN), { code: 'CATALOG_PROVIDER_BLOCKED' });
    await assert.rejects(checkAvailability(pines, '9780593135204'), { code: 'CATALOG_PROVIDER_BLOCKED' });
    assert.equal(calls, 1);
  });
}

test('concurrent queued lookups stop after the first access refusal', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return response('Access refused', 429); };
  const results = await Promise.allSettled([checkAvailability(pines, ISBN), checkAvailability(pines, '9780593135204')]);
  assert.ok(results.every((result) => result.status === 'rejected' && result.reason.code === 'CATALOG_PROVIDER_BLOCKED'));
  assert.equal(calls, 1);
});

test('a gateway-level denial also disables an otherwise HTTP-200 origin', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return response({ status: 403, payload: [] }); };
  await assert.rejects(checkAvailability(pines, ISBN), { code: 'CATALOG_PROVIDER_BLOCKED' });
  await assert.rejects(checkAvailability(pines, ISBN), { code: 'CATALOG_PROVIDER_BLOCKED' });
  assert.equal(calls, 1);
});

test('timeouts, errors, and redirects do not become not_found or trigger automatic retries', async () => {
  for (const status of [302, 500, 503]) {
    let calls = 0;
    global.fetch = async () => { calls += 1; return response('Unavailable', status); };
    await assert.rejects(checkAvailability(pines, ISBN), { code: 'CATALOG_UNAVAILABLE' });
    assert.equal(calls, 1);
  }
  global.fetch = async () => { const error = new Error('The operation was aborted'); error.name = 'AbortError'; throw error; };
  await assert.rejects(checkAvailability(pines, ISBN), { name: 'AbortError' });
});

test('responses exceeding the provider byte limit are rejected', async () => {
  global.fetch = async () => response('x'.repeat(512 * 1024 + 1));
  await assert.rejects(checkAvailability(pines, ISBN), /response body too large/);
});

test('invalid ISBNs and unsafe or unscoped configurations cannot make a network request', async () => {
  global.fetch = async () => { assert.fail('invalid input must not fetch'); };
  await assert.rejects(checkAvailability(pines, 'books by Delia Owens'), { code: 'CATALOG_EXACT_ISBN_REQUIRED' });
  for (const library of [
    { ...pines, evergreenOrgId: undefined }, { ...pines, evergreenOrgId: 0 },
    { ...pines, baseUrl: 'http://gapines.org' }, { ...pines, baseUrl: 'https://name:secret@gapines.org' },
    { ...pines, baseUrl: 'https://gapines.org/other-service' }, { ...pines, baseUrl: 'https://gapines.org/?method=other' },
  ]) await assert.rejects(checkAvailability(library, ISBN), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
});
