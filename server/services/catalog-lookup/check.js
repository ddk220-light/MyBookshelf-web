import { searchLibraryBook } from '../libraryBookSearch.js';
import { withCatalogOperation } from '../providers/http.js';
import { MAX_CHECK_MS } from './platforms.js';
import { normalizeProviderObservation } from './observation.js';
import { parsePublicBookKey } from '../../public-v2/contracts.js';

const coded = (message, code) => Object.assign(new Error(message), { code });

// One catalog check for one book, shared by `/availability` (old and new
// paths) and `lookupBook`. It returns either `{ response }` (the normalized
// public observation, before catalog handoff and attribution are attached) or
// `{ error, lookupKind }`. It never turns a failure into an answer: the caller
// decides how a failure is shown.
//
// A book asked about as a work (every book key but this library's own record
// and an exact-edition `/availability` call) is one simple search
// (libraryBookSearch.js): one title search, plus one search for the reader's
// ISBN when the book was reached by ISBN, or one ISBN search alone at a
// catalog without a title search.
//
// `budget` is null for the old `/availability` path without the lookup layer.
// The lookup layer passes `{ deadlineAt, signal, robots, minIntervalMs, gate,
// noRetries, requestTimeoutMs, hostRequests }`: the whole check then runs
// inside one catalog operation with that deadline, the shared host pacing and
// the robots policy, and the deadline or the caller's signal cancels any
// request still in flight. A found answer reached as the deadline arrives is
// kept (`budget.progress`); `budget.conclude`, an AbortSignal, asks the check
// to end now with such an answer.
export async function runBookCheck({ entry, library, provider, book, bookKey, parsed, ownRecord, lookupKind,
  editionScope = 'work', books, attemptedAt, budget = null }) {
  // A provider without the searches (an old adapter shape, tests) is asked
  // by the book's ISBN, as an exact-edition check.
  const workSearch = !ownRecord && editionScope === 'work' && Boolean(provider?.searchTitle || provider?.searchIsbn);
  const progress = budget ? (budget.progress || {}) : null;
  const run = () => checkBook({ entry, library, provider, book, bookKey, parsed, keyed: parsed ?? parsePublicBookKey(bookKey || ''), ownRecord, lookupKind,
    editionScope, attemptedAt, workSearch, books, budget, progress });
  if (!budget) return run();
  const proven = () => {
    if (!workSearch || !progress?.best) return null;
    try { return { response: workResponse(progress.best, { library, entry, attemptedAt }) }; } catch { return null; }
  };
  return withBudget(budget, run, lookupKind, proven);
}

async function withBudget(budget, run, lookupKind, proven) {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (budget.signal?.aborted) return { error: coded('Catalog check was cancelled', 'CATALOG_ABORTED'), lookupKind };
  budget.signal?.addEventListener?.('abort', forward, { once: true });
  let timer, current = null;
  // A deadline or cancellation still reports the requests already sent.
  const sent = () => current?.requests || 0;
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      const best = proven();
      controller.abort();
      resolve(best ? { ...best, requests: sent() } : { error: coded('Catalog check deadline exceeded', 'CATALOG_TIMEOUT'), lookupKind, requests: sent() });
    }, Math.max(0, budget.deadlineAt - Date.now()));
  });
  let onConclude = null;
  const concluded = new Promise(resolve => {
    if (!budget.conclude) return;
    onConclude = () => {
      const best = proven();
      if (!best) return;
      controller.abort();
      resolve({ ...best, requests: sent() });
    };
    if (budget.conclude.aborted) onConclude();
    else budget.conclude.addEventListener?.('abort', onConclude, { once: true });
  });
  const cancelled = new Promise(resolve => {
    controller.signal.addEventListener('abort', () => {
      if (budget.signal?.aborted) resolve({ error: coded('Catalog check was cancelled', 'CATALOG_ABORTED'), lookupKind, requests: sent() });
    }, { once: true });
  });
  try {
    const work = withCatalogOperation({ maxRequests: budget.maxRequests ?? Infinity, signal: controller.signal,
      robots: budget.robots || null, minIntervalMs: budget.minIntervalMs || 0, gate: budget.gate || null, noRetries: Boolean(budget.noRetries),
      hostRequests: budget.hostRequests || 1,
      ...(budget.requestTimeoutMs > 0 ? { requestTimeoutMs: budget.requestTimeoutMs } : {}),
      ...(Number.isFinite(budget.deadlineAt) ? { deadlineAt: budget.deadlineAt } : {}) }, async operation => {
      current = operation;
      const result = await run();
      // The search's own deadline can settle just before this one: a found
      // answer already in hand is still the answer.
      return { ...((result.error && proven()) || result), requests: operation.requests };
    });
    work.catch(() => {});
    return await Promise.race([work, deadline, cancelled, concluded]);
  } finally {
    clearTimeout(timer);
    budget.signal?.removeEventListener?.('abort', forward);
    if (onConclude) budget.conclude?.removeEventListener?.('abort', onConclude);
  }
}

// Which search produced a find ('isbn', 'title', 'record'): for the check's
// log line only (record.js), so kept off every response, stored answer and
// client reply (not enumerable).
const FOUND_BY = new Set(['isbn', 'title', 'record']);
export function markFoundBy(target, source) {
  if (!target || !FOUND_BY.has(source?.foundBy)) return target;
  Object.defineProperty(target, 'foundBy', { value: source.foundBy, enumerable: false, configurable: true });
  return target;
}

// A work search's observation as the public response (before handoff and
// attribution). Throws when the observation is not one the app can read.
function workResponse(observation, { library, entry, attemptedAt }) {
  const response = observation.outcome === 'no_match'
    ? { outcome: 'no_match', lookupKind: 'verified_work', matchKind: 'none', freshness: 'fresh', attemptedAt }
    : normalizeProviderObservation(observation, { lookupKind: observation.matchKind === 'exact_isbn' ? 'exact_isbn' : 'verified_work', attemptedAt, library, entry });
  if (!response) throw coded('Unrecognized catalog observation', 'CATALOG_UNRECOGNIZED');
  markFoundBy(response, observation);
  if (observation.matchedBook) response.matchedBook = {
    title: String(observation.matchedBook.title || '').slice(0, 500),
    ...(observation.matchedBook.isbn13 ? { isbn13: observation.matchedBook.isbn13 } : {}),
  };
  if (Array.isArray(observation.matches)) response.matches = observation.matches;
  return response;
}

async function checkBook({ entry, library, provider, book, bookKey, parsed, keyed, ownRecord, lookupKind, editionScope, attemptedAt, workSearch, books, budget, progress }) {
  try {
    if (workSearch) {
      // The reader's own ISBN is the one in the book key (an ISBN key).
      const readerIsbn = keyed?.kind === 'isbn' ? keyed.isbn13 : null;
      const latestIsbn = typeof books?.latestIsbn === 'function' && book?.workId ? () => books.latestIsbn(book.workId) : null;
      const observation = await searchLibraryBook(provider, book, {
        timeoutMs: budget ? Math.max(1, budget.deadlineAt - Date.now()) : MAX_CHECK_MS, readerIsbn, latestIsbn, progress });
      if (observation.outcome === 'unknown') {
        return { error: coded('Catalog search incomplete', observation.errorCode), lookupKind: 'verified_work', ...(observation.notCatalogFailure ? { notCatalogFailure: true } : {}) };
      }
      return { response: workResponse(observation, { library, entry, attemptedAt }) };
    }
    if (parsed?.kind === 'catalog' && !ownRecord && !book.isbn13) throw coded('A catalog record cannot identify another library’s edition', 'CATALOG_UNSUPPORTED');
    const observation = ownRecord && provider.checkRecordAvailability
      ? await provider.checkRecordAvailability(parsed.recordId)
      : ownRecord && provider.resolveCatalogRecord ? (await provider.resolveCatalogRecord(parsed.recordId))?.observation
      : await provider.checkAvailability(book.isbn13 || null, '', '');
    if (editionScope === 'exact' && observation?.matchKind && !['exact_isbn', 'none'].includes(observation.matchKind)) {
      throw coded('The catalog did not verify this ISBN', 'CATALOG_UNRECOGNIZED');
    }
    const response = normalizeProviderObservation(observation, { lookupKind, attemptedAt, library, entry });
    if (!response) throw coded('Unrecognized catalog observation', 'CATALOG_UNRECOGNIZED');
    return { response };
  } catch (error) {
    return { error, lookupKind };
  }
}
