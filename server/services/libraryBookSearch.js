import { validateAndNormalize } from './isbn.js';
import { withCatalogSuboperation } from './providers/http.js';
import { LAST_TIER, formatTier } from './rowFormats.js';
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
// match. Rows are `{ title, authors?, isbn?, isbns?, format?, recordId?,
// catalogUrl?, catalogLinkKind?, observation? }`, all this library's (a shared
// catalog the adapter cannot filter to the library counts as the library's).
//
// Every row passing the title rule is a find, whatever its format or author
// (owner decisions, 23 November 2026: "Accuracy is not important, robustness
// is important"; "Wrongly saying something is found is okay. It's worse to
// say that something is not there"). The rows are ranked, best match first,
// and the card lists the first ten (`orderMatches`, MAX_MATCHES). The same
// rule and order for every library, in India, the US and elsewhere.

export const MAX_MATCHES = 10;

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
// edition or format rule. "Wing Of Fire" is not "Wings of Fire" (2 of 3
// words).
export function titleMatches(rowTitle, title) {
  const want = words(mainTitle(title));
  const have = new Set(words(rowTitle));
  if (!want.length || !have.size) return false;
  return want.filter(word => have.has(word)).length >= 0.8 * want.length;
}

const isbnsOf = row => [...new Set([row?.isbn, row?.isbn13, ...(row?.isbns || [])].map(value => validateAndNormalize(value || '')).filter(Boolean))];

// The family names of a book's authors ("Harper Lee", "Lee, Harper" and
// "Lee, Harper, 1926-2016" all give "lee"), for the card's order only: an
// author never decides whether a row is a find.
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'dr']);
function familyName(name) {
  const text = String(name || '');
  // "Family, Given": the part before the first comma.
  const part = text.includes(',') ? text.split(',')[0] : text;
  const list = normalize(part).split(' ').filter(word => word && !SUFFIXES.has(word) && !/^\d+$/.test(word));
  return list.length ? list[list.length - 1] : null;
}
const authorList = value => (Array.isArray(value) ? value : [value]).filter(item => typeof item === 'string' && item.trim());
const rowAuthors = row => authorList(Array.isArray(row?.authors) ? row.authors : row?.author);

/** Whether a row names one of the book's authors (by family name). */
export function carriesAuthor(row, authors = []) {
  const wanted = new Set(authorList(authors).map(familyName).filter(name => name && name.length >= 2));
  if (!wanted.size) return false;
  const have = new Set(rowAuthors(row).flatMap(name => normalize(name).split(' ')));
  return [...wanted].some(name => have.has(name));
}

// Matching rows ranked, best match first (owner decisions, 23 November 2026:
// "If it properly matches, show it in the front, and the lesser matched ones
// can go down the line, but just can be there"; 24 November 2026: the book's
// author before the title groups):
//   1. the row showing the book's ISBN (when the book has one): this edition;
//   2. rows that carry the book's author (`carriesAuthor`: a family name);
//   3. within each: rows whose main title (`mainTitle`: before ":" or "/") is
//      exactly the title, normalised as above ("Atomic habits : tiny
//      changes..." is exact for "Atomic Habits"), then rows whose title
//      starts with the title, then the other rows passing the title rule;
//   4. within each: book rows and rows with no format, then e-books and
//      audiobooks, then other formats;
//   5. then the catalog's order.
// Video and music rows still count and come after every other row ("show
// last"; the ISBN row and the author's too), ranked the same way among
// themselves. The author goes before the title groups because a short title
// is shared: Gandhi's "An autobiography" is searched by that main title, and
// "Gandhi : an autobiography" (another match) ranked below "Autobiography of
// a yogi" (a title starting with it). The first row is the card's first entry and
// gives the found answer its catalog link (`searchLibraryBook`); a
// search-list mark links it too (catalog-lookup/index.js).
// The catalog's own order is never trusted for the first row (LAPL lists study
// guides above the novel, research 23 November 2026).
export function orderMatches(rows, title, isbn = null, authors = []) {
  const want = titleKey(mainTitle(title));
  const group = row => {
    if (titleKey(mainTitle(row.title)) === want) return 0;
    return titleKey(row.title).startsWith(`${want} `) ? 1 : 2;
  };
  const rank = row => {
    const tier = formatTier(row);
    return [tier === LAST_TIER ? 1 : 0, isbn && isbnsOf(row).includes(isbn) ? 0 : 1, carriesAuthor(row, authors) ? 0 : 1, group(row), tier];
  };
  const compare = (a, b) => {
    for (let i = 0; i < a.rank.length; i += 1) if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    return a.index - b.index;
  };
  return rows.map((row, index) => ({ row, index, rank: rank(row) })).sort(compare).map(item => item.row);
}

/** The rows of one search that are a find for this book (every row passing the title rule), ranked by `orderMatches`. */
export function matchingRows(rows, book, { isbn = null, matches = row => titleMatches(row?.title, book?.title) } = {}) {
  return orderMatches((Array.isArray(rows) ? rows : []).filter(row => row && matches(row)), book?.title, isbn, book?.authors || []);
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

/** The reader's list for a found book: its ranked matching rows, one entry per record, at most MAX_MATCHES. */
export function matchEntries(rows, fallbackTitle) {
  const seen = new Set();
  const list = [];
  for (const row of rows) {
    const id = row.recordId || recordLink(row) || row.title;
    if (seen.has(id)) continue;
    seen.add(id);
    list.push(listEntry(row, fallbackTitle));
    if (list.length >= MAX_MATCHES) break;
  }
  return list;
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
      found = matchingRows(list, { title, authors: book?.authors || [] }, { isbn: validateAndNormalize(book?.isbn13 || '') || isbn || null, matches });
    } catch (error) { return { outcome: 'unknown', errorCode: failureCode(error) }; }
    if (!found.length) return { outcome: 'no_match' };

    const first = found[0];
    const link = recordLink(first);
    const shown = first.observation?.catalogUrl ? first.observation : first.catalogUrl ? first : null;
    return {
      outcome: HOLDING.has(first.observation?.outcome) ? first.observation.outcome : 'in_catalog',
      matchKind: viaIsbn ? 'exact_isbn' : 'verified_work', lookupKind: viaIsbn ? 'exact_isbn' : 'title', recognizedExact: true,
      ...(link ? { catalogUrl: link, catalogLinkKind: 'record' } : shown ? { catalogUrl: shown.catalogUrl, catalogLinkKind: shown.catalogLinkKind } : {}),
      matchedBook: { title: first.title || book?.title || '', ...(viaIsbn ? { isbn13: isbn } : {}) },
      foundBy: viaIsbn ? 'isbn' : 'title',
      matches: matchEntries(found, book?.title),
    };
  } finally { clearTimeout(timer); }
}
