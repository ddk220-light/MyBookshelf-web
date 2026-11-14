import { validateAndNormalize } from '../services/isbn.js';

// The anonymous operational log (plan 4.6.2). This is the only place search
// text is stored. It has no account ID, IP address, device identifier,
// session, cookie, user agent, referrer or coordinates: `usageRow` accepts
// only the keys below and throws on any other, time is cut to the hour, and
// query text is scrubbed before it is written. Search text never goes to a
// URL, the platform logs or the telemetry sink.
//
// Off unless USAGE_LOG_ENABLED is 'true' (not before the new privacy text is
// published). Writes run after the response and are dropped, never retried,
// when the store is down. Without a database the log is dropped.

export const USAGE_KINDS = Object.freeze(['book_search', 'book_check', 'result_marks', 'library_finder', 'near_me', 'suggestion']);
const KINDS = new Set(USAGE_KINDS);
// Shelf suggestions (plan 2026-11-14, Part 2): one row per suggested book
// shown, opened or saved. Counts only: the row holds the book key and one of
// these words, never a library, text, timing or anything from the request.
export const SUGGESTION_OUTCOMES = Object.freeze(['shown', 'opened', 'saved']);
const SUGGESTION_OUTCOME = new Set(SUGGESTION_OUTCOMES);
const SOURCES = new Set(['stored', 'live', 'mixed', 'public_data']);
const ALLOWED_KEYS = new Set(['kind', 'queryText', 'libraryId', 'bookKey', 'outcome', 'resultCount', 'foundCount', 'source', 'durationMs', 'appVersion']);
const HOUR = 60 * 60 * 1000;
const REMOVED = '[removed]';

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|org|net|in|io|co|gov|edu|info|me|app|dev|uk|us|jp)(?:\/\S*)?\b/giu;
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
// A run of digits, allowing the spaces, dots and hyphens people type in phone
// numbers and ISBNs.
const DIGIT_RUN = /\+?\d[\d\s().-]*\d/g;

const digitCount = value => (value.match(/\d/g) || []).length;
// A valid ISBN-13 (978/979), or an ISBN-10 written with hyphens or a final X.
// A bare 10-digit number is not kept: it is as likely to be an Indian mobile
// number, and one in eleven of those passes the ISBN-10 checksum.
const isIsbn = token => {
  if (!/^[\dXx-]{10,17}$/.test(token)) return false;
  const compact = token.replace(/-/g, '');
  if (!validateAndNormalize(compact)) return false;
  return /^97[89]\d{10}$/.test(compact) || (compact.length === 10 && (token.includes('-') || /x$/i.test(compact)));
};

// Trim, collapse spaces, replace emails, URLs and digit runs of 7 or more that
// are not a valid ISBN with [removed], then cut to 200 characters.
export function scrubQueryText(value) {
  if (typeof value !== 'string') return null;
  // Control characters (NUL cannot be stored) and bidirectional overrides become spaces.
  let text = value.normalize('NFC').slice(0, 1000).replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  text = text.replace(EMAIL_PATTERN, REMOVED).replace(URL_PATTERN, REMOVED);
  text = text.replace(DIGIT_RUN, run => {
    if (digitCount(run) < 7) return run;
    // A valid ISBN inside the run is kept; every other group of digits that
    // together has 7 or more (a phone or card number typed with spaces) is removed.
    const out = [];
    let group = [];
    const flush = () => {
      if (group.length) out.push(digitCount(group.join('')) >= 7 ? REMOVED : group.join(' '));
      group = [];
    };
    for (const token of run.split(' ')) {
      if (isIsbn(token)) { flush(); out.push(token); } else group.push(token);
    }
    flush();
    return out.join(' ');
  });
  return text.slice(0, 200).trim() || null;
}

const boundedText = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const count = value => (Number.isFinite(value) && value >= 0 ? Math.min(32767, Math.round(value)) : null);

// Validates and shapes one log row. Throws on any key outside the allowlist.
export function usageRow(event, at = Date.now()) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new TypeError('Usage event must be an object');
  for (const key of Object.keys(event)) {
    if (!ALLOWED_KEYS.has(key)) throw new TypeError(`Usage field is not permitted: ${key}`);
  }
  if (!KINDS.has(event.kind)) throw new TypeError('Usage kind is not permitted');
  const outcome = boundedText(event.outcome, 40);
  if (!outcome) throw new TypeError('Usage outcome is required');
  const occurredHour = Math.floor(at / HOUR) * HOUR;
  if (event.kind === 'suggestion') {
    const bookKey = boundedText(event.bookKey, 512);
    if (!bookKey || !SUGGESTION_OUTCOME.has(outcome)) throw new TypeError('A suggestion row needs a book key and shown, opened or saved');
    return Object.freeze({ occurredHour, kind: 'suggestion', queryText: null, libraryId: null, bookKey, outcome,
      resultCount: null, foundCount: null, source: null, durationMs: null, appVersion: null });
  }
  const withText = !['near_me', 'book_check'].includes(event.kind);
  return Object.freeze({
    occurredHour,
    kind: event.kind,
    queryText: withText ? scrubQueryText(event.queryText) : null,
    libraryId: event.kind === 'near_me' ? null : boundedText(event.libraryId, 200),
    bookKey: event.kind === 'book_check' ? boundedText(event.bookKey, 512) : null,
    outcome,
    resultCount: count(event.resultCount),
    foundCount: count(event.foundCount),
    source: SOURCES.has(event.source) ? event.source : null,
    durationMs: Number.isFinite(event.durationMs) && event.durationMs >= 0 ? Math.round(event.durationMs) : null,
    appVersion: boundedText(event.appVersion, 64),
  });
}

const INSERT = `INSERT INTO usage_events (occurred_hour, kind, query_text, library_id, book_key, outcome, result_count, found_count, source, duration_ms, app_version)
  VALUES (date_trunc('hour', now(), 'UTC'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

// `sink` receives rows when there is no database (tests only).
export function createUsageLog({ enabled = false, db = null, sink = null, defer = task => task(), now = () => Date.now() } = {}) {
  return Object.freeze({
    enabled: Boolean(enabled),
    // Validates synchronously (a programming error throws), then writes later.
    record(event) {
      if (!enabled) return;
      const row = usageRow(event, now());
      defer(async () => {
        try {
          if (db) {
            await db.query(INSERT, [row.kind, row.queryText, row.libraryId, row.bookKey, row.outcome, row.resultCount, row.foundCount,
              row.source, row.durationMs, row.appVersion]);
          } else if (sink) sink(row);
        } catch { /* Dropped, never retried; the reader never sees it. */ }
      });
    },
  });
}

// Events per day and kind, from the log for recent days and from the totals
// after the 12-month rollup (searches per day come from here, not analytics).
export async function dailyUsage(db, { days = 30, kind = null } = {}) {
  const { rows } = await db.query(`SELECT day, kind, sum(events)::int AS events FROM (
      SELECT (occurred_hour AT TIME ZONE 'UTC')::date AS day, kind, count(*) AS events
      FROM usage_events WHERE occurred_hour >= (current_date - $1::int) GROUP BY 1, 2
      UNION ALL
      SELECT day, kind, sum(events) FROM usage_daily_totals WHERE day >= (current_date - $1::int) GROUP BY 1, 2
    ) AS combined
    WHERE $2::text IS NULL OR kind = $2
    GROUP BY day, kind ORDER BY day DESC, kind`, [days, kind]);
  return rows.map(row => ({ day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day), kind: row.kind, events: row.events }));
}
