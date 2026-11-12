// robots.txt rules for the catalog lookup layer. The parser follows the
// connector audit's transport (feat/library-connector-audit,
// server/services/catalog-connectors/transport.js): the most specific
// matching group wins, the longest matching rule wins, Allow beats Disallow
// on a tie, and Crawl-delay is honoured as spacing between requests.
//
// Policy reads are not catalog lookups: they are cached per origin for a day,
// are not counted against an operation's request budget and never carry
// search text.

const DAY_MS = 24 * 60 * 60 * 1000;
const FAILURE_MS = 5 * 60 * 1000;
const POLICY_TIMEOUT_MS = 5_000;
const MAX_POLICY_BYTES = 256 * 1024;
export const ROBOTS_AGENT_TOKEN = 'mybookshelf';

export function robotsRules(text, userAgent = ROBOTS_AGENT_TOKEN) {
  const groups = [];
  let group = null;
  let hadRules = false;
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.replace(/#.*/, '').trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase().trim();
    const value = match[2].trim();
    if (key === 'user-agent') {
      if (!group || hadRules) {
        group = { agents: [], rules: [], delay: 0 };
        groups.push(group);
        hadRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      hadRules = true;
      if (['allow', 'disallow'].includes(key) && value) group.rules.push({ allow: key === 'allow', path: value });
      if (key === 'crawl-delay' && Number.isFinite(Number(value))) group.delay = Math.max(0, Number(value) * 1000);
    }
  }
  const token = userAgent.toLowerCase();
  const specific = groups.filter(g => g.agents.some(agent => agent !== '*' && token.includes(agent)));
  const selected = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  return { rules: selected.flatMap(g => g.rules), delay: Math.max(0, ...selected.map(g => g.delay)) };
}

function ruleMatches(rule, path) {
  const anchored = rule.path.endsWith('$');
  const body = (anchored ? rule.path.slice(0, -1) : rule.path)
    .replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

export function robotsAllowed(policy, url) {
  const parsed = new URL(url);
  const path = parsed.pathname + parsed.search;
  if (parsed.pathname === '/robots.txt') return true;
  const matches = policy.rules.filter(rule => ruleMatches(rule, path)).sort((a, b) =>
    b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow));
  return !matches.length || matches[0].allow;
}

const ALLOW_ALL = Object.freeze({ rules: [], delay: 0 });
const DISALLOW_ALL = Object.freeze({ rules: [{ allow: false, path: '/' }], delay: 0 });

// `fetchPolicy(url)` returns `{ status, text }` or throws. Following RFC 9309:
// 4xx means no restrictions; 5xx means the whole site is off limits for a
// while. A network failure reading robots.txt is treated as no restrictions
// for five minutes, because several Indian catalogs reset connections to
// /robots.txt while serving their OPAC normally (IIT Bhubaneswar, 12 Nov 2026).
export function createRobotsPolicy({ fetchPolicy = defaultFetchPolicy, now = () => Date.now(), userAgent = ROBOTS_AGENT_TOKEN } = {}) {
  const policies = new Map();

  async function policyFor(origin) {
    const cached = policies.get(origin);
    if (cached && cached.expiresAt > now()) return cached.policy;
    const pending = (async () => {
      try {
        const response = await fetchPolicy(`${origin}/robots.txt`);
        if (response.status >= 200 && response.status < 300) return { policy: robotsRules(response.text, userAgent), ttl: DAY_MS };
        if (response.status >= 400 && response.status < 500) return { policy: ALLOW_ALL, ttl: DAY_MS };
        return { policy: DISALLOW_ALL, ttl: FAILURE_MS };
      } catch {
        return { policy: ALLOW_ALL, ttl: FAILURE_MS };
      }
    })();
    // Concurrent checks for one origin share a single policy read.
    const entry = { expiresAt: Infinity, policy: pending.then(result => result.policy) };
    policies.set(origin, entry);
    const result = await pending;
    policies.set(origin, { expiresAt: now() + result.ttl, policy: Promise.resolve(result.policy) });
    if (policies.size > 2_000) policies.delete(policies.keys().next().value);
    return result.policy;
  }

  async function check(url) {
    const parsed = new URL(url);
    const policy = await policyFor(parsed.origin);
    return { allowed: robotsAllowed(policy, url), delayMs: policy.delay };
  }

  return Object.freeze({ check, clear: () => policies.clear() });
}

async function defaultFetchPolicy(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLICY_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': 'MyBookshelf/1.0 (web; +https://mybookshelf.cloud/privacy)', Accept: 'text/plain' } });
    const text = response.ok ? (await response.text()).slice(0, MAX_POLICY_BYTES) : '';
    return { status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}
