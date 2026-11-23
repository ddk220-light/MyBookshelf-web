import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { RecentBook } from '../../types';
import { entryLabel } from '../home/shelfItems';
import { spinePalette } from './spineColors';
import { viewedSpineSize } from './shelfLayout';

/** "Viewed before": the books opened recently, as spines on one bay that scrolls sideways. */
export function SpineRow({ books, onClear, disabled }: { books: RecentBook[]; onClear: () => void; disabled?: boolean }) {
  if (!books.length) return null;
  return <section className="viewed-before" aria-labelledby="viewed-before-heading">
    <div className="viewed-before-heading">
      <h2 id="viewed-before-heading">Viewed before</h2>
      <button type="button" className="home-text-button" onClick={onClear} disabled={disabled}>Clear</button>
    </div>
    <div className="bay bay-spines">
      <div className="bay-back">
        <ul className="spine-row" aria-labelledby="viewed-before-heading">
          {books.map(book => {
            const palette = spinePalette(book.bookKey), size = viewedSpineSize(book.bookKey);
            const author = book.authors.filter(Boolean).join(', ');
            return <li key={book.bookKey}>
              <Link className="viewed-spine" to={'/app/books/' + encodeURIComponent(book.bookKey)} state={{ from: 'shelf', source: 'direct', book }}
                aria-label={entryLabel(book)} style={{ '--spine-bg': palette.top, '--spine-ink': palette.ink, width: size.width, height: size.height } as CSSProperties}>
                <span className="viewed-spine-title" aria-hidden="true">{book.title}</span>
                {author && <span className="viewed-spine-author" aria-hidden="true">{author}</span>}
              </Link>
            </li>;
          })}
        </ul>
        <div className="bay-lip" aria-hidden="true" />
      </div>
      <div className="bay-plank" aria-hidden="true" />
    </div>
  </section>;
}
