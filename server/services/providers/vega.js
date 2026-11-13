import { cachedTask, request, DEFAULT_TIMEOUT_MS } from './http.js';
import { isbnMatches } from './contract.js';

const SEARCH_PATH = '/api/search-result/search/format-groups';
const AVAILABLE = new Set(['available', 'on shelf']);
const UNAVAILABLE = new Set(['checkedout', 'checked out', 'unavailable', 'not available']);

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function strings(value) {
  if (Array.isArray(value)) return value.flatMap(strings);
  return typeof value === 'string' ? [value] : [];
}

function isbnValues(record) {
  return [
    ...strings(record?.identifiers?.isbn),
    ...strings(record?.identifiedBy?.isbn),
  ];
}

function tabMatchesIsbn(tab, isbn, record) {
  return isbnValues(tab).some((candidate) => isbnMatches(candidate, isbn))
    || isbnValues(record).some((candidate) => isbnMatches(candidate, isbn));
}

function statusFor(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (AVAILABLE.has(normalized)) return 'available';
  if (UNAVAILABLE.has(normalized)) return 'unavailable';
  return 'unknown';
}

function tabStatus(tab) {
  return statusFor(tab?.availability?.status?.general || tab?.availabilityStatus);
}

function locationStatus(location) {
  return statusFor(location?.availabilityStatus);
}

function locationsFor(tabs) {
  const locations = new Map();
  for (const tab of tabs) {
    for (const location of Array.isArray(tab?.locations) ? tab.locations : []) {
      const name = typeof location?.label === 'string' ? location.label.trim() : '';
      if (!name) continue;
      const status = locationStatus(location);
      const previous = locations.get(name);
      // A branch can occur under multiple material groups. Keep the strongest
      // truthful observation rather than reducing it to an arbitrary first row.
      if (!previous || status === 'available' || previous.status === 'unknown') {
        locations.set(name, { name, status });
      }
    }
  }
  return [...locations.values()].slice(0, 30);
}

export function parseVegaAvailability(payload, isbn) {
  if (!payload || !Array.isArray(payload.data) || !Number.isInteger(payload.totalResults)) return null;
  if (payload.totalResults === 0) {
    return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
  }
  const record = payload.data.find((candidate) => {
    const tabs = Array.isArray(candidate?.materialTabs) ? candidate.materialTabs : [];
    return tabs.some((tab) => tabMatchesIsbn(tab, isbn, candidate));
  });
  if (!record) return null;

  const tabs = (Array.isArray(record.materialTabs) ? record.materialTabs : [])
    .filter((tab) => tabMatchesIsbn(tab, isbn, record));
  if (!tabs.length) return null;
  const statuses = tabs.map(tabStatus);
  const locations = locationsFor(tabs);
  // The ISBN is listed under this format group. Without a circulation status
  // for its tab (an eBook or eAudiobook says "CheckAvailability" and leaves
  // the answer to its vendor), the catalog still holds it: in the catalog,
  // copy status unknown. Searching an eBook's ISBN returns the whole group
  // (DC Public Library, captured 2026-11-13).
  const outcome = statuses.includes('available') || locations.some((location) => location.status === 'available')
    ? 'available'
    : statuses.some((status) => status === 'unavailable') || locations.some((location) => location.status === 'unavailable')
      ? 'none_available'
      : 'in_catalog';

  const physical = tabs.find((tab) => tab.type === 'physical') || tabs[0];
  return {
    outcome,
    matchKind: 'exact_isbn',
    recognizedExact: true,
    format: typeof physical?.name === 'string' ? physical.name : undefined,
    callNumber: typeof physical?.callNumber === 'string' ? physical.callNumber : undefined,
    locations,
  };
}

function configured(library) {
  const apiUrl = library?.baseUrl;
  const customerDomain = library?.vegaCustomerDomain;
  const hostDomain = library?.vegaHostDomain;
  if (!apiUrl || !customerDomain || !hostDomain) {
    throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Vega configuration is incomplete');
  }
  const url = new URL(SEARCH_PATH, apiUrl);
  if (url.protocol !== 'https:') throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Vega must use HTTPS');
  return { url: url.toString(), customerDomain, hostDomain };
}

export async function checkAvailability(library, isbn) {
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'Vega availability requires an ISBN');
  const { url, customerDomain, hostDomain } = configured(library);
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const key = `availability:vega:${library.id}:${isbn}`;
  return cachedTask(key, async () => {
    const response = await request(url, {
      method: 'POST',
      deadlineAt,
      maxResponseBytes: 1024 * 1024,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-version': '2',
        'iii-customer-domain': customerDomain,
        'iii-host-domain': hostDomain,
      },
      body: JSON.stringify({ searchText: isbn, searchType: 'everything', pageNum: 0, pageSize: 3 }),
    });
    if (!response.ok) throw providerError('CATALOG_UNAVAILABLE', `Vega returned HTTP ${response.status}`);
    let payload;
    try {
      payload = JSON.parse(response.text);
    } catch {
      throw providerError('CATALOG_UNRECOGNIZED', 'Vega returned non-JSON search data');
    }
    const result = parseVegaAvailability(payload, isbn);
    if (!result) throw providerError('CATALOG_UNRECOGNIZED', 'Vega response did not prove this ISBN availability');
    return result;
  }, { deadlineAt, shouldCache: (value) => value.outcome !== 'unknown' });
}
