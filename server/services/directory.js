import libraries from '../data/libraries.json' with { type: 'json' };
import researched from '../data/india-catalogs.json' with { type: 'json' };
import discovered from '../data/discovered-catalogs.json' with { type: 'json' };
import presentationReviews from '../../data/library-presentation-reviews.json' with { type: 'json' };
const NEARBY_CUTOFF_KM = 80.5;

function canonicalPlatform(platform) {
  return platform === 'bibliocommons' ? 'bc' : platform;
}

function normalize(entry) {
  return { ...entry, platform: canonicalPlatform(entry.platform), id: entry.directoryId || `${canonicalPlatform(entry.platform)}:${entry.slug}` };
}

const merged = new Map(libraries.map(normalize).map(row => [row.id, row]));
for (const row of researched.libraries.map(normalize)) merged.set(row.id, row);
for (const row of discovered.libraries.map(normalize)) merged.set(row.id, row);
for (const { libraryId, entry } of discovered.alternates) {
  const library = merged.get(libraryId);
  if (!library) throw new Error(`Missing catalog alternate target: ${libraryId}`);
  library.alternateCatalogs = [...(library.alternateCatalogs || []), normalize(entry)];
  library.searchAliases = [...new Set([...(library.searchAliases || []), entry.name, ...(entry.searchAliases || [])])];
}
for (const [id, review] of Object.entries(presentationReviews.libraries)) {
  const entry = merged.get(id);
  if (!entry) throw new Error(`Missing presentation review target: ${id}`);
  if (review.name && review.name !== entry.name) entry.searchAliases = [...new Set([...(entry.searchAliases || []), entry.name])];
  const { sourceUrls, note, branchReviewFrom, ...fields } = review;
  Object.assign(entry, fields);
  if (branchReviewFrom) {
    const branches = presentationReviews.libraries[branchReviewFrom];
    entry.publicBranches = branches.publicBranches;
    entry.branchClassificationComplete = branches.branchClassificationComplete;
  }
}
const entries = [...merged.values()];
const byId = new Map(entries.map((entry) => [entry.id, entry]));
export function getAllLibraries() { return entries; }

export function getLibraryById(id) {
  return typeof id === 'string' ? byId.get(discovered.aliases[id] || id) || null : null;
}

export function publicLibrary(entry, distanceKm) {
  if (!entry) return null;
  // Directory capabilities describe everything known across products. The web
  // release intentionally exposes patron operations only for SMCL.
  const capabilities = (Array.isArray(entry.capabilities) ? entry.capabilities : [])
    .filter((capability) => ['catalogSearch', 'availability'].includes(capability));
  if (entry.id === 'bc:smcl') {
    capabilities.push('accountSync', 'patronLogin', 'loans', 'placeHold');
  }
  const result = {
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    city: entry.city || null,
    region: entry.region || null,
    country: entry.country || null,
    platform: entry.platform,
    capabilities,
    branches: Array.isArray(entry.branches) ? entry.branches : [],
    catalogUrl: entry.catalogUrl || null,
  };
  if (Number.isFinite(distanceKm)) result.distanceKm = Math.round(distanceKm * 10) / 10;
  return result;
}

export function searchLibraries(query, limit = 25) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return [];
  return entries
    .filter((entry) => {
      const branchNames = (entry.branches || []).map((branch) => branch.name).join(' ');
      return [entry.name, entry.city, entry.region, entry.country, entry.address, branchNames, ...(entry.searchAliases || [])]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 50)))
    .map((entry) => publicLibrary(entry));
}

export function getLibrariesByRegion(country, region) {
  const countryCode = String(country).toUpperCase();
  const regionName = String(region).trim().toLocaleLowerCase();
  return entries.filter((entry) => entry.country === countryCode
    && String(entry.region || '').toLocaleLowerCase() === regionName);
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearbyLibraries(lat, lon, limit = 25) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return null;
  }
  return entries
    .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
    .map((entry) => ({ entry, distance: haversineKm(latitude, longitude, entry.lat, entry.lon) }))
    .filter(({ distance }) => distance <= NEARBY_CUTOFF_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 50)))
    .map(({ entry, distance }) => publicLibrary(entry, distance));
}

export { NEARBY_CUTOFF_KM };
