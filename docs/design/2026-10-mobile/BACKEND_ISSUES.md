> Archived Claude proposal. Current decisions in [the UI/SEO implementation plan](../../seo/IMPLEMENTATION_PLAN.md) and [handoff](../../STATUS.md) take precedence.

# Backend and data issues for the mobile design

These block or weaken screens in this package. Each item names the screen it
affects. Checked against the live API (`https://mybookshelf.cloud/api/v2`) and
this repository on 28 October 2026.

## Must fix

### 1. Near me must work everywhere, including India

Screens: `LibNearMe`, `LibNearMeNone`, `LibStart`

Near me returns nothing in India today:

```
POST /api/v2/libraries/discover {"lat":13.08,"lon":80.27,"radiusKm":25}
→ {"libraries":[],"total":0,"nextOffset":null,"nearby":true,"radiusKm":25}
```

`server/public-v2/locations.js` only returns points for libraries marked
`nearbyEligible`, and Indian libraries are withheld until their addresses are
reviewed. India holds 6,686 of the 7,071 libraries, so Near me is unusable for
most readers.

Needed:

- Coordinates for Indian libraries. `data/india-library-locations.json`
  already tracks 4,019 location records. Geocode reviewed addresses and publish
  points with a precision flag: `exact`, or `approximate` for a campus, locality
  or postcode. The UI shows approximate distances as "about 1.8 km".
- Libraries without a confirmed point still need to appear. Return them in a
  second list for the reader's area, such as `unlocated: [...]` for the nearest
  district. The UI lists them under "More libraries in Chennai · Location not
  confirmed yet".
- Pick the area without sending reader coordinates to a third party. Matching
  against public district or city centroids on our own server is enough. Don't
  log coordinates.
- Say why a list is empty. Add `reason: "no_coverage" | "none_within_radius"`
  and, for `none_within_radius`, the nearest library's distance so the UI can
  widen the radius and say so. `LibNearMeNone` is the `no_coverage` case, for
  example London.

### 2. Count branches correctly

Screens: `LibDetail`, `BookBranches`, every library result row

The UI shows "N branches" and nothing else. It does not explain how the count
is made. The backend must make that number right.

Alameda County Library (`bc:aclibrary`) returns 11 locations: Albany, Castro
Valley, Centerville, Cherryland, Dublin, Fremont, Newark, Niles, REACH, San
Lorenzo and Union City. REACH is not a public branch, and lockers and mobile
stops are mixed into other systems' lists.

Needed: a `kind` on each location (`branch`, `locker`, `mobile`, `other`) and a
`branchCount` that counts only public branches. Lockers and mobile libraries
appear in their own "Also at this library" line.

### 3. Report timeouts separately

Screens: `BookCheckFailed`, `SearchCatalogDown`, `StatusSpec`

The design doesn't warn that a catalog is slow while it works. It says so only
when a check fails: "Alameda County Library didn't answer in time". To do that,
the client needs `CATALOG_TIMEOUT`, which is already in
`server/public-v2/contracts.js`, kept distinct from other failures on both
`/availability` and `/books/search`. Never turn a timeout into `not_found` or
`none_available`.

### 4. Stop defaulting health to "degraded"

`toPublicLibrary` in `server/public-v2/directory.js` reports every BiblioCommons
or demo-flagged library as `degraded` unless `publicCatalogHealth` is set. That
is a default, not a measurement. Report `unknown` unless health is measured.
The UI no longer shows health ahead of time.

### 5. Tell "removed" apart from "unreachable"

Screens: `ShelfLibraryGone`, `LibLinkBroken`

The shelf says "Anna Centenary Library isn't in our list any more" only when a
saved library has really left the directory. `/libraries/resolve` and
`/libraries/resolve-link` should return a specific code, such as
`LIBRARY_NOT_FOUND`, that is distinct from network or server errors. If
libraries are merged or renamed, map the old id or slug to the new one so saved
shelves and shared links keep working.

## Data fixes

### 6. Libraries missing from live search

Alagappa University Central Library (`slug: alagappa-university`) is in
`data/library-directory.json`, with a catalog link and a reviewed address. Live
discovery returns nothing for "Alagappa" or "Alagappa University". Check why
the regenerated directory drops it. It may be `platform: "catalog"` entries
without an inline search.

### 7. Duplicate district spellings in browse

`POST /libraries/areas {"country":"IN"}` lists the same district under several
spellings:

- Ahmadabad / Ahmedabad
- Belagavi / Belgaum / Belgavi
- Bagalkot / Bagalkote

Normalise to one name per district, keep the others as search aliases, and
check the whole list for more pairs.

### 8. Names that can't be told apart

- Two "Stratford Public Library" entries in Stratford, Ontario (`bc:spl` with 6
  locations, `bc:pcin` with 1). The second looks like a Perth County catalog;
  give it its own name.
- Two "Sitka Library" entries with no place at all.
- Two "Richmond Public Library" entries with no city (California, US and
  British Columbia, Canada). Add `city: "Richmond"` to both.

### 9. Missing cities

Many entries have `city: null`, including "Anna University, Chennai", "British
Council India Libraries" and most Chennai college libraries. Rows then fall back
to the region. Fill the city from the reviewed address where there is one.

### 10. Counts for browsing

`/libraries/areas` returns names only. Browse by country shows counts (India
6,686 · US 232 · Canada 132 · Japan 20 · New Zealand 1), and the same is useful
for states and districts. Return a count with each area.

## Nice to have

- Mark catalog links that aren't secure. Arul Anandar College links to
  `http://117.240.230.163/`. The UI can read the scheme itself, so this is only
  for consistency.
