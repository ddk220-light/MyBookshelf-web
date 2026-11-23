import { createHmac, randomBytes } from 'node:crypto';
import { createMemoryBuckets } from './requests.js';

// A request budget for the book-page check (POST /api/v2/holdings/check), so
// the tap-to-check pages cannot be used to make our server hammer a small
// library's catalog (USA plan, section 10, "Abuse"). Only a check that would
// ask the catalog is counted: a stored answer, a library the app cannot read
// and a book whose details failed cost the catalog nothing.
//
//   per library: CHECK_LIMITS.perLibraryPerMinute live checks a minute,
//                whoever asks (the library ID is the key);
//   per client:  CHECK_LIMITS.perClientPerMinute a minute and
//                CHECK_LIMITS.perClientPerDay a day.
//
// Over budget, the reader is told "couldn't check" with reason `busy` and the
// catalog is not asked. The host pacing (hostGate.js) still spaces every
// request that is sent.
//
// Client limits use the existing anonymous rate-limit store and keys:
// submission_buckets rows keyed by an HMAC digest of the client address and
// the UTC day (requests.js does the same for library requests and problem
// reports), never the raw address, and the daily catalog maintenance deletes
// expired rows. Each call has a short timeout and fails open to this
// instance's memory buckets, so a slow store never delays or blocks a check.

export const CHECK_LIMITS = Object.freeze({
  perLibraryPerMinute: 20,
  perClientPerMinute: 20,
  perClientPerDay: 300,
});
const MINUTE_S = 60;
const DAY_S = 24 * 60 * 60;
const TIMEOUT_MS = 300;

// The three buckets in one statement (one round trip on the tap's path).
// The count is capped well above every limit so it cannot overflow.
const TAKE = `INSERT INTO submission_buckets AS b (bucket, count, reset_at)
  SELECT k, 1, now() + make_interval(secs => s) FROM unnest($1::bytea[], $2::int[]) AS t(k, s)
  ON CONFLICT (bucket) DO UPDATE SET
    count = CASE WHEN b.reset_at <= now() THEN 1 ELSE LEAST(b.count + 1, 1000000) END,
    reset_at = CASE WHEN b.reset_at <= now() THEN EXCLUDED.reset_at ELSE b.reset_at END
  RETURNING bucket, count`;

export function createCheckBudget({ db = null, secret = null, limits = CHECK_LIMITS, fallbackBuckets = createMemoryBuckets(), now = () => Date.now(),
  timeoutMs = TIMEOUT_MS } = {}) {
  // Without a configured secret the digests are keyed per process, so the
  // limits hold only on this instance (as for submissions).
  const key = secret || randomBytes(32).toString('hex');
  const durable = db && secret ? db : null;
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const digest = (...parts) => createHmac('sha256', key).update(parts.join('\n')).digest();

  // `checks` is [bucket, { max, seconds }][]; returns whether each is within its limit.
  async function within(checks) {
    if (durable) {
      try {
        const { rows } = await durable.query(TAKE, [checks.map(([bucket]) => bucket), checks.map(([, limit]) => limit.seconds)], { timeoutMs });
        const counts = new Map(rows.map(row => [Buffer.from(row.bucket).toString('hex'), Number(row.count)]));
        if (checks.every(([bucket]) => counts.has(bucket.toString('hex')))) return checks.map(([bucket, limit]) => counts.get(bucket.toString('hex')) <= limit.max);
      } catch { /* Fail open to this instance's limits. */ }
    }
    return Promise.all(checks.map(([bucket, limit]) => fallbackBuckets.take(bucket, limit)));
  }

  return Object.freeze({
    limits,
    // 'ok', or which budget is spent: 'library' or 'client'. Every bucket is
    // counted, so a client over its limit also uses the library's.
    async take({ libraryId, address }) {
      const client = String(address || 'unknown');
      const [library, minute, today] = await within([
        [digest('check-library', String(libraryId)), { max: limits.perLibraryPerMinute, seconds: MINUTE_S }],
        [digest('check-client-minute', client, day()), { max: limits.perClientPerMinute, seconds: MINUTE_S }],
        [digest('check-client-day', client, day()), { max: limits.perClientPerDay, seconds: DAY_S }],
      ]);
      if (!minute || !today) return 'client';
      return library ? 'ok' : 'library';
    },
  });
}
