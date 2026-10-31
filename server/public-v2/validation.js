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
