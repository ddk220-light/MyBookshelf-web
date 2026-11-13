// Place lookup is separate from library evidence: a geocoded city is a search
// center, never a newly verified library location. Queries are not written to
// platform logs; library-finder text goes only to the anonymous operational
// log (catalog-store/usageLog.js), when that log is enabled.
import { searchIndiaPlaces } from './indiaPlaces.js';
export function createPlaceSearch({ fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async ({ query, country }) => {
    const local = !country || country === 'IN' ? searchIndiaPlaces(query) : [];
    if (country === 'IN' || (!country && /\bIndia\b/i.test(query))) return local;
    const key = (country || '') + ':' + query.toLocaleLowerCase();
    const cached = cache.get(key);
    if (cached && cached.expires > now()) return cached.places;
    try {
      const url = new URL('https://photon.komoot.io/api/');
      url.search = new URLSearchParams({ q: query, limit: '6', lang: 'en' }).toString();
      if (country) url.searchParams.set('countrycode', country.toLowerCase());
      const response = await fetcher(url, { signal: AbortSignal.timeout(local.length ? 1500 : 6500), redirect: 'error',
        headers: { Accept: 'application/json', 'User-Agent': 'MyBookshelf/1.0 (https://mybookshelf.cloud/support)' } });
      if (!response.ok) throw new Error('Place service unavailable');
      const data = await response.json();
      const labels = new Set();
      const places = (Array.isArray(data.features) ? data.features : []).flatMap(feature => {
        const [lon, lat] = feature.geometry?.coordinates || [];
        const p = feature.properties || {};
        if (country && p.countrycode?.toUpperCase() !== country) return [];
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
        const label = [...new Set([p.name, p.postcode, p.city, p.state, p.country].filter(value => typeof value === 'string' && value.trim()))].join(', ').slice(0, 300);
        if (!label || labels.has(label.toLocaleLowerCase())) return [];
        labels.add(label.toLocaleLowerCase());
        return [{ id: `${p.osm_type || 'place'}:${p.osm_id || `${lat},${lon}`}`, label, lat, lon,
          country: p.countrycode?.toUpperCase(), region: p.state, district: p.county }];
      }).slice(0, 6);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      // India remains usable offline; unscoped names can also reveal foreign
      // namesakes. Avoid duplicate Indian places with different provider IDs.
      const combined = [...local, ...places.filter(place => !(local.length && place.country === 'IN'))];
      cache.set(key, { places: combined, expires: now() + 600_000 });
      return combined;
    } catch {
      if (local.length) return local;
      const error = new Error('Place search is unavailable. Search by library name or choose an area.');
      error.code = 'PLACE_SEARCH_UNAVAILABLE';
      throw error;
    }
  };
}
