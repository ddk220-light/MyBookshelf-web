> Archived Claude proposal. Current decisions in [the UI/SEO implementation plan](../../seo/IMPLEMENTATION_PLAN.md) and [handoff](../../STATUS.md) take precedence.

# UI review of the live app, and the fixes

Checked against mybookshelf.cloud running `main` at `d9d0af7`, on 29–31 October
2026. Sizes: 390 px phone and 1366 × 768 laptop. Themes: Daylight, Lamplight
and Ink. The journey used a seeded shelf of seven real books, Anna Centenary
Library, and Near me in Chennai and Fremont.

The fixes are drawn on the canvas row "Implementation review, 31 Oct", and as
`images/Fix*.jpg` and `images/Desk*.jpg` in this package. This document is
design guidance only; no app code was changed.

## What works

- **Themes:** Daylight, Lamplight and Ink on phone and laptop. Lamplight hides
  nothing: shelf boards, buttons, cards and the sidebar all stay visible. The
  theme picker marks the current theme.
- **Shelf:** face-out covers on wooden boards, the "Add a book" slot, typeset
  covers for books without one, list view and the Recently added sort. On
  laptop, the side column holds your library and Recently viewed.
- **Book:** the phone hero. On laptop, the cover column stays in place and the
  availability answer is visible without scrolling at 1366 × 768. No "checked"
  times or slow-catalog notices.
- **Libraries:** list and detail panes on laptop, and no map. Near me works in
  India by matching libraries to the city. Alameda reports 10 classified
  branches.
- **Search:** the scope control, "No cover" placeholders, two-column cards on
  laptop, and retry for partial results.

## What to fix

| # | Now | Fix | Board |
| --- | --- | --- | --- |
| 1 | The "All books / your library" control stacks vertically between 1024 and 1439 px. `flex-basis: 100%` is set in `reader-desktop.css`. | Keep the two options side by side at every width. Shorten long library names to their first words, with the full name in the accessible label. | DeskSearch |
| 2 | After each search, the "Search results" heading gets a full focus box. Focus moves there with `tabIndex={-1}`. | Keep moving focus there for screen readers, but drop the outline for programmatic focus on headings. Keyboard focus rings stay on controls. | DeskSearch |
| 3 | Near me shows no distances, the header reads "Around **Your location**", and the radius is in km in the US. | Header "Nearest to you", sorted by the closest branch. Distances in local units (miles in the US), with "about" for approximate places and a "Within 15 mi" control. Where a library has no point (much of India), group it by city, such as "In Chennai". | FixLibNearMeUS, DeskLibraries |
| 4 | The library detail shows only "Check availability here", has a "LIBRARY" label above the name, and the library you already use still says "Use this library". | No label above the name. Add a "What we can check here" list. Your own library shows a "✓ Your library · Change" bar. Other libraries show "Choose <library>", with "Replaces <current library>" beside it. | FixLibDetail, DeskLibraries |
| 5 | The branch list has "Library" under every name and runs about 8 rows before "Show all locations". | Branch names only: the first five, then "Show 5 more". Lockers and the mobile library go in one line underneath. | FixLibDetail |
| 6 | The Libraries start screen shows Chennai, Madurai, Kochi and Bengaluru chips to every visitor, and has two "Libraries" headings. | Remove the city chips and keep one heading. Order: search field, **Libraries near me**, Your library, Browse by country (with counts), Paste a library link. | FixLibStart |
| 7 | The shelf list says "Saved" on every row. | Show the last result for your library ("Available · 2 of 3 copies", "All copies on loan", "Check the edition"), or nothing. Never "Saved". | FixShelfList |
| 8 | A loading cover looks the same as a missing one, and covers pop in. "Loading cover" is cut off in Recently viewed on laptop. | Loading: a plain tinted block with no text, marked `aria-busy`. Missing: the typeset cover. Never put text inside small thumbnails. | FixShelfLoading, DeskShelf |
| 9a | "Check the edition" is centred in the availability card while the rest is left-aligned. | Left-align it with its status icon, like every other state. | FixBookCard |
| 9b | Years show source uncertainty ("2001? · 111 editions"). | Show the work's first published year ("First published 1989"). If only an uncertain year exists, show "c. 2001" or nothing. | FixBookCard |
| 9c | "Near me" barely looks pressed. | A pressed "Libraries near me" button is filled with the accent colour. | FixLibNearMeUS |
| 9d | The sort control stretches wide, with its arrow far from the label. | An inline text control: "7 books · Recently added ▾". | FixShelfList |
| 9e | A book with no library shows "Where would you like to read?" and a link. | Use the design's card: "Is it at your library?" with the library search field and **Libraries near me**. | BookNoLibrary (row 6) |

## The Libraries tab, start to finish

Every Libraries screen should follow these rules, on phone and laptop:

- **One way in, then choices.** The search field ("Library, city or postcode")
  and **Libraries near me** come first. Below them come your library, Browse
  by country, and paste a link. Never show city shortcuts.
- **Every row says the same four things:** name, place, number of branches,
  and what we can check. Show distance only when Near me or a place is active.
  Mark your own library "✓ Yours" in lists.
- **The detail page answers "should I pick this one?"** It has:
  - the name and place
  - the Your library bar, or a Choose button
  - what we can check
  - the branches
  - the catalog link
  - About this library, linking to the public page (see the SEO plan)
  - Share
- **On laptop,** the list sits on the left (420 px) and the detail on the
  right. The selection is stored in the URL. ↑/↓ move through the list and
  Enter opens. With nothing selected, the right pane shows your library.
- **States to keep from the design:**
  - location blocked (LibLocationDenied)
  - nothing near you (LibNearMeNone)
  - place search with two groups (LibPlace)
  - website-only library (LibDetailLimited)
  - no match (LibNoResults)
  - shared link opened or broken (LibLinkConfirm, LibLinkBroken)

## Not checked live

Damaged saved data, a full shelf, catalog timeouts, blocked storage and shared
links. The project's browser tests cover them. Compare them against the Shelf
and Book state boards when the fixes above are made.
