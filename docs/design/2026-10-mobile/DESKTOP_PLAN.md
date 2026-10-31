> Archived Claude proposal. Current decisions in [the UI/SEO implementation plan](../../seo/IMPLEMENTATION_PLAN.md) and [handoff](../../STATUS.md) take precedence.

# Plan: the mobile design on laptop and desktop

How the screens in this package adapt to wider, landscape screens. This work
starts after the phone view ships. The wireframes are on the canvas board
"Desktop plan — layouts".

## Principles

Same app, more room. Nothing new to learn between phone and laptop.

- **Same design ideas.** Covers face out on wooden shelves. The book page leads
  with the cover. Calm cards with a hairline edge. Newsreader for titles,
  system type for everything else. The three reading lights, with the same
  tokens (`reading-lights.css`). The same copy and the same states.
- **Use the width for side-by-side panes, not stretched lines.** Text columns
  stay at most about 680 px wide. Extra width goes to a second pane: book
  details beside the cover, a library's detail beside the result list, and the
  shelf beside your library and recently viewed.
- **Design for landscape height.** Laptops are often 1366 × 768 or 1280 × 800.
  The main thing on each screen fits in the first 700 px of height: the
  availability answer on Book, the first results on Search, the list and the
  selected library on Libraries. Panes scroll on their own instead of the
  whole page growing tall.
- **Pointer and keyboard as well as touch.** Keep 44 px targets, since many
  laptops have touch screens. Add hover states and keyboard shortcuts. Under
  reduced motion, hover changes colour only and nothing moves.
- **No map.** As on the phone, use Near me lists, search, browsing and links.
  Remove the existing `LibraryMap` from the laptop Libraries page too.

## Layout sizes

| Width | Navigation | Content | Notes |
| --- | --- | --- | --- |
| < 40rem (640 px) | Bottom tab bar | Phone design as drawn | |
| 40–64rem (640–1023 px) | Bottom tab bar | Phone design, centred, max 720 px | Tablets and narrow windows. More covers per shelf row; Book puts the cover beside the title. |
| 64–80rem (1024–1279 px) | Sidebar, 224 px | Two panes where listed below | Shelf side column moves below the bookcase. |
| ≥ 80rem (1280 px) | Sidebar, 224 px | All panes side by side | |
| ≥ 90rem (1440 px) | Sidebar, 248 px | Max content width 1200 px, centred | Larger covers and type. |

At ≤ 800 px tall, top padding drops from 44 px to 24 px and the Book cover
caps at 46vh. At 200 % zoom, widths fall into the bands above and the
narrower layouts take over. That is expected and must work.

The sidebar is today's desktop shell (`TabBar`, `desktop.css`) restyled with
the new tokens: brand, the four tabs, then Help & support. The active tab uses
the accent colour with a filled icon, as on the phone. In Lamplight the sidebar
is `--surface`, with a `--line` edge.

## Screens

### Shelf

- **Header:** "Shelf" on the left. On the right: the library chip, the
  Bookcase/List toggle, and **Find a book**.
- **Bookcase:**
  - Face-out covers on wooden boards, as on the phone, scaled up. Covers are
    about 128 px wide at 1440 and 116 px at 1280, and rows hold as many as fit
    (5–7).
  - The empty slot after the last book is "Add a book".
  - Hovering or focusing a cover lifts it 2 px with a deeper shadow. Under
    reduced motion, only the shadow changes.
- **Side column (300 px, from 80rem):** your library card, Recently viewed as
  a compact list (small cover, title, author), and "Your shelf is kept in this
  browser".
- **List view:** a table-like list (cover, title, author, status). It still
  shows the saved status with no date, and sorts the same way as on the phone
  (the same sort control, "Recently added" by default).
- **Edit:** the same − badges on covers. Undo appears as a toast at the bottom
  of the content area, 480 px wide.
- **States:**
  - Storage blocked, couldn't load and library removed: the banner sits above
    the bookcase, full content width, with actions inline on the right.
  - First visit: the empty shelf board, "Start your shelf", and the three
    example books, side by side in one row.
  - Missing covers: the same typeset cover.

### Book

- **Two columns, max 1100 px.**
- **Left column (360 px, sticky):** the cover on its tinted panel with page
  edges, as in the phone hero, about 240 × 370 px. Under it are the Save button
  (label and icon) and Share.
- **Right column (max 640 px):**
  1. Title (Newsreader, 40 px), author, then first published and editions.
  2. The availability card: library line, status and actions. This is the
     answer, and it sits above the fold at 768 px tall.
  3. About this book, then Details and links.
- **Many branches:** the branch list becomes two columns inside the card's
  section, and "Also at this library" sits beside it.
- **Other availability states** (no library yet, website only, didn't answer in
  time, shelf is full) change only the availability card. Shelf full is a
  banner above the card, as on the phone.
- **Navigation:** back is "← Search" or "← Shelf" in the content header, and
  `Esc` does the same. No bottom bar inside a book.
- **Short screens:** at ≤ 800 px tall the cover column shrinks so the
  availability card stays visible.

### Search

- **Header row:** the search field (max 640 px) with the scan button, the "All
  books / your library" control beside it, and the `Alt+/` hint (today's
  shortcut).
- **Results:** a grid of result cards, two columns at 1024 and three at 1440.
  Each card shows the cover, title, author, year and editions, and opens the
  Book page. No per-result availability checks, so no extra catalog load.
- **Start state:** Recently viewed as a row of covers, then "Ways to find a
  book" as three cards side by side.
- **States:**
  - Loading: skeleton cards in the grid.
  - Not in your library, similar spelling, no books found and unknown ISBN:
    the message sits above the grid at text width, and suggestions show as
    cards.
  - Catalog down and offline: a banner across the content width.
- **Barcode on a laptop:** typing the ISBN comes first, and the camera is
  second. The scanner opens as a centred dialog (640 px) with the webcam view,
  the ISBN field beside it, and Close. Camera blocked uses the same dialog with
  the ISBN field and the steps.

### Libraries

- **Header:** the search field ("Library, city or postcode", max 640 px) and
  **Libraries near me**.
- **Two panes:** results on the left (420 px) and the library detail on the
  right (the rest, max 640 px).
  - Selecting a row shows that library's detail on the right without leaving
    the list. The detail is the phone's full detail page: what we can check,
    branches, catalog link, Use this library and Share. These are directory
    reads only, with no catalog checks.
  - With nothing selected, the right pane shows your library. With no library
    chosen, it shows the Browse by country list.
  - `↑`/`↓` move through results and `Enter` selects.
- **Near me:** the list with distances on the left, then "More libraries in
  Chennai · Location not confirmed yet". "Nothing near you" uses the left pane,
  with browsing on the right.
- **Browse by area:** country, state and district drill down in the left pane,
  with a breadcrumb. Counts come from the backend (`BACKEND_ISSUES.md` #10).
- **Place search:** Libraries and Places as two groups in the left pane.
- **Shared link:** a centred dialog (480 px) instead of the bottom sheet, with
  the same copy and buttons. A broken link is a banner over both panes.
- **Coming from a book** ("Is it at your library?"): the same page, plus a
  return bar at the top, "Choosing a library for Fantastic Mr Fox · Back to
  book".

### Settings

- Today's two-column card grid, with the new content.
- The reading light picker gets larger previews (160 × 200 px) that show a
  mini shelf in each theme. Match device sits beside it.

## Shared pieces

| Piece | Phone | Laptop |
| --- | --- | --- |
| Navigation | Bottom tab bar | Sidebar |
| Banners | Full width under the header | Content width, actions inline on the right |
| Toasts | Above the tab bar | Bottom of the content area, 480 px, centred |
| Bottom sheets | Sheet from the bottom | Centred dialog, 480 px, focus trapped, `Esc` closes |
| Scanner | Full screen camera | Dialog with webcam and ISBN field |
| Lists | Grouped rows | The same rows, with hover fill and keyboard selection |
| Covers | Tap | Hover lift (no motion under reduced motion), focus ring |

## Implementation

This builds on the phone implementation. It doesn't fork it: one route tree,
the same components, and CSS that switches layout by width, as `desktop.css`
does now.

1. **Tokens and shell:** apply `reading-lights.css` to the sidebar; set the
   layout widths, height rules and focus and hover styles.
2. **Shelf:** a `--cover-w` custom property scaled by width, row packing from
   the measured case width, the side column, and the list view as a table.
3. **Book:** the two-column layout with a sticky cover column, the
   availability card first in the right column, `Esc` to go back, and short
   screen rules.
4. **Search:** the result grid, the start state, and the scanner dialog with
   ISBN entry first.
5. **Libraries:**
   - The list/detail panes with `?library=` in the URL, so a selection can be
     shared and the back button works.
   - Keyboard selection and the browse drill-down.
   - Remove `LibraryMap` and its toggle.
6. **Shared:** the dialog and toast components, and banner layout.
7. **QA:**
   - 1024 × 768, 1280 × 800, 1366 × 768, 1440 × 900 and 1920 × 1080, in all
     three themes.
   - Keyboard only, 200 % zoom, forced colours and reduced motion.
   - Run the Playwright projects. Add a desktop spec asserting that, at
     1366 × 768, the Book availability card and the first Search results are
     visible without scrolling.

Rough size: 4–5 days after the phone work lands.

## Decisions

1. **No preview pane in Search.** Result cards open the Book page, so there
   are no availability checks per selection.
2. **The shelf list sorts as on the phone.** No status sort, and no sortable
   column headers.
3. **Content stays capped at 1200 px and centred**, even on very large
   monitors. Very large screens get no special layout for now.
