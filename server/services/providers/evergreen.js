import { cachedTask, catalogOperation, enqueueTask, getJson, DEFAULT_TIMEOUT_MS } from './http.js';
import { validateAndNormalize } from '../isbn.js';
import { storesAvailability } from '../../catalog-store/policy.js';
import { createRefusalLatch } from './refusalLatch.js';

// Evergreen (Georgia PINES), through its public OpenSRF gateway
// (/osrf-gateway-v1, allowed for every agent by gapines.org's robots.txt,
// which sets Crawl-delay 1; the OPAC's /eg/opac/results/ is disallowed and is
// never read). Two kinds of check:
//
// The library search (`librarySearch`, the one search of libraryBookSearch.js;
// USA plan step 8, 24 November 2026): one keyword (any-field) search, as the
// OPAC's own search makes it, limited to the member system the reader chose,
// then the found records' brief details, two GETs:
//
//   1. open-ils.search.biblio.multiclass.query
//        [{"limit":40,"offset":0}, "<plain words> site(<system short name>)", 1]
//      -> { count, ids: [[record, ...], ...], global_summary: { canonicalized_query:
//           "... badge_orgs(6,1) ... site(ARL) ... (keyword: <words>)" } }
//   2. open-ils.search.biblio.record.mods_slim.retrieve [[record, record, ...]]
//      -> [[ mvr, mvr, ... ]]  (mvr: title 0, author 1, record 2, ISBN 5,
//           types of resource 9, physical description 14)
//
// One request when nothing is found. Bare words are Evergreen's default class,
// keyword (any field: the answers' canonical query reads "(keyword: ...)"),
// so an ISBN's digits find its record too. `site(<short name>)` (the org
// tree's short name for the system, `evergreenSite`) limits the search to
// records with copies at or below that system, as the OPAC's library selector
// does; an entry for the whole catalog (the root org, 1) names no site. The
// canonical query lists the orgs Evergreen applied (badge_orgs: the site and
// its ancestors): a list without the entry's org means the scope did not take,
// which is couldn't check, never not found. Verified live 24 November 2026
// (fixtures in server/test/fixtures/evergreen/): "Remarkably Bright
// Creatures" at Athens Regional (site ARL, org 6) 5 records, in all of PINES
// 20; ISBN 9780385547345 at Athens Regional 1 record (Lessons in chemistry);
// a nonsense term count 0.
//
// Rows { recordId, title, authors, isbns, format, catalogUrl }: the mvr's
// title, author and ISBN (Evergreen's brief record shows the record's first
// ISBN only, so for an ISBN term the row also carries the searched ISBN, which
// the keyword index matched in that record), its MODS type of resource as the
// format ("text", "sound recording-nonmusical", "moving image"...; a text
// whose physical description is an online resource ranks with the e-books),
// and the OPAC's record page for the system (/eg/opac/record/<id>?locg=<org>).
// Copy counts are never read here. A count of 0 is not found; an answer the
// app cannot read, a gateway event, 401/403/429, a redirect or a server error
// is couldn't check.
//
// The exact-edition check (`checkAvailability`, an ISBN): the catalog's ISBN
// search and each record's copy counts for the selected org (below).
//
// PINES is live-only (server/data/catalog-policies.json platforms.evergreen:
// its terms are unread), so nothing is cached for it here.

// One ISBN lookup costs two requests normally and at most three. Ambiguous
// searches beyond this bound stay unknown rather than becoming a batch scan.
export const MAX_EVERGREEN_RECORDS = 2;
// The library search: Evergreen's any-field class, and the records listed.
export const SEARCH_CLASS = 'keyword';
export const SEARCH_LIMIT = 40;
const QUERY_METHOD = 'open-ils.search.biblio.multiclass.query';
const RECORDS_METHOD = 'open-ils.search.biblio.record.mods_slim.retrieve';
// The root of an Evergreen org tree (PINES: org 1, "PINES"): a search of the whole catalog.
export const ROOT_ORG_ID = 1;
const SITE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const ISBN_TERM = /^(?:97[89])?\d{9}[\dXx]$/;
// Six brief records were 7.7 KB (24 November 2026); forty with long notes stay far below this.
const MAX_RECORDS_BYTES = 2 * 1024 * 1024;
const GATEWAY_PATH = '/osrf-gateway-v1';
const BLOCKED_STATUSES = new Set([401, 403, 429]);
// A refusal turns the origin off on this instance for REFUSAL_LATCH_MS
// (providers/refusalLatch.js): every PINES system shares gapines.org.
const refusedOrigins = createRefusalLatch();

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function integer(value, minimum = 0) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum ? number : null;
}

function singlePayload(envelope) {
  if (envelope?.status !== 200 || !Array.isArray(envelope.payload) || envelope.payload.length !== 1) return null;
  const payload = envelope.payload[0];
  if (!payload || typeof payload !== 'object' || Object.hasOwn(payload, 'ilsevent')) return null;
  return payload;
}

export function parseEvergreenSearch(envelope) {
  const payload = singlePayload(envelope);
  if (!payload || !Array.isArray(payload.ids)) return null;
  const count = integer(payload.count);
  if (count === null || count !== payload.ids.length) return null;
  const ids = payload.ids.map((value) => integer(Array.isArray(value) ? value[0] : value, 1));
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null;
  // Current PINES returns multiclass search tuples; other Evergreen versions
  // return scalar IDs. Both must be a complete result, not a partial page.
  for (const key of ['global_summary', 'superpage_summary']) {
    if (!Object.hasOwn(payload, key)) continue;
    const summary = payload[key];
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)
        || integer(summary.total) === null || integer(summary.total) !== count) return null;
    // A zero total cannot coexist with visible hits. Malformed/incomplete
    // diagnostics are not evidence that the requested ISBN is absent.
    if (Object.hasOwn(summary, 'visible')
        && (integer(summary.visible) === null || integer(summary.visible) > count)) return null;
  }
  return { count, recordIds: ids };
}

function recordIsbnMatches(value, isbn) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((candidate) => typeof candidate === 'string' && (
    validateAndNormalize(candidate) === isbn
    || candidate.split(/[\s;,]+/).some((part) => validateAndNormalize(part) === isbn)
  ));
}

export function parseEvergreenRecord(envelope, { isbn, recordId, orgId }) {
  const payload = singlePayload(envelope);
  // mvr is Evergreen's public virtual record. The schema positions are defined
  // by Evergreen fm_IDL.xml: doc_id=2, isbn=5, copy_count=16. Never decode an
  // arbitrary fieldmapper object using these positions.
  if (payload?.__c !== 'mvr' || !Array.isArray(payload.__p) || payload.__p.length < 17) return null;
  const values = payload.__p;
  if (integer(values[2], 1) !== recordId || !recordIsbnMatches(values[5], isbn)) return null;
  if (!Array.isArray(values[16])) return null;
  const matchingCounts = values[16].filter((row) => integer(row?.org_unit, 1) === orgId);
  // The reply also contains counts for ancestors. Missing selected-org counts
  // must never fall back to the consortium's count.
  if (matchingCounts.length !== 1) return null;
  const row = matchingCounts[0];
  const totalCopies = integer(row.count);
  const availableCopies = integer(row.available);
  if (totalCopies === null || availableCopies === null || availableCopies > totalCopies) return null;
  // Transcendent / online resources can have zero physical copies and still be
  // in the catalog. They cannot establish physical availability or absence.
  if (![null, undefined, false, 0, '0', 'f'].includes(row.transcendant)) return null;
  return { recordId, totalCopies, availableCopies };
}

function configured(library) {
  let base;
  try { base = new URL(library?.baseUrl); } catch { /* validated below */ }
  const orgId = integer(library?.evergreenOrgId, 1);
  if (!base || base.protocol !== 'https:' || base.username || base.password
      || base.search || base.hash || !['', '/'].includes(base.pathname) || orgId === null) {
    throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Evergreen requires an HTTPS origin and organization ID');
  }
  return { origin: base.origin, orgId };
}

function blocked(origin) {
  if (refusedOrigins.has(origin)) {
    throw providerError('CATALOG_PROVIDER_BLOCKED', 'Evergreen access was refused; this origin is paused for a while');
  }
}

async function call(origin, method, params, deadlineAt, { maxResponseBytes = 512 * 1024 } = {}) {
  blocked(origin);
  const url = new URL(GATEWAY_PATH, origin);
  url.searchParams.set('service', 'open-ils.search');
  url.searchParams.set('method', method);
  for (const param of params) url.searchParams.append('param', JSON.stringify(param));
  const response = await getJson(url.toString(), {
    deadlineAt,
    maxResponseBytes,
    redirect: 'manual',
    retries: 0,
  });
  if (BLOCKED_STATUSES.has(response.status) || BLOCKED_STATUSES.has(response.json?.status)) {
    refusedOrigins.add(origin);
    throw providerError('CATALOG_PROVIDER_BLOCKED', 'Evergreen refused public catalog access');
  }
  if (!response.ok) throw providerError('CATALOG_UNAVAILABLE', `Evergreen returned HTTP ${response.status}`);
  if (response.unreadable || response.json?.status !== 200) {
    throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen did not return a successful public catalog response');
  }
  return response.json;
}

export async function checkAvailability(library, inputIsbn) {
  const isbn = validateAndNormalize(inputIsbn);
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'Evergreen availability requires a valid ISBN');
  const { origin, orgId } = configured(library);
  blocked(origin);
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`availability:evergreen:${origin}:${orgId}:${isbn}`, () => enqueueTask(`provider:evergreen:${origin}`, async () => {
    blocked(origin);
    const search = parseEvergreenSearch(await call(origin, 'open-ils.search.biblio.isbn', [isbn], deadlineAt));
    if (!search) throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen search did not prove a complete ISBN result');
    if (search.count === 0) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
    if (search.count > MAX_EVERGREEN_RECORDS) {
      throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen ISBN search exceeded the bounded record limit');
    }

    const records = [];
    for (const recordId of search.recordIds) {
      const record = parseEvergreenRecord(
        await call(origin, 'open-ils.search.biblio.record.mods.retrieve', [orgId, recordId], deadlineAt),
        { isbn, recordId, orgId },
      );
      if (!record) throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen record did not prove this ISBN and organization availability');
      records.push(record);
    }
    const totalCopies = records.reduce((sum, record) => sum + record.totalCopies, 0);
    const availableCopies = records.reduce((sum, record) => sum + record.availableCopies, 0);
    if (!Number.isSafeInteger(totalCopies) || !Number.isSafeInteger(availableCopies)) {
      throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen returned invalid aggregate counts');
    }
    const preferred = records.find((record) => record.availableCopies > 0)
      || records.find((record) => record.totalCopies > 0)
      || records[0];
    const catalogUrl = new URL(`/eg/opac/record/${preferred.recordId}`, origin);
    catalogUrl.searchParams.set('locg', String(orgId));
    if (totalCopies === 0) {
      // The exact catalog record exists. Zero physical holdings cannot prove
      // catalog absence, and its record link remains useful to the reader.
      return {
        outcome: 'unknown',
        matchKind: 'exact_isbn',
        recognizedExact: true,
        catalogUrl: catalogUrl.toString(),
        catalogLinkKind: 'record',
      };
    }
    return {
      outcome: availableCopies > 0 ? 'available' : 'none_available',
      matchKind: 'exact_isbn',
      recognizedExact: true,
      totalCopies,
      availableCopies,
      catalogUrl: catalogUrl.toString(),
      catalogLinkKind: 'record',
    };
  }, { deadlineAt }), { deadlineAt, shouldCache: (value) => value.outcome !== 'unknown' && storesAvailability(library.id) });
}

// Characters Evergreen's query parser could read as syntax (a class or
// modifier such as `title:` or `site(...)`, `|` and `&&`, a phrase, a
// leading `-`, `#available`) become spaces, so a title is always plain words,
// as providers/apollo.js does. Words, and hyphens and apostrophes inside
// them, are kept (Evergreen normalises them as it indexed them).
export function searchTerm(term) {
  return String(term || '').replace(/[\\+!():^[\]"{}~*?|&/<>=#%;,@$]/g, ' ').replace(/(^|\s)-+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** The query: the plain words, limited to the system (`site(<short name>)`) unless the entry is the whole catalog. */
export function searchQuery(words, site = null) {
  return site ? `${words} site(${site})` : words;
}

/** The library search's scope: the catalog origin, the org and its short name (none for the whole catalog). */
export function searchScope(library) {
  const { origin, orgId } = configured(library);
  const site = library?.evergreenSite ?? null;
  if (site !== null && (typeof site !== 'string' || !SITE.test(site))) {
    throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid Evergreen site short name');
  }
  // A member org without its short name would search the whole catalog.
  if (site === null && orgId !== ROOT_ORG_ID) {
    throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'An Evergreen member search needs its org short name');
  }
  return { origin, orgId, site };
}

/**
 * The record IDs of one multiclass query answer, `{ count, recordIds }`
 * (count is every match; the IDs are the first page), or null when the
 * answer is not a complete search answer, or when the orgs Evergreen applied
 * (badge_orgs in its canonical query) leave out the entry's org.
 */
export function parseEvergreenQuery(envelope, { orgId = null } = {}) {
  const payload = singlePayload(envelope);
  if (!payload || !Array.isArray(payload.ids)) return null;
  const count = integer(payload.count);
  if (count === null) return null;
  const ids = payload.ids.map((value) => integer(Array.isArray(value) ? value[0] : value, 1));
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null;
  if (ids.length > count || (count > 0 && !ids.length)) return null;
  const canonical = payload.global_summary?.canonicalized_query ?? payload.superpage_summary?.canonicalized_query;
  const badge = typeof canonical === 'string' ? canonical.match(/\bbadge_orgs\(([\d,\s]*)\)/) : null;
  if (orgId !== null && badge && !badge[1].split(',').map((value) => Number(value.trim())).includes(orgId)) return null;
  return { count, recordIds: ids };
}

const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const isbnsIn = (value) => [...new Set((Array.isArray(value) ? value : [value]).flatMap((item) => (typeof item === 'string' ? item.split(/[\s;,]+/) : []))
  .map((part) => validateAndNormalize(part.replace(/[()]/g, ''))).filter(Boolean))];

/** The OPAC's own page for a record, for the selected org (`locg`). */
export function recordUrl(origin, recordId, orgId) {
  const url = new URL(`/eg/opac/record/${recordId}`, origin);
  url.searchParams.set('locg', String(orgId));
  return url.toString();
}

/**
 * The rows of a mods_slim answer for the searched records, in the search's
 * order: { recordId, title, authors, isbns, format, formatKind?, catalogUrl,
 * catalogLinkKind }. Items that are not brief records of the searched IDs
 * are skipped; an answer with none is null (couldn't check). `isbn`: the
 * searched ISBN, for an ISBN term.
 */
export function parseEvergreenRecords(envelope, recordIds, { origin, orgId, isbn = null }) {
  if (envelope?.status !== 200 || !Array.isArray(envelope.payload) || envelope.payload.length !== 1 || !Array.isArray(envelope.payload[0])) return null;
  const wanted = new Set(recordIds);
  const records = new Map();
  for (const item of envelope.payload[0]) {
    // mvr positions (Evergreen fm_IDL.xml): title 0, author 1, doc_id 2, isbn 5, types_of_resource 9, physical_description 14.
    if (item?.__c !== 'mvr' || !Array.isArray(item.__p) || item.__p.length < 15) continue;
    const id = integer(item.__p[2], 1);
    if (id === null || !wanted.has(id) || records.has(id)) continue;
    records.set(id, item.__p);
  }
  const rows = [];
  for (const id of recordIds) {
    const values = records.get(id);
    const title = values ? text(values[0]) : '';
    if (!title) continue;
    const author = text(values[1]);
    const types = (Array.isArray(values[9]) ? values[9] : [values[9]]).map(text).filter(Boolean);
    const format = types[0] || '';
    const online = /\bonline resource\b|\belectronic\b/i.test(text(values[14]));
    const isbns = isbnsIn(values[5]);
    if (isbn && !isbns.includes(isbn)) isbns.push(isbn);
    rows.push({
      recordId: String(id), title, authors: author ? [author] : [], isbns,
      ...(format ? { format } : {}),
      ...(format === 'text' && online ? { formatKind: 'ebook' } : {}),
      catalogUrl: recordUrl(origin, id, orgId), catalogLinkKind: 'record',
    });
  }
  return rows.length ? rows : null;
}

/**
 * The one library search (libraryBookSearch.js): every row of one keyword
 * search of the Evergreen catalog, limited to the entry's system. Nothing is
 * cached where the catalog's policy is live-only (PINES); two readers asking
 * at once on one instance still share the request in flight.
 */
export async function librarySearch(library, term) {
  const { origin, orgId, site } = searchScope(library);
  const words = searchTerm(term);
  if (!words) throw providerError('CATALOG_QUERY_UNSUPPORTED', 'Nothing to search for');
  blocked(origin);
  const compact = words.replace(/[\s-]/g, '');
  const isbn = ISBN_TERM.test(compact) ? validateAndNormalize(compact) : null;
  const operation = catalogOperation();
  const deadlineAt = Number.isFinite(operation?.deadlineAt) ? operation.deadlineAt : Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`evergreen:rows:${library.id}:${origin}:${orgId}:${words}`, () => enqueueTask(`provider:evergreen:${origin}`, async () => {
    blocked(origin);
    const query = parseEvergreenQuery(await call(origin, QUERY_METHOD, [{ limit: SEARCH_LIMIT, offset: 0 }, searchQuery(words, site), 1], deadlineAt), { orgId });
    if (!query) throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen did not return a complete search answer for this library');
    if (query.count === 0) return [];
    const rows = parseEvergreenRecords(await call(origin, RECORDS_METHOD, [query.recordIds], deadlineAt, { maxResponseBytes: MAX_RECORDS_BYTES }),
      query.recordIds, { origin, orgId, isbn });
    if (!rows) throw providerError('CATALOG_UNRECOGNIZED', 'Evergreen did not return the found records');
    return rows;
  }, { deadlineAt }), { deadlineAt, shouldCache: () => storesAvailability(library.id) });
}

// Access refusals are latched for REFUSAL_LATCH_MS (15 minutes) on this
// instance; then the next check asks again. Exposed only for isolated
// provider tests, never through an HTTP endpoint.
export function clearEvergreenRefusals() {
  refusedOrigins.clear();
}
