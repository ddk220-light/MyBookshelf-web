import { isIP } from 'node:net';
import ISBN from 'isbn3';

export const CONTENT_POLICY_REVISION = '2026-11-01.1';
export const CONTENT_KINDS = ['book', 'chapter', 'article', 'preprint', 'thesis', 'report', 'learning_resource', 'audiobook', 'other'];
export const SOURCE_STATUSES = ['ok', 'not_selected', 'disabled', 'unsupported', 'timeout', 'unavailable', 'throttled', 'quota_exhausted', 'queued'];
const EPMC_SOURCES = new Set(['MED', 'PMC', 'PPR', 'AGR', 'CBA', 'HIR', 'CTX', 'ETH', 'PAT']);
const DAY = 86_400_000;

export class ContentValidationError extends Error {
  constructor(message = 'The content request is invalid.') { super(message); this.code = 'CONTENT_INVALID_REQUEST'; }
}

export function contentKey(sourceId, recordId, recordSource) {
  const value = sourceId === 'europepmc' ? `fcd:v1:europepmc:${recordSource}:${recordId}` : `fcd:v1:${sourceId}:${recordId}`;
  if (!parseContentKey(value)) throw new ContentValidationError('Invalid content identity.');
  return value;
}

export function parseContentKey(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  const pg = /^fcd:v1:gutenberg:([1-9]\d{0,8})$/.exec(value);
  if (pg) return { sourceId: 'gutenberg', recordId: pg[1] };
  const pmc = /^fcd:v1:europepmc:([A-Z]{3}):([A-Za-z0-9][A-Za-z0-9_.-]{0,100})$/.exec(value);
  if (pmc && EPMC_SOURCES.has(pmc[1])) return { sourceId: 'europepmc', recordSource: pmc[1], recordId: pmc[2] };
  return null;
}

export function normalizeDoi(value) {
  if (typeof value !== 'string') return null;
  const doi = value.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/[^\s<>"\\]+$/i.test(doi) && doi.length <= 255 ? doi.toLowerCase() : null;
}

export function safeWebUrl(value) {
  if (typeof value !== 'string' || value.length > 4000 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    // Outbound actions never point into a reader's local network. These URLs are
    // not server fetch targets; adapters have their own exact-origin allowlists.
    if (isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || !host.includes('.')
      || /\.(localhost|local|internal|test|invalid)$/.test(host) || (url.port && !['80', '443'].includes(url.port))) return null;
    return url.href;
  } catch { return null; }
}

export function observedAccess(location, { country = null, now = Date.now() } = {}) {
  if (!location || !safeWebUrl(location.readerUrl || location.landingUrl)) return 'unknown';
  if (['preview', 'borrow', 'registration', 'restricted', 'metadata_only', 'unknown'].includes(location.access)) return location.access;
  if (location.access !== 'free_full_text') return 'unknown';
  const evidence = location.evidence;
  const observed = Date.parse(evidence?.observedAt);
  if (!evidence?.sourceId || !evidence?.field || !Number.isFinite(observed) || observed > now + 300_000 || now - observed > DAY) return 'unknown';
  if (location.country && location.country !== country) return 'unknown';
  if (location.linkCheck?.outcome === 'broken') return 'unknown';
  return 'free_full_text';
}

export function readingActions(item, context) {
  return (item.locations || []).filter(location => observedAccess(location, context) === 'free_full_text').map(location => ({
    locationId: location.id, label: `Read at ${location.host || item.provenance?.[0]?.sourceId || 'source'}`,
    url: safeWebUrl(location.readerUrl || location.landingUrl),
    downloads: (location.downloads || []).flatMap(file => {
      const url = safeWebUrl(file.url);
      return url && ['application/pdf', 'application/epub+zip', 'text/plain', 'text/html', 'application/x-mobipocket-ebook'].includes(file.mimeType) ? [{ url, mimeType: file.mimeType }] : [];
    }),
  }));
}

function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw new ContentValidationError();
  return value;
}
function languageContext(body) {
  let country = null;
  if (body.country != null) {
    if (typeof body.country !== 'string' || !/^[A-Z]{2}$/.test(body.country)) throw new ContentValidationError();
    country = body.country;
  }
  const languages = body.languages ?? [];
  if (!Array.isArray(languages) || languages.length > 5 || languages.some(v => typeof v !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v))) throw new ContentValidationError();
  return { country, languages: [...new Set(languages)] };
}

export function parseContentSearch(input) {
  const body = object(input, ['query', 'kinds', 'languages', 'access', 'country', 'cursor', 'limit', 'includeUnclear']);
  if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 300 || /[\u0000-\u001f]/.test(body.query)) throw new ContentValidationError();
  const kinds = body.kinds ?? ['book', 'article', 'preprint'];
  if (!Array.isArray(kinds) || !kinds.length || kinds.length > CONTENT_KINDS.length || kinds.some(k => !CONTENT_KINDS.includes(k))) throw new ContentValidationError();
  const limit = body.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 40 || (body.access != null && body.access !== 'free_full_text')) throw new ContentValidationError();
  if (body.cursor != null && (typeof body.cursor !== 'string' || body.cursor.length > 2048)) throw new ContentValidationError();
  if (body.includeUnclear != null && typeof body.includeUnclear !== 'boolean') throw new ContentValidationError();
  return { query: body.query.trim().normalize('NFC'), kinds: [...new Set(kinds)], ...languageContext(body),
    access: 'free_full_text', limit, cursor: body.cursor || null, includeUnclear: body.includeUnclear === true };
}

export function parseContentResolve(input) {
  const body = object(input, ['key', 'country', 'languages']);
  const parsed = parseContentKey(body.key);
  if (!parsed) throw new ContentValidationError('Choose a valid content item.');
  return { key: body.key, parsed, ...languageContext(body) };
}

export function parseContentLocate(input) {
  const body=object(input,['isbn13','workId','country','languages']);
  const identifiers=[];
  if(body.isbn13!=null){
    if(typeof body.isbn13!=='string'||!/^97[89]\d{10}$/.test(body.isbn13)||ISBN.parse(body.isbn13)?.isbn13!==body.isbn13)throw new ContentValidationError();
    identifiers.push({scheme:'isbn13',value:body.isbn13});
  }
  if(body.workId!=null){
    if(typeof body.workId!=='string'||! /^(?:\/works\/)?OL\d+W$/.test(body.workId))throw new ContentValidationError();
    identifiers.push({scheme:'openlibrary_work',value:body.workId.startsWith('/')?body.workId:'/works/'+body.workId});
  }
  if(!identifiers.length)throw new ContentValidationError();
  return {identifiers,...languageContext(body)};
}
