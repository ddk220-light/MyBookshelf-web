import { validateAndNormalize } from '../isbn.js';
import { isHealthFailure } from './outcome.js';

// What the lookup layer remembers (plan 4.3, 5.5). Three ports, each
// replaceable by the Phase 2 catalog store:
//
//   answers: readAnswers(libraryId, identities) -> rows
//            writeAnswers(rows)
//   health:  recordOutcome({ libraryId, platform, host, ok, reason, at })
//   telemetry: emit(event)   allowlisted counters only (public-v2/telemetry.js)
//
// Every call fails open: a port that throws or is missing never changes what
// the reader sees, and writes are dropped, not retried. Writes run after the
// answer is returned (`defer`; Phase 2 passes Vercel's waitUntil).
//
// Identities are a library's own record, an ISBN-13, or an Open Library work
// ID. Never a title, author or normalised title.

export const ANSWER_TTL_MS = 180 * 24 * 60 * 60 * 1000;
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
    ...(found.catalogUrl ? { catalogUrl: found.catalogUrl } : {}) };
  const negative = asked && rows.find(row => row.answer === 'not_found' && row.kind === asked.kind && row.value === asked.value);
  return negative ? { outcome: 'not_found', evidence: negative.evidence } : null;
}

// Rows to write for one answer (plan 4.3 write rules). `couldnt_check` and
// title-only matches write nothing.
export function answerRows({ libraryId, book = {}, answer, profile, now = Date.now() }) {
  if (!answer || !['found', 'not_found'].includes(answer.outcome)) return [];
  const expiresAt = now + ANSWER_TTL_MS;
  const row = (kind, value, extra = {}) => ({ libraryId, kind, value, answer: answer.outcome, evidence: answer.evidence,
    ...(answer.catalogUrl ? { catalogUrl: answer.catalogUrl } : {}), expiresAt, ...extra });
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
    } else if (answer.evidence === 'catalog_record') {
      const recordId = answer.recordId || book.recordId;
      if (recordId && (!book.recordLibraryId || book.recordLibraryId === libraryId)) rows.push(row('catalog_record', `${libraryId}:${recordId}`));
    }
  } else if (answer.evidence === 'isbn_not_listed') {
    const asked = validateAndNormalize(answer.isbn13 || '') || isbn13;
    if (asked) rows.push(row('isbn13', asked));
  } else if (answer.evidence === 'work_no_match' && workId) {
    rows.push(row('ol_work', workId));
  }
  return rows;
}

// In-memory answer store for Phase 1 and tests. Per instance and bounded; the
// Phase 2 store implements the same two calls against Postgres.
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

// The sink the lookup layer writes to. `kind` is 'book' or 'results'.
export function createLookupRecorder({ answers = null, health = null, telemetry = null, policyFor = () => ({ storeAnswers: true }),
  defer = defaultDefer, now = () => Date.now() } = {}) {
  const safely = fn => async (...args) => { try { return await fn(...args); } catch { return undefined; } };

  // A store that is down or slow reads as "nothing stored": the live check runs.
  const read = safely(async (libraryId, identities) => (answers && identities.length ? answers.readAnswers(libraryId, identities) : []));
  const readAnswers = async (libraryId, identities) => {
    const rows = await read(libraryId, identities);
    return Array.isArray(rows) ? rows : [];
  };

  function record({ entry, platform, host, book, profile, answer, kind = 'book', durationMs = 0, live = true, writeAnswers = true }) {
    const libraryId = entry?.id || entry?.slug;
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
          await safely(() => health.recordOutcome({ libraryId, platform, host, ok, reason: answer.reason, at: now() }))();
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

  return Object.freeze({ readAnswers, record });
}
