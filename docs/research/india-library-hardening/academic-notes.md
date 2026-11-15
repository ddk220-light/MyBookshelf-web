# Academic catalog hardening evidence

These checks cover the academic adapters and IIT Hyderabad's public Koha API.
They do not establish a ranking by collection size. An institution and its
alternate catalog are counted once; Mizoram University's TotalIT route is an
alternate of `indcat:indcat-mizu-796012`.

## Completed results, 15 November 2026

| Institution | Complete book checks | Qualifying route |
| --- | ---: | --- |
| IIT Hyderabad | 10 | Public API ISBN search and record-owned ISBN |
| Mizoram University | 10 | Directory entry's preferred TotalIT alternate |
| IUST — Rumi Library | 10 | SOUL title search and scoped record |
| Darshan University | 10 | Public title search and scoped record |
| Baba Mastnath University | 10 | Public ASP.NET title search and scoped record |

The wider sweep verified one complete book lookup at **33 of 39 additional
institutions**. These are post-change coverage observations; they do not prove
that all 33 were previously broken. The six unverified entries remain separate:

- S. P. Jain College: the app's robots policy refused the catalog request.
- B. N. College's Librarika catalog: a public access challenge.
- St. Joseph Engineering College: a repeated cold lookup exceeded the app's
  20-second budget; a preceding successful title search alone took 21.4 seconds.
- SRMS scopes 3, 5 and 12: no records for the three generic search seeds or
  three relevant engineering, business or nursing subject seeds respectively.
  This does not prove their collections are empty or their adapters broken.

The latter retries are preserved in `academic-wider-retry-results.json` and
`academic-sjec-retry-results.json`. No access restriction was bypassed. The
academic provider regression suite passes all 29 tests, and each portable
runner passed a fresh one-book live smoke check.

## What qualifies

The title route requires a live query containing the chosen book, the same
catalog record ID, explicit resolution of that ID, and a live app-layer
`found` answer. The ISBN route requires the requested ISBN in the institution's
own search and detail responses and a live `exact_isbn` app answer. A reachable
homepage, an unrelated union-catalog hit, or an unverified title match does not
qualify.

`academic-complete-results.json` is the qualifying academic evidence: every
attempt has an explicit same-record title search and observes record resolution
inside that same cold app lookup. It uses the real directory entry, including
Mizoram's prefixed alternate-route IDs. `academic-iith-results.json` is the
qualifying ISBN-route evidence. Stages are never combined across attempts.

IIT Hyderabad's ten checks exercise an ISBN entered by a user, rather than an
own-record lookup. Their same-attempt API captures prove that the requested
ISBN belongs to the returned search rows and fetched detail records. For
example, ISBN `9788122427233` returned records `59750` and `90`; detail record
`90` was `Engineering Optimization :` and explicitly listed that ISBN. The
three-request cold app answer was live `found` with `exact_isbn` evidence.
That answer links to the catalog root because the adapter aggregates matching
records, and ISBN answers do not echo an own-record ID. The captures establish
the requested edition's holding; they do not identify which matching record
supplied the available copies.

`academic-results.json` records the initial exploratory pass through each selected
institution's provider and `createCatalogLookup`. Its academic records are
catalog-owned work checks; its IIT Hyderabad rows are exact ISBN checks.
`academic-isbn-results.json` and `academic-mizoram-isbn-results.json` add new,
explicit same-record search and resolution evidence, linked by library ID and
record ID, and separate cold ISBN checks where a valid ISBN is exposed.
Original app checks and later identity checks retain their separate timestamps;
they are diagnostic evidence and do not independently qualify a library.
`academic-iith-results.json` captures the actual public API ISBN and detail
responses used by a fresh app lookup. `academic-wider-results.json` is a separate
one-book smoke test, not a ten-book qualification.

## Changes supported by live evidence

- Darshan's encrypted record IDs legitimately contain `$`. A public `India`
  search included `O$$Sel08eL0=` and previously failed as a whole with
  `CATALOG_UNRECOGNIZED`. Search parsing and detail enrichment now accept this
  observed character while preserving origin/path validation and URL encoding.
  A reduced public row is saved as `darshan-dollar-id.html` with a regression.
- A record-owned exact ISBN now finishes the query before another equivalent
  ISBN-10/13 session is started. Every returned candidate in the current
  response is still examined. Unqueried variants prevent complete copy totals
  or an assertion that every copy is unavailable, including at a named location.
  Duplicate location names are merged conservatively. Empty searches still need
  both equivalent variants where the catalog supports reliable negatives.
- Darshan's ISBN index can return empty for both normalized variants even when
  the exact ISBN appears on a matching detail page. Observed examples are its
  `Ignited Minds` and `India 2020` records, both exposing `9780140278330`.
  Such an empty ISBN search now stays unconfirmed. Title recovery must still
  prove the requested ISBN from the matching detail page.

The early ISBN experiments imposed an extra six-second inter-request gap.
Timeouts in those experiments are **not** evidence of a production timeout:
the production academic policy allows ten requests per minute without that
extra gap. Subsequent evidence uses the normal app gate and robots policy,
with bulk-probe waits outside reader lookup deadlines. The ISBN optimization
reduces requests; the observed strict-spacing timeouts are not used to claim
a default-production failure.

## Alternate-route execution

The directory can identify an institution through IndCat while its preferred
catalog runs on a different host and platform. Reader operations now apply
each contacted route's rate, request, deadline, concurrency and circuit policy.
Nested route requests also consume the overall operation allowance; parallel
ISBN/title calls cannot reset a route's allowance or deadline. The route's
request is cancelled before its host slot is released. Existing fallback order
and institution-scoped record IDs are preserved.

Health is recorded against the actual host. An academic alternate's failure
cannot open IndCat's circuit, and a final holding answer is attributed to the
route that supplied its evidence. Metadata reads accept the known scoped
record ID to select the same route budget as an availability lookup. Existing
callers that supply only a read callback retain their original overall budget.

Fourteen route integration regressions cover these behaviors, including
strict record availability, primary fallback, competing successful routes,
shared caps/deadlines, and cancellation. The combined catalog-lookup, provider,
public-router and holdings suite passes **462/462 tests**. A second agent
independently reviewed the integration and passed its 85-test focused run.

`academic-route-verification-results.json` records a fresh cold Mizoram check
at 07:39:57–07:40:04 UTC on 15 November: the chosen title returned its same
scoped ID, `readRecord` resolved it, and the cold lookup returned live `found`
in three requests. All requests used `14.139.209.219`, with the academic
ten-requests-per-minute policy and released host slots. The recorder retained
Mizoram's canonical institution ID and attributed the result to the actual
academic host/platform. The probe blocks other hosts before network access;
no IndCat fallback was needed. This repeat verifies runtime behavior and does
not add another institution or distinct book to the coverage count.

The app's default Kerala University and Mahatma Gandhi University routes were
checked separately at 07:49:31–07:49:55 UTC. Both prefer the KALNET VuFind
catalog. Its `/robots.txt` returned HTTP 503, so the app temporarily refused
catalog access under its existing policy. This is a policy refusal following a
server response, not evidence that a robots file explicitly bans the app. The
same cached policy applied to both institutions; no KALNET catalog request was
sent after the refusal.

In both cases the real provider wrapper fell back to IndCat. A title search,
same-record resolution, and cold live `found` lookup passed for Kerala record
`1114053` and Mahatma Gandhi record `105501`. Each retained its institution
scope. `academic-preferred-route-results.json` preserves the preferred-route
errors, fallback results, and actual HTTP/recorder traces. These supplemental
route checks are excluded from coverage totals. The ten-book IndCat evidence
does not prove that the preferred KALNET catalog is available; since it was
unavailable under the app policy, no ten-book KALNET expansion was attempted.

## External limits

IIT Madras could not be tested from this execution environment. HTTPS requests
to `webopac.iitm.ac.in` failed at the proxy before reaching the library. The
officially documented public origin `http://webopac.iitm.ac.in:8080/` was also
blocked: its robots request returned an Envoy HTTP 403, `No approved upstream
IPv4 address`, on 15 November 2026 at 06:35:51 UTC. This is an environment block,
not catalog absence. No direct-catalog success is claimed, and no alternate
institution such as IIT Mandi is substituted.

Many academic records do not expose a valid ISBN. Their own catalog identity
can establish a work-level holding; that does not imply arbitrary external
book metadata or every edition can be checked. An upstream SOUL HTTP 500 on an
unmatched query remains a failed check, never a negative holding answer.

## Reproduce the academic checks

From the repository root with Node 22:

```sh
node tools/catalog-hardening/academic-run.mjs --output /tmp/academic-repeat.json
node tools/catalog-hardening/academic-wide-run.mjs --output /tmp/academic-wide-repeat.json
node tools/catalog-hardening/academic-iith-run.mjs --output /tmp/academic-iith-repeat.json
node tools/catalog-hardening/academic-route-check.mjs --output /tmp/academic-route-repeat.json
node tools/catalog-hardening/academic-preferred-routes.mjs --output /tmp/academic-preferred-repeat.json --kerala-count 10
```

The first three accept `--manifest path.json`. The first defaults to
`tools/catalog-hardening/manifests/academic-ten-books.json`, containing the four
academic institutions and ten observed scoped record IDs each. Its optional
`--concurrency` is 1–3; shared-origin manifests require 1. The wider runner
defaults to `academic-wide.json` and runs sequentially, including when colleges
share an origin. Wider entries may provide up to six subject `queries`.
Output checkpoints replace the file atomically. These scripts read public
catalogs only; they do not use production databases or deploy anything.
The IIT Hyderabad runner uses `academic-iith.json` and preserves actual public
ISBN search and detail response summaries inside each attempt.
The route check uses one fixed observed Mizoram book and also captures actual
HTTP hosts, host-slot policy, released concurrency slots and result attribution.
The preferred-routes check runs the two KALNET institutions sequentially. It
expands Kerala to the requested count only when preferred discovery succeeds;
otherwise it verifies one default-wrapper fallback book and retains the errors.

The portable runners create encoded public catalog book keys with
`createCatalogBookKey`. The initial internal lookup runner supplied
`recordId`/`recordLibraryId` directly with a legacy-style key; that own-record
code path resolves those explicit IDs. All forty qualifying academic IDs were
also checked to round-trip unchanged through the public key contract, and a
fresh portable IUST check confirmed the encoded-key path.
