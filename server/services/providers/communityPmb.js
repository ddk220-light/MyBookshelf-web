import ISBN from 'isbn3';
import { attributes, catalogError, firstIsbn, text } from './catalogMarkup.js';
import { CommunitySession, hiddenFields } from './communitySession.js';
import { aggregateObservations, boundedQuery, distinctRecords, markHasMore, markSearchComplete, normalized, observation } from './communityRecords.js';
import { isbnMatches } from './contract.js';
import { cachedTask } from './http.js';

const ORIGIN = 'https://mediatheques-afinde.org';
export const PMB_SCOPES = Object.freeze({ 12: 'Bangalore', 9: 'Bengale', 2: 'Bhopal', 16: 'Bombay', 3: 'Chandigarh',
  5: 'Delhi', 7: 'Gurgaon', 14: 'Hyderabad', 10: 'Lucknow', 4: 'Chennai', 18: 'Pondicherry', 15: 'Pune',
  19: 'Trivandrum', 17: 'Ahmedabad', 20: 'Jaipur', 11: 'Panjim' });
const scopeName = library => PMB_SCOPES[library.communityCatalog?.scope];
const afLabel = value => normalized(value).replace(/^a f\b/, 'af');
const scopeLabels = library => [scopeName(library), ...(library.communityCatalog.scope === '4' ? ['Madras'] : [])].map(n => afLabel(`AF ${n}`));
function viewUrl(library) {
  if (!scopeName(library)) throw catalogError('Unknown public catalog branch');
  return `${ORIGIN}/index.php?lvl=index&opac_view=${library.communityCatalog.scope}`;
}
function assertView(html, library) {
  const address = html.match(/<div\b[^>]*id=["']adresse["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const identity = address.match(/<span\b[^>]*>([\s\S]*?)(?:<br\b|<\/span>)/i)?.[1];
  if (!scopeLabels(library).includes(afLabel(identity))) throw catalogError('Catalog branch changed', 'CATALOG_HOLDING_UNCONFIRMED');
}
function rowFields(html) {
  const fields = {};
  for (const m of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const cls = attributes(m[1]).class || '';
    if (!/^record_/.test(cls)) continue;
    const cells = [...m[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cells.length === 2) fields[cls] = cells[1][1];
  }
  return fields;
}
export function parsePmbSearch(html, library) {
  assertView(html, library);
  const records = [];
  const blocks = html.split(/(?=<div\b[^>]*id=["']record_container_\d+["'])/i).slice(1);
  for (const block of blocks.slice(0, 15)) {
    const id = block.match(/id=["']record_container_(\d+)["']/i)?.[1];
    const title = text(block.match(/<span\b[^>]*class=["'][^"']*tit1_notCourte[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const authorBlock = block.match(/<span\b[^>]*class=["'][^"']*auteur_notCourte[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
    const authors = [...authorBlock.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(m => text(m[1]));
    if (id && title) records.push({ recordId: id, title, authors });
  }
  const explicitEmpty = !blocks.length && /aucun r[ée]sultat|aucune notice|0\s+(?:notice|r[ée]sultat)|no results/i.test(text(html));
  if (!records.length && !explicitEmpty) throw catalogError('Unrecognized branch search results');
  // "La recherche n'a renvoyé aucun résultat" carries no count: it is a
  // complete, empty answer (19 Nov 2026).
  if (explicitEmpty) return markSearchComplete([], true);
  const count = text(html.match(/<span\b[^>]*id=["']searchResult-nbResults["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  const distinct = distinctRecords(records);
  markHasMore(distinct, !/^\d+$/.test(count) || Number(count) > distinct.length);
  return markSearchComplete(distinct, /^\d+$/.test(count) && Number(count) === records.length
    && records.length === blocks.length && distinct.length === records.length);
}
export function parsePmbRecord(html, library, id) {
  assertView(html, library);
  const canonical = [...html.matchAll(/<link\b([^>]*)>/gi)].map(m => attributes(m[1])).find(a => a.rel === 'canonical');
  let canonicalUrl;
  try { canonicalUrl = new URL(canonical?.href); } catch { throw catalogError('Catalog record identity missing'); }
  if (canonicalUrl.hostname !== new URL(ORIGIN).hostname || canonicalUrl.pathname !== '/index.php'
      || canonicalUrl.searchParams.get('lvl') !== 'notice_display' || canonicalUrl.searchParams.get('id') !== id
      || (canonicalUrl.searchParams.has('opac_view') && canonicalUrl.searchParams.get('opac_view') !== library.communityCatalog.scope)) throw catalogError('Catalog record changed');
  const fields = rowFields(html), title = text(fields.record_tit1);
  if (!title) throw catalogError('Missing catalog record title');
  const authors = [...(fields.record_responsabilites || '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(m => text(m[1]));
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)];
  const holdings = tables.find(m => /(?:^|\s)exemplaires(?:\s|$)/.test(attributes(m[1]).class || ''));
  if (!holdings) throw catalogError('Catalog copy ownership is unconfirmed', 'CATALOG_HOLDING_UNCONFIRMED');
  const owned = [];
  let visibleCopies = 0;
  const copyKeys = new Set();
  let unidentifiedCopy = false;
  for (const row of holdings[2].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const rowAttributes = attributes(row[1]);
    if (Object.hasOwn(rowAttributes, 'hidden') || /display\s*:\s*none/.test(rowAttributes.style || '')) continue;
    const cells = {};
    for (const cell of row[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) cells[normalized(attributes(cell[1])['data-column-name'] || attributes(cell[1]).class)] = text(cell[2]);
    if (cells.localisation) {
      visibleCopies++;
      if (cells['code barres']) copyKeys.add(`${afLabel(cells.localisation)}\n${cells['code barres']}`);
      else unidentifiedCopy = true;
    }
    if (!scopeLabels(library).includes(afLabel(cells.localisation))) continue;
    const status = normalized(cells['disponibilité'] || cells.disponibilite);
    owned.push({ callNumber: cells.cote || null,
      status: /sorti jusqu|en pret|emprunte/.test(status) ? 'unavailable'
        : /disponible/.test(status) && !/indisponible|non disponible|consultation sur place/.test(status) ? 'available' : 'unknown' });
  }
  if (!owned.length) throw Object.assign(catalogError('Record belongs to another branch', 'CATALOG_HOLDING_UNCONFIRMED'), { otherBranch: visibleCopies > 0 });
  const expectedCopies = text(html.match(/<span\b[^>]*id=["']titre_exemplaires["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]).match(/\((\d+)\)/)?.[1];
  const complete = expectedCopies !== undefined && Number(expectedCopies) === visibleCopies
    && !unidentifiedCopy && copyKeys.size === visibleCopies;
  const state = owned.some(r => r.status === 'available') ? 'available'
    : complete && owned.every(r => r.status === 'unavailable') ? 'unavailable' : 'unknown';
  const catalogUrl = `${ORIGIN}/index.php?lvl=notice_display&id=${id}&opac_view=${library.communityCatalog.scope}`;
  const obs = observation(library, catalogUrl, state, owned.find(r => r.callNumber)?.callNumber);
  obs.catalogLinkKind = 'record';
  // No network-wide counts: only the exact selected branch's visible copies.
  if (complete) obs.totalCopies = owned.length;
  if (complete && owned.every(r => r.status !== 'unknown')) obs.availableCopies = owned.filter(r => r.status === 'available').length;
  return { recordId: id, title, authors, isbn: firstIsbn(fields.record_code), catalogUrl, observation: obs };
}
// The branch view lives in the anonymous PMB session: without it a search
// covers the whole network, and parsePmbSearch rejects the page (assertView).
// A session is reused for a few minutes so a check's searches skip the home
// page; a reused session that no longer shows the branch is replaced once.
const SESSION_TTL_MS = 5 * 60 * 1000, sessions = new Map();
export function clearPmbSessions() { sessions.clear(); }
async function openSearch(library, deadlineAt) {
  const session = new CommunitySession(ORIGIN, deadlineAt), home = await session.read(viewUrl(library));
  assertView(home.text, library);
  const form = [...home.text.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].find(m => attributes(m[1]).name === 'search_input');
  if (!form) throw catalogError('Public search form missing');
  const fields = hiddenFields(form[2]);
  if (!fields.csrf_token) throw catalogError('Anonymous search token missing');
  const url = new URL(attributes(form[1]).action, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== '/index.php' || url.searchParams.get('lvl') !== 'more_results') throw catalogError('Unexpected public search action');
  const state = { cookies: new Map(session.cookies), fields, url: url.toString(), expiresAt: Date.now() + SESSION_TTL_MS };
  sessions.set(library.communityCatalog.scope, state);
  while (sessions.size > 32) sessions.delete(sessions.keys().next().value);
  return { session, state };
}
async function searchForm(library, deadlineAt) {
  const scope = library.communityCatalog.scope;
  let current = null;
  const cached = sessions.get(scope);
  if (cached && cached.expiresAt > Date.now()) {
    const session = new CommunitySession(ORIGIN, deadlineAt);
    session.cookies = new Map(cached.cookies);
    current = { session, state: cached, reused: true };
  }
  const post = ({ session, state }, userQuery) => session.post(state.url, { ...state.fields, user_query: userQuery, look_ALL: '1', typdoc: '' }, { Referer: viewUrl(library) });
  return async userQuery => {
    current ||= await openSearch(library, deadlineAt);
    try { return parsePmbSearch((await post(current, userQuery)).text, library); }
    catch (error) {
      if (!current.reused || error.code === 'CATALOG_PROVIDER_BLOCKED' || Date.now() >= deadlineAt) throw error;
      if (sessions.get(scope) === current.state) sessions.delete(scope);
      current = await openSearch(library, deadlineAt);
      return parsePmbSearch((await post(current, userQuery)).text, library);
    }
  };
}
// PMB ranks any-word matches by relevance: "Wings of Fire" returned 157
// unrelated records (one word, or a French synonym, each). A leading "+"
// requires the word, so the catalog returns only records with every word.
// PMB's own operators are removed from the reader's words.
export function pmbAllWordsQuery(query) {
  const words = boundedQuery(query).split(' ').map(word => word.replace(/[+\-*"()~^<>]/g, '')).filter(word => /[\p{L}\p{N}]/u.test(word));
  if (!words.length) throw catalogError('A title is required', 'CATALOG_UNSUPPORTED');
  return words.map(word => `+${word}`).join(' ');
}
export async function searchPmb(library, query, deadlineAt) {
  return (await searchForm(library, deadlineAt))(pmbAllWordsQuery(query));
}
// PMB stores ISBNs hyphenated (978-0-14-027833-0) and finds them only as a
// quoted phrase; the plain digits find nothing (checked 19 Nov 2026). An
// edition can be stored as ISBN-13 or ISBN-10: both forms go in one query,
// since quoted phrases side by side match either one.
export function pmbIsbnQueries(isbn13) {
  const parsed = ISBN.parse(isbn13);
  const forms = [parsed?.isbn13h, parsed?.isbn10h].filter(Boolean);
  return forms.length ? [forms.map(value => `"${value}"`).join(' ')] : [];
}
export async function checkPmbIsbn(library, isbn13, deadlineAt) {
  viewUrl(library);
  // The work search asks the ISBN-13 and ISBN-10 forms separately; both forms
  // are searched by either question, so the second is answered from this.
  return cachedTask(`pmb-isbn:${library.communityCatalog.scope}:${isbn13}`, async () => {
    const search = await searchForm(library, deadlineAt);
    const found = [];
    let complete = true;
    for (const userQuery of pmbIsbnQueries(isbn13)) {
      const rows = await search(userQuery);
      if (rows.searchComplete !== true) complete = false;
      found.push(...rows);
    }
    const ids = [...new Set(found.map(row => row.recordId))];
    const read = 3;
    if (ids.length > read) complete = false;
    const exact = [];
    let error;
    for (const id of ids.slice(0, read)) {
      try {
        const record = await resolvePmb(library, id, deadlineAt);
        if (record.isbn && isbnMatches(record.isbn, isbn13)) exact.push(record);
        else complete = false;
      } catch (failure) {
        // A record whose copies are all at other branches is not this
        // branch's book. Anything else leaves the answer open.
        if (failure.otherBranch) continue;
        complete = false;
        error ||= failure;
        if (failure.code === 'CATALOG_PROVIDER_BLOCKED') break;
      }
    }
    if (exact.length) return { ...aggregateObservations(exact.map(item => item.observation), { complete: complete && exact.length === 1 }),
      matchKind: 'exact_isbn', recognizedExact: true };
    if (complete) return { outcome: 'not_found', matchKind: 'none', recognizedExact: true };
    throw error || catalogError('The requested edition is not confirmed', 'CATALOG_HOLDING_UNCONFIRMED');
  }, { ttlMs: 10 * 60 * 1000, deadlineAt });
}
export async function resolvePmb(library, id, deadlineAt) {
  if (!/^\d{1,20}$/.test(id)) throw catalogError('Invalid catalog record');
  viewUrl(library);
  const session = new CommunitySession(ORIGIN, deadlineAt);
  const response = await session.read(`/index.php?lvl=notice_display&id=${id}&opac_view=${library.communityCatalog.scope}`);
  return parsePmbRecord(response.text, library, id);
}
