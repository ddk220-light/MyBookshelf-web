# Indian catalog hardening — 15 November 2026

The completed work is available on `hardening-indian-libraries`, carrying the
runtime and evidence from `harden-india-top50-2026-11-14` (`f29eeda`, `d3ac08a`),
based on `61a3e505bb1f554b5e924752089f49c104068936`. These changes have not been
deployed. Start with [how library access was unlocked](UNLOCKS.md) for the
library-by-library blockers, fixes, measured recoveries and remaining gaps.

The owner requested ten book queries at each of 50 large connected Indian
libraries, including public and university libraries, fixes for broken
integrations, and a subsequent measurement of wider coverage.

**67 institutions have ten verified books each.** The original size-led cohort
finished at **48/50**; National Science Library and IIT Madras remain unreachable
from this environment. The 48 passing cohort members plus the explicitly
separate IIT Roorkee and Anna University reserves provide a working set of 50
large institutions. Neither failed original member was removed from the result.

Outside the frozen cohort, **612 additional catalog connections passed at least
one book**, out of 848 attempted and 1,168 reviewed. This includes the 19 extra
ten-book passes. See [the complete results](RESULTS.md) for the separate
denominators and [coverage.csv](coverage.csv) for every connection.

**e-Granthalaya fifty-title audit, 10 November 2026.** A separate audit searched
all 5,036 e-Granthalaya libraries in the directory for the same fifty titles:
3,135 returned books, 1,890 returned a valid empty result for all fifty and 11
had request or setup errors. The owner decided to leave the 1,890 out of finding
a library until their catalogs show books; they are recorded in
[empty-catalogs.json](../india-library-status/empty-catalogs.json). Since
15 November 2026 the directory offers only allowlisted Indian libraries
([india-catalogs-listed.json](../../../server/data/india-catalogs-listed.json));
every other library still resolves for readers who already chose one. The 11 error cases stay listed.
See [the audit evidence](egranthalaya-audit-20261110/README.md) (summary files
only; per-batch evidence stays on `feat/library-connector-audit`). IUCAA
(`egranthalaya:universities-iucaa`) later passed a one-book check and is listed
again, so 1,889 remain hidden; the same list now also holds 155 LIBMAN tenants
whose latest seed searches were all clean and empty. Per-library status and
revisit dates: [india-library-status](../india-library-status/README.md).

**Local-machine recheck, 15 November 2026.** The 343 libraries the remote test
machine could not reach were tried from a local machine with the same runners,
seeds, pacing and stop rules (`local-20261115-*` evidence and manifests). Seven
of the ten e-Granthalaya libraries that had failed with HTTP 503 passed.
**KALNET is a robots refusal:** its robots.txt is `User-agent: *` /
`Disallow: /` (Crawl-delay 60). The app could not read it because KALNET omits
a TLS intermediate and a failed robots.txt read counts as no restrictions, so
the local KALNET run was withdrawn
([local-20261115-kalnet-withdrawn.json](local-20261115-kalnet-withdrawn.json))
and robots.txt now uses KALNET's validated transport
([robots-audit-20261115-before.json](robots-audit-20261115-before.json),
[after](robots-audit-20261115-after.json)). Somaiya's CloudFront refuses US edges
from both machines, and SCERT Assam's robots.txt disallows `/cgi-bin/`: both
blocked. IDEAL and six single hosts are unreachable from both machines; IIT
Madras and National Science Library publish catalog hostnames with no public
DNS. Goa DHE stays too slow even at the 45 s maximum budget. See the
[status tracker](../india-library-status/README.md#local-machine-recheck-15-november-2026).

## Selection and evidence

[The frozen cohort](candidates.json) contains 50 institutions selected before
their final query outcomes. [Ranking notes](ranking-notes.md) give the source
URLs, dates, collection units, duplicates, and excluded unconnected libraries.
This is a size-led operational cohort, **not a verified national ranking**:
physical collection figures are incomplete and some institutions have only
IndCat contribution counts. Mixed materials and whole-university figures are
explicitly labeled. A failing member stays in the frozen denominator; any
additional reserve is reported separately.

[The readable results](RESULTS.md) and [summary.json](summary.json) are generated from the original `*-results.json`
files. A ten-book pass requires ten distinct titles and catalog records on one
connected route, each with an explicit query match, resolved record, and a
`found` answer from the application's lookup layer. Known magazines or serial
issues are excluded. A reference-only book can pass as a confirmed holding;
that does not claim it is available to borrow. HTTP 200, another institution's
record, an unknown result, and a saved/stored answer cannot qualify.

[Validation and handoff](VALIDATION.md) records automated checks, independent
review, remaining limits, and deployment safeguards. [coverage.csv](coverage.csv)
provides the full sortable connection list.

The books are drawn from each library's own catalog, then queried individually.
This exercises retrieval of known holdings; it does not estimate recall across
the collection or promise that ten arbitrary popular books are held. Failed
attempts remain in the evidence even when another distinct book completes the
ten. Initial runs include warm provider-cache reads after live resolution;
cache conditions and separate cold checks are recorded by the family runners.

ISBN-origin checks are separate from catalog-origin checks. They require an
exact edition match and can fail even when a catalog record opens correctly.
The report does not turn a title similarity into ISBN evidence. Wider
one-book checks are a lower bar than the ten-book cohort and are reported
separately. Wider directory entries may be branches or duplicate institutions;
their count is not presented as a deduplicated institution census.

IIT Hyderabad's ten checks use its supported ISBN workflow. The runner captures
the actual exact-ISBN search and detail responses inside the same app lookup,
proving each target record and resolved title. Its final answer need not echo
a catalog record ID; one answer links to the catalog root. This is explicitly
different from the catalog-record workflow used for most other institutions.
Separate ISBN diagnostics cannot fill a missing main lookup in the summary.

IndCat checks use the institution's connected IndCat route. Kerala University
and Mahatma Gandhi University prefer KALNET for app search; additional default
wrapper checks confirmed that both fall back to IndCat when KALNET's robots
endpoint is unavailable. These results do not certify the preferred KALNET route.

## Adapter and runtime changes

- IndCat retains result authors and briefly reuses institution-and-record-scoped
  search evidence when opening that exact record. This avoids redundant scope
  checks without weakening ownership verification after cache expiry. Explicit
  MARC material types, including prefixed leaders, preserve serial/book labels.
  The [offline capture audit](indcat-capture-audit.json) reparses every counted
  record and checks its independently captured institution-scoped title search;
  raw pages stay outside Git, with hashes and sanitized evidence retained.
- UAS Dharwad uses its native Koha catalog without the obsolete IDEAL branch
  restriction. Koha record authors no longer repeat an outer “By” wrapper.
- Darshan accepts legitimate dollar characters in encrypted catalog IDs.
  Academic ISBN checks stop after an exact positive; incomplete variant
  coverage cannot claim complete copy totals or that every copy is unavailable.
  Darshan's demonstrably incomplete ISBN index cannot prove absence.
- eGranthalaya retries a main-title search after a recognized empty result for
  a displayed title with a subtitle, retaining session, institution, and record
  checks. Full-title failures and the post-fix retest are retained.
  HKMS's measured slow member index uses its known hyphenated ISBN spelling
  first, a bounded 35-second member probe and a 45-second app budget, preserving
  cluster fallback. Cold ISBN probes verify this through the actual directory.
  SRS Central Library and National Medical Library also use measured 35/45-second
  budgets, retaining their original ISBN variant order. Member confirmation
  examines a bounded set of title results and then exact ISBN evidence when
  needed; a union record without this member's holding still cannot pass.
- National Science Library points to its published NISCAIR catalog hostname.
  The former NIScPR hostname failed before a catalog response. Both the correct
  NSL endpoint and IIT Madras remain unreachable from the test environment;
  URL correction alone is not a live-validation pass. See
  [the retained endpoint failures](blocked-results.json).
- Record-read deadlines now cancel the underlying provider work before
  releasing its host slot; reader cancellation also consumes an immediate
  upstream rejection. Host-slot waits use the app's operation deadline, so
  the app's own rate limit produces “busy” instead of a false catalog timeout.
  Santhom retries a bounded title prefix when repeated
  stored spaces make its own displayed title unsearchable, preserving the
  original record fingerprint and filtering the retrieved titles.
- Alternate catalogs now use the platform policy and host guard of the route
  actually called, while retaining the original institution and record keys.
  Per-route request limits sit inside the whole-operation limit. A timeout
  cancels that route before fallback, and host health follows the catalog that
  supplied the answer. This prevents a failed native catalog from damaging the
  retained IndCat connection's health.
- LIBMAN handles useful title segments after punctuation, retries one bounded
  distinctive token after a clean empty phrase result, and filters that retry
  to the full normalized title. Search and detail pages now decode observed
  double-escaped entities consistently. Exact tenant and record checks remain
  required. Indian scripts with combining marks do not enter the new token
  fallback because that upstream search behavior has not been verified.

## Later non-eGranthalaya follow-up

[The connection follow-up](CONNECTOR-FOLLOWUP.md) measures the remaining
non-eGranthalaya families with one-book checks under the same pass rule:

- **IndCat:** 325 of the 327 untested scopes pass.
- **Koha:** 20 more connections pass, and the 308-member host stops are
  explained.
- **VuFind:** all 130 are refused or unreachable from this environment.
- **LIBMAN, community and Visakhapatnam:** recovered entries.

It repairs Visakhapatnam's app lookup and two link-only Koha directory
entries, and lists every refused or unreachable host with its IDs in
[connector-host-diagnostics.json](connector-host-diagnostics.json). The run
sent 2,879 live requests ([ledger](request-ledger.json)). The regenerated
[RESULTS.md](RESULTS.md), [summary.json](summary.json) and
[coverage.csv](coverage.csv) include these files.

## Family evidence

- [IndCat method and replay commands](INDCAT.md), with independent public
  bibliographic audit evidence and retained exclusions.
- [Koha method and replay commands](koha-method.md), including shared-host
  refusals and the distinction between warm and cold checks.
- [Academic catalog method](academic-notes.md), including alternate-route
  identities, incomplete ISBN indexes, and independent wider checks.
- [Community coverage](community-coverage.json), with all attempted member
  scopes and the distinction between union titles and local holdings.
- [LIBMAN method and replay commands](libman-method.md), including all 632
  additional tenants, the bounded defect follow-ups, and explicit material
  exclusions.
- [eGranthalaya method and replay commands](egranthalaya-notes.md): original,
  confirmation, canonical-title and cold ISBN runs remain separate files.
  Provider timeouts remain in force: diagnostic title discovery may take longer
  than the actual book-page lookup budget.

The wider checks measure observed coverage after the changes. They are not a
before/after uplift estimate: many connections already worked, and a complete
baseline sweep was not collected. A clean empty result for the chosen seeds is
unconfirmed coverage, not proof of an empty collection or a broken adapter.

## Reproducing checks

Use Node 22 from the repository root. These runners make anonymous public
catalog requests. Run only one queue per shared catalog host. Robots rules,
rate limits, refusal responses, edition identity, and production lookup budgets
remain in force. Do not run thousands of tests in parallel or retry around a
catalog restriction.

```sh
node --test tools/catalog-hardening/*.test.mjs
node tools/catalog-hardening/summarize.mjs
node tools/catalog-hardening/run.mjs manifest.json results.json --resume
```

The generic manifest is an array of library IDs or an object with `libraries`:

```json
{"libraries":[{"libraryId":"libman:9","required":10,"maxAttempts":18,"checkIsbn":true}]}
```

Use the provider-specific runners in `tools/catalog-hardening` for replay IDs,
catalog-specific discovery, or precise capture/queue requirements. Their
headers document arguments. The LIBMAN sweep manifest explicitly excludes
foreign/test tenants and records that its geographic classification comes
from the app directory. A shared-host refusal stops further requests there.

The evidence contains only deliberately chosen public bibliographic queries,
record IDs, observations, and operational timings. Raw pages, session cookies,
and form tokens are not committed. Small sanitized fixtures cover demonstrated
adapter defects. Run timestamps are observations, not guarantees of future
catalog uptime or current physical stock.
