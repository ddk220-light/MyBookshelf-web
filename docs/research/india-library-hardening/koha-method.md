# Koha verification, 15 November 2026

The ten-book audit in [koha-results.json](koha-results.json) verifies nine native catalog systems: Anna Centenary, Kalaignar Centenary, Ernakulam Public, IIT Bhubaneswar, CUTN, CUSAT University Library, UAS Dharwad, Sree Sankaracharya University of Sanskrit, and LBSNAA Gandhi Smriti. This is a provider-specific result, not a claim that these are the nine largest libraries. CUSAT's native and IndCat connections represent one institution.

Each counted attempt independently queried a public title, required the expected scoped record ID in the results, resolved that record, and passed it to the app's `createCatalogLookup.lookupBook` with persistent storage bypassed. The JSON contains the actual query, resolved metadata and holdings, app answer, URL, and timestamps. Immediate search → record → availability calls can use the app's in-process record cache; `requests: 0` at that final step is not a separate cold read. ISBN-origin checks are recorded separately and do not replace exact catalog-record confirmation.

Fourteen additional cold checks cleared the provider cache before the app lookup: thirteen returned `found`; one IIT Bhubaneswar check reached the normal 20-second timeout. Those responses remain in `coldChecks`, including the failure. The results establish the tested paths and do not establish an uptime guarantee.

Two UAS bound serial volumes returned real holdings but are explicitly `eligibleBook: false`. They do not contribute to the ten-book target. *Fundamentals of Biochemistry* provides the replacement general book. Other retained failures include zero-copy Anna records, the broad LBSNAA *History of India* query whose expected record was outside the first ten results, and intermittent CUSAT/CUTN transport failures. CUTN's *On history* was successfully queried with the title and author, `On history Hobsbawm`, after the catalog's longer title containing a publisher blurb timed out.

The UAS runtime directory had combined the native OPAC URL with obsolete IDEAL branch and legacy-holdings settings. Removing those stale settings changed the native agriculture query from zero results to ten confirmed books. Generic Koha author parsing also now reads each innermost author node once; modern nested `By:` wrappers previously appeared as duplicate authors at UAS and CUTN. The public UAS fixture preserves bibliographic metadata and holdings while omitting forms, session fields, and scripts.

National Science Library's original `opac.niscpr.res.in` host failed, including an HTTP response reporting no approved upstream IPv4 address. The official OPAC is `opac.niscair.res.in`; the directory correction is separate from validation. Correct-host HTTPS reads still failed in this environment and public HTTP returned an empty 502. No NSL book is counted from those responses. NIT Calicut's runtime robots refusal is retained and was not bypassed.

The portable replay performs a cold app lookup for every book and therefore has stricter cache conditions than the original title-flow audit:

```sh
node tools/catalog-hardening/koha-run.mjs \
  docs/research/india-library-hardening/koha-ten-manifest.json \
  /tmp/koha-ten-recheck.json
```

The broader manifest contains 372 additional runtime Koha connections. It requires one independently queried, scoped monograph and a cold app `found` result per passing row. It measures native Koha only, without alternate union-catalog fallbacks. Recognized book item types are required; serials, magazines, ambiguous bound volumes and unknown types do not count. The denominator includes link-only entries that the app reports as unsupported. Branch connections are not additional independent institutions or ten-book certifications.

The completed [broader results](koha-broad-results.json) contain **15 additional passing connections**, 36 unsuccessful checks, 13 unsupported catalog-search/record interfaces, and 308 members not attempted after a shared-host stop. Thus 51 connections underwent the query checks; the remaining rows are not claimed as tested successes or catalog failures. The fifteen passing titles were also manually reviewed as monographs. A readable Kakojan record illustrates why a catalog hit alone is insufficient: the live detail page says “No physical items for this record,” and no book was counted there.

```sh
node tools/catalog-hardening/koha-run.mjs \
  docs/research/india-library-hardening/koha-broad-manifest.json \
  /tmp/koha-broad-recheck.json
```

Both modes use runtime directory IDs, robots checks, app request/deadline limits, at most three distinct native hosts concurrently, and sequential member checks within each host. Probe operations share a conservative 15-request-per-minute gate and three-second spacing; the app lookup applies its own production gate and limits. A policy refusal stops further requests to that shared host. Three successive member discovery errors also stop that host's group. Remaining members are `not_attempted`, never inferred passes or failures. `--resume` skips completed rows and preserves any interrupted attempts separately. These tools do not write accounts, production catalog stores, or deployments.

## Follow-up of the stopped and failed connections (later run, 15 November 2026)

The 308 broad-run members recorded as `not_attempted` were stopped for two different reasons. The [host diagnostics](connector-host-diagnostics.json) separate them:

| Host | Members not attempted | Why the run stopped | Current state |
| --- | ---: | --- | --- |
| `ideal.egranth.ac.in` | 192 | Three successive discovery errors (HTTP 503), not a policy refusal | Still unreachable. The 503 comes from the execution egress proxy ("remote connection failure"), not from a catalog page. Not attempted again. |
| `opac.rayatlibrarynetwork.org` | 42 | Policy refusal | `robots.txt` still says `Disallow: /`. No request sent. |
| `dhegoalib.unifyed.com` | 33 | Three successive discovery errors | The union search the app uses took 35.5 s, longer than the 30 s Koha budget. A branch-limited search answered HTTP 410 Gone. Not attempted again. |
| `library.mes.ac.in` | 28 | Policy refusal | `robots.txt` still disallows `opac-search.pl`. No request sent. |
| `unionopac.cusat.ac.in` | 13 | Three successive timeouts | Reachable again. Retested together with its six earlier failures. |

[koha-followup-manifest.json](koha-followup-manifest.json) fixed 27 one-book rechecks in advance:

- the 19 CUSAT union scopes;
- four connections that had failed with HTTP 502/503;
- SRHU, with health-sciences seeds;
- three link-only entries whose robots rules allow search and whose public Koha search answered a diagnostic query.

Robots refusals were excluded. The runner, pacing and pass rule are unchanged. [koha-followup-results.json](koha-followup-results.json) records **20 passes**:

- 17 of the 19 CUSAT union scopes. `cusat-union-doe` and `cusat-union-ses` returned clean empty results for all three seeds, so they stay unconfirmed.
- IIT Goa, whose earlier searches had returned HTTP 502/503.
- Arul Anandar College and Panjab University's Department of Laws, after their link-only directory entries were connected (see [UNLOCKS.md](UNLOCKS.md)).

Still failing:

- IIM Visakhapatnam: timeouts.
- KLH Global Business School: TLS connection reset.
- IIT Dharwad: the site's own nginx answers 502.
- SRHU: the sampled item types are `Medicine`, `Community ...`, serials or blank, so nothing counts under the monograph rule.
- St. Xavier's College Jaipur: search and record reads worked while it was temporarily connected for this check, but every sampled item type was `Stack`, so no book qualified. Its directory entry was returned to link-only.

MAC Ramapuram is also not counted. Its holdings table has an Item type column, but the cells are empty. The MARC material type shows Book, but the item-type rule was kept unchanged.

```sh
node tools/catalog-hardening/koha-run.mjs \
  docs/research/india-library-hardening/koha-followup-manifest.json \
  docs/research/india-library-hardening/koha-followup-results.json --resume
```
