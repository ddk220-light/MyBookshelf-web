# Academic catalog fixtures

`darshan-dollar-id.html` is a reduced public search response captured on
15 November 2026 from `https://library.darshan.ac.in/Home/_SearchResult`
with title query `India`. It retains the table header and one complete public
bibliographic row; no cookies, session state or patron information are included.

The encrypted material identifier `O$$Sel08eL0=` is encoded by the catalog as
`O%24%24Sel08eL0%3D`. The regression verifies that search and record enrichment
preserve this identifier while retaining the existing origin, path and token
validation. Before the fix, this valid row made the whole search fail with
`CATALOG_UNRECOGNIZED`.
