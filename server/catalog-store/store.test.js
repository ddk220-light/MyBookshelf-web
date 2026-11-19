import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { readCatalogStoreConfig } from './config.js';
import { scrubQueryText, usageRow, createUsageLog } from './usageLog.js';
import { parseLibraryRequest, parseProblemReport, SubmissionError, createSubmissions } from './requests.js';
import { createCatalogPolicy, parseCatalogPolicies } from './policy.js';
import { createMemoryHostGate, createPgHostGate } from './hostGate.js';
import { createCatalogStore, createStoreStatus } from './index.js';
import { createCatalogMaintenanceMiddleware } from './cron.js';
import { poolSettings } from './pool.js';
import { createPgAnswerStore } from './holdings.js';
import { createCatalogLookup, createLookupRecorder, createMemoryAnswerStore, createMemoryHealthRecord, PLATFORMS } from '../services/catalog-lookup/index.js';
import { withCatalogOperation, request as httpRequest } from '../services/providers/http.js';

const SECRET = 'a synthetic cron secret that is long enough for tests';

test('without a database URL the store is in memory, the log is off and result marking is on', () => {
  const config = readCatalogStoreConfig({});
  assert.deepEqual({ ...config }, { storeEnabled: false, databaseUrl: null, workerDatabaseUrl: null, bucketSecret: null,
    usageLogEnabled: false, backgroundChecksEnabled: true, cronSecret: null });
  // The store flag alone, or the URL alone, does not turn the database on.
  assert.equal(readCatalogStoreConfig({ CATALOG_STORE_ENABLED: 'true' }).storeEnabled, false);
  assert.equal(readCatalogStoreConfig({ CATALOG_DATABASE_URL: 'postgres://example.invalid/db' }).storeEnabled, false);
  assert.equal(readCatalogStoreConfig({ CATALOG_BUCKET_SECRET: 'short' }).bucketSecret, null);
  assert.equal(readCatalogStoreConfig({ HOLDINGS_BACKGROUND_ENABLED: 'false' }).backgroundChecksEnabled, false);
  const store = createCatalogStore({ env: {} });
  assert.equal(store.durable, false);
  assert.equal(store.usage.enabled, false);
});

test('the store status is one word from one short query, reused briefly, with no detail', async () => {
  assert.equal(await createCatalogStore({ env: {} }).status(), 'off');
  let queries = 0, clock = 0;
  const calls = [];
  const ok = createStoreStatus({ query: async (text, values, options) => { queries++; calls.push([text, options]); return { rows: [{ ok: 1 }] }; } },
    { now: () => clock });
  assert.deepEqual(await Promise.all([ok(), ok()]), ['ok', 'ok']);
  assert.equal(queries, 1, 'concurrent calls share one query');
  assert.deepEqual(calls[0], ['SELECT 1 AS ok', { timeoutMs: 2500 }]);
  clock += 5_000;
  assert.equal(await ok(), 'ok');
  assert.equal(queries, 1, 'a recent answer is reused');
  clock += 20_000;
  await ok();
  assert.equal(queries, 2);
  const failed = createStoreStatus({ query: async () => { throw Object.assign(new Error('password authentication failed for user x at host y'), { code: '28P01' }); } });
  assert.equal(await failed(), 'failed');
  const slow = createStoreStatus({ query: () => new Promise(() => {}) }, { timeoutMs: 20 });
  assert.equal(await slow(), 'failed', 'a database that does not answer within the limit has failed');
  const store = createCatalogStore({ env: {}, db: { query: async () => ({ rows: [{ ok: 1 }] }) } });
  assert.equal(await store.status(), 'ok');
});

test('the log accepts only allowlisted fields and never an address, agent, device, account or coordinates', () => {
  for (const key of ['ip', 'userAgent', 'deviceId', 'accountId', 'sessionId', 'lat', 'lon', 'referrer', 'cookie']) {
    assert.throws(() => usageRow({ kind: 'book_search', outcome: 'results', [key]: 'x' }), /not permitted/);
  }
  assert.throws(() => usageRow({ kind: 'search', outcome: 'x' }), /kind/);
  const at = Date.UTC(2026, 10, 12, 9, 41, 7);
  const row = usageRow({ kind: 'book_search', queryText: '  Wings   of Fire ', outcome: 'results', resultCount: 9, source: 'public_data', durationMs: 812.4 }, at);
  assert.equal(row.occurredHour, Date.UTC(2026, 10, 12, 9));
  assert.deepEqual([row.queryText, row.resultCount, row.durationMs], ['Wings of Fire', 9, 812]);
  // Near me is a count only; book checks carry a book key but no text.
  assert.deepEqual(Object.values(usageRow({ kind: 'near_me', queryText: 'my street', libraryId: 'koha:x', outcome: 'results' }, at)).filter(v => typeof v === 'string'), ['near_me', 'results']);
  const check = usageRow({ kind: 'book_check', queryText: 'secret', bookKey: 'v1:isbn:9788173711466', libraryId: 'koha:x', outcome: 'found' }, at);
  assert.deepEqual([check.queryText, check.bookKey], [null, 'v1:isbn:9788173711466']);
  assert.equal(usageRow({ kind: 'book_search', queryText: 'x', bookKey: 'v1:isbn:9788173711466', outcome: 'none' }).bookKey, null);
});

test('a suggestion row is a book key and opened or saved ("shown" is refused): no text, library, timing or anything else', () => {
  const at = Date.UTC(2026, 11, 14, 9, 41, 7);
  const row = usageRow({ kind: 'suggestion', bookKey: 'v1:openlibrary:OL1W', outcome: 'opened', queryText: 'wings of fire', libraryId: 'koha:x',
    resultCount: 5, foundCount: 1, source: 'stored', durationMs: 40, appVersion: '1.0' }, at);
  assert.deepEqual({ ...row }, { occurredHour: Date.UTC(2026, 11, 14, 9), kind: 'suggestion', queryText: null, libraryId: null, bookKey: 'v1:openlibrary:OL1W',
    outcome: 'opened', resultCount: null, foundCount: null, source: null, durationMs: null, appVersion: null });
  for (const outcome of ['opened', 'saved']) assert.equal(usageRow({ kind: 'suggestion', bookKey: 'v1:isbn:9788173711466', outcome }).outcome, outcome);
  for (const outcome of ['clicked', 'shown']) assert.throws(() => usageRow({ kind: 'suggestion', bookKey: 'v1:openlibrary:OL1W', outcome }), /suggestion/);
  assert.throws(() => usageRow({ kind: 'suggestion', outcome: 'opened' }), /suggestion/);
  assert.throws(() => usageRow({ kind: 'suggestion', bookKey: 'v1:openlibrary:OL1W', outcome: 'opened', ip: '203.0.113.7' }), /not permitted/);
});

test('query text is scrubbed of emails, URLs and long digit runs, and keeps valid ISBNs', () => {
  const cases = [
    ['reader@example.com wings', '[removed] wings'],
    ['see https://example.org/x?q=1 and www.example.com', 'see [removed] and [removed]'],
    ['library.in catalog', '[removed] catalog'],
    ['call +91 98765 43210 now', 'call [removed] now'],
    ['card 1234567', 'card [removed]'],
    ['9876543210', '[removed]'], // a 10-digit number is not kept as an ISBN-10
    ['9788173711466', '9788173711466'],
    ['978-81-7371-146-6 kalam', '978-81-7371-146-6 kalam'],
    ['81-7371-146-1', '81-7371-146-1'],
    ['1984 and 2001 a space odyssey', '1984 and 2001 a space odyssey'],
  ];
  for (const [input, expected] of cases) assert.equal(scrubQueryText(input), expected, input);
  assert.equal(scrubQueryText('x'.repeat(500)).length, 200);
  assert.equal(scrubQueryText('   '), null);
  // NUL cannot be stored in a text column (the row would be lost); control
  // characters and bidirectional overrides become spaces.
  assert.equal(scrubQueryText('wings\u0000of\u0007fire\u202E'), 'wings of fire');
});

test('a disabled or failing log never throws to the route and writes nothing', async () => {
  const rows = [];
  createUsageLog({ enabled: false, sink: row => rows.push(row) }).record({ kind: 'book_search', outcome: 'none', ip: 'x' });
  assert.deepEqual(rows, []);
  const failing = createUsageLog({ enabled: true, db: { query: async () => { throw new Error('down'); } } });
  failing.record({ kind: 'book_search', queryText: 'x', outcome: 'none' });
  await new Promise(resolve => setImmediate(resolve));
});

test('library request text: normalised key, letters required, no emails, phones or URLs', () => {
  assert.deepEqual(parseLibraryRequest({ text: '  Anna   Centenary Library, Chennai! ' }),
    { displayText: 'Anna Centenary Library, Chennai!', requestKey: 'anna centenary library chennai' });
  assert.equal(parseLibraryRequest({ text: 'ＡＢＣ Library' }).requestKey, 'abc library');
  for (const text of ['a', '!!', '1234', 'mail me at a@b.co', 'www.lib.org', 'lib.example.com', 'call 98765 43210', 'x'.repeat(81)]) {
    assert.throws(() => parseLibraryRequest({ text }), SubmissionError, text);
  }
  assert.throws(() => parseLibraryRequest({ text: 'Valid', country: 'IN' }), SubmissionError);
  assert.deepEqual(parseProblemReport({ text: ' Badge wrong ', screen: 'book' }), { body: 'Badge wrong', screen: 'book' });
  assert.throws(() => parseProblemReport({ text: 'x', bookKey: 'not a key' }), SubmissionError);
});

test('optional name and email: both optional, a name up to 80 characters, one email up to 254', () => {
  const email = 'reader@example.org';
  assert.deepEqual(parseLibraryRequest({ text: 'KV Narimedu, Madurai', name: '  Asha   K ', email: ` ${email} ` }),
    { displayText: 'KV Narimedu, Madurai', requestKey: 'kv narimedu madurai', contact: { name: 'Asha K', email } });
  assert.deepEqual(parseLibraryRequest({ text: 'KV Narimedu', email }).contact, { email });
  // Empty fields are the same as none.
  assert.deepEqual(parseLibraryRequest({ text: 'KV Narimedu', name: ' ', email: '' }), { displayText: 'KV Narimedu', requestKey: 'kv narimedu' });
  assert.deepEqual(parseProblemReport({ text: 'Wrong answer', screen: 'book', name: 'Asha', email }),
    { body: 'Wrong answer', screen: 'book', contact: { name: 'Asha', email } });
  assert.equal(parseLibraryRequest({ text: 'KV', name: 'n'.repeat(80) }).contact.name.length, 80);
  assert.ok(parseProblemReport({ text: 'x', email: `${'a'.repeat(64)}@${'b'.repeat(185)}.org` }).contact.email.length === 254);
  for (const extra of [{ name: 'n'.repeat(81) }, { name: 7 }, { name: 'A\u0000B' }, { name: '‮Asha' }, { email: 'not an email' }, { email: 'a@b' },
    { email: `${email}, other@example.org` }, { email: `${email} other@example.org` }, { email: '<reader@example.org>' }, { email: 'a@b.co\u0000' },
    { email: `${'a'.repeat(64)}@${'b'.repeat(186)}.org` }, { email: null }, { phone: '98765 43210' }]) {
    assert.throws(() => parseLibraryRequest({ text: 'KV Narimedu', ...extra }), SubmissionError, JSON.stringify(extra));
    assert.throws(() => parseProblemReport({ text: 'Wrong answer', ...extra }), SubmissionError, JSON.stringify(extra));
  }
  // An email inside the request text is still refused, even with a contact email.
  assert.throws(() => parseLibraryRequest({ text: 'mail me at a@b.co', email }), SubmissionError);
});

test('a request’s contact details are kept even for a same-day repeat, which is not counted again', async () => {
  const submissions = createSubmissions({ secret: 'x'.repeat(40) });
  const ask = value => submissions.libraryRequest(parseLibraryRequest(value), { address: '203.0.113.5' });
  assert.equal(await ask({ text: 'KV Narimedu' }), 'accepted');
  assert.equal(await ask({ text: 'KV Narimedu' }), 'duplicate');
  assert.equal(await ask({ text: 'kv narimedu', email: 'reader@example.org' }), 'duplicate');
  const held = submissions.held();
  assert.deepEqual(held.requests.map(item => [item.requestKey, item.count]), [['kv narimedu', 1]]);
  assert.deepEqual(held.requestContacts.map(item => [item.requestKey, item.name, item.email]), [['kv narimedu', undefined, 'reader@example.org']]);
});

test('a report is still stored when the contact columns are not there yet (migration 003 not applied)', async () => {
  const undefinedColumn = Object.assign(new Error('column "contact_name" does not exist'), { code: '42703' });
  const queries = [];
  const db = { query: async (sql, values) => {
    queries.push({ sql, values });
    if (/contact_name/.test(sql)) throw undefinedColumn;
    return { rows: [], rowCount: 1 };
  } };
  const pending = [];
  const submissions = createSubmissions({ db, secret: 'x'.repeat(40), buckets: { take: async () => true }, defer: task => { pending.push(task()); } });
  const report = parseProblemReport({ text: 'The answer is wrong', screen: 'book', email: 'reader@example.org' });
  assert.equal(await submissions.problemReport(report, { address: '203.0.113.9' }), 'accepted');
  assert.equal(await submissions.problemReport(parseProblemReport({ text: 'No contact here' }), { address: '203.0.113.9' }), 'accepted');
  await Promise.all(pending);
  const stored = queries.filter(item => !/contact_name/.test(item.sql));
  assert.equal(stored.length, 2);
  assert.match(stored[0].sql, /^INSERT INTO problem_reports \(body, screen, library_id, book_key, app_version\)/);
  assert.deepEqual(stored.map(item => item.values), [['The answer is wrong', 'book', null, null, null], ['No contact here', null, null, null, null]]);
  // The contact details have nowhere to go and are not written anywhere else.
  assert.ok(stored.every(item => !JSON.stringify(item.values).includes('reader@example.org')));

  // Any other failure drops the report as before: no second insert.
  const down = [];
  const failing = createSubmissions({ db: { query: async sql => { down.push(sql); throw new Error('down'); } }, secret: 'x'.repeat(40),
    buckets: { take: async () => true }, defer: task => { pending.push(task()); } });
  await failing.problemReport(parseProblemReport({ text: 'Broken' }), { address: '203.0.113.9' });
  await Promise.all(pending);
  assert.equal(down.length, 1);
});

test('stored answers are read and written without the link-kind column until migration 004 is applied', async () => {
  const queries = [];
  const db = { query: async (sql, values) => {
    queries.push({ sql, values });
    if (/catalog_link_kind/.test(sql)) throw Object.assign(new Error('column "catalog_link_kind" does not exist'), { code: '42703' });
    if (/^SELECT/.test(sql)) return { rows: [{ library_id: 'koha:a', identity_kind: 'isbn13', identity_value: '9780140328721', answer: 'found',
      evidence: 'exact_isbn', catalog_url: 'https://catalog.example.org/record/1', expires_ms: '1900000000000' }] };
    return { rows: [], rowCount: 1 };
  } };
  const store = createPgAnswerStore(db);
  await store.writeAnswers([{ libraryId: 'koha:a', kind: 'isbn13', value: '9780140328721', answer: 'found', evidence: 'exact_isbn',
    catalogUrl: 'https://catalog.example.org/record/1', catalogLinkKind: 'record' }]);
  const written = queries.filter(item => /INSERT INTO holdings_answers/.test(item.sql));
  assert.equal(written.length, 2, 'one try with the column, one without');
  assert.doesNotMatch(written[1].sql, /catalog_link_kind|\$9/);
  assert.equal(written[1].values.length, 8);
  assert.deepEqual(written[1].values[6], ['https://catalog.example.org/record/1']);

  const read = await store.readAnswers('koha:a', [{ kind: 'isbn13', value: '9780140328721' }]);
  assert.deepEqual(read, [{ libraryId: 'koha:a', kind: 'isbn13', value: '9780140328721', answer: 'found', evidence: 'exact_isbn',
    catalogUrl: 'https://catalog.example.org/record/1', expiresAt: 1900000000000 }]);
  assert.equal(read[0].catalogLinkKind, undefined, 'no kind: the link reads as the catalog');

  // Any other failure is passed on, with no second query.
  const other = [];
  const failing = createPgAnswerStore({ query: async sql => { other.push(sql); throw Object.assign(new Error('down'), { code: '57P01' }); } });
  await assert.rejects(failing.readAnswers('koha:a', [{ kind: 'isbn13', value: '9780140328721' }]), { code: '57P01' });
  await assert.rejects(failing.writeAnswers([{ libraryId: 'koha:a', kind: 'isbn13', value: '9780140328721', answer: 'found', evidence: 'exact_isbn' }]), { code: '57P01' });
  assert.equal(other.length, 2);
});

test('the daily job still rolls up usage, refreshes health and clears check events when contact removal fails', async () => {
  const { runCatalogMaintenance } = await import('./maintenance.js');
  const ran = [];
  const db = { query: async sql => {
    const text = sql.replace(/\s+/g, ' ').trim();
    ran.push(text);
    if (/contact_name = NULL|library_request_contacts/.test(text)) throw Object.assign(new Error('missing'), { code: '42703' });
    return { rows: [], rowCount: 0 };
  } };
  const result = await runCatalogMaintenance(db, { policy: null, now: () => Date.UTC(2026, 10, 19) });
  assert.equal(result.contacts, null);
  assert.deepEqual(result.failed, ['contacts']);
  assert.deepEqual(result.usage, { days: 0, events: 0 });
  assert.deepEqual(result.health, { libraries: 0, flagged: 0 });
  assert.equal(result.checkEvents, 0);
  assert.ok(ran.some(text => text.startsWith('SELECT DISTINCT to_char(occurred_hour')), 'usage roll-up ran');
  assert.ok(ran.some(text => text.startsWith('UPDATE library_health h SET failures_7d')), '7-day health counts ran');
  assert.ok(ran.some(text => text.startsWith('DELETE FROM library_check_events')), 'check events were cleared');
  assert.ok(ran.some(text => text.startsWith('DELETE FROM host_request_windows')), 'host windows were cleared');
});

test('submission limits fail open to this instance when the database limiter is down', async () => {
  const failing = { take: async () => { throw new Error('down'); } };
  const submissions = createSubmissions({ db: { query: async () => { throw new Error('down'); } }, secret: 'x'.repeat(32), buckets: failing });
  const results = [];
  for (let i = 0; i < 6; i += 1) results.push(await submissions.problemReport({ body: `r${i}` }, { address: '192.0.2.1' }));
  assert.deepEqual(results, ['accepted', 'accepted', 'accepted', 'accepted', 'accepted', 'limited']);
});

test('the policy file is reviewed data: opt-outs need a reason and a date', () => {
  const policy = createCatalogPolicy({ policies: { schemaVersion: 1, libraries: {
    'bc:example': { storeAnswers: false, reason: 'Asked by email', reviewedOn: '2026-12-01', sourceUrl: 'https://example.org' },
    'koha:quiet': { backgroundChecks: false } } } });
  assert.deepEqual({ ...policy.policyFor('bc:example') }, { storeAnswers: false, backgroundChecks: true });
  assert.deepEqual({ ...policy.policyFor('koha:quiet') }, { storeAnswers: true, backgroundChecks: false });
  assert.deepEqual({ ...policy.policyFor('koha:other') }, { storeAnswers: true, backgroundChecks: true });
  assert.deepEqual(policy.optedOut(), ['bc:example']);
  assert.throws(() => parseCatalogPolicies({ schemaVersion: 1, libraries: { 'bc:x': { storeAnswers: false } } }), /reason/);
  assert.throws(() => parseCatalogPolicies({ schemaVersion: 2, libraries: {} }));
  // The shipped file parses and is empty.
  assert.deepEqual(createCatalogPolicy().optedOut(), []);
});

test('the host gate spaces requests across readers and caps them per minute', async () => {
  let clock = 1_000_000;
  const waits = [];
  const gate = createMemoryHostGate({ now: () => clock, wait: async ms => { waits.push(ms); } });
  // Crawl-delay 20 s: three readers asking at once get slots 20 s apart.
  for (let i = 0; i < 3; i += 1) await gate.reserve('vpl.example', { spacingMs: 20_000, deadlineAt: clock + 45_000 });
  assert.deepEqual(waits, [0, 20_000, 40_000]);
  // A slot past the deadline is refused (busy), not queued.
  await assert.rejects(gate.reserve('vpl.example', { spacingMs: 20_000, deadlineAt: clock + 45_000 }), { code: 'CATALOG_HOST_BUSY' });
  // Per-minute cap: the fourth request in a minute waits for the next minute.
  waits.length = 0;
  clock = 120_000;
  for (let i = 0; i < 4; i += 1) await gate.reserve('koha.example', { perMinute: 3, deadlineAt: clock + 70_000 });
  assert.deepEqual(waits, [0, 0, 0, 60_000]);
  await assert.rejects(gate.reserve('koha.example', { perMinute: 3, deadlineAt: clock + 1_000 }), { code: 'CATALOG_HOST_BUSY' });
  // Hosts are independent, and an unlimited host costs nothing.
  await gate.reserve('other.example', { perMinute: 3, deadlineAt: clock });
  await gate.reserve('free.example', {});
});

test('the database host gate fails open to the instance gate when the store is slow or down', async () => {
  const calls = [];
  const fallback = { reserve: async (host, options) => { calls.push([host, options.spacingMs]); } };
  const gate = createPgHostGate({ query: async () => { throw new Error('down'); } }, { fallback });
  await gate.reserve('eg4.nic.in', { spacingMs: 1_000, perMinute: 60, deadlineAt: Date.now() + 5_000 });
  assert.deepEqual(calls, [['eg4.nic.in', 1_000]]);
  // A full host is refused by the database, not retried locally.
  const full = createPgHostGate({ query: async () => ({ rows: [] }) }, { fallback });
  await assert.rejects(full.reserve('eg4.nic.in', { spacingMs: 1_000, deadlineAt: Date.now() + 5_000 }), { code: 'CATALOG_HOST_BUSY' });
});

test('every catalog request in an operation passes the gate, with the Crawl-delay as spacing, and noRetries sends once', async () => {
  const originalFetch = global.fetch;
  const asked = [];
  let fetches = 0;
  global.fetch = async url => { fetches += 1; return { ok: false, status: 503, url, headers: new Headers(), text: async () => 'busy' }; };
  try {
    const gate = async (host, options) => { asked.push([host, options.spacingMs]); };
    await withCatalogOperation({ gate, robots: async () => ({ allowed: true, delayMs: 200 }) },
      () => httpRequest('https://catalog.example/search', { deadlineAt: Date.now() + 3_000 }));
    // A GET is retried once by default; both attempts passed the gate.
    assert.deepEqual(asked, [['catalog.example', 200], ['catalog.example', 200]]);
    assert.equal(fetches, 2);
    fetches = 0;
    await withCatalogOperation({ noRetries: true }, () => httpRequest('https://catalog.example/search', { deadlineAt: Date.now() + 1_000 }));
    assert.equal(fetches, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a busy host is couldn’t check, never not found, and not a health failure', async () => {
  const health = createMemoryHealthRecord();
  const pending = [];
  const lookup = createCatalogLookup({ env: {}, robots: null,
    providerFor: () => ({ checkAvailability: async () => { throw Object.assign(new Error('busy'), { code: 'CATALOG_HOST_BUSY' }); } }),
    recorder: createLookupRecorder({ health, defer: task => pending.push(task()) }) });
  const answer = await lookup.lookupBook({ library: { id: 'vega:busy', platform: 'vega', catalogUrl: 'https://v.example' },
    book: { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466' }, editionScope: 'exact' });
  assert.deepEqual([answer.outcome, answer.reason], ['couldnt_check', 'busy']);
  await Promise.all(pending);
  assert.equal(await health.libraryHealth('vega:busy'), null);
});

test('a store that is down means a live check and no error; an opted-out library is never answered from the store', async () => {
  const down = { readAnswers: async () => { throw new Error('down'); }, writeAnswers: async () => { throw new Error('down'); } };
  const pending = [];
  let calls = 0;
  const providerFor = () => ({ checkAvailability: async () => { calls += 1; return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }; } });
  const lookup = createCatalogLookup({ env: {}, robots: null, providerFor, recorder: createLookupRecorder({ answers: down, defer: task => pending.push(task()) }) });
  const library = { id: 'vega:down', platform: 'vega', catalogUrl: 'https://v.example' };
  const book = { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466' };
  assert.equal((await lookup.lookupBook({ library, book, editionScope: 'exact' })).outcome, 'found');
  await Promise.all(pending);
  assert.equal(calls, 1);

  const answers = createMemoryAnswerStore();
  await answers.writeAnswers([{ libraryId: 'vega:gone', kind: 'isbn13', value: '9788173711466', answer: 'found', evidence: 'exact_isbn', expiresAt: Date.now() + 60_000 }]);
  const policyFor = id => ({ storeAnswers: id !== 'vega:gone' });
  const optOut = createCatalogLookup({ env: {}, robots: null, providerFor, recorder: createLookupRecorder({ answers, policyFor, defer: task => pending.push(task()) }) });
  assert.equal((await optOut.lookupBook({ library: { ...library, id: 'vega:gone' }, book, editionScope: 'exact' })).source, 'live');
});

test('while a host’s circuit is open the book page tries once: one check at a time and no transport retry', async () => {
  const originalFetch = global.fetch;
  let fetches = 0;
  global.fetch = async url => { fetches += 1; return { ok: false, status: 503, url, headers: new Headers(), text: async () => 'down' }; };
  try {
    for (const open of [false, true]) {
      fetches = 0;
      const limits = [];
      const guard = { circuitOpen: () => open, recordFailure() {}, recordSuccess() {}, tryStartMarking: () => () => {},
        acquire: async (host, limit) => { limits.push(limit); return () => {}; } };
      const providerFor = () => ({ checkAvailability: async () => {
        await httpRequest('https://b.example/search', { deadlineAt: Date.now() + 1_000 });
        throw Object.assign(new Error('down'), { code: 'CATALOG_UNAVAILABLE' });
      } });
      const lookup = createCatalogLookup({ env: {}, robots: null, guard, providerFor, recorder: createLookupRecorder({ defer: () => {} }), platforms: PLATFORMS });
      const answer = await lookup.lookupBook({ library: { id: 'bc:x', platform: 'bc', catalogUrl: 'https://b.example' },
        book: { bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466' }, editionScope: 'exact' });
      assert.equal(answer.outcome, 'couldnt_check');
      assert.deepEqual([limits, fetches], open ? [[1], 1] : [[PLATFORMS.bc.hostConcurrency], 2]);
    }
  } finally {
    global.fetch = originalFetch;
  }
});

test('the maintenance route is private and needs the worker database', async () => {
  const app = express();
  app.use(createCatalogMaintenanceMiddleware({ env: { CRON_SECRET: SECRET } }));
  assert.equal((await request(app).get('/api/internal/catalog-maintenance')).status, 403);
  assert.equal((await request(app).get('/api/internal/catalog-maintenance').set('Authorization', 'Bearer wrong')).status, 403);
  const unavailable = await request(app).get('/api/internal/catalog-maintenance').set('Authorization', `Bearer ${SECRET}`);
  assert.deepEqual([unavailable.status, unavailable.body.error.code, unavailable.headers['cache-control']], [503, 'MAINTENANCE_UNAVAILABLE', 'private, no-store']);
  const noSecret = express().use(createCatalogMaintenanceMiddleware({ env: {} }));
  assert.equal((await request(noSecret).get('/api/internal/catalog-maintenance').set('Authorization', 'Bearer ')).status, 403);
});

test('a pooled (PgBouncer) connection gets no statement_timeout startup parameter; a direct one does', () => {
  // Neon's pooler refuses unsupported startup parameters, which would make every store call fail.
  const pooled = poolSettings('postgres://catalog_runtime:x@ep-quiet-sky-123456-pooler.us-east-1.aws.neon.tech/catalog?sslmode=require');
  assert.equal('statement_timeout' in pooled, false);
  assert.equal(pooled.max, 3);
  const direct = poolSettings('postgres://catalog_runtime:x@ep-quiet-sky-123456.us-east-1.aws.neon.tech/catalog?sslmode=require');
  assert.equal(direct.statement_timeout, 1500);
});
