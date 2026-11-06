# Production search depth audit — 6 November 2026

Tested all **39 enabled production sources** at <https://mybookshelf.cloud>. **31 returned at least 20 distinct results for one query**, following the same six-item pages as the UI. Three more returned 24 only after enabling the existing unclear-access checkbox. Five sources did not demonstrate 20 even with these diagnostics.

Production stayed at `a9ddc4738699708be1e0ab0e50b232fe4a0fb307`, Vercel `dpl_86RyrJh3wzae8h2ykgWserMAmxfn`, throughout the run. No app behavior, source activation, account, deployment or schedule was changed.

## Results for every enabled source

Distinctness uses returned source record keys, not titles or URLs. Editions/language records remain separate. The count test is not a full relevance benchmark or proof that every possible query has 20 matches. The table keeps one-query results separate from totals collected across queries.

| Source | Best query | Distinct results, one query | Distinct across queries | Result |
|---|---|---:|---:|---|
| O*NET occupation profiles | engineers | 24 | 24 | Pass |
| National Gallery of Art | portrait | 24 | 24 | Pass |
| Art Institute of Chicago | portrait | 24 | 24 | Pass |
| CORE | agriculture | 0 | 0 | Error |
| The Metropolitan Museum of Art | portrait | 24 | 42 | Pass |
| Free Kids Books | the | 21 | 29 | Pass |
| Google Books | mathematics | 24 | 24 | Pass |
| Appropedia | solar | 21 | 21 | Pass |
| Crossref | mathematics | 24 | 24 | Pass |
| OSTI | solar | 24 | 24 | Pass |
| Cleveland Museum of Art | lotus | 24 | 24 | Pass |
| NASA Image and Video Library | Apollo | 24 | 24 | Pass |
| Federal Register | water | 24 | 24 | Pass |
| Internet Archive | history | 20 | 20 | Pass |
| FAO publications | agriculture | 21 | 21 | Pass |
| Lever Press | the | 21 | 21 | Pass |
| Nal’ibali | the | 24 | 24 | Pass |
| LA Referencia | mathematics | 20 | 20 | Pass |
| Open Book Publishers | the | 24 | 24 | Pass |
| Helsinki University Press | the | 24 | 24 | Pass |
| Project Madurai | பாடல்கள் | 24 | 24 | Pass |
| OpenStax | algebra | 6 | 16 | Below 20 |
| Sugamya Pustakalaya | science | 0 | 0 | Error |
| Global Digital Library | the | 22 | 22 | Pass |
| LibriVox | ^Short | 24 | 25 | Pass |
| Library of Congress | history | 24 | 24 | Pass |
| Biodiversity Heritage Library | flora | 23 | 23 | Pass |
| African Minds | the | 24 | 24 | Pass |
| LSE Press | the | 24 | 24 | Pass |
| Mattering Press | the | 20 | 20 | Pass |
| mediastudies.press | the | 15 | 15 | Below 20 |
| punctum books | the | 24 | 24 | Pass |
| Python documentation | read | 24 | 24 | Pass |
| Europe PMC | cancer | 23 | 23 | Pass |
| Wide paper search | mathematics | 22 | 22 | Pass |
| Project Gutenberg | the | 0 | 0 | Below 20; 24 with unclear access |
| Open Textbook Library | introduction | 0 | 0 | Below 20; 24 with unclear access |
| Book Dash | picture books | 0 | 0 | Below 20; 24 with unclear access |
| StoryWeaver | children | 0 | 0 | Below 20; 3 with unclear access |

## Findings and next actions

- **Gutenberg, Open Textbook Library, Book Dash:** default queries returned zero while hiding 527, 205 and 30 matching records respectively. The app expires reading-access observations after 24 hours and hides those records by default. Each returned 24 with `includeUnclear=true`. Mobile WebKit reproduced Gutenberg changing from zero to 24 when the checkbox was selected. Next: preserve searchable bibliographic records while keeping old reading-access claims labelled unknown. Do not simply renew old evidence dates.
- **StoryWeaver:** zero by default for the same freshness reason; three records with unclear access enabled. The deployed starter set has only three language records of one story, so it cannot supply 20. Next: separately expand the verified catalog/integration if desired.
- **OpenStax:** six matches for the broadest tested single query; all 16 deployed records were retrieved across seven searches. The 16-record Math snapshot cannot supply 20.
- **mediastudies.press:** 15 distinct records across the tested queries; no remaining continuation on the completed queries. This establishes the observed result count, not an internet-wide scarcity conclusion.
- **CORE:** production returned a labelled throttle on both attempts, including a retry more than ten minutes later. Anonymous allowance is 100 tokens/day and 10/minute; these tests do not distinguish daily quota exhaustion from another provider-side limiter. No account was created and no access control was bypassed. Next: retry on a quota-reset/recovery trigger or review an existing permitted key.
- **Sugamya Pustakalaya:** app returned 503; its own public search URL independently returned HTTP 503. This is currently an upstream outage. The present app integration also has no continuation beyond its first result page. Next: wait for provider recovery, then address documented pagination.
- **Met Museum:** “portrait” passed with 24. “Buddha” failed at page four after 18 results: the provider search returned ObjectID `38121`, but its object endpoint returned 404, “Not a valid object.” Other IDs on that page returned 200. The app currently discards the whole page on that single stale ID. Next: handle missing individual records without losing valid records/pagination, while preserving the failure observation.
- **LibriVox:** plain broad terms returned zero, and known title “Secret Garden” returned one. The documented prefix query `^Short` returned 24. The source passes the result-count test with its explicit prefix syntax; ordinary keyword behavior needs clearer UI guidance or a supported query translation. Provider documentation: <https://librivox.org/api/info>.
- **Free Kids Books:** “the” needed 12 provider pages to reach 21 title-matched results because the provider searches body text and the adapter filters titles. The initial ten-page attempt returned 18; both attempts remain in evidence.
- Internet Archive, Nal’ibali and BHL showed some overlap between pages. Keys were deduplicated before judging the threshold.

## Evidence and method

Evidence directory: [2026-11-06-production-search-depth](evidence/2026-11-06-production-search-depth/). `pages.jsonl` and `queries.jsonl` retain ordinary search attempts, errors, empty pages, counts, item keys/titles and response hashes. `unclear-pages.jsonl` / `unclear-queries.jsonl` keep checkbox diagnostics separate. `report.json` is the per-source summary. Signed cursors and credentials are not published.

The read-only runner is `python tools/content/audit_production_search.py`. It fetches the current production source list, uses source-specific public queries, follows real signed cursors and stops at the threshold or an observed endpoint/error. It preserves old attempts when resuming. `--source`, `--query` and `--retry` support justified focused checks. Requests are serial and paced; the main source audit finished before follow-ups began. No full book, image or audio bodies were fetched.

Production mobile WebKit exercised Show more to 24 visible cards for NASA and NGA, plus the Gutenberg checkbox path. There were no page errors or horizontal overflow. Real origin responses used the configured proxy/CA trust with TLS verification enabled; the cloud browser itself does not trust the proxy certificate. Three screenshots and browser assertions are saved.

This is a completed test run with recorded failures, not a claim that all 39 satisfy the acceptance criterion. Research scheduling remains paused.
