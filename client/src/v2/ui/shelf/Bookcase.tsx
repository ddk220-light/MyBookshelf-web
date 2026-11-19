import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { holdingsLabel, useHoldingsStore } from '../../holdings';
import { shelfBadge, type ShelfEntry } from '../home/shelfItems';
import { BookCover3D } from './BookCover3D';
import { BOOKS_PER_BAY, bayRows, initialBayCount } from './shelfLayout';
import type { SuggestionMotion } from './useSuggestionMotion';

const MORE_BAYS = 20;

/**
 * The wooden bay: back panel, a row of books standing on the plank, plank
 * front and its shadow.
 */
export function Bay({ children, className = '', shadow = true }: { children?: ReactNode; className?: string; shadow?: boolean }) {
  return <div className={'bay ' + className}>
    <div className="bay-back">
      {children}
      <div className="bay-lip" aria-hidden="true" />
    </div>
    <div className="bay-plank" aria-hidden="true" />
    {shadow && <div className="bay-shadow" aria-hidden="true" />}
  </div>;
}

/**
 * The small "Suggested" label below a suggested book, on the plank front
 * (owner review, 14 November: one under each book). It is drawn over the
 * plank, so the bay keeps its height. Not faded, and hidden from assistive
 * technology: the book's name already ends ", suggested".
 */
function SuggestedLabel() {
  return <span className="suggested-label" aria-hidden="true">Suggested</span>;
}

/**
 * Saved books as face-out covers, three to a bay on phones (`perBay`: six at
 * wide widths, as many as fit on the rail). Bays outside the viewport
 * skip layout and paint (content-visibility in home.css); above 200 books the
 * further bays are added as the reader scrolls towards them. `openKey` is the
 * book open in the desktop middle slot: its cover is outlined.
 *
 * Shelf suggestions (`entry.suggested`) follow the saved books and wrap into
 * bays like them, each with a "Suggested" label below it. Their library
 * badge, as for saved books, comes only from answers already held: the
 * holdings store's, or the stored "found" the suggestion source read for the
 * chosen library (`shelfBadge`); nothing here asks a library. `motion` fades
 * in a new suggestion and turns a just-saved one solid. A held slot
 * (`entry.held`) stands empty.
 */
export function Bookcase({ entries, libraryName, perBay = BOOKS_PER_BAY, openKey = null, motion }: { entries: ShelfEntry[]; libraryName: string | null; perBay?: number; openKey?: string | null;
  motion?: ReadonlyMap<string, SuggestionMotion> }) {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  const rows = bayRows(entries, perBay);
  const [extra, setExtra] = useState(0);
  const shown = initialBayCount(entries.length, perBay) + extra;
  const sentinel = useRef<HTMLDivElement>(null);
  const more = shown < rows.length;
  useEffect(() => {
    const node = sentinel.current;
    if (!more || !node) return;
    if (typeof IntersectionObserver === 'undefined') { setExtra(rows.length); return; }
    const observer = new IntersectionObserver(items => { if (items.some(item => item.isIntersecting)) setExtra(count => count + MORE_BAYS); }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, rows.length]);
  return <div className={'home-bookcase' + (libraryName ? ' has-library' : '')}>
    {rows.slice(0, shown).map((row, index) => <Bay key={index}>
      {/* A held slot (`entry.held`) keeps its place, empty and without a label. */}
      <ul className="bay-books">{row.map(entry => {
        if (entry.held) return <li key={entry.key} aria-hidden="true" />;
        const found = Boolean(libraryName && shelfBadge(entry, holdings));
        const label = libraryName && entry.kind === 'book' ? holdingsLabel(found ? 'found' : holdings.get(entry.key)) : undefined;
        return <li key={entry.key}>
          <BookCover3D entry={entry} open={entry.key === openKey} motion={motion?.get(entry.key)}
            libraryName={found ? libraryName : null} status={label} />
          {label && <span className="cover-answer" aria-hidden="true">{label}</span>}
          {entry.suggested && <SuggestedLabel />}
        </li>;
      })}</ul>
    </Bay>)}
    {more && <div ref={sentinel} className="home-bookcase-more" aria-hidden="true" />}
  </div>;
}
