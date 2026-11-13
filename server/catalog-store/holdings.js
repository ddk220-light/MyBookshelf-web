import { ANSWER_TTL_MS } from '../services/catalog-lookup/record.js';

// Database-backed answer store (plan 4.3): the same two calls as the lookup
// layer's in-memory store. Rows come from `answerRows` and `identitiesFor`
// (catalog-lookup/record.js), which never use a title or author.

const TTL_SECONDS = Math.round(ANSWER_TTL_MS / 1000);

const READ = `SELECT library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url,
    (extract(epoch FROM expires_at) * 1000)::bigint AS expires_ms
  FROM holdings_answers
  WHERE library_id = $1
    AND (identity_kind, identity_value) IN (SELECT * FROM unnest($2::text[], $3::text[]))
    AND expires_at > now()`;

// `found` replaces anything; `not_found` never replaces an unexpired `found`.
// Both expire 180 days after the check (owner decision 1).
const WRITE = `WITH input AS (
    SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
      AS t(library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url)
  ), written AS (
    INSERT INTO holdings_answers AS h (library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url, checked_at, expires_at)
    SELECT library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url, now(), now() + make_interval(secs => $8)
    FROM input
    ON CONFLICT (library_id, identity_kind, identity_value) DO UPDATE SET
      answer = EXCLUDED.answer, evidence = EXCLUDED.evidence, matched_isbn13 = EXCLUDED.matched_isbn13,
      catalog_url = EXCLUDED.catalog_url, checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at
    WHERE EXCLUDED.answer = 'found' OR h.answer <> 'found' OR h.expires_at <= now()
    RETURNING h.library_id
  )
  INSERT INTO library_profiles (library_id, answers_stored, last_answer_at)
  SELECT library_id, count(*), now() FROM written GROUP BY library_id
  ON CONFLICT (library_id) DO UPDATE SET answers_stored = library_profiles.answers_stored + EXCLUDED.answers_stored,
    last_answer_at = EXCLUDED.last_answer_at`;

const CATALOG_URL = value => {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : null; } catch { return null; }
};

export function createPgAnswerStore(db) {
  return Object.freeze({
    async readAnswers(libraryId, identities = []) {
      if (!libraryId || !identities.length) return [];
      const { rows } = await db.query(READ, [libraryId, identities.map(id => id.kind), identities.map(id => id.value)]);
      return rows.map(row => ({ libraryId: row.library_id, kind: row.identity_kind, value: row.identity_value, answer: row.answer,
        evidence: row.evidence, ...(row.matched_isbn13 ? { matchedIsbn13: row.matched_isbn13 } : {}),
        ...(row.catalog_url ? { catalogUrl: row.catalog_url } : {}), expiresAt: Number(row.expires_ms) }));
    },
    async writeAnswers(values = []) {
      // One row per identity in a batch (a statement may not update a row
      // twice); a `found` wins over a `not_found` for the same identity.
      const byKey = new Map();
      for (const value of values) {
        const key = `${value.libraryId}\u0000${value.kind}\u0000${value.value}`;
        const existing = byKey.get(key);
        if (!existing || (value.answer === 'found' && existing.answer !== 'found')) byKey.set(key, value);
      }
      const rows = [...byKey.values()];
      if (!rows.length) return;
      await db.query(WRITE, [rows.map(r => r.libraryId), rows.map(r => r.kind), rows.map(r => r.value), rows.map(r => r.answer),
        rows.map(r => r.evidence), rows.map(r => r.matchedIsbn13 || null), rows.map(r => CATALOG_URL(r.catalogUrl)), TTL_SECONDS]);
    },
  });
}
