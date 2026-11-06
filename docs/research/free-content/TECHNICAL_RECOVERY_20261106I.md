# Technical recovery I — 6 November 2026

Research-only continuation from c02d932:92 Working/41 Blocked, original44 26 Working/18 open. No other collector or lock owner was present; current remote matched the clean isolated worktree.

## Snapplify public shop recovered

Official current help documents a public GET search form, with title/ISBN input and publisher filters. Anonymous search returns native product IDs, metadata, prices and availability. Ten distinct Book Dash title queries now pass, including two short titles corrected with the documented publisher facet. Original broad first-page failures remain in append-only evidence. Two same-run captured responses were reused with their original timestamps instead of requesting them again.

The adapter parses literal JSON without executing inline scripts or retaining cart/account state. It filters literal title tokens, both net/gross prices of zero, and explicit availability flags. Paid and unavailable matches are excluded; a mixed-price response and empty controls are saved. The scope is first-page public shop metadata, not Engage, checkout, reading or worldwide access. Price zero is not a reuse license. Book Dash overlap is explicit; no independent origins are added. A garbled provider title and invalid-length reference remain recorded rather than silently corrected.

## Alternative routes investigated

- LINCS: the independent course catalog and ERIC API both fail policy checks with403. ERIC primary API documentation is readable, but no query or course request was sent.
- USGS: official documentation names basemap and hydro services. Basemap policy403; hydro CONNECT403 comes from the environment proxy, so it does not establish provider health. No map query or proxy bypass.
- IMO: the public resolution index is a legitimate alternate scope, but its policy URL redirects to itself. No index request or looped retry.
- India Code: the official old homepage advertises migration to indiacode.gov.in. The newly published host policy returns500; catalog withheld. This is a new documented route, not a repeated old-host timeout.

Unresolved failures remain open. Other providers retain their saved backoff/access triggers. Current counts are generated in [connector-status.csv](registry/connector-status.csv); evidence is under [run I](registry/runs/technical-recovery-20261106i/). The old documentation queue and reporter stay stopped.

## Worldreader / BookSmart recovered

The current operator page links BookSmart’s dashboard. Its policy URL returns an exact generic Angular shell with no REP directives or access challenge; a narrowly hashed review permits only the published anonymous UI. API origins return404 for policy. The privacy notice explicitly makes sign-in optional, and operator documentation describes title/keyword search.

The browser now uses visible introductory controls, waits for Ionic navigation, and submits the visible Explore search field. Ten distinct title queries return the expected native UUIDs and versions in the default US/English library. Initial hidden-input, accessible-name, transition-timing and missing-submit failures remain saved. A broader cat query returned99 provider matches; literal title filtering excludes unrelated titles. The case count does not double-count duplicate UI requests. An additional nonsense query returns provider totalCount0/count0. Paging and other territories/languages remain unverified.

Only bounded metadata is retained, never account/session/startup response data or book files. WebKit works with existing certificate verification. Automatic approval review rejected a proposed persistent certificate-store change; that change was not made. Temporary extracted browser dependencies resolved the local runtime issue without changing persistent trust. Public metadata search does not establish a standalone developer API or content reuse license.

## Shodhganga metadata recovered through IndCat

INFLIBNET’s feature documentation describes Shodhganga links, and its thesis form includes an explicit Shodhganga checkbox. That independently published search returns native repository handles alongside separate IndCat thesis IDs. Ten distinct title queries now pass. No request followed a Shodhganga link, and repository restrictions remain in force.

The verified mode uses the published All Fields keyword form with Shodhganga filtering, then requires every literal title token. An initial title-field request rendered All Fields; this mismatch is saved and no server-side title-only promise is made. The parser rejects ambiguous/missing/duplicate native mappings and retains original reported links. Scope is first20 indexed records, not whole-repository coverage, reading access or a new independent origin.

## Timed service checks after12:00UTC

Gutendex native10836 timed out after30seconds following more than2hours backoff. Its two earlier passing native lookups remain partial; no later case or broad query was sent.

Chicago zoning’s column schema recovered with200. Two metadata pages returned15 distinct native feature IDs without geometry, address or owner fields. Three zoning-class queries then returned relevant expected GLOBALIDs/OBJECTIDs, but B3-2 returned503. Collection stopped; six later planned queries remain unrequested. The generated display label is separate from native identity; zoning_id is a shared category, not a feature ID. An initial local regex rejected numerical code prefixes before any feature query and was corrected with tests. These three passing examples are partial recovery, not a Working connector. Both providers’ next timed check is18:00UTC absent a useful new recovery signal.

Negative controls: BookSmart returns a confirmed empty metadata list. IndCat’s nonsense thesis query returned200 without the expected form echo and was rejected by the parser; empty semantics remain open. Neither control adds to the passing-example count.
