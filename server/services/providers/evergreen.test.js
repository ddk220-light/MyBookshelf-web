import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkAvailability, parseEvergreenSearch, parseEvergreenRecord, clearEvergreenRefusals, librarySearch, parseEvergreenQuery, parseEvergreenRecords,
  searchQuery, searchScope, searchTerm, SEARCH_LIMIT } from './evergreen.js';
import { clearHttpCache, USER_AGENT } from './http.js';
import { searchLibraryBook } from '../libraryBookSearch.js';
import { rowFormatKind } from '../rowFormats.js';

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
    catalogLinkKind: 'record',
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
  // PINES is live-only (catalog-policies.json platforms.evergreen): a repeated lookup asks again.
  const again = serve();
  assert.deepEqual(await checkAvailability(pines, ISBN), result);
  assert.equal(again.length, 2, 'nothing is cached for a live-only catalog');
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
    catalogLinkKind: 'record',
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

// The library search (USA plan step 8, 24 November 2026): one keyword search
// through the gateway, limited to the member system, then the found records'
// brief details. Fixtures: the adapter's own live answers of 24 November 2026
// at Athens Regional (site ARL, org 6) and in all of PINES.
const athens = { id: 'evergreen:athens-regional-ga', platform: 'evergreen', baseUrl: 'https://gapines.org', evergreenOrgId: 6, evergreenSite: 'ARL' };
const RBC_ARL = [6376958, 6348521, 6350435, 6500968, 6382324];

function gateway(answers) {
  const calls = [];
  global.fetch = async (url, options) => {
    const request = new URL(url);
    calls.push({ url: request, options, method: request.searchParams.get('method'), params: request.searchParams.getAll('param').map(JSON.parse) });
    const answer = answers[calls.length - 1];
    if (answer === undefined) assert.fail(`unexpected request ${calls.length}`);
    return typeof answer === 'function' ? answer(calls.at(-1)) : response(answer);
  };
  return calls;
}
// The records answer for the requested IDs only (the saved one holds six records).
const recordsFor = (call) => {
  const all = fixture('pines-live-records');
  const wanted = call.params[0];
  return response({ status: 200, payload: [all.payload[0].filter((item) => wanted.includes(item.__p[2]))] });
};

test('the library search term is plain words, limited to the system by its short name', () => {
  assert.equal(searchTerm('Oh, the Places You\'ll Go!'), 'Oh the Places You\'ll Go');
  assert.equal(searchTerm('title:Dune site(PINES) -film "Part 1" a|b && c #available'), 'title Dune site PINES film Part 1 a b c available');
  assert.equal(searchTerm('  Spider-Man  '), 'Spider-Man');
  assert.equal(searchQuery('Remarkably Bright Creatures', 'ARL'), 'Remarkably Bright Creatures site(ARL)');
  assert.equal(searchQuery('Remarkably Bright Creatures', null), 'Remarkably Bright Creatures');
  assert.deepEqual(searchScope(athens), { origin: 'https://gapines.org', orgId: 6, site: 'ARL' });
  assert.deepEqual(searchScope(pines), { origin: 'https://gapines.org', orgId: 1, site: null });
});

test('live query answers: the record IDs, every match counted, and the orgs Evergreen applied', () => {
  assert.deepEqual(parseEvergreenQuery(fixture('pines-live-query-remarkably-bright-creatures-arl'), { orgId: 6 }), { count: 5, recordIds: RBC_ARL });
  assert.deepEqual(parseEvergreenQuery(fixture('pines-live-query-isbn-9780385547345-arl'), { orgId: 6 }), { count: 1, recordIds: [6332647] });
  assert.deepEqual(parseEvergreenQuery(fixture('pines-live-query-no-hits-arl'), { orgId: 6 }), { count: 0, recordIds: [] });
  const all = parseEvergreenQuery(fixture('pines-live-query-remarkably-bright-creatures-pines'), { orgId: 1 });
  assert.equal(all.count, 20);
  assert.equal(all.recordIds.length, 20);
  // The system's search lists fewer records than all of PINES: the scope took.
  assert.ok(RBC_ARL.every((id) => all.recordIds.includes(id)));
  // A scoped answer whose applied orgs leave out the system's org is not this system's.
  assert.equal(parseEvergreenQuery(fixture('pines-live-query-remarkably-bright-creatures-pines'), { orgId: 6 }), null);
  assert.equal(parseEvergreenQuery(fixture('pines-live-query-no-hits-arl'), { orgId: 376 }), null);
  // Incomplete, duplicated or event answers prove nothing.
  for (const envelope of [
    { status: 200, payload: [{ count: 3, ids: [] }] },
    { status: 200, payload: [{ count: 1, ids: [[5, null, '1.0'], [6, null, '1.0']] }] },
    { status: 200, payload: [{ count: 2, ids: [[5], [5]] }] },
    { status: 200, payload: [{ count: 'many', ids: [] }] },
    { status: 200, payload: [{ ilsevent: 1, count: 0, ids: [] }] },
    { status: 200, payload: [] },
    { status: 500, payload: [{ count: 0, ids: [] }] },
  ]) assert.equal(parseEvergreenQuery(envelope, { orgId: 6 }), null);
});

test('live records answer: rows with title, author, ISBN, format and the system\'s record page, in the search\'s order', () => {
  const rows = parseEvergreenRecords(fixture('pines-live-records'), RBC_ARL, { origin: 'https://gapines.org', orgId: 6 });
  assert.deepEqual(rows.map((row) => row.recordId), RBC_ARL.map(String));
  assert.deepEqual(rows[0], { recordId: '6376958', title: 'Remarkably bright creatures', authors: ['Van Pelt, Shelby'], isbns: ['9798200969272'],
    format: 'sound recording-nonmusical', catalogUrl: 'https://gapines.org/eg/opac/record/6376958?locg=6', catalogLinkKind: 'record' });
  assert.equal(rows[1].title, 'Remarkably bright creatures : a novel');
  assert.deepEqual(rows[4].isbns, ['9781771648882']);
  assert.deepEqual(rows.map((row) => rowFormatKind(row)), ['audiobook', 'book', 'book', 'book', 'book']);
  // A text whose physical description is an online resource ranks with the e-books.
  const online = fixture('pines-live-records');
  online.payload[0][1].__p[14] = '1 online resource (360 pages)';
  assert.equal(parseEvergreenRecords(online, [6348521], { origin: 'https://gapines.org', orgId: 6 })[0].formatKind, 'ebook');
  // An ISBN term's rows carry the searched ISBN: the brief record shows the record's first ISBN only.
  const [chemistry] = parseEvergreenRecords(fixture('pines-live-records'), [6332647], { origin: 'https://gapines.org', orgId: 6, isbn: '9780385547345' });
  assert.deepEqual(chemistry.isbns, ['9780593314487', '9780385547345']);
  // Records the search did not list, other objects and an answer with none of the records are not rows.
  assert.equal(parseEvergreenRecords(fixture('pines-live-records'), [1], { origin: 'https://gapines.org', orgId: 6 }), null);
  assert.equal(parseEvergreenRecords({ status: 200, payload: [[{ ilsevent: 1 }]] }, [6332647], { origin: 'https://gapines.org', orgId: 6 }), null);
  assert.equal(parseEvergreenRecords({ status: 200, payload: [{ __c: 'mvr', __p: [] }] }, [6332647], { origin: 'https://gapines.org', orgId: 6 }), null);
});

test('a member search is one scoped keyword query and one records read, anonymous and bounded', async () => {
  const calls = gateway([fixture('pines-live-query-remarkably-bright-creatures-arl'), recordsFor]);
  const rows = await librarySearch(athens, 'Remarkably Bright Creatures');
  assert.equal(rows.length, 5);
  assert.deepEqual(calls.map((call) => call.method), ['open-ils.search.biblio.multiclass.query', 'open-ils.search.biblio.record.mods_slim.retrieve']);
  assert.deepEqual(calls[0].params, [{ limit: SEARCH_LIMIT, offset: 0 }, 'Remarkably Bright Creatures site(ARL)', 1]);
  assert.deepEqual(calls[1].params, [RBC_ARL]);
  for (const { url, options } of calls) {
    assert.equal(url.origin, 'https://gapines.org');
    assert.equal(url.pathname, '/osrf-gateway-v1');
    assert.equal(url.searchParams.get('service'), 'open-ils.search');
    assert.equal(options.headers['User-Agent'], USER_AGENT);
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.redirect, 'manual');
  }
  // Live-only: the same search asks again.
  gateway([fixture('pines-live-query-remarkably-bright-creatures-arl'), recordsFor]);
  assert.equal((await librarySearch(athens, 'Remarkably Bright Creatures')).length, 5);
});

test('through the one library search, the print novel ranks first and a find links the system\'s record page', async () => {
  gateway([fixture('pines-live-query-remarkably-bright-creatures-arl'), recordsFor]);
  const provider = { search: (term) => librarySearch(athens, term) };
  const found = await searchLibraryBook(provider, { title: 'Remarkably Bright Creatures', authors: ['Shelby Van Pelt'] });
  assert.equal(found.outcome, 'in_catalog');
  assert.equal(found.foundBy, 'title');
  assert.equal(found.catalogUrl, 'https://gapines.org/eg/opac/record/6348521?locg=6');
  // Books first (the novel, its large print), then the audiobook; the picture book about glowing creatures fails the title rule.
  assert.deepEqual(found.matches.map((match) => match.url), [6348521, 6350435, 6376958].map((id) => `https://gapines.org/eg/opac/record/${id}?locg=6`));
});

test('an ISBN term (no title known) finds the record whose keyword index holds it', async () => {
  gateway([fixture('pines-live-query-isbn-9780385547345-arl'), recordsFor]);
  const found = await searchLibraryBook({ search: (term) => librarySearch(athens, term) }, { title: '' }, { readerIsbn: '9780385547345' });
  assert.equal(found.outcome, 'in_catalog');
  assert.equal(found.foundBy, 'isbn');
  assert.equal(found.matchedBook.title, 'Lessons in chemistry');
});

test('nothing found is one request and not found; the whole-network entry searches without a site', async () => {
  const calls = gateway([fixture('pines-live-query-no-hits-arl')]);
  assert.deepEqual(await librarySearch(athens, 'Qzxvbn Wrrtplk Mmnoqz'), []);
  assert.equal(calls.length, 1);
  gateway([fixture('pines-live-query-no-hits-arl')]);
  assert.deepEqual(await searchLibraryBook({ search: (term) => librarySearch(athens, term) }, { title: 'Qzxvbn Wrrtplk Mmnoqz' }), { outcome: 'no_match' });
  const network = gateway([fixture('pines-live-query-remarkably-bright-creatures-pines'), (call) => response({ status: 200, payload: [fixture('pines-live-records').payload[0].filter((item) => call.params[0].includes(item.__p[2]))] })]);
  const rows = await librarySearch(pines, 'Remarkably Bright Creatures');
  assert.equal(network[0].params[1], 'Remarkably Bright Creatures');
  assert.ok(rows.length >= 4 && rows.every((row) => row.catalogUrl.endsWith('?locg=1')));
});

test('a scope that did not take, an unreadable answer, a refusal or a redirect is couldn\'t check, never not found', async () => {
  // All of PINES answered for Athens Regional (badge_orgs(1)): not the system's answer.
  gateway([fixture('pines-live-query-remarkably-bright-creatures-pines')]);
  await assert.rejects(librarySearch(athens, 'Remarkably Bright Creatures'), { code: 'CATALOG_UNRECOGNIZED' });
  gateway([fixture('pines-live-query-remarkably-bright-creatures-arl'), { status: 200, payload: [[{ ilsevent: 1, textcode: 'BIBLIO_RECORD_ENTRY_NOT_FOUND' }]] }]);
  await assert.rejects(librarySearch(athens, 'Remarkably Bright Creatures'), { code: 'CATALOG_UNRECOGNIZED' });
  gateway([() => response('<html>Service maintenance</html>')]);
  await assert.rejects(librarySearch(athens, 'Remarkably Bright Creatures'), { code: 'CATALOG_UNRECOGNIZED' });
  gateway([() => response('Moved', 302)]);
  await assert.rejects(librarySearch(athens, 'Remarkably Bright Creatures'), { code: 'CATALOG_UNAVAILABLE' });
  gateway([() => response('Access refused', 429)]);
  await assert.rejects(librarySearch(athens, 'Remarkably Bright Creatures'), { code: 'CATALOG_PROVIDER_BLOCKED' });
  // The refusal disables the origin for every PINES system on this instance.
  await assert.rejects(librarySearch(pines, 'Lessons in Chemistry'), { code: 'CATALOG_PROVIDER_BLOCKED' });
});

test('a member org without its short name, a bad short name or nothing to search makes no request', async () => {
  global.fetch = async () => { assert.fail('must not fetch'); };
  for (const library of [{ ...athens, evergreenSite: undefined }, { ...athens, evergreenSite: 'ARL) || site(PINES' }, { ...athens, evergreenSite: 6 }]) {
    await assert.rejects(librarySearch(library, 'Remarkably Bright Creatures'), { code: 'CATALOG_CONFIGURATION_REQUIRED' });
  }
  await assert.rejects(librarySearch(athens, '()"|'), { code: 'CATALOG_QUERY_UNSUPPORTED' });
});
