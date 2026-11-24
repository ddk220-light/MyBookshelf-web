import libraries from '../data/libraries.json' with { type: 'json' };
import researched from '../data/india-catalogs.json' with { type: 'json' };
import discovered from '../data/discovered-catalogs.json' with { type: 'json' };
import presentationReviews from '../../data/library-presentation-reviews.json' with { type: 'json' };
import indiaAllowlist from '../data/india-catalogs-listed.json' with { type: 'json' };
import indiaRegions from '../data/india-library-regions.json' with { type: 'json' };
import usAllowlist from '../data/us-catalogs-listed.json' with { type: 'json' };
import usCatalogs from '../data/us-catalogs.json' with { type: 'json' };
import frontPageHostList from '../data/front-page-hosts.json' with { type: 'json' };
import frontPageResultList from '../data/front-page-results.json' with { type: 'json' };
const NEARBY_CUTOFF_KM = 80.5;

function canonicalPlatform(platform) {
  return platform === 'bibliocommons' ? 'bc' : platform;
}

function normalize(entry) {
  return { ...entry, platform: canonicalPlatform(entry.platform), id: entry.directoryId || `${canonicalPlatform(entry.platform)}:${entry.slug}` };
}

const merged = new Map(libraries.map(normalize).map(row => [row.id, row]));
// US entries added by the USA plan's connector steps (TLC first), with their
// IMLS identity and catalog evidence; never replacing an existing ID.
for (const row of usCatalogs.libraries.map(normalize)) {
  if (merged.has(row.id)) throw new Error(`Duplicate US directory entry: ${row.id}`);
  merged.set(row.id, row);
}
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
// States filled from published evidence (tools/directory/india-regions.mjs) for
// Indian libraries whose source entry has none. A source region always wins.
for (const [id, fill] of Object.entries(indiaRegions.libraries)) {
  const entry = merged.get(id);
  if (!entry || entry.region) continue;
  entry.region = fill.region;
  if (fill.district && !entry.district) entry.district = fill.district;
}
// The town and address an Indian library publishes on its own catalog page
// (same file, `places`), only where the source entry has none. A source value always wins.
for (const [id, place] of Object.entries(indiaRegions.places || {})) {
  const entry = merged.get(id);
  if (!entry || entry.country !== 'IN') continue;
  if (place.city && !entry.city) entry.city = place.city;
  if (place.address && !entry.address) {
    entry.address = place.address;
    entry.addressScope = place.addressScope;
    entry.addressSourceUrl = place.evidence.sourceUrl;
  }
}
// US entries' state, town and position from published evidence
// (server/data/us-catalogs-listed.json `places`: the IMLS Public Libraries
// Survey, the catalog's own branch list), never from a library's name. These
// correct a wrong source value too (Cedar Springs and Croton had been placed
// by a geocoded name in Texas and New Jersey).
for (const [id, place] of Object.entries(usAllowlist.places || {})) {
  const entry = merged.get(id);
  if (!entry || entry.country !== 'US') continue;
  for (const field of ['region', 'city', 'lat', 'lon']) if (place[field] !== undefined) entry[field] = place[field];
}
const entries = [...merged.values()];
const byId = new Map(entries.map((entry) => [entry.id, entry]));
// The one place the listing rules apply: every way of finding a library
// (search, browse, near me, public API listings) reads `listed`. Unlisted IDs
// still resolve, so a saved choice or a direct link keeps working.
//  - India: offered only when server/data/india-catalogs-listed.json lists it
//    (a verified book or an e-Granthalaya audit that found books).
//  - United States: offered only when server/data/us-catalogs-listed.json
//    lists it and it is not in that file's `removed` list (the 232 entries
//    from before the list stay as legacy until there is a reason to remove
//    one; a new entry is listed once verified, or once connected: an entry
//    of a connected catalog family, server/data/us-catalogs.json, whose
//    adapter passes its fixture tests; `waiting` entries are not offered).
//    A connected entry on a front-page host waits for that host's result
//    (below).
//  - Every other country: not affected.
const indiaListed = new Set(indiaAllowlist.libraryIds);
const usListed = new Set(usAllowlist.libraryIds);
const usRemoved = new Set((usAllowlist.removed || []).map(item => item.id));
const usVerified = new Set(usAllowlist.verified || []);
const usConnected = new Set(usAllowlist.connected || []);
const usWaiting = new Set((usAllowlist.waiting || []).map(item => item.id));

// The front-page gate (US build brief, 23 November 2026). A host in
// server/data/front-page-hosts.json allows every agent (*), and so the app,
// but blocks AI agents, so no agent could look for a bot wall there (most
// Koha and Aspen catalogs at ByWater), or no agent was cleared to look
// (`unseen`: Metro OKC's Aspen, the TLC DNS leads connected on 24 November
// 2026). A connected entry whose catalog host is
// one of them is offered only once the app's own front-page check
// (catalog-store/frontPageCheck.js, its results committed in
// server/data/front-page-results.json) found the host open: no wall, robots.txt
// allowing the app, not moved to another host, and a 2xx front page. Until
// then its listing is 'front-page': in the list, resolvable, not offered.
// Legacy and verified entries are not gated.
const frontPageHostSet = new Set((frontPageHostList.hosts || []).map(item => item.host));
/** Whether a committed front-page result shows its host open (see above). */
export function frontPageOpen(result) {
  return Boolean(result) && result.wall === 'none' && !result.robots && !result.movedTo
    && Number.isInteger(result.status) && result.status >= 200 && result.status < 300;
}
/** The host the library's checks go to: its adapter's baseUrl, else its catalog link. */
export function catalogHostOf(entry) {
  try { return new URL(entry?.baseUrl || entry?.catalogUrl).hostname.toLowerCase() || null; } catch { return null; }
}
/** A US listing reader over a set of front-page results (the committed ones by default). */
export function createUsListing({ results = frontPageResultList.results || [], hosts = frontPageHostSet } = {}) {
  const open = new Set(results.filter(frontPageOpen).map(result => result.host));
  const awaitsFrontPage = entry => {
    const host = catalogHostOf(entry);
    return Boolean(host) && hosts.has(host) && !open.has(host);
  };
  return function listing(entry) {
    if (!entry) return null;
    if (entry.country !== 'US') return 'outside-us';
    if (usRemoved.has(entry.id)) return 'removed';
    if (!usListed.has(entry.id)) return usWaiting.has(entry.id) ? 'waiting' : 'not-listed';
    if (usVerified.has(entry.id)) return 'verified';
    if (!usConnected.has(entry.id)) return 'legacy';
    return awaitsFrontPage(entry) ? 'front-page' : 'connected';
  };
}
/** A US library's listing: 'verified', 'connected' (a connected catalog
 * family's entry, not yet verified), 'legacy', 'removed', 'waiting' (not
 * offered yet, with a reason), 'front-page' (connected, but its host's
 * front-page result is not in yet or does not show it open) or
 * 'not-listed' (the last four resolve by ID only); 'outside-us' for any
 * other library. */
export const usListing = createUsListing();
/** The US listings that are offered when finding a library. */
export const US_OFFERED = Object.freeze(['legacy', 'verified', 'connected']);
const offered = entry => entry.country === 'IN' ? indiaListed.has(entry.id)
  : entry.country === 'US' ? US_OFFERED.includes(usListing(entry)) : true;
const listed = entries.filter(offered);
const indiaAuditOnly = new Set(indiaAllowlist.egranthalayaAuditOnly || []);
/** Why a library is offered when finding one: 'verified', 'egranthalaya-audit',
 * 'not-listed' (Indian, resolvable by ID only) or 'outside-india'. */
export function indiaListing(entry) {
  if (!entry) return null;
  if (entry.country !== 'IN') return 'outside-india';
  if (!indiaListed.has(entry.id)) return 'not-listed';
  return indiaAuditOnly.has(entry.id) ? 'egranthalaya-audit' : 'verified';
}
// One pace for every host name of one shared catalog (pre-release review, 24
// November 2026). The host gate (catalog-store/hostGate.js) and the
// per-instance concurrency limit (catalog-lookup/budget.js) count requests by
// host name, which already covers a shared catalog on one host (SHARE's 208
// members, C/W MARS's 159, PINES's 51, Monroe County's 20). A few US shared
// catalogs also give members a view of their own on another name of the same
// catalog (Minuteman's cambridge.minlib.net beside catalog.minlib.net, OSL's
// warwicklibrary.oslri.net beside catalog.oslri.net, the Nevada Library
// Cooperative's three): those names are paced as the catalog's main host
// (the one most members use; the first by name on a tie), so members on
// other names cannot add to the catalog's per-minute limit. Outside the US
// nothing changes.
function sharedPacing(list) {
  const groups = new Map();
  for (const entry of list) {
    if (entry.country !== 'US' || !entry.sharedCatalog) continue;
    let host;
    try { host = new URL(entry.baseUrl || entry.catalogUrl).host.toLowerCase(); } catch { continue; }
    const counts = groups.get(entry.sharedCatalog) || new Map();
    counts.set(host, (counts.get(host) || 0) + 1);
    groups.set(entry.sharedCatalog, counts);
  }
  const pacing = new Map();
  for (const counts of groups.values()) {
    if (counts.size < 2) continue;
    const [main] = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    for (const host of counts.keys()) if (host !== main && !pacing.has(host)) pacing.set(host, main);
  }
  return pacing;
}
const pacingHosts = sharedPacing(entries);
/** The host whose pace a request to `host` shares: a shared catalog's main host, else `host` itself (see above). */
export function pacingHostOf(host) {
  return pacingHosts.get(String(host || '').toLowerCase()) || host;
}
/** The host names paced as another (tests and the pre-release review). */
export function sharedPacingHosts() { return new Map(pacingHosts); }

export function getAllLibraries() { return entries; }
export function getListedLibraries() { return listed; }

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

export function searchLibraries(query, limit = 25, { pool = listed } = {}) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return [];
  return pool
    .filter((entry) => {
      const branchNames = (entry.branches || []).map((branch) => branch.name).join(' ');
      return [entry.name, entry.city, entry.region, entry.country, entry.address, branchNames, ...(entry.searchAliases || [])]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 50)))
    .map((entry) => publicLibrary(entry));
}

// Whole-directory variants, including Indian libraries left off the allowlist.
// For tests and tools that exercise adapters or place matching; the app's
// finding paths use the listed versions above and below.
export function searchAllLibraries(query, limit = 25) { return searchLibraries(query, limit, { pool: entries }); }
export function getAllLibrariesByRegion(country, region) { return getLibrariesByRegion(country, region, { pool: entries }); }
export function getLibrariesByRegion(country, region, { pool = listed } = {}) {
  const countryCode = String(country).toUpperCase();
  const regionName = String(region).trim().toLocaleLowerCase();
  return pool.filter((entry) => entry.country === countryCode
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
  return listed
    .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
    .map((entry) => ({ entry, distance: haversineKm(latitude, longitude, entry.lat, entry.lon) }))
    .filter(({ distance }) => distance <= NEARBY_CUTOFF_KM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, Math.min(Number(limit) || 25, 50)))
    .map(({ entry, distance }) => publicLibrary(entry, distance));
}

export { NEARBY_CUTOFF_KM };
