import { cachedTask, enqueueTask, getJson, DEFAULT_TIMEOUT_MS } from './http.js';
import { isbnMatches, normalizeAvailability, notFound, unknown } from './contract.js';

const stateCache = new Map();
const DEFAULT_CLUSTER = 'https://cluster1opacservices.libsys10.in';

function cookiesFrom(headers, previous = '') {
  const values = new Map();
  for (const part of previous.split(/;\s*/).filter(Boolean)) {
    const separator = part.indexOf('=');
    if (separator > 0) values.set(part.slice(0, separator), part.slice(separator + 1));
  }
  let setCookies = headers?.getSetCookie?.() || [];
  if (!setCookies.length) {
    const combined = headers?.get?.('set-cookie');
    if (combined) setCookies = combined.split(/,(?=\s*[^;,=]+=[^;,]+)/);
  }
  for (const cookie of setCookies) {
    const [nameValue] = cookie.split(';');
    const separator = nameValue.indexOf('=');
    if (separator > 0) values.set(nameValue.slice(0, separator).trim(), nameValue.slice(separator + 1));
  }
  return [...values].map(([name, value]) => `${name}=${value}`).join('; ');
}

function tokenFromResponse(response) {
  const data = response?.json;
  const header = response?.headers?.get?.('authorization') || response?.headers?.get?.('x-auth-token');
  return (header ? header.replace(/^Bearer\s+/i, '') : null)
    || data?.jwt || data?.token || data?.accessToken || data?.data?.jwt || data?.data?.token;
}

function updateState(state, response) {
  state.cookies = cookiesFrom(response?.headers, state.cookies);
  const token = tokenFromResponse(response);
  if (token) state.token = token;
  return response;
}

function headersFor(state, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(state.token ? { Authorization: state.token } : {}),
    ...(state.cookies ? { Cookie: state.cookies } : {}),
  };
}

function responseRecords(data) {
  const records = data?.records || data?.results || data?.data?.records || data?.data?.results
    || data?.data?.resultList || data?.resultList || [];
  return Array.isArray(records) ? records : [];
}

function isbnFieldValues(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (/isbn/i.test(key) && ['string', 'number'].includes(typeof child)) output.push(String(child));
    else if (child && typeof child === 'object') isbnFieldValues(child, output);
  }
  return output;
}

function verifyResult(data, isbn) {
  return responseRecords(data).find((record) => isbnFieldValues(record).some((candidate) => isbnMatches(candidate, isbn)));
}

function numberFrom(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== '' && value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function flattenHoldings(data) {
  const candidates = [data?.holdings, data?.items, data?.copies, data?.data?.holdings, data?.data?.items, data?.data?.copies];
  return candidates.find(Array.isArray) || [];
}

function availableHolding(holding) {
  const status = String(holding?.status ?? holding?.availability ?? holding?.clr ?? '').trim().toLowerCase();
  if (['1', 'true', 'available', 'on shelf', 'onshelf'].includes(status)) return true;
  if (/not available|unavailable|issued|checked out|lost|withdrawn/.test(status)) return false;
  return Boolean(holding?.available === true || holding?.isAvailable === true);
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

export function parseLibsysAvailability(record, details) {
  const holdings = flattenHoldings(details);
  let availableCopies = numberFrom(details, ['availableCopies', 'availableCount', 'available'])
    ?? numberFrom(details?.data, ['availableCopies', 'availableCount', 'available']);
  let copies = numberFrom(details, ['totalCopies', 'totalCount', 'copies'])
    ?? numberFrom(details?.data, ['totalCopies', 'totalCount', 'copies']);
  if (holdings.length) {
    copies ??= holdings.length;
    availableCopies ??= holdings.filter(availableHolding).length;
  }

  const hover = cleanText(record?.siteInfoStrHover);
  const combined = `${hover || ''} ${cleanText(details?.message) || ''}`;
  if (availableCopies == null) {
    const count = combined.match(/(?:available(?:\s+copies?)?|copies?\s+available)\s*:?\s*(\d+)/i);
    if (count) availableCopies = Number(count[1]);
  }
  if (copies == null) {
    const count = combined.match(/(?:total(?:\s+copies?)?|copies?)\s*:?\s*(\d+)/i);
    if (count) copies = Number(count[1]);
  }
  if (availableCopies == null && ['0', '1'].includes(String(record?.clr))) availableCopies = Number(record.clr);
  copies ??= availableCopies;

  const recognized = availableCopies != null;
  const first = holdings[0] || {};
  return {
    recognized,
    availableCopies,
    copies,
    branch: cleanText(record?.siteInfoStrHover || record?.branchName || record?.locationName
      || first.branchName || first.locationName || first.libraryName),
    callNumber: cleanText(record?.callNo || record?.callNumber || first.callNo || first.callNumber),
  };
}

function serviceUrlFrom(settings) {
  const candidate = settings?.serviceUrl || settings?.apiUrl || settings?.baseUrl
    || settings?.data?.serviceUrl || settings?.data?.apiUrl;
  if (!candidate) return DEFAULT_CLUSTER;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString().replace(/\/$/, '') : DEFAULT_CLUSTER;
  } catch {
    return DEFAULT_CLUSTER;
  }
}

async function bootstrap(base, deadlineAt) {
  let settings = await getJson(`${base}/property-settings.json`, { deadlineAt });
  if (!settings.ok || settings.unreadable) {
    settings = await getJson(`${base}/assets/property-settings.json`, { deadlineAt });
  }
  if (!settings.ok || settings.unreadable) return null;
  const state = { token: null, locationId: null, cookies: cookiesFrom(settings.headers), serviceUrl: serviceUrlFrom(settings.json) };
  updateState(state, settings);
  let response = await getJson(`${state.serviceUrl}/isLSDiscovery`, {
    deadlineAt,
    // LibSys uses this sentinel to issue the first anonymous rotating JWT;
    // omitting the header returns 401.
    headers: { ...headersFor(state), Authorization: state.token || 'Bearer null' },
  });
  updateState(state, response);
  if (!response.ok || response.unreadable) return null;
  response = await getJson(`${state.serviceUrl}/getLocationDetailByUrl`, {
    method: 'POST', deadlineAt, headers: headersFor(state, true), body: JSON.stringify({ portalUrl: base, urlType: 2 }),
  });
  updateState(state, response);
  if (!response.ok || response.unreadable) return null;
  state.locationId = response.json?.locationId || response.json?.data?.locationId || response.json?.data?.id || null;
  if (state.locationId == null) return null;
  response = await getJson(`${state.serviceUrl}/isLSDiscovery`, { deadlineAt, headers: headersFor(state) });
  updateState(state, response);
  if (!response.ok || response.unreadable) return null;
  return state;
}

function detailsPayload(record, state) {
  return {
    locationId: state.locationId,
    recordId: record.id || record.recordId || record.bibId || record.controlNo,
    ...(record.id ? { id: record.id } : {}),
  };
}

async function performCheck(base, isbn, deadlineAt, retry = true) {
  let state = stateCache.get(base);
  if (!state) {
    state = await bootstrap(base, deadlineAt);
    if (!state) return unknown();
    stateCache.set(base, state);
  }
  const search = await getJson(`${state.serviceUrl}/searchResult/`, {
    method: 'POST', deadlineAt, headers: headersFor(state, true),
    body: JSON.stringify({
      searchdata: isbn,
      db: '1',
      locationId: state.locationId,
      appliedFilters: { [state.locationId]: [state.locationId] },
      pageNo: '1',
      recPerPage: 10,
      sortByVal: 'Title',
      freshRequest: true,
    }),
  });
  updateState(state, search);
  if ((search.status === 401 || search.status === 403) && retry) {
    stateCache.delete(base);
    return performCheck(base, isbn, deadlineAt, false);
  }
  if (!search.ok || search.unreadable) return unknown();
  const record = verifyResult(search.json, isbn);
  if (!record) return notFound();

  let details = null;
  const recordId = record.id || record.recordId || record.bibId || record.controlNo;
  if (recordId != null) {
    const response = await getJson(`${state.serviceUrl}/details/`, {
      method: 'POST', deadlineAt, headers: headersFor(state, true), body: JSON.stringify(detailsPayload(record, state)),
    });
    updateState(state, response);
    if (response.ok && !response.unreadable) details = response.json;
  }
  const parsed = parseLibsysAvailability(record, details);
  const rawUrl = record.url || record.recordUrl || record.detailsUrl;
  let url = null;
  try { if (rawUrl) url = new URL(rawUrl, `${base}/`).toString(); } catch { /* ignored */ }
  if (!parsed.recognized) return unknown({ branch: parsed.branch, callNumber: parsed.callNumber, url, metadataId: recordId });
  return normalizeAvailability({
    status: parsed.availableCopies > 0 ? 'available' : 'checked_out',
    branch: parsed.branch,
    copies: parsed.copies,
    availableCopies: parsed.availableCopies,
    heldCopies: 0,
    callNumber: parsed.callNumber,
    url,
    metadataId: recordId,
  });
}

export async function checkAvailability(library, isbn) {
  const base = library.baseUrl.replace(/\/$/, '');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const key = `availability:libsys:${library.slug || base}:${isbn}`;
  try {
    return await cachedTask(key, () => enqueueTask(`libsys:${base}`, () => performCheck(base, isbn, deadlineAt), { deadlineAt }), { deadlineAt, shouldCache: (value) => value.status !== 'unknown' });
  } catch (err) {
    console.error('LibSys availability check failed:', err.message);
    return unknown();
  }
}

export function clearLibsysCache() { stateCache.clear(); }

export { cookiesFrom, tokenFromResponse };
