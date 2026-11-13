import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApplication } from '../application.js';
import { createAdminMiddleware } from './middleware.js';
import { readAdminConfig } from './config.js';
import { groupLibraryRequests, similarWords } from './grouping.js';
import { libraryHealthCsv, usage, USAGE_VIEW_FIELDS, FAILURE_CLASSES, updateLibraryRequest, AdminInputError } from './queries.js';
import { csrfForSession } from '../accounts/security.js';

const OWNER = '0b6f3f7e-8a4c-4f1e-9d55-3c2b1a0f9e88';
const OTHER = '6d1c0a52-1b2e-4c3d-8e9f-0a1b2c3d4e5f';
const BASE = 'http://localhost:3000';
const SECRET = 'test-only-secret-longer-than-32-characters-admin';
const accountConfig = { enabled: true, baseURL: BASE, secret: SECRET };
const identityFor = (id, { status = 'authenticated', verified = true } = {}) => ({
  status, identity: { status, sessionId: 'session-' + id, user: { id, emailVerified: verified } }, config: accountConfig,
});
const CSRF = csrfForSession(SECRET, 'session-' + OWNER);

function fakeQueries(overrides = {}) {
  const calls = [];
  const record = name => async (...args) => { calls.push([name, ...args.slice(1)]); return overrides[name] ? overrides[name](...args) : { ok: name }; };
  return {
    calls,
    module: {
      assertAdminRole: overrides.assertAdminRole || (async () => {}),
      summary: record('summary'), libraryHealth: async () => ({ libraries: [] }), libraryHealthCsv: () => 'library_id\r\n',
      listLibraryRequests: record('listLibraryRequests'), listProblemReports: record('listProblemReports'), usage: record('usage'),
      acknowledgeLibraryHealth: record('acknowledgeLibraryHealth'), updateLibraryRequest: record('updateLibraryRequest'),
      updateProblemReport: record('updateProblemReport'),
    },
  };
}

function appWith({ identify, env = {}, queries = fakeQueries() } = {}) {
  const passthrough = (req, res, next) => next();
  const admin = createAdminMiddleware({ env: { ADMIN_ACCOUNT_IDS: OWNER, CATALOG_ADMIN_DATABASE_URL: 'postgres://catalog_admin@db.invalid/catalog', ...env },
    identify, connect: () => ({ query: async () => ({ rows: [] }), end: async () => {} }), loadQueries: async () => queries.module });
  return { app: createApplication({ accounts: passthrough, jobs: passthrough, accountHealth: passthrough, catalogMaintenance: passthrough, admin }), queries };
}

const READS = ['/api/admin/summary', '/api/admin/library-health', '/api/admin/library-health.csv', '/api/admin/library-requests',
  '/api/admin/problem-reports', '/api/admin/usage'];

test('settings: only well-formed account IDs count; nothing configured means nobody is the owner', () => {
  assert.deepEqual(readAdminConfig({}).accountIds, []);
  assert.equal(readAdminConfig({}).databaseUrl, null);
  assert.deepEqual(readAdminConfig({ ADMIN_ACCOUNT_IDS: ` ${OWNER.toUpperCase()}, nope,${OTHER},${OWNER}` }).accountIds, [OWNER, OTHER]);
});

// What the app answers for any unknown /api path; the admin area must not differ.
const comparable = response => ({ status: response.status, body: response.text,
  headers: Object.fromEntries(Object.entries(response.headers).filter(([name]) => !['date', 'etag'].includes(name))) });
const COOKIE = 'session=synthetic';

test('signed out, unverified, other accounts, accounts off and account errors get exactly what an unknown path gets', async () => {
  const cases = [
    async () => ({ status: 'guest', identity: { status: 'guest' } }),
    async () => ({ status: 'disabled' }),
    async () => identityFor(OWNER, { status: 'unverified', verified: false }),
    async () => identityFor(OTHER),
    async () => { throw new Error('account database down'); },
    null,
  ];
  for (const identify of cases) {
    const { app, queries } = appWith({ identify });
    for (const cookie of [null, COOKIE]) {
      const send = (method, path) => { const r = request(app)[method](path); return cookie ? r.set('Cookie', cookie) : r; };
      for (const method of ['get', 'head', 'options', 'patch', 'post', 'delete']) {
        const unknown = comparable(await send(method, '/api/no-such-route'));
        for (const path of [...READS, '/api/admin', '/api/admin/nothing', '/api/admin/library-requests/pune', '/api/admin/summary/x']) {
          assert.deepEqual(comparable(await send(method, path)), unknown, `${method} ${path}`);
        }
      }
      const patch = await send('patch', '/api/admin/library-requests/pune').set('Origin', BASE).set('X-Account-CSRF', CSRF).send({ status: 'added' });
      assert.equal(patch.status, 410);
    }
    assert.equal(queries.calls.length, 0, 'no store call for a non-owner');
  }
  // The owner's ID with no ADMIN_ACCOUNT_IDS configured is not an owner.
  const { app } = appWith({ identify: async () => identityFor(OWNER), env: { ADMIN_ACCOUNT_IDS: '' } });
  assert.equal((await request(app).get('/api/admin/summary').set('Cookie', COOKIE)).status, 410);
});

test('the session is not read without a cookie, and a refreshed session cookie reaches the owner only', async () => {
  let calls = 0;
  const refreshing = id => async (req, res) => { calls += 1; res.append('Set-Cookie', 'session=refreshed; HttpOnly'); return identityFor(id); };
  const other = appWith({ identify: refreshing(OTHER) }).app;
  assert.equal((await request(other).get('/api/admin/summary')).status, 410);
  assert.equal(calls, 0, 'no cookie: the account service is not touched');
  const refused = await request(other).get('/api/admin/summary').set('Cookie', COOKIE);
  assert.deepEqual([refused.status, refused.headers['set-cookie']], [410, undefined]);
  assert.equal(calls, 1);
  const owner = await request(appWith({ identify: refreshing(OWNER) }).app).get('/api/admin/summary').set('Cookie', COOKIE);
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.headers['set-cookie'], ['session=refreshed; HttpOnly']);
});

test('when the admin URL changes, concurrent requests share one new connection and never query it before its role check', async () => {
  const events = [];
  let connections = 0;
  const gates = {};
  const opened = id => { gates[id] = {}; gates[id].done = new Promise(resolve => { gates[id].release = resolve; }); };
  const queries = fakeQueries({
    assertAdminRole: async db => { if (db.id > 1) await gates[db.id].done; events.push(['checked', db.id]); },
    listLibraryRequests: async db => { events.push(['query', db.id]); return { total: 0, groups: [] }; },
  });
  const env = { ADMIN_ACCOUNT_IDS: OWNER, CATALOG_ADMIN_DATABASE_URL: 'postgres://catalog_admin@db.invalid/one' };
  const admin = createAdminMiddleware({ env, identify: async () => identityFor(OWNER), loadQueries: async () => queries.module,
    connect: () => { const id = ++connections; opened(id); return { id, end: () => new Promise(resolve => setTimeout(resolve, 30)) }; } });
  const passthrough = (req, res, next) => next();
  const app = createApplication({ accounts: passthrough, jobs: passthrough, accountHealth: passthrough, catalogMaintenance: passthrough, admin });
  const get = () => request(app).get('/api/admin/library-requests').set('Cookie', COOKIE).then(response => response);
  assert.equal((await get()).status, 200);
  env.CATALOG_ADMIN_DATABASE_URL = 'postgres://catalog_admin@db.invalid/two';
  const pending = [get(), new Promise(resolve => setTimeout(resolve, 10)).then(get)];
  await new Promise(resolve => setTimeout(resolve, 80));
  gates[2]?.release();
  await new Promise(resolve => setTimeout(resolve, 40));
  for (const gate of Object.values(gates)) gate.release();
  for (const response of await Promise.all(pending)) assert.equal(response.status, 200);
  for (const [index, [kind, id]] of events.entries()) {
    if (kind === 'query') assert.ok(events.slice(0, index).some(([k, i]) => k === 'checked' && i === id), `query on connection ${id} before its check: ${JSON.stringify(events)}`);
  }
  assert.equal(connections, 2, 'one new connection for the new URL');
});

test('the owner reads every view; unknown admin paths are like any unknown path and wrong methods 405', async () => {
  const { app, queries } = appWith({ identify: async () => identityFor(OWNER) });
  const get = path => request(app).get(path).set('Cookie', COOKIE);
  for (const path of READS) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(response.headers['x-robots-tag'], 'noindex');
  }
  const csv = await get('/api/admin/library-health.csv');
  assert.match(csv.headers['content-type'], /^text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment/);
  const summary = await get('/api/admin/summary');
  assert.equal(summary.body.store.state, 'ok');
  assert.equal(summary.body.usageLogEnabled, false);
  for (const path of ['/api/admin/nothing', '/api/admin', '/api/admin/summary/x', '/api/admin/usage/x', '/api/admin/library-health.csv/x', '/api/admin/summary/']) {
    assert.equal((await get(path)).status, 410, path);
  }
  const wrong = await request(app).delete('/api/admin/library-requests/pune').set('Cookie', COOKIE).set('Origin', BASE);
  assert.deepEqual([wrong.status, wrong.headers.allow], [405, 'PATCH']);
  assert.ok(queries.calls.some(([name]) => name === 'usage'));
});

test('no admin data under /api/v2', async () => {
  const { app, queries } = appWith({ identify: async () => identityFor(OWNER) });
  for (const path of READS) {
    const response = await request(app).get(path.replace('/api/admin', '/api/v2/admin'));
    assert.equal(response.status, 404);
    assert.equal(response.body.error.message, 'This public catalog endpoint does not exist.');
  }
  assert.equal(queries.calls.length, 0);
});

test('changes need the app origin, JSON and the session CSRF token', async () => {
  const { app, queries } = appWith({ identify: async () => identityFor(OWNER) });
  const path = '/api/admin/library-requests/' + encodeURIComponent('pune central');
  assert.equal((await request(app).patch(path).set('Cookie', COOKIE).set('X-Account-CSRF', CSRF).send({ status: 'added' })).body.error.code, 'ORIGIN_REJECTED');
  assert.equal((await request(app).patch(path).set('Cookie', COOKIE).set('Origin', 'https://evil.example').set('X-Account-CSRF', CSRF).send({ status: 'added' })).status, 403);
  const noToken = await request(app).patch(path).set('Cookie', COOKIE).set('Origin', BASE).send({ status: 'added' });
  assert.deepEqual([noToken.status, noToken.body.error.code], [403, 'CSRF_REJECTED']);
  const wrongToken = await request(app).patch(path).set('Cookie', COOKIE).set('Origin', BASE).set('X-Account-CSRF', 'a'.repeat(64)).send({ status: 'added' });
  assert.equal(wrongToken.status, 403);
  const form = await request(app).patch(path).set('Cookie', COOKIE).set('Origin', BASE).set('X-Account-CSRF', CSRF).type('form').send('status=added');
  assert.equal(form.status, 415);
  assert.equal(queries.calls.length, 0);
  const ok = await request(app).patch(path).set('Cookie', COOKIE).set('Origin', BASE).set('X-Account-CSRF', CSRF).send({ status: 'added', note: 'Koha found' });
  assert.equal(ok.status, 200);
  assert.deepEqual(queries.calls.at(-1), ['updateLibraryRequest', 'pune central', { status: 'added', note: 'Koha found' }]);
  await request(app).patch('/api/admin/library-health/koha%3Aslow').set('Cookie', COOKIE).set('Origin', BASE).set('X-Account-CSRF', CSRF).send({ acknowledged: true }).expect(200);
  assert.deepEqual(queries.calls.at(-1), ['acknowledgeLibraryHealth', 'koha:slow', { acknowledged: true }]);
  await request(app).patch('/api/admin/problem-reports/' + OTHER).set('Cookie', COOKIE).set('Origin', BASE).set('X-Account-CSRF', CSRF).send({ status: 'read' }).expect(200);
  assert.deepEqual(queries.calls.at(-1), ['updateProblemReport', OTHER, { status: 'read' }]);
});

test('the store not configured, unreachable or on the wrong role reads clearly and leaks no details', async () => {
  const identify = async () => identityFor(OWNER);
  const unset = appWith({ identify, env: { CATALOG_ADMIN_DATABASE_URL: '' } }).app;
  const summary = await request(unset).get('/api/admin/summary').set('Cookie', COOKIE).expect(200);
  assert.equal(summary.body.store.state, 'not_configured');
  assert.match(summary.body.store.message, /CATALOG_ADMIN_DATABASE_URL/);
  assert.equal(summary.body.counts, null);
  const health = await request(unset).get('/api/admin/library-health').set('Cookie', COOKIE).expect(503);
  assert.equal(health.body.error.code, 'STORE_NOT_CONFIGURED');

  const down = appWith({ identify, queries: fakeQueries({ assertAdminRole: async () => { throw Object.assign(new Error('connect ECONNREFUSED db.invalid:5432'), { code: 'ECONNREFUSED' }); } }) }).app;
  const unreachable = await request(down).get('/api/admin/summary').set('Cookie', COOKIE).expect(200);
  assert.deepEqual([unreachable.body.store.state, unreachable.body.store.detail], ['unreachable', 'ECONNREFUSED']);
  const failed = await request(down).get('/api/admin/usage').set('Cookie', COOKIE).expect(503);
  assert.equal(failed.body.error.code, 'STORE_UNREACHABLE');
  assert.ok(!JSON.stringify(failed.body).includes('db.invalid'));

  const runtime = appWith({ identify, queries: fakeQueries({ assertAdminRole: async () => { throw Object.assign(new Error('x'), { code: 'STORE_ROLE_REJECTED' }); } }) }).app;
  assert.equal((await request(runtime).get('/api/admin/summary').set('Cookie', COOKIE)).body.store.state, 'wrong_role');
  assert.equal((await request(runtime).get('/api/admin/library-requests').set('Cookie', COOKIE)).body.error.code, 'STORE_ROLE_REJECTED');
});

test('requests typed differently group together; different places stay apart', () => {
  assert.ok(similarWords('thiruvananthapuram', 'thiruvanathapuram'));
  assert.ok(similarWords('kozhikode', 'kozhicode'));
  assert.ok(!similarWords('pune', 'puna'), 'short words must match exactly');
  assert.ok(!similarWords('chennai', 'chenna1x'));
  const row = (requestKey, requestCount, lastRequestedOn = '2026-11-10') => ({ requestKey, displayText: requestKey, requestCount, lastRequestedOn, status: 'open' });
  const groups = groupLibraryRequests([
    row('pune central library', 4), row('pune library', 2, '2026-11-12'), row('pune public libary', 1),
    row('thiruvananthapuram public library', 3), row('thiruvanathapuram', 1),
    row('setagaya', 1), row('central library', 2), row('public library', 1),
  ]);
  const byLabel = Object.fromEntries(groups.map(group => [group.label, group]));
  assert.deepEqual(byLabel['pune central library'].requests.map(r => r.requestKey), ['pune central library', 'pune library', 'pune public libary']);
  assert.equal(byLabel['pune central library'].totalCount, 7);
  assert.equal(byLabel['pune central library'].lastRequestedOn, '2026-11-12');
  assert.deepEqual(byLabel['pune central library'].words, ['pune']);
  assert.equal(byLabel['thiruvananthapuram public library'].requests.length, 2);
  assert.equal(byLabel.setagaya.requests.length, 1);
  // Only generic words: never merged with anything.
  assert.equal(byLabel['central library'].requests.length, 1);
  assert.equal(groups[0].label, 'pune central library', 'largest total first');
});

test('health CSV escapes quotes and neutralises spreadsheet formulas', () => {
  const csv = libraryHealthCsv({ libraries: [{ libraryId: 'koha:a', name: 'A, "Main"', platform: 'koha', host: 'a.example', flaggedAt: null, flagReason: null,
    failures7d: 1, failuresByClass: Object.fromEntries(FAILURE_CLASSES.map(n => [n, 0])), checks7d: null, lastSuccessAt: null, lastFailureAt: null,
    lastFailure: 'timeout', medianMs: null, medianFailureMs: 20, acknowledgedAt: null, ownerNote: '=HYPERLINK("x")' }] });
  const [header, line] = csv.trim().split('\r\n');
  assert.match(header, /^library_id,name,platform,host,/);
  assert.ok(line.includes('"A, ""Main"""'));
  assert.ok(line.endsWith(`"'=HYPERLINK(""x"")"`));
  // Opened where ; or tab separates cells, a note must stay one cell, so no
  // formula can start mid-note.
  const row = note => libraryHealthCsv({ libraries: [{ libraryId: 'koha:a', name: null, platform: 'koha', host: null, flaggedAt: null, flagReason: null, failures7d: 0,
    failuresByClass: Object.fromEntries(FAILURE_CLASSES.map(n => [n, 0])), checks7d: null, lastSuccessAt: null, lastFailureAt: null, lastFailure: null,
    medianMs: null, medianFailureMs: null, acknowledgedAt: null, ownerNote: note }] }).trim().split('\r\n')[1];
  assert.ok(row('moved;=cmd|" /c calc"!A1').endsWith('"moved;=cmd|"" /c calc""!A1"'));
  assert.ok(row('a\t=1+1').endsWith('"a\t=1+1"'));
  for (const lead of ['=', '+', '-', '@', '\t', '\r']) assert.ok(row(lead + '1').endsWith(`'${lead}1"`) || row(lead + '1').endsWith(`'${lead}1`), JSON.stringify(lead));
});

test('usage view returns only allowlisted fields, whatever the database returns', async () => {
  const extra = { ip: '203.0.113.9', user_agent: 'x', account_id: OWNER, book_key: 'v1:isbn:9780000000002' };
  const db = { async query(sql) {
    if (/SELECT day, kind, sum\(events\)/.test(sql)) return { rows: [{ day: '2026-11-12', kind: 'book_search', events: 3, ...extra }] };
    if (/outcome = 'none' AND occurred_hour/.test(sql) && /::date::text AS day/.test(sql)) return { rows: [{ day: '2026-11-12', events: 1, ...extra }] };
    if (/kind = 'book_search' AND outcome = 'none' AND query_text/.test(sql)) return { rows: [{ query_text: 'rare book', events: 1, ...extra }] };
    if (/kind = 'book_check'/.test(sql)) return { rows: [{ library_id: 'koha:a', outcome: 'found', events: 2, p50: 10, p95: 20, ...extra }] };
    if (/kind = 'result_marks'/.test(sql)) return { rows: [{ runs: 1, shown: 9, marked: 2, ...extra }] };
    if (/kind = 'library_finder'/.test(sql)) return { rows: [{ query_text: 'nowhere', events: 1, ...extra }] };
    return { rows: [{ present: true, ...extra }] };
  } };
  const value = await usage(db);
  assert.deepEqual(Object.keys(value).sort(), ['daily', 'days', 'hasData', 'libraryChecks', 'libraryFinderWithoutResults', 'marking', 'noResultSearches']);
  for (const [section, fields] of Object.entries(USAGE_VIEW_FIELDS)) {
    const rows = Array.isArray(value[section]) ? value[section] : [value[section]];
    assert.ok(rows.length, section);
    for (const row of rows) for (const key of Object.keys(row)) assert.ok(fields.includes(key), `${section}.${key}`);
  }
  assert.ok(!JSON.stringify(value).includes('203.0.113.9'));
  assert.equal(value.daily[0].searchesWithoutResults, 1);
});

test('status and note changes are validated before any query', async () => {
  const db = { query: async () => { throw new Error('should not run'); } };
  for (const body of [{}, { status: 'deleted' }, { note: 'x'.repeat(501) }, { note: 'a‮b' }, { status: 'added', extra: 1 }, []]) {
    await assert.rejects(updateLibraryRequest(db, 'pune', body), AdminInputError);
  }
});
