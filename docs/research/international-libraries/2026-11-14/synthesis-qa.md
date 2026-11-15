# Independent synthesis QA

This document records the first-pass review before the follow-up added and replaced candidates. Its 47-observation snapshot is historical. See [continuation QA](continuation-qa.md) and the [current inventory](verified-searches.json) for the final counts and evidence review.

Reviewed all five country reports/findings, the root README, verification method, adapter-readiness report and `verified-searches.{json,csv,md}`. This was an independent consistency review of saved evidence and claims, with no new live requests and no edits to other country files.

## Result

The normalized inventory contains **46 selected institutional/network targets plus one Bangladesh reserve**, with **47 unique country/ID pairs**. All 47 entries have HTTP 200 observations, query URLs, timestamps and existing primary evidence files. Every POST search has a payload. CSV contains 47 rows and agrees with JSON.

| Country | Selected successful targets | Qualification retained |
|---|---:|---|
| Bangladesh | 10 | ADUST is an additional reserve. Six targets have published count evidence; four use institutional proxies. |
| Pakistan | 10 | UMT's observed query succeeded but automated search is explicitly robots-blocked. Punjab lacks a stable record identifier. |
| Nigeria | 6 | Four major-priority targets plus KASU/NIALS; four further successes are needed against the requested ten. |
| Philippines | 10 | Eight primary endpoints for ten institution lookups. NLP/UP/CHED share eLib; DOST uses ScINET as primary proof and is counted once. Imus/Butuan are smaller public pilots. |
| Indonesia | 10 | Ten institutions/networks, all Java-based. UIN Sunan Kalijaga has a real book response without a stable identifier/deep record link. |

These totals measure observed book-query success, not national size ranks, current borrowability or production integrations. No country established a comparable national largest-ten ranking. Zero product integrations were completed.

## Actionable items at final inventory review

1. **ITS Indonesia's record link needs POST labeling.** In `verified-searches.md`, the returned book links to `/opac/index.php?go=detil` as though it were a GET deep link. The country evidence says the detail request requires POST `id=007557411X`. Label it “POST detail” and link the request evidence/payload instead, or include an explicit request contract in normalized JSON.
2. **Normalize or document nested evidence-path bases.** The master JSON prefixes `evidence_files` with the country folder, but nested paths such as `scale_evidence.evidence`, `returned_books[].detail_evidence` and robots/adapter evidence retain country-relative paths. Consumers should not have to guess their base. Prefix them consistently or clearly state they resolve relative to `country_findings`.
3. **Expose achieved counts in the main README.** The index prominently states 46 selected plus one reserve and Nigeria's shortfall. At review time the README deferred that result to a “final inventory” without linking it or displaying attained counts. Add the inventory link and country counts near the beginning so the landing page is self-contained.
4. **Optional: preserve count notes in the compact index.** ITB's 69,533 is a broad-token result display, and IPB reports total86 while returning three rows. Both qualifications are retained in country findings/integration notes; a `result_count_note` column/field would make the flattened numeric column harder to misread.

## Passed interpretation checks

- “Largest” language is qualified and large blocked candidates remain visible. Mixed collection units, historical counts and institutional proxies are not summed into a national market estimate.
- PASTIC's 193 entries/41 hosted catalogs and PakCat's 157 overlap; BANSDOC's 113 participants concern journals; OneSearch's 4,215 institutions concern metadata aggregation. NOUN's 42 and DSWD's 17 are branch/unit selectors. None manufactures extra verified institutions.
- Philippine eLib's institution attribution is explicit. DA zero-result searches do not count. The selected UP record proves Diliman Engineering, not every UP campus. Ten institutions versus eight endpoints is correct.
- Public catalog access does not become unrestricted building entry, borrowing or licensed full text. Old eLib transactions do not become current circulation status.
- The combined findings preserve UMT's block, OAU/NUML/State Bank unresolved policy observations, MMSU Room Use Only, Lagos/Benin unknown local availability, ITB weeded and ITS stored copies, and IPB unresolved holdings.
- LMS evidence retains its denominator and scope: Philippine accessible HEI websites, Nigerian federal-university respondents, Pakistani regional university sample and historical Indonesian SLiMS registrations. No national market-share comparison is asserted.
- Query success, offline parser compatibility and app rollout remain separate. Proxy failures are not labeled nationwide outages. Zero-result pages and challenges are not successes.
- The verification method now explicitly handles missing stable identifiers; Punjab/UIN limitations remain visible. The root “contracts” wording was clarified to adapters and response verification.

## Link and artifact checks

The ten malformed Bangladesh record links were fixed in that report and its generator. Subsequent scans of all five country reports, README and combined Markdown index found **no malformed external Markdown links**, including angle-bracketed destinations. Local Markdown targets in the reviewed reports existed. Primary evidence files and country-findings files referenced by all 47 normalized rows existed. The nested-relative-path ambiguity above remains a schema documentation issue rather than missing country evidence.

Review completed at 2026-11-15T06:33:37.069929+00:00.

## Resolution of review findings

The parent agent resolved the review findings before delivery:

- ITS's detail is explicitly labeled POST-only in the query inventory, with the saved request linked and its `id` payload retained in JSON/CSV.
- `path_conventions` documents inventory-relative versus country-relative evidence fields; every row includes `source_path_base`.
- The main report now opens with 46 selected successes plus one reserve, includes country counts and Nigeria's four-target shortfall, and links the complete inventory.
- Original result-count qualifications are preserved as `result_count_note` in the normalized data, including broad-token and visible-row limitations.

Final local verification passed: 47 unique institution/network rows including the reserve; 46 selected; country counts 10/10/6/10/10; CSV and JSON counts agree; all primary evidence files and local Markdown links resolve; ITS POST-detail metadata and presentation agree. No new live requests were needed for these reporting corrections.
