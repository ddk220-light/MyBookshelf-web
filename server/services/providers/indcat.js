import { cachedTask, enqueueTask, getText } from './http.js';
import { attributes, text, firstIsbn, catalogError } from './catalogMarkup.js';
import { validateAndNormalize } from '../isbn.js';
import ISBN from 'isbn3';

const ORIGIN = 'https://indcat.inflibnet.ac.in';
const PATH = '/index.php/search/checkuniv';
const CODE = /^[A-Z0-9_]{1,64}$/;
let refused = false;

function config(library) {
  if (library.baseUrl !== ORIGIN || !CODE.test(library.indcatInstitutionCode || '')) throw catalogError('IndCat institution is not configured');
  return library.indcatInstitutionCode;
}
function scopeUrl(code) {
  const url = new URL(PATH, ORIGIN);
  url.searchParams.set('getDetails', Buffer.from(JSON.stringify({ part_uni: code })).toString('base64'));
  return url.toString();
}
export function recordUrl(code, recordId) {
  if (!CODE.test(code) || !/^\d{1,20}$/.test(recordId)) throw catalogError('Invalid catalog record');
  const url = new URL('/index.php/search/book_search', ORIGIN);
  url.searchParams.set('getDetails', Buffer.from(JSON.stringify({ book_detail: recordId, university: code,
    within: true, singleclg: code, indworkkey: `bk_${recordId}` })).toString('base64'));
  return url.toString();
}
function inputs(html) {
  const values = {};
  for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
    const a = attributes(match[1]);
    if (a.name) values[a.name] = a.value || '';
  }
  return values;
}
function markup(html) { return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''); }

export function parseIndcatSearch(html, code, limit = 10) {
  const clean = markup(html), fields = inputs(clean);
  if (fields.part_uni !== code) throw catalogError('Catalog search scope changed');
  const total = text(clean).match(/Total\s+(\d+)\s+Records? found/i);
  if (!total) throw catalogError('Unrecognized catalog search');
  const records = new Map();
  for (const m of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attributes(m[1]);
    if (!a.href?.includes('/search/book_search?')) continue;
    const url = new URL(a.href, ORIGIN);
    if (url.origin !== ORIGIN || url.pathname !== '/index.php/search/book_search') throw catalogError('Unrecognized record link');
    let data;
    try { data = JSON.parse(Buffer.from(url.searchParams.get('getDetails') || '', 'base64').toString()); } catch { throw catalogError('Invalid record link'); }
    if ((data.singleclg || data.university) !== code || !/^\d{1,20}$/.test(data.book_detail || '')) throw catalogError('Record belongs to a different institution');
    const title = text(m[2]).slice(0, 500);
    if (title) records.set(data.book_detail, { recordId: data.book_detail, title, authors: [] });
  }
  if (Number(total[1]) > 0 && !records.size) throw catalogError('Missing catalog records');
  return { total: Number(total[1]), records: [...records.values()].slice(0, limit) };
}

export function parseIndcatRecord(html, library, recordId, expectedIsbn = null, { confirmedMemberRecord = false } = {}) {
  const code = config(library), clean = markup(html);
  const bibliographic = [...clean.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)]
    .find(m => attributes(m[1]).id === 'holding');
  if (!bibliographic) return null;
  const fields = {};
  for (const row of bibliographic[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => text(m[1]));
    if (cells.length === 2) fields[cells[0].replace(/\s*[:-]+\s*$/, '').toLowerCase()] = cells[1];
  }
  const isbn = firstIsbn(fields.isbn || '');
  if (!fields.title || (expectedIsbn && isbn !== expectedIsbn)) return null;
  // Some shared records put the cataloguing agency in ucode even while the
  // institution-scoped view displays the member's own accessioned copies.
  // Accept that layout only with an exact directory-name match in the holding
  // row AND independent confirmation in this member's search results.
  const institutionKey = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const owned = [...clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].some(row => {
    const values = inputs(row[1]);
    if (values.recid !== `bk_${recordId}`) return false;
    // A matching agency code must not override an explicitly different owner.
    if (values.holdingname && institutionKey(values.holdingname) !== institutionKey(library.name)) return false;
    return values.ucode === code || (confirmedMemberRecord && CODE.test(values.ucode || '')
      && values.accno?.trim() && institutionKey(values.holdingname)
      && institutionKey(values.holdingname) === institutionKey(library.name));
  });
  const identity = inputs(clean);
  const ownBibliographicRecord = confirmedMemberRecord
    && identity.university_uri?.toUpperCase() === code && identity.control_no === `bk_${recordId}`
    && institutionKey(fields['catalogue agency']) === institutionKey(library.name);
  // A member's own bibliographic record may have no accessioned copies. It can
  // prove catalog presence after a scoped search, never borrowing availability.
  if (!owned && !ownBibliographicRecord) return null;
  return { recordId, title: fields.title.replace(/\s*\/\s*(?:by|edited by)\s+.+$/i, ''), authors: fields.author ? [fields.author] : [], isbn,
    catalogUrl: recordUrl(code, recordId),
    observation: { outcome: 'in_catalog', matchKind: expectedIsbn ? 'exact_isbn' : 'verified_work', recognizedExact: true,
      catalogUrl: recordUrl(code, recordId), locations: [{ name: library.name, status: 'unknown' }] } };
}

async function read(url, options = {}) {
  if (refused) throw catalogError('Catalog access was refused', 'CATALOG_PROVIDER_BLOCKED');
  // Use the shared reader's one bounded retry for idempotent GET failures.
  // Anonymous search POSTs are not replayed, and refusals are never retried.
  const response = await getText(url, { maxResponseBytes: 2 * 1024 * 1024, redirect: 'manual', ...options });
  if ([401, 403, 429].includes(response.status)) { refused = true; throw catalogError('Catalog access was refused', 'CATALOG_PROVIDER_BLOCKED'); }
  if (!response.ok || response.url !== url) throw catalogError('Catalog request failed', 'CATALOG_UNAVAILABLE');
  return response;
}
async function search(library, query, isbn = false, deadlineAt = Date.now() + 60_000, native = false) {
  const code = config(library);
  return cachedTask(`indcat:search:${code}:${isbn}:${query}:${native}`, () => enqueueTask('indcat', async () => {
    const home = await read(scopeUrl(code), { deadlineAt });
    const fields = inputs(markup(home.text));
    if (fields.part_uni !== code || !/^[a-zA-Z0-9_-]{16,128}$/.test(fields.csrf_test_name || '')) throw catalogError('Catalog search form changed');
    const cookies = (home.headers.getSetCookie?.() || []).map(v => v.split(';')[0]).join('; ');
    const body = new URLSearchParams({ search_type: 'simple', part_uni: code, title: query, field: isbn ? 'isbn' : 'allfields',
      opt: isbn ? 'exact' : 'free', submit: 'Search', limits: '10', csrf_test_name: fields.csrf_test_name });
    const result = await read(`${ORIGIN}${PATH}`, { deadlineAt, method: 'POST',
      headers: { Cookie: cookies, Referer: scopeUrl(code), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    return parseIndcatSearch(result.text, code, native ? Infinity : 10);
  }, { deadlineAt }), { deadlineAt });
}
export async function searchCatalog(library, query) { return (await search(library, query)).records; }
export async function searchNativeCatalog(library, query) {
  const result = await search(library, query, false, Date.now() + 60_000, true);
  return { ...result, hasMore: result.total > result.records.length, continuationUnsupported: result.total > result.records.length };
}
export async function resolveCatalogRecord(library, recordId, expectedIsbn = null, deadlineAt = Date.now() + 60_000, confirmedMemberRecord = false) {
  const code = config(library);
  const raw = await cachedTask(`indcat:record:${code}:${recordId}`, async () => {
    const response = await read(recordUrl(code, recordId), { deadlineAt });
    let result = parseIndcatRecord(response.text, library, recordId);
    if (!result) {
      const candidate = parseIndcatRecord(response.text, library, recordId, null, { confirmedMemberRecord: true });
      if (candidate && !confirmedMemberRecord) {
        const parsed = candidate.isbn && ISBN.parse(candidate.isbn);
        const queries = candidate.isbn ? [...new Set([candidate.isbn, parsed?.isbn10, parsed?.isbn13h, parsed?.isbn10h].filter(Boolean))] : [candidate.title];
        for (const query of queries) {
          const scoped = await search(library, query, Boolean(candidate.isbn), deadlineAt);
          if (scoped.records.some(record => record.recordId === recordId)) { confirmedMemberRecord = true; break; }
        }
      }
      if (candidate && confirmedMemberRecord) result = candidate;
    }
    if (!result) throw catalogError('Catalog did not confirm this institution’s holding');
    return result;
  }, { deadlineAt });
  if (expectedIsbn && raw.isbn !== expectedIsbn) return null;
  return { ...raw, observation: { ...raw.observation, matchKind: expectedIsbn ? 'exact_isbn' : 'verified_work' } };
}
export async function checkAvailability(library, value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw catalogError('ISBN required', 'CATALOG_EXACT_ISBN_REQUIRED');
  const parsed = ISBN.parse(isbn), deadlineAt = Date.now() + 100_000;
  const queries = [...new Set([isbn, parsed?.isbn10, parsed?.isbn13h, parsed?.isbn10h].filter(Boolean))];
  const seen = new Set();
  let allEmpty = true, unresolved = false;
  for (const query of queries) {
    const result = await search(library, query, true, deadlineAt);
    allEmpty &&= result.total === 0;
    for (const record of result.records.slice(0, 4)) {
      if (seen.has(record.recordId)) continue;
      seen.add(record.recordId);
      try {
        const resolved = await resolveCatalogRecord(library, record.recordId, isbn, deadlineAt, true);
        if (resolved) return resolved.observation;
      } catch (error) {
        if (error.code !== 'CATALOG_UNRECOGNIZED') throw error;
        unresolved = true;
      }
    }
  }
  // This means a completed, institution-scoped ISBN search found no match;
  // it does not claim that every edition is absent from the library.
  if (allEmpty) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true,
    catalogUrl: scopeUrl(config(library)), catalogLinkKind: 'search' };
  throw catalogError(unresolved ? 'Catalog records did not confirm this institution’s holding'
    : 'Search results did not confirm the requested ISBN', 'CATALOG_HOLDING_UNCONFIRMED');
}
