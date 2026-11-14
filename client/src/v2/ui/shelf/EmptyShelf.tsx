import { BarcodeGlyph, SearchGlyph } from '../home/homeIcons';

/**
 * Cold open: nothing saved yet. The search leads ("Ready to search", one
 * line, Search for a book); no empty shelves are drawn on any width (owner
 * decision, docs/plans/2026-11-14-desktop-and-shelf-suggestions.md). Without
 * `onScan` (desktop widths) there is no scan button.
 */
export function EmptyShelf({ onSearch, onScan }: { onSearch: () => void; onScan?: () => void }) {
  return <>
    <div className="empty-shelf">
      <h1>Ready to search</h1>
      <p>Add books to your shelf and search in your library</p>
    </div>
    <div className="empty-shelf-actions">
      <button type="button" className="home-button" onClick={onSearch}><SearchGlyph />Search for a book</button>
      {onScan && <button type="button" className="home-button home-button-outline" onClick={onScan}><BarcodeGlyph size={22} />Scan the barcode on a book</button>}
    </div>
  </>;
}

/**
 * Where Part 2's five suggested books will stand on the cold open
 * (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md, Part 2, decision 1:
 * five popular books on a shelf under the search, 3 per row on phones and 6
 * on desktop, each at 75% opacity with one "Suggested" label on the shelf
 * edge). Empty until then: it draws nothing and takes no space.
 */
export function ColdOpenSuggestions() {
  return <div className="cold-open-suggestions" data-part="suggestions" />;
}
