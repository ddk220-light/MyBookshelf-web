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

## Library search and the PINES split (24 November 2026, USA plan step 8)

Captured from `https://gapines.org/osrf-gateway-v1` on 2026-11-24 by an agent as
Claude-User (the owner approved one org-tree call; gapines.org's robots.txt lets
every agent, Claude-User among them, use the gateway, and was read again first),
one request at a time, at least 20 s apart. No cookies, no session, no account.

- `pines-org-tree.json`: `open-ils.actor.org_tree.retrieve` (the one approved
  call), trimmed to the fields `tools/directory/pines-systems.mjs` reads (children
  0, id 3, name 6, org type 7, parent 8, short name 9, OPAC visible 12, the IMLS
  key PINES records for the unit 32 and its outlet number 33); addresses,
  e-mail addresses, phone numbers and the other fields are null.
- `pines-live-query-remarkably-bright-creatures-arl.json`:
  `open-ils.search.biblio.multiclass.query({"limit":40,"offset":0}, "Remarkably
  Bright Creatures site(ARL)", 1)`: 5 records at Athens Regional (org 6); the
  canonical query names `badge_orgs(6,1)` and `site(ARL)`.
- `pines-live-query-isbn-9780385547345-arl.json`: the ISBN's digits as keywords at
  Athens Regional: 1 record (Lessons in chemistry, whose brief record shows
  another of its ISBNs, 9780593314487).
- `pines-live-query-no-hits-arl.json`: a nonsense term at Athens Regional: count 0.
- `pines-live-query-remarkably-bright-creatures-pines.json`: the same title in all
  of PINES (no site): 20 records, `badge_orgs(1)`.
- `pines-live-records.json`: `open-ils.search.biblio.record.mods_slim.retrieve`
  for the six records above, trimmed to title 0, author 1, record 2, date 4,
  ISBN 5, types of resource 9, edition 11 and physical description 14 (subjects,
  summaries and the rest null).
- `imls-pls-fy2024-ae-pines.csv`: the IMLS Public Libraries Survey FY2024
  administrative entity records of the 51 keys the org tree carries (columns
  trimmed), for the tool's tests.

Query plans, facets and highlight maps were removed from the query answers.
