import { getAllLibraries, haversineKm } from '../services/directory.js';
import { toPublicLibrary } from './directory.js';
import { searchableCatalog } from './catalog-method.js';
import { libraryLocations } from './locations.js';
import { canonicalDistrict, canonicalRegion, normalizePlaceName as normalized } from './geography.js';
import { indiaLibraryPlace, indiaPlaceById, indiaPlaceAttribution, libraryArea, libraryMatchesPostcode, nearestIndiaPlace, publicPlace } from './indiaPlaces.js';
import { PublicV2ValidationError } from './validation.js';

const inBounds = (point, bounds) => point.lat >= bounds.south && point.lat <= bounds.north
  && (bounds.west <= bounds.east ? point.lon >= bounds.west && point.lon <= bounds.east : point.lon >= bounds.west || point.lon <= bounds.east);
const compareNames = (a, b) => a.entry.name.localeCompare(b.entry.name) || a.entry.id.localeCompare(b.entry.id);
const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const counts = (rows, field) => Object.fromEntries(unique(rows.map(r => r[field])).map(name => [name, rows.filter(r => r[field] === name).length]));

export function createDiscoveryService({ entries = getAllLibraries } = {}) {
  const eligible = () => [...new Map(entries().filter(searchableCatalog).map(entry => [entry.id, entry])).values()];
  return {
    areas({ country, region } = {}) {
      const rows = eligible().map(entry => ({ ...entry, ...libraryArea(entry) }));
      const scoped = rows.filter(row => !country || row.country === country);
      const districts = scoped.filter(row => !region || row.region === canonicalRegion(region));
      return { countries: unique(rows.map(r => r.country)), regions: unique(scoped.map(r => r.region)), districts: unique(districts.map(r => r.district)),
        counts: { countries: counts(rows, 'country'), regions: counts(scoped, 'region'), districts: counts(districts, 'district') } };
    },
    search({ query = '', country, region, district, placeId, lat, lon, radiusKm = 25, bounds, offset = 0, limit = 25 } = {}) {
      const place = placeId ? indiaPlaceById(placeId) : null;
      if (placeId && !place) throw new PublicV2ValidationError('Unknown place');
      if (place) { lat = place.lat; lon = place.lon; }
      const words = normalized(query).split(' ').filter(Boolean);
      const nearby = Number.isFinite(lat) && Number.isFinite(lon);
      const indiaArea = nearby && (!country || country === 'IN') ? place || nearestIndiaPlace(lat, lon) : null;
      const rows = eligible().filter(entry => {
        const area = libraryArea(entry);
        return (!country || entry.country === country) && (!region || normalized(area.region) === normalized(canonicalRegion(region)))
          && (!district || normalized(area.district) === normalized(canonicalDistrict(district, region || area.region)));
      });
      const find = distance => rows.flatMap(entry => {
        const area = libraryArea(entry);
        const name = normalized(entry.name);
        const haystack = normalized([entry.name, entry.city, entry.district, area.city, area.district, area.region, entry.country,
          entry.address, ...(entry.searchAliases || []), ...(entry.branches || []).map(b => b.name)].join(' '));
        if (!words.every(word => haystack.includes(word))) return [];
        let locations = libraryLocations(entry);
        if (bounds) locations = locations.filter(point => inBounds(point, bounds));
        else if (nearby) locations = locations.filter(point => haversineKm(lat, lon, point.lat, point.lon) <= distance);
        if (nearby) locations.sort((a, b) => haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon));
        const reviewed = locations.filter(point => point.reviewed && ['branch', 'library', 'campus'].includes(point.precision));
        const locality = indiaArea && entry.country === 'IN' ? indiaLibraryPlace(entry) : null;
        const localityDistance = locality ? haversineKm(lat, lon, locality.lat, locality.lon) : Infinity;
        const localMatch = locality && (bounds ? inBounds(locality, bounds) : localityDistance <= distance);
        const postalMatch = libraryMatchesPostcode(entry, place);
        if ((nearby || bounds) && !locations.length && !localMatch && !postalMatch) return [];
        const point = reviewed[0];
        const distanceKm = nearby && point ? haversineKm(lat, lon, point.lat, point.lon) : undefined;
        const match = (nearby || bounds) ? point ? { scope: point.precision === 'campus' ? 'campus' : 'point', label: point.name }
          : localMatch ? { scope: locality.areaType === 'postcode' ? 'postcode' : 'locality', placeId: locality.id, label: (locality.areaType === 'postcode' ? 'Around ' : 'In ') + locality.name, city: locality.name }
          : postalMatch ? { scope: 'postcode', placeId: place.id, label: 'In ' + place.postcode }
          : { scope: 'area', label: area.city ? 'Around ' + area.city : area.region ? 'In ' + area.region : 'In this area' } : undefined;
        return [{ entry, locations, distanceKm, approximate: point?.precision === 'campus', match, rank: point ? 0 : 1,
          sortDistance: distanceKm ?? (localMatch ? localityDistance : locations.length && nearby ? haversineKm(lat, lon, locations[0].lat, locations[0].lon) : Infinity),
          score: name === normalized(query) ? 3 : name.startsWith(normalized(query)) ? 2 : 1 }];
      });
      let effectiveRadius = radiusKm, hits = find(effectiveRadius), districtFallback = false;
      if (indiaArea && !bounds) {
        for (const expanded of [50, 100]) {
          if (hits.length || effectiveRadius >= expanded) continue;
          effectiveRadius = expanded; hits = find(effectiveRadius);
        }
        if (!hits.length && indiaArea.district) {
          districtFallback = true;
          hits = rows.filter(entry => {
            const area = libraryArea(entry);
            return entry.country === 'IN' && normalized(area.region) === normalized(indiaArea.region) && normalized(area.district) === normalized(indiaArea.district)
              && words.every(word => normalized([entry.name, entry.address, ...(entry.searchAliases || [])].join(' ')).includes(word));
          }).map(entry => ({ entry, locations: [], rank: 2, sortDistance: Infinity, score: 1, match: { scope: 'district', label: 'In ' + indiaArea.district + ' district' } }));
        }
      }
      hits.sort((a, b) => nearby ? a.rank - b.rank || a.sortDistance - b.sortDistance || compareNames(a, b) : b.score - a.score || compareNames(a, b));
      const libraries = hits.slice(offset, offset + limit).map(({ entry, locations, distanceKm, approximate, match }) => ({ ...toPublicLibrary(entry), locations,
        ...(match ? { locationMatch: match } : {}), ...(distanceKm !== undefined ? { distanceKm: Math.round(distanceKm * 10) / 10, distanceApproximate: approximate } : {}) }));
      return { libraries, total: hits.length, nextOffset: offset + libraries.length < hits.length ? offset + libraries.length : null,
        ...((nearby || bounds) ? { nearby: true, ...(bounds ? {} : { radiusKm: effectiveRadius }) } : {}),
        ...(indiaArea ? { area: { ...publicPlace(indiaArea), scope: districtFallback ? 'district' : 'locality',
          label: districtFallback ? indiaArea.district + ' district, ' + indiaArea.region : publicPlace(indiaArea).label,
          requestedRadiusKm: radiusKm, radiusKm: effectiveRadius, expanded: effectiveRadius > radiusKm }, attribution: indiaPlaceAttribution } : {}),
        ...(!hits.length ? { empty: { reason: nearby ? 'no_local_coverage' : 'no_matches', canExpand: nearby && effectiveRadius < 100, canBrowseArea: true } } : {}) };
    },
  };
}
