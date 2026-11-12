# One-shelf redesign: approved screens

The HTML boards in this folder are the approved mockups for the one-shelf
redesign. `canvas.json` lists them in order (open the folder as a canvas, or
open a board directly in a browser). The implementation plan is
[2026-11-12-one-shelf-redesign-implementation-plan.md](../../plans/2026-11-12-one-shelf-redesign-implementation-plan.md).

Where a board and the owner decisions differ, the decisions win. The plan
records them at the top and in section 9; in short:

1. "Found" and a definite "not found" are stored for six months. Failed or
   timed-out checks are never stored as answers.
2. Failed checks are logged per library; a library is flagged after 3 failed
   attempts on 2 different days within 7 days, and cleared on the next success.
3. Each catalog platform has its own lookup strategy and request budget.
4. The catalog lookup layer is rebuilt before any UI work.
5. Privacy: cookieless anonymous visit counts; anonymous operational logs
   (no account ID, IP or device identifier); accounts hold only the reader's
   own data, with Viewed before on for every account; location is used once
   and not stored; library requests store text and a count only.
6. No age gate: the Terms say 18 or older, or with a parent's or guardian's
   permission.
7. Desktop layout, Lamplight and Ink, and the landing page redesign come after
   the mobile version (backlog). Until then they must stay readable.
8. Library answers may be stored unless a library forbids it.

Known differences between boards and decisions (plan section 9, row 29):
"My library isn't listed" on `LibraryPicker` shows the request button with the
current text; distances in nearby-library lists appear only when the server returns
one; there is no Terms board (Terms uses the Privacy layout); `Settings.dc.html`
is superseded by the side panel and is not in this folder.

## Build flag

The new screens are built behind `VITE_ONE_SHELF` (build time, off by
default). Production stays on today's screens until release; Vercel Preview
builds turn it on. See the repository README for local use.
