import { cachedTask, catalogOperation, request, DEFAULT_TIMEOUT_MS } from './http.js';
import { publicCatalogOrigin } from './publicCatalogOrigin.js';
import { attrs, decode, markupOnly, text } from './catalogHtml.js';
import { storesAvailability } from '../../catalog-store/policy.js';

// Polaris PowerPAC catalogs (USA plan step 6): one keyword search per check,
// a short chain of plain GETs sharing one anonymous session (research item 4,
// 23 November 2026, Denver PL 8.0 and Fairfax County PL 8.1, and the
// adapter's own live checks of 24 November 2026; fixtures in
// server/test/fixtures/polaris/):
//
//   1. GET <catalog><path>/search/searchresults.aspx?ctx=<ctx>&type=Keyword&term=<words>&by=KW&sort=RELEVANCE&limit=TOM=*&query=&page=0
//      -> 302 to /process.search?cmd=FIND&url=...&vhc=<the server's hash>, setting the session cookie
//   2. GET that address with the cookie  -> 302 to the results page (searchid=1)
//   3. GET the results page               -> 200: the hit count and facets, no rows; or "No titles found (0 hits)"
//   4. GET <its root>search/components/ajaxResults.aspx?page=1&hpp=50
//                                         -> 200: the rows ("1 - 10 of 14"), as the page's own script asks
//
// The cookie jar lives for one check and holds only what this catalog set
// (ASP.NET_SessionId, OrgID, its anti-forgery token); nothing is kept after
// the check. The session must carry through: the server's hash (vhc) is tied
// to the session that started the search, and a request in another session
// answers "0 hits" (Fairfax, research item 4: the cold process.search). So a
// chain whose session changes, or that never gets one, is "couldn't check",
// never "not found". Redirects are followed only on the catalog's own origin,
// each one read by the app's robots policy like every request (a redirect to
// a path robots.txt disallows stops the check: the adapter never steps round
// a rule). The term is plain words, every format (`limit=TOM=*`): the card's
// ranking orders formats. Rows: { recordId, title, authors, isbns, format,
// catalogUrl } with the format as the catalog's own icon label (Book, Ebook,
// Eaudiobook, Large Print, Playaway...), the ISBN from the row's cover image,
// and the record's own page (search/title.aspx?ctx=&cn=) without the search
// position. Copy counts, holds, call numbers and shelves on the page are never
// read: the app answers found, not found or couldn't check only. "No titles
// found" on the results page is not found, except for an ISBN term (a keyword
// index need not hold ISBNs: Fairfax's does not); a wall, 401/403/429, a move
// to another host, a server error or a page the app cannot read is couldn't
// check.
//
// The directory entry gives the catalog origin (`baseUrl`, https), the path
// its own pages link (`polarisPath`: '' where the PowerPAC is at the site
// root, as Denver, Fairfax, Carroll County and SHARE; '/polaris', PowerPAC's
// default, elsewhere) and the site's context (`polarisCtx`, as its own links
// carry it; the server substitutes its own profile where it differs).
// Scope: no organisation codes are published (research item 6), so a find in
// a shared catalog (SHARE, Roanoke Valley, Central Library Consortium...)
// counts for the member.

export const SEARCH_TYPE = 'Keyword';
export const SEARCH_BY = 'KW';
// Every format: the card ranks books first and films and music last.
export const FORMAT_LIMIT = 'TOM=*';
// One page of rows: the page's own "per page" choices are 10, 20, 30, 50 and
// 100 (results.js); a long series can put the book itself far down the list.
export const HITS_PER_PAGE = 50;
// The context PowerPAC's own links carry when the site sets none of its own
// (organisation 1, the system; language 1033, English).
export const DEFAULT_CTX = '1.1033.0.0.1';
export const DEFAULT_PATH = '/polaris';
const PATHS = new Set(['', '/polaris']);
const CTX = /^\d{1,6}\.\d{4}\.\d{1,3}\.\d{1,3}\.\d{1,4}$/;
// A results page of 10 rows was 92 KB (Denver); 50 rows stay well inside this.
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const SESSION_COOKIE = 'ASP.NET_SessionId';
const CHALLENGE = /cf-chl-|\/cdn-cgi\/challenge-platform\/|window\._cf_chl_opt|<title>\s*(?:Just a moment|Attention Required|Making sure you)|within\.website\/x\/cmd\/anubis|anubis_version|id=["']anubis_|Making sure you(?:&#39;|')re not a bot|hashcash/i;
// The results page with no hits: "No titles found (0 hits)" (Fairfax 8.1).
const NO_HITS = /No titles found|\(0 hits\)/i;
// The results page that loads its rows: ajaxLoadResultsPage(1, ...) (Denver 8.0, Fairfax 8.1).
const LOADS_ROWS = /ajaxLoadResultsPage\s*\(\s*1\b/;
// A PowerPAC results page: its own markup (the page class, the results container).
const POWERPAC = /\bpage-searchresults\b|id=["']searchResults(?:DIV)?["']|search-results__/i;
const RESULT_COUNT = /(\d[\d,]*)\s*-\s*(\d[\d,]*)\s+of\s+(\d[\d,]*)/;
const RECORD_ID = /^\d{1,12}$/;
const ISBN = /^(?:\d{9}[\dX]|97[89]\d{10})$/;
const ISBN_TERM = /^(?:\d{9}[\dXx]|97[89]\d{10})$/;

function catalogError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requestFailure(error) {
  if (/^CATALOG_/.test(error?.code || '')) return error;
  const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
  return Object.assign(catalogError(code, 'The Polaris catalog could not complete the search'), { cause: error });
}

/** The catalog origin, path and context of a directory entry; throws when the entry is not usable. */
export function polarisSite(library) {
  const origin = publicCatalogOrigin(library);
  if (!origin) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'The Polaris catalog address is not configured');
  const path = library.polarisPath ?? DEFAULT_PATH;
  if (!PATHS.has(path)) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid Polaris catalog path');
  const ctx = library.polarisCtx ?? DEFAULT_CTX;
  if (!CTX.test(ctx)) throw catalogError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid Polaris catalog context');
  return { origin: origin.origin, path, ctx };
}

// Characters that could be read as syntax (a field, a phrase, a range, a
// wildcard) become spaces, so a title is always plain words (as
// providers/tlc.js and aspen.js): "Oh, the Places You'll Go!" is its words.
export function searchTerm(term) {
  return String(term || '').replace(/[\\+!():^[\]"{}~*?|&/<>=#%;,]/g, ' ').replace(/(^|\s)-+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** The first request's address: a keyword search of every format, as the site's own search links make it. */
export function searchUrl(site, term) {
  const query = [`ctx=${site.ctx}`, `type=${SEARCH_TYPE}`, `term=${encodeURIComponent(searchTerm(term))}`, `by=${SEARCH_BY}`, 'sort=RELEVANCE',
    `limit=${FORMAT_LIMIT}`, 'query=', 'page=0'].join('&');
  return `${site.origin}${site.path}/search/searchresults.aspx?${query}`;
}

/** The rows' address beside a results page: its own root's search/components/ajaxResults.aspx. */
export function rowsUrl(resultsUrl) {
  const url = new URL(resultsUrl);
  const root = url.pathname.replace(/search\/searchresults\.aspx$/i, '');
  if (root === url.pathname) throw catalogError('CATALOG_UNRECOGNIZED', 'The Polaris catalog did not answer with its results page');
  return new URL(`${root}search/components/ajaxResults.aspx?page=1&hpp=${HITS_PER_PAGE}`, url.origin).toString();
}

// One check's cookies: only what this catalog set, sent back only to it.
function createJar(origin) {
  const cookies = new Map();
  return {
    header: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    get: name => cookies.get(name),
    take(response) {
      const headers = response.headers;
      const lines = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie()
        : String(headers?.get?.('set-cookie') || '').split(/,(?=\s*[!#$%&'*+.^_`|~\w-]+=)/).filter(Boolean);
      const set = new Map();
      for (const line of lines) {
        const parts = String(line).split(';').map(part => part.trim());
        const pair = /^([!#$%&'*+.^_`|~\w-]{1,64})=([^;]{0,4096})$/.exec(parts.shift() || '');
        if (!pair) continue;
        const domain = parts.find(part => /^domain=/i.test(part))?.slice(7).replace(/^\./, '').toLowerCase();
        if (domain && domain !== new URL(origin).hostname && !new URL(origin).hostname.endsWith(`.${domain}`)) continue;
        set.set(pair[1], pair[2]);
        cookies.set(pair[1], pair[2]);
      }
      return set;
    },
  };
}

const classes = value => String(value || '').split(/\s+/).filter(Boolean);
const hasClass = (tagAttrs, name) => classes(tagAttrs.class).includes(name);
// A title's text: PowerPAC wraps each matched word in its own span
// ("<span>you</span>'<span>ll</span>"), so tags are dropped without a space.
const inlineText = html => decode(String(html || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const tidyAuthor = value => String(value || '').replace(/^by\s+/i, '').replace(/[\s,;:/.]+$/, '').trim();

// Where each result begins: PowerPAC's result block (Denver 8.0), else its
// position anchor, else its title link.
function resultStarts(markup) {
  for (const pattern of [/<div\b[^>]*\bclass=["'][^"']*\bcontent-module--search-result\b[^"']*["'][^>]*>/gi, /<a\b[^>]*\bid=["']__pos-\d+["'][^>]*>/gi]) {
    const starts = [...markup.matchAll(pattern)].map(match => match.index);
    if (starts.length) return starts;
  }
  return [...markup.matchAll(/<a\b[^>]*\bclass=["'][^"']*\bnsm-brief-action-link\b[^>]*>/gi)].map(match => match.index);
}

// A record's own page on the catalog's host, without the search position.
function recordLink(href, site) {
  try {
    const url = new URL(href, site.origin);
    if (url.origin !== site.origin || !/\/search\/title\.aspx$/i.test(url.pathname)) return null;
    const cn = url.searchParams.get('cn') || '';
    if (!RECORD_ID.test(cn)) return null;
    for (const key of [...url.searchParams.keys()]) if (!['ctx', 'cn'].includes(key.toLowerCase())) url.searchParams.delete(key);
    url.hash = '';
    return { url, cn };
  } catch {
    return null;
  }
}

function authorOf(block) {
  const group = block.match(/<div\b[^>]*\bclass=["'][^"']*\bnsm-brief-primary-author-group\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!group) return '';
  const browse = group[1].match(/<span\b[^>]*\bclass=["'][^"']*\bnsm-browse-text\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  return tidyAuthor(text(browse ? browse[1] : group[1]));
}

// The row's format: its format icon's label (formats/formatidNN.gif: Book,
// Ebook, Large Print...). An e-content row also shows its vendor's logo in
// the same list (Fairfax: "OverDrive Inc." before "Ebook"), which is not a format.
function formatOf(block) {
  const labels = [];
  for (const match of block.matchAll(/<img\b([^>]*)>/gi)) {
    const tag = attrs(match[1]);
    if (!hasClass(tag, 'c-title-detail-formats__img')) continue;
    const label = String(tag.alt || tag.title || '').replace(/\s+/g, ' ').trim();
    if (label) labels.push({ label, icon: /\/formats\/formatid\d+\.\w+$/i.test(String(tag.src || '').split('?')[0]) });
  }
  return (labels.find(item => item.icon) || labels[0])?.label || '';
}

// The row's ISBNs, from its cover image (isbn=...), its Google preview (ISBN:...) and its NoveList block.
function isbnsOf(block) {
  const found = [];
  for (const match of block.matchAll(/(?:[?&]isbn=|ISBN:|novelist-lgr-)([0-9Xx-]{10,17})/g)) {
    const value = match[1].replace(/-/g, '').toUpperCase();
    if (ISBN.test(value) && !found.includes(value)) found.push(value);
  }
  return found;
}

/**
 * The rows of one results fragment (ajaxResults.aspx): { recordId, title,
 * authors, isbns, format, catalogUrl, catalogLinkKind }, in the catalog's
 * order. Throws when the fragment lists no rows, so that a page the app
 * cannot read is "couldn't check", never "not found" ("not found" comes only
 * from the results page's own "No titles found").
 */
export function parsePolarisResults(html, site) {
  const markup = markupOnly(html);
  const starts = resultStarts(markup);
  const rows = starts.flatMap((start, index) => {
    const block = markup.slice(start, index + 1 < starts.length ? starts[index + 1] : markup.length);
    const anchor = [...block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(match => {
      const tag = attrs(match[1]);
      return hasClass(tag, 'nsm-brief-action-link') && /title\.aspx/i.test(tag.href || '');
    });
    if (!anchor) return [];
    const title = inlineText(anchor[2]);
    if (!title) return [];
    const link = recordLink(attrs(anchor[1]).href || '', site);
    const author = authorOf(block);
    const format = formatOf(block);
    return [{
      ...(link ? { recordId: link.cn } : {}), title, authors: author ? [author] : [], isbns: isbnsOf(block),
      ...(format ? { format } : {}),
      ...(link ? { catalogUrl: link.url.toString(), catalogLinkKind: 'record' } : {}),
    }];
  });
  if (!rows.length) {
    const count = text(markup).match(RESULT_COUNT);
    throw catalogError('CATALOG_UNRECOGNIZED', count ? 'The Polaris catalog counted titles but listed none' : 'The Polaris catalog did not answer with result rows');
  }
  return rows;
}

/**
 * What a results page says: 'none' ("No titles found (0 hits)"), 'rows'
 * (it loads its rows through ajaxResults.aspx), or throws when it is neither.
 */
export function readResultsPage(html) {
  const markup = markupOnly(html);
  // A page that loads its rows is read for them even where it also carries the
  // words "No titles found" (a template or a message for another part of the
  // page): only a page that loads no rows says the search found nothing.
  if (LOADS_ROWS.test(String(html || '')) && POWERPAC.test(markup)) return 'rows';
  if (NO_HITS.test(text(markup))) return 'none';
  throw catalogError('CATALOG_UNRECOGNIZED', 'The Polaris catalog did not answer with a results page');
}

async function read(url, jar, session, deadlineAt) {
  let response;
  try {
    const cookie = jar.header();
    response = await request(url, { deadlineAt, retries: 0, redirect: 'manual', maxResponseBytes: MAX_RESPONSE_BYTES,
      headers: { Accept: 'text/html, application/xhtml+xml, */*', 'Accept-Language': 'en-US,en;q=0.8', ...(cookie ? { Cookie: cookie } : {}) } });
  } catch (error) {
    throw requestFailure(error);
  }
  if ([401, 403, 429].includes(response.status) || CHALLENGE.test(response.text || '')) {
    throw catalogError('CATALOG_PROVIDER_BLOCKED', 'The Polaris catalog refused this public search');
  }
  const set = jar.take(response);
  // Another session mid-chain would answer "0 hits" for any search (see above).
  if (session && set.has(SESSION_COOKIE) && set.get(SESSION_COOKIE) !== session) {
    throw catalogError('CATALOG_UNRECOGNIZED', 'The Polaris catalog did not keep the search session');
  }
  return response;
}

async function search(site, words, deadlineAt) {
  const jar = createJar(site.origin);
  let url = searchUrl(site, words);
  let response = await read(url, jar, null, deadlineAt);
  const session = jar.get(SESSION_COOKIE);
  if (!session) throw catalogError('CATALOG_UNRECOGNIZED', 'The Polaris catalog did not start a search session');
  // The server's own redirects: process.search, then the results page.
  for (let hop = 0; response.status >= 300 && response.status < 400; hop += 1) {
    const location = response.headers?.get?.('location');
    if (!location || hop >= MAX_REDIRECTS) throw catalogError('CATALOG_UNRECOGNIZED', 'The Polaris catalog did not lead to its results page');
    const next = new URL(location, url);
    // A catalog that moved is never followed: the failure is logged with its
    // reason (unavailable), and the directory entry is reviewed.
    if (next.origin !== site.origin) throw catalogError('CATALOG_UNAVAILABLE', 'The Polaris catalog moved to another address');
    url = next.toString();
    response = await read(url, jar, session, deadlineAt);
  }
  if (!response.ok) throw catalogError('CATALOG_UNAVAILABLE', `The Polaris catalog answered HTTP ${response.status}`);
  if (readResultsPage(response.text) === 'none') {
    // Not every catalog's keyword index holds ISBNs: Fairfax answered "No
    // titles found" for the ISBN of a book it lists (live check, 24 November
    // 2026), where Denver found it. An empty answer to an ISBN is not absence.
    if (ISBN_TERM.test(words.replace(/[\s-]/g, ''))) throw catalogError('CATALOG_QUERY_UNSUPPORTED', 'An empty keyword search for an ISBN does not show absence in this Polaris catalog');
    return [];
  }
  const rows = await read(rowsUrl(url), jar, session, deadlineAt);
  if (rows.status >= 300 && rows.status < 400) throw catalogError('CATALOG_UNRECOGNIZED', 'The Polaris catalog did not answer with result rows');
  if (!rows.ok) throw catalogError('CATALOG_UNAVAILABLE', `The Polaris catalog answered HTTP ${rows.status}`);
  return parsePolarisResults(rows.text, site);
}

/**
 * The one library search (libraryBookSearch.js): every row of one keyword
 * search of this library's Polaris catalog. Answers are cached only where the
 * catalog's policy allows storing (server/data/catalog-policies.json: Denver,
 * Fairfax and Riverside allow it; the rest are live-only while their terms
 * are unread); two readers asking at once still share the request in flight.
 */
export async function librarySearch(library, term) {
  const site = polarisSite(library);
  const words = searchTerm(term);
  if (!words) throw catalogError('CATALOG_QUERY_UNSUPPORTED', 'Nothing to search for');
  const operation = catalogOperation();
  const deadlineAt = Number.isFinite(operation?.deadlineAt) ? operation.deadlineAt : Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`polaris:rows:${library.id}:${site.origin}${site.path}:${site.ctx}:${words}`, () => search(site, words, deadlineAt),
    { deadlineAt, shouldCache: () => storesAvailability(library.id) });
}
