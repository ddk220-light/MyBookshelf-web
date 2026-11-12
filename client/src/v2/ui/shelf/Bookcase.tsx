import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useHoldingsStore } from '../../holdings';
import type { ShelfEntry } from '../home/shelfItems';
import { BookCover3D } from './BookCover3D';
import { bayRows, initialBayCount } from './shelfLayout';

const MORE_BAYS = 20;

/** The wooden bay: back panel, a row of books standing on the plank, plank front and its shadow. */
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
 * Saved books as face-out covers, three to a bay. Bays outside the viewport
 * skip layout and paint (content-visibility in home.css); above 200 books the
 * further bays are added as the reader scrolls towards them.
 */
export function Bookcase({ entries, libraryName }: { entries: ShelfEntry[]; libraryName: string | null }) {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  const rows = bayRows(entries);
  const [extra, setExtra] = useState(0);
  const shown = initialBayCount(entries.length) + extra;
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
    {rows.slice(0, shown).map((row, index) => <Bay key={index}>
      <ul className="bay-books">{row.map(entry => <li key={entry.key}>
        <BookCover3D entry={entry} libraryName={libraryName && entry.kind === 'book' && holdings.get(entry.key) === 'found' ? libraryName : null} />
      </li>)}</ul>
    </Bay>)}
    {more && <div ref={sentinel} className="home-bookcase-more" aria-hidden="true" />}
  </div>;
}
