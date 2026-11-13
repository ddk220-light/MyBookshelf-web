import { BarcodeGlyph, SearchGlyph } from '../home/homeIcons';
import { Bay } from './Bookcase';

/** First open: no saved books yet. */
export function EmptyShelf({ onSearch, onScan, showBays = true }: { onSearch: () => void; onScan: () => void; showBays?: boolean }) {
  return <>
    <div className="empty-shelf">
      <h1>Ready to search</h1>
      <p>Add books to your shelf and search in your library</p>
    </div>
    <div className="empty-shelf-actions">
      <button type="button" className="home-button" onClick={onSearch}><SearchGlyph />Search for a book</button>
      <button type="button" className="home-button home-button-outline" onClick={onScan}><BarcodeGlyph size={22} />Scan the barcode on a book</button>
    </div>
    {showBays && <EmptyBays />}
  </>;
}

/** Three empty bays filling the rest of the screen, the first with a dashed place for a book. */
export function EmptyBays() {
  return <div className="empty-bays" aria-hidden="true">
    <Bay className="bay-empty bay-spacious" shadow><div className="bay-slot"><span className="book-placeholder" /></div></Bay>
    <Bay className="bay-empty" shadow><div className="bay-slot" /></Bay>
    <Bay className="bay-empty bay-fill" shadow={false}><div className="bay-slot" /></Bay>
  </div>;
}
