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
// layer passes `{ maxRequests, deadlineAt, signal, robots, minIntervalMs }`: the
// whole check, including single provider calls, then runs inside one catalog
// operation with that request cap, deadline, pacing and robots policy, and
// the deadline or the caller's signal cancels any request still in flight.
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
  const run = () => checkWithProfile({ entry, library, provider, book, parsed, ownRecord, lookupKind, editionScope, attemptedAt, profile, workSearch, hasProfiles, budget });
  if (!budget) return run();
  return withBudget(budget, run, lookupKind);
}

async function withBudget(budget, run, lookupKind) {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (budget.signal?.aborted) return { error: coded('Catalog check was cancelled', 'CATALOG_ABORTED'), lookupKind };
  budget.signal?.addEventListener?.('abort', forward, { once: true });
  let timer;
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ error: coded('Catalog check deadline exceeded', 'CATALOG_TIMEOUT'), lookupKind });
    }, Math.max(0, budget.deadlineAt - Date.now()));
  });
  const cancelled = new Promise(resolve => {
    controller.signal.addEventListener('abort', () => {
      if (budget.signal?.aborted) resolve({ error: coded('Catalog check was cancelled', 'CATALOG_ABORTED'), lookupKind });
    }, { once: true });
  });
  try {
    const work = withCatalogOperation({ maxRequests: budget.maxRequests, signal: controller.signal,
      robots: budget.robots || null, minIntervalMs: budget.minIntervalMs || 0 }, async operation => {
      const result = await run();
      return { ...result, requests: operation.requests };
    });
    work.catch(() => {});
    return await Promise.race([work, deadline, cancelled]);
  } finally {
    clearTimeout(timer);
    budget.signal?.removeEventListener?.('abort', forward);
  }
}

async function checkWithProfile({ entry, library, provider, book, parsed, ownRecord, lookupKind, editionScope, attemptedAt, profile, workSearch, hasProfiles, budget }) {
  try {
    if (workSearch) {
      const observation = await searchLibraryBook(provider, profile, budget
        ? { timeoutMs: Math.max(1, budget.deadlineAt - Date.now()), maxRequests: budget.maxRequests }
        : { timeoutMs: checkBudgetMs(entry) });
      if (observation.outcome === 'unknown' && !observation.matchKind) {
        return { error: coded('Catalog search incomplete', observation.errorCode), lookupKind: 'verified_work', searchSummary: observation.searchSummary, profile };
      }
      const response = observation.outcome === 'no_match'
        ? { outcome: 'no_match', lookupKind: 'verified_work', matchKind: 'none', freshness: 'fresh', attemptedAt }
        : normalizeProviderObservation(observation, { lookupKind: 'verified_work', attemptedAt, library, entry });
      if (!response) throw coded('Unrecognized catalog observation', 'CATALOG_UNRECOGNIZED');
      response.searchSummary = observation.searchSummary;
      if (observation.matchedBook) response.matchedBook = {
        title: String(observation.matchedBook.title || '').slice(0, 500),
        ...(observation.matchedBook.isbn13 ? { isbn13: observation.matchedBook.isbn13 } : {}),
      };
      return { response, profile };
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
