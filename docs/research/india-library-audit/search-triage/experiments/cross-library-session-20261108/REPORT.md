# e-Granthalaya cross-library session reuse — 8 November 2026

**One initial form GET successfully supported five different libraries in the same JNV2 cluster. Reusing that form/session across four other clusters did not preserve library scope.**

All tests used Title search for **Wings of Fire**. One bootstrap GET initialized JNV Hanumangarh. Every experimental POST reused its original hidden form state and session, changed the library selector to the target’s public frozen code, and used the target cluster/library URL. No intervening form fetch or item-detail lookup occurred in the ten experimental POSTs. The row field `initialFormFetchedForThisTarget:false` describes the POST step; the first library had supplied the one explicitly recorded bootstrap GET.

## Same-cluster switches

| Library | Returned rows | Selected library and baseline records match |
|---|---:|---|
| JNV HANUMANGARH LIBRARY | 1 | Yes |
| JNV Hamirpur Library | 2 | Yes |
| JNV Jashpur Library | 10 | Yes |
| JNV JAFFARPUR KALAN DELHI | 1 | Yes |
| JNV Jhabua-1 Library | 3 | Yes |

Five different libraries were searched with **six catalog requests: one GET plus five POSTs**. All five result sets and native counts matched their saved successful member-scoped searches.

## Cross-cluster switches

| Library | Cluster | Reused-state response | Fresh GET + POST control |
|---|---|---|---:|
| JNV Wokha Library | JNV | Selected All Libraries, not requested member | 1 scoped rows |
| Oriental Research Library | JKLIBRARIES | Selected All Libraries, not requested member | 1 scoped rows |
| UPG GOVT HS NAGARPALIKA KANYA LIBRARY | JHBLLS | Selected All Libraries, not requested member | 1 scoped rows |
| Ratna-Sagar Library | INCOMETAX | Selected All Libraries, not requested member | 2 scoped rows |

All four cross-cluster responses were HTTP 200 but selected **All Libraries**, so they fail the requested-library scope test. Zero recognized scoped rows in the CSV means the parser rejected that scope; it is not proof that the raw page displayed zero records or that the target library had no books. Each independent fresh two-request control returned the expected scoped search. Returning to the initial JNV2 library with the original session/form still reproduced its baseline results.

## Interpretation and limits

The tested reuse boundary is a catalog cluster: reuse worked across five members of JNV2 but failed across the four tested cluster boundaries using this request shape. This supports testing session/form pools per cluster, rather than assuming a mandatory initial GET per library. It does not establish that this will work in all 62 clusters, that state can be held indefinitely, that one session can be used concurrently, or that no alternative cross-cluster workflow exists. No production or main-audit connector code, qualification criteria or library publication status changed. Diagnostic checks do not increase newly audited ID counts.

The main collector cooperatively checkpointed before testing and resumes unchanged after publication. Existing exclusive locks, serial pacing, policy/refusal controls and bounded HTML capture were used. Total catalog requests: 19 (one bootstrap GET, ten reuse POSTs, four fresh GET+POST controls), plus one policy request.

## Evidence

`comparison.csv` is the short table. `results.json` contains requested/observed scope, native IDs/titles/counts, source-dated baseline references and current controls. `events.jsonl` and `bodies/` preserve sanitized HTTP evidence; `selection.json` contains baseline provenance whose relative paths resolve under `../../india-20261108/`. Hash validation is in `validation.json`. The executed one-off harness is `test.mjs`; its workspace paths are retained. No reusable cookies or hidden form state are published.
