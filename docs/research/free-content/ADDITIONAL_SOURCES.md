# Additional source research and Book Dash delivery

The owner asked Codex to research many other sources on 2026-11-01. This is
Codex-owned work; a publisher feed or a reviewed candidate list is not an input
requested from the owner. [FCD08 #140](https://github.com/ddk220-light/MyBookshelf-web/issues/140)
tracks the next delivered connector and source survey. The [probe ledger](evidence/2026-11-01/additional-sources.json)
records current observations and their limits.

## Connected next: Book Dash

The public WordPress book type exposes source-native edition IDs and an explicit
language taxonomy. The catalog reported 1,116 language-edition entries and its
English taxonomy reported 214 when checked. A bounded **30-English-edition**
subset is now bundled and searchable alongside Gutenberg, textbooks and the
reviewed StoryWeaver set. This does not claim complete source coverage.

The [official catalog](https://bookdash.org/books/) and
[reuse policy](https://bookdash.org/re-using-the-book-dash-content/) state that
Book Dash books are free and published under CC BY 4.0. Original creator roles
are preserved: writer, illustrator, designer, editor and any supplied translator
or photographer. The source supplies no publisher reading level for this
subset; none is inferred. These books participate in ordinary Free to read
searches; the separate EN/HI/TA pilot remains explicitly a reviewed starter set.

The sampled [Let’s Go Looking](https://bookdash.org/books/lets-go-looking/)
reader displayed all 14 supplied book-page images without a source account.
The app flow on phone/desktop verified search → source link → save → reload →
reopen, original credits, and 320px/200% text reflow without page errors. The
app stores metadata and source links; no book text, images or files are stored.
No PDF/EPUB button is invented from a source-files folder or image gallery.

The importer bounds source responses and record counts, spaces requests,
honors bounded source cooldowns, rejects redirects/off-host readers and missing
public galleries/credits, and publishes atomically with shrink protection.
After initial selection, refresh pins the same native IDs. New titles cannot
push an existing saved edition out of the bounded subset. A live second import
retained all 30 identities. Missing pinned metadata stops refresh for review.

```sh
python tools/content/import_bookdash.py --max-records 30 --output server/data/content/bookdash.json
python -m unittest discover -s tools/content -v
node tools/content/audit_snapshots.mjs
```

The daily reviewed catalog workflow includes Book Dash. Positive access evidence
expires after 24 hours; failed refresh never renews stale claims. Catalog search
requires no Redis. The first scheduled run follows default-branch merge and
remains a release check.

## Other sources checked

| Source | Fresh result | Remaining work before connection |
| --- | --- | --- |
| [Wikisource](https://www.mediawiki.org/wiki/API:Main_page) | Public metadata APIs returned stable page IDs in English, Hindi and Tamil. | Resolve redirects, distinguish work/edition lists and transclusions from complete editions, preserve contributors and per-text rights. The sampled Hindi title redirected. Do not treat namespace 0 or HTTP 200 alone as a readable book. |
| [DOAB](https://www.doabooks.org/en/librarians/doab-metadata) | Official OAI-PMH Identify returned the DOAB repository. The librarians page links the current metadata documentation. | Import the documented richer metadata, inspect book/chapter type, licences and supplied reading locations; use exact DOI/handle/ISBN evidence when reconciling OAPEN overlap. The earlier guessed documentation URLs returned 404. |
| [OAPEN](https://library.oapen.org/) | OAI Identify/formats and a 100-record Dublin Core sample worked; sample rights fields include explicit open-access semantics. | Verify current metadata terms, map versions/chapters and individual licences, sample actual supplied full-book links and implement incremental refresh. No download location was inferred from an index-wide label. |
| [African Storybook](https://www.africanstorybook.org/) | Public site loaded. | Review individual story/language/level/credit/licence/reader evidence and a supported export or discovery protocol. Homepage access is not connector readiness. |
| [Storybooks Canada](https://storybookscanada.ca/) | Actual English/Hindi readers loaded with original contributor roles and per-item CC BY 3.0 in the sampled book. | Verify a feed/curation contract and relevant language coverage. The sampled Tamil reader was 404; this does not prove the whole Tamil collection absent. Preserve its licence rather than substituting CC BY 4.0. |
| [Internet Archive](https://archive.org/developers/) | Public advanced search returned text-item metadata. | Inspect per-item files, rights and access. A text item, the opensource collection, a free account and a borrowing entitlement are different facts. Previews/loans remain excluded. |
| [ICDL](https://www.childrenslibrary.org/) | Public homepage loaded. | Verify currently usable individual readers, current permissions/attribution, languages and stable identities; no comprehensive feed has been established. |
| [Let’s Read](https://www.letsreadasia.org/) | Current public language and book-search metadata endpoints responded. | The returned catalog listed zero published Tamil books and Fiji Hindi separately from Hindi; neither establishes reviewed EN/HI/TA coverage. Inspect individual publisher licences/readers before adding a source. |

The next strongest scholarly-book candidates are DOAB/OAPEN, followed by
Wikisource for multilingual editions. They remain researched candidates, not
enabled sources. No paid integration, new reader account or source outreach
was performed. Redis remains deferred for the four existing live paper adapters;
the book catalogs and source research are independent of that setup.
