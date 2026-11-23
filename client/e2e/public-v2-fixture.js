export const LINKED_LIBRARY = Object.freeze({
  id: 'koha:anna-centenary-library',
  name: 'Anna Centenary Library',
  city: 'Chennai',
  region: 'Tamil Nadu',
  country: 'IN',
  catalogUrl: 'https://catalog.example.test/',
  health: 'operational',
  capabilities: {
    catalogLookup: true,
    publicAvailability: true,
    copyCounts: true,
    locationAvailability: true,
    callNumber: true,
    catalogLink: true,
  },
});

export const UNLINKED_LIBRARY = Object.freeze({
  id: 'directory:unlinked-library',
  name: 'Example Public Library',
  city: 'Chennai',
  region: 'Tamil Nadu',
  country: 'IN',
  catalogUrl: 'https://catalog.example.test/',
  health: 'unknown',
  capabilities: {
    catalogLookup: false,
    publicAvailability: false,
    copyCounts: false,
    locationAvailability: false,
    callNumber: false,
    catalogLink: true,
  },
});

export const BOOK = Object.freeze({
  bookKey: 'v1:isbn:9781625275868',
  isbn13: '9781625275868',
  title: 'The Innovator’s Dilemma',
  authors: ['Clayton M. Christensen'],
  coverUrl: 'https://books.google.com/books/content?id=example&printsec=frontcover&img=1&zoom=1',
  description: 'A public bibliographic description.',
  publisher: 'Harvard Business Review Press',
  publishedDate: '2016-10-04',
  pageCount: 288,
  subjects: ['Business & Economics'],
});

export const CANDIDATE_BOOK = Object.freeze({
  bookKey: 'v1:googlebooks:another-volume',
  title: 'The Innovator’s Solution',
  authors: ['Clayton M. Christensen'],
});

export const AVAILABILITY = Object.freeze({
  available: {
    outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh',
    availableCopies: 2, totalCopies: 3, callNumber: '658.4 CHR', format: 'Book',
    locations: [{ name: 'Main library', availableCopies: 2, totalCopies: 3 }],
    catalogUrl: 'https://catalog.example.test/record/123', catalogLinkKind: 'record',
    observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z',
  },
  noneAvailable: {
    outcome: 'none_available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh',
    availableCopies: 0, totalCopies: 3, catalogUrl: 'https://catalog.example.test/search?query=9781625275868', catalogLinkKind: 'search', observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z',
  },
  notFound: {
    outcome: 'not_found', lookupKind: 'exact_isbn', matchKind: 'none', freshness: 'fresh',
    catalogUrl: 'https://catalog.example.test/search?query=9781625275868', catalogLinkKind: 'search', observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z',
  },
  stale: {
    outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'stale',
    availableCopies: 2, totalCopies: 3, catalogUrl: 'https://catalog.example.test/search?query=9781625275868', catalogLinkKind: 'search', observedAt: '2026-08-02T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z', errorCode: 'CATALOG_TIMEOUT',
  },
  unknown: {
    outcome: 'unknown', lookupKind: 'title_author', matchKind: 'possible_match', freshness: 'none',
    catalogUrl: 'https://catalog.example.test/search?query=9781625275868', catalogLinkKind: 'search', attemptedAt: '2026-08-03T12:00:00.000Z', errorCode: 'CATALOG_UNRECOGNIZED',
  },
  unsupported: {
    outcome: 'unknown', lookupKind: 'exact_isbn', matchKind: null, freshness: 'none',
    catalogUrl: 'https://catalog.example.test/search?query=9781625275868', catalogLinkKind: 'search', attemptedAt: '2026-08-03T12:00:00.000Z', errorCode: 'CATALOG_UNSUPPORTED',
  },
});

function json(route, status, body) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installPublicV2Fixture(target, options = {}) {
  // Public fixtures represent an explicitly verified guest session. Account
  // journeys use the real local API harness instead of this fixture.
  await target.route('**/api/account/session', route=>route.fulfill({json:{status:'guest'}}));
  // Keep fixture-based journeys independent of third-party cover hosts.
  // Cover-specific tests register their own later route overrides.
  const missingCover = route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
  await target.route('https://covers.openlibrary.org/**', missingCover);
  await target.route('https://books.google.com/**', missingCover);
  const calls = [];
  const availability = options.availability || AVAILABILITY.available;
  await target.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace('/api/v2', '');
    const body = request.postDataJSON() || {};
    calls.push({ endpoint, body });
    if (endpoint === '/libraries/discover') return json(route, 200, { libraries: [LINKED_LIBRARY, UNLINKED_LIBRARY], total: 2, nextOffset: null });
    if (endpoint === '/places/search') return json(route, 200, { places: [{ id: 'geonames:1264527', label: 'Chennai, Chennai, Tamil Nadu, India', name: 'Chennai', country: 'IN', region: 'Tamil Nadu', district: 'Chennai', lat: 13.0878, lon: 80.2785, attribution: 'GeoNames' }] });
    if (endpoint === '/libraries/areas') return json(route, 200, { countries: ['IN'], regions: ['Tamil Nadu'], districts: ['Chennai'] });
    if (endpoint === '/libraries/search') return json(route, 200, { libraries: [LINKED_LIBRARY, UNLINKED_LIBRARY] });
    if (endpoint === '/libraries/resolve') {
      if (body.libraryId === LINKED_LIBRARY.id) return json(route, 200, { library: LINKED_LIBRARY });
      if (body.libraryId === UNLINKED_LIBRARY.id) return json(route, 200, { library: UNLINKED_LIBRARY });
      return json(route, 404, { error: { code: 'LIBRARY_NOT_FOUND', message: 'This library is not in the directory.' } });
    }
    if (endpoint === '/books/search') {
      if (body.query === '9781625275869') return json(route, 400, { error: { code: 'INVALID_REQUEST', message: 'Enter a valid ISBN or search by title or author.' } });
      if (body.query === '9780000000000') return json(route, 404, { error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } });
      if (/^9781625275868$/.test(body.query || '')) return json(route, 200, { kind: 'exact', book: BOOK });
      return json(route, 200, { kind: 'candidates', candidates: [BOOK, CANDIDATE_BOOK] });
    }
    if (endpoint === '/books/resolve') {
      if (body.bookKey === BOOK.bookKey) return json(route, 200, { book: BOOK });
      if (body.bookKey === CANDIDATE_BOOK.bookKey) return json(route, 200, { book: CANDIDATE_BOOK });
      return json(route, 404, { error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } });
    }
    if (endpoint === '/availability') {
      if (options.availabilityFailure) return json(route, 503, { error: { code: 'CATALOG_TIMEOUT', message: 'The public catalog is temporarily unavailable.' } });
      return json(route, 200, body.libraryId === UNLINKED_LIBRARY.id ? AVAILABILITY.unsupported : availability);
    }
    return json(route, 404, { error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } });
  });
  return { calls };
}
