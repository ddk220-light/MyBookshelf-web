import { getProvider } from '../services/providers/index.js';
import { catalogHandoffFor } from './catalog-handoff.js';
import { publicAttribution } from './attribution.js';
import { parsePublicBookKey } from './contracts.js';
import { searchLibraryBook } from '../services/libraryBookSearch.js';

function timestamp(now) {
  return new Date(now()).toISOString();
}

function nonnegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function catalogErrorCode(error) {
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

function safeCatalogUrl(value, library, entry) {
  if (!value || !library?.catalogUrl) return undefined;
  try {
    const origins = [library.catalogUrl, entry?.catalogUrl, ...(entry?.alternateCatalogs || []).map(route => route.catalogUrl)]
      .filter(Boolean).map(address => new URL(address).origin);
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && origins.includes(url.origin)
      && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizeProviderObservation(value, { lookupKind, attemptedAt, library, entry }) {
  // Future provider adapters return this direct shape. `recognizedExact` is an
  // internal parser fact: it is required before a public not-found assertion.
  if (value?.outcome) {
    const outcome = value.outcome === 'unknown' && !value.loanRestriction && value.recognizedExact === true && value.totalCopies > 0 ? 'in_catalog' : value.outcome;
    const matchKind = value.matchKind ?? null;
    const verifiedIdentity = (value.recognizedExact === true && ['exact_isbn', 'verified_work'].includes(matchKind) && ['exact_isbn', 'verified_work'].includes(lookupKind))
      || (value.recognizedRecord === true && matchKind === 'catalog_record' && lookupKind === 'catalog_record')
      || (value.recognizedTitleAuthor === true && matchKind === 'verified_work' && lookupKind === 'title_author');
    if (!['available', 'none_available', 'in_catalog', 'not_found', 'unknown'].includes(outcome)) return null;
    // A completed holdings response may prove the edition but not its lending
    // status. Preserve useful locations/attribution without caching it as truth.
    if (outcome === 'unknown' && !verifiedIdentity) return null;
    if (lookupKind === 'catalog_record' && !verifiedIdentity) return null;
    if (matchKind === 'catalog_record' && !verifiedIdentity) return null;
    if (outcome === 'not_found' && !(lookupKind === 'exact_isbn' && matchKind === 'none' && value.recognizedExact === true)) {
      return null;
    }
    if (outcome !== 'not_found' && !['exact_isbn', 'catalog_record', 'verified_work', 'possible_match'].includes(matchKind)) return null;
    const result = {
      outcome,
      lookupKind: value.lookupKind || lookupKind,
      matchKind,
      freshness: 'fresh',
      observedAt: attemptedAt,
      attemptedAt,
    };
    const availableCopies = matchKind === 'possible_match' ? undefined : nonnegativeInteger(value.availableCopies);
    const totalCopies = matchKind === 'possible_match' ? undefined : nonnegativeInteger(value.totalCopies);
    if (value.loanRestriction === 'not_for_loan' && outcome === 'unknown'
        && verifiedIdentity && (totalCopies > 0 || (value.recognizedTitleAuthor === true && lookupKind === 'title_author'))
        && (availableCopies === undefined || availableCopies === 0)) result.loanRestriction = 'not_for_loan';
    if (value.recognizedExact === true && matchKind === 'exact_isbn'
        && Number.isInteger(value.catalogMatchCount) && value.catalogMatchCount >= 2 && value.catalogMatchCount <= 8) result.catalogMatchCount = value.catalogMatchCount;
    if (library.capabilities.copyCounts && availableCopies !== undefined) result.availableCopies = availableCopies;
    if (library.capabilities.copyCounts && totalCopies !== undefined) result.totalCopies = totalCopies;
    const notForLoanCopies = nonnegativeInteger(value.notForLoanCopies);
    if (verifiedIdentity && library.capabilities.copyCounts && notForLoanCopies > 0 && notForLoanCopies <= totalCopies) result.notForLoanCopies = notForLoanCopies;
    if (library.capabilities.callNumber && typeof value.callNumber === 'string' && value.callNumber.trim()) result.callNumber = value.callNumber.trim();
    if (typeof value.format === 'string' && value.format.trim()) result.format = value.format.trim();
    if (value.recognizedExact === true && matchKind === 'exact_isbn'
        && typeof value.catalogTitle === 'string' && value.catalogTitle.trim()) result.catalogTitle = value.catalogTitle.trim().slice(0, 500);
    const catalogUrl = library.capabilities.catalogLink && safeCatalogUrl(value.catalogUrl, library, entry);
    if (catalogUrl) {
      result.catalogUrl = catalogUrl;
      result.catalogLinkKind = value.catalogLinkKind === 'search' ? 'search' : 'record';
    }
    const attribution = publicAttribution(value.attribution);
    if (attribution) result.attribution = attribution;
    if (matchKind !== 'possible_match' && library.capabilities.locationAvailability && Array.isArray(value.locations)) {
      result.locations = value.locations.slice(0, 30).flatMap((location) => {
        if (!location?.name || typeof location.name !== 'string') return [];
        const normalized = { name: location.name.trim() };
        const available = nonnegativeInteger(location.availableCopies);
        const total = nonnegativeInteger(location.totalCopies);
        const restricted = nonnegativeInteger(location.notForLoanCopies);
        if (available !== undefined) normalized.availableCopies = available;
        if (total !== undefined) normalized.totalCopies = total;
        if (verifiedIdentity && restricted > 0 && restricted <= total) normalized.notForLoanCopies = restricted;
        if (['available', 'unavailable', 'unknown'].includes(location.status)) normalized.status = location.status;
        return normalized.name ? [normalized] : [];
      });
    }
    return result;
  }

  // Legacy adapters do not expose enough parser confidence for public
  // not-found claims. They can contribute a conservative copy observation only.
  if (lookupKind === 'catalog_record') return null;
  if (!['available', 'checked_out', 'waitlist'].includes(value?.status)) return null;
  const result = {
    outcome: value.status === 'available' ? 'available' : 'none_available',
    lookupKind,
    matchKind: lookupKind === 'exact_isbn' ? 'exact_isbn' : 'verified_work',
    freshness: 'fresh',
    observedAt: attemptedAt,
    attemptedAt,
  };
  const availableCopies = nonnegativeInteger(value.availableCopies);
  const totalCopies = nonnegativeInteger(value.copies);
  if (library.capabilities.copyCounts && availableCopies !== undefined) result.availableCopies = availableCopies;
  if (library.capabilities.copyCounts && totalCopies !== undefined) result.totalCopies = totalCopies;
  if (library.capabilities.callNumber && typeof value.callNumber === 'string' && value.callNumber.trim()) result.callNumber = value.callNumber.trim();
  const catalogUrl = library.capabilities.catalogLink && safeCatalogUrl(value.url, library, entry);
  if (catalogUrl) {
    result.catalogUrl = catalogUrl;
    result.catalogLinkKind = 'record';
  }
  return result;
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
    async check({ libraryId, bookKey, editionScope = 'work', language }) {
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
      try {
        if (!ownRecord && editionScope === 'work' && books.searchProfile) {
          const profile = await books.searchProfile(bookKey, { editionScope, language });
          const observation = await searchLibraryBook(provider, profile);
          if (observation.outcome === 'unknown' && !observation.matchKind) {
            const result = failed(Object.assign(new Error('Catalog search incomplete'), { code: observation.errorCode }), handoff, 'verified_work');
            result.response.searchSummary = observation.searchSummary;
            return result;
          }
          const response = observation.outcome === 'no_match'
            ? { outcome: 'no_match', lookupKind: 'verified_work', matchKind: 'none', freshness: 'fresh', attemptedAt }
            : normalizeProviderObservation(observation, { lookupKind: 'verified_work', attemptedAt, library, entry });
          if (!response) throw Object.assign(new Error('Unrecognized catalog observation'), { code: 'CATALOG_UNRECOGNIZED' });
          response.searchSummary = observation.searchSummary;
          if (observation.matchedBook) response.matchedBook = {
            title: String(observation.matchedBook.title || '').slice(0, 500),
            ...(observation.matchedBook.isbn13 ? { isbn13: observation.matchedBook.isbn13 } : {}),
          };
          const enriched = attachCatalogHandoff(response, handoff, library);
          return { kind: 'result', response: ['unknown', 'no_match'].includes(response.outcome) ? enriched : remember(cacheKey, enriched) };
        }
        if (parsed?.kind === 'catalog' && !ownRecord && !book.isbn13 && !books.searchProfile) throw Object.assign(new Error('A catalog record cannot identify another library’s edition'), { code: 'CATALOG_UNSUPPORTED' });
        const observation = ownRecord && provider.checkRecordAvailability
          ? await provider.checkRecordAvailability(parsed.recordId)
          : ownRecord && provider.resolveCatalogRecord ? (await provider.resolveCatalogRecord(parsed.recordId))?.observation
          : await provider.checkAvailability(book.isbn13 || null, editionScope === 'exact' ? '' : book.title, editionScope === 'exact' ? '' : book.authors.join(', '));
        if (editionScope === 'exact' && observation?.matchKind && !['exact_isbn', 'none'].includes(observation.matchKind)) {
          throw Object.assign(new Error('The catalog did not verify this ISBN'), { code: 'CATALOG_UNRECOGNIZED' });
        }
        const response = normalizeProviderObservation(observation, { lookupKind, attemptedAt, library, entry });
        if (!response) throw Object.assign(new Error('Unrecognized catalog observation'), { code: 'CATALOG_UNRECOGNIZED' });
        const enriched = attachCatalogHandoff(response, handoff, library);
        return { kind: 'result', response: response.outcome === 'unknown' ? enriched : remember(cacheKey, enriched) };
      } catch (error) {
        return failed(error, handoff, lookupKind);
      }
    },
  });
}
