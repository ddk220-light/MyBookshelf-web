-- A work found by its title and author in the library's own catalog, with no
-- ISBN of the work shown (owner decision, 19 November 2026): the answer is
-- "found", like an ISBN find, but its evidence is kept apart so it can be
-- measured. Such a row is written only for the Open Library work identity.
-- Until this migration is applied the store drops those rows (holdings.js)
-- and the next look checks the catalog again.

ALTER TABLE holdings_answers DROP CONSTRAINT IF EXISTS holdings_answers_evidence_check;
ALTER TABLE holdings_answers ADD CONSTRAINT holdings_answers_evidence_check CHECK (evidence IN
  ('exact_isbn','work_isbn','catalog_record','title_author','isbn_not_listed','work_no_match'));
