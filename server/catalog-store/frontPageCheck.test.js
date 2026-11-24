import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import hostList from '../data/front-page-hosts.json' with { type: 'json' };
import resultList from '../data/front-page-results.json' with { type: 'json' };
import { LOG_PREFIX, WALL_SIGNALS, checkFrontPage, frontPageHosts, frontPageResult, frontPageResults, hostsWithoutResult, isChallenge, logLine,
  runFrontPageChecks } from './frontPageCheck.js';
import { CATALOG_MAINTENANCE_PATH, createCatalogMaintenanceMiddleware } from './cron.js';

// Fake responses only: no request in these tests reaches a network.
const DAY = Date.parse('2026-11-24T21:17:00Z');
const page = (status, body = '<html><title>Catalog</title></html>', headers = {}) => ({ status, headers: new Headers(headers), text: async () => body });
function site({ robots = { status: 404, text: '' }, pages = {} } = {}) {
  const asked = [];
  return {
    asked,
    now: () => DAY,
    fetchPolicy: async url => { asked.push(['robots', url]); if (robots instanceof Error) throw robots; return robots; },
    fetchImpl: async (url, options) => {
      asked.push(['page', url, options]);
      const answer = pages[new URL(url).pathname] ?? page(200);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}
const pagesAsked = fake => fake.asked.filter(([kind]) => kind === 'page').map(([, url]) => url);
const on = (host, values) => ({ host, date: '2026-11-24', ...values });

test('the host list and the committed results: valid, unique hosts; every result is one of the list\'s hosts', () => {
  const hosts = frontPageHosts();
  assert.equal(hosts.length, hostList.hosts.length);
  assert.ok(hosts.length >= 100);
  assert.deepEqual([...new Set(hostList.hosts.map(item => item.why))].sort(), ['flagged', 'polaris-literal']);
  for (const item of hostList.hosts) {
    assert.ok(['koha', 'aspen', 'polaris'].includes(item.family), item.host);
    assert.equal(item.why === 'polaris-literal', item.family === 'polaris', item.host);
  }
  assert.throws(() => frontPageHosts({ hosts: [{ host: 'Bad Host' }] }), /valid host/);
  assert.throws(() => frontPageHosts({ hosts: [{ host: 'a.example.org' }, { host: 'a.example.org' }] }), /twice/);
  const results = frontPageResults();
  for (const host of results.keys()) assert.ok(hosts.includes(host), host);
  assert.deepEqual(resultList.results.map(item => item.host), [...resultList.results.map(item => item.host)].sort(), 'sorted by host');
  assert.equal(hostsWithoutResult().length, hosts.length - results.size);
  // A result keeps only its own fields.
  assert.throws(() => frontPageResults({ results: [on('a.example.org', { status: 200, wall: 'none', body: '<html>' })] }), /invalid/);
  assert.throws(() => frontPageResults({ results: [on('a.example.org', { status: 200, wall: 'blocked' })] }), /invalid/);
  const one = on('a.example.org', { status: 200, wall: 'none' });
  assert.throws(() => frontPageResults({ results: [one, one] }), /twice/);
  assert.deepEqual(hostsWithoutResult(['a.example.org', 'b.example.org'], frontPageResults({ results: [one] })), ['b.example.org']);
});

test('a result: only the kept fields; dates, statuses, signals and hosts are checked', () => {
  assert.deepEqual(frontPageResult(on('a.example.org', { status: 302, wall: 'none', movedTo: 'b.example.org', robots: undefined, durationMs: 5 })),
    on('a.example.org', { status: 302, wall: 'none', movedTo: 'b.example.org' }));
  for (const bad of [null, [], on('A.example.org', { status: 200, wall: 'none' }), { host: 'a.example.org', date: '24 Nov', status: 200, wall: 'none' },
    on('a.example.org', { status: 99, wall: 'none' }), on('a.example.org', { status: 200, wall: 'cloudflare' }),
    on('a.example.org', { status: 200, wall: 'none', robots: 'maybe' }), on('a.example.org', { status: 200, wall: 'none', movedTo: 'x' })]) {
    assert.equal(frontPageResult(bad), null, JSON.stringify(bad));
  }
});

test('one host: robots.txt first, then one GET of / as MyBookshelf/1.0, no search; the result is the date, status and wall only', async () => {
  const fake = site({ robots: { status: 200, text: 'User-agent: *\nContent-Signal: search=yes\nAllow: /\n\nUser-agent: Claude-User\nDisallow: /\n' } });
  const result = await checkFrontPage('catalog.kohavt.org', fake);
  assert.deepEqual(result, on('catalog.kohavt.org', { status: 200, wall: 'none' }));
  assert.deepEqual(fake.asked.map(([kind, url]) => [kind, url]), [['robots', 'https://catalog.kohavt.org/robots.txt'], ['page', 'https://catalog.kohavt.org/']]);
  const [, , options] = fake.asked[1];
  assert.deepEqual([options.method, options.redirect], ['GET', 'manual']);
  assert.match(options.headers['User-Agent'], /^MyBookshelf\/1\.0 \(web; \+https:\/\/mybookshelf\.cloud\/privacy\)$/);
  assert.equal(new URL(fake.asked[1][1]).search, '');
  // The log line: the prefix and the result, nothing else.
  assert.equal(logLine({ ...result, body: '<html>', headers: { cookie: 'x' } }),
    `${LOG_PREFIX} {"host":"catalog.kohavt.org","date":"2026-11-24","status":200,"wall":"none"}`);
});

test('robots.txt is obeyed for the app\'s own token, literally: a refusal or a 5xx/429 robots.txt asks no page', async () => {
  for (const [robots, expected] of [
    [{ status: 200, text: 'User-agent: *\nDisallow: /\n' }, { status: null, wall: 'none', robots: 'disallowed' }],
    [{ status: 200, text: 'User-agent: MyBookshelf\nDisallow: /\n\nUser-agent: *\nAllow: /\n' }, { status: null, wall: 'none', robots: 'disallowed' }],
    [{ status: 503, text: '' }, { status: null, wall: 'unreachable', robots: 'unavailable' }],
    [{ status: 429, text: '' }, { status: null, wall: '429', robots: 'unavailable' }]]) {
    const fake = site({ robots });
    assert.deepEqual(await checkFrontPage('a.example.org', fake), on('a.example.org', expected), robots.text || String(robots.status));
    assert.deepEqual(pagesAsked(fake), []);
  }
  // The vendor Polaris template names only the capital-P search path: the front page is allowed.
  const polaris = site({ robots: { status: 200, text: 'User-agent: *\nDisallow: /Polaris/search/\n' }, pages: { '/': page(302, '', { location: '/polaris/' }) } });
  assert.deepEqual(await checkFrontPage('gcpl.polarislibrary.com', polaris), on('gcpl.polarislibrary.com', { status: 200, wall: 'none' }));
  assert.deepEqual(pagesAsked(polaris), ['https://gcpl.polarislibrary.com/', 'https://gcpl.polarislibrary.com/polaris/']);
  // A redirect into a disallowed path is not followed.
  const into = site({ robots: { status: 200, text: 'User-agent: *\nDisallow: /Polaris/search/\n' }, pages: { '/': page(302, '', { location: '/Polaris/search/default.aspx' }) } });
  assert.deepEqual(await checkFrontPage('x.example.org', into), on('x.example.org', { status: 302, wall: 'none', robots: 'disallowed' }));
  assert.equal(pagesAsked(into).length, 1);
});

test('the wall signal: a challenge page by its marks, 403 and 429 as such, unreachable when nothing answers', async () => {
  const cases = [
    [page(403, '<html><title>Just a moment...</title></html>', { 'cf-mitigated': 'challenge', server: 'cloudflare' }), 'challenge'],
    [page(200, '<script src="/.within.website/x/cmd/anubis/static/js/main.mjs"></script> Making sure you&#39;re not a bot!'), 'challenge'],
    [page(200, '<script>var hashcash = new Hashcash();</script>'), 'challenge'],
    [page(200, '<iframe src="/_Incapsula_Resource?SWJIYLWA=1"></iframe>'), 'challenge'],
    [page(405, '<script src="https://x.token.awswaf.com/challenge.js"></script>', { 'x-amzn-waf-action': 'challenge' }), 'challenge'],
    [page(403, '<div class="g-recaptcha"></div>'), 'challenge'],
    [page(403, 'Forbidden'), '403'],
    [page(401, 'Unauthorized'), '403'],
    [page(429, 'Too many requests'), '429'],
    [page(404, 'Not found'), 'none'],
    [page(503, 'Down'), 'none'],
    // A captcha on a working page (a form of the catalog's own) is not a wall.
    [page(200, '<form><div class="g-recaptcha"></div></form>'), 'none'],
  ];
  for (const [answer, wall] of cases) {
    const result = await checkFrontPage('a.example.org', site({ pages: { '/': answer } }));
    assert.deepEqual([result.status, result.wall], [answer.status, wall], `${answer.status} ${wall}`);
    assert.ok(WALL_SIGNALS.includes(result.wall));
  }
  assert.equal(isChallenge({ status: 200, headers: new Headers({ 'x-datadome': 'protected' }) }), true);
  const down = site({ robots: new Error('ECONNREFUSED'), pages: { '/': Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }) } });
  assert.deepEqual(await checkFrontPage('a.example.org', down), on('a.example.org', { status: null, wall: 'unreachable' }));
  assert.equal(await checkFrontPage('not a host', down), null);
});

test('redirects: the same host is followed; another host is recorded as moved and never followed', async () => {
  const moved = site({ pages: { '/': page(301, '', { location: 'https://catalog.elsewhere.org/' }) } });
  assert.deepEqual(await checkFrontPage('a.aspendiscovery.org', moved), on('a.aspendiscovery.org', { status: 301, wall: 'none', movedTo: 'catalog.elsewhere.org' }));
  assert.equal(pagesAsked(moved).length, 1);
  // A redirect loop stops after three hops, keeping the last redirect.
  const loop = site({ pages: { '/': page(302, '', { location: '/a' }), '/a': page(302, '', { location: '/b' }), '/b': page(302, '', { location: '/c' }),
    '/c': page(302, '', { location: '/' }) } });
  assert.deepEqual(await checkFrontPage('a.example.org', loop), on('a.example.org', { status: 302, wall: 'none' }));
  assert.equal(pagesAsked(loop).length, 4);
});

test('Crawl-delay: every GET after robots.txt waits it; one longer than a run can wait, or no room left in the run, asks nothing', async () => {
  const waited = [];
  const koha = site({ robots: { status: 200, text: 'User-agent: *\nCrawl-delay: 20\nDisallow: /cgi-bin/koha/opac-search.pl\n' },
    pages: { '/': page(301, '', { location: '/cgi-bin/koha/opac-main.pl' }) } });
  assert.deepEqual(await checkFrontPage('a.example.org', { ...koha, wait: async ms => { waited.push(ms); } }), on('a.example.org', { status: 200, wall: 'none' }));
  assert.deepEqual(waited, [20_000, 20_000]);
  const slow = site({ robots: { status: 200, text: 'User-agent: *\nCrawl-delay: 180\n' } });
  assert.deepEqual(await checkFrontPage('a.example.org', { ...slow, wait: () => assert.fail('no wait') }),
    on('a.example.org', { status: null, wall: 'none', robots: 'crawl-delay' }));
  assert.deepEqual(pagesAsked(slow), []);
  // The run would end before the delay and the page: no result, asked in a later run.
  const late = site({ robots: { status: 200, text: 'User-agent: *\nCrawl-delay: 10\n' } });
  assert.equal(await checkFrontPage('a.example.org', { ...late, deadlineAt: DAY + 20_000, wait: () => assert.fail('no wait') }), null);
  assert.deepEqual(pagesAsked(late), []);
});

test('a run: the hosts without a result, a few at once, each finished host logged once as one line', async () => {
  const lines = [];
  let running = 0, most = 0;
  const check = async host => {
    running += 1; most = Math.max(most, running);
    await new Promise(resolve => setTimeout(resolve, 2));
    running -= 1;
    return host.startsWith('late') ? null : on(host, { status: host.startsWith('w') ? 403 : 200, wall: host.startsWith('w') ? '403' : 'none', extra: 'x' });
  };
  const hosts = ['a.example.org', 'b.example.org', 'wall.example.org', 'late.example.org', 'c.example.org', 'd.example.org'];
  assert.deepEqual(await runFrontPageChecks({ hosts, check, concurrency: 2, log: line => lines.push(line) }), { checked: 5, remaining: 1 });
  assert.equal(most, 2);
  assert.deepEqual(lines.sort(), [
    'front-page-check {"host":"a.example.org","date":"2026-11-24","status":200,"wall":"none"}',
    'front-page-check {"host":"b.example.org","date":"2026-11-24","status":200,"wall":"none"}',
    'front-page-check {"host":"c.example.org","date":"2026-11-24","status":200,"wall":"none"}',
    'front-page-check {"host":"d.example.org","date":"2026-11-24","status":200,"wall":"none"}',
    'front-page-check {"host":"wall.example.org","date":"2026-11-24","status":403,"wall":"403"}']);
  // No host is started once the run's time is too short to finish it.
  let time = 0;
  const started = [];
  const timed = await runFrontPageChecks({ hosts, concurrency: 1, runMs: 50_000, now: () => time, log: () => {},
    check: async host => { started.push(host); time += 20_000; return on(host, { status: 200, wall: 'none' }); } });
  assert.deepEqual([started, timed], [['a.example.org', 'b.example.org'], { checked: 2, remaining: 4 }]);
  // Nothing left: nothing asked.
  assert.deepEqual(await runFrontPageChecks({ hosts: [], check: () => assert.fail('nothing to check'), log: () => assert.fail('nothing to log') }),
    { checked: 0, remaining: 0 });
  // A check that throws is no result; the run goes on.
  assert.deepEqual(await runFrontPageChecks({ hosts: ['a.example.org', 'b.example.org'], log: () => {},
    check: async host => { if (host === 'a.example.org') throw new Error('x'); return on(host, { status: 200, wall: 'none' }); } }), { checked: 1, remaining: 1 });
});

test('the daily catalog job runs the front-page check in production only, beside the maintenance, and answers counts only', async () => {
  const secret = 'a synthetic cron secret that is long enough for tests';
  // A worker database that answers the role check and has nothing to clean.
  const worker = { query: async sql => (/rolsuper/.test(sql) ? { rows: [{ rolsuper: false, rolbypassrls: false, owns: false }] } : { rows: [], rowCount: 0 }) };
  const call = async (env, frontPage, authorization = `Bearer ${secret}`) => {
    const middleware = createCatalogMaintenanceMiddleware({ env: { CRON_SECRET: secret, CATALOG_WORKER_DATABASE_URL: 'postgres://worker@db.example/catalog', ...env },
      connect: () => worker, frontPage });
    return request(express().use(middleware)).get(CATALOG_MAINTENANCE_PATH).set('Authorization', authorization);
  };
  let runs = 0;
  const frontPage = async () => { runs += 1; return { checked: 3, remaining: 1, lines: ['not sent'] }; };
  // Not production (a preview, a developer's machine): never run.
  for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) {
    const response = await call(env, frontPage);
    assert.deepEqual([response.status, response.body.frontPage], [200, undefined]);
  }
  assert.equal(runs, 0);
  // Production: both; the answer has the check's counts only.
  const done = await call({ VERCEL_ENV: 'production' }, frontPage);
  assert.equal(done.status, 200);
  assert.deepEqual(done.body.frontPage, { checked: 3, remaining: 1 });
  assert.equal(runs, 1);
  // Without the worker database the check still runs; the maintenance answers unavailable.
  const noDatabase = await call({ VERCEL_ENV: 'production', CATALOG_WORKER_DATABASE_URL: '' }, frontPage);
  assert.deepEqual([noDatabase.status, runs], [503, 2]);
  // A failing check never fails the maintenance.
  const failing = await call({ VERCEL_ENV: 'production' }, async () => { throw new Error('x'); });
  assert.deepEqual([failing.status, failing.body.frontPage], [200, undefined]);
  // Without the secret nothing runs.
  assert.equal((await call({ VERCEL_ENV: 'production' }, frontPage, 'Bearer wrong')).status, 403);
  assert.equal(runs, 2);
});
