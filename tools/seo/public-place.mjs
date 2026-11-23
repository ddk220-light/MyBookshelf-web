// The place shown for an Indian library on the public pages (library shelves,
// book pages, the state list): one rule, from the directory's evidence only.
//
//   1. A city: the city the directory's source publishes, or the place index's
//      city for the library (server/data/india-places.json). The place index's
//      city counts only when it matched the source city, or when one of its
//      names appears in the library's published address. A city that has the
//      district's name comes first (Prayagraj, not Allahabad; Kupwara, not the
//      index's spelling Kopawor). Nothing that looks like a street, road,
//      colony, building or number is ever shown as a city.
//   2. Else the district, when the source publishes it, the place index took
//      it from a published district, a PIN code in the library's evidence lies
//      in it, or the published address names it. It is shown as the town
//      ("Visakhapatnam") when the published address names it, else as
//      "<district> district".
//   3. Else the one district of the library's state that a part of the
//      published address names exactly ("Kerwa Dam Road, Bhopal" -> Bhopal).
//   4. Else the state only.
// Never a library's name (CLAUDE.md: a state, district or city never comes
// from a name), and never a guess between two candidates.
import index from '../../server/data/india-places.json' with { type: 'json' };
import { canonicalDistrict, canonicalRegion, normalizePlaceName as norm } from '../../server/public-v2/geography.js';

// Address parts the source joined without a separator ("BhopalBarkeri
// KalanBhopal", "GUJARATKoba") are split, and a part repeating an earlier one is dropped.
export function tidyAddress(text) {
  const joined = String(text || '').replace(/\s+/g, ' ').trim()
    .replace(/(?<=[a-z]{3})(?=[A-Z][a-z]{2})/g, ', ')
    .replace(/(?<=[A-Z]{4}|\)|\d{6})(?=[A-Z][a-z]{2})/g, ', ');
  const seen = new Set(), parts = [];
  // A comma between two digits ("Plot 5,6") is not a separator.
  for (const raw of joined.split(/(?<!\d)\s*,\s*|\s*,\s*(?!\d)/)) {
    const part = raw.trim();
    const key = norm(part);
    if (!key || seen.has(key)) continue;
    seen.add(key); parts.push(part);
  }
  return parts.join(', ');
}

const STREET = /\d|\b(?:road|rd|street|marg|salai|lane|gali|colony|sector|block|avenue|chowk|circle|cross|building|bhawan|bhavan|complex|campus|junction|highway|expressway|bypass|plot|phase|layout|enclave|market|bazaa?r|apartments?|tower|floor|house|near|nr|opp|opposite|post)\b/i;
/** A value that names a street, road, colony, building or number, not a town. */
export const looksLikeStreet = value => STREET.test(String(value || ''));

// 6-digit PIN codes in a text ("506 009" too).
export const pinsIn = text => [...new Set(String(text || '').replace(/(?<!\d)(\d{3})\s(\d{3})(?!\d)/g, '$1$2').match(/(?<!\d)[1-9]\d{5}(?!\d)/g) || [])];

/** The lookups the rule needs, from the place index (injectable for tests). */
export function createPlaceIndex(data = index) {
  const namesById = new Map();
  const nameColumn = data.columns.indexOf('names'), idColumn = data.columns.indexOf('id');
  const regionColumn = data.columns.indexOf('region'), districtColumn = data.columns.indexOf('district');
  const districts = new Map(); // region -> normalized district name -> display name
  const addDistrict = (region, district) => {
    const state = canonicalRegion(region);
    if (!state || !district) return;
    const name = canonicalDistrict(district, state);
    if (!districts.has(state)) districts.set(state, new Map());
    const key = norm(name);
    if (key.length >= 3 && !districts.get(state).has(key)) districts.get(state).set(key, name);
  };
  for (const row of data.places) {
    namesById.set(row[idColumn], row[nameColumn] || []);
    addDistrict(row[regionColumn], row[districtColumn]);
  }
  const byPin = new Map();
  for (const [code, region, district] of data.postcodes) {
    if (!byPin.has(code)) byPin.set(code, []);
    byPin.get(code).push({ region: canonicalRegion(region), district: canonicalDistrict(district, region) });
    addDistrict(region, district);
  }
  return {
    binding: id => data.libraries[id] || null,
    namesOf: placeId => namesById.get(placeId) || [],
    pin: code => byPin.get(code) || [],
    districtsOf: region => districts.get(region) || new Map(),
  };
}

// "Seraikela-kharsawan" -> "Seraikela-Kharsawan": each word of a place name
// starts with a capital (only raised, never lowered).
export const placeCase = value => String(value || '').replace(/(^|[\s-])(\p{Ll})(?=\p{L}{2})/gu, (_, before, letter) => before + letter.toUpperCase());
const padded = text => ` ${norm(text)} `;
const names = (value, extra = []) => [...new Set([value, ...extra].filter(Boolean))];
const named = (address, values) => values.some(value => norm(value).length >= 3 && padded(address).includes(padded(value)));
const same = (a, b) => Boolean(a && b) && norm(a) === norm(b);

/**
 * The public place of an Indian library: { city, district, basis } where
 * `city` is shown as the locality when set, else `district` as "<district>
 * district", else neither (state only). `library` is the public projection
 * (toPublicLibrary), `entry` the directory row.
 */
export function publicPlace(library, entry, places = defaultIndex()) {
  if (library?.country !== 'IN') return { city: library?.city || null, district: library?.district || null, basis: 'not-india' };
  const region = library.region;
  const binding = places.binding(entry.id);
  const address = tidyAddress(entry.address);
  const pins = new Set([...pinsIn(entry.address), ...(binding?.postcodes || []), ...(entry.indcatInstitutionCode?.match(/_(\d{6})$/)?.slice(1) || [])]);
  const pinDistricts = new Set([...pins].flatMap(pin => places.pin(pin)).filter(row => !region || row.region === region).map(row => norm(row.district)));
  const district = library.district || null;

  // 1. City.
  const source = entry.city || null, bound = binding?.city || null;
  const accepted = city => {
    if (!city || looksLikeStreet(city)) return false;
    if (same(city, source)) return true;
    if (same(city, bound) && binding.basis === 'city_admin_match') return true;
    if (named(address, [city])) return true;
    // Another spelling of the index's place in the address ("Kanyakumari")
    // counts unless the address names the district, the better town to show
    // ("Waltair Junction, Visakhapatnam" is Visakhapatnam, not Rasapudipalem).
    return same(city, bound) && !named(address, [district]) && named(address, places.namesOf(binding.placeId));
  };
  const cities = [...new Set([source, bound].filter(Boolean))];
  const ordered = [...cities.filter(city => same(city, district)), ...cities.filter(city => !same(city, district))];
  const city = ordered.find(accepted);
  if (city) return { city, district, basis: same(city, source) ? 'source-city' : 'place-index-city' };

  // 2. District.
  const districtOk = district && (same(district, canonicalDistrict(entry.district, region))
    || (binding?.basis === 'published_district' && same(district, canonicalDistrict(binding.district, region)))
    || pinDistricts.has(norm(district)) || named(address, [district]));
  if (districtOk) {
    const shown = placeCase(district);
    return named(address, [district]) ? { city: shown, district: shown, basis: 'district-in-address' } : { city: null, district: shown, basis: 'district' };
  }

  // 3. A part of the published address that names exactly one district of the state.
  if (address && region) {
    const known = places.districtsOf(region);
    const found = new Set(address.split(/\s*[,;()\-–]\s*|\bdist(?:rict)?\b\.?/i).map(norm).filter(part => known.has(part)).map(part => known.get(part)));
    if (found.size === 1) { const only = [...found][0]; return { city: only, district: only, basis: 'address-district' }; }
  }
  // 4. State only.
  return { city: null, district: null, basis: 'state' };
}

let shared = null;
function defaultIndex() { return (shared ||= createPlaceIndex()); }
