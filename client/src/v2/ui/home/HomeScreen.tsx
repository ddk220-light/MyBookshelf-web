import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isbnSource, useLibrary } from '../../context';
import { readReaderPreferences, writeReaderPreferences } from '../../readerState';
import { candidatesFor, queryForCandidates, shelfMatchesFor } from '../../searchMemory';
import type { RecentBook } from '../../types';
import { SidePanel } from '../panel/SidePanel';
import { ResultsShelf } from '../search/ResultsShelf';
import { resultEntries } from '../search/searchResults';
import { useBookSearch } from '../search/useBookSearch';
import { AccountInvite } from '../shelf/AccountInvite';
import { Bookcase } from '../shelf/Bookcase';
import { EmptyBays, EmptyShelf } from '../shelf/EmptyShelf';
import { ShelfList } from '../shelf/ShelfList';
import { SpineRow } from '../shelf/SpineRow';
import { ViewSwitch, type ShelfView } from '../shelf/ViewSwitch';
import { BackGlyph } from './homeIcons';
import { SHELF_SEARCH_ID } from './SearchBar';
import { ShelfStage } from './ShelfStage';
import { shelfEntries } from './shelfItems';
import { TopBar } from './TopBar';
import { useShelfHoldings } from './useShelfHoldings';
import './home.css';

/**
 * History state on /app/shelf. Overlays and the search each add an entry so
 * Back closes them. `search.candidateId` is the opaque key of results held in
 * same-tab memory (searchMemory); the search text itself is never here.
 */
type HomeState = { overlay?: 'panel'; panelPushed?: boolean; search?: { candidateId?: string; pushed?: boolean } };

/**
 * The one-shelf home (VITE_ONE_SHELF): top bar with the search bar, then the
 * reader's shelf (or the empty state), the account invite and "Viewed before".
 * A search shows its results in place of the shelf. The side panel is an
 * overlay with its own history entry, so Back closes it.
 */
export function HomeScreen() {
  const { state, library, loadingLibrary, clearRecentBooks, restoreRecentBooks, recoveryMode, reportStorageFailure } = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const personButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<ShelfView>(() => readReaderPreferences().shelfView);
  const [cleared, setCleared] = useState<RecentBook[] | null>(null);

  const entries = useMemo(() => shelfEntries(state.savedBooks, state.savedContent), [state.savedBooks, state.savedContent]);
  useShelfHoldings(state.selectedLibraryId, state.savedBooks);
  const cachedLibrary = readReaderPreferences().selectedLibrary;
  const libraryName = library?.name || (loadingLibrary && cachedLibrary?.id === state.selectedLibraryId ? cachedLibrary.name : null);
  const badgeLibrary = library?.id === state.selectedLibraryId ? library.name : null;

  const routeState = location.state as HomeState | null;
  const latestState = useRef(routeState);
  latestState.current = routeState;
  const panelOpen = routeState?.overlay === 'panel';
  const openPanel = () => navigate(location.pathname, { state: { ...(routeState || {}), overlay: 'panel', panelPushed: true } });
  // The entry pushed by openPanel is left with Back. One that arrived another way (/app/settings) is replaced.
  const closePanel = useCallback(() => {
    const { overlay: _overlay, panelPushed, ...rest } = routeState || {};
    if (panelPushed) navigate(-1);
    else navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, location.pathname, routeState]);
  const returnFocus = useCallback(() => personButton.current, []);

  // Search on the shelf (plan Phase 5).
  const search = useBookSearch();
  const searchEntry = routeState?.search;
  const candidateId = search.id ?? searchEntry?.candidateId ?? null;
  const remembered = candidatesFor(candidateId);
  const [query, setQuery] = useState(() => queryForCandidates(searchEntry?.candidateId));
  const searching = search.status === 'searching' || search.status === 'failed';
  const showResults = Boolean(searchEntry) && (searching || Boolean(remembered));
  const results = useMemo(() => candidateId && remembered ? resultEntries({ savedBooks: state.savedBooks, ownKeys: shelfMatchesFor(candidateId), publicBooks: remembered, candidateId }) : [],
    [candidateId, remembered, state.savedBooks]);

  const withoutSearch = (value: HomeState | null) => {
    const { search: _search, ...rest } = value || {};
    return Object.keys(rest).length ? rest : null;
  };
  const closeSearch = useCallback((focus: 'input' | 'shelf' | 'none') => {
    search.cancel();
    setQuery('');
    const current = latestState.current;
    if (current?.search?.pushed) navigate(-1);
    else if (current?.search) navigate(location.pathname, { replace: true, state: withoutSearch(current) });
    if (focus === 'none') return;
    requestAnimationFrame(() => {
      const target = focus === 'shelf' ? document.getElementById('my-shelf-heading') || document.getElementById(SHELF_SEARCH_ID) : document.getElementById(SHELF_SEARCH_ID);
      target?.focus({ preventScroll: true });
    });
  }, [search.cancel, navigate, location.pathname]);

  // Back (or any other way the search entry goes) returns to the shelf: stop
  // the search and empty the bar.
  const searchWasOpen = useRef(Boolean(searchEntry));
  useEffect(() => {
    const open = Boolean(searchEntry);
    if (searchWasOpen.current && !open) { search.cancel(); setQuery(''); }
    searchWasOpen.current = open;
  }, [searchEntry, search.cancel]);
  // A search entry whose results are gone (the page was reloaded) is dropped.
  useEffect(() => {
    if (searchEntry && search.status === 'idle' && !remembered) navigate(location.pathname, { replace: true, state: withoutSearch(routeState) });
  }, [searchEntry, search.status, remembered, navigate, location.pathname, routeState]);
  // Back from a book page restores the text that found these results.
  useEffect(() => {
    if (searchEntry?.candidateId && candidatesFor(searchEntry.candidateId) && search.status === 'idle') setQuery(queryForCandidates(searchEntry.candidateId));
  }, [searchEntry?.candidateId, search.status]);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const pushed = !latestState.current?.search;
    if (pushed) navigate(location.pathname, { state: { ...(latestState.current || {}), search: { pushed: true } } });
    document.getElementById('main-content')?.scrollTo?.(0, 0);
    // Leave the field (this closes the phone keyboard) for the results heading.
    requestAnimationFrame(() => resultsHeading.current?.focus({ preventScroll: true }));
    const answer = await search.run(trimmed, state.savedBooks);
    if (!answer) return;
    if (answer.kind === 'exact') {
      navigate('/app/books/' + encodeURIComponent(answer.book.bookKey), { replace: pushed, state: { from: 'shelf', source: isbnSource(trimmed), book: answer.book } });
      return;
    }
    const current = latestState.current;
    if (answer.kind === 'results' && current?.search) navigate(location.pathname, { replace: true, state: { ...current, search: { ...current.search, candidateId: answer.id } } });
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    if (!value && searchEntry) closeSearch('none');
  };
  const clearQuery = () => {
    if (searchEntry) closeSearch('input');
    else { setQuery(''); document.getElementById(SHELF_SEARCH_ID)?.focus(); }
  };

  const changeView = (next: ShelfView) => {
    setView(next);
    if (!writeReaderPreferences({ shelfView: next })) reportStorageFailure();
  };
  const focusSearch = () => {
    const input = document.getElementById(SHELF_SEARCH_ID);
    input?.focus();
    input?.scrollIntoView?.({ block: 'nearest' });
  };
  // The scan pop-up arrives in a later phase; until then the existing scanner answers.
  const goScan = () => navigate('/app/search');

  const clearViewed = async () => {
    const books = state.recentBooks;
    if (await clearRecentBooks()) setCleared(books);
  };
  useEffect(() => {
    if (!cleared) return;
    const timer = setTimeout(() => setCleared(null), 10_000);
    return () => clearTimeout(timer);
  }, [cleared]);

  const empty = entries.length === 0;
  const count = entries.length;
  const resultsStatus = search.status === 'searching' ? 'searching' : search.status === 'failed' ? 'failed' : 'results';
  const announcement = !showResults ? '' : resultsStatus === 'searching' ? 'Searching' : resultsStatus === 'failed' ? 'Couldn’t search'
    : results.length ? (results.length === 1 ? '1 book' : results.length + ' books') : 'No books found';
  const shelf = <>
    {empty ? <EmptyShelf onSearch={focusSearch} onScan={goScan} showBays={false} /> : <section className="my-shelf" aria-labelledby="my-shelf-heading">
      <div className="my-shelf-heading">
        <h1 id="my-shelf-heading" tabIndex={-1}>My shelf</h1>
        {count > 1 && <span>{count} books</span>}
      </div>
      {view === 'list' && count > 1 ? <ShelfList entries={entries} libraryName={badgeLibrary} /> : <Bookcase entries={entries} libraryName={badgeLibrary} />}
    </section>}
    {!empty && <AccountInvite savedCount={state.savedBooks.length + state.savedContent.length} />}
    <SpineRow books={state.recentBooks} onClear={() => { void clearViewed(); }} disabled={recoveryMode} />
    {empty && !state.recentBooks.length && <EmptyBays />}
  </>;
  const resultsPane = <ResultsShelf ref={resultsHeading} status={resultsStatus} entries={results} view={view}
    onRetry={() => { void submit(search.query || query); }} onScan={goScan} />;

  return <div className="home">
    <TopBar ref={personButton} panelOpen={panelOpen} onOpenPanel={openPanel} libraryName={libraryName}
      search={{ value: query, onChange: changeQuery, onSubmit: text => { void submit(text); }, onClear: clearQuery, onScan: goScan, active: showResults }}
      leading={showResults ? <button type="button" className="home-text-button results-back" onClick={() => closeSearch('shelf')}><BackGlyph />Back to my shelf</button> : undefined}
      trailing={showResults ? results.length > 0 && resultsStatus === 'results' ? <ViewSwitch view={view} onChange={changeView} /> : undefined
        : count > 1 ? <ViewSwitch view={view} onChange={changeView} /> : undefined} />
    <ShelfStage showResults={showResults} shelf={shelf} results={resultsPane} />
    <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    {cleared && <div className="undo-notice home-undo" role="status"><span>Viewed before cleared</span>
      {restoreRecentBooks && <button type="button" onClick={async () => { if (await restoreRecentBooks(cleared)) setCleared(null); }}>Undo</button>}</div>}
    <SidePanel open={panelOpen} onClose={closePanel} returnFocus={returnFocus} />
  </div>;
}

