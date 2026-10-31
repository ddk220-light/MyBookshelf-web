# Claude desktop, mobile and public-page references

Open [index.html](index.html) for all **131 HTML boards**, including Daylight,
Lamplight and Ink variants, desktop layouts, error/empty states and SEO pages.
These are visual proposals and sample data, not live app screens or catalog facts.

Imported from Claude's reference package at commit
`ea73b6769a477edc1d8385e820fd3af6f6a5988a`. Only the reviewed design source was
carried forward; no private repository history or application code was imported.

- [UI_REVIEW.md](UI_REVIEW.md): screen-level critique and proposed fixes.
- [DESKTOP_PLAN.md](DESKTOP_PLAN.md): navigation, dimensions and responsive layouts.
- [BACKEND_ISSUES.md](BACKEND_ISSUES.md): proposed data/API improvements.
- [../../seo/SEO_PLAN.md](../../seo/SEO_PLAN.md): original SEO proposal.
- [../../seo/IMPLEMENTATION_PLAN.md](../../seo/IMPLEMENTATION_PLAN.md): approved,
  reconciled decisions. This takes precedence over the original proposal.
- [../../seo/SCREEN_REVIEW.md](../../seo/SCREEN_REVIEW.md): implementation comparison.

In particular, use AGPL-3.0-only, publish only the nine reviewed library guides,
omit old-route migration machinery, keep saved-result context, preserve meaningful
distance uncertainty and distinguish edition dates from verified work dates.
Do not restore the proposal's Apache licence, thousands of guides, invented maker
biography, or undated old availability results.

## Viewing locally

From the repository root, run `python3 -m http.server 4196` and open
http://localhost:4196/docs/design/2026-10-mobile/index.html. Serve this only for
local reference review. These documents are excluded from the Vercel upload and
the SEO sitemap.

The original sample JPEG cover assets, rendered screenshots, canvas archive and
design ZIP are not redistributed here. Boards preserve their layout/CSS and use
an original neutral SVG cover placeholder instead. Their font link uses the
repository's licensed Newsreader file, so opening a board does not require Google
Fonts. The board gallery is generated as a plain local index. See NOTICE for font
terms. Actual application preview captures are in `docs/seo/evidence/`.
