// No check may run past 45 s. Defined here, not in libraryBookSearch.js, so the
// public page build (which reads the directory) needs no catalog packages.
export const MAX_CHECK_MS = 45_000;

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
// minIntervalMs: spacing between successive requests to the host. Enforced
//   within one lookup by providers/http.js and across all readers and
//   instances by the host gate (catalog-store/hostGate.js), together with any
//   robots Crawl-delay.
// perMinute: requests per minute to the host across all readers and instances
//   (plan 5.4, "Across instances"), through the same host gate. Shared hosts
//   (e-Granthalaya, LIBMAN, IndCat, BiblioCommons, Calil) share one limit.
//   The gate paces at an even rate (60 s / perMinute between requests, after a
//   short burst), so each number is sized for one reader checking book after
//   book: the spacing times the book cap stays well inside the book deadline
//   (e.g. Koha 12 requests at 1.5 s, discovery 6 at 2 s, both within 20 s).
//
// `fewRequests` records whether nine results are covered in at most three
// catalog requests (plan 5.3, column 3), as confirmed against the adapters.
const S = 1000;

export const PLATFORMS = Object.freeze({
  egranthalaya: {
    // Member title search: a TITLE and an ALL search (each finds records the
    // other misses), POSTs built from the member's public form, which is kept
    // for ten minutes (a GET when it is not). Rows carry ISBNs and are scoped
    // to the member library. Each search takes 2 to 8 s on eg4.nic.in (19
    // November 2026); an ISBN check is one OR search of both spellings. +2
    // requests for a kept form the server no longer accepts.
    book: { maxRequests: 10, deadlineMs: 25 * S, configuredDeadline: true },
    results: { strategy: 'search_rows', maxRequests: 4, deadlineMs: 20 * S, fewRequests: 3 },
    hostConcurrency: 4, minIntervalMs: 1 * S, perMinute: 60,
  },
  libman: {
    // TITLE and ISBN searches (JSON), tenant-scoped, 0.3 to 1.3 s each. Search
    // rows carry no ISBN: a record's details (one request) add it, for up to
    // three rows of the searched title, and confirm an ISBN search's hits.
    // An ISBN costs two searches (plain and hyphenated digits; libraries store
    // either), so a work with six known ISBNs needs about 16 requests; 15 is
    // the most any platform may use.
    book: { maxRequests: 15, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 4, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 4, minIntervalMs: 0, perMinute: 120,
  },
  indcat: {
    // Corrected from the plan: IndCat's institution-scoped search page lists
    // record links, titles and authors (parseIndcatSearch), never ISBNs. Rows
    // cannot prove an edition. A search is one POST (the form session is read
    // once and reused, providers/indcat.js); both forms of an ISBN are one
    // search. A check is about one ISBN search per edition, up to three title
    // searches and the record pages they list (1 to 2 s each). 19 November
    // 2026: at 8, 25 of 70 checks ended on the cap (half of it scope pages);
    // at 12, slow moments (2 to 4 s a request) ran into the 20 s deadline
    // instead. 10 reads more title rows and still ends inside the deadline.
    book: { maxRequests: 10, deadlineMs: 20 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 40,
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
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 40,
  },
  bc: {
    // Gateway keyword search; rows carry `briefInfo.isbns`.
    book: { maxRequests: 4, deadlineMs: 15 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 10 * S, fewRequests: 1 },
    hostConcurrency: 4, minIntervalMs: 0, perMinute: 60,
  },
  vufind: {
    // Title search; rows carry COinS ISBNs.
    book: { maxRequests: 8, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 1 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 40,
  },
  'discovery-community': {
    // Per site family; some rows carry ISBNs, session-based sites need more
    // than one request and therefore mark nothing within this budget.
    book: { maxRequests: 6, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 'partly' },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 30,
  },
  'discovery-academic': {
    book: { maxRequests: 6, deadlineMs: 20 * S },
    results: { strategy: 'search_rows', maxRequests: 1, deadlineMs: 15 * S, fewRequests: 'partly' },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 30,
  },
  calil: {
    // One /check call for every result ISBN, then polls every 2 s.
    book: { maxRequests: 15, deadlineMs: 30 * S },
    results: { strategy: 'batch_isbn', maxRequests: 15, deadlineMs: 30 * S, fewRequests: 1, isbnsPerBook: 3 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 60,
  },
  vega: {
    book: { maxRequests: 2, deadlineMs: 10 * S },
    results: { strategy: 'per_isbn', maxRequests: 9, deadlineMs: 10 * S, fewRequests: false, topBooks: 9, concurrency: 2 },
    hostConcurrency: 2, minIntervalMs: 0, perMinute: 60,
  },
  evergreen: {
    book: { maxRequests: 3, deadlineMs: 15 * S },
    results: { strategy: 'per_isbn', maxRequests: 9, deadlineMs: 15 * S, fewRequests: false, topBooks: 3, concurrency: 1 },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 20,
  },
  chamo: {
    book: { maxRequests: 4, deadlineMs: 60 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 10,
  },
  libsys: {
    book: { maxRequests: 4, deadlineMs: 30 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 10,
  },
  aspen: {
    book: { maxRequests: 4, deadlineMs: 30 * S },
    results: { strategy: 'none', maxRequests: 0, deadlineMs: 0, fewRequests: false },
    hostConcurrency: 1, minIntervalMs: 0, perMinute: 10,
  },
  vpl: {
    // Title search only; rows never prove an edition. robots Crawl-Delay 20 s
    // is applied by the adapter.
    book: { maxRequests: 2, deadlineMs: 45 * S },
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

// Plan A2, step 3: a book-page check still running at its deadline may finish
// in the background, with the same request cap, until twice its deadline and
// never later than 90 s after it started (the API function may run 120 s).
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
