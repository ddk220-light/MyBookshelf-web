import { cachedTask, catalogOperation, getText, DEFAULT_TIMEOUT_MS } from './http.js';
import { publicCatalogOrigin } from './publicCatalogOrigin.js';
import { attrs, markupOnly, text } from './catalogHtml.js';
import { storesAvailability } from '../../catalog-store/policy.js';

// Aspen Discovery catalogs (USA plan step 5): one keyword search page per
// check, read as HTML (research item 7, 23 November 2026, Greenville County
// Library System, aspen.greenvillelibrary.org, Aspen 26.10, and the
// adapter's own live checks there; fixtures in server/test/fixtures/aspen/):
//
//   GET <catalog origin>/Search/Results?lookfor=<words>&searchIndex=Keyword&searchSource=local
//   -> 200 HTML: one result per grouped work (a work bundles its formats:
//      book, audiobook, large print, online...), each with its title link
//      (a.result-title), an author line where the catalog shows one, and one
//      related manifestation per format (data-format="Book", "Audiobook on
//      CD", "DVD"...); or the page "No Results Found".
//
// No cookie, session or second request, and never `/API/` or `/Search/AJAX`
// (Aspen's own robots.txt disallows both; editions and copy details live
// there and are never read). `Keyword` is Aspen's any-field index (the term
// is plain words: a title, or an ISBN's digits when no title is known);
// `searchSource=local` is "in Library Catalog" (not the website, events or
// WorldCat). One row per work and format: { recordId, title, authors,
// isbns: [], format, catalogUrl } (the results page shows no ISBNs; the record
// link is the work's own page, so the card lists each work once). The app
// answers found, not found or couldn't check only: availability labels,
// shelves and copy lines on the page are never read.
//
// Scope: the entry's own host (`baseUrl`). A consortium member with its own
// Aspen interface (cambridge.minlib.net, warwicklibrary.oslri.net) is
// searched there; a member known only through the consortium's catalog is
// searched there, and a find counts for the member (catalogScope 'shared').
//
// "No Results Found" on an Aspen page is "not found"; a wall (Cloudflare,
// Anubis, a proof-of-work page), 401/403/429, a redirect (never followed), a
// server error or a page the app cannot read is "couldn't check".

// The any-field index, and the catalog (not the website or WorldCat).
export const SEARCH_INDEX = 'Keyword';
export const SEARCH_SOURCE = 'local';
// A results page of 15 works was 221 KB (Greenville, research item 7).
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
// Walls and challenges, by the marks their vendors leave (as
// catalog-store/frontPageCheck.js reads them).
const CHALLENGE = /cf-chl-|\/cdn-cgi\/challenge-platform\/|window\._cf_chl_opt|<title>\s*(?:Just a moment|Attention Required|Making sure you)|within\.website\/x\/cmd\/anubis|anubis_version|id=["']anubis_|Making sure you(?:&#39;|')re not a bot|hashcash/i;
// An Aspen page: its search box (every Aspen page has one, results or none).
const ASPEN_PAGE = /<input\b[^>]*\bname=["']lookfor["']/i;
// Aspen's empty answer: the page heading (and breadcrumb) "No Results Found".
const NO_RESULTS = /<h1\b[^>]*>\s*No Results Found\s*<\/h1>/i;
// Where the results list ends: the purchase suggestion box, the pager, the side bar.
const AFTER_RESULTS = /<div\b[^>]*\bclass=["'][^"']*\b(?:materialsRequestLink|pagination|search_tools)\b|<div\b[^>]*\bid=["'](?:side-bar|footer-container|searchResultsPagination)["']/i;
const RECORD_ID = /^[A-Za-z0-9._-]{1,80}$/;

function catalogError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requestFailure(error) {
  if (/^CATALOG_/.test(error?.code || '')) return error;
  const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
  return Object.assign(catalogError(code, 'The Aspen catalog could not complete the search'), { cause: error });
}

/** The catalog origin of a directory entry (https only); throws when the entry is not usable. */
export function aspenSite(library) {
  const origin = publicCatalogOrigin(library);
  if (!origin) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'The Aspen catalog address is not configured');
  return { origin: origin.origin };
}

// Characters Aspen's search (Solr) reads as syntax (a field, a phrase, a
// range, NOT, a wildcard) become spaces, so a title is always plain words:
// "Oh, the Places You'll Go!" never asks for NOT, a typed "author: x" never
// becomes a field search, a word's leading "-" never excludes it. Words, and
// hyphens inside them, are kept as they are (as providers/tlc.js).
export function searchTerm(term) {
  return String(term || '').replace(/[\\+!():^[\]"{}~*?|&/<>=]/g, ' ').replace(/(^|\s)-+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** The one search's address. */
export function searchUrl(site, term) {
  const url = new URL('/Search/Results', site.origin);
  url.searchParams.set('lookfor', searchTerm(term));
  url.searchParams.set('searchIndex', SEARCH_INDEX);
  url.searchParams.set('searchSource', SEARCH_SOURCE);
  return url.toString();
}

const classes = value => String(value || '').split(/\s+/).filter(Boolean);
const hasClass = (tagAttrs, name) => classes(tagAttrs.class).includes(name);

// A result's own page on the catalog's host, without the search's query
// (searchId, recordIndex): /GroupedWork/<work>/Home or /Record/<id>.
function recordLink(href, site) {
  try {
    const url = new URL(href, site.origin);
    if (url.origin !== site.origin) return null;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}
function recordIdOf(url) {
  const match = url.pathname.match(/^\/(?:GroupedWork|Record)\/([^/]+)/i);
  let id = '';
  try { id = match ? decodeURIComponent(match[1]) : ''; } catch { id = ''; }
  return RECORD_ID.test(id) ? id : null;
}

// The author line of one result: the value div, never its "Author" label.
function authorOf(block) {
  for (const match of block.matchAll(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi)) {
    const tag = attrs(match[1]);
    if (hasClass(tag, 'result-author') && hasClass(tag, 'result-value')) return text(match[2]);
  }
  return '';
}

// The formats of one result, in the catalog's order, once each: one related
// manifestation per format (a grouped work's Book, Audiobook on CD, Large
// Print, Online Content...; a single record's DVD).
function formatsOf(block) {
  const formats = [];
  for (const match of block.matchAll(/<div\b([^>]*)>/gi)) {
    const tag = attrs(match[1]);
    const format = String(tag['data-format'] || '').replace(/\s+/g, ' ').trim();
    if (format && hasClass(tag, 'related-manifestation') && !formats.includes(format)) formats.push(format);
  }
  return formats;
}

/**
 * The rows of one results page: one per work and format, { recordId, title,
 * authors, isbns, format, catalogUrl, catalogLinkKind }, in the catalog's
 * order (a work's formats together). [] for Aspen's "No Results Found".
 * Throws when the page is not an Aspen answer, so that a page the app cannot
 * read is "couldn't check", never "not found".
 */
export function parseAspenSearch(html, site) {
  const markup = markupOnly(html);
  const anchors = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(match => hasClass(attrs(match[1]), 'result-title'));
  if (!anchors.length) {
    if (ASPEN_PAGE.test(markup) && NO_RESULTS.test(markup)) return [];
    throw catalogError('CATALOG_UNRECOGNIZED', 'The Aspen catalog did not answer with search results');
  }
  const last = anchors.at(-1);
  const endAt = markup.slice(last.index).search(AFTER_RESULTS);
  const end = endAt > 0 ? last.index + endAt : markup.length;
  const rows = anchors.flatMap((anchor, index) => {
    const title = text(anchor[2]);
    if (!title) return [];
    const block = markup.slice(anchor.index, index + 1 < anchors.length ? anchors[index + 1].index : end);
    const link = recordLink(attrs(anchor[1]).href || '', site);
    const recordId = link ? recordIdOf(link) : null;
    const author = authorOf(block);
    const base = {
      ...(recordId ? { recordId } : {}), title, authors: author ? [author] : [], isbns: [],
      ...(link ? { catalogUrl: link.toString(), catalogLinkKind: 'record' } : {}),
    };
    const formats = formatsOf(block);
    return formats.length ? formats.map(format => ({ ...base, format })) : [base];
  });
  // Results listed in a shape the app cannot read are not an empty answer either.
  if (!rows.length) throw catalogError('CATALOG_UNRECOGNIZED', 'The Aspen catalog listed results without titles');
  return rows;
}

async function search(site, term, deadlineAt) {
  let response;
  try {
    response = await getText(searchUrl(site, term), { deadlineAt, retries: 0, redirect: 'manual', maxResponseBytes: MAX_RESPONSE_BYTES });
  } catch (error) {
    throw requestFailure(error);
  }
  if ([401, 403, 429].includes(response.status) || CHALLENGE.test(response.text || '')) {
    throw catalogError('CATALOG_PROVIDER_BLOCKED', 'The Aspen catalog refused this public search');
  }
  // A catalog that moved is never followed: the failure is logged with its
  // reason (unavailable), and the directory entry is reviewed.
  if (response.status >= 300 && response.status < 400) throw catalogError('CATALOG_UNAVAILABLE', 'The Aspen catalog moved to another address');
  if (!response.ok) throw catalogError('CATALOG_UNAVAILABLE', `The Aspen catalog answered HTTP ${response.status}`);
  return parseAspenSearch(response.text, site);
}

/**
 * The one library search (libraryBookSearch.js): every row of one keyword
 * search of this library's Aspen catalog. Answers are cached only where the
 * catalog's policy allows storing (server/data/catalog-policies.json; Aspen
 * is live-only while its terms are unread); two readers asking at once still
 * share the request in flight.
 */
export async function librarySearch(library, term) {
  const site = aspenSite(library);
  const words = searchTerm(term);
  if (!words) throw catalogError('CATALOG_QUERY_UNSUPPORTED', 'Nothing to search for');
  const operation = catalogOperation();
  const deadlineAt = Number.isFinite(operation?.deadlineAt) ? operation.deadlineAt : Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`aspen:rows:${library.id}:${site.origin}:${words}`, () => search(site, words, deadlineAt),
    { deadlineAt, shouldCache: () => storesAvailability(library.id) });
}
