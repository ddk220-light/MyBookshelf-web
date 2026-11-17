# LIBMAN title follow-up

The original wider sweep attempted 632 connected Indian LIBMAN institutions and reported 457 passes. The strict final review accepts 455 of those original attempts: one had a displayed/resolved title mismatch (`libman:255`), and one was a periodical mislabeled “Book” (`libman:599`). All original attempts in `libman-sweep-results.json` are retained; the sole change to that evidence is the explicit periodical eligibility annotation. A successful HTTP request, a seed-query result, or a matching title alone is not a passing library check.

This follow-up was fixed in advance to eight entries with candidate records but no complete passing attempt: `libman:178`, `libman:181`, `libman:283`, `libman:491`, `libman:515`, `libman:663`, `libman:798`, and `libman:84`. It does not expand the sample to empty-seed entries, foreign institutions, or test tenants. Previously excluded tenant IDs 202, 579, and 708 remain excluded.

After those eight completed, the eligibility review authorized one additional entry, `libman:599`, to replace the journal with an eligible monograph. Its bounded follow-up uses only the seed queries `english` and `mathematics`, with at most four candidate attempts. The journal's original successful API attempt remains visible with `eligibleBook: false` and an exclusion reason.

The strict summary then identified the original `libman:255` title mismatch. A final authorized extension inspected that one original record and replayed it once after correcting the concrete entity-decoding defect. Its original mismatching evidence remains unchanged. The final follow-up therefore contains ten institutions, each with one proven book.

## Observed defects and bounded fix

A serial diagnostic read of each selected tenant's public `science` query on 2026-11-15 found repeated internal spaces in seven tenants' source titles. For example, `Discrete Mathamatical Structure  With Application to Computer Science` contains two spaces before “With.” The displayed title collapses those spaces; the backend's literal phrase search then returns a clean zero for the displayed title. Sanitized diagnostic metadata in `libman-followup-results.json` records only the title, record ID, tenant, timestamp, and HTTP status. Unrelated source fields are not retained.

The existing punctuation handling could also reduce a useful title to a one-letter prefix. `A+ Quizmasters Science` searched for `A`, while `(The) Classic Science Fiction Collection` searched for `The`, leaving the desired record outside the first ten returned rows.

The provider now selects the longest contiguous title segment permitted by the catalog's published input rules. If that search returns an explicitly recognized empty result, it may make one further request for the longest word of at least five characters. That retry retains only records whose complete normalized title equals the original complete normalized title. A search error, blocked response, one-word query, or ISBN query does not trigger this retry. No empty query, all-catalog request, title-only identity join, or unscoped tenant query is introduced.

This repair is demonstrated for the observed English titles. The API's handling of Indic combining marks has not been independently established here. Such queries retain their preexisting first-segment behavior and cannot enter the new retry, preventing a newly generated partial-syllable query. This is a remaining language limitation, not evidence that Indic-title searches work.

For `libman:255`, both public endpoints returned the same raw title, `004.006 DATA PROCESSING AND COMPUTER SCIENCE &amp;amp; CHA`. Search metadata was sanitized once, leaving `&amp;`; record metadata was sanitized once before caching and again when parsed, producing `&`. LIBMAN's metadata cleaner now decodes the observed two entity layers consistently, and a regression verifies equal search/resolved titles for the same record. The final replay uses the original record ID `2765057` and corrected display title. Sanitized source strings and timestamps are retained under `entityEncodingDiagnostic` in the follow-up evidence.

Record resolution still fetches the requested numeric record ID and independently confirms that the same ID appears in the selected tenant's search results. Record IDs and institution scope remain unchanged. The additional request uses the existing operation deadline, response-size limit, robots policy, host gate, and request cap. A small search-results request budget may conservatively decline the extra request; it cannot produce a false absence or a fabricated membership.

## Reproduction and passing criteria

Run from the repository root with the same network setup as the original sweep:

```sh
node tools/catalog-hardening/run.mjs \
  tools/catalog-hardening/manifests/libman-followup.json \
  docs/research/india-library-hardening/libman-followup-results.json
```

For the original eight entries, the manifest retains up to three original candidate record IDs and titles per institution and performs no new seed discovery. The ninth entry uses the two specific monograph seeds described above; the tenth uses only its original record ID and corrected display title. Each requires one passing eligible book and disables extra ISBN checks. One shared host queue enforces at least 1.1 seconds between request starts and the production 60-requests-per-minute cap. A host refusal stops subsequent institutions on that host.

Each passing attempt must complete all of these stages together:

1. Search the candidate's displayed title and return that exact record ID.
2. Resolve that ID through the app's real record-reading budget, retaining the same ID and normalized title and confirming tenant membership.
3. Clear the provider HTTP cache and invoke the actual app catalog lookup with that institution's own record identity. The answer must be `found` with source `live`.

The original failed attempts remain in the original sweep. Follow-up attempts are recorded separately; the summary deduplicates libraries and records rather than adding the retries as additional institutions. The initial `libman:178` sweep also included an artificial zero-request timeout caused by the earlier bulk host-queue budget; this follow-up uses the corrected shared runner and verifies a previously failing title instead of reclassifying the old timeout.

Focused provider regressions cover repeated-space recovery across cache expiry, exact-title filtering of unrelated word hits, useful punctuation segments, consistent double-escaped entity decoding, and refusal to broaden errors, ISBN searches, short queries, or unverified combining-mark fragments. All 18 LIBMAN provider tests pass.

## Observed result

All ten follow-up institutions passed on their first candidate attempt. Seven title checks exercised the bounded word retry; `libman:798` passed with the improved punctuation segment, `libman:599` passed with `Instant English` (record `5531781`), and `libman:255` passed with its consistently decoded original record. Each passed its own title query, record resolution, and cold actual app lookup within the existing budgets. There were no host refusals.

The strict summarizer, run against the original sweep plus the follow-up, counts **465 of 632 institutions with at least one eligible book verified; 167 remain unconfirmed**. This is ten additional institutions relative to the corrected original 455. It is a one-book reliability check, not a ten-book claim for every institution, and unconfirmed institutions are not classified as lacking books.

## Search errors and clean-empty sample (later run, 15 November 2026)

The 20 tenants reported as search errors were `libman:35`, `libman:36` and `libman:348`–`libman:365`. Their errors were not catalog failures. Every discovery query failed in 0–1 ms with `CATALOG_HOST_BUSY`: the original bulk run had exhausted its own per-minute host allowance, so it sent no catalog request for them. [libman-busy-and-empty-sample.json](../../../tools/catalog-hardening/manifests/libman-busy-and-empty-sample.json) reran these 20 with the original seeds and the corrected 1.1 s pacing. **12 now pass.** The other eight (`libman:348`, `353`, `354`, `355`, `360`, `361`, `362`, `363`) returned clean empty results for `science`, `history` and `india`, so they stay unconfirmed.

The same manifest fixed a sample in advance: every 15th of the 147 clean-empty tenants by tenant number, ten in all (`libman:146`, `303`, `460`, `538`, `553`, `568`, `584`, `601`, `785`, `839`). Each was searched with five different seeds: `english`, `mathematics`, `commerce`, `computer` and `book`. All 50 searches returned a recognized empty answer and none errored. Together with the original three seeds, eight common title words found nothing in these tenants. The evidence therefore points to tenants whose public OPAC search exposes no titles, rather than to unlucky seeds. That is still an observation about the public search, not proof that the libraries hold no books: they remain unconfirmed. The remaining 137 were not resampled. See [libman-recheck-results.json](libman-recheck-results.json).

```sh
node tools/catalog-hardening/run.mjs \
  tools/catalog-hardening/manifests/libman-busy-and-empty-sample.json \
  docs/research/india-library-hardening/libman-recheck-results.json --resume
```
