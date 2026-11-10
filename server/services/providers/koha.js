import { decode, text, attrs, markupOnly, contents } from './catalogHtml.js';
import { cachedTask, getJson, getText, DEFAULT_TIMEOUT_MS } from './http.js';
import { normalizeAvailability, notFound, unknown } from './contract.js';
import { validateAndNormalize } from '../isbn.js';
import { publicCatalogOrigin } from './publicCatalogOrigin.js';
import ISBN from 'isbn3';
import { kohaCatalogOrigin } from './kohaOrigin.js';
import { firstIsbn, bibliographicMaterialType } from './catalogMarkup.js';

export function parseBiblioNumber(response) {
  const location = response.headers?.get?.('location') || response.url || '';
  const redirect = location.match(/[?&]biblionumber=(\d+)/i);
  if (redirect) return redirect[1];
  const link = response.text?.match(/opac-detail\.pl\?biblionumber=(\d+)/i);
  return link?.[1] || null;
}

function zeroOrNull(value) {
  return value == null || value === 0 || value === '0';
}

function available(item) {
  return item.checked_out_date == null
    && zeroOrNull(item.effective_not_for_loan_status)
    && zeroOrNull(item.lost_status ?? item.lost)
    && zeroOrNull(item.withdrawn)
    && zeroOrNull(item.damaged_status ?? item.damaged);
}

export async function checkAvailability(library, isbn) {
  const base = library.baseUrl.replace(/\/$/, '');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const key = `availability:koha:${library.slug || base}:${isbn}`;
  try {
    return await cachedTask(key, async () => {
      const search = await getText(`${base}/cgi-bin/koha/opac-search.pl?idx=nb&q=${encodeURIComponent(isbn)}`, { redirect: 'manual', deadlineAt });
      if (!search.ok && !(search.status >= 300 && search.status < 400)) return unknown();
      const number = parseBiblioNumber(search);
      if (!number) return notFound();
      const detailUrl = `${base}/cgi-bin/koha/opac-detail.pl?biblionumber=${number}`;
      const [itemsResponse, branchesResponse] = await Promise.all([
        getJson(`${base}/api/v1/public/biblios/${number}/items`, { deadlineAt }),
        getJson(`${base}/api/v1/public/libraries?_per_page=-1`, { cacheKey: `${base}:branches`, cacheTtlMs: 24 * 60 * 60 * 1000, deadlineAt }),
      ]);
      if (!itemsResponse.ok || itemsResponse.unreadable || !Array.isArray(itemsResponse.json)) return unknown({ url: detailUrl, metadataId: number });
      const items = itemsResponse.json;
      const branchData = branchesResponse.ok && !branchesResponse.unreadable
        ? (Array.isArray(branchesResponse.json) ? branchesResponse.json : branchesResponse.json?.libraries || []) : [];
      const names = new Map(branchData.map((branch) => [branch.library_id || branch.libraryId || branch.homebranch, branch.name || branch.library_name]));
      const availableItems = items.filter(available);
      const branchFor = (item) => names.get(item.home_library_id || item.homebranch || item.holdingbranch)
        || item?.branchname || item?.home_library_id || item?.homebranch || null;
      return normalizeAvailability({ status: availableItems.length ? 'available' : 'checked_out', branch: branchFor(availableItems[0] || items[0]), copies: items.length, availableCopies: availableItems.length, heldCopies: 0, callNumber: items[0]?.callnumber || items[0]?.itemcallnumber || null, url: detailUrl, metadataId: number });
    }, { deadlineAt, shouldCache: (value) => value.status !== 'unknown' });
  } catch (err) {
    console.error('Koha availability check failed:', err.message);
    return unknown();
  }
}


function publicError(code, message) {
  return Object.assign(new Error(message), { code });
}

function ownsIsbn(html, isbn) {
  const fields = [...html.matchAll(/<span\b([^>]*)>/gi)].filter((span) => {
    const classes = (attrs(span[1]).class || '').split(/\s+/);
    return classes.includes('results_summary') && classes.includes('isbn');
  });
  // A second ISBN summary may belong to a related record. Without a unique
  // record-owned field, do not combine one record's identifier with another's copies.
  if (fields.length !== 1) return false;
  const value = text(contents(html, fields[0], 'span'));
  const candidates = value.match(/\b(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])\b/g) || [];
  return candidates.some((candidate) => validateAndNormalize(candidate) === isbn);
}

function hasNonUnitSpan(attributes) {
  const values = attrs(attributes);
  return ['colspan', 'rowspan'].some((name) => values[name] !== undefined && values[name] !== '1');
}

function exactUnknown() {
  return { outcome: 'unknown', matchKind: 'exact_isbn', recognizedExact: true };
}

function incompleteListing(html, table, tableAttrs) {
  if (tableAttrs['data-server-side'] === 'true' || tableAttrs['data-ajax']) return true;
  for (const tag of `${table} ${html}`.matchAll(/<(?:a|div|span|nav|button)\b([^>]*)>/gi)) {
    const value = attrs(tag[1]);
    if (/\b(?:pagination|paginator|pager|paginate_button)\b/i.test(value.class || '')) return true;
    if (value['aria-controls'] === 'holdingst' && /(?:next|previous|last|first|paginate)/i.test(`${value.id || ''} ${value.class || ''}`)) return true;
    if (/\b(?:next|prev|previous)\b/i.test(value.rel || '')) return true;
  }
  return false;
}

function statusOf(status, itemType, shelvingLocation) {
  if (/^not for loan\b|^reference only$|^library use only$/i.test(status)
      || /\breference\b/i.test(itemType) || /\breference\b|\bnot for loan\b/i.test(shelvingLocation)) return 'restricted';
  if (/^available$/i.test(status)) return 'available';
  if (/^checked out$/i.test(status)) return 'unavailable';
  return 'unknown';
}

function rollup(rows) {
  if (rows.some((row) => row.status === 'available')) return 'available';
  return rows.some((row) => row.status === 'unavailable') && rows.every((row) => ['unavailable', 'restricted'].includes(row.status)) ? 'unavailable' : 'unknown';
}

function callNumber(html) {
  const withoutBrowse = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (tag, attributes, label) =>
    /shelfbrowse_itemnumber=/.test(attrs(attributes).href || '') || /^browse shelf/i.test(text(label)) ? '' : tag);
  return text(withoutBrowse).replace(/\s*\(\s*\)\s*$/, '').trim();
}

export function parseKohaPublicRecord(html, value, scope = {}) {
  const isbn = validateAndNormalize(value);
  const markup = markupOnly(html);
  const legacyIsbn = scope.kohaLegacyHoldings === true && [...markup.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi)].filter(m => attrs(m[1]).property === 'isbn').some(m => validateAndNormalize(text(m[2])) === isbn);
  if (!isbn || !(ownsIsbn(markup, isbn) || legacyIsbn)) return null;
  return parseHoldings(markup, { matchKind: 'exact_isbn', recognizedExact: true }, scope);
}

function parseHoldings(markup, identity, scope = {}) {
  const library = scope;
  const unconfirmed = () => ({ outcome: 'unknown', ...identity });
  const tables = [...markup.matchAll(/<table\b([^>]*)>/gi)].filter((match) => attrs(match[1]).id === 'holdingst' || scope.kohaLegacyHoldings === true && (attrs(match[1]).class || '').split(/\s+/).includes('holdingst'));
  if (tables.length === 0 && !/<table\b/i.test(markup)) {
    const empty = [...markup.matchAll(/<div\b([^>]*)>/gi)].filter(match => attrs(match[1]).id === 'noitems');
    if (empty.length === 1 && text(contents(markup, empty[0], 'div')) === 'No physical items for this record') return { ...unconfirmed(), totalCopies: 0, availableCopies: 0, locations: [] };
  }
  if (tables.length !== 1 || /<table\b[^>]*\bid=["']otherholdingst["']/i.test(markup)) return unconfirmed();
  const table = contents(markup, tables[0], 'table');
  if (table === null || /<table\b/i.test(table)) return null;
  if (incompleteListing(markup, table, attrs(tables[0][1]))) return unconfirmed();
  const headers = [...table.matchAll(/<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/gi)];
  const bodies = [...table.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/gi)];
  if (headers.length !== 1 || bodies.length !== 1) return null;
  const header = headers[0][1], body = bodies[0][1];
  const unparsedBody = body.replace(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi, '');
  if (text(unparsedBody) || /<(?:tr|td|th)\b/i.test(unparsedBody)) return unconfirmed();
  const headerRows = [...header.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)].filter((row) => /<th\b/i.test(row[1]));
  if (headerRows.length !== 1) return null;
  const headerCells = [...headerRows[0][1].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th\s*>/gi)];
  if (headerCells.some((cell) => hasNonUnitSpan(cell[1]))) return null;
  const columns = headerCells.map((cell) => text(cell[2]).toLowerCase());
  // Some Koha catalogs use "Current location" for the holdings location.
  // When both columns exist, retain the library rather than its shelving location.
  const locationColumn = columns.includes('current library') ? 'current library' : columns.includes('current location') ? 'current location' : 'home library';
  if ([locationColumn, 'status'].some((name) => columns.filter((column) => column === name).length !== 1)) return null;
  const rows = [];
  for (const row of body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)) {
    if (/<tr\b/i.test(row[2])) return unconfirmed();
    const rowAttrs = attrs(row[1]);
    if (Object.hasOwn(rowAttrs, 'hidden') || rowAttrs['aria-hidden'] === 'true' || /display\s*:\s*none/i.test(rowAttrs.style || '')) {
      if (text(row[2])) return unconfirmed();
      continue;
    }
    const cells = [...row[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)];
    if (!cells.length) continue;
    if (cells.length !== columns.length || cells.some((cell) => hasNonUnitSpan(cell[1]))) return unconfirmed();
    const cell = (name) => cells[columns.indexOf(name)]?.[2] || '';
    const libraryName = text(cell(locationColumn));
    if (!libraryName) return null;
    if (scope.libraryName) {
      const names = [...cell(locationColumn).matchAll(/<a\b([^>]*)>/gi)]
        .map((tag) => attrs(tag[1])['data-name']).filter(Boolean);
      // A shared Koha instance can contain collections with different access
      // rules. Require explicit branch identity; never use a text prefix match.
      if (names.length !== 1) return unconfirmed();
      if (names[0] !== scope.libraryName) continue;
    }
    if (scope.kohaBranchCode && !scope.libraryName) {
      if (!scope.kohaBranchName || locationColumn === 'home library' && !scope.kohaHomeLibraryOwnership) return unconfirmed();
      const locationMarkup = cell(locationColumn).replace(/<span\b([^>]*)>[\s\S]*?<\/span\s*>/gi,
        (whole, attributes) => (attrs(attributes).class || '').split(/\s+/).includes('shelvingloc') ? '' : whole)
        .replace(/<div\b([^>]*)>[\s\S]*?<\/div\s*>/gi,
          (whole, attributes) => (attrs(attributes).class || '').split(/\s+/).includes('branch-info-tooltip') ? '' : whole);
      const key = v => v.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      if (key(text(locationMarkup)) !== key(scope.kohaBranchName)) continue;
    }
    const shelf = text(cell('shelving location'));
    const name = locationColumn === 'home library' ? `${libraryName} (home library)` : shelf && !libraryName.includes(shelf) ? `${libraryName} · ${shelf}` : libraryName;
    const format = text(cell('item type'));
    // Some reviewed union catalogs publish ownership, but omit current location.
    // The home-library row proves a holding, not where a borrowable copy is now.
    const ownershipOnly = library.kohaBranchCode && locationColumn === 'home library';
    rows.push({ name, status: ownershipOnly ? 'unknown' : statusOf(text(cell('status')), format, text(cell('shelving location'))), callNumber: callNumber(cell('call number')), format });
  }
  if (!rows.length) return unconfirmed();
  const status = rollup(rows);
  const result = { outcome: status === 'unavailable' ? 'none_available' : status,
    ...identity, totalCopies: rows.length, locations: [] };
  const restricted = rows.filter((row) => row.status === 'restricted').length;
  if (restricted) result.notForLoanCopies = restricted;
  if (rows.every((row) => row.status === 'restricted')) result.loanRestriction = 'not_for_loan';
  // A reference copy is a physical holding, but is never counted as borrowable.
  // Unknown lending states prevent an exact available-copy count.
  if (rows.every((row) => row.status !== 'unknown') && rows.some((row) => row.status !== 'restricted')) {
    result.availableCopies = rows.filter((row) => row.status === 'available').length;
  }
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.name)) groups.set(row.name, []);
    groups.get(row.name).push(row);
  }
  for (const [name, grouped] of groups) {
    const location = { name, status: rollup(grouped), totalCopies: grouped.length };
    const restricted = grouped.filter((row) => row.status === 'restricted').length;
    if (restricted) location.notForLoanCopies = restricted;
    if (grouped.every((row) => row.status !== 'unknown') && grouped.some((row) => row.status !== 'restricted')) {
      location.availableCopies = grouped.filter((row) => row.status === 'available').length;
    }
    result.locations.push(location);
  }
  const callNumbers = new Set(rows.map((row) => row.callNumber).filter(Boolean));
  if (callNumbers.size === 1) result.callNumber = [...callNumbers][0];
  const formats = [...new Set(rows.map((row) => row.format).filter(Boolean))];
  if (formats.length) result.format = formats.join(' / ');
  return result;
}

function configuration(library) {
  // Older directory rows retain only the public catalog link. Derive a base
  // from that configured link, while keeping HTTP pins and origin checks.
  let configured = library;
  if (!library.baseUrl && library.catalogUrl) {
    try { configured = { ...library, baseUrl: new URL(library.catalogUrl).origin }; } catch { /* Reject invalid configuration below. */ }
  }
  const base = kohaCatalogOrigin(configured) || publicCatalogOrigin(configured);
  if (!base) throw publicError('CATALOG_CONFIGURATION_REQUIRED', 'Koha requires a reviewed public catalog origin');
  return base;
}

function catalogDeadline(library) {
  const timeout = library.publicCatalogTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (![30_000, 45_000, 60_000].includes(timeout)) throw publicError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid catalog time budget');
  return Date.now() + timeout;
}

function branchScope(library) {
  if (!library.kohaBranchCode && !library.kohaBranchName) return {};
  if (!/^[A-Z0-9_-]{1,32}$/.test(library.kohaBranchCode || '') || !library.kohaBranchName) {
    throw publicError('CATALOG_CONFIGURATION_REQUIRED', 'Koha branch scope is incomplete');
  }
  return { libraryName: library.kohaBranchName };
}

export function scopeSearch(url, library) {
  if (library.kohaBranchCode) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(library.kohaBranchCode)) throw publicError('CATALOG_CONFIGURATION_REQUIRED', 'Invalid catalog branch');
    if (!library.kohaSearchUnscoped) url.searchParams.set(library.kohaLegacyHoldings ? 'branch_group_limit' : 'limit', `branch:${library.kohaBranchCode}`);
  }
  return url;
}



export function parseExpandedKohaCatalogSearch(html, searchUrl, limit = 10, { preserveEmptyTitles = false } = {}) {
  const clean = markupOnly(html), books = new Map();
  const isResults = [...clean.matchAll(/<body\b([^>]*)>/gi)].some(m => attrs(m[1]).id === 'results');
  if (!isResults) throw publicError('CATALOG_UNRECOGNIZED', 'Unrecognized catalog search');
  for (const m of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]);
    if (!(a.class || '').split(/\s+/).includes('title') || !/opac-(?:MARC)?detail\.pl/i.test(a.href || '')) continue;
    // Some public catalogs select their MARC display as the native result
    // link. The same scoped biblionumber remains the bibliographic identity.
    const nativeUrl = new URL(decode(a.href), searchUrl);
    if (!['/cgi-bin/koha/opac-detail.pl','/cgi-bin/koha/opac-MARCdetail.pl'].includes(nativeUrl.pathname)) throw publicError('CATALOG_UNRECOGNIZED', 'Koha returned an unrecognized record display');
    const canonical = new URL(nativeUrl);canonical.pathname = '/cgi-bin/koha/opac-detail.pl';
    const url = detailUrl(canonical.toString(), searchUrl), recordId = url.searchParams.get('biblionumber');
    const title = text(m[2]).slice(0, 500);
    // Audit pages retain an explicitly untitled native row for fidelity and
    // rejection evidence. Ordinary app search continues to omit untitled rows.
    if (title || preserveEmptyTitles) books.set(recordId, { recordId, title, authors: [], ...(!title ? { metadataWarnings: ['missing_title'] } : {}) });
  }
  if (!books.size && !/No results found!/i.test(text(clean))) throw publicError('CATALOG_UNRECOGNIZED', 'Missing catalog search results');
  return [...books.values()].slice(0, limit);
}

export async function searchNativeCatalog(library, query, { offset = 0 } = {}) {
  const url = scopeSearch(new URL('/cgi-bin/koha/opac-search.pl', configuration(library)), library);
  url.searchParams.set('idx', 'kw'); url.searchParams.set('q', query);
  if (offset) url.searchParams.set('offset', String(offset));
  const response = await publicRead(url, catalogDeadline(library), { allowRecordSelection: true });
  if (response.status === 302) {
    const target = detailUrl(response.headers.get('location'), url);
    return { records: [await resolveCatalogRecord(library, target.searchParams.get('biblionumber'))], total: 1, hasMore: false };
  }
  const records = parseExpandedKohaCatalogSearch(response.text, url, Infinity, { preserveEmptyTitles: true });
  const plain = text(markupOnly(response.text));
  const totalMatch = plain.match(/Your search returned\s+([\d,]+)\s+results?/i);
  const total = totalMatch ? Number(totalMatch[1].replaceAll(',', '')) : !records.length ? 0 : null;
  let nextOffset;
  for (const m of response.text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]); if (!a.href || !(/\bnext\b/i.test(`${a.rel || ''} ${a.title || ''} ${text(m[2])}`))) continue;
    const next = new URL(a.href, url);
    const n = Number(next.searchParams.get('offset'));
    if (next.origin === url.origin && next.pathname === url.pathname && Number.isSafeInteger(n) && n > offset) nextOffset = n;
  }
  const hasMore = nextOffset != null ? true : total == null ? null : total > offset + records.length;
  return { records, total, hasMore, nextOffset, continuationUnsupported: hasMore === true && nextOffset == null };
}

export async function searchCatalog(library, query) {
  const url = scopeSearch(new URL('/cgi-bin/koha/opac-search.pl', configuration(library)), library);
  url.searchParams.set('idx', 'kw'); url.searchParams.set('q', query);
  const deadlineAt = catalogDeadline(library);
  return cachedTask(`koha:search:${url}:${library.kohaBranchCode || ''}`, async () => {
    const response = await publicRead(url, deadlineAt, { allowRecordSelection: true });
    if (response.status === 302) {
      const target = detailUrl(response.headers.get('location'), url);
      return [await resolveCatalogRecord(library, target.searchParams.get('biblionumber'))];
    }
    const records = parseExpandedKohaCatalogSearch(response.text, url);
    if (!library.kohaSearchUnscoped || !library.kohaBranchCode || !records.length) return records;
    const owned = [];
    for (const record of records) {
      if (Date.now() >= deadlineAt) break;
      try { owned.push(await resolveCatalogRecord(library, record.recordId, { deadlineAt })); }
      catch { /* An unreadable or different member's record proves no absence. */ }
    }
    if (!owned.length) throw publicError('CATALOG_UNRECOGNIZED', 'The first catalog results did not confirm this library’s holdings');
    return owned;
  }, { deadlineAt });
}

export async function resolveCatalogRecord(library, recordId, options = {}) {
  if (!/^\d{1,20}$/.test(recordId)) throw publicError('CATALOG_UNRECOGNIZED', 'Invalid catalog record');
  const url = new URL('/cgi-bin/koha/opac-detail.pl', configuration(library));
  url.searchParams.set('biblionumber', recordId);
  const deadlineAt = options.deadlineAt || catalogDeadline(library);
  return cachedTask(`koha:record:${url}:${library.kohaBranchCode || ''}`, async () => {
    let response = await publicRead(url, deadlineAt);
    const expanded = allItemsUrl(response.text, url);
    if (expanded) response = await publicRead(expanded, deadlineAt);
    const clean = markupOnly(response.text);
    const heading = [...clean.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)].find(m =>
      (attrs(m[1]).class || '').split(/\s+/).includes('title') || attrs(m[1]).property === 'name');
    const title = text(heading?.[2]).slice(0, 500);
    const fields = [...clean.matchAll(/<span\b([^>]*)>/gi)].filter(m => {
      const a = attrs(m[1]); return a.property === 'isbn' || (a.class || '').split(/\s+/).includes('isbn');
    });
    const isbn = fields.map(m => firstIsbn(contents(clean, m, 'span'))).find(Boolean) || null;
    const authors = [...new Set([...clean.matchAll(/<(a|span)\b([^>]*)>/gi)].flatMap(m => {
      const a = attrs(m[2]);
      return a.property === 'author' || a.property === 'contributor' || /(?:^|\s)author(?:\s|$)/.test(a.class || '')
        || /(?:[?&]q=au[,:]|[?&]idx=au)/i.test(a.href || '') ? [text(contents(clean, m, m[1])).slice(0, 240)] : [];
    }).filter(Boolean))];
    const observation = parseHoldings(clean, { matchKind: 'verified_work', recognizedExact: true }, library);
    if (!title || !observation || (library.kohaBranchCode && !observation.totalCopies)) throw publicError('CATALOG_UNRECOGNIZED', 'Catalog did not confirm this branch’s record');
    const materialType = bibliographicMaterialType(clean);
    return { recordId, title, authors, isbn, ...(materialType ? { materialType } : {}), catalogUrl: url.toString(), observation: {
      ...observation, outcome: observation.outcome === 'unknown' && observation.totalCopies > 0 ? 'in_catalog' : observation.outcome,
      ...(materialType ? { materialType } : {}),
      matchKind: 'verified_work', catalogUrl: url.toString() } };
  }, { deadlineAt });
}

function detailUrl(href, searchUrl) {
  try {
    const parsed = new URL(decode(href), searchUrl);
    const numbers = parsed.searchParams.getAll('biblionumber');
    if (parsed.protocol !== searchUrl.protocol || parsed.origin !== searchUrl.origin || parsed.username || parsed.password
        || parsed.pathname !== '/cgi-bin/koha/opac-detail.pl' || numbers.length !== 1 || !/^\d+$/.test(numbers[0])) throw new Error();
    // Reconstruct the public read, discarding unrelated query parameters.
    const result = new URL('/cgi-bin/koha/opac-detail.pl', searchUrl);
    result.searchParams.set('biblionumber', numbers[0].replace(/^0+(?=\d)/, ''));
    return result;
  } catch {
    throw publicError('CATALOG_UNRECOGNIZED', 'Koha returned an unsafe or unrecognized record link');
  }
}

function allItemsUrl(html, recordUrl) {
  const urls = new Set();
  for (const link of markupOnly(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    if (!/^(?:View all the physical items\.?|Click here to view them all\.)$/i.test(text(link[2]))) continue;
    try {
      const candidate = new URL(attrs(link[1]).href, recordUrl);
      if (candidate.searchParams.getAll('viewallitems').length !== 1 || candidate.searchParams.get('viewallitems') !== '1') continue;
      const canonical = detailUrl(candidate.toString(), recordUrl);
      if (canonical.toString() !== recordUrl.toString()) continue;
      canonical.searchParams.set('viewallitems', '1');
      urls.add(canonical.toString());
    } catch { /* Unrecognized links never expand the read surface. */ }
  }
  return urls.size === 1 ? new URL([...urls][0]) : null;
}

const MAX_PUBLIC_RECORDS = 8;

function recordsFromSearch(response, searchUrl) {
  if (response.status === 302) return { urls: [detailUrl(response.headers?.get?.('location'), searchUrl)], complete: true };
  const markup = markupOnly(response.text);
  const partial = incompleteListing(markup, '', {});
  const headings = [...markup.matchAll(/<(h1|p)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)]
    .filter((heading) => attrs(heading[2]).id === 'numresults');
  const heading = headings.length === 1 ? text(headings[0][3]) : '';
  const isResultsPage = [...markup.matchAll(/<body\b([^>]*)>/gi)].some((body) => attrs(body[1]).id === 'results');
  const hrefs = [...markup.matchAll(/<a\b([^>]*)>/gi)].map((match) => attrs(match[1]).href)
    .filter((href) => href && /opac-detail\.pl/i.test(href));
  const urls = [...new Set(hrefs.map((href) => detailUrl(href, searchUrl).toString()))];
  // Older Koha/IDEAL themes put the empty message in maincontent instead
  // of h1#numresults. Require the results body, explicit main-region message,
  // and no record links; a footer/query echo must never prove an empty search.
  const main = [...markup.matchAll(/<div\b([^>]*)>/gi)]
    .find((opening) => (attrs(opening[1]).class || '').split(/\s+/).includes('maincontent'));
  const mainMarkup = main ? contents(markup, main, 'div') || '' : '';
  const legacyEmpty = /<strong\b[^>]*>\s*No results found!\s*<\/strong\s*>/i.test(mainMarkup)
    && /No results found for that in .+ catalog\./i.test(text(mainMarkup));
  if (!partial && !urls.length && isResultsPage && (/^No results found!$/i.test(heading) || (headings.length <= 1 && !heading && legacyEmpty))) return { urls: [], complete: true };
  // Read a bounded first page even when more records exist. Each record must
  // independently prove its ISBN and branch; only a complete listing can
  // produce aggregate counts or none-available status.
  const count = heading.match(/^Your search returned (\d+) results?\./i);
  if (!urls.length || ((urls.length > 1 || partial) && (!isResultsPage || !count))
      || (count && Number(count[1]) < urls.length)) {
    throw publicError('CATALOG_UNRECOGNIZED', 'Koha did not prove a bounded record listing');
  }
  return { urls: urls.slice(0, MAX_PUBLIC_RECORDS).map((url) => new URL(url)),
    complete: !partial && urls.length <= MAX_PUBLIC_RECORDS && (!count || Number(count[1]) === urls.length) };
}


function isEmptySearch(markup, searchUrl) {
  const bodies = [...markup.matchAll(/<body\b([^>]*)>/gi)];
  const headings = [...markup.matchAll(/<h1\b([^>]*)>/gi)].filter((tag) => attrs(tag[1]).id === 'numresults');
  if (bodies.length !== 1 || attrs(bodies[0][1]).id !== 'results' || headings.length !== 1
      || text(contents(markup, headings[0], 'h1')) !== 'No results found!') return false;
  // The captured Koha empty-results page includes a record of the ISBN search
  // in its same-origin RSS link. A generic empty page or echoed text is insufficient.
  return [...markup.matchAll(/<a\b([^>]*)>/gi)].some((tag) => {
    try {
      const url = new URL(attrs(tag[1]).href, searchUrl);
      return url.origin === searchUrl.origin && url.pathname === searchUrl.pathname
        && ['format', 'idx', 'q'].every((key) => url.searchParams.getAll(key).length === 1)
        && url.searchParams.get('format') === 'rss' && url.searchParams.get('idx') === searchUrl.searchParams.get('idx')
        && url.searchParams.get('q')?.replace(/^"|"$/g, '') === searchUrl.searchParams.get('q');
    } catch { return false; }
  });
}

function isbn10For(isbn13) {
  if (!isbn13.startsWith('978')) return null;
  const digits = isbn13.slice(3, 12);
  const sum = [...digits].reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
  const check = (11 - sum % 11) % 11;
  return digits + (check === 10 ? 'X' : String(check));
}

function recordTitle(html) {
  const markup = markupOnly(html);
  const titles = [...markup.matchAll(/<h1\b([^>]*)>/gi)].filter((tag) => (attrs(tag[1]).class || '').split(/\s+/).includes('title'));
  if (titles.length !== 1) return null;
  return catalogTitle(contents(markup, titles[0], 'h1')) || null;
}

function recordIdentity(html) {
  const markup = markupOnly(html);
  const title = recordTitle(markup)?.toLowerCase();
  const volumes = [...markup.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)]
    .filter((cell) => (attrs(cell[1]).class || '').split(/\s+/).includes('vol_info'))
    .map((cell) => text(cell[2]).toLowerCase()).filter(Boolean);
  return JSON.stringify([title || '', [...new Set(volumes)].sort()]);
}

function combineRecords(records) {
  const result = { ...exactUnknown(), catalogMatchCount: records.length };
  if (records[0].title && records.every(({ title }) => title === records[0].title)) result.catalogTitle = records[0].title;
  if (records.some(({ result }) => !Number.isInteger(result.totalCopies))) return result;
  const observations = records.map(({ result }) => result);
  const physical = records.filter(({ result }) => result.totalCopies > 0);
  const sameEditionAndVolume = physical.length > 0 && physical.every(({ identity }) => identity === physical[0].identity);
  result.totalCopies = observations.reduce((sum, row) => sum + row.totalCopies, 0);
  const restricted = observations.reduce((sum, row) => sum + (row.notForLoanCopies || 0), 0);
  if (restricted) result.notForLoanCopies = restricted;
  if (observations.every((row) => row.loanRestriction === 'not_for_loan')) result.loanRestriction = 'not_for_loan';
  // Shared set ISBNs can describe different volumes. Their physical holdings
  // are real, but an available volume cannot prove this particular book is available.
  if (sameEditionAndVolume) {
    if (observations.some((row) => row.outcome === 'available')) result.outcome = 'available';
    else if (observations.every((row) => row.outcome === 'none_available')) result.outcome = 'none_available';
    if (!result.loanRestriction && observations.every((row) => row.availableCopies !== undefined || row.loanRestriction === 'not_for_loan')) {
      result.availableCopies = observations.reduce((sum, row) => sum + (row.availableCopies || 0), 0);
    }
  }
  const groups = new Map();
  for (const row of observations.flatMap((record) => record.locations || [])) {
    if (!groups.has(row.name)) groups.set(row.name, []);
    groups.get(row.name).push(row);
  }
  result.locations = [...groups].map(([name, rows]) => ({ name,
    status: sameEditionAndVolume ? rollup(rows) : 'unknown',
    totalCopies: rows.reduce((sum, row) => sum + row.totalCopies, 0),
    ...(rows.some((row) => row.notForLoanCopies) ? { notForLoanCopies: rows.reduce((sum, row) => sum + (row.notForLoanCopies || 0), 0) } : {}),
    ...(sameEditionAndVolume && rows.every((row) => row.availableCopies !== undefined)
      ? { availableCopies: rows.reduce((sum, row) => sum + row.availableCopies, 0) } : {}),
  }));
  const callNumbers = new Set(observations.map((row) => row.callNumber));
  if (callNumbers.size === 1 && observations[0].callNumber) result.callNumber = observations[0].callNumber;
  const formats = [...new Set(observations.map((row) => row.format).filter(Boolean))];
  if (formats.length) result.format = formats.join(' / ');
  return result;
}

function isbnSearchUrl(base, isbn) {
  const url = new URL('/cgi-bin/koha/opac-search.pl', base);
  url.searchParams.set('idx', 'nb');
  url.searchParams.set('q', isbn);
  // Older catalogs may index only ISBN-10. Search both equivalent identifiers
  // in one standard Koha query, then deduplicate record URLs before reading.
  if (isbn.startsWith('978')) {
    const core = isbn.slice(3, 12);
    const sum = [...core].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
    const check = (11 - sum % 11) % 11;
    url.searchParams.append('op', 'or');
    url.searchParams.append('idx', 'nb');
    url.searchParams.append('q', core + (check === 10 ? 'X' : check));
  }
  return url;
}

function hyphenatedSearchUrl(base, isbn) {
  // Some Koha ISBN indexes preserve punctuation. Use assigned ISBN ranges,
  // not guessed hyphen positions, and independently validate every equivalent.
  const parsed = ISBN.parse(isbn);
  const values = [...new Set([parsed?.isbn13h, parsed?.isbn10h])]
    .filter((value) => typeof value === 'string' && value.includes('-') && validateAndNormalize(value) === isbn);
  if (!values.length) return null;
  const url = new URL('/cgi-bin/koha/opac-search.pl', base);
  for (const [index, value] of values.entries()) {
    if (index) url.searchParams.append('op', 'or');
    url.searchParams.append('idx', 'nb');
    url.searchParams.append('q', value);
  }
  return url;
}

function partialRecords(records, library) {
  // On shared catalogs an ISBN alone is insufficient: require an own-branch
  // holding before reporting catalog presence. Never use another branch.
  const own = records.filter(record => !library.kohaBranchCode || record.totalCopies > 0 || record.outcome === 'available');
  if (!own.length) return exactUnknown();
  const locations = new Map();
  for (const record of own) for (const location of record.locations || []) {
    const value = { name: location.name, status: location.status === 'available' ? 'available' : 'unknown' };
    if (!locations.has(value.name) || value.status === 'available') locations.set(value.name, value);
  }
  return { ...exactUnknown(), outcome: own.some(record => record.outcome === 'available') ? 'available' : 'in_catalog',
    locations: [...locations.values()] };
}

function requestFailure(error) {
  if (/^(?:CATALOG_|ROBOTS_|SOURCE_|PROVIDER_|UPSTREAM_|ORIGIN_)/.test(error?.code || '')) return error;
  const code = error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '') ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE';
  return publicError(code, 'Koha could not complete the public catalog request');
}

async function publicRead(url, deadlineAt, { allowRecordSelection = false } = {}) {
  let response;
  try {
    response = await getText(url.toString(), { deadlineAt, maxResponseBytes: 3 * 1024 * 1024, redirect: 'manual', retries: 0 });
  } catch (error) {
    throw requestFailure(error);
  }
  if ([401, 403, 429].includes(response.status) || /koha_fast_challenge|cf-chl-|anubis_challenge|anubis-challenge|<title>\s*(?:Just a moment|Making sure you)/i.test(response.text)) {
    throw publicError('CATALOG_PROVIDER_BLOCKED', 'Koha requires access that this public reader does not have');
  }
  if (response.url !== url.toString()) throw publicError('CATALOG_UNRECOGNIZED', 'Koha returned an unexpected catalog page');
  if (!response.ok && !(allowRecordSelection && response.status === 302)) throw publicError('CATALOG_UNAVAILABLE', `Koha returned HTTP ${response.status}`);
  return response;
}

function pilotRecordsFromSearch(response, searchUrl) {
  // A unique Koha ISBN result is an explicit 302 record selection. Read its
  // header, validate the destination, and make a separate bounded record GET.
  if (response.status === 302) return [detailUrl(response.headers?.get?.('location'), searchUrl)];
  const markup = markupOnly(response.text);
  if (incompleteListing(markup, '', {})) throw publicError('CATALOG_UNRECOGNIZED', 'Koha returned a partial search listing');
  const hrefs = [...markup.matchAll(/<a\b([^>]*)>/gi)].map((match) => attrs(match[1]).href)
    .filter((href) => href && /opac-detail\.pl/i.test(href));
  const urls = [...new Set(hrefs.map((href) => detailUrl(href, searchUrl).toString()))];
  if (urls.length === 0 && isEmptySearch(markup, searchUrl)) return [];
  const headings = [...markup.matchAll(/<h1\b([^>]*)>/gi)].filter((tag) => attrs(tag[1]).id === 'numresults');
  const count = headings.length === 1 && text(contents(markup, headings[0], 'h1')).match(/^Your search returned (\d+) results?\./);
  if (headings.length && (!count || Number(count[1]) !== urls.length)) {
    throw publicError('CATALOG_UNRECOGNIZED', 'Koha search count does not match its public record links');
  }
  if (urls.length === 1) return [new URL(urls[0])];
  // Duplicate records and separate volumes can share an ISBN. Only inspect a
  // bounded, explicitly complete result set; never take the first hit.
  if (urls.length < 2 || urls.length > 8 || !count || Number(count[1]) !== urls.length) {
    throw publicError('CATALOG_UNRECOGNIZED', 'Koha did not prove a complete bounded record result');
  }
  return urls.map((url) => new URL(url));
}

async function checkPilotAvailability(library, value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw publicError('CATALOG_EXACT_ISBN_REQUIRED', 'Koha availability requires a valid ISBN');
  const base = configuration(library);
  const searchUrl = scopeSearch(new URL('/cgi-bin/koha/opac-search.pl', base), library);
  searchUrl.searchParams.set('idx', 'nb');
  searchUrl.searchParams.set('q', isbn);
  const deadlineAt = catalogDeadline(library);
  try {
    return await cachedTask(`availability:koha:pilot:${base.origin}:${library.kohaBranchCode || ''}:${library.kohaBranchName || ''}:${isbn}`, async () => {
      let search = await publicRead(searchUrl, deadlineAt, { allowRecordSelection: true });
      let recordUrls = pilotRecordsFromSearch(search, searchUrl);
      const isbn10 = isbn10For(isbn);
      if (!recordUrls.length && isbn10) {
        searchUrl.searchParams.set('q', isbn10);
        search = await publicRead(searchUrl, deadlineAt, { allowRecordSelection: true });
        recordUrls = pilotRecordsFromSearch(search, searchUrl);
      }
      if (!recordUrls.length) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true,
        catalogUrl: searchUrl.toString(), catalogLinkKind: 'search' };
      const records = [];
      for (const recordUrl of recordUrls) {
        const record = await publicRead(recordUrl, deadlineAt);
        const result = parseKohaPublicRecord(record.text, isbn, branchScope(library));
        if (!result) throw publicError('CATALOG_UNRECOGNIZED', 'Koha did not prove this ISBN and its public holdings');
        const title = recordTitle(record.text);
        records.push({ result: { ...result, ...(title ? { catalogTitle: title } : {}) }, title, identity: recordIdentity(record.text) });
      }
      if (records.length === 1) return { ...records[0].result, catalogUrl: recordUrls[0].toString() };
      return { ...combineRecords(records), catalogUrl: searchUrl.toString(), catalogLinkKind: 'search' };
    }, { deadlineAt, shouldCache: (result) => result.outcome !== 'unknown' });
  } catch (error) {
    throw requestFailure(error);
  }
}

export async function checkPublicAvailability(library, value) {
  if (library.publicCatalogCapabilities?.titleSearch) return checkPilotAvailability(library, value);
  const isbn = validateAndNormalize(value);
  if (!isbn) throw publicError('CATALOG_EXACT_ISBN_REQUIRED', 'Koha availability requires a valid ISBN');
  const base = configuration(library);
  let searchUrl = scopeSearch(isbnSearchUrl(base, isbn), library);
  const deadlineAt = library.publicCatalogTimeoutMs ? catalogDeadline(library) : Date.now() + 60_000;
  try {
    return await cachedTask(`availability:koha:public:${base.origin}:${library.kohaBranchCode || ''}:${isbn}`, async () => {
      const search = await publicRead(searchUrl, deadlineAt, { allowRecordSelection: true });
      let listing = recordsFromSearch(search, searchUrl);
      let recordUrls = listing.urls;
      if (!recordUrls.length) {
        const fallback = hyphenatedSearchUrl(base, isbn);
        if (fallback) {
          searchUrl = scopeSearch(fallback, library);
          const retry = await publicRead(searchUrl, deadlineAt, { allowRecordSelection: true });
          listing = recordsFromSearch(retry, searchUrl);
          recordUrls = listing.urls;
        }
      }
      if (!recordUrls.length) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true,
        catalogUrl: searchUrl.toString(), catalogLinkKind: 'search' };
      const records = [];
      let partial = !listing.complete, lastError;
      for (const [index, recordUrl] of recordUrls.entries()) {
        try {
          const record = await publicRead(recordUrl, deadlineAt - 1000);
          let result = parseKohaPublicRecord(record.text, isbn, { ...library, ...(library.kohaStrictBranchIdentity ? branchScope(library) : {}) });
          if (!result) throw publicError('CATALOG_UNRECOGNIZED', 'Koha did not prove this ISBN and its public holdings');
          // Koha can collapse even a small holdings table behind this explicit
          // public link. Follow it once, for this exact record and origin only.
          const expanded = !Number.isInteger(result.totalCopies) && allItemsUrl(record.text, recordUrl);
          if (expanded) {
            const allItems = await publicRead(expanded, deadlineAt - 1000);
            result = parseKohaPublicRecord(allItems.text, isbn, { ...library, ...(library.kohaStrictBranchIdentity ? branchScope(library) : {}) });
            if (!result) throw publicError('CATALOG_UNRECOGNIZED', 'Koha expanded holdings did not prove this ISBN');
            recordUrls[index] = expanded;
          }
          records.push({ result: { ...result, ...(recordTitle(record.text) ? { catalogTitle: recordTitle(record.text) } : {}) }, title: recordTitle(record.text), identity: recordIdentity(record.text) });
          partial ||= !Number.isInteger(result.totalCopies);
          if (partial && result.outcome === 'available') break;
        } catch (error) {
          if (error.code === 'CATALOG_PROVIDER_BLOCKED') throw error;
          partial = true;
          lastError = error;
          if (Date.now() >= deadlineAt - 1000) break;
        }
      }
      if (!records.length) throw lastError || publicError('CATALOG_UNRECOGNIZED', 'No verified record was retrieved');
      const result = partial ? partialRecords(records.map(row => row.result), library) : records.length === 1 ? records[0].result : combineRecords(records);
      return recordUrls.length === 1 ? { ...result, catalogUrl: recordUrls[0].toString() }
        : { ...result, catalogUrl: searchUrl.toString(), catalogLinkKind: 'search' };
    }, { deadlineAt, shouldCache: (result) => result.outcome !== 'unknown' });
  } catch (error) {
    throw requestFailure(error);
  }
}

function catalogTitle(markup) {
  // Koha puts the statement of responsibility inside the title link. It is
  // author/cataloging metadata, sometimes even a repeated title, not a subtitle.
  let value = String(markup || '');
  const spans = [...value.matchAll(/<span\b([^>]*)>/gi)]
    .filter(tag => (attrs(tag[1]).class || '').split(/\s+/).includes('title_resp_stmt'));
  for (const span of spans.reverse()) {
    const inside = contents(value, span, 'span');
    if (inside !== null) value = value.slice(0, span.index) + value.slice(span.index + span[0].length + inside.length).replace(/^<\/span\s*>/i, '');
  }
  return text(value).replace(/\s+([:;,])/g, '$1').replace(/:\s*/g, ': ');
}

function catalogAuthors(markup) {
  const lists = [...markup.matchAll(/<(span|ul)\b([^>]*)>/gi)].filter((tag) => (attrs(tag[2]).class || '').split(/\s+/).includes('author'));
  if (lists.length !== 1) return [];
  const list = contents(markup, lists[0], lists[0][1]);
  return [...new Set([...String(list || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)].flatMap(li => {
    const anchor = li[1].match(/<a\b([^>]*)>/i);
    if (anchor) {
      try {
        const query = new URL(attrs(anchor[1]).href, 'https://catalog.invalid').searchParams.get('q');
        if (query && /^au:\s*["']*\s*$/.test(query)) return [];
      } catch { /* Use the visible author when the link cannot be parsed. */ }
    }
    return text(li[1]).replace(/^by\s+/i, '').replace(/^["“]+|["”]+$/g, '').trim();
  }).filter(Boolean))].slice(0, 20);
}

function catalogPublication(markup) {
  const result = {};
  for (const [field, className] of [['publisher', 'publisher_name'], ['publishedDate', 'publisher_date'], ['edition', 'edition']]) {
    const fields = [...markup.matchAll(/<(span|div)\b([^>]*)>/gi)].filter((tag) => (attrs(tag[2]).class || '').split(/\s+/).includes(className));
    const values = [...new Set(fields.map(tag => text(contents(markup, tag, tag[1])).replace(/^Edition:\s*/i, '')).filter(Boolean))];
    if (values.length !== 1) continue;
    const value = values[0].replace(/^["“]+|["”]+$/g, '');
    if (field === 'edition' && /^\d+[\s,]*(?:pages\b|p[.;:])/i.test(value)) continue;
    if (value) result[field] = value;
  }
  return result;
}

export function parseKohaCatalogRecord(html, recordId, scope = {}) {
  if (!/^[1-9]\d{0,11}$/.test(recordId)) return null;
  const markup = markupOnly(html);
  const bodies = [...markup.matchAll(/<body\b([^>]*)>/gi)];
  const owners = [...markup.matchAll(/<div\b([^>]*)>/gi)].filter((tag) => attrs(tag[1]).id === 'catalogue_detail_biblio');
  const identifiers = [...markup.matchAll(/<abbr\b([^>]*)>/gi)].filter((tag) => (attrs(tag[1]).class || '').split(/\s+/).includes('unapi-id'));
  // Query echoes and hidden login/export fields do not establish ownership.
  // Require the detail-page record container and its independent unAPI identity.
  if (bodies.length !== 1 || attrs(bodies[0][1]).id !== 'opac-detail' || owners.length !== 1
      || attrs(owners[0][1])['data-biblionumber'] !== recordId || identifiers.length !== 1
      || attrs(identifiers[0][1]).title !== `koha:biblionumber:${recordId}`) return null;
  const owner = contents(markup, owners[0], 'div');
  const title = recordTitle(owner);
  if (!owner || !title) return null;
  const isbnFields = [...owner.matchAll(/<span\b([^>]*)>/gi)].filter((tag) => {
    const classes = (attrs(tag[1]).class || '').split(/\s+/);
    return classes.includes('results_summary') && classes.includes('isbn');
  });
  const isbnText = isbnFields.length === 1 ? text(contents(owner, isbnFields[0], 'span')) : '';
  const isbn = (isbnText.match(/\b(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])\b/g) || []).map(validateAndNormalize).find(Boolean);
  const identity = { matchKind: 'catalog_record', recognizedRecord: true };
  const availability = parseHoldings(markup, identity, scope) || { outcome: 'unknown', ...identity };
  return { book: { recordId, title, authors: catalogAuthors(owner), ...catalogPublication(owner), ...(isbn ? { isbn13: isbn } : {}) }, availability };
}

function catalogSearchIsbn(markup, recordId, title) {
  const titleKey = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const covers = [...markup.matchAll(/<div\b([^>]*)>/gi)].filter(tag => {
    const values = attrs(tag[1]);
    return values['data-biblionumber'] === recordId && (values.class || '').split(/\s+/).includes('cover-slider')
      && titleKey(values['data-title'] || '') === titleKey(title);
  });
  if (covers.length !== 1) return null;
  // Some Koha templates repeat this attribute. Conflicting identifiers must
  // not be silently resolved by the HTML parser's last-attribute behavior.
  const values = [...covers[0][1].matchAll(/\bdata-isbn\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map(match => validateAndNormalize(match[1] ?? match[2])).filter(Boolean);
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : null;
}

export function parseKohaCatalogSearch(html, searchUrl, limit = 40) {
  const markup = markupOnly(html);
  const bodies = [...markup.matchAll(/<body\b([^>]*)>/gi)];
  if (bodies.length !== 1 || attrs(bodies[0][1]).id !== 'results') return null;
  if (isEmptySearch(markup, searchUrl)) return { records: [], hasMore: false };
  const headings = [...markup.matchAll(/<h1\b([^>]*)>/gi)].filter((tag) => attrs(tag[1]).id === 'numresults');
  const count = headings.length === 1 && text(contents(markup, headings[0], 'h1')).match(/^Your search returned (\d+) results?\./);
  if (!count || !Number.isSafeInteger(Number(count[1]))) return null;
  const summaries = [...markup.matchAll(/<div\b([^>]*)>/gi)].filter((tag) => /^title_summary_\d+$/.test(attrs(tag[1]).id || ''));
  const records = [];
  for (const summary of summaries) {
    const recordId = attrs(summary[1]).id.replace('title_summary_', '');
    if (!/^[1-9]\d{0,11}$/.test(recordId)) return null;
    const body = contents(markup, summary, 'div');
    if (body === null) return null;
    const titles = [...body.matchAll(/<a\b([^>]*)>/gi)].filter((tag) => (attrs(tag[1]).class || '').split(/\s+/).includes('title'));
    if (titles.length !== 1) return null;
    const url = detailUrl(attrs(titles[0][1]).href, searchUrl);
    const title = catalogTitle(contents(body, titles[0], 'a'));
    if (!title || url.searchParams.get('biblionumber') !== recordId || records.some((record) => record.recordId === recordId)) return null;
    const isbn13 = catalogSearchIsbn(markup, recordId, title);
    records.push({ recordId, title, authors: catalogAuthors(body), ...catalogPublication(body), ...(isbn13 ? { isbn13 } : {}) });
  }
  if (!records.length || records.length > Number(count[1])) return null;
  const offset = Number(searchUrl.searchParams.get('offset') || 0);
  const nextOffset = offset + Math.min(records.length, limit);
  const hasMore = Number(count[1]) > nextOffset;
  return { records: records.slice(0, limit), hasMore, ...(hasMore ? { nextOffset } : {}) };
}

async function readCatalogRecord(library, recordId, deadlineAt = catalogDeadline(library)) {
  const base = configuration(library);
  if (!/^[1-9]\d{0,11}$/.test(recordId)) throw publicError('CATALOG_UNRECOGNIZED', 'Invalid catalog record identity');
  const scope = branchScope(library);
  return cachedTask(`koha:record:${base.origin}:${library.kohaBranchCode || ''}:${scope.libraryName || ''}:${recordId}`, async () => {
    const url = detailUrl(`/cgi-bin/koha/opac-detail.pl?biblionumber=${recordId}`, base);
    const response = await publicRead(url, deadlineAt);
    const record = parseKohaCatalogRecord(response.text, recordId, scope);
    if (!record) throw publicError('CATALOG_UNRECOGNIZED', 'Koha did not prove this catalog record identity');
    return { ...record, availability: { ...record.availability, catalogUrl: url.toString() } };
  }, { deadlineAt, shouldCache: (record) => record.availability.outcome !== 'unknown' || record.availability.loanRestriction === 'not_for_loan' });
}

export async function searchPublicCatalog(library, query, { offset = 0 } = {}) {
  if (typeof query !== 'string' || !query.trim() || query.length > 160) throw publicError('CATALOG_UNRECOGNIZED', 'Invalid catalog search');
  const base = configuration(library);
  const scope = branchScope(library);
  const deadlineAt = catalogDeadline(library);
  return cachedTask(`koha:search:${base.origin}:${library.kohaBranchCode || ''}:${scope.libraryName || ''}:${Boolean(library.kohaTitleSearchFirst)}:${offset}:${query.trim()}`,
    () => searchPilotCatalog(library, query, base, deadlineAt, offset), { deadlineAt });
}

async function searchPilotCatalog(library, query, base, deadlineAt, offset) {
  const url = new URL('/cgi-bin/koha/opac-search.pl', base);
  url.searchParams.set('idx', library.kohaTitleSearchFirst ? 'ti' : 'kw');
  url.searchParams.set('q', query.trim());
  scopeSearch(url, library);
  url.searchParams.set('count', '40');
  if (offset) url.searchParams.set('offset', String(offset));
  // Some large shared catalogs time out on broad keyword ranking, while their
  // title index answers promptly. All attempts share the same time budget.
  for (const index of library.kohaTitleSearchFirst ? ['ti', 'au', 'kw'] : ['kw']) {
    url.searchParams.set('idx', index);
    const response = await publicRead(url, deadlineAt, { allowRecordSelection: true });
    if (response.status === 302) {
      const selected = detailUrl(response.headers.get('location'), url);
      const record = await readCatalogRecord(library, selected.searchParams.get('biblionumber'), deadlineAt);
      return { records: [record.book], hasMore: false };
    }
    const results = parseKohaCatalogSearch(response.text, url);
    if (!results) throw publicError('CATALOG_UNRECOGNIZED', 'Koha returned an unrecognized title search');
    if (results.records.length) return results;
  }
  return { records: [], hasMore: false };
}

export async function resolvePublicCatalogRecord(library, recordId) {
  const record = await readCatalogRecord(library, recordId);
  return { ...record.book, catalogUrl: record.availability.catalogUrl, observation: record.availability };
}

export async function checkPublicRecordAvailability(library, recordId) {
  return (await readCatalogRecord(library, recordId)).availability;
}
