# Root causes: client UI

Read from the code on 19 November 2026; nothing was changed. `V2` = `client/src/v2`.

## 1 Library picker on phones
- Cause: sheet is `.scan-dialog` (V2/ui/scan/scan.css:15-17): position fixed; inset auto 0 0 0; max-height calc(100% - 16px); overflow-y auto. Sized and bottom-anchored to the layout viewport, which the keyboard does not shrink (client/index.html:5 has no interactive-widget; nothing reads visualViewport). The dialog is the only scroll container; `.library-list` (V2/ui/library/libraryPicker.css:22) has no overflow. Rows grow under the keyboard; a full-height sheet is panned so title, Close and field leave the screen.
- Fix: libraryPicker.css: `.library-dialog` overflow hidden, header/button/field fixed, `.library-list` flex 1 1 auto; min-height 0; overflow-y auto. LibraryPickerDialog.tsx: visualViewport resize/scroll listener setting height and offset CSS variables (CSSOM, allowed by CSP) used for max-height and bottom. Add interactive-widget=resizes-content for Chrome.
- Extras (V2/ui/library/LibraryPickerDialog.tsx unless noted):
  - AutoFill: autoComplete="off" already set (:150), Safari ignores it. Try neutral id/name (now library-place), caption outside <label> (aria-labelledby). Needs a device.
  - Focus: `.library-near` at :63 and V2/ui/desk/DeskColumn.tsx:109. Focus #library-place on rail and wide.
  - 25 rows: V2/api.ts:140 sends limit 25; total and nextOffset (V2/types.ts:41-42) ignored; count only in hidden status (:134, :155). Show "25 of N" and "Show more".
  - Current library: only a tick if listed (:165-170). Add "Current: …" line from `selected` (:96).
  - No library: context has only selectLibrary (V2/context.tsx:45, :197). clearLibrary needed through state and account storage.
  - Location: :156 prints two words; longer message in V2/ui/library/useLibraryDiscovery.ts:47 never rendered.
- Size medium; "no library" medium on its own.

## 2 Request to add
- LibraryPickerDialog.tsx:180-182 calls sendRequest (:121-126) -> publicApi.libraryRequest (V2/api.ts:232-234) -> POST /library-requests {text} (server/public-v2/router.js:266, holdings.js:275). Sends only the normalised typed text. Primary button with no results (:177).
- Fix: first tap opens an inline step (extend `asking`, :102) with editable "Library name and city" field, Send request, Cancel; optional name and email in that form. No delete endpoint, so no undo.

## 3 Status display
- Book page card: V2/ui/book/LibraryAnswerCard.tsx:39-48; found tick, not found dash, checking spinner, unconfirmed "?", unknown Retry icon button (:40), unsupported broken circle; group aria-label from answerLabel (:6-15).
- Shelf cover: V2/ui/shelf/BookCover3D.tsx:48 via Bookcase; badge for found only; entryLabel ", in <library>" (V2/ui/home/shelfItems.ts:93-97).
- List view: V2/ui/shelf/ShelfList.tsx:42 small badge found only (:37 label).
- Results: V2/ui/search/ResultsShelf.tsx:51-54, :66 badge plus "Looking in…" / "In <library>" line; V2/ui/home/HomeScreen.tsx:314-316.
- Only "found" is ever marked (shelfItems.ts:74-80); "unknown" never stored (V2/ui/book/useLibraryAnswer.ts:56).
- Fix: card: visible status line, library name beneath, Retry text button (V2/ui/book/book.css:66-80). Catalog link: useLibraryAnswer.ts:73 falls back to catalog home when the answer came from a mark; show the link for a record URL only, or carry the URL in the holdings store. ShelfList: status text line (:44-47). BookCover3D: status prop and caption. ResultsShelf :53: "none found in <library>" line.

## 4 Shelf header and settings
- Phone and rail: name is plain <p className="home-library"> (V2/ui/home/TopBar.tsx:39; nothing rendered when no library, :47). Wide: LibrarySection (DeskColumn.tsx:30-43; name :37, Change :39). Rail icon DeskColumn.tsx:173. Person icon TopBar.tsx:42. Panel V2/ui/panel/SidePanel.tsx (Change :72).
- Fix: TopBar name becomes <a href={webLink(library.catalogUrl)}> with a "Change library" button calling useHistoryOverlay('library').show (V2/ui/home/useHistoryOverlay.ts). Same in LibrarySection. Swap PersonIcon for a gear labelled "Settings" (TopBar.tsx:42, SidePanel.tsx:50). Rail: a gear could merge the three pop-overs (DeskColumn.tsx:174-176). First-time prompt: when libraryName is null render "Choose your library" in the TopBar slot and/or V2/ui/shelf/EmptyShelf.tsx. Focus-return selectors V2/ui/desk/DeskLayout.tsx:278-283 and tests. Size medium.

## 5 iPhone scanner
- Not proven. After refusal the code does not retry itself: catch sets `blocked` (V2/ui/scan/ScanDialog.tsx:161-167). Only "Allow camera" (:171, :217), "Scan again", or reopening (:85-94) asks again.
- It can call getUserMedia twice while a prompt is pending: if hidden or busy flips (:117-121, :156-169) the effect stops the first scanner and starts a second; the first request's refusal is discarded (V2/camera.ts:98), so a Cancel can be lost.
- Fix: share one in-flight getUserMedia promise across restarts in camera.ts. Small.
- Check by hand: fresh private tab, Cancel, expect "Allow camera" tile and no camera indicator; switch apps while prompt is up, return, Cancel; Settings > Safari > Camera; whether WebDriverAgent auto-accepts alerts or the tap landed on "Allow camera" under the prompt.

## 6 WebKit stylesheet refusal
- Most likely the test tool. Policy style-src 'self' (vercel.json:32, shared/security-policy.mjs:2). App injects nothing refused. Playwright 1.55.1 adds <style>body {}</style> on every WebKit screenshot (playwright-core/lib/server/screenshotter.js:28-34). 7 screenshots, 7 errors. Fix: none; do not loosen the policy. Confirm with real Safari's console.

## 7 Results and book page
- Covers only: ResultsShelf.tsx:66 draws BookCover3D (aria-label only). Caption below the plank like `.suggested-label` (V2/ui/home/home.css:100-102) with extra bay height; or default results to list view (HomeScreen.tsx:334).
- "On my shelf": V2/ui/book/SaveButton.tsx:14-17 one toggle; removal in V2/ui/book/ShelfBookPage.tsx:178-182. Make saved state a status plus separate "Remove" text button.
- "No books found": ResultsShelf.tsx:49, :60: add help line.
- Title change: ShelfBookPage.tsx:84-85 shows record from router state; :94-95 replaces wholesale with books/resolve result. Keep first title and authors when a record was supplied; merge only description, date, ISBN. :121-124 writes displayed title to Viewed before.
- Tab title: V2/ui/AppFrame.tsx:90, :99 fixed name per route; set document.title from book.title.

## 8 Polish
- Hover pattern `button:hover:not(:focus-visible), .button-link:hover` (V2/styles.css:121). Anchors miss it: a.home-button (SidePanel.tsx:62-63, DeskColumn.tsx:55-56); .cover3d (home.css:116, :134); .shelf-list-item (:159); .viewed-spine (:194). No :active rule anywhere. Fix: one block in home.css under @media (hover: hover) plus :active; wrap .library-row:hover (libraryPicker.css:27) the same way (stuck highlight on iPhone).
- 11 px text: home.css:102, :128, :130, :197; 10 px :131; V2/ui/desk/desk.css:203.
- Fonts: V2/styles.css:6-26 imports TTFs from V2/fonts/. WOFF2 exists for Newsreader and Work Sans in client/public-app/fonts/ (215 KB, 131 KB); no italic WOFF2.
- Wordmarks: "myBookshelf" tools/seo/build-pages.mjs:56; "MyBookshelf" plain text TopBar.tsx:43, DeskColumn.tsx:139.
