import { parsePublicBookKey } from './contracts.js';
import { validateAndNormalize } from '../services/isbn.js';

const MAX_QUERY_LENGTH = 160;
const MAX_LIBRARY_QUERY_LENGTH = 120;
// Provider system IDs are opaque directory identifiers. The platform prefix is
// normalized lowercase, while the provider segment may preserve a documented
// case-sensitive identifier such as Calil's `Tokyo_Setagaya`.
const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;

export class PublicV2ValidationError extends Error {
  constructor(message = 'The request is invalid') {
    super(message);
    this.code = 'INVALID_REQUEST';
  }
}

function bodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PublicV2ValidationError();
  return body;
}

function text(value, maximum) {
  if (typeof value !== 'string') throw new PublicV2ValidationError();
  const result = value.trim().replace(/\s+/g, ' ');
  if (!result || result.length > maximum) throw new PublicV2ValidationError();
  return result;
}

export function parseLibrarySearch(body) {
  const { query, limit } = bodyObject(body);
  const parsedLimit = limit === undefined ? 20 : Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 25) throw new PublicV2ValidationError();
  return { query: text(query, MAX_LIBRARY_QUERY_LENGTH), limit: parsedLimit };
}

export function parseLibraryResolve(body) {
  const { libraryId } = bodyObject(body);
  if (typeof libraryId !== 'string' || !LIBRARY_ID.test(libraryId)) throw new PublicV2ValidationError();
  return { libraryId };
}

export function parseLibrarySelection(body) {
  const { slug } = bodyObject(body);
  if (typeof slug !== 'string' || !slug || slug.length > 400) throw new PublicV2ValidationError();
  const normalized = slug.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}-]*$/u.test(normalized)) throw new PublicV2ValidationError();
  return { slug: normalized };
}

export function parseLibraryBrowse(body) {
  const { country, region, offset = 0, limit = 25 } = bodyObject(body);
  const countryCode = text(country, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)
      || !Number.isSafeInteger(offset) || offset < 0
      || !Number.isInteger(limit) || limit < 1 || limit > 25) throw new PublicV2ValidationError();
  return { country: countryCode, region: text(region, 120), offset, limit };
}

export function parseDiscovery(body) {
  const value = bodyObject(body), result = {};
  for (const field of ['query', 'region', 'district', 'placeId']) {
    if (value[field] !== undefined && value[field] !== '') result[field] = text(value[field], 120);
  }
  if (value.country) {
    result.country = text(value.country, 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(result.country)) throw new PublicV2ValidationError();
  }
  result.offset = value.offset ?? 0; result.limit = value.limit ?? 25;
  if (!Number.isSafeInteger(result.offset) || result.offset < 0 || result.offset > 100000
      || !Number.isInteger(result.limit) || result.limit < 1 || result.limit > 25) throw new PublicV2ValidationError();
  if (value.lat !== undefined || value.lon !== undefined) {
    if (!Number.isFinite(value.lat) || !Number.isFinite(value.lon) || Math.abs(value.lat) > 90 || Math.abs(value.lon) > 180) throw new PublicV2ValidationError();
    result.lat = value.lat; result.lon = value.lon;
  }
  if (value.radiusKm !== undefined) {
    if (!Number.isFinite(value.radiusKm) || value.radiusKm < 1 || value.radiusKm > 200) throw new PublicV2ValidationError();
    result.radiusKm = value.radiusKm;
  }
  if (value.bounds !== undefined) {
    const b = bodyObject(value.bounds);
    if (![b.north, b.south, b.east, b.west].every(Number.isFinite)
      || b.north > 90 || b.south < -90 || b.south > b.north
      || Math.abs(b.east) > 180 || Math.abs(b.west) > 180) throw new PublicV2ValidationError();
    result.bounds = { north: b.north, south: b.south, east: b.east, west: b.west };
  }
  return result;
}

export function parsePlaceSearch(body) {
  const query = text(bodyObject(body).query, 120);
  if (query.length < 2) throw new PublicV2ValidationError();
  const country = body.country === undefined ? undefined : text(body.country, 2).toUpperCase();
  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) throw new PublicV2ValidationError();
  return { query, ...(country ? { country } : {}) };
}

export function parseBookSearch(body) {
  const { query, libraryId, offset } = bodyObject(body);
  if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)) throw new PublicV2ValidationError();
  const normalizedQuery = text(query, MAX_QUERY_LENGTH);
  // Short numeric strings can be book titles, e.g. "1984" or "2001".
  const isbnLike = /^[\dXx\s-]+$/.test(normalizedQuery) && /\d/.test(normalizedQuery)
    && normalizedQuery.replace(/[\s-]/g, '').length >= 10;
  const isbn13 = isbnLike ? validateAndNormalize(normalizedQuery) : null;
  return { query: normalizedQuery, isbnLike, isbn13,
    ...(offset !== undefined ? { offset } : {}),
    ...(libraryId !== undefined ? parseLibraryResolve({ libraryId }) : {}) };
}

export function parseBookResolve(body) {
  const { bookKey } = bodyObject(body);
  const parsed = parsePublicBookKey(bookKey);
  if (!parsed) return { bookKey: null, parsed: null };
  return { bookKey, parsed };
}

export function parseAvailability(body) {
  const { libraryId } = parseLibraryResolve(body);
  const { bookKey, parsed } = parseBookResolve(body);
  const { editionScope, language } = body;
  if (editionScope !== undefined && !['work', 'exact'].includes(editionScope)) throw new PublicV2ValidationError();
  if (language !== undefined && !/^[a-z]{3}$/.test(language)) throw new PublicV2ValidationError();
  if (editionScope === 'exact' && parsed?.kind !== 'isbn') throw new PublicV2ValidationError();
  if (!bookKey || !parsed) return { libraryId, bookKey: null, parsed: null };
  return { libraryId, bookKey, parsed, ...(editionScope ? { editionScope } : {}), ...(language ? { language } : {}) };
}

// Holdings routes (plan 3.5). Book identities sent by the client are used only
// to read stored answers; anything written is derived on the server.
const WORK_ID = /^OL\d+W$/;
function holdingsBooks(value, maximum) {
  if (!Array.isArray(value) || !value.length || value.length > maximum) throw new PublicV2ValidationError();
  const seen = new Set();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new PublicV2ValidationError();
    const { bookKey, isbn13, workId } = item;
    if (typeof bookKey !== 'string' || !parsePublicBookKey(bookKey)) throw new PublicV2ValidationError();
    if (isbn13 !== undefined && (typeof isbn13 !== 'string' || validateAndNormalize(isbn13) !== isbn13)) throw new PublicV2ValidationError();
    if (workId !== undefined && (typeof workId !== 'string' || !WORK_ID.test(workId))) throw new PublicV2ValidationError();
    if (seen.has(bookKey)) return [];
    seen.add(bookKey);
    return [{ bookKey, ...(isbn13 ? { isbn13 } : {}), ...(workId ? { workId } : {}) }];
  });
}

export function parseHoldingsLookup(body) {
  const value = bodyObject(body);
  return { ...parseLibraryResolve(value), books: holdingsBooks(value.books, 100) };
}

export function parseHoldingsSearch(body) {
  const value = bodyObject(body);
  return { ...parseLibraryResolve(value), query: text(value.query, MAX_QUERY_LENGTH), books: holdingsBooks(value.books, 12) };
}

export function parseHoldingsCheck(body) {
  const value = bodyObject(body);
  const { libraryId } = parseLibraryResolve(value);
  const { bookKey, parsed } = parseBookResolve(value);
  if (!bookKey) throw new PublicV2ValidationError();
  return { libraryId, bookKey, parsed };
}

// Shelf suggestions (plan 2026-11-14, Part 2). Exactly these fields; anything
// else is refused. Book keys are used only to choose and leave out
// suggestions for this answer: they are not stored or logged. Only the two
// kinds of key a suggestion can have are accepted: an ISBN edition
// (`v1:isbn:…`) and an Open Library work (`v1:openlibrary:OL…W`), never a
// library's own record (whose key names the library) or another source's.
export const SUGGESTION_LIMITS = Object.freeze({ recentBookKeys: 3, excludeKeys: 200, shown: 5, keyLength: 512 });
const SUGGESTION_FIELDS = new Set(['libraryId', 'recentBookKeys', 'excludeKeys']);
const SUGGESTION_EVENT_FIELDS = new Set(['event', 'bookKey', 'bookKeys']);
export const SUGGESTION_EVENTS = Object.freeze(['shown', 'opened', 'saved']);
const OPEN_LIBRARY_WORK = /^OL\d+W$/;

function onlyFields(value, allowed) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new PublicV2ValidationError();
}

/** An ISBN key or an Open Library work key; anything else is refused. */
export function suggestionBookKey(value) {
  if (typeof value !== 'string' || value.length > SUGGESTION_LIMITS.keyLength) throw new PublicV2ValidationError();
  const parsed = parsePublicBookKey(value);
  const usable = parsed?.kind === 'isbn' || (parsed?.kind === 'source' && parsed.source === 'openlibrary' && OPEN_LIBRARY_WORK.test(parsed.sourceRecordId));
  if (!usable) throw new PublicV2ValidationError();
  return value;
}

function bookKeyList(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) throw new PublicV2ValidationError();
  return [...new Set(value.map(suggestionBookKey))];
}

export function parseSuggestions(body) {
  const value = bodyObject(body);
  onlyFields(value, SUGGESTION_FIELDS);
  return {
    ...(value.libraryId !== undefined ? parseLibraryResolve({ libraryId: value.libraryId }) : {}),
    recentBookKeys: bookKeyList(value.recentBookKeys, SUGGESTION_LIMITS.recentBookKeys),
    excludeKeys: bookKeyList(value.excludeKeys, SUGGESTION_LIMITS.excludeKeys),
  };
}

/**
 * `{ event: 'shown', bookKeys }` (the one to five suggestions the app drew
 * for one refresh, each once) or `{ event: 'opened' | 'saved', bookKey }`;
 * either way `{ event, bookKeys }`.
 */
export function parseSuggestionEvent(body) {
  const value = bodyObject(body);
  onlyFields(value, SUGGESTION_EVENT_FIELDS);
  if (!SUGGESTION_EVENTS.includes(value.event)) throw new PublicV2ValidationError();
  if (value.event === 'shown') {
    if (value.bookKey !== undefined || !Array.isArray(value.bookKeys) || !value.bookKeys.length) throw new PublicV2ValidationError();
    const bookKeys = bookKeyList(value.bookKeys, SUGGESTION_LIMITS.shown);
    if (bookKeys.length !== value.bookKeys.length) throw new PublicV2ValidationError();
    return { event: 'shown', bookKeys };
  }
  if (value.bookKeys !== undefined) throw new PublicV2ValidationError();
  return { event: value.event, bookKeys: [suggestionBookKey(value.bookKey)] };
}
