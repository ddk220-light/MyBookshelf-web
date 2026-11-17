// Robots.txt audit for every catalog origin behind a listed Indian library.
// The app's robots policy treats a network failure reading robots.txt as "no
// restrictions" for five minutes. If that failure is only the app's transport
// (an incomplete TLS chain, legacy renegotiation) while the site serves rules
// normally, the app would never see a refusal. This reads each robots.txt
// twice — with the app's policy fetch and with curl (system trust store) — and
// flags origins where the two disagree or where the rules refuse the app's
// catalog paths. One request per origin per method; diagnostics, not book checks.
//
//   node tools/catalog-hardening/robots-audit.mjs output.json
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { getLibraryById } from '../../server/services/directory.js';
import { createRobotsPolicy, robotsRules, robotsAllowed, ROBOTS_AGENT_TOKEN } from '../../server/services/providers/robots.js';

const listed = JSON.parse(readFileSync(new URL('../../server/data/india-catalogs-listed.json', import.meta.url), 'utf8')).libraryIds;
const origins = new Map();
for (const id of listed) {
  const entry = getLibraryById(id);
  for (const route of [entry, ...(entry.alternateCatalogs || [])]) {
    const url = route.catalogUrl || route.baseUrl;
    if (!url) continue;
    const origin = new URL(url).origin;
    if (!origins.has(origin)) origins.set(origin, { sample: url, libraries: [] });
    origins.get(origin).libraries.push(id);
  }
}

function curl(url) {
  try {
    const out = execFileSync('curl', ['-sS', '-L', '-m', '20', '-A', 'MyBookshelf/1.0 (web; +https://mybookshelf.cloud/privacy)', '-w', '\n%{http_code}', url], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const cut = out.lastIndexOf('\n');
    return { status: Number(out.slice(cut + 1)), text: out.slice(0, cut) };
  } catch (error) { return { error: String(error.stderr || error.message).trim().slice(0, 200) }; }
}

const report = { schemaVersion: 1, startedAt: new Date().toISOString(), agentToken: ROBOTS_AGENT_TOKEN, origins: [] };
for (const [origin, { sample, libraries }] of origins) {
  let app;
  const policy = createRobotsPolicy({ fetchPolicy: async (url) => {
    try { const value = await (await import('../../server/services/providers/robots.js')).defaultFetchPolicy(url); app = { status: value.status }; return value; }
    catch (error) { app = { error: `${error.name}: ${error.cause?.code || error.message}`.slice(0, 200) }; throw error; }
  } });
  const appDecision = (await policy.check(sample)).allowed;
  const viaCurl = curl(`${origin}/robots.txt`);
  const curlRules = viaCurl.status >= 200 && viaCurl.status < 300 ? robotsRules(viaCurl.text, ROBOTS_AGENT_TOKEN) : null;
  const curlDecision = curlRules ? robotsAllowed(curlRules, sample) : null;
  const flag = app?.error && curlRules ? (curlDecision ? 'app_transport_failure_rules_allow' : 'app_transport_failure_rules_refuse')
    : (appDecision === false ? 'refused' : 'ok');
  const row = { origin, sampleUrl: sample, libraries: libraries.length, app, appAllowed: appDecision, curl: viaCurl.error ? { error: viaCurl.error } : { status: viaCurl.status },
    curlAllowed: curlDecision, ...(curlRules && !curlDecision ? { refusingRules: viaCurl.text.slice(0, 400) } : {}), flag, libraryIds: libraries };
  report.origins.push(row);
  console.log(JSON.stringify({ origin, libraries: libraries.length, app: app?.status ?? app?.error, appAllowed: appDecision, curl: viaCurl.status ?? viaCurl.error, curlAllowed: curlDecision, flag }));
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
report.finishedAt = new Date().toISOString();
writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
