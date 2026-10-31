# Evergreen public API fixtures

Captured from `https://gapines.org/osrf-gateway-v1` on 2026-10-03 using the honest
`MyBookshelf/1.0 (web; +https://mybookshelf.app/privacy)` identity. These are
anonymous catalog reads, with no patron session, library card, API key, cookies,
or account data. Tests replay these files offline and make no live requests.

- `pines-search.json`: `open-ils.search.biblio.isbn("9780735219090")`, record
  6107812. PINES returns search tuples rather than the scalar ID list used in
  some Evergreen versions.
- `pines-record.json`: `open-ils.search.biblio.record.mods.retrieve(1, 6107812)`:
  exact ISBN 9780735219090, 303 available / 327 visible copies for PINES org 1.
- `pines-athens-record.json`: the same record scoped to org 6, Athens Regional
  Library System. The reply includes BOTH ancestor org 1 (303/327) and selected
  org 6 (16/17). This guards against mislabeling consortium counts as local ones.
- `pines-mismatch-search.json` and `pines-mismatch-record.json`: a deliberate
  negative-control query for 9780000000002 unexpectedly returned record 307912,
  whose displayed ISBN is 0449213730. This is a real example of why the search
  endpoint alone cannot prove exact ISBN identity. The provider rejects it as
  unknown; it is not recorded as a confirmed catalog miss.

Search diagnostics, facets, query plans, book descriptions, subject metadata,
and unrelated MODS fields were removed. The `mvr` field positions and relevant
public counts are preserved. Zero-result/zero-holding, malformed, blocked,
timeout, and oversized cases in tests are synthetic variants explicitly made
in test code; no live zero-result claim is made.

Primary protocol and schema references:

- <https://docs.evergreen-ils.org/docs/latest/integrations/web_services.html>
- <https://github.com/evergreen-library-system/Evergreen/blob/main/Open-ILS/src/perlmods/lib/OpenILS/Application/Search/Biblio.pm>
- <https://github.com/evergreen-library-system/Evergreen/blob/main/Open-ILS/examples/fm_IDL.xml>
