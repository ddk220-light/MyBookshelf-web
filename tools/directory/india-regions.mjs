// Fill in the state (and, when unambiguous, the district) of Indian directory
// libraries that have none, from published evidence only. Writes
// server/data/india-library-regions.json, which server/services/directory.js applies
// to entries without a region. Existing regions are never changed.
//
// Evidence, strongest first; the first that settles a state wins:
//   1. The state field the library publishes on its own e-Granthalaya OPAC
//      page (docs/research/india-library-regions/egranthalaya-contacts.json).
//      A PIN code in the same address must not point to another state.
//   2. A 6-digit PIN code in the library's published address, or in its IndCat
//      institution code (e.g. AGRA_282004), that GeoNames places in exactly one
//      state. The district is kept only when the PIN maps to one district.
//   3. Exactly one Indian state or union territory named in the published address.
//   4. Parts of the published address (split on commas, full stops and "Dist.")
//      that exactly match a GeoNames district or place name (or alias), when the
//      matched parts share exactly one state and either two distinct parts agree
//      on it or a part names a district of it. A single town name is not enough:
//      the place index holds about 7,700 places, so a name unique there is not
//      unique in India ("Seawoods, Nerul, Navi-Mumbai" is not in Goa's Nerul).
//      A part that lies in two or more states, with nothing to narrow it, leaves
//      the library unresolved: no popularity tie-break.
// Never a library's name: "Air Force School Jaisalmer" is not evidence of a
// state (data/india-administrative-aliases.json: never infer from a name).
//
//   node tools/directory/india-regions.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTACTS = 'docs/research/india-library-regions/egranthalaya-contacts.json';
export const OUTPUT = 'server/data/india-library-regions.json';
const read = (path) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

export function createResolver({ places, aliases }) {
  const states = [...new Set(places.places.map((place) => place.at(5)))].filter(Boolean);
  // One spelling per state, matching the directory ("Jammu and Kashmir").
  const canonical = new Map(states.map((state) => [state.toLowerCase(), state.replace(' & ', ' and ')]));
  for (const [alias, state] of Object.entries(aliases.states)) canonical.set(alias.toLowerCase(), state);
  const extra = { 'jammu & kashmir': 'Jammu and Kashmir', 'j&k': 'Jammu and Kashmir', 'm.p.': 'Madhya Pradesh', 'u.p.': 'Uttar Pradesh',
    'new delhi': 'Delhi', 'pondicherry': 'Puducherry', 'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu' };
  for (const [alias, state] of Object.entries(extra)) canonical.set(alias, state);
  const toCanonical = (region) => canonical.get(region.toLowerCase()) || canonical.get(region.toLowerCase().replace(/ & /g, ' and ')) || region;
  const byPin = new Map();
  for (const [code, region, district] of places.postcodes) {
    if (!byPin.has(code)) byPin.set(code, []);
    byPin.get(code).push({ region: toCanonical(region), district });
  }
  // GeoNames postcodes predate two reorganisations: Telangana (2014, from Andhra
  // Pradesh) and Ladakh (2019, from Jammu and Kashmir). A PIN or a published
  // state on either side of one of these splits is the same place, and the
  // current state wins: the PIN's Telangana over a stale published Andhra
  // Pradesh, and a published Ladakh over the PIN's pre-2019 Jammu and Kashmir.
  const SUCCESSOR = { 'Andhra Pradesh|Telangana': 'Telangana', 'Ladakh|Jammu and Kashmir': 'Ladakh' };
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Longest names first, so "West Bengal" is not read as "Bengal" and "Andhra Pradesh" not as "Pradesh".
  const names = [...canonical.keys()].sort((a, b) => b.length - a.length);
  const stateNamePattern = new RegExp(`(?<![a-z])(${names.map(escape).join('|')})(?![a-z])`, 'gi');

  const norm = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const placeStates = new Map();
  const addPlace = (name, region) => {
    const key = norm(name);
    if (key.length < 4) return;
    if (!placeStates.has(key)) placeStates.set(key, new Set());
    placeStates.get(key).add(toCanonical(region));
  };
  for (const place of places.places) {
    const [, name, aliasNames, , , region, , district] = place;
    if (!region) continue;
    addPlace(name, region);
    for (const alias of aliasNames || []) addPlace(alias, region);
    if (district) addPlace(district, region);
  }
  for (const [region, districts] of Object.entries(aliases.districts || {})) for (const [alias] of Object.entries(districts)) addPlace(alias, region);
  // District names, from every source that names one: the places' districts, the
  // postcodes' districts and the district aliases. Unlike the ~7,700 places,
  // India's districts are all here, so a district name in one state is evidence
  // on its own; a town name unique in this index is not unique in India
  // ("Nerul" is both a Navi Mumbai node and a Goa village, and only the second
  // is a GeoNames place here).
  const districtStates = new Map();
  const addDistrict = (name, region) => {
    const key = norm(name);
    if (key.length < 4) return;
    if (!districtStates.has(key)) districtStates.set(key, new Set());
    districtStates.get(key).add(toCanonical(region));
  };
  for (const place of places.places) if (place.at(5) && place.at(7)) addDistrict(place.at(7), place.at(5));
  for (const [, region, district] of places.postcodes) if (region && district) addDistrict(district, region);
  for (const [region, districts] of Object.entries(aliases.districts || {})) {
    for (const [alias, name] of Object.entries(districts)) { addDistrict(alias, region); addDistrict(name, region); }
  }
  const GENERIC = new Set(['main road', 'road', 'district', 'india', 'na', 'city', 'town', 'college', 'campus', 'library', 'central library']);
  const statesOfPlaces = (text) => {
    const parts = String(text || '').split(/[,;/()\n]|\.(?!\w\.)|\bdist(?:rict)?\b\.?|\btal(?:uka)?\b\.?/i).map(norm).filter((part) => part && !GENERIC.has(part));
    const found = new Map();
    for (const part of parts) {
      const states = placeStates.get(part);
      // A matched part that is also a district name anywhere counts that state too.
      if (states) found.set(part, new Set([...states, ...(districtStates.get(part) || [])]));
    }
    // States every matched part agrees on: "Sakri, Dhule" is Maharashtra because
    // Dhule lies only there, even though another Sakri lies elsewhere.
    const sets = [...found.values()];
    const shared = sets.length ? new Set([...sets[0]].filter((state) => sets.every((states) => states.has(state)))) : new Set();
    const union = new Set(sets.flatMap((states) => [...states]));
    const matched = [...found.keys()];
    // Enough to fill a state: two distinct parts agreeing on it, or a part that
    // names a district of it. One town name alone is not.
    const districts = matched.filter((part) => shared.size === 1 && districtStates.get(part)?.has([...shared][0]));
    return { shared, union, matched, districts, settled: shared.size === 1 && (matched.length >= 2 || districts.length > 0) };
  };
  const normalizeState = (value) => canonical.get(String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')) || null;
  const pinsIn = (text) => [...new Set(String(text || '').replace(/(\d{3})\s(\d{3})/g, '$1$2').match(/(?<!\d)[1-9]\d{5}(?!\d)/g) || [])];
  const fromPins = (pins) => {
    const regions = new Set(), districts = new Set(), known = [];
    for (const pin of pins) {
      const rows = byPin.get(pin);
      if (!rows) continue;
      known.push(pin);
      for (const row of rows) { regions.add(row.region); districts.add(`${row.region}\u0000${row.district}`); }
    }
    if (regions.size !== 1) return null;
    const region = [...regions][0];
    const district = districts.size === 1 ? [...districts][0].split('\u0000')[1] : null;
    return { region, district, pins: known };
  };
  const statesNamedIn = (text) => {
    const found = new Set();
    for (const match of String(text || '').matchAll(stateNamePattern)) found.add(canonical.get(match[1].toLowerCase()));
    return [...found];
  };

  /** Region evidence for one entry, or { unresolved } with the reason. */
  return function resolveRegion(entry, contact) {
    const published = contact?.outcome === 'answered' ? contact : null;
    const addressText = [published?.address, published?.city, entry.address].filter(Boolean).join(', ');
    const pins = pinsIn(addressText);
    const indcatPin = entry.indcatInstitutionCode?.match(/_(\d{6})$/)?.[1];
    if (published?.state) {
      const state = normalizeState(published.state);
      if (state) {
        const pinEvidence = fromPins(pins);
        const successor = pinEvidence && SUCCESSOR[`${state}|${pinEvidence.region}`];
        if (successor) return { region: successor, evidence: { kind: 'published-state', value: published.state, reorganisation: `PIN ${pinEvidence.pins.join(', ')} (${pinEvidence.region})`, sourceUrl: published.sourceUrl, observedAt: published.observedAt } };
        if (pinEvidence && pinEvidence.region !== state) return { unresolved: `published state ${state} conflicts with PIN ${pinEvidence.pins.join(', ')} (${pinEvidence.region})` };
        return { region: state, ...(pinEvidence?.district && pinEvidence.region === state ? { district: pinEvidence.district } : {}),
          evidence: { kind: 'published-state', value: published.state, sourceUrl: published.sourceUrl, observedAt: published.observedAt } };
      }
    }
    const pinSources = [...pins.map((pin) => ({ pin, kind: 'address-pin' })), ...(indcatPin ? [{ pin: indcatPin, kind: 'indcat-code-pin' }] : [])];
    if (pinSources.length) {
      const evidence = fromPins(pinSources.map((source) => source.pin));
      if (evidence) {
        const named = statesNamedIn(addressText);
        if (named.length && !named.includes(evidence.region)) return { unresolved: `PIN places it in ${evidence.region}, address names ${named.join(', ')}` };
        const kind = pinSources.find((source) => evidence.pins.includes(source.pin)).kind;
        return { region: evidence.region, ...(evidence.district ? { district: evidence.district } : {}),
          evidence: { kind, value: evidence.pins.join(', '), ...(kind === 'address-pin' ? { sourceUrl: published?.sourceUrl || entry.addressSourceUrl } : {}) } };
      }
    }
    const named = statesNamedIn(addressText);
    if (named.length === 1) return { region: named[0], evidence: { kind: 'address-state-name', value: addressText.slice(0, 160), sourceUrl: published?.sourceUrl || entry.addressSourceUrl } };
    if (named.length > 1) return { unresolved: `address names ${named.join(', ')}` };
    const placeMatch = statesOfPlaces(addressText);
    if (placeMatch.settled) return { region: [...placeMatch.shared][0], evidence: { kind: 'address-place', value: placeMatch.matched.join(', '), sourceUrl: published?.sourceUrl || entry.addressSourceUrl } };
    if (placeMatch.shared.size === 1) return { unresolved: `one town name only (${placeMatch.matched[0]}, ${[...placeMatch.shared][0]} in the place index): needs a second agreeing part or a district` };
    if (placeMatch.union.size > 1) return { unresolved: `address places ${placeMatch.matched.join(', ')} lie in ${[...placeMatch.union].join(', ')}` };
    if (pinSources.length) return { unresolved: `PIN ${pinSources.map((source) => source.pin).join(', ')} not in one GeoNames state` };
    if (contact && contact.outcome !== 'answered') return { unresolved: `contact page ${contact.outcome}` };
    return { unresolved: addressText ? 'address has no PIN or state' : 'no published address' };
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { getAllLibraries } = await import('../../server/services/directory.js');
  const resolveRegion = createResolver({ places: read('server/data/india-places.json'), aliases: read('data/india-administrative-aliases.json') });
  const contacts = existsSync(resolve(ROOT, CONTACTS)) ? new Map(read(CONTACTS).libraries.map((item) => [item.libraryId, item])) : new Map();
  const allowlist = new Set(read('server/data/india-catalogs-listed.json').libraryIds);
  // getAllLibraries() already has earlier fills applied; work from source regions.
  const filled = existsSync(resolve(ROOT, OUTPUT)) ? read(OUTPUT).libraries : {};
  const targets = getAllLibraries().filter((entry) => entry.country === 'IN' && (!entry.region || filled[entry.id]));
  const libraries = {}, unresolved = {};
  for (const entry of targets) {
    const result = resolveRegion(entry, contacts.get(entry.id));
    if (result.region) libraries[entry.id] = { region: result.region, ...(result.district ? { district: result.district } : {}), evidence: result.evidence };
    else unresolved[entry.id] = { listed: allowlist.has(entry.id), reason: result.unresolved };
  }
  const listedMissing = Object.entries(unresolved).filter(([, item]) => item.listed).length;
  const output = {
    version: 1,
    basis: 'State (and an unambiguous district) for Indian directory libraries that have none, from published evidence only: the library\'s own published state field, a PIN code GeoNames places in exactly one state, exactly one state named in its published address, or address place names that share one state when two distinct parts agree or one names a district (never a lone town name). Never from a library\'s name. Generated by tools/directory/india-regions.mjs; do not edit by hand.',
    counts: { filled: Object.keys(libraries).length, unresolved: Object.keys(unresolved).length, unresolvedListed: listedMissing },
    libraries: Object.fromEntries(Object.entries(libraries).sort()),
    unresolved: Object.fromEntries(Object.entries(unresolved).sort()),
  };
  writeFileSync(resolve(ROOT, OUTPUT), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output.counts));
}
