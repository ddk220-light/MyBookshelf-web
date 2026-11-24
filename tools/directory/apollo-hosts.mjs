// Add Apollo (Biblionix) libraries to the US directory from a list of hosts
// (USA plan step 7). Apollo has no public customer list (about 900 to 1,000
// US libraries, research item 8), so the directory grows only from a list a
// person has checked, such as one Biblionix sends after outreach: each host
// becomes a data change, never a harvest. Nothing here contacts any host.
//
//   node tools/directory/apollo-hosts.mjs --imls <PLS_FY24_AE_pud24i.csv> --hosts <list.tsv> [--on YYYY-MM-DD] [--write]
//   node tools/directory/apollo-hosts.mjs --imls <PLS_FY24_AE_pud24i.csv> --suggest <host> [<host> ...]
//
// --imls is the IMLS Public Libraries Survey FY2024 administrative entity file
// (pls_fy2024_csv.zip from imls.gov). --hosts is a tab-separated list with a
// header row; its columns:
//   host      <name>.biblionix.com (required)
//   fscsKey   the library's IMLS key (required), chosen by a person: --suggest
//             lists the IMLS libraries whose name or town is the host's name,
//             and a name that fits more than one library waits
//   source    how the host is known to be this library's (required), e.g.
//             "Biblionix's customer list (e-mail of 10 January 2027)"
//   name      the library's own name (optional; else the IMLS name)
//   slug      the entry's slug (optional; else from the name and state)
//   listing   connected (default) or waiting
//   reason    why it waits (required with waiting)
//   gate      front-page (default): offered only once the app's own
//             front-page check (server/data/front-page-results.json) finds the
//             host open; none: offered now, only where an agent saw the host
//             without a wall, which `wall` must then say ("none seen ...")
//   robots, wall, identifiedBy   the entry's evidence (optional; defaults below)
// A host already in the directory, an IMLS key another US entry has, a key
// IMLS does not list, a place outside the 50 states and DC, or a row missing
// what it needs stops the run, and nothing is written. Without --write the
// run only prints what it would add.
//
// Each new entry gets its name, state, town and position from the IMLS record
// (never from the name), the host as its catalog (`baseUrl`), the evidence, and
// its listing in server/data/us-catalogs-listed.json; a host behind the
// front-page gate, or one whose entry waits, is added to
// server/data/front-page-hosts.json (`unseen`), so the production check gives
// it a result. Apollo may store (catalog-policies.json platforms.apollo), so
// no storage rule is needed. Then run node tools/seo/us-pages.mjs: an offered
// library gets its tap-to-check page.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATES = Object.freeze({
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
});
const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.biblionix\.com$/;
// Biblionix's own hosts, not a library's.
const VENDOR = /^(?:www|demonstration|demo|support|pythia)\.|-images\.biblionix\.com$/;
const FSCS = /^[A-Z]{2}\d{4}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLUMNS = ['host', 'fscsKey', 'source', 'name', 'slug', 'listing', 'reason', 'gate', 'robots', 'wall', 'identifiedBy'];
export const IMLS_SOURCE = 'IMLS Public Libraries Survey FY2024 (administrative entity file)';
export const FAMILY = 'Apollo (Biblionix-hosted)';
export const DEFAULT_ROBOTS = 'not read for this host; every *.biblionix.com robots.txt read so far is Biblionix\'s template (User-agent: * Disallow: /ill/; Yandex disallowed; no Crawl-delay; Claude agents not named; research items 8 and 11, 23 November 2026), which leaves the catalog open; the app reads it live before every check';
export const DEFAULT_WALL = 'not looked for: no agent was cleared to contact this host; the entry is offered only once the app\'s own front-page check (server/data/front-page-results.json) finds the host open, and a wall at a check is couldn\'t check';
const CAPABILITIES = Object.freeze({ catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true });

/** The rows of a CSV text (quoted fields, CRLF). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** The IMLS administrative entity records, a Map by FSCSKEY. */
export function imlsRecords(text) {
  const [header, ...rows] = parseCsv(text);
  for (const column of ['STABR', 'FSCSKEY', 'LIBNAME', 'ADDRESS', 'CITY', 'ZIP', 'CNTY', 'LATITUDE', 'LONGITUD']) {
    if (!header?.includes(column)) throw Error(`The IMLS file has no ${column} column`);
  }
  return new Map(rows.map(values => Object.fromEntries(header.map((column, i) => [column, (values[i] ?? '').trim()]))).map(record => [record.FSCSKEY, record]));
}

/** The rows of a host list (tab-separated, a header row); throws on an unknown column. */
export function parseHostList(text) {
  const lines = String(text || '').split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));
  const header = (lines.shift() || '').split('\t').map(value => value.trim());
  const unknown = header.filter(column => !COLUMNS.includes(column));
  if (unknown.length) throw Error(`Unknown column(s) in the host list: ${unknown.join(', ')}`);
  if (!header.includes('host') || !header.includes('fscsKey') || !header.includes('source')) throw Error('The host list needs host, fscsKey and source columns');
  return lines.map(line => {
    const values = line.split('\t');
    return Object.fromEntries(header.map((column, i) => [column, (values[i] ?? '').trim()]).filter(([, value]) => value !== ''));
  });
}

// Title case for IMLS's capitals: "ST. JOSEPH" is "St. Joseph", "O'FALLON" "O'Fallon".
export function titleCase(value) {
  return String(value || '').toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (all, lead, letter) => lead + letter.toUpperCase())
    .replace(/\b([od])'([a-z])/gi, (all, lead, letter) => `${lead.toUpperCase()}'${letter.toUpperCase()}`);
}
const round = value => Math.round(Number(value) * 1e6) / 1e6;
/** A slug from the library's name and state: "Clear Lake Public Library", Iowa: clear-lake-ia. */
export function slugFor(name, state) {
  const words = String(name).toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/\s+(?:public\s+)?(?:library|libraries)(?:\s+(?:system|district))?$/, '').trim();
  return `${words.replace(/\s+/g, '-')}-${state.toLowerCase()}`;
}
const squash = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** IMLS libraries in the 50 states and DC whose name starts with the host's name, or whose town is it: candidates for a person to choose from, never a choice. */
export function suggest(host, imls) {
  const label = squash(String(host).replace(/\.biblionix\.com$/, ''));
  return [...imls.values()].filter(record => STATES[record.STABR] && label && (squash(record.LIBNAME).startsWith(label) || squash(record.CITY) === label))
    .map(record => ({ fscsKey: record.FSCSKEY, name: record.LIBNAME, city: record.CITY, state: record.STABR }));
}

const hostOf = value => { try { return new URL(value).hostname.toLowerCase(); } catch { return null; } };

/**
 * What a host list adds: `{ entries, connected, waiting, frontPageHosts }`, or
 * throws with every problem found. `directory` is every directory entry (the
 * merged directory); nothing is written.
 */
export function planAdditions({ rows, imls, directory, frontPageHosts = [], today }) {
  if (!DATE.test(today || '')) throw Error('planAdditions needs today (YYYY-MM-DD)');
  const problems = [];
  const hosts = new Map();
  for (const entry of directory) for (const value of [entry.baseUrl, entry.catalogUrl]) { const host = hostOf(value); if (host) hosts.set(host, entry.id); }
  const ids = new Set(directory.map(entry => entry.id));
  const keys = new Map(directory.filter(entry => entry.country === 'US' && entry.evidence?.identity?.fscsKey).map(entry => [entry.evidence.identity.fscsKey, entry.id]));
  const gated = new Set(frontPageHosts.map(item => item.host));
  const seenHosts = new Set(), seenKeys = new Set();
  const plan = { entries: [], connected: [], waiting: [], frontPageHosts: [] };
  for (const [index, row] of rows.entries()) {
    const at = `row ${index + 1} (${row.host || 'no host'})`;
    const fail = message => problems.push(`${at}: ${message}`);
    const host = String(row.host || '').toLowerCase();
    if (!HOST.test(host) || VENDOR.test(host)) { fail('not a library\'s <name>.biblionix.com host'); continue; }
    if (seenHosts.has(host)) { fail('listed twice'); continue; }
    seenHosts.add(host);
    if (hosts.has(host)) { fail(`already in the directory (${hosts.get(host)})`); continue; }
    if (!FSCS.test(row.fscsKey || '')) { fail('needs the library\'s IMLS key (fscsKey)'); continue; }
    const record = imls.get(row.fscsKey);
    if (!record) { fail(`IMLS lists no ${row.fscsKey}`); continue; }
    if (!STATES[record.STABR]) { fail(`${row.fscsKey} is outside the 50 states and DC`); continue; }
    if (keys.has(row.fscsKey)) { fail(`${row.fscsKey} is already ${keys.get(row.fscsKey)} (a catalog move needs a person)`); continue; }
    if (seenKeys.has(row.fscsKey)) { fail(`${row.fscsKey} is listed twice`); continue; }
    seenKeys.add(row.fscsKey);
    if (!row.source) { fail('needs its source'); continue; }
    const listing = row.listing || 'connected';
    if (!['connected', 'waiting'].includes(listing)) { fail(`unknown listing ${listing}`); continue; }
    if (listing === 'waiting' && !row.reason) { fail('a waiting entry needs its reason'); continue; }
    const gate = row.gate || 'front-page';
    if (!['front-page', 'none'].includes(gate)) { fail(`unknown gate ${gate}`); continue; }
    if (gate === 'none' && !/^none seen\b/.test(row.wall || '')) { fail('gate none needs the wall an agent saw ("none seen ...")'); continue; }
    const lat = round(record.LATITUDE), lon = round(record.LONGITUD);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !record.LATITUDE || !record.LONGITUD) { fail(`${row.fscsKey} has no position in the IMLS file`); continue; }
    const name = row.name || titleCase(record.LIBNAME);
    const slug = row.slug || slugFor(name, record.STABR);
    if (!SLUG.test(slug)) { fail(`invalid slug ${slug}`); continue; }
    const id = `apollo:${slug}`;
    if (ids.has(id) || plan.entries.some(entry => `apollo:${entry.slug}` === id)) { fail(`${id} is taken`); continue; }
    const entry = {
      slug, name, country: 'US', region: STATES[record.STABR], city: titleCase(record.CITY), lat, lon,
      platform: 'apollo', capabilities: ['catalogSearch', 'availability'],
      catalogUrl: `https://${host}/catalog/`, baseUrl: `https://${host}/`,
      catalogScope: 'library', branches: [], publicCatalogValidated: true, publicCatalogCapabilities: { ...CAPABILITIES },
      evidence: {
        identity: { source: IMLS_SOURCE, fscsKey: record.FSCSKEY, imlsName: record.LIBNAME,
          address: `${record.ADDRESS}, ${record.CITY}, ${record.STABR} ${record.ZIP} (${record.CNTY} County)` },
        catalog: { host, source: row.source, ...(row.identifiedBy ? { identifiedBy: row.identifiedBy } : {}), family: FAMILY,
          robots: row.robots || DEFAULT_ROBOTS, wall: row.wall || (gate === 'none' ? '' : DEFAULT_WALL) },
      },
    };
    plan.entries.push(entry);
    if (listing === 'connected') plan.connected.push(id);
    else plan.waiting.push({ id, waitsOn: 'identity', reason: row.reason, date: today });
    if ((gate === 'front-page' || listing === 'waiting') && !gated.has(host)) {
      plan.frontPageHosts.push({ host, family: 'apollo', why: 'unseen', state: record.STABR, system: `${name}${listing === 'waiting' ? ' (identity not settled)' : ''}` });
    }
  }
  if (problems.length) throw Object.assign(Error(`The host list has problems:\n${problems.join('\n')}`), { problems });
  return plan;
}

/** The data files with a plan applied (new objects; the counts kept in step). */
export function applyPlan({ catalogs, listed, frontPage }, plan, today) {
  const libraryIds = [...listed.libraryIds, ...plan.connected].sort();
  const connected = [...listed.connected, ...plan.connected].sort();
  const waiting = [...listed.waiting, ...plan.waiting].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const platforms = {};
  for (const id of libraryIds) { const platform = id.slice(0, id.indexOf(':')); platforms[platform] = (platforms[platform] || 0) + 1; }
  const nextListed = { ...listed, count: libraryIds.length,
    counts: { ...listed.counts, connected: connected.length, waiting: waiting.length },
    platforms: Object.fromEntries(Object.entries(platforms).sort(([a], [b]) => (a < b ? -1 : 1))),
    connected, waiting, libraryIds };
  const nextFrontPage = plan.frontPageHosts.length ? { ...frontPage, updatedOn: today, hosts: [...frontPage.hosts, ...plan.frontPageHosts] } : frontPage;
  return { catalogs: { ...catalogs, libraries: [...catalogs.libraries, ...plan.entries] }, listed: nextListed, frontPage: nextFrontPage };
}

const FILES = {
  catalogs: ['../../server/data/us-catalogs.json', 1],
  listed: ['../../server/data/us-catalogs-listed.json', 2],
  frontPage: ['../../server/data/front-page-hosts.json', 1],
};
const pathOf = key => fileURLToPath(new URL(FILES[key][0], import.meta.url));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
  const imlsPath = value('--imls');
  if (!imlsPath) { console.error('Needs --imls <PLS_FY24_AE_pud24i.csv>'); process.exit(2); }
  const imls = imlsRecords(readFileSync(imlsPath, 'latin1'));
  if (args.includes('--suggest')) {
    for (const host of args.slice(args.indexOf('--suggest') + 1).filter(item => !item.startsWith('--'))) {
      const candidates = suggest(host, imls);
      console.log(`${host}: ${candidates.length ? candidates.map(item => `${item.fscsKey} ${item.name} (${item.city}, ${item.state})`).join('; ') : 'no IMLS library of this name or town'}${candidates.length > 1 ? ' -- more than one: a published page must settle which, or it waits' : ''}`);
    }
    process.exit(0);
  }
  const listPath = value('--hosts');
  if (!listPath) { console.error('Needs --hosts <list.tsv>'); process.exit(2); }
  const today = value('--on') || new Date().toISOString().slice(0, 10);
  const { getAllLibraries } = await import('../../server/services/directory.js');
  const files = Object.fromEntries(Object.keys(FILES).map(key => [key, JSON.parse(readFileSync(pathOf(key), 'utf8'))]));
  let plan;
  try {
    plan = planAdditions({ rows: parseHostList(readFileSync(listPath, 'utf8')), imls, directory: getAllLibraries(), frontPageHosts: files.frontPage.hosts, today });
  } catch (error) { console.error(error.message); process.exit(1); }
  for (const entry of plan.entries) {
    const id = `apollo:${entry.slug}`;
    const listing = plan.connected.includes(id) ? 'connected' : 'waiting';
    const gate = plan.frontPageHosts.some(item => item.host === entry.evidence.catalog.host) ? 'behind the front-page gate' : 'offered now';
    console.log(`${id}\t${entry.name}\t${entry.city}, ${entry.region}\t${entry.evidence.identity.fscsKey}\t${listing}${listing === 'connected' ? `, ${gate}` : ''}`);
  }
  if (!args.includes('--write')) { console.log(`${plan.entries.length} to add; nothing written (add --write).`); process.exit(0); }
  const next = applyPlan(files, plan, today);
  for (const key of Object.keys(FILES)) writeFileSync(pathOf(key), `${JSON.stringify(next[key], null, FILES[key][1])}\n`);
  console.log(`Added ${plan.entries.length} Apollo entries. Next: node tools/seo/us-pages.mjs, then the server tests.`);
}
