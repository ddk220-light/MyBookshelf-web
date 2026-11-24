import { createRobotsPolicy, defaultFetchPolicy } from '../services/providers/robots.js';
import { USER_AGENT } from '../services/providers/http.js';
import { catalogDispatcher } from '../services/providers/network.js';
import hostList from '../data/front-page-hosts.json' with { type: 'json' };
import resultList from '../data/front-page-results.json' with { type: 'json' };

// The front-page check (owner decisions, 23 November 2026: "You can check
// yourself"; "Record it once and then store it in the code. Why do you have
// to check it every single time?").
//
// Many catalogs (Koha and Aspen at ByWater, the Polaris sites a literal
// robots.txt opens) allow the app in robots.txt but block AI agents, so no
// agent may look for a bot wall there. The app looks for itself, from
// production, once per host, and the answer is kept in the code:
//   - the hosts are server/data/front-page-hosts.json; the answers are
//     server/data/front-page-results.json, committed. A host with an answer
//     there is never asked again; once every host has one, nothing runs;
//   - the daily catalog-maintenance cron (cron.js) runs it, in production
//     only (VERCEL_ENV=production), for every host without an answer that
//     fits in the function's time, a few hosts at once, each host's requests
//     one after another;
//   - per host: robots.txt first, read for the app's own token (else `*`)
//     and matched literally; then one GET of `/` as MyBookshelf/1.0 with its
//     contact URL (the user agent of every catalog check), after the host's
//     Crawl-delay; a redirect on the same host is followed the same way, one
//     to another host is recorded as moved and never followed; no search and
//     no query string;
//   - each answer is one stderr line, `front-page-check {json}` (production
//     runtime logs keep stderr): the host, the date, the HTTP status, the wall
//     signal and the host it moved to. No page content, header, cookie or
//     address, and nothing about any reader. tools/deployment/
//     front-page-results.mjs merges pasted lines into the results file.
// It is never run from an agent's or developer's machine. A front page that
// answers is not proof that a search will: the first tap through the app on
// each host settles that.

export const LOG_PREFIX = 'front-page-check';
// The wall signal: nothing seen, a challenge or bot-wall page, the front page
// refused (401 or 403) or rate limited (429), or no answer at all.
export const WALL_SIGNALS = Object.freeze(['none', 'challenge', '403', '429', 'unreachable']);
// Why robots.txt stopped the check before the front page, when it did: it
// does not allow the page for the app; it answered 429 or a server error
// (RFC 9309: keep off); its Crawl-delay is longer than one run can wait.
export const ROBOTS_STOPS = Object.freeze(['disallowed', 'unavailable', 'crawl-delay']);
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;
// The longest Crawl-delay waited before a GET; a longer one is respected by
// not asking (`robots: 'crawl-delay'`).
const MAX_DELAY_MS = 30_000;
// One run: every request ends within RUN_MS, and a host is started only while
// its robots.txt and page can still finish (START_MARGIN_MS). The function may
// run 120 s (vercel.json), with the maintenance job beside it.
export const RUN_MS = 90_000;
const START_MARGIN_MS = 20_000;
export const CONCURRENCY = 8;

/** The hosts to check: the data file's, validated (lower case host names only). */
export function frontPageHosts(list = hostList) {
  const hosts = (list?.hosts || []).map(item => item?.host);
  if (!hosts.length || hosts.some(host => typeof host !== 'string' || !HOST.test(host))) throw new TypeError('front-page-hosts.json needs valid host names');
  if (new Set(hosts).size !== hosts.length) throw new TypeError('front-page-hosts.json lists a host twice');
  return hosts;
}

/** A result as kept, `{ host, date, status, wall, movedTo?, robots? }` and nothing else, or null when it is not one. */
export function frontPageResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { host, date, status, wall, movedTo, robots } = value;
  if (typeof host !== 'string' || !HOST.test(host) || typeof date !== 'string' || !DATE.test(date) || Number.isNaN(Date.parse(date))) return null;
  if (!(status === null || (Number.isInteger(status) && status >= 100 && status <= 599)) || !WALL_SIGNALS.includes(wall)) return null;
  if (movedTo != null && (typeof movedTo !== 'string' || !HOST.test(movedTo))) return null;
  if (robots != null && !ROBOTS_STOPS.includes(robots)) return null;
  return { host, date, status, wall, ...(movedTo ? { movedTo } : {}), ...(robots ? { robots } : {}) };
}

/** The committed results, validated: a Map of host to result. */
export function frontPageResults(list = resultList) {
  if (!Array.isArray(list?.results)) throw new TypeError('front-page-results.json needs a results list');
  const results = new Map();
  for (const item of list.results) {
    const result = frontPageResult(item);
    if (!result || Object.keys(item).length !== Object.keys(result).length) throw new TypeError(`front-page-results.json has an invalid result: ${JSON.stringify(item)}`);
    if (results.has(result.host)) throw new TypeError(`front-page-results.json lists ${result.host} twice`);
    results.set(result.host, result);
  }
  return results;
}

/** Hosts in the list that have no committed result yet, in the list's order. */
export function hostsWithoutResult(hosts = frontPageHosts(), results = frontPageResults()) {
  return hosts.filter(host => !results.has(host));
}

/** The stderr line for one result. */
export function logLine(result) {
  return `${LOG_PREFIX} ${JSON.stringify(frontPageResult(result))}`;
}

// Walls and challenges, by the marks their vendors leave. A generic captcha
// counts only on an error status: a catalog may carry a captcha on a form of
// its own.
const HEADER_SIGNALS = [
  headers => /challenge/i.test(headers.get('cf-mitigated') || ''), // Cloudflare
  headers => /challenge|captcha/i.test(headers.get('x-amzn-waf-action') || ''), // AWS WAF
  headers => Boolean(headers.get('x-datadome') || headers.get('x-dd-b')), // DataDome
];
const BODY_SIGNALS = [
  /<title>\s*Just a moment\.\.\.\s*<\/title>|\/cdn-cgi\/challenge-platform\/|window\._cf_chl_opt|cf-browser-verification/i, // Cloudflare
  /within\.website\/x\/cmd\/anubis|anubis_version|id=["']anubis_|Making sure you(?:&#39;|')re not a bot/i, // Anubis
  /hashcash/i,
  /Incapsula incident|_Incapsula_Resource|\/_Incapsula_/i, // Imperva
  /AwsWafIntegration|awswaf\.com|aws-waf-token/i, // AWS WAF
  /captcha-delivery\.com|geo\.captcha-delivery/i, // DataDome
  /px-captcha|_pxAppId|perimeterx/i, // PerimeterX
  /Sucuri WebSite Firewall|sucuri\.net\/privacy-policy/i, // Sucuri
  /Access Denied[\s\S]{0,400}Reference&#32;&#35;|errors\.edgesuite\.net/i, // Akamai
];
const GENERIC_CAPTCHA = /g-recaptcha|hcaptcha\.com|h-captcha|challenges\.cloudflare\.com\/turnstile|captcha/i;

/** Whether a response is a challenge or bot-wall page. */
export function isChallenge({ status, headers = new Headers(), body = '' }) {
  if (HEADER_SIGNALS.some(test => test(headers))) return true;
  if (BODY_SIGNALS.some(pattern => pattern.test(body))) return true;
  return status >= 400 && GENERIC_CAPTCHA.test(body);
}

async function readSome(response, limit = MAX_BODY_BYTES) {
  if (!response.body?.getReader) return String(await response.text?.() || '').slice(0, limit);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch { /* the rest of the page is not read */ }
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).subarray(0, limit).toString('utf8');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
const wallFor = status => (status === 401 || status === 403 ? '403' : status === 429 ? '429' : 'none');

/**
 * One host's check: robots.txt, then its front page, following same-host
 * redirects robots.txt allows, each GET after the Crawl-delay. Returns the
 * result to keep, or null when the run's time (`deadlineAt`) would end before
 * the next request could (the host is asked in a later run). Never throws.
 */
export async function checkFrontPage(host, { fetchImpl = (...args) => fetch(...args), fetchPolicy = defaultFetchPolicy, now = () => Date.now(), wait = sleep,
  timeoutMs = PAGE_TIMEOUT_MS, deadlineAt = Infinity } = {}) {
  if (typeof host !== 'string' || !HOST.test(host)) return null;
  const date = new Date(now()).toISOString().slice(0, 10);
  const result = values => frontPageResult({ host, date, status: null, wall: 'none', ...values });
  let robotsStatus = null;
  const robots = createRobotsPolicy({ now, fetchPolicy: async url => {
    robotsStatus = null;
    const response = await fetchPolicy(url);
    robotsStatus = Number.isInteger(response?.status) ? response.status : null;
    return response;
  } });
  let url = `https://${host}/`;
  let redirected = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let permission;
    try { permission = await robots.check(url); } catch { return result({ status: redirected, wall: 'unreachable' }); }
    if (!permission.allowed) {
      // 429 or a server error on robots.txt means "keep off for a while" (RFC 9309).
      if (robotsStatus === 429 || robotsStatus >= 500) return result({ status: redirected, wall: robotsStatus === 429 ? '429' : 'unreachable', robots: 'unavailable' });
      return result({ status: redirected, robots: 'disallowed' });
    }
    // Every request to the host after the first (robots.txt) waits its Crawl-delay.
    const delay = Math.max(0, permission.delayMs || 0);
    if (delay > MAX_DELAY_MS) return result({ status: redirected, ...(hop === 0 ? { robots: 'crawl-delay' } : {}) });
    if (now() + delay + timeoutMs > deadlineAt) return null;
    if (delay > 0) await wait(delay);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response, body = '';
    try {
      response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, dispatcher: catalogDispatcher(),
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.8' } });
      body = await readSome(response);
    } catch {
      return result({ status: redirected, wall: 'unreachable' });
    } finally {
      clearTimeout(timer);
    }
    const status = Number(response.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) return result({ status: redirected, wall: 'unreachable' });
    const headers = response.headers instanceof Headers ? response.headers : new Headers(response.headers || {});
    if (isChallenge({ status, headers, body })) return result({ status, wall: 'challenge' });
    if (status >= 300 && status < 400) {
      let next;
      try { next = new URL(headers.get('location') || '', url); } catch { return result({ status }); }
      if (!['http:', 'https:'].includes(next.protocol)) return result({ status });
      // Never followed to another host: recorded as moved.
      const to = next.hostname.toLowerCase();
      if (to !== host) return result({ status, ...(HOST.test(to) ? { movedTo: to } : {}) });
      next.hash = '';
      url = next.href;
      redirected = status;
      continue;
    }
    return result({ status, wall: wallFor(status) });
  }
  // More than three redirects on the same host: the last one is kept.
  return result({ status: redirected });
}

/**
 * One run: every host given (by default those without a committed result),
 * `concurrency` hosts at once (each host's own requests one after another),
 * starting a host only while it can still finish within `runMs`. Each
 * finished host is logged at once, so a run cut short keeps what it
 * finished. Returns counts only.
 */
export async function runFrontPageChecks({ hosts = hostsWithoutResult(), check = checkFrontPage, concurrency = CONCURRENCY, runMs = RUN_MS,
  startMarginMs = START_MARGIN_MS, now = () => Date.now(), log = line => process.stderr.write(`${line}\n`) } = {}) {
  const deadlineAt = now() + runMs;
  const queue = [...hosts];
  let checked = 0;
  async function worker() {
    while (queue.length && now() + startMarginMs <= deadlineAt) {
      const host = queue.shift();
      let result;
      try { result = frontPageResult(await check(host, { deadlineAt })); } catch { result = null; }
      if (!result) continue;
      checked += 1;
      try { log(logLine(result)); } catch { /* a log failure never stops the run */ }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  return { checked, remaining: hosts.length - checked };
}
