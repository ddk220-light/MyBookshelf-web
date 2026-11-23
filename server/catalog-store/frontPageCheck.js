import { createHash, timingSafeEqual } from 'node:crypto';
import { readCatalogStoreConfig } from './config.js';
import { createRobotsPolicy, defaultFetchPolicy } from '../services/providers/robots.js';
import { USER_AGENT } from '../services/providers/http.js';
import { catalogDispatcher } from '../services/providers/network.js';
import hostList from '../data/front-page-hosts.json' with { type: 'json' };

// The front-page check (owner decision, 23 November 2026: "You can check
// yourself. You don't need me to check it."; USA plan, Phase 0 item 7).
//
// About 20 million people's catalogs (Koha and Aspen at ByWater, the Polaris
// sites a literal robots.txt opens) allow the app in robots.txt but block AI
// agents, so no agent may look for a bot wall there. The app looks for itself,
// from production: for each host in server/data/front-page-hosts.json its own
// server asks for the host's front page
//   - once per host (a stored result is never asked again; delete its row to
//     ask again), with no search and no query string;
//   - as MyBookshelf/1.0 with its contact URL, the user agent of every catalog
//     check, never another;
//   - only after the host's robots.txt, read for the app's own token (else
//     `*`) and matched literally, allows the page and every redirect on it;
//     a redirect to another host is recorded as moved and never followed;
// and keeps only what came back: the HTTP status, whether a bot wall or
// challenge was seen (and which), a redirect to another host, the time taken.
// No page content, header, cookie or address of ours is kept.
//
// It runs only from the internal route below (POST or GET
// /api/internal/front-page-check with the cron secret), with the catalog
// store's worker role, a few hosts per call, and is not scheduled: someone
// starts it in production. It is never run from an agent's or developer's
// machine. A front page that answers is not proof that a search will: the
// first tap through the app on each host settles that (USA plan, section 10).

export const FRONT_PAGE_CHECK_PATH = '/api/internal/front-page-check';
export const FRONT_PAGE_OUTCOMES = Object.freeze(['open', 'wall', 'refused', 'rate_limited', 'moved', 'not_found', 'server_error', 'unreachable',
  'robots_disallowed', 'robots_unavailable', 'redirect_loop']);
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const PAGE_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;
// A same-host redirect is followed after the host's Crawl-delay, up to this long.
const MAX_HOP_DELAY_MS = 20_000;

/** The hosts to check: the data file's, validated (lower case host names only). */
export function frontPageHosts(list = hostList) {
  const hosts = (list?.hosts || []).map(item => item?.host);
  if (!hosts.length || hosts.some(host => typeof host !== 'string' || !HOST.test(host))) throw new TypeError('front-page-hosts.json needs valid host names');
  if (new Set(hosts).size !== hosts.length) throw new TypeError('front-page-hosts.json lists a host twice');
  return hosts;
}

// Walls and challenges, by the marks their vendors leave. Each is a short
// code, the only thing kept about the page. A generic captcha counts only on
// an error status: a catalog may carry a captcha on a form of its own.
const HEADER_SIGNALS = [
  ['cloudflare-challenge', headers => /challenge/i.test(headers.get('cf-mitigated') || '')],
  ['aws-waf', headers => /challenge|captcha/i.test(headers.get('x-amzn-waf-action') || '')],
  ['datadome', headers => Boolean(headers.get('x-datadome') || headers.get('x-dd-b'))],
];
const BODY_SIGNALS = [
  ['cloudflare-challenge', /<title>\s*Just a moment\.\.\.\s*<\/title>|\/cdn-cgi\/challenge-platform\/|window\._cf_chl_opt|cf-browser-verification/i],
  ['anubis', /within\.website\/x\/cmd\/anubis|anubis_version|id=["']anubis_|Making sure you(?:&#39;|')re not a bot/i],
  ['hashcash', /hashcash/i],
  ['imperva', /Incapsula incident|_Incapsula_Resource|\/_Incapsula_/i],
  ['aws-waf', /AwsWafIntegration|awswaf\.com|aws-waf-token/i],
  ['datadome', /captcha-delivery\.com|geo\.captcha-delivery/i],
  ['perimeterx', /px-captcha|_pxAppId|perimeterx/i],
  ['sucuri', /Sucuri WebSite Firewall|sucuri\.net\/privacy-policy/i],
  ['akamai', /Access Denied[\s\S]{0,400}Reference&#32;&#35;|errors\.edgesuite\.net/i],
];
const GENERIC_CAPTCHA = /g-recaptcha|hcaptcha\.com|h-captcha|challenges\.cloudflare\.com\/turnstile|captcha/i;

/** The wall a response shows, as a short code, or null. */
export function wallSignal({ status, headers = new Headers(), body = '' }) {
  for (const [code, test] of HEADER_SIGNALS) if (test(headers)) return code;
  for (const [code, pattern] of BODY_SIGNALS) if (pattern.test(body)) return code;
  if (status >= 400 && GENERIC_CAPTCHA.test(body)) return 'captcha';
  return null;
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

function outcomeFor(status) {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'refused';
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 500) return 'server_error';
  return 'open';
}

/**
 * One host's check: robots.txt, then its front page (following same-host
 * redirects the robots.txt allows). Never throws.
 */
export async function checkFrontPage(host, { fetchImpl = (...args) => fetch(...args), fetchPolicy = defaultFetchPolicy, now = () => Date.now(), wait = sleep,
  timeoutMs = PAGE_TIMEOUT_MS } = {}) {
  const startedAt = now();
  const result = { host, outcome: 'unreachable', status: null, robotsStatus: null, wall: false, wallSignal: null, movedTo: null, durationMs: 0 };
  const done = values => Object.assign(result, values, { durationMs: Math.max(0, now() - startedAt) });
  if (typeof host !== 'string' || !HOST.test(host)) return done({ outcome: 'unreachable' });
  // robots.txt for this host, read once, for the app's own token.
  let robotsFailed = false;
  const robots = createRobotsPolicy({ now, fetchPolicy: async url => {
    try {
      const response = await fetchPolicy(url);
      result.robotsStatus = Number.isInteger(response?.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      return response;
    } catch (error) { robotsFailed = true; throw error; }
  } });
  let url = `https://${host}/`;
  let redirected = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let permission;
    try { permission = await robots.check(url); } catch { return done({ outcome: 'unreachable' }); }
    if (!permission.allowed) {
      // 429 or a server error on robots.txt means "keep off for a while" (RFC 9309).
      const unavailable = !robotsFailed && (result.robotsStatus === 429 || result.robotsStatus >= 500);
      return done({ outcome: unavailable ? 'robots_unavailable' : 'robots_disallowed' });
    }
    if (hop > 0 && permission.delayMs > 0) {
      // The host's Crawl-delay between our two requests; past the limit, stop here.
      if (permission.delayMs > MAX_HOP_DELAY_MS) return done({ outcome: 'open', status: redirected });
      await wait(permission.delayMs);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response, body = '';
    try {
      response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, dispatcher: catalogDispatcher(),
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.8' } });
      body = await readSome(response);
    } catch {
      return done({ outcome: 'unreachable' });
    } finally {
      clearTimeout(timer);
    }
    const status = Number(response.status);
    const headers = response.headers instanceof Headers ? response.headers : new Headers(response.headers || {});
    const signal = wallSignal({ status, headers, body });
    if (signal) return done({ outcome: 'wall', status, wall: true, wallSignal: signal });
    if (status >= 300 && status < 400) {
      let next;
      try { next = new URL(headers.get('location') || '', url); } catch { return done({ outcome: 'open', status }); }
      if (!['http:', 'https:'].includes(next.protocol)) return done({ outcome: 'open', status });
      // Never followed to another host: recorded as moved.
      if (next.hostname.toLowerCase() !== host) return done({ outcome: 'moved', status, movedTo: next.hostname.toLowerCase().slice(0, 253) });
      next.hash = '';
      url = next.href;
      redirected = status;
      continue;
    }
    return done({ outcome: outcomeFor(status), status });
  }
  return done({ outcome: 'redirect_loop', status: redirected });
}

// --- Storage (worker role; migration 006) -----------------------------------

const CLAIM = `INSERT INTO host_front_page_checks AS c (host, outcome) SELECT h, 'pending' FROM unnest($1::text[]) AS t(h)
  ON CONFLICT (host) DO UPDATE SET checked_at = now()
    WHERE c.outcome = 'pending' AND c.checked_at < now() - interval '15 minutes'
  RETURNING host`;
const SAVE = `UPDATE host_front_page_checks SET checked_at = now(), outcome = $2, status = $3, robots_status = $4, wall = $5, wall_signal = $6,
  moved_to = $7, duration_ms = $8 WHERE host = $1`;

export function createFrontPageStore(db) {
  return Object.freeze({
    // Hosts already checked (or being checked by another run, for 15 minutes).
    async done() {
      const { rows } = await db.query(`SELECT host FROM host_front_page_checks WHERE outcome <> 'pending' OR checked_at >= now() - interval '15 minutes'`);
      return new Set(rows.map(row => row.host));
    },
    // Claims hosts for this run; returns those claimed (another run may hold the rest).
    async claim(hosts) {
      if (!hosts.length) return [];
      const { rows } = await db.query(CLAIM, [hosts]);
      return rows.map(row => row.host);
    },
    async save(result) {
      const small = value => (Number.isInteger(value) && value >= 100 && value <= 599 ? value : null);
      await db.query(SAVE, [result.host, result.outcome, small(result.status), small(result.robotsStatus), Boolean(result.wall),
        result.wallSignal ? String(result.wallSignal).slice(0, 40) : null, result.movedTo ? String(result.movedTo).slice(0, 253) : null,
        Number.isFinite(result.durationMs) ? Math.max(0, Math.round(result.durationMs)) : null]);
    },
    async list() {
      const { rows } = await db.query(`SELECT host, checked_at, outcome, status, robots_status, wall, wall_signal, moved_to, duration_ms
        FROM host_front_page_checks ORDER BY host`);
      return rows;
    },
  });
}

/**
 * One run: up to `limit` hosts not checked yet, `concurrency` at a time (each
 * host's own requests one after another), within `budgetMs`. Returns what each
 * host showed and how many are left.
 */
export async function runFrontPageChecks({ store, hosts = frontPageHosts(), limit = 10, concurrency = 4, budgetMs = 90_000, check = checkFrontPage,
  now = () => Date.now() } = {}) {
  const startedAt = now();
  const done = await store.done();
  const waiting = hosts.filter(host => !done.has(host));
  const claimed = await store.claim(waiting.slice(0, Math.max(1, Math.min(limit, 20))));
  const results = [];
  const queue = [...claimed];
  async function worker() {
    while (queue.length) {
      // A host not started before the budget runs out stays claimed for 15
      // minutes, then the next run takes it.
      if (now() - startedAt > budgetMs) return;
      const host = queue.shift();
      const result = await check(host);
      results.push(result);
      try { await store.save(result); } catch { /* the next run asks it again after the claim lapses */ }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, claimed.length)) }, worker));
  return { checked: results.sort((a, b) => a.host.localeCompare(b.host)), remaining: Math.max(0, waiting.length - results.length), total: hosts.length };
}

// --- The internal route -------------------------------------------------------

const unavailable = res => res.status(503).json({ error: { code: 'FRONT_PAGE_CHECK_UNAVAILABLE', message: 'The front-page check is unavailable.' } });

export function createFrontPageCheckMiddleware({ env = process.env, connect = null, run = runFrontPageChecks } = {}) {
  let db = null;
  const middleware = async (req, res, next) => {
    if (req.path !== FRONT_PAGE_CHECK_PATH) return next();
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
    const config = readCatalogStoreConfig(env);
    const provided = req.get('Authorization') || '';
    if (typeof config.cronSecret !== 'string' || config.cronSecret.length < 32
      || !timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(`Bearer ${config.cronSecret}`).digest())) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This endpoint is private.' } });
    }
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
    // Without the store a host could be asked again: the check needs it.
    if (!config.workerDatabaseUrl) return unavailable(res);
    const limit = Math.max(1, Math.min(20, Number.parseInt(String(req.query?.limit ?? '10'), 10) || 10));
    try {
      const { createCatalogDatabase } = await import('./pool.js');
      db ||= connect ? connect(config.workerDatabaseUrl) : createCatalogDatabase(config.workerDatabaseUrl, { max: 2, statementTimeoutMs: 10_000 });
      const role = (await db.query(`SELECT rolsuper, rolbypassrls, pg_has_role(current_user, c.relowner, 'USAGE') AS owns
        FROM pg_roles r CROSS JOIN pg_class c WHERE rolname = current_user AND c.oid = 'host_front_page_checks'::regclass`)).rows[0];
      if (!role || role.rolsuper || role.rolbypassrls || role.owns) throw new Error('Privileged worker role.');
      const result = await run({ store: createFrontPageStore(db), limit });
      // Hosts and what came back only: no page, header or address.
      return res.json({ checked: result.checked.map(({ host, outcome, status, robotsStatus, wall, wallSignal, movedTo, durationMs }) =>
        ({ host, outcome, status, robotsStatus, wall, wallSignal, movedTo, durationMs })), remaining: result.remaining, total: result.total });
    } catch {
      return unavailable(res);
    }
  };
  middleware.close = async () => { await db?.end?.(); db = null; };
  return middleware;
}
