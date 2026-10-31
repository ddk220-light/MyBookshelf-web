import { cachedTask, getText, DEFAULT_TIMEOUT_MS } from './http.js';
import { attrs, contents, markupOnly, text } from './catalogHtml.js';
import { createTitleAuthorId, parseTitleAuthorId } from '../titleAuthorIdentity.js';

const ORIGIN = 'https://visakhapatnampubliclibrary.org';
const LIBRARY_ID = 'vpl:visakhapatnam-public-library';
const HEADERS = ['S.No', 'Title', 'Subject', 'Author', 'Location', 'Status'];
const failure = (code, message) => Object.assign(new Error(message), { code });
const canonical = (value) => value.normalize('NFC').replace(/\s+/g, ' ').trim();

function configure(library) {
  if (library?.id !== LIBRARY_ID || library.baseUrl !== ORIGIN) {
    throw failure('CATALOG_CONFIGURATION_REQUIRED', 'Unsupported public catalog configuration');
  }
}

// The upstream full-title form fails on some punctuation, including apostrophes.
// Search a literal phrase and verify the full title/author against returned rows.
// User text can never supply an upstream URL, path or additional form fields.
export function catalogPhrase(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return null;
  return value.normalize('NFC').split(/[^\p{L}\p{M}\p{N}\s]/u)
    .map(canonical).filter(Boolean).sort((a, b) => b.length - a.length)[0]?.slice(0, 120).trim() || null;
}

function searchUrl(field, query) {
  const url = new URL('/books', ORIGIN);
  for (const name of ['title', 'subject', 'author']) url.searchParams.set(name, name === field ? query : '');
  url.searchParams.set('search', 'search');
  return url;
}

export function parseCatalogPage(html, url) {
  const markup = markupOnly(html);
  const forms = [...markup.matchAll(/<form\b([^>]*)>/gi)].filter(tag => attrs(tag[1]).name === 'form1');
  if (forms.length !== 1 || attrs(forms[0][1]).method?.toLowerCase() !== 'get') return null;
  const form = contents(markup, forms[0], 'form');
  if (form === null) return null;
  for (const name of ['title', 'subject', 'author']) {
    const inputs = [...form.matchAll(/<input\b([^>]*)>/gi)].map(tag => attrs(tag[1])).filter(input => input.name === name);
    if (inputs.length !== 1 || canonical(inputs[0].value || '') !== canonical(url.searchParams.get(name) || '')) return null;
  }
  const tables = [...markup.matchAll(/<table\b([^>]*)>/gi)];
  if (tables.length !== 1) return null;
  const table = contents(markup, tables[0], 'table');
  if (table === null || /<table\b/i.test(table)) return null;
  const heads = [...table.matchAll(/<thead\b[^>]*>([\s\S]*?)<\/thead\s*>/gi)];
  const bodies = [...table.matchAll(/<tbody\b[^>]*>([\s\S]*?)<\/tbody\s*>/gi)];
  if (heads.length !== 1 || bodies.length !== 1) return null;
  const headers = [...heads[0][1].matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th\s*>/gi)];
  const spans = value => ['colspan', 'rowspan'].some(name => attrs(value)[name] && attrs(value)[name] !== '1');
  if (headers.some(cell => spans(cell[1])) || JSON.stringify(headers.map(cell => text(cell[2]))) !== JSON.stringify(HEADERS)) return null;
  const rows = [];
  let emptySeen = false;
  const body = bodies[0][1];
  if (text(body.replace(/<tr\b[^>]*>[\s\S]*?<\/tr\s*>/gi, ''))) return null;
  for (const row of body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)) {
    const rowAttrs = attrs(row[1]);
    if (Object.hasOwn(rowAttrs, 'hidden') || rowAttrs['aria-hidden'] === 'true'
        || /display\s*:\s*none/i.test(rowAttrs.style || '') || /<tr\b/i.test(row[2])) return null;
    const cells = [...row[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td\s*>/gi)];
    // The live catalog uses a single colspan cell for a proven empty search.
    if (cells.length === 1 && /^No Records$/i.test(text(cells[0][2])) && attrs(cells[0][1]).colspan === '9') {
      if (emptySeen) return null;
      emptySeen = true;
      continue;
    }
    if (cells.length !== 6 || cells.some(cell => spans(cell[1]))) return null;
    const values = cells.map(cell => canonical(text(cell[2])));
    if (!/^\d+$/.test(values[0]) || !values[1] || !values[3]) return null;
    let recordId;
    try { recordId = createTitleAuthorId(values[1], values[3]); } catch { return null; }
    rows.push({ recordId, title: values[1], author: values[3], subject: values[2], location: values[4], status: values[5] });
  }
  if (rows.length > 50 || (!rows.length && !emptySeen) || (rows.length && emptySeen)) return null;
  const hasMore = [...markup.matchAll(/<a\b([^>]*)>/gi)].some(tag => {
    try {
      const link = new URL(attrs(tag[1]).href, url);
      return link.origin === ORIGIN && /^\/books\/?$/.test(link.pathname) && Number(link.searchParams.get('per_page')) > 0;
    } catch { return false; }
  });
  return { rows, hasMore };
}

async function read(field, phrase, deadlineAt) {
  const url = searchUrl(field, phrase);
  return cachedTask(`vpl:${url}`, async () => {
    let response;
    try {
      response = await getText(url.toString(), { deadlineAt, maxResponseBytes: 1024 * 1024, redirect: 'manual', retries: 0 });
    } catch (error) {
      throw failure(error.name === 'AbortError' ? 'CATALOG_TIMEOUT' : 'CATALOG_UNAVAILABLE', 'Public catalog request failed');
    }
    if ([401, 403, 429].includes(response.status) || /cf-chl-|Just a moment|captcha/i.test(response.text)) {
      throw failure('CATALOG_PROVIDER_BLOCKED', 'Public catalog access is restricted');
    }
    if (!response.ok) throw failure('CATALOG_UNAVAILABLE', `Public catalog returned HTTP ${response.status}`);
    if (response.url !== url.toString()) throw failure('CATALOG_UNRECOGNIZED', 'Unexpected public catalog response');
    const page = parseCatalogPage(response.text, url);
    if (!page) throw failure('CATALOG_UNRECOGNIZED', 'Public catalog format was not recognized');
    return { ...page, catalogUrl: url.toString() };
  }, { deadlineAt });
}

const book = row => ({ recordId: row.recordId, title: row.title, authors: [row.author], ...(row.subject ? { subjects: [row.subject] } : {}) });

export async function searchPublicCatalog(library, query) {
  configure(library);
  if (typeof query !== 'string' || query.length > 160) throw failure('CATALOG_UNRECOGNIZED', 'Invalid title or author query');
  const phrase = catalogPhrase(query);
  if (!phrase) throw failure('CATALOG_UNRECOGNIZED', 'Enter a title or author');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const titles = await read('title', phrase, deadlineAt);
  const authors = titles.rows.length < 12 ? await read('author', phrase, deadlineAt) : { rows: [], hasMore: false };
  const records = [...new Map([...titles.rows, ...authors.rows].map(row => [row.recordId, book(row)])).values()];
  return { records: records.slice(0, 12), hasMore: titles.hasMore || authors.hasMore || records.length > 12 };
}

async function resolveRows(library, recordId) {
  configure(library);
  const identity = parseTitleAuthorId(recordId);
  if (!identity) throw failure('CATALOG_UNRECOGNIZED', 'Invalid title and author identity');
  const deadlineAt = Date.now() + DEFAULT_TIMEOUT_MS;
  const titlePhrase = catalogPhrase(identity.title), authorPhrase = catalogPhrase(identity.author);
  if (!titlePhrase && !authorPhrase) throw failure('CATALOG_UNRECOGNIZED', 'This identity has no searchable title or author');
  let page = titlePhrase ? await read('title', titlePhrase, deadlineAt) : await read('author', authorPhrase, deadlineAt);
  let rows = page.rows.filter(row => row.recordId === recordId);
  if (authorPhrase && titlePhrase && (!rows.length || page.hasMore)) {
    const alternative = await read('author', authorPhrase, deadlineAt);
    const matches = alternative.rows.filter(row => row.recordId === recordId);
    if (matches.length && (!alternative.hasMore || !rows.length)) { page = alternative; rows = matches; }
  }
  if (!rows.length) throw failure('CATALOG_UNRECOGNIZED', 'This title and author were not found in the current catalog');
  return { ...page, rows };
}

export async function resolvePublicCatalogRecord(library, recordId) {
  return book((await resolveRows(library, recordId)).rows[0]);
}

function lendingStatus(row) {
  if (/not for loan|reference only/i.test(row.status) || /reference|textbook|special collection|gandhiana/i.test(row.location)) return 'restricted';
  // Published rules allow loans from General and Children sections. CA and
  // unrecognized shelf codes do not establish whether an item can be borrowed.
  if (!/^GS(?:-\d+)?(?:\s|$)|^Children(?:'s)? Section$/i.test(row.location)) return 'unknown';
  if (row.status === 'Available') return 'available';
  if (row.status === 'Issued') return 'unavailable';
  return 'unknown';
}

export async function checkPublicRecordAvailability(library, recordId) {
  const page = await resolveRows(library, recordId);
  const statuses = page.rows.map(lendingStatus);
  // A displayed row is not a proven unique physical copy. Never invent counts.
  const result = { outcome: 'unknown', matchKind: 'verified_work', recognizedTitleAuthor: true,
    catalogUrl: page.catalogUrl, catalogLinkKind: 'search', locations: [...new Map(page.rows.filter(row => row.location).map(row =>
      [row.location, { name: row.location, status: 'unknown' }])).values()] };
  if (page.hasMore || statuses.includes('unknown')) return result;
  if (statuses.every(status => status === 'restricted')) result.loanRestriction = 'not_for_loan';
  else if (statuses.every(status => status === 'available')) result.outcome = 'available';
  else if (statuses.every(status => status === 'unavailable')) result.outcome = 'none_available';
  // Conflicting rows with no edition/copy identifiers remain uncertain.
  for (const location of result.locations) {
    const values = page.rows.filter(row => row.location === location.name).map(lendingStatus);
    if (values.every(status => status === 'available')) location.status = 'available';
    if (values.every(status => status === 'unavailable')) location.status = 'unavailable';
  }
  return result;
}

export async function checkPublicAvailability() {
  // This catalog has no ISBN field. An ISBN match cannot be established by
  // finding a similarly named work; ask the reader to select a catalog title.
  throw failure('CATALOG_TITLE_SEARCH_REQUIRED', 'Select the title in this library catalog');
}
