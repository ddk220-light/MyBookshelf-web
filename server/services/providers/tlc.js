import { cachedTask, catalogOperation, request, DEFAULT_TIMEOUT_MS } from './http.js';
import { publicCatalogOrigin } from './publicCatalogOrigin.js';
import { storesAvailability } from '../../catalog-store/policy.js';

// TLC (The Library Corporation) catalogs: LS2 PAC and CARL.X's CARL•Connect
// Discovery answer one JSON search call (US research item 1, 23 November
// 2026, Los Angeles PL and Frederick County PL, and the adapter's own live
// checks of 24 November 2026; fixtures in server/test/fixtures/tlc/):
//
//   POST <catalog origin>/search
//   Ls2pac-config-type: pac
//   Ls2pac-config-name: <the site's configuration, the landing page's `var config`>
//   { searchTerm, hitsPerPage, startIndex, sortCriteria, facetFilters,
//     branchFilters, dbCodes, searchedFromKids, frbrSearch }
//   -> 200 JSON { totalHits, resources: [{ id, shortTitle, shortAuthor,
//      format, standardNumbers, ... }] }
//
// No cookie, session or second request. The term is plain words, which the
// catalog searches in every field (its "AnyField" search; a field would be
// written into the term as `title:"..."`). One search per check, one page of
// rows in the catalog's relevance order, one row per record (`frbrSearch`
// false, so an e-book and a print book of one title are two rows). Copy-level
// holdings come with each row and are never read: the app answers found, not
// found or couldn't check only.
//
// The directory entry gives the catalog origin (`baseUrl`, https, or a
// reviewed http origin: providers/public-catalog-http-origins.json) and the
// site's configuration name (`tlcConfig`; DEFAULT_CONFIG where it could not be
// read: LAPL and Frederick answered an unknown name with their default
// configuration's rows, live check of 24 November 2026), and the product
// (`tlcProduct`, 'carl-connect' or 'ls2pac', for record links).
// `tlcConfigInLinks` puts the configuration in record links, as the
// library's own catalog links do (owl.tlcdelivers.com/?config=kpl). A member
// of a shared catalog can be limited to its own branches with
// `tlcBranchFilters` (identifiers from GET /branch/branchLimits): the catalog
// then lists the records held at those branches and keeps its e-books and
// e-audiobooks (Frederick, branch 4, live check of 24 November 2026: 47 of 64
// hits). Without it a find anywhere in the shared catalog counts for the
// member.

// The search the term is: plain words in every field.
export const SEARCH_FIELD = 'AnyField';
// One page of rows. The book itself was row 24 of 25 for "Diary of a Wimpy
// Kid" at LAPL (its series siblings all pass the title rule), so a page of 40
// as Koha's (koha.js) leaves room.
export const HITS_PER_PAGE = 40;
// The configuration CARL•Connect Discovery sites use by default (Frederick,
// Lexington, Loudoun, Monroe County NY), stored for a site whose own could
// not be read.
export const DEFAULT_CONFIG = 'default';
const CONFIG = /^[A-Za-z0-9_.-]{1,64}$/;
const BRANCH = /^[A-Za-z0-9_.-]{1,32}$/;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const CHALLENGE = /cf-chl-|challenge-platform|anubis[_-]challenge|<title>\s*(?:Just a moment|Making sure you|Attention Required)/i;

function catalogError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requestFailure(error) {
  if (/^CATALOG_/.test(error?.code || '')) return error;
  const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
  return Object.assign(catalogError(code, 'The TLC catalog could not complete the search'), { cause: error });
}

/** The catalog origin, configuration and branch limit of a directory entry; throws when the entry is not usable. */
export function tlcSite(library) {
  const origin = publicCatalogOrigin(library);
  if (!origin) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'The TLC catalog address is not configured');
  const config = library.tlcConfig ?? DEFAULT_CONFIG;
  if (!CONFIG.test(config)) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid TLC configuration name');
  const branches = library.tlcBranchFilters ?? [];
  if (!Array.isArray(branches) || !branches.every(value => typeof value === 'string' && BRANCH.test(value))) {
    throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid TLC branch filter');
  }
  return { origin: origin.origin, config, branches };
}

// Characters the catalog's query parser reads as syntax (a field, a phrase,
// a range, NOT, a wildcard) become spaces, so a title is always plain words:
// "Oh, the Places You'll Go!" never asks for NOT, a typed "author: x" never
// becomes a field search, a word's leading "-" never excludes it. Words, and
// hyphens inside them, are kept as they are.
export function searchTerm(term) {
  return String(term || '').replace(/[\\+!():^[\]"{}~*?|&/<>=]/g, ' ').replace(/(^|\s)-+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** The request body of the one search. */
export function searchBody(term, branches = []) {
  return { searchTerm: searchTerm(term), hitsPerPage: HITS_PER_PAGE, startIndex: 0, sortCriteria: 'Relevancy', facetFilters: [],
    branchFilters: [...branches], dbCodes: [], searchedFromKids: false, frbrSearch: false };
}

const text = value => (typeof value === 'string' ? value.trim() : '');
const isbnsOf = numbers => (Array.isArray(numbers) ? numbers : [])
  .filter(item => /isbn/i.test(String(item?.type || '')))
  .map(item => (String(item?.data || '').match(/[0-9][0-9-]{8,16}[0-9Xx]/) || [''])[0].replace(/-/g, ''))
  .filter(value => /^(?:\d{9}[\dXx]|\d{13})$/.test(value));

/**
 * A record's own page in the catalog, in the form the libraries' own sites
 * link: CARL•Connect Discovery reads the section from the query
 * (vcplcatalog.volusialibrary.org/?section=resource&resourceid=744619224),
 * LS2 PAC from the fragment (murray.tlcdelivers.com/#section=home,
 * owl.tlcdelivers.com/?config=kpl#section=home).
 */
export function recordUrl(site, id, { product = null, configInLinks = false } = {}) {
  const url = new URL('/', site.origin);
  if (configInLinks) url.searchParams.set('config', site.config);
  const section = `section=resource&resourceid=${encodeURIComponent(id)}`;
  if (product === 'carl-connect') url.search = `${url.search ? `${url.search}&` : '?'}${section}`;
  else url.hash = section;
  return url.toString();
}

/**
 * The rows of one search response: { recordId, title, authors, isbns,
 * format, catalogUrl, catalogLinkKind }, in the catalog's order. Throws when
 * the response is not a search answer, so that a page the app cannot read is
 * "couldn't check", never "not found".
 */
export function parseTlcSearch(json, site, options = {}) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.resources)) throw catalogError('CATALOG_UNRECOGNIZED', 'The TLC catalog did not answer with search results');
  const total = Number(json.totalHits);
  // The catalog counted records but listed none: not an empty answer.
  if (!json.resources.length && Number.isFinite(total) && total > 0) throw catalogError('CATALOG_UNRECOGNIZED', 'The TLC catalog counted records but listed none');
  const rows = json.resources.flatMap(row => {
    const title = text(row?.shortTitle) || text(row?.title);
    const id = row?.id ?? row?.resourceId;
    if (!title) return [];
    const author = text(row?.shortAuthor) || text(row?.author);
    const format = text(row?.format) || text(Array.isArray(row?.frbrFormats) ? row.frbrFormats[0] : '');
    const recordId = id === undefined || id === null || !/^[A-Za-z0-9_-]{1,40}$/.test(String(id)) ? null : String(id);
    return [{
      ...(recordId ? { recordId } : {}), title, authors: author ? [author] : [], isbns: isbnsOf(row?.standardNumbers),
      ...(format ? { format } : {}),
      ...(recordId ? { catalogUrl: recordUrl(site, recordId, options), catalogLinkKind: 'record' } : {}),
    }];
  });
  // Records listed in a shape the app cannot read are not an empty answer either.
  if (json.resources.length && !rows.length) throw catalogError('CATALOG_UNRECOGNIZED', 'The TLC catalog listed records without titles');
  // An empty list is not found only with the catalog's own count of 0 (every
  // live answer carries `totalHits`); without it, couldn't check.
  const counted = typeof json.totalHits === 'number' || (typeof json.totalHits === 'string' && /^\d+$/.test(json.totalHits)) ? Number(json.totalHits) : NaN;
  if (!json.resources.length && counted !== 0) throw catalogError('CATALOG_UNRECOGNIZED', 'The TLC catalog listed no records and gave no count');
  return rows;
}

async function search(library, site, term, deadlineAt) {
  const url = `${site.origin}/search`;
  let response;
  try {
    response = await request(url, { method: 'POST', deadlineAt, retries: 0, redirect: 'manual', maxResponseBytes: MAX_RESPONSE_BYTES,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Ls2pac-config-type': 'pac', 'Ls2pac-config-name': site.config },
      body: JSON.stringify(searchBody(term, site.branches)) });
  } catch (error) {
    throw requestFailure(error);
  }
  if ([401, 403, 429].includes(response.status) || CHALLENGE.test(response.text || '')) {
    throw catalogError('CATALOG_PROVIDER_BLOCKED', 'The TLC catalog refused this public search');
  }
  // A catalog that moved is never followed: the failure is logged with its
  // reason (unavailable), and the directory entry is reviewed.
  if (response.status >= 300 && response.status < 400) throw catalogError('CATALOG_UNAVAILABLE', 'The TLC catalog moved to another address');
  if (!response.ok) throw catalogError('CATALOG_UNAVAILABLE', `The TLC catalog answered HTTP ${response.status}`);
  let json;
  try { json = JSON.parse(response.text); } catch { throw catalogError('CATALOG_UNRECOGNIZED', 'The TLC catalog did not answer with JSON'); }
  return parseTlcSearch(json, site, { product: library.tlcProduct || null, configInLinks: library.tlcConfigInLinks === true });
}

/**
 * The one library search (libraryBookSearch.js): every row of one any-field
 * search of this library's TLC catalog. Answers are cached only where the
 * catalog's policy allows storing (server/data/catalog-policies.json; TLC is
 * live-only while its terms are unread); two readers asking at once still
 * share the request in flight.
 */
export async function librarySearch(library, term) {
  const site = tlcSite(library);
  const words = searchTerm(term);
  if (!words) throw catalogError('CATALOG_QUERY_UNSUPPORTED', 'Nothing to search for');
  const operation = catalogOperation();
  const deadlineAt = Number.isFinite(operation?.deadlineAt) ? operation.deadlineAt : Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`tlc:rows:${library.id}:${site.origin}:${site.config}:${site.branches.join(',')}:${words}`,
    () => search(library, site, words, deadlineAt), { deadlineAt, shouldCache: () => storesAvailability(library.id) });
}
