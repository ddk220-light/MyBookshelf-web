import { useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useHoldingsStore } from '../../holdings';
import { useCoverImage } from '../BookCard';
import { BookmarkGlyph, LibraryGlyph } from '../home/homeIcons';
import { entryLabel, type ShelfEntry } from '../home/shelfItems';
import { spinePalette } from './spineColors';

/**
 * The shelf as a plain list: small cover, title and author. Search results
 * pass `mine` for books already on the reader's shelf and show the year,
 * `inLibrary` to decide which rows the library has (a card can stand for
 * several records of one work) and `pop` for badges that pop in on arrival.
 */
export function ShelfList({ entries, libraryName, mine, inLibrary, pop = false }: { entries: ShelfEntry[]; libraryName: string | null; mine?: (entry: ShelfEntry) => boolean;
  inLibrary?: (entry: ShelfEntry) => boolean; pop?: boolean }) {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  return <ul className="shelf-list">
    {entries.map(entry => <li key={entry.key}>
      <ShelfListItem entry={entry} mine={mine?.(entry) || false} pop={pop}
        libraryName={libraryName && entry.kind === 'book' && (inLibrary ? inLibrary(entry) : holdings.get(entry.key) === 'found') ? libraryName : null} />
    </li>)}
  </ul>;
}

function ShelfListItem({ entry, libraryName, mine, pop }: { entry: ShelfEntry; libraryName: string | null; mine: boolean; pop: boolean }) {
  const badgeAtStart = useRef(Boolean(libraryName));
  const { url, ready, fail, onLoad } = useCoverImage(entry.kind === 'book' ? entry : {}, entry.alternatives);
  const author = [entry.authors.filter(Boolean).join(', '), entry.year].filter(Boolean).join(' · ');
  return <Link className="shelf-list-item" to={entry.href} state={entry.state} aria-label={entryLabel(entry, libraryName, mine)}>
    <span className="shelf-list-cover" aria-hidden="true" style={{ '--cover-bg': spinePalette(entry.key).top } as CSSProperties}>
      {url && <img src={url} alt="" width={36} height={54} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} onLoad={onLoad} data-ready={ready || undefined} />}
      {mine && <span className="cover-badge cover-badge-mine cover-badge-small"><BookmarkGlyph size={11} /></span>}
      {libraryName && <span className={'cover-badge cover-badge-library cover-badge-small' + (pop && !badgeAtStart.current ? ' cover-badge-pop' : '')}><LibraryGlyph size={11} /></span>}
    </span>
    <span className="shelf-list-text" aria-hidden="true">
      <span className="shelf-list-title">{entry.title}</span>
      {author && <span className="shelf-list-author">{author}</span>}
    </span>
  </Link>;
}
