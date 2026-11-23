import { cachedTask, getJson } from './http.js';
import { catalogError, decode, firstIsbn, text } from './catalogMarkup.js';
import { validateAndNormalize } from '../isbn.js';
import { hyphenatedIsbn } from './egranthalaya.js';

const BASE = 'https://libcloud.mastersofterp.in/OPAC_V3';
const ID = /^[1-9]\d{0,19}$/;
// Rows, ISBN-search hits and title rows read by the catalog search screen,
// result marking and an exact-edition check. A reader's library check reads
// none (searchTitle, searchIsbn).
const MAX_BOOKS = 10;
const MAX_DETAILS = 3;
// Title-search rows carry no ISBN (19 November 2026: TitleNo, Title, AuthName,
// Publisher, Edition, CallNo, ... and no ISBN field), so a row alone can never
// prove an edition. The record's own details have it: the rows whose main
// title is the one searched for are read to add it.
const MAX_ROW_DETAILS = 3;
const DEADLINE_MS = 45_000;
const count = value => value != null && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
// The API sometimes double-escapes entities. Detail metadata is sanitized both
// before caching and when parsed; normalize the observed two layers in search
// too, so an extra detail pass cannot change the displayed title's identity.
const clean = value => decode(text(value)).replace(/^(?:N\/A|null|-)$/i, '');
const titleKey = value => clean(value).split(/\s*[:/]\s*/)[0].toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fullTitleKey = value => clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

// Every valid ISBN in a record's ISBN field ("978-81-203-4389-4", "81-7648-019-3",
// "9788173711466", several separated by commas or slashes, or "---").
function allIsbns(value) {
  return [...new Set((text(value).match(/\b(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])\b/g) || [])
    .map(validateAndNormalize).filter(Boolean))];
}

// The ISBN search matches any part of the stored ISBN text, which libraries
// store plain or hyphenated. The 9 digits an ISBN-13 starting 978 shares with
// its ISBN-10 find both plain forms; the same digits hyphenated by the
// official ranges ("81-7371-146") find both hyphenated forms. Each hit is
// checked against the record's full ISBN before it counts.
function isbnSearchTerms(isbn) {
  const stem = isbn.startsWith('978') ? isbn.slice(3, -1) : isbn;
  const hyphenated = hyphenatedIsbn(isbn);
  return [...new Set([stem, hyphenated && (isbn.startsWith('978') ? hyphenated.slice(4, -2) : hyphenated)].filter(Boolean))];
}

function settings(library) {
  const base = String(library.baseUrl || BASE).replace(/\/+$/, '');
  const tenant = String(library.libmanLibraryId || '');
  if (base !== BASE || !ID.test(tenant)) throw catalogError('Invalid LIBMAN library scope');
  return { base, tenant };
}

function publicUrl(library) {
  settings(library);
  try {
    const url = new URL(library.catalogUrl);
    if (url.origin === new URL(BASE).origin && url.pathname.replace(/\/+$/, '') === '/OPAC_V3') return url.toString();
  } catch { /* Build the public catalog entry point below. */ }
  const url = new URL(`${BASE}/`);
  url.searchParams.set('library', library.name || '');
  return url.toString();
}

async function readJson(url, deadlineAt) {
  const response = await getJson(url, { deadlineAt, redirect: 'manual', maxResponseBytes: 3_000_000 });
  if (!response.ok || response.unreadable) {
    throw catalogError(`LIBMAN catalog response ${response.status}`, [401, 403, 429].includes(response.status) ? 'CATALOG_PROVIDER_BLOCKED' : 'CATALOG_UNRECOGNIZED');
  }
  return response.json;
}

// Search rows contain unrelated link/login fields; keep only public book metadata.
export function parseLibmanSearch(json) {
  if (json === 0 || Array.isArray(json) && json.length === 0) return { records: [], total: 0 };
  if (!Array.isArray(json)) throw catalogError('Unrecognized LIBMAN search response');
  const seen = new Set();
  const records = [];
  for (const row of json) {
    const recordId = String(row?.TitleNo ?? '');
    const title = clean(row?.Title1 || row?.Title);
    if (!ID.test(recordId) || !title) throw catalogError('Malformed LIBMAN search record');
    if (seen.has(recordId)) continue;
    seen.add(recordId);
    const isbns = allIsbns(row.ISBN);
    records.push({ recordId, title, isbn: firstIsbn(row.ISBN), ...(isbns.length > 1 ? { isbns } : {}), authors: clean(row.AuthName) ? [clean(row.AuthName)] : [] });
  }
  return { records, total: records.length };
}

async function search(library, query, type, deadlineAt, retryWord = true) {
  const { base, tenant } = settings(library);
  // The published UI permits letters, numbers, spaces and commas only. Use a
  // contiguous safe segment: the first segment can be just "A" in "A+ ..." or
  // "The" in "(The) ...", which buries the desired book in unrelated matches.
  const original = clean(query);
  const hasCombiningMarks = /\p{M}/u.test(original);
  const segments = original.replace(/^[^\p{L}\p{N}]+/u, '').split(/[^\p{L}\p{N}\s,]/u).map(part => part.trim());
  // The API's handling of combining-mark scripts has not been verified. Keep
  // their existing first-segment behavior and never invent a syllable retry.
  const q = (type === 'TITLE' ? (hasCombiningMarks ? segments[0] : segments.sort((a, b) => b.length - a.length)[0]) : original).slice(0, 200);
  if (!q) throw catalogError('Empty LIBMAN query');
  const read = value => {
    const url = new URL(`${base}/GetBookSearchData/`);
    for (const [key, item] of Object.entries({ SearchCriteria: type, SearchText: value, Libraryid: tenant, SERIESCODE: '', BOOKCATEGORY: '' })) url.searchParams.set(key, item);
    return cachedTask(`libman:search:${tenant}:${type}:${value.toLocaleLowerCase()}`, async () => parseLibmanSearch(await readJson(url.toString(), deadlineAt)),
      { deadlineAt, ttlMs: 5 * 60_000 });
  };
  const result = await read(q);
  if (!retryWord || type !== 'TITLE' || result.total > 0 || hasCombiningMarks) return result;
  // Some catalogs store repeated spaces but search literal phrases. Only after
  // an explicit clean zero, retry one substantial word and retain full-title
  // matches. This does not turn an error or a broad word hit into membership.
  const words = original.match(/[\p{L}\p{N}]+/gu) || [];
  const token = [...words].sort((a, b) => b.length - a.length)[0];
  if (words.length < 2 || !token || token.length < 5 || token === q) return result;
  const retry = await read(token.slice(0, 200));
  const key = fullTitleKey(original);
  const records = retry.records.filter(row => fullTitleKey(row.title) === key);
  return { records, total: records.length };
}

function selectedDetail(json, recordId, tenant) {
  if (!json || Array.isArray(json) || String(json.TITLENO) !== recordId || !clean(json.TITLENAME)) throw catalogError('Unrecognized LIBMAN record');
  for (const field of ['LibraryId', 'LIBRARYID', 'LibId']) {
    if (json[field] != null && String(json[field]) !== tenant) throw catalogError('LIBMAN returned a different library');
  }
  return {
    TITLENO: recordId, TITLENAME: clean(json.TITLENAME), ISBN: firstIsbn(json.ISBN), ISBNS: allIsbns(json.ISBN), AUTHORNAME: clean(json.AUTHORNAME),
    CALLNO: clean(json.CALLNO), DOCUMENTTYPE: clean(json.DOCUMENTTYPE), ItemType: clean(json.ItemType),
    TOTAL_COPIES: count(json.TOTAL_COPIES),
    IIDropDownList: Array.isArray(json.IIDropDownList) ? json.IIDropDownList.map(row => ({
      ACCNO: clean(row.ACCNO), BranchName: clean(row.BranchName), BNAME: clean(row.BNAME), STATUSNAME: clean(row.STATUSNAME),
    })) : [],
  };
}

async function detail(library, recordId, deadlineAt) {
  const { base, tenant } = settings(library);
  if (!ID.test(String(recordId))) throw catalogError('Invalid LIBMAN record ID');
  const url = new URL(`${base}/GetBookDetails`);
  url.searchParams.set('TitleNo', recordId);
  url.searchParams.set('LibId', tenant);
  return cachedTask(`libman:detail:${tenant}:${recordId}`, async () => selectedDetail(await readJson(url.toString(), deadlineAt), recordId, tenant),
    { deadlineAt, ttlMs: 5 * 60_000 });
}

export function parseLibmanRecord(json, library, recordId, { confirmedMemberRecord = false, matchKind = 'verified_work' } = {}) {
  if (!confirmedMemberRecord) return null;
  const value = selectedDetail(json, String(recordId), settings(library).tenant);
  const rows = value.IIDropDownList;
  const restricted = /\breference\b/i.test(`${value.DOCUMENTTYPE} ${value.ItemType}`);
  const statuses = rows.map(row => {
    if (restricted || /\breference\b/i.test(row.BNAME)) return 'unknown';
    if (/^(?:PRESENT|AVAILABLE|ON SHELF)$/i.test(row.STATUSNAME)) return 'available';
    if (/^(?:ISSUED|CHECKED OUT|ON LOAN)$/i.test(row.STATUSNAME)) return 'unavailable';
    return 'unknown';
  });
  const total = value.TOTAL_COPIES;
  const unique = new Set(rows.map(row => row.ACCNO).filter(Boolean));
  const complete = total > 0 && rows.length === total && unique.size === total;
  const available = statuses.filter(s => s === 'available').length;
  const outcome = available > 0 ? 'available' : complete && statuses.every(s => s === 'unavailable') ? 'none_available' : 'in_catalog';
  const observation = {
    outcome, matchKind, recognizedExact: matchKind !== 'possible_match',
    catalogUrl: publicUrl(library), catalogLinkKind: 'search',
    callNumber: value.CALLNO || undefined, format: value.DOCUMENTTYPE || undefined,
    locations: [{ name: library.name || 'Library', status: outcome === 'available' ? 'available' : outcome === 'none_available' ? 'unavailable' : 'unknown' }],
  };
  // The supplied total is useful even when the provider omits some item rows.
  if (total !== undefined && total > 0) observation.totalCopies = total;
  if (complete && statuses.every(s => s !== 'unknown')) {
    observation.availableCopies = available;
    Object.assign(observation.locations[0], { availableCopies: available, totalCopies: total });
  }
  return { recordId: String(recordId), title: value.TITLENAME, isbn: value.ISBN, ...(value.ISBNS?.length > 1 ? { isbns: value.ISBNS } : {}),
    authors: value.AUTHORNAME ? [value.AUTHORNAME] : [], observation };
}

const outOfBudget = error => ['CATALOG_REQUEST_BUDGET', 'CATALOG_ABORTED'].includes(error?.code) || error?.name === 'AbortError';

// Rows come from this tenant's own search, so each is a record of this library
// (copy status unknown). The rows whose main title is the one searched for get
// their record's ISBNs, so a row can prove an edition; a row still without an
// ISBN is at most a possible match. Reading details stops when the request
// budget or deadline runs out (result marking allows one search and a few
// reads): the rows are returned with what was read. Rows left out are flagged
// (`hasMore`), so a shortened list never stands for the whole search.
export async function searchCatalog(library, query) {
  const deadlineAt = Date.now() + DEADLINE_MS;
  const result = await search(library, query, 'TITLE', deadlineAt);
  const rows = result.records.slice(0, MAX_BOOKS).map(book => ({ ...book, observation: {
    outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true, catalogUrl: publicUrl(library), catalogLinkKind: 'search',
  } }));
  const wanted = titleKey(query);
  const details = MAX_ROW_DETAILS;
  let read = 0;
  for (const row of rows) {
    if (row.isbn || !wanted || titleKey(row.title) !== wanted || read >= details) continue;
    read += 1;
    try {
      const value = await detail(library, row.recordId, deadlineAt);
      if (value.ISBNS.length) Object.assign(row, { isbn: value.ISBNS[0], ...(value.ISBNS.length > 1 ? { isbns: value.ISBNS } : {}) });
    } catch (error) {
      if (outOfBudget(error)) break;
    }
  }
  return result.records.length > rows.length ? Object.assign(rows, { hasMore: true }) : rows;
}

// The one library search (libraryBookSearch.js): one search of this
// tenant's catalog (Libraryid), so every row is a record of this library.
// The API's criteria seen are TITLE and ISBN, no any-field one: title search
// (providers/index.js marks it title-only).
const SEARCH_CRITERIA = 'TITLE';
export async function librarySearch(library, term) {
  const { records } = await search(library, term, SEARCH_CRITERIA, Date.now() + DEADLINE_MS, false);
  return records.map(row => ({ ...row, observation: { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true, catalogUrl: publicUrl(library), catalogLinkKind: 'search' } }));
}

export async function resolveCatalogRecord(library, recordId) {
  const deadlineAt = Date.now() + DEADLINE_MS;
  const value = await detail(library, String(recordId), deadlineAt);
  // The tenant query is re-run after cache expiry; a guessed global TitleNo is not ownership proof.
  let confirmed = false;
  if (value.ISBN) {
    for (const variant of isbnSearchTerms(value.ISBN)) {
      const result = await search(library, variant, 'ISBN', deadlineAt);
      if (result.records.some(row => row.recordId === String(recordId))) { confirmed = true; break; }
    }
  }
  if (!confirmed) {
    const result = await search(library, value.TITLENAME, 'TITLE', deadlineAt);
    confirmed = result.records.some(row => row.recordId === String(recordId));
  }
  if (!confirmed) throw catalogError('LIBMAN record is not in the selected library', 'CATALOG_HOLDING_UNCONFIRMED');
  return parseLibmanRecord(value, library, recordId, { confirmedMemberRecord: true });
}

function aggregate(books, incomplete) {
  const observations = books.map(book => book.observation);
  const first = observations.find(row => row.outcome === 'available') || observations[0];
  const outcome = observations.some(row => row.outcome === 'available') ? 'available'
    : !incomplete && observations.every(row => row.outcome === 'none_available') ? 'none_available' : 'in_catalog';
  const result = { ...first, outcome };
  delete result.totalCopies; delete result.availableCopies;
  result.locations = [{ name: first.locations?.[0]?.name || 'Library', status: outcome === 'available' ? 'available' : outcome === 'none_available' ? 'unavailable' : 'unknown' }];
  for (const key of ['totalCopies', 'availableCopies']) {
    if (!incomplete && observations.every(row => Number.isInteger(row[key]))) result[key] = observations.reduce((sum, row) => sum + row[key], 0);
  }
  return result;
}

// One or two ISBN searches (isbnSearchTerms), then the records they return,
// until one shows this ISBN. Both searches answering with nothing is "not
// found"; hits that do not show it, or that could not be read, are not.
export async function checkAvailability(library, isbn, title, author) {
  settings(library);
  const deadlineAt = Date.now() + DEADLINE_MS;
  const normalized = validateAndNormalize(isbn);
  let exactSearchComplete = Boolean(normalized);
  let sawExactHits = false;
  const candidates = new Map();
  if (normalized) {
    for (const term of isbnSearchTerms(normalized)) {
      try {
        const result = await search(library, term, 'ISBN', deadlineAt);
        sawExactHits ||= result.total > 0;
        for (const record of result.records) candidates.set(record.recordId, record);
      } catch (error) {
        if (!candidates.size) throw error;
        exactSearchComplete = false;
      }
    }
    for (const record of [...candidates.values()].slice(0, MAX_DETAILS)) {
      try {
        const value = await detail(library, record.recordId, deadlineAt);
        // The app answers found / not found: the first record that shows this
        // ISBN is enough, and no further copy details are read.
        if (value.ISBNS.includes(normalized)) {
          return aggregate([parseLibmanRecord(value, library, record.recordId, { confirmedMemberRecord: true, matchKind: 'exact_isbn' })], true);
        }
      } catch (error) {
        if (error?.code === 'CATALOG_PROVIDER_BLOCKED' || outOfBudget(error)) throw error;
      }
    }
  }
  if (titleKey(title)) {
    const result = await search(library, title, 'TITLE', deadlineAt);
    const matches = result.records.filter(row => titleKey(row.title) === titleKey(title));
    const exactBooks = [];
    const read = 2;
    let partial = matches.length > read;
    for (const row of matches.slice(0, read)) {
      try {
        const value = await detail(library, row.recordId, deadlineAt);
        if (normalized && value.ISBNS.includes(normalized)) exactBooks.push(parseLibmanRecord(value, library, row.recordId, { confirmedMemberRecord: true, matchKind: 'exact_isbn' }));
        else if (!value.ISBN) partial = true;
      } catch { partial = true; }
    }
    if (exactBooks.length) return aggregate(exactBooks, partial);
    // A title match alone cannot establish circulation for the scanned edition.
    if (matches.length) return { outcome: 'in_catalog', matchKind: 'possible_match', catalogUrl: publicUrl(library), catalogLinkKind: 'search' };
  }
  if (normalized && exactSearchComplete && !sawExactHits) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true, catalogUrl: publicUrl(library), catalogLinkKind: 'search' };
  throw catalogError('LIBMAN holdings could not be confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
}
