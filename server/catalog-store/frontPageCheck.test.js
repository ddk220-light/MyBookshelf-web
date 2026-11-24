import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import hostList from '../data/front-page-hosts.json' with { type: 'json' };
import resultList from '../data/front-page-results.json' with { type: 'json' };
import { CATALOG_LINK_PREFIX, LOG_PREFIX, MEMBER_LIST_PREFIX, WALL_SIGNALS, catalogLinkItems, catalogLinkLines, checkCatalogLink, checkFrontPage, checkMemberList,
  frontPageHosts, frontPageResult, frontPageResults, hostsWithoutResult, isChallenge, linkFamily, logLine, memberListItems, memberListLines, memberOptions,
  pendingFrontPageWork, runFrontPageChecks } from './frontPageCheck.js';
import usListed from '../data/us-catalogs-listed.json' with { type: 'json' };
import { getAllLibraries } from '../services/directory.js';
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
  // flagged: robots.txt allows the app but blocks AI agents; unseen: no agent was cleared to look (Metro OKC's Grove-hosted
  // Aspen, the TLC DNS leads connected on 24 November 2026, the Polaris hosts with no robots.txt of USA plan step 6, the
  // Apollo hosts of step 7 that no agent contacted);
  // polaris-literal: the capital-P Polaris rule; wall-seen: a wall seen by a research agent (Nashville, Orange County FL, SWAN;
  // coordinator decision, 24 November 2026: the app's own check decides).
  assert.deepEqual([...new Set(hostList.hosts.map(item => item.why))].sort(), ['flagged', 'polaris-literal', 'unseen', 'wall-seen']);
  for (const item of hostList.hosts) {
    assert.ok(['koha', 'aspen', 'polaris', 'tlc', 'apollo'].includes(item.family), item.host);
    if (item.why === 'polaris-literal') assert.equal(item.family, 'polaris', item.host);
    if (item.family === 'polaris') assert.ok(['polaris-literal', 'unseen'].includes(item.why), item.host);
    if (item.family === 'tlc' || item.family === 'apollo') assert.equal(item.why, 'unseen', item.host);
    if (item.why === 'wall-seen') assert.equal(item.family, 'aspen', item.host);
  }
  // A Polaris host whose robots.txt blocks the lowercase /polaris/ too is class D, never on the list (research item 2).
  for (const host of ['catalog.onlib.org', 'vlc.polarislibrary.com', 'sbclib.polarislibrary.com']) assert.ok(!hosts.includes(host), host);
  // The Apollo catalogs agents saw without a wall need no check (Clear Lake and Lawton; the six whose catalog page an agent
  // read on 24 November 2026); the others are here (USA plan step 7). Georgia PINES's gateway, which an agent read
  // without a wall, is not here either (step 8).
  for (const host of ['cllibrary.biblionix.com', 'lawton.biblionix.com', 'brownsville.biblionix.com', 'horseshoebend.biblionix.com', 'anderson.biblionix.com',
    'gilford.biblionix.com', 'lamar.biblionix.com', 'orangecity.biblionix.com', 'gapines.org']) assert.ok(!hosts.includes(host), host);
  for (const host of ['rollinghills.biblionix.com', 'killeen.biblionix.com']) assert.ok(hosts.includes(host), host);
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

// --- member-list and catalog-link (owner approval, 24 November 2026) ---------

test('the member-list and catalog-link items: valid, and every waiting US library is covered or listed as skipped with a reason', () => {
  const members = memberListItems();
  const links = catalogLinkItems();
  assert.ok(members.length >= 18 && links.length >= 5);
  // The catalogs the coordinator named, each read or skipped with its reason.
  const named = ['sals-mvls', 'flls', 'owwl', 'westchester', 'vcat', 'coastline', 'seflin', 'osl', 'lion', 'clams', 'nekls', 'ckls', 'seknfind', 'pioneer-ne',
    'catamount', 'lcei', 'aspencat', 'gmilcs'];
  for (const id of named) assert.ok(members.some(item => item.id === id), id);
  assert.deepEqual(hostList.skipped.memberLists.map(item => item.catalog.split(' ')[0]).sort(), ['Hidalgo', 'Rock']);
  for (const item of members) assert.ok(new URL(item.url).search === '' && item.source.length > 20, item.id);
  // Every waiting library: a member list of its shared catalog, a homepage read, or skipped with a reason.
  const read = new Set(members.map(item => item.sharedCatalog).filter(Boolean));
  const homes = new Set(links.map(item => item.libraryId));
  const skipped = new Set(hostList.skipped.catalogLinks.map(item => item.libraryId));
  const byId = new Map(getAllLibraries().map(entry => [entry.id, entry]));
  for (const { id } of usListed.waiting) {
    const entry = byId.get(id);
    assert.ok(entry, id);
    assert.equal([entry.sharedCatalog && read.has(entry.sharedCatalog), homes.has(id), skipped.has(id)].filter(Boolean).length, 1, id);
  }
  const waitingIds = new Set(usListed.waiting.map(waiting => waiting.id));
  for (const item of hostList.skipped.catalogLinks) assert.ok(waitingIds.has(item.libraryId), item.libraryId);
  // A homepage read either left its library waiting, or its homepage linked the entry's own catalog host and
  // tools/directory/front-page-proposals.mjs moved it to connected, with the read kept as its evidence.
  for (const item of links) {
    const confirmed = usListed.connected.includes(item.libraryId) && /^the library's own homepage/.test(byId.get(item.libraryId).evidence.catalog.confirmedBy || '');
    assert.ok(waitingIds.has(item.libraryId) || confirmed, item.libraryId);
  }
  for (const item of links) assert.equal(item.catalogHost, new URL(byId.get(item.libraryId).baseUrl || byId.get(item.libraryId).catalogUrl).hostname, item.libraryId);
  // The production run of 24 November 2026 read every host, member list and catalog link once: nothing is pending.
  const pending = pendingFrontPageWork();
  assert.deepEqual([pending.hosts.length, pending.memberLists.length, pending.catalogLinks.length], [0, 0, 0]);
  assert.throws(() => memberListItems({ memberLists: [{ id: 'x', catalog: 'X', family: 'aspen', url: 'http://x.example.org/', state: 'NY', source: 's' }] }), /invalid/);
  assert.throws(() => catalogLinkItems({ catalogLinks: [{ libraryId: 'koha:x', url: 'https://x.example.org/#a', source: 's' }] }), /invalid/);
});

const kohaFront = `<html><head><title>Northeast Kansas Library System catalog</title><link href="/opac-tmpl/bootstrap/css/opac.css"></head><body>
<label for="select_library">Library:</label><select name="limit" id="select_library"><option value="">All libraries</option>
<option value="branch:ATCH">Atchison Public Library</option><option value="branch:BALD">Baldwin City Library</option>
<option value="branch:EUD">Eudora Public Library &amp; Annex</option></select>
<select name="idx" id="masthead_search"><option value="kw">Keyword</option><option value="ti">Title</option></select></body></html>`;

test('a member list: robots.txt first, then one GET of the catalog\'s page as MyBookshelf/1.0, no search; the selector\'s names and codes', async () => {
  const fake = site({ robots: { status: 200, text: 'User-agent: *\nAllow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n' }, pages: { '/': page(200, kohaFront) } });
  const item = { id: 'nekls', catalog: 'NEKLS', family: 'koha', url: 'https://nextkansas.org/', state: 'KS', source: 'test' };
  const result = await checkMemberList(item, fake);
  assert.deepEqual(fake.asked.map(([kind, url]) => [kind, url]), [['robots', 'https://nextkansas.org/robots.txt'], ['page', 'https://nextkansas.org/']]);
  assert.match(fake.asked[1][2].headers['User-Agent'], /^MyBookshelf\/1\.0 /);
  assert.deepEqual(result, { id: 'nekls', host: 'nextkansas.org', date: '2026-11-24', status: 200, wall: 'none', title: 'Northeast Kansas Library System catalog',
    marks: ['koha'], selects: [{ name: 'limit', label: 'Library:' }],
    options: [[0, '', 'All libraries'], [0, 'branch:ATCH', 'Atchison Public Library'], [0, 'branch:BALD', 'Baldwin City Library'], [0, 'branch:EUD', 'Eudora Public Library & Annex']] });
  // Aspen's owning-library select and Polaris's organisation dropdown.
  const aspen = memberOptions('<select name="filter[]" id="owning_library" aria-label="Owning Library"><option value="owning_library:&quot;Batavia&quot;">Batavia</option><option value="owning_library:&quot;Geneseo&quot;">Geneseo</option></select>');
  assert.deepEqual(aspen.options.map(option => option[2]), ['Batavia', 'Geneseo']);
  const polaris = memberOptions('<select id="ddlOrganization" name="ctl00$Search$ddlOrganization"><option value="3">Ballston Spa Public Library</option><option value="4">Bancroft Public Library</option></select>');
  assert.deepEqual(polaris.options, [[0, '3', 'Ballston Spa Public Library'], [0, '4', 'Bancroft Public Library']]);
  // A select that lists no libraries is not taken.
  assert.deepEqual(memberOptions('<select name="sort"><option>Relevance</option><option>Title</option></select>'), { selects: [], options: [] });
  // A robots.txt that disallows the page: no page, nothing read.
  const refused = site({ robots: { status: 200, text: 'User-agent: *\nDisallow: /\n' } });
  assert.deepEqual(await checkMemberList(item, refused), { id: 'nekls', host: 'nextkansas.org', date: '2026-11-24', status: null, wall: 'none', robots: 'disallowed',
    title: '', marks: [], selects: [], options: [] });
  assert.deepEqual(pagesAsked(refused), []);
  // A wall: recorded, no options.
  const walled = site({ pages: { '/': page(403, '<html><title>Just a moment...</title></html>', { 'cf-mitigated': 'challenge' }) } });
  assert.deepEqual([(await checkMemberList(item, walled)).wall, (await checkMemberList(item, walled)).options], ['challenge', []]);
});

test('a TLC member list: GET /branch/branchLimits as JSON with the site\'s configuration, where robots.txt allows it', async () => {
  const json = JSON.stringify([{ branchId: 12, name: 'Main Library' }, { branchId: 14, name: 'Weslaco Public Library', children: [{ id: 'X1', displayName: 'Bookmobile' }] }]);
  const fake = site({ pages: { '/branch/branchLimits': page(200, json) } });
  const result = await checkMemberList({ id: 'tlc-x', catalog: 'X', family: 'tlc', url: 'https://x.tlcdelivers.com/branch/branchLimits', state: 'TX', source: 's', tlcConfig: 'default' }, fake);
  assert.deepEqual(result.options, [[0, '12', 'Main Library'], [0, '14', 'Weslaco Public Library'], [0, 'X1', 'Bookmobile']]);
  const [, , options] = fake.asked.find(([kind]) => kind === 'page');
  assert.deepEqual([options.headers.Accept, options.headers['Ls2pac-config-type'], options.headers['Ls2pac-config-name']], ['application/json', 'pac', 'default']);
  const blocked = site({ robots: { status: 200, text: 'User-agent: *\nDisallow: /branch/\n' } });
  assert.equal((await checkMemberList({ id: 'tlc-x', catalog: 'X', family: 'tlc', url: 'https://x.tlcdelivers.com/branch/branchLimits', state: 'TX', source: 's' }, blocked)).robots, 'disallowed');
  assert.deepEqual(pagesAsked(blocked), []);
});

const homepage = `<html><head><title>DeKalb County Public Library | Home</title></head><body>
<a href="https://dekalb.polarislibrary.com/polaris/search/searchresults.aspx?ctx=1&term=">Catalog</a>
<a href="https://dekalb.polarislibrary.com/polaris/">Catalog again</a>
<form action="https://catalog.aacpl.net/Search/Results"><input name="lookfor"></form>
<a href="https://x.bibliocommons.com/v2/search?query=a">BC</a><a href="https://y.bywatersolutions.com/cgi-bin/koha/opac-search.pl">Koha</a>
<a href="https://z.tlcdelivers.com/">TLC</a><a href="https://k.biblionix.com/catalog/">Apollo</a><a href="https://gapines.org/eg/opac/home">PINES</a>
<a href="https://na2.iiivega.com/">Vega</a><a href="https://x.ent.sirsi.net/client/en_US/default">Sirsi</a><a href="https://catalog.example.org/">Own catalog</a>
<a href="/events">Events</a><a href="https://www.facebook.com/dekalb">Facebook</a><a href="mailto:a@b.org">Mail</a></body></html>`;

test('a catalog link: robots.txt, then the homepage once; its catalog links by family and its title', async () => {
  const fake = site({ pages: { '/': page(200, homepage) } });
  const item = { libraryId: 'polaris:dekalb-county-ga', url: 'https://dekalblibrary.org/', catalogHost: 'catalog.example.org', source: 's' };
  const result = await checkCatalogLink(item, fake);
  assert.deepEqual(fake.asked.map(([kind, url]) => [kind, url]), [['robots', 'https://dekalblibrary.org/robots.txt'], ['page', 'https://dekalblibrary.org/']]);
  assert.equal(result.title, 'DeKalb County Public Library | Home');
  assert.deepEqual(result.links, [
    ['https://dekalb.polarislibrary.com/polaris/search/searchresults.aspx', 'polaris'], ['https://dekalb.polarislibrary.com/polaris/', 'polaris'],
    ['https://catalog.aacpl.net/Search/Results', 'aspen'], ['https://x.bibliocommons.com/v2/search', 'bibliocommons'],
    ['https://y.bywatersolutions.com/cgi-bin/koha/opac-search.pl', 'koha'], ['https://z.tlcdelivers.com/', 'tlc'], ['https://k.biblionix.com/catalog/', 'apollo'],
    ['https://gapines.org/eg/opac/home', 'evergreen'], ['https://na2.iiivega.com/', 'vega'], ['https://x.ent.sirsi.net/client/en_US/default', 'sirsi'],
    ['https://catalog.example.org/', 'catalog-host']]);
  assert.deepEqual(Object.keys(result).sort(), ['date', 'host', 'libraryId', 'links', 'status', 'title', 'wall']);
  // A redirect within the site (aacpl.net to www.aacpl.net) is followed, its robots.txt read first; one to another site is recorded as moved.
  const asked = [];
  const sameSite = { now: () => DAY, fetchPolicy: async url => { asked.push(['robots', url]); return { status: 404, text: '' }; },
    fetchImpl: async url => { asked.push(['page', url]); return new URL(url).hostname === 'aacpl.net' ? page(301, '', { location: 'https://www.aacpl.net/' }) : page(200, homepage); } };
  const moved = await checkCatalogLink({ libraryId: 'aspen:anne-arundel-md', url: 'https://aacpl.net/', source: 's' }, sameSite);
  assert.deepEqual(asked, [['robots', 'https://aacpl.net/robots.txt'], ['page', 'https://aacpl.net/'], ['robots', 'https://www.aacpl.net/robots.txt'], ['page', 'https://www.aacpl.net/']]);
  assert.equal(moved.status, 200);
  const away = site({ pages: { '/': page(302, '', { location: 'https://city.example.gov/library' }) } });
  assert.deepEqual(await checkCatalogLink(item, away), { libraryId: item.libraryId, host: 'dekalblibrary.org', date: '2026-11-24', status: 302, wall: 'none',
    movedTo: 'city.example.gov', title: '', links: [] });
  assert.equal(linkFamily('https://catalog.groveforlibraries.com/x'), 'aspen');
  assert.equal(linkFamily('https://www.example.org/library'), null);
});

test('long reads are logged in parts under the line limit, and a run keeps each host\'s reads in order, one at a time', async () => {
  const options = Array.from({ length: 400 }, (_, index) => [0, `branch:B${index}`, `Member Library Number ${index} of the Consortium`]);
  const lines = memberListLines({ id: 'owwl', host: 'search.owwl.org', date: '2026-11-24', status: 200, wall: 'none', title: 'OWWL', marks: ['aspen'],
    selects: [{ name: 'filter[]', label: 'Owning Library' }], options });
  assert.ok(lines.length > 3);
  for (const line of lines) {
    assert.ok(line.startsWith(`${MEMBER_LIST_PREFIX} {`) && Buffer.byteLength(line) < 3_200, String(Buffer.byteLength(line)));
  }
  const parts = lines.map(line => JSON.parse(line.slice(MEMBER_LIST_PREFIX.length + 1)));
  assert.deepEqual(parts.flatMap(part => part.options), options);
  assert.deepEqual(parts.map(part => [part.part, part.parts]), parts.map((_, index) => [index + 1, parts.length]));
  assert.deepEqual(parts[1].selects, []);
  assert.ok(catalogLinkLines({ libraryId: 'tlc:x', host: 'a.example.org', date: '2026-11-24', status: 200, wall: 'none', title: 't', links: [] })[0]
    .startsWith(`${CATALOG_LINK_PREFIX} {"libraryId":"tlc:x"`));
  // The run: per host one read at a time, the wall check first; every kind logged.
  const order = [];
  let running = new Map();
  const busy = async (host, label) => {
    if (running.get(host)) assert.fail(`two reads at once on ${host}`);
    running.set(host, true); order.push(label);
    await new Promise(resolve => setTimeout(resolve, 2));
    running.set(host, false);
  };
  const logged = [];
  const result = await runFrontPageChecks({
    hosts: ['search.owwl.org', 'b.example.org'],
    memberLists: [{ id: 'owwl', url: 'https://search.owwl.org/Search/Advanced' }],
    catalogLinks: [{ libraryId: 'tlc:x', url: 'https://search.owwl.org/' }, { libraryId: 'tlc:y', url: 'https://c.example.org/' }],
    check: async host => { await busy(host, `wall ${host}`); return on(host, { status: 200, wall: 'none' }); },
    checkMembers: async item => { await busy('search.owwl.org', `members ${item.id}`); return { id: item.id, host: 'search.owwl.org', date: '2026-11-24', status: 200, wall: 'none', title: '', marks: [], selects: [], options: [] }; },
    checkLinks: async item => { await busy(new URL(item.url).hostname, `links ${item.libraryId}`); return item.libraryId === 'tlc:y' ? null : { libraryId: item.libraryId, host: 'search.owwl.org', date: '2026-11-24', status: 200, wall: 'none', title: '', links: [] }; },
    concurrency: 3, log: line => logged.push(line) });
  assert.deepEqual(result, { checked: 4, remaining: 1 });
  const owwl = order.filter(label => /owwl|tlc:x/.test(label));
  assert.deepEqual(owwl, ['wall search.owwl.org', 'members owwl', 'links tlc:x']);
  assert.equal(logged.filter(line => line.startsWith(`${MEMBER_LIST_PREFIX} `)).length, 1);
  assert.equal(logged.filter(line => line.startsWith(`${CATALOG_LINK_PREFIX} `)).length, 1);
  assert.equal(logged.filter(line => line.startsWith(`${LOG_PREFIX} `)).length, 2);
});
