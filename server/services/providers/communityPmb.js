import { attributes, catalogError, firstIsbn, text } from './catalogMarkup.js';
import { CommunitySession, hiddenFields } from './communitySession.js';
import { boundedQuery, distinctRecords, markSearchComplete, normalized, observation } from './communityRecords.js';

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
  if (!records.length && !/aucun r[ée]sultat|aucune notice|0\s+(?:notice|r[ée]sultat)|no results/i.test(text(html))) throw catalogError('Unrecognized branch search results');
  const count = text(html.match(/<span\b[^>]*id=["']searchResult-nbResults["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
  const distinct = distinctRecords(records);
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
  if (!owned.length) throw catalogError('Record belongs to another branch', 'CATALOG_HOLDING_UNCONFIRMED');
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
export async function searchPmb(library, query, deadlineAt) {
  const session = new CommunitySession(ORIGIN, deadlineAt), home = await session.read(viewUrl(library));
  assertView(home.text, library);
  const form = [...home.text.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].find(m => attributes(m[1]).name === 'search_input');
  if (!form) throw catalogError('Public search form missing');
  const fields = hiddenFields(form[2]);
  if (!fields.csrf_token) throw catalogError('Anonymous search token missing');
  const url = new URL(attributes(form[1]).action, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== '/index.php' || url.searchParams.get('lvl') !== 'more_results') throw catalogError('Unexpected public search action');
  const result = await session.post(url.toString(), { ...fields, user_query: boundedQuery(query), look_ALL: '1', typdoc: '' }, { Referer: viewUrl(library) });
  return parsePmbSearch(result.text, library);
}
export async function resolvePmb(library, id, deadlineAt) {
  if (!/^\d{1,20}$/.test(id)) throw catalogError('Invalid catalog record');
  viewUrl(library);
  const session = new CommunitySession(ORIGIN, deadlineAt);
  const response = await session.read(`/index.php?lvl=notice_display&id=${id}&opac_view=${library.communityCatalog.scope}`);
  return parsePmbRecord(response.text, library, id);
}
