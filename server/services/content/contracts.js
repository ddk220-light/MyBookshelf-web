import { isIP } from 'node:net';
import ISBN from 'isbn3';
import {ALL_CONTENT_SOURCES,KNOWLEDGE_SOURCES} from './knowledgeSources.js';

export const CONTENT_POLICY_REVISION = '2026-11-06.1';
export const CONTENT_KINDS = ['book', 'chapter', 'article', 'preprint', 'thesis', 'report', 'learning_resource', 'audiobook', 'other'];
export const SOURCE_STATUSES = ['ok', 'not_selected', 'disabled', 'unsupported', 'timeout', 'unavailable', 'throttled', 'quota_exhausted', 'queued'];
const EPMC_SOURCES = new Set(['MED', 'PMC', 'PPR', 'AGR', 'CBA', 'HIR', 'CTX', 'ETH', 'PAT']);
const DAY = 86_400_000;

export class ContentValidationError extends Error {
  constructor(message = 'The content request is invalid.') { super(message); this.code = 'CONTENT_INVALID_REQUEST'; }
}

export function contentKey(sourceId, recordId, recordSource) {
  const nativeId = sourceId === 'arxiv' ? recordId.replace('/', ':') : recordId;
  const value = sourceId === 'europepmc' || KNOWLEDGE_SOURCES[sourceId]?.adapter === 'wiki' ? `fcd:v1:${sourceId}:${recordSource}:${recordId}` : `fcd:v1:${sourceId}:${nativeId}`;
  if (!parseContentKey(value)) throw new ContentValidationError('Invalid content identity.');
  return value;
}

export function parseContentKey(value) {
  if (typeof value !== 'string' || value.length > 200) return null;
  const wiki = /^fcd:v1:(wikipedia|wikibooks|wikisource):(en|hi|ta):([1-9]\d{0,11})$/.exec(value);
  if(wiki)return {sourceId:wiki[1],recordSource:wiki[2],recordId:wiki[3]};
  const added = /^fcd:v1:([a-z-]+):([A-Za-z0-9_.-]{1,150})$/.exec(value);
  if(added&&KNOWLEDGE_SOURCES[added[1]]){
    const type=KNOWLEDGE_SOURCES[added[1]].adapter, id=added[2];
    if((added[1]==='project-madurai'||type==='sugamya')&&/^[a-f0-9]{32}$/.test(id)||added[1]==='openstax'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))return {sourceId:added[1],recordId:id};
    if(type==='thoth'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)||['gdl','librivox'].includes(type)&&/^[1-9]\d{0,11}$/.test(id)||['loc','bhl'].includes(type)&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(id)||type==='python'&&/^[a-f0-9]{32}$/.test(id))return {sourceId:added[1],recordId:id};
  }
  const pg = /^fcd:v1:gutenberg:([1-9]\d{0,8})$/.exec(value);
  if (pg) return { sourceId: 'gutenberg', recordId: pg[1] };
  const textbook = /^fcd:v1:open-textbook-library:([1-9]\d{0,8})$/.exec(value);
  if (textbook) return { sourceId: 'open-textbook-library', recordId: textbook[1] };
  const bookdash = /^fcd:v1:bookdash:([1-9]\d{0,8})$/.exec(value);
  if (bookdash) return { sourceId: 'bookdash', recordId: bookdash[1] };
  const story = /^fcd:v1:storyweaver:([1-9]\d{0,8})$/.exec(value);
  if (story) return { sourceId: 'storyweaver', recordId: story[1] };
  const doaj = /^fcd:v1:doaj:([a-f0-9]{32})$/.exec(value);
  if (doaj) return { sourceId: 'doaj', recordId: doaj[1] };
  const openalex = /^fcd:v1:openalex:(W[1-9]\d{0,14})$/.exec(value);
  if (openalex) return { sourceId: 'openalex', recordId: openalex[1] };
  const arxiv = /^fcd:v1:arxiv:((?:\d{4}\.\d{4,5}|[a-z][a-z.-]{1,25}:\d{7})(?:v[1-9]\d{0,3})?)$/.exec(value);
  if (arxiv) return { sourceId: 'arxiv', recordId: arxiv[1].replace(':', '/') };
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
  if (!isReadableAccess(location.access)) return 'unknown';
  const evidence = location.evidence;
  const observed = Date.parse(evidence?.observedAt);
  if (!evidence?.sourceId || !evidence?.field || !Number.isFinite(observed) || observed > now + 300_000 || now - observed > DAY) return 'unknown';
  if (location.country && location.country !== country) return 'unknown';
  if (location.linkCheck?.outcome === 'broken') return 'unknown';
  return location.access;
}

export function isReadableAccess(access) {
  return access === 'free_full_text' || access === 'free_account_required';
}

export function itemAccess(item, context) {
  const access = (item.locations || []).map(location => observedAccess(location, context));
  return access.includes('free_full_text') ? 'free_full_text' : access.includes('free_account_required') ? 'free_account_required' : 'unknown';
}

export function readingActions(item, context) {
  return (item.locations || []).filter(location => isReadableAccess(observedAccess(location, context)))
    .sort((a,b) => Number(a.access === 'free_account_required') - Number(b.access === 'free_account_required')).map(location => ({
    locationId: location.id, label: `${item.kind==='audiobook'?'Listen':'Read'} at ${location.host || item.provenance?.[0]?.sourceId || 'source'}`,
    url: safeWebUrl(location.readerUrl || location.landingUrl),
    ...(location.access === 'free_account_required' ? {requiresAccount:true} : {}),
    downloads: (location.access === 'free_account_required' ? [] : location.downloads || []).flatMap(file => {
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
  const body = object(input, ['query', 'kinds', 'languages', 'access', 'country', 'cursor', 'limit', 'includeUnclear', 'sourceIds', 'retrySource','collection','level']);
  if(body.collection!=null&&body.collection!=='children')throw new ContentValidationError();
  if(body.level!=null&&(body.collection!=='children'||typeof body.level!=='string'||!body.level.trim()||body.level.length>100))throw new ContentValidationError();
  if (typeof body.query !== 'string' || (!body.query.trim()&&body.collection!=='children') || body.query.length > 300 || /[\u0000-\u001f]/.test(body.query)) throw new ContentValidationError();
  const kinds = body.kinds ?? ['book', 'learning_resource'];
  if (!Array.isArray(kinds) || !kinds.length || kinds.length > CONTENT_KINDS.length || kinds.some(k => !CONTENT_KINDS.includes(k))) throw new ContentValidationError();
  const limit = body.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 40 || (body.access != null && !['free','free_full_text'].includes(body.access))) throw new ContentValidationError();
  if (body.cursor != null && (typeof body.cursor !== 'string' || body.cursor.length > 4096)) throw new ContentValidationError();
  if (body.includeUnclear != null && typeof body.includeUnclear !== 'boolean') throw new ContentValidationError();
  const paperSources=ALL_CONTENT_SOURCES;
  if(body.sourceIds!=null&&(!Array.isArray(body.sourceIds)||!body.sourceIds.length||body.sourceIds.length>3||body.sourceIds.some(id=>!paperSources.includes(id))))throw new ContentValidationError();
  if(body.retrySource!=null&&(!paperSources.includes(body.retrySource)||!body.cursor))throw new ContentValidationError();
  return { query: body.query.trim().normalize('NFC'), kinds: [...new Set(kinds)], ...languageContext(body),
    access: body.access || 'free', limit, cursor: body.cursor || null, includeUnclear: body.includeUnclear === true,
    sourceIds:body.sourceIds?[...new Set(body.sourceIds)]:null,retrySource:body.retrySource||null,
    collection:body.collection||null,level:body.level||null };
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
