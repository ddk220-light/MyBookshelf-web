import { attributes, catalogError, firstIsbn, text } from './catalogMarkup.js';
import { isbnMatches } from './contract.js';
import { validateAndNormalize } from '../isbn.js';
import { CommunitySession, hiddenFields, jsonResponse } from './communitySession.js';
import { aggregateObservations, boundedQuery, distinctRecords, fingerprint, markSearchComplete, normalized, observation, parseReplayId, replayId } from './communityRecords.js';
import { PMB_SCOPES, resolvePmb, searchPmb } from './communityPmb.js';

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
  return { recordId: replayId(query, sourceId), title: text(title).slice(0, 500),
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
  return distinctRecords(records);
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
  const params = new URLSearchParams({ ajax: '1', type: 'books', title: query, author: '', year: '', call_no: '',
    titleFilter: 'contains', authorFilter: 'contains', yearFilter: 'contains', callNoFilter: 'contains', page: '1' });
  return parseSanthom(jsonResponse(await session.read(`/book.php?${params}`)), library, query);
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
  return distinctRecords(records);
}
async function rmrlSearch(library, query, session) {
  const response = await session.read(`/en/onlinecat/result?${new URLSearchParams({ text: query, searchby: 'title', item: 'books' })}`);
  return parseRmrl(response.text, library, query);
}

export function parseShodhak(data, library, query) {
  if (typeof data?.data !== 'string') throw catalogError('Unrecognized lending-library response');
  const blocks = data.data.split(/(?=<div\b[^>]*class=["']product-box["'])/i).slice(1);
  const records = [];
  for (const block of blocks.slice(0, 30)) {
    const sourceId = block.match(/data-id=["'](\d+)["']/i)?.[1];
    const title = text(block.match(/<h6\b[^>]*>([\s\S]*?)<\/h6>/i)?.[1]);
    const badge = text(block.match(/<span\b[^>]*class=["'][^"']*card-badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    if (!sourceId || !title) throw catalogError('Unrecognized lending-library book');
    records.push(record(library, query, sourceId, title, [], { observation: observation(library, library.catalogUrl, status(badge)) }));
  }
  if (!records.length && !/no (?:books?|results?|records?)(?:\s+found|\s+available)/i.test(text(data.data))) throw catalogError('Unrecognized empty lending search');
  return distinctRecords(records);
}
async function shodhakSearch(library, query, session) {
  const home = await session.read('/');
  const csrf = [...home.text.matchAll(/<meta\b([^>]*)>/gi)].map(m => attributes(m[1])).find(a => a.name === 'csrf-token')?.content;
  if (!csrf) throw catalogError('Anonymous catalog token missing');
  const response = await session.read('/getBookList', { method: 'POST', body: JSON.stringify({ author_id: [], category_id: [], search_book: query, language_id: '' }),
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf, Referer: `${FAMILIES.shodhak}/`, 'X-Requested-With': 'XMLHttpRequest' } });
  return parseShodhak(jsonResponse(response), library, query);
}

function assertRmcScope(html, scope) {
  const select = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)].find(m => attributes(m[1]).name === 'ctl00$body$ddlLibrary');
  const selected = select && [...select[2].matchAll(/<option\b([^>]*)>/gi)].map(m => attributes(m[1])).filter(a => Object.hasOwn(a, 'selected'));
  if (!selected || selected.length !== 1 || selected[0].value !== scope) throw catalogError('Catalog returned another library', 'CATALOG_HOLDING_UNCONFIRMED');
}
export function parseRmc(html, library, query, {native=false}={}) {
  assertRmcScope(html, library.communityCatalog.scope);
  const records = [];
  const starts = [...html.matchAll(/<input\b([^>]*\bname=["'][^"']*\$ItemMasterId["'][^>]*)>/gi)];
  for (let i = 0; i < (native?starts.length:Math.min(starts.length, 30)); i++) {
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
  return native?records:distinctRecords(records);
}
async function rmcSearch(library, query, session, {native=false}={}) {
  let response = await session.read('/rmclibrary/generaldashboard');
  if (!response.text.includes('ctl00$body$ctl01')) throw catalogError('Public books navigation missing');
  response = await session.post(response.url, { ...hiddenFields(response.text), __EVENTTARGET: 'ctl00$body$ctl01', __EVENTARGUMENT: '' });
  const language = /[\u0a80-\u0aff]/.test(query) ? '2' : /[\u0900-\u097f]/.test(query) ? '3' : '1';
  const fields = { 'ctl00$body$ddlLanguage': language, 'ctl00$body$ddlLibrary': library.communityCatalog.scope,
    'ctl00$body$lbSearchType': '1', 'ctl00$body$btnSearch': 'Search' };
  response = await session.post(response.url, { ...hiddenFields(response.text), ...fields });
  const input = [...response.text.matchAll(/<input\b([^>]*)>/gi)].map(m => attributes(m[1]))
    .find(a => a.type === 'text' && a.name === 'ctl00$body$rpt_SearchTypeMaster$ctl01$SearchValue');
  if (!input) throw catalogError('Public title input missing');
  const actualQuery = query.slice(0, 50);
  response = await session.post(response.url, { ...hiddenFields(response.text), ...fields, [input.name]: actualQuery });
  return parseRmc(response.text, library, actualQuery,{native});
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
  const records = [];
  for (const id of ids.slice(0, 6)) {
    try { records.push(await sindhiResolve(library, id, session)); }
    catch (error) { if (error.code !== 'CATALOG_HOLDING_UNCONFIRMED') { if (records.length) break; throw error; } }
  }
  if (!records.length) throw catalogError('Search did not confirm this collection', 'CATALOG_HOLDING_UNCONFIRMED');
  return records;
}

async function search(library, input, deadlineAt = Date.now() + 45_000) {
  const c = config(library), query = boundedQuery(input);
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

export function communityNativeProfile(library){const c=config(library);return {kind:c.family,supported:['pmb','rmc'].includes(c.family)};}
export async function searchNativeCatalog(library,query){
 const c=config(library);if(!communityNativeProfile(library).supported||boundedQuery(query)!==query||(c.family==='rmc'&&query.length>50))throw catalogError('Native website profile requires review or shorter literal input','UNSUPPORTED_PROFILE');
 const records=c.family==='pmb'?await searchPmb(library,query,Date.now()+45_000,{native:true}):await rmcSearch(library,query,new CommunitySession(FAMILIES.rmc,Date.now()+45_000),{native:true});
 const complete=records.searchComplete===true;
 return {records,total:complete?records.length:null,hasMore:!complete,continuationUnsupported:!complete,nativeProfile:{field:c.family==='pmb'?'ALL':'Title',variant:c.family,branch:c.scope,...(c.family==='rmc'?{language:/[\u0a80-\u0aff]/.test(query)?'Gujarati':/[\u0900-\u097f]/.test(query)?'Hindi':'English'}:{})}};
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
  if (!usableTitle && !(c.family === 'pmb' && normalizedIsbn)) throw catalogError('This catalog needs the book title', 'CATALOG_UNSUPPORTED');
  const records = await search(library, usableTitle || normalizedIsbn, deadlineAt);
  const detailed = [];
  let complete = records.searchComplete === true;
  let detailError;
  if (c.family === 'pmb') {
    if (records.length > 3) complete = false;
    for (const item of records.slice(0, 3)) {
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
      catalogLinkKind: possible.observation?.catalogLinkKind || 'search' };
  }
  if (detailError) throw detailError;
  throw catalogError('The requested edition is not confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
}
