/**
 * Cold open: nothing saved yet (SuggestFirstOpen and DeskSuggestFirst
 * boards). "Ready to search" and one line stand above a larger search bar,
 * which both searches and, on phones and the rail, scans; there are no
 * separate buttons and no empty shelves (owner decisions,
 * docs/plans/2026-11-14-desktop-and-shelf-suggestions.md). The top bar draws
 * this above the search bar; the five suggested books stand below it.
 */
export function EmptyShelf() {
  return <div className="empty-shelf">
    <h1>Ready to search</h1>
    <p>Add books to your shelf and search in your library</p>
  </div>;
}
