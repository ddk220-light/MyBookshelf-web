import { validateAndNormalize } from './isbn.js';
import { withCatalogSuboperation } from './providers/http.js';
import { MAX_CHECK_MS } from './catalog-lookup/platforms.js';

// One library check for one book (owner decision, 20 November 2026: "Every
// search should only be title only ... Either title-based searches or ISBNs.
// If the title matches, just consider the book is found."). One code path for
// every catalog:
//   1. a book reached by ISBN: one search for that ISBN and one title search,
//      started together;
//   2. a book reached by title (a work key): one title search;
//   3. a catalog with no title search: one ISBN search, the reader's ISBN or,
//      for a work key, the most recent edition's (`latestIsbn`);
//   4. only where a matching row does not itself show this library's holding
//      (union and shared catalogs): the record page of the best matching rows,
//      at most MAX_RECORD_READS per check.
// So a check is one or two requests, never more than four (plus a cached
// robots.txt and any session or form page an adapter needs).
//
// The provider gives `searchTitle(title)`, `searchIsbn(isbn)` and, where rows
// may not show the holding, `readRecord(recordId)` (providers/index.js), each
// one catalog request. Rows are `{ title, authors, recordId, catalogUrl,
// catalogLinkKind, observation? }`; an `observation` means the row (or record)
// shows this library's holding.

export const MAX_RECORD_READS = 2;
export const MAX_MATCHES = 5;

// Case, punctuation and Latin diacritics (é -> e) fold away; marks of other
// scripts stay (राम and रोम are different titles).
const normalize = value => String(value || '').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
  .replace(/[‌‍]/g, '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
const titleKey = value => normalize(value).replace(/^(?:the|an?) (?=\S)/, '');

// The main title: the part before a subtitle (":") or a statement of
// responsibility ("/").
export function mainTitle(title) {
  return String(title || '').split(/\s*[:/]\s*/)[0].trim();
}

// A catalog row matches the book's title when, compared without case,
// punctuation, diacritics and a leading the/a/an, the row's title is the
// book's main title, or begins with it followed by more words (a subtitle or
// a statement of responsibility: "Wings of Fire: an autobiography", "Wings of
// Fire / Kalam"; this also covers a row whose own main title is the book's).
// A row that only contains the words elsewhere ("Timeless Malgudi Days") does
// not match. No author, ISBN, language or edition rule.
export function titleMatches(rowTitle, bookTitle) {
  const want = titleKey(mainTitle(bookTitle)), have = titleKey(rowTitle);
  return Boolean(want && have) && (have === want || have.startsWith(`${want} `));
}

const isbnsOf = row => [...new Set([row?.isbn, row?.isbn13, ...(row?.isbns || [])].map(value => validateAndNormalize(value || '')).filter(Boolean))];
// A row of an ISBN search is a record for that ISBN, unless it shows only
// other ISBNs (a catalog whose ISBN search also matches part of a number).
const isbnRow = (row, isbn) => { const shown = isbnsOf(row); return !shown.length || shown.includes(isbn); };

const coded = (message, code) => Object.assign(new Error(message), { code });
const failureCode = error => (/^CATALOG_[A-Z_]+$/.test(error?.code || '') ? error.code
  : error?.name === 'AbortError' || /deadline|timeout/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE');
const HOLDING = new Set(['available', 'none_available', 'in_catalog']);

// One entry of the reader's list: the title and author as the catalog shows
// them, and the record's own link when the adapter gave one.
function listEntry({ row, link }, fallbackTitle) {
  const authors = Array.isArray(row.authors) ? row.authors : [row.author].filter(Boolean);
  const entry = { title: String(row.title || fallbackTitle || '').slice(0, 300) };
  const author = authors.filter(value => typeof value === 'string' && value.trim()).join('; ').slice(0, 300);
  if (author) entry.author = author;
  if (link) entry.url = link;
  return entry;
}

// The record link of a row or record: only one the adapter called the record.
const recordLink = row => (row.catalogLinkKind === 'record' && row.catalogUrl) || (row.observation?.catalogLinkKind === 'record' && row.observation.catalogUrl) || null;

// `book` is { title, isbn13? }. `readerIsbn` is set for a book reached by ISBN.
// `latestIsbn()` gives a work's most recent edition ISBN (rule 3 only).
// `progress.best`, when given, is set to the found answer as soon as there is
// one, so a caller whose deadline arrives first can still answer with it.
// Returns a found observation (with `matches`), `{ outcome: 'no_match' }` when
// every search was answered and nothing matched, or `{ outcome: 'unknown',
// errorCode }`.
export async function searchLibraryBook(provider, book, { timeoutMs = MAX_CHECK_MS, readerIsbn = null, latestIsbn = null, progress = null } = {}) {
  const stop = new AbortController();
  try {
    return await withCatalogSuboperation({ signal: stop.signal }, () => search(provider, book, { deadline: Date.now() + timeoutMs, readerIsbn, latestIsbn, progress }));
  } finally { stop.abort(); }
}

async function search(provider, book, { deadline, readerIsbn, latestIsbn, progress }) {
  let timer;
  const expired = new Promise(resolve => { timer = setTimeout(() => resolve('expired'), Math.max(1, deadline - Date.now())); });
  const timed = async task => {
    const value = await Promise.race([Promise.resolve().then(task), expired]);
    if (value === 'expired') throw coded('Catalog check deadline exceeded', 'CATALOG_TIMEOUT');
    return value;
  };
  try {
    // "ISBN 978..." is the placeholder title of a book whose details could
    // not be read: no title to search.
    const title = /^ISBN[\s:]*[\dXx-]+$/i.test(String(book?.title || '').trim()) ? '' : mainTitle(book?.title);
    const byTitle = Boolean(title) && typeof provider.searchTitle === 'function';
    let isbn = validateAndNormalize(readerIsbn || '');
    // Rule 3: a catalog with no title search, asked about a work.
    // (Not for a catalog that has one but a book whose title is unknown: the
    // book's details failed, which no ISBN search stands in for.)
    if (typeof provider.searchTitle !== 'function' && !isbn && typeof latestIsbn === 'function') {
      try { isbn = validateAndNormalize(await timed(latestIsbn) || ''); }
      catch (error) { return { outcome: 'unknown', errorCode: failureCode(error), notCatalogFailure: true }; }
    }
    const byIsbn = Boolean(isbn) && typeof provider.searchIsbn === 'function';
    if (!byTitle && !byIsbn) return { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', ...(title ? {} : { notCatalogFailure: true }) };

    // Matching rows that show this library's holding, and those that do not.
    const held = [], unheld = [];
    const failures = [];
    let settle;
    const foundOne = new Promise(resolve => { settle = resolve; });
    const note = (row, foundBy) => {
      if (row.observation) { held.push({ row, foundBy, link: recordLink(row) }); settle(); }
      else unheld.push({ row, foundBy });
    };
    const run = (kind, task, matches) => timed(task).then(value => {
      const rows = Array.isArray(value) ? value : value?.records;
      if (!Array.isArray(rows)) throw coded('Unrecognized catalog search', 'CATALOG_UNRECOGNIZED');
      // ISBN rows first in the list: they are added first when both answer.
      for (const row of rows) if (row && matches(row)) note(row, kind);
    }).catch(error => { failures.push({ kind, code: failureCode(error) }); });
    const searches = [];
    if (byIsbn) searches.push(run('isbn', () => provider.searchIsbn(isbn), row => isbnRow(row, isbn)));
    if (byTitle) searches.push(run('title', () => provider.searchTitle(title), row => titleMatches(row.title, title)));
    // The first search that finds a held row ends the check.
    await Promise.race([Promise.all(searches), foundOne]);

    // Rule 4: matching rows that do not show the holding, ISBN rows first.
    if (!held.length && unheld.length) {
      if (typeof provider.readRecord !== 'function') failures.push({ kind: 'record', code: 'CATALOG_HOLDING_UNCONFIRMED' });
      const ordered = [...unheld.filter(item => item.foundBy === 'isbn'), ...unheld.filter(item => item.foundBy !== 'isbn')];
      for (const { row, foundBy } of ordered.slice(0, typeof provider.readRecord === 'function' ? MAX_RECORD_READS : 0)) {
        try {
          const record = await timed(() => provider.readRecord(row.recordId));
          if (record?.observation) { held.push({ row: { ...row, ...record, title: record.title || row.title }, foundBy, viaRecord: true, link: recordLink(record) || recordLink(row) }); break; }
        } catch (error) {
          // A record that says it is another library's is no holding here.
          if (error?.code !== 'CATALOG_HOLDING_UNCONFIRMED') { failures.push({ kind: 'record', code: failureCode(error) }); break; }
        }
      }
    }

    if (held.length) {
      // The ISBN match first, then rows whose main title is exactly the
      // book's, then the rest, each group in the catalog's order.
      const want = titleKey(mainTitle(book?.title));
      const group = item => (item.foundBy === 'isbn' ? 0 : titleKey(mainTitle(item.row.title)) === want ? 1 : 2);
      const ordered = [0, 1, 2].flatMap(rank => held.filter(item => group(item) === rank));
      const first = ordered[0];
      const seen = new Set();
      const matches = [];
      for (const item of ordered) {
        const id = item.row.recordId || item.link || item.row.title;
        if (seen.has(id)) continue;
        seen.add(id);
        matches.push(listEntry(item, book?.title));
        if (matches.length >= MAX_MATCHES) break;
      }
      const viaIsbn = first.foundBy === 'isbn';
      const observation = first.row.observation;
      const kind = viaIsbn && isbn === validateAndNormalize(readerIsbn || '') ? 'exact_isbn' : 'verified_work';
      const answer = {
        outcome: HOLDING.has(observation.outcome) ? observation.outcome : 'in_catalog',
        matchKind: kind, lookupKind: viaIsbn ? kind : 'title', recognizedExact: true,
        ...(first.link ? { catalogUrl: first.link, catalogLinkKind: 'record' }
          : observation.catalogUrl ? { catalogUrl: observation.catalogUrl, catalogLinkKind: observation.catalogLinkKind } : {}),
        matchedBook: { title: first.row.title || book?.title || '', ...(viaIsbn ? { isbn13: isbn } : {}) },
        foundBy: first.viaRecord ? 'record' : first.foundBy,
        matches,
      };
      if (progress) progress.best = answer;
      return answer;
    }
    // A failed, timed-out or forbidden search is "couldn't check", whatever
    // the other search said, unless that one found the book (above).
    if (failures.length) return { outcome: 'unknown', errorCode: failures[0].code };
    // A catalog with a title search that could not be asked for the title
    // (the book's details failed): an ISBN miss alone is not "not found".
    if (!byTitle && typeof provider.searchTitle === 'function') return { outcome: 'unknown', errorCode: 'CATALOG_QUERY_UNSUPPORTED', notCatalogFailure: true };
    return { outcome: 'no_match' };
  } finally { clearTimeout(timer); }
}
