import { createHmac, randomBytes } from 'node:crypto';

// Library requests and problem reports (plan 4.2, 4.6.3, section 9 item 27).
//
// A library request stores normalised text and a count only: no country, IP,
// account or date finer than a day. A problem report stores the reader's text
// and, optionally, the screen, library, book key and app version.
// Abuse limits use keyed HMAC digests of the client address and the day,
// never the raw address (as account_rate_buckets do):
//   library requests: 5 per hour per address, one per text per address per day
//   problem reports:  5 per hour per address

export class SubmissionError extends Error {
  constructor(code = 'INVALID_REQUEST', message = 'The request is invalid.') {
    super(message);
    this.code = code;
  }
}

export const SCREENS = Object.freeze(['shelf', 'search', 'book', 'library', 'panel', 'account', 'scan', 'other']);
const LIBRARY_ID = /^[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9_-]{1,120}$/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URLISH = /(?:https?:\/\/|www\.)|\b[\p{L}\p{N}-]+\.(?:com|org|net|in|io|co|gov|edu|info|me|app|dev|uk|us|jp)\b/iu;
const HOUR_S = 60 * 60;
const DAY_S = 24 * HOUR_S;

export const LIMITS = Object.freeze({
  requestsPerHour: 5,
  reportsPerHour: 5,
});

const collapse = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
// Control characters (NUL cannot be stored as text at all, so a report would
// be accepted and then silently lost) and bidirectional overrides (which can
// disguise text in the admin view) are refused. Zero-width joiners used by
// Indian scripts are kept.
const CONTROL = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const REPORT_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u;

// Text for "Request to add <text>": 2–80 characters with at least one letter;
// emails, phone numbers and URLs are rejected. The key merges duplicates
// (NFKC, lower case, punctuation stripped, spaces collapsed).
export function parseLibraryRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.text !== 'string') throw new SubmissionError();
  for (const key of Object.keys(body)) if (key !== 'text') throw new SubmissionError();
  if (CONTROL.test(body.text.replace(/[\t\n\r]/g, ' '))) throw new SubmissionError();
  const displayText = collapse(body.text);
  if (displayText.length < 2 || displayText.length > 80) throw new SubmissionError();
  if (!/\p{L}/u.test(displayText) || EMAIL.test(displayText) || URLISH.test(displayText)) throw new SubmissionError();
  if ((displayText.match(/\d/g) || []).length >= 7) throw new SubmissionError();
  const requestKey = displayText.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (requestKey.length < 2) throw new SubmissionError();
  return { displayText, requestKey };
}

export function parseProblemReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.text !== 'string') throw new SubmissionError();
  const allowed = new Set(['text', 'screen', 'libraryId', 'bookKey', 'appVersion']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw new SubmissionError();
  if (REPORT_CONTROL.test(body.text)) throw new SubmissionError();
  const text = body.text.normalize('NFC').trim();
  if (!text || text.length > 2000) throw new SubmissionError();
  const report = { body: text };
  if (body.screen !== undefined) {
    if (!SCREENS.includes(body.screen)) throw new SubmissionError();
    report.screen = body.screen;
  }
  if (body.libraryId !== undefined) {
    if (typeof body.libraryId !== 'string' || !LIBRARY_ID.test(body.libraryId)) throw new SubmissionError();
    report.libraryId = body.libraryId;
  }
  if (body.bookKey !== undefined) {
    if (typeof body.bookKey !== 'string' || !body.bookKey || body.bookKey.length > 512 || !/^v1:[\x21-\x7e]+$/.test(body.bookKey)) throw new SubmissionError();
    report.bookKey = body.bookKey;
  }
  if (body.appVersion !== undefined) {
    if (typeof body.appVersion !== 'string' || !/^[\w.+-]{1,64}$/.test(body.appVersion)) throw new SubmissionError();
    report.appVersion = body.appVersion;
  }
  return report;
}

// Fixed-window counters keyed by a 32-byte digest. `take` returns true when
// the action is within the limit.
export function createMemoryBuckets({ now = () => Date.now(), maxEntries = 20_000 } = {}) {
  const buckets = new Map();
  return Object.freeze({
    async take(bucket, { max, seconds }) {
      const key = bucket.toString('hex');
      const at = now();
      let entry = buckets.get(key);
      if (!entry || entry.resetAt <= at) entry = { count: 0, resetAt: at + seconds * 1000 };
      entry.count += 1;
      buckets.delete(key);
      buckets.set(key, entry);
      if (buckets.size > maxEntries) {
        for (const [name, value] of buckets) if (value.resetAt <= at) buckets.delete(name);
        while (buckets.size > maxEntries) buckets.delete(buckets.keys().next().value);
      }
      return entry.count <= max;
    },
  });
}

export function createPgBuckets(db) {
  return Object.freeze({
    async take(bucket, { max, seconds }) {
      const { rows } = await db.query(`INSERT INTO submission_buckets (bucket, count, reset_at)
        VALUES ($1, 1, now() + make_interval(secs => $2))
        ON CONFLICT (bucket) DO UPDATE SET
          count = CASE WHEN submission_buckets.reset_at <= now() THEN 1 ELSE LEAST(submission_buckets.count + 1, $3::int + 1) END,
          reset_at = CASE WHEN submission_buckets.reset_at <= now() THEN EXCLUDED.reset_at ELSE submission_buckets.reset_at END
        RETURNING count`, [bucket, seconds, max]);
      return Number(rows[0]?.count ?? 1) <= max;
    },
  });
}

const STORE_REQUEST = `INSERT INTO library_requests (request_key, display_text) VALUES ($1, $2)
  ON CONFLICT (request_key) DO UPDATE SET request_count = library_requests.request_count + 1,
    last_requested_on = current_date, updated_at = now()`;
const STORE_REPORT = `INSERT INTO problem_reports (body, screen, library_id, book_key, app_version) VALUES ($1, $2, $3, $4, $5)`;

// `db` null: requests and reports are accepted and held in a small in-memory
// list for this instance (nothing durable before the database exists).
export function createSubmissions({ db = null, secret = null, buckets = null, fallbackBuckets = createMemoryBuckets(), now = () => Date.now(),
  defer = task => task(), maxHeld = 200 } = {}) {
  // Without a configured secret the digests are keyed per process, so the
  // limits hold only on this instance.
  const key = secret || randomBytes(32).toString('hex');
  const durable = buckets || (db && secret ? createPgBuckets(db) : null);
  const held = { requests: [], reports: [] };
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const digest = (...parts) => createHmac('sha256', key).update(parts.join('\n')).digest();

  async function within(bucket, limit) {
    if (durable) {
      try { return await durable.take(bucket, limit); } catch { /* Fail open to this instance's limits. */ }
    }
    return fallbackBuckets.take(bucket, limit);
  }

  function hold(list, value) {
    list.push(Object.freeze(value));
    while (list.length > maxHeld) list.shift();
  }

  return Object.freeze({
    durable: Boolean(db),
    // Returns 'accepted', 'duplicate' (same text from the same address today:
    // not counted again) or 'limited'.
    async libraryRequest({ displayText, requestKey }, { address }) {
      const client = String(address || 'unknown');
      if (!await within(digest('library-request', client, day()), { max: LIMITS.requestsPerHour, seconds: HOUR_S })) return 'limited';
      if (!await within(digest('library-request-text', client, day(), requestKey), { max: 1, seconds: DAY_S })) return 'duplicate';
      defer(async () => {
        if (!db) {
          const existing = held.requests.findIndex(item => item.requestKey === requestKey);
          const previous = existing >= 0 ? held.requests.splice(existing, 1)[0] : null;
          hold(held.requests, { requestKey, displayText: previous?.displayText || displayText, count: (previous?.count || 0) + 1, lastRequestedOn: day() });
          return;
        }
        try { await db.query(STORE_REQUEST, [requestKey, displayText]); } catch { /* Dropped when the store is down. */ }
      });
      return 'accepted';
    },
    async problemReport(report, { address }) {
      const client = String(address || 'unknown');
      if (!await within(digest('problem-report', client, day()), { max: LIMITS.reportsPerHour, seconds: HOUR_S })) return 'limited';
      defer(async () => {
        if (!db) { hold(held.reports, { ...report, createdOn: day() }); return; }
        try {
          await db.query(STORE_REPORT, [report.body, report.screen || null, report.libraryId || null, report.bookKey || null, report.appVersion || null]);
        } catch { /* Dropped when the store is down. */ }
      });
      return 'accepted';
    },
    // In-memory mode only (tests and local development).
    held: () => ({ requests: [...held.requests], reports: [...held.reports] }),
  });
}
