-- Shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
-- Part 2): the anonymous log counts, per suggested book, how often it was
-- shown, opened and saved. Such a row holds the book key and that one word:
-- no text, library, timing, account, IP address or device identifier
-- (usageLog.js accepts nothing else). The 12-month rollup keeps totals only.
--
-- 001 named its checks automatically, so the kind list and the book-key rule
-- are found by their definition and replaced. Fails if either is missing.
DO $$
DECLARE
  item record;
  dropped integer := 0;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'usage_events'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%''library_finder''%'
        OR pg_get_constraintdef(oid) LIKE '%(kind = ''book_check''::text) OR (book_key IS NULL)%')
  LOOP
    EXECUTE format('ALTER TABLE usage_events DROP CONSTRAINT %I', item.conname);
    dropped := dropped + 1;
  END LOOP;
  IF dropped <> 2 THEN
    RAISE EXCEPTION 'usage_events: expected the kind and book-key checks from 001, found %', dropped;
  END IF;
END $$;

ALTER TABLE usage_events
  ADD CONSTRAINT usage_events_kind_allowed CHECK (kind IN
    ('book_search','book_check','result_marks','library_finder','near_me','suggestion')),
  ADD CONSTRAINT usage_events_book_key_kinds CHECK (kind IN ('book_check','suggestion') OR book_key IS NULL),
  ADD CONSTRAINT usage_events_suggestion_counts CHECK (kind <> 'suggestion' OR (
    book_key IS NOT NULL AND query_text IS NULL AND library_id IS NULL AND outcome IN ('shown','opened','saved')
    AND result_count IS NULL AND found_count IS NULL AND source IS NULL AND duration_ms IS NULL AND app_version IS NULL));
