# e-Granthalaya session and form-state reuse — 8 November 2026

Five libraries in five clusters were tested using fresh sessions, repeated page loads and four successive searches per library. No item-detail requests were made.

## Results

| Library | New-session ID differs | Same-session ID stable | Original-state reuse | Wings of Fire rows | History rows (total) |
|---|---|---|---|---:|---:|
| JNV Garhwa Library | True | True | True | 1 | 14 (14) |
| JNV Wokha Library | True | True | True | 1 | 20 (64) |
| Oriental Research Library | True | True | True | 1 | 20 (880) |
| UPG GOVT HS NAGARPALIKA KANYA LIBRARY | True | True | True | 1 | 2 (2) |
| Ratna-Sagar Library | True | True | True | 2 | 20 (557) |

For every library, the __VIEWSTATE bytes differed on every observed response, including repeated GETs in the same session and repeated identical queries. Most other hidden field values stayed the same on fresh/repeated form loads; search responses additionally carry result-specific hidden fields. Session identifiers differed across independent fresh sessions but stayed stable during that session’s requests.

All 20 search POSTs were recognized scoped searches. Reusing the original form state for a second query worked in all five libraries. Repeating that query using state from the previous results produced the same set of native IDs/titles and total in every case. Four libraries also preserved exact order; Ratna-Sagar reordered records with identical titles (native IDs 90573/90559 and 61481/61480/49269) while keeping the same first-page record set and total 557. No cause for the tie ordering is assumed. Returning to Wings of Fire using updated state reproduced its first result set.

Therefore changing state bytes do not establish that a new initial-form GET is required before every search. The tested short same-library sessions supported one setup GET followed by repeated search POSTs. A search response itself supplies updated form state. This experiment does not establish arbitrary fixed constants, cross-library or cross-cluster state reuse, session lifetime, restart persistence, concurrent sharing or a no-cookie method. No production/audit implementation or classification was changed.

## Request sequence per library

1. Fresh GET creates session A and original form state.
2. Independent fresh GET creates session B for byte/identifier comparison.
3. GET with A’s cookie tests changes within the same session.
4. POST Wings of Fire using A’s original form state.
5. POST History reusing A’s original form state.
6. POST History using the state returned by step 5.
7. POST Wings of Fire using the state returned by step 6.

Total: 35 catalog requests (15 GET, 20 POST), plus one robots-policy request. Existing serial pacing, exclusive locks, allowed origins, access guards and bounded responses were retained. Main collector checkpointed before the test and resumes unchanged after archival. These checks do not add newly assessed library IDs.

## Evidence

`results.json` contains dated steps, comparisons, native IDs/titles, returned counts and evidence references; `comparison.csv` is the short table. `events.jsonl` and `bodies/` retain sanitized source evidence. Hidden form values and session identifiers were compared in memory; only SHA-256 fingerprints, lengths and equality results were saved. No reusable session cookie or hidden state is published. `test.mjs` is the executed one-off harness with its original workspace paths. `validation.json` records file/body hashes.
