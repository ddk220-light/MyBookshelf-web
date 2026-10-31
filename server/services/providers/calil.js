import { cachedTask, getJson, DEFAULT_TIMEOUT_MS } from './http.js';

const CALIL_ORIGIN = 'https://api.calil.jp';
const AVAILABLE = new Set(['貸出可']);
const UNAVAILABLE = new Set(['貸出中', '予約中', '準備中', '館内のみ']);
const ATTRIBUTION = Object.freeze({ label: 'Calil', url: 'https://calil.jp/' });
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 14;

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function statusFor(value) {
  const label = String(value || '').trim();
  if (AVAILABLE.has(label)) return 'available';
  if (UNAVAILABLE.has(label)) return 'unavailable';
  return 'unknown';
}

function requestUrl(params) {
  const url = new URL('/check', CALIL_ORIGIN);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('format', 'json');
  url.searchParams.set('callback', 'no');
  return url.toString();
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCalilAvailability(payload, { isbn, systemId }) {
  // Only a completed, explicitly successful answer for the exact requested
  // book and system can establish absence. Missing is not the same as empty.
  if (!isRecord(payload) || payload.continue !== 0 || !isRecord(payload.books)) return null;
  const systems = Object.hasOwn(payload.books, isbn) ? payload.books[isbn] : null;
  if (!isRecord(systems) || !Object.hasOwn(systems, systemId)) return null;
  const book = systems[systemId];
  if (!isRecord(book) || !['OK', 'Cache'].includes(book.status) || !isRecord(book.libkey)) return null;
  const branches = Object.entries(book.libkey);
  if (branches.some(([name, label]) => !name.trim() || typeof label !== 'string')) return null;
  const locations = branches
    .filter(([, label]) => label.trim() !== '蔵書なし')
    .map(([name, label]) => ({ name, status: statusFor(label) }));
  if (!locations.length) {
    return { outcome: 'not_found', matchKind: 'none', recognizedExact: true, attribution: { ...ATTRIBUTION } };
  }
  // A closed branch or a holdings-only answer does not prove that every copy
  // is unavailable. Keep that uncertainty when no branch confirms availability.
  const outcome = locations.some((location) => location.status === 'available')
    ? 'available'
    : locations.every((location) => location.status === 'unavailable')
      ? 'none_available'
      : 'unknown';
  return {
    outcome,
    matchKind: 'exact_isbn',
    recognizedExact: true,
    locations,
    catalogUrl: typeof book.reserveurl === 'string' ? book.reserveurl : undefined,
    attribution: { ...ATTRIBUTION },
  };
}

async function fetchCheck({ appKey, isbn, systemId, session, deadlineAt }) {
  let response;
  try {
    response = await getJson(requestUrl(session
      ? { appkey: appKey, session }
      : { appkey: appKey, isbn, systemid: systemId }), {
      deadlineAt,
      maxResponseBytes: 512 * 1024,
      // Never forward an app key to a redirect target. Polling is the only
      // repetition Calil asks for; failed requests are left for a later lookup.
      redirect: 'manual',
      retries: 0,
    });
  } catch (error) {
    // Fetch errors can contain the full credential-bearing URL. Do not let it
    // escape this provider through logs, telemetry, or a serialized error.
    const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '')
      ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
    throw providerError(code, 'Calil could not complete the request');
  }
  if (response.status === 403 || response.status === 429) {
    throw providerError('CATALOG_PROVIDER_BLOCKED', `Calil returned HTTP ${response.status}`);
  }
  if (!response.ok) throw providerError('CATALOG_UNAVAILABLE', `Calil returned HTTP ${response.status}`);
  if (response.unreadable) throw providerError('CATALOG_UNRECOGNIZED', 'Calil did not return readable JSON');
  return response.json;
}

export async function checkAvailability(library, isbn, { appKey = process.env.CALIL_APP_KEY } = {}) {
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'Calil availability requires an ISBN');
  if (!appKey) throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Calil is not configured on this server');
  const systemId = library?.calilSystemId || library?.slug;
  if (!systemId) throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'Calil system is not configured');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const key = `availability:calil:${library.id}:${isbn}`;
  return cachedTask(key, async () => {
    let payload = await fetchCheck({ appKey, isbn, systemId, deadlineAt });
    for (let polls = 0; payload?.continue === 1 && polls < MAX_POLLS; polls += 1) {
      if (typeof payload.session !== 'string' || !payload.session.trim()) {
        throw providerError('CATALOG_UNRECOGNIZED', 'Calil did not provide a polling session');
      }
      if (deadlineAt - Date.now() <= POLL_INTERVAL_MS) {
        throw providerError('CATALOG_TIMEOUT', 'Calil did not complete in time');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      payload = await fetchCheck({ appKey, isbn, systemId, session: payload.session, deadlineAt });
    }
    if (payload?.continue === 1) throw providerError('CATALOG_TIMEOUT', 'Calil did not complete in time');
    const result = parseCalilAvailability(payload, { isbn, systemId });
    if (!result) throw providerError('CATALOG_UNRECOGNIZED', 'Calil did not provide a complete answer for this ISBN and library');
    return result;
  }, { deadlineAt });
}
