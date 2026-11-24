// The population each US directory library serves, for ranking the US library
// pages by size (owner, 24 November 2026: "static pages for the biggest 500
// libraries ... and add them to the site map"; "Biggest 500 the app can
// check": every offered US library ranked by the population it serves).
// Writes server/data/us-library-population.json; tools/seo/us-pages.mjs ranks
// the offered libraries from it and a test checks that the 500 largest have
// pages.
//
// The measure is POPU_UND of the IMLS Public Libraries Survey FY2024
// administrative entity (AE) file: the unduplicated population of the
// system's legal service area (POPU_LSA double-counts where county and city
// areas overlap; the USA research's IMLS item uses POPU_UND for every sum).
// Which record:
//   - the FSCSKEY the entry already records (server/data/us-catalogs.json
//     `evidence.identity.fscsKey`). A member of a shared catalog records its
//     own AE, so it takes its own population, never its consortium's. An
//     outlet key (FL0259-024: a library with no AE of its own, inside a
//     cooperative's) takes the AE it belongs to, noted on the row;
//   - for a legacy entry (server/data/libraries.json, from before the US
//     research: the BiblioCommons libraries and a few others), which records
//     none: the key or keys the USA research's IMLS item matched it
//     to by name and state, reviewed by hand (open/2-imls/directory-with-pls.tsv,
//     passed as --legacy; only the keys are copied). A consortium's catalog
//     matched to its member AEs serves their sum; an entry matched to none (a
//     school or college catalog) has no population.
// A population IMLS does not give (a negative code) is null, as is an entry
// with no record; such an entry ranks after every library with one. Never a
// guess, and never from a library's name. The build never reads this tool's
// inputs.
//
//   node tools/directory/us-population.mjs --imls <PLS_FY24_AE_pud24i.csv> --legacy <directory-with-pls.tsv> [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imlsRecords } from './apollo-hosts.mjs';
import { getAllLibraries } from '../../server/services/directory.js';

export const SOURCE = 'Institute of Museum and Library Services, Public Libraries Survey FY2024, administrative entity file PLS_FY24_AE_pud24i.csv (pls_fy2024_csv.zip from imls.gov, downloaded 23 November 2026), POPU_UND: the unduplicated population of the legal service area';
const FILE = fileURLToPath(new URL('../../server/data/us-library-population.json', import.meta.url));
const AE_KEY = /^[A-Z]{2}\d{4}$/;
const OUTLET_KEY = /^([A-Z]{2}\d{4})-\d{3}$/;

/** The research's legacy matches (tab-separated, a header row), by directory ID: { keys, type, note }. */
export function legacyMatches(text) {
  const [header, ...lines] = String(text || '').split(/\r?\n/).filter(line => line.trim());
  const columns = header.split('\t');
  const at = name => { const i = columns.indexOf(name); if (i < 0) throw Error(`The legacy match file has no ${name} column`); return i; };
  const [slug, platform, type, key, note] = ['slug', 'platform', 'match_type', 'FSCSKEY', 'match_note'].map(at);
  const out = new Map();
  for (const line of lines) {
    const values = line.split('\t');
    const id = `${values[platform] === 'bibliocommons' ? 'bc' : values[platform]}:${values[slug]}`;
    const keys = (values[key] || '').split(',').map(item => item.trim()).filter(item => AE_KEY.test(item));
    out.set(id, { keys, type: values[type], note: (values[note] || '').trim() });
  }
  return out;
}

const populationOf = record => {
  const value = Number(record?.POPU_UND);
  return Number.isInteger(value) && value >= 0 ? value : null;
};

/**
 * One row per US directory entry, largest first (no population last, then
 * by ID): { id, fscsKey | fscsKeys, population, ...how }. Throws on a key the
 * IMLS file does not have, or a legacy entry the research did not match.
 */
export function populationRows({ entries, imls, legacy }) {
  const rows = [];
  for (const entry of entries.filter(item => item.country === 'US')) {
    const recorded = entry.evidence?.identity?.fscsKey;
    if (recorded) {
      const outlet = OUTLET_KEY.exec(recorded);
      const key = outlet ? outlet[1] : recorded;
      if (!AE_KEY.test(key)) throw Error(`Not an IMLS key: ${recorded} (${entry.id})`);
      const record = imls.get(key);
      if (!record) throw Error(`No IMLS record ${key} (${entry.id})`);
      const population = populationOf(record);
      rows.push({ id: entry.id, fscsKey: key, population,
        ...(outlet ? { outlet: recorded, note: `no administrative entity of its own: its IMLS record is outlet ${recorded} of ${record.LIBNAME} (${key}), whose population this is` } : {}),
        ...(population === null ? { note: `IMLS gives no population for ${key} (POPU_UND ${record.POPU_UND})` } : {}) });
      continue;
    }
    const match = legacy.get(entry.id);
    if (!match) throw Error(`No IMLS key recorded and no legacy match: ${entry.id}`);
    for (const key of match.keys) if (!imls.has(key)) throw Error(`No IMLS record ${key} (${entry.id})`);
    if (!match.keys.length) { rows.push({ id: entry.id, population: null, keySource: 'match', note: `no IMLS record: ${match.note || 'not matched'}` }); continue; }
    const values = match.keys.map(key => populationOf(imls.get(key)));
    const population = values.every(value => value === null) ? null : values.reduce((sum, value) => sum + (value || 0), 0);
    rows.push(match.keys.length === 1
      ? { id: entry.id, fscsKey: match.keys[0], population, keySource: 'match' }
      : { id: entry.id, fscsKeys: match.keys, population, keySource: 'match', note: `a shared catalog matched to its ${match.keys.length} member libraries: their sum` });
  }
  return rows.sort((a, b) => (b.population ?? -1) - (a.population ?? -1) || (a.id < b.id ? -1 : 1));
}

const ABOUT = 'The population each US directory library serves, largest first, for ranking the US library pages (owner, 24 November 2026: the 500 largest libraries the app can check have pages; tools/seo/us-pages.mjs ranks the offered ones, and a test checks them). Written by node tools/directory/us-population.mjs from the IMLS file (source) and the directory, never by hand. fscsKey: the IMLS administrative entity whose POPU_UND is the population: the key the entry records (a shared catalog\'s member records its own; an outlet key, a library with no administrative entity of its own, takes its entity\'s, noted). keySource "match": a legacy entry (BiblioCommons and a few others, from before the US research), which records no key, takes the key the USA research\'s IMLS item matched it to by name and state, reviewed by hand (fscsKeys and their sum for a consortium\'s catalog matched to its members). population null: IMLS gives none, or the entry has no IMLS record (a school or college catalog), with the reason; it ranks last.';

// One row per line, so a change is one line of the diff.
const line = item => `{ ${Object.entries(item).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ')} }`;
export function formatPopulation(rows) {
  return `{\n  "about": ${JSON.stringify(ABOUT)},\n  "source": ${JSON.stringify(SOURCE)},\n  "libraries": [\n${rows.map(row => '    ' + line(row)).join(',\n')}\n  ]\n}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = flag => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
  if (!value('--imls') || !value('--legacy')) { console.error('Needs --imls <PLS_FY24_AE_pud24i.csv> and --legacy <directory-with-pls.tsv>'); process.exit(2); }
  let rows;
  try {
    rows = populationRows({ entries: getAllLibraries(), imls: imlsRecords(readFileSync(value('--imls'), 'latin1')), legacy: legacyMatches(readFileSync(value('--legacy'), 'utf8')) });
  } catch (error) { console.error(error.message); process.exit(1); }
  const known = rows.filter(row => row.population !== null);
  console.log(`${rows.length} US entries; ${known.length} with a population, ${rows.length - known.length} without.`);
  for (const row of rows.filter(item => item.population === null)) console.log(`  no population: ${row.id}: ${row.note}`);
  if (!args.includes('--write')) { console.log('Nothing written (add --write).'); process.exit(0); }
  writeFileSync(FILE, formatPopulation(rows));
  console.log('Wrote server/data/us-library-population.json. Next: node tools/seo/us-pages.mjs --check.');
}
