// Gentle reachability recheck for shared catalog hosts that could not be
// reached earlier. Per host, in order, and stopping at the first policy
// refusal: robots.txt, the member's catalog search page, then one search
// through the app's own provider and request budget. These are diagnostics,
// never book checks: an error is "couldn't check", never absence.
//
//   node tools/catalog-hardening/host-recheck.mjs output.json [group ...]
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { getLibraryById } from '../../server/services/directory.js';
import { getProvider } from '../../server/services/providers/index.js';
import { withCatalogOperation, USER_AGENT } from '../../server/services/providers/http.js';
import { createRobotsPolicy, robotsRules, robotsAllowed } from '../../server/services/providers/robots.js';
import { createMemoryHostGate } from '../../server/catalog-store/hostGate.js';
import { platformFor, hostFor } from '../../server/services/catalog-lookup/platforms.js';

export const RECHECK_GROUPS = [
  { group: 'KALNET', prefix: 'vufind:kalnet-', member: 'vufind:kalnet-018aae537f54' },
  { group: 'IDEAL', prefix: 'koha:ideal-', member: 'koha:ideal-aaua' },
  { group: 'Somaiya', prefix: 'vufind:somaiya-', member: 'vufind:somaiya-aubl' },
  { group: 'IIT Madras', member: 'chamo:iit-madras' },
  { group: 'National Science Library', member: 'koha:national-science-library' },
  { group: 'KLH Global Business School', member: 'koha:klh-global-business-school' },
  { group: 'IIM Visakhapatnam', member: 'koha:iim-visakhapatnam' },
  { group: 'Indian Institute of Astrophysics', member: 'koha:indian-institute-astrophysics' },
];
const TIMEOUT_MS = 15_000;
const SEARCH_QUERY = 'history';

/** How one raw answer reads. 403/401 and CDN blocks are refusals; 5xx and
 * network errors are unreachable; nothing here is ever "empty". */
export function classifyAnswer(answer) {
  if (!answer) return 'not_sent';
  if (answer.error) return /abort|timeout/i.test(answer.error) ? 'timeout' : 'network_error';
  if (answer.status === 401 || answer.status === 403) return /cloudfront/i.test(answer.cache || answer.server || answer.bodyStart || '') ? 'cdn_refusal' : 'refused';
  // The execution egress proxy answers 503 itself when it cannot reach the
  // host. That is a connection failure, not the site's robots answer.
  if (answer.status === 503 && /upstream connect error|remote connection failure/i.test(answer.bodyStart || '') && !answer.server) return 'egress_connect_failure';
  if (answer.status === 429 || answer.status >= 500) return 'server_error';
  if (answer.status >= 200 && answer.status < 400) return 'answered';
  return 'client_error';
}

async function rawGet(url) {
  const started = Date.now(), at = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, text/plain, */*' }, signal: controller.signal, redirect: 'manual' });
    const text = await response.text().catch(() => '');
    return { url, at, status: response.status, durationMs: Date.now() - started,
      server: response.headers.get('server') || undefined, cache: response.headers.get('x-cache') || undefined,
      location: response.headers.get('location') || undefined, bytes: text.length,
      bodyStart: response.ok ? undefined : text.replace(/\s+/g, ' ').trim().slice(0, 160), text };
  } catch (error) {
    return { url, at, error: `${error.name}: ${error.message}${error.cause ? ` (${error.cause.code || ''} ${error.cause.message || ''})` : ''}`.slice(0, 300), durationMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}

async function appSearch(entry, robots, hostGate) {
  const provider = getProvider(entry), policy = platformFor(entry);
  const started = Date.now(), at = new Date().toISOString();
  if (!provider?.searchCatalog) return { at, ok: false, code: 'CATALOG_UNSUPPORTED', durationMs: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    return await withCatalogOperation({ maxRequests: 6, signal: controller.signal, robots: (url) => robots.check(url),
      minIntervalMs: policy?.minIntervalMs || 0,
      gate: (host, options) => hostGate.reserve(host, { ...options, perMinute: policy?.perMinute || 10, spacingMs: Math.max(options.spacingMs || 0, policy?.minIntervalMs || 0) }),
    }, async (op) => {
      const value = await provider.searchCatalog(SEARCH_QUERY);
      const rows = Array.isArray(value) ? value : value?.records || [];
      return { at, ok: true, query: SEARCH_QUERY, records: rows.length, requests: op.requests, durationMs: Date.now() - started };
    });
  } catch (error) {
    return { at, ok: false, query: SEARCH_QUERY, code: error?.code || error?.name || 'ERROR', message: String(error?.message || error).slice(0, 300), durationMs: Date.now() - started };
  } finally { clearTimeout(timer); controller.abort(); }
}

export async function recheckHost(config, { robots = createRobotsPolicy(), hostGate = createMemoryHostGate() } = {}) {
  const entry = getLibraryById(config.member);
  const host = hostFor(entry), origin = new URL(entry.baseUrl || entry.catalogUrl).origin;
  const result = { ...config, host, steps: [] };
  const strip = ({ text, ...rest }) => rest;
  const robotsAnswer = await rawGet(`${origin}/robots.txt`);
  const robotsClass = classifyAnswer(robotsAnswer);
  result.steps.push({ step: 'robots.txt', ...strip(robotsAnswer), outcome: robotsClass });
  // A refusal at robots.txt (CDN block or 401/403) stops the host at once.
  if (['cdn_refusal', 'refused'].includes(robotsClass)) {
    result.outcome = 'refused'; result.stoppedAt = `robots.txt ${robotsClass === 'cdn_refusal' ? 'CDN refusal' : 'refusal'}`; return result;
  }
  if (robotsClass === 'server_error') { result.outcome = 'unreachable'; result.stoppedAt = 'robots.txt 5xx/429 (temporarily disallowed, RFC 9309)'; return result; }
  const searchPage = entry.catalogUrl || entry.baseUrl;
  if (robotsClass === 'answered') {
    const allowed = robotsAllowed(robotsRules(robotsAnswer.text), searchPage);
    result.steps[0].searchPageAllowed = allowed;
    if (!allowed) { result.outcome = 'refused'; result.stoppedAt = 'robots.txt disallows the search page'; return result; }
  }
  const page = await rawGet(searchPage);
  const pageClass = classifyAnswer(page);
  result.steps.push({ step: 'search page', ...strip(page), outcome: pageClass });
  if (['cdn_refusal', 'refused'].includes(pageClass)) { result.outcome = 'refused'; result.stoppedAt = 'search page refusal'; return result; }
  const search = await appSearch(entry, robots, hostGate);
  result.steps.push({ step: 'app search', ...search, outcome: search.ok ? 'answered' : (search.code === 'CATALOG_PROVIDER_BLOCKED' || search.code === 'CATALOG_ROBOTS_DISALLOWED' ? 'refused' : 'error') });
  // When robots.txt itself could not be reached (egress connection failure),
  // the app's robots policy holds back under RFC 9309. That is not the site's
  // refusal: the host is unreachable from here.
  if (!search.ok && robotsClass === 'egress_connect_failure' && result.steps.at(-1).outcome === 'refused') {
    result.steps.at(-1).outcome = 'held_back_robots_unreachable';
  }
  result.outcome = search.ok ? 'answers' : (result.steps.at(-1).outcome === 'refused' ? 'refused' : 'unreachable');
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outputPath] = process.argv.slice(2);
  if (!outputPath) throw new Error('Usage: node tools/catalog-hardening/host-recheck.mjs output.json');
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    userAgent: USER_AGENT, method: 'Per host: robots.txt, then the member catalog page, then one app search for "history" under the app request budget. Stops at the first policy refusal. Not book checks.', hosts: [] };
  const only = process.argv.slice(3);
  for (const config of RECHECK_GROUPS.filter((item) => !only.length || only.includes(item.group))) {
    const result = await recheckHost(config);
    report.hosts.push(result);
    console.log(JSON.stringify({ group: result.group, outcome: result.outcome, steps: result.steps.map((s) => `${s.step}:${s.status ?? s.records ?? ''}${s.error || s.code || ''}`) }));
  }
  report.finishedAt = new Date().toISOString();
  report.rawRequestsSent = report.hosts.reduce((sum, h) => sum + h.steps.filter((s) => s.step !== 'app search').length, 0);
  report.appSearchRequests = report.hosts.reduce((sum, h) => sum + (h.steps.find((s) => s.step === 'app search')?.requests || 0), 0);
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
}
