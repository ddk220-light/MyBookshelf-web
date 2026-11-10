import ISBN from 'isbn3';
import { cachedTask, getJson } from './http.js';
import { catalogError, firstIsbn, text } from './catalogMarkup.js';
import { validateAndNormalize } from '../isbn.js';

const BASE = 'https://libcloud.mastersofterp.in/OPAC_V3';
const ID = /^[1-9]\d{0,19}$/;
const MAX_BOOKS = 10;
const MAX_DETAILS = 6;
const DEADLINE_MS = 45_000;
const count = value => value != null && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : undefined;
const clean = value => text(value).replace(/^(?:N\/A|null|-)$/i, '');
const titleKey = value => clean(value).split(/\s*[:/]\s*/)[0].toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

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
export function parseLibmanSearch(json, { native = false } = {}) {
  if (json === 0 || Array.isArray(json) && json.length === 0) return { records: [], total: 0 };
  if (!Array.isArray(json)) throw catalogError('Unrecognized LIBMAN search response');
  const seen = new Set();
  const records = [];
  for (const row of json) {
    const recordId = String(row?.TitleNo ?? '');
    const title = clean(native ? row?.Title1 : row?.Title1 || row?.Title);
    if (!ID.test(recordId) || !title) throw catalogError('Malformed LIBMAN search record');
    if (!native && seen.has(recordId)) continue;
    seen.add(recordId);
    records.push({ recordId, title, isbn: firstIsbn(row.ISBN), authors: clean(row.AuthName) ? [clean(row.AuthName)] : [] });
  }
  return { records, total: records.length };
}

async function search(library, query, type, deadlineAt, native = false) {
  const { base, tenant } = settings(library);
  // The published UI permits letters, numbers, spaces and commas only. A title
  // prefix before punctuation remains a valid search, unlike replaying a colon
  // or apostrophe from the catalog's own title (the API returns error -100).
  const q = native ? query : (type === 'TITLE' ? clean(query).replace(/^[^\p{L}\p{N}]+/u, '').split(/[^\p{L}\p{N}\s,]/u)[0].trim() : clean(query)).slice(0, 200);
  if (!q) throw catalogError('Empty LIBMAN query');
  const url = new URL(`${base}/GetBookSearchData/`);
  for (const [key, value] of Object.entries({ SearchCriteria: type, SearchText: q, Libraryid: tenant, SERIESCODE: '', BOOKCATEGORY: '' })) url.searchParams.set(key, value);
  return cachedTask(`libman:search:${tenant}:${type}:${q}:${native}`, async () => parseLibmanSearch(await readJson(url.toString(), deadlineAt), { native }), { deadlineAt });
}

function selectedDetail(json, recordId, tenant) {
  if (!json || Array.isArray(json) || String(json.TITLENO) !== recordId || !clean(json.TITLENAME)) throw catalogError('Unrecognized LIBMAN record');
  for (const field of ['LibraryId', 'LIBRARYID', 'LibId']) {
    if (json[field] != null && String(json[field]) !== tenant) throw catalogError('LIBMAN returned a different library');
  }
  return {
    TITLENO: recordId, TITLENAME: clean(json.TITLENAME), ISBN: firstIsbn(json.ISBN), AUTHORNAME: clean(json.AUTHORNAME),
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
  return cachedTask(`libman:detail:${tenant}:${recordId}`, async () => selectedDetail(await readJson(url.toString(), deadlineAt), recordId, tenant), { deadlineAt });
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
  return { recordId: String(recordId), title: value.TITLENAME, isbn: value.ISBN, authors: value.AUTHORNAME ? [value.AUTHORNAME] : [],
    materialType: 'Book', materialTypeProof: 'libman_tenant_confirmed_book_detail', observation: { ...observation, materialType: 'Book' } };
}

export async function searchCatalog(library, query) {
  const deadlineAt = Date.now() + DEADLINE_MS;
  const result = await search(library, query, 'TITLE', deadlineAt);
  return result.records.slice(0, MAX_BOOKS).map(book => ({ ...book, observation: {
    outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true, catalogUrl: publicUrl(library), catalogLinkKind: 'search',
  } }));
}

export async function searchNativeCatalog(library, query) {
  // Unlike the app's legacy title fallback, never silently clip punctuation.
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s,]*$/u.test(query) || query.length > 160) throw catalogError('This public form accepts letters, numbers, spaces and commas only', 'UNSUPPORTED_PROFILE');
  const result = await search(library, query, 'TITLE', Date.now() + DEADLINE_MS, true);
  return { ...result, records: result.records.map(record => ({ ...record, materialType: 'Book', materialTypeProof: 'libman_public_books_tab' })), hasMore: false };
}

export async function resolveCatalogRecord(library, recordId) {
  const deadlineAt = Date.now() + DEADLINE_MS;
  const value = await detail(library, String(recordId), deadlineAt);
  // The tenant query is re-run after cache expiry; a guessed global TitleNo is not ownership proof.
  let confirmed = false;
  if (value.ISBN) {
    for (const variant of [...new Set([value.ISBN, ISBN.parse(value.ISBN)?.isbn10].filter(Boolean))]) {
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

export async function checkAvailability(library, isbn, title, author) {
  settings(library);
  const deadlineAt = Date.now() + DEADLINE_MS;
  const normalized = validateAndNormalize(isbn);
  let exactSearchComplete = Boolean(normalized);
  let sawExactHits = false;
  const candidates = new Map();
  let incomplete = false;
  if (normalized) {
    const variants = [...new Set([normalized, ISBN.parse(normalized)?.isbn10].filter(Boolean))];
    for (const variant of variants) {
      try {
        const result = await search(library, variant, 'ISBN', deadlineAt);
        sawExactHits ||= result.total > 0;
        for (const record of result.records) candidates.set(record.recordId, record);
      } catch (error) {
        if (!candidates.size) throw error;
        exactSearchComplete = false; incomplete = true;
      }
    }
    incomplete ||= candidates.size > MAX_DETAILS;
    const books = [];
    for (const record of [...candidates.values()].slice(0, MAX_DETAILS)) {
      try {
        const value = await detail(library, record.recordId, deadlineAt);
        if (value.ISBN !== normalized) { incomplete = true; continue; }
        books.push(parseLibmanRecord(value, library, record.recordId, { confirmedMemberRecord: true, matchKind: 'exact_isbn' }));
      } catch { incomplete = true; }
    }
    if (books.length) return aggregate(books, incomplete);
  }
  if (titleKey(title)) {
    const result = await search(library, title, 'TITLE', deadlineAt);
    const matches = result.records.filter(row => titleKey(row.title) === titleKey(title));
    const exactBooks = [];
    let partial = matches.length > 2;
    for (const row of matches.slice(0, 2)) {
      try {
        const value = await detail(library, row.recordId, deadlineAt);
        if (normalized && value.ISBN === normalized) exactBooks.push(parseLibmanRecord(value, library, row.recordId, { confirmedMemberRecord: true, matchKind: 'exact_isbn' }));
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
