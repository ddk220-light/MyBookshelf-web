import { createPgHealthRecord } from './health.js';

// The daily job (plan 4.4), run with the worker role from
// /api/internal/catalog-maintenance:
//   1. expired answers, in batches of 5,000
//   2. every answer of a library whose policy says storeAnswers: false
//   3. expired submission buckets
//   4. problem reports resolved or spam for 90 days, and any older than 12 months
//   5. library requests: spam after 90 days; added or declined 12 months after
//      their last update
//   6. usage events older than 12 months rolled into daily totals (counts,
//      result sums, p50/p95 timings; no text, no book keys), one transaction
//      per day, then deleted
//   7. health: 7-day counts and the flag rule; failure events older than 90
//      days and host request windows/slots older than one hour deleted
// Reads always filter on expires_at, so a missed run never serves an expired answer.

const BATCH = 5_000;

async function deleteInBatches(db, sql, values = [], { maxBatches = 200 } = {}) {
  let total = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const { rowCount } = await db.query(sql, values, { timeoutMs: 30_000 });
    total += rowCount;
    if (rowCount < BATCH) break;
  }
  return total;
}

export async function rollUpUsage(db, { maxDays = 31 } = {}) {
  const { rows } = await db.query(`SELECT DISTINCT (occurred_hour AT TIME ZONE 'UTC')::date AS day FROM usage_events
    WHERE occurred_hour < now() - interval '12 months' ORDER BY 1 LIMIT $1`, [maxDays], { timeoutMs: 30_000 });
  let events = 0;
  for (const { day } of rows) {
    const value = day instanceof Date ? day.toISOString().slice(0, 10) : String(day);
    events += await db.transaction(async client => {
      const range = `occurred_hour >= ($1::date AT TIME ZONE 'UTC') AND occurred_hour < (($1::date + 1) AT TIME ZONE 'UTC')
        AND occurred_hour < now() - interval '12 months'`;
      await client.query(`INSERT INTO usage_daily_totals AS t (day, kind, library_id, outcome, events, results_sum, p50_ms, p95_ms)
        SELECT $1::date, kind, coalesce(library_id, ''), outcome, count(*), coalesce(sum(result_count), 0),
          percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)::int, percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::int
        FROM usage_events WHERE ${range}
        GROUP BY kind, coalesce(library_id, ''), outcome
        ON CONFLICT (day, kind, library_id, outcome) DO UPDATE SET events = t.events + EXCLUDED.events,
          results_sum = t.results_sum + EXCLUDED.results_sum, p50_ms = coalesce(EXCLUDED.p50_ms, t.p50_ms), p95_ms = coalesce(EXCLUDED.p95_ms, t.p95_ms)`, [value]);
      const { rowCount } = await client.query(`DELETE FROM usage_events WHERE ${range}`, [value]);
      return rowCount;
    });
  }
  return { days: rows.length, events };
}

export async function runCatalogMaintenance(db, { policy, now = () => Date.now() } = {}) {
  const result = {};
  result.expiredAnswers = await deleteInBatches(db, `DELETE FROM holdings_answers WHERE ctid IN (
    SELECT ctid FROM holdings_answers WHERE expires_at < now() LIMIT ${BATCH})`);
  const optedOut = policy?.optedOut?.() || [];
  result.purgedAnswers = optedOut.length ? await deleteInBatches(db, `DELETE FROM holdings_answers WHERE ctid IN (
    SELECT ctid FROM holdings_answers WHERE library_id = ANY($1::text[]) LIMIT ${BATCH})`, [optedOut]) : 0;
  result.buckets = (await db.query('DELETE FROM submission_buckets WHERE reset_at < now()')).rowCount;
  result.reports = (await db.query(`DELETE FROM problem_reports
    WHERE (status IN ('resolved', 'spam') AND coalesce(resolved_at, created_at) < now() - interval '90 days')
       OR created_at < now() - interval '12 months'`)).rowCount;
  result.requests = (await db.query(`DELETE FROM library_requests
    WHERE (status = 'spam' AND updated_at < now() - interval '90 days')
       OR (status IN ('added', 'declined') AND updated_at < now() - interval '12 months')`)).rowCount;
  result.usage = await rollUpUsage(db);
  // 7-day failure counters. Only failures are events (successes update
  // library_health directly), so checks_7d is not derived here: the admin
  // view takes check totals per library from the operational log.
  await db.query(`UPDATE library_health h SET failures_7d = coalesce(e.failures, 0), median_ms_7d = e.median_ms, updated_at = now()
    FROM (SELECT l.library_id, count(c.id)::int AS failures,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY c.duration_ms)::int AS median_ms
          FROM library_health l LEFT JOIN library_check_events c
            ON c.library_id = l.library_id AND c.occurred_at > now() - interval '7 days'
          GROUP BY l.library_id) e
    WHERE h.library_id = e.library_id AND (h.failures_7d IS DISTINCT FROM coalesce(e.failures, 0) OR h.median_ms_7d IS DISTINCT FROM e.median_ms)`,
  [], { timeoutMs: 30_000 });
  result.health = await createPgHealthRecord(db, { now }).refreshFlags(now());
  result.checkEvents = (await db.query(`DELETE FROM library_check_events WHERE occurred_at < now() - interval '90 days'`, [], { timeoutMs: 30_000 })).rowCount;
  result.hostWindows = (await db.query(`DELETE FROM host_request_windows WHERE window_start < now() - interval '1 hour'`)).rowCount
    + (await db.query(`DELETE FROM host_request_slots WHERE next_at < now() - interval '1 hour'`)).rowCount;
  return result;
}
