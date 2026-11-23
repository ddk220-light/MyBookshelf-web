import index from '../data/india-places.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { haversineKm } from '../services/directory.js';
import { canonicalDistrict, canonicalRegion, normalizePlaceName } from './geography.js';

const places = index.places.map(row => Object.fromEntries(index.columns.map((key, i) => [key, row[i]])));
const byId = new Map(places.map(place => [place.id, place]));
const postcodePlaces = index.postcodes.map(([code, region, district, lat, lon, names]) => ({
  id: `geonames:postcode:${code}:${createHash('sha256').update(region + ':' + district).digest('hex').slice(0, 12)}`, name: code, postcode: code, region, district, lat, lon, names, population: 0,
}));
for (const place of postcodePlaces) byId.set(place.id, place);
// Some postal downloads use district centroids. A unique locality corroborated by
// published library addresses is a better area center, still never a destination point.
const postalLocalities = new Map();
for (const binding of Object.values(index.libraries)) {
  if (!binding.placeId) continue;
  for (const code of binding.postcodes || []) {
    const key = code + ':' + normalizePlaceName(binding.region);
    if (!postalLocalities.has(key)) postalLocalities.set(key, new Set());
    postalLocalities.get(key).add(binding.placeId);
  }
}
for (const place of postcodePlaces) {
  const associated = postalLocalities.get(place.postcode + ':' + normalizePlaceName(place.region)) || new Set();
  if (associated.size === 1) {
    const locality = byId.get([...associated][0]);
    if (locality) { place.lat = locality.lat; place.lon = locality.lon; place.locality = locality.name; }
  }
}
const searchable = places.map(place => ({ place, names: place.names.map(normalizePlaceName), admin: normalizePlaceName([place.district, place.region, 'India'].join(' ')) }));
export const indiaPlaceAttribution = index.attribution;
export const indiaPlaceById = id => byId.get(id) || null;
export function publicPlace(place) {
  return { id: place.id, label: [...new Set([place.name, place.locality, place.district, place.region, 'India'].filter(Boolean))].join(', '),
    name: place.name, lat: place.lat, lon: place.lon, country: 'IN', region: place.region, district: place.district,
    ...(place.regionId ? { regionId: place.regionId, districtId: place.districtId } : {}),
    ...(place.postcode ? { postcode: place.postcode } : {}), attribution: indiaPlaceAttribution };
}
export function searchIndiaPlaces(query, limit = 8) {
  const normalized = normalizePlaceName(query);
  if (/^\d{3,6}$/.test(normalized)) return postcodePlaces.filter(p => p.postcode.startsWith(normalized)).slice(0, limit).map(publicPlace);
  const words = normalized.split(' ');
  return searchable.flatMap(({ place, names, admin }) => {
    if (!names.some(name => name.includes(words[0])) || !words.every(word => names.some(name => name.includes(word)) || admin.includes(word))) return [];
    return [{ place, score: names.includes(normalized) ? 3 : names.some(name => name.startsWith(normalized)) ? 2 : 1 }];
  }).sort((a, b) => b.score - a.score || b.place.population - a.place.population || a.place.id.localeCompare(b.place.id))
    .slice(0, limit).map(({ place }) => publicPlace(place));
}
export function nearestIndiaPlace(lat, lon) {
  if (lat < 5 || lat > 38 || lon < 67 || lon > 99) return null;
  let best = null, distance = Infinity;
  for (const place of places) {
    const km = haversineKm(lat, lon, place.lat, place.lon);
    if (km < distance) { best = place; distance = km; }
  }
  return distance <= 100 ? best : null;
}
export function libraryArea(entry) {
  if (entry.country !== 'IN') return { city: entry.city, region: entry.region, district: entry.district };
  const binding = index.libraries[entry.id];
  return { city: binding?.city || entry.city, region: canonicalRegion(binding?.region || entry.region),
    district: canonicalDistrict(binding?.district || entry.district, binding?.region || entry.region), placeId: binding?.placeId };
}
export function indiaLibraryPlace(entry) {
  const id = index.libraries[entry.id]?.placeId;
  return id ? byId.get(id) : null;
}
export function libraryMatchesPostcode(entry, place) {
  const binding = index.libraries[entry.id];
  return Boolean(place?.postcode && binding?.postcodes?.includes(place.postcode)
    && normalizePlaceName(binding.region) === normalizePlaceName(place.region));
}
