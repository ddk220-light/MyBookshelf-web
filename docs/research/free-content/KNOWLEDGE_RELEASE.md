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

Local validation checkpoint: 36 client suites / 186 tests passed; server suite
563 passing, 15 existing database-dependent skips before the final cancellation
and directory checks were added (both new checks pass). TypeScript, build and SEO
passed. Final browser and hosted acceptance are still in progress.
