// The Georgia PINES member systems as US directory entries (USA plan step 8,
// "PINES split"), made from PINES's own org tree and the IMLS records, never
// typed by hand. PINES is one Evergreen catalog (gapines.org) shared by most
// of Georgia's public library systems; each system is listed under its own
// name and its check is limited to its own org (providers/evergreen.js:
// `site(<short name>)` for the library search, the org's copy counts for an
// exact edition). Nothing here contacts any host.
//
//   node tools/directory/pines-systems.mjs --tree <org tree JSON> --imls <PLS_FY24_AE_pud24i.csv> [--write]
//
// --tree is the gateway's answer to open-ils.actor.org_tree.retrieve (the
// owner approved one call, made 24 November 2026; the answer, trimmed to the
// fields read here, is server/test/fixtures/evergreen/pines-org-tree.json).
// --imls is the IMLS Public Libraries Survey FY2024 administrative entity
// file (pls_fy2024_csv.zip from imls.gov).
//
// From the tree (aou objects in Evergreen's positional form: children 0,
// id 3, name 6, org type 7, parent 8, short name 9, OPAC visible 12, and the
// IMLS key (FSCSKEY) PINES records for an org unit at 32): the systems are
// the root's visible children; a system's branches are its visible children
// of the branch type (3), as the gapines entry lists them (book lockers,
// bookmobiles, outreach and hidden units left out). Each system is matched
// to IMLS by the key PINES itself records for it (on the system, else the
// one key its branches share), and the match is checked by name: the IMLS
// name and PINES's name must be the same words once "library", "system",
// "public", "regional", "county" and the like are set aside, or the system
// must be in SAME_LIBRARY with the reason. Name, town and position come from
// the IMLS record (the name in PINES's own capitals where the words are the
// same), never from a name. A system with no IMLS key (the state library
// service), a hidden one ("ZZZ-") or a key that IMLS does not list in
// Georgia is left out, and the run says so.
//
// One IMLS library that PINES lists as two systems (GA0066, Greater Clarks
// Hill Regional Library: PINES's Columbia County Library System and Eastern
// Regional Library System, whose branches all carry GA0066) is one entry
// with both systems' branches; as its check cannot be limited to one org, it
// searches the whole of PINES (the root org) and a find there counts for it
// (catalogScope shared, owner decision of 23 November 2026).
//
// With --write the entries replace the evergreen entries in
// server/data/us-catalogs.json and are listed as connected in
// server/data/us-catalogs-listed.json (offered now: an agent read the gateway
// without a wall, and the app has checked PINES through it since October
// 2026). PINES is live-only (server/data/catalog-policies.json
// platforms.evergreen). Then run node tools/seo/us-pages.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imlsRecords, slugFor, IMLS_SOURCE } from './apollo-hosts.mjs';

export const ORIGIN = 'https://gapines.org';
export const ROOT_ORG_ID = 1;
export const SHARED_CATALOG = 'Georgia PINES';
export const FAMILY = 'Evergreen (Georgia PINES: the statewide shared catalog of the Georgia Public Library Service)';
export const TREE_SOURCE = 'Georgia PINES\'s org tree: one open-ils.actor.org_tree.retrieve call on the OpenSRF gateway (gapines.org/osrf-gateway-v1), as Claude-User with the owner\'s approval, 24 November 2026 (server/test/fixtures/evergreen/pines-org-tree.json)';
export const ROBOTS = 'gapines.org\'s robots.txt: every agent (*) may use /osrf-gateway-v1 (it disallows /eg/opac/results/, /eg/opac/login and other OPAC paths, which the app never reads, and sets Crawl-delay 1); ClaudeBot and Claude-SearchBot are disallowed everywhere, Claude-User and the app are not named; read 23 November 2026 and again 24 November 2026 before the org tree call (open/6-scoping/robots/); the app reads it live before every check';
export const WALL = 'none seen (the OpenSRF gateway: the org tree and five searches by an agent as Claude-User, 24 November 2026; the app\'s own gateway reads for the gapines entry since 3 October 2026)';
export const CRAWL_DELAY_SECONDS = 1;
const CAPABILITIES = Object.freeze({ catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true });
// aou field positions (Evergreen fm_IDL.xml order, as the gateway sends them).
const F = Object.freeze({ children: 0, id: 3, name: 6, type: 7, parent: 8, shortname: 9, visible: 12, fscsKey: 32 });
const BRANCH_TYPE = 3;
const FSCS = /^GA\d{4}$/;
const SITE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

// Systems whose IMLS name and PINES name are not the same words, but are the
// same library, with the reason.
export const SAME_LIBRARY = Object.freeze({
  444: 'Columbia County Library System: its Evans, Grovetown and Harlem branches carry GA0066, Greater Clarks Hill Regional Library, whose IMLS outlets they are (outlets 001, 009 and 003)',
  365: 'Eastern Regional Library System: PINES records GA0066 for it, and its Burke County, Lincoln County, Midville, Sardis and Warren County branches are Greater Clarks Hill Regional Library\'s IMLS outlets (006, 004, 008, 007 and 005)',
});

const SET_ASIDE = /\b(?:the|of|and|library|libraries|system|systems|public|regional|region|county|co|memorial)\b/g;
/** A name's distinctive words: lower case, letters only, the common words set aside. */
export const nameKey = value => String(value || '').toLowerCase().replace(/[^a-z]+/g, ' ').replace(SET_ASIDE, ' ').replace(/\s+/g, '');
// IMLS's capitals in title case ("MCDONOUGH" is McDonough; "of" stays small).
export function placeCase(value) {
  return String(value || '').toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (all, lead, letter) => lead + letter.toUpperCase())
    .replace(/\bMc([a-z])/g, (all, letter) => `Mc${letter.toUpperCase()}`).replace(/(?!^)\b(Of|And|The)\b/g, word => word.toLowerCase());
}
const round = value => Math.round(Number(value) * 1e6) / 1e6;
const text = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** The org tree's units: { id, name, type, parent, shortname, visible, fscsKey, children }; throws when the answer is not an org tree. */
export function orgTree(answer) {
  const root = answer?.status === 200 && Array.isArray(answer.payload) ? answer.payload[0] : null;
  const unit = node => {
    const p = node?.__c === 'aou' && Array.isArray(node.__p) ? node.__p : null;
    if (!p || !Number.isSafeInteger(p[F.id]) || !text(p[F.name]) || !text(p[F.shortname]) || !Number.isSafeInteger(p[F.type])) {
      throw Error('The org tree has a unit the tool cannot read');
    }
    return { id: p[F.id], name: text(p[F.name]), type: p[F.type], parent: p[F.parent] ?? null, shortname: text(p[F.shortname]),
      visible: p[F.visible] === 't', fscsKey: text(p[F.fscsKey]) || null, children: (p[F.children] || []).map(unit) };
  };
  const tree = unit(root);
  if (tree.id !== ROOT_ORG_ID || tree.shortname !== 'PINES' || tree.parent !== null) throw Error('The org tree\'s root is not PINES (org 1)');
  return tree;
}

/**
 * What the tree and IMLS give: `{ entries, leftOut }`. `leftOut` lists the
 * visible systems not made entries, with the reason. Throws on a match a
 * person must settle (names that differ, a key used twice without a reason).
 */
export function planPines({ tree, imls }) {
  const problems = [];
  const leftOut = [];
  const groups = new Map();
  for (const system of tree.children) {
    if (!system.visible || /^ZZZ-/.test(system.name)) continue;
    const branches = system.children.filter(unit => unit.visible && unit.type === BRANCH_TYPE);
    const keys = [...new Set(branches.map(unit => unit.fscsKey).filter(key => FSCS.test(key || '')))];
    const key = FSCS.test(system.fscsKey || '') ? system.fscsKey : keys.length === 1 ? keys[0] : null;
    if (!key) { leftOut.push({ org: system.id, name: system.name, reason: 'PINES records no IMLS key for the system or its branches' }); continue; }
    const record = imls.get(key);
    if (!record || record.STABR !== 'GA') { leftOut.push({ org: system.id, name: system.name, reason: `IMLS lists no ${key} in Georgia` }); continue; }
    if (!SITE.test(system.shortname)) { problems.push(`org ${system.id}: short name ${system.shortname} is not one the adapter sends`); continue; }
    if (nameKey(record.LIBNAME) !== nameKey(system.name) && !SAME_LIBRARY[system.id]) {
      problems.push(`org ${system.id} (${system.name}) carries ${key}, ${record.LIBNAME}: not the same name; a person must settle it (SAME_LIBRARY)`);
      continue;
    }
    groups.set(key, [...(groups.get(key) || []), { system, branches }]);
  }
  for (const [key, systems] of groups) {
    if (systems.length > 1 && !systems.every(({ system }) => SAME_LIBRARY[system.id])) problems.push(`${key} is carried by orgs ${systems.map(({ system }) => system.id).join(' and ')} without a reason`);
  }
  if (problems.length) throw Object.assign(Error(`The PINES tree has problems:\n${problems.join('\n')}`), { problems });
  const entries = [];
  for (const [key, systems] of groups) {
    const record = imls.get(key);
    const one = systems.length === 1 ? systems[0].system : null;
    const imlsName = placeCase(record.LIBNAME);
    // PINES's own capitals where the words are IMLS's.
    const name = one && one.name.toLowerCase().replace(/[^a-z]+/g, ' ').trim() === record.LIBNAME.toLowerCase().replace(/[^a-z]+/g, ' ').trim() ? one.name : imlsName;
    const slug = slugFor(name, 'GA');
    const orgId = one ? one.id : ROOT_ORG_ID;
    const aliases = [...new Set(['PINES', ...systems.map(({ system }) => system.name)].filter(alias => alias !== name))];
    const branches = systems.flatMap(({ branches: list }) => list.map(unit => ({ name: unit.name, evergreenOrgId: unit.id })));
    const orgs = systems.map(({ system, branches: list }) => `org ${system.id} (${system.shortname}, "${system.name}", ${list.length} ${list.length === 1 ? 'branch' : 'branches'})`).join(' and ');
    entries.push({
      slug, name, country: 'US', region: 'Georgia', city: placeCase(record.CITY), lat: round(record.LATITUDE), lon: round(record.LONGITUD),
      platform: 'evergreen', capabilities: ['catalogSearch', 'availability'],
      catalogUrl: `${ORIGIN}/eg/opac/home?locg=${orgId}`, baseUrl: ORIGIN,
      evergreenOrgId: orgId, ...(one ? { evergreenSite: one.shortname } : {}),
      catalogScope: one ? 'member' : 'shared', sharedCatalog: SHARED_CATALOG, crawlDelaySeconds: CRAWL_DELAY_SECONDS,
      branches, publicCatalogValidated: true, publicCatalogCapabilities: { ...CAPABILITIES }, searchAliases: aliases,
      evidence: {
        identity: { source: IMLS_SOURCE, fscsKey: record.FSCSKEY, imlsName: record.LIBNAME,
          address: `${record.ADDRESS}, ${record.CITY}, ${record.STABR} ${record.ZIP} (${record.CNTY} County)`,
          member: one ? `PINES's org tree records ${key} for ${orgs}`
            : `PINES lists this IMLS library as two systems, ${orgs}: ${systems.map(({ system }) => SAME_LIBRARY[system.id]).join('; ')}` },
        catalog: { host: new URL(ORIGIN).host, source: TREE_SOURCE, family: FAMILY,
          scope: one ? `limited to the system: the library search adds site(${one.shortname}) (records with copies at or below org ${one.id}, as the OPAC's library selector does), the exact-edition check reads org ${one.id}'s copy counts`
            : 'the whole of PINES (org 1): the check cannot be limited to two orgs at once, so a find anywhere in PINES counts for this library',
          robots: ROBOTS, wall: WALL },
      },
    });
  }
  entries.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return { entries, leftOut };
}

/** The data files with the plan applied: the evergreen entries replaced, each listed as connected. */
export function applyPines({ catalogs, listed }, plan) {
  const ids = plan.entries.map(entry => `evergreen:${entry.slug}`);
  const before = new Set(catalogs.libraries.filter(entry => entry.platform === 'evergreen').map(entry => `evergreen:${entry.slug}`));
  const keep = id => !before.has(id) || ids.includes(id);
  const libraryIds = [...new Set([...listed.libraryIds.filter(keep), ...ids])].sort();
  const connected = [...new Set([...listed.connected.filter(keep), ...ids])].sort();
  const platforms = {};
  for (const id of libraryIds) { const platform = id.slice(0, id.indexOf(':')); platforms[platform] = (platforms[platform] || 0) + 1; }
  return {
    catalogs: { ...catalogs, libraries: [...catalogs.libraries.filter(entry => entry.platform !== 'evergreen'), ...plan.entries] },
    listed: { ...listed, count: libraryIds.length, counts: { ...listed.counts, connected: connected.length },
      platforms: Object.fromEntries(Object.entries(platforms).sort(([a], [b]) => (a < b ? -1 : 1))), connected, libraryIds },
  };
}

const FILES = { catalogs: ['../../server/data/us-catalogs.json', 1], listed: ['../../server/data/us-catalogs-listed.json', 2] };
const pathOf = key => fileURLToPath(new URL(FILES[key][0], import.meta.url));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
  if (!value('--tree') || !value('--imls')) { console.error('Needs --tree <org tree JSON> and --imls <PLS_FY24_AE_pud24i.csv>'); process.exit(2); }
  let plan;
  try {
    plan = planPines({ tree: orgTree(JSON.parse(readFileSync(value('--tree'), 'utf8'))), imls: imlsRecords(readFileSync(value('--imls'), 'latin1')) });
  } catch (error) { console.error(error.message); process.exit(1); }
  for (const entry of plan.entries) {
    console.log(`evergreen:${entry.slug}\t${entry.name}\t${entry.city}\t${entry.evidence.identity.fscsKey}\torg ${entry.evergreenOrgId}${entry.evergreenSite ? ` site(${entry.evergreenSite})` : ' (all of PINES)'}\t${entry.branches.length} branches`);
  }
  for (const item of plan.leftOut) console.log(`left out: org ${item.org} ${item.name}: ${item.reason}`);
  if (!args.includes('--write')) { console.log(`${plan.entries.length} entries; nothing written (add --write).`); process.exit(0); }
  const files = Object.fromEntries(Object.keys(FILES).map(key => [key, JSON.parse(readFileSync(pathOf(key), 'utf8'))]));
  const next = applyPines(files, plan);
  for (const key of Object.keys(FILES)) writeFileSync(pathOf(key), `${JSON.stringify(next[key], null, FILES[key][1])}\n`);
  console.log(`Wrote ${plan.entries.length} PINES entries. Next: node tools/seo/us-pages.mjs, then the server tests.`);
}
