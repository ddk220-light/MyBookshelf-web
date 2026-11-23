import { flagState, FLAG_WINDOW_MS } from '../services/catalog-lookup/record.js';
import { isHealthFailure } from '../services/catalog-lookup/outcome.js';

// Database-backed health record (plan 4.2, 5.5): the same calls as the lookup
// layer's in-memory record. A failed or timed-out live check inserts one
// `library_check_events` row (library, host, platform, failure class, timing;
// never a book, query, reader or IP) and updates `library_health`. A success
// only updates `library_health` and clears the flag. The flag rule is
// `flagState` in catalog-lookup/record.js, shared with the in-memory record.

const FAILURES = new Set(['timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'configuration']);
const OPERATIONS = new Set(['book_check', 'marks', 'record_read']);
const clip = (value, max) => String(value ?? '').slice(0, max);
const flagReason = state => `${state.attempts} failed attempts on ${state.days} days within 7 days`;

const SUCCESS = `INSERT INTO library_health (library_id, platform, last_success_at, failures_since_success, flagged_at, flag_reason, updated_at)
  VALUES ($1, $2, now(), 0, NULL, NULL, now())
  ON CONFLICT (library_id) DO UPDATE SET platform = EXCLUDED.platform, last_success_at = now(), failures_since_success = 0,
    flagged_at = NULL, flag_reason = NULL, updated_at = now()`;

const FAILURE = `WITH event AS (
    INSERT INTO library_check_events (library_id, host, platform, operation, failure, error_code, duration_ms, requests)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING occurred_at
  )
  INSERT INTO library_health AS h (library_id, platform, last_failure_at, last_failure, failures_since_success, updated_at)
  SELECT $1, $3, occurred_at, $5, 1, now() FROM event
  ON CONFLICT (library_id) DO UPDATE SET platform = EXCLUDED.platform, last_failure_at = EXCLUDED.last_failure_at,
    last_failure = EXCLUDED.last_failure, failures_since_success = h.failures_since_success + 1, updated_at = now()
  RETURNING (extract(epoch FROM h.last_success_at) * 1000)::bigint AS last_success_ms, h.flagged_at IS NOT NULL AS flagged`;

const EVENTS = `SELECT (extract(epoch FROM occurred_at) * 1000)::bigint AS at
  FROM library_check_events
  WHERE library_id = $1 AND occurred_at > now() - make_interval(secs => $2)
  ORDER BY occurred_at`;

export function createPgHealthRecord(db, { now = () => Date.now() } = {}) {
  async function evaluate(libraryId, lastSuccessAt, wasFlagged, at = now()) {
    const { rows } = await db.query(EVENTS, [libraryId, FLAG_WINDOW_MS / 1000]);
    const state = flagState(rows.map(row => ({ at: Number(row.at) })), { lastSuccessAt, at });
    if (state.flagged && !wasFlagged) {
      await db.query('UPDATE library_health SET flagged_at = now(), flag_reason = $2, updated_at = now() WHERE library_id = $1 AND flagged_at IS NULL',
        [libraryId, flagReason(state)]);
    } else if (!state.flagged && wasFlagged) {
      await db.query('UPDATE library_health SET flagged_at = NULL, flag_reason = NULL, updated_at = now() WHERE library_id = $1', [libraryId]);
    }
    return state;
  }

  return Object.freeze({
    async recordOutcome({ libraryId, platform, host, ok, reason, operation = 'book_check', durationMs = 0, requests = 0, errorCode = null }) {
      if (!libraryId) return;
      const platformName = clip(platform || 'unknown', 40);
      if (ok) {
        await db.query(SUCCESS, [clip(libraryId, 200), platformName]);
        return;
      }
      if (!isHealthFailure(reason) || !FAILURES.has(reason)) return;
      const { rows } = await db.query(FAILURE, [clip(libraryId, 200), clip(host || 'unknown', 253), platformName,
        OPERATIONS.has(operation) ? operation : 'book_check', reason, errorCode ? clip(errorCode, 64) : null,
        Math.max(0, Math.round(durationMs || 0)), Math.min(32767, Math.max(0, Math.round(requests || 0)))]);
      const row = rows[0];
      if (row) await evaluate(libraryId, row.last_success_ms == null ? null : Number(row.last_success_ms), row.flagged);
    },
    // Re-runs the flag rule for flagged libraries and libraries with recent
    // failures, so flags age out of the 7-day window. Used by the daily job
    // with the worker role.
    async refreshFlags(at = now()) {
      const { rows } = await db.query(`SELECT library_id, (extract(epoch FROM last_success_at) * 1000)::bigint AS last_success_ms,
          flagged_at IS NOT NULL AS flagged
        FROM library_health
        WHERE flagged_at IS NOT NULL OR last_failure_at > now() - make_interval(secs => $1)`, [FLAG_WINDOW_MS / 1000]);
      let flagged = 0;
      for (const row of rows) {
        const state = await evaluate(row.library_id, row.last_success_ms == null ? null : Number(row.last_success_ms), row.flagged, at);
        if (state.flagged) flagged += 1;
      }
      return { libraries: rows.length, flagged };
    },
    async libraryHealth(libraryId) {
      const { rows } = await db.query(`SELECT h.*, (SELECT count(*) FROM library_check_events e
          WHERE e.library_id = h.library_id AND e.occurred_at > now() - interval '7 days')::int AS failures_week
        FROM library_health h WHERE library_id = $1`, [libraryId]);
      const row = rows[0];
      if (!row) return null;
      return { libraryId: row.library_id, platform: row.platform, lastSuccessAt: row.last_success_at?.getTime() ?? null,
        lastFailureAt: row.last_failure_at?.getTime() ?? null, lastFailure: row.last_failure, failuresSinceSuccess: row.failures_since_success,
        failures7d: row.failures_week, flagged: row.flagged_at != null, flaggedAt: row.flagged_at?.getTime() ?? null,
        flagReason: row.flag_reason, acknowledgedAt: row.acknowledged_at?.getTime() ?? null, ownerNote: row.owner_note };
    },
    async flaggedLibraries() {
      const { rows } = await db.query('SELECT library_id FROM library_health WHERE flagged_at IS NOT NULL ORDER BY flagged_at DESC');
      return rows.map(row => row.library_id);
    },
  });
}
