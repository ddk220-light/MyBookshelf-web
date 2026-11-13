import { publicAttribution } from '../../public-v2/attribution.js';

// Adapter observations become the public availability shape here, and only
// here. `recognizedExact` is an internal parser fact: it is required before a
// public not-found assertion. Moved unchanged from public-v2/availability.js so
// the old route and the lookup layer read observations identically.
export function nonnegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function safeCatalogUrl(value, library, entry) {
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

export function normalizeProviderObservation(value, { lookupKind, attemptedAt, library, entry }) {
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
