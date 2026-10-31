# Preview evidence

These captures were taken during the 2026-10-31 deployed UI review of
https://mybookshelf-jh0o69edr-ddk220.vercel.app/ at application commit
`02aa0d6d7673c449d1b138b38c64053b0d7bc29c`.

- `390-*` and `1440-*` show About, a library guide and Settings at mobile and
  desktop widths. `result.json` records those six geometry checks.
- `desktop-home.png`, `desktop-empty-shelf.png`, `desktop-search-results.png`
  and `desktop-saved-shelf.png` show the public landing and live search/save flow.
- Cover art visible inside a browser screenshot remains third-party material;
  it is not supplied as a reusable cover asset or relicensed as application code.
  Catalog results shown are transient observations, not current availability.

The complete fixture layout matrix is summarized in
[../layout-checks.json](../layout-checks.json). Its 168 screenshots are generated
artifacts rather than source inputs. To reproduce after building and starting
the app on port 3000, run in another terminal:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 PREVIEW_WIDTHS=320,390,1024,1280,1366,1440,1920 node tools/seo/review-ui.mjs
```

The default output directory is `/tmp/mybookshelf-ui-review`; override with
`PREVIEW_ARTIFACTS`. Install Chromium with Playwright first. Fixture availability
and deliberately missing covers are not live provider-health evidence. The JSON
matrices and captures do not establish a 99% pixel-similarity score.
