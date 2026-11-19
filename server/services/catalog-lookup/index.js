import { getProvider, withProviderRouteExecution } from '../providers/index.js';
import { catalogOperation, withCatalogOperation, withCatalogSuboperation } from '../providers/http.js';
import { createRobotsPolicy } from '../providers/robots.js';
import { matchCatalogRecord } from '../libraryBookSearch.js';
import { validateAndNormalize } from '../isbn.js';
import { parsePublicBookKey } from '../../public-v2/contracts.js';
import { runBookCheck } from './check.js';
import { linkKind, normalizeProviderObservation } from './observation.js';
import { answerFromCheck, answerFromResponse, couldntCheck, couldntCheckFor, isHealthFailure } from './outcome.js';
import { PLATFORMS, platformFor, hostFor, bookDeadlineMs, backgroundDeadlineMs, lookupV2Enabled } from './platforms.js';
import { createHostGuard } from './budget.js';
import { createLookupRecorder, createMemoryHealthRecord, identitiesFor, askedIdentity, storedAnswer } from './record.js';
import { createMemoryHostGate } from '../../catalog-store/hostGate.js';

// The catalog lookup layer (plan section 5). Two entry points:
//
//   lookupBook({ library, book, profile?, editionScope?, signal, deadlineAt, background? })
//     "does library X have book Y" -> found | not_found | couldnt_check
//   markResults({ library, query, books, signal, deadlineAt })
//     async iterable of { bookKey, outcome, ... } as answers arrive, then
//     { done: true, notAttempted, unmatched, failed }
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
    // Always consume work's rejection, even if its synchronous setup already
    // cancelled the caller before we install the deadline listener.
    Promise.resolve(promise).then(value => done(resolve, value), error => done(reject, error));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    if (Number.isFinite(deadlineAt)) timer = setTimeout(() => done(reject, coded('Edition details took too long', 'CATALOG_TIMEOUT')), Math.max(0, deadlineAt - clock()));
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
  // Keeps a book-page check alive after the reader's answer (the server
  // passes catalog-store/waitUntil.js). Without it no check continues.
  defer = null,
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
  function gateFor(platform, operationDeadline = Infinity) {
    if (!hostGate) return null;
    return (requestHost, { spacingMs = 0, deadlineAt, signal } = {}) => hostGate.reserve(requestHost,
      { spacingMs: Math.max(spacingMs || 0, platform?.minIntervalMs || 0), perMinute: platform?.perMinute || 0,
        deadlineAt: Math.min(deadlineAt ?? Infinity, operationDeadline), signal });
  }

  function noteHost(host, answer) {
    if (answer.outcome !== 'couldnt_check') guard.recordSuccess(host);
    else if (isHealthFailure(answer.reason)) guard.recordFailure(host);
  }

  // Alternate catalogs remain one institution and retain their public record
  // keys. Only execution policy follows the route actually being called. A
  // child HTTP operation adds that route's cap without resetting the reader's
  // aggregate request budget, deadline, robots policy or cancellation signal.
  function routeSession({ entry, deadline, signal, kind = 'book', health = true }) {
    const events = [];
    const allowances = new Map();
    let finished = false;
    function observed(route, value) {
      if (route.method === 'checkMany' && value instanceof Map) return { outcome: 'checked' };
      if (route.method === 'searchCatalog' || route.method === 'searchResultRows' || route.method === 'searchBookCandidates') {
        return Array.isArray(value) || Array.isArray(value?.records) ? { outcome: 'checked' } : couldntCheck('unrecognized');
      }
      const observation = route.method === 'resolveCatalogRecord' ? value?.observation : value;
      if (!observation) return couldntCheck('unconfirmed');
      try {
        return answerFromResponse(normalizeProviderObservation(observation, {
          lookupKind: route.method === 'resolveCatalogRecord' ? (observation.matchKind === 'catalog_record' ? 'catalog_record' : 'verified_work')
            : route.method === 'checkRecordAvailability' ? 'catalog_record' : 'exact_isbn',
          attemptedAt: new Date(now()).toISOString(), library: publicView(route.entry), entry: route.entry,
        }));
      } catch { return couldntCheck('unrecognized'); }
    }
    async function execute(route, task) {
      const { platform, host, platformName } = settings(route.entry);
      const policy = platform?.[kind];
      if (!policy || !(policy.maxRequests > 0)) throw coded('This catalog route does not support this operation', 'CATALOG_UNSUPPORTED');
      const parentSignal = catalogOperation()?.signal || signal;
      if (parentSignal?.aborted) throw coded('Catalog check was cancelled', 'CATALOG_ABORTED');
      const allowanceKey = `${route.prefix || ''}\u0000${platformName}\u0000${host}`;
      if (!allowances.has(allowanceKey)) allowances.set(allowanceKey, { requests: 0,
        deadline: Math.min(deadline, now() + (kind === 'book' ? bookDeadlineMs(route.entry, platform) : policy.deadlineMs)) });
      const allowance = allowances.get(allowanceKey);
      const routeDeadline = allowance.deadline;
      if (allowance.requests >= policy.maxRequests) throw coded('Catalog route request budget exhausted', 'CATALOG_REQUEST_BUDGET');
      if (now() >= routeDeadline) throw coded('Catalog route deadline exceeded', 'CATALOG_TIMEOUT');
      const hostSlot = gateFor(platform, routeDeadline);
      const routeGate = async (requestHost, options) => {
        if (allowance.requests >= policy.maxRequests) throw coded('Catalog route request budget exhausted', 'CATALOG_REQUEST_BUDGET');
        await hostSlot?.(requestHost, options);
        // Several provider methods may use the same route concurrently. The
        // second check and increment happen together after the awaited slot.
        if (allowance.requests >= policy.maxRequests) throw coded('Catalog route request budget exhausted', 'CATALOG_REQUEST_BUDGET');
        allowance.requests += 1;
      };
      const event = { route, host, platformName, started: false, answer: null };
      events.push(event);
      const tryOnce = guard.circuitOpen(host);
      let release;
      try {
        if (kind === 'results') {
          if (tryOnce || !(release = guard.tryStartMarking(host))) throw coded('This catalog is busy', 'CATALOG_HOST_BUSY');
        } else {
          release = await guard.acquire(host, tryOnce ? 1 : platform.hostConcurrency, { deadlineAt: routeDeadline, signal: parentSignal });
        }
      } catch (error) {
        // Waiting for our own slot is not a failed catalog request.
        event.answer = couldntCheckFor(error);
        throw error;
      }
      const controller = new AbortController();
      const forward = () => controller.abort();
      parentSignal?.addEventListener?.('abort', forward, { once: true });
      try {
        if (parentSignal?.aborted) throw coded('Catalog check was cancelled', 'CATALOG_ABORTED');
        event.started = true;
        const work = withCatalogSuboperation({ maxRequests: policy.maxRequests, signal: controller.signal,
          minIntervalMs: platform.minIntervalMs || 0, gate: routeGate, noRetries: tryOnce }, task);
        const value = await settleBy(work, routeDeadline, parentSignal, now);
        event.value = value;
        event.answer = observed(route, value);
        return value;
      } catch (error) {
        event.answer = couldntCheckFor(error);
        throw error;
      } finally {
        // A route timeout may be followed by the next catalog. Stop the old
        // route before releasing its slot or allowing that fallback to start.
        controller.abort();
        parentSignal?.removeEventListener?.('abort', forward);
        release();
      }
    }
    function finish(answer, { profile } = {}) {
      const attempted = events.filter(event => event.started);
      const proved = attempted.filter(event => {
        if (event.answer?.outcome === 'found') return true;
        if (answer?.outcome !== 'found' || !profile) return false;
        const rows = Array.isArray(event.value) ? event.value : event.value?.records;
        return Array.isArray(rows) && rows.some(row => {
          const match = matchCatalogRecord(row, profile);
          if (!match || !['exact_isbn', 'verified_work'].includes(match.matchKind) || !row.observation
              || (answer.matchedIsbn13 && match.isbn13 !== answer.matchedIsbn13)) return false;
          return observed({ ...event.route, method: 'checkAvailability' }, {
            ...row.observation, matchKind: match.matchKind, recognizedExact: true,
          }).outcome === 'found';
        });
      });
      const outcomeFor = event => {
        if (answer?.outcome === 'found' && proved.includes(event)) return answer;
        return !event.answer || (event.answer.reason === 'cancelled' && answer?.reason === 'timeout') ? answer : event.answer;
      };
      // Parallel ISBN/title recovery still records at most one host outcome
      // for this reader operation, rather than opening a circuit in one read.
      if (!finished && health) {
        const hosts = new Map();
        for (const event of attempted) {
          const outcome = outcomeFor(event);
          if (!outcome) continue;
          const previous = hosts.get(event.host);
          const rank = value => ['found', 'not_found'].includes(value?.outcome) ? 3
            : isHealthFailure(value?.reason) ? 2 : value?.outcome === 'checked' ? 1 : 0;
          if (!previous || rank(outcome) > rank(previous)) hosts.set(event.host, outcome);
        }
        for (const [host, outcome] of hosts) noteHost(host, outcome);
      }
      finished = true;
      const matching = [...attempted].reverse().find(event => outcomeFor(event)?.outcome === answer?.outcome
        && (answer?.outcome !== 'couldnt_check' || outcomeFor(event)?.reason === answer?.reason));
      const normalizedUrl = value => { try { return value ? new URL(value).href : null; } catch { return null; } };
      const answerUrl = normalizedUrl(answer?.catalogUrl);
      const matchingProof = answerUrl && proved.find(event => {
        const value = event.value, rows = Array.isArray(value) ? value : value?.records || [];
        return [value?.catalogUrl, value?.url, value?.observation?.catalogUrl,
          ...rows.flatMap(row => [row.catalogUrl, row.observation?.catalogUrl])].some(url => normalizedUrl(url) === answerUrl);
      });
      const attribution = (answer?.outcome === 'found' ? matchingProof || proved[0] : null) || matching || attempted.at(-1);
      return { live: attempted.length > 0, ...(attribution ? { host: attribution.host, platformName: attribution.platformName } : {}) };
    }
    return { execute, finish };
  }

  // One live book check through the platform's book-page budget. Used by
  // lookupBook and by /availability on the new path. Returns the raw check
  // result (response or error) plus the projected answer.
  //
  // `background` (the book page, plan A2 step 3): the reader is answered at
  // the usual deadline, "couldn't check" as before, unless a proven match is
  // already in hand. The same check, with the same request cap, then carries
  // on under the platform's waitUntil (`defer`) until its own longer deadline
  // (backgroundDeadlineMs) and records its answer through the recorder, so
  // the next look finds it stored. Once started, it is not cancelled by the
  // reader leaving. Only found and not found are ever stored; a check that
  // still fails is recorded in the health record, never as an answer.
  async function checkBook({ entry, library, provider: given, book, bookKey, parsed, ownRecord, lookupKind, editionScope = 'work', language, books,
    attemptedAt, signal, deadlineAt, background = false }) {
    const startedAt = now();
    const provider = given || providerFor(entry);
    const routed = Boolean(provider?.catalogRoutes?.length);
    let policyEntry = entry, routeError;
    if (routed && ownRecord) {
      try {
        const route = provider.catalogRouteForRecord(parsed?.recordId);
        policyEntry = route.entry;
        lookupKind = route.hasRecordAvailability ? 'catalog_record' : 'verified_work';
      }
      catch (error) { routeError = error; }
    }
    const { platform, host, platformName } = settings(policyEntry);
    let routes;
    const view = publicView(entry, library);
    const finish = (result, profile) => {
      const answer = answerFromCheck(result, { profile, recordId: ownRecord ? parsed?.recordId : undefined });
      // An edition profile (Open Library) that failed or was too slow, or a
      // wait for one of this instance's own host slots, is not the catalog's
      // failure: it neither opens the circuit nor counts in the health record.
      const routeResult = routes?.finish(answer, { profile });
      if (!routes && !result.notCatalogFailure) noteHost(host, answer);
      recorder.record({ entry, platform: routeResult?.platformName || platformName, host: routeResult?.host || host,
        book: ownRecord ? { ...book, recordId: parsed?.recordId, recordLibraryId: entry.id } : book,
        profile, answer, kind: 'book', durationMs: now() - startedAt, requests: result.requests || 0,
        live: !result.notCatalogFailure && (routeResult?.live ?? true) });
      return { ...result, answer, durationMs: now() - startedAt, requests: result.requests || 0 };
    };
    if (routeError) return finish({ error: routeError, lookupKind, notCatalogFailure: true });
    if (!platform || !provider?.checkAvailability) return finish({ error: coded('Catalog lookups are not available for this library', 'CATALOG_UNSUPPORTED'), lookupKind });
    // The reader's answer is due by `answerBy`. A background check works on
    // until `deadline`, later; otherwise both are the same moment.
    const answerBy = Math.min(deadlineAt ?? Infinity, startedAt + bookDeadlineMs(policyEntry, platform));
    const inBackground = Boolean(background && typeof defer === 'function');
    const deadline = inBackground ? Math.max(answerBy, startedAt + backgroundDeadlineMs(policyEntry, platform)) : answerBy;
    // A started background check is not cancelled by the reader leaving.
    const workSignal = inBackground ? null : signal;
    if (routed) routes = routeSession({ entry, deadline, signal: workSignal });
    // Resolve the edition profile before taking a host slot, and only within
    // the check's deadline: waiting on Open Library must not hold a catalog
    // slot or use up the catalog's time.
    if (!ownRecord && editionScope === 'work' && typeof books?.searchProfile === 'function') {
      let profile;
      try { profile = await settleBy(books.searchProfile(bookKey, { editionScope, language }), answerBy, signal, now); }
      catch (error) { return finish({ error, lookupKind, notCatalogFailure: true }); }
      books = { searchProfile: async () => profile };
    }
    // While the host's circuit is open (plan 5.4) result marking skips the
    // host, and the book page tries once: one check at a time for that host
    // on this instance, and each catalog request is sent once, with no
    // transport retry. The circuit closes on that check's success.
    const tryOnce = !routed && guard.circuitOpen(host);
    let release;
    try { release = routed ? () => {} : await guard.acquire(host, tryOnce ? 1 : platform.hostConcurrency, { deadlineAt: answerBy, signal }); }
    catch (error) { return finish({ error, lookupKind, notCatalogFailure: true }); }
    // Shared with the work search: its best proven match so far, and a way to
    // end the check with it when the reader's answer is due.
    const progress = {};
    const conclude = new AbortController();
    const work = (async () => {
      try {
        const run = () => runBookCheck({ entry, library: view, provider, book, bookKey, parsed, ownRecord, lookupKind, editionScope, language, books, attemptedAt,
          budget: { maxRequests: platform.book.maxRequests, deadlineAt: deadline, signal: workSignal, robots: robotsCheck, minIntervalMs: platform.minIntervalMs,
            gate: gateFor(platform, deadline), noRetries: tryOnce, progress, conclude: conclude.signal } });
        const result = await (routes ? withProviderRouteExecution(routes.execute, run) : run());
        return finish(result, result.profile);
      } finally {
        release();
      }
    })();
    if (!inBackground) return work;
    work.catch(() => {});
    const due = await untilDue(work, answerBy, signal);
    if (due === 'settled') return work;
    if (due === 'due' && progress.best) {
      // A proven match is in hand: that is the answer now, and the check ends.
      conclude.abort();
      return work;
    }
    // The reader is answered now; the same check finishes in the background,
    // within its own deadline and request cap, and records what it finds.
    defer(() => work);
    const error = due === 'left' ? coded('Catalog check was cancelled', 'CATALOG_ABORTED') : coded('Catalog check deadline exceeded', 'CATALOG_TIMEOUT');
    return { error, lookupKind, answer: couldntCheckFor(error), durationMs: now() - startedAt, requests: 0, continuing: true };
  }

  // 'settled' when `work` ends first, 'due' at `at`, 'left' when the reader's
  // signal aborts. Never rejects.
  function untilDue(work, at, signal) {
    return new Promise(resolve => {
      let timer;
      const done = value => { clearTimeout(timer); signal?.removeEventListener?.('abort', onLeave); resolve(value); };
      const onLeave = () => done('left');
      work.then(() => done('settled'), () => done('settled'));
      if (signal?.aborted) return onLeave();
      signal?.addEventListener?.('abort', onLeave, { once: true });
      timer = setTimeout(() => done('due'), Math.max(0, at - now()));
    });
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
  // `background`: a check still running at its deadline finishes after the
  // answer and stores what it finds (checkBook); the book page sets it.
  async function lookupBook({ library: entry, publicLibrary, book = {}, profile, editionScope = 'work', signal, deadlineAt, storedChecked = false,
    background = false }) {
    const startedAt = now();
    const libraryId = entry?.id || entry?.slug;
    const own = book.recordId && (!book.recordLibraryId || book.recordLibraryId === libraryId);
    const stored = storedChecked ? null : await storedFor({ library: entry, book, editionScope });
    if (stored) return { ...stored, requests: 0, durationMs: now() - startedAt, source: 'stored' };
    const isbn13 = validateAndNormalize(book.isbn13 || '');
    const parsed = own ? { kind: 'catalog', libraryId, recordId: book.recordId } : parsePublicBookKey(book.bookKey || '');
    // A provider whose record IDs are reverified title/author identities
    // (Visakhapatnam) proves that identity, not a numbered catalog record.
    const ownProvider = own ? providerFor(entry) : null;
    const lookupKind = own ? (ownProvider?.recordLookupKind === 'title_author' ? 'title_author'
      : ownProvider?.checkRecordAvailability ? 'catalog_record' : 'verified_work') : isbn13 ? 'exact_isbn' : 'verified_work';
    const books = profile && editionScope === 'work' && !own ? { searchProfile: async () => profile } : null;
    const result = await checkBook({ entry, library: publicLibrary, book: { ...book, isbn13: isbn13 || undefined, title: book.title || '', authors: book.authors || [] },
      bookKey: book.bookKey, parsed, ownRecord: own, lookupKind, editionScope, books, attemptedAt: new Date(startedAt).toISOString(), signal, deadlineAt, background });
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
  async function withResultsBudget(platform, deadline, signal, task, routes = null) {
    const controller = new AbortController();
    const forward = () => controller.abort();
    signal?.addEventListener?.('abort', forward, { once: true });
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(coded('Result marking deadline exceeded', 'CATALOG_TIMEOUT')); }, Math.max(0, deadline - now()));
    });
    try {
      const work = withCatalogOperation({ maxRequests: platform.results.maxRequests, signal: controller.signal, robots: robotsCheck,
        minIntervalMs: platform.minIntervalMs, gate: gateFor(platform, deadline) }, operation => routes
        ? withProviderRouteExecution(routes.execute, () => task(operation, controller.signal)) : task(operation, controller.signal));
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
    // Books this run asked the catalog about without a usable answer (the
    // search failed or ran out of time, an ISBN answer could not be read):
    // "couldn't check", never "not found". A row that did not match is in
    // `unmatched`, a book never asked about in `notAttempted`; a cancelled
    // run (the reader left) fails no book.
    const failed = new Set();
    const failedFor = (answer, keys) => {
      if (answer?.outcome !== 'couldnt_check' || ['cancelled', 'unsupported', 'unconfirmed'].includes(answer.reason)) return;
      for (const key of keys) failed.add(key);
    };
    const doneItem = () => ({ done: true, notAttempted: [...pending.keys()].filter(key => !failed.has(key)), unmatched, failed: [...failed] });

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
    const adapter = pending.size && strategy !== 'none' ? providerFor(entry) : null;
    // An adapter can opt out of result marking (rows that cannot prove this
    // library's holding): no request, every book not attempted.
    const provider = adapter?.resultMarking === false ? null : adapter;
    const routed = Boolean(provider?.catalogRoutes?.length);
    if (!pending.size || !provider || signal?.aborted || (!routed && guard.circuitOpen(host))) {
      yield doneItem();
      return;
    }
    const finishMarking = routed ? () => {} : guard.tryStartMarking(host);
    if (!finishMarking) {
      yield doneItem();
      return;
    }
    const deadline = Math.min(deadlineAt ?? Infinity, startedAt + platform.results.deadlineMs);
    const routes = routed ? routeSession({ entry, deadline, signal, kind: 'results' }) : null;
    const view = publicView(entry, publicLibrary);
    const attemptedAt = new Date(startedAt).toISOString();
    // A profile that fails, or is not ready by the deadline, means that book
    // cannot be matched (no badge), never "not found". Profiles are Open
    // Library reads, paced across the process (a few at a time), so nine of
    // them take a few seconds: they wait until the run's own deadline (the
    // response cap), not the catalog's. The catalog part of the run, and its
    // host slot, has ended by then.
    const profileDeadline = Number.isFinite(deadlineAt) ? deadlineAt : deadline;
    const profileOf = async book => { try { return await settleBy(book.profile, profileDeadline, signal, now); } catch { return null; } };
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
        const routeResult = routes?.finish(runAnswer);
        if (!routes) noteHost(host, runAnswer);
        recorder.record({ entry, platform: routeResult?.platformName || platformName, host: routeResult?.host || host,
          answer: runAnswer, kind: 'results', durationMs: now() - startedAt, writeAnswers: false, live: routeResult?.live ?? true });
      }
    };
    try {
      if (strategy === 'search_rows') {
        const search = provider.searchResultRows || provider.searchBookCandidates || provider.searchCatalog;
        const text = String(query || '').trim().slice(0, 160);
        if (!search || !text) {
          endRun();
          yield doneItem();
          return;
        }
        const key = `${libraryId}\u0000${normalQuery(text)}`;
        let rows = cachedRows(key);
        if (!rows) {
          try {
            const response = await withResultsBudget(platform, deadline, signal, () => search.call(provider, text), routes);
            rows = Array.isArray(response) ? response : response?.records;
            if (!Array.isArray(rows)) throw coded('Unrecognized catalog search', 'CATALOG_UNRECOGNIZED');
            rememberRows(key, rows);
            runAnswer = { outcome: 'checked' };
          } catch (error) {
            runAnswer = signal?.aborted ? couldntCheck('cancelled') : couldntCheckFor(error);
            endRun();
            failedFor(runAnswer, pending.keys());
            yield doneItem();
            return;
          }
        }
        endRun();
        for (const book of [...pending.values()]) {
          const profile = await profiles.get(book.bookKey);
          if (!profile?.isbns?.length) continue;
          let match = null;
          for (const row of rows) {
            const result = matchCatalogRecord(row, profile);
            if (result && ['exact_isbn', 'verified_work'].includes(result.matchKind)) { match = { row, result }; break; }
          }
          pending.delete(book.bookKey);
          if (!match) { unmatched.push(book.bookKey); continue; }
          // A row that shows one of this work's ISBNs, in this library's own
          // scoped search, proves the library lists that edition.
          // The link is the book's record only when the adapter said so.
          const catalogUrl = match.row.catalogUrl || match.row.observation?.catalogUrl;
          const catalogLinkKind = linkKind(match.row.catalogUrl ? match.row.catalogLinkKind : match.row.observation?.catalogLinkKind);
          const answer = { outcome: 'found', evidence: match.result.isbn13 === validateAndNormalize(book.isbn13 || '') ? 'exact_isbn' : 'work_isbn',
            matchedIsbn13: match.result.isbn13, recordId: match.row.recordId, ...(catalogUrl ? { catalogUrl, catalogLinkKind } : {}) };
          recorder.record({ entry, platform: platformName, host, book, profile, answer, kind: 'results', live: false });
          yield { bookKey: book.bookKey, ...answer, source: 'live' };
        }
      } else if (strategy === 'batch_isbn' && provider.checkMany) {
        const plan = [];
        for (const book of pending.values()) {
          // The batch request needs its ISBNs first: wait only within the
          // catalog's deadline here.
          const profile = await settleBy(profiles.get(book.bookKey), deadline, signal, now).catch(() => null);
          const own = validateAndNormalize(book.isbn13 || '');
          const isbns = [...new Set([own, ...(profile?.isbns || [])].filter(Boolean))].slice(0, platform.results.isbnsPerBook || 3);
          if (isbns.length) plan.push({ book, profile, isbns });
        }
        const isbns = [...new Set(plan.flatMap(item => item.isbns))];
        // Nothing to ask, or the time went on edition profiles: no catalog
        // request, and not a catalog failure.
        if (!isbns.length || signal?.aborted || deadline <= now()) { endRun(); yield doneItem(); return; }
        let answers;
        try {
          answers = await withResultsBudget(platform, deadline, signal, () => provider.checkMany(isbns), routes);
          runAnswer = { outcome: 'checked' };
        } catch (error) {
          runAnswer = signal?.aborted ? couldntCheck('cancelled') : couldntCheckFor(error);
          endRun();
          failedFor(runAnswer, plan.map(item => item.book.bookKey));
          yield doneItem();
          return;
        }
        endRun();
        for (const { book, profile, isbns: asked } of plan) {
          const own = validateAndNormalize(book.isbn13 || '');
          let found = null, ownAbsent = false, complete = true, incomplete = null;
          for (const isbn of asked) {
            const response = normalizeProviderObservation(answers.get(isbn), { lookupKind: 'exact_isbn', attemptedAt, library: view, entry });
            const answer = answerFromResponse(response);
            if (answer.outcome === 'not_found') {
              // Each ISBN of a batch answer is its own definite answer.
              recorder.record({ entry, platform: platformName, host, book: { isbn13: isbn }, answer: { ...answer, isbn13: isbn }, kind: 'results', live: false });
              if (isbn === own) ownAbsent = true;
            } else if (answer.outcome === 'found' && !found) {
              found = { ...answer, evidence: isbn === own ? 'exact_isbn' : 'work_isbn', matchedIsbn13: isbn };
            } else if (answer.outcome === 'couldnt_check') { complete = false; incomplete = answer; }
          }
          pending.delete(book.bookKey);
          if (found) {
            recorder.record({ entry, platform: platformName, host, book, profile, answer: found, kind: 'results', live: false });
            yield { bookKey: book.bookKey, ...found, source: 'live' };
          } else if (ownAbsent && asked.length === 1) {
            yield { bookKey: book.bookKey, outcome: 'not_found', evidence: 'isbn_not_listed', source: 'live' };
          } else if (complete) unmatched.push(book.bookKey);
          else { pending.set(book.bookKey, book); failedFor(incomplete, [book.bookKey]); }
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
          }, routes);
        } catch (error) { failure ||= error; }
        // The run succeeded only if the catalog gave at least one definite
        // answer; unreadable answers are the catalog's failure, not a success.
        const definite = settled.find(item => item.answer.outcome !== 'couldnt_check');
        runAnswer = definite ? { outcome: 'checked' }
          : signal?.aborted ? couldntCheck('cancelled')
          : failure ? couldntCheckFor(failure)
          : settled[0]?.answer || null;
        endRun();
        // Books asked about whose answer never came: the run's failure.
        const unanswered = top.filter(item => !settled.some(done => done.book === item.book)).map(item => item.book.bookKey);
        failedFor(signal?.aborted ? couldntCheck('cancelled') : failure ? couldntCheckFor(failure) : null, unanswered);
        for (const { book, answer } of settled) {
          pending.delete(book.bookKey);
          const profile = await profiles.get(book.bookKey);
          if (answer.outcome === 'couldnt_check') { pending.set(book.bookKey, book); failedFor(answer, [book.bookKey]); continue; }
          recorder.record({ entry, platform: platformName, host, book, profile, answer, kind: 'results', live: false });
          yield { bookKey: book.bookKey, ...answer, source: 'live' };
        }
      }
      endRun();
      yield doneItem();
    } finally {
      endRun();
    }
  }

  // Reading one of this library's own catalog records (a record key's title,
  // authors and ISBN) takes the same host slot, spacing and request cap as a
  // book check on its platform. `read` performs the provider request(s).
  // Fails with CATALOG_UNSUPPORTED when the library has no catalog adapter.
  async function readRecord({ library: entry, recordId, read, signal }) {
    const provider = providerFor(entry);
    const routed = Boolean(provider?.catalogRoutes?.length);
    const policyEntry = routed && recordId ? provider.catalogRouteForRecord(recordId).entry : entry;
    const { platform, host } = settings(policyEntry);
    if (!platform || !host) throw coded('Catalog lookups are not available for this library', 'CATALOG_UNSUPPORTED');
    const deadline = now() + bookDeadlineMs(policyEntry, platform);
    const routes = routed ? routeSession({ entry, deadline, signal, health: false }) : null;
    const tryOnce = !routed && guard.circuitOpen(host);
    const release = routed ? () => {} : await guard.acquire(host, tryOnce ? 1 : platform.hostConcurrency, { deadlineAt: deadline, signal });
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    signal?.addEventListener?.('abort', forwardAbort, { once: true });
    try {
      if (signal?.aborted) throw coded('Catalog check was cancelled', 'CATALOG_ABORTED');
      const work = withCatalogOperation({ maxRequests: platform.book.maxRequests, signal: controller.signal, robots: robotsCheck,
        minIntervalMs: platform.minIntervalMs || 0, gate: gateFor(platform, deadline), noRetries: tryOnce }, () => routes
        ? withProviderRouteExecution(routes.execute, read) : read());
      return await settleBy(work, deadline, signal, now);
    } finally {
      // A metadata deadline must stop the provider too. Otherwise the rejected
      // read can continue making requests after its host slot is released.
      controller.abort();
      signal?.removeEventListener?.('abort', forwardAbort);
      release();
    }
  }

  return Object.freeze({ lookupBook, storedFor, markResults, checkBook, readRecord,
    enabledFor: entry => lookupV2Enabled(entry, env) });
}

export { answerFromResponse, answerFromCheck, isHealthFailure } from './outcome.js';
export { PLATFORMS, platformFor, hostFor, lookupV2Enabled } from './platforms.js';
export { createLookupRecorder, createMemoryAnswerStore, createMemoryHealthRecord, identitiesFor } from './record.js';
export { createHostGuard } from './budget.js';
