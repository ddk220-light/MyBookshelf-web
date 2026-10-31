import { Link, useLocation } from 'react-router-dom';
import type { SearchGroup } from '../../searchGroups';
import { uiMessages as m } from '../../uiMessages';
import { BookCard, Cover } from '../BookCard';
import { useCatalogMetadata } from '../../catalogMetadata';

export function SearchResult({ group: { book: initialBook, versions }, open, onToggle }: { group: SearchGroup; open?: boolean; onToggle?: (open: boolean) => void }) {
  const book = useCatalogMetadata(versions.length > 1 ? initialBook : null) || initialBook;
  const location = useLocation();
  const catalog = book.bookKey.startsWith('v1:catalog:');
  if (versions.length === 1) return <BookCard book={book} />;
  return <details className="book-result-group" open={open}>
    <summary className="book-card" onClick={onToggle ? event => { event.preventDefault(); onToggle(!open); } : undefined}>
      <Cover book={book} alternatives={versions} />
      <span><strong>{book.title}</strong>{book.authors.length > 0 && <small>{book.authors.join(', ')}</small>}
        {book.searchMatch === 'spelling' && <small>{m.similarSpelling}</small>}
        <small className="version-prompt">{catalog ? m.viewCatalogRecords(versions.length) : m.viewVersions(versions.length)}</small></span>
      <span className="version-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="book-versions"><p className="form-hint">{catalog ? m.catalogRecordChoiceHint : m.versionChoiceHint}</p>
      <ul>{versions.map((version, index) => <li key={version.bookKey}>
        <Link className="book-version-link" to={`/app/books/${encodeURIComponent(version.bookKey)}`}
          state={{ from: 'search', source: 'search', book: version, searchState: location.state }}>
          <span>{catalog && <small className="record-number">{m.numberedCatalogRecord(index + 1)}</small>}<strong>{[version.edition, version.publisher, version.publishedDate && m.publishedIn(version.publishedDate)].filter(Boolean).join(' · ') || m.numberedVersion(index + 1)}</strong>
            {version.authors.length > 0 && <small>{version.authors.join(', ')}</small>}
            {version.isbn13 && <small>{m.isbnVersion(version.isbn13)}</small>}
            {version.editionCount && version.editionCount > 1 && <small>{m.editionsGrouped(version.editionCount)}</small>}
          </span><span aria-hidden="true">→</span>
        </Link>
      </li>)}</ul>
    </div>
  </details>;
}
