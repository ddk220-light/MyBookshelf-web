# Independent continuation QA

Reviewed 15 November 2026 UTC against saved responses and current provider code. This is an offline research review: no live catalog calls, application edits, configuration changes or deployments. The earlier [adapter report](adapter-readiness.md) and its aggregate replay files describe the **first-pass snapshot**, not the final continuation inventory.

## Pakistan

The normalized findings contain **10 selected institutions/networks and 2 reserves**, with **12 actual observed query successes**. NDU replaces UMT in the selected ten. UMT remains an observed success with an explicit automation prohibition; moving it to reserves does not erase either fact. Sindh Agriculture University is the second reserve. Individual branches, editions and returned records are not counted as additional institutions.

- **Punjab:** the saved POST response contains 12 results and an actual anchor to `http://111.68.103.2/opac/Detail.aspx?MFN=181711&LibId=67&FRM=`. The saved detail identifies *Pakistan the formative phase 1857–1948*, Khalid B. Sayeed, MFN181711, ISBN9780195771145 and accession284990. This establishes a stable observed record mapping; it does not establish circulation status. The inventory preserves the exact saved POST payload, including ASP.NET hidden fields. A future adapter must GET fresh hidden fields and explicitly support the official cross-origin detail URL; the saved transient payload alone is not a durable request recipe. No identifier was inferred from the separate newer PHP search cards. [Search response](pakistan/evidence/continuation/pu-old-title/response.html), [request metadata](pakistan/evidence/continuation/pu-old-title/response.json), [detail](pakistan/evidence/continuation/pu-detail/response.html).
- **NDU:** the saved title response says four records and includes a link to record82880. Its detail says 2023 Oxford University Press, catalog edition `4rd`, `Available Yes`, accessions51342 and52875. This is public catalog evidence, not permission to borrow. The official HTTP origin has saved404 robots; prior HTTPS503 observations are retained separately. The reported105,000 printed books and26,067 ebooks are separate categories in the dated Fall2026 prospectus excerpt. At review time the package contained a source excerpt, not the original PDF response; the numerical source remains less independently reproducible offline than the query evidence. [Search](pakistan/evidence/continuation/ndu-title/response.html), [detail](pakistan/evidence/continuation/ndu-detail/response.html), [prospectus excerpt](pakistan/sources/ndu-prospectus-excerpt.md).
- **Sindh Agriculture University:** the saved query returned42 results; record4157 has `Reference Section`, `Available`, barcode54046 and call631.8 HAV. Official rules say reference books are non-loan. Current Koha record-parser replay correctly retains the reference restriction, as documented below. The undated “hundreds of thousands” mixed-volume claim is not converted into an exact book count or used to outrank the selected ten. [Record](pakistan/evidence/continuation/sau-title/record.html), [rules](pakistan/evidence/continuation/sau-rules/response.html).
- **Policy/count qualifications:** NUML's robots result remains unresolved; all selected entries retain no claim of policy clearance or deployed integration. Punjab's583,777+ figure is qualified as a December2020 mixed central-library collection including manuscripts and bound journals; the56 departments are not56 additional verified integrations.

### Additional SAU parser replay

Read-only command, run from the repository root:

```sh
MYBOOKSHELF_REPLAY_DEPENDENCIES=/tmp/mybookshelf-international-replay \
  /workspace/mybookshelf-cloud/node-v22.23.4-linux-x64/bin/node \
  docs/research/international-libraries/2026-11-14/adapter-tools/replay-koha.mjs \
  record \
  docs/research/international-libraries/2026-11-14/pakistan/evidence/continuation/sau-title/record.html \
  4157
```

Observed at `2026-11-15T07:14:50.403Z`; selected output retained here:

```json
{
  "recognized": true,
  "book": {"recordId": "4157", "title": "Soil fertility and fertilizers", "publishedDate": "2005"},
  "availability": {
    "outcome": "unknown",
    "totalCopies": 1,
    "notForLoanCopies": 1,
    "loanRestriction": "not_for_loan",
    "callNumber": "631.8 HAV",
    "format": "Reference Section"
  }
}
```

This proves parser recognition of the saved response only. SAU's restriction occurs in the item type, which the current parser reads. It does **not** resolve the previously demonstrated MMSU defect where `Room Use Only` appears only in the ignored Notes column. The isolated dependency directory contains the project's locked `isbn3` package; it is an environment prerequisite, not a committed artifact.

## Bangladesh

The findings and collection-updates file agree: **10 selected targets and 1 reserve**. The continuation's four collection updates match their stated evidence quality:

| Institution | Verified source content | Required interpretation retained |
|---|---|---|
| KUET | Direct official HTML says more than50,000 books and9,475 ebooks separately. |50,000 is a lower bound; ebooks are not added; titles versus copies is unspecified. |
| CUET | Saved indexed official excerpt says more than52 thousand hard-copy books. | Indexed official evidence only; direct200 HTML lacked that content; not a directly confirmed current count. |
| RUET | Direct official news is dated2August2025 and says nearly40,000 books. | Approximate count, not an exact current census. |
| Jagannath | Direct Prothom Alo HTML contains Bengali `৩১ হাজার ৩২৬টি` central-library books and JSON-LD `datePublished=2025-10-19T20:49:25Z`. |31,326 books; secondary source,20October2025 Bangladesh local date; official physical total remains unknown. |

The dossier labels nine targets with official count evidence and one with secondary evidence. Of the official sources, CUET and IUB are indexed rather than directly observed counts. Comparable print units and dates are not established across all ten, so the numerical order is an approximate shortlist aid, not a national size ranking. IUT's52,000 figure remains correctly identified as shelf capacity; BANSDOC's113 participants remain a journal-network statistic, not113 book-catalog integrations.

[Collection updates](bangladesh/collection-updates.json), [KUET response](bangladesh/evidence/continuation/kuet-size.html), [CUET indexed evidence](bangladesh/evidence/continuation/cuet-size-indexed-source.json), [RUET news](bangladesh/evidence/continuation/ruet-size-news.html), [Jagannath metadata](bangladesh/evidence/continuation/jagannath-size-secondary.json), [Jagannath original HTML](bangladesh/evidence/continuation/jagannath-size-secondary.html).

## Indonesia

The final country findings retain **10 selected targets and 1 reserve**. The new UI entry is explicitly **Fasilkom faculty only**; it does not claim to verify the inaccessible central UI catalog or inherit the university-wide collection estimate.

- The saved LONTAR search says3,559 documents and actually includes *Introduction to Natural Language Processing* by Jacob Eisenstein as its second row. The count is correctly labeled a broad mixed-document result count, not3,559 exact-title books. The homepage's12,034 Buku count is faculty book-category catalog records, not physical copies. The record57139 detail shows a photocopy item and return date2027-05-02; findings do not advertise it as currently available. The Gazdar detail's repeated item91/1023 is correctly identified as one distinct item, not two copies. IDs retain `lokasi=lokal`. [Search](indonesia/continuation-evidence/ui-computing-specific.html), [Eisenstein detail](indonesia/continuation-evidence/ui-computing-detail.html).
- New size evidence is explicitly differentiated: Brawijaya68,152 historical2018 book titles; ITB228,393 mixed-format titles/238,246 copies in2009; Padjadjaran62,708 historical central-library copies; Diponegoro17,598 titles/31,715 copies for one faculty through2024; UIN124,281 Buku with unit/date ambiguity. Saved source text supports those figures. None is promoted to a comparable current university-wide book total.
- UIN's SRU title result remains a real observed search, with stable-record identity unresolved. UGM's new GET response is correctly rejected as an unchanged homepage. Alternate Padjadjaran frontends remain one institution. All normalized query and non-null size-evidence paths exist.

## Nigeria

Final findings contain **6 selected targets and 4 reserves**, totaling **10 observed successes**. The four additions all have actual returned books in saved responses:

| Reserve | Raw response supports | Qualification retained |
|---|---|---|
| NISER | *Nigeria: Crisis and Beyond*, John Oyinbo, record819, shelf13, classification966.9OYI. | No circulation status. About18,000 bound volumes is a January1972 observation published in1973, not a current total; the13K+ external-resource counter is not print holdings. |
| Ekiti / Bishop Gabriel Oloniyo library | Title query redirects to record50, *English for Business Communication*, barcode2026-0050, Available. | Current physical collection size unknown; one verified OPAC branch, not all state libraries. |
| Mountain Top University | One returned result, *Introduction To Conflict Resolution*, record9204, item09907, Available. | Current OPAC says Lopac; an older Koha claim does not establish current software. The11,722 facet is not an audited book count. |
| Federal University Lokoja | Title query redirects to record11, *The Wiley-Blackwell Companion to Sociology*, item2026-0014, callHM561THE, Available. |9,000 titles is from2019; observed catalog coverage is sparse, and alternate Koha host belongs to another tenant. |

Six inherited nested size-evidence paths in Nigeria findings initially resolved relative to child folders rather than the country folder. The owner corrected the five NISER PDF/text paths and Lokoja's source path; query/detail paths were already valid. This was an evidence-navigation issue, not a false search success.

The saved Mountain Top robots policy was independently evaluated using the app's current `robotsRules`/`robotsAllowed` for `mybookshelf`: the actual title query and `/record/9204` are allowed; a `branch=` variant is denied. A `sort=` variant is **allowed by the current parser** because `Allow: /search` and `Disallow: /*?*sort=` tie at seven non-wildcard characters and Allow wins. The source nevertheless explicitly lists the sort exclusion, so the dossier's conservative instruction to avoid branch/sort facets remains appropriate. No counted query used those facets. This nuance is not a finding that all facet routes are permitted for an integration.

## Philippines

Final findings contain **10 selected institutions and 2 smaller public reserves**. The ten selected institutions use **8 primary catalog endpoints**; institution counts and endpoint counts are intentionally different. Imus and Butuan remain real observed searches after LST/AIIAS replace them in the selected shortlist.

- **LST:** saved POST data contains `SearchData=Confessions of Saint Augustine`. Its actual response contains two related titles by Ryan Coyne and John Peter Kenney; it is not an exact edition of Augustine's *Confessions*. Saved detail70459 confirms Kenney's *The mysticism of Saint Augustine*, Routledge2005, ISBN0-415-28833-9 and an available LST holding. The four historical checkouts are not four copies. Later empty200 responses remain recorded as reliability failures, not zero results. The official library overview directly supports approximately113,000 mixed book/periodical volumes. This is LST's library, not proof of access to Ateneo's Rizal Library.
- **AIIAS:** saved JSON explicitly reports five hits and contains book resource502930612, hostBibliographicId328641, *Research design : why thinking about design matters*, ISBN9781544350899. Saved detail separately confirms Julianne Cheek/Elise Oby and SAGE2023. Copy availability remains unknown; the circulation holding and barcode are not a live loan-status response. The direct admissions page says about70,000 volumes; the more-than70,000 book-volume statement is separately attributed to the dated academic bulletin, whose retained PDF response is partial.
- Both new catalog origins have saved404 robots and continue to carry no permission-clearance claim. Public search is not unrestricted borrowing; LST and AIIAS visitor restrictions remain documented. The earlier MMSU Notes-column defect still applies.

## Inventory generator and final package

Reviewed [build-inventory.py](build-inventory.py) statically. First executed only its Bangladesh/Pakistan normalization loops in memory; after all country owners finished, executed the full normalization and output-object construction while excluding every file-writing statement. The independently generated object exactly matched the saved `verified-searches.json`. No generated file was overwritten by this review. Punjab's normalized POST payload equals its saved request metadata exactly.

| Country | Selected | Reserves | Total observed |
|---|---:|---:|---:|
| Bangladesh |10|1|11|
| Pakistan |10|2|12|
| Nigeria |6|4|10|
| Philippines |10|2|12|
| Indonesia |10|1|11|
| **Total** |**46**|**10**|**56**|

All56 query rows passed HTTP200/nonempty-book/evidence-existence assertions. All POST searches retained payloads; ITS's POST detail evidence exists. All rows retain `product_integration_completed=false`. The selected shortfall is precisely `{"Nigeria":4}`. Root report, inventory and handoff counts agree. LST must remain explicitly described as a query returning related books, without exact-edition matching or reliable repeated-search claims.

The generator counts institution/network rows, not result counts or branches; separates selected, reserve and total observed counts; computes selected shortfalls dynamically; preserves POST payloads; keeps ITS detail as POST request evidence; and documents country-relative versus inventory-relative paths. It explicitly sets product integration false. It does not infer a positive result merely from a query URL: it requires HTTP200 plus nonempty titled returned records and existing evidence paths. Those assertions are necessary bookkeeping checks, while raw-response inspection remains the evidence of actual returned books.

Code review found no blocking count/payload defect in the final inputs. Future additions still need human review: unique row IDs do not detect two aliases for the same institution; existence checks do not validate raw content; result counts can include broad matches/editions and are not additive coverage.

## Final corrections after review

The country owner normalized all twelve Philippine `query` fields to exact submitted text, preserving filter annotations separately in `query_note`; URLs and payloads did not change. The root generator now carries that note into JSON/CSV and rejects unrecognized recommendation values consistently across all countries. Regeneration retained 56 observed, 46 selected and 10 reserves.

The parent subsequently retrieved the complete official NDU prospectus (HTTP 200, 5,840,307 bytes) and verified 105,000 printed books and 26,067 ebooks directly from extracted PDF text. This resolves the excerpt-only source limitation above. It also corrected the web tool's zero-based page references: the catalog URL is on PDF page 150 (printed 148), and the collection table on PDF page 151 (printed 149), using one-based PDF numbering. [Complete PDF](pakistan/sources/ndu-prospectus-fall2026.pdf), [request/hash metadata](pakistan/sources/ndu-prospectus-request.json), [extracted pages](pakistan/sources/ndu-prospectus-pages150-152.txt). The root report explicitly retains LST's related-book rather than exact-edition result and unresolved reliability.
