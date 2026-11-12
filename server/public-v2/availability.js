import { getProvider } from '../services/providers/index.js';
import { catalogHandoffFor } from './catalog-handoff.js';
import { publicAttribution } from './attribution.js';
import { parsePublicBookKey } from './contracts.js';
import { runBookCheck } from '../services/catalog-lookup/check.js';

function timestamp(now) {
  return new Date(now()).toISOString();
}

function catalogErrorCode(error) {
  // Our own cross-reader pacing could not fit the check in time: to the
  // reader this is a catalog that took too long (try again), never absence.
  if (error?.code === 'CATALOG_HOST_BUSY') return 'CATALOG_TIMEOUT';
  if (error?.code && /^CATALOG_/.test(error.code)) return error.code;
  if (error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '')) return 'CATALOG_TIMEOUT';
  return 'CATALOG_UNAVAILABLE';
}

function unknown({ lookupKind, attemptedAt, errorCode } = {}) {
  return {
    outcome: 'unknown',
    lookupKind,
    matchKind: null,
    freshness: 'none',
    attemptedAt,
    ...(errorCode ? { errorCode } : {}),
  };
}

function attachCatalogHandoff(response, handoff, library) {
  const attribution = publicAttribution(response.attribution || library.attribution);
  return { ...response, ...(!response.catalogUrl && handoff ? handoff : {}),
    ...(attribution ? { attribution } : {}) };
}

export function createPublicAvailabilityService({
  directory,
  books,
  providerFor = getProvider,
  now = () => Date.now(),
  // This is fallback retention, not a fresh-result cache: a new request still
  // checks the provider. Keeping a bounded last-known observation lets a
  // transient failure become honestly stale rather than erase a recent fact.
  cacheTtlMs = 24 * 60 * 60 * 1000,
  // The catalog lookup layer (services/catalog-lookup). Optional: without it,
  // or for platforms not named in CATALOG_LOOKUP_V2, the old path runs.
  lookup = null,
} = {}) {
  const lastKnown = new Map();

  function cached(key) {
    const value = lastKnown.get(key);
    if (!value || value.expiresAt <= now()) return null;
    return value.response;
  }

  function remember(key, response) {
    if (lastKnown.size >= 512) lastKnown.delete(lastKnown.keys().next().value);
    lastKnown.set(key, { response, expiresAt: now() + cacheTtlMs });
    return response;
  }

  return Object.freeze({
    async check({ libraryId, bookKey, editionScope = 'work', language, signal }) {
      const library = directory.resolve(libraryId);
      const entry = directory.entry(libraryId);
      if (!library || !entry) return { kind: 'library_not_found' };
      const parsed = parsePublicBookKey(bookKey);
      const attemptedAt = timestamp(now);
      const cacheKey = `${libraryId}:${bookKey}:${editionScope}:${language || ''}`;
      const failed = (error, handoff, lookupKind) => {
        const errorCode = catalogErrorCode(error), previous = cached(cacheKey);
        return { kind: 'result', response: previous
          ? { ...previous, freshness: 'stale', attemptedAt, errorCode }
          : attachCatalogHandoff(unknown({ lookupKind, attemptedAt, errorCode }), handoff, library) };
      };
      let book;
      try { book = await books.resolve(bookKey); }
      catch (error) {
        const knownIsbn = parsed?.kind === 'isbn' ? parsed.isbn13 : null;
        return failed(error, catalogHandoffFor({ entry, library, book: knownIsbn ? { isbn13: knownIsbn } : undefined }), knownIsbn ? 'exact_isbn' : 'verified_work');
      }
      if (!book) return { kind: 'book_not_found' };
      const ownRecord = parsed?.kind === 'catalog' && parsed.libraryId === libraryId;
      const lookupKind = ownRecord ? (parsed.lookupKind || (providerFor(entry)?.checkRecordAvailability ? 'catalog_record' : 'verified_work')) : book.isbn13 ? 'exact_isbn' : 'verified_work';
      const handoff = catalogHandoffFor({ entry, library, book });
      if (!library.capabilities.publicAvailability) {
        return { kind: 'result', response: attachCatalogHandoff(unknown({ lookupKind, attemptedAt, errorCode: 'CATALOG_UNSUPPORTED' }), handoff, library) };
      }
      const provider = providerFor(entry);
      if (!provider?.checkAvailability) {
        return { kind: 'result', response: attachCatalogHandoff(unknown({ lookupKind, attemptedAt, errorCode: 'CATALOG_UNSUPPORTED' }), handoff, library) };
      }
      // The new lookup layer runs this platform when CATALOG_LOOKUP_V2 names
      // it: platform budgets and deadlines, cancellation, the per-host circuit
      // and robots rules, and the answer/health record. The response contract
      // is the same on both paths.
      const v2 = lookup?.enabledFor(entry);
      const result = v2
        ? await lookup.checkBook({ entry, library, provider, book, bookKey, parsed, ownRecord, lookupKind, editionScope, language,
          books: books.searchProfile ? books : null, attemptedAt, signal })
        : await runBookCheck({ entry, library, provider, book, bookKey, parsed, ownRecord, lookupKind, editionScope, language,
          books: books.searchProfile ? books : null, attemptedAt });
      if (result.error) {
        const failure = failed(result.error, handoff, result.lookupKind || lookupKind);
        if (result.searchSummary) failure.response.searchSummary = result.searchSummary;
        return failure;
      }
      const enriched = attachCatalogHandoff(result.response, handoff, library);
      return { kind: 'result', response: ['unknown', 'no_match'].includes(result.response.outcome) ? enriched : remember(cacheKey, enriched) };
    },
  });
}
