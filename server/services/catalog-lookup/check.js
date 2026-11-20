import { searchLibraryBook, checkBudgetMs } from '../libraryBookSearch.js';
import { withCatalogOperation } from '../providers/http.js';
import { normalizeProviderObservation } from './observation.js';

const coded = (message, code) => Object.assign(new Error(message), { code });

// One catalog check for one book, shared by `/availability` (old and new
// paths) and `lookupBook`. It returns either `{ response }` (the normalized
// public observation, before catalog handoff and attribution are attached) or
// `{ error, lookupKind, searchSummary? }`. It never turns a failure into an
// answer: the caller decides how a failure is shown.
//
// `budget` is null for the old path (today's behaviour: title-first searches
// capped by searchLibraryBook, single provider calls uncapped). The lookup
// layer passes `{ maxRequests, deadlineAt, signal, robots, minIntervalMs, gate, noRetries }`: the
// whole check, including single provider calls, then runs inside one catalog
// operation with that request cap, deadline, pacing and robots policy, and
// the deadline or the caller's signal cancels any request still in flight.
//
// A work search reports its best proven match as it goes (`budget.progress`,
// libraryBookSearch.js). When the deadline arrives before the search has
// returned, that match is the answer instead of "couldn't check" (plan A2,
// step 1). `budget.conclude`, an AbortSignal, asks the check to end now with
// such a match; without one it is ignored and the check carries on.
export async function runBookCheck({ entry, library, provider, book, bookKey, parsed, ownRecord, lookupKind,
  editionScope = 'work', language, books, attemptedAt, budget = null }) {
  // Book profiles are Open Library reads. They are resolved before the catalog
  // operation starts so they never count against a catalog's request budget.
  let profile = null;
  const workSearch = !ownRecord && editionScope === 'work' && typeof books?.searchProfile === 'function';
  if (workSearch) {
    try { profile = await books.searchProfile(bookKey, { editionScope, language }); }
    catch (error) { return { error, lookupKind }; }
  }
  const hasProfiles = typeof books?.searchProfile === 'function';
  const progress = budget ? (budget.progress || {}) : null;
  const run = () => checkWithProfile({ entry, library, provider, book, parsed, ownRecord, lookupKind, editionScope, attemptedAt, profile, workSearch, hasProfiles, budget, progress });
  if (!budget) return run();
  // The best proven match so far, as a finished check result, or null.
  const answerWith = observation => {
    if (!workSearch || !observation) return null;
    try { return { response: workResponse(observation, { library, entry, attemptedAt }), profile }; } catch { return null; }
  };
  const proven = () => answerWith(progress?.best);
  // At the deadline only: a title-and-author match (answered "unconfirmed").
  const possible = () => answerWith(progress?.possible);
  return withBudget(budget, run, lookupKind, proven, possible);
}

async function withBudget(budget, run, lookupKind, proven = () => null, possible = () => null) {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (budget.signal?.aborted) return { error: coded('Catalog check was cancelled', 'CATALOG_ABORTED'), lookupKind };
  budget.signal?.addEventListener?.('abort', forward, { once: true });
  let timer, current = null;
  // A deadline or cancellation still reports the requests already sent.
  const sent = () => current?.requests || 0;
  // At the deadline a proven match already found is kept, never discarded.
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      const best = proven() || possible();
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
    const work = withCatalogOperation({ maxRequests: budget.maxRequests, signal: controller.signal,
      robots: budget.robots || null, minIntervalMs: budget.minIntervalMs || 0, gate: budget.gate || null, noRetries: Boolean(budget.noRetries) }, async operation => {
      current = operation;
      const result = await run();
      // The inner search can reach its own deadline before the outer timer
      // fires. Keep the same proven match whichever deadline wins.
      const best = result.error?.code === 'CATALOG_TIMEOUT' ? proven() || possible() : null;
      return { ...(best ?? result), requests: operation.requests };
    });
    work.catch(() => {});
    return await Promise.race([work, deadline, cancelled, concluded]);
  } finally {
    clearTimeout(timer);
    budget.signal?.removeEventListener?.('abort', forward);
    if (onConclude) budget.conclude?.removeEventListener?.('abort', onConclude);
  }
}

// A work search's observation as the public response (before handoff and
// attribution). Throws when the observation is not one the app can read.
function workResponse(observation, { library, entry, attemptedAt }) {
  const response = observation.outcome === 'no_match'
    ? { outcome: 'no_match', lookupKind: 'verified_work', matchKind: 'none', freshness: 'fresh', attemptedAt }
    : normalizeProviderObservation(observation, { lookupKind: 'verified_work', attemptedAt, library, entry });
  if (!response) throw coded('Unrecognized catalog observation', 'CATALOG_UNRECOGNIZED');
  response.searchSummary = observation.searchSummary;
  if (observation.matchedBook) response.matchedBook = {
    title: String(observation.matchedBook.title || '').slice(0, 500),
    ...(observation.matchedBook.isbn13 ? { isbn13: observation.matchedBook.isbn13 } : {}),
  };
  return response;
}

async function checkWithProfile({ entry, library, provider, book, parsed, ownRecord, lookupKind, editionScope, attemptedAt, profile, workSearch, hasProfiles, budget, progress }) {
  try {
    if (workSearch) {
      const observation = await searchLibraryBook(provider, profile, budget
        ? { timeoutMs: Math.max(1, budget.deadlineAt - Date.now()), maxRequests: budget.maxRequests, ...(progress ? { progress } : {}) }
        : { timeoutMs: checkBudgetMs(entry) });
      if (observation.outcome === 'unknown' && !observation.matchKind) {
        return { error: coded('Catalog search incomplete', observation.errorCode), lookupKind: 'verified_work', searchSummary: observation.searchSummary, profile };
      }
      return { response: workResponse(observation, { library, entry, attemptedAt }), profile };
    }
    if (parsed?.kind === 'catalog' && !ownRecord && !book.isbn13 && !hasProfiles) throw coded('A catalog record cannot identify another library’s edition', 'CATALOG_UNSUPPORTED');
    const observation = ownRecord && provider.checkRecordAvailability
      ? await provider.checkRecordAvailability(parsed.recordId)
      : ownRecord && provider.resolveCatalogRecord ? (await provider.resolveCatalogRecord(parsed.recordId))?.observation
      : await provider.checkAvailability(book.isbn13 || null, editionScope === 'exact' ? '' : book.title, editionScope === 'exact' ? '' : (book.authors || []).join(', '));
    if (editionScope === 'exact' && observation?.matchKind && !['exact_isbn', 'none'].includes(observation.matchKind)) {
      throw coded('The catalog did not verify this ISBN', 'CATALOG_UNRECOGNIZED');
    }
    const response = normalizeProviderObservation(observation, { lookupKind, attemptedAt, library, entry });
    if (!response) throw coded('Unrecognized catalog observation', 'CATALOG_UNRECOGNIZED');
    return { response, profile };
  } catch (error) {
    return { error, lookupKind, profile };
  }
}
