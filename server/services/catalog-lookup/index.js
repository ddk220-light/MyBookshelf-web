import { getProvider } from '../providers/index.js';
import { withCatalogOperation } from '../providers/http.js';
import { createRobotsPolicy } from '../providers/robots.js';
import { matchCatalogRecord } from '../libraryBookSearch.js';
import { validateAndNormalize } from '../isbn.js';
import { parsePublicBookKey } from '../../public-v2/contracts.js';
import { runBookCheck } from './check.js';
import { normalizeProviderObservation } from './observation.js';
import { answerFromCheck, answerFromResponse, couldntCheck, isHealthFailure, reasonForError } from './outcome.js';
import { PLATFORMS, platformFor, hostFor, bookDeadlineMs, lookupV2Enabled } from './platforms.js';
import { createHostGuard } from './budget.js';
import { createLookupRecorder, createMemoryHealthRecord, identitiesFor, askedIdentity, storedAnswer } from './record.js';
import { createMemoryHostGate } from '../../catalog-store/hostGate.js';

// The catalog lookup layer (plan section 5). Two entry points:
//
//   lookupBook({ library, book, profile?, editionScope?, signal, deadlineAt })
//     "does library X have book Y" -> found | not_found | couldnt_check
//   markResults({ library, query, books, signal, deadlineAt })
//     async iterable of { bookKey, outcome, ... } as answers arrive, then
//     { done: true, notAttempted, unmatched }
//
// `library` is a directory entry (server/data/*.json). `book` is
//   { bookKey, isbn13?, workId?, title?, authors?, recordId?, recordLibraryId? }
// where recordId is set only when the book is this library's own record.
// A failed, blocked, cancelled or timed-out check is always `couldnt_check`.

const RESULTS_CACHE_MS = 10 * 60 * 1000;
const MAX_RESULT_BOOKS = 12;
const coded = (message, code) => Object.assign(new Error(message), { code });
// Resolves to `promise`'s value, or rejects at the deadline (CATALOG_TIMEOUT)
// or when the signal aborts (CATALOG_ABORTED), whichever comes first.
function settleBy(promise, deadlineAt, signal, clock = Date.now) {
  return new Promise((resolve, reject) => {
    let timer;
    const done = (fn, value) => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); fn(value); };
    const onAbort = () => done(reject, coded('Catalog check was cancelled', 'CATALOG_ABORTED'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (Number.isFinite(deadlineAt)) timer = setTimeout(() => done(reject, coded('Edition details took too long', 'CATALOG_TIMEOUT')), Math.max(0, deadlineAt - clock()));
    Promise.resolve(promise).then(value => done(resolve, value), error => done(reject, error));
  });
}

const normalQuery = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

function publicView(entry, library) {
  // The answer does not depend on display capabilities; the catalog link
  // check needs the library's catalog address.
  return library || { id: entry?.id, catalogUrl: entry?.catalogUrl,
    capabilities: { publicAvailability: true, catalogLink: true, copyCounts: false, callNumber: false, locationAvailability: false } };
}

export function createCatalogLookup({
  providerFor = getProvider,
  recorder = createLookupRecorder({ health: createMemoryHealthRecord() }),
  guard = createHostGuard(),
  // Per-host spacing and per-minute caps across readers (and, with the
  // catalog store, across instances). See catalog-store/hostGate.js.
  hostGate = createMemoryHostGate(),
  robots = createRobotsPolicy(),
  now = () => Date.now(),
  env = process.env,
  platforms = PLATFORMS,
} = {}) {
  const resultsCache = new Map();
  const robotsCheck = robots ? url => robots.check(url) : null;

  function settings(entry) {
    const platform = platformFor(entry, platforms);
    return { platform, host: hostFor(entry), platformName: platform?.id || String(entry?.platform || 'unknown') };
  }

  // The gate for one operation on this platform: every request waits for its
  // host's next slot (spacing: the larger of the platform's, the adapter's and
  // the robots Crawl-delay; plus the platform's per-minute cap).
  function gateFor(platform) {
    if (!hostGate) return null;
    return (requestHost, { spacingMs = 0, deadlineAt, signal } = {}) => hostGate.reserve(requestHost,
      { spacingMs: Math.max(spacingMs || 0, platform?.minIntervalMs || 0), perMinute: platform?.perMinute || 0, deadlineAt, signal });
  }

  function noteHost(host, answer) {
    if (answer.outcome !== 'couldnt_check') guard.recordSuccess(host);
    else if (isHealthFailure(answer.reason)) guard.recordFailure(host);
  }

  // One live book check through the platform's book-page budget. Used by
  // lookupBook and by /availability on the new path. Returns the raw check
  // result (response or error) plus the projected answer.
  async function checkBook({ entry, library, provider: given, book, bookKey, parsed, ownRecord, lookupKind, editionScope = 'work', language, books,
    attemptedAt, signal, deadlineAt }) {
    const { platform, host, platformName } = settings(entry);
    const startedAt = now();
    const provider = given || providerFor(entry);
    const view = publicView(entry, library);
    const finish = (result, profile) => {
      const answer = answerFromCheck(result, { profile, recordId: ownRecord ? parsed?.recordId : undefined });
      // An edition profile (Open Library) that failed or was too slow, or a
      // wait for one of this instance's own host slots, is not the catalog's
      // failure: it neither opens the circuit nor counts in the health record.
      if (!result.notCatalogFailure) noteHost(host, answer);
      recorder.record({ entry, platform: platformName, host, book: ownRecord ? { ...book, recordId: parsed?.recordId, recordLibraryId: entry.id } : book,
        profile, answer, kind: 'book', durationMs: now() - startedAt, requests: result.requests || 0, live: !result.notCatalogFailure });
      return { ...result, answer, durationMs: now() - startedAt, requests: result.requests || 0 };
    };
    if (!platform || !provider?.checkAvailability) return finish({ error: coded('Catalog lookups are not available for this library', 'CATALOG_UNSUPPORTED'), lookupKind });
    const deadline = Math.min(deadlineAt ?? Infinity, startedAt + bookDeadlineMs(entry, platform));
    // Resolve the edition profile before taking a host slot, and only within
    // the check's deadline: waiting on Open Library must not hold a catalog
    // slot or use up the catalog's time.
    if (!ownRecord && editionScope === 'work' && typeof books?.searchProfile === 'function') {
      let profile;
      try { profile = await settleBy(books.searchProfile(bookKey, { editionScope, language }), deadline, signal, now); }
      catch (error) { return finish({ error, lookupKind, notCatalogFailure: true }); }
      books = { searchProfile: async () => profile };
    }
    // While the host's circuit is open (plan 5.4) result marking skips the
    // host, and the book page tries once: one check at a time for that host
    // on this instance, and each catalog request is sent once, with no
    // transport retry. The circuit closes on that check's success.
    const tryOnce = guard.circuitOpen(host);
    let release;
    try { release = await guard.acquire(host, tryOnce ? 1 : platform.hostConcurrency, { deadlineAt: deadline, signal }); }
    catch (error) { return finish({ error, lookupKind, notCatalogFailure: true }); }
    try {
      const result = await runBookCheck({ entry, library: view, provider, book, bookKey, parsed, ownRecord, lookupKind, editionScope, language, books, attemptedAt,
        budget: { maxRequests: platform.book.maxRequests, deadlineAt: deadline, signal, robots: robotsCheck, minIntervalMs: platform.minIntervalMs,
          gate: gateFor(platform), noRetries: tryOnce } });
      return finish(result, result.profile);
    } finally {
      release();
    }
  }

  // Stored answer for one book, or null. The book page reads this first and
  // resolves the edition profile only when a live check is needed.
  async function storedFor({ library: entry, book = {}, editionScope = 'work' }) {
    const libraryId = entry?.id || entry?.slug;
    // An exact-edition lookup is answered only by that edition (or this
    // library's own record), never by a work-level answer from another ISBN.
    const identities = identitiesFor(libraryId, book).filter(id => editionScope !== 'exact' || id.kind !== 'ol_work');
    return storedAnswer(await recorder.readAnswers(libraryId, identities), askedIdentity(libraryId, book, editionScope));
  }

  // `storedChecked`: the caller already read the stored answer (storedFor).
  async function lookupBook({ library: entry, publicLibrary, book = {}, profile, editionScope = 'work', signal, deadlineAt, storedChecked = false }) {
    const startedAt = now();
    const libraryId = entry?.id || entry?.slug;
    const own = book.recordId && (!book.recordLibraryId || book.recordLibraryId === libraryId);
    const stored = storedChecked ? null : await storedFor({ library: entry, book, editionScope });
    if (stored) return { ...stored, requests: 0, durationMs: now() - startedAt, source: 'stored' };
    const isbn13 = validateAndNormalize(book.isbn13 || '');
    const parsed = own ? { kind: 'catalog', libraryId, recordId: book.recordId } : parsePublicBookKey(book.bookKey || '');
    const lookupKind = own ? (providerFor(entry)?.checkRecordAvailability ? 'catalog_record' : 'verified_work') : isbn13 ? 'exact_isbn' : 'verified_work';
    const books = profile && editionScope === 'work' && !own ? { searchProfile: async () => profile } : null;
    const result = await checkBook({ entry, library: publicLibrary, book: { ...book, isbn13: isbn13 || undefined, title: book.title || '', authors: book.authors || [] },
      bookKey: book.bookKey, parsed, ownRecord: own, lookupKind, editionScope, books, attemptedAt: new Date(startedAt).toISOString(), signal, deadlineAt });
    const { answer } = result;
    return { ...answer, ...(answer.outcome === 'found' && own ? { recordId: book.recordId } : {}),
      requests: result.requests || 0, durationMs: now() - startedAt, source: 'live' };
  }

  function cachedRows(key) {
    const hit = resultsCache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now()) { resultsCache.delete(key); return null; }
    return hit.rows;
  }

  function rememberRows(key, rows) {
    resultsCache.set(key, { rows, expiresAt: now() + RESULTS_CACHE_MS });
    while (resultsCache.size > 200) resultsCache.delete(resultsCache.keys().next().value);
  }

  // Runs `task(operation)` as one catalog operation with the results budget.
  async function withResultsBudget(platform, deadline, signal, task) {
    const controller = new AbortController();
    const forward = () => controller.abort();
    signal?.addEventListener?.('abort', forward, { once: true });
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(coded('Result marking deadline exceeded', 'CATALOG_TIMEOUT')); }, Math.max(0, deadline - now()));
    });
    try {
      const work = withCatalogOperation({ maxRequests: platform.results.maxRequests, signal: controller.signal, robots: robotsCheck,
        minIntervalMs: platform.minIntervalMs, gate: gateFor(platform) }, operation => task(operation, controller.signal));
      work.catch(() => {});
      return await Promise.race([work, expired]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', forward);
      if (signal?.aborted) controller.abort();
    }
  }

  async function* markResults({ library: entry, publicLibrary, query, books = [], signal, deadlineAt }) {
    const startedAt = now();
    const libraryId = entry?.id || entry?.slug;
    const { platform, host, platformName } = settings(entry);
    const list = books.filter(book => book?.bookKey).slice(0, MAX_RESULT_BOOKS);
    const pending = new Map(list.map(book => [book.bookKey, book]));
    const unmatched = [];

    // Stored answers first, in one read for every book: each book with an
    // unexpired answer is done.
    const identityKey = id => `${id.kind}\u0000${id.value}`;
    const identitiesOf = new Map(list.map(book => [book.bookKey, identitiesFor(libraryId, book)]));
    const allIdentities = [...new Map([...identitiesOf.values()].flat().map(id => [identityKey(id), id])).values()];
    const storedRows = allIdentities.length ? await recorder.readAnswers(libraryId, allIdentities) : [];
    for (const book of list) {
      const own = new Set(identitiesOf.get(book.bookKey).map(identityKey));
      const stored = storedAnswer(storedRows.filter(row => own.has(identityKey(row))), askedIdentity(libraryId, book, 'work'));
      if (!stored) continue;
      pending.delete(book.bookKey);
      yield { bookKey: book.bookKey, ...stored, source: 'stored' };
    }
    const strategy = platform?.results.strategy || 'none';
    const provider = pending.size && strategy !== 'none' ? providerFor(entry) : null;
    if (!pending.size || !provider || signal?.aborted || guard.circuitOpen(host)) {
      yield { done: true, notAttempted: [...pending.keys()], unmatched };
      return;
    }
    const finishMarking = guard.tryStartMarking(host);
    if (!finishMarking) {
      yield { done: true, notAttempted: [...pending.keys()], unmatched };
      return;
    }
    const deadline = Math.min(deadlineAt ?? Infinity, startedAt + platform.results.deadlineMs);
    const view = publicView(entry, publicLibrary);
    const attemptedAt = new Date(startedAt).toISOString();
    // A profile that fails, or is not ready by the deadline, means that book
    // cannot be matched (no badge), never "not found".
    const profileOf = async book => { try { return await settleBy(book.profile, deadline, signal, now); } catch { return null; } };
    // Profiles are Open Library reads: start them outside the catalog
    // operation so they never use the catalog's request budget.
    const profiles = new Map([...pending.values()].map(book => [book.bookKey, profileOf(book)]));
    let runAnswer = null;
    // Ends the catalog part of the run: frees the host's marking slot and
    // records the run's health once. Called before any mark is handed out, so
    // a reader who stops reading the marks never holds the slot.
    let ended = false;
    const endRun = () => {
      if (ended) return;
      ended = true;
      finishMarking();
      if (runAnswer) {
        noteHost(host, runAnswer);
        recorder.record({ entry, platform: platformName, host, answer: runAnswer, kind: 'results', durationMs: now() - startedAt, writeAnswers: false });
      }
    };
    try {
      if (strategy === 'search_rows') {
        const search = provider.searchResultRows || provider.searchBookCandidates || provider.searchCatalog;
        const text = String(query || '').trim().slice(0, 160);
        if (!search || !text) {
          endRun();
          yield { done: true, notAttempted: [...pending.keys()], unmatched };
          return;
        }
        const key = `${libraryId}\u0000${normalQuery(text)}`;
        let rows = cachedRows(key);
        if (!rows) {
          try {
            const response = await withResultsBudget(platform, deadline, signal, () => search.call(provider, text));
            rows = Array.isArray(response) ? response : response?.records;
            if (!Array.isArray(rows)) throw coded('Unrecognized catalog search', 'CATALOG_UNRECOGNIZED');
            rememberRows(key, rows);
            try { (await import('node:fs')).writeFileSync(process.env.TMPDBG + '/rows.json', JSON.stringify(rows, null, 1)); } catch {}
            console.log('[tmpdbg] rows', rows.length, 'at', now() - startedAt);
            runAnswer = { outcome: 'checked' };
          } catch (error) {
            runAnswer = couldntCheck(signal?.aborted ? 'cancelled' : reasonForError(error));
            endRun();
            yield { done: true, notAttempted: [...pending.keys()], unmatched };
            return;
          }
        }
        endRun();
        for (const book of [...pending.values()]) {
          const profile = await profiles.get(book.bookKey);
          console.log('[tmpdbg] profile', book.bookKey, 'title', book.title, 'isbns', profile?.isbns?.length ?? null, 'has445605', profile?.isbns?.includes('9780345445605'), 'at', now() - startedAt);
          if (!profile?.isbns?.length) continue;
          for (const row of rows) { const ri = (row.isbns||[]).map(validateAndNormalize).filter(Boolean); if (ri.some(i => profile.isbns.includes(i))) console.log('[tmpdbg]  isbn hit row', row.title, JSON.stringify(matchCatalogRecord(row, profile)), 'titles', JSON.stringify(profile.titles)); }
          let match = null;
          for (const row of rows) {
            const result = matchCatalogRecord(row, profile);
            if (result && ['exact_isbn', 'verified_work'].includes(result.matchKind)) { match = { row, result }; break; }
          }
          pending.delete(book.bookKey);
          if (!match) { unmatched.push(book.bookKey); continue; }
          // A row that shows one of this work's ISBNs, in this library's own
          // scoped search, proves the library lists that edition.
          const catalogUrl = match.row.catalogUrl || match.row.observation?.catalogUrl;
          const answer = { outcome: 'found', evidence: match.result.isbn13 === validateAndNormalize(book.isbn13 || '') ? 'exact_isbn' : 'work_isbn',
            matchedIsbn13: match.result.isbn13, recordId: match.row.recordId, ...(catalogUrl ? { catalogUrl } : {}) };
          recorder.record({ entry, platform: platformName, host, book, profile, answer, kind: 'results', live: false });
          yield { bookKey: book.bookKey, ...answer, source: 'live' };
        }
      } else if (strategy === 'batch_isbn' && provider.checkMany) {
        const plan = [];
        for (const book of pending.values()) {
          const profile = await profiles.get(book.bookKey);
          const own = validateAndNormalize(book.isbn13 || '');
          const isbns = [...new Set([own, ...(profile?.isbns || [])].filter(Boolean))].slice(0, platform.results.isbnsPerBook || 3);
          if (isbns.length) plan.push({ book, profile, isbns });
        }
        const isbns = [...new Set(plan.flatMap(item => item.isbns))];
        // Nothing to ask, or the time went on edition profiles: no catalog
        // request, and not a catalog failure.
        if (!isbns.length || signal?.aborted || deadline <= now()) { endRun(); yield { done: true, notAttempted: [...pending.keys()], unmatched }; return; }
        let answers;
        try {
          answers = await withResultsBudget(platform, deadline, signal, () => provider.checkMany(isbns));
          runAnswer = { outcome: 'checked' };
        } catch (error) {
          runAnswer = couldntCheck(signal?.aborted ? 'cancelled' : reasonForError(error));
          endRun();
          yield { done: true, notAttempted: [...pending.keys()], unmatched };
          return;
        }
        endRun();
        for (const { book, profile, isbns: asked } of plan) {
          const own = validateAndNormalize(book.isbn13 || '');
          let found = null, ownAbsent = false, complete = true;
          for (const isbn of asked) {
            const response = normalizeProviderObservation(answers.get(isbn), { lookupKind: 'exact_isbn', attemptedAt, library: view, entry });
            const answer = answerFromResponse(response);
            if (answer.outcome === 'not_found') {
              // Each ISBN of a batch answer is its own definite answer.
              recorder.record({ entry, platform: platformName, host, book: { isbn13: isbn }, answer: { ...answer, isbn13: isbn }, kind: 'results', live: false });
              if (isbn === own) ownAbsent = true;
            } else if (answer.outcome === 'found' && !found) {
              found = { ...answer, evidence: isbn === own ? 'exact_isbn' : 'work_isbn', matchedIsbn13: isbn };
            } else if (answer.outcome === 'couldnt_check') complete = false;
          }
          pending.delete(book.bookKey);
          if (found) {
            recorder.record({ entry, platform: platformName, host, book, profile, answer: found, kind: 'results', live: false });
            yield { bookKey: book.bookKey, ...found, source: 'live' };
          } else if (ownAbsent && asked.length === 1) {
            yield { bookKey: book.bookKey, outcome: 'not_found', evidence: 'isbn_not_listed', source: 'live' };
          } else if (complete) unmatched.push(book.bookKey);
          else pending.set(book.bookKey, book);
        }
      } else if (strategy === 'per_isbn') {
        const top = [];
        for (const book of pending.values()) {
          const isbn = validateAndNormalize(book.isbn13 || '');
          if (isbn && top.length < (platform.results.topBooks || 3)) top.push({ book, isbn });
        }
        const queue = [...top];
        const settled = [];
        let failure = null;
        try {
          await withResultsBudget(platform, deadline, signal, async () => {
            const worker = async () => {
              while (queue.length) {
                const item = queue.shift();
                try {
                  const observation = await provider.checkAvailability(item.isbn, '', '');
                  settled.push({ ...item, answer: answerFromResponse(normalizeProviderObservation(observation, { lookupKind: 'exact_isbn', attemptedAt, library: view, entry })) });
                } catch (error) {
                  failure ||= error;
                  if (['CATALOG_REQUEST_BUDGET', 'CATALOG_ABORTED'].includes(error?.code)) { queue.length = 0; }
                }
              }
            };
            await Promise.all(Array.from({ length: Math.max(1, platform.results.concurrency || 1) }, worker));
          });
        } catch (error) { failure ||= error; }
        // The run succeeded only if the catalog gave at least one definite
        // answer; unreadable answers are the catalog's failure, not a success.
        const definite = settled.find(item => item.answer.outcome !== 'couldnt_check');
        runAnswer = definite ? { outcome: 'checked' }
          : signal?.aborted ? couldntCheck('cancelled')
          : failure ? couldntCheck(reasonForError(failure))
          : settled[0]?.answer || null;
        endRun();
        for (const { book, answer } of settled) {
          pending.delete(book.bookKey);
          const profile = await profiles.get(book.bookKey);
          if (answer.outcome === 'couldnt_check') { pending.set(book.bookKey, book); continue; }
          recorder.record({ entry, platform: platformName, host, book, profile, answer, kind: 'results', live: false });
          yield { bookKey: book.bookKey, ...answer, source: 'live' };
        }
      }
      endRun();
      yield { done: true, notAttempted: [...pending.keys()], unmatched };
    } finally {
      endRun();
    }
  }

  return Object.freeze({ lookupBook, storedFor, markResults, checkBook,
    enabledFor: entry => lookupV2Enabled(entry, env) });
}

export { answerFromResponse, answerFromCheck, isHealthFailure } from './outcome.js';
export { PLATFORMS, platformFor, hostFor, lookupV2Enabled } from './platforms.js';
export { createLookupRecorder, createMemoryAnswerStore, createMemoryHealthRecord, identitiesFor } from './record.js';
export { createHostGuard } from './budget.js';
