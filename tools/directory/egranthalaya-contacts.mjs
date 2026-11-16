// Capture the published library address of e-Granthalaya libraries that have
// no state in the directory. Each library's public OPAC home page shows a
// "Contact Details" block with labelled address, city and state fields
// (Lbl_Lib_LibAddress, Lbl_Lib_City, Lbl_Lib_State). Only those three fields
// are kept: no names of people, phone numbers or e-mail addresses.
//
// One host at a time, robots.txt checked once per host, a fixed spacing
// between requests, and an immediate stop on a refusal. Resumable.
//
//   node tools/directory/egranthalaya-contacts.mjs output.json [--all] [--resume]
//
// Without --all only libraries on the India allowlist are fetched.
import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getAllLibraries } from '../../server/services/directory.js';
import { USER_AGENT } from '../../server/services/providers/http.js';
import { robotsRules, robotsAllowed } from '../../server/services/providers/robots.js';

const SPACING_MS = 2500;
const TIMEOUT_MS = 30_000;

const decode = (value) => value
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#039;/g, "'").replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Drop e-mail addresses and phone numbers a library typed into an address
 * field. Narrow on purpose: a phone label is removed only together with the
 * number after it ("Telephone No. , 26737712"), so "Telephone Exchange",
 * "PH-II" or a "Tel-" tehsil prefix stay, and 6-digit PINs and hyphenated door
 * numbers ("48-16-11") are kept. Punctuation and spacing are left as published.
 */
export function withoutContactChannels(text) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '')
    .replace(/\b(?:tele?phone|phone|ph|tel|mobile|mob|fax)\b\.?\s*(?:no\.?)?\s*[:.,-]*\s*\+?\d[\d\s-]{5,}\d/gi, '')
    .replace(/\+91[\d\s-]{8,}\d/g, '')
    .replace(/(?<![\w-])\d{5}\s\d{5}(?![\w-])/g, '')
    .replace(/(?<![\w-])0\d{2,4}-\d{6,8}(?![\w-])/g, '')
    .replace(/(?<![\w-])\d{7,}(?![\w-])/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}

/** The labelled contact fields of an e-Granthalaya OPAC page. */
export function parseContact(html) {
  const field = (id) => {
    const match = html.match(new RegExp(`<span[^>]*id="${id}"[^>]*>([\\s\\S]*?)</span>`, 'i'));
    const text = match ? decode(match[1]) : '';
    return withoutContactChannels(text);
  };
  return { address: field('Lbl_Lib_LibAddress'), city: field('Lbl_Lib_City'), state: field('Lbl_Lib_State') };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: controller.signal, redirect: 'follow' });
    return { status: response.status, text: await response.text().catch(() => '') };
  } catch (error) {
    return { error: `${error.name}: ${error.cause?.code || error.message}`.slice(0, 200) };
  } finally { clearTimeout(timer); }
}

function pageUrl(entry) {
  const url = new URL('/OPAC/Default.aspx', entry.baseUrl);
  url.searchParams.set('CL_NAME', entry.egranthalayaCluster);
  url.searchParams.set('LIB_CODE', entry.egranthalayaLibraryCode);
  return url.toString();
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error('Usage: node tools/directory/egranthalaya-contacts.mjs output.json [--all] [--resume]');
  const allowlist = new Set(JSON.parse(readFileSync(new URL('../../server/data/india-catalogs-listed.json', import.meta.url), 'utf8')).libraryIds);
  const targets = getAllLibraries().filter((entry) => entry.country === 'IN' && entry.platform === 'egranthalaya' && !entry.region
    && entry.egranthalayaCluster && entry.egranthalayaLibraryCode && (process.argv.includes('--all') || allowlist.has(entry.id)));
  const report = process.argv.includes('--resume') && existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf8'))
    : { schemaVersion: 1, startedAt: new Date().toISOString(), userAgent: USER_AGENT, spacingMs: SPACING_MS,
      method: 'GET of each library\'s public OPAC home page; only the labelled address, city and state fields are kept.', libraries: [] };
  const done = new Set(report.libraries.map((item) => item.libraryId));
  const robots = new Map();
  const save = () => { writeFileSync(`${outputPath}.tmp`, JSON.stringify(report, null, 2) + '\n'); renameSync(`${outputPath}.tmp`, outputPath); };
  for (const entry of targets) {
    if (done.has(entry.id)) continue;
    const url = pageUrl(entry), origin = new URL(url).origin;
    if (!robots.has(origin)) {
      const answer = await get(`${origin}/robots.txt`);
      await sleep(SPACING_MS);
      if (answer.status === 401 || answer.status === 403) robots.set(origin, () => false);
      else if (answer.error || answer.status >= 500) robots.set(origin, () => false); // RFC 9309: unreachable robots.txt means hold back
      else if (answer.status >= 400) robots.set(origin, () => true);
      else { const rules = robotsRules(answer.text); robots.set(origin, (target) => robotsAllowed(rules, target)); }
    }
    if (!robots.get(origin)(url)) {
      report.libraries.push({ libraryId: entry.id, sourceUrl: url, observedAt: new Date().toISOString(), outcome: 'robots_held_back' });
      save(); continue;
    }
    const page = await get(url);
    const item = { libraryId: entry.id, sourceUrl: url, observedAt: new Date().toISOString() };
    if (page.error) Object.assign(item, { outcome: 'error', error: page.error });
    else if (page.status !== 200) Object.assign(item, { outcome: 'http_error', status: page.status });
    else Object.assign(item, { outcome: 'answered', pageSha256: createHash('sha256').update(page.text).digest('hex'), ...parseContact(page.text) });
    report.libraries.push(item);
    console.log(JSON.stringify({ id: item.libraryId, outcome: item.outcome, state: item.state, address: item.address }));
    save();
    if (page.status === 401 || page.status === 403 || page.status === 429) { console.log(JSON.stringify({ stop: `HTTP ${page.status}` })); break; }
    await sleep(SPACING_MS);
  }
  report.finishedAt = new Date().toISOString();
  save();
}
