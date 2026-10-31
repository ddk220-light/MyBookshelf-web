import { cachedTask, enqueueTask, getJson, DEFAULT_TIMEOUT_MS } from './http.js';
import { validateAndNormalize } from '../isbn.js';

// One ISBN lookup costs two requests normally and at most three. Ambiguous
// searches beyond this bound stay unknown rather than becoming a batch scan.
export const MAX_EVERGREEN_RECORDS = 2;
const GATEWAY_PATH = '/osrf-gateway-v1';
const BLOCKED_STATUSES = new Set([401, 403, 429]);
const refusedOrigins = new Set();

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
    throw providerError('CATALOG_PROVIDER_BLOCKED', 'Evergreen access was refused; this origin is disabled');
  }
}

async function call(origin, method, params, deadlineAt) {
  blocked(origin);
  const url = new URL(GATEWAY_PATH, origin);
  url.searchParams.set('service', 'open-ils.search');
  url.searchParams.set('method', method);
  for (const param of params) url.searchParams.append('param', JSON.stringify(param));
  const response = await getJson(url.toString(), {
    deadlineAt,
    maxResponseBytes: 512 * 1024,
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
      };
    }
    return {
      outcome: availableCopies > 0 ? 'available' : 'none_available',
      matchKind: 'exact_isbn',
      recognizedExact: true,
      totalCopies,
      availableCopies,
      catalogUrl: catalogUrl.toString(),
    };
  }, { deadlineAt }), { deadlineAt, shouldCache: (value) => value.outcome !== 'unknown' });
}

// Access refusals are latched until process restart / operator intervention.
// Exposed only for isolated provider tests, never through an HTTP endpoint.
export function clearEvergreenRefusals() {
  refusedOrigins.clear();
}
