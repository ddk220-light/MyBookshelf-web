-- Daily outcome counts per library (owner decision, 23 November 2026: the
-- log may keep daily counts per library for no-store catalogs, with no book,
-- no text and no reader; USA plan, section 6). How a library whose catalog
-- may not be stored is verified and watched without a script: its first find
-- is its verification date, checks with no find are a parser to review, and a
-- rise in "couldn't check" is a vendor change.
--
-- One row per UTC day, library, operation, outcome and reason, holding a
-- count (catalog-store/outcomeCounts.js). There is no column for a book, an
-- ISBN, a work, search text, an account, an IP address, a device or a time
-- finer than the day. Counts are totals and are kept, like usage_daily_totals.

CREATE TABLE IF NOT EXISTS library_outcome_days (
  day        date NOT NULL,
  library_id text NOT NULL CHECK (length(library_id) BETWEEN 1 AND 200),
  operation  text NOT NULL CHECK (operation IN ('book_check', 'marks')),
  outcome    text NOT NULL CHECK (outcome IN ('found', 'not_found', 'couldnt_check')),
  reason     text NOT NULL DEFAULT '' CHECK (reason IN ('', 'unconfirmed', 'timeout', 'unavailable', 'blocked', 'unrecognized',
                 'budget', 'unsupported', 'configuration', 'cancelled', 'busy', 'details')),
  checks     integer NOT NULL CHECK (checks > 0),
  PRIMARY KEY (day, library_id, operation, outcome, reason),
  CHECK ((outcome = 'couldnt_check') = (reason <> ''))
);
CREATE INDEX IF NOT EXISTS library_outcome_days_library ON library_outcome_days (library_id, day DESC);
