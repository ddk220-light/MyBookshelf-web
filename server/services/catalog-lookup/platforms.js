// Every library's book check may run up to 45 s (owner decision, 19 November
// 2026: one longer deadline for all, not per slow host). It is a ceiling: a
// check ends as soon as the catalog has answered. The API function may run
// 120 s (vercel.json `maxDuration`); the reader is answered by about 60 s
// (public-v2/holdings.js) and a check still running then may finish in the
// background until 90 s (MAX_BACKGROUND_CHECK_MS), inside that limit.
// Defined here, not in libraryBookSearch.js, so the public page build (which
// reads the directory) needs no catalog packages.
export const MAX_CHECK_MS = 45_000;
export const BOOK_DEADLINE_MS = MAX_CHECK_MS;
// One catalog request in a book check gives up after 30 s. Retries share the
// same check deadline (providers/http.js).
export const REQUEST_TIMEOUT_MS = 30_000;

// One descriptor per catalog platform (plan 5.1, 5.3, 5.4). Numbers are
// starting points to tune from the health record and the log.
//
// book:    the book page check (`lookupBook`): its deadline (45 s everywhere,
//          BOOK_DEADLINE_MS; CHAMO keeps its reviewed 60 s). It is the one
//          library search (libraryBookSearch.js, owner decision 20 November
//          2026): one `provider.search(term)` request, no request cap beyond
//          that, every request waiting for the host's shared pacing below
//          (`perMinute`, the global cap).
// results: marking up to twelve search results (`markResults`), work the app
//          starts on its own for a list of books, keeps its request cap:
//   strategy 'search'       the same one library search with the reader's
//                           typed text (shared rows cache), and the same
//                           title matcher for each listed book;
//            'batch_isbn'   one batch call with every result ISBN (Calil);
//            'per_isbn'     single-ISBN lookups for the top results;
//            'none'         no result marking: answers come when a book opens.
//   (The ISBN-only catalogs keep batch_isbn / per_isbn / none.)
// hostConcurrency: lookups allowed at once per catalog host on one instance.
// minIntervalMs: spacing between successive requests to the host. Enforced
//   within one lookup by providers/http.js and across all readers and
//   instances by the host gate (catalog-store/hostGate.js), together with any
//   robots Crawl-delay.
// perMinute: requests per minute to the host across all readers and instances
//   (plan 5.4, "Across instances"), through the same host gate. Shared hosts
//   (e-Granthalaya, LIBMAN, IndCat, BiblioCommons, Calil) share one limit.
//   The gate paces at an even rate (60 s / perMinute between requests, after a
//   short burst). A check waits for its turn within its deadline; only when
//   the host's next turn is past that deadline does it stop as "busy".
//
// `fewRequests` records whether nine results are covered in at most three
// catalog requests (plan 5.3, column 3), as confirmed against the adapters.
const S = 1000;

export const PLATFORMS = Object.freeze({
  egranthalaya: {
    // One member-scoped ALL search, a POST built from the member's public
    // form, which is kept for ten minutes (a GET when it is not). 2 to 8 s on
    // eg4.nic.in (19 November 2026). +2 requests for a kept form the server
    // no longer accepts.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 4, deadlineMs: 20 * S, fewRequests: 2 },
    hostConcurrency: 4, minIntervalMs: 1 * S, perMinute: 60,
  },
  libman: {
    // One tenant-scoped TITLE search (a JSON GET, no session), 0.3 to 1.3 s.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 4, minIntervalMs: 0, perMinute: 120,
  },
  indcat: {
    // One institution-scoped all-fields search, a POST (the form session is
    // read once and reused, providers/indcat.js). Rows list record links,
    // titles and authors. 1 to 2 s.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 2, deadlineMs: 15 * S, fewRequests: 2 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 40,
  },
  koha: {
    // One keyword (any-field) search page, count=40, limited to the branch
    // where the directory names one (not the unscoped shared catalogs). A
    // search Koha answers with a single record redirects to it: that page is
    // read as the search's one row (2 requests). The IIT Hyderabad API is
    // ISBN-only and marks nothing.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 2, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 40,
  },
  bc: {
    // Gateway keyword search.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 1, deadlineMs: 10 * S, fewRequests: 1 },
    hostConcurrency: 4, minIntervalMs: 0, perMinute: 60,
  },
  vufind: {
    // AllFields search, filtered to the institution (and building).
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 40,
  },
  'discovery-community': {
    // Per site family; session-based sites need more than one request on a
    // cold session and therefore mark nothing within this budget.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 'partly' },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 30,
  },
  'discovery-academic': {
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'search', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 'partly' },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 30,
  },
  calil: {
    // One /check call for every result ISBN, then polls every 2 s.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'batch_isbn', maxRequests: 15, deadlineMs: 30 * S, fewRequests: 1, isbnsPerBook: 3 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 60,
  },
  vega: {
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'per_isbn', maxRequests: 9, deadlineMs: 10 * S, fewRequests: false, topBooks: 9, concurrency: 2 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 60,
  },
  evergreen: {
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'per_isbn', maxRequests: 9, deadlineMs: 15 * S, fewRequests: false, topBooks: 3, concurrency: 1 },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 20,
  },
  chamo: {
    book: { deadlineMs: 60 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 10,
  },
  libsys: {
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 10,
  },
  aspen: {
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 10,
  },
  vpl: {
    // Title search only. robots Crawl-Delay 20 s is applied by the adapter;
    // too slow to mark results.
    book: { deadlineMs: BOOK_DEADLINE_MS },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 20 * S, perMinute: 3,
  },
});

const ALIASES = { bibliocommons: 'bc' };

export function platformId(entry) {
  const id = ALIASES[entry?.platform] || entry?.platform;
  return Object.hasOwn(PLATFORMS, id) ? id : null;
}

// `table` lets a caller tune descriptors (tests, or later the health record).
export function platformFor(entry, table = PLATFORMS) {
  const id = platformId(entry);
  return id && table[id] ? { id, ...table[id] } : null;
}

const SHARED_HOSTS = {
  egranthalaya: 'eg4.nic.in',
  libman: 'libcloud.mastersofterp.in',
  indcat: 'indcat.inflibnet.ac.in',
  bc: 'gateway.bibliocommons.com',
  calil: 'api.calil.jp',
};

/** The shared catalog host a platform's checks are sent to (BiblioCommons' gateway, ...), or null. */
export function sharedHostFor(entry) {
  return SHARED_HOSTS[platformId(entry)] || null;
}

// "Host" is the provider origin, so libraries on one shared host share one
// circuit and one concurrency limit.
export function hostFor(entry) {
  const id = platformId(entry);
  if (SHARED_HOSTS[id]) return SHARED_HOSTS[id];
  for (const value of [entry?.baseUrl, entry?.catalogUrl]) {
    try { if (value) return new URL(value).host; } catch { /* try the next address */ }
  }
  return `${id || 'unknown'}:${entry?.id || entry?.slug || 'library'}`;
}

// Book page deadline: the platform's (45 s; CHAMO 60 s). A directory entry's
// `publicCatalogTimeoutMs` no longer changes it: every library has the
// longer deadline (it still bounds a Koha adapter call, providers/koha.js).
export function bookDeadlineMs(entry, platform = platformFor(entry)) {
  const base = platform?.book.deadlineMs ?? BOOK_DEADLINE_MS;
  return Math.min(base, platform?.id === 'chamo' ? 60 * S : MAX_CHECK_MS);
}

// Plan A2, step 3: a book-page check still running at its deadline may finish
// in the background (the same check for the same book, no request cap, the
// same shared host pacing), until twice its deadline and never later than
// 90 s after the reader asked (the API function may run 120 s). It does not
// fan out: one book, one library, and it gives way to a waiting reader.
export const MAX_BACKGROUND_CHECK_MS = 90 * S;
export function backgroundDeadlineMs(entry, platform = platformFor(entry)) {
  return Math.min(2 * bookDeadlineMs(entry, platform), MAX_BACKGROUND_CHECK_MS);
}

// CATALOG_LOOKUP_V2: comma-separated platform IDs, or `all`. Unset means the
// old path everywhere.
export function lookupV2Platforms(env = process.env) {
  const raw = String(env?.CATALOG_LOOKUP_V2 || '').trim().toLowerCase();
  if (!raw) return new Set();
  if (raw === 'all') return new Set(Object.keys(PLATFORMS));
  return new Set(raw.split(',').map(value => ALIASES[value.trim()] || value.trim()).filter(value => Object.hasOwn(PLATFORMS, value)));
}

export function lookupV2Enabled(entry, env = process.env) {
  const id = platformId(entry);
  return Boolean(id) && lookupV2Platforms(env).has(id);
}
