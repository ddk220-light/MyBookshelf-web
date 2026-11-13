import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { migrateCatalog } from './migrate.js';
import { createCatalogDatabase } from './pool.js';
import { createPgAnswerStore } from './holdings.js';
import { createPgHealthRecord } from './health.js';
import { createUsageLog, dailyUsage } from './usageLog.js';
import { createSubmissions } from './requests.js';
import { createPgHostGate } from './hostGate.js';
import { createCatalogPolicy } from './policy.js';
import { runCatalogMaintenance } from './maintenance.js';
import { createCatalogMaintenanceMiddleware } from './cron.js';
import { createCatalogLookup, createLookupRecorder } from '../services/catalog-lookup/index.js';

// Runs only against a disposable local database whose name ends in _test,
// e.g. CATALOG_TEST_DATABASE_URL=postgres://postgres:...@127.0.0.1:5432/catalog_test
const connectionString = process.env.CATALOG_TEST_DATABASE_URL;
const ROLES = ['runtime', 'worker', 'admin'];
const roleURL = role => { const url = new URL(connectionString); url.username = `catalog_${role}`; url.password = `local-isolated-catalog-${role}-tests`; return url.href; };
const DAY = 24 * 60 * 60 * 1000;
const TABLES = 'holdings_answers, library_profiles, library_check_events, library_health, usage_events, usage_daily_totals, library_requests, problem_reports, submission_buckets, host_request_windows, host_request_slots';

async function prepare(t) {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.endsWith('_test'), 'a disposable local *_test database only');
  const admin = new Pool({ connectionString, max: 2 });
  await migrateCatalog(admin);
  assert.equal(await migrateCatalog(admin), 1, 'migrations are idempotent');
  await admin.query(`DO $$ BEGIN
    ${ROLES.map(role => `IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='catalog_${role}') THEN CREATE ROLE catalog_${role} LOGIN PASSWORD 'local-isolated-catalog-${role}-tests' NOSUPERUSER NOBYPASSRLS NOCREATEROLE; END IF;`).join('\n')}
  END $$`);
  await admin.query(await readFile(new URL('./runtime-grants.sql', import.meta.url), 'utf8'));
  await admin.query(`TRUNCATE ${TABLES} RESTART IDENTITY`);
  const dbs = Object.fromEntries(ROLES.map(role => [role, createCatalogDatabase(roleURL(role), { statementTimeoutMs: 10_000 })]));
  t.after(async () => { await Promise.all(Object.values(dbs).map(db => db.end())); await admin.end(); });
  // `admin` is the owner pool used to arrange and inspect rows; the
  // catalog_admin role's database is `adminRole`.
  return { admin, runtime: dbs.runtime, worker: dbs.worker, adminRole: dbs.admin };
}

const skip = !connectionString && 'Set disposable local CATALOG_TEST_DATABASE_URL.';

test('stored answers: TTL filter, upsert strength, opt-out and no repeat catalog request', { skip, timeout: 60_000 }, async t => {
  const { admin, runtime } = await prepare(t);
  const answers = createPgAnswerStore(runtime);
  const id = (kind, value) => ({ kind, value });
  const row = (value, answer, evidence, extra = {}) => ({ libraryId: 'koha:a', kind: 'isbn13', value, answer, evidence, ...extra });
  await answers.writeAnswers([row('9788173711466', 'found', 'exact_isbn', { catalogUrl: 'https://c.example/r/1' }), row('9780140328721', 'not_found', 'isbn_not_listed'),
    { libraryId: 'koha:a', kind: 'ol_work', value: 'OL1W', answer: 'found', evidence: 'work_isbn', matchedIsbn13: '9788173711466' }]);
  const read = await answers.readAnswers('koha:a', [id('isbn13', '9788173711466'), id('isbn13', '9780140328721'), id('ol_work', 'OL1W'), id('ol_work', 'OL2W')]);
  assert.deepEqual(read.map(r => [r.kind, r.value, r.answer]).sort(), [['isbn13', '9780140328721', 'not_found'], ['isbn13', '9788173711466', 'found'], ['ol_work', 'OL1W', 'found']]);
  // Both kinds of answer expire 180 days after the check.
  const { rows: ttl } = await admin.query(`SELECT DISTINCT round(extract(epoch FROM expires_at - checked_at) / 86400) AS days FROM holdings_answers`);
  assert.deepEqual(ttl.map(r => Number(r.days)), [180]);
  // not_found never overwrites an unexpired found; found overwrites not_found.
  await answers.writeAnswers([row('9788173711466', 'not_found', 'isbn_not_listed'), row('9780140328721', 'found', 'exact_isbn')]);
  const after = await answers.readAnswers('koha:a', [id('isbn13', '9788173711466'), id('isbn13', '9780140328721')]);
  assert.deepEqual(after.map(r => r.answer), ['found', 'found']);
  // An expired answer is never read, and may then be replaced by not_found.
  await admin.query(`UPDATE holdings_answers SET expires_at = now() - interval '1 second' WHERE identity_value = '9788173711466'`);
  assert.deepEqual(await answers.readAnswers('koha:a', [id('isbn13', '9788173711466')]), []);
  await answers.writeAnswers([row('9788173711466', 'not_found', 'isbn_not_listed')]);
  assert.equal((await answers.readAnswers('koha:a', [id('isbn13', '9788173711466')]))[0].answer, 'not_found');
  assert.ok(Number((await admin.query(`SELECT answers_stored FROM library_profiles WHERE library_id = 'koha:a'`)).rows[0].answers_stored) >= 4);

  // Through the lookup layer: the second open makes no catalog request, and
  // an opted-out library gets no rows.
  const pending = [];
  let calls = 0;
  const policy = createCatalogPolicy({ policies: { schemaVersion: 1, libraries: { 'vega:out': { storeAnswers: false, reason: 'Test', reviewedOn: '2026-11-12' } } } });
  const lookup = createCatalogLookup({ env: {}, robots: null,
    providerFor: () => ({ checkAvailability: async () => { calls += 1; return { outcome: 'available', matchKind: 'exact_isbn', recognizedExact: true }; } }),
    recorder: createLookupRecorder({ answers, health: createPgHealthRecord(runtime), policyFor: policy.policyFor, defer: task => pending.push(task()) }) });
  const book = { bookKey: 'v1:isbn:9780439023528', isbn13: '9780439023528' };
  for (const libraryId of ['vega:in', 'vega:in', 'vega:out', 'vega:out']) {
    await lookup.lookupBook({ library: { id: libraryId, platform: 'vega', catalogUrl: 'https://v.example' }, book, editionScope: 'exact' });
    await Promise.all(pending.splice(0));
  }
  assert.equal(calls, 3);
  assert.equal((await admin.query(`SELECT count(*)::int AS n FROM holdings_answers WHERE library_id = 'vega:out'`)).rows[0].n, 0);
  assert.ok((await admin.query(`SELECT last_success_at FROM library_health WHERE library_id = 'vega:out'`)).rows[0].last_success_at, 'health is still written');
  // The runtime role cannot delete answers or read the log.
  await assert.rejects(runtime.query('DELETE FROM holdings_answers'), { code: '42501' });
});

test('health record: failure events, the flag rule (3 attempts, 2 UTC days, 7 days) and a success clears it', { skip, timeout: 60_000 }, async t => {
  const { admin, runtime, worker } = await prepare(t);
  const health = createPgHealthRecord(runtime);
  await health.recordOutcome({ libraryId: 'koha:slow', platform: 'koha', host: 'slow.example', ok: false, reason: 'timeout', durationMs: 20_000, requests: 3 });
  const { rows: events } = await admin.query('SELECT library_id, host, platform, operation, failure, duration_ms, requests FROM library_check_events');
  assert.deepEqual(events, [{ library_id: 'koha:slow', host: 'slow.example', platform: 'koha', operation: 'book_check', failure: 'timeout', duration_ms: 20000, requests: 3 }]);
  // Not a failure: no event.
  await health.recordOutcome({ libraryId: 'koha:slow', platform: 'koha', host: 'slow.example', ok: false, reason: 'unconfirmed' });
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM library_check_events')).rows[0].n, 1);
  assert.equal((await health.libraryHealth('koha:slow')).flagged, false);
  // A retry 5 minutes later counts as the same attempt; yesterday's failure is
  // a second day; a third attempt now flags the library.
  await admin.query(`INSERT INTO library_check_events (library_id, host, platform, operation, failure, duration_ms, requests, occurred_at)
    VALUES ('koha:slow', 'slow.example', 'koha', 'book_check', 'timeout', 1, 1, now() - interval '5 minutes')`);
  await health.recordOutcome({ libraryId: 'koha:slow', platform: 'koha', host: 'slow.example', ok: false, reason: 'unavailable' });
  assert.equal((await health.libraryHealth('koha:slow')).flagged, false, 'retries within 30 minutes count once');
  await admin.query(`INSERT INTO library_check_events (library_id, host, platform, operation, failure, duration_ms, requests, occurred_at)
    VALUES ('koha:slow', 'slow.example', 'koha', 'book_check', 'timeout', 1, 1, now() - interval '2 days'),
           ('koha:slow', 'slow.example', 'koha', 'book_check', 'timeout', 1, 1, now() - interval '1 day')`);
  await health.recordOutcome({ libraryId: 'koha:slow', platform: 'koha', host: 'slow.example', ok: false, reason: 'blocked', operation: 'marks' });
  const flagged = await health.libraryHealth('koha:slow');
  assert.equal(flagged.flagged, true);
  assert.match(flagged.flagReason, /failed attempts on \d days/);
  assert.deepEqual(await health.flaggedLibraries(), ['koha:slow']);
  // The owner acknowledges; a success clears the flag and keeps the note.
  await admin.query(`UPDATE library_health SET acknowledged_at = now(), owner_note = 'Seen' WHERE library_id = 'koha:slow'`);
  await health.recordOutcome({ libraryId: 'koha:slow', platform: 'koha', host: 'slow.example', ok: true });
  const cleared = await health.libraryHealth('koha:slow');
  assert.deepEqual([cleared.flagged, cleared.failuresSinceSuccess, cleared.ownerNote, Boolean(cleared.acknowledgedAt)], [false, 0, 'Seen', true]);
  // Old failures alone do not flag after the window: the daily refresh clears.
  await admin.query(`UPDATE library_health SET flagged_at = now(), last_success_at = NULL WHERE library_id = 'koha:slow'`);
  await admin.query(`UPDATE library_check_events SET occurred_at = occurred_at - interval '8 days' WHERE library_id = 'koha:slow'`);
  await createPgHealthRecord(worker).refreshFlags();
  assert.equal((await health.libraryHealth('koha:slow')).flagged, false);
});

test('anonymous log, submissions and the host gate as the runtime role', { skip, timeout: 60_000 }, async t => {
  const { admin, runtime } = await prepare(t);
  const log = createUsageLog({ enabled: true, db: runtime, defer: async task => { await task(); } });
  log.record({ kind: 'book_search', queryText: 'wings of fire reader@example.com', outcome: 'results', resultCount: 9, source: 'public_data', durationMs: 900 });
  log.record({ kind: 'near_me', outcome: 'results', resultCount: 4 });
  await new Promise(resolve => setTimeout(resolve, 50));
  const { rows } = await admin.query('SELECT kind, query_text, occurred_hour = date_trunc(\'hour\', occurred_hour, \'UTC\') AS hour FROM usage_events ORDER BY kind');
  assert.deepEqual(rows, [{ kind: 'book_search', query_text: 'wings of fire [removed]', hour: true }, { kind: 'near_me', query_text: null, hour: true }]);
  await assert.rejects(runtime.query('SELECT * FROM usage_events'), { code: '42501' });
  // No column can hold a reader's address, agent, device, account or location.
  const { rows: columns } = await admin.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'usage_events'`);
  for (const { column_name: name } of columns) assert.ok(!/ip|agent|device|account|session|cookie|lat|lon|coord|referr|user/.test(name), name);
  assert.deepEqual((await dailyUsage(admin, { kind: 'book_search' })).map(r => r.events), [1]);

  const submissions = createSubmissions({ db: runtime, secret: 'x'.repeat(40), defer: async task => { await task(); } });
  const text = { displayText: 'Anna Centenary Library', requestKey: 'anna centenary library' };
  assert.equal(await submissions.libraryRequest(text, { address: '203.0.113.1' }), 'accepted');
  assert.equal(await submissions.libraryRequest(text, { address: '203.0.113.1' }), 'duplicate');
  assert.equal(await submissions.libraryRequest(text, { address: '203.0.113.2' }), 'accepted');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual((await admin.query('SELECT request_key, display_text, request_count FROM library_requests')).rows,
    [{ request_key: 'anna centenary library', display_text: 'Anna Centenary Library', request_count: 2 }]);
  const outcomes = [];
  for (let i = 0; i < 6; i += 1) outcomes.push(await submissions.problemReport({ body: `report ${i}`, screen: 'book' }, { address: '203.0.113.9' }));
  assert.deepEqual(outcomes.filter(o => o === 'limited').length, 1);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM problem_reports')).rows[0].n, 5);
  // Buckets are digests, never the address.
  const { rows: buckets } = await admin.query('SELECT bucket FROM submission_buckets');
  assert.ok(buckets.length && buckets.every(b => b.bucket.length === 32 && !b.bucket.toString('latin1').includes('203.0.113')));
  await assert.rejects(runtime.query('SELECT body FROM problem_reports'), { code: '42501' });

  // Two instances share the host's spacing and per-minute cap.
  const [one, two] = [createPgHostGate(runtime), createPgHostGate(runtime)];
  const startedAt = Date.now();
  await one.reserve('vpl.example', { spacingMs: 400, deadlineAt: Date.now() + 5_000 });
  await two.reserve('vpl.example', { spacingMs: 400, deadlineAt: Date.now() + 5_000 });
  assert.ok(Date.now() - startedAt >= 350, 'the second instance waited for the slot');
  await assert.rejects(one.reserve('vpl.example', { spacingMs: 60_000, deadlineAt: Date.now() + 100 }).then(() => two.reserve('vpl.example', { spacingMs: 60_000, deadlineAt: Date.now() + 100 })),
    { code: 'CATALOG_HOST_BUSY' });
  await one.reserve('koha.example', { perMinute: 2, deadlineAt: Date.now() + 1_000 });
  await two.reserve('koha.example', { perMinute: 2, deadlineAt: Date.now() + 1_000 });
  const second = new Date().getUTCSeconds();
  if (second < 58) await assert.rejects(one.reserve('koha.example', { perMinute: 2, deadlineAt: Date.now() + 500 }), { code: 'CATALOG_HOST_BUSY' });
});

test('daily maintenance as the worker: expiry, opt-out purge, retention, rollup without text', { skip, timeout: 60_000 }, async t => {
  const { admin, worker } = await prepare(t);
  await admin.query(`INSERT INTO holdings_answers (library_id, identity_kind, identity_value, answer, evidence, expires_at) VALUES
    ('koha:a', 'isbn13', '9788173711466', 'found', 'exact_isbn', now() - interval '1 day'),
    ('koha:a', 'isbn13', '9780140328721', 'found', 'exact_isbn', now() + interval '1 day'),
    ('bc:out', 'isbn13', '9780140328721', 'found', 'exact_isbn', now() + interval '100 days')`);
  await admin.query(`INSERT INTO submission_buckets VALUES (decode(repeat('ab', 32), 'hex'), 1, now() - interval '1 hour'), (decode(repeat('cd', 32), 'hex'), 1, now() + interval '1 hour')`);
  await admin.query(`INSERT INTO problem_reports (body, status, created_at, resolved_at) VALUES
    ('old resolved', 'resolved', now() - interval '100 days', now() - interval '95 days'),
    ('ancient', 'new', now() - interval '13 months', NULL), ('fresh', 'new', now(), NULL)`);
  await admin.query(`INSERT INTO library_requests (request_key, display_text, status, updated_at) VALUES
    ('spam text', 'spam text', 'spam', now() - interval '91 days'), ('added lib', 'Added lib', 'added', now() - interval '13 months'),
    ('open lib', 'Open lib', 'open', now() - interval '2 years')`);
  await admin.query(`INSERT INTO usage_events (occurred_hour, kind, query_text, library_id, outcome, result_count, duration_ms) VALUES
    (date_trunc('hour', now() - interval '13 months', 'UTC'), 'book_search', 'private words', '', 'results', 9, 100),
    (date_trunc('hour', now() - interval '13 months', 'UTC'), 'book_search', 'other words', '', 'results', 3, 300),
    (date_trunc('hour', now(), 'UTC'), 'book_search', 'recent words', NULL, 'none', 0, 50)`);
  await admin.query(`INSERT INTO library_check_events (library_id, host, platform, operation, failure, duration_ms, requests, occurred_at) VALUES
    ('koha:a', 'a.example', 'koha', 'book_check', 'timeout', 1, 1, now() - interval '91 days')`);
  await admin.query(`INSERT INTO host_request_windows VALUES ('a.example', now() - interval '2 hours', 3), ('a.example', date_trunc('minute', now()), 1)`);
  const policy = createCatalogPolicy({ policies: { schemaVersion: 1, libraries: { 'bc:out': { storeAnswers: false, reason: 'Asked', reviewedOn: '2026-11-12' } } } });
  const result = await runCatalogMaintenance(worker, { policy });
  assert.deepEqual([result.expiredAnswers, result.purgedAnswers, result.buckets, result.reports, result.requests, result.usage.events, result.checkEvents, result.hostWindows],
    [1, 1, 1, 2, 2, 2, 1, 1]);
  assert.deepEqual((await admin.query('SELECT library_id, identity_value FROM holdings_answers')).rows, [{ library_id: 'koha:a', identity_value: '9780140328721' }]);
  assert.deepEqual((await admin.query('SELECT body FROM problem_reports')).rows, [{ body: 'fresh' }]);
  assert.deepEqual((await admin.query('SELECT request_key FROM library_requests')).rows, [{ request_key: 'open lib' }]);
  assert.deepEqual((await admin.query('SELECT query_text FROM usage_events')).rows, [{ query_text: 'recent words' }]);
  const { rows: totals } = await admin.query('SELECT kind, library_id, outcome, events, results_sum, p50_ms, p95_ms FROM usage_daily_totals');
  assert.deepEqual(totals, [{ kind: 'book_search', library_id: '', outcome: 'results', events: 2, results_sum: '12', p50_ms: 200, p95_ms: 290 }]);
  const { rows: totalColumns } = await admin.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'usage_daily_totals'`);
  assert.ok(!totalColumns.some(c => /query|text|book/.test(c.column_name)), 'totals keep no text and no book keys');
  // The worker role cannot write answers or reports.
  await assert.rejects(worker.query(`INSERT INTO holdings_answers (library_id, identity_kind, identity_value, answer, evidence, expires_at) VALUES ('x:y', 'isbn13', '9780140328721', 'found', 'exact_isbn', now())`), { code: '42501' });
});

test('the maintenance route runs with the worker role and refuses the owner role', { skip, timeout: 60_000 }, async t => {
  await prepare(t);
  const secret = 'a synthetic cron secret that is long enough for tests';
  for (const [url, status] of [[roleURL('worker'), 200], [connectionString, 503]]) {
    const middleware = createCatalogMaintenanceMiddleware({ env: { CRON_SECRET: secret, CATALOG_WORKER_DATABASE_URL: url }, policy: createCatalogPolicy() });
    t.after(() => middleware.close());
    const response = await request(express().use(middleware)).get('/api/internal/catalog-maintenance').set('Authorization', `Bearer ${secret}`);
    assert.equal(response.status, status, url === connectionString ? 'owner' : 'worker');
    if (status === 200) assert.equal(typeof response.body.expiredAnswers, 'number');
  }
});

test('admin view queries as the catalog_admin role: grouped requests, reports, health, usage and the role guard', { skip, timeout: 60_000 }, async t => {
  const { admin, runtime, worker, adminRole } = await prepare(t);
  const queries = await import('../admin/queries.js');
  await admin.query(`INSERT INTO library_requests (request_key, display_text, request_count, last_requested_on) VALUES
    ('pune central library', 'Pune Central Library', 4, current_date), ('pune library', 'pune library', 2, current_date - 1),
    ('kozhikode public library', 'Kozhikode Public Library', 2, current_date), ('kozhicode', 'Kozhicode', 1, current_date)`);
  await admin.query(`INSERT INTO problem_reports (id, body, screen, library_id, book_key) VALUES
    ('11111111-2222-4333-8444-555555555555', '<script>alert(1)</script> wrong answer', 'book', 'koha:a', 'v1:isbn:9780140328721')`);
  await admin.query(`INSERT INTO library_health (library_id, platform, last_failure_at, last_failure, failures_since_success, flagged_at, flag_reason)
    VALUES ('koha:slow', 'koha', now(), 'timeout', 3, now(), '3 failed attempts on 2 days within 7 days'), ('koha:ok', 'koha', NULL, NULL, 0, NULL, NULL)`);
  await admin.query(`UPDATE library_health SET last_success_at = now() WHERE library_id = 'koha:ok'`);
  await admin.query(`INSERT INTO library_check_events (library_id, host, platform, operation, failure, error_code, duration_ms, requests, occurred_at) VALUES
    ('koha:slow', 'slow.example', 'koha', 'book_check', 'timeout', 'CATALOG_TIMEOUT', 20000, 3, now() - interval '1 day'),
    ('koha:slow', 'slow.example', 'koha', 'marks', 'unavailable', NULL, 900, 1, now() - interval '2 hours'),
    ('koha:slow', 'slow.example', 'koha', 'book_check', 'timeout', 'CATALOG_TIMEOUT', 20000, 3, now())`);
  await admin.query(`INSERT INTO holdings_answers (library_id, identity_kind, identity_value, answer, evidence, expires_at) VALUES
    ('koha:a', 'isbn13', '9780140328721', 'found', 'exact_isbn', now() + interval '1 day'), ('koha:a', 'isbn13', '9788173711466', 'not_found', 'isbn_not_listed', now() + interval '1 day')`);

  // The role guard: admin passes; runtime, worker and owner are refused.
  await queries.assertAdminRole(adminRole);
  for (const db of [runtime, worker]) await assert.rejects(queries.assertAdminRole(db), { code: 'STORE_ROLE_REJECTED' });
  const owner = createCatalogDatabase(connectionString);
  t.after(() => owner.end());
  await assert.rejects(queries.assertAdminRole(owner), { code: 'STORE_ROLE_REJECTED' });

  const requests = await queries.listLibraryRequests(adminRole);
  assert.equal(requests.total, 4);
  assert.deepEqual(requests.groups.map(g => [g.label, g.totalCount, g.requests.length]), [['Pune Central Library', 6, 2], ['Kozhikode Public Library', 3, 2]]);
  assert.match(requests.groups[0].requests[1].lastRequestedOn, /^\d{4}-\d{2}-\d{2}$/);
  const changed = await queries.updateLibraryRequest(adminRole, 'pune library', { status: 'added', note: 'Same as Pune Central' });
  assert.deepEqual([changed.status, changed.statusNote], ['added', 'Same as Pune Central']);
  assert.equal((await queries.updateLibraryRequest(adminRole, 'pune library', { note: '' })).statusNote, null);
  assert.equal(await queries.updateLibraryRequest(adminRole, 'missing', { status: 'spam' }), null);

  const { reports } = await queries.listProblemReports(adminRole);
  assert.equal(reports[0].body, '<script>alert(1)</script> wrong answer', 'stored and returned as plain text');
  const resolved = await queries.updateProblemReport(adminRole, reports[0].id, { status: 'resolved' });
  assert.ok(resolved.resolvedAt);
  assert.equal((await queries.updateProblemReport(adminRole, reports[0].id, { status: 'read' })).resolvedAt, null);

  const health = await queries.libraryHealth(adminRole);
  assert.deepEqual(health.libraries.map(l => [l.libraryId, l.flagged]), [['koha:slow', true], ['koha:ok', false]]);
  const slow = health.libraries[0];
  assert.deepEqual([slow.failures7d, slow.failuresByClass.timeout, slow.failuresByClass.unavailable, slow.host, slow.checks7d], [3, 2, 1, 'slow.example', null]);
  assert.deepEqual(slow.recentFailures.map(f => f.failure), ['timeout', 'unavailable', 'timeout']);
  assert.equal(health.checkTotalsFromLog, false, 'no totals without the log');
  const ack = await queries.acknowledgeLibraryHealth(adminRole, 'koha:slow', { acknowledged: true, note: 'Catalog moved' });
  assert.ok(ack.acknowledgedAt);
  assert.equal(ack.ownerNote, 'Catalog moved');
  assert.match(queries.libraryHealthCsv(await queries.libraryHealth(adminRole)), /koha:slow,.*Catalog moved/);

  // Usage: empty, then with log rows.
  let usage = await queries.usage(adminRole);
  assert.deepEqual([usage.hasData, usage.daily.length], [false, 0]);
  await admin.query(`INSERT INTO usage_events (occurred_hour, kind, query_text, library_id, book_key, outcome, result_count, found_count, duration_ms) VALUES
    (date_trunc('hour', now(), 'UTC'), 'book_search', 'rare title', NULL, NULL, 'none', 0, NULL, 300),
    (date_trunc('hour', now(), 'UTC'), 'book_search', 'wings of fire', NULL, NULL, 'results', 9, NULL, 300),
    (date_trunc('hour', now(), 'UTC'), 'book_check', NULL, 'koha:slow', 'v1:isbn:9780140328721', 'found', NULL, NULL, 1200),
    (date_trunc('hour', now(), 'UTC'), 'result_marks', 'wings of fire', 'koha:slow', NULL, 'done', 9, 2, 4000),
    (date_trunc('hour', now(), 'UTC'), 'library_finder', 'nowhere town', NULL, NULL, 'results', 0, NULL, 20)`);
  usage = await queries.usage(adminRole);
  assert.equal(usage.hasData, true);
  assert.deepEqual([usage.daily[0].book_search, usage.daily[0].searchesWithoutResults, usage.daily[0].book_check], [2, 1, 1]);
  assert.deepEqual(usage.noResultSearches, [{ text: 'rare title', count: 1 }]);
  assert.deepEqual(usage.marking, { runs: 1, booksShown: 9, booksMarked: 2 });
  assert.deepEqual(usage.libraryFinderWithoutResults, [{ text: 'nowhere town', count: 1 }]);
  assert.ok(!JSON.stringify(usage).includes('v1:isbn'), 'no book keys in the usage view');
  for (const [section, fields] of Object.entries(queries.USAGE_VIEW_FIELDS)) {
    for (const row of [usage[section]].flat()) for (const key of Object.keys(row)) assert.ok(fields.includes(key), `${section}.${key}`);
  }
  assert.equal((await queries.libraryHealth(adminRole)).libraries[0].checks7d, 3, 'totals from the log, never below failures');

  const summary = await queries.summary(adminRole, { policy: createCatalogPolicy({ policies: { schemaVersion: 1, libraries: { 'bc:out': { storeAnswers: false, reason: 'Asked', reviewedOn: '2026-11-12' } } } }) });
  assert.deepEqual(summary.answersByLibrary, [{ libraryId: 'koha:a', name: null, found: 1, notFound: 1 }]);
  assert.deepEqual(summary.optedOut.map(o => o.libraryId), ['bc:out']);
  assert.equal(summary.counts.flaggedLibraries, 1);

  // The admin role changes only status, notes and acknowledgements.
  await assert.rejects(adminRole.query(`UPDATE library_requests SET display_text = 'x'`), { code: '42501' });
  await assert.rejects(adminRole.query(`UPDATE problem_reports SET body = 'x'`), { code: '42501' });
  await assert.rejects(adminRole.query(`UPDATE library_health SET flagged_at = NULL`), { code: '42501' });
  await assert.rejects(adminRole.query(`DELETE FROM library_requests`), { code: '42501' });
  await assert.rejects(adminRole.query(`INSERT INTO usage_events (occurred_hour, kind, outcome) VALUES (now(), 'near_me', 'x')`), { code: '42501' });
  await assert.rejects(adminRole.query(`DELETE FROM holdings_answers`), { code: '42501' });
});

// The whole path with real accounts: Better Auth session, verified email,
// ADMIN_ACCOUNT_IDS, CSRF, and the catalog_admin role.
const accountURL = process.env.ACCOUNT_TEST_DATABASE_URL;
test('admin HTTP routes with a real account session: 404 until listed, then reads and CSRF-checked changes', { skip: skip || (!accountURL && 'Set disposable local ACCOUNT_TEST_DATABASE_URL.'), timeout: 60_000 }, async t => {
  const { admin } = await prepare(t);
  const { randomUUID } = await import('node:crypto');
  const { createApplication } = await import('../application.js');
  const { createAccountMiddleware } = await import('../accounts/middleware.js');
  const { createAccountService } = await import('../accounts/service.js');
  const { createAdminMiddleware } = await import('../admin/middleware.js');
  const { migrate } = await import('../db/migrate.js');
  const { prepareTestRoles, testRoleURL } = await import('../accounts/test-database.js');
  const { decryptMail } = await import('../jobs/mail.js');
  const url = new URL(accountURL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.endsWith('_test'));
  const accountsDb = new Pool({ connectionString: accountURL });
  const email = randomUUID() + '@example.test';
  let service, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (service) await service.close();
    const ids = (await accountsDb.query('SELECT id FROM "user" WHERE email=$1', [email])).rows.map(r => r.id);
    await accountsDb.query('DELETE FROM account_mail_jobs WHERE "authUserId"=ANY($1::text[])', [ids]);
    await accountsDb.query('DELETE FROM account_email_challenges WHERE "authUserId"=ANY($1::text[])', [ids]);
    await accountsDb.query('DELETE FROM "user" WHERE email=$1', [email]);
    await accountsDb.end();
  });
  await migrate(accountsDb);
  await prepareTestRoles(accountsDb);
  await admin.query(`INSERT INTO library_requests (request_key, display_text) VALUES ('setagaya', 'Setagaya')`);
  const env = { NODE_ENV: 'test', ACCOUNTS_ENABLED: 'true', ACCOUNTS_ENVIRONMENT: 'development', BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'test-only-secret-longer-than-32-characters' + randomUUID(), ACCOUNTS_AUTH_DATABASE_URL: testRoleURL(accountURL, 'auth'),
    ACCOUNTS_READING_DATABASE_URL: testRoleURL(accountURL, 'reading'), ACCOUNTS_JOB_SECRET: 'test-only-jobs-secret-longer-than-32-characters',
    RESEND_API_KEY: 'test-transport-not-called', ACCOUNTS_MAIL_FROM: 'accounts@example.test',
    ADMIN_ACCOUNT_IDS: '', CATALOG_ADMIN_DATABASE_URL: roleURL('admin') };
  const accounts = createAccountMiddleware({ env, initialize: async config => { service = await createAccountService(config, { checkPassword: async () => {} }); return service; } });
  const adminRoutes = createAdminMiddleware({ env, identify: accounts.identify });
  t.after(() => adminRoutes.close());
  const app = createApplication({ accounts, admin: adminRoutes });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (path, { method = 'GET', body, cookie = '', csrf = '', origin = env.BETTER_AUTH_URL } = {}) => fetch(base + path, { method,
    headers: { ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-Account-CSRF': csrf } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });

  assert.equal((await call('/api/admin/summary')).status, 410, 'signed out');
  assert.equal((await call('/api/account/sign-up', { method: 'POST', body: { name: 'Synthetic owner', email, password: 'a long synthetic password ' + randomUUID() } })).status, 202);
  const job = (await accountsDb.query(`SELECT payload FROM account_mail_jobs j JOIN "user" u ON u.id=j."authUserId" WHERE u.email=$1 AND kind='verify'`, [email])).rows[0];
  const { token } = decryptMail(job.payload, env.ACCOUNTS_JOB_SECRET);
  assert.equal((await call('/api/account/verify-email', { method: 'POST', body: { token } })).status, 200);
  const context = await service.auth.$context;
  const authUser = (await accountsDb.query('SELECT id FROM "user" WHERE email=$1', [email])).rows[0];
  const password = 'another long synthetic password ' + randomUUID();
  await context.internalAdapter.updatePassword(authUser.id, await context.password.hash(password));
  const signIn = await call('/api/account/sign-in', { method: 'POST', body: { email, password } });
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const session = await (await call('/api/account/session', { cookie })).json();
  assert.equal(session.status, 'authenticated');

  // Signed in and verified, but not listed: the same answer as any unknown path, with no admin headers.
  let response = await call('/api/admin/summary', { cookie });
  assert.equal(response.status, 410);
  assert.notEqual(response.headers.get('cache-control'), 'private, no-store');
  env.ADMIN_ACCOUNT_IDS = randomUUID();
  assert.equal((await call('/api/admin/summary', { cookie })).status, 410, 'another account listed');
  env.ADMIN_ACCOUNT_IDS = session.user.id;
  response = await call('/api/admin/summary', { cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex');
  assert.equal((await response.json()).store.state, 'ok');
  const groups = (await (await call('/api/admin/library-requests', { cookie })).json()).groups;
  assert.equal(groups[0].label, 'Setagaya');
  assert.equal((await call('/api/admin/library-requests/setagaya', { method: 'PATCH', body: { status: 'added' }, cookie })).status, 403, 'no CSRF token');
  assert.equal((await call('/api/admin/library-requests/setagaya', { method: 'PATCH', body: { status: 'added' }, cookie, csrf: session.csrfToken, origin: 'https://evil.example' })).status, 403);
  response = await call('/api/admin/library-requests/setagaya', { method: 'PATCH', body: { status: 'added', note: 'In the directory' }, cookie, csrf: session.csrfToken });
  assert.equal(response.status, 200);
  assert.equal((await admin.query(`SELECT status FROM library_requests WHERE request_key = 'setagaya'`)).rows[0].status, 'added');
  // Signed out again: the unknown-path answer.
  assert.equal((await call('/api/admin/summary')).status, 410);
});
