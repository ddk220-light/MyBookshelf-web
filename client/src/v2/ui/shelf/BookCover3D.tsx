import { Link } from 'react-router-dom';
import { useCoverImage } from '../BookCard';
import { LibraryGlyph } from '../home/homeIcons';
import { entryLabel, type ShelfEntry } from '../home/shelfItems';
import { spinePalette } from './spineColors';
import type { CSSProperties } from 'react';

/**
 * A face-out book standing on a bay: the cover (the real image when one loads,
 * otherwise a plain coloured cover with the title and author typeset on it),
 * page edges along the top and right, and a library badge when the chosen
 * library has said it holds the book. Nothing is written under the book; the
 * link's name carries the title, author and library answer.
 */
export function BookCover3D({ entry, libraryName }: { entry: ShelfEntry; libraryName?: string | null }) {
  const { url, ready, fail, onLoad } = useCoverImage(entry.kind === 'book' ? entry : {});
  const palette = spinePalette(entry.key);
  const author = entry.authors.filter(Boolean).join(', ');
  // A long single word steps the type down rather than breaking mid-word.
  const longest = (text: string) => Math.max(0, ...text.split(/\s+/).map(word => word.length));
  const fit = (longest(entry.title) >= 12 ? ' title-xs' : longest(entry.title) >= 10 ? ' title-sm' : '') + (longest(author) >= 11 ? ' author-sm' : '');
  return <Link className="cover3d" to={entry.href} state={entry.state} aria-label={entryLabel(entry, libraryName)}
    style={{ '--cover-bg': palette.top, '--cover-ink': palette.ink } as CSSProperties}>
    <span className="cover3d-top" aria-hidden="true" />
    <span className="cover3d-side" aria-hidden="true" />
    <span className="cover3d-face" aria-hidden="true" data-cover={ready ? 'ready' : url ? 'loading' : 'missing'}>
      {!ready && <span className={'cover3d-type' + fit}><span className="cover3d-title">{entry.title}</span>{author && <><span className="cover3d-rule" /><span className="cover3d-author">{author}</span></>}</span>}
      {url && <img className="cover3d-image" src={url} alt="" width={84} height={126} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} onLoad={onLoad} />}
    </span>
    {libraryName && <span className="cover-badge cover-badge-library" aria-hidden="true"><LibraryGlyph /></span>}
  </Link>;
}
