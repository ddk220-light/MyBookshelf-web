import { cachedTask, catalogOperation, request, DEFAULT_TIMEOUT_MS } from './http.js';
import { publicCatalogOrigin } from './publicCatalogOrigin.js';
import { attrs } from './catalogHtml.js';
import { storesAvailability } from '../../catalog-store/policy.js';

// Apollo (Biblionix) catalogs (USA plan step 7): one keyword ("Search All
// Fields") search per check, as Apollo's own catalog page makes it, two plain
// requests with no cookie (research item 8, 23 November 2026, Clear Lake PL IA
// and Lawton PL OK, and the adapter's own live checks of 24 November 2026;
// fixtures in server/test/fixtures/apollo/):
//
//   1. GET  <catalog>/catalog/ajax_backend/search_setup.xml.pl?search=keyword:<plain words>
//           -> 200 <root search_id="N"></root>
//   2. POST <catalog>/catalog/ajax_backend/perform_search.xml.pl
//           {"search_id":N,"catalog_version":"<the catalog's version>"}
//           -> 200 <root ...><result matches="M" .../><s b=".." t=".." a=".." m=".." ms=".." e="..">
//              <ol id="0" o="1" ...>...</ol></s>...</root>
//
// The catalog version is the one the catalog's own script sends
// (`this.version` in its ApolloCatalog, '2026-01-16.01' on 23 November 2026).
// It is read, never assumed: the catalog page (/catalog/) names its script
// (/catalog/optimized/js-min_<hash>.js, the same on every Apollo host seen),
// and the script carries the version. A script's version never changes (its
// name is its content's hash), so the version of a script already read is
// kept (KNOWN_SCRIPTS: the one research item 8 read); the catalog page is read
// once a day per host on each server instance (VERSION_TTL_MS). When a
// version kept from earlier gets an answer the app cannot read, the page is
// read again and, if it names another script, the search is asked again with
// that script's version. The version is the catalog's software release, not
// book data.
//
// Rows: one per record (`b`, the catalog's biblio number; a record listed
// twice, once per shelf, is one row), { recordId, title, authors, isbns: [],
// format, catalogUrl }. Titles and authors are the catalog's attributes with
// their entities decoded and their soft hyphens (U+00AD) removed: Apollo puts
// them inside words ("To kil\u00adl a \u00admock\u00ading\u00adbird"), and the
// title rule would otherwise find nothing anywhere. The leading article (`l`)
// goes before the title as the catalog shows it. Format: the downloadable
// kind (`ms`: eBook, Audiobook, Magazine) when there is one, else the medium
// (`m`; empty is a print book, else large print, sound recording,
// videorecording...); an outside provider's title with no downloadable kind
// ranks with the e-books. A record is this library's when one of its holdings
// lists is the library's own and says it owns it (`<ol id="0" o="1">`), or
// when it comes from the library's outside provider (`e`, OverDrive's Libby
// and Bridges e-books and e-audiobooks, which Apollo's own page counts as the
// library's); other records are left out. Copy counts, shelves, call numbers
// and availability flags are never read: the app answers found, not found or
// couldn't check only. `matches="0"` is not found; 401/403/429, a challenge, a
// move to another address, a server error or an answer the app cannot read
// is couldn't check.
//
// The directory entry gives the catalog origin (`baseUrl`, https, the
// library's <name>.biblionix.com host) and, optionally, one of its branch
// numbers (`apolloBranchFilter`, from the catalog page's branch list), which
// limits the search to that branch as Apollo's own branch view does
// (`branches_filter`; Lawton, research item 8); no entry sets one, so a find
// anywhere in the library's catalog counts.

export const SEARCH_TYPE = 'keyword';
const SETUP_PATH = '/catalog/ajax_backend/search_setup.xml.pl';
const SEARCH_PATH = '/catalog/ajax_backend/perform_search.xml.pl';
const CATALOG_PATH = '/catalog/';
// The script research item 8 read on both hosts (23 November 2026), and its version.
export const KNOWN_SCRIPTS = Object.freeze({
  'js-min_b339e186697f4d584ac6d0a95d7ed00bf799625b85c44306b5967bb94b3b316e.js': '2026-01-16.01',
});
export const VERSION_TTL_MS = 24 * 60 * 60 * 1000;
const SCRIPT = /<script\b[^>]*\bsrc=["'](?:https:\/\/[a-z0-9.-]+)?\/catalog\/optimized\/(js-min_[0-9a-f]{16,128}\.js)["']/i;
const VERSION_FORM = /^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$/;
const BRANCH = /^\d{1,12}$/;
const RECORD = /^\d{1,15}$/;
// A results answer of 37 rows was 21 KB (Clear Lake); the catalog page 330-380 KB, its script 1.1 MB.
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_SCRIPT_BYTES = 4 * 1024 * 1024;
const CHALLENGE = /cf-chl-|\/cdn-cgi\/challenge-platform\/|window\._cf_chl_opt|<title>\s*(?:Just a moment|Attention Required|Making sure you)|within\.website\/x\/cmd\/anubis|anubis_version|id=["']anubis_|Making sure you(?:&#39;|')re not a bot|hashcash/i;

function catalogError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requestFailure(error) {
  if (/^CATALOG_/.test(error?.code || '')) return error;
  const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
  return Object.assign(catalogError(code, 'The Apollo catalog could not complete the search'), { cause: error });
}

/** The catalog origin and branch limit of a directory entry; throws when the entry is not usable. */
export function apolloSite(library) {
  const origin = publicCatalogOrigin(library);
  if (!origin) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'The Apollo catalog address is not configured');
  const branch = library.apolloBranchFilter ?? null;
  if (branch !== null && (typeof branch !== 'string' || !BRANCH.test(branch))) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid Apollo branch filter');
  return { origin: origin.origin, branch };
}

// Characters that could be read as syntax (a search type, "|" between
// searches, a phrase, a wildcard) become spaces, so a title is always plain
// words, as providers/polaris.js does; Apollo's own page drops "&" from a
// keyword search. Words, and hyphens and apostrophes inside them, are kept.
export function searchTerm(term) {
  return String(term || '').replace(/\u00ad/g, '').replace(/[\\+!():^[\]"{}~*?|&/<>=#%;,]/g, ' ').replace(/(^|\s)-+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** The first request: the search, as the catalog page's own search box sets it up. */
export function setupUrl(site, term) {
  return `${site.origin}${SETUP_PATH}?search=${encodeURIComponent(`${SEARCH_TYPE}:${searchTerm(term)}`)}`;
}

/** The second request's body: the search and the catalog's version (and the branch, where the entry names one). */
export function searchBody(searchId, version, branch = null) {
  return { search_id: searchId, catalog_version: version, ...(branch ? { branches_filter: branch } : {}) };
}

/** A record's own page, the link Apollo's own pages give a record (`?search_biblio=`). */
export function recordUrl(site, id) {
  return `${site.origin}${CATALOG_PATH}?search_biblio=${encodeURIComponent(id)}`;
}

// The catalog's text, as its page shows it: entities decoded (attrs), soft
// hyphens gone, spaces tidied.
const clean = value => String(value || '').replace(/&shy;/gi, '').replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();
// The leading article goes before the title as the catalog's own page puts it ("L'", "The ").
const fullTitle = (article, title) => {
  const lead = clean(article);
  const main = clean(title);
  if (!lead) return main;
  return main ? `${lead}${/'$/.test(lead) ? '' : ' '}${main}` : '';
};

/**
 * The rows of one perform_search answer: { recordId, title, authors, isbns,
 * format, catalogUrl, catalogLinkKind }, in the catalog's order. Throws when
 * the answer is not a search answer, so that an answer the app cannot read is
 * "couldn't check", never "not found".
 */
export function parseApolloResults(xml, site) {
  const body = String(xml || '');
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<root\b[^>]*>/.test(body) || !/<\/root>\s*$/.test(body)) {
    throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog did not answer with search results');
  }
  const counts = [...body.matchAll(/<result\b([^>]*?)\/?>/g)].map(match => attrs(match[1]).matches)
    .concat([...body.matchAll(/<final_count>\s*(\d+)\s*<\/final_count>/g)].map(match => match[1]));
  if (!counts.length || !counts.every(value => /^\d+$/.test(String(value)))) {
    throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog did not say how many records it found');
  }
  const records = [...body.matchAll(/<s\s([^>]*)>([\s\S]*?)<\/s>/g)];
  if (!records.length) {
    if (counts.every(value => Number(value) === 0)) return [];
    throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog counted records but listed none');
  }
  const seen = new Set();
  const rows = [];
  let readable = 0;
  for (const [, opening, inner] of records) {
    const record = attrs(opening);
    const id = String(record.b || '');
    const title = fullTitle(record.l, record.t);
    if (!RECORD.test(id) || !title) continue;
    readable += 1;
    // This library's own holdings list says it owns the record, or the record is its outside provider's.
    const own = [...inner.matchAll(/<ol\b([^>]*)>/g)].some(match => {
      const list = attrs(match[1]);
      return list.o === '1' && (list.id === undefined || list.id === '0');
    });
    const external = Boolean(clean(record.e));
    if (!own && !external) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const author = clean(record.a) || clean(record.ani);
    const format = clean(record.ms) || clean(record.m);
    rows.push({
      recordId: id, title, authors: author ? [author] : [], isbns: [],
      ...(format ? { format } : {}),
      // An outside provider's title with no downloadable kind is an e-book (its medium is the provider's name, "Libby").
      ...(external && !clean(record.ms) ? { formatKind: 'ebook' } : {}),
      catalogUrl: recordUrl(site, id), catalogLinkKind: 'record',
    });
  }
  // Records listed in a shape the app cannot read are not an empty answer.
  if (!readable) throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog listed records without titles');
  // Nor are records the app cannot read as this library's: every record of
  // research item 8's and the live answers is its own or its outside
  // provider's, so a list with none (a holdings list in another shape) is
  // couldn't check, never not found.
  if (!rows.length) throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog listed records the app could not read as this library\'s');
  return rows;
}

/** The search ID of a search_setup answer; throws when there is none. */
export function parseSearchId(xml) {
  const root = String(xml || '').match(/^\s*(?:<\?xml[^>]*\?>\s*)?<root\b([^>]*)>/);
  const id = root ? attrs(root[1]).search_id : '';
  if (!/^\d{1,15}$/.test(String(id || ''))) throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog did not set up the search');
  return Number(id);
}

/** The script a catalog page names (its file name), or null. */
export function scriptOf(html) {
  return String(html || '').match(SCRIPT)?.[1] || null;
}

/** The catalog version a catalog script sets (`this.version` in its ApolloCatalog), or null. */
export function versionOf(script) {
  const text = String(script || '');
  const at = text.search(/\bfunction\s+ApolloCatalog\s*\(/);
  if (at < 0) return null;
  const value = text.slice(at, at + 2000).match(/\bthis\.version\s*=\s*(['"])([^'"]{1,40})\1/)?.[2];
  return value && VERSION_FORM.test(value) ? value : null;
}

async function read(url, deadlineAt, options = {}) {
  let response;
  try {
    response = await request(url, { deadlineAt, retries: 0, redirect: 'manual', maxResponseBytes: MAX_RESPONSE_BYTES, ...options,
      headers: { 'Accept-Language': 'en-US,en;q=0.8', ...(options.headers || {}) } });
  } catch (error) {
    throw requestFailure(error);
  }
  if ([401, 403, 429].includes(response.status) || CHALLENGE.test(response.text || '')) {
    throw catalogError('CATALOG_PROVIDER_BLOCKED', 'The Apollo catalog refused this public search');
  }
  // A catalog that moved is never followed: the failure is logged with its
  // reason (unavailable), and the directory entry is reviewed.
  if (response.status >= 300 && response.status < 400) throw catalogError('CATALOG_UNAVAILABLE', 'The Apollo catalog moved to another address');
  if (!response.ok) throw Object.assign(catalogError('CATALOG_UNAVAILABLE', `The Apollo catalog answered HTTP ${response.status}`), { status: response.status });
  return response;
}

// Script name -> version, for every script read on this instance (a script's
// name is its content's hash). Host origin -> { version, script, at } for a
// day; one read at a time per host.
const scripts = new Map(Object.entries(KNOWN_SCRIPTS));
const versions = new Map();
const reading = new Map();

/** Forget the catalog versions read on this instance (tests). */
export function clearApolloVersions() {
  versions.clear();
  reading.clear();
  scripts.clear();
  for (const [name, version] of Object.entries(KNOWN_SCRIPTS)) scripts.set(name, version);
}

async function readVersion(site, deadlineAt) {
  const page = await read(`${site.origin}${CATALOG_PATH}`, deadlineAt, { headers: { Accept: 'text/html, application/xhtml+xml, */*' } });
  const script = scriptOf(page.text);
  if (!script) throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog page did not name its script');
  let version = scripts.get(script);
  if (!version) {
    const code = await read(`${site.origin}${CATALOG_PATH}optimized/${script}`, deadlineAt, { maxResponseBytes: MAX_SCRIPT_BYTES, headers: { Accept: '*/*' } });
    version = versionOf(code.text);
    if (!version) throw catalogError('CATALOG_UNRECOGNIZED', 'The Apollo catalog script did not give its version');
    scripts.set(script, version);
  }
  return { version, script };
}

/**
 * The catalog version for a host: `{ version, script, fresh }`, `fresh` when
 * it was read in this call. Kept for a day; `refresh` reads the page again.
 */
export async function catalogVersion(site, deadlineAt, { refresh = false, now = Date.now() } = {}) {
  const kept = versions.get(site.origin);
  if (!refresh && kept && now - kept.at < VERSION_TTL_MS) return { version: kept.version, script: kept.script, fresh: false };
  let pending = reading.get(site.origin);
  if (!pending) {
    pending = readVersion(site, deadlineAt).then(value => {
      versions.set(site.origin, { ...value, at: Date.now() });
      return value;
    }).finally(() => reading.delete(site.origin));
    reading.set(site.origin, pending);
  }
  return { ...await pending, fresh: true };
}

async function setUp(site, words, deadlineAt) {
  const response = await read(setupUrl(site, words), deadlineAt, { headers: { Accept: 'text/xml, application/xml, */*' } });
  return parseSearchId(response.text);
}

async function perform(site, searchId, version, deadlineAt) {
  const response = await read(`${site.origin}${SEARCH_PATH}`, deadlineAt, { method: 'POST',
    headers: { Accept: 'text/xml, application/xml, */*', 'Content-Type': 'application/json' },
    body: JSON.stringify(searchBody(searchId, version, site.branch)) });
  return parseApolloResults(response.text, site);
}

// An answer that may come from a version the catalog no longer runs: one it
// could not read, or an error status other than a refusal.
const mayBeStale = error => error?.code === 'CATALOG_UNRECOGNIZED' || (error?.code === 'CATALOG_UNAVAILABLE' && Number.isInteger(error.status));

async function search(site, words, deadlineAt) {
  const current = await catalogVersion(site, deadlineAt);
  const searchId = await setUp(site, words, deadlineAt);
  try {
    return await perform(site, searchId, current.version, deadlineAt);
  } catch (error) {
    if (current.fresh || !mayBeStale(error)) throw error;
    const next = await catalogVersion(site, deadlineAt, { refresh: true });
    if (next.version === current.version) throw error;
    return perform(site, searchId, next.version, deadlineAt);
  }
}

/**
 * The one library search (libraryBookSearch.js): every row of one keyword
 * search of this library's Apollo catalog. Answers are cached only where the
 * catalog's policy allows storing (server/data/catalog-policies.json: Apollo
 * allows it); two readers asking at once still share the request in flight.
 */
export async function librarySearch(library, term) {
  const site = apolloSite(library);
  const words = searchTerm(term);
  if (!words) throw catalogError('CATALOG_QUERY_UNSUPPORTED', 'Nothing to search for');
  const operation = catalogOperation();
  const deadlineAt = Number.isFinite(operation?.deadlineAt) ? operation.deadlineAt : Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`apollo:rows:${library.id}:${site.origin}:${site.branch || ''}:${words}`, () => search(site, words, deadlineAt),
    { deadlineAt, shouldCache: () => storesAvailability(library.id) });
}
