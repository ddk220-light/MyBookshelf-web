import { exampleBooks } from '../../exampleBooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { publicApi } from '../../api';
import { BrowserIsbnScanner, type IsbnScanner } from '../../camera';
import { isbnSource, isValidIsbn13, messageFor, useLibrary } from '../../context';
import { candidatesFor, catalogForCandidates, pageForCandidates, queryForCandidates, rememberCandidates, mergeCandidatePage, markIncompletePage, viewForCandidates, updateSearchView } from '../../searchMemory';
import type { PublicBook, RecentSource } from '../../types';
import { Cover } from '../BookCard';
import { groupSearchResults } from '../../searchGroups';
import { SearchResult } from './SearchResult';
import { Notice } from '../Notice';
import { uiMessages as m } from '../../uiMessages';
import { ScanIcon, SearchIcon } from '../icons';
import { Sheet } from '../Sheet';
import { BookCard } from '../BookCard';

export function ScanPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { library, loadingLibrary, libraryError, retryLibrary, state } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const candidateId = (location.state as { candidateId?: unknown } | null)?.candidateId;
  const results = candidatesFor(candidateId);
  const catalog = catalogForCandidates(candidateId);
  const [searchLibrary, setSearchLibrary] = useState(() => candidateId ? Boolean(catalog) : true);
  const [query, setQuery] = useState(() => queryForCandidates(candidateId));
  const titleOnly = searchLibrary && library?.capabilities.titleSearch && library.capabilities.isbnLookup === false;

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!(location.state as { focusSearch?: boolean } | null)?.focusSearch) return;
    const frame = requestAnimationFrame(() => document.getElementById('book-search')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [location.key, location.state]);
  useEffect(() => {
    if (results) { setQuery(queryForCandidates(candidateId)); setSearchLibrary(Boolean(catalog)); }
  }, [candidateId, results, catalog]);

  const submitSearch = useCallback(async (value: string, source?: RecentSource) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(titleOnly ? m.emptyTitleQuery : m.emptyQuery);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const libraryId = searchLibrary && library?.capabilities.titleSearch ? library.id : undefined;
      const response = await publicApi.searchBooks(trimmed, controller.signal, libraryId);
      if (controller.signal.aborted) return;
      if (response.kind === 'exact') {
        navigate(`/app/books/${encodeURIComponent(response.book.bookKey)}`, { state: { from: 'search', source: source || isbnSource(trimmed), book: response.book, searchState: typeof candidateId === 'string' ? { candidateId } : undefined } });
        return;
      }
      const id = rememberCandidates(response.candidates, response.catalog, trimmed,
        { nextOffset: response.nextOffset, partial: response.partial, libraryId });
      navigate('/app/search', { replace: true, state: { candidateId: id } });
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(messageFor(failure, 'We couldn’t find this book. Try again.'));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }, [navigate, library, searchLibrary, titleOnly, candidateId]);

  const queryStarted = useRef<string | null>(null);
  useEffect(() => {
    const incoming = new URLSearchParams(location.search).get('q');
    if (!incoming || incoming === queryStarted.current || loadingLibrary) return;
    queryStarted.current = incoming;
    setQuery(incoming);
    void submitSearch(incoming);
  }, [location.search, loadingLibrary, submitSearch]);

  return <section className="page-section search-page">
    <header className="page-heading"><h1>Search</h1></header>
    <div className="search-layout">
    <aside className="selected-library" aria-label={m.yourLibrary}>
      {loadingLibrary ? <p role="status">{m.loadingLibrary}</p> : libraryError ? <><p role="alert">{m.libraryLoadError}</p><button className="button-quiet" onClick={retryLibrary}>{m.retry}</button></> : library ? <span>{library.name}</span> : null}
      {!loadingLibrary && <Link className="text-link" to="/app/libraries" state={{ after: '/app/search' }}>{library ? m.changeLibrary : m.chooseLibrary} <span aria-hidden="true">→</span></Link>}
      {library && !library.capabilities.titleSearch && library.catalogUrl && <a className="text-link" href={library.catalogUrl} target="_blank" rel="noopener noreferrer">{m.libraryWebsite}</a>}
    </aside>
    <div className="search-primary">
    <form className="search-form book-search-form" onSubmit={(event) => { event.preventDefault(); void submitSearch(query); }}>
      <label className="visually-hidden" htmlFor="book-search">{titleOnly ? m.titleLabel : m.searchLabel}</label>
      <div className="book-search-input"><div className="search-input-shell"><input id="book-search" type="search" enterKeyHint="search" spellCheck={false} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} autoComplete="off" placeholder={titleOnly ? m.titlePlaceholder : m.searchPlaceholder} />
        {query && <button type="button" className="icon-button" aria-label="Clear book search" onClick={() => { setQuery(''); navigate('/app/search', { replace: true }); document.getElementById('book-search')?.focus(); }}>×</button>}
        {!titleOnly && <CameraLookup compact onScanned={(isbn) => { setQuery(isbn); void submitSearch(isbn, 'camera'); }} />}</div>
        <button className="search-submit" aria-label={busy ? m.searching : m.searchButton} disabled={busy}><span className="search-submit-label">{busy ? m.searching : m.searchButton}</span><span className="search-submit-icon" aria-hidden="true"><SearchIcon /></span></button>{busy && <button type="button" className="button-quiet" onClick={() => request.current?.abort()}>{m.cancel}</button>}
      </div>
      {library?.capabilities.titleSearch && <div className="search-scope segment-control" role="group" aria-label="Search in"><button type="button" aria-pressed={!searchLibrary} onClick={() => { setSearchLibrary(false); navigate('/app/search', { replace: true }); }} disabled={busy}>All books</button><button type="button" aria-pressed={searchLibrary} onClick={() => { setSearchLibrary(true); navigate('/app/search', { replace: true }); }} disabled={busy} aria-label={library.name}><span className="scope-library-name">{library.name}</span></button></div>}
    </form>
    {error && <div className="search-error"><Notice tone="error">{error}</Notice></div>}
    {busy && !results && <div className="search-skeletons" role="status"><span className="visually-hidden">Searching books…</span>{[0,1,2,3].map(i => <div key={i} className="skeleton" />)}</div>}
    {results && <CandidateResults key={String(candidateId)} id={String(candidateId)} candidates={results} catalog={catalog} />}
    {Boolean(candidateId) && !results && <Notice>Search again to see your results.</Notice>}
    {!results && !candidateId && !busy && !error && !query.trim() && <>
      {state.recentBooks.length > 0 && <section className="search-recent"><h2>Recently viewed</h2><ul>{state.recentBooks.slice(0, 6).map(book => <li key={book.bookKey}><BookCard book={book} source="direct" /></li>)}</ul></section>}
      <section className="example-books" aria-labelledby="example-books-heading"><h2 id="example-books-heading">Try a book</h2><ul className="example-book-list">{exampleBooks.map(({ book, category, authorLabel }) => <li key={book.bookKey}><Link className="example-book-card" to={`/app/books/${encodeURIComponent(book.bookKey)}`} state={{ from: 'search', source: 'direct', book }} aria-label={m.tryBook(book.title)}><Cover book={book} /><span className="example-book-copy"><small className="example-book-category">{category}</small><strong>{book.title}</strong><span className="example-book-author">{authorLabel}</span></span></Link></li>)}</ul></section>
    </>}
    </div>
    <aside className="search-tools" aria-label={m.searchTools}>
      <p className="keyboard-hint"><kbd>Alt + /</kbd> {m.focusSearchHint}</p>
    </aside>
    </div>
  </section>;
}

export function CameraLookup({
  onScanned,
  createScanner = () => new BrowserIsbnScanner(),
  compact = false,
}: {
  onScanned: (isbn: string) => void;
  createScanner?: () => IsbnScanner;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [manualIsbn, setManualIsbn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const scanner = useRef<IsbnScanner | null>(null);
  const openButton = useRef<HTMLButtonElement | null>(null);
  const onScannedRef = useRef(onScanned);
  const createScannerRef = useRef(createScanner);
  onScannedRef.current = onScanned;
  createScannerRef.current = createScanner;
  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) {
        scanner.current?.stop();
        setOpen(false);
      }
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, []);
  useEffect(() => {
    if (!open || !video.current) return;
    const current = createScannerRef.current();
    scanner.current = current;
    let active = true;
    setError(null);
    void current.start(video.current, (code) => {
      if (!active) return;
      const isbn = code.replace(/[\s-]/g, '');
      if (!isValidIsbn13(isbn)) {
        setError('Barcode not recognized. Enter the ISBN instead.');
        return;
      }
      active = false;
      current.stop();
      setOpen(false);
      window.setTimeout(() => openButton.current?.focus());
      onScannedRef.current(isbn);
    }).catch((failure: unknown) => {
      if (!active) return;
      const name = failure && typeof failure === 'object' && 'name' in failure ? String(failure.name) : '';
      setError(name === 'NotAllowedError'
        ? 'Camera access was not allowed. Enter the ISBN instead.'
        : name === 'NotReadableError'
          ? 'The camera is busy in another app. Enter the ISBN instead.'
          : 'Camera scanning is not available here. Enter the ISBN instead.');
      current.stop();
    });
    return () => {
      active = false;
      current.stop();
      if (scanner.current === current) scanner.current = null;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); scanner.current?.stop(); setOpen(false);
      window.setTimeout(() => openButton.current?.focus());
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const close = () => {
    scanner.current?.stop();
    setOpen(false);
    window.setTimeout(() => openButton.current?.focus());
  };

  return <section id="scan" className={`scan-panel${compact ? ' scan-inline' : ''}`} aria-label={m.cameraTitle}>
    {!compact && <div className="camera-intro"><span className="camera-symbol"><ScanIcon /></span><div><h2 id="scan-heading">{m.cameraTitle}</h2><p>{m.cameraHint}</p></div></div>}
    <button type="button" className="button-quiet scanner-trigger" aria-label={m.openCamera} ref={openButton} onClick={() => setOpen(true)}><ScanIcon />{!compact && m.openCamera}</button>
    <Sheet open={open} title="Scan or enter an ISBN" className="scanner-sheet" onClose={close}>
      <div className="scanner-layout"><div className="scanner-manual"><label htmlFor="scanner-isbn">ISBN<input id="scanner-isbn" inputMode="numeric" value={manualIsbn} onChange={event => setManualIsbn(event.target.value)} placeholder="978…" /></label>
        <button type="button" onClick={() => { const isbn = manualIsbn.replace(/[\s-]/g, ''); if (!isValidIsbn13(isbn)) { setError('Enter a valid ISBN.'); return; } close(); onScannedRef.current(isbn); }}>Find this edition</button>
        {error && <Notice tone="error">{error}</Notice>}
      </div><div className="camera-box"><p>{m.scanAlignment}</p><span className="camera-frame"><video ref={video} muted playsInline aria-label={m.cameraPreview} /></span><button type="button" className="button-quiet" onClick={close}>{m.closeCamera}</button></div></div>
    </Sheet>
  </section>;
}

function CandidateResults({ id, candidates, catalog }: { id: string; candidates: PublicBook[]; catalog?: { name: string; hasMore: boolean } }) {
  const [view, setView] = useState(() => viewForCandidates(id));
  const [items, setItems] = useState(candidates);
  const [page, setPage] = useState(() => pageForCandidates(id));
  const [source, setSource] = useState(catalog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const groups = groupSearchResults(items);
  const spellingMatches = !source && items.length > 0 && items.every(book => book.searchMatch === 'spelling');
  const changeView = (patch: Partial<typeof view>) => {
    updateSearchView(id, patch); setView(value => ({ ...value, ...patch }));
  };
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const screen = heading.current?.closest('main');
    const saved = viewForCandidates(id);
    const frame = requestAnimationFrame(() => {
      if (saved.visited) { if (screen) screen.scrollTop = saved.scrollTop; }
      else heading.current?.focus();
      updateSearchView(id, { visited: true });
    });
    const remember = () => updateSearchView(id, { scrollTop: screen?.scrollTop || 0 });
    screen?.addEventListener('scroll', remember);
    return () => { cancelAnimationFrame(frame); screen?.removeEventListener('scroll', remember); };
  }, [id]);

  async function fetchPages(offsets: number[], reveal: boolean) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setBusy(true); setError(null);
    let pendingOffset: number | undefined;
    try {
      for (const offset of offsets) {
        pendingOffset = offset;
        const response = await publicApi.searchBooks(queryForCandidates(id), controller.signal, page.libraryId, offset || undefined);
        if (controller.signal.aborted) return;
        if (response.kind !== 'candidates') throw new Error('Unexpected search page');
        const merged = mergeCandidatePage(id, offset, response);
        setItems(merged.items); setPage(merged.page); setSource(merged.catalog);
        pendingOffset = undefined;
      }
      if (reveal) changeView({ visibleCount: view.visibleCount + 5 });
    } catch {
      if (!controller.signal.aborted) {
        if (pendingOffset !== undefined) setPage(markIncompletePage(id, pendingOffset));
        setError(reveal ? m.moreBooksFailed : m.retrySearchFailed);
      }
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }
  function showMore() {
    if (view.visibleCount < groups.length) changeView({ visibleCount: view.visibleCount + 5 });
    else if (page.nextOffset != null) void fetchPages([page.nextOffset], true);
  }
  return <section className="candidate-section" aria-live="polite"><h2 ref={heading} tabIndex={-1}>{spellingMatches ? m.similarSearchResults : m.searchResults}</h2>
    {spellingMatches && <p className="form-hint">{m.spellingSearchHint}</p>}
    <p className="results-source">{m.resultsFrom(source?.name || m.publicBookData)}</p>
    {source?.hasMore && page.nextOffset == null && <p className="form-hint">{m.moreMatches}</p>}
    {!items.length && !page.partial && <Notice>{m.noMatches(source?.name)}</Notice>}
    {items.length > 0 && <div className="catalog-drawer">
      <p className="drawer-label">{queryForCandidates(id)}<small>{source?.name || m.allBooks}</small></p>
      <ul className={`book-grid${source ? ' catalog-results' : ''}`}>
        {groups.slice(0, view.visibleCount).map(group => <li key={group.book.bookKey}><SearchResult group={group}
          open={view.expandedKeys.includes(group.book.bookKey)} onToggle={open => {
            const keys = new Set(viewForCandidates(id).expandedKeys);
            if (open) keys.add(group.book.bookKey); else keys.delete(group.book.bookKey);
            changeView({ expandedKeys: [...keys] });
          }} /></li>)}
      </ul>
    </div>}
    {page.partial && <div className="partial-search"><p>{m.partialSearch}</p><button className="button-quiet" disabled={busy}
      onClick={() => void fetchPages(page.incompleteOffsets?.length ? page.incompleteOffsets : [0], false)}>{busy ? m.searching : m.retrySearch}</button></div>}
    {error && <Notice tone="error">{error}</Notice>}
    {(view.visibleCount < groups.length || page.nextOffset != null) && <button className="button-quiet more-books" disabled={busy} onClick={showMore}>{busy ? m.loadingMoreBooks : m.moreBooks}</button>}
  </section>;
}
