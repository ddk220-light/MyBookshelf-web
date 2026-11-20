import { ANSWER_TTL_MS } from '../services/catalog-lookup/record.js';

// Database-backed answer store (plan 4.3): the same two calls as the lookup
// layer's in-memory store. Rows come from `answerRows` and `identitiesFor`
// (catalog-lookup/record.js), which never use a title or author.

const TTL_SECONDS = Math.round(ANSWER_TTL_MS / 1000);

const readSql = withKind => `SELECT library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url${withKind ? ', catalog_link_kind' : ''},
    (extract(epoch FROM expires_at) * 1000)::bigint AS expires_ms
  FROM holdings_answers
  WHERE library_id = $1
    AND (identity_kind, identity_value) IN (SELECT * FROM unnest($2::text[], $3::text[]))
    AND expires_at > now()`;
const READ = readSql(true);
const READ_WITHOUT_KIND = readSql(false);

// `found` replaces anything; `not_found` never replaces an unexpired `found`.
// Both expire 180 days after the check (owner decision 1).
const writeSql = withKind => `WITH input AS (
    SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]${withKind ? ', $9::text[]' : ''})
      AS t(library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url${withKind ? ', catalog_link_kind' : ''})
  ), written AS (
    INSERT INTO holdings_answers AS h (library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url${withKind ? ', catalog_link_kind' : ''}, checked_at, expires_at)
    SELECT library_id, identity_kind, identity_value, answer, evidence, matched_isbn13, catalog_url${withKind ? ', catalog_link_kind' : ''}, now(), now() + make_interval(secs => $8)
    FROM input
    ON CONFLICT (library_id, identity_kind, identity_value) DO UPDATE SET
      answer = EXCLUDED.answer, evidence = EXCLUDED.evidence, matched_isbn13 = EXCLUDED.matched_isbn13,
      catalog_url = EXCLUDED.catalog_url, ${withKind ? 'catalog_link_kind = EXCLUDED.catalog_link_kind, ' : ''}checked_at = EXCLUDED.checked_at, expires_at = EXCLUDED.expires_at
    WHERE EXCLUDED.answer = 'found' OR h.answer <> 'found' OR h.expires_at <= now()
    RETURNING h.library_id
  )
  INSERT INTO library_profiles (library_id, answers_stored, last_answer_at)
  SELECT library_id, count(*), now() FROM written GROUP BY library_id
  ON CONFLICT (library_id) DO UPDATE SET answers_stored = library_profiles.answers_stored + EXCLUDED.answers_stored,
    last_answer_at = EXCLUDED.last_answer_at`;
const WRITE = writeSql(true);
const WRITE_WITHOUT_KIND = writeSql(false);

// Until catalog migration 004 adds `catalog_link_kind`, Postgres answers
// 42703 (undefined column); answers are then read and written without it, so
// a release that ships before the migration still stores answers (their link
// kind reads as the catalog). Any other error is passed on unchanged.
const UNDEFINED_COLUMN = '42703';
const CHECK_VIOLATION = '23514';
async function withKindFallback(withKind, withoutKind) {
  try { return await withKind(); } catch (error) {
    if (error?.code !== UNDEFINED_COLUMN) throw error;
    return withoutKind();
  }
}

const CATALOG_URL = value => {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try { return ['http:', 'https:'].includes(new URL(value).protocol) ? value : null; } catch { return null; }
};

// Where the link goes (migration 004); a row without one is read as the catalog.
const LINK_KINDS = new Set(['record', 'search', 'catalog']);

export function createPgAnswerStore(db) {
  return Object.freeze({
    async readAnswers(libraryId, identities = []) {
      if (!libraryId || !identities.length) return [];
      const params = [libraryId, identities.map(id => id.kind), identities.map(id => id.value)];
      const { rows } = await withKindFallback(() => db.query(READ, params), () => db.query(READ_WITHOUT_KIND, params));
      return rows.map(row => ({ libraryId: row.library_id, kind: row.identity_kind, value: row.identity_value, answer: row.answer,
        evidence: row.evidence, ...(row.matched_isbn13 ? { matchedIsbn13: row.matched_isbn13 } : {}),
        ...(row.catalog_url ? { catalogUrl: row.catalog_url, ...(LINK_KINDS.has(row.catalog_link_kind) ? { catalogLinkKind: row.catalog_link_kind } : {}) } : {}), expiresAt: Number(row.expires_ms) }));
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
      const write = async rows => {
        if (!rows.length) return;
        const params = [rows.map(r => r.libraryId), rows.map(r => r.kind), rows.map(r => r.value), rows.map(r => r.answer),
          rows.map(r => r.evidence), rows.map(r => r.matchedIsbn13 || null), rows.map(r => CATALOG_URL(r.catalogUrl)), TTL_SECONDS];
        const kinds = rows.map(r => (CATALOG_URL(r.catalogUrl) && LINK_KINDS.has(r.catalogLinkKind) ? r.catalogLinkKind : null));
        await withKindFallback(() => db.query(WRITE, [...params, kinds]), () => db.query(WRITE_WITHOUT_KIND, params));
      };
      const rows = [...byKey.values()];
      // Until catalog migration 005 allows the `title_author` evidence,
      // Postgres refuses it (23514, check violation): the other rows are
      // still written, and a title-and-author find is checked again next time.
      try { await write(rows); } catch (error) {
        if (error?.code !== CHECK_VIOLATION || !rows.some(r => r.evidence === 'title_author')) throw error;
        await write(rows.filter(r => r.evidence !== 'title_author'));
      }
    },
  });
}
