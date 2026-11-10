# Final e-Granthalaya fifty-title audit report

All **5,036 frozen e-Granthalaya libraries have an assessed outcome**. This completes this search audit pass; it does not mean every library found twenty books, that every failed request was repaired, or that any app source was activated.

| Assessed | Working | Needs work | Blocked/deferred | Pending | Total |
|---:|---:|---:|---:|---:|---:|
| 5,036 | 3,135 | 1,901 | 0 | 0 | 5,036 |

## Books and search outcomes

- **1,783 libraries** returned at least twenty distinct native bibliographic records.
- **1,352 additional Working libraries** returned relevant books but fewer than twenty distinct records from the tested titles.
- Of the 1,901 Needs work libraries, **1,890 returned valid empty results for all fifty titles**; **11 have request/setup issues** requiring review. Empty tested searches are not proof that a library has no books. Transport failures and an unrecognized form are not policy blocks or proof that a library is offline.
- **251,600 query outcomes**: 37,426 nonempty, 211,508 valid empty, and 2,666 failed. Failures comprise 2,276 timeouts, 375 HTTP503 responses and 15 responses above the bounded evidence limit.
- Four libraries failed setup before searches: GCPRTG, GIHMCT and GPAMBAD returned HTTP503; CM School of Excellence Barhi had an unrecognized anonymous member form. These 200 unattempted searches are not counted as empty or successful.
- **104,586 returned candidate rows** and **103,168 distinct relevant library/native-record pairs** are preserved. Records in different libraries are counted separately; editions are not merged by similar titles.
- All **2,910 previously unchecked libraries** were assessed; the remaining **2,126** were resampled. Retries and the old offline baseline never add libraries to this count.

## What was tested

Each library used its own anonymous session and fifty fixed Title/Books searches, reading the first native results page (up to 20 rows). Five libraries ran per batch, at least 60 seconds between starts, after the preceding batch settled, with 180-second request deadlines. The exact terms, source dates, native IDs, titles, authors/ISBN where supplied, counts, all returned candidates, failures and evidence references are retained per batch. There is no AI in the request/result loop.

**Item URLs are saved, session-dependent and not individually fetched or verified in this run.** Working means a relevant item returned in the correct member-scoped native search; it does not prove item-link access, borrowing availability or production integration. No production source was removed, hidden, disabled or activated.

## Review the evidence

- [Every library and its outcome](libraries.csv)
- [Needs-work libraries, reasons and next actions](needs-work-libraries.csv)
- [All failed query observations](failed-queries.csv) (setup failures are in the library lists)
- [All per-batch query/result/item/failure CSVs and their SHA256 hashes](artifact-index.csv)
- [Machine-readable final report and artifact map](final-report.json)
- [Independent final validation](final-validation.json)
- [Frozen library inventory and fifty-title query pack](manifest.json)

Each `batches/NNNN/` directory contains `queries.csv`, `results.csv` (ALL returned candidates), `items.csv` (distinct relevant native records), `failures.csv`, summary/validation and the source evidence journal. Follow every sealed/active segment if `journal-index.json` exists. Sanitized HTML is gzip-compressed; both stored-file and decompressed-body hashes are validated. Native URL kind, observed date and evidence references are in the result/item lists.

## Validation and publication

The independent final check reconciled all 5,036 frozen IDs, **1,008 completed batches**, **253,984 response body hashes** (compressed and decompressed), **7,056 indexed artifact hashes**, query/result/item/failure CSV counts and distinct native identities. Original failures, interruptions, recovery history and original source dates remain preserved.

Audit checkpoint `292bb5389a45436404330cc48db5b87dcd30cd49` published the supervisor's consolidated report. This final review adds the plain-language report and review lists. Vercel deployment creation is disabled for this audit branch and `research/**`; the publisher refuses a missing/overridden guard. Skip commit markers alone are insufficient. No Vercel build/deploy/promote was run for this final review. Earlier build-cost containment history remains in [the incident record](vercel-build-incident-20261110.json).
