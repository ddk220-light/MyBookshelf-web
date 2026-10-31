// IIT Hyderabad publishes a JSON frontend for its Koha catalog. Its older
// catalogue host is not the API used by the current public search interface.
import { cachedTask, getJson, DEFAULT_TIMEOUT_MS } from './http.js';
import { validateAndNormalize } from '../isbn.js';
import ISBN from 'isbn3';

export const IITH_CATALOG_ORIGIN = 'https://opac.krc.iith.ac.in';
const LIMIT = 8;
const exactUnknown = () => ({ outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true });
const fail = (code, message) => Object.assign(new Error(message), { code });
const unrecognized = () => fail('CATALOG_UNRECOGNIZED', 'The public catalog did not prove a complete ISBN match');
const count = (n) => Number.isSafeInteger(n) && n >= 0;
const id = (n) => Number.isSafeInteger(n) && n > 0;

function ownsIsbn(value, isbn) {
  if (typeof value !== 'string') return false;
  return (value.match(/\b[0-9][0-9Xx -]{8,24}\b/g) || [])
    .some((candidate) => validateAndNormalize(candidate.trim()) === isbn);
}

export function parseIithRecord(record, isbn, expectedId) {
  if (!record || record.biblio_id !== expectedId || !ownsIsbn(record.isbn, isbn)) throw unrecognized();
  if (!count(record.item_count) || !Array.isArray(record.items)
      || record.items.length !== record.item_count
      || record.items.some((item) => !id(item.itemnumber))
      || new Set(record.items.map((item) => item.itemnumber)).size !== record.items.length) return exactUnknown();
  const statuses = record.items.map((item) => {
    if (item.notforloan !== 0 || item.item_type !== 'BK' || /reference|not for loan/i.test(`${item.item_type_desc || ''} ${item.location || ''}`)) return 'unknown';
    if (item.status === 'Available') return 'available';
    if (item.status === 'Checked out') return 'unavailable';
    return 'unknown';
  });
  const result = { ...exactUnknown(), totalCopies: record.item_count, locations: [] };
  if (statuses.includes('available')) result.outcome = 'available';
  else if (statuses.length && statuses.every((status) => status === 'unavailable')) result.outcome = 'none_available';
  if (statuses.every((status) => status !== 'unknown')) result.availableCopies = statuses.filter((status) => status === 'available').length;
  // This is an institution-level catalog. Only the code observed and confirmed
  // in its public holdings is translated into a branch name.
  if (record.items.length && record.items.every((item) => item.holdingbranch === 'IITHLIB')) {
    result.locations.push({ name: 'IIT Hyderabad Library', status: result.outcome === 'none_available' ? 'unavailable' : result.outcome,
      totalCopies: result.totalCopies, ...(result.availableCopies === undefined ? {} : { availableCopies: result.availableCopies }) });
  }
  const calls = [...new Set(record.items.map((item) => item.call_number).filter((v) => typeof v === 'string' && v.trim()))];
  if (calls.length === 1) result.callNumber = calls[0];
  const formats = [...new Set(record.items.map((item) => item.item_type_desc).filter((v) => typeof v === 'string' && v.trim()))];
  if (formats.length) result.format = formats.join(' / ');
  return result;
}

async function read(path, deadlineAt, body) {
  const url = `${IITH_CATALOG_ORIGIN}${path}`;
  const response = await getJson(url, { deadlineAt, maxResponseBytes: 1024 * 1024, retries: 0, redirect: 'manual',
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  if ([401, 403, 429].includes(response.status) || /koha_fast_challenge|cf-chl-|anubis[_-]challenge/i.test(response.text || '')) {
    throw fail('CATALOG_PROVIDER_BLOCKED', 'The public catalog refused this request');
  }
  if (!response.ok) throw fail('CATALOG_UNAVAILABLE', 'The public catalog request failed');
  if (response.url !== url || response.unreadable || !response.json) throw unrecognized();
  return response.json;
}

export async function checkPublicAvailability(library, value) {
  if (library?.baseUrl !== IITH_CATALOG_ORIGIN || library?.publicCatalogApi !== 'iith-opac-v1') {
    throw fail('CATALOG_CONFIGURATION_REQUIRED', 'A reviewed public catalog API is required');
  }
  const isbn = validateAndNormalize(value);
  if (!isbn) throw fail('CATALOG_EXACT_ISBN_REQUIRED', 'A valid ISBN is required');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  try {
    return await cachedTask(`availability:iith:public:${isbn}`, async () => {
      let search;
      const variants = [...new Set([isbn, ISBN.parse(isbn)?.isbn10].filter(Boolean))];
      for (const query of variants) {
        search = await read('/api/search', deadlineAt, { query, type: 'isbn', limit: LIMIT, offset: 0 });
        if (!Array.isArray(search.books) || !count(search.total) || search.total > LIMIT || search.books.length !== search.total
            || search.autoApplied !== false || search.originalQuery !== null
            || search.books.some((book) => !id(book.biblio_id))
            || new Set(search.books.map((book) => book.biblio_id)).size !== search.books.length) throw unrecognized();
        if (search.books.length) break;
      }
      // No results remain unknown: the custom search's punctuation and matching
      // semantics are not a proof that every edition is absent.
      if (!search.books.length) return { outcome: 'unknown', matchKind: 'none', recognizedExact: false,
        catalogUrl: IITH_CATALOG_ORIGIN, catalogLinkKind: 'catalog' };
      const records = [];
      for (const book of search.books) {
        if (!ownsIsbn(book.isbn, isbn)) throw unrecognized();
        const detail = await read(`/api/books/${book.biblio_id}`, deadlineAt);
        records.push(parseIithRecord(detail, isbn, book.biblio_id));
      }
      if (records.length === 1) return { ...records[0], catalogUrl: `${IITH_CATALOG_ORIGIN}/book/${search.books[0].biblio_id}` };
      const result = { ...exactUnknown(), catalogUrl: IITH_CATALOG_ORIGIN, catalogLinkKind: 'catalog' };
      if (records.every((record) => count(record.totalCopies))) {
        result.totalCopies = records.reduce((sum, record) => sum + record.totalCopies, 0);
        if (records.some((record) => record.outcome === 'available')) result.outcome = 'available';
        else if (records.every((record) => record.outcome === 'none_available')) result.outcome = 'none_available';
        if (records.every((record) => count(record.availableCopies))) result.availableCopies = records.reduce((sum, record) => sum + record.availableCopies, 0);
      }
      return result;
    }, { deadlineAt, shouldCache: (result) => result.outcome !== 'unknown' });
  } catch (error) {
    if (/^CATALOG_/.test(error?.code || '')) throw error;
    throw fail(error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE', 'The public catalog request could not complete');
  }
}
