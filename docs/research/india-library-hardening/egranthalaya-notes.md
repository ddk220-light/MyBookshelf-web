# e-Granthalaya validation

Observed 15 November 2026. These are live catalog checks from the working tree,
not a deployment. The frozen size-led cohort contains Romain Rolland and
Harekrushna Mahtab; the other three members below are additional checks.

| Connected member | Strict distinct books verified | Official catalog titles / holdings |
| --- | ---: | ---: |
| Romain Rolland Library | 10 | 226,012 / 405,020 |
| Harekrushna Mahtab State Library | 10 | 184,604 / 282,233 |
| Central State Library, Prayagraj | 10 | 54,131 / 58,476 |
| SRS Central Library | 11 | 63,760 / 81,565 |
| National Medical Library | 10 | 45,405 / 116,428 |

The size figures come from each member's `GridView_MyLibStat`; source URLs and
timestamps are in [the main evidence](egranthalaya-results.json). Catalog titles
and holdings are different units and do not establish a national physical
collection ranking.

## What changed

- A displayed title can concatenate separately indexed title, subtitle and
  parallel-title fields. After a recognized zero, title search now retries the
  main title once with fresh ASP.NET form/session state. Hindi, Tamil and Odia
  combining marks are preserved. A changed member scope or malformed response
  does not trigger this recovery.
- A record without visible copies for the selected member now confirms its
  exact record ID through a precise main-title search, with bounded ISBN
  confirmation retained for ambiguous titles. Confirmation checks all twenty
  returned rows; public search still returns ten. A different member's copies
  never supply availability for the selected library.
- A measured slow member can use a longer ISBN probe, capped at 35 seconds.
  HKMS, SRSJAMMU and NML use that probe inside the app's 45-second book budget.
  HKMS tries its observed hyphenated ISBN spelling first. Both spellings and
  the existing cluster fallback remain available; other members retain their
  default probe and query order.

The provider regression suite has 71 passing tests. It covers scope drift,
foreign holdings, the twenty-row confirmation boundary, fresh form state,
native scripts, request limits and the bounded timing/query-order overrides.

## Evidence and limits

Each counted attempt independently queries a title, matches the exact member
record ID, resolves it, clears the HTTP cache, and obtains a live `found` answer
through `createCatalogLookup.lookupBook`. Record reads use `readRecord` directly
so its production cancellation, host gate and request limit apply. Robots policy
and at least one second between request starts are enforced. Title discovery
uses the provider's existing 100-second limit; this is separate from the
25/45-second app book budget.

HKMS initially passed one of ten sampled attempts. Some search labels include
an Odia parallel title that its detail heading omits. The original attempts are
preserved. [Seven independent canonical-title attempts](egranthalaya-hkms-canonical-results.json)
establish six distinct titles, including one extra monograph; together with four
earlier matching-heading attempts they establish ten. The two records sharing
the normalized title “+2 bharata itihasa paper ii” count only once. The quoted
title “'Terrorism' a colonial construct…” still misses as a full-title query;
the separate diagnostic found its exact record using “colonial construct”.

[SRS record 8147](egranthalaya-confirmation-results.json) originally failed its
membership confirmation. After the fix, a record read with fresh member
confirmation and a cold app lookup succeed in about 11 seconds each. Its answer is catalog presence with
copy status unknown, not an available copy borrowed from another member.

NML record 161482, “Advances in biochemical engineering / biotechnology”, is
held out as a series-level record with 118 copies/volumes and no edition ISBN.
It remains in the evidence with `eligibleBook: false`; record 72870 supplies a
separate eligible book. Complete attempts are never assembled from partial
stages across runs.

ISBN checks are separate from catalog-record checks. Actual directory entries,
with no diagnostic overrides, returned `found` for:

| Member | ISBN | Cold duration | Evidence |
| --- | --- | ---: | --- |
| Romain Rolland | 9788183451536 | 34.9 s | [Tamil Ponniyin Selvan ISBN](egranthalaya-rrl-isbn-results.json) |
| HKMS | 9788185229461 | 27.0 s | [Runtime check](egranthalaya-isbn-runtime-results.json) |
| SRSJAMMU | 9788122204971 | 21.4 s | [Runtime check](egranthalaya-srs-runtime-isbn-results.json) |
| NML | 9788185004051 | 21.5 s | [Runtime check](egranthalaya-nml-runtime-isbn-results.json) |

The main evidence also contains five successful Prayagraj ISBN checks. Failed
checks before the timing fixes remain intact. Supplemental files show the
configuration experiments, including two HKMS successes and the SRS control
ISBN that already worked. These checks do not prove every ISBN or every
metadata-driven work search succeeds.

The broader survey completed its fixed set of **30 existing entries** at
08:02:44 UTC: twelve Uttar Pradesh public libraries, six Jammu/Kashmir public
libraries and twelve university/research libraries. **26 passed one complete
book attempt; four remain unresolved.** This survey requires one book per
entry, not ten. [Expansion evidence](egranthalaya-expansion-results.json)
retains every discovery query and failed attempt.

The four unresolved routes are Amiruduala Library (`uplibraries-dllucamr`),
Arignar Anna Central Library at Bharathiar University (`universities-bucbt`),
Patna University Library (`universities-patnauni`) and Lalit Narayan Mithila
University Library (`universities-lnmulib`). Each member page reports zero
catalog titles and holdings; the three scoped queries `India`, `History` and
`Science` also return zero. This establishes that this bounded check found no
published member records. It does not mean their physical collections are
empty or that another connected catalog route fails.

Across the five core members and this expansion, **35 e-Granthalaya directory
entries were attempted, 31 have at least one verified book, and five have ten**.
Known alternate university routes must not be counted as new institutions;
the shared summary applies the ranking manifest's known aliases. The adapter
serves 5,037 connected Indian entries, leaving **5,002 untested in this
e-Granthalaya campaign**. Untested entries are not claimed to work.

## Reproduction

Use Node 22 with the repository dependencies. Run live commands sequentially:
all these members share `eg4.nic.in`. The exact replay manifest fixes the
validated record IDs and canonical titles instead of selecting new discovery
rows. Its five member lists were checked against the shared auditor: each has
exactly ten unique accepted title keys and ten record IDs, supported by complete
individual attempts. SRS's additional eleventh passing record remains in the
separate confirmation evidence.

```sh
node --test server/services/providers/egranthalaya.test.js
node tools/catalog-hardening/egranthalaya-run.mjs tools/catalog-hardening/manifests/egranthalaya-exact-replay.json /tmp/egranthalaya-replay-results.json
node tools/catalog-hardening/egranthalaya-isbn-run.mjs tools/catalog-hardening/manifests/egranthalaya-hkms-runtime-isbn.json /tmp/egranthalaya-hkms-isbn-results.json
node tools/catalog-hardening/egranthalaya-run.mjs tools/catalog-hardening/manifests/egranthalaya-expansion.json /tmp/egranthalaya-expansion-results.json
```

The `*-runtime-isbn.json` and `egranthalaya-rrl-isbn.json` manifests use actual
directory configuration. The other ISBN manifests explicitly record in-memory
diagnostic overrides. `--resume` preserves complete attempts; use a fresh
output for a new experiment. Optional `EG_RAW_DIR` captures public HTML for
local inspection; its opaque form state is not a commit-ready fixture.

Recompute the shared summary with `node tools/catalog-hardening/summarize.mjs`.
Its matching-heading, unique-title and book-eligibility rules are also used by
the eG runner. The summary, rather than an old claimed pass count, determines
which complete observations qualify.
