# Claude account UI artifact (S22)

| Field | Value |
| --- | --- |
| Creator | Claude, for story [S22 #56](https://github.com/ddk220-light/MyBookshelf-web/issues/56) |
| Reviewer | Deepak Ravikumar (R02, [#8](https://github.com/ddk220-light/MyBookshelf-web/issues/8)) |
| Input packet | v0.2, commit `5056de00bc1091fd11a8b49cf358e2594c37a49e`, approved at R01 on 2026-11-01 |
| Artifact | https://claude.ai/artifact/4wk6xx8eN6JZdFz95uM1d8, version 3 (`1793517848-1a98`) |
| Artifact version | 0.2 |

The canvas is private until the owner shares it from its Share menu.

## Files

- `canvas.json`: the canvas index (board positions and titles).
- `Main.dc.html`: the interactive prototype, as one artboard with review
  controls.
- `Emails.dc.html`: every account email, including the edge cases.

These are Design-canvas component files. They render inside the canvas runtime
(`support.js` is provided by the canvas, not this repository), so preview them
from the artifact link. The source is plain HTML and a small JavaScript state
class that engineering can read directly.

## Using the prototype

The review panel on the left of `Main` controls:

- **Device:** Phone 390, Phone 320 and Desktop 1440 (with the sidebar).
  **Page zoom 200%** shows the phone layouts at double zoom.
- **Reading light:** Daylight, Lamplight and Ink.
- **State of this screen:** every listed state of the current screen.
- **Screens:** 19 screens grouped by journey, each tagged with its UX flow.

Buttons inside the device frame move through the journeys:

- create account → check email → verify → recently viewed choice → shelf
- sign in → bring books over
- Google or Apple → simulated provider page → continue or cancel
- Settings → confirm it's you, change email, export, delete

All data is synthetic (`example.test`). Nothing signs in, sends email or
deletes anything.

## Limits of a canvas prototype

Dialogs show the intended structure (`role="dialog"`, labelled title, Cancel
first), but the canvas can't trap focus or return it when a dialog closes. The
UI specification's focus rules still apply in implementation. Screen-reader
and keyboard behaviour are checked in the real implementation (T04), not here.
