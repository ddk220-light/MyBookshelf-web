import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import hostList from '../data/front-page-hosts.json' with { type: 'json' };
import { FRONT_PAGE_CHECK_PATH, FRONT_PAGE_OUTCOMES, checkFrontPage, createFrontPageCheckMiddleware, createFrontPageStore, frontPageHosts,
  runFrontPageChecks, wallSignal } from './frontPageCheck.js';

// Fake responses only: no request in these tests reaches a network.
const page = (status, body = '<html><title>Catalog</title></html>', headers = {}) => ({ status, headers: new Headers(headers), text: async () => body });
function site({ robots = { status: 404, text: '' }, pages = {} } = {}) {
  const asked = [];
  return {
    asked,
    fetchPolicy: async url => { asked.push(['robots', url]); if (robots instanceof Error) throw robots; return robots; },
    fetchImpl: async (url, options) => {
      asked.push(['page', url, options]);
      const answer = pages[new URL(url).pathname] ?? page(200);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

test('the host list: valid, unique host names, flagged Koha and Aspen hosts and Polaris hosts opened by literal matching', () => {
  const hosts = frontPageHosts();
  assert.equal(hosts.length, hostList.hosts.length);
  assert.ok(hosts.length >= 100);
  const why = new Set(hostList.hosts.map(item => item.why));
  assert.deepEqual([...why].sort(), ['flagged', 'polaris-literal']);
  for (const item of hostList.hosts) {
    assert.ok(['koha', 'aspen', 'polaris'].includes(item.family), item.host);
    assert.equal(item.why === 'polaris-literal', item.family === 'polaris', item.host);
    assert.ok(item.system && item.system.length <= 100, item.host);
  }
  assert.ok(hosts.includes('catalog.kohavt.org') && hosts.includes('gcpl.polarislibrary.com'));
  assert.throws(() => frontPageHosts({ hosts: [{ host: 'Bad Host' }] }), /valid host/);
  assert.throws(() => frontPageHosts({ hosts: [{ host: 'a.example.org' }, { host: 'a.example.org' }] }), /twice/);
});

test('one host: robots.txt first, then one GET of the front page as MyBookshelf/1.0, no search, nothing of the page kept', async () => {
  const fake = site({ robots: { status: 200, text: 'User-agent: *\nContent-Signal: search=yes\nAllow: /\n\nUser-agent: Claude-User\nDisallow: /\n' } });
  const result = await checkFrontPage('catalog.kohavt.org', fake);
  assert.deepEqual(result, { host: 'catalog.kohavt.org', outcome: 'open', status: 200, robotsStatus: 200, wall: false, wallSignal: null, movedTo: null,
    durationMs: result.durationMs });
  assert.deepEqual(fake.asked.map(([kind, url]) => [kind, url]), [['robots', 'https://catalog.kohavt.org/robots.txt'], ['page', 'https://catalog.kohavt.org/']]);
  const [, , options] = fake.asked[1];
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'manual');
  assert.match(options.headers['User-Agent'], /^MyBookshelf\/1\.0 \(web; \+https:\/\/mybookshelf\.cloud\/privacy\)$/);
  assert.equal(new URL(fake.asked[1][1]).search, '');
  assert.ok(FRONT_PAGE_OUTCOMES.includes(result.outcome));
});

test('robots.txt is obeyed for the app\'s own token, literally: a refusal or a 5xx/429 robots.txt asks no page', async () => {
  for (const [robots, outcome] of [[{ status: 200, text: 'User-agent: *\nDisallow: /\n' }, 'robots_disallowed'],
    [{ status: 200, text: 'User-agent: MyBookshelf\nDisallow: /\n\nUser-agent: *\nAllow: /\n' }, 'robots_disallowed'],
    [{ status: 503, text: '' }, 'robots_unavailable'], [{ status: 429, text: '' }, 'robots_unavailable']]) {
    const fake = site({ robots });
    const result = await checkFrontPage('a.example.org', fake);
    assert.equal(result.outcome, outcome, robots.text || String(robots.status));
    assert.equal(fake.asked.filter(([kind]) => kind === 'page').length, 0);
  }
  // The vendor Polaris template names only the capital-P search path: the front page is allowed.
  const polaris = site({ robots: { status: 200, text: 'User-agent: *\nDisallow: /Polaris/search/\n' }, pages: { '/': page(302, '', { location: '/polaris/' }) } });
  assert.equal((await checkFrontPage('gcpl.polarislibrary.com', polaris)).outcome, 'open');
  assert.deepEqual(polaris.asked.filter(([kind]) => kind === 'page').map(([, url]) => url), ['https://gcpl.polarislibrary.com/', 'https://gcpl.polarislibrary.com/polaris/']);
  // A redirect into a disallowed path is not followed.
  const into = site({ robots: { status: 200, text: 'User-agent: *\nDisallow: /Polaris/search/\n' }, pages: { '/': page(302, '', { location: '/Polaris/search/default.aspx' }) } });
  assert.equal((await checkFrontPage('x.example.org', into)).outcome, 'robots_disallowed');
  assert.equal(into.asked.filter(([kind]) => kind === 'page').length, 1);
});

test('walls and challenges are recognised by their marks; 403 and 429 are recorded as such', async () => {
  const cases = [
    [page(403, '<html><title>Just a moment...</title></html>', { 'cf-mitigated': 'challenge', server: 'cloudflare' }), 'wall', 'cloudflare-challenge'],
    [page(200, '<script src="/.within.website/x/cmd/anubis/static/js/main.mjs"></script> Making sure you&#39;re not a bot!'), 'wall', 'anubis'],
    [page(200, '<script>var hashcash = new Hashcash();</script>'), 'wall', 'hashcash'],
    [page(200, '<iframe src="/_Incapsula_Resource?SWJIYLWA=1"></iframe>'), 'wall', 'imperva'],
    [page(405, '<script src="https://x.token.awswaf.com/challenge.js"></script>', { 'x-amzn-waf-action': 'challenge' }), 'wall', 'aws-waf'],
    [page(403, '<div class="g-recaptcha"></div>'), 'wall', 'captcha'],
    [page(403, 'Forbidden'), 'refused', null],
    [page(429, 'Too many requests'), 'rate_limited', null],
    [page(404, 'Not found'), 'not_found', null],
    [page(503, 'Down'), 'server_error', null],
    // A captcha on a working page (a form of the catalog's own) is not a wall.
    [page(200, '<form><div class="g-recaptcha"></div></form>'), 'open', null],
  ];
  for (const [answer, outcome, signal] of cases) {
    const result = await checkFrontPage('a.example.org', site({ pages: { '/': answer } }));
    assert.deepEqual([result.outcome, result.status, result.wall, result.wallSignal], [outcome, answer.status, Boolean(signal), signal], `${answer.status} ${outcome}`);
  }
  assert.equal(wallSignal({ status: 200, headers: new Headers({ 'x-datadome': 'protected' }) }), 'datadome');
});

test('redirects: the same host is followed after its Crawl-delay; another host is recorded as moved and never followed', async () => {
  const waited = [];
  const koha = site({ robots: { status: 200, text: 'User-agent: *\nCrawl-delay: 20\nDisallow: /cgi-bin/koha/opac-search.pl\n' },
    pages: { '/': page(301, '', { location: '/cgi-bin/koha/opac-main.pl' }) } });
  const result = await checkFrontPage('a.example.org', { ...koha, wait: async ms => { waited.push(ms); } });
  assert.equal(result.outcome, 'open');
  assert.deepEqual(waited, [20_000]);
  const moved = site({ pages: { '/': page(302, '', { location: 'https://catalog.elsewhere.org/' }) } });
  const away = await checkFrontPage('a.aspendiscovery.org', moved);
  assert.deepEqual([away.outcome, away.status, away.movedTo], ['moved', 302, 'catalog.elsewhere.org']);
  assert.equal(moved.asked.filter(([kind]) => kind === 'page').length, 1);
  // A redirect loop stops after three hops.
  const loop = site({ pages: { '/': page(302, '', { location: '/a' }), '/a': page(302, '', { location: '/b' }), '/b': page(302, '', { location: '/c' }), '/c': page(302, '', { location: '/' }) } });
  assert.equal((await checkFrontPage('a.example.org', loop)).outcome, 'redirect_loop');
  // A Crawl-delay longer than the check waits: it stops at the redirect.
  const slow = site({ robots: { status: 200, text: 'User-agent: *\nCrawl-delay: 180\n' }, pages: { '/': page(302, '', { location: '/x' }) } });
  assert.deepEqual(Object.values(await checkFrontPage('a.example.org', { ...slow, wait: () => assert.fail('no wait') })).slice(1, 3), ['open', 302]);
  // A host that does not answer.
  const down = site({ robots: new Error('ECONNREFUSED'), pages: { '/': Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }) } });
  assert.equal((await checkFrontPage('a.example.org', down)).outcome, 'unreachable');
  assert.equal((await checkFrontPage('not a host', down)).outcome, 'unreachable');
});

function memoryStore() {
  const rows = new Map();
  return { rows, done: async () => new Set(rows.keys()), claim: async hosts => hosts.filter(host => !rows.has(host) && rows.set(host, { outcome: 'pending' })),
    save: async result => { rows.set(result.host, result); } };
}

test('a run checks each host once: a host with a result is never asked again', async () => {
  const store = memoryStore();
  const checked = [];
  const check = async host => { checked.push(host); return { host, outcome: 'open', status: 200, robotsStatus: 404, wall: false, wallSignal: null, movedTo: null, durationMs: 5 }; };
  const hosts = ['a.example.org', 'b.example.org', 'c.example.org'];
  const first = await runFrontPageChecks({ store, hosts, limit: 2, check });
  assert.deepEqual([first.checked.map(item => item.host), first.remaining, first.total], [['a.example.org', 'b.example.org'], 1, 3]);
  const second = await runFrontPageChecks({ store, hosts, limit: 2, check });
  assert.deepEqual([second.checked.map(item => item.host), second.remaining], [['c.example.org'], 0]);
  const third = await runFrontPageChecks({ store, hosts, limit: 2, check });
  assert.deepEqual(third.checked, []);
  assert.deepEqual(checked, hosts);
});

test('the store keeps only what came back: status, wall, signal, moved host and timing', async () => {
  const queries = [];
  const store = createFrontPageStore({ query: async (sql, values = []) => { queries.push({ sql, values }); return { rows: values[0]?.map?.(host => ({ host })) || [] }; } });
  assert.deepEqual(await store.claim(['a.example.org']), ['a.example.org']);
  await store.save({ host: 'a.example.org', outcome: 'wall', status: 403, robotsStatus: 200, wall: true, wallSignal: 'cloudflare-challenge', movedTo: null, durationMs: 812.4,
    body: '<html>secret</html>' });
  const save = queries.at(-1);
  assert.match(save.sql, /^UPDATE host_front_page_checks/);
  assert.deepEqual(save.values, ['a.example.org', 'wall', 403, 200, true, 'cloudflare-challenge', null, 812]);
  assert.ok(!JSON.stringify(queries).includes('secret'));
});

test('the internal route needs the cron secret and the worker role, and answers hosts and outcomes only', async () => {
  const secret = 'a synthetic cron secret that is long enough for tests';
  const app = middleware => express().use(middleware);
  assert.equal((await request(app(createFrontPageCheckMiddleware({ env: {} }))).post(FRONT_PAGE_CHECK_PATH)).status, 403);
  assert.equal((await request(app(createFrontPageCheckMiddleware({ env: { CRON_SECRET: secret } }))).post(FRONT_PAGE_CHECK_PATH).set('Authorization', 'Bearer wrong')).status, 403);
  // Without the worker database a host could be asked twice: unavailable.
  assert.equal((await request(app(createFrontPageCheckMiddleware({ env: { CRON_SECRET: secret } }))).post(FRONT_PAGE_CHECK_PATH).set('Authorization', `Bearer ${secret}`)).status, 503);
  const env = { CRON_SECRET: secret, CATALOG_WORKER_DATABASE_URL: 'postgres://worker@db.example/catalog' };
  const role = owns => ({ query: async () => ({ rows: [{ rolsuper: false, rolbypassrls: false, owns }] }) });
  let ran = null;
  const run = async ({ limit }) => { ran = limit; return { checked: [{ host: 'a.example.org', outcome: 'open', status: 200, robotsStatus: 404, wall: false, wallSignal: null,
    movedTo: null, durationMs: 9, body: 'not sent' }], remaining: 3, total: 4 }; };
  const owner = createFrontPageCheckMiddleware({ env, connect: () => role(true), run });
  assert.equal((await request(app(owner)).post(FRONT_PAGE_CHECK_PATH).set('Authorization', `Bearer ${secret}`)).status, 503, 'never as the owner role');
  const worker = createFrontPageCheckMiddleware({ env, connect: () => role(false), run });
  const response = await request(app(worker)).post(`${FRONT_PAGE_CHECK_PATH}?limit=50`).set('Authorization', `Bearer ${secret}`);
  assert.equal(response.status, 200);
  assert.equal(ran, 20, 'at most twenty hosts a call');
  assert.deepEqual(response.body, { checked: [{ host: 'a.example.org', outcome: 'open', status: 200, robotsStatus: 404, wall: false, wallSignal: null, movedTo: null,
    durationMs: 9 }], remaining: 3, total: 4 });
  assert.equal(response.headers['cache-control'], 'private, no-store');
  // Other paths pass through.
  assert.equal((await request(app(worker)).get('/elsewhere')).status, 404);
});
