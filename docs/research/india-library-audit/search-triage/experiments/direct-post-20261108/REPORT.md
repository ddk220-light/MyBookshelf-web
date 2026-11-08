# e-Granthalaya direct search experiment — 8 November 2026

Five libraries in five e-Granthalaya clusters were tested with the same known-positive Title query: **Wings of Fire**.

**Result: 0/5 direct searches succeeded; 5/5 normal two-request searches succeeded.** All ten search POSTs returned HTTP 200. Each direct POST returned the initial form without the query or search-results headline; this is not a valid zero-result search and is not a library failure.

| Library | Direct POST records | Normal search records |
|---|---:|---:|
| JNV Garhwa Library | No search executed | 1 |
| JNV Wokha Library | No search executed | 1 |
| Oriental Research Library | No search executed | 1 |
| UPG GOVT HS NAGARPALIKA KANYA LIBRARY | No search executed | 1 |
| Ratna-Sagar Library | No search executed | 2 |

## Method

Direct: one POST to the library-specific Default.aspx URL, with library ID, Books material, TITLE field, LIKE operator, query, sort/page controls and Search button. No prior form GET, no Cookie header, no hidden form state. Normal positive control: fresh GET, then POST with the received session cookie and native form fields. No item-detail requests. Existing shared parser checks native library selection, result IDs/titles and counts; experiment additionally checks query echo, Title/Books controls and relevant titles. Reading/parsing responses adds no HTTP requests.

The experiment made 15 catalog requests (five direct POSTs and five GET+POST controls), plus one robots-policy request. Requests were serial, governed by the existing three-second pacing, origin locks, policy/refusal controls and bounded HTML reader. Saved successful baseline search evidence was hash-checked before selection. The main collector cooperatively stopped and published c21e92879b9ec51cead45f1a64e06e4e73bd323f before the experiment.

## Limits

This establishes that the tested no-session/no-hidden-state shortcut fails on these five libraries. It does not isolate which individual form field or cookie is necessary, rule out every alternative endpoint, or test session reuse across subsequent searches. No library classification, production connector or audit pass criteria changed. These are five repeat diagnostic checks, not five newly audited libraries.

## Evidence

`comparison.csv` is the short table; `results.json` has exact requests, scopes, returned native IDs/titles and historical baseline references. `events.jsonl` and `bodies/` retain sanitized dated HTTP evidence. Baseline evidence paths resolve under `../../india-20261108/` from this experiment directory; experiment evidence paths resolve here. `test.mjs` is the executed one-off harness and records its original workspace paths. Session cookies/usable hidden state are not saved. `validation.json` records evidence hashes.
