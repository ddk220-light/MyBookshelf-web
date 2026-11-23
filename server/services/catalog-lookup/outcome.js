import { validateAndNormalize } from '../isbn.js';
import { linkKind } from './observation.js';

// The only place catalog observations become the three answers the app shows:
// found, not found, couldn't check (plan 3.5 and 5.2).
//
//   available / none_available / in_catalog / not-for-loan, proven by
//     exact_isbn, verified_work or catalog_record          -> found
//     (verified_work includes a row of this library's catalog
//     whose title matches the book, lookupKind `title`:
//     evidence `title_match`, otherwise the same answer as an
//     ISBN find; owner decision, 20 November 2026; a work
//     search's found answer lists the matching rows, `matches`)
//   not_found for an exact ISBN the parser recognized       -> not_found
//   work-level no_match (every search the check made was
//     answered by the catalog and nothing matched)          -> not_found
//   possible_match                                          -> couldnt_check, unconfirmed
//   anything else (unknown, timeout, error, ...)            -> couldnt_check
//
// A failure is never "not found".

export const OUTCOMES = Object.freeze(['found', 'not_found', 'couldnt_check']);
export const REASONS = Object.freeze(['unconfirmed', 'timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'unsupported', 'configuration', 'cancelled', 'busy']);

// `unconfirmed` and `unsupported` say nothing about the catalog's health. A
// check the reader cancelled (`cancelled`, an addition to the plan's list) is
// not the catalog's failure either, nor is a check our own cross-reader host
// pacing could not fit before its deadline (`busy`, catalog-store/hostGate.js:
// the host's next turn, after other checks already waiting, was past this
// check's deadline). A check that ran out of time is `timeout`, whatever
// part of its time went on the book's details, the edition list or waiting
// for the host's turn. Running out of a request cap (`budget`) is our limit,
// not the library's failure: it neither counts in the health record nor
// opens the circuit. Only work the app does on its own has a request cap
// (result marking, platforms.js `results`; tools); a reader's book check has
// none (owner decision, 20 November 2026), so `budget` never reaches the
// book page. A catalog that answered with something unreadable is
// `unrecognized`.
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
    // A request cap ran out: capped work only (result marking, tools).
    case 'CATALOG_REQUEST_BUDGET': return 'budget';
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

// The provider's own code (e.g. CATALOG_ROBOTS_DISALLOWED, or CATALOG_UNAVAILABLE
// with a network cause such as ECONNREFUSED), for the failure log only. Kept
// non-enumerable so it never reaches a response, a stored answer or telemetry.
export function errorCodeFor(error) {
  const clean = (value) => (typeof value === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(value) ? value : null);
  const code = clean(error?.code) || clean(error?.errorCode) || (error?.name === 'AbortError' ? 'AbortError' : null);
  const cause = clean(error?.cause?.code);
  return code && cause && cause !== code ? `${code}:${cause}`.slice(0, 64) : (code || cause);
}

export function couldntCheckFor(error, extra = {}) {
  const answer = couldntCheck(reasonForError(error), extra);
  const code = errorCodeFor(error);
  if (code) Object.defineProperty(answer, 'errorCode', { value: code, enumerable: false });
  return answer;
}

const FOUND_OUTCOMES = new Set(['available', 'none_available', 'in_catalog']);
const PROVEN = new Set(['exact_isbn', 'verified_work', 'catalog_record']);

// `response` is the normalized public observation (catalog-lookup/observation.js
// or the `/availability` response). `context.recordId` is the library's own
// catalog record when the reader opened one.
export function answerFromResponse(response, context = {}) {
  if (!response || typeof response !== 'object') return couldntCheck('unrecognized');
  const { outcome, matchKind } = response;
  const catalogUrl = typeof response.catalogUrl === 'string' ? response.catalogUrl : undefined;
  // The link keeps what it is (the book's record, a search, the catalog).
  const extra = catalogUrl ? { catalogUrl, catalogLinkKind: linkKind(response.catalogLinkKind) } : {};
  const notForLoan = outcome === 'unknown' && response.loanRestriction === 'not_for_loan';
  if ((FOUND_OUTCOMES.has(outcome) || notForLoan) && PROVEN.has(matchKind)) {
    const matchedIsbn13 = validateAndNormalize(response.matchedBook?.isbn13 || '') || undefined;
    let evidence;
    // A work search's title match (not a reader's own record).
    const titleMatch = matchKind === 'verified_work' && response.lookupKind === 'title' && !context.recordId;
    if (titleMatch) evidence = 'title_match';
    else if (matchKind === 'catalog_record' || (matchKind === 'verified_work' && response.lookupKind === 'catalog_record')) evidence = 'catalog_record';
    else if (matchKind === 'exact_isbn') evidence = 'exact_isbn';
    else evidence = matchedIsbn13 ? 'work_isbn' : 'catalog_record';
    const answer = { outcome: 'found', evidence, ...(matchedIsbn13 && !titleMatch ? { matchedIsbn13 } : {}),
      ...(context.recordId ? { recordId: context.recordId } : {}), ...extra,
      ...(Array.isArray(response.matches) && response.matches.length ? { matches: response.matches } : {}) };
    // Which search found it, for the log line only (check.js markFoundBy).
    if (response.foundBy !== undefined) Object.defineProperty(answer, 'foundBy', { value: response.foundBy, enumerable: false, configurable: true });
    return answer;
  }
  if (outcome === 'not_found' && matchKind === 'none' && response.lookupKind === 'exact_isbn') {
    return { outcome: 'not_found', evidence: 'isbn_not_listed', ...extra };
  }
  // Every search the check made was answered and nothing matched
  // (libraryBookSearch.js returns no_match only then).
  if (outcome === 'no_match') return { outcome: 'not_found', evidence: 'work_no_match' };
  if (matchKind === 'possible_match') return couldntCheck('unconfirmed', extra);
  // The catalog answered and recognized the edition but did not show a copy
  // (Evergreen: record with no holdings). Not a failure, not an answer.
  if (outcome === 'unknown' && PROVEN.has(matchKind) && !response.errorCode) return couldntCheck('unconfirmed', extra);
  if (response.errorCode) return couldntCheckFor({ code: response.errorCode }, extra);
  return couldntCheck('unrecognized', extra);
}

// The `/availability` response for an unknown outcome carries `errorCode`.
export function answerFromCheck(result, context = {}) {
  if (result?.error) return couldntCheckFor(result.error);
  return answerFromResponse(result?.response, context);
}
