import { REASONS } from '../services/catalog-lookup/outcome.js';

// Daily outcome counts per library (owner decision, 23 November 2026: "the
// log may keep daily counts per library for no-store catalogs: no book, no
// text, no reader"). How the app watches a catalog it may not store anything
// for, without a script (USA plan, section 6): a library's first find is its
// verification date, a run of checks with no find is a parser to review, and
// a rise in "couldn't check" is a vendor change.
//
// One row per UTC day, library, operation, outcome and reason, holding a
// count. There is no column for a book, an ISBN, a work, search text, an
// account, an IP address, a device or a time finer than the day, and
// `outcomeRow` accepts only the four fields below (it throws on any other).
// Every library is counted, so the same signals watch all of them; for a
// library whose answers may be stored these counts say no more than the
// answers already do.
//
// Off unless the anonymous operational log is on (USAGE_LOG_ENABLED). Writes
// run after the response and are dropped, never retried, when the store is
// down. Counts are kept as totals, like the log's daily totals after its
// 12-month roll-up (maintenance.js).

export const OUTCOME_OPERATIONS = Object.freeze(['book_check', 'marks']);
export const COUNTED_OUTCOMES = Object.freeze(['found', 'not_found', 'couldnt_check']);
const OPERATIONS = new Set(OUTCOME_OPERATIONS);
const OUTCOMES = new Set(COUNTED_OUTCOMES);
const ALLOWED_KEYS = new Set(['libraryId', 'operation', 'outcome', 'reason']);
const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_.-]{1,160}$/;

// The outcome a reader's answer counts as (public-v2/holdings.js appAnswer):
// found, not found, or couldn't check with its reason.
export function countedOutcome(answer, reason) {
  if (answer === 'found') return { outcome: 'found', reason: '' };
  if (answer === 'not_found') return { outcome: 'not_found', reason: '' };
  return { outcome: 'couldnt_check', reason: answer === 'unconfirmed' ? 'unconfirmed' : REASONS.includes(reason) ? reason : 'unavailable' };
}

/** Validates and shapes one count; throws on any field outside the four allowed. */
export function outcomeRow(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('An outcome count must be an object');
  for (const key of Object.keys(event)) if (!ALLOWED_KEYS.has(key)) throw new TypeError(`Outcome count field is not permitted: ${key}`);
  if (typeof event.libraryId !== 'string' || !LIBRARY_ID.test(event.libraryId)) throw new TypeError('An outcome count needs a library ID');
  if (!OPERATIONS.has(event.operation)) throw new TypeError('Outcome count operation is not permitted');
  if (!OUTCOMES.has(event.outcome)) throw new TypeError('Outcome is not permitted');
  const reason = event.outcome === 'couldnt_check' ? (REASONS.includes(event.reason) ? event.reason : 'unavailable') : '';
  return Object.freeze({ libraryId: event.libraryId, operation: event.operation, outcome: event.outcome, reason });
}

const UPSERT = `INSERT INTO library_outcome_days AS d (day, library_id, operation, outcome, reason, checks)
  VALUES ((now() AT TIME ZONE 'UTC')::date, $1, $2, $3, $4, 1)
  ON CONFLICT (day, library_id, operation, outcome, reason) DO UPDATE SET checks = d.checks + 1`;

// `sink` receives rows when there is no database (tests only).
export function createOutcomeCounts({ enabled = false, db = null, sink = null, defer = task => task() } = {}) {
  return Object.freeze({
    enabled: Boolean(enabled),
    // Validates synchronously (a programming error throws), then writes later.
    record(event) {
      if (!enabled) return;
      const row = outcomeRow(event);
      defer(async () => {
        try {
          if (db) await db.query(UPSERT, [row.libraryId, row.operation, row.outcome, row.reason], { timeoutMs: 1_000 });
          else if (sink) sink(row);
        } catch { /* Dropped, never retried; the reader never sees it. */ }
      });
    },
  });
}

// Counts per library and outcome over the last `days` days (the owner's
// review: first find, zero-find watch, couldn't-check share). Totals only.
export async function libraryOutcomes(db, { days = 30, libraryId = null } = {}) {
  const { rows } = await db.query(`SELECT library_id, operation, outcome, reason, sum(checks)::int AS checks,
      min(day) AS first_day, max(day) AS last_day
    FROM library_outcome_days WHERE day >= (current_date - $1::int) AND ($2::text IS NULL OR library_id = $2)
    GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`, [days, libraryId]);
  const iso = value => (value instanceof Date ? value.toISOString().slice(0, 10) : value == null ? null : String(value));
  return rows.map(row => ({ libraryId: row.library_id, operation: row.operation, outcome: row.outcome, reason: row.reason || null,
    checks: row.checks, firstDay: iso(row.first_day), lastDay: iso(row.last_day) }));
}
