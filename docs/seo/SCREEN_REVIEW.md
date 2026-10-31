# Desktop and mobile reference review

The reference is Claude's `docs/design/2026-10-mobile` package on
`claude/charming-cray-1gekuz`, particularly `UI_REVIEW.md`, `DESKTOP_PLAN.md`,
`DeskShelf`, `DeskSearch`, `FixLibStart`, `FixBookCard`, and the public SEO boards.
The app remains one route tree with responsive CSS.

## Implemented visual changes

- Public pages share the reference's cream background, white surfaces, forest
  accent, Newsreader headings, narrow reading columns and 72px navigation header.
  The landing page uses the library search, sample shelf, three steps and two
  information cards. Country links lead to the nine approved guides.
- Desktop navigation uses the specified 224/248px sidebar, 48px tab targets,
  40px page titles and capped content width. The shelf uses restrained typeset
  fallbacks, wooden boards, a library card and compact recently viewed rows.
- Search keeps the input and scope side by side on desktop. Results use compact
  cards and a serif heading; source information and library controls follow the
  results. Small thumbnails contain no truncated title text.
- Mobile book pages have a full-width cover area, a 180×290 cover, and a single
  Back/Save/Share bar. The bottom tabs are hidden while reading a book. Back
  returns to the originating search or shelf before primary navigation is used.
- Availability cards have a clear library line and left-aligned status. Status
  symbols are hidden from accessible names. Dates remain edition dates unless
  an authoritative work-level first-publication date exists.
- Library discovery starts with search and Near me, followed by the selected
  library, country choices and paste-link control. Country browsing remains
  reachable after a place search. API country counts are used when available.
- Settings use the reading-light glyph and readable theme previews. Public
  About content contains the supplied name, role, LinkedIn and contact email.
- Favicon, touch icon and sharing image use the updated visual identity.
- Controlled edition groups stay open as optional metadata arrives. The About
  maker card wraps correctly at 200% text size. Empty-shelf example covers remain
  at book scale on desktop.

## Evidence and repeatability

`node tools/seo/review-ui.mjs` captures the five app screens in all three themes,
plus nine public screens. Set `PREVIEW_WIDTHS` to
`320,390,1024,1280,1366,1440,1920` for the complete 168-capture layout matrix.
The JSON report records actual heading sizes, backgrounds, sidebar widths and
horizontal overflow. These visual fixtures intentionally use missing covers;
they are not evidence of live availability. Cover-loading tests install their
own image responses and do not depend on external image hosts.

The browser suite covers keyboard navigation, forced colors, reduced motion,
200% text, long multilingual names, scanner failures, storage failures, saved
shelves, library links, catalog errors and availability states. Live deployed
search and saving are checked separately from fixture-based visual captures.

## Accuracy limits

No 99% pixel-similarity result has been established. The boards contain sample
covers, invented availability snapshots, placeholder biography text and a much
larger public directory than the approved launch scope. Live catalog data,
verified copy, nine-guide publication and the selected AGPL licence take
precedence over reproducing those sample pixels. The implementation follows
the reference layouts, dimensions and visual language; this document does not
present a fabricated numerical similarity score.
