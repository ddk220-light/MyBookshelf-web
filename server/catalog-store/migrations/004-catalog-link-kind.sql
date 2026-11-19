-- Where a stored answer's catalog link goes (production-ready plan, A3): the
-- book's own record, a search for it, or the catalog's home page. The app
-- calls a link "See this book in the library's catalog" only when the catalog
-- adapter said it is the book's record. Rows written before this column have
-- no kind and are read as the catalog, never as the record.

ALTER TABLE holdings_answers
  ADD COLUMN IF NOT EXISTS catalog_link_kind text CHECK (catalog_link_kind IN ('record', 'search', 'catalog'));
