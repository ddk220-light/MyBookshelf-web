import { getLibraryById, getLibrariesByRegion, searchLibraries } from '../services/directory.js';
import { PUBLIC_V2_CAPABILITY_KEYS, PUBLIC_V2_OPERATIONAL_HEALTH } from './contracts.js';
import { publicAttribution } from './attribution.js';
import { publicCatalogOrigin } from '../services/providers/publicCatalogOrigin.js';
import { kohaCatalogOrigin } from '../services/providers/kohaOrigin.js';
import { libraryLinks } from './libraryLinks.js';
import { libraryBranches } from './locations.js';
import { libraryArea } from './indiaPlaces.js';

function safeCatalogUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function configuredCapabilities(entry, linked, catalogUrl) {
  const routes = [entry, ...(entry?.alternateCatalogs || [])];
  const configs = routes.filter(isLinked).map(route => route.publicCatalogCapabilities || {});
  const configured = entry?.publicCatalogCapabilities || {};
  const result = {};
  for (const key of PUBLIC_V2_CAPABILITY_KEYS) result[key] = false;
  result.catalogLink = Boolean(catalogUrl) && configured.catalogLink !== false;
  if (!linked) return result;
  result.catalogLookup = configs.some(c => c.catalogLookup !== false);
  result.publicAvailability = configs.some(c => c.publicAvailability !== false);
  result.copyCounts = configs.some(c => c.copyCounts === true);
  result.locationAvailability = configs.some(c => c.locationAvailability === true);
  result.callNumber = configs.some(c => c.callNumber === true);
  result.titleSearch = routes.filter(isLinked).some(route => route.publicCatalogCapabilities?.titleSearch === true || route.publicCatalogSearch?.mode === 'inline' && route.publicCatalogSearch?.title === true);
  result.isbnLookup = configs.some(c => c.isbnLookup !== false);
  return result;
}

function isLinked(entry) {
  return entry?.platform !== 'catalog' && (entry?.publicCatalogValidated === true
    || entry?.publicCatalogMethodValidated === true || entry?.publicCatalogDemo === true
    || ['bc', 'bibliocommons'].includes(entry?.platform)) && hasSafeProviderOrigin(entry);
}

function hasSafeProviderOrigin(entry) {
  if (!entry?.baseUrl) return true;
  if (entry.platform === 'koha') return Boolean(kohaCatalogOrigin(entry) || publicCatalogOrigin(entry));
  try {
    const url = new URL(entry.baseUrl);
    return !url.username && !url.password && (url.protocol === 'https:' || Boolean(publicCatalogOrigin(entry)));
  } catch {
    return false;
  }
}

export function toPublicLibrary(entry) {
  if (!entry?.id || !entry?.name) return null;
  // A catalog link is browser navigation to the directory's configured site;
  // it is not a provider origin. HTTP provider reads require a separate reviewed
  // Koha origin pin; ordinary HTTP catalog links remain browser navigation.
  const preferred = entry.alternateCatalogs?.find(route => route.preferForLookup) || entry;
  const catalogUrl = safeCatalogUrl(preferred.catalogUrl || entry.catalogUrl);
  // BiblioCommons is the existing public provider implementation. The explicit
  // demo flag is for a bounded, transparent demonstration of a provider whose
  // current upstream health may be degraded (for example Cloudflare-blocked
  // Aspen). It never manufactures an availability outcome.
  const linked = [entry, ...(entry.alternateCatalogs || [])].some(isLinked);
  const health = !linked
    ? 'unknown'
    : (PUBLIC_V2_OPERATIONAL_HEALTH.includes(entry.publicCatalogHealth)
      ? entry.publicCatalogHealth
      : 'unknown');
  const result = {
    id: entry.id,
    name: String(entry.name),
    city: entry.city ? String(entry.city) : null,
    region: entry.region ? String(entry.region) : null,
    country: entry.country ? String(entry.country) : null,
    capabilities: configuredCapabilities(entry, linked, catalogUrl),
    health,
    ...libraryBranches(entry),
  };
  const area = libraryArea(entry);
  result.city = area.city || null;
  result.region = area.region || null;
  const selectionPath = libraryLinks.pathFor(entry.id);
  if (selectionPath) result.selectionPath = selectionPath;
  if (area.district) result.district = String(area.district);
  if (area.placeId) result.placeId = area.placeId;
  const searches = [entry, ...(entry.alternateCatalogs || [])].map(route => route.publicCatalogSearch).filter(Boolean);
  if (searches.length) result.search = { isbn: searches.some(s => s.isbn === true),
    title: searches.some(s => s.title === true), mode: searches.some(s => s.mode === 'inline') ? 'inline' : 'external' };
  if (catalogUrl) result.catalogUrl = catalogUrl;
  const attribution = publicAttribution(entry.attribution);
  if (attribution) result.attribution = attribution;
  if (typeof entry.publicAccessNote === 'string' && entry.publicAccessNote.trim()) {
    result.accessNote = entry.publicAccessNote.trim().slice(0, 500);
  }
  if (typeof entry.address === 'string' && entry.address.trim()) {
    result.address = entry.address.trim().slice(0, 500);
    if (['library', 'campus', 'locality'].includes(entry.addressScope)) result.addressScope = entry.addressScope;
    const addressSourceUrl = safeCatalogUrl(entry.addressSourceUrl);
    if (addressSourceUrl) result.addressSourceUrl = addressSourceUrl;
  }
  return result;
}

export function createPublicDirectoryService({
  findById = getLibraryById,
  search = searchLibraries,
  listByRegion = getLibrariesByRegion,
  links = libraryLinks,
} = {}) {
  return Object.freeze({
    search(query, limit) {
      // The legacy directory search projects rows. Resolve them again so this
      // service controls the only public v2 DTO shape.
      return search(query, limit)
        .map((library) => findById(library.id))
        .map(toPublicLibrary)
        .filter(Boolean);
    },
    resolve(libraryId) {
      return toPublicLibrary(findById(libraryId));
    },
    resolveSelection(slug) {
      const id = links.resolve(slug);
      const library = id && toPublicLibrary(findById(id));
      return library ? { ...library, selectionPath: links.pathFor(id) } : null;
    },
    browse({ country, region, offset, limit }) {
      const connected = listByRegion(country, region)
        .map(toPublicLibrary)
        .filter((library) => library && (library.capabilities.catalogLink || library.capabilities.publicAvailability))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const libraries = connected.slice(offset, offset + limit);
      const nextOffset = offset + libraries.length;
      return { libraries, total: connected.length, nextOffset: nextOffset < connected.length ? nextOffset : null };
    },
    entry(libraryId) {
      return findById(libraryId) || null;
    },
  });
}
