import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useHoldingsStore } from '../../holdings';
import { shelfBadge, type ShelfEntry } from '../home/shelfItems';
import { BookCover3D } from './BookCover3D';
import { BOOKS_PER_BAY, bayRows, initialBayCount, suggestedRun } from './shelfLayout';
import type { SuggestionMotion } from './useSuggestionMotion';

const MORE_BAYS = 20;

/**
 * The wooden bay: back panel, a row of books standing on the plank, plank
 * front and its shadow. `plank` is drawn on the plank front (the
 * "Suggested" tag); like the plank, it is hidden from assistive technology.
 */
export function Bay({ children, className = '', shadow = true, plank }: { children?: ReactNode; className?: string; shadow?: boolean; plank?: ReactNode }) {
  return <div className={'bay ' + className}>
    <div className="bay-back">
      {children}
      <div className="bay-lip" aria-hidden="true" />
    </div>
    <div className="bay-plank" aria-hidden="true">{plank}</div>
    {shadow && <div className="bay-shadow" aria-hidden="true" />}
  </div>;
}

/**
 * One small "Suggested" tag on the plank front, centred under the bay's run
 * of suggestions (plan 2026-11-14, Part 2: never a caption under each book).
 * Its grid matches the books' columns.
 */
function SuggestedTag({ from, span }: { from: number; span: number }) {
  return <span className="bay-tags"><span className="bay-tag" style={{ gridColumn: (from + 1) + ' / span ' + span }}>Suggested</span></span>;
}

/**
 * Saved books as face-out covers, three to a bay on phones (`perBay`: six at
 * wide widths, as many as fit on the rail). Bays outside the viewport
 * skip layout and paint (content-visibility in home.css); above 200 books the
 * further bays are added as the reader scrolls towards them. `openKey` is the
 * book open in the desktop middle slot: its cover is outlined.
 *
 * Shelf suggestions (`entry.suggested`) follow the saved books and wrap into
 * bays like them; each bay they stand in carries one "Suggested" tag under
 * them. Their library badge, as for saved books, comes only from answers
 * already held: the holdings store's, or the server's stored "found" for the
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
  return <div className="home-bookcase">
    {rows.slice(0, shown).map((row, index) => {
      // A held slot (`entry.held`) keeps its place, empty and without a tag.
      const run = suggestedRun(row, entry => Boolean(entry.suggested && !entry.held));
      return <Bay key={index} plank={run && <SuggestedTag from={run.from} span={run.span} />}>
        <ul className="bay-books">{row.map(entry => entry.held ? <li key={entry.key} aria-hidden="true" /> : <li key={entry.key}>
          <BookCover3D entry={entry} open={entry.key === openKey} motion={motion?.get(entry.key)}
            libraryName={libraryName && shelfBadge(entry, holdings) ? libraryName : null} />
        </li>)}</ul>
      </Bay>;
    })}
    {more && <div ref={sentinel} className="home-bookcase-more" aria-hidden="true" />}
  </div>;
}
