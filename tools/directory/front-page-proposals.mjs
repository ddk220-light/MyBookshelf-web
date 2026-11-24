// Proposed US listing changes from the front-page check's member-list and
// catalog-link results (server/catalog-store/frontPageCheck.js; merged into
// server/data/front-page-results.json by tools/deployment/front-page-results.mjs).
// Runs offline: it reads only the committed files (and, with --imls, the IMLS
// Public Libraries Survey file); it contacts no host.
//
//   node tools/directory/front-page-proposals.mjs [--imls <PLS_FY24_AE_pud24i.csv>] [--on YYYY-MM-DD] [--write]
//
// It prints every proposal; with --write it applies only the clear ones:
//   - catalog link, clear: a waiting library's own homepage (its URL from the
//     evidence) links the entry's catalog host, and the link's family is the
//     entry's: identity settled, the entry moves from waiting to connected
//     (offered once its host's front-page result is open, as every connected
//     entry on a front-page host).
//   - member list, clear: a waiting member's name is, exactly (letters and
//     digits, case aside), one entry of the catalog's own member or location
//     list, that entry names no other library of the shared catalog, and no
//     other waiting member takes it: the member is confirmed and moves to
//     connected.
// Everything else is proposed only, never applied: a homepage that links
// another catalog or none; a member name that matches only once the common
// words ("public", "library", "free"...) are set aside, or that matches
// more than one; a waiting member the catalog's list does not name; a name in
// the catalog's list that the directory does not have (with --imls, the IMLS
// libraries of that name in the catalog's state, never chosen); a read that
// met a wall, robots.txt or no selector. Names are matched by name, state and
// the evidence only, never guessed.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkFamily } from '../../server/catalog-store/frontPageCheck.js';
import { imlsRecords } from './apollo-hosts.mjs';

const FILES = {
  catalogs: ['../../server/data/us-catalogs.json', 1],
  listed: ['../../server/data/us-catalogs-listed.json', 2],
  hosts: ['../../server/data/front-page-hosts.json', 1],
  results: ['../../server/data/front-page-results.json', 1],
};
const pathOf = key => fileURLToPath(new URL(FILES[key][0], import.meta.url));
const COMMON = new Set(['the', 'of', 'and', 'public', 'free', 'library', 'libraries', 'memorial', 'district', 'association', 'community', 'city', 'town',
  'village', 'township', 'county', 'branch', 'reading', 'room', 'center', 'centre', 'inc']);
/** A name's letters and digits, case aside ("Eudora Public Library & Annex" -> "eudorapubliclibraryannex"). */
export const exactKey = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/\band\b/g, ' ').replace(/[^a-z0-9]+/g, '');
/** A name without its common words ("Bancroft Public Library" -> "bancroft"); only ever proposed, never applied. */
export const looseKey = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' ')
  .split(/[^a-z0-9]+/).filter(word => word && !COMMON.has(word)).join(' ');
const hostOf = value => { try { return new URL(value).hostname.toLowerCase(); } catch { return null; } };
const idOf = entry => entry.directoryId || `${entry.platform}:${entry.slug}`;
const readOk = result => result && !result.robots && result.wall === 'none' && Number.isInteger(result.status) && result.status >= 200 && result.status < 300;
const why = result => (result.robots ? `robots.txt (${result.robots})` : result.wall !== 'none' ? `a wall (${result.wall})`
  : result.movedTo ? `moved to ${result.movedTo}` : `HTTP ${result.status}`);

// The select of a member-list read that names the most of the catalog's entries (ties: the first).
function bestSelect(result, entries) {
  const names = new Set(entries.map(entry => exactKey(entry.name)));
  const scores = result.selects.map((_, index) => result.options.filter(([at, , text]) => at === index && names.has(exactKey(text))).length);
  const best = scores.reduce((top, score, index) => (score > scores[top] ? index : top), 0);
  return result.selects.length ? best : null;
}

/**
 * The proposals: `{ apply: [{ id, kind, note }], propose: [{ kind, ... }] }`.
 * `apply` lists the clear changes (waiting -> connected), with the note kept
 * as the entry's evidence; `propose` everything else, for a person to settle.
 */
export function proposeChanges({ catalogs, listed, hosts, results, imls = null }) {
  const entries = catalogs.libraries;
  const byId = new Map(entries.map(entry => [idOf(entry), entry]));
  const waiting = new Set((listed.waiting || []).map(item => item.id));
  const apply = [], propose = [];
  const applied = new Set();
  // Catalog links.
  const linkItems = new Map((hosts.catalogLinks || []).map(item => [item.libraryId, item]));
  for (const result of results.catalogLinks || []) {
    const item = linkItems.get(result.libraryId);
    const entry = byId.get(result.libraryId);
    if (!item || !entry) { propose.push({ kind: 'catalog-link-unknown', id: result.libraryId, note: 'not in front-page-hosts.json catalogLinks or the directory' }); continue; }
    if (!readOk(result)) { propose.push({ kind: 'catalog-link-not-read', id: result.libraryId, note: `the homepage was not read: ${why(result)}` }); continue; }
    const host = item.catalogHost || hostOf(entry.baseUrl || entry.catalogUrl);
    const own = result.links.filter(([url]) => hostOf(url) === host);
    const others = result.links.filter(([url]) => hostOf(url) !== host);
    const family = entry.platform;
    const sameFamily = own.filter(([url, linked]) => (linkFamily(url) || linked) === family);
    const title = result.title ? `"${result.title}"` : 'its homepage';
    if (sameFamily.length && waiting.has(result.libraryId)) {
      const note = `the library's own homepage (${item.url}, ${title}) links its ${family} catalog ${host} (the app's front-page check, ${result.date})`;
      apply.push({ id: result.libraryId, kind: 'catalog-link-confirms', note });
      applied.add(result.libraryId);
    } else if (own.length) {
      propose.push({ kind: 'catalog-link-host-family-unconfirmed', id: result.libraryId,
        note: `${title} links ${host}, but no link shows the ${family} family by its host or path (${own.map(([url]) => url).join(', ')})` });
    } else if (others.length) {
      propose.push({ kind: 'catalog-link-other-catalog', id: result.libraryId,
        note: `${title} links other catalogs, not ${host}: ${others.map(([url, linked]) => `${url} (${linked})`).join(', ')}` });
    } else propose.push({ kind: 'catalog-link-none', id: result.libraryId, note: `${title} links no catalog` });
  }
  // Member lists.
  const memberItems = new Map((hosts.memberLists || []).map(item => [item.id, item]));
  const imlsByState = new Map();
  if (imls) for (const record of imls.values()) imlsByState.set(record.STABR, [...(imlsByState.get(record.STABR) || []), record]);
  for (const result of results.memberLists || []) {
    const item = memberItems.get(result.id);
    if (!item) { propose.push({ kind: 'member-list-unknown', id: result.id, note: 'not in front-page-hosts.json memberLists' }); continue; }
    if (!readOk(result)) { propose.push({ kind: 'member-list-not-read', id: result.id, note: `the catalog's page was not read: ${why(result)}` }); continue; }
    const members = item.sharedCatalog ? entries.filter(entry => entry.country === 'US' && entry.sharedCatalog === item.sharedCatalog) : [];
    const select = bestSelect(result, members);
    if (select === null) {
      propose.push({ kind: 'member-list-no-selector', id: result.id, note: `no library or location selector on ${result.host}${result.marks?.length ? ` (its markup names ${result.marks.join(', ')})` : ''}` });
      continue;
    }
    const listedNames = result.options.filter(([at]) => at === select).map(([, value, text]) => ({ value, text })).filter(option => option.text);
    propose.push({ kind: 'member-list-read', id: result.id, note: `${listedNames.length} names in "${result.selects[select].label || result.selects[select].name}" on ${result.host}${result.marks?.length ? `; its markup names ${result.marks.join(', ')}` : ''}` });
    const byExact = new Map();
    for (const option of listedNames) byExact.set(exactKey(option.text), [...(byExact.get(exactKey(option.text)) || []), option]);
    const membersByExact = new Map();
    for (const entry of members) membersByExact.set(exactKey(entry.name), [...(membersByExact.get(exactKey(entry.name)) || []), entry]);
    const matchedOptions = new Set();
    for (const entry of members) {
      const id = idOf(entry);
      const options = byExact.get(exactKey(entry.name)) || [];
      const rivals = membersByExact.get(exactKey(entry.name)) || [];
      if (options.length === 1 && rivals.length === 1) {
        matchedOptions.add(options[0]);
        if (waiting.has(id) && !applied.has(id)) {
          apply.push({ id, kind: 'member-list-confirms', note: `named "${options[0].text}"${options[0].value ? ` (code ${options[0].value})` : ''} in the catalog's own list of libraries on ${result.host} (the app's front-page check, ${result.date})` });
          applied.add(id);
        }
        continue;
      }
      if (options.length > 1 || rivals.length > 1) { propose.push({ kind: 'member-ambiguous', id, note: `"${entry.name}" fits ${options.length} names of the list and ${rivals.length} entries` }); continue; }
      const loose = listedNames.filter(option => looseKey(option.text) && looseKey(option.text) === looseKey(entry.name));
      if (loose.length) propose.push({ kind: 'member-loose-match', id, note: `"${entry.name}" may be ${loose.map(option => `"${option.text}" (${option.value})`).join(' or ')}: a person decides` });
      else if (waiting.has(id)) propose.push({ kind: 'member-not-listed', id, note: `"${entry.name}" is not in the catalog's own list on ${result.host}: it stays waiting` });
    }
    for (const option of listedNames) {
      if (matchedOptions.has(option) || !option.value || /^(?:all|any)\b/i.test(option.text)) continue;
      if (members.some(entry => looseKey(entry.name) === looseKey(option.text))) continue;
      const candidates = (imlsByState.get(item.state) || []).filter(record => exactKey(record.LIBNAME) === exactKey(option.text));
      propose.push({ kind: 'member-new', id: result.id, note: `"${option.text}" (${option.value}) has no directory entry${imls
        ? `; IMLS ${item.state}: ${candidates.length ? candidates.map(record => `${record.FSCSKEY} ${record.LIBNAME}, ${record.CITY}`).join('; ') : 'no library of that name'}`
        : ''}` });
    }
  }
  return { apply, propose };
}

/** The listing and the catalogs with the clear changes applied (new objects; the counts kept in step). */
export function applyChanges({ catalogs, listed }, apply, today) {
  const ids = new Set(apply.map(change => change.id));
  const notes = new Map(apply.map(change => [change.id, change.note]));
  const waiting = listed.waiting.filter(item => !ids.has(item.id));
  const moved = listed.waiting.filter(item => ids.has(item.id)).map(item => item.id);
  const libraryIds = [...new Set([...listed.libraryIds, ...moved])].sort();
  const connected = [...new Set([...listed.connected, ...moved])].sort();
  const platforms = {};
  for (const id of libraryIds) { const platform = id.slice(0, id.indexOf(':')); platforms[platform] = (platforms[platform] || 0) + 1; }
  const nextListed = { ...listed, count: libraryIds.length, counts: { ...listed.counts, connected: connected.length, waiting: waiting.length },
    platforms: Object.fromEntries(Object.entries(platforms).sort(([a], [b]) => (a < b ? -1 : 1))), connected, waiting, libraryIds };
  const libraries = catalogs.libraries.map(entry => (notes.has(idOf(entry)) && moved.includes(idOf(entry))
    ? { ...entry, evidence: { ...entry.evidence, catalog: { ...entry.evidence.catalog, confirmedBy: `${notes.get(idOf(entry))}; applied ${today}` } } } : entry));
  return { catalogs: { ...catalogs, libraries }, listed: nextListed, moved };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
  const paths = Object.fromEntries(Object.keys(FILES).map(key => [key, value(`--${key}`) || pathOf(key)]));
  const files = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, JSON.parse(readFileSync(path, 'utf8'))]));
  const imls = value('--imls') ? imlsRecords(readFileSync(value('--imls'), 'latin1')) : null;
  const today = value('--on') || new Date().toISOString().slice(0, 10);
  const { apply, propose } = proposeChanges({ ...files, imls });
  for (const change of apply) console.log(`apply\t${change.kind}\t${change.id}\t${change.note}`);
  for (const item of propose) console.log(`propose\t${item.kind}\t${item.id}\t${item.note}`);
  if (!apply.length && !propose.length) console.log('No member-list or catalog-link results yet (merge the log lines first: tools/deployment/front-page-results.mjs).');
  if (!args.includes('--write')) { console.log(`${apply.length} clear change(s), ${propose.length} proposal(s); nothing written (add --write to apply the clear ones).`); process.exit(0); }
  const next = applyChanges(files, apply, today);
  writeFileSync(paths.listed, `${JSON.stringify(next.listed, null, FILES.listed[1])}\n`);
  writeFileSync(paths.catalogs, `${JSON.stringify(next.catalogs, null, FILES.catalogs[1])}\n`);
  console.log(`Moved ${next.moved.length} entries from waiting to connected. Next: node tools/seo/us-pages.mjs, then update the listing counts in the tests and run them.`);
}
