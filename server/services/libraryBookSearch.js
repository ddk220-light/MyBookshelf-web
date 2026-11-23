import { validateAndNormalize } from './isbn.js';
import { withCatalogSuboperation } from './providers/http.js';
import { MAX_CHECK_MS } from './catalog-lookup/platforms.js';

// One library search for everything (owner decision, 20 November 2026:
// "Every single search should just be on a search term ... in all of these
// cases we're following the exact same methodology"). A book page check and
// the search-list marks both make ONE catalog request, `provider.search(term)`
// (providers/index.js: an any-field search of this library's catalog where
// the catalog has one), and read its rows with ONE matcher, `titleMatches`.
//
// The term is plain words: the book's main title (for a scanned ISBN, the
// title Open Library gives it); the ISBN's digits only when no title is known;
// the reader's typed text for marks. A catalog that can only be asked by ISBN
// says so (`provider.searchBy === 'isbn'`) and is handed the ISBN instead
// (the reader's, else the work's latest edition's); each row it returns is a
// match. Rows are `{ title, authors?, isbn?, isbns?, recordId?, catalogUrl?,
// catalogLinkKind?, observation? }`, all this library's (a shared catalog the
// adapter cannot filter to the library counts as the library's).

export const MAX_MATCHES = 5;

// Case, punctuation and Latin diacritics (é -> e) fold away; marks of other
// scripts stay (राम and रोम are different titles).
const normalize = value => String(value || '').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
  .replace(/[‌‍]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const titleKey = value => normalize(value).replace(/^(?:the|an?) (?=\S)/, '');
const words = value => titleKey(value).split(' ').filter(Boolean);

// The shared rows cache key part for a term (catalog-lookup/index.js).
export const termKey = value => normalize(value);

// The main title: the part before a subtitle (":") or a statement of
// responsibility ("/").
export function mainTitle(title) {
  return String(title || '').split(/\s*[:/]\s*/)[0].trim();
}

// A row matches a title when at least 80% of the title's words (its main
// title, normalised as above, without a leading the/a/an) appear among the
// row title's words, in any order. Nothing else: no author, ISBN, language or
// edition rule. "Wing Of Fire" is not "Wings of Fire" (2 of 3 words).
export function titleMatches(rowTitle, title) {
  const want = words(mainTitle(title));
  const have = new Set(words(rowTitle));
  if (!want.length || !have.size) return false;
  return want.filter(word => have.has(word)).length >= 0.8 * want.length;
}

const isbnsOf = row => [...new Set([row?.isbn, row?.isbn13, ...(row?.isbns || [])].map(value => validateAndNormalize(value || '')).filter(Boolean))];

// Matching rows in display order: the row showing the book's ISBN first (when
// the book has one), then rows whose title is exactly the title, then rows
// that start with it, then the rest, each group in the catalog's order.
export function orderMatches(rows, title, isbn = null) {
  const want = titleKey(mainTitle(title));
  const rank = row => {
    if (isbn && isbnsOf(row).includes(isbn)) return 0;
    const have = titleKey(row.title);
    return have === want ? 1 : have.startsWith(`${want} `) ? 2 : 3;
  };
  return [0, 1, 2, 3].flatMap(group => rows.filter(row => rank(row) === group));
}

// The record link of a row: only one the adapter called the record.
const recordLink = row => (row.catalogLinkKind === 'record' && row.catalogUrl) || (row.observation?.catalogLinkKind === 'record' && row.observation.catalogUrl) || null;

// One entry of the reader's list: the title and author as the catalog shows
// them, and the record's own link when the adapter gave one.
function listEntry(row, fallbackTitle) {
  const authors = Array.isArray(row.authors) ? row.authors : [row.author].filter(Boolean);
  const entry = { title: String(row.title || fallbackTitle || '').slice(0, 300) };
  const author = authors.filter(value => typeof value === 'string' && value.trim()).join('; ').slice(0, 300);
  if (author) entry.author = author;
  const link = recordLink(row);
  if (link) entry.url = link;
  return entry;
}

const coded = (message, code) => Object.assign(new Error(message), { code });
const failureCode = error => (/^CATALOG_[A-Z_]+$/.test(error?.code || '') ? error.code
  : error?.name === 'AbortError' || /deadline|timeout/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE');
const HOLDING = new Set(['available', 'none_available', 'in_catalog']);

// `book` is { title, isbn13? }. `readerIsbn` is set for a book reached by ISBN.
// `latestIsbn()` gives a work's most recent edition ISBN (ISBN-only catalogs).
// `rows(term)` makes the search (catalog-lookup/index.js passes one through
// the shared rows cache); by default `provider.search(term)`.
// Returns a found observation (with `matches`), `{ outcome: 'no_match' }` when
// the search was answered and no row matched, or `{ outcome: 'unknown',
// errorCode }`.
export async function searchLibraryBook(provider, book, { timeoutMs = MAX_CHECK_MS, readerIsbn = null, latestIsbn = null, rows = null } = {}) {
  const stop = new AbortController();
  try {
    return await withCatalogSuboperation({ signal: stop.signal }, () => check(provider, book, {
      deadline: Date.now() + timeoutMs, readerIsbn, latestIsbn, rows: rows || (term => provider.search(term)) }));
  } finally { stop.abort(); }
}

async function check(provider, book, { deadline, readerIsbn, latestIsbn, rows }) {
  let timer;
  const expired = new Promise(resolve => { timer = setTimeout(() => resolve('expired'), Math.max(1, deadline - Date.now())); });
  const timed = async task => {
    const value = await Promise.race([Promise.resolve().then(task), expired]);
    if (value === 'expired') throw coded('Catalog check deadline exceeded', 'CATALOG_TIMEOUT');
    return value;
  };
  try {
    if (typeof provider?.search !== 'function') return { outcome: 'unknown', errorCode: 'CATALOG_UNSUPPORTED' };
    // "ISBN 978..." is the placeholder title of a book whose details could
    // not be read: no title.
    const title = /^ISBN[\s:]*[\dXx-]+$/i.test(String(book?.title || '').trim()) ? '' : mainTitle(book?.title);
    let isbn = validateAndNormalize(readerIsbn || '');
    const byIsbn = provider.searchBy === 'isbn';
    if (byIsbn && !isbn && typeof latestIsbn === 'function') {
      try { isbn = validateAndNormalize(await timed(latestIsbn) || ''); }
      catch (error) { return { outcome: 'unknown', errorCode: failureCode(error), notCatalogFailure: true }; }
    }
    // The term, and which rows it matches.
    const term = byIsbn ? isbn : title || isbn;
    if (!term) return { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', notCatalogFailure: true };
    const viaIsbn = term === isbn;
    // A row of an ISBN search is that ISBN's record unless it shows only
    // other ISBNs.
    const matches = byIsbn ? () => true
      : viaIsbn ? row => { const shown = isbnsOf(row); return !shown.length || shown.includes(isbn); }
        : row => titleMatches(row?.title, title);

    let found;
    try {
      const value = await timed(() => rows(term));
      const list = Array.isArray(value) ? value : value?.records;
      if (!Array.isArray(list)) throw coded('Unrecognized catalog search', 'CATALOG_UNRECOGNIZED');
      found = orderMatches(list.filter(row => row && matches(row)), title, validateAndNormalize(book?.isbn13 || '') || isbn || null);
    } catch (error) { return { outcome: 'unknown', errorCode: failureCode(error) }; }
    if (!found.length) return { outcome: 'no_match' };

    const seen = new Set();
    const list = [];
    for (const row of found) {
      const id = row.recordId || recordLink(row) || row.title;
      if (seen.has(id)) continue;
      seen.add(id);
      list.push(listEntry(row, book?.title));
      if (list.length >= MAX_MATCHES) break;
    }
    const first = found[0];
    const link = recordLink(first);
    const shown = first.observation?.catalogUrl ? first.observation : first.catalogUrl ? first : null;
    return {
      outcome: HOLDING.has(first.observation?.outcome) ? first.observation.outcome : 'in_catalog',
      matchKind: viaIsbn ? 'exact_isbn' : 'verified_work', lookupKind: viaIsbn ? 'exact_isbn' : 'title', recognizedExact: true,
      ...(link ? { catalogUrl: link, catalogLinkKind: 'record' } : shown ? { catalogUrl: shown.catalogUrl, catalogLinkKind: shown.catalogLinkKind } : {}),
      matchedBook: { title: first.title || book?.title || '', ...(viaIsbn ? { isbn13: isbn } : {}) },
      foundBy: viaIsbn ? 'isbn' : 'title',
      matches: list,
    };
  } finally { clearTimeout(timer); }
}
