import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCoverImage } from '../BookCard';
import { BookmarkGlyph, LibraryGlyph } from '../home/homeIcons';
import { entryLabel, type ShelfEntry } from '../home/shelfItems';
import { spinePalette, suggestionPalette } from './spineColors';
import type { SuggestionMotion } from './useSuggestionMotion';
import type { CSSProperties } from 'react';

/**
 * A face-out book standing on a bay: the cover (the real image when one loads,
 * otherwise a plain coloured cover with the title and author typeset on it),
 * page edges along the top and right, and a library badge when the chosen
 * library has said it holds the book. A search result the reader has saved
 * carries the bookmark badge top left. Nothing is written under the book; the
 * link's name carries the title, author, "on my shelf" and library answer.
 * With `pop`, a library badge that arrives after the cover is drawn pops in
 * (search results; no motion under reduced motion); one already known when
 * the cover appears is simply there. `open`: the book is open in the desktop
 * middle slot, so its cover is outlined on the shelf (DeskBook board).
 *
 * A shelf suggestion (`entry.suggested`) stands at 75% opacity, its badge
 * excepted, and a plain cover uses the darker shade that keeps its title
 * readable when faded (spineColors.ts). `motion` fades a new suggestion in or
 * turns a just-saved one solid (SuggestShelf board; none under reduced motion).
 */
export function BookCover3D({ entry, libraryName, mine = false, pop = false, open = false, motion }: { entry: ShelfEntry; libraryName?: string | null; mine?: boolean; pop?: boolean; open?: boolean;
  motion?: SuggestionMotion }) {
  const badgeAtStart = useRef(Boolean(libraryName));
  const { url, ready, fail, onLoad } = useCoverImage(entry.kind === 'book' ? entry : {}, entry.alternatives);
  const palette = entry.suggested ? suggestionPalette(entry.key) : spinePalette(entry.key);
  const author = entry.authors.filter(Boolean).join(', ');
  // A long single word steps the type down rather than breaking mid-word.
  const longest = (text: string) => Math.max(0, ...text.split(/\s+/).map(word => word.length));
  const fit = (longest(entry.title) >= 12 ? ' title-xs' : longest(entry.title) >= 10 ? ' title-sm' : '') + (longest(author) >= 11 ? ' author-sm' : '');
  const classes = 'cover3d' + (entry.suggested ? ' is-suggested' : '') + (open ? ' is-open' : '')
    + (motion === 'arriving' && entry.suggested ? ' is-arriving' : motion === 'solid' && !entry.suggested ? ' is-turning-solid' : '');
  return <Link className={classes} to={entry.href} state={entry.state} aria-label={entryLabel(entry, libraryName, mine)}
    data-shelf-key={entry.key} data-suggested={entry.suggested ? '' : undefined}
    style={{ '--cover-bg': palette.top, '--cover-ink': palette.ink } as CSSProperties}>
    <span className="cover3d-top" aria-hidden="true" />
    <span className="cover3d-side" aria-hidden="true" />
    <span className="cover3d-face" aria-hidden="true" data-cover={ready ? 'ready' : url ? 'loading' : 'missing'}>
      {!ready && <span className={'cover3d-type' + fit}><span className="cover3d-title">{entry.title}</span>{author && <><span className="cover3d-rule" /><span className="cover3d-author">{author}</span></>}</span>}
      {url && <img className="cover3d-image" src={url} alt="" width={84} height={126} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={fail} onLoad={onLoad} />}
    </span>
    {mine && <span className="cover-badge cover-badge-mine" aria-hidden="true"><BookmarkGlyph /></span>}
    {libraryName && <span className={'cover-badge cover-badge-library' + (pop && !badgeAtStart.current ? ' cover-badge-pop' : '')} aria-hidden="true"><LibraryGlyph /></span>}
  </Link>;
}
