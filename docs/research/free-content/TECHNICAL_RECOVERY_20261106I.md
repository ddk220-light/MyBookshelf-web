# Technical recovery I — 6 November 2026

Research-only continuation from c02d932:92 Working/41 Blocked, original44 26 Working/18 open. No other collector or lock owner was present; current remote matched the clean isolated worktree.

## Snapplify public shop recovered

Official current help documents a public GET search form, with title/ISBN input and publisher filters. Anonymous search returns native product IDs, metadata, prices and availability. Ten distinct Book Dash title queries now pass, including two short titles corrected with the documented publisher facet. Original broad first-page failures remain in append-only evidence. Two same-run captured responses were reused with their original timestamps instead of requesting them again.

The adapter parses literal JSON without executing inline scripts or retaining cart/account state. It filters literal title tokens, both net/gross prices of zero, and explicit availability flags. Paid and unavailable matches are excluded; a mixed-price response and empty controls are saved. The scope is first-page public shop metadata, not Engage, checkout, reading or worldwide access. Price zero is not a reuse license. Book Dash overlap is explicit; no independent origins are added. A garbled provider title and invalid-length reference remain recorded rather than silently corrected.

## Alternative routes investigated

- LINCS: the independent course catalog and ERIC API both fail policy checks with403. ERIC primary API documentation is readable, but no query or course request was sent.
- USGS: official documentation names basemap and hydro services. Basemap policy403; hydro CONNECT403 comes from the environment proxy, so it does not establish provider health. No map query or proxy bypass.
- IMO: the public resolution index is a legitimate alternate scope, but its policy URL redirects to itself. No index request or looped retry.
- BookSmart: current operator documentation links a dashboard host whose policy response is a generic Angular shell. A narrowly scoped manual review is recorded; anonymous UI examination is in progress. No working query counted from the shell.

All failures remain open. Other providers retain their saved backoff/access triggers. Current counts are generated in [connector-status.csv](registry/connector-status.csv); evidence is under [run I](registry/runs/technical-recovery-20261106i/). The old documentation queue and reporter stay stopped.
