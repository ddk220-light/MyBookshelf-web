import { forwardRef, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { holdingsLabel, useHoldingsStore } from '../../holdings';
import { BarcodeGlyph } from '../home/homeIcons';
import { Bay } from '../shelf/Bookcase';
import { BookCover3D } from '../shelf/BookCover3D';
import { ShelfList } from '../shelf/ShelfList';
import { BOOKS_PER_BAY, bayRows } from '../shelf/shelfLayout';
import type { ShelfView } from '../shelf/ViewSwitch';
import type { ResultEntry } from './searchResults';
import { resultAnswer } from './useLibraryMarks';
import './search.css';

export const RESULTS_HEADING_ID = 'search-results-heading';
export type ResultsStatus = 'searching' | 'failed' | 'results';

/**
 * Search results in place of the saved shelf (Results and SearchStates
 * boards): ghost books while searching, up to nine covers on bays (or the
 * list), "No books found" with the scan button, or "Couldn't search" with
 * Try again. The title and byline sit under each cover, with a library answer
 * when one is known. The line above the books appears during the check.
 * At wide widths (DeskResults board) `back` ("Back to my reading shelf") stands on
 * the same row as that line, and `perBay` covers stand on each bay.
 */
export const ResultsShelf = forwardRef<HTMLHeadingElement, {
  status: ResultsStatus;
  entries: ResultEntry[];
  view: ShelfView;
  onRetry: () => void;
  onScan?: (opener: HTMLElement) => void;
  libraryName?: string | null;
  checking?: boolean;
  /** Keep the line's place while results are shown (a check can run). */
  reserveLine?: boolean;
  /** "Back to my reading shelf", drawn beside the library line (wide widths). */
  back?: ReactNode;
  perBay?: number;
  /** The book open in the desktop middle slot: its cover is outlined. */
  openKey?: string | null;
}>(function ResultsShelf({ status, entries, view, onRetry, onScan, libraryName = null, checking = false, reserveLine = false, back, perBay = BOOKS_PER_BAY, openKey = null }, heading) {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  const answerFor = (entry: ResultEntry) => libraryName ? resultAnswer(holdings, entry) : undefined;
  const shown = status === 'results' && entries.length > 0;
  const title = status === 'searching' ? 'Searching' : status === 'failed' ? 'Couldn’t search' : entries.length ? 'Search results' : 'No books found';
  const message = status === 'failed' || (status === 'results' && !entries.length);
  const line = <p className="results-library" aria-hidden="true">
    {checking && <span className="results-library-looking">Looking in {libraryName}…</span>}
  </p>;
  return <section className="search-results" aria-labelledby={RESULTS_HEADING_ID} aria-busy={status === 'searching' || undefined}>
    {back && <div className="results-head">{back}{shown && libraryName && line}</div>}
    <h2 id={RESULTS_HEADING_ID} ref={heading} tabIndex={-1} className={message ? 'search-message' : 'visually-hidden'}>{title}</h2>
    {status === 'searching' && <GhostBays perBay={perBay} />}
    {status === 'failed' && <button type="button" className="home-button search-message-action" onClick={onRetry}>Try again</button>}
    {status === 'results' && !entries.length && <div className="search-no-results">
      <h3>Things to try</h3>
      <ul>
        <li>Check the spelling, or type fewer words.</li>
        <li>Search by the author’s name instead.</li>
        <li>Type the 13-digit ISBN from the back cover.</li>
      </ul>
      {onScan && <button type="button" className="home-button home-button-outline search-message-action" onClick={event => onScan(event.currentTarget)}><BarcodeGlyph size={22} />Scan the book’s barcode</button>}
      <Link className="home-text-button" to="/app/report" state={{ reportScreen: 'search' }}>The book exists but isn’t found? Tell us</Link>
    </div>}
    {!back && shown && libraryName && (reserveLine || checking) && line}
    {shown && (view === 'list'
      ? <ShelfList entries={entries} libraryName={libraryName} mine={entry => (entry as ResultEntry).mine} answerFor={entry => answerFor(entry as ResultEntry)} pop />
      : <div className="home-bookcase results-bookcase">
        {bayRows(entries, perBay).map((row, index) => <Bay key={index}>
          <ul className="bay-books result-captions">{row.map(entry => {
            const answer = answerFor(entry);
            const label = holdingsLabel(answer);
            const byline = [...entry.authors.filter(Boolean), entry.year].filter(Boolean).join(' · ');
            return <li key={entry.key}>
              <BookCover3D entry={entry} mine={entry.mine} open={entry.key === openKey} libraryName={answer === 'found' ? libraryName : null} status={label} pop />
              <span className="result-caption" aria-hidden="true">
                <strong>{entry.title}</strong>
                {byline && <span>{byline}</span>}
                {label && <span className="cover-answer">{label}</span>}
              </span>
            </li>;
          })}</ul>
        </Bay>)}
      </div>)}
  </section>;
});

/** Three bays of plain book shapes while the search runs (fewer at wide widths, where a bay holds six). */
function GhostBays({ perBay }: { perBay: number }) {
  const count = Math.max(1, Math.ceil(9 / Math.max(1, perBay)));
  return <div className="home-bookcase results-bookcase ghost-bookcase" aria-hidden="true">
    {Array.from({ length: count }, (_, row) => <Bay key={row}>
      <div className="bay-books">{Array.from({ length: row === count - 1 ? 9 - perBay * row : perBay }, (_, slot) => <span key={slot} className="ghost-book" />)}</div>
    </Bay>)}
  </div>;
}
