# IndCat verification method

The priority run completed ten books at each of 41 frozen institutions and two
explicit reserves, Roorkee and Anna University: 430 counted books. Separate
ISBN-origin checks returned `found` for 53 cold checks and ten warm baseline
checks. Three material exclusions and one discovery-cache validation failure
remain in the evidence alongside their independently queried replacements.
The [current-provider capture audit](indcat-capture-audit.json) reparses all
434 verified holdings; the [independent audit](indcat-independent-priority-audit.json)
checks all 430 counted books. Both found no outstanding identity/query gaps.
Only 78 counted records have usable explicit monograph leaders; missing or
malformed format metadata remains an uncertainty, with public bibliographic
details and manual material review supplying the remaining book assessment.

The [wider manifest](indcat-wide-manifest.json) completed one book at each of
30 additional institutions, with six separate cold ISBN checks also returning
`found`. Six first-page target misses remain recorded before another candidate
passed. Both the [current-provider audit](indcat-wide-capture-audit.json) and
[independent audit](indcat-independent-wide-audit.json) verified all 30 results.
This gives 73 sampled IndCat institution scopes overall, with the different
ten-book and one-book bars kept separate.

The IndCat runner checks a specific institution's contributed catalog. A pass
requires an explicit title-query POST returning the same record ID, resolution
under the application's record-read budget, selected-institution ownership, and
a `found` result from `createCatalogLookup.lookupBook` for that own-record key.
It does not count union-wide hits or establish whether a copy can be borrowed.

Titles are discovered from the institution's own catalog before they are
queried individually. This measures retrieval of known holdings, not recall
for arbitrary books. Failed attempts stay in the results. The runner clears
its provider cache before each title query; one earlier discovery-cache reuse
remains as a failed validation attempt followed by a separate successful retry.

The own-record lookup follows independently verified live resolution and is
explicitly labeled warm. ISBN-origin checks are separate: later runs clear the
provider cache first, while ten initial baseline checks are labeled warm.
An ISBN check may follow the application's preferred alternate route; the
direct title/record probe remains institution-scoped IndCat. Wider results
record both routes so a direct IndCat pass is not mistaken for verification
of the application's preferred search route. Kerala University in the priority
cohort and Mahatma Gandhi University in the wider sample prefer Vufind for app
search; their direct IndCat proofs do not certify that preferred route.

Explicit MARC serials, unresolved continuing-series records, and one ambiguous
bibliography record are excluded
from the ten-book total. Unknown material types remain unknown. A separate
offline audit reparses every successful holding capture with the current
provider, requires the exact ID in the title-query POST, checks the echoed
query and resolved metadata, and preserves capture hashes. Manual material
review complements the MARC check where leaders are missing or malformed.

## Inputs and replay

Use Node 22 from the repository root. `indcat-run.mjs` defaults to the current
`getAllLibraries()` directory and the committed
[public contribution counts](indcat-contribution-counts.json). The counts were
observed on 15 November 2026 from the participating-institute list at
<https://indcat.inflibnet.ac.in/index.php/main/book>: 434 reported contributors,
of which 407 institution scopes were connected in the directory at collection
time. These are contributed catalog-record counts, not physical collection
sizes. Each row retains only the public code, name, count, and institution URL.
`--directory` and `--counts` optionally accept frozen JSON snapshots.

Run the following commands **sequentially**. Each invocation maintains one
request queue with at least 2,100 milliseconds between starts, respects robots
rules and production lookup limits, and stops after a refusal. Do not run a
second IndCat probe queue at the same time.

```sh
node tools/catalog-hardening/indcat-run.mjs \
  --selection docs/research/india-library-hardening/candidates.json \
  --books 10 \
  --output docs/research/india-library-hardening/indcat-results.json \
  --capture-dir /tmp/india-hardening/indcat-run-captures

node tools/catalog-hardening/indcat-run.mjs \
  --selection docs/research/india-library-hardening/candidates.json \
  --codes ROOR_247667,ANNA_600025 --books 10 \
  --output docs/research/india-library-hardening/indcat-results.json \
  --capture-dir /tmp/india-hardening/indcat-run-captures

node tools/catalog-hardening/indcat-run.mjs \
  --manifest docs/research/india-library-hardening/indcat-wide-manifest.json \
  --books 1 \
  --output docs/research/india-library-hardening/indcat-wide-results.json \
  --capture-dir /tmp/india-hardening/indcat-run-captures

node tools/catalog-hardening/indcat-audit-captures.mjs \
  --input docs/research/india-library-hardening/indcat-results.json \
  --capture-dir /tmp/india-hardening/indcat-run-captures \
  --output docs/research/india-library-hardening/indcat-capture-audit.json

node tools/catalog-hardening/indcat-audit-captures.mjs \
  --input docs/research/india-library-hardening/indcat-wide-results.json \
  --capture-dir /tmp/india-hardening/indcat-run-captures \
  --output docs/research/india-library-hardening/indcat-wide-capture-audit.json
```

Existing completed results are resumed. Use a fresh output path to request a
new live run. Raw pages, cookies, and form tokens are not committed; the offline
audit reads the local captures created by a live run. A clean checkout can
repeat the live method and audit its new captures, but cannot recreate the
historical raw pages from their hashes. Sanitized bounded fixtures preserve
the parser cases used by regression tests.

The wider manifest fixes the next 30 candidate institutions by documented
priority order, excluding the frozen primary institutions and the two explicit
ten-book reserves. It has a lower, one-book bar and is not a census of all 407
connected institution scopes. Roorkee's late size evidence remains a separate
cohort sensitivity; neither reserve replaces a failed frozen institution.
