import { getLibraryById } from '../services/directory.js';
import { dailyUsage, USAGE_KINDS } from '../catalog-store/usageLog.js';
import { groupLibraryRequests } from './grouping.js';

// Reads and the few status updates behind the owner-only admin view (plan
// section 6). Every call runs with the catalog store's admin role
// (catalog_admin): SELECT on every table, UPDATE only on request and report
// status/notes and health acknowledgements. Nothing here joins the account
// database, and no row links to a person.

export class AdminInputError extends Error {
  constructor(message = 'Check the submitted fields.') { super(message); this.code = 'INVALID_REQUEST'; }
}

export const REQUEST_STATUSES = Object.freeze(['open', 'added', 'declined', 'spam']);
export const REPORT_STATUSES = Object.freeze(['new', 'read', 'resolved', 'spam']);
export const FAILURE_CLASSES = Object.freeze(['timeout', 'unavailable', 'blocked', 'unrecognized', 'budget', 'configuration']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/;
const Q = { timeoutMs: 10_000 };

const iso = value => (value == null ? null : value instanceof Date ? value.toISOString() : String(value));
const libraryName = libraryId => getLibraryById(libraryId)?.name || null;

function only(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminInputError();
  for (const key of Object.keys(body)) if (!keys.includes(key)) throw new AdminInputError();
  return body;
}
// A note: plain text up to 500 characters; empty clears it.
function note(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || CONTROL.test(value)) throw new AdminInputError();
  const text = value.normalize('NFC').trim();
  if (text.length > 500) throw new AdminInputError('A note can be up to 500 characters.');
  return text || null;
}

// ---- Library requests ---------------------------------------------------

const requestRow = row => ({
  requestKey: row.request_key, displayText: row.display_text, requestCount: row.request_count,
  firstRequestedOn: row.first_requested_on, lastRequestedOn: row.last_requested_on,
  status: row.status, statusNote: row.status_note, updatedAt: iso(row.updated_at),
});
const REQUEST_COLUMNS = `request_key, display_text, request_count, first_requested_on::text AS first_requested_on,
  last_requested_on::text AS last_requested_on, status, status_note, updated_at`;

export async function listLibraryRequests(db, { limit = 1000 } = {}) {
  const { rows } = await db.query(`SELECT ${REQUEST_COLUMNS} FROM library_requests
    ORDER BY request_count DESC, last_requested_on DESC, request_key LIMIT $1`, [limit], Q);
  const requests = rows.map(requestRow);
  return { total: requests.length, groups: groupLibraryRequests(requests) };
}

export async function updateLibraryRequest(db, requestKey, body) {
  if (typeof requestKey !== 'string' || requestKey.length < 2 || requestKey.length > 80) throw new AdminInputError();
  const { status, note: text } = only(body, ['status', 'note']);
  if (status === undefined && text === undefined) throw new AdminInputError();
  if (status !== undefined && !REQUEST_STATUSES.includes(status)) throw new AdminInputError();
  const { rows } = await db.query(`UPDATE library_requests SET status = coalesce($2, status),
      status_note = CASE WHEN $4 THEN $3 ELSE status_note END, updated_at = now()
    WHERE request_key = $1 RETURNING ${REQUEST_COLUMNS}`,
  [requestKey, status ?? null, text === undefined ? null : note(text), text !== undefined], Q);
  return rows[0] ? requestRow(rows[0]) : null;
}

// ---- Problem reports ----------------------------------------------------

const reportRow = row => ({
  id: row.id, body: row.body, screen: row.screen, libraryId: row.library_id, libraryName: row.library_id ? libraryName(row.library_id) : null,
  bookKey: row.book_key, appVersion: row.app_version, createdAt: iso(row.created_at), status: row.status, resolvedAt: iso(row.resolved_at),
});
const REPORT_COLUMNS = 'id, body, screen, library_id, book_key, app_version, created_at, status, resolved_at';

export async function listProblemReports(db, { limit = 200 } = {}) {
  const { rows } = await db.query(`SELECT ${REPORT_COLUMNS} FROM problem_reports ORDER BY created_at DESC LIMIT $1`, [limit], Q);
  return { reports: rows.map(reportRow) };
}

export async function updateProblemReport(db, id, body) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new AdminInputError();
  const { status } = only(body, ['status']);
  if (!REPORT_STATUSES.includes(status)) throw new AdminInputError();
  // resolved_at dates both resolved and spam reports, which the daily job
  // deletes 90 days later.
  const { rows } = await db.query(`UPDATE problem_reports SET status = $2,
      resolved_at = CASE WHEN $2 IN ('resolved', 'spam') THEN coalesce(resolved_at, now()) ELSE NULL END
    WHERE id = $1 RETURNING ${REPORT_COLUMNS}`, [id.toLowerCase(), status], Q);
  return rows[0] ? reportRow(rows[0]) : null;
}

// ---- Library health -----------------------------------------------------

// Failures come from the health record; check totals are not stored there
// (only failures), so they come from the anonymous log when it is on.
export async function libraryHealth(db) {
  const { rows } = await db.query(`SELECT h.library_id, h.platform, h.last_success_at, h.last_failure_at, h.last_failure,
      h.failures_since_success, h.flagged_at, h.flag_reason, h.acknowledged_at, h.owner_note,
      coalesce(e.failures, 0) AS failures_7d, e.median_ms AS median_failure_ms, e.by_class,
      (SELECT host FROM library_check_events x WHERE x.library_id = h.library_id ORDER BY occurred_at DESC LIMIT 1) AS host
    FROM library_health h
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS failures, percentile_cont(0.5) WITHIN GROUP (ORDER BY c.duration_ms)::int AS median_ms,
        (SELECT jsonb_object_agg(failure, n) FROM (SELECT failure, count(*)::int AS n FROM library_check_events f
           WHERE f.library_id = h.library_id AND f.occurred_at > now() - interval '7 days' GROUP BY failure) classes) AS by_class
      FROM library_check_events c WHERE c.library_id = h.library_id AND c.occurred_at > now() - interval '7 days'
    ) e ON true
    WHERE h.flagged_at IS NOT NULL OR h.last_failure_at > now() - interval '7 days' OR h.last_success_at > now() - interval '7 days'
    LIMIT 2000`, [], Q);
  const ids = rows.map(row => row.library_id);
  const [checks, recent] = ids.length ? await Promise.all([
    db.query(`SELECT library_id, count(*)::int AS checks, percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS median_ms
      FROM usage_events WHERE kind IN ('book_check', 'result_marks') AND library_id = ANY($1::text[])
        AND occurred_hour > now() - interval '7 days' GROUP BY library_id`, [ids], Q),
    db.query(`SELECT library_id, occurred_at, operation, failure, error_code, duration_ms, requests FROM (
        SELECT *, row_number() OVER (PARTITION BY library_id ORDER BY occurred_at DESC) AS n FROM library_check_events
        WHERE library_id = ANY($1::text[]) AND occurred_at > now() - interval '7 days') ranked
      WHERE n <= 5 ORDER BY library_id, occurred_at DESC`, [ids], Q),
  ]) : [{ rows: [] }, { rows: [] }];
  const checksBy = new Map(checks.rows.map(row => [row.library_id, row]));
  const recentBy = new Map();
  for (const row of recent.rows) {
    if (!recentBy.has(row.library_id)) recentBy.set(row.library_id, []);
    recentBy.get(row.library_id).push({ occurredAt: iso(row.occurred_at), operation: row.operation, failure: row.failure,
      errorCode: row.error_code, durationMs: row.duration_ms, requests: row.requests });
  }
  const libraries = rows.map(row => {
    const logged = checksBy.get(row.library_id);
    const entry = getLibraryById(row.library_id);
    const byClass = Object.fromEntries(FAILURE_CLASSES.map(name => [name, Number(row.by_class?.[name] || 0)]));
    const checks7d = logged ? Math.max(logged.checks, row.failures_7d) : null;
    return {
      libraryId: row.library_id, name: entry?.name || null, platform: row.platform, host: row.host || null,
      flagged: row.flagged_at != null, flaggedAt: iso(row.flagged_at), flagReason: row.flag_reason,
      failures7d: row.failures_7d, failuresByClass: byClass, checks7d,
      failureRate: checks7d ? Math.round((row.failures_7d / checks7d) * 1000) / 1000 : null,
      medianMs: logged?.median_ms ?? null, medianFailureMs: row.median_failure_ms ?? null,
      lastSuccessAt: iso(row.last_success_at), lastFailureAt: iso(row.last_failure_at), lastFailure: row.last_failure,
      failuresSinceSuccess: row.failures_since_success, acknowledgedAt: iso(row.acknowledged_at), ownerNote: row.owner_note,
      recentFailures: recentBy.get(row.library_id) || [],
    };
  });
  libraries.sort((a, b) => (Number(b.flagged) - Number(a.flagged))
    || (a.flagged ? String(b.flaggedAt).localeCompare(String(a.flaggedAt)) : 0)
    || ((b.failureRate ?? -1) - (a.failureRate ?? -1))
    || (b.failures7d - a.failures7d)
    || a.libraryId.localeCompare(b.libraryId));
  return { libraries, checkTotalsFromLog: checks.rows.length > 0 };
}

export async function acknowledgeLibraryHealth(db, libraryId, body) {
  if (typeof libraryId !== 'string' || !LIBRARY_ID.test(libraryId)) throw new AdminInputError();
  const { acknowledged, note: text } = only(body, ['acknowledged', 'note']);
  if (acknowledged === undefined && text === undefined) throw new AdminInputError();
  if (acknowledged !== undefined && typeof acknowledged !== 'boolean') throw new AdminInputError();
  const { rows } = await db.query(`UPDATE library_health SET
      acknowledged_at = CASE WHEN $2::boolean IS NULL THEN acknowledged_at WHEN $2 THEN now() ELSE NULL END,
      owner_note = CASE WHEN $4 THEN $3 ELSE owner_note END, updated_at = now()
    WHERE library_id = $1 RETURNING library_id, acknowledged_at, owner_note`,
  [libraryId, acknowledged ?? null, text === undefined ? null : note(text), text !== undefined], Q);
  return rows[0] ? { libraryId: rows[0].library_id, acknowledgedAt: iso(rows[0].acknowledged_at), ownerNote: rows[0].owner_note } : null;
}

// CSV for the connector audit. Cells that a spreadsheet would run as a
// formula are prefixed with an apostrophe.
const cell = value => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  // Semicolons and tabs are quoted too, for spreadsheets that split on them.
  return /[",;\t\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export function libraryHealthCsv({ libraries }) {
  const header = ['library_id', 'name', 'platform', 'host', 'flagged_at', 'flag_reason', 'failures_7d', ...FAILURE_CLASSES, 'checks_7d',
    'last_success_at', 'last_failure_at', 'last_failure', 'median_ms', 'median_failure_ms', 'acknowledged_at', 'owner_note'];
  const lines = libraries.map(row => [row.libraryId, row.name, row.platform, row.host, row.flaggedAt, row.flagReason, row.failures7d,
    ...FAILURE_CLASSES.map(name => row.failuresByClass[name]), row.checks7d, row.lastSuccessAt, row.lastFailureAt, row.lastFailure,
    row.medianMs, row.medianFailureMs, row.acknowledgedAt, row.ownerNote].map(cell).join(','));
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

// ---- Usage (the anonymous operational log) -------------------------------

// The only fields the usage view returns. None of them is an account, IP,
// device, session, user agent, referrer, coordinate or book key.
export const USAGE_VIEW_FIELDS = Object.freeze({
  daily: ['day', ...USAGE_KINDS, 'searchesWithoutResults'],
  noResultSearches: ['text', 'count'],
  libraryChecks: ['libraryId', 'name', 'outcome', 'events', 'p50Ms', 'p95Ms'],
  marking: ['runs', 'booksShown', 'booksMarked'],
  libraryFinderWithoutResults: ['text', 'count'],
});

export async function usage(db, { days = 30 } = {}) {
  const [daily, none, noResults, checks, marking, finder, any] = await Promise.all([
    dailyUsage(db, { days }),
    db.query(`SELECT (occurred_hour AT TIME ZONE 'UTC')::date::text AS day, count(*)::int AS events FROM usage_events
      WHERE kind = 'book_search' AND outcome = 'none' AND occurred_hour >= (current_date - $1::int) GROUP BY 1`, [days], Q),
    db.query(`SELECT query_text, count(*)::int AS events FROM usage_events
      WHERE kind = 'book_search' AND outcome = 'none' AND query_text IS NOT NULL AND occurred_hour >= (current_date - $1::int)
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50`, [days], Q),
    db.query(`SELECT library_id, outcome, count(*)::int AS events,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::int AS p50, percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int AS p95
      FROM usage_events WHERE kind = 'book_check' AND library_id IS NOT NULL AND occurred_hour >= (current_date - $1::int)
      GROUP BY 1, 2 ORDER BY 3 DESC, 1, 2 LIMIT 300`, [days], Q),
    db.query(`SELECT count(*)::int AS runs, coalesce(sum(result_count), 0)::int AS shown, coalesce(sum(found_count), 0)::int AS marked
      FROM usage_events WHERE kind = 'result_marks' AND outcome <> 'skipped' AND occurred_hour >= (current_date - $1::int)`, [days], Q),
    db.query(`SELECT query_text, count(*)::int AS events FROM usage_events
      WHERE kind = 'library_finder' AND result_count = 0 AND query_text IS NOT NULL AND occurred_hour >= (current_date - $1::int)
      GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 50`, [days], Q),
    db.query(`SELECT EXISTS (SELECT 1 FROM usage_events) OR EXISTS (SELECT 1 FROM usage_daily_totals) AS present`, [], Q),
  ]);
  const byDay = new Map();
  const dayRow = day => {
    if (!byDay.has(day)) byDay.set(day, { day, ...Object.fromEntries(USAGE_KINDS.map(kind => [kind, 0])), searchesWithoutResults: 0 });
    return byDay.get(day);
  };
  for (const row of daily) dayRow(row.day)[row.kind] = row.events;
  for (const row of none.rows) dayRow(row.day).searchesWithoutResults = row.events;
  return {
    days,
    hasData: Boolean(any.rows[0]?.present),
    daily: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)),
    noResultSearches: noResults.rows.map(row => ({ text: row.query_text, count: row.events })),
    libraryChecks: checks.rows.map(row => ({ libraryId: row.library_id, name: libraryName(row.library_id), outcome: row.outcome,
      events: row.events, p50Ms: row.p50, p95Ms: row.p95 })),
    marking: { runs: marking.rows[0]?.runs ?? 0, booksShown: marking.rows[0]?.shown ?? 0, booksMarked: marking.rows[0]?.marked ?? 0 },
    libraryFinderWithoutResults: finder.rows.map(row => ({ text: row.query_text, count: row.events })),
  };
}

// ---- Summary ------------------------------------------------------------

export async function summary(db, { policy } = {}) {
  const [answers, counts] = await Promise.all([
    db.query(`SELECT library_id, count(*) FILTER (WHERE answer = 'found')::int AS found, count(*) FILTER (WHERE answer = 'not_found')::int AS not_found
      FROM holdings_answers WHERE expires_at > now() GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 200`, [], Q),
    db.query(`SELECT (SELECT count(*) FROM library_requests WHERE status = 'open')::int AS open_requests,
        (SELECT count(*) FROM problem_reports WHERE status = 'new')::int AS new_reports,
        (SELECT count(*) FROM library_health WHERE flagged_at IS NOT NULL)::int AS flagged,
        (SELECT count(*) FROM library_health WHERE flagged_at IS NOT NULL AND acknowledged_at IS NULL)::int AS flagged_unacknowledged,
        (SELECT count(*) FROM holdings_answers WHERE expires_at > now())::int AS answers,
        (EXISTS (SELECT 1 FROM usage_events) OR EXISTS (SELECT 1 FROM usage_daily_totals)) AS usage_present`, [], Q),
  ]);
  const c = counts.rows[0] || {};
  return {
    counts: { openRequests: c.open_requests ?? 0, newReports: c.new_reports ?? 0, flaggedLibraries: c.flagged ?? 0,
      flaggedUnacknowledged: c.flagged_unacknowledged ?? 0, storedAnswers: c.answers ?? 0, usageData: Boolean(c.usage_present) },
    answersByLibrary: answers.rows.map(row => ({ libraryId: row.library_id, name: libraryName(row.library_id), found: row.found, notFound: row.not_found })),
    optedOut: (policy?.optedOut?.() || []).map(libraryId => ({ libraryId, name: libraryName(libraryId) })),
  };
}

// The admin view must run as the admin role: not the owner, not a superuser,
// and not the runtime (writes the log) or worker (deletes answers) role.
export async function assertAdminRole(db) {
  // MEMBER (not USAGE) also catches a NOINHERIT member of the owner role, and
  // every table in the schema counts, not just one.
  const { rows } = await db.query(`SELECT r.rolsuper, r.rolbypassrls,
      EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
        AND pg_has_role(current_user, c.relowner, 'MEMBER')) AS owns,
      has_table_privilege(current_user, 'usage_events', 'INSERT') AS writes_log,
      has_table_privilege(current_user, 'holdings_answers', 'DELETE') AS deletes,
      has_table_privilege(current_user, 'usage_events', 'SELECT') AS reads_log
    FROM pg_roles r WHERE r.rolname = current_user`, [], Q);
  const role = rows[0];
  if (!role || role.rolsuper || role.rolbypassrls || role.owns || role.writes_log || role.deletes || !role.reads_log) {
    throw Object.assign(new Error('The admin database role is not the catalog admin role.'), { code: 'STORE_ROLE_REJECTED' });
  }
}
