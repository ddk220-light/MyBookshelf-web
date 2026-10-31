import { cachedTask, getJson, DEFAULT_TIMEOUT_MS } from './http.js';
import { normalizeAvailability, notFound, unknown } from './contract.js';
import { validateAndNormalize } from '../isbn.js';

// This is intentionally the same public (no-login) catalog identity and request
// shape as the native BiblioCommons clients. It is not a browser disguise: it
// identifies this web service and points to its public privacy information.
const PUBLIC_WEB_HEADERS = Object.freeze({
  'User-Agent': 'MyBookshelf/1.0 (Web; +https://mybookshelf.cloud/privacy)',
});

function catalogError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function searchCatalog(slug, query, deadlineAt) {
  const url = `https://gateway.bibliocommons.com/v2/libraries/${encodeURIComponent(slug)}/bibs/search?query=${encodeURIComponent(query)}&searchType=keyword`;
  const response = await getJson(url, { deadlineAt, headers: PUBLIC_WEB_HEADERS });
  if (!response.ok || response.unreadable) return { reachable: false, data: null };
  return { reachable: true, data: response.json };
}

async function getAvailability(slug, metadataId, deadlineAt) {
  const url = `https://gateway.bibliocommons.com/v2/libraries/${encodeURIComponent(slug)}/bibs/${encodeURIComponent(metadataId)}/availability`;
  const response = await getJson(url, { deadlineAt, headers: PUBLIC_WEB_HEADERS });
  if (!response.ok || response.unreadable) return { reachable: false, data: null };
  return { reachable: true, data: response.json };
}

function firstCatalogMatch(data, isbn) {
  if (!(data?.catalogSearch?.pagination?.count > 0) || !Array.isArray(data?.catalogSearch?.results)) return null;
  const bibs = data.entities?.bibs || {};
  if (isbn) {
    const exact = data.catalogSearch.results.find(result => bibs[result.representative]?.briefInfo?.isbns?.some(value => validateAndNormalize(value) === validateAndNormalize(isbn)));
    if (exact) return { metadataId: exact.representative, bibInfo: bibs[exact.representative] };
  }
  for (const format of ['BK', 'LPRINT']) {
    const hit = data.catalogSearch.results.find((result) => bibs[result.representative]?.briefInfo?.format === format);
    if (hit?.representative) return { metadataId: hit.representative, bibInfo: bibs[hit.representative] };
  }
  const metadataId = data.catalogSearch.results[0]?.representative;
  return metadataId ? { metadataId, bibInfo: bibs[metadataId] } : null;
}

function locationsFrom(data) {
  return Object.values(data?.entities?.bibItems || {}).flatMap((item) => {
    const name = typeof item?.branchName === 'string' ? item.branchName.trim() : '';
    if (!name) return [];
    const rawStatus = item?.availability?.status;
    return [{ name, status: rawStatus === 'AVAILABLE' ? 'available' : rawStatus ? 'unavailable' : 'unknown' }];
  });
}

// This performs the same sequence as iOS/Android:
// 1. start title/author and bare-ISBN searches through `searchType=keyword`;
// 2. prefer the ISBN result; 3. retrieve that bib's public availability record.
// BiblioCommons' documented `searchType=isbn` route is not reliable, hence the
// bare ISBN is deliberately a keyword query in all three clients.
async function lookupPublicCatalog(slug, isbn, title, author, { skipEmptyTitle = false } = {}) {
  const webBase = `https://${slug}.bibliocommons.com`;
  const key = `availability:bc:${slug}:${isbn || ''}:${title || ''}:${author || ''}:${skipEmptyTitle}`;
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  try {
    return await cachedTask(key, async () => {
      const titleAuthorQuery = [title, author].filter((value) => typeof value === 'string' && value.trim()).join(' ');
      // Native starts this request even when metadata is sparse, so retain the
      // same reachability signal rather than treating an empty title as a
      // provider outage.
      const titleAuthorSearch = skipEmptyTitle && !titleAuthorQuery
        ? Promise.resolve({ reachable: true, data: { catalogSearch: { pagination: { count: 0 }, results: [] } } })
        : searchCatalog(slug, titleAuthorQuery, deadlineAt);
      const isbnSearch = isbn
        ? searchCatalog(slug, isbn, deadlineAt)
        : Promise.resolve({ reachable: false, data: null });
      const [titleAuthor, byIsbn] = await Promise.all([titleAuthorSearch, isbnSearch]);
      const isbnMatch = firstCatalogMatch(byIsbn.data, isbn);
      const titleAuthorMatch = firstCatalogMatch(titleAuthor.data);

      // Match native behavior: if the ISBN search found nothing and the
      // title/author request did not reach the catalog, this is an outage, not
      // a catalog miss.
      if (!isbnMatch && !titleAuthor.reachable) return { kind: 'unavailable' };
      const match = isbnMatch || titleAuthorMatch;
      if (!match) {
        return {
          kind: 'not_found',
          // A successful bare-ISBN query with no result is the only public
          // evidence strong enough for the anonymous web to say "not found".
          recognizedExact: Boolean(isbn && byIsbn.reachable && byIsbn.data?.catalogSearch?.pagination?.count === 0),
        };
      }

      const { metadataId, bibInfo } = match;
      const url = `${webBase}/v2/record/${encodeURIComponent(metadataId)}`;
      const availability = await getAvailability(slug, metadataId, deadlineAt);
      const availData = availability.data;
      const availInfo = availData?.entities?.availabilities?.[metadataId];
      const base = {
        callNumber: bibInfo?.briefInfo?.callNumber || null,
        catalogUrl: url,
        metadataId,
        matchKind: isbnMatch?.bibInfo?.briefInfo?.isbns?.some(value => validateAndNormalize(value) === validateAndNormalize(isbn)) ? 'exact_isbn' : 'possible_match',
      };
      if (!availability.reachable || !availInfo) return { kind: 'unavailable' };

      const availableCopies = Number(availInfo.availableCopies) || 0;
      const totalCopies = Number(availInfo.totalCopies) || 0;
      const heldCopies = Number(availInfo.heldCopies) || 0;
      const status = availableCopies > 0 ? 'available'
        : availInfo.circulationType === 'REQUEST' || heldCopies > 0 ? 'waitlist' : 'checked_out';
      const items = Object.values(availData?.entities?.bibItems || {});
      const branch = (items.find((item) => item.availability?.status === 'AVAILABLE') || items[0])?.branchName || null;
      return {
        kind: 'observation', status, branch, copies: totalCopies, availableCopies, heldCopies,
        locations: locationsFrom(availData), ...base,
      };
    }, { deadlineAt, shouldCache: (value) => value.kind !== 'unavailable' });
  } catch (err) {
    console.error('BiblioCommons availability check failed:', err.message);
    return { kind: 'unavailable' };
  }
}

// Compatibility shape retained for the retired legacy server routes.
export async function checkAvailability(slug, isbn, title, author) {
  const result = await lookupPublicCatalog(slug, isbn, title, author);
  if (result.kind === 'unavailable') return unknown();
  if (result.kind === 'not_found') return notFound();
  return normalizeAvailability({
    status: result.status, branch: result.branch, copies: result.copies,
    availableCopies: result.availableCopies, heldCopies: result.heldCopies,
    callNumber: result.callNumber, url: result.catalogUrl, metadataId: result.metadataId,
  });
}

// Anonymous web v2 uses this richer form so it can preserve match confidence,
// locations, and a real provider failure rather than flattening them to an
// unhelpful "catalog unrecognized" result.
export async function checkPublicAvailability(slug, isbn, title, author) {
  const result = await lookupPublicCatalog(slug, isbn, title, author, { skipEmptyTitle: true });
  if (result.kind === 'unavailable') throw catalogError('CATALOG_UNAVAILABLE', 'BiblioCommons did not complete the public catalog lookup');
  if (result.kind === 'not_found') {
    if (!result.recognizedExact) throw catalogError('CATALOG_UNRECOGNIZED', 'BiblioCommons did not provide an exact ISBN match');
    return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
  }
  return {
    outcome: result.status === 'available' ? 'available' : 'none_available',
    matchKind: result.matchKind,
    availableCopies: result.availableCopies,
    totalCopies: result.copies,
    callNumber: result.callNumber,
    catalogUrl: result.catalogUrl,
    locations: result.locations,
  };
}

// Work matching consumes all candidate metadata rather than trusting the first
// keyword hit. The record URL is durable; identity is checked by the caller.
export async function searchBookCandidates(slug, query) {
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  return cachedTask(`bc:candidates:${slug}:${query}`, async () => {
    const result = await searchCatalog(slug, query, deadlineAt);
    if (!result.reachable || !Array.isArray(result.data?.catalogSearch?.results)) throw catalogError('CATALOG_UNAVAILABLE', 'Catalog search unavailable');
    const bibs = result.data.entities?.bibs || {};
    return result.data.catalogSearch.results.slice(0, 10).flatMap(item => {
      const id = item.representative, bib = bibs[id], info = bib?.briefInfo;
      if (!info?.title || !['BK', 'LPRINT'].includes(info.format)) return [];
      const catalogUrl = `https://${slug}.bibliocommons.com/v2/record/${encodeURIComponent(id)}`;
      const availability = bib.availability;
      return [{ recordId: id, title: [info.title, info.subtitle].filter(Boolean).join(': '), authors: info.authors || [],
        isbns: info.isbns || [], language: info.primaryLanguage, format: info.format === 'LPRINT' ? 'Large print' : 'Book', catalogUrl,
        observation: { outcome: availability?.status === 'AVAILABLE' ? 'available' : availability?.availableCopies === 0 && availability?.totalCopies > 0 ? 'none_available' : 'in_catalog',
          matchKind: 'possible_match', catalogUrl,
          ...(Number.isInteger(availability?.availableCopies) ? { availableCopies: availability.availableCopies } : {}),
          ...(Number.isInteger(availability?.totalCopies) ? { totalCopies: availability.totalCopies } : {}),
          callNumber: info.callNumber } }];
    });
  }, { deadlineAt });
}

export async function login(slug, cardNumber, pin) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { valid: false, reason: 'unreachable' };
  const loginUrl = `https://${slug}.bibliocommons.com/user/login?destination=%2Fuser_dashboard`;
  try {
    const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
    const res = await getJson('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      deadlineAt,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: loginUrl, formats: ['html'], actions: [
        { type: 'wait', milliseconds: 2000 },
        { type: 'click', selector: 'input[data-js="username_login"]' },
        { type: 'write', text: cardNumber },
        { type: 'click', selector: 'input[data-js="user_pin"]' },
        { type: 'write', text: pin },
        { type: 'click', selector: 'input[data-js="button_login"]' },
        { type: 'wait', milliseconds: 5000 },
      ] }),
    });
    if (!res.ok || res.unreadable) return { valid: false, reason: 'unreachable' };
    const html = res.json?.data?.html || '';
    if (/bibliocommons\.com\/holds|notifications_button|data-js="user_logout"|href="\/user_dashboard"[^>]*>My Account/i.test(html)) return { valid: true, reason: 'ok' };
    if (/cp-login-error|login information.*invalid|username or password/i.test(html)) return { valid: false, reason: 'invalid' };
    return { valid: false, reason: 'unreachable' };
  } catch (err) {
    console.error('BiblioCommons login failed:', err.message);
    return { valid: false, reason: 'unreachable' };
  }
}
