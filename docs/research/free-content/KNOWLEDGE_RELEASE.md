# Search across connected knowledge sources

Owner authorization, 2026-11-05: release the researched search integrations to
production and let users search across data sources. This implementation is on
`feat/free-knowledge-search`, in its own worktree from current production main.
The separate recurring research task remains research-only; its unfinished
registry and candidate counts are not production qualification.

## Behavior

The new **All knowledge** search submits one query to connected providers with
at most three requests in flight. Results arrive independently and remain grouped
by source; an outage, empty page or limit at one provider cannot erase another's
results. Source, type and supported language filters are visible before searching.
Each group has independent continuation and retry. Native identities, editions,
recordings, source credits, rights and free-account labels are preserved. A user
can open a canonical result, read/listen on the original site and save it using
the existing browser shelf behavior. Library search and the existing Free to read
and Papers views remain available.

Ten new integrations are released behind `CONTENT_KNOWLEDGE_ENABLED=true`:
Global Digital Library, LibriVox, Library of Congress digital books, Biodiversity
Heritage Library's Internet Archive collection, African Minds, LSE Press,
Mattering Press, mediastudies.press, punctum books and Python 3.15 documentation.
Five publisher catalogs share Thoth; this is not five separate API infrastructures.
The existing Gutenberg, Open Textbook Library, Book Dash and StoryWeaver snapshots
and the existing OpenAlex/Europe PMC integrations are also selectable. With the
existing production flags, this gives 16 connected sources, not 16 fully audited
origins or complete catalogs.

Wikipedia, Wikibooks and Wikisource remain disconnected: the current robots
policies disallow the reviewed `/w/api.php` search route. No alternate route was
used to evade this restriction. arXiv/DOAJ retain their existing pacing-related
exclusion from live requests. Other registry candidates require supported query,
access or credential work before integration. This release does not make an
unverified directory or research lead searchable by merely listing it.

## Contracts and limits

- One provider per server request; the browser coordinates the search. No Redis,
  SQL, hosted cache, persisted session or new account/service.
- Fixed-origin adapters bound response size, deadline and paging. Signed cursors
  bind provider, query, types, language, page size and expiry; they work across
  function restarts without storing query results. Changed indexes can change
  pages; exact-key deduplication never merges similar titles or distinct editions.
- The new transport serializes requests per host within an instance, spaces them
  two seconds apart and honors 429 Retry-After. It has no automatic retries.
  This courtesy is not a global request quota across Vercel instances.
- Python's official compressed symbol inventory is bounded and cached for one
  hour in process memory. Search is over symbol/section names, not arbitrary
  full documentation text. Version and same-origin URL checks fail closed.
- GDL uses its public content-search route and published WordPress REST book-ID
  route for exact details. Word-level metadata checks reject substring noise
  such as `Rain` matching only `Shakrain`. Its provider offset advances even when
  inspected rows fail relevance, so filtering does not trap pagination.
- Thoth searches active monographs/edited books in explicit publisher IDs. Exact
  resolution verifies publisher membership and active status. Only canonical
  digital links on reviewed publisher hosts become reading/download actions;
  print, retail and unreviewed mirrors do not.
- LoC requires `access_restricted=false`, digitization and an online resource for
  free access. BHL searches only its biodiversity collection and excludes known
  access-restricted items. Their content rights still vary by item.
- LibriVox is title search and distinct recording identity. Its documented JSON
  404 for no audiobooks is an empty result; other errors remain failures. US
  public-domain statements do not claim worldwide rights.
- Snapshot sources remain labelled incomplete/stale when appropriate. Unknown
  access is hidden by default; an explicit checkbox reveals labelled results with a source record link; no old
  observation is refreshed merely because a user searches it.
- Existing OpenAlex free-allowance and zero-paid-balance checks remain unchanged.
  No key is returned to the browser. No full books/audio are copied.

## Verification and release record

Current live results, including source IDs and reading links, are in
[evidence/knowledge-release-2026-11-05](evidence/knowledge-release-2026-11-05/).
The initial Python inventory parser failed on names containing spaces; it was
corrected against the actual Sphinx format. An initial LoC request timed out;
subsequent search, detail and paging passed. These are retained as failures, not
relabelled successes. Test failures caused by local socket permission were rerun
with loopback networking enabled; no application security setting was weakened.

Final build, test counts, hosted deployment and production verification are
recorded below once completed. Production target is the existing `mybookshelf`
project (`prj_AhxvPVIgw95iofXaWigVNSYF30iP`) in team
`team_mR8QSDMoZBHmT4pjGPuy3KCB`, domain `https://mybookshelf.cloud`.
Pre-release rollback candidate: `dpl_2sgN9LmdusVzujjPhu91BAQihc7m`, production
source `c590a694c341c02b5192207616f352967a0fd1d4`.

Local acceptance: 186 client tests; 565 server tests passed (15 existing
database-dependent tests run in CI with disposable Postgres); TypeScript, build
and SEO passed. All 27 targeted browser scenarios passed in Chromium, mobile
Chromium and WebKit across three reading lights, including axe accessibility,
independent source failure/paging, listening, saving, and 320px at 200% text.
WebKit exposed a native-select overflow; rem-based filter widths corrected it.
An attempted optional Firefox run could not launch in this container; it is not
claimed as passing. Screenshots and the dated validation summary are saved with
the release evidence. Existing approved reading-light, heading, card, rights and
navigation styles were reviewed; the fourth Search scope and source sections
are intentional additions, without a pixel-equality claim.

Preview `dpl_2JZ6PEvPC7gQnCe74mY3bVMHpWRs` (application commit `46a16ce`)
built successfully. Authenticated source-directory verification returned 16
connected sources; hosted query/browser acceptance continues in PR #179.

Hosted preview acceptance, 2026-11-05: all ten new integrations plus OpenAlex
and Europe PMC returned matches and resolved exact native identities (HTTP 200).
WebKit completed real LibriVox search → detail → canonical listening link, then
all-source mathematics (25 results, all 16 sources finished, zero page errors).
Chromium's cloud proxy trust failure was an environment issue; WebKit used the
existing system trust with HTTPS verification intact. No browser trust setting
was changed. Preview account banners reflect its existing configuration.

The older snapshots had expired access observations. Their official metadata
exports/reading-gallery evidence were refreshed and audited: Gutenberg 1,000
records (unchanged identities), OTL 1,910 (+1, no removed IDs, one metadata edit),
Book Dash 30 pinned IDs (unchanged). No full books/art/audio were downloaded.
The existing 24-hour evidence rule still applies; future refresh proposals must
be reviewed/merged to keep these snapshot access labels current. StoryWeaver's
robots endpoint returned HTTP 403; its refresh stopped and the three historical
records remain available only with unclear access shown. It is not counted as a
current free-reading verification. No source account was created.

Results with matches now precede empty or unsuccessful groups. Book editions and
documentation versions are visible on result/detail cards. No datastore, paid
service or account configuration was added.
