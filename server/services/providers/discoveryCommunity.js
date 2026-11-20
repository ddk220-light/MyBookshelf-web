import { attributes, catalogError, firstIsbn, quoteFreeQuery, text, uninvertedTitle, withoutLeadingArticle } from './catalogMarkup.js';
import { isbnMatches } from './contract.js';
import { validateAndNormalize } from '../isbn.js';
import { CommunitySession, hiddenFields, jsonResponse } from './communitySession.js';
import { aggregateObservations, boundedQuery, distinctRecords, fingerprint, markHasMore, markSearchComplete, normalized, observation, parseReplayId, replayId } from './communityRecords.js';
import { PMB_SCOPES, checkPmbIsbn, resolvePmb, searchPmb } from './communityPmb.js';

const FAMILIES = Object.freeze({
  surat: 'https://office.suratmunicipal.org', rmc: 'https://emp.rmc.gov.in', rmrl: 'https://rmrl.in',
  nmmc: 'https://vdb.nmmclibrary.in', santhom: 'https://lib.pvpkottayam.in', shodhak: 'https://shodhakbooks.in',
  sindhi: 'https://sindhisanchaya.online', pmb: 'https://mediatheques-afinde.org',
});
const SINDHI_HOLDERS = Object.freeze({
  'indian-institute-of-sindhology': 'Indian Institute of Sindhology Library',
  'sindhu-youth-circle': 'Sindhu Youth Circle', 'chm-college-ulhasnagar': 'Smt CHM College, Ulhasnagar',
});
const DIGITS = /^\d{1,20}$/;
function config(library) {
  const c = library.communityCatalog;
  if (!c || !FAMILIES[c.family] || library.baseUrl !== FAMILIES[c.family]) throw catalogError('Community catalog is not configured');
  if (c.family === 'surat' && !['1', '2', '5', '6', '7'].includes(c.scope)) throw catalogError('Unknown catalog branch');
  if (c.family === 'rmc' && (!/^\d{1,2}$/.test(c.scope) || Number(c.scope) < 1 || Number(c.scope) > 21)) throw catalogError('Unknown catalog branch');
  if (c.family === 'sindhi' && !SINDHI_HOLDERS[c.scope]) throw catalogError('Unknown archival collection');
  if (c.family === 'pmb' && !PMB_SCOPES[c.scope]) throw catalogError('Unknown catalog branch');
  return c;
}
function status(value) {
  const label = normalized(value);
  return ['available', 'in library'].includes(label) ? 'available'
    : ['issued', 'lended', 'in circulation'].includes(label) ? 'unavailable' : 'unknown';
}
function record(library, query, sourceId, title, authors = [], extra = {}) {
  return { recordId: replayId(query, sourceId), title: uninvertedTitle(text(title)).slice(0, 500),
    authors: authors.map(a => text(a)).filter(Boolean).slice(0, 10), ...extra };
}

function suratParams(library, query, by = 'BookName') {
  const values = { draw: '1', start: '0', length: '10', 'search[value]': '', 'search[regex]': 'false',
    'order[0][column]': '1', 'order[0][dir]': 'asc', 'CustomData[SearchType]': by,
    'CustomData[SearchBy]': query, 'CustomData[LibraryId]': library.communityCatalog.scope, 'CustomData[bookCLSVal]': '' };
  ['BookCode', 'BookName', 'Language', 'BookStatus', 'LibraryName', 'SectionName', 'IssueDate', 'ExpectedReturnDate', 'AverageRating']
    .forEach((field, i) => Object.assign(values, { [`columns[${i}][data]`]: field, [`columns[${i}][name]`]: '',
      [`columns[${i}][searchable]`]: 'true', [`columns[${i}][orderable]`]: 'false',
      [`columns[${i}][search][value]`]: '', [`columns[${i}][search][regex]`]: 'false' }));
  return new URLSearchParams(values);
}
export function parseSurat(data, library) {
  if (data?.status !== 200 || !Array.isArray(data.data) || !Number.isInteger(data.iTotalRecords)) throw catalogError('Unrecognized municipal response');
  const records = data.data.map(row => {
    if (String(row.LibraryId) !== library.communityCatalog.scope) throw catalogError('Catalog returned another library', 'CATALOG_HOLDING_UNCONFIRMED');
    if (!DIGITS.test(String(row.BookId)) || !/^[A-Za-z0-9]{1,20}$/.test(row.BookCode || '') || !row.BookName) throw catalogError('Unrecognized municipal book');
    // A reference-section copy is not established as borrowable by AVAILABLE.
    const state = /reference/i.test(row.SectionName || '') ? 'unknown' : status(row.BookStatus);
    return { recordId: `s1_${row.BookCode}_${row.BookId}`, title: text(row.BookName), authors: row.AuthorName ? [text(row.AuthorName)] : [],
      observation: observation(library, library.catalogUrl, state, row.ClassificationNo) };
  });
  if (data.iTotalRecords > 0 && !records.length) throw catalogError('Municipal records missing');
  return markHasMore(distinctRecords(records), data.iTotalRecords > data.data.length);
}
async function suratSearch(library, query, session, by) {
  const response = await session.read(`/LMS/Home/GetSearchData?${suratParams(library, query, by)}`);
  return parseSurat(jsonResponse(response), library);
}

export function parseSanthom(data, library, query) {
  if (data?.success !== true || !Array.isArray(data.items) || !Number.isInteger(data.total)) throw catalogError('Unrecognized library response');
  const records = data.items.map(row => {
    if (!row.title || row.type !== 'book') throw catalogError('Unrecognized library book');
    const id = fingerprint([row.title, row.author, row.call_no, row.year_published, row.isbn]);
    return record(library, query, id, row.title, [row.author], { isbn: firstIsbn(row.isbn),
      publishedDate: row.year_published > 0 ? String(row.year_published) : undefined,
      observation: observation(library, library.catalogUrl, status(row.status), row.call_no) });
  });
  if (data.total > 0 && !records.length) throw catalogError('Library records missing');
  const complete = data.total === data.items.length;
  const distinct = distinctRecords(records);
  // These rows lack accession IDs: a bibliographic fingerprint can represent
  // several copies. Unseen pages may contain another copy of the same book.
  if (!complete) for (const item of distinct) item.observation = aggregateObservations([item.observation], { complete: false });
  return markSearchComplete(distinct, complete && new Set(records.map(item => item.recordId)).size === distinct.length);
}
async function santhomSearch(library, query, session) {
  async function read(title) {
    const params = new URLSearchParams({ ajax: '1', type: 'books', title, author: '', year: '', call_no: '',
      titleFilter: 'contains', authorFilter: 'contains', yearFilter: 'contains', callNoFilter: 'contains', page: '1' });
    // Keep the original query in replay IDs, including when the second search
    // compensates for repeated whitespace in the catalog's stored title.
    return parseSanthom(jsonResponse(await session.read(`/book.php?${params}`)), library, query);
  }
  const records = await read(query);
  const words = query.split(' ');
  if (records.length || records.searchComplete !== true || words.length < 5) return records;
  const prefix = words.slice(0, 4).join(' ');
  if (prefix.length < 8) return records;
  const wanted = normalized(query);
  const candidates = await read(prefix);
  // A prefix is only a way to retrieve the requested full title. Unrelated
  // books sharing that prefix must not become results for the original query.
  return markSearchComplete(candidates.filter(item => normalized(item.title).includes(wanted)), false);
}

export function parseNmmc(data, library, query) {
  if (!Array.isArray(data)) throw catalogError('Unrecognized library response');
  return distinctRecords(data.slice(0, 30).map(row => {
    if (!DIGITS.test(String(row.cat_ref_num)) || !row.title) throw catalogError('Unrecognized library book');
    return record(library, query, row.cat_ref_num, row.title, [row.author], { publisher: text(row.publisher),
      publishedDate: row.year_of_publication ? String(row.year_of_publication) : undefined,
      observation: observation(library, library.catalogUrl, 'unknown', row.call_number) });
  }));
}
async function nmmcSearch(library, query, session) {
  const home = await session.read('/L01/view_ebook_catalogue');
  const csrf = hiddenFields(home.text).csrfmiddlewaretoken || session.cookie('csrftoken');
  if (!csrf) throw catalogError('Anonymous catalog token missing');
  const languages = /[\u0900-\u097f]/.test(query) ? ['hindi', 'marathi'] : ['english'];
  const records = [];
  for (const language of languages) {
    const response = await session.post('/L01/bookcatalog-search', { searchType: 'title', query, language, csrfmiddlewaretoken: csrf },
      { Referer: `${FAMILIES.nmmc}/L01/view_ebook_catalogue` });
    records.push(...parseNmmc(jsonResponse(response), library, query));
  }
  return distinctRecords(records);
}

export function parseRmrl(html, library, query) {
  const found = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.entries) && Number.isInteger(value.totalCount) && value.searchdb === 'books') found.push(value);
    for (const child of Object.values(value)) visit(child);
  }
  // Read JSON serialized by the public page; never execute its scripts.
  for (const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    let payload;
    try { payload = JSON.parse(m[1]); } catch { continue; }
    if (typeof payload?.[1] !== 'string') continue;
    for (const line of payload[1].split('\n')) {
      const raw = /^[0-9a-f]+:([\[{].*)$/.exec(line)?.[1];
      if (raw) { try { visit(JSON.parse(raw)); } catch { /* Non-JSON Flight chunks have no records. */ } }
    }
  }
  if (found.length !== 1) throw catalogError('Unrecognized research catalog response');
  const result = found[0];
  const records = result.entries.slice(0, 20).map(row => {
    if (!DIGITS.test(String(row.Id_book)) || !row.Title_Tam) throw catalogError('Unrecognized research book');
    return record(library, query, row.Id_book, row.Title_Tam, [row.Author_Tam || row.Author_Rom], {
      publisher: text(row.publisher_Tam || row.publisher_Rom), publishedDate: text(row.year),
      observation: observation(library, `${FAMILIES.rmrl}/en/onlinecat/result?${new URLSearchParams({ text: query, searchby: 'title', item: 'books' })}`) });
  });
  if (result.totalCount > 0 && !records.length) throw catalogError('Research catalog records missing');
  return markHasMore(distinctRecords(records), result.totalCount > records.length);
}
async function rmrlSearch(library, query, session) {
  const response = await session.read(`/en/onlinecat/result?${new URLSearchParams({ text: query, searchby: 'title', item: 'books' })}`);
  return parseRmrl(response.text, library, query);
}

// An empty search is the result grid with no book in it (19 Nov 2026):
// <div class="card-body game-product ..."><div class="row"> </div></div>.
const SHODHAK_EMPTY_GRID = /<div\b[^>]*class=["'][^"']*\bgame-product\b[^"']*["'][^>]*>\s*<div\b[^>]*class=["']row["'][^>]*>\s*<\/div>/i;
export function parseShodhak(data, library, query) {
  if (typeof data?.data !== 'string') throw catalogError('Unrecognized lending-library response');
  const html = data.data.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const blocks = html.split(/(?=<div\b[^>]*class=["']product-box["'])/i).slice(1);
  const records = [];
  for (const block of blocks.slice(0, 30)) {
    const sourceId = block.match(/data-id=["'](\d+)["']/i)?.[1];
    const title = text(block.match(/<h6\b[^>]*>([\s\S]*?)<\/h6>/i)?.[1]);
    const badge = text(block.match(/<span\b[^>]*class=["'][^"']*card-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const author = text(block.match(/<span\b[^>]*class=["'][^"']*\bcustom_author\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    if (!sourceId || !title) throw catalogError('Unrecognized lending-library book');
    records.push(record(library, query, sourceId, title, [author], { observation: observation(library, library.catalogUrl, status(badge)) }));
  }
  if (!records.length && !SHODHAK_EMPTY_GRID.test(html) && !/no (?:books?|results?|records?)(?:\s+found|\s+available)/i.test(text(html))) throw catalogError('Unrecognized empty lending search');
  // The list has no count or pages: 30 or more cards may not be all of them.
  return markHasMore(distinctRecords(records), blocks.length >= 30);
}
// The anonymous Shodhak session (cookie and CSRF token from the home page)
// is reused for a few minutes, so a check's later searches are one request.
// A reused session that is refused or answers oddly is replaced once.
const SHODHAK_SESSION_TTL_MS = 5 * 60 * 1000;
let shodhakState = null;
export function clearCommunitySessions() { shodhakState = null; rmcStates.clear(); }
async function shodhakSearch(library, query, session) {
  const post = (csrf) => session.read('/getBookList', { method: 'POST', body: JSON.stringify({ author_id: [], category_id: [], search_book: query, language_id: '' }),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, Referer: `${FAMILIES.shodhak}/`, 'X-Requested-With': 'XMLHttpRequest' } });
  const fresh = async () => {
    session.cookies = new Map();
    const home = await session.read('/');
    const csrf = [...home.text.matchAll(/<meta\b([^>]*)>/gi)].map(m => attributes(m[1])).find(a => a.name === 'csrf-token')?.content;
    if (!csrf) throw catalogError('Anonymous catalog token missing');
    shodhakState = { cookies: new Map(session.cookies), csrf, expiresAt: Date.now() + SHODHAK_SESSION_TTL_MS };
    return csrf;
  };
  const cached = shodhakState && shodhakState.expiresAt > Date.now() ? shodhakState : null;
  if (cached) {
    session.cookies = new Map(cached.cookies);
    try { return parseShodhak(jsonResponse(await post(cached.csrf)), library, query); }
    catch (error) {
      // An expired token is HTTP 419 (unavailable here); a refusal is final.
      if (error.code === 'CATALOG_PROVIDER_BLOCKED' || Date.now() >= session.deadlineAt) throw error;
      if (shodhakState === cached) shodhakState = null;
    }
  }
  return parseShodhak(jsonResponse(await post(await fresh())), library, query);
}

function assertRmcScope(html, scope) {
  const select = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].find(m => attributes(m[1]).name === 'ctl00$body$ddlLibrary');
  const selected = select && [...select[2].matchAll(/<option\b([^>]*)>/gi)].map(m => attributes(m[1])).filter(a => Object.hasOwn(a, 'selected'));
  if (!selected || selected.length !== 1 || selected[0].value !== scope) throw catalogError('Catalog returned another library', 'CATALOG_HOLDING_UNCONFIRMED');
}
export function parseRmc(html, library, query) {
  assertRmcScope(html, library.communityCatalog.scope);
  const records = [];
  const starts = [...html.matchAll(/<input\b([^>]*\bname=["'][^"']*\$ItemMasterId["'][^>]*)>/gi)];
  for (let i = 0; i < Math.min(starts.length, 30); i++) {
    const a = attributes(starts[i][1]);
    const block = html.slice(starts[i].index, starts[i + 1]?.index || html.length);
    const title = text(block.match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1]);
    const author = text(block.match(/Author Name\s*:\s*([\s\S]*?)<br\s*\/?>/i)?.[1]);
    const callNumber = text(block.match(/Classification\s*:\s*([\s\S]*?)<br\s*\/?>/i)?.[1]);
    if (!DIGITS.test(a.value || '') || !title) throw catalogError('Unrecognized municipal book');
    records.push(record(library, query, a.value, title, [author], { observation: observation(library, library.catalogUrl, 'unknown', callNumber) }));
  }
  const explicitZero = /No Records? Found|No Data Found|No records to display/i.test(text(html))
    || /\bmsgAlert_error\(\s*['"]No records found[.!]?['"]\s*\)/i.test(html);
  if (!records.length && !explicitZero) throw catalogError('Unrecognized empty municipal search');
  return markHasMore(distinctRecords(records), starts.length > 30);
}
// Reaching the title form takes three requests (dashboard, Books, search
// type). Its result page keeps the same form, so a later search in the same
// anonymous session is one POST. The state is kept a few minutes per branch
// and language; a stale one (another page, another branch) is replaced once.
const RMC_SESSION_TTL_MS = 5 * 60 * 1000, rmcStates = new Map();
const RMC_INPUT = 'ctl00$body$rpt_SearchTypeMaster$ctl01$SearchValue';
function rmcState(session, response, key) {
  rmcStates.set(key, { cookies: new Map(session.cookies), hidden: hiddenFields(response.text), url: response.url, expiresAt: Date.now() + RMC_SESSION_TTL_MS });
  while (rmcStates.size > 64) rmcStates.delete(rmcStates.keys().next().value);
}
async function rmcSearch(library, query, session) {
  const language = /[\u0a80-\u0aff]/.test(query) ? '2' : /[\u0900-\u097f]/.test(query) ? '3' : '1';
  const fields = { 'ctl00$body$ddlLanguage': language, 'ctl00$body$ddlLibrary': library.communityCatalog.scope,
    'ctl00$body$lbSearchType': '1', 'ctl00$body$btnSearch': 'Search' };
  // The catalog builds SQL from the text: an apostrophe is a server error.
  const actualQuery = quoteFreeQuery(query).slice(0, 50).trim();
  const key = `${library.communityCatalog.scope}:${language}`, cached = rmcStates.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    session.cookies = new Map(cached.cookies);
    try {
      const response = await session.post(cached.url, { ...cached.hidden, ...fields, [RMC_INPUT]: actualQuery });
      const records = parseRmc(response.text, library, actualQuery);
      rmcState(session, response, key);
      return records;
    } catch (error) {
      if (error.code === 'CATALOG_PROVIDER_BLOCKED' || Date.now() >= session.deadlineAt) throw error;
      if (rmcStates.get(key) === cached) rmcStates.delete(key);
      session.cookies = new Map();
    }
  }
  let response = await session.read('/rmclibrary/generaldashboard');
  if (!response.text.includes('ctl00$body$ctl01')) throw catalogError('Public books navigation missing');
  response = await session.post(response.url, { ...hiddenFields(response.text), __EVENTTARGET: 'ctl00$body$ctl01', __EVENTARGUMENT: '' });
  response = await session.post(response.url, { ...hiddenFields(response.text), ...fields });
  const input = [...response.text.matchAll(/<input\b([^>]*)>/gi)].map(m => attributes(m[1]))
    .find(a => a.type === 'text' && a.name === RMC_INPUT);
  if (!input) throw catalogError('Public title input missing');
  response = await session.post(response.url, { ...hiddenFields(response.text), ...fields, [input.name]: actualQuery });
  const records = parseRmc(response.text, library, actualQuery);
  rmcState(session, response, key);
  return records;
}

export function parseSindhiRecord(html, library, id) {
  const holder = SINDHI_HOLDERS[library.communityCatalog.scope];
  const heldLinks = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m => {
    const href = attributes(m[1]).href;
    if (!href) return false;
    const url = new URL(href, FAMILIES.sindhi);
    return url.origin === FAMILIES.sindhi && url.pathname === '/books' && url.searchParams.get('field') === 'lists';
  });
  if (!heldLinks.some(m => normalized(text(m[2])) === normalized(holder))) throw catalogError('Record belongs to another collection', 'CATALOG_HOLDING_UNCONFIRMED');
  const canonical = [...html.matchAll(/<link\b([^>]*)>/gi)].map(m => attributes(m[1])).find(a => a.rel === 'canonical');
  if (canonical?.href !== `${FAMILIES.sindhi}/books/${id}`) throw catalogError('Archival record changed');
  const title = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!title) throw catalogError('Archival title missing');
  const bookmark = [...html.matchAll(/<button\b([^>]*)>/gi)].map(m => attributes(m[1])).find(a => a['data-book-id'] === id);
  const authors = bookmark?.['data-book-author'] ? [text(bookmark['data-book-author'])] : [];
  const catalogUrl = `${FAMILIES.sindhi}/books/${id}`, obs = observation(library, catalogUrl);
  obs.catalogLinkKind = 'record';
  return { recordId: id, title, authors, observation: obs };
}
async function sindhiResolve(library, id, session) {
  if (!DIGITS.test(id)) throw catalogError('Invalid archival record');
  return parseSindhiRecord((await session.read(`/books/${id}`)).text, library, id);
}
async function sindhiSearch(library, query, session) {
  const response = await session.read(`/books?${new URLSearchParams({ q: query, field: 'title' })}`);
  const ids = [...new Set([...response.text.matchAll(/<button\b([^>]*)>/gi)].map(m => attributes(m[1])['data-book-id']).filter(id => DIGITS.test(id || '')))];
  if (!ids.length) {
    if (/no books|no results|0 books|Showing 0/i.test(text(response.text))) return [];
    throw catalogError('Unrecognized archival search');
  }
  // The archive is shared by several collections. A record whose page lists
  // another holder is not this library's book; one we could not read leaves
  // the search incomplete.
  const records = [];
  // Each record is one more request: four at most (result marking, the
  // catalog search screen; a library check uses searchTitle instead).
  const read = 4;
  let incomplete = ids.length > read;
  for (const id of ids.slice(0, read)) {
    try { records.push(await sindhiResolve(library, id, session)); }
    catch (error) {
      if (error.code === 'CATALOG_HOLDING_UNCONFIRMED') continue;
      if (!records.length) throw error;
      incomplete = true;
      break;
    }
  }
  return markHasMore(records, incomplete);
}

// Title searches that match anywhere in the title (checked 19 Nov 2026);
// a leading article is left out so "Discovery of India, The" is found too.
const TITLE_CONTAINS = new Set(['surat', 'santhom', 'shodhak', 'rmc', 'rmrl', 'pmb', 'sindhi']);
async function search(library, input, deadlineAt = Date.now() + 45_000) {
  const c = config(library), bounded = boundedQuery(input);
  const query = TITLE_CONTAINS.has(c.family) ? withoutLeadingArticle(bounded) : bounded;
  const session = new CommunitySession(FAMILIES[c.family], deadlineAt);
  switch (c.family) {
    case 'surat': return suratSearch(library, query, session);
    case 'santhom': return santhomSearch(library, query, session);
    case 'nmmc': return nmmcSearch(library, query, session);
    case 'rmrl': return rmrlSearch(library, query, session);
    case 'shodhak': return shodhakSearch(library, query, session);
    case 'rmc': return rmcSearch(library, query, session);
    case 'sindhi': return sindhiSearch(library, query, session);
    case 'pmb': return searchPmb(library, query, deadlineAt);
    default: throw catalogError('Unsupported community catalog', 'CATALOG_UNSUPPORTED');
  }
}
export async function searchCatalog(library, query) { return search(library, query); }

// A reader's library check (libraryBookSearch.js): one title search, and its
// rows. The Sindhi archive (shared by several collections) and PMB (shared by
// several branches) list rows that do not show this library's holding: a
// matching one is opened with readRecord, which throws
// CATALOG_HOLDING_UNCONFIRMED for another collection's or branch's record.
export async function searchTitle(library, title) {
  const c = config(library);
  if (c.family !== 'sindhi') return search(library, title);
  const session = new CommunitySession(FAMILIES.sindhi, Date.now() + 45_000);
  const response = await session.read(`/books?${new URLSearchParams({ q: withoutLeadingArticle(boundedQuery(title)), field: 'title' })}`);
  const rows = new Map();
  for (const m of response.text.matchAll(/<button\b([^>]*)>/gi)) {
    const a = attributes(m[1]);
    if (DIGITS.test(a['data-book-id'] || '') && a['data-book-title'] && !rows.has(a['data-book-id'])) {
      rows.set(a['data-book-id'], { recordId: a['data-book-id'], title: text(a['data-book-title']), authors: a['data-book-author'] ? [text(a['data-book-author'])] : [] });
    }
  }
  if (!rows.size && !/no books|no results|0 books|Showing 0/i.test(text(response.text))) throw catalogError('Unrecognized archival search');
  return [...rows.values()];
}
export async function readRecord(library, id) {
  const c = config(library);
  if (c.family === 'sindhi') return sindhiResolve(library, id, new CommunitySession(FAMILIES.sindhi, Date.now() + 45_000));
  if (c.family !== 'pmb') throw catalogError('This catalog has no record pages', 'CATALOG_UNSUPPORTED');
  try { return await resolvePmb(library, id, Date.now() + 45_000); }
  catch (error) { throw error.otherBranch ? catalogError('Another branch’s record', 'CATALOG_HOLDING_UNCONFIRMED') : error; }
}

export async function resolveCatalogRecord(library, id) {
  const c = config(library), deadlineAt = Date.now() + 45_000;
  if (c.family === 'pmb') return resolvePmb(library, id, deadlineAt);
  const session = new CommunitySession(FAMILIES[c.family], deadlineAt);
  if (c.family === 'sindhi') return sindhiResolve(library, id, session);
  if (c.family === 'surat') {
    const match = /^s1_([A-Za-z0-9]{1,20})_(\d{1,20})$/.exec(id || '');
    if (!match) throw catalogError('Invalid municipal record');
    const results = await suratSearch(library, match[1], session, 'BookCode');
    const result = results.find(r => r.recordId === id);
    if (!result) throw catalogError('Record no longer confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
    return result;
  }
  const replay = parseReplayId(id);
  const results = await search(library, replay.query, deadlineAt);
  const result = results.find(r => r.recordId === id);
  if (!result) throw catalogError('Record no longer confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
  return result;
}

export async function checkAvailability(library, isbn, title, author) {
  const c = config(library), normalizedIsbn = validateAndNormalize(isbn), deadlineAt = Date.now() + 45_000;
  // No exact-search absence claim is made for a title/keyword-only catalog.
  const usableTitle = title && !/^ISBN\s+\d+$/i.test(title) ? title : null;
  if (!usableTitle) {
    // An ISBN alone: only PMB has an ISBN index. Elsewhere the lookup cannot
    // run, which is not the catalog's failure and says nothing about absence.
    if (c.family === 'pmb' && normalizedIsbn) return checkPmbIsbn(library, normalizedIsbn, deadlineAt);
    throw catalogError('This catalog cannot be searched by ISBN', normalizedIsbn ? 'CATALOG_QUERY_UNSUPPORTED' : 'CATALOG_UNSUPPORTED');
  }
  const records = await search(library, usableTitle, deadlineAt);
  const detailed = [];
  let complete = records.searchComplete === true;
  let detailError;
  if (c.family === 'pmb') {
    const read = 3;
    if (records.length > read) complete = false;
    for (const item of records.slice(0, read)) {
      try { detailed.push(await resolvePmb(library, item.recordId, deadlineAt)); }
      catch (error) {
        complete = false;
        detailError = error;
        // Continue the bounded set after an ordinary record failure, but stop
        // on access refusal or an exhausted operation deadline.
        if (error.code === 'CATALOG_PROVIDER_BLOCKED' || Date.now() >= deadlineAt) break;
      }
    }
  } else detailed.push(...records);
  const exact = normalizedIsbn ? detailed.filter(r => r.isbn && isbnMatches(r.isbn, normalizedIsbn)) : [];
  // A sibling without an ISBN cannot be excluded from the requested edition,
  // even when every result page and detail completed. Its availability cannot
  // be promoted to an exact match either.
  const exactComplete = complete && detailed.every(item => Boolean(item.isbn));
  if (exact.length) return { ...aggregateObservations(exact.map(item => item.observation), { complete: exactComplete }),
    matchKind: 'exact_isbn', recognizedExact: true };
  const titleKey = normalized(usableTitle).replace(/\b(?:a|an|the)\b/g, '').replace(/\s+/g, ' ').trim();
  const authorWords = [...new Set(normalized(author).split(' ').filter(word => word.length > 2 && !['dr', 'prof', 'sir'].includes(word)))];
  const possible = detailed.find(r => {
    const candidate = normalized(r.title).replace(/\b(?:a|an|the)\b/g, '').replace(/\s+/g, ' ').trim();
    const titleMatches = titleKey && (candidate === titleKey || (titleKey.length >= 8 && candidate.startsWith(`${titleKey} `)));
    if (!titleMatches) return false;
    if (!authorWords.length || !r.authors?.length) return true;
    // Catalogs commonly reverse a surname or omit a coauthor. This remains a
    // possible match, never an exact-edition or available-copy assertion.
    const compactAuthors = normalized(r.authors.join(' ')).replace(/\s/g, '');
    return authorWords.filter(word => compactAuthors.includes(word)).length >= Math.min(2, authorWords.length);
  });
  if (possible) {
    // A title match can guide the user to this catalog but cannot establish
    // the scanned edition or its available-copy count.
    return { outcome: 'in_catalog', matchKind: 'possible_match', recognizedExact: false,
      catalogUrl: possible.observation?.catalogUrl || library.catalogUrl,
      catalogLinkKind: possible.observation?.catalogUrl ? possible.observation.catalogLinkKind || 'search' : 'catalog' };
  }
  if (detailError) throw detailError;
  throw catalogError('The requested edition is not confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
}
