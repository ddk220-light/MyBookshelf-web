import ISBN from 'isbn3';
import { cachedTask, getText } from './http.js';
import { attributes, catalogError, firstIsbn, text } from './catalogMarkup.js';
import { validateAndNormalize } from '../isbn.js';
import { kalnetTransportOptions } from './kalnet-tls.js';

const KALNET = 'https://kalnet.kshec.kerala.gov.in/vufind';
const SOMAIYA = 'https://koha-opac.somaiya.edu';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DEADLINE_MS = 45_000;
const MAX_DETAILS = 6;
const titleKey = value => text(value).split(/\s*[:/]\s*/)[0].toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const labelKey = value => text(value).replace(/\s*-\s*$/, '').toLocaleLowerCase();

function settings(library) {
  const base = String(library.baseUrl || '').replace(/\/+$/, '');
  if (![KALNET, SOMAIYA].includes(base)) throw catalogError('Unrecognized VuFind catalog');
  const safeValue = value => typeof value === 'string' && value.length > 0 && value.length <= 250 && !/["\\\x00-\x1f]/.test(value);
  if (!safeValue(library.vufindInstitution) || base === KALNET && !safeValue(library.vufindBuilding)) throw catalogError('Missing VuFind library scope');
  const filters = [`institution:"${library.vufindInstitution}"`];
  if (base === KALNET) filters.push(`building:"${library.vufindBuilding}"`);
  return { base, filters, isKalnet: base === KALNET };
}

export function vufindSearchUrl(library, query, type = 'Title', page = 1) {
  const { base, filters } = settings(library);
  const url = new URL(`${base}/Search/Results`);
  url.searchParams.set('lookfor', text(query).slice(0, 200));
  url.searchParams.set('type', type === 'ISN' ? 'ISN' : 'Title');
  url.searchParams.set('limit', '10');
  for (const filter of filters) url.searchParams.append('filter[]', filter);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

function recordUrl(library, id) {
  const { base } = settings(library);
  if (!ID.test(String(id))) throw catalogError('Invalid VuFind record ID');
  return `${base}/Record/${encodeURIComponent(id)}`;
}

async function readHtml(url, deadlineAt) {
  const response = await getText(url, { deadlineAt, redirect: 'manual', maxResponseBytes: 2_000_000, ...kalnetTransportOptions(url) });
  if (!response.ok) throw catalogError(`VuFind catalog response ${response.status}`, [401, 403, 429].includes(response.status) ? 'CATALOG_PROVIDER_BLOCKED' : 'CATALOG_UNRECOGNIZED');
  return response.text;
}

function coins(html) {
  for (const match of html.matchAll(/<span\b([^>]*)>/gi)) {
    const attr = attributes(match[1]);
    if (!/(?:^|\s)Z3988(?:\s|$)/.test(attr.class || '')) continue;
    const params = new URLSearchParams(attr.title || '');
    return {
      isbn: params.getAll('rft.isbn').map(firstIsbn).find(Boolean) || null,
      authors: [...new Set([...params.getAll('rft.au'), ...params.getAll('rft.creator')].map(text).filter(Boolean))],
    };
  }
  return { isbn: null, authors: [] };
}

function recordIdFromHref(library, href) {
  const { base } = settings(library);
  try {
    const url = new URL(href, `${base}/`);
    const prefix = `${new URL(base).pathname.replace(/\/$/, '')}/Record/`;
    if (url.origin !== new URL(base).origin || !url.pathname.startsWith(prefix)) return null;
    const id = decodeURIComponent(url.pathname.slice(prefix.length));
    return ID.test(id) ? id : null;
  } catch { return null; }
}

export function parseVufindSearch(html, library) {
  const { filters } = settings(library);
  const applied = [...html.matchAll(/<input\b([^>]*)>/gi)].map(m => attributes(m[1])).filter(a => a.name === 'filter[]').map(a => a.value);
  if (!filters.every(f => applied.includes(f)) || applied.some(f => /^(?:institution|building):/.test(f) && !filters.includes(f))) throw catalogError('VuFind did not confirm the selected library filters');
  const plain = text(html);
  const zero = /Your search[\s\S]*?did not match any resources\./i.test(plain);
  const totalMatch = plain.match(/Showing\s+[\d,]+\s*-\s*[\d,]+\s+results\s+of\s+([\d,]+)/i);
  const total = zero ? 0 : totalMatch ? Number(totalMatch[1].replaceAll(',', '')) : null;
  if (total == null || !Number.isSafeInteger(total)) throw catalogError('Unrecognized VuFind result count');
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m => {
    const classes = (attributes(m[1]).class || '').split(/\s+/);
    return classes.includes('title') && classes.includes('getFull');
  });
  const records = [];
  const seen = new Set();
  for (let i = 0; i < links.length; i++) {
    const match = links[i];
    const recordId = recordIdFromHref(library, attributes(match[1]).href);
    const title = text(match[2]);
    if (!recordId || !title) throw catalogError('Unrecognized VuFind record link');
    if (seen.has(recordId)) continue;
    seen.add(recordId);
    const chunk = html.slice(match.index, links[i + 1]?.index ?? html.length);
    const meta = coins(chunk);
    if (!meta.authors.length) meta.authors = [...chunk.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m => /\bresult-author\b/.test(attributes(m[1]).class || '')).map(m => text(m[2]));
    records.push({ recordId, title, ...meta });
  }
  if (total === 0 && records.length || total > 0 && !records.length || records.length > total) throw catalogError('Incomplete VuFind search markup');
  return { records, total };
}

async function search(library, query, type, deadlineAt, page = 1) {
  const url = vufindSearchUrl(library, query, type, page);
  return cachedTask(`vufind:search:${url}`, async () => parseVufindSearch(await readHtml(url, deadlineAt), library), { deadlineAt });
}

function metadata(html) {
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  const meta = coins(html);
  if (!meta.isbn) {
    for (const match of html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)) {
      if (attributes(match[1]).property === 'isbn') { meta.isbn = firstIsbn(match[2]); if (meta.isbn) break; }
    }
  }
  if (!meta.authors.length) meta.authors = [...html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi)]
    .filter(m => /\bauthor-data\b/.test(attributes(m[1]).class || '')).map(m => text(m[2]));
  return { title, ...meta };
}

function hasSelfLink(html, library, id, tab) {
  const expected = new URL(`${recordUrl(library, id)}/${tab}`);
  return [...html.matchAll(/<a\b([^>]*)>/gi)].some(m => {
    try { const url = new URL(attributes(m[1]).href, recordUrl(library, id)); return url.origin === expected.origin && url.pathname === expected.pathname; } catch { return false; }
  });
}

async function detail(library, id, deadlineAt) {
  const url = recordUrl(library, id);
  return cachedTask(`vufind:detail:${url}`, async () => {
    const html = await readHtml(url, deadlineAt);
    if (!hasSelfLink(html, library, id, 'Holdings')) throw catalogError('VuFind record identity was not confirmed');
    const meta = metadata(html);
    if (!meta.title) throw catalogError('Unrecognized VuFind record title');
    if (!meta.isbn && hasSelfLink(html, library, id, 'Description')) {
      try {
        const extra = await readHtml(`${url}/Description`, deadlineAt);
        if (hasSelfLink(extra, library, id, 'Holdings') && titleKey(metadata(extra).title) === titleKey(meta.title)) meta.isbn = metadata(extra).isbn;
      } catch { /* The main record remains useful without edition metadata. */ }
    }
    return { html, meta };
  }, { deadlineAt });
}

export function parseVufindRecord(html, library, id, { confirmedMemberRecord = false, matchKind = 'verified_work', isbn = null } = {}) {
  const config = settings(library);
  if (!confirmedMemberRecord || !hasSelfLink(html, library, id, 'Holdings')) return null;
  const meta = metadata(html);
  if (!meta.title) return null;
  meta.isbn ||= validateAndNormalize(isbn);
  const observation = { outcome: 'in_catalog', matchKind, recognizedExact: matchKind !== 'possible_match', catalogUrl: recordUrl(library, id), catalogLinkKind: 'record',
    locations: [{ name: library.vufindBuilding || library.vufindInstitutionLabel || library.name, status: 'unknown' }] };
  // KALNET's item rows name the university, not the selected department/building.
  // Scoped discovery proves catalog membership, but not branch-level copy counts.
  if (!config.isKalnet) {
    const expected = labelKey(library.vufindInstitutionLabel || library.name);
    const statuses = [];
    const seen = new Set();
    let incomplete = false;
    let callNumber;
    for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
      const caption = text(table[1].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1]).replace(/^Holdings details from\s*/i, '');
      if (!expected || labelKey(caption) !== expected) continue;
      const parsedRows = [...table[1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].filter(row => /\bholding-row\b/.test(attributes(row[1]).class || ''));
      const declaredRows = [...table[1].matchAll(/<tr\b([^>]*)>/gi)].filter(row => /\bholding-row\b/.test(attributes(row[1]).class || '')).length;
      incomplete ||= parsedRows.length !== declaredRows;
      for (const row of parsedRows) {
        if (!/\bholding-row\b/.test(attributes(row[1]).class || '')) continue;
        const props = Object.fromEntries([...row[2].matchAll(/<meta\b([^>]*)>/gi)].map(m => attributes(m[1])).filter(a => a.property).map(a => [a.property, a.content]));
        if (!props.seller) { incomplete = true; continue; }
        if (labelKey(props.seller) !== expected) continue;
        const serial = text(props.serialNumber || props.serialnumber);
        if (!serial) { incomplete = true; continue; }
        if (seen.has(serial)) continue;
        seen.add(serial); callNumber ||= text(props.sku);
        const status = text(row[2].match(/<span\b[^>]*class=["'][^"']*text-(?:success|danger|muted|warning)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
        statuses.push(/^Available$/i.test(status) ? 'available' : /^Checked out$/i.test(status) ? 'unavailable' : 'unknown');
      }
    }
    const available = statuses.filter(s => s === 'available').length;
    if (available) observation.outcome = 'available';
    else if (!incomplete && statuses.length && statuses.every(s => s === 'unavailable')) observation.outcome = 'none_available';
    if (!incomplete && statuses.length) observation.totalCopies = statuses.length;
    if (!incomplete && statuses.length && statuses.every(s => s !== 'unknown')) observation.availableCopies = available;
    if (callNumber) observation.callNumber = callNumber;
    observation.locations[0].status = observation.outcome === 'available' ? 'available' : observation.outcome === 'none_available' ? 'unavailable' : 'unknown';
    for (const key of ['totalCopies', 'availableCopies']) if (observation[key] !== undefined) observation.locations[0][key] = observation[key];
  }
  return { recordId: String(id), ...meta, observation };
}

export async function searchCatalog(library, query) {
  const result = await search(library, query, 'Title', Date.now() + DEADLINE_MS);
  return result.records.slice(0, 10).map(book => ({ ...book, observation: {
    outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true, catalogUrl: recordUrl(library, book.recordId), catalogLinkKind: 'record',
  } }));
}

export async function searchNativeCatalog(library, query, { page = 1 } = {}) {
  if (text(query) !== query) throw catalogError('Query would be transformed by this catalog profile', 'UNSUPPORTED_PROFILE');
  const result = await search(library, query, 'Title', Date.now() + DEADLINE_MS, page);
  const hasMore = result.total > (page - 1) * 10 + result.records.length;
  return { ...result, hasMore, nextPage: hasMore ? page + 1 : undefined };
}

export async function resolveCatalogRecord(library, id) {
  const deadlineAt = Date.now() + DEADLINE_MS;
  const value = await detail(library, String(id), deadlineAt);
  // Some catalogs index only ISBN-10 even though their record metadata can be
  // normalized to ISBN-13. Re-prove membership after cache expiry using both
  // representations, then the title, always requiring this exact record ID.
  const queries = [...new Set([value.meta.isbn, ISBN.parse(value.meta.isbn || '')?.isbn10].filter(Boolean))]
    .map(query => ({ query, type: 'ISN' }));
  queries.push({ query: value.meta.title, type: 'Title' });
  let confirmed = false;
  for (const { query, type } of queries) {
    let result = await search(library, query, type, deadlineAt);
    confirmed = result.records.some(row => row.recordId === String(id));
    if (!confirmed && result.total > result.records.length) {
      result = await search(library, query, type, deadlineAt, 2);
      confirmed = result.records.some(row => row.recordId === String(id));
    }
    if (confirmed) break;
  }
  if (!confirmed) throw catalogError('VuFind record is not in the selected library', 'CATALOG_HOLDING_UNCONFIRMED');
  return parseVufindRecord(value.html, library, String(id), { confirmedMemberRecord: true, isbn: value.meta.isbn });
}

function aggregate(books, incomplete) {
  const rows = books.map(b => b.observation);
  const result = { ...(rows.find(row => row.outcome === 'available') || rows[0]) };
  result.outcome = rows.some(r => r.outcome === 'available') ? 'available' : !incomplete && rows.every(r => r.outcome === 'none_available') ? 'none_available' : 'in_catalog';
  delete result.availableCopies; delete result.totalCopies;
  result.locations = [{ name: rows[0].locations?.[0]?.name || 'Library', status: result.outcome === 'available' ? 'available' : result.outcome === 'none_available' ? 'unavailable' : 'unknown' }];
  for (const key of ['totalCopies', 'availableCopies']) if (!incomplete && rows.every(r => Number.isInteger(r[key]))) result[key] = rows.reduce((sum, r) => sum + r[key], 0);
  return result;
}

export async function checkAvailability(library, isbn, title, author) {
  settings(library);
  const deadlineAt = Date.now() + DEADLINE_MS;
  const normalized = validateAndNormalize(isbn);
  const candidates = new Map();
  let incomplete = false;
  let exactSearchComplete = Boolean(normalized);
  let sawHits = false;
  if (normalized) {
    for (const variant of [...new Set([normalized, ISBN.parse(normalized)?.isbn10].filter(Boolean))]) {
      try {
        const result = await search(library, variant, 'ISN', deadlineAt);
        sawHits ||= result.total > 0;
        incomplete ||= result.total > result.records.length;
        for (const row of result.records) candidates.set(row.recordId, row);
      } catch (error) {
        if (!candidates.size) throw error;
        incomplete = true; exactSearchComplete = false;
      }
    }
    incomplete ||= candidates.size > MAX_DETAILS;
    const books = [];
    for (const row of [...candidates.values()].slice(0, MAX_DETAILS)) {
      try {
        const value = await detail(library, row.recordId, deadlineAt);
        const observedIsbn = value.meta.isbn || row.isbn;
        if (observedIsbn !== normalized) { incomplete = true; continue; }
        books.push(parseVufindRecord(value.html, library, row.recordId, { confirmedMemberRecord: true, isbn: observedIsbn, matchKind: 'exact_isbn' }));
      } catch {
        incomplete = true;
        // COinS is bibliographic data attached to this scoped result, not query echo.
        if (row.isbn === normalized) books.push({ ...row, observation: { outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true,
          catalogUrl: recordUrl(library, row.recordId), catalogLinkKind: 'record', locations: [{ name: library.name, status: 'unknown' }] } });
      }
    }
    if (books.length) return aggregate(books, incomplete);
  }
  if (titleKey(title)) {
    const result = await search(library, title, 'Title', deadlineAt);
    const matches = result.records.filter(row => titleKey(row.title) === titleKey(title));
    const exactBooks = [];
    let partial = result.total > result.records.length || matches.length > 2;
    for (const row of matches.slice(0, 2)) {
      try {
        const value = await detail(library, row.recordId, deadlineAt);
        const observedIsbn = value.meta.isbn || row.isbn;
        if (normalized && observedIsbn === normalized) exactBooks.push(parseVufindRecord(value.html, library, row.recordId, { confirmedMemberRecord: true, isbn: observedIsbn, matchKind: 'exact_isbn' }));
        else if (!observedIsbn) partial = true;
      } catch { partial = true; }
    }
    if (exactBooks.length) return aggregate(exactBooks, partial);
    // A title match alone cannot establish circulation for the scanned edition.
    if (matches.length) return { outcome: 'in_catalog', matchKind: 'possible_match', catalogUrl: recordUrl(library, matches[0].recordId), catalogLinkKind: 'record' };
  }
  if (normalized && exactSearchComplete && !sawHits) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true, catalogUrl: vufindSearchUrl(library, normalized, 'ISN'), catalogLinkKind: 'search' };
  throw catalogError('VuFind holdings could not be confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
}
