import { validateAndNormalize } from '../services/isbn.js';
import { parseTitleAuthorId } from '../services/titleAuthorIdentity.js';

export const PUBLIC_V2_BOOK_KEY_VERSION = 'v1';

export const PUBLIC_V2_CAPABILITY_KEYS = Object.freeze([
  'catalogLookup',
  'publicAvailability',
  'copyCounts',
  'locationAvailability',
  'callNumber',
  'catalogLink',
  'titleSearch',
  'isbnLookup',
]);

export const PUBLIC_V2_OPERATIONAL_HEALTH = Object.freeze([
  'operational',
  'degraded',
  'unknown',
]);

export const PUBLIC_V2_AVAILABILITY_OUTCOMES = Object.freeze([
  'available',
  'none_available',
  'in_catalog',
  'not_found',
  'no_match',
  'unknown',
]);

export const PUBLIC_V2_LOOKUP_KINDS = Object.freeze([
  'catalog_record',
  'exact_isbn',
  'verified_work',
  'title_author',
]);

export const PUBLIC_V2_MATCH_KINDS = Object.freeze([
  'catalog_record',
  'exact_isbn',
  'verified_work',
  'possible_match',
  'none',
  null,
]);

export const PUBLIC_V2_FRESHNESS = Object.freeze(['fresh', 'stale', 'none']);

// Non-ISBN keys identify a public source record or a reverified title/author
// tuple. Their contents never choose an upstream host, path or form fields.
const BOOK_KEY_SOURCES = new Set(['openlibrary', 'googlebooks']);
const SOURCE_RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CATALOG_KEY = /^v1:catalog:(koha:[a-z0-9_-]{1,100}):([1-9]\d{0,11})$/;
const TITLE_AUTHOR_KEY = /^v1:catalog:(vpl:visakhapatnam-public-library):([A-Za-z0-9_-]+)$/;

export function createPublicBookKey({ isbn, source, sourceRecordId } = {}) {
  const isbn13 = validateAndNormalize(isbn);
  if (isbn13) return `${PUBLIC_V2_BOOK_KEY_VERSION}:isbn:${isbn13}`;

  if (!BOOK_KEY_SOURCES.has(source) || !SOURCE_RECORD_ID.test(sourceRecordId || '')) {
    throw new TypeError('A valid ISBN or allowlisted public source record is required');
  }
  return `${PUBLIC_V2_BOOK_KEY_VERSION}:${source}:${sourceRecordId}`;
}

export function parsePublicBookKey(value) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const titleAuthor = TITLE_AUTHOR_KEY.exec(value);
  if (titleAuthor && parseTitleAuthorId(titleAuthor[2])) return {
    version: 'v1', kind: 'catalog', libraryId: titleAuthor[1], recordId: titleAuthor[2], lookupKind: 'title_author',
  };

  const legacyCatalog = CATALOG_KEY.exec(value);
  if (legacyCatalog) return { version: 'v1', kind: 'catalog', libraryId: legacyCatalog[1], recordId: legacyCatalog[2] };
  if (typeof value !== 'string' || value.length > 512) return null;
  const catalog = /^v1:catalog:([A-Za-z0-9_-]{1,500})$/.exec(value);
  if (catalog) {
    const decoded = Buffer.from(catalog[1], 'base64url').toString('utf8');
    // Public catalogs also use composite IDs and bounded replay identifiers.
    // They remain opaque identifiers: adapters must validate their own shape
    // and construct reads only from directory-pinned origins.
    const match = /^([a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120})\n([A-Za-z0-9][A-Za-z0-9_.:-]{0,209})$/.exec(decoded);
    return match && Buffer.from(decoded).toString('base64url') === catalog[1]
      ? { version: 'v1', kind: 'catalog', libraryId: match[1], recordId: match[2] } : null;
  }
  const isbnMatch = new RegExp(`^${PUBLIC_V2_BOOK_KEY_VERSION}:isbn:(\\d{13})$`).exec(value);
  if (isbnMatch) {
    const isbn13 = validateAndNormalize(isbnMatch[1]);
    return isbn13 === isbnMatch[1]
      ? { version: PUBLIC_V2_BOOK_KEY_VERSION, kind: 'isbn', isbn13 }
      : null;
  }

  const sourceMatch = new RegExp(`^${PUBLIC_V2_BOOK_KEY_VERSION}:([a-z]+):([A-Za-z0-9_-]{1,128})$`).exec(value);
  if (!sourceMatch || !BOOK_KEY_SOURCES.has(sourceMatch[1])) return null;
  return {
    version: PUBLIC_V2_BOOK_KEY_VERSION,
    kind: 'source',
    source: sourceMatch[1],
    sourceRecordId: sourceMatch[2],
  };
}

export function createCatalogBookKey(libraryId, recordId) {
  const legacy = `v1:catalog:${libraryId}:${recordId}`;
  if (parsePublicBookKey(legacy)?.kind === 'catalog') return legacy;
  const key = `v1:catalog:${Buffer.from(`${libraryId}\n${recordId}`).toString('base64url')}`;
  if (parsePublicBookKey(key)?.kind !== 'catalog') throw new TypeError('Invalid catalog record identity');
  return key;
}

export function isPublicBookKey(value) {
  return parsePublicBookKey(value) !== null;
}

export const PUBLIC_V2_ERROR_CODES = Object.freeze([
  'INVALID_REQUEST',
  'INVALID_BOOK_KEY',
  'BOOK_NOT_FOUND',
  'LIBRARY_NOT_FOUND',
  'METADATA_UNAVAILABLE',
  'PLACE_SEARCH_UNAVAILABLE',
  'RATE_LIMITED',
  'CATALOG_UNSUPPORTED',
  'CATALOG_TIMEOUT',
  'CATALOG_UNAVAILABLE',
  'CATALOG_UNRECOGNIZED',
  'CATALOG_PROVIDER_BLOCKED',
  'CATALOG_CONFIGURATION_REQUIRED',
  'CATALOG_EXACT_ISBN_REQUIRED',
  'CATALOG_TITLE_SEARCH_REQUIRED',
  'CATALOG_QUERY_UNSUPPORTED',
]);

export function publicError(code, message) {
  if (!PUBLIC_V2_ERROR_CODES.includes(code)) throw new TypeError('Unknown public v2 error code');
  return { error: { code, message } };
}
