# Free-content metadata snapshot

`gutenberg.json` contains **1,000 text records**, a bounded subset of the official
Project Gutenberg RDF archive. It is not the complete Gutenberg catalog or a
manually curated collection. It contains metadata and supplied reading/download
links; no book text, PDFs, EPUBs, summaries or cover images are stored.

Source: https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2.
The RDF `cc:Work` declares CC0 metadata
(https://creativecommons.org/publicdomain/zero/1.0/). Item rights statements are
preserved separately; CC0 metadata does not license the books themselves.

The snapshot records retrieval time, mapping version, deterministic revision and
`complete: false`. The UI/API must display partial catalog coverage. Runtime reads
are bundled/read-only; refresh is an offline build/import action:

```sh
python tools/content/import_gutenberg.py --max-records 1000 --output server/data/content/gutenberg.json
python -m unittest discover -s tools/content -v
```

Offline archive imports additionally require the original `--observed-at` time;
reimporting an old file must not silently renew its access evidence. Invalid,
empty, oversized and unexpectedly shrunken imports preserve the active snapshot.
The importer never extracts archive paths into the filesystem.

Observed in this workspace on Node 22.23.4: 1,973,916 bytes, first search about
29 ms, process RSS about 48 MB. These are local measurements, not deployment SLAs.
The first source must stay behind `CONTENT_DISCOVERY_ENABLED` until refresh,
deployment size and final UI/source checks are complete.

**Evidence age (changed 2026-11-11).** A live source observation still expires
after 24 hours. The three bundled public catalogs here (Project Gutenberg, Open
Textbook Library, Book Dash) list public-domain or openly licensed books whose
reading links change slowly, so their import evidence is accepted for **30
days** (`CATALOG_EVIDENCE_MAX_AGE_MS`). Between one and thirty days the API
reports `freshness: "recent"` with `importedAt`, and the search page shows
"Reading links last checked <date>"; the detail page already shows the check
date. After 30 days the links are downgraded to unknown, exactly as before. The
earlier 24-hour rule for these catalogs depended on a refresh being merged and
deployed every day; when the refresh failed, every free book disappeared from
search. An overdue refresh is still never presented as freshly checked.

## Open Textbook Library

`open-textbook-library.json` contains 1,909 records from the official
https://open.umn.edu/opentextbooks/download.csv retrieved 2026-11-01T09:08:56Z.
The source CSV SHA-256 is
`8c6e55eed36f527a0229eb5210c845effca3c578fd508d8da67096c584e4d9a9`.
The discovery page explicitly licenses catalog records as CC0; individual books
retain their supplied licence statement (without an invented version).

The same day's JSON endpoint advertised 2,038 records; this export therefore
does not establish complete website coverage. `complete` stays false. The CSV
omits language: records use `und`, which does not match an English/Hindi/Tamil
filter. Contributor roles are parsed only from explicit `Name - Role` entries.
Reviews and descriptions are discarded. Only supported digital links explicitly
priced `$0.00` can supply reading evidence. A "PDF" label pointing to an HTML
landing page is not exposed as a PDF download; only supplied `.pdf`/`.epub`
file URLs become those download actions. No destination's availability or
licence version is inferred from its hostname.

```sh
python tools/content/import_textbooks.py --output server/data/content/open-textbook-library.json
```

The importer shares bounded atomic snapshot activation and shrink protection.
Offline imports require their original `--observed-at`; age is never renewed
merely by running an offline import. Both catalogs are bundled read-only at
runtime, independently attributed and indexed together, with a combined index
revision bound into pagination cursors. A damaged source does not hide the
other catalog or become a truthful empty result.

## Current refresh and review-only pilot

The current snapshots were fetched again on 2026-11-01T10:24Z through the
candidate refresh pipeline. [The report](../../../docs/research/free-content/evidence/latest-refresh.json)
records unchanged identities/counts and the Gutenberg v2 mapping correction:
omit legacy virtual HTML endpoints that can return 404, use supplied direct HTML
or the catalog landing page, retain supplied working generated ebook formats.
No book-file path was invented. Source metadata still supports 987 Gutenberg
and 1,905 OTL records with current free-reading evidence; these are evidence
counts, not exhaustive host-link or global-rights audits. Current JSON sizes
are 1,831,733 and 2,582,376 bytes respectively.

`children-pilot.json` is an empty review manifest, separate from both catalogs.
It is deliberately rejected for enablement until complete real English, Hindi
and Tamil source metadata is present. See [the review gate](../../../docs/research/free-content/CHILDREN_REVIEW.md).

## Book Dash and reviewed children

`bookdash.json` contains 30 English-language Book Dash edition records from the
public WordPress catalog and original book pages. The source’s English taxonomy
reported 214 entries at review; this is a disclosed subset, not the entire
1,116-entry multilingual catalog. Source-native IDs are pinned after initial
selection so normal refresh cannot remove saved books just because newer books
were published. Roles and public full-book-gallery evidence are retained; no
reading levels, download files or language variants are guessed.

The publisher’s [book reuse policy](https://bookdash.org/re-using-the-book-dash-content/)
specifies CC BY 4.0. No book text or artwork is included here. Source pages are
read sequentially with bounded requests; failures preserve the active snapshot.
The reviewed daily refresh and snapshot audit include this catalog.

`children-pilot.json` now contains three current StoryWeaver records with original
author/illustrator/translator roles, publisher levels, exact original-story
relations and dated review evidence. All three require a free source account;
that condition is explicit, and post-login reading was not tested. The owner
approved including free source accounts on 2026-11-01. Their manifest is rechecked
by `tools/content/refresh_children.mjs`; changed credits, prices or policy stop
refresh. See [the source review](../../../docs/research/free-content/CHILDREN_REVIEW.md).
Source-account credentials, book pages and images are not stored.
