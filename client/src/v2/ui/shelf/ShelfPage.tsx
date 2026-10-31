import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../context';
import { Cover, BookCard } from '../BookCard';
import { ConfirmDialog } from '../ConfirmDialog';
import { DogAnimation } from '../DogAnimation';
import { LibraryCard } from '../library/LibraryCard';
import { catalogStatus } from '../journal/DueSlip';
import { exampleBooks } from '../../exampleBooks';
import { readBookLookup, readCachedAvailability, readReaderPreferences, writeReaderPreferences, type ReaderPreferences } from '../../readerState';
import type { RecentBook } from '../../types';
import { spinePalette } from './spineColors';

export function ShelfPage() {
  const { library, loadingLibrary, libraryError, retryLibrary, state, clearRecentBooks, removeRecentBook, unsaveBook, recoveryMode, reportStorageFailure } = useLibrary();
  const [preferences, setPreferences] = useState(readReaderPreferences);
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const update = (patch: Partial<ReaderPreferences>) => {
    setPreferences(current => ({ ...current, ...patch }));
    if (!writeReaderPreferences(patch)) reportStorageFailure();
  };
  const books = [...state.savedBooks].sort((a, b) => preferences.shelfSort === 'title' ? a.title.localeCompare(b.title) : preferences.shelfSort === 'author'
    ? a.authors.join(', ').localeCompare(b.authors.join(', ')) || a.title.localeCompare(b.title) : Date.parse(b.viewedAt) - Date.parse(a.viewedAt));
  return <section className="page-section reader-shelf">
    <header className="reader-shelf-header"><h1>Shelf</h1>
      <Link className="library-chip" to="/app/libraries" state={{ after: '/app/shelf' }}>{loadingLibrary ? 'Loading library…' : library?.name || (libraryError ? 'Library unavailable' : 'Choose a library')} <span aria-hidden="true">⌄</span></Link>
      <div className="view-switch" role="group" aria-label="Shelf view"><button aria-label="Bookcase" aria-pressed={preferences.shelfView === 'shelf'} onClick={() => update({ shelfView: 'shelf' })}>▥</button><button aria-label="List" aria-pressed={preferences.shelfView === 'list'} onClick={() => update({ shelfView: 'list' })}>☷</button></div>
      <Link className="text-link shelf-find" to="/app/search">Find a book</Link>
    </header>
    <div className="shelf-controls"><span>{books.length} {books.length === 1 ? 'book' : 'books'}</span>
      <label><span className="visually-hidden">Sort saved books</span><select aria-label="Sort saved books" value={preferences.shelfSort} onChange={event => update({ shelfSort: event.target.value as ReaderPreferences['shelfSort'] })}><option value="recent">Recently added</option><option value="title">Title</option><option value="author">Author</option></select></label>
      <button className="text-button" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>
    </div>
    <div className="reader-shelf-layout">
      <div className="reader-shelf-main">
        {libraryError && <div className="reader-banner"><span>Couldn’t load your library.</span><button onClick={retryLibrary}>Retry</button></div>}
        {preferences.shelfView === 'shelf' ? <FaceoutShelf books={books} editing={editing} onRemove={unsaveBook} disabled={recoveryMode} /> : <ul className="reader-shelf-list" aria-label="Saved books">
          {books.map(book => {
            const libraryId = library?.id || state.selectedLibraryId;
            const availability = libraryId ? readCachedAvailability(libraryId, book.bookKey, readBookLookup(book.bookKey)) : null;
            return <li key={book.bookKey}><BookCard book={book} source="direct" /><span className="shelf-book-status">{availability ? 'Last result: ' + catalogStatus(availability).title : ''}</span>
              {editing && <button className="text-button" disabled={recoveryMode} aria-label={'Remove ' + book.title + ' from saved books'} onClick={() => unsaveBook(book.bookKey)}>Remove</button>}</li>;
          })}
        </ul>}
        {!books.length && <div className="shelf-start"><h2>Start your shelf</h2><p>Save the books you want to read.</p><Link className="button-link" to="/app/search">Find a book</Link>
          <ul className="shelf-examples">{exampleBooks.slice(0, 3).map(({ book }) => <li key={book.bookKey}><Link to={'/app/books/' + encodeURIComponent(book.bookKey)} state={{ from: 'shelf', book }}><Cover book={book} /><span>{book.title}</span></Link></li>)}</ul></div>}
        <DogAnimation pose="sit" className="shelf-bucky" />
      </div>
      <aside className="reader-shelf-side">
        {library && <div className="shelf-side-library"><h2>Your library</h2><LibraryCard library={library} compact selected /><Link className="text-link" to="/app/libraries" state={{ after: '/app/shelf' }}>Change library</Link></div>}
        <section className="reader-recent" aria-labelledby="recent-heading"><div className="section-heading"><h2 id="recent-heading">Recently viewed</h2>{state.recentBooks.length > 0 && <button className="text-button" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button>}</div>
          {state.recentBooks.length ? <ul>{state.recentBooks.slice(0, editing ? 50 : 8).map(book => <li key={book.bookKey}><BookCard book={book} source="direct" />
            {editing && <button className="text-button" disabled={recoveryMode} aria-label={'Remove ' + book.title + ' from recent books'} onClick={() => removeRecentBook(book.bookKey)}>Remove</button>}</li>)}</ul> : <p className="muted">Books you open appear here.</p>}
          {editing && state.recentBooks.length > 0 && <button className="text-button" disabled={recoveryMode} onClick={() => setClearing(true)}>Clear recent books</button>}
        </section>
        <p className="shelf-local-note">Your shelf is kept in this browser.</p>
      </aside>
    </div>
    <ConfirmDialog open={clearing} title="Clear recently viewed books?" body={<p>Your saved shelf stays. This cannot be undone.</p>}
      confirmLabel="Clear recent books" onConfirm={() => { clearRecentBooks(); setClearing(false); }} onCancel={() => setClearing(false)} />
  </section>;
}

function FaceoutShelf({ books, editing, onRemove, disabled }: { books: RecentBook[]; editing: boolean; onRemove: (key: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const target = parseFloat(getComputedStyle(node).getPropertyValue('--cover-w')) || 96;
      setColumns(Math.max(2, Math.floor((node.clientWidth + 18) / (target + 18))));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const slots = [...books, null];
  const rows = Array.from({ length: Math.ceil(slots.length / columns) }, (_, i) => slots.slice(i * columns, (i + 1) * columns));
  return <div className="faceout-bookcase" ref={ref} style={{ '--shelf-columns': columns } as CSSProperties} role="region" aria-label="Saved books">
    {rows.map((row, index) => <div className="faceout-row" key={index}>{row.map(book => book ? <div className="faceout-book" key={book.bookKey}>
      <Link to={'/app/books/' + encodeURIComponent(book.bookKey)} state={{ from: 'shelf', source: 'direct', book }} aria-label={book.title}>
        <Cover book={book} fallback={<span className="typeset-cover" style={{ background: spinePalette(book.bookKey).top, color: spinePalette(book.bookKey).ink }}><strong>{book.title}</strong><small>{book.authors.join(', ')}</small></span>} />
      </Link>
      {editing && <button className="cover-remove" disabled={disabled} aria-label={'Remove ' + book.title + ' from saved books'} onClick={() => onRemove(book.bookKey)}>−</button>}
    </div> : <Link className="shelf-add-book" to="/app/search" key="add"><span aria-hidden="true">+</span>Add a book</Link>)}</div>)}
  </div>;
}
