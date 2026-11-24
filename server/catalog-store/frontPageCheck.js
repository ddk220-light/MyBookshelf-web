import { createRobotsPolicy, defaultFetchPolicy } from '../services/providers/robots.js';
import { USER_AGENT } from '../services/providers/http.js';
import { catalogDispatcher } from '../services/providers/network.js';
import { attrs, text } from '../services/providers/catalogHtml.js';
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
//
// Two more kinds of entry share the run (owner approval, 24 November 2026),
// each the same one-time read (robots.txt for the app's own token, then one
// GET as MyBookshelf/1.0, no search, no database), each keyed in
// front-page-hosts.json and kept in front-page-results.json once merged:
//   - member-list (`memberLists`): a shared catalog whose members are only
//     estimated or unknown. The catalog's front page or search page (or, for
//     TLC, GET /branch/branchLimits, where robots.txt allows it) is read once
//     and the catalog's own list of member libraries or locations is taken
//     from its selector (Aspen's location or library select, Polaris's branch
//     or organisation dropdown, Koha's branch select, TLC's branch limits):
//     the names and codes the page shows, and the catalog families its markup
//     names. Logged as `front-page-member-list {json}`, in parts when long.
//   - catalog-link (`catalogLinks`): a waiting library whose own homepage URL
//     is in the evidence. The homepage is read once (a redirect within the
//     same site is followed, after robots.txt) and the outgoing links that
//     point at a catalog family are kept, with the page's own title. Logged as
//     `front-page-catalog-link {json}`.
// tools/deployment/front-page-results.mjs merges these lines too, and
// tools/directory/front-page-proposals.mjs turns the kept results into
// proposed listing changes (printed; applied only with --write).

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

// One read: robots.txt for the app's own token, then one GET of `startUrl`,
// following a redirect that `follows(fromHost, toHost)` allows (by default the
// same host) and robots.txt allows, each GET after the host's Crawl-delay.
// Returns `{ values, body, url }` (`values`: status, wall, movedTo, robots, as
// a result keeps them; `body`: at most `maxBytes` of the last page), or null
// when the run's time (`deadlineAt`) would end before the next request could.
// Never throws.
async function readPage(startUrl, { fetchImpl = (...args) => fetch(...args), fetchPolicy = defaultFetchPolicy, now = () => Date.now(), wait = sleep,
  timeoutMs = PAGE_TIMEOUT_MS, deadlineAt = Infinity, maxBytes = MAX_BODY_BYTES, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  headers: extraHeaders = {}, follows = (from, to) => from === to } = {}) {
  const done = (values, body = '', url = null) => ({ values: { status: null, wall: 'none', ...values }, body, url });
  let robotsStatus = null;
  const robots = createRobotsPolicy({ now, fetchPolicy: async url => {
    robotsStatus = null;
    const response = await fetchPolicy(url);
    robotsStatus = Number.isInteger(response?.status) ? response.status : null;
    return response;
  } });
  let url = startUrl;
  let redirected = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let permission;
    try { permission = await robots.check(url); } catch { return done({ status: redirected, wall: 'unreachable' }); }
    if (!permission.allowed) {
      // 429 or a server error on robots.txt means "keep off for a while" (RFC 9309).
      if (robotsStatus === 429 || robotsStatus >= 500) return done({ status: redirected, wall: robotsStatus === 429 ? '429' : 'unreachable', robots: 'unavailable' });
      return done({ status: redirected, robots: 'disallowed' });
    }
    // Every request to the host after the first (robots.txt) waits its Crawl-delay.
    const delay = Math.max(0, permission.delayMs || 0);
    if (delay > MAX_DELAY_MS) return done({ status: redirected, ...(hop === 0 ? { robots: 'crawl-delay' } : {}) });
    if (now() + delay + timeoutMs > deadlineAt) return null;
    if (delay > 0) await wait(delay);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response, body = '';
    try {
      response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, dispatcher: catalogDispatcher(),
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en-US,en;q=0.8', ...extraHeaders } });
      body = await readSome(response, maxBytes);
    } catch {
      return done({ status: redirected, wall: 'unreachable' });
    } finally {
      clearTimeout(timer);
    }
    const status = Number(response.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) return done({ status: redirected, wall: 'unreachable' });
    const headers = response.headers instanceof Headers ? response.headers : new Headers(response.headers || {});
    if (isChallenge({ status, headers, body })) return done({ status, wall: 'challenge' });
    if (status >= 300 && status < 400) {
      let next;
      try { next = new URL(headers.get('location') || '', url); } catch { return done({ status }); }
      if (!['http:', 'https:'].includes(next.protocol)) return done({ status });
      // Never followed to another host (unless `follows` allows it): recorded as moved.
      const from = new URL(url).hostname.toLowerCase();
      const to = next.hostname.toLowerCase();
      if (!follows(from, to)) return done({ status, ...(to !== from && HOST.test(to) ? { movedTo: to } : {}) });
      next.hash = '';
      url = next.href;
      redirected = status;
      continue;
    }
    return done({ status, wall: wallFor(status) }, body, url);
  }
  // More than three redirects on the same host: the last one is kept.
  return done({ status: redirected });
}

/**
 * One host's check: robots.txt, then its front page, following same-host
 * redirects robots.txt allows, each GET after the Crawl-delay. Returns the
 * result to keep, or null when the run's time (`deadlineAt`) would end before
 * the next request could (the host is asked in a later run). Never throws.
 */
export async function checkFrontPage(host, options = {}) {
  if (typeof host !== 'string' || !HOST.test(host)) return null;
  const now = options.now || (() => Date.now());
  const date = new Date(now()).toISOString().slice(0, 10);
  const read = await readPage(`https://${host}/`, { ...options, now, maxBytes: MAX_BODY_BYTES });
  return read ? frontPageResult({ host, date, ...read.values }) : null;
}

// --- member-list and catalog-link -----------------------------------------

export const MEMBER_LIST_PREFIX = 'front-page-member-list';
export const CATALOG_LINK_PREFIX = 'front-page-catalog-link';
export const ITEM_FAMILIES = Object.freeze(['aspen', 'polaris', 'koha', 'tlc', 'unknown']);
// Catalog families as links and page markup show them (the patterns the
// owner's list names: host or path).
export const LINK_FAMILIES = Object.freeze(['bibliocommons', 'polaris', 'aspen', 'koha', 'tlc', 'apollo', 'evergreen', 'vega', 'sirsi']);
const ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;
// Member lists and homepages are longer than a front page; the select or the
// links may come late in it.
const MAX_PAGE_BYTES = 1536 * 1024;
const MAX_OPTIONS = 1_200;
const MAX_LINKS = 60;
// One log line stays well under any runtime log line limit.
const MAX_LINE_BYTES = 3_000;
const short = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

/** A catalog address an item may name: https, a valid host, no credentials or fragment. */
function itemUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port || !HOST.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}

/** The member-list items, validated: { id, catalog, family, url, state, ... }. */
export function memberListItems(list = hostList) {
  const items = list?.memberLists || [];
  if (!Array.isArray(items)) throw new TypeError('front-page-hosts.json memberLists must be a list');
  const ids = new Set();
  for (const item of items) {
    if (!ID.test(item?.id || '') || ids.has(item.id)) throw new TypeError(`front-page-hosts.json memberLists: bad or repeated id ${item?.id}`);
    ids.add(item.id);
    if (!ITEM_FAMILIES.includes(item.family) || !itemUrl(item.url) || !/^[A-Z]{2}$/.test(item.state || '') || typeof item.catalog !== 'string' || typeof item.source !== 'string') {
      throw new TypeError(`front-page-hosts.json memberLists: invalid item ${item.id}`);
    }
  }
  return items;
}

/** The catalog-link items, validated: { libraryId, url, catalogHost?, source }. */
export function catalogLinkItems(list = hostList) {
  const items = list?.catalogLinks || [];
  if (!Array.isArray(items)) throw new TypeError('front-page-hosts.json catalogLinks must be a list');
  const ids = new Set();
  for (const item of items) {
    if (!LIBRARY_ID.test(item?.libraryId || '') || ids.has(item.libraryId)) throw new TypeError(`front-page-hosts.json catalogLinks: bad or repeated libraryId ${item?.libraryId}`);
    ids.add(item.libraryId);
    if (!itemUrl(item.url) || typeof item.source !== 'string' || (item.catalogHost != null && !HOST.test(item.catalogHost))) {
      throw new TypeError(`front-page-hosts.json catalogLinks: invalid item ${item.libraryId}`);
    }
  }
  return items;
}

/** The catalog family a link points at, by its host or path, or null. */
export function linkFamily(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const on = domain => host === domain || host.endsWith(`.${domain}`);
  if (on('bibliocommons.com')) return 'bibliocommons';
  if (on('polarislibrary.com') || /\/polaris\//i.test(`${path}/`)) return 'polaris';
  if (on('aspendiscovery.org') || on('groveforlibraries.com') || /\/Search\/Results/.test(path)) return 'aspen';
  if (on('bywatersolutions.com') || /opac-search\.pl|\/cgi-bin\/koha\//.test(path)) return 'koha';
  if (on('tlcdelivers.com') || /ls2pac/i.test(host + path)) return 'tlc';
  if (on('biblionix.com')) return 'apollo';
  if (/\/eg\/opac\b/.test(path)) return 'evergreen';
  if (on('iiivega.com')) return 'vega';
  if (on('ent.sirsi.net')) return 'sirsi';
  return null;
}

// The catalog families a page's own markup names (a hint for review, never applied).
const FAMILY_MARKS = [
  ['aspen', /aspen ?discovery|aspen-discovery|\/interface\/themes\/|AspenDiscovery/i],
  ['koha', /\/opac-tmpl\/|opac-main\.pl|Koha online catalog|id=["']koha/i],
  ['polaris', /PowerPAC|\/polaris\/|polarislibrary\.com/i],
  ['tlc', /ls2pac|tlcdelivers\.com|CARL\.?X|carl-connect/i],
  ['evergreen', /\/eg\/opac\//i],
  ['sierra', /\/screens\/|\/iii\/encore|Sierra ?(?:WebPAC|ILS)|innovative interfaces/i],
  ['vega', /iiivega\.com/i],
  ['sirsi', /SirsiDynix|ent\.sirsi\.net|\/client\/en_US\//i],
  ['apollo', /biblionix/i],
];
export function familyMarks(body) {
  return FAMILY_MARKS.filter(([, pattern]) => pattern.test(String(body || ''))).map(([family]) => family);
}

function pageTitle(body) {
  const match = String(body || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? short(text(match[1]), 200) : '';
}

// Selects that list libraries or locations: by their name, id or label.
const LOCATION_SELECT = /locat|librar|branch|org(?:aniz|anis)?|scope|limit|site|locg|holding|owning|avail|ctx/i;

/**
 * The member lists a page's selectors show: `{ selects: [{ name, label }],
 * options: [[select index, value, text], ...] }` for each select whose name,
 * id or label speaks of libraries or locations, with at least two options.
 */
export function memberOptions(body) {
  const html = String(body || '');
  const labels = new Map([...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)].map(match => [attrs(match[1]).for, short(text(match[2]), 80)]).filter(([key]) => key));
  const selects = [];
  const options = [];
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const tag = attrs(match[1]);
    const label = labels.get(tag.id) || short(tag['aria-label'] || tag.title || '', 80);
    if (!LOCATION_SELECT.test(`${tag.name || ''} ${tag.id || ''} ${label}`)) continue;
    const listed = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/select>|<\/optgroup>|$)/gi)]
      .map(option => [short(attrs(option[1]).value ?? text(option[2]), 80), short(text(option[2].replace(/<\/option>[\s\S]*$/i, '')), 120)])
      .filter(([value, name]) => value || name);
    if (listed.length < 2) continue;
    const index = selects.length;
    selects.push({ name: short(tag.name || tag.id || '', 80), label });
    for (const [value, name] of listed) if (options.length < MAX_OPTIONS) options.push([index, value, name]);
    if (selects.length >= 20) break;
  }
  return { selects, options };
}

/** TLC's GET /branch/branchLimits answer as member options: every object with a name and an id or code. */
export function branchLimitOptions(body) {
  let json;
  try { json = JSON.parse(body); } catch { return { selects: [], options: [] }; }
  const options = [];
  const walk = value => {
    if (options.length >= MAX_OPTIONS || value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) walk(item); return; }
    const name = value.name ?? value.displayName ?? value.branchName ?? value.description;
    const code = value.id ?? value.branchId ?? value.code ?? value.shortName ?? value.value;
    if (typeof name === 'string' && (typeof code === 'string' || typeof code === 'number')) options.push([0, short(code, 80), short(name, 120)]);
    for (const item of Object.values(value)) if (item && typeof item === 'object') walk(item);
  };
  walk(json);
  return options.length ? { selects: [{ name: 'branchLimits', label: '' }], options } : { selects: [], options: [] };
}

/** The outgoing catalog links of a homepage: [[url without query, family], ...]; `catalogHost` links kept whatever their family. */
export function catalogLinks(body, pageUrl, { catalogHost = null } = {}) {
  const links = new Map();
  const html = String(body || '');
  for (const match of html.matchAll(/<(?:a|area|form)\b([^>]*)>/gi)) {
    const tag = attrs(match[1]);
    const href = tag.href ?? tag.action;
    if (!href) continue;
    let url;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    const family = linkFamily(url.href) || (catalogHost && url.hostname.toLowerCase() === catalogHost ? 'catalog-host' : null);
    if (!family) continue;
    const kept = `${url.origin}${url.pathname}`.slice(0, 200);
    if (!links.has(kept)) links.set(kept, family);
    if (links.size >= MAX_LINKS) break;
  }
  return [...links];
}

const sameSite = (from, to) => from === to || to.endsWith(`.${from}`) || from.endsWith(`.${to}`);

/** A member-list part as logged: the read's header, and its share of the options. */
export function memberListPart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const head = readHead(value);
  if (!head || !ID.test(value.id || '')) return null;
  const { part, parts, selects = [], options = [], marks = [], title = '' } = value;
  if (!Number.isInteger(part) || !Number.isInteger(parts) || part < 1 || part > parts || parts > 50) return null;
  if (!Array.isArray(selects) || !selects.every(item => item && typeof item.name === 'string' && typeof item.label === 'string')) return null;
  if (!Array.isArray(options) || !options.every(item => Array.isArray(item) && item.length === 3 && Number.isInteger(item[0]) && typeof item[1] === 'string' && typeof item[2] === 'string')) return null;
  if (!Array.isArray(marks) || !marks.every(item => typeof item === 'string') || typeof title !== 'string') return null;
  return { id: value.id, ...head, part, parts, title, marks, selects, options };
}

/** A catalog-link part as logged. */
export function catalogLinkPart(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const head = readHead(value);
  if (!head || !LIBRARY_ID.test(value.libraryId || '')) return null;
  const { part, parts, links = [], title = '' } = value;
  if (!Number.isInteger(part) || !Number.isInteger(parts) || part < 1 || part > parts || parts > 50) return null;
  if (!Array.isArray(links) || !links.every(item => Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && typeof item[1] === 'string')) return null;
  if (typeof title !== 'string') return null;
  return { libraryId: value.libraryId, ...head, part, parts, title, links };
}

// The read's header: host, date, status, wall, movedTo, robots (as a front-page result keeps them).
function readHead(value) {
  const head = frontPageResult({ host: value.host, date: value.date, status: value.status, wall: value.wall, movedTo: value.movedTo, robots: value.robots });
  return head;
}

// Splits a list across parts so each log line stays under MAX_LINE_BYTES.
function partsOf(fixed, field, list) {
  const parts = [];
  let current = [];
  const size = items => Buffer.byteLength(JSON.stringify({ ...fixed, part: 99, parts: 99, [field]: items }));
  for (const item of list) {
    if (current.length && size([...current, item]) > MAX_LINE_BYTES) { parts.push(current); current = []; }
    current.push(item);
  }
  parts.push(current);
  return parts.map((items, index) => ({ ...fixed, part: index + 1, parts: parts.length, [field]: items }));
}

/** The log lines of one member-list read: one per part. */
export function memberListLines(result) {
  const { options = [], ...rest } = result;
  return partsOf(rest, 'options', options).map((part, index) => {
    const value = index === 0 ? part : { ...part, selects: [], marks: [], title: '' };
    return `${MEMBER_LIST_PREFIX} ${JSON.stringify(memberListPart(value))}`;
  });
}

/** The log lines of one catalog-link read: one per part. */
export function catalogLinkLines(result) {
  const { links = [], ...rest } = result;
  return partsOf(rest, 'links', links).map((part, index) => `${CATALOG_LINK_PREFIX} ${JSON.stringify(catalogLinkPart(index === 0 ? part : { ...part, title: '' }))}`);
}

/**
 * One member-list read: robots.txt, then the catalog's page once (same-host
 * redirects only). Returns the result `{ id, host, date, status, wall, ...,
 * title, marks, selects, options }`, or null when the run's time would end
 * first. Never throws.
 */
export async function checkMemberList(item, options = {}) {
  const url = itemUrl(item?.url);
  if (!url || !ID.test(item?.id || '')) return null;
  const now = options.now || (() => Date.now());
  const date = new Date(now()).toISOString().slice(0, 10);
  const tlc = item.family === 'tlc';
  const read = await readPage(url.href, { ...options, now, maxBytes: MAX_PAGE_BYTES,
    ...(tlc ? { accept: 'application/json', headers: { 'Ls2pac-config-type': 'pac', ...(item.tlcConfig ? { 'Ls2pac-config-name': item.tlcConfig } : {}) } } : {}) });
  if (!read) return null;
  const head = frontPageResult({ host: url.hostname, date, ...read.values });
  if (!head) return null;
  const found = tlc ? branchLimitOptions(read.body) : memberOptions(read.body);
  return { id: item.id, ...head, title: tlc ? '' : pageTitle(read.body), marks: tlc ? [] : familyMarks(read.body), ...found };
}

/**
 * One catalog-link read: robots.txt, then the library's homepage once (a
 * redirect within the same site followed, robots.txt read for each host).
 * Returns `{ libraryId, host, date, status, wall, ..., title, links }`, or
 * null when the run's time would end first. Never throws.
 */
export async function checkCatalogLink(item, options = {}) {
  const url = itemUrl(item?.url);
  if (!url || !LIBRARY_ID.test(item?.libraryId || '')) return null;
  const now = options.now || (() => Date.now());
  const date = new Date(now()).toISOString().slice(0, 10);
  const read = await readPage(url.href, { ...options, now, maxBytes: MAX_PAGE_BYTES, follows: sameSite });
  if (!read) return null;
  const head = frontPageResult({ host: url.hostname, date, ...read.values });
  if (!head) return null;
  return { libraryId: item.libraryId, ...head, title: pageTitle(read.body),
    links: read.url ? catalogLinks(read.body, read.url, { catalogHost: item.catalogHost || null }) : [] };
}

/** The committed member-list results, validated: a Map of id to result. */
export function memberListResults(list = resultList) {
  const results = new Map();
  for (const item of list?.memberLists || []) {
    const part = memberListPart({ ...item, part: 1, parts: 1 });
    if (!part || results.has(item.id)) throw new TypeError(`front-page-results.json has an invalid or repeated member list: ${item?.id}`);
    results.set(item.id, item);
  }
  return results;
}

/** The committed catalog-link results, validated: a Map of library ID to result. */
export function catalogLinkResults(list = resultList) {
  const results = new Map();
  for (const item of list?.catalogLinks || []) {
    const part = catalogLinkPart({ ...item, part: 1, parts: 1 });
    if (!part || results.has(item.libraryId)) throw new TypeError(`front-page-results.json has an invalid or repeated catalog-link result: ${item?.libraryId}`);
    results.set(item.libraryId, item);
  }
  return results;
}

/** Everything without a committed result, in the order a run does it: wall checks, member lists, catalog links. */
export function pendingFrontPageWork({ hosts = hostList, results = resultList } = {}) {
  const memberResults = memberListResults(results);
  const linkResults = catalogLinkResults(results);
  return {
    hosts: hostsWithoutResult(frontPageHosts(hosts), frontPageResults(results)),
    memberLists: memberListItems(hosts).filter(item => !memberResults.has(item.id)),
    catalogLinks: catalogLinkItems(hosts).filter(item => !linkResults.has(item.libraryId)),
  };
}

/**
 * One run: every host given (by default those without a committed result),
 * then the member lists and catalog links given (none by default; the daily
 * job passes pendingFrontPageWork()), `concurrency` hosts at once. Each
 * host's own reads go one after another (a wall check, a member list and a
 * homepage on one host never overlap, and each waits the Crawl-delay). A read
 * starts only while it can still finish within `runMs`. Each finished read is
 * logged at once, so a run cut short keeps what it finished. Returns counts
 * only.
 */
export async function runFrontPageChecks({ hosts = hostsWithoutResult(), memberLists = [], catalogLinks: linkItems = [], check = checkFrontPage,
  checkMembers = checkMemberList, checkLinks = checkCatalogLink, concurrency = CONCURRENCY, runMs = RUN_MS,
  startMarginMs = START_MARGIN_MS, now = () => Date.now(), log = line => process.stderr.write(`${line}\n`) } = {}) {
  const deadlineAt = now() + runMs;
  const hostOf = value => { try { return new URL(value).hostname.toLowerCase(); } catch { return String(value); } };
  // Each task: its host, and how to run and log it.
  const tasks = [
    ...hosts.map(host => ({ host, run: async () => {
      const result = frontPageResult(await check(host, { deadlineAt }));
      return result ? [logLine(result)] : null;
    } })),
    ...memberLists.map(item => ({ host: hostOf(item.url), run: async () => {
      const result = await checkMembers(item, { deadlineAt });
      return result ? memberListLines(result) : null;
    } })),
    ...linkItems.map(item => ({ host: hostOf(item.url), run: async () => {
      const result = await checkLinks(item, { deadlineAt });
      return result ? catalogLinkLines(result) : null;
    } })),
  ];
  // One queue per host, in the order given.
  const byHost = new Map();
  for (const task of tasks) byHost.set(task.host, [...(byHost.get(task.host) || []), task]);
  const queue = [...byHost.values()];
  let checked = 0;
  async function worker() {
    while (queue.length && now() + startMarginMs <= deadlineAt) {
      const hostTasks = queue.shift();
      for (const task of hostTasks) {
        if (now() + startMarginMs > deadlineAt) break;
        let lines;
        try { lines = await task.run(); } catch { lines = null; }
        if (!lines?.length || lines.some(line => line.endsWith(' null'))) continue;
        checked += 1;
        for (const line of lines) {
          try { log(line); } catch { /* a log failure never stops the run */ }
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
  return { checked, remaining: tasks.length - checked };
}
