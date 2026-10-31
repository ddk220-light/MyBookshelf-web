import { uiMessages as m } from '../uiMessages';
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { PublicBook, RecentSource } from '../types';
import { OpenBookIcon } from './icons';
import { useCatalogMetadata } from '../catalogMetadata';

export function BookCard({
  book: initialBook,
  source = 'search',
}: {
  book: Pick<PublicBook, 'bookKey' | 'title' | 'authors' | 'isbn13' | 'coverUrl' | 'edition' | 'publisher' | 'publishedDate' | 'editionCount' | 'searchMatch'>;
  source?: RecentSource;
}) {
  const book = useCatalogMetadata(initialBook)!;
  const authorLine = book.authors.join(', ');
  const location = useLocation();
  return <Link className="book-card" to={`/app/books/${encodeURIComponent(book.bookKey)}`} state={{ from: location.pathname === '/app/search' ? 'search' : 'shelf', source, book, searchState: location.pathname === '/app/search' ? location.state : undefined }}>
    <Cover book={book} />
    <span><strong title={book.title}>{book.title}</strong>{authorLine && <small title={authorLine}>{authorLine}</small>}
      {book.searchMatch === 'spelling' && <small>{m.similarSpelling}</small>}
      {book.editionCount && book.editionCount > 1 && <small>{m.editionsGrouped(book.editionCount)}</small>}
      {book.bookKey.startsWith('v1:catalog:') && <small>{[book.edition, book.publisher, book.publishedDate].filter(Boolean).join(' · ')}</small>}</span>
  </Link>;
}

export function Cover({ book, alternatives = [], fallback }: { book: Pick<PublicBook, 'title' | 'coverUrl' | 'isbn13'>; alternatives?: PublicBook[]; fallback?: ReactNode }) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [loadedUrl, setLoadedUrl] = useState<string>();
  const urls = [...new Set([book.coverUrl, book.isbn13 && `https://covers.openlibrary.org/b/isbn/${book.isbn13}-M.jpg?default=false`, ...alternatives.flatMap(candidate => [candidate.coverUrl,
    candidate.isbn13 && `https://covers.openlibrary.org/b/isbn/${candidate.isbn13}-M.jpg?default=false`])].filter((url): url is string => Boolean(url)))];
  const url = urls.find(candidate => !failedUrls.includes(candidate));
  const fail = () => { if (url) setFailedUrls(values => [...values, url]); };
  const ready = Boolean(url && url === loadedUrl);
  return <span className={`cover cover-frame${ready ? '' : ' cover-placeholder'}`} aria-busy={Boolean(url && !ready)} data-cover={ready ? 'ready' : url ? 'loading' : 'missing'}>
    {!url && <span className="cover-fallback" aria-hidden="true">{fallback || <span className="typeset-cover" data-title={book.title}><OpenBookIcon /><small className="visually-hidden">{m.noCover}</small></span>}</span>}
    {url && <img className="cover-image" src={url} alt={`Cover of ${book.title}`} loading="lazy" referrerPolicy="no-referrer" onError={fail}
      onLoad={event => { if (event.currentTarget.naturalWidth <= 1) fail(); else setLoadedUrl(url); }} />}
  </span>;
}
