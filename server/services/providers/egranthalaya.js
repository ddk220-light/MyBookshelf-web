import { cachedTask, catalogOperation, enqueueTask, getText, peekCachedTask } from './http.js';
import { firstIsbn } from './catalogMarkup.js';
import { cleanAuthor, cleanTitle } from './catalogText.js';
import { validateAndNormalize } from '../isbn.js';
import isbnRanges from './egranthalaya-isbn-ranges.json' with { type: 'json' };

const ORIGIN = 'https://eg4.nic.in';
const TIMEOUT_MS = 100_000;
const MEMBER_PROBE_MS = 15_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
// Search rows let a book open when its record page comes back empty. They hold
// only the row's own bibliographic fields, keyed by member and record ID.
const SEARCH_ROW_TTL_MS = 30 * 60_000;
let emptyRecordRetryMs = 2_000;
const BLOCKED_STATUSES = new Set([401, 403, 429]);
const refusedOrigins = new Set();
const AVAILABLE = new Set(['available']);
const UNAVAILABLE = new Set(['issued', 'on loan', 'checked out', 'not available', 'lost', 'missing', 'withdrawn']);

function providerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function decode(value = '') {
  return String(value).replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (entity, numeric, named) => {
    if (numeric) {
      const point = numeric[0].toLowerCase() === 'x' ? Number.parseInt(numeric.slice(1), 16) : Number(numeric);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[named.toLowerCase()];
  });
}

function text(html = '') {
  return decode(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attributes(tag) {
  const result = {};
  const pattern = /([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of tag.matchAll(pattern)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}

function withoutScripts(html) {
  return String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function tableById(html, id) {
  const openings = [...html.matchAll(/<table\b([^>]*)>/gi)];
  const opening = openings.find((match) => attributes(match[1]).id === id);
  if (!opening) return null;
  const start = opening.index + opening[0].length;
  let depth = 1;
  const tags = /<\/?table\b[^>]*>/gi;
  tags.lastIndex = start;
  let match;
  while ((match = tags.exec(html))) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index);
  }
  return null;
}

function withoutNestedTables(html) {
  const tags = /<\/?table\b[^>]*>/gi;
  let depth = 0, end = 0, output = '';
  for (const match of html.matchAll(tags)) {
    if (!/^<\//.test(match[0])) {
      if (depth === 0) output += html.slice(end, match.index);
      depth += 1;
    } else {
      depth -= 1;
      if (depth < 0) return null;
      if (depth === 0) end = match.index + match[0].length;
    }
  }
  return depth === 0 ? output + html.slice(end) : null;
}

function spanById(html, id) {
  for (const match of html.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi)) {
    if (attributes(match[1]).id === id) return text(match[2]);
  }
  return null;
}

function selectedOption(html, name) {
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi)) {
    if (attributes(match[1]).name !== name) continue;
    const options = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi)].map((option) => {
      const attrs = attributes(option[1]);
      return { value: attrs.value ?? text(option[2]), selected: Object.hasOwn(attrs, 'selected') };
    });
    return { options, selected: options.find((option) => option.selected)?.value ?? options[0]?.value };
  }
  return null;
}

// eG4's full-text ISBN index preserves stored punctuation. These official
// registration ranges cover Indian and English-language ISBNs, without a
// per-reader request to the ISBN Agency. Unsupported ranges use plain digits.
export function hyphenatedIsbn(value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) return null;
  for (const [prefix, rules] of Object.entries(isbnRanges.groups)) {
    const digits = prefix.replace('-', '');
    if (!isbn.startsWith(digits)) continue;
    const rest = isbn.slice(digits.length, -1);
    const key = rest.padEnd(7, '0').slice(0, 7);
    const rule = rules.find(([range]) => {
      const [start, end] = range.split('-');
      return key >= start && key <= end;
    });
    if (!rule || rule[1] === 0 || rule[1] >= rest.length) return null;
    return `${prefix}-${rest.slice(0, rule[1])}-${rest.slice(rule[1])}-${isbn.at(-1)}`;
  }
  return null;
}

export function searchForm(html, { libraryCode, query, clusterSearch = false }) {
  if (!/^[A-Z0-9_]{1,32}$/.test(libraryCode || '')) return null;
  const markup = withoutScripts(html);
  const form = markup.match(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/i);
  if (!form || attributes(form[1]).method?.toLowerCase() !== 'post') return null;
  const fields = new URLSearchParams();
  let hasSearchButton = false;
  for (const match of form[2].matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs.name || Object.hasOwn(attrs, 'disabled')) continue;
    const type = (attrs.type || 'text').toLowerCase();
    if (attrs.name === 'Basic_Search_Bttn' && type === 'submit') hasSearchButton = true;
    if (['submit', 'image', 'button', 'reset'].includes(type)) continue;
    if (['checkbox', 'radio'].includes(type) && !Object.hasOwn(attrs, 'checked')) continue;
    fields.set(attrs.name, attrs.value || '');
  }
  for (const match of form[2].matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select\s*>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs.name || Object.hasOwn(attrs, 'disabled')) continue;
    const selected = selectedOption(match[0], attrs.name)?.selected;
    if (selected !== undefined) fields.set(attrs.name, selected);
  }
  const libraries = selectedOption(form[2], 'DDL_Library');
  if (!hasSearchButton || !fields.get('__VIEWSTATE') || !fields.has('txt_Search')
      || !libraries?.options.some((option) => option.value === libraryCode)
      || (clusterSearch && !libraries.options.some((option) => option.value === 'All Libraries'))
      || !selectedOption(form[2], 'DDL_Field')?.options.some((option) => option.value === 'ALL')) return null;
  // Replay only anonymous search. Cluster mode is the current cluster only;
  // the separate cross-cluster union search and member login stay unused.
  for (const name of ['txtMemberNo', 'txtPassword', 'txt_captcha']) fields.set(name, '');
  fields.delete('AccordionPaneUnion_content$CB_Union');
  fields.set('AccordionPaneUnion_content$DDL_Clusters', '');
  fields.set('AccordionPaneUnion_content$DDL_ClusterLibraries', '');
  fields.set('__EVENTTARGET', '');
  fields.set('__EVENTARGUMENT', '');
  for (const [name, value] of Object.entries({
    DDL_Materials: 'Books', txt_Search: query, DDL_Field: 'ALL', DDL_Boolean: 'LIKE',
    DDL_OrderBy: 'TITLE', DDL_SortBy: 'ASC', DDL_Pages: '20', DDL_Library: clusterSearch ? 'All Libraries' : libraryCode,
    Basic_Search_Bttn: 'Search',
  })) fields.set(name, value);
  return fields;
}

function isbnInLabel(label, isbn) {
  if (!label) return false;
  const candidates = label.match(/97[89][\d\s-]{9,23}\d|\b\d[\d\s-]{7,17}[\dXx]\b/g) || [];
  return candidates.some((candidate) => validateAndNormalize(candidate.trim()) === isbn);
}

export function parseSearch(html, { isbn, libraryCode, clusterSearch = false, multipleRecords = false }) {
  const markup = withoutScripts(html);
  const libraries = selectedOption(markup, 'DDL_Library');
  if (libraries?.selected !== (clusterSearch ? 'All Libraries' : libraryCode)
      || !libraries.options.some((option) => option.value === libraryCode)) return null;
  const countText = spanById(markup, 'Label37');
  const count = countText?.match(/^Your Search Returned\s+(\d+)\s+Record\(s\)$/i);
  if (!count) return null;
  // A clean zero is still not proof of absence: eG4 records can omit ISBNs,
  // and this full-text index distinguishes hyphenated from plain ISBNs.
  if (Number(count[1]) === 0) {
    if (/\bid=["']Repeater1_(?:ISBNLbl|lnkDetails3)_\d+/i.test(markup)) return null;
    return { kind: 'empty' };
  }
  const matches = [];
  const rowIndexes = new Set();
  for (const match of markup.matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi)) {
    const id = attributes(match[1]).id?.match(/^Repeater1_ISBNLbl_(\d+)$/);
    if (!id) continue;
    const index = id[1];
    if (rowIndexes.has(index)) return null;
    rowIndexes.add(index);
    if (!isbnInLabel(text(match[2]), isbn)) continue;
    const anchors = [...markup.matchAll(/<a\b([^>]*)>/gi)];
    const link = anchors.map((anchor) => attributes(anchor[1])).find((attrs) => attrs.id === `Repeater1_lnkDetails3_${index}`);
    const record = link?.onclick?.match(/^(?:javascript:)?showValues\((\d+),\s*false\);\s*return false;?$/i);
    if (!record) return null;
    matches.push({ recordId: record[1], format: spanById(markup, `Repeater1_Lbl_Format_${index}`)?.replace(/^Format\/Medium:\s*/i, '') });
  }
  if (clusterSearch || multipleRecords) {
    // Exact records on a partial page can prove positive holdings. Keep the
    // incompleteness explicit and never infer exhaustive counts or absence.
    const complete = Number(count[1]) <= 20 && rowIndexes.size === Number(count[1]);
    const ids = new Set(matches.map((record) => record.recordId));
    return matches.length > 0 && ids.size === matches.length
      ? { kind: 'records', records: matches.slice(0, 4), ...(!complete || matches.length > 4 ? { partial: true } : {}) }
      : { kind: 'unconfirmed' };
  }
  // Avoid choosing one edition/record and implying that its copy counts cover
  // other matching records we did not fetch.
  return matches.length === 1 && Number(count[1]) <= 20 ? { kind: 'record', ...matches[0] } : { kind: 'unconfirmed' };
}

function statusFor(value) {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return AVAILABLE.has(normalized) ? 'available' : UNAVAILABLE.has(normalized) ? 'unavailable' : 'unknown';
}

function parseHoldingEvidence(html, { isbn, recordId, selectedRecord = false }) {
  const markup = withoutScripts(html);
  if (!selectedRecord && !isbnInLabel(spanById(markup, 'Lbl_ISBN'), isbn)) return null;
  const form = markup.match(/<form\b([^>]*)>/i);
  if (!form) return null;
  try {
    const action = new URL(attributes(form[1]).action, `${ORIGIN}/OPAC/`);
    if (action.origin !== ORIGIN || action.pathname !== '/OPAC/Details.aspx' || action.searchParams.get('ctr') !== recordId) return null;
  } catch { return null; }
  const table = tableById(markup, 'GridView1');
  if (!table) return null;
  const flatTable = withoutNestedTables(table);
  if (flatTable === null) return null;
  const rows = [...flatTable.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  const headers = rows.find((row) => /<th\b/i.test(row[1]));
  if (!headers) return null;
  const columns = [...headers[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)].map((cell) => text(cell[1]).toLowerCase());
  if (columns.filter((column) => column === 'library').length !== 1 || columns.filter((column) => column === 'status').length !== 1) return null;
  const holdings = [];
  let totalRows = 0;
  const expectedRows = text(table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1]).match(/^Total Holding Records\s*:\s*(\d+)$/i);
  const paginated = /__doPostBack[\s\S]{0,100}Page\$/i.test(table);
  for (const row of rows) {
    if (/<th\b/i.test(row[1])) continue;
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((cell) => text(cell[1]));
    if (!cells.length) continue;
    if (cells.length !== columns.length) {
      if (/Page\$/i.test(row[1])) continue;
      return null;
    }
    totalRows += 1;
    const value = (column) => cells[columns.indexOf(column)] || '';
    const libraryCode = value('library');
    if (!/^[A-Z0-9_]{1,32}$/.test(libraryCode)) return null;
    holdings.push({ libraryCode, status: statusFor(value('status')), location: value('location'), callNumber: [value('class no'), value('book no')].filter(Boolean).join(' ') });
  }
  return { holdings, complete: Boolean(!paginated && expectedRows && totalRows === Number(expectedRows[1])) };
}

function scopedHoldingResult(evidence, { libraryCode, libraryName, referenceOnly = false, format }) {
  if (!evidence) return null;
  const scoped = evidence.holdings.filter((row) => row.libraryCode === libraryCode);
  if (!scoped.length) return null;
  const available = scoped.filter((row) => row.status === 'available').length;
  const complete = evidence.complete && scoped.every((row) => row.status !== 'unknown');

  const locations = new Map();
  for (const row of scoped) {
    const name = row.location ? `${libraryName} — ${row.location}` : libraryName;
    const current = locations.get(name);
    if (!current || row.status === 'available' || (row.status === 'unknown' && current.status !== 'available')) locations.set(name, { name, status: row.status });
  }
  return {
    outcome: available ? 'available' : complete ? 'none_available' : 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true,
    ...(complete ? { availableCopies: available, totalCopies: scoped.length } : {}),
    ...(scoped[0].callNumber ? { callNumber: scoped[0].callNumber } : {}),
    format: referenceOnly ? `${format || 'Book'} (reference use only)` : format || 'Book',
    locations: [...locations.values()],
    // eG4's Details URL depends on its anonymous ASP.NET session. Let the
    // public service supply the durable cluster catalog handoff instead.
  };
}

export function parseHoldings(html, context) {
  return scopedHoldingResult(parseHoldingEvidence(html, context), context);
}

// eG4's Details.aspx often answers with the page frame for the right record
// but no bibliographic fields and no holdings table (seen on 10 of 13 reads in
// November 2026, in fresh and reused sessions). That page says nothing about
// the record: it is neither a changed layout nor evidence of absence.
export function isEmptyRecordPage(html, recordId) {
  const markup = withoutScripts(html);
  const form = markup.match(/<form\b([^>]*)>/i);
  if (!form) return false;
  try {
    const action = new URL(attributes(form[1]).action, `${ORIGIN}/OPAC/`);
    if (action.origin !== ORIGIN || action.pathname !== '/OPAC/Details.aspx' || action.searchParams.get('ctr') !== String(recordId)) return false;
  } catch { return false; }
  return spanById(markup, 'Lbl_TITLE') === '' && !tableById(markup, 'GridView1');
}

// Exposed for isolated provider tests only.
export function setEmptyRecordRetryDelayForTests(ms) {
  emptyRecordRetryMs = ms;
}

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms); });

function detailUrlFor(recordId) {
  const url = new URL('/OPAC/Details.aspx', ORIGIN);
  for (const [name, value] of Object.entries({ ctr: recordId, isChecked: 'false', cluster: '', library: '' })) url.searchParams.set(name, value);
  return url.toString();
}

// Read one record page, asking once more after a short pause when it comes
// back empty. The second read is skipped when the check's request budget or
// deadline has no room for it; a still-empty page is reported as `empty`.
async function readRecordPage(recordId, { url, cookie, options }) {
  const read = async () => {
    blocked();
    const response = await getText(detailUrlFor(recordId), { ...options, headers: { Cookie: cookie, Referer: url } });
    requireResponse(response, '/OPAC/Details.aspx');
    cookie = sessionCookie(response.headers, cookie);
    return response.text;
  };
  let html = await read();
  if (!isEmptyRecordPage(html, recordId)) return { html, cookie, empty: false };
  const operation = catalogOperation();
  if ((operation && operation.requests >= operation.maxRequests)
      || (options.deadlineAt != null && Date.now() + emptyRecordRetryMs + 2_000 >= options.deadlineAt)) return { html, cookie, empty: true };
  await sleep(emptyRecordRetryMs);
  try { html = await read(); }
  catch (error) {
    // The first read already answered; a failed second read adds nothing.
    if (error.code === 'CATALOG_PROVIDER_BLOCKED') throw error;
    return { html, cookie, empty: true };
  }
  return { html, cookie, empty: isEmptyRecordPage(html, recordId) };
}

function searchRowKey(library, libraryCode, recordId) {
  return `egranthalaya:search-row:${library.egranthalayaCluster}:${libraryCode}:${recordId}`;
}

function sessionCookie(headers, previous = '') {
  const values = headers?.getSetCookie?.() || [headers?.get?.('set-cookie') || ''];
  for (const value of values) {
    const match = value.match(/(?:^|,\s*)(ASP\.NET_SessionId)=([A-Za-z0-9_-]+)(?:;|$)/i);
    if (match) return `${match[1]}=${match[2]}`;
  }
  return previous;
}

function configuration(library) {
  const cluster = library?.egranthalayaCluster;
  const libraryCode = library?.egranthalayaLibraryCode;
  let base;
  try { base = new URL(library?.baseUrl); } catch { /* rejected below */ }
  if (!base || base.origin !== ORIGIN || base.username || base.password
      || !/^[A-Za-z0-9_]{1,48}$/.test(cluster || '') || !/^[A-Z0-9_]{1,32}$/.test(libraryCode || '')
      || (library.egranthalayaSearchScope != null && library.egranthalayaSearchScope !== 'cluster')) {
    throw providerError('CATALOG_CONFIGURATION_REQUIRED', 'e-Granthalaya requires a verified cluster and one library code');
  }
  const url = new URL('/OPAC/Default.aspx', ORIGIN);
  url.searchParams.set('CL_NAME', cluster);
  url.searchParams.set('LIB_CODE', libraryCode);
  return { url: url.toString(), libraryCode };
}

function blocked() {
  if (refusedOrigins.has(ORIGIN)) {
    throw providerError('CATALOG_PROVIDER_BLOCKED', 'e-Granthalaya access was refused; this origin is disabled');
  }
}

function requireResponse(response, expectedPath) {
  if (BLOCKED_STATUSES.has(response.status)) {
    refusedOrigins.add(ORIGIN);
    throw providerError('CATALOG_PROVIDER_BLOCKED', 'e-Granthalaya refused the public request');
  }
  if (!response.ok) throw providerError('CATALOG_UNAVAILABLE', `e-Granthalaya returned HTTP ${response.status}`);
  const url = new URL(response.url);
  if (url.origin !== ORIGIN || url.pathname !== expectedPath) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya returned an unexpected page');
}

export async function checkAvailability(library, value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'e-Granthalaya availability requires a valid ISBN');
  const { url, libraryCode } = configuration(library);
  blocked();
  if (library.egranthalayaSearchScope === 'cluster') {
    const deadlineAt = Date.now() + TIMEOUT_MS;
    const sharedQueriesCompleted = isbnQueries(isbn).every(query =>
      peekCachedTask(`egranthalaya:cluster-variant:${library.egranthalayaCluster}:${isbn}:${query}`) !== undefined);
    let memberNoMatch = false;
    try {
      const member = await checkMemberAvailability(library, isbn, { url, libraryCode,
        deadlineAt: Math.min(deadlineAt, Date.now() + (sharedQueriesCompleted ? TIMEOUT_MS : MEMBER_PROBE_MS)) });
      if (member.outcome !== 'not_found') return member;
      memberNoMatch = true;
    } catch (error) {
      const timedOut = error.name === 'AbortError' || error.code === 'CATALOG_TIMEOUT';
      if ((error.code !== 'CATALOG_PARTIAL_RESULTS' && !timedOut) || Date.now() >= deadlineAt - 1000) throw error;
    }
    // Member searches can omit shared bibliographic records even when this
    // member owns accessioned copies. Never expose their zero in isolation.
    return checkClusterAvailability(library, isbn, { deadlineAt, stopForMember: true, confirmAbsence: memberNoMatch });
  }
  // Some eG4 clusters index punctuation literally. One clean-zero fallback
  // covers the observed plain ISBN-13 records without widening the library.
  const queries = [...new Set([hyphenatedIsbn(isbn) || isbn, isbn])];
  const deadlineAt = Date.now() + TIMEOUT_MS;
  const key = `availability:egranthalaya:${library.egranthalayaCluster}:${libraryCode}:${isbn}`;
  return cachedTask(key, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    const options = { deadlineAt, maxResponseBytes: MAX_RESPONSE_BYTES, redirect: 'manual', retries: 0 };
    const home = await getText(url, options);
    requireResponse(home, '/OPAC/Default.aspx');
    let page = home.text;
    let cookie = sessionCookie(home.headers);
    let record;
    for (const query of queries) {
      const fields = searchForm(page, { libraryCode, query });
      if (!fields || !cookie) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya public search form is incomplete');
      blocked();
      const search = await getText(url, {
        ...options, method: 'POST', headers: { Cookie: cookie, Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString(),
      });
      requireResponse(search, '/OPAC/Default.aspx');
      cookie = sessionCookie(search.headers, cookie);
      record = parseSearch(search.text, { isbn, libraryCode });
      if (!record) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya search scope or result markup was not recognized');
      if (record.kind !== 'empty') break;
      // Reuse the fresh anonymous form state and the same deadline/session.
      // A zero search result remains unknown; it never proves book absence.
      page = search.text;
    }
    if (record?.kind !== 'record') throw providerError('CATALOG_UNRECOGNIZED', 'The public catalog did not prove an exact ISBN match');
    const detail = await readRecordPage(record.recordId, { url, cookie, options });
    const result = parseHoldings(detail.html, {
      isbn, libraryCode, libraryName: library.name, recordId: record.recordId,
      referenceOnly: library.egranthalayaReferenceOnly === true, format: record.format,
    });
    if (!result) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya did not prove this library’s exact ISBN availability');
    return result;
  }, { deadlineAt }), { deadlineAt });
}

// An ISBN-13 beginning 978 and its ISBN-10 equivalent share these nine
// publisher/title digits. eG4's published ALL/LIKE search retrieves both plain
// forms in one request; every returned record still needs a valid full ISBN.
export function clusterIsbnQuery(value) {
  const isbn = validateAndNormalize(value);
  return isbn ? (isbn.startsWith('978') ? isbn.slice(3, -1) : isbn) : null;
}

export function parseCatalogSearch(html, libraryCode) {
  const clean = withoutScripts(html);
  if (selectedOption(clean, 'DDL_Library')?.selected !== libraryCode) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog search scope changed');
  const count = spanById(clean, 'Label37')?.match(/^Your Search Returned\s+(\d+)\s+Record\(s\)$/i);
  if (!count) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog search was not recognized');
  const books = [];
  for (const m of clean.matchAll(/<a\b([^>]*)>/gi)) {
    const a = attributes(m[1]), index = a.id?.match(/^Repeater1_lnkDetails3_(\d+)$/)?.[1];
    if (index === undefined) continue;
    const recordId = a.onclick?.match(/^(?:javascript:)?showValues\((\d+),\s*false\);\s*return false;?$/i)?.[1];
    const title = cleanTitle(spanById(clean, `Repeater1_Lbl_Title_${index}`));
    if (!recordId || !title) continue;
    const author = rowAuthor(spanById(clean, `Repeater1_Lbl_Authors_${index}`));
    const copies = spanById(clean, `Repeater1_Lbl_Holding_Info_${index}`)?.match(/^Total Copy\(ies\):\s*(\d{1,5})$/i);
    books.push({ recordId, title, authors: author ? [author] : [], isbn: firstIsbn(spanById(clean, `Repeater1_ISBNLbl_${index}`)),
      ...(copies ? { totalCopies: Number(copies[1]) } : {}) });
  }
  if (Number(count[1]) && !books.length) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog records missing');
  return books.slice(0, 10);
}

// "By  Abdul Kalam (APJ).." -> "Abdul Kalam (APJ)". A final period after an
// initial ("Kalam A.P.J.") belongs to the name and is kept.
function rowAuthor(value) {
  return cleanAuthor(String(value || '').replace(/^By\s+/i, '').replace(/(?<!(?:^|[\s.])\p{Lu})\.+$/u, ''));
}

// Title/author discovery uses the chosen member's public ALL/LIKE form.
// Record IDs remain tied to that member and are rechecked on opening a book.
export async function searchCatalog(library, query) {
  const { url, libraryCode } = configuration(library), deadlineAt = Date.now() + TIMEOUT_MS;
  return cachedTask(`egranthalaya:search:${library.egranthalayaCluster}:${libraryCode}:${query}`, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    const options = { deadlineAt, maxResponseBytes: MAX_RESPONSE_BYTES, redirect: 'manual', retries: 0 };
    const home = await getText(url, options); requireResponse(home, '/OPAC/Default.aspx');
    const fields = searchForm(home.text, { libraryCode, query }), cookie = sessionCookie(home.headers);
    if (!fields || !cookie) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog search form changed');
    blocked();
    const response = await getText(url, { ...options, method: 'POST', body: fields.toString(),
      headers: { Cookie: cookie, Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' } });
    requireResponse(response, '/OPAC/Default.aspx');
    const books = parseCatalogSearch(response.text, libraryCode);
    // This member-scoped search confirms each row's record in this library.
    for (const book of books) await cachedTask(searchRowKey(library, libraryCode, book.recordId), () => book, { ttlMs: SEARCH_ROW_TTL_MS });
    return books;
  }, { deadlineAt }), { deadlineAt });
}

export async function resolveCatalogRecord(library, recordId) {
  if (!/^\d{1,20}$/.test(recordId)) throw providerError('CATALOG_UNRECOGNIZED', 'Invalid catalog record');
  const { url, libraryCode } = configuration(library), deadlineAt = Date.now() + TIMEOUT_MS;
  return cachedTask(`egranthalaya:record:${library.egranthalayaCluster}:${libraryCode}:${recordId}`, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    const options = { deadlineAt, maxResponseBytes: MAX_RESPONSE_BYTES, redirect: 'manual', retries: 0 };
    const home = await getText(url, options); requireResponse(home, '/OPAC/Default.aspx');
    const cookie = sessionCookie(home.headers);
    if (!cookie || !selectedOption(home.text, 'DDL_Library')?.options.some(o => o.value === libraryCode)) throw providerError('CATALOG_UNRECOGNIZED', 'Unknown catalog member');
    const page = await readRecordPage(recordId, { url, cookie, options });
    if (page.empty) {
      // The record page answered without the record. Fall back to the row this
      // member's own search returned; copy status stays unconfirmed.
      const row = peekCachedTask(searchRowKey(library, libraryCode, recordId));
      if (!row) throw providerError('CATALOG_UNAVAILABLE', 'The catalog record page came back empty');
      return { recordId, title: row.title, authors: row.authors || [], isbn: row.isbn || null,
        observation: { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true,
          ...(row.totalCopies > 0 ? { totalCopies: row.totalCopies } : {}),
          ...(library.egranthalayaReferenceOnly === true ? { format: 'Book (reference use only)' } : {}),
          locations: [{ name: library.name, status: 'unknown' }] } };
    }
    const html = page.html;
    const evidence = parseHoldingEvidence(html, { recordId, selectedRecord: true });
    const own = evidence?.holdings.filter(r => r.libraryCode === libraryCode);
    const title = cleanTitle(spanById(html, 'Lbl_TITLE') || spanById(html, 'Lbl_Title'));
    if (!title) throw providerError('CATALOG_UNRECOGNIZED', 'Missing record title');
    if (!own?.length) {
      // Some public records have no accessioned copy. Confirm membership with
      // a fresh member-scoped title search before reporting catalog presence.
      const fields = searchForm(home.text, { libraryCode, query: firstIsbn(spanById(html, 'Lbl_ISBN')) || (title.match(/[\p{L}\p{N}]{3,}/u)?.[0] || title).slice(0, 160) });
      if (!fields) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog search form changed');
      blocked();
      const confirmation = await getText(url, { ...options, method: 'POST', body: fields.toString(),
        headers: { Cookie: page.cookie, Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' } });
      requireResponse(confirmation, '/OPAC/Default.aspx');
      if (!parseCatalogSearch(confirmation.text, libraryCode).some(book => book.recordId === recordId)) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog did not confirm this member’s record');
    }
    const observation = scopedHoldingResult(evidence, { libraryCode, libraryName: library.name, referenceOnly: library.egranthalayaReferenceOnly })
      || { outcome: 'in_catalog', locations: [{ name: library.name, status: 'unknown' }] };
    return { recordId, title, authors: [rowAuthor(spanById(html, 'Lbl_AUTHOR'))].filter(Boolean), isbn: firstIsbn(spanById(html, 'Lbl_ISBN')),
      observation: { ...observation, matchKind: 'verified_work', recognizedExact: true } };
  }, { deadlineAt }), { deadlineAt });
}

function isbnQueries(isbn) {
  const hyphenated = hyphenatedIsbn(isbn);
  return [...new Set([clusterIsbnQuery(isbn), hyphenated &&
    (isbn.startsWith('978') ? hyphenated.slice(4, -2) : hyphenated)].filter(Boolean))];
}

function memberObservation(library, results) {
  const locations = new Map();
  for (const result of results) for (const location of result.locations || []) {
    const value = { name: location.name, status: location.status === 'available' ? 'available' : 'unknown' };
    if (!locations.has(value.name) || value.status === 'available') locations.set(value.name, value);
  }
  return {
    outcome: results.some(result => result.outcome === 'available') ? 'available' : 'in_catalog',
    matchKind: 'exact_isbn', recognizedExact: true,
    ...(results[0]?.callNumber ? { callNumber: results[0].callNumber } : {}),
    ...(results[0]?.format ? { format: results[0].format } : {}),
    locations: locations.size ? [...locations.values()] : [{ name: library.name, status: 'unknown' }],
  };
}

// A selected member's form is much smaller than the cluster-wide form, and its
// search directly proves catalog membership even if no accessioned copies are
// exposed. Never project another member's holdings onto this library.
async function checkMemberAvailability(library, isbn, { url, libraryCode, deadlineAt }) {
  const key = `availability:egranthalaya:member:${library.egranthalayaCluster}:${libraryCode}:${isbn}`;
  return cachedTask(key, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    // Leave time to return an already confirmed catalog match after a slow detail.
    const options = { deadlineAt: deadlineAt - 1000, maxResponseBytes: MAX_RESPONSE_BYTES, redirect: 'manual', retries: 0 };
    const home = await getText(url, options);
    requireResponse(home, '/OPAC/Default.aspx');
    let page = home.text, cookie = sessionCookie(home.headers), allEmpty = true;
    for (const query of isbnQueries(isbn)) {
      const parsed = await cachedTask(`${key}:empty-variant:${query}`, async () => {
        const fields = searchForm(page, { libraryCode, query });
        if (!fields || !cookie) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya public member form is incomplete');
        blocked();
        const search = await getText(url, { ...options, method: 'POST', body: fields.toString(),
          headers: { Cookie: cookie, Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' } });
        requireResponse(search, '/OPAC/Default.aspx');
        page = search.text;
        cookie = sessionCookie(search.headers, cookie);
        const result = parseSearch(page, { isbn, libraryCode, multipleRecords: true });
        if (!result) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya member search scope or markup changed');
        return result;
      }, { deadlineAt: options.deadlineAt, ttlMs: 5 * 60_000, shouldCache: result => result.kind === 'empty' });
      // Cache only completed zero observations, never forms or sessions. If the
      // alternate spelling times out, a reader retry spends its own bounded
      // budget on the unfinished spelling instead of repeating the first one.
      allEmpty &&= parsed.kind === 'empty';
      if (parsed.kind !== 'records') continue;
      const results = [];
      for (const record of parsed.records) {
        try {
          const detail = await readRecordPage(record.recordId, { url, cookie, options });
          cookie = detail.cookie;
          const result = parseHoldings(detail.html, { isbn, recordId: record.recordId, libraryCode, libraryName: library.name,
            referenceOnly: library.egranthalayaReferenceOnly === true, format: record.format });
          if (result) results.push(result);
          if (result?.outcome === 'available') return memberObservation(library, results);
        } catch (error) {
          if (error.code === 'CATALOG_PROVIDER_BLOCKED') throw error;
          // The scoped search already proved the exact record, but a failed
          // detail cannot supply copy counts or borrowing status.
          if (Date.now() >= options.deadlineAt) break;
        }
      }
      // Do not wait for alternate spellings after proving this member's match.
      // These bounded reads never claim exhaustive counts or none available.
      return memberObservation(library, results);
    }
    if (allEmpty) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
    throw providerError('CATALOG_PARTIAL_RESULTS', 'Member search did not confirm the requested ISBN');
  }, { deadlineAt }), { deadlineAt, ttlMs: 5 * 60_000 });
}

// Inspect shared records when the member index cannot confirm the ISBN. Batch
// diagnostics can disable the early return to collect evidence for more members.
export async function checkClusterAvailability(library, value, { deadlineAt = Date.now() + TIMEOUT_MS, stopForMember = false, confirmAbsence = false } = {}) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'e-Granthalaya availability requires a valid ISBN');
  const config = configuration(library), libraryCode = config.libraryCode;
  // Open the smaller member landing page, then explicitly search All Libraries.
  // Live controls confirm the POST still exposes shared holdings of other members.
  const url = config.url;
  blocked();
  // Cache only sanitized bibliographic/holding fields. Switching libraries for
  // the same book reuses this reader-triggered cluster request, never sessions,
  // raw HTML, borrower details, or speculative searches.
  const key = `availability:egranthalaya:cluster:${library.egranthalayaCluster}:${isbn}${stopForMember ? `:member:${libraryCode}` : ''}`;
  const observation = await cachedTask(key, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    const options = { deadlineAt: deadlineAt - 1000, maxResponseBytes: MAX_RESPONSE_BYTES, redirect: 'manual', retries: 0 };
    const home = await getText(url, options);
    requireResponse(home, '/OPAC/Default.aspx');
    let page = home.text, cookie = sessionCookie(home.headers);
    const libraryCodes = selectedOption(home.text, 'DDL_Library')?.options
      .map((option) => option.value).filter((code) => /^[A-Z0-9_]{1,32}$/.test(code)) || [];
    // Search the shared title digits in both plain and assigned-hyphen forms.
    // Each term covers equivalent 10/13-digit forms; record ISBNs still prove identity.
    const queries = isbnQueries(isbn);
    const records = [], seen = new Set(), unreadable = new Set();
    let allEmpty = true, partial = false;
    for (const query of queries) {
      try {
        const variantKey = `egranthalaya:cluster-variant:${library.egranthalayaCluster}:${isbn}:${query}`;
        const variant = await cachedTask(variantKey, async () => {
          const fields = searchForm(page, { libraryCode, query, clusterSearch: true });
          if (!fields || !cookie) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya public cluster search form is incomplete');
          blocked();
          const search = await getText(url, {
            ...options, method: 'POST', headers: { Cookie: cookie, Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' }, body: fields.toString(),
          });
          requireResponse(search, '/OPAC/Default.aspx');
          page = search.text;
          cookie = sessionCookie(search.headers, cookie);
          const parsed = parseSearch(search.text, { isbn, libraryCode, clusterSearch: true });
          if (!parsed) throw providerError('CATALOG_UNRECOGNIZED', 'The public cluster search markup was not recognized');
          const value = { records: [], allEmpty: parsed.kind === 'empty', partial: parsed.kind === 'unconfirmed' || parsed.partial === true };
          for (const record of parsed.records || []) {
            if (unreadable.has(record.recordId)) { value.partial = true; continue; }
            const evidence = await cachedTask(`egranthalaya:cluster-detail:${library.egranthalayaCluster}:${isbn}:${record.recordId}`, async () => {
              const detail = await readRecordPage(record.recordId, { url, cookie, options });
              cookie = detail.cookie;
              return parseHoldingEvidence(detail.html, { isbn, recordId: record.recordId });
            }, { deadlineAt: options.deadlineAt, ttlMs: 5 * 60_000, shouldCache: Boolean });
            if (!evidence) { unreadable.add(record.recordId); value.partial = true; continue; }
            value.partial ||= !evidence.complete;
            value.records.push({ evidence, format: record.format, recordId: record.recordId });
            if (stopForMember && evidence.holdings.some(row => row.libraryCode === libraryCode && row.status === 'available')) {
              return { ...value, partial: true, stoppedForMember: true };
            }
          }
          return value;
        }, { deadlineAt: options.deadlineAt, ttlMs: 5 * 60_000,
          shouldCache: value => !value.stoppedForMember && (value.allEmpty || value.records.length > 0) });
        allEmpty &&= variant.allEmpty;
        partial ||= variant.partial;
        for (const record of variant.records) {
          if (!seen.has(record.recordId)) { seen.add(record.recordId); records.push(record); }
        }
        if (stopForMember && records.some(record => record.evidence.holdings.some(row => row.libraryCode === libraryCode))) {
          return { libraryCodes, records, allEmpty: false, partial: true };
        }
      } catch (error) {
        // A later slow or changed page must not erase an already verified holding.
        // Access refusals still invalidate the shared origin immediately.
        if (!records.length || error.code === 'CATALOG_PROVIDER_BLOCKED') throw error;
        partial = true;
        break;
      }
    }
    return { libraryCodes, records, allEmpty, partial };
  }, { deadlineAt }), { deadlineAt, ttlMs: 5 * 60_000,
    shouldCache: value => !value.partial || (stopForMember && value.records.some(record => record.evidence.holdings.some(row => row.libraryCode === libraryCode))) });
  blocked();
  if (!observation.libraryCodes.includes(libraryCode)) throw providerError('CATALOG_UNRECOGNIZED', 'The library code was not in this public cluster');
  const results = observation.records.map(({ evidence, format }) => scopedHoldingResult(evidence, {
    libraryCode, libraryName: library.name, referenceOnly: library.egranthalayaReferenceOnly === true, format,
  })).filter(Boolean);
  const available = results.filter((result) => result.outcome === 'available');
  // Plain and hyphenated ISBNs are indexed separately. Positive exact holding
  // evidence is useful, but these bounded searches cannot prove exhaustive
  // counts across unqueried spellings. A no-match assertion below requires
  // both variants and every returned exact-record holdings page to be complete.
  if (!results.length) {
    if (observation.allEmpty && !observation.partial) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
    if (confirmAbsence && observation.records.length && !observation.partial) {
      return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
    }
    throw providerError(observation.partial ? 'CATALOG_PARTIAL_RESULTS' : 'CATALOG_HOLDING_UNCONFIRMED',
      'The public cluster did not confirm this library’s exact ISBN holding');
  }
  const locations = new Map();
  for (const result of results) for (const location of result.locations) {
    // This partial-punctuation search cannot prove that a shelf has no other
    // available copy, even when one returned item there is issued.
    const scopedLocation = { ...location, status: location.status === 'available' ? 'available' : 'unknown' };
    const previous = locations.get(location.name);
    if (!previous || scopedLocation.status === 'available') locations.set(location.name, scopedLocation);
  }
  return {
    outcome: available.length ? 'available' : 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true,
    ...(results[0].callNumber ? { callNumber: results[0].callNumber } : {}),
    format: results[0].format, locations: [...locations.values()],
  };
}

// Refusals disable this shared origin until process restart/operator action.
// Exposed for isolated provider tests only, never through an HTTP endpoint.
export function clearEgranthalayaRefusals() {
  refusedOrigins.clear();
}
