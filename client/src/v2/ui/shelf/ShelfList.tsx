import { useSyncExternalStore, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useHoldingsStore } from '../../holdings';
import { useCoverImage } from '../BookCard';
import { LibraryGlyph } from '../home/homeIcons';
import { entryLabel, type ShelfEntry } from '../home/shelfItems';
import { spinePalette } from './spineColors';

/** The shelf as a plain list: small cover, title and author. */
export function ShelfList({ entries, libraryName }: { entries: ShelfEntry[]; libraryName: string | null }) {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  return <ul className="shelf-list">
    {entries.map(entry => <li key={entry.key}>
      <ShelfListItem entry={entry} libraryName={libraryName && entry.kind === 'book' && holdings.get(entry.key) === 'found' ? libraryName : null} />
    </li>)}
  </ul>;
}

function ShelfListItem({ entry, libraryName }: { entry: ShelfEntry; libraryName: string | null }) {
  const { url, ready, fail, onLoad } = useCoverImage(entry.kind === 'book' ? entry : {});
  const author = entry.authors.filter(Boolean).join(', ');
  return <Link className="shelf-list-item" to={entry.href} state={entry.state} aria-label={entryLabel(entry, libraryName)}>
    <span className="shelf-list-cover" aria-hidden="true" style={{ '--cover-bg': spinePalette(entry.key).top } as CSSProperties}>
      {url && <img src={url} alt="" width={36} height={54} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} onLoad={onLoad} data-ready={ready || undefined} />}
      {libraryName && <span className="cover-badge cover-badge-library cover-badge-small"><LibraryGlyph size={11} /></span>}
    </span>
    <span className="shelf-list-text" aria-hidden="true">
      <span className="shelf-list-title">{entry.title}</span>
      {author && <span className="shelf-list-author">{author}</span>}
    </span>
  </Link>;
}
