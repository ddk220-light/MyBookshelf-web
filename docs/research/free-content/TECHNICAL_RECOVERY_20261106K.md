# Technical recovery K — owner paused, 6 November 2026

DOAB and OAPEN each now have ten passing live title queries through OpenAlex’s documented repository-location index. Native OAI identifiers remain separate from OpenAlex work IDs; the old OAPEN source alias resolves to canonicalS4306402535. Queries use the canonical source plus book and reported-open-access filters, then literal title-token checks over the first5 results. One title returns two distinct OAPEN records; neither is merged.

Both nonsense-title controls return zero. OAPEN page2 for a two-record title returns zero with count2. Scouting failures in metadata quality are preserved: some source-only rows are nonbook filename metadata or report OA=false. These are excluded from book-search results. Direct repository/export access, current completeness, reading and per-book rights remain unverified. Current index queries do not make historical source assertions fresh.

The existing configured OpenAlex key had a full$1 free daily allowance and zero prepaid balance. No account, purchase or paid service was created; credentials were not saved. Only bounded metadata was queried.

At the owner’s request, hourly recovery is paused. The completed documentation queue and its reporter remain stopped. DOAB/OAPEN bring original44 to33 Working and11 unresolved; overall99 Working,34 Blocked/failed,0 Still checking across133 active connectors, with1024 passing examples. Production is unchanged.

## Saved unfinished alternatives

- CMDA: the alternate official portal policy redirects to a session route. OpenCity publicly attributes29 Chennai Master Plan2026 publication records toCMDA. Its public HTML catalog is allowed and its API is disallowed. A bounded metadata parser and5 tests are saved; native OpenCity UUIDs are explicit, CMDA publication-native IDs are unknown. No ten-case verification or PDF request was completed before pause. License is not provided; no content reuse or legal-currency claim.
- FDIC: the separately published Money Smart games homepage returned200 after policy404. Its14-game metadata is saved for later analysis; no game, parser/query verification, account or content download occurred.
- Bloom: current docs describe public browser search independently of the key-required OPDS API. Main-site policy still redirects to an app fragment, so no browser query was sent. A key is not asserted as mandatory for every public search path.
- Other unresolved sources retain their saved backoff and policy/access triggers. No timed retries were due during this run.

Two tests initially collided with the active collector lock. Rerunning after collection finished passed390 tests; the final suite also includes the5 CMDA prototype tests. No duplicate collector was launched. Evidence, failures, prototypes and pause state are saved in [the run directory](registry/runs/technical-recovery-20261106k/). [Per-connector status](registry/connector-status.csv).
