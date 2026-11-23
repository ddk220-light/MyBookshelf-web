import { cachedTask, enqueueTask, getText, peekCachedTask } from './http.js';
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
// The equivalent forms of one ISBN as one search: ISBN-13 and, for 978,
// ISBN-10. Hyphenated forms are not needed: the index ignores hyphens (live,
// 19 November 2026: 978-81-7371-146-6 and 81-7371-146-1 return exactly the
// records of their plain forms).
export function isbnQuery(value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) return null;
  return [...new Set([isbn, ISBN.parse(isbn)?.isbn10].filter(Boolean))].join(' ');
}
// Every ISBN the record page states: its ISBN row and the MARC 020 $a
// subfields (a record can carry hardback and paperback ISBNs). Cancelled or
// invalid numbers ($z) are not the record's ISBN.
export function recordIsbns(fields, clean) {
  const values = [fields.isbn || ''];
  for (const row of clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1]));
    if (cells[0] !== '020') continue;
    for (const part of cells.slice(1).join(' ').split(/\|(?=[a-z0-9])/)) if (part.startsWith('a')) values.push(part.slice(1));
  }
  const isbns = values.flatMap(value => (value.match(/\b(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])\b/g) || []).map(validateAndNormalize));
  return [...new Set(isbns.filter(Boolean))];
}
function markup(html) { return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ''); }

export function parseIndcatSearch(html, code) {
  const clean = markup(html), fields = inputs(clean);
  if (fields.part_uni !== code) throw catalogError('Catalog search scope changed');
  const total = text(clean).match(/Total\s+(\d+)\s+Records? found/i);
  if (!total) throw catalogError('Unrecognized catalog search');
  const records = new Map();
  const links = [...clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter(m => attributes(m[1]).href?.includes('/search/book_search?'));
  for (const [index, m] of links.entries()) {
    const a = attributes(m[1]);
    const url = new URL(a.href, ORIGIN);
    if (url.origin !== ORIGIN || url.pathname !== '/index.php/search/book_search') throw catalogError('Unrecognized record link');
    let data;
    try { data = JSON.parse(Buffer.from(url.searchParams.get('getDetails') || '', 'base64').toString()); } catch { throw catalogError('Invalid record link'); }
    if ((data.singleclg || data.university) !== code || !/^\d{1,20}$/.test(data.book_detail || '')) throw catalogError('Record belongs to a different institution');
    const title = text(m[2]).slice(0, 500);
    // The public results include an Author paragraph after each record link.
    // Keep it within this result's boundary; a missing author must never take
    // the next book's author. It is display metadata, not holding evidence.
    const detail = clean.slice(m.index + m[0].length, links[index + 1]?.index ?? clean.length);
    const author = [...detail.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(row => text(row[1]).match(/^Author\s*:\s*(.+)$/i)?.[1]).find(Boolean);
    if (title) records.set(data.book_detail, { recordId: data.book_detail, title, authors: author ? [author.slice(0, 500)] : [] });
  }
  if (Number(total[1]) > 0 && !records.size) throw catalogError('Missing catalog records');
  return { total: Number(total[1]), records: [...records.values()].slice(0, 10) };
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
  const isbns = recordIsbns(fields, clean);
  const isbn = firstIsbn(fields.isbn || '') || isbns[0] || null;
  if (!fields.title || (expectedIsbn && !isbns.includes(expectedIsbn))) return null;
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
  // The Books union catalog can also contain serial records. Preserve an
  // explicit MARC bibliographic level instead of presenting every record as
  // a monograph. Missing leaders do not prove either material type.
  const leader = [...clean.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => text(cell[1])))
    .filter(cells => cells[0] === '000').map(cells => (cells[1] || '').replace(/^\|a/, '').trim())
    .find(value => /^\d{5}.{3}/.test(value));
  const format = leader?.[7] === 's' ? 'Serial' : leader?.[7] === 'm' ? 'Book' : undefined;
  return { recordId, title: fields.title.replace(/\s*\/\s*(?:by|edited by)\s+.+$/i, ''), authors: fields.author ? [fields.author] : [], isbn,
    ...(isbns.length > 1 ? { isbns } : {}),
    ...(format ? { format } : {}),
    catalogUrl: recordUrl(code, recordId), catalogLinkKind: 'record',
    observation: { outcome: 'in_catalog', matchKind: expectedIsbn ? 'exact_isbn' : 'verified_work', recognizedExact: true,
      catalogUrl: recordUrl(code, recordId), catalogLinkKind: 'record', locations: [{ name: library.name, status: 'unknown' }] } };
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
// The scoped search is a CodeIgniter form: a GET of the institution's search
// page issues a session cookie and an anonymous CSRF token, and the search is a
// POST carrying both. The token and session stay valid for every institution
// (the POST names the institution; its response is checked against it), so
// one page read serves later searches instead of a 240 KB page read before
// every POST (19 November 2026: half of each check's requests were these
// reads, and the per-check cap ran out before the record pages). The session
// holds no reader data. A rejected token (CodeIgniter answers HTTP 500) is
// replaced once with a fresh page read.
const SESSION_TTL_MS = 20 * 60 * 1000;
let sessionGeneration = 0;
function cookiesFrom(headers) {
  return (headers?.getSetCookie?.() || []).map(value => value.split(';')[0].trim()).filter(value => /^[A-Za-z0-9_]{1,64}=/.test(value));
}
function mergeCookies(session, headers) {
  for (const cookie of cookiesFrom(headers)) {
    const name = cookie.split('=')[0];
    session.cookies.set(name, cookie);
    if (name === 'csrf_cookie_name') {
      const token = cookie.slice(name.length + 1);
      if (/^[a-zA-Z0-9_-]{16,128}$/.test(token)) session.token = token;
    }
  }
}
function formSession(code, deadlineAt) {
  const generation = sessionGeneration;
  return cachedTask(`indcat:session:${generation}`, async () => {
    const home = await read(scopeUrl(code), { deadlineAt });
    const fields = inputs(markup(home.text));
    if (fields.part_uni !== code || !/^[a-zA-Z0-9_-]{16,128}$/.test(fields.csrf_test_name || '')) throw catalogError('Catalog search form changed');
    const session = { generation, token: fields.csrf_test_name, cookies: new Map(), fresh: true };
    mergeCookies(session, home.headers);
    return session;
  }, { deadlineAt, ttlMs: SESSION_TTL_MS });
}
async function post(code, session, form, deadlineAt) {
  const body = new URLSearchParams({ ...form, csrf_test_name: session.token });
  const response = await read(`${ORIGIN}${PATH}`, { deadlineAt, method: 'POST',
    headers: { Cookie: [...session.cookies.values()].join('; '), Referer: scopeUrl(code), 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  mergeCookies(session, response.headers);
  return response;
}
// The search's field: all fields (the one library search, providers/
// index.js, uses it for every term); 'title' would search titles only. The
// form names the institution (part_uni), so every row is its record.
const SEARCH_FIELD = 'allfields';
async function search(library, query, isbn = false, deadlineAt = Date.now() + 60_000) {
  const code = config(library);
  return cachedTask(`indcat:search:${code}:${isbn}:${query}`, () => enqueueTask('indcat', async () => {
    // An ISBN query lists every equivalent form (ISBN-13 and ISBN-10). The
    // `isbn` field's exact search matches one form only, while a free
    // all-fields search matches any listed number (checked live: 8173711461
    // and 9788173711466 at Andhra University return the union of the two
    // exact searches). Every record found is still opened and must show the
    // ISBN itself; a listed number in another field never proves a holding.
    const form = { search_type: 'simple', part_uni: code, title: query, field: SEARCH_FIELD,
      opt: 'free', submit: 'Search', limits: '10' };
    let session = await formSession(code, deadlineAt), reused = !session.fresh;
    session.fresh = false;
    let result;
    try {
      result = await post(code, session, form, deadlineAt);
    } catch (error) {
      if (!reused || error.code !== 'CATALOG_UNAVAILABLE') throw error;
      if (sessionGeneration === session.generation) sessionGeneration++;
      session = await formSession(code, deadlineAt);
      session.fresh = false;
      result = await post(code, session, form, deadlineAt);
    }
    const parsed = parseIndcatSearch(result.text, code);
    // A successful scoped search already independently proves membership for
    // these exact records. Reuse that short-lived proof when a result opens,
    // rather than repeating up to four ISBN searches within the read budget.
    // This shares the bounded HTTP cache's normal one-minute lifetime and is
    // keyed by both institution and record, never title or ISBN.
    await Promise.all(parsed.records.map(record => cachedTask(`indcat:member:${code}:${record.recordId}`, async () => true)));
    return parsed;
  }, { deadlineAt }), { deadlineAt });
}
// The first result page (ten rows). A search that lists more is flagged
// (`hasMore`), so the shortened list never stands for the whole search.
export async function searchCatalog(library, query) {
  const { records, total } = await search(library, query);
  return total > records.length ? Object.assign([...records], { hasMore: true }) : records;
}
export async function resolveCatalogRecord(library, recordId, expectedIsbn = null, deadlineAt = Date.now() + 60_000, confirmedMemberRecord = false) {
  const code = config(library);
  confirmedMemberRecord ||= peekCachedTask(`indcat:member:${code}:${recordId}`) === true;
  const raw = await cachedTask(`indcat:record:${code}:${recordId}`, async () => {
    const response = await read(recordUrl(code, recordId), { deadlineAt });
    let result = parseIndcatRecord(response.text, library, recordId);
    if (!result) {
      const candidate = parseIndcatRecord(response.text, library, recordId, null, { confirmedMemberRecord: true });
      if (candidate && !confirmedMemberRecord) {
        const query = candidate.isbn ? isbnQuery(candidate.isbn) : candidate.title;
        const scoped = await search(library, query, Boolean(candidate.isbn), deadlineAt);
        if (scoped.records.some(record => record.recordId === recordId)) confirmedMemberRecord = true;
      }
      if (candidate && confirmedMemberRecord) result = candidate;
    }
    if (!result) throw catalogError('Catalog did not confirm this institution’s holding');
    return result;
  }, { deadlineAt });
  if (expectedIsbn && raw.isbn !== expectedIsbn && !raw.isbns?.includes(expectedIsbn)) return null;
  return { ...raw, observation: { ...raw.observation, matchKind: expectedIsbn ? 'exact_isbn' : 'verified_work' } };
}
export async function checkAvailability(library, value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw catalogError('ISBN required', 'CATALOG_EXACT_ISBN_REQUIRED');
  const deadlineAt = Date.now() + 100_000;
  // One scoped search covers both forms of the ISBN (isbnQuery).
  const result = await search(library, isbnQuery(isbn), true, deadlineAt);
  let unresolved = false;
  for (const record of result.records.slice(0, 4)) {
    try {
      const resolved = await resolveCatalogRecord(library, record.recordId, isbn, deadlineAt, true);
      if (resolved) return resolved.observation;
    } catch (error) {
      if (error.code !== 'CATALOG_UNRECOGNIZED') throw error;
      unresolved = true;
    }
  }
  // This means a completed, institution-scoped ISBN search found no match;
  // it does not claim that every edition is absent from the library.
  if (result.total === 0) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true,
    catalogUrl: scopeUrl(config(library)), catalogLinkKind: 'search' };
  throw catalogError(unresolved ? 'Catalog records did not confirm this institution’s holding'
    : 'Search results did not confirm the requested ISBN', 'CATALOG_HOLDING_UNCONFIRMED');
}

// The one library search (libraryBookSearch.js): one institution-scoped
// search and its first ten rows, each linking to its record.
export async function librarySearch(library, term) {
  const code = config(library);
  const { records } = await search(library, String(term || '').slice(0, 160));
  return records.map(record => ({ ...record, catalogUrl: recordUrl(code, record.recordId), catalogLinkKind: 'record' }));
}
