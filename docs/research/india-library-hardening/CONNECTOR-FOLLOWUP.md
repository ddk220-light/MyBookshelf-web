# Non-eGranthalaya connection follow-up, 15 November 2026

This follow-up continues [the Indian catalog hardening](README.md) for every
directory family except eGranthalaya. The pass standard is unchanged. A pass
needs, in one complete attempt:

- an explicit query that matches the record;
- that exact record, resolved;
- a live `found` answer from the app's own lookup.

These are one-book checks. They are not ten-book certifications or recall
estimates. A clean empty result stays unconfirmed. A failed check is never
treated as absence. Directory branches are connections, not a count of unique
institutions.

The work sent **2,879 live requests** against a cap of about 6,000. That
total includes robots.txt reads and retries. [request-ledger.json](request-ledger.json)
lists the requests by run and host. Runner pacing was unchanged: one queue per
shared host, the production host gates, and robots rules. A refusal stopped
all further requests to that host.

## Results by family

"Before" is the committed summary on `hardening-indian-libraries`. "After" is
the [regenerated summary](summary.json). Counts cover every Indian directory
entry in the family.

| Family | Entries | Attempted before → after | At least one book before → after | Still untested |
| --- | ---: | ---: | ---: | ---: |
| IndCat | 407 | 80 → 407 | 80 → 405 | 0 |
| Koha | 383 | 62 → 78 | 25 → 45 | 305 |
| VuFind | 130 | 1 → 5 | 0 → 0 | 125 (host stops) |
| LIBMAN | 639 | 636 → 636 | 469 → 481 | 3 (excluded test/foreign tenants) |
| Community | 49 | 49 → 49 | 26 → 33 | 0 |
| Academic | 36 | 36 → 36 | 30 → 30 | 0 |
| Visakhapatnam (vpl) | 1 | 0 → 1 | 0 → 1 | 0 |
| LibSys | 2 | 0 → 0 | 0 → 0 | 2 (no catalog-origin interface) |
| Link-only `catalog` | 19 | 0 → 0 | 0 → 0 | 19 (no adapter) |

### IndCat

[indcat-remaining-manifest.json](indcat-remaining-manifest.json) fixed all 327
untested scopes in advance, ordered by public contribution count. The run used
the existing IndCat runner and pacing (one global queue, at least 2.1 s between
request starts).

**325 of 327 scopes passed** ([results](indcat-remaining-results.json)). The
[offline capture audit](indcat-remaining-capture-audit.json) reparsed all 325
counted records from their captures. It confirmed the scoped search, title
query, record and metadata for every one, and needed no follow-up. 35 records
have explicit MARC book leaders; 290 leave the material type unspecified,
which the existing IndCat rule allows. Separate cold ISBN checks returned
`found` 142 times.

Two scopes did not pass, and both are upstream problems:

- `indcat:indcat-gkvv-249404` (Gurukula Kangri Vishwavidyalaya): the scoped
  title searches return the expected records. The record pages list copies
  but name no holding institution, so ownership cannot be confirmed for any of
  the ten records tried.
- `indcat:indcat-ggsi-110403` (Guru Gobind Singh Indraprastha University):
  every record page answers with a PHP fatal error
  (`Call to a member function result() on bool`).

### Koha

The broad run's 308 `not_attempted` rows came from two different stops:

- **Policy refusals:** `opac.rayatlibrarynetwork.org` (42 members) and
  `library.mes.ac.in` (28). Both `robots.txt` files still disallow catalog
  search.
- **Three successive discovery errors:** `ideal.egranth.ac.in` (192),
  `dhegoalib.unifyed.com` (33) and `unionopac.cusat.ac.in` (13).

The Koha method section in [koha-method.md](koha-method.md) and the
[follow-up results](koha-followup-results.json) give the detail. 20 of 27
rechecks passed: 17 CUSAT scopes, IIT Goa, and two link-only entries that are
now connected. The 36 earlier failures now break down as follows:

| Reason | Count | IDs |
| --- | ---: | --- |
| Now pass | 6 | `cusat-union-dac`, `-dae`, `-dca`, `-dcs`, `-doh`, `iit-goa` |
| Robots refusal | 12 | `british-council-india`, `arunachal-university`, `cvmu`, `diet-dhemaji`, `sanjay-teachers-training-college`, `iiser-berhampur`, `japan-foundation-new-delhi`, `klh`, `oriental-theological-seminary`, `sncopac`, `pillai-cehs`, `rayat-aac` |
| robots.txt HTTP 503 (temporarily disallowed) | 3 | `goa-institute-management`, `ramanujan-college`, `scert-assam` |
| Unreachable or server error | 6 | `ideal-aaua`, `ideal-aauj`, `ideal-aca` (egress connection failure), `iit-dharwad` (site 502), `klh-global-business-school` (TLS reset), `iim-visakhapatnam` (timeouts) |
| Union too slow for budget; branch limit 410 | 4 | `goa-dhe-ccl`, `-dbc`, `-dbpg`, `-dct` |
| Login required | 1 | `iihmr-delhi` |
| No countable book item type, or no items | 3 | `mac`, `srhu`, `kakojan-college` |
| Clean empty seeds | 1 | `cusat-union-doe` |

The 13 unsupported (link-only) entries are now:

- **Connected and passing:** `arul-anandar`, `panjab-laws`.
- **Robots refusal:** `dharmaram`, `carmel-mala`, `central-university-rajasthan`, `dbit-bangalore`.
- **robots.txt 503:** `nec-kovilpatti`, `vit-chennai`.
- **robots.txt timeout:** `indian-institute-astrophysics`.
- **Search HTTP 500:** `bhatkhande`.
- **Not a recognizable Koha results page:** `cmd-kerala`.
- **Search works, but every item type is `Stack`:** `st-xaviers-jaipur`, which stays link-only.
- **Uses its own API:** `iit-hyderabad`, which already has ten books through it.

### VuFind

[vufind-all.json](../../../tools/catalog-hardening/manifests/vufind-all.json)
listed all 130 entries, with a three-error host stop.

- **KALNET** (102 entries): the catalog could not be reached from this
  environment. The app's own transport failed, a proxied TLS handshake was
  reset, and robots.txt gave no response at 11:13Z and again at 12:23Z. Three
  members were tried; 99 are `not_attempted`.
- **Somaiya** (28 entries): CloudFront answered HTTP 403 "Request blocked" to
  robots.txt and to search. One member was tried in this run and one in the
  earlier run, and the host stopped as a refusal; 26 are `not_attempted`.

No VuFind connection can be verified from this environment. This is not
evidence that the catalogs are broken for Indian readers. See
[vufind-results.json](vufind-results.json) and the
[host diagnostics](connector-host-diagnostics.json).

### LIBMAN

The 20 "search errors" were the earlier run's own host-busy limit, and no
catalog request had been sent for them. On recheck, 12 of the 20 pass and 8
return clean empty results.

A fixed sample of ten clean-empty tenants (every 15th of the 147) was searched
with five other seeds. All 50 searches returned recognized empty answers, and
none errored. This points to tenants whose public search exposes no titles,
not to wrong seeds. They remain unconfirmed; see the LIBMAN method section in
[libman-method.md](libman-method.md).

### Community and academic

**Rajkot Municipal Corporation.** `emp.rmc.gov.in` answered again after the
earlier egress timeouts.

- Six of 21 scopes now pass: `rmc-1`, `-2`, `-3`, `-5`, `-6`, `-10`
  ([results](community-recheck-results.json)).
- 14 scopes return clean empty results for English seeds, and 1 (`rmc-20`)
  has an error.
- The adapter chooses the catalog language from the query script, so a second
  pass tried Gujarati seeds on the 15 scopes that had not passed
  ([results](community-rajkot-gujarati-results.json)). All were empty again.
  This audit does not establish that Gujarati search works at all.

**Alliance Française.**

- Gurgaon (`pmb-afindia-7`) now passes with the seed `roman`. Earlier, every
  row from its `histoire` seed belonged to other branches.
- Lucknow (`pmb-afindia-10`) was not retried after four empty seeds.

**Academic.** The six academic failures remain:

- S. P. Jain: robots refusal.
- B. N. College: access challenge.
- SJEC: both cold lookups again exceeded the 20 s book budget
  ([recheck](academic-sjec-recheck-results.json)). The budget was not changed.
- SRMS 3, 5 and 12: empty results. Their college codes match the portal's own
  public college list, so the directory scopes are not stale.

### Small families

- **Visakhapatnam Public Library** had an app lookup defect; it is fixed and
  passes (see [UNLOCKS.md](UNLOCKS.md)).
- **NIT Trichy (`libsys`)** exposes only ISBN availability in the app, so a
  catalog-origin pass cannot be measured ([results](small-families-results.json)).
- **IIM Tiruchirappalli (`libsys`) and the 19 `catalog` entries** are link-only:
  the app has no adapter for them, and the reader is sent to the library's own
  catalog. Two are duplicates of connected entries:
  - `catalog:svce-pennalur` is `libman:103`;
  - `catalog:rmrl-chennai` is `discovery-community:rmrl-chennai`.

  `catalog:libsys10-nibm` and the four `catalog:slim-hsncu-*` entries name
  catalog platforms without an adapter.
- **IIT Madras (`chamo`)** did not resolve in DNS (ENOTFOUND). National Science
  Library's robots.txt timed out again. Both remain unreachable from this
  environment.

## Unusable from this environment, or refused

Nothing was hidden or removed from the app; the owner decides. Evidence for
each item is in [connector-host-diagnostics.json](connector-host-diagnostics.json).

- **Refused by policy (robots or CDN):**
  - all `koha:` members on `opac.rayatlibrarynetwork.org` (43) and
    `library.mes.ac.in` (29);
  - all 28 `vufind:somaiya-*` (CloudFront 403);
  - `koha:` British Council India, Arunachal University, CVMU, DIET Dhemaji,
    Sanjay TTC, IISER Berhampur, Japan Foundation New Delhi, KLH, Oriental
    Theological Seminary, SNC OPAC, Dharmaram, Carmel Mala, Central University
    of Rajasthan, DBIT Bangalore and NIT Calicut;
  - `discovery-academic:autolib-patna-spjain` and
    `discovery-academic:librarika-bncollege`;
  - `koha:iihmr-delhi` (login required).
- **Unreachable from this environment** (not a policy refusal):
  - all 102 `vufind:kalnet-*`;
  - all 195 `koha:ideal-*`;
  - `koha:klh-global-business-school`, `koha:iim-visakhapatnam`,
    `koha:indian-institute-astrophysics`, `koha:national-science-library` and
    `chamo:iit-madras`.
- **Too slow for the app's budget:**
  - the 38 `koha:goa-dhe-*` union members (search 35.5 s against a 30 s
    budget; branch-limited search answers HTTP 410);
  - `discovery-academic:easylib-sjec` (20 s).
- **Server faults:**
  - `koha:iit-dharwad` (nginx 502) and `koha:bhatkhande` (HTTP 500);
  - IndCat record pages for `indcat:indcat-ggsi-110403` (PHP fatal error).
- **robots.txt answering HTTP 503** (temporarily disallowed under RFC 9309):
  `koha:goa-institute-management`, `koha:ramanujan-college`,
  `koha:scert-assam`, `koha:nec-kovilpatti` and `koha:vit-chennai`.

## Reproduction

```sh
node tools/catalog-hardening/indcat-run.mjs --manifest docs/research/india-library-hardening/indcat-remaining-manifest.json \
  --books 1 --output docs/research/india-library-hardening/indcat-remaining-results.json --capture-dir /tmp/indcat-captures --resume completed
node tools/catalog-hardening/koha-run.mjs docs/research/india-library-hardening/koha-followup-manifest.json \
  docs/research/india-library-hardening/koha-followup-results.json --resume
node tools/catalog-hardening/run.mjs tools/catalog-hardening/manifests/vufind-all.json docs/research/india-library-hardening/vufind-results.json --resume
node tools/catalog-hardening/run.mjs tools/catalog-hardening/manifests/libman-busy-and-empty-sample.json docs/research/india-library-hardening/libman-recheck-results.json --resume
node tools/catalog-hardening/run.mjs tools/catalog-hardening/manifests/small-families.json docs/research/india-library-hardening/small-families-results.json --resume
node tools/catalog-hardening/run.mjs tools/catalog-hardening/manifests/vpl-after.json docs/research/india-library-hardening/vpl-after-results.json --resume
node tools/catalog-hardening/community-run.mjs --wide --manifest tools/catalog-hardening/manifests/community-recheck.json \
  --output docs/research/india-library-hardening/community-recheck-results.json
node tools/catalog-hardening/community-run.mjs --wide --manifest tools/catalog-hardening/manifests/community-rajkot-gujarati.json \
  --output docs/research/india-library-hardening/community-rajkot-gujarati-results.json
node tools/catalog-hardening/academic-wide-run.mjs --manifest tools/catalog-hardening/manifests/academic-sjec-retry.json \
  --output docs/research/india-library-hardening/academic-sjec-recheck-results.json
node tools/catalog-hardening/indcat-audit-captures.mjs --input docs/research/india-library-hardening/indcat-remaining-results.json \
  --capture-dir /tmp/indcat-captures --output docs/research/india-library-hardening/indcat-remaining-capture-audit.json
node tools/catalog-hardening/summarize.mjs
```

Use a fresh output path for a new live run; the existing files resume.
`stopAfterHostFailures` in a generic manifest stops a shared host after that
many successive members whose discovery only errored. The live runs began at
commit `ce59143`. The Koha follow-up ran with the three link-only directory
connections applied; St. Xavier's was then reverted to link-only. The
Visakhapatnam retest ran after its fix. Raw pages and
captures stay outside Git.
