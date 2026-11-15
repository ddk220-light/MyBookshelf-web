// Audit captured policies against captured request URLs, without any network calls.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { robotsRules, robotsAllowed } from '../../../../../server/services/providers/robots.js';
const root = path.resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
const countries = ['pakistan', 'bangladesh', 'nigeria', 'philippines', 'indonesia'];
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function statusOf(o) {
  if (o.status != null && /^\d{3}/.test(String(o.status))) return Number(String(o.status).slice(0, 3));
  return Number(String(o.error || '').match(/HTTP Error (\d{3})/)?.[1]) || null;
}
function snapshot(o, sourceFile, countryRoot, robots = false) {
  const hint = o.evidence || o.evidence_file;
  const candidates = [hint && path.resolve(countryRoot, hint), hint && path.resolve(path.dirname(sourceFile), hint),
    sourceFile.replace(/\.json$/, '.html'), robots && path.join(path.dirname(sourceFile), 'robots.txt')].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p) && fs.statSync(p).isFile()) return { path: p, text: fs.readFileSync(p, 'utf8') };
  return typeof o.text === 'string' ? { path: null, text: o.text } : null;
}
const output = { auditedAt: new Date().toISOString(), method: 'offline_replay_of_current_robotsRules_and_robotsAllowed_for_mybookshelf', countries: {} };
for (const country of countries) {
  const dir = path.join(root, country), observed = [];
  function visit(o, sourceFile, key = '') {
    if (!o || typeof o !== 'object') return;
    if (typeof o.url === 'string' && /^https?:\/\//.test(o.url) && (o.status != null || o.error != null || o.checked_at || o.checked_at_utc)) observed.push({ o, sourceFile, key });
    for (const [k, value] of Object.entries(o)) if (value && typeof value === 'object') visit(value, sourceFile, key ? `${key}.${k}` : k);
  }
  for (const file of walk(dir).filter(p => p.endsWith('.json'))) {
    try { visit(JSON.parse(fs.readFileSync(file, 'utf8')), file); } catch { /* A concurrently written evidence file may be incomplete. */ }
  }
  const policies = new Map();
  for (const row of observed) {
    const { o, sourceFile } = row;
    if (new URL(o.url).pathname !== '/robots.txt') continue;
    const body = snapshot(o, sourceFile, dir, true), status = statusOf(o), origin = new URL(o.url).origin;
    const policy = { origin, status, checkedAt: o.checked_at_utc || o.checked_at || null, sourceFile, snapshotFile: body?.path || null,
      policy: status >= 200 && status < 300 && body ? robotsRules(body.text, 'mybookshelf') : null,
      sourceQueryAllowed: o.query_allowed ?? null };
    if (!policies.has(origin) || String(policy.checkedAt) > String(policies.get(origin).checkedAt)) policies.set(origin, policy);
  }
  const checks = [], seen = new Set();
  for (const { o, sourceFile, key } of observed) {
    const url = new URL(o.url);
    if (url.pathname === '/robots.txt' || (!url.search && !/search|opac|record|detail|browse|bsearch/i.test(url.pathname))) continue;
    if (seen.has(o.url)) continue;
    seen.add(o.url);
    const p = policies.get(url.origin);
    let classification = 'unresolved_no_saved_policy', allowed = null;
    if (p) {
      if (p.policy) { allowed = robotsAllowed(p.policy, o.url); classification = allowed ? 'allowed_by_saved_rules' : 'disallowed_by_saved_rules'; }
      else if (p.status >= 400 && p.status < 500 && p.status !== 429) { allowed = true; classification = 'no_rules_http_4xx_app_allows'; }
      else if (p.status) { allowed = false; classification = 'temporary_block_http_status'; }
      else classification = 'unresolved_network_policy_error_app_temporarily_allows';
    }
    checks.push({ url: o.url, capturedStatus: statusOf(o), sourceFile, metadataKey: key, allowed, classification,
      policySource: p?.sourceFile || null, policyStatus: p?.status || null, policySnapshot: p?.snapshotFile || null,
      crawlDelayMs: p?.policy?.delay || 0 });
  }
  output.countries[country] = { policyOrigins: policies.size, capturedUrls: checks.length,
    disallowedOrTemporarilyBlocked: checks.filter(x => x.allowed === false), unresolved: checks.filter(x => x.allowed === null), checks };
}
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
