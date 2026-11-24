// The list of US library pages (shared/seo-us-libraries.json `libraries`),
// generated from the data, never typed by hand: every US library of a family
// with pages (check-pages.mjs PAGE_PLATFORMS: BiblioCommons, TLC, Koha, Aspen, Polaris, Apollo,
// Evergreen) that
// is offered when finding a library (listed in server/data/us-catalogs-listed.json
// as legacy, verified or connected, and not in its `removed` list; a
// connected entry on a front-page host only once the host's committed
// front-page result shows it open, services/directory.js), except
// the entries the file's hand-kept `leftOut` list names with a reason (a
// school, a college, a kids' catalog, a consortium's shared catalog whose
// members have their own pages). The pages themselves are built by
// tools/seo/build-pages.mjs (tools/seo/check-pages.mjs).
//
//   node tools/seo/us-pages.mjs          write the list
//   node tools/seo/us-pages.mjs --check  exit 1 when the committed list is not current
//
// A slug, once given, is kept: a library already in the list keeps its slug
// and its date. A new library gets its /select/ link name (a hash suffix
// dropped; a reviewed guide's slug for a guide) and today's date (`on`, or
// --on YYYY-MM-DD). A library whose state changed gets today's date, since
// its page changed. A library no longer offered, or newly left out, leaves
// the list.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../shared/seo-libraries.json' with { type: 'json' };
import historicalLinks from '../../data/library-selection-aliases.json' with { type: 'json' };
import { getAllLibraries, usListing, US_OFFERED } from '../../server/services/directory.js';
import { toPublicLibrary } from '../../server/public-v2/directory.js';
import { PAGE_PLATFORMS, stateOrder } from './check-pages.mjs';

const FILE = fileURLToPath(new URL('../../shared/seo-us-libraries.json', import.meta.url));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every US library of a family with pages offered when finding a library (legacy, verified or connected). */
export const OFFERED = US_OFFERED;
export const pageCandidates = (entries, listing = usListing) => entries.filter(entry => entry.country === 'US'
  && PAGE_PLATFORMS.includes(entry.platform) && OFFERED.includes(listing(entry)));
/** A new page's slug: the library's /select/ link name, without the hash suffix two libraries of one name get. */
export const linkSlug = selectionPath => decodeURIComponent(String(selectionPath).replace(/^\/select\//, '')).replace(/--[0-9a-f]{16}$/, '');

/** The file with its `libraries` list made current; everything else in it is kept as it is. */
export function usPageList({ current, today, entries = getAllLibraries(), listing = usListing, toPublic = toPublicLibrary, guides = manifest, aliases = historicalLinks }) {
  if (!DATE.test(today || '')) throw Error('usPageList needs today (YYYY-MM-DD)');
  const leftOut = new Set((current.leftOut || []).map(item => item.id));
  const kept = new Map((current.libraries || []).map(item => [item.id, item]));
  const guideSlugs = new Map(guides.map(item => [item.id, item.slug]));
  const rows = [];
  for (const entry of pageCandidates(entries, listing)) {
    if (leftOut.has(entry.id)) continue;
    if (!entry.region) throw Error('A US page needs the library\'s state: ' + entry.id);
    const old = kept.get(entry.id);
    const selectionPath = toPublic(entry)?.selectionPath;
    const slug = old?.slug || guideSlugs.get(entry.id);
    if (!slug && !selectionPath) throw Error('No slug for ' + entry.id);
    const on = old && old.state === entry.region && DATE.test(old.on || '') ? old.on : today;
    rows.push({ name: entry.name, selectionPath, item: { id: entry.id, slug, state: entry.region, on } });
  }
  // A new page takes its link name; where another page already has that name
  // (two libraries of one name in towns of one name, such as Nashville,
  // Tennessee and Nashville, Illinois), the later one takes a name
  // data/library-selection-aliases.json gives it: the name it had before the
  // other joined the directory, or one given by hand. Each selects it and no
  // other. Kept slugs first, then new pages by ID, so the choice does not
  // depend on the order of the directory; a clash with no such name stops
  // the list below.
  const earlier = new Map();
  for (const [slug, id] of Object.entries(aliases || {})) earlier.set(id, [...(earlier.get(id) || []), slug]);
  const taken = new Set(rows.filter(row => row.item.slug).map(row => row.item.slug));
  for (const row of rows.filter(item => !item.item.slug).sort((a, b) => (a.item.id < b.item.id ? -1 : 1))) {
    const choices = [linkSlug(row.selectionPath), ...(earlier.get(row.item.id) || []).sort()];
    row.item.slug = choices.find(slug => !taken.has(slug)) || choices[0];
    taken.add(row.item.slug);
  }
  const slugs = new Map();
  for (const { item } of rows) {
    if (slugs.has(item.slug)) throw Error(`Library slug collision: ${item.slug} (${slugs.get(item.slug)}, ${item.id}); give one a name by hand in data/library-selection-aliases.json`);
    slugs.set(item.slug, item.id);
  }
  const order = stateOrder(rows.map(row => row.item.state), current.firstStates || []);
  rows.sort((a, b) => order.indexOf(a.item.state) - order.indexOf(b.item.state) || a.name.localeCompare(b.name, 'en') || (a.item.id < b.item.id ? -1 : 1));
  return { ...current, libraries: rows.map(row => row.item) };
}

// One object per line, so a change is one line of the diff.
const line = item => `{ ${Object.entries(item).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ')} }`;
/** The file's text: the lists one item per line, the other fields as JSON. */
export function formatPageList(file) {
  const fields = Object.entries(file).map(([key, value]) => Array.isArray(value) && value.length && value.every(item => item && typeof item === 'object')
    ? `  ${JSON.stringify(key)}: [\n${value.map(item => '    ' + line(item)).join(',\n')}\n  ]`
    : `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `{\n${fields.join(',\n')}\n}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--on');
  const today = at >= 0 ? args[at + 1] : new Date().toISOString().slice(0, 10);
  const text = readFileSync(FILE, 'utf8');
  const next = formatPageList(usPageList({ current: JSON.parse(text), today }));
  const count = JSON.parse(next).libraries.length;
  if (args.includes('--check')) {
    if (next !== text) { console.error('shared/seo-us-libraries.json is not current: run node tools/seo/us-pages.mjs'); process.exit(1); }
    console.log(`shared/seo-us-libraries.json is current: ${count} US library pages.`);
  } else {
    writeFileSync(FILE, next);
    console.log(`Wrote ${count} US library pages to shared/seo-us-libraries.json.`);
  }
}
