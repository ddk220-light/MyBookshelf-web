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

`iust-result-empty.html` and `iust-result-hit.html` are reduced public
`result.aspx` pages from `https://webopac.iust.ac.in`, captured on
19 November 2026 for the ISBN searches `9781408855652` (no record) and
`9788131248898` (one record). Scripts, styles, navigation and form state were
removed; the result form and its facet tables remain. For the empty search the
catalog's `EmployeeDataHandler.ashx` answers HTTP 500 ("Runtime Error"), so the
page without any facet table is read as the explicit empty answer.
