import { cachedTask, catalogOperation, enqueueTask, getText, peekCachedTask } from './http.js';
import { firstIsbn } from './catalogMarkup.js';
import { cleanAuthor, cleanTitle } from './catalogText.js';
import { validateAndNormalize } from '../isbn.js';
import isbnRanges from './egranthalaya-isbn-ranges.json' with { type: 'json' };

const ORIGIN = 'https://eg4.nic.in';
const TIMEOUT_MS = 100_000;
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

// `field` is the catalog's own "search in" choice: TITLE (the page's default)
// or ALL. `boolean` is LIKE (phrase) or OR (any of the words).
const SEARCH_FIELDS = new Set(['TITLE', 'ALL']);
const SEARCH_BOOLEANS = new Set(['LIKE', 'OR']);

export function searchForm(html, { libraryCode, query, clusterSearch = false, field = 'ALL', boolean = 'LIKE' }) {
  if (!SEARCH_FIELDS.has(field) || !SEARCH_BOOLEANS.has(boolean)) return null;
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
      || !selectedOption(form[2], 'DDL_Field')?.options.some((option) => option.value === field)
      || !selectedOption(form[2], 'DDL_Boolean')?.options.some((option) => option.value === boolean)) return null;
  // Replay only anonymous search. Cluster mode is the current cluster only;
  // the separate cross-cluster union search and member login stay unused.
  for (const name of ['txtMemberNo', 'txtPassword', 'txt_captcha']) fields.set(name, '');
  fields.delete('AccordionPaneUnion_content$CB_Union');
  fields.set('AccordionPaneUnion_content$DDL_Clusters', '');
  fields.set('AccordionPaneUnion_content$DDL_ClusterLibraries', '');
  fields.set('__EVENTTARGET', '');
  fields.set('__EVENTARGUMENT', '');
  for (const [name, value] of Object.entries({
    DDL_Materials: 'Books', txt_Search: query, DDL_Field: field, DDL_Boolean: boolean,
    DDL_OrderBy: 'TITLE', DDL_SortBy: 'ASC', DDL_Pages: '20', DDL_Library: clusterSearch ? 'All Libraries' : libraryCode,
    Basic_Search_Bttn: 'Search',
  })) fields.set(name, value);
  return fields;
}

// The result count of a search page for this member, or null when the page is
// not a recognized search result for exactly this member.
function searchCount(html, libraryCode) {
  const markup = withoutScripts(html);
  if (selectedOption(markup, 'DDL_Library')?.selected !== libraryCode) return null;
  const count = spanById(markup, 'Label37')?.match(/^Your Search Returned\s+(\d+)\s+Record\(s\)$/i);
  return count ? Number(count[1]) : null;
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

// Record pages need an anonymous session from the member's own page. Within
// one catalog operation the first such page and its session cookie are reused
// by later record reads; sessions belong to one operation only, never shared
// across readers or checks. Searches need no session (memberSearch).
const sessions = new WeakMap();

function checkScope() {
  let scope = catalogOperation();
  while (scope?.parent) scope = scope.parent;
  return scope;
}

function openSession(url, options) {
  const scope = checkScope();
  let byUrl = scope ? sessions.get(scope) : null;
  if (scope && !byUrl) sessions.set(scope, byUrl = new Map());
  const known = byUrl?.get(url);
  if (known) return known;
  const opening = (async () => {
    blocked();
    const home = await getText(url, options);
    requireResponse(home, '/OPAC/Default.aspx');
    return { home: home.text, cookie: sessionCookie(home.headers) };
  })();
  if (byUrl) {
    byUrl.set(url, opening);
    // A failed opening is not kept: the next step may try again.
    opening.catch(() => { if (byUrl.get(url) === opening) byUrl.delete(url); });
  }
  return opening;
}

// A step that throws drops the session it used, so the next step opens a fresh
// one: eG4 (ASP.NET) runs one request at a time per server session, and a
// failed or abandoned request may still be running there.
function sessionTask(url, task) {
  return async () => {
    let used = null;
    try { return await task({ open: options => (used = openSession(url, options)) }); }
    catch (error) {
      const byUrl = used && sessions.get(checkScope());
      if (byUrl?.get(url) === used) byUrl.delete(url);
      throw error;
    }
  };
}

// The member's public search form, kept for a few minutes (plan: e-Granthalaya
// speed, 19 November 2026). It is the anonymous page every visitor gets: the
// hidden page state and the member's controls, never a session cookie, a
// member login or a reader's search. Each search posts it without a cookie,
// so the server gives that search a fresh anonymous session of its own.
// Fetching this page took 1.2 to 28 s per check (median about 3 s); a POST
// built from a page fetched 15 minutes earlier was answered normally. When a
// kept form stops working (the server rejects or ignores its page state), it
// is dropped and fetched once more within the same search.
const FORM_TTL_MS = 10 * 60_000;
const formGenerations = new Map();

function formKey(url) {
  return `egranthalaya:form:${url}:${formGenerations.get(url) || 0}`;
}

function dropForm(url) {
  formGenerations.set(url, (formGenerations.get(url) || 0) + 1);
  if (formGenerations.size > 5_000) formGenerations.clear();
}

// Only the form's own fields are kept: no cookie, no page text.
function formFrom(html, libraryCode) {
  const markup = withoutScripts(html);
  const fields = searchForm(markup, { libraryCode, query: '' });
  if (!fields) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya public search form is incomplete');
  return { body: fields.toString(), fields: selectedOption(markup, 'DDL_Field').options.map(option => option.value),
    booleans: selectedOption(markup, 'DDL_Boolean').options.map(option => option.value) };
}

async function memberForm(url, libraryCode, options) {
  let fetched = false;
  const form = await cachedTask(formKey(url), async () => {
    fetched = true;
    blocked();
    const home = await getText(url, options);
    requireResponse(home, '/OPAC/Default.aspx');
    return formFrom(home.text, libraryCode);
  }, { ttlMs: FORM_TTL_MS, deadlineAt: options.deadlineAt });
  return { ...form, fetched };
}

// One anonymous search of this member's catalog. Returns the result page,
// which `searchCount` has recognized as this member's result. `page` is a
// member page this step has just read, used as the form instead of the kept one.
async function memberSearch(url, libraryCode, { query, field, boolean = 'LIKE' }, options, page = null) {
  for (let attempt = 0; ; attempt++) {
    const form = page ? { ...formFrom(page, libraryCode), fetched: true } : await memberForm(url, libraryCode, options);
    if (!form.fields.includes(field) || !form.booleans.includes(boolean)) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya search options changed');
    const body = new URLSearchParams(form.body);
    for (const [name, value] of Object.entries({ txt_Search: query, DDL_Field: field, DDL_Boolean: boolean })) body.set(name, value);
    blocked();
    const response = await getText(url, { ...options, method: 'POST', body: body.toString(),
      headers: { Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (BLOCKED_STATUSES.has(response.status)) requireResponse(response, '/OPAC/Default.aspx');
    let samePage = false;
    try { const at = new URL(response.url); samePage = at.origin === ORIGIN && at.pathname === '/OPAC/Default.aspx'; } catch { /* not recognized */ }
    if (response.ok && samePage && searchCount(response.text, libraryCode) !== null) return response.text;
    // A kept form the server no longer accepts: fetch the page once more.
    if (attempt === 0 && !form.fetched) { dropForm(url); continue; }
    requireResponse(response, '/OPAC/Default.aspx');
    throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya search scope or result markup was not recognized');
  }
}

// Title searches of this member made within one check. A member's ISBN
// search (ALL) covers only the records the member catalogued itself: on 19
// November 2026 SITAPUR's ISBN search for 817371146 returned 0, while its
// TITLE search returned two shared records it holds, each showing ISBN
// 9788173711466 (see titleSearch). An ISBN zero therefore says "not found"
// only within a check that also searched this member by title (a work
// check); alone (an exact edition check) it stays unconfirmed.
const titleSearches = new WeakMap();

function noteTitleSearch(promise) {
  const scope = checkScope();
  if (!scope) return promise;
  let entry = titleSearches.get(scope);
  if (!entry) titleSearches.set(scope, entry = { pending: new Set(), completed: 0 });
  entry.pending.add(promise);
  promise.then(() => { entry.completed += 1; }, () => {}).finally(() => entry.pending.delete(promise));
  return promise;
}

async function checkSearchedTitles() {
  const entry = titleSearches.get(checkScope());
  if (!entry) return false;
  while (!entry.completed && entry.pending.size) await Promise.allSettled([...entry.pending]);
  return entry.completed > 0;
}

function searchOptions(deadlineAt) {
  return { deadlineAt, maxResponseBytes: MAX_RESPONSE_BYTES, redirect: 'manual', retries: 0 };
}

// One member search with both spellings of the ISBN's shared digits (plain
// and, where the ISBN ranges give one, hyphenated: eG4 indexes stored
// punctuation literally), as one OR search. Every returned row must still
// show the full, valid ISBN. Copy details are not read: the app answers
// found / not found, and record pages often come back empty.
export async function checkAvailability(library, value) {
  const isbn = validateAndNormalize(value);
  if (!isbn) throw providerError('CATALOG_EXACT_ISBN_REQUIRED', 'e-Granthalaya availability requires a valid ISBN');
  const { url, libraryCode } = configuration(library);
  blocked();
  const deadlineAt = Date.now() + TIMEOUT_MS;
  const key = `availability:egranthalaya:member:${library.egranthalayaCluster}:${libraryCode}:${isbn}`;
  // Only the parsed result is kept (record IDs and format), never pages.
  const result = await cachedTask(key, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    const queries = isbnQueries(isbn);
    const html = await memberSearch(url, libraryCode,
      { query: queries.join(' '), field: 'ALL', boolean: queries.length > 1 ? 'OR' : 'LIKE' }, searchOptions(deadlineAt));
    const parsed = parseSearch(html, { isbn, libraryCode, multipleRecords: true });
    if (!parsed) throw providerError('CATALOG_UNRECOGNIZED', 'e-Granthalaya search scope or result markup was not recognized');
    return parsed;
  }, { deadlineAt }), { deadlineAt, ttlMs: 5 * 60_000 });
  blocked();
  if (result.kind === 'records') {
    const format = result.records[0]?.format || 'Book';
    return {
      outcome: 'in_catalog', matchKind: 'exact_isbn', recognizedExact: true,
      format: library.egranthalayaReferenceOnly === true ? `${format} (reference use only)` : format,
      locations: [{ name: library.name, status: 'unknown' }],
    };
  }
  if (result.kind === 'empty' && await checkSearchedTitles()) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
  // Rows that matched the digits without showing this ISBN, or a zero with no
  // title search beside it: neither proves the book is or is not there.
  throw providerError('CATALOG_QUERY_UNSUPPORTED', 'This member’s ISBN search alone cannot show that a book is absent');
}

// An ISBN-13 beginning 978 and its ISBN-10 equivalent share these nine
// publisher/title digits. eG4's published ALL/LIKE search retrieves both plain
// forms in one request; every returned record still needs a valid full ISBN.
export function clusterIsbnQuery(value) {
  const isbn = validateAndNormalize(value);
  return isbn ? (isbn.startsWith('978') ? isbn.slice(3, -1) : isbn) : null;
}

function parseCatalogSearchRows(html, libraryCode) {
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
    const isbnText = spanById(clean, `Repeater1_ISBNLbl_${index}`);
    // Every ISBN the row shows (a record can list several).
    const isbns = [...new Set((String(isbnText || '').match(/\b(?:97[89](?:[\s-]*\d){10}|\d(?:[\s-]*\d){8}[\s-]*[\dXx])\b/g) || []).map(validateAndNormalize).filter(Boolean))];
    books.push({ recordId, title, authors: author ? [author] : [], isbn: firstIsbn(isbnText), ...(isbns.length > 1 ? { isbns } : {}),
      ...(copies ? { totalCopies: Number(copies[1]) } : {}) });
  }
  if (Number(count[1]) && !books.length) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog records missing');
  return Object.assign(books.slice(0, 20), { total: Number(count[1]) });
}

export function parseCatalogSearch(html, libraryCode) {
  return parseCatalogSearchRows(html, libraryCode).slice(0, 10);
}

// "By  Abdul Kalam (APJ).." -> "Abdul Kalam (APJ)". A final period after an
// initial ("Kalam A.P.J.") belongs to the name and is kept.
function rowAuthor(value) {
  return cleanAuthor(String(value || '').replace(/^By\s+/i, '').replace(/(?<!(?:^|[\s.])\p{Lu})\.+$/u, ''));
}

const queryKey = value => String(value || '').normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

// A member's two searches index different records (19 November 2026, both
// with "Wings of Fire" as a LIKE phrase):
//   - TITLE (the page's default) finds the records the member holds copies
//     of, shared ones included: SITAPUR's two shared records 451490 and 79083
//     (ISBN 9788173711466), which its ALL search did not return;
//   - ALL finds the records the member catalogued itself: SRS Jammu's record
//     31499 (same ISBN), which its TITLE search did not return.
// A title search is therefore both, with rows merged by record ID (TITLE rows
// first), and the main-title retry on a clean zero.
function titleSearch(library, query) {
  const { url, libraryCode } = configuration(library), deadlineAt = Date.now() + TIMEOUT_MS;
  return cachedTask(`egranthalaya:search:${library.egranthalayaCluster}:${libraryCode}:${queryKey(query)}`, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    // eG displays title, subtitle and parallel title together, but its LIKE
    // search indexes those fields separately. Retry a clean zero once with
    // the main title; keep record IDs and member scope as the evidence.
    const queries = [query], mainTitle = String(query || '').split(':')[0].trim();
    const mainTitleLength = mainTitle.match(/[\p{L}\p{N}\p{M}]/gu)?.length || 0;
    if (String(query || '').includes(':') && mainTitle !== query && mainTitleLength >= 3
        && /[\p{L}\p{N}]/u.test(mainTitle)) queries.push(mainTitle);
    let books = [], hasMore = false;
    for (const term of queries) {
      const byId = new Map();
      hasMore = false;
      for (const field of ['TITLE', 'ALL']) {
        const rows = parseCatalogSearchRows(await memberSearch(url, libraryCode, { query: term, field }, searchOptions(deadlineAt)), libraryCode);
        hasMore ||= rows.total > rows.length;
        for (const row of rows) if (!byId.has(row.recordId)) byId.set(row.recordId, row);
      }
      books = [...byId.values()];
      if (books.length) break;
    }
    // This member-scoped search confirms each row's record in this library.
    for (const book of books) await cachedTask(searchRowKey(library, libraryCode, book.recordId), () => book, { ttlMs: SEARCH_ROW_TTL_MS });
    return { books, hasMore };
  }, { deadlineAt }), { deadlineAt, ttlMs: 5 * 60_000 });
}

// Title discovery and the title half of a book check (see titleSearch).
// Every row is a record this member's own search returned, so it carries the
// member's catalog presence (copy status unknown): a row that also shows one
// of a work's ISBNs proves that edition without opening its record page,
// which often comes back empty. Up to twenty rows from each search (one
// result page); `hasMore` when the catalog has more.
export async function searchCatalog(library, query) {
  const { books, hasMore } = await noteTitleSearch(titleSearch(library, query));
  const rows = books.map(book => ({ ...book, observation: { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true,
    ...(book.totalCopies > 0 ? { totalCopies: book.totalCopies } : {}),
    ...(library.egranthalayaReferenceOnly === true ? { format: 'Book (reference use only)' } : {}),
    locations: [{ name: library.name, status: 'unknown' }] } }));
  return hasMore ? Object.assign(rows, { hasMore: true }) : rows;
}

// The one library search (libraryBookSearch.js, providers/index.js): one
// search of this member's catalog in the form's "search in" field ALL (any
// field); 'TITLE' here would search titles only. The search names the member
// (DDL_Library), so every row is a record of this library. The kept public
// form (memberForm) is the only other request.
const SEARCH_FIELD = 'ALL';
function memberRows(library, search) {
  const { url, libraryCode } = configuration(library), deadlineAt = Date.now() + TIMEOUT_MS;
  return cachedTask(`egranthalaya:rows:${library.egranthalayaCluster}:${libraryCode}:${search.field}:${queryKey(search.query)}`, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, async () => {
    blocked();
    const rows = parseCatalogSearchRows(await memberSearch(url, libraryCode, search, searchOptions(deadlineAt)), libraryCode);
    return rows.map(book => ({ ...book, observation: { outcome: 'in_catalog', matchKind: 'verified_work', recognizedExact: true,
      locations: [{ name: library.name, status: 'unknown' }] } }));
  }, { deadlineAt }), { deadlineAt, ttlMs: 5 * 60_000 });
}
export async function librarySearch(library, term) {
  return memberRows(library, { query: String(term || '').slice(0, 160), field: SEARCH_FIELD });
}

export async function resolveCatalogRecord(library, recordId) {
  if (!/^\d{1,20}$/.test(recordId)) throw providerError('CATALOG_UNRECOGNIZED', 'Invalid catalog record');
  const { url, libraryCode } = configuration(library), deadlineAt = Date.now() + TIMEOUT_MS;
  return cachedTask(`egranthalaya:record:${library.egranthalayaCluster}:${libraryCode}:${recordId}`, () => enqueueTask(`provider:egranthalaya:${ORIGIN}`, sessionTask(url, async ({ open }) => {
    blocked();
    const options = searchOptions(deadlineAt);
    // A record page needs an anonymous session from the member's own page.
    const session = await open(options);
    const cookie = session.cookie;
    if (!cookie || !selectedOption(session.home, 'DDL_Library')?.options.some(o => o.value === libraryCode)) throw providerError('CATALOG_UNRECOGNIZED', 'Unknown catalog member');
    const page = await readRecordPage(recordId, { url, cookie, options });
    session.cookie = page.cookie;
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
      // a member-scoped title search before reporting catalog presence. The
      // main title uses the same field boundary as the title-search recovery.
      const mainTitle = (title.split(':')[0].trim() || title).slice(0, 160);
      // A broad main title may fill the page with other records. Retain the
      // exact ISBN confirmation for those cases, within the same deadline.
      const isbn = firstIsbn(spanById(html, 'Lbl_ISBN'));
      const searches = [{ query: mainTitle, field: 'TITLE' }];
      if (isbn) {
        const queries = isbnQueries(isbn);
        searches.push({ query: queries.join(' '), field: 'ALL', boolean: queries.length > 1 ? 'OR' : 'LIKE' });
      }
      let confirmed = false;
      for (const search of searches) {
        const confirmation = await memberSearch(url, libraryCode, search, options, session.home);
        if (parseCatalogSearchRows(confirmation, libraryCode).some(book => book.recordId === recordId)) { confirmed = true; break; }
      }
      if (!confirmed) throw providerError('CATALOG_UNRECOGNIZED', 'Catalog did not confirm this member’s record');
    }
    const observation = scopedHoldingResult(evidence, { libraryCode, libraryName: library.name, referenceOnly: library.egranthalayaReferenceOnly })
      || { outcome: 'in_catalog', locations: [{ name: library.name, status: 'unknown' }] };
    return { recordId, title, authors: [rowAuthor(spanById(html, 'Lbl_AUTHOR'))].filter(Boolean), isbn: firstIsbn(spanById(html, 'Lbl_ISBN')),
      observation: { ...observation, matchKind: 'verified_work', recognizedExact: true } };
  }), { deadlineAt }), { deadlineAt });
}

// The ISBN's shared digits in its plain and hyphenated spellings (see
// clusterIsbnQuery and hyphenatedIsbn).
function isbnQueries(isbn) {
  const hyphenated = hyphenatedIsbn(isbn);
  return [...new Set([clusterIsbnQuery(isbn), hyphenated &&
    (isbn.startsWith('978') ? hyphenated.slice(4, -2) : hyphenated)].filter(Boolean))];
}

// Refusals disable this shared origin until process restart/operator action.
// Exposed for isolated provider tests only, never through an HTTP endpoint.
export function clearEgranthalayaRefusals() {
  refusedOrigins.clear();
}
