import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { robotsRules, robotsAllowed, createRobotsPolicy } from './robots.js';
import { clearHttpCache, getText, withCatalogOperation } from './http.js';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; clearHttpCache(); });
const response = (url, body = 'ok', status = 200) => ({ ok: status >= 200 && status < 300, status, url, headers: new Headers(), text: async () => body });
const visakhapatnam = fs.readFileSync(new URL('../../test/fixtures/vpl/robots.txt', import.meta.url), 'utf8');

test('robots rules: specific agent group, longest rule, Allow on ties, Crawl-delay', () => {
  const policy = robotsRules('User-agent: *\nDisallow: /cgi-bin/koha/opac-search.pl\nAllow: /cgi-bin/koha/opac-search.pl?format=rss\nCrawl-delay: 5\n\nUser-agent: OtherBot\nDisallow: /\n');
  assert.equal(policy.delay, 5_000);
  assert.equal(robotsAllowed(policy, 'https://c.example/cgi-bin/koha/opac-search.pl?q=x'), false);
  assert.equal(robotsAllowed(policy, 'https://c.example/cgi-bin/koha/opac-search.pl?format=rss&q=x'), true);
  assert.equal(robotsAllowed(policy, 'https://c.example/cgi-bin/koha/opac-detail.pl?biblionumber=1'), true);
  const named = robotsRules('User-agent: *\nDisallow: /\n\nUser-agent: MyBookshelf\nAllow: /\n');
  assert.equal(robotsAllowed(named, 'https://c.example/anything'), true);
  // The IIT Dharwad pattern seen on 12 November 2026: every agent is refused.
  assert.equal(robotsAllowed(robotsRules('User-agent: GPTBot\nUser-agent: *\nDisallow: /\n'), 'https://c.example/cgi-bin/koha/opac-search.pl'), false);
  assert.equal(robotsAllowed(robotsRules('User-agent: *\nDisallow: /*.pdf$\n'), 'https://c.example/a.pdf'), false);
  assert.equal(robotsAllowed(robotsRules('User-agent: *\nDisallow: /*.pdf$\n'), 'https://c.example/a.pdf?x'), true);
  assert.equal(robotsAllowed(robotsRules(visakhapatnam), 'https://example.org/'), true);
  assert.ok(robotsRules(visakhapatnam).delay >= 20_000);
});

test('policy reads: one read per origin, 4xx allows, 5xx refuses for a while, network errors allow briefly', async () => {
  let clock = 0;
  const reads = [];
  const answers = { 'https://a.example': { status: 200, text: 'User-agent: *\nDisallow: /search\n' }, 'https://b.example': { status: 404, text: '' },
    'https://c.example': { status: 503, text: '' } };
  const policy = createRobotsPolicy({ now: () => clock, fetchPolicy: async url => {
    reads.push(url);
    const origin = new URL(url).origin;
    if (origin === 'https://d.example') throw new Error('ECONNRESET');
    return answers[origin];
  } });
  assert.deepEqual(await Promise.all([policy.check('https://a.example/search?q=1'), policy.check('https://a.example/record/1')]),
    [{ allowed: false, delayMs: 0 }, { allowed: true, delayMs: 0 }]);
  assert.equal(reads.length, 1);
  assert.equal((await policy.check('https://b.example/search')).allowed, true);
  assert.equal((await policy.check('https://c.example/search')).allowed, false);
  assert.equal((await policy.check('https://d.example/search')).allowed, true);
  clock += 5 * 60 * 1000;
  await policy.check('https://c.example/search');
  await policy.check('https://a.example/x');
  assert.equal(reads.filter(url => url.startsWith('https://c.example')).length, 2);
  assert.equal(reads.filter(url => url.startsWith('https://a.example')).length, 1);
  assert.ok(reads.every(url => url.endsWith('/robots.txt')));
});

test('a robots refusal inside a catalog operation never reaches the catalog', async () => {
  const calls = [];
  global.fetch = async url => { calls.push(url); return response(url); };
  const robots = async url => ({ allowed: !url.includes('/search'), delayMs: 0 });
  await withCatalogOperation({ maxRequests: 5, robots }, async () => {
    await assert.rejects(getText('https://c.example/search?q=x'), { code: 'CATALOG_PROVIDER_BLOCKED' });
    await getText('https://c.example/record/1');
  });
  assert.deepEqual(calls, ['https://c.example/record/1']);
});

test('an aborted operation schedules no further requests and cancels the one in flight', async () => {
  const calls = [];
  const controller = new AbortController();
  global.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/slow')) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return response(url);
  };
  await withCatalogOperation({ maxRequests: 10, signal: controller.signal }, async () => {
    await getText('https://c.example/one');
    const slow = getText('https://c.example/slow', { retries: 0 });
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(slow);
    await assert.rejects(getText('https://c.example/two'), { code: 'CATALOG_ABORTED' });
  });
  assert.deepEqual(calls, ['https://c.example/one', 'https://c.example/slow']);
});

test('operation spacing applies between successive requests to one host', async () => {
  const times = [];
  global.fetch = async url => { times.push(Date.now()); return response(url); };
  await withCatalogOperation({ maxRequests: 3, minIntervalMs: 60 }, async () => {
    await getText('https://c.example/a');
    await getText('https://c.example/b');
    await getText('https://other.example/c');
  });
  assert.ok(times[1] - times[0] >= 55, `spacing ${times[1] - times[0]}`);
  assert.ok(times[2] - times[1] < 55);
});

test('robots groups match the product token exactly; 429 refuses for a while', async () => {
  // A short or partial agent name is another crawler, not this one.
  assert.equal(robotsAllowed(robotsRules('User-agent: b\nDisallow: /\n\nUser-agent: *\nAllow: /\n'), 'https://c.example/x'), true);
  assert.equal(robotsAllowed(robotsRules('User-agent: book\nDisallow: /\n'), 'https://c.example/x'), true);
  // A versioned token still names this crawler.
  assert.equal(robotsAllowed(robotsRules('User-agent: *\nDisallow: /\n\nUser-agent: MyBookshelf/1.0\nAllow: /\n'), 'https://c.example/x'), true);
  assert.equal(robotsAllowed(robotsRules('﻿User-agent: *\nDisallow: /\n'), 'https://c.example/x'), false);
  let clock = 0;
  const policy = createRobotsPolicy({ now: () => clock, fetchPolicy: async () => ({ status: 429, text: '' }) });
  assert.equal((await policy.check('https://c.example/search')).allowed, false);
  clock += 5 * 60 * 1000;
  assert.equal((await policy.check('https://c.example/search')).allowed, false);
});
