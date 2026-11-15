# International catalog integration: current adapter readiness

Prepared 14 November 2026 (America/Los_Angeles); code inspected in the shared MyBookshelf web checkout. This is a code audit and a guide to interpreting the country probes, not a claim that any international library has been integrated or deployed.

## What the existing code can unlock

**Koha is the strongest reusable starting point.** It already has anonymous keyword/title/ISBN search, bibliographic record reads, holdings parsing, branch scoping, and bounded work/edition checks. Each catalog still needs its actual pages replayed through the parsers and its transport and access policies checked. Merely observing the word “Koha” or seeing a successful search in a browser is insufficient.

**VuFind and PMB require implementation work for new international deployments.** Their current adapters reuse useful parsing patterns but hard-code approved Indian deployments. VuFind accepts only KALNET and Somaiya base URLs. PMB is a `discovery-community` family pinned to `mediatheques-afinde.org` and known branch scopes. They are not currently arbitrary-host integrations.

**SLiMS, INLIS/INLISLite, and UP iLib have no registered provider in the current code.** A successful query establishes an integration candidate; it does not establish an already-supported adapter. SLiMS is also distinct from the Indian “SLIM” catalog family named in existing discovery data.

**NewGenLib, Insignia and TLC/LS2 also need new implementations.** NewGenLib is not hidden inside `discovery-academic`: that provider accepts only approved catalog IDs and thirteen implemented families, none of which is NewGenLib. Nigeria's Lagos and Benin discoveries therefore create a useful two-institution starting point for a new family, rather than a configuration-only expansion. FAST's Insignia 8.9.2 discovery in Pakistan likewise requires an adapter. A shared SLiMS implementation could span Pakistan's National Library and Indonesian deployments after version and policy validation.

Sources: [provider registry](../../../../server/services/providers/index.js), [Koha adapter](../../../../server/services/providers/koha.js), [VuFind settings](../../../../server/services/providers/vufind.js), [community catalog settings](../../../../server/services/providers/discoveryCommunity.js), [platform descriptors](../../../../server/services/catalog-lookup/platforms.js).

| Catalog family | Current route | What can reasonably be reused | Required validation or development |
|---|---|---|---|
| Koha, standard root-mounted OPAC | `platform: koha` | Search, record, holdings and branch-scoping code | Actual HTML theme/language; stable record IDs; public item information; network scope; robots; latency |
| Koha with custom API | Special `publicCatalogApi: iith-opac-v1` branch | An example of custom API integration | Existing API path is specific to IIT Hyderabad; another API needs its own implementation |
| VuFind | `platform: vufind`, only two accepted origins | Search/COinS metadata/record and scope-verification patterns | Generalize or add reviewed configurations; verify search filters, markup, and holdings semantics |
| PMB | `discovery-community`, family `pmb` | Anonymous session, search and scoped holdings patterns | New origin/scope support and actual deployment verification |
| SLiMS | None | Generic HTTP, policy, normalization and work matching utilities | New family/provider and evidence-backed parser/API contract |
| INLIS / INLISLite | None | Same shared utilities | New family/provider; do not assume identical versions/endpoints |
| UP iLib or other custom system | None specifically | Same shared utilities | Site/family contract and adapter implementation |
| NewGenLib | None, including within `discovery-academic` | Shared HTTP, normalization, policy and identity infrastructure | New family/provider; verify anonymous sessions, result/record IDs and the separate local-item availability flow |
| Insignia, including FAST's 8.9.2 deployment | None | Same shared infrastructure | New implementation and version-specific query/session/record validation |
| TLC / LS2 / Library.Solution | None | Same shared infrastructure | New implementation; do not treat browser-visible search as an existing generic adapter |
| Union catalog / OAI-PMH harvest | No universal union-catalog connector | Existing examples prove a network can be modeled | Must distinguish bibliographic discovery, institutional membership, physical copies and current circulation |

Other registered families include BiblioCommons, Chamo, Libsys, Vega, Aspen, Calil, Evergreen, e-Granthalaya, IndCat, LIBMAN and scoped academic/community discovery. Presence in the registry alone does not establish arbitrary new-host compatibility.

The current `discovery-academic` implementation supports only `srms`, `libaitech`, `autolib`, `rps`, `librarika`, `mizoram`, `processcube`, `bmu`, `easylib`, `darshan`, `nios`, `libsoft`, and `iust`, with entries resolved from its checked-in configuration map. New catalog rows can reuse a family only when its existing request/response contract actually matches; an arbitrary `academicCatalogId` or new `kind` is rejected. Sources: [academic request routing](../../../../server/services/providers/discoveryAcademic.js), [approved academic configurations](../../../../server/services/providers/discoveryAcademicConfigs.json).

## The three verification levels must stay separate

1. **Live catalog search verified:** an actual query returned identified books, with a captured response, query, timestamp and record links. A homepage or indexed web-search snippet does not meet this level.
2. **Current parser/adapter compatibility checked:** saved real responses pass current parsers, or the actual adapter completes a permitted live operation. Offline replay proves markup compatibility only; it cannot prove transport or deployment readiness.
3. **Ready for app rollout:** reviewed directory configuration, search/record identity and holdings semantics, public eligibility, policy/transport/latency checks and release verification are complete.

A robots prohibition or unresolved access restriction keeps a catalog out of the automated rollout set even if a person can search it. A failed request is “could not check,” never evidence that a book or library collection is absent.

## Koha configuration and common compatibility traps

The registry only creates a provider when `capabilities` contains `availability`. A directory-only row or a row with only `catalogSearch` does not activate these provider methods. Public v2 lookup presentation also requires `publicCatalogValidated`, `publicCatalogMethodValidated`, or an existing explicit demo flag and a safe provider origin. Research findings must not be promoted by setting these flags before validation.

Typical configuration fields to verify:

| Field | Meaning / constraint |
|---|---|
| `platform`, `slug`, `directoryId` | `koha`; stable library identity. Directory ID defaults to `platform:slug` if no explicit ID exists. |
| `baseUrl` | Origin only: no path beyond `/`, query, fragment or credentials. The existing adapter constructs `/cgi-bin/koha/...`; subpath installations need changes. |
| `catalogUrl` | Human-facing catalog link; may be a scoped search URL. A link alone does not enable a provider. |
| `capabilities` | Must contain `availability` for the current provider registry; use capability flags only for demonstrated features. |
| `publicCatalogCapabilities.titleSearch` | Selects the richer title/candidate/record route. This parser is stricter than the older expanded search route. |
| `kohaBranchCode`, `kohaBranchName` | Required together for strict branch scope. Rich-route code validates an uppercase alphanumeric/underscore/hyphen code up to 32 characters. |
| `kohaSearchUnscoped` | For a shared catalog unable to scope its search reliably; individual record holdings must prove the selected branch. Search rows alone cannot mark that branch as holding a book. |
| `kohaLegacyHoldings` | Switches branch filter parameter for known older deployments; requires observed evidence. |
| `kohaTitleSearchFirst` | Tries title, then author, then keyword indexes when earlier searches are empty. Useful on slow keyword catalogs after validation. |
| `kohaRssRows` | Opt-in RSS result marking; must verify the actual RSS output and record-owned ISBNs first. |
| `publicCatalogTimeoutMs` | Koha accepts configured 30,000 / 45,000 / 60,000 ms. Overall book checks cap at 45 seconds, so setting 60 seconds does not create a 60-second reader budget. |
| `publicCatalogHttpOrigin` | Exact reviewed HTTP origin pin for known HTTP-only Koha sites; never an automatic fallback from failed HTTPS. |
| `publicAccessNote`, location/source fields | Explain membership/reference restrictions and accurately located branches; public catalog access does not imply public borrowing. |

The richer Koha search parser expects `body#results`, a heading matching **“Your search returned N results.”**, `title_summary_ID` blocks and same-origin `/cgi-bin/koha/opac-detail.pl?biblionumber=ID` links. Non-English headings, customized themes, different mount paths, or nonstandard record URLs can fail despite a successful human-visible search. Empty-result recognition also expects particular English markup. The expanded parser is less restrictive, but still expects Koha result markup and record links.

The record parser must establish bibliographic identity and parse observable item information. ISBN data must belong to the returned record, not a query echo or a related-title block. Title/author resemblance alone is a possible match. Missing or incomplete item status stays unknown; “listed in catalog” does not mean borrowable now.

**Observed integration defect — MMSU record 14896:** the captured item row says `Available` in Status and **`Room Use Only` in Notes**. The current Koha parser recognizes the record but returns `outcome: available`, `availableCopies: 1`, and no loan restriction because it does not inspect the Notes column. Thus MMSU search compatibility is demonstrated, but its holdings display needs a restriction-aware parser change before rollout. Preserve the room-use restriction in the country finding. [Captured record](philippines/evidence/mmsu-record-available.html); [unchanged-parser replay](adapter-tools/replays/philippines-mmsu-room-use.json). No product code was changed in this research.

Source: [Koha implementation](../../../../server/services/providers/koha.js), [directory presentation gates](../../../../server/public-v2/directory.js), [provider selection](../../../../server/services/providers/index.js), [work/edition matcher](../../../../server/services/libraryBookSearch.js).

## Transport and access constraints

- Koha public requests use manual redirects, a 3 MiB response limit and no transport retries. An explicit 302 selecting a same-origin Koha detail record is handled; arbitrary redirects or redirected record hosts are not.
- HTTP 401/403/429 and known challenge pages are treated as blocked. Do not bypass a login, CAPTCHA, anti-bot challenge or TLS certificate verification to make a candidate pass.
- Standard HTTPS verification remains enabled. A transport fallback supports legacy TLS renegotiation while preserving certificate verification. The separate KALNET trust configuration is specific to KALNET and is not a blanket certificate exception.
- The lookup layer supplies `MyBookshelf/1.0` robots checks, crawl-delay spacing, per-host rate limits, request budgets and cancellation. Calling a raw provider function without that operation wrapper is not equivalent to the production policy path.
- Robots uses the `mybookshelf` product token, most-specific matching group, longest rule, and Allow on ties. Successful policies cache for one day; 429/5xx refuse for five minutes. Current network failures reading robots are treated as no restrictions for five minutes; an audit should still record the policy as unresolved instead of claiming affirmative permission.
- Koha defaults in the lookup descriptor are two concurrent lookups per host and 20 requests/minute across readers through the host gate. Underlying HTTP requests serialize per host. Book checks are bounded; a 50-second successful research query can still miss the app’s 45-second maximum budget.
- The HTTP utility accepts HTTP/HTTPS and is not a universal DNS/IP-based SSRF firewall. Safe operation relies on vetted directory origins, bounded provider-generated paths and each provider’s validation. Do not add arbitrary user-controlled catalog URLs. The Koha HTTP pin validator rejects local/reserved literal addresses; its HTTPS branch itself does not perform DNS resolution or general private-address checks.

Sources: [HTTP operation wrapper](../../../../server/services/providers/http.js), [robots policy](../../../../server/services/providers/robots.js), [Koha origin validator](../../../../server/services/providers/kohaOrigin.js), [reviewed HTTP origins](../../../../server/services/providers/publicCatalogOrigin.js), [lookup platform budgets](../../../../server/services/catalog-lookup/platforms.js), [lookup integration](../../../../server/services/catalog-lookup/index.js).

## Count institutions, deployments and branches separately

The directory merges stable IDs from three JSON datasets. One institution may have alternate catalog routes; alternate routes do not create another institution. Shared systems may expose many branch-scoped entries, each with its own stable ID and `kohaBranchCode`, while sharing a single endpoint and host budget. Other entries carry a `branches` array under one library identity. Consequently, “41 hosted catalogs,” “193 member libraries,” “10 institutions,” and “100 branches” are different quantities.

For international expansion, retain a hierarchy of country → network/provider deployment → institution → branch, plus the exact scope actually returned by the catalog. Verify branch membership from filtered results and/or item rows before presenting the network’s whole collection as a local library’s collection. Union metadata and large institutional collections can offer discovery coverage even when current item availability is unavailable.

Sources: [directory merge and identity](../../../../server/services/directory.js), [provider alternate routing](../../../../server/services/providers/index.js), [Koha branch scoping](../../../../server/services/providers/koha.js), [shared-host budgets](../../../../server/services/catalog-lookup/platforms.js).

## Read-only offline parser replay

The companion [replay-koha.mjs](adapter-tools/replay-koha.mjs) reads a saved response and invokes the current exported Koha parsers. It makes no network calls and changes no app configuration.

```sh
node docs/research/international-libraries/2026-11-14/adapter-tools/replay-koha.mjs search \
  /absolute/path/search.html \
  'https://catalog.example.edu/cgi-bin/koha/opac-search.pl?idx=kw&q=BOOK'

node docs/research/international-libraries/2026-11-14/adapter-tools/replay-koha.mjs record \
  /absolute/path/record.html RECORD_ID
```

Use the actual captured response URL and returned record ID. For a scoped record, an optional final argument supplies the exact observed branch name. The output separately reports recognition by the simpler expanded search parser and the richer title-search parser. A parse failure indicates required compatibility work, not a catalog outage. A successful replay must be labeled **offline parser compatibility**, not live deployed integration.

No country-level live requests were run as part of this code audit. The country evidence files own their own query timestamps, successes, failures and policy findings.

## Saved-response checks performed during this research

This replay section records the first-pass snapshot. The continuation added and replaced catalog candidates; those later observations are listed in the country dossiers and query inventory, and do not inherit an offline replay pass unless separately tested.

Offline replay on 15 November UTC (14 November Pacific) exercised the captured Koha query responses listed in the [search replay summary](adapter-tools/koha-replay-summary.json), which links full outputs and exact replay timestamps. Query counts include repeated searches at the same catalog and failed/empty/challenge responses, so they are not institution counts.

The [deduplicated institution summary](adapter-tools/koha-institution-summary.json) records positive parser evidence for **23 named institutions, including reserve candidates**: Pakistan 4, Bangladesh 11, Nigeria 4, Philippines 4. Of these, 21 have saved robots responses that do not prohibit the tested path; UMT is explicitly blocked, and OAU's policy read remains unresolved. This is a snapshot of inspected responses, not a national deployment count, final target count, terms clearance, or integration certification.

- **Pakistan:** the DUHS and IIUI search pages pass both parsers. QUEST's exact-title query was captured after redirecting to record 7655; its record parser succeeds.
- **Bangladesh:** Chittagong, IUB, Jagannath, Khulna, KUET, IUT, Sylhet Agricultural University, City University and ADUST captured searches pass both search parsers. **CUET and RUET pass the simpler search parser but fail the richer title-search parser**, so those templates need review before enabling the richer route. ADUST is a reserve rather than one of the final ten targets.
- **Nigeria:** NOUN, KASU, NIALS and OAU captured results pass both parsers. NOUN's exact-title capture redirects to record 2553, which passes the record parser. OAU's unresolved policy read remains a separate qualification.
- **Philippines:** DSWD, Imus and MMSU results pass both search parsers. Butuan's Harry Potter query and DSWD's Social work with families query were captured after redirecting to records 3215 and 550; both record parses succeed.

Single-result queries may redirect to a book page. Feeding that final page to a search parser gives a false failure if the redirect is ignored. The [redirected-record replay summary](adapter-tools/koha-redirect-record-summary.json) records those cases separately. These checks do not establish successful requests through the deployed app or clear any remaining terms/access questions.

The checkout had no installed `isbn3` dependency. For replay only, the repository's locked `isbn3@2.0.12` was installed with scripts disabled in `/tmp/mybookshelf-international-replay`, outside the app. The helper can use an isolated install through `MYBOOKSHELF_REPLAY_DEPENDENCIES`; normal environments with workspace dependencies installed do not need this setting. The actual provider source remains unmodified. Reproduction in this workspace:

```sh
MYBOOKSHELF_REPLAY_DEPENDENCIES=/tmp/mybookshelf-international-replay \
  /workspace/mybookshelf-cloud/node-v22.23.4-linux-x64/bin/node \
  docs/research/international-libraries/2026-11-14/adapter-tools/replay-koha.mjs \
  search /absolute/path/search.html 'ACTUAL_CAPTURED_SEARCH_URL'
```

## Independent robots-policy replay

[audit-saved-robots.mjs](adapter-tools/audit-saved-robots.mjs) applies the current app's `robotsRules` and `robotsAllowed` functions to captured policies and request URLs without making network requests. [robots-audit.json](adapter-tools/robots-audit.json) contains per-URL classifications and their source files. It is a snapshot of evidence available at audit time, not a live policy recheck.

The audit identified a material difference from Python's `urllib.robotparser`: **UMT's two captured searches succeeded, but its saved wildcard policy explicitly disallows `/cgi-bin/koha/opac-search.pl`**. UMT therefore remains an observed successful catalog query with automated integration blocked under the current policy. It must not be counted as policy-cleared. The country owner was informed.

UNS Indonesia has wildcard query restrictions that the app parser recognizes; its country owner confirmed no prohibited query was made. Saved 503 or 429 robots responses are temporary blocks under the app policy and must not be reported as missing-policy permission. Missing policy evidence and failed network reads are marked unresolved in the audit, even where current runtime behavior would allow a temporary request.

The final saved-response audit also identifies MSU-IIT's Follett welcome page under a disallow-all policy and a FUT Minna resource page whose saved robots response is HTTP 500. Neither page is evidence of a successful book query. No additional successful book-query conflict was found in the captured evidence beyond UMT.

To regenerate the policy and parser summaries after adding captured evidence (all reads remain offline):

```sh
/workspace/mybookshelf-cloud/node-v22.23.4-linux-x64/bin/node \
  docs/research/international-libraries/2026-11-14/adapter-tools/audit-saved-robots.mjs \
  > docs/research/international-libraries/2026-11-14/adapter-tools/robots-audit.json

MYBOOKSHELF_REPLAY_DEPENDENCIES=/tmp/mybookshelf-international-replay \
  python3 docs/research/international-libraries/2026-11-14/adapter-tools/replay-saved-koha.py
```

The named-institution summary is a reviewed deduplication of these samples; if new institutions are added, update that summary deliberately instead of treating every new query or branch as another institution.
