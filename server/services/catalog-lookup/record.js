import { validateAndNormalize } from '../isbn.js';
import { isHealthFailure } from './outcome.js';
import { linkKind } from './observation.js';
import { parsePublicBookKey } from '../../public-v2/contracts.js';
import { reviewedPolicy } from '../../catalog-store/policy.js';

// What the lookup layer remembers (plan 4.3, 5.5). Three ports; the in-memory
// versions below are used without a database, and server/catalog-store/
// implements the same calls against Postgres:
//
//   answers: readAnswers(libraryId, identities) -> rows
//            writeAnswers(rows)
//   health:  recordOutcome({ libraryId, platform, host, ok, reason, at, operation, durationMs, requests })
//   telemetry: emit(event)   allowlisted counters only (public-v2/telemetry.js)
//
// Every call fails open: a port that throws or is missing never changes what
// the reader sees, and writes are dropped, not retried. Writes run after the
// answer is returned (`defer`; the server passes catalog-store/waitUntil.js).
//
// Identities are a library's own record, an ISBN-13, or an Open Library work
// ID. Never a title, author or normalised title.

// Answers live 30 days (owner decision, 20 November 2026: accuracy is
// knowingly lower under the one library search, so answers are kept a month,
// not 180 days). The few seconds over 30 days are the answer rule's version:
// a stored row whose lifetime (expiry less check time) is not exactly
// ANSWER_TTL_MS was written under another rule and is neither served nor
// kept against a new answer (catalog-store/holdings.js). Version 2, 20
// November 2026: the one library search (libraryBookSearch.js); rows of
// earlier rules (180 days, 180 days + 1 s) are checked again. Change the
// version whenever the meaning of a stored answer changes.
export const ANSWER_RULE_VERSION = 2;
export const ANSWER_TTL_MS = (30 * 24 * 60 * 60 + ANSWER_RULE_VERSION) * 1000;
const WORK_ID = /^OL\d+W$/;

export function identitiesFor(libraryId, book = {}) {
  const identities = [];
  if (book.recordId && (!book.recordLibraryId || book.recordLibraryId === libraryId)) identities.push({ kind: 'catalog_record', value: `${libraryId}:${book.recordId}` });
  const isbn13 = validateAndNormalize(book.isbn13 || '');
  if (isbn13) identities.push({ kind: 'isbn13', value: isbn13 });
  if (WORK_ID.test(book.workId || '')) identities.push({ kind: 'ol_work', value: book.workId });
  return identities;
}

// The identity a definite "not found" may be read from: the one that was asked.
export function askedIdentity(libraryId, book = {}, editionScope = 'work') {
  const identities = identitiesFor(libraryId, book);
  if (editionScope === 'work') return identities.find(id => id.kind === 'ol_work') || identities.find(id => id.kind === 'isbn13') || null;
  return identities.find(id => id.kind === 'isbn13') || null;
}

// A book is found if any identity is found; not found only if the asked
// identity is not found.
export function storedAnswer(rows, asked) {
  const found = rows.find(row => row.answer === 'found');
  if (found) return { outcome: 'found', evidence: found.evidence, ...(found.matchedIsbn13 ? { matchedIsbn13: found.matchedIsbn13 } : {}),
    ...(found.catalogUrl ? { catalogUrl: found.catalogUrl, catalogLinkKind: linkKind(found.catalogLinkKind) } : {}) };
  const negative = asked && rows.find(row => row.answer === 'not_found' && row.kind === asked.kind && row.value === asked.value);
  return negative ? { outcome: 'not_found', evidence: negative.evidence } : null;
}

// Rows to write for one answer (plan 4.3 write rules). `couldnt_check`
// writes nothing. Answers are stored without their row list (the next look
// shows the heading and the catalog link only). A find by the one library
// search's title match (`title_match`) is stored for the book's work and the
// ISBN it was asked by, under the evidence value `catalog_record` (a row of
// the library's own catalog; the values allowed in production, migrations
// 001-004, have no `title_match`). A "not found" from the search
// (`work_no_match`) is stored for the identity that was asked (the work, else
// the ISBN).
export function answerRows({ libraryId, book = {}, answer, profile, now = Date.now() }) {
  if (!answer || !['found', 'not_found'].includes(answer.outcome)) return [];
  const expiresAt = now + ANSWER_TTL_MS;
  const row = (kind, value, extra = {}) => ({ libraryId, kind, value, answer: answer.outcome, evidence: answer.evidence,
    ...(answer.catalogUrl ? { catalogUrl: answer.catalogUrl, catalogLinkKind: linkKind(answer.catalogLinkKind) } : {}), expiresAt, ...extra });
  const isbn13 = validateAndNormalize(book.isbn13 || '');
  const workId = WORK_ID.test(book.workId || '') ? book.workId : null;
  const workIsbns = new Set(profile?.isbns || []);
  const rows = [];
  if (answer.outcome === 'found') {
    if (answer.evidence === 'exact_isbn') {
      const matched = validateAndNormalize(answer.matchedIsbn13 || '') || isbn13;
      if (matched) rows.push(row('isbn13', matched));
      if (workId && matched && workIsbns.has(matched)) rows.push(row('ol_work', workId, { matchedIsbn13: matched }));
    } else if (answer.evidence === 'work_isbn') {
      const matched = validateAndNormalize(answer.matchedIsbn13 || '');
      if (workId && matched) rows.push(row('ol_work', workId, { matchedIsbn13: matched }));
      if (matched) rows.push(row('isbn13', matched));
    } else if (answer.evidence === 'title_match') {
      if (workId) rows.push(row('ol_work', workId, { evidence: 'catalog_record' }));
      if (isbn13) rows.push(row('isbn13', isbn13, { evidence: 'catalog_record' }));
    } else if (answer.evidence === 'catalog_record') {
      const recordId = answer.recordId || book.recordId;
      if (recordId && (!book.recordLibraryId || book.recordLibraryId === libraryId)) rows.push(row('catalog_record', `${libraryId}:${recordId}`));
    }
  } else if (answer.evidence === 'isbn_not_listed') {
    const asked = validateAndNormalize(answer.isbn13 || '') || isbn13;
    if (asked) rows.push(row('isbn13', asked));
  } else if (answer.evidence === 'work_no_match') {
    if (workId) rows.push(row('ol_work', workId));
    else if (isbn13) rows.push(row('isbn13', isbn13));
  }
  return rows;
}

// In-memory answer store, used without a database and in tests. Per instance and bounded; the
// catalog store (catalog-store/holdings.js) implements the same two calls against Postgres.
export function createMemoryAnswerStore({ now = () => Date.now(), maxEntries = 20_000 } = {}) {
  const rows = new Map();
  const key = (libraryId, kind, value) => `${libraryId}\u0000${kind}\u0000${value}`;
  return Object.freeze({
    async readAnswers(libraryId, identities = []) {
      const at = now();
      return identities.flatMap(({ kind, value }) => {
        const entry = rows.get(key(libraryId, kind, value));
        if (!entry) return [];
        if (entry.expiresAt <= at) { rows.delete(key(libraryId, kind, value)); return []; }
        return [entry];
      });
    },
    async writeAnswers(values = []) {
      const at = now();
      for (const value of values) {
        const id = key(value.libraryId, value.kind, value.value);
        const existing = rows.get(id);
        // `found` replaces anything; `not_found` never replaces an unexpired `found`.
        if (existing && existing.expiresAt > at && existing.answer === 'found' && value.answer !== 'found') continue;
        rows.delete(id);
        rows.set(id, Object.freeze({ ...value }));
        while (rows.size > maxEntries) rows.delete(rows.keys().next().value);
      }
    },
    size: () => rows.size,
  });
}

// Health flag rule (plan 5.5 and the owner decision in section 9): flag a
// library after 3 or more failed attempts, at least 30 minutes apart, on at
// least 2 different days, within 7 days, with no success since the first of
// those failures. Clear on the next success.
// "Different days" are UTC calendar days (toISOString below), on every
// instance and in the database-backed record alike.
export const FLAG_MIN_ATTEMPTS = 3;
export const FLAG_MIN_DAYS = 2;
export const FLAG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SEPARATE_ATTEMPT_MS = 30 * 60 * 1000;
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function flagState(failures, { lastSuccessAt = null, at = Date.now() } = {}) {
  const relevant = failures.map(event => event.at)
    .filter(time => at - time <= FLAG_WINDOW_MS && (lastSuccessAt == null || time > lastSuccessAt))
    .sort((a, b) => a - b);
  const attempts = [];
  for (const time of relevant) if (!attempts.length || time - attempts.at(-1) >= SEPARATE_ATTEMPT_MS) attempts.push(time);
  const days = new Set(attempts.map(time => new Date(time).toISOString().slice(0, 10)));
  return { attempts: attempts.length, days: days.size, flagged: attempts.length >= FLAG_MIN_ATTEMPTS && days.size >= FLAG_MIN_DAYS };
}

export function createMemoryHealthRecord({ now = () => Date.now(), maxLibraries = 10_000, maxEventsPerLibrary = 200 } = {}) {
  const libraries = new Map();
  function stateFor(libraryId) {
    let state = libraries.get(libraryId);
    if (!state) {
      state = { libraryId, platform: null, host: null, lastSuccessAt: null, lastFailureAt: null, failuresSinceSuccess: 0,
        events: [], flagged: false, flaggedAt: null, acknowledgedAt: null, ownerNote: null };
      libraries.set(libraryId, state);
      if (libraries.size > maxLibraries) libraries.delete(libraries.keys().next().value);
    }
    return state;
  }
  function evaluate(state, at) {
    const { flagged } = flagState(state.events, { lastSuccessAt: state.lastSuccessAt, at });
    if (flagged && !state.flagged) state.flaggedAt = at;
    if (!flagged) state.flaggedAt = null;
    state.flagged = flagged;
  }
  return Object.freeze({
    async recordOutcome({ libraryId, platform, host, ok, reason, at = now() }) {
      if (!libraryId) return;
      const state = stateFor(libraryId);
      state.platform = platform || state.platform;
      state.host = host || state.host;
      if (ok) {
        state.lastSuccessAt = at;
        state.failuresSinceSuccess = 0;
        state.flagged = false;
        state.flaggedAt = null;
        return;
      }
      if (!isHealthFailure(reason)) return;
      state.lastFailureAt = at;
      state.failuresSinceSuccess += 1;
      state.events.push({ at, reason });
      state.events = state.events.filter(event => at - event.at <= EVENT_RETENTION_MS).slice(-maxEventsPerLibrary);
      evaluate(state, at);
    },
    // The daily job re-runs the rule so flags age out of the 7-day window.
    async refreshFlags(at = now()) {
      for (const state of libraries.values()) evaluate(state, at);
    },
    async libraryHealth(libraryId) {
      const state = libraries.get(libraryId);
      if (!state) return null;
      const at = now();
      const week = state.events.filter(event => at - event.at <= FLAG_WINDOW_MS);
      const byReason = {};
      for (const event of week) byReason[event.reason] = (byReason[event.reason] || 0) + 1;
      const { events, ...rest } = state;
      return { ...rest, failures7d: week.length, failures7dByReason: byReason };
    },
    async flaggedLibraries() {
      return [...libraries.values()].filter(state => state.flagged).map(state => state.libraryId);
    },
  });
}

const defaultDefer = task => { setImmediate(() => { Promise.resolve().then(task).catch(() => {}); }); };

// One structured line per book check, for the platform's runtime log (Vercel
// keeps stdout): what a check did and why it ended as it did, so a test run
// can be diagnosed from the log. It names the library, the catalog host and
// the kind of book key only: never a title, author, query, ISBN, work ID or
// record ID, and never anything about the reader.
export const LIBRARY_CHECK_EVENT = 'library_check';
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const safeCode = value => (typeof value === 'string' && SAFE_CODE.test(value) ? value : null);

export function bookKeyKind(book = {}) {
  if (book.recordId) return 'catalog_record';
  const parsed = parsePublicBookKey(book.bookKey || '');
  if (parsed?.kind === 'catalog') return 'catalog_record';
  if (parsed?.kind === 'isbn') return 'isbn';
  if (parsed?.kind === 'source') return 'work';
  return book.isbn13 ? 'isbn' : 'other';
}

export function libraryCheckEvent({ entry, libraryId, platform, host, book, answer, requests = 0, durationMs = 0, lookupKind, stored = false, afterReply = false } = {}) {
  const id = String(libraryId || entry?.id || entry?.slug || '').slice(0, 120);
  return {
    event: LIBRARY_CHECK_EVENT,
    libraryId: id || null,
    platform: safeCode(platform) || 'unknown',
    host: typeof host === 'string' && /^[A-Za-z0-9.:_-]{1,200}$/.test(host) ? host : null,
    outcome: safeCode(answer?.outcome) || 'unknown',
    reason: safeCode(answer?.reason),
    errorCode: safeCode(answer?.errorCode),
    evidence: safeCode(answer?.evidence),
    requests: Number.isFinite(requests) ? Math.max(0, Math.round(requests)) : 0,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0,
    lookupKind: safeCode(lookupKind),
    stored: Boolean(stored),
    // The check went on after the reader had been answered (plan A2, step 3).
    afterReply: Boolean(afterReply),
    bookKeyKind: bookKeyKind(book),
    // For a find by the library search: the term that produced it ('isbn' or
    // 'title'), and how many catalog rows the answer lists. Never a title or
    // an ISBN.
    foundBy: answer?.outcome === 'found' && ['isbn', 'title'].includes(answer?.foundBy) ? answer.foundBy : null,
    matchCount: answer?.outcome === 'found' && Array.isArray(answer?.matches) ? answer.matches.length : 0,
  };
}

// Under `node --test` (NODE_TEST_CONTEXT) the line is not printed, so test
// output stays readable; tests pass their own `log`.
export function writeLibraryCheckLog(event) {
  if (process.env.NODE_TEST_CONTEXT) return;
  try { console.log(JSON.stringify(event)); } catch { /* A log line never alters a lookup. */ }
}

// The sink the lookup layer writes to. `kind` is 'book' or 'results'.
// `policyFor` is the reviewed catalog policy (catalog-store/policy.js) unless
// a caller passes its own: a library, or a catalog system such as
// BiblioCommons, whose policy says storeAnswers: false is never written to
// the store and never answered from it.
export function createLookupRecorder({ answers = null, health = null, telemetry = null, policyFor = reviewedPolicy.policyFor,
  defer = defaultDefer, now = () => Date.now(), log = writeLibraryCheckLog } = {}) {
  const safely = fn => async (...args) => { try { return await fn(...args); } catch { return undefined; } };

  // A store that is down or slow reads as "nothing stored": the live check runs.
  // A library that asked us not to store answers is never answered from the
  // store, even before the daily job has purged its rows.
  const read = safely(async (libraryId, identities) => (answers && identities.length && policyFor(libraryId)?.storeAnswers !== false
    ? answers.readAnswers(libraryId, identities) : []));
  const readAnswers = async (libraryId, identities) => {
    const rows = await read(libraryId, identities);
    return Array.isArray(rows) ? rows : [];
  };

  function record({ entry, platform, host, book, profile, answer, kind = 'book', durationMs = 0, requests = 0, live = true, writeAnswers = true,
    lookupKind, afterReply = false }) {
    const libraryId = entry?.id || entry?.slug;
    // Every book check that ran (not result marking) writes its log line now,
    // whatever the answer, before the deferred store and health writes.
    if (kind === 'book' && typeof log === 'function') {
      try { log(libraryCheckEvent({ entry, platform, host, book, answer, requests, durationMs, lookupKind, afterReply })); }
      catch { /* A log line never alters a lookup. */ }
    }
    defer(async () => {
      if (writeAnswers && answers && libraryId && policyFor(libraryId)?.storeAnswers !== false) {
        const rows = answerRows({ libraryId, book, answer, profile, now: now() });
        if (rows.length) await safely(() => answers.writeAnswers(rows))();
      }
      if (live && health && libraryId && answer) {
        // `unconfirmed`, `unsupported` and `cancelled` are neither a success
        // nor a failure for the health record.
        const ok = answer.outcome !== 'couldnt_check';
        if (ok || isHealthFailure(answer.reason)) {
          await safely(() => health.recordOutcome({ libraryId, platform, host, ok, reason: answer.reason, at: now(),
            operation: kind === 'results' ? 'marks' : 'book_check', durationMs: Math.max(0, Math.round(durationMs)), requests,
            errorCode: ok ? null : answer.errorCode || null }))();
        }
      }
      if (live && telemetry && answer) {
        try {
          telemetry.emit({ operation: kind === 'results' ? 'catalog_mark' : 'catalog_check', libraryId: String(libraryId || '').slice(0, 120),
            platform: platform || 'unknown', outcome: answer.outcome, ...(answer.reason ? { errorCode: answer.reason } : {}),
            durationMs: Math.max(0, Math.round(durationMs)) });
        } catch { /* Telemetry never alters a lookup. */ }
      }
    });
  }

  // A reader answered from the store: the same line, `stored: true`, no request.
  function logStored({ entry, platform, host, book, answer, durationMs = 0, lookupKind }) {
    if (typeof log !== 'function') return;
    try { log(libraryCheckEvent({ entry, platform, host, book, answer, durationMs, lookupKind, stored: true })); }
    catch { /* A log line never alters a lookup. */ }
  }

  return Object.freeze({ readAnswers, record, logStored });
}
