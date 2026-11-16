// Generates docs/research/india-library-status/status.csv, allowed-libraries.csv
// and README.md: one row per Indian directory entry, from the directory, the hidden list and the
// evidence in docs/research/india-library-hardening/. Never edit the output by
// hand; change the evidence or the rules below and run:
//
//   node tools/catalog-hardening/library-status.mjs
//
// A failed or blocked check is never "empty", and "not tested" is said plainly.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = 'docs/research/india-library-hardening';
const OUTPUT = 'docs/research/india-library-status';
// The India allowlist the directory reads: only these Indian libraries are offered
// when finding a library. Generated here; IDs are only ever added.
export const LISTED = 'server/data/india-catalogs-listed.json';
// Statuses that put a library on the allowlist.
export const LISTED_STATUSES = new Set(['verified', 'audit-found']);
// States filled for entries the source directory leaves without one.
const REGIONS = 'server/data/india-library-regions.json';

export const STATUSES = ['verified', 'audit-found', 'unverified', 'empty-catalog', 'blocked', 'remote-unchecked', 'unreachable', 'unsupported'];

// Statuses a check from the remote test machine could not settle: the catalog
// did not answer there (network failure, timeout, HTTP 5xx, robots.txt 5xx) or a
// CDN refused that machine's region. They are marked `remote-unchecked` so a
// local machine can try them; a robots refusal or a login is never in this set.
export const REMOTE_UNCHECKED_FROM = new Set(['blocked', 'unverified']);

// Evidence files written from a local machine (15 November 2026 local recheck).
// An unreachable answer in one of these is not a remote-machine artifact: the
// library is `unreachable` (tried from both), not `remote-unchecked`.
export const LOCAL_EVIDENCE = /^local-/;

// Days after last_checked before a library is due for another check. `null`
// means never: a login is not worked around and a link-only entry needs an
// adapter first. Refusals are rechecked for a policy change only.
export const REVISIT_DAYS = {
  unreachable: 7, // network failure, timeout, 5xx, robots.txt 5xx
  slow: 30, // answered beyond the app's time budget
  inconclusive: 30, // answered, but no book passed the strict check
  empty: 90, // every search answered with no records
  refusal: 180, // robots, CDN or access challenge: recheck the policy only
  verified: 180, // re-confirm a verified library
  login: null,
  unsupported: null,
};

// Causes recorded in connector-host-diagnostics.json, CONNECTOR-FOLLOWUP.md and
// the recheck files, by host or by ID, in the evidence's own words. The test
// checks that every ID and host here appears in its evidence file.
export const RECORDED = {
  hosts: {
    // Reachable from production (a definite answer), so not blocked for readers.
    // robots.txt is "User-agent: * / Disallow: /". The app missed it until 15 Nov 2026 because the
    // robots read failed on KALNET's incomplete TLS chain; the local run is withdrawn.
    'kalnet.kshec.kerala.gov.in': { status: 'blocked', revisit: 'refusal', file: 'robots-audit-20261115-before.json', checked: '2026-11-15',
      reason: 'robots refusal (User-agent: * Disallow: /); earlier unread because of an incomplete TLS chain' },
    'ideal.egranth.ac.in': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-results.json', checked: '2026-11-15',
      reason: 'unreachable from the remote machine (egress connection failure) and a local machine (ENETUNREACH); production check couldn\'t check (20.5 s)' },
    'koha-opac.somaiya.edu': { status: 'blocked', revisit: 'refusal', file: 'local-20261115-recheck-results.json', checked: '2026-11-15',
      reason: 'CloudFront 403 from US edges (remote machine and a local machine); regional refusal, not worked around' },
    'dhegoalib.unifyed.com': { status: 'unverified', revisit: 'slow', file: 'local-20261115-goa-dhe-results.json', checked: '2026-11-15',
      reason: 'too slow even at the 45 s maximum budget (unscoped union search plus member reads); branch-limited search HTTP 410' },
    'library.mes.ac.in': { status: 'blocked', revisit: 'refusal', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'robots refusal' },
    'opac.rayatlibrarynetwork.org': { status: 'blocked', revisit: 'refusal', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'robots refusal' },
  },
  ids: {
    'chamo:iit-madras': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-results.json', checked: '2026-11-15', reason: 'DNS ENOTFOUND (remote and local); the library site still links webopac.iitm.ac.in, which has no public DNS record (campus-only)' },
    'koha:national-science-library': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-results.json', checked: '2026-11-15', reason: 'no public DNS for opac.niscair.res.in or the published opac.niscpr.res.in (campus-only)' },
    'koha:klh-global-business-school': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-results.json', checked: '2026-11-15', reason: 'no response (remote and local connect timeout)' },
    'koha:indian-institute-astrophysics': { status: 'unsupported', revisit: 'unreachable', file: 'local-20261115-recheck-results.json', checked: '2026-11-15', reason: 'link-only; robots.txt and catalog page no response (remote and local)' },
    'koha:iit-dharwad': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-extra-results.json', checked: '2026-11-15', reason: 'site HTTP 502 (remote and local)' },
    'koha:goa-institute-management': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-extra-results.json', checked: '2026-11-15', reason: 'robots.txt HTTP 503 (temporarily disallowed; remote and local)' },
    'koha:ramanujan-college': { status: 'blocked', revisit: 'unreachable', file: 'local-20261115-recheck-extra-results.json', checked: '2026-11-15', reason: 'robots.txt HTTP 503 (remote); connection refused (local)' },
    'koha:scert-assam': { status: 'blocked', revisit: 'refusal', file: 'local-20261115-recheck-extra-results.json', checked: '2026-11-15',
      reason: 'robots refusal (Disallow: /cgi-bin/, read with a chain-completing client); its TLS chain also omits the Let\'s Encrypt intermediate' },
    'koha:bhatkhande': { status: 'unsupported', revisit: 'unreachable', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'link-only; search HTTP 500' },
    'koha:cmd-kerala': { status: 'unsupported', revisit: 'inconclusive', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'link-only; search page has no Koha results markup' },
    'koha:st-xaviers-jaipur': { status: 'unsupported', revisit: 'inconclusive', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'link-only; every item type is Stack' },
    'koha:nit-calicut': { status: 'blocked', revisit: 'refusal', file: 'koha-results.json', checked: '2026-11-15', reason: 'robots refusal' },
    'koha:iihmr-delhi': { status: 'blocked', revisit: 'login', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'requires login' },
    'koha:mac': { status: 'unverified', revisit: 'inconclusive', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'no countable book item type (item type cells empty)' },
    'koha:srhu': { status: 'unverified', revisit: 'inconclusive', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'no countable book item type' },
    'koha:kakojan-college': { status: 'unverified', revisit: 'inconclusive', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'no physical items on sampled records' },
    'discovery-academic:autolib-patna-spjain': { status: 'blocked', revisit: 'refusal', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'robots refusal' },
    'discovery-academic:librarika-bncollege': { status: 'blocked', revisit: 'refusal', file: 'connector-host-diagnostics.json', checked: '2026-11-15', reason: 'access challenge' },
    'discovery-academic:easylib-sjec': { status: 'unverified', revisit: 'slow', file: 'academic-sjec-recheck-results.json', checked: '2026-11-15', reason: 'cold lookups > 20 s book budget' },
    'indcat:indcat-gkvv-249404': { status: 'unverified', revisit: 'inconclusive', file: 'indcat-remaining-results.json', checked: '2026-11-15', reason: 'IndCat record pages name no holding institution' },
    'libsys:nit-trichy': { status: 'unverified', revisit: 'unsupported', file: 'small-families-results.json', checked: '2026-11-15', reason: 'ISBN-only adapter; catalog-origin check cannot be measured' },
  },
  // Single-host groups listed in connector-host-diagnostics.json.
  groups: [
    { classification: 'robots_disallow', status: 'blocked', revisit: 'refusal', reason: 'robots refusal' },
    { classification: 'robots_temporarily_disallowed', status: 'blocked', revisit: 'unreachable', reason: 'robots.txt HTTP 503 (temporarily disallowed)' },
  ],
};

const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const day = (value) => (value ? String(value).slice(0, 10) : '');
export function addDays(date, days) {
  if (!date || days === null || days === undefined) return 'never';
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (char === '"') quoted = false; else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; } else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])));
}
const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// One discovery query, whatever runner wrote it.
function query(stage) {
  const records = typeof stage.records === 'number' ? stage.records : Array.isArray(stage.records) ? stage.records.length : stage.count ?? stage.returned;
  const code = stage.code || stage.error?.code;
  return { query: stage.query, ok: stage.ok ?? !stage.error, records, code };
}

/** What a run record shows when no book passed. Clean empty searches are
 * "empty"; errors and stops are never empty. */
export function describeAttempt(record) {
  if (!record) return { reason: 'not tested', revisit: 'untested', status: 'unverified' };
  if (record.status === 'not_attempted') {
    return { reason: `not tested: ${String(record.reason || 'shared host stopped').replace(/\.$/, '')}`, revisit: 'unreachable', status: 'unverified' };
  }
  if (record.status === 'unsupported') return { reason: 'link-only, no adapter', revisit: 'unsupported', status: 'unsupported' };
  const discovery = (record.discovery || []).map(query);
  const books = record.books || [];
  if (books.length) return { reason: `no candidate passed the strict check (${books.length} tried)`, revisit: 'inconclusive', status: 'unverified' };
  if (discovery.length && discovery.every((stage) => stage.ok && stage.records === 0)) {
    return { reason: `all seed searches empty (${discovery.map((stage) => stage.query).join(', ')})`, revisit: 'empty', status: 'unverified' };
  }
  const codes = [...new Set(discovery.filter((stage) => !stage.ok).map((stage) => stage.code || 'error'))];
  // The catalog answered, but not in a shape the adapter recognized: not a network failure.
  if (codes.length && codes.every((code) => code === 'CATALOG_UNRECOGNIZED')) return { reason: 'catalog answered, response not recognized (CATALOG_UNRECOGNIZED)', revisit: 'inconclusive', status: 'unverified' };
  if (codes.length) return { reason: `search errors: ${codes.join(', ')}`, revisit: 'unreachable', status: 'unverified' };
  return { reason: 'inconclusive check', revisit: 'inconclusive', status: 'unverified' };
}

function recordIn(file, id) {
  const data = json(`${EVIDENCE}/${file}`);
  const list = data.libraries || data.results || [];
  const matches = list.filter((item) => (item.libraryId || item.id) === id);
  return matches.at(-1) || null;
}

/** All evidence a row is built from, loaded once. */
export async function loadInputs() {
  const { getAllLibraries } = await import('../../server/services/directory.js');
  const { getProvider } = await import('../../server/services/providers/index.js');
  const { hostFor } = await import('../../server/services/catalog-lookup/platforms.js');
  return {
    entries: getAllLibraries().filter((entry) => entry.country === 'IN'),
    adapter: (entry) => { const provider = getProvider(entry); return Boolean(provider?.searchCatalog && provider?.resolveCatalogRecord); },
    hostFor,
    hidden: json(`${OUTPUT}/empty-catalogs.json`),
    listed: existsSync(resolve(ROOT, LISTED)) ? json(LISTED) : null,
    regions: existsSync(resolve(ROOT, REGIONS)) ? json(REGIONS) : { libraries: {} },
    summary: json(`${EVIDENCE}/summary.json`),
    audit: parseCsv(read(`${EVIDENCE}/egranthalaya-audit-20261110/libraries.csv`)),
    diagnostics: json(`${EVIDENCE}/connector-host-diagnostics.json`),
    recheckKoha: json(`${EVIDENCE}/recheck-20261115-koha-results.json`),
    libmanExcluded: json(`${EVIDENCE}/libman-sweep-manifest.json`).excluded,
    recordIn,
  };
}

export function buildRows(inputs) {
  const { entries, adapter, hostFor, hidden, summary, audit, diagnostics, recheckKoha, libmanExcluded } = inputs;
  const hiddenIds = new Set(hidden.libraryIds);
  // A directory entry is either a summary library or one of its routes (an
  // alternate connection counted under another entry, e.g. a union catalog).
  const summaryById = new Map();
  for (const library of summary.libraries) {
    for (const route of library.routes) if (route.libraryId !== library.libraryId && !summaryById.has(route.libraryId)) summaryById.set(route.libraryId, { libraryId: route.libraryId, verifiedBooks: route.verifiedBooks, routes: [route] });
  }
  for (const library of summary.libraries) summaryById.set(library.libraryId, library);
  const auditById = new Map(audit.map((row) => [row.libraryId, row]));
  const recheckPassed = new Map(recheckKoha.results.filter((result) => result.status === 'passed').map((result) => [result.id, result]));
  const groupReason = new Map();
  for (const host of diagnostics.hosts) {
    const rule = RECORDED.groups.find((group) => group.classification === host.classification);
    if (rule && Array.isArray(host.affectedIds)) for (const id of host.affectedIds) groupReason.set(id, rule);
  }
  const libmanFiles = ['libman-sweep-results.json', 'libman-recheck-results.json', 'libman-followup-results.json', 'libman-universities-results.json'];

  const rows = entries.map((entry) => markRemote(rowFor(entry)));
  const allowlist = buildAllowlist(rows, inputs.listed);
  const listedIds = new Set(allowlist.libraryIds);
  for (const item of rows) item.in_finder = listedIds.has(item.library_id) ? 'yes' : 'no';
  Object.defineProperty(rows, 'allowlist', { value: allowlist, enumerable: false });
  return rows;

  function markRemote(item) {
    if (item.revisitClass === 'unreachable' && REMOTE_UNCHECKED_FROM.has(item.status)) {
      return { ...item, status: LOCAL_EVIDENCE.test(item.evidence_file) ? 'unreachable' : 'remote-unchecked' };
    }
    return item;
  }

  function rowFor(entry) {
    const id = entry.id;
    const base = { library_id: id, name: entry.name, platform: entry.platform, region: entry.region || '', in_finder: '',
      district: entry.district || '', city: entry.city || '',
      state_source: inputs.regions?.libraries?.[id]?.evidence?.kind || (entry.region ? 'directory' : '') };
    const row = (status, reason, file, checked, revisit) => ({ ...base, status, reason, evidence_file: file || '', last_checked: checked || '',
      revisit_after: revisit === 'untested' ? 'now' : addDays(checked, REVISIT_DAYS[revisit]), revisitClass: revisit });
    const summaryEntry = summaryById.get(id);
    const routes = summaryEntry?.routes || [];
    const runs = routes.flatMap((route) => route.runs.map((run) => ({ ...run, route: route.libraryId })));
    const latestRun = [...runs].sort((a, b) => String(a.finishedAt || a.startedAt || '').localeCompare(String(b.finishedAt || b.startedAt || ''))).at(-1);
    const latestDate = day(latestRun?.finishedAt || latestRun?.startedAt) || '2026-11-15';

    const rechecked = recheckPassed.get(id);
    if (rechecked) return row('verified', `${rechecked.passedBooks} book verified (15 Nov recheck)`, 'recheck-20261115-koha-results.json', day(rechecked.completedAt), 'verified');
    if (summaryEntry?.verifiedBooks > 0) {
      const passing = routes.find((route) => route.verifiedBooks > 0);
      const file = passing.books?.[0]?.evidenceFiles?.[0] || passing.evidenceFiles[0];
      const books = summaryEntry.verifiedBooks;
      return row('verified', `${books} book${books === 1 ? '' : 's'} verified`, file, latestDate, 'verified');
    }
    if (hiddenIds.has(id)) {
      if (entry.platform === 'egranthalaya') {
        const audited = auditById.get(id);
        return row('empty-catalog', 'all 50 titles empty', 'egranthalaya-audit-20261110/libraries.csv', day(audited?.observedAt), 'empty');
      }
      const attempts = libmanFiles.map((file) => ({ file, record: inputs.recordIn(file, id) })).filter((item) => item.record)
        .sort((a, b) => String(a.record.finishedAt).localeCompare(String(b.record.finishedAt)));
      const last = attempts.at(-1);
      const seeds = (last.record.discovery || []).map((stage) => stage.query).join(', ');
      return row('empty-catalog', `all seed searches empty (${seeds})`, last.file, day(last.record.finishedAt), 'empty');
    }
    const recorded = RECORDED.ids[id] || RECORDED.hosts[hostFor(entry)];
    if (recorded) return row(recorded.status, recorded.reason, recorded.file, recorded.checked, recorded.revisit);
    const group = groupReason.get(id);
    if (group) return row(adapter(entry) ? group.status : 'unsupported', adapter(entry) ? group.reason : `link-only; ${group.reason}`, 'connector-host-diagnostics.json', '2026-11-15', group.revisit);
    if (!adapter(entry)) {
      const audited = auditById.get(id);
      const extra = audited?.status === 'Working' ? `; audit found books in ${audited.nonemptyQueries} of 50 titles` : '';
      return row('unsupported', `link-only, no adapter${extra}`, audited ? 'egranthalaya-audit-20261110/libraries.csv' : '', day(audited?.observedAt), 'unsupported');
    }
    if (entry.platform === 'libman' && libmanExcluded[id]) return row('unverified', `not tested: excluded from the sweep (${libmanExcluded[id]})`, 'libman-sweep-manifest.json', '', 'untested');
    if (latestRun) {
      const described = describeAttempt(inputs.recordIn(latestRun.file, latestRun.route));
      return row(described.status, described.reason, latestRun.file, latestDate, described.revisit);
    }
    const audited = auditById.get(id);
    if (audited) {
      const failed = Number(audited.failedQueries), books = Number(audited.nonemptyQueries);
      const file = 'egranthalaya-audit-20261110/libraries.csv', checked = day(audited.observedAt);
      if (audited.setupError) {
        const code = JSON.parse(audited.setupError).code || 'setup error';
        return row(/HTTP_5/.test(code) ? 'blocked' : 'unverified', `audit setup failed: ${code}`, file, checked, /HTTP_5/.test(code) ? 'unreachable' : 'inconclusive');
      }
      if (books === 0 && failed === 50) return row('blocked', `all 50 audit searches failed (${Object.keys(JSON.parse(audited.errorCounts)).join(', ')})`, file, checked, 'unreachable');
      if (books === 0) return row('unverified', `${audited.emptyQueries} of 50 titles empty, ${failed} failed (${Object.keys(JSON.parse(audited.errorCounts)).join(', ')})`, file, checked, 'unreachable');
      return row('audit-found', `audit found books in ${books} of 50 titles; strict check not run`, file, checked, 'inconclusive');
    }
    return row('unverified', 'not tested', '', '', 'untested');
  }
}

/** The India allowlist: every library with a strictly verified book or an
 * e-Granthalaya audit that found books, plus every ID listed before. Nothing is
 * removed automatically: a later failed or unreachable check never takes a
 * library off the list (failed checks are logged for manual review). */
export function buildAllowlist(rows, previous) {
  const byId = new Map(rows.map((item) => [item.library_id, item]));
  const before = new Set((previous?.libraryIds || []).filter((id) => byId.has(id)));
  const qualifying = rows.filter((item) => LISTED_STATUSES.has(item.status)).map((item) => item.library_id);
  const libraryIds = [...new Set([...before, ...qualifying])].sort();
  const auditOnly = libraryIds.filter((id) => byId.get(id).status === 'audit-found'
    || (byId.get(id).status !== 'verified' && (previous?.egranthalayaAuditOnly || []).includes(id)));
  const retained = libraryIds.filter((id) => !LISTED_STATUSES.has(byId.get(id).status));
  const platforms = {};
  for (const id of libraryIds) { const platform = byId.get(id).platform; platforms[platform] = (platforms[platform] || 0) + 1; }
  return {
    version: 1,
    reason: 'Indian libraries offered when finding a library (pop-up search, browse, near me and public API listings). An Indian directory library that is not listed here is left out of finding a library but still resolves by ID, so a reader who already chose one keeps it. Libraries outside India are not affected.',
    criteria: {
      verified: 'At least one book confirmed by the strict standard: query match, the same record resolved and a live found from the app\'s own lookup (docs/research/india-library-hardening/summary.json).',
      egranthalayaAudit: 'e-Granthalaya libraries whose catalog returned books for at least one of the fifty titles in the 10 November 2026 audit (docs/research/india-library-hardening/egranthalaya-audit-20261110), without a strict one-book check.',
    },
    rules: [
      'Generated by tools/catalog-hardening/library-status.mjs; do not edit by hand.',
      'IDs are only added. A listed library stays listed even if a later check fails; failed lookups are logged for manual review.',
      'To remove a library, delete its ID here by hand with a note in the commit, then regenerate the tracker.',
    ],
    count: libraryIds.length,
    counts: { verified: libraryIds.length - auditOnly.length, egranthalayaAuditOnly: auditOnly.length, retainedWithoutCurrentEvidence: retained.length },
    platforms: Object.fromEntries(Object.entries(platforms).sort((a, b) => b[1] - a[1])),
    libraryIds,
    egranthalayaAuditOnly: auditOnly,
    retainedWithoutCurrentEvidence: retained,
  };
}

// Short labels for the revisit queue: the cause without per-library numbers.
export function reasonGroup(reason) {
  return reason
    .replace(/audit found books in \d+ of 50 titles; strict check not run/, 'audit found books; strict check not run')
    .replace(/link-only, no adapter; audit found books in \d+ of 50 titles/, 'link-only, no adapter; audit found books')
    .replace(/\(\d+ tried\)/, '')
    .replace(/\d+ of 50 titles empty, \d+ failed/, 'some audit titles empty, others failed')
    .replace(/^all seed searches empty \(.*\)$/, 'all seed searches empty')
    .trim();
}

function table(header, rows) {
  return [`| ${header.join(' | ')} |`, `| ${header.map((cell, i) => (i && typeof rows[0]?.[i] === 'number' ? '---:' : '---')).join(' | ')} |`, ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
}

export function renderCsv(rows) {
  const columns = ['library_id', 'name', 'platform', 'region', 'status', 'in_finder', 'reason', 'evidence_file', 'last_checked', 'revisit_after'];
  return [columns.join(','), ...rows.map((item) => columns.map((column) => csvCell(item[column])).join(','))].join('\n') + '\n';
}

/** Every library on the India allowlist, by state, as readers find them. */
export function renderAllowedCsv(rows) {
  const audit = new Set(rows.allowlist.egranthalayaAuditOnly || []);
  const retained = new Set(rows.allowlist.retainedWithoutCurrentEvidence || []);
  const listing = (id) => (retained.has(id) ? 'retained' : audit.has(id) ? 'egranthalaya-audit' : 'verified');
  const columns = ['state', 'district', 'city', 'name', 'library_id', 'platform', 'listing', 'state_source'];
  const listed = rows.filter((item) => item.in_finder === 'yes')
    .map((item) => ({ ...item, state: item.region, listing: listing(item.library_id) }))
    .sort((a, b) => (a.state || '\uffff').localeCompare(b.state || '\uffff') || a.name.localeCompare(b.name) || a.library_id.localeCompare(b.library_id));
  return [columns.join(','), ...listed.map((item) => columns.map((column) => csvCell(item[column])).join(','))].join('\n') + '\n';
}

export function renderReadme(rows) {
  const count = (list, key) => list.reduce((map, item) => map.set(item[key], (map.get(item[key]) || 0) + 1), new Map());
  const byStatus = count(rows, 'status');
  const platforms = [...count(rows, 'platform').entries()].sort((a, b) => b[1] - a[1]);
  const platformRows = platforms.map(([platform, total]) => [platform, ...STATUSES.map((status) => rows.filter((item) => item.platform === platform && item.status === status).length), total]);
  // One row per reason and status, ordered by when its first library is due.
  const queue = new Map();
  for (const item of rows.filter((candidate) => candidate.status !== 'verified' && candidate.revisit_after !== 'never')) {
    const key = `${reasonGroup(item.reason)}\u0000${item.status}`;
    if (!queue.has(key)) queue.set(key, []);
    queue.get(key).push(item);
  }
  const due = (date) => (date === 'now' ? '0000-00-00' : date);
  const queueRows = [...queue.entries()].map(([key, items]) => {
    const [reason, status] = key.split('\u0000');
    const dates = items.map((item) => item.revisit_after).sort((a, b) => due(a).localeCompare(due(b)));
    const ids = items.map((item) => item.library_id);
    return [dates[0], dates.at(-1), reason, status, ids.length, ids.slice(0, 3).map((id) => `\`${id}\``).join(', ') + (ids.length > 3 ? ', …' : '')];
  }).sort((a, b) => due(a[0]).localeCompare(due(b[0])) || b[4] - a[4]);
  const groupRows = (list) => {
    const groups = new Map();
    for (const item of list) {
      const key = item.platform + '\u0000' + reasonGroup(item.reason);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
      .map(([key, items]) => { const [platform, reason] = key.split('\u0000'); return [platform, reason, items.length, items.slice(0, 3).map((item) => '`' + item.library_id + '`').join(', ')]; });
  };
  const remote = rows.filter((item) => item.status === 'remote-unchecked');
  const remoteRows = groupRows(remote);
  const unreachable = rows.filter((item) => item.status === 'unreachable');
  const local = rows.filter((item) => LOCAL_EVIDENCE.test(item.evidence_file));
  const localCount = (status) => local.filter((item) => item.status === status).length;
  const never = [...count(rows.filter((item) => item.revisit_after === 'never'), 'status').entries()].map(([status, n]) => `${n} ${status}`).join(', ');
  const verifiedDue = [...new Set(rows.filter((item) => item.status === 'verified').map((item) => item.revisit_after))].sort();
  return `# Indian library status

Generated by \`tools/catalog-hardening/library-status.mjs\` from the directory,
[empty-catalogs.json](empty-catalogs.json) and the evidence in
[india-library-hardening](../india-library-hardening/). Do not edit by hand.
[status.csv](status.csv) has one row per Indian directory entry
(${rows.length.toLocaleString('en-US')} rows).
[allowed-libraries.csv](allowed-libraries.csv) lists the ${rows.allowlist.count.toLocaleString('en-US')} libraries
readers can find, by state, with how each was listed (\`verified\` or
\`egranthalaya-audit\`) and where its state came from (\`directory\` or the
evidence in [india-library-regions](../india-library-regions/README.md)).

## Which libraries readers can find

Only Indian libraries on the allowlist,
[\`server/data/india-catalogs-listed.json\`](../../../server/data/india-catalogs-listed.json),
are offered when finding a library (pop-up search, browse, near me and public API
listings): **${rows.allowlist.count.toLocaleString('en-US')} libraries**, ${rows.allowlist.counts.verified.toLocaleString('en-US')} with a strictly verified book and
${rows.allowlist.counts.egranthalayaAuditOnly.toLocaleString('en-US')} e-Granthalaya libraries whose fifty-title audit found books. The \`in_finder\`
column says which. Every other Indian library still resolves by ID, so a reader who
already chose one keeps it. Libraries outside India are not affected.

The generator only ever adds IDs: a listed library stays listed when a later check
fails (${rows.allowlist.counts.retainedWithoutCurrentEvidence} are listed now without current qualifying evidence). Failed lookups are
logged for manual review; a library leaves the list only when someone deletes its ID
by hand.

A failed or blocked check is never "empty": \`blocked\`, \`remote-unchecked\`, \`unreachable\` and
\`unverified\` mean we could not confirm a book, not that the library lacks it.

## Status

- \`verified\`: at least one book confirmed by the strict standard (query match, the same record resolved, and a live \`found\` from the app's own lookup). Listed.
- \`audit-found\`: e-Granthalaya library whose catalog returned books for at least one of the fifty audit titles (10 November 2026); the stricter one-book check was not run. Listed.
- \`unverified\`: never tested, or tested without a confirmed book (too slow, answered but no book passed, clean empty searches not yet in the empty list).
- \`empty-catalog\`: its catalog showed no books ([empty-catalogs.json](empty-catalogs.json)).
- \`blocked\`: refused by robots rules, an access challenge, a regional CDN refusal or a login. Never worked around.
- \`remote-unchecked\`: could not be checked from the remote test machine (network failure, timeout, HTTP 5xx, robots.txt 5xx, or a CDN refusing that machine's region). Try these from a local machine.
- \`unreachable\`: could not be reached from the remote test machine or from a local machine (network failure, DNS, timeout, HTTP 5xx or robots.txt 5xx).
- \`unsupported\`: link-only in the app, no adapter.

${table(['Status', 'Libraries'], STATUSES.map((status) => [status, byStatus.get(status) || 0]))}

## Try from a local machine

${remote.length.toLocaleString('en-US')} libraries are \`remote-unchecked\`: the remote test machine could not reach them.
Run the one-book checks for these from a local machine, one queue per host, with the
runners and pacing in \`tools/catalog-hardening/\` (see the hardening
[README](../india-library-hardening/README.md)). Stop at once on a robots refusal; never
work around a block. Then add the result files and regenerate this tracker.

${remoteRows.length ? table(['Platform', 'Reason', 'Libraries', 'Examples'], remoteRows) : 'None are left: every library the remote machine could not reach has been tried from a local machine.'}

## Local-machine recheck (15 November 2026)

The libraries the remote machine left \`remote-unchecked\` were tried from a local
machine with the same runners, seeds, pacing and stop rules (evidence files
\`local-20261115-*\`). ${local.length.toLocaleString('en-US')} libraries now take their status from that evidence:
${localCount('verified')} verified, ${localCount('unverified')} listed-unverified (answered, but no book passed or the catalog
was cleanly empty), ${localCount('blocked')} blocked, ${localCount('unreachable')} unreachable and ${localCount('unsupported')} unsupported. ${unreachable.length.toLocaleString('en-US')} libraries are \`unreachable\` from both
machines:

${unreachable.length ? table(['Platform', 'Reason', 'Libraries', 'Examples'], groupRows(unreachable)) : 'None.'}

## By platform

${table(['Platform', ...STATUSES, 'Total'], platformRows)}

## Revisit rules

\`revisit_after\` is \`last_checked\` plus:

- unreachable, timeout, HTTP 5xx or robots.txt 5xx: ${REVISIT_DAYS.unreachable} days;
- too slow for the app's budget: ${REVISIT_DAYS.slow} days;
- answered but no book passed the strict check (inconclusive): ${REVISIT_DAYS.inconclusive} days;
- empty catalog (every search answered with no records): ${REVISIT_DAYS.empty} days;
- robots, CDN or access-challenge refusal: ${REVISIT_DAYS.refusal} days, and only to recheck the policy, never to bypass it;
- verified: ${REVISIT_DAYS.verified} days to re-confirm;
- requires login, link-only with no adapter, or a method the adapter cannot measure: never;
- not tested: \`now\`.

## Revisit queue

Grouped by reason and sorted by the first \`revisit_after\` in each group.
Verified libraries (due ${verifiedDue.join(' / ')}) and the never-revisit rows
(${never}) are left out; \`status.csv\` has every row.

${table(['First due', 'Last due', 'Reason', 'Status', 'Libraries', 'Examples'], queueRows)}

## Regenerate

\`\`\`sh
node tools/catalog-hardening/library-status.mjs
node --test tools/catalog-hardening/library-status.test.mjs
\`\`\`

Add new evidence files to \`docs/research/india-library-hardening/\` first
(and regenerate \`summary.json\` with \`node tools/catalog-hardening/summarize.mjs\`).
Recorded causes not in a run file (host diagnostics, rechecks) are listed in
\`RECORDED\` in the generator, each with its evidence file.

## Reviewing failed lookups

Every live check that fails or times out in production is written to
\`library_check_events\` (library, host, platform, failure class, the provider's
error code, duration and request count; never a book, query, reader or IP) and kept
for 90 days. Successes update \`library_health\`. To review:

1. Open the admin view (\`/admin\`, owner accounts only), Library health tab.
2. Pick a review window of 7, 30, 60 or 90 days and download the CSV
   (\`/api/admin/library-health.csv?days=60\`).
3. Read \`listed\` (verified, egranthalaya-audit, not-listed), \`failures\` and the
   failure classes against \`checks\`, and \`error_codes\` (for example
   \`CATALOG_ROBOTS_DISALLOWED\`, \`CATALOG_TIMEOUT\`, \`CATALOG_UNAVAILABLE:ECONNREFUSED\`).
4. To take a library off the finder, delete its ID from
   \`server/data/india-catalogs-listed.json\` by hand and say why in the commit;
   the generator never removes one. A robots or access refusal should be removed
   promptly; a timeout alone is not absence.

## Add a library to the finder

1. Run a fresh one-book check with the existing runners (\`tools/catalog-hardening/\`), respecting pacing, robots rules and refusals.
2. Add the result file to \`docs/research/india-library-hardening/\`, regenerate \`summary.json\` and then this tracker. A library with a verified book joins the allowlist automatically.
3. Update the expected counts in \`server/services/directory.test.js\` and \`server/public-v2/discovery-integration.test.js\`, then run the server tests.
`;
}

export async function generate() {
  const rows = buildRows(await loadInputs());
  mkdirSync(resolve(ROOT, OUTPUT), { recursive: true });
  writeFileSync(resolve(ROOT, OUTPUT, 'status.csv'), renderCsv(rows));
  writeFileSync(resolve(ROOT, OUTPUT, 'allowed-libraries.csv'), renderAllowedCsv(rows));
  writeFileSync(resolve(ROOT, OUTPUT, 'README.md'), renderReadme(rows));
  writeFileSync(resolve(ROOT, LISTED), JSON.stringify(rows.allowlist, null, 2) + '\n');
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const rows = await generate();
  const counts = Object.fromEntries(STATUSES.map((status) => [status, rows.filter((item) => item.status === status).length]));
  console.log(JSON.stringify({ rows: rows.length, ...counts }));
}
