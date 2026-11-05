# Source qualification record

Use with [the expansion plan](EXPANSION_PLAN.md). One record per origin; link
shared connector documentation instead of duplicating it. Unknown is a valid
research result. Do not copy this blank template into production source config.

## Identity and discovery

- Origin ID / name / official operator / canonical domain:
- Parent organization, aliases, mirrors and duplicate decision:
- Discovery directory/query/referral and date:
- Category IDs with representative item evidence (C01–C20):
- Source country / local relevance / languages and scripts:
- Catalog or explicit subset; known size versus sampled size:
- Role: host, publisher catalog, index or resolver. Underlying origin attribution:
- State: candidate / triaged / probed / qualified / deferred / rejected /
  implementing / enabled / suspended. Reason and last transition date:

## Retrieval and policy

- Route: live API / attributed aggregator / export-import / permitted harvesting:
- Connector ID; supported interface/version; official documentation URL:
- Search modes: topic, exact title, author, identifier; unsupported modes:
- Example request shape with credentials redacted; fixed allowed hosts:
- Stable native ID, record resolution, pagination or import scope:
- Relevant filters, result fields, declared completeness and aggregator lag:
- Terms/metadata license URL + reviewed date + permitted use/attribution:
- Per-item reading rights evidence; separate reuse/download rights:
- API key/account needed; free allowance, pacing, commercial-use limits and
  overage behavior; documented hard stop; no secret values:
- Refresh, deleted/withdrawn items, expiry and failure behavior:
- Build size/memory/refresh effort estimate for an import:

## Reader access

- Anonymous / free account / country-limited / institutional / loan / preview /
  paid / mixed / unknown, with item-level evidence:
- Actual canonical full-item reading/listening/viewing URL:
- Free-account offer observed? Post-login full access tested? Keep separate:
- Country observations with date and method; provider-stated restrictions:
- Content language versus interface language; version/edition/translation:
- Accessibility: text/OCR, captions/transcripts, screen-reader/mobile observations:
- Quality context where applicable: preprint, retracted, archival, obsolete law,
  curriculum year, software version; no endorsement inferred from inclusion:

## Probe evidence

| Test | Expected native ID / behavior | Observed result | Evidence and timestamp |
| --- | --- | --- | --- |
| Five known eligible items | | | |
| Five topic queries, top-five relevance | | | |
| Unicode/local-language and author query | | | |
| No-result and invalid-input behavior | | | |
| Paging or bounded import; detail round-trip | | | |
| Free destination and restricted-item exclusions | | | |
| Latency/payload; documented quota/error fixtures | | | |
| Repeat shortlist check in another session | | | |

Store only small permitted metadata samples and reproducible request shapes.
Distinguish documentation review, real source requests and mocked failure tests.
Record a failed probe without claiming source-wide downtime or absence.

## Decision and delivery

- Mandatory gate outcomes: retrieval / item access / permissions-cost /
  identity-attribution / maintainable coverage:
- Qualified scope and capability; withheld scope or unresolved assumptions:
- Marginal value over current sources; overlap estimate and method:
- Proposed priority / effort / source maintainer / follow-up review date:
- Defer/reject reason, smallest next action and any required permission:
- For enablement: story/PR, mapping contract, regression evidence, actual hosted
  browser/API proof, release ID, rollback and operating review schedule:

Qualification is not release. An origin counts as enabled only after the declared
scope is reachable in the product and the release evidence is recorded.
