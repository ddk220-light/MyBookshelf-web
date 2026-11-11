import { Link, useLocation } from 'react-router-dom';
import { coverAlternatives, versionLabels, type SearchGroup } from '../../searchGroups';
import { uiMessages as m } from '../../uiMessages';
import { BookCard, Cover } from '../BookCard';
import { useCatalogMetadata } from '../../catalogMetadata';

export function SearchResult({ group, open, onToggle }: { group: SearchGroup; open?: boolean; onToggle?: (open: boolean) => void }) {
  const { book: initialBook, versions, separateWorks, editionCount } = group;
  const book = useCatalogMetadata(versions.length > 1 ? initialBook : null) || initialBook;
  const location = useLocation();
  const catalog = book.bookKey.startsWith('v1:catalog:');
  if (versions.length === 1) return <BookCard book={book} />;
  // Records of different works are numbered as records, never as versions.
  const labels = versionLabels(versions, catalog || separateWorks);
  const prompt = catalog ? m.viewCatalogRecords(versions.length) : separateWorks ? m.viewSameTitleRecords(versions.length) : m.viewVersions(versions.length);
  const hint = catalog ? m.catalogRecordChoiceHint : separateWorks ? m.sameTitleRecordsHint : m.versionChoiceHint;
  return <details className="book-result-group" open={open}>
    <summary className="book-card" onClick={onToggle ? event => { event.preventDefault(); onToggle(!open); } : undefined}>
      <Cover book={book} alternatives={coverAlternatives(group)} />
      <span><strong>{book.title}</strong>{book.authors.length > 0 && <small>{book.authors.join(', ')}</small>}
        {book.searchMatch === 'spelling' && <small>{m.similarSpelling}</small>}
        {/* The largest edition count among the records, never a sum. */}
        {!catalog && editionCount && editionCount > 1 && <small>{m.editionsGrouped(editionCount)}</small>}
        <small className="version-prompt">{prompt}</small></span>
      <span className="version-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="book-versions"><p className="form-hint">{hint}</p>
      <ul>{versions.map((version, index) => <li key={version.bookKey}>
        <Link className={`book-version-link${separateWorks ? ' with-cover' : ''}`} to={`/app/books/${encodeURIComponent(version.bookKey)}`}
          state={{ from: 'search', source: 'search', book: version, searchState: location.state }}>
          {/* Different works may be different books: each row shows its own cover. */}
          {separateWorks && <Cover book={version} />}
          <span><strong>{labels[index].label}</strong>
            {version.authors.length > 0 && <small>{version.authors.join(', ')}</small>}
            {version.isbn13 && !labels[index].showsIsbn && <small>{m.isbnVersion(version.isbn13)}</small>}
            {version.editionCount && version.editionCount > 1 && !labels[index].showsEditions && <small>{m.editionsGrouped(version.editionCount)}</small>}
          </span><span aria-hidden="true">→</span>
        </Link>
      </li>)}</ul>
    </div>
  </details>;
}
