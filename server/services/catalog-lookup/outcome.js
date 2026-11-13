import { validateAndNormalize } from '../isbn.js';

// The only place catalog observations become the three answers the app shows:
// found, not found, couldn't check (plan 3.5 and 5.2).
//
//   available / none_available / in_catalog / not-for-loan, proven by
//     exact_isbn, verified_work or catalog_record          -> found
//   not_found for an exact ISBN the parser recognized       -> not_found
//   work-level no_match with a complete edition list and a
//     search that was not partial                           -> not_found
//   possible_match (title/author only)                      -> couldnt_check, unconfirmed
//   anything else (unknown, timeout, budget, error, ...)    -> couldnt_check
//
// A failure is never "not found".

export const OUTCOMES = Object.freeze(['found', 'not_found', 'couldnt_check']);
export const REASONS = Object.freeze(['unconfirmed', 'timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'unsupported', 'configuration', 'cancelled', 'busy']);

// `unconfirmed` and `unsupported` say nothing about the catalog's health. A
// check the reader cancelled (`cancelled`, an addition to the plan's list) is
// not the catalog's failure either, nor is a check our own cross-reader host
// pacing could not fit before its deadline (`busy`, catalog-store/hostGate.js).
// Running out of our own request budget (`budget`: the platform's cap in
// platforms.js, or rows left unread under it) is our limit, not the library's
// failure: it neither counts in the health record nor opens the circuit. A
// catalog that answered with something unreadable is `unrecognized`.
const NOT_HEALTH_FAILURES = new Set(['unconfirmed', 'unsupported', 'cancelled', 'busy', 'budget']);
export function isHealthFailure(reason) {
  return Boolean(reason) && !NOT_HEALTH_FAILURES.has(reason);
}

export function reasonForError(error) {
  const code = error?.code || error?.errorCode || '';
  switch (code) {
    case 'CATALOG_ABORTED': return 'cancelled';
    case 'CATALOG_HOST_BUSY': return 'busy';
    case 'CATALOG_TIMEOUT': return 'timeout';
    case 'CATALOG_REQUEST_BUDGET':
    case 'CATALOG_INCOMPLETE': return 'budget';
    case 'CATALOG_PROVIDER_BLOCKED':
    case 'CATALOG_ROBOTS_DISALLOWED': return 'blocked';
    case 'CATALOG_UNRECOGNIZED':
    case 'CATALOG_HOLDING_UNCONFIRMED': return 'unrecognized';
    case 'CATALOG_UNSUPPORTED':
    case 'CATALOG_EXACT_ISBN_REQUIRED':
    case 'CATALOG_QUERY_UNSUPPORTED':
    case 'CATALOG_TITLE_SEARCH_REQUIRED': return 'unsupported';
    case 'CATALOG_CONFIGURATION_REQUIRED': return 'configuration';
    case 'CATALOG_UNAVAILABLE': return 'unavailable';
    default:
      if (error?.name === 'AbortError' || /timeout|deadline/i.test(error?.message || '')) return 'timeout';
      return 'unavailable';
  }
}

export function couldntCheck(reason, extra = {}) {
  return { outcome: 'couldnt_check', reason: REASONS.includes(reason) ? reason : 'unavailable', ...extra };
}

const FOUND_OUTCOMES = new Set(['available', 'none_available', 'in_catalog']);
const PROVEN = new Set(['exact_isbn', 'verified_work', 'catalog_record']);

// `response` is the normalized public observation (catalog-lookup/observation.js
// or the `/availability` response). `context.profile` is the work's edition
// profile when a work-level search ran; `context.recordId` is the library's
// own catalog record when the reader opened one.
export function answerFromResponse(response, context = {}) {
  if (!response || typeof response !== 'object') return couldntCheck('unrecognized');
  const { outcome, matchKind } = response;
  const catalogUrl = typeof response.catalogUrl === 'string' ? response.catalogUrl : undefined;
  const extra = catalogUrl ? { catalogUrl } : {};
  const notForLoan = outcome === 'unknown' && response.loanRestriction === 'not_for_loan';
  if ((FOUND_OUTCOMES.has(outcome) || notForLoan) && PROVEN.has(matchKind)) {
    const matchedIsbn13 = validateAndNormalize(response.matchedBook?.isbn13 || '') || undefined;
    let evidence;
    if (matchKind === 'catalog_record' || (matchKind === 'verified_work' && response.lookupKind === 'catalog_record')) evidence = 'catalog_record';
    else if (matchKind === 'exact_isbn') evidence = 'exact_isbn';
    else evidence = matchedIsbn13 ? 'work_isbn' : 'catalog_record';
    return { outcome: 'found', evidence, ...(matchedIsbn13 ? { matchedIsbn13 } : {}),
      ...(context.recordId ? { recordId: context.recordId } : {}), ...extra };
  }
  if (outcome === 'not_found' && matchKind === 'none' && response.lookupKind === 'exact_isbn') {
    return { outcome: 'not_found', evidence: 'isbn_not_listed', ...extra };
  }
  if (outcome === 'no_match') {
    const summary = response.searchSummary || {};
    const complete = summary.partial === false && summary.editionsComplete === true && context.profile?.complete !== false;
    // The catalog answered, but the edition list or the search was incomplete:
    // the book may be there under an ISBN we did not know about.
    return complete ? { outcome: 'not_found', evidence: 'work_no_match' } : couldntCheck('unconfirmed', extra);
  }
  if (matchKind === 'possible_match') return couldntCheck('unconfirmed', extra);
  // The catalog answered and recognized the edition but did not show a copy
  // (Evergreen: record with no holdings). Not a failure, not an answer.
  if (outcome === 'unknown' && PROVEN.has(matchKind) && !response.errorCode) return couldntCheck('unconfirmed', extra);
  if (response.errorCode) return couldntCheck(reasonForError({ code: response.errorCode }), extra);
  return couldntCheck('unrecognized', extra);
}

// The `/availability` response for an unknown outcome carries `errorCode`.
export function answerFromCheck(result, context = {}) {
  if (result?.error) return couldntCheck(reasonForError(result.error));
  return answerFromResponse(result?.response, context);
}
