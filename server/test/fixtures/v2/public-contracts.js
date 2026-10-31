export const PUBLIC_V2_FIXTURES = Object.freeze({
  librarySearch: {
    request: { query: 'chennai' },
    supported: {
      id: 'koha:anna-centenary-library',
      name: 'Anna Centenary Library',
      city: 'Chennai',
      region: 'Tamil Nadu',
      country: 'India',
      capabilities: {
        catalogLookup: true,
        isbnLookup: true,
        titleSearch: false,
        publicAvailability: true,
        copyCounts: true,
        locationAvailability: false,
        callNumber: true,
        catalogLink: true,
      },
      health: 'operational',
    },
    unsupported: {
      id: 'directory:unlinked-library',
      name: 'Example Public Library',
      city: 'Chennai',
      region: 'Tamil Nadu',
      country: 'India',
      capabilities: {
        catalogLookup: false,
        isbnLookup: false,
        titleSearch: false,
        publicAvailability: false,
        copyCounts: false,
        locationAvailability: false,
        callNumber: false,
        catalogLink: true,
      },
      health: 'unknown',
    },
  },
  books: {
    isbnExact: {
      request: { query: '9781625275868' },
      result: {
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
        rating: { average: 4.0, count: 10 },
      },
    },
    titleAuthor: {
      request: { query: 'innovator dilemma christensen' },
      candidates: ['v1:isbn:9781625275868', 'v1:openlibrary:OL12345W'],
    },
    invalid: { request: { query: '9781625275869' }, errorCode: 'INVALID_REQUEST' },
    notFound: { request: { query: '9780000000000' }, errorCode: 'BOOK_NOT_FOUND' },
    unavailable: { request: { query: '9781625275868' }, errorCode: 'METADATA_UNAVAILABLE' },
  },
  availability: {
    available: {
      outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh',
      availableCopies: 2, totalCopies: 3, observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z',
    },
    noneAvailable: {
      outcome: 'none_available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'fresh',
      availableCopies: 0, totalCopies: 3, observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z',
    },
    verifiedNotFound: {
      outcome: 'not_found', lookupKind: 'exact_isbn', matchKind: 'none', freshness: 'fresh',
      observedAt: '2026-08-03T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z',
    },
    possibleMatch: {
      outcome: 'unknown', lookupKind: 'title_author', matchKind: 'possible_match', freshness: 'none',
      attemptedAt: '2026-08-03T12:00:00.000Z', errorCode: 'CATALOG_UNRECOGNIZED',
    },
    timeout: {
      outcome: 'unknown', lookupKind: 'exact_isbn', matchKind: null, freshness: 'none',
      attemptedAt: '2026-08-03T12:00:00.000Z', errorCode: 'CATALOG_TIMEOUT',
    },
    stale: {
      outcome: 'available', lookupKind: 'exact_isbn', matchKind: 'exact_isbn', freshness: 'stale',
      availableCopies: 2, totalCopies: 3, observedAt: '2026-08-02T12:00:00.000Z', attemptedAt: '2026-08-03T12:00:00.000Z', errorCode: 'CATALOG_TIMEOUT',
    },
  },
  appLinks: {
    configured: {
      ios: 'https://apps.apple.com/app/id1234567890',
      android: 'https://play.google.com/store/apps/details?id=com.example.mybookshelf',
    },
    missing: { ios: null, android: null },
    invalid: {
      ios: 'http://example.com/app',
      android: 'https://example.com/android',
    },
  },
});
