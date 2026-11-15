# International library catalog verification

Research date: 14 November 2026, America/Los_Angeles. Individual HTTP observations retain their UTC timestamps, which fall on 15 November.

The decision is which library platforms and networks offer useful next coverage for MyBookshelf in Pakistan, Bangladesh, Nigeria, the Philippines and Indonesia. The requested target is ten large libraries per country with a real book search that returns catalog records.

## What counts as evidence

A successful catalog query requires an observed response from the catalog's search route containing book records. The evidence includes the submitted query, request URL or POST payload, check time and returned title. Record links or identifiers are retained where exposed; their absence remains an integration issue. For example, UIN Sunan Kalijaga returned an actual book through its advertised SRU interface but did not expose a stable record identifier in the captured result. A homepage, an indexed web-search snippet, a catalog link, and a zero-result response do not establish a successful book query. Broad subject searches help discover records; specific-title searches provide the stronger requested verification.

The query string and returned title are both preserved, because a keyword engine can return related works. LST's specific-book phrase returned two related books and a real detail record, but not the exact requested edition. It counts as an observed working book-search response, with matching and repeat-search reliability explicitly unresolved. It does not demonstrate an exact-title or ISBN match.

Catalog success, current adapter compatibility, and suitability for production are separate findings. A successful website search does not prove that MyBookshelf's parser understands its records, that the library permits automated access, or that a reader is eligible to borrow. Any offline parser replay is explicitly labeled and is not a live app or deployed integration test.

Restrictions, HTTP errors, connection failures and timeouts remain visible. A failed check from this execution environment does not establish that a catalog is unavailable to its local users. A failed availability check never means that the library does not own a book.

## Selecting large libraries

Published institutional collection figures are preferred. Their dates and units remain attached: physical volumes, bibliographic titles, electronic resources, and aggregate records are different quantities. Collections reported for a university network are not assigned to a single branch. A union catalog or shared LMS deployment is not counted as multiple independent libraries without evidence of the member institutions and scope.

Where comparable size figures are missing, institutional scale is a stated selection proxy. Such a shortlist identifies major institutions; it does not establish a definitive national ranking. Large blocked candidates remain in the evidence so that technical convenience does not silently determine which institutions are called largest.

The continuation distinguishes selected targets from reserves. A reserve can have a valid observed book search while being smaller, lacking adequate scale evidence, having been replaced by a stronger candidate, or having a policy restriction discovered during review. All observed institutions are counted once; selected, reserve and total observed counts are reported separately. Ten successful catalogs in a country do not establish ten large, integration-ready libraries.

Collection-size evidence has its own quality label. Direct official pages are preferred; dated secondary reporting and official text available only through a search index are identified explicitly. A dated historical collection or one faculty's collection is not presented as a current whole-university total. Source counts are not added across incompatible units or overlapping networks.

## Platform and network opportunity

National LMS market share requires representative evidence. A survey of a defined segment retains that segment and its year; the systems encountered during this catalog audit are not treated as a national market census. Adoption directories may establish known installations, but their age, self-reporting and incomplete coverage limit interpretation.

The useful integration unit is a searchable catalog with identifiable library scope and book records. A shared service can reduce implementation effort, but individual library branches, permissions, holdings and reader access still require verification. Repository metadata and journal union catalogs do not automatically establish physical-book holdings.

## Access and reproducibility

Checks use public anonymous routes and respect explicit catalog restrictions. No account credentials, paywall bypass, bot challenge bypass or disabled TLS verification are part of this work. A missing robots file is not a license grant. Robots exclusions and service terms must be considered separately from technical reachability.

Country folders retain the exact requests, bounded response evidence and source links. These are observations at the recorded time, not uptime guarantees. For production work, repeat the accepted probes through the actual provider and confirm title/edition identity, record resolution, library scope, holdings semantics, request budgets and failure handling.
