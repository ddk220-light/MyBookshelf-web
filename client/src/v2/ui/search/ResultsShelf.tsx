import { forwardRef, useSyncExternalStore } from 'react';
import { useHoldingsStore } from '../../holdings';
import { BarcodeGlyph, LibraryGlyph } from '../home/homeIcons';
import { Bay } from '../shelf/Bookcase';
import { BookCover3D } from '../shelf/BookCover3D';
import { ShelfList } from '../shelf/ShelfList';
import { bayRows } from '../shelf/shelfLayout';
import type { ShelfView } from '../shelf/ViewSwitch';
import type { ResultEntry } from './searchResults';
import { isMarked } from './useLibraryMarks';
import './search.css';

export const RESULTS_HEADING_ID = 'search-results-heading';
export type ResultsStatus = 'searching' | 'failed' | 'results';

/**
 * Search results in place of the saved shelf (Results and SearchStates
 * boards): ghost books while searching, up to nine covers on bays (or the
 * list), "No books found" with the scan button, or "Couldn't search" with
 * Try again. Nothing is written under the books. With a library chosen
 * (`libraryName`), a small line above the books reads "Looking in <library>…"
 * while its background check runs, and "In <library>" with the badge once
 * any result is marked; each marked cover gets the round library badge top
 * right. No badge never means "not in the library", so nothing else is said.
 */
export const ResultsShelf = forwardRef<HTMLHeadingElement, {
  status: ResultsStatus;
  entries: ResultEntry[];
  view: ShelfView;
  onRetry: () => void;
  onScan: () => void;
  libraryName?: string | null;
  checking?: boolean;
  /** Keep the line's place while results are shown (a check can run). */
  reserveLine?: boolean;
}>(function ResultsShelf({ status, entries, view, onRetry, onScan, libraryName = null, checking = false, reserveLine = false }, heading) {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  const marked = (entry: ResultEntry) => Boolean(libraryName) && isMarked(holdings, entry);
  const shown = status === 'results' && entries.length > 0;
  const anyMarked = shown && entries.some(marked);
  const title = status === 'searching' ? 'Searching' : status === 'failed' ? 'Couldn’t search' : entries.length ? 'Search results' : 'No books found';
  const message = status === 'failed' || (status === 'results' && !entries.length);
  return <section className="search-results" aria-labelledby={RESULTS_HEADING_ID} aria-busy={status === 'searching' || undefined}>
    <h2 id={RESULTS_HEADING_ID} ref={heading} tabIndex={-1} className={message ? 'search-message' : 'visually-hidden'}>{title}</h2>
    {status === 'searching' && <GhostBays />}
    {status === 'failed' && <button type="button" className="home-button search-message-action" onClick={onRetry}>Try again</button>}
    {status === 'results' && !entries.length && <button type="button" className="home-button home-button-outline search-message-action" onClick={onScan}><BarcodeGlyph size={22} />Scan the barcode</button>}
    {shown && libraryName && (reserveLine || checking || anyMarked) && <p className="results-library" aria-hidden="true">
      {checking ? <span className="results-library-looking">Looking in {libraryName}…</span>
        : anyMarked ? <span className="results-library-in"><span className="results-library-badge"><LibraryGlyph size={12} strokeWidth={2.4} /></span>In {libraryName}</span> : null}
    </p>}
    {shown && (view === 'list'
      ? <ShelfList entries={entries} libraryName={libraryName} mine={entry => (entry as ResultEntry).mine} inLibrary={entry => marked(entry as ResultEntry)} pop />
      : <div className="home-bookcase results-bookcase">
        {bayRows(entries).map((row, index) => <Bay key={index}>
          <ul className="bay-books">{row.map(entry => <li key={entry.key}><BookCover3D entry={entry} mine={entry.mine} libraryName={marked(entry) ? libraryName : null} pop /></li>)}</ul>
        </Bay>)}
      </div>)}
  </section>;
});

/** Three bays of plain book shapes while the search runs. */
function GhostBays() {
  return <div className="home-bookcase results-bookcase ghost-bookcase" aria-hidden="true">
    {[0, 1, 2].map(row => <Bay key={row}>
      <div className="bay-books">{[0, 1, 2].map(slot => <span key={slot} className="ghost-book" />)}</div>
    </Bay>)}
  </div>;
}
