import { MAX_CHECK_MS } from '../libraryBookSearch.js';

// One descriptor per catalog platform (plan 5.1, 5.3, 5.4). Numbers are
// starting points to tune from the health record and the log.
//
// book:    the book page check (`lookupBook`): request cap and deadline.
// results: marking up to nine search results (`markResults`):
//   strategy 'search_rows'  one catalog search with the reader's query; a row
//                           marks a book only when it shows one of that
//                           work's ISBNs (rows without ISBNs mark nothing);
//            'batch_isbn'   one batch call with every result ISBN (Calil);
//            'per_isbn'     single-ISBN lookups for the top results;
//            'none'         no result marking: answers come when a book opens.
// hostConcurrency: lookups allowed at once per catalog host on one instance.
//   (providers/http.js already sends one request at a time per host.)
// minIntervalMs: spacing between successive requests of one lookup.
//
// `fewRequests` records whether nine results are covered in at most three
// catalog requests (plan 5.3, column 3), as confirmed against the adapters.
const S = 1000;

export const PLATFORMS = Object.freeze({
  egranthalaya: {
    // Member title/keyword search: GET form + POST search. Rows carry ISBNs
    // and are scoped to the member library.
    book: { maxRequests: 12, deadlineMs: 25 * S, configuredDeadline: true },
    results: { strategy: 'search_rows', maxRequests: 2, deadlineMs: 20 * S, fewRequests: 2 },
    hostConcurrency: 4, minIntervalMs: 1 * S,
  },
  libman: {
    // One TITLE search (JSON), tenant-scoped; rows carry ISBNs.
    book: { maxRequests: 8, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 4, minIntervalMs: 0,
  },
  indcat: {
    // Corrected from the plan: IndCat's institution-scoped search page lists
    // record links and titles only (parseIndcatSearch), never ISBNs, and costs
    // two requests (scope page + CSRF POST). Rows cannot prove an edition.
    book: { maxRequests: 8, deadlineMs: 20 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 2, minIntervalMs: 0,
  },
  koha: {
    // Keyword search page (count=40); rows carry an ISBN where the OPAC
    // template exposes cover data (Anna Centenary, Ernakulam fixtures).
    // Title-first libraries may try title, author and keyword indexes (3).
    // Libraries that opt in (`kohaRssRows`) use the RSS form, which lists an
    // ISBN per row. Unscoped shared catalogs and the IIT Hyderabad API do not
    // mark results: their rows do not prove this library's holding.
    book: { maxRequests: 12, deadlineMs: 20 * S, configuredDeadline: true },
    results: { strategy: 'search_rows', maxRequests: 3, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 2, minIntervalMs: 0,
  },
  bc: {
    // Gateway keyword search; rows carry `briefInfo.isbns`.
    book: { maxRequests: 4, deadlineMs: 15 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 10 * S, fewRequests: 1 },
    hostConcurrency: 4, minIntervalMs: 0,
  },
  vufind: {
    // Title search; rows carry COinS ISBNs.
    book: { maxRequests: 8, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 2, minIntervalMs: 0,
  },
  'discovery-community': {
    // Per site family; some rows carry ISBNs, session-based sites need more
    // than one request and therefore mark nothing within this budget.
    book: { maxRequests: 6, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 'partly' },
    hostConcurrency: 1, minIntervalMs: 0,
  },
  'discovery-academic': {
    book: { maxRequests: 6, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 'partly' },
    hostConcurrency: 1, minIntervalMs: 0,
  },
  calil: {
    // One /check call for every result ISBN, then polls every 2 s.
    book: { maxRequests: 15, deadlineMs: 30 * S },
    results: { strategy: 'batch_isbn', maxRequests: 15, deadlineMs: 30 * S, fewRequests: 1, isbnsPerBook: 3 },
    hostConcurrency: 2, minIntervalMs: 0,
  },
  vega: {
    book: { maxRequests: 2, deadlineMs: 10 * S },
    results: { strategy: 'per_isbn', maxRequests: 9, deadlineMs: 10 * S, fewRequests: false, topBooks: 9, concurrency: 2 },
    hostConcurrency: 2, minIntervalMs: 0,
  },
  evergreen: {
    book: { maxRequests: 3, deadlineMs: 15 * S },
    results: { strategy: 'per_isbn', maxRequests: 9, deadlineMs: 15 * S, fewRequests: false, topBooks: 3, concurrency: 1 },
    hostConcurrency: 1, minIntervalMs: 0,
  },
  chamo: {
    book: { maxRequests: 4, deadlineMs: 60 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0,
  },
  libsys: {
    book: { maxRequests: 4, deadlineMs: 30 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0,
  },
  aspen: {
    book: { maxRequests: 4, deadlineMs: 30 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0,
  },
  vpl: {
    // Title search only; rows never prove an edition. robots Crawl-Delay 20 s
    // is applied by the adapter.
    book: { maxRequests: 2, deadlineMs: 45 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 20 * S,
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

// Book page deadline. Libraries with a reviewed slower budget in the
// directory (`publicCatalogTimeoutMs`) keep it, never beyond 45 s.
export function bookDeadlineMs(entry, platform = platformFor(entry)) {
  const base = platform?.book.deadlineMs ?? 20 * S;
  const configured = Number(entry?.publicCatalogTimeoutMs);
  if (platform?.book.configuredDeadline && Number.isFinite(configured) && configured > 0) return Math.min(Math.max(base, configured), MAX_CHECK_MS);
  return Math.min(base, platform?.id === 'chamo' ? 60 * S : MAX_CHECK_MS);
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
