import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isbnSource, useLibrary } from '../../context';
import { useHoldingsStore } from '../../holdings';
import { readReaderPreferences, writeReaderPreferences } from '../../readerState';
import { candidatesFor, queryForCandidates, shelfMatchesFor } from '../../searchMemory';
import { clearLegacyText, peekLegacyText } from '../../legacyHandoff';
import type { LegacyArrival } from '../legacyRedirects';
import type { RecentBook } from '../../types';
import { SidePanel } from '../panel/SidePanel';
import { ResultsShelf } from '../search/ResultsShelf';
import { resultEntries, type ResultEntry } from '../search/searchResults';
import { runBookSearch, useBookSearch } from '../search/useBookSearch';
import { isMarked, useLibraryMarks } from '../search/useLibraryMarks';
import { ScanDialog, type ScanAnswer, type ScanSource } from '../scan/ScanDialog';
import { LibraryPickerDialog } from '../library/LibraryPickerDialog';
import { libraryLinkMessage, type LibraryLinkNotice } from '../library/SelectLibraryLink';
import { SUGGESTION_SOURCES, useShelfSuggestions } from '../../suggestions/useShelfSuggestions';
import { AccountInvite } from '../shelf/AccountInvite';
import { Bookcase } from '../shelf/Bookcase';
import { EmptyShelf } from '../shelf/EmptyShelf';
import { ShelfList } from '../shelf/ShelfList';
import { SpineRow } from '../shelf/SpineRow';
import { useSuggestionMotion } from '../shelf/useSuggestionMotion';
import { ViewSwitch, type ShelfView } from '../shelf/ViewSwitch';
import type { LayoutMode } from '../desk/layoutMode';
import { useBayColumns } from '../desk/useBayColumns';
import { BackGlyph } from './homeIcons';
import { SHELF_SEARCH_ID } from './SearchBar';
import { ShelfStage } from './ShelfStage';
import { shelfEntries, suggestionEntry } from './shelfItems';
import { TopBar } from './TopBar';
import { useShelfHoldings } from './useShelfHoldings';
import './home.css';

/**
 * History state on /app/shelf. Overlays and the search each add an entry so
 * Back closes them. `search.candidateId` is the opaque key of results held in
 * same-tab memory (searchMemory); the search text itself is never here.
 */
type HomeState = LegacyArrival & { overlay?: 'panel' | 'scan' | 'library'; panelPushed?: boolean; scanPushed?: boolean; libraryPushed?: boolean;
  search?: { candidateId?: string; pushed?: boolean }; libraryLink?: LibraryLinkNotice };

/**
 * The one-shelf home: top bar with the search bar, then the
 * reader's shelf (or the empty state), the account invite and "Viewed before".
 * A search shows its results in place of the shelf. The side panel and the
 * scan pop-up are overlays with their own history entry, so Back closes them.
 *
 * Five suggested books (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
 * Part 2) stand faded after the saved books; on the cold open they are the
 * whole shelf, under "Ready to search" and a larger search bar. Counts and
 * the view switch count saved items only. While results are shown there are
 * no suggestions.
 *
 * At rail and wide widths the desk layout (ui/desk) draws this beside its
 * rail or left column, and owns the library picker; there is no side panel,
 * and at wide widths no scan button and no account invite (the left column
 * has Create account). While a book or side page is open in the middle slot
 * the shelf is drawn `behind` it: inert, its history entry is the page's, so
 * it opens no overlay and changes no history; `behind.candidateId` keeps
 * the results the page was opened from, and `openKey`'s cover is outlined.
 */
export function HomeScreen({ layout = 'phone', behind = null, openKey = null }: { layout?: LayoutMode; behind?: { candidateId?: string } | null; openKey?: string | null } = {}) {
  const desk = layout !== 'phone';
  const wide = layout === 'wide';
  const { state, library, loadingLibrary, clearRecentBooks, restoreRecentBooks, recoveryMode, reportStorageFailure, removedBook, dismissRemoval } = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const personButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<ShelfView>(() => readReaderPreferences().shelfView);
  const [cleared, setCleared] = useState<RecentBook[] | null>(null);
  const { ref: home, perBay } = useBayColumns(layout);

  const entries = useMemo(() => shelfEntries(state.savedBooks, state.savedContent), [state.savedBooks, state.savedContent]);
  // Library answers are asked for saved books only: a suggestion's badge
  // comes from an answer already held (the holdings store, or the server's
  // stored "found" for this library), never from a new check.
  useShelfHoldings(state.selectedLibraryId, state.savedBooks);
  const suggestions = useShelfSuggestions(state.savedBooks, state.selectedLibraryId, SUGGESTION_SOURCES, state.recentBooks);
  const suggested = useMemo(() => suggestions.map(suggestionEntry), [suggestions]);
  const withSuggestions = useMemo(() => [...entries, ...suggested], [entries, suggested]);
  const motion = useSuggestionMotion(suggested.map(entry => entry.key), state.savedBooks.map(book => book.bookKey));
  const cachedLibrary = readReaderPreferences().selectedLibrary;
  const libraryName = library?.name || (loadingLibrary && cachedLibrary?.id === state.selectedLibraryId ? cachedLibrary.name : null);
  const badgeLibrary = library?.id === state.selectedLibraryId ? library.name : null;

  const behindState = useMemo<HomeState | null>(() => behind?.candidateId ? { search: { candidateId: behind.candidateId } } : null, [behind?.candidateId]);
  const routeState = behind ? behindState : location.state as HomeState | null;
  const latestState = useRef(routeState);
  latestState.current = routeState;
  const panelOpen = !desk && routeState?.overlay === 'panel';
  const openPanel = () => navigate(location.pathname, { state: { ...(routeState || {}), overlay: 'panel', panelPushed: true } });
  // The entry pushed by openPanel is left with Back. One that arrived another way (/app/settings) is replaced.
  const closePanel = useCallback(() => {
    const { overlay: _overlay, panelPushed, ...rest } = routeState || {};
    if (panelPushed) navigate(-1);
    else navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, location.pathname, routeState]);
  const returnFocus = useCallback(() => personButton.current, []);

  // Library pop-up (plan Phase 7). "Change" in the side panel swaps the
  // panel's history entry for the pop-up's, so closing it returns to what
  // was under the panel, with focus on the person icon.
  const libraryOpen = !desk && routeState?.overlay === 'library';
  const changeLibrary = () => {
    const { overlay: _overlay, panelPushed, ...rest } = latestState.current || {};
    navigate(location.pathname, { replace: true, state: { ...rest, overlay: 'library', libraryPushed: Boolean(panelPushed) } });
  };
  // An old /app/libraries?q= address: its text goes into the pop-up's field
  // (handed over in same-tab memory, legacyHandoff.ts), for this opening only.
  const [libraryQuery, setLibraryQuery] = useState(() => routeState?.legacy === 'library' ? peekLegacyText('library') : undefined);
  useEffect(() => { if (!libraryOpen) setLibraryQuery(undefined); }, [libraryOpen]);
  const closeLibrary = useCallback(() => {
    const { overlay: _overlay, libraryPushed, ...rest } = latestState.current || {};
    if (libraryPushed) navigate(-1);
    else navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, location.pathname]);

  // A shared library link that did not resolve lands here with a notice. It
  // is shown for this visit only, so it is taken out of the history entry.
  const [linkNotice] = useState(() => routeState?.libraryLink || null);
  useEffect(() => {
    if (behind || !latestState.current?.libraryLink) return;
    const { libraryLink: _notice, ...rest } = latestState.current;
    navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, location.pathname]);

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
    if (!behind && searchEntry && search.status === 'idle' && !remembered) navigate(location.pathname, { replace: true, state: withoutSearch(routeState) });
  }, [behind, searchEntry, search.status, remembered, navigate, location.pathname, routeState]);
  // Back from a book page restores the text that found these results.
  useEffect(() => {
    if (searchEntry?.candidateId && candidatesFor(searchEntry.candidateId) && search.status === 'idle') setQuery(queryForCandidates(searchEntry.candidateId));
  }, [searchEntry?.candidateId, search.status]);

  const submit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const pushed = !latestState.current?.search;
    if (pushed) navigate(location.pathname, { state: { ...(latestState.current || {}), search: { pushed: true } } });
    (home.current?.closest('.desk-shelf') || document.getElementById('main-content'))?.scrollTo?.(0, 0);
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
  // Scan pop-up (plan Phase 6). It opens over whatever is showing (shelf or
  // results) as its own history entry. Focus goes back to the button that
  // opened it, or to the search bar after "Search by title".
  const scanOpen = !wide && routeState?.overlay === 'scan';
  const scanOpener = useRef<HTMLElement | null>(null);
  const focusAfterScan = useRef<'opener' | 'search'>('opener');
  const scanLookup = useRef<AbortController | null>(null);
  const goScan = () => {
    const active = document.activeElement;
    scanOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    focusAfterScan.current = 'opener';
    navigate(location.pathname, { state: { ...(latestState.current || {}), overlay: 'scan', scanPushed: true } });
  };
  const closeScan = useCallback(() => {
    scanLookup.current?.abort();
    const { overlay: _overlay, scanPushed, ...rest } = latestState.current || {};
    if (scanPushed) navigate(-1);
    else navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, location.pathname]);
  const scanReturnFocus = useCallback(() => {
    if (focusAfterScan.current === 'search') return document.getElementById(SHELF_SEARCH_ID);
    const opener = scanOpener.current;
    return opener?.isConnected ? opener : document.querySelector<HTMLElement>('.search-bar-scan');
  }, []);
  const searchByTitle = () => { focusAfterScan.current = 'search'; closeScan(); };
  useEffect(() => { if (!scanOpen) scanLookup.current?.abort(); }, [scanOpen]);
  useEffect(() => () => scanLookup.current?.abort(), []);
  // A scanned or typed ISBN goes through the same public search as the bar.
  // One book: open it in place of the pop-up's entry, so Back from the book
  // returns to what was under the pop-up. A placeholder record (no public
  // book data for this ISBN) is "no known book"; a failed lookup is not.
  const lookUpIsbn = async (isbn: string, source: ScanSource): Promise<ScanAnswer> => {
    scanLookup.current?.abort();
    const controller = new AbortController();
    scanLookup.current = controller;
    let answer;
    try { answer = await runBookSearch(isbn, state.savedBooks, controller.signal); }
    catch { return 'failed'; }
    if (controller.signal.aborted || latestState.current?.overlay !== 'scan') return 'failed';
    const replace = Boolean(latestState.current?.scanPushed);
    if (answer.kind === 'exact') {
      if (answer.book.metadataStatus === 'missing') return 'unknown';
      navigate('/app/books/' + encodeURIComponent(answer.book.bookKey), { replace, state: { from: 'shelf', source, book: answer.book } });
      return 'opened';
    }
    if (answer.kind === 'results') {
      if (!candidatesFor(answer.id)?.length && !shelfMatchesFor(answer.id).length) return 'unknown';
      // Several books for one ISBN (rare): show them as search results.
      const { overlay: _overlay, scanPushed: _pushed, ...rest } = latestState.current || {};
      search.cancel();
      setQuery(isbn);
      navigate(location.pathname, { replace, state: { ...rest, search: { pushed: true, candidateId: answer.id } } });
      return 'opened';
    }
    return 'failed';
  };

  // Arrival from an old address (plan Phase 12, legacyRedirects.tsx):
  // /app/search focuses the search bar; /app/search?q= runs that search once.
  // The marker leaves the history entry and the text leaves memory. The work
  // waits for a timer so React's development double effects run it once.
  const arrival = behind ? undefined : routeState?.legacy;
  useEffect(() => {
    if (!arrival) return;
    const timer = setTimeout(() => {
      const { legacy: _legacy, ...rest } = latestState.current || {};
      const base = Object.keys(rest).length ? rest : null;
      const text = arrival === 'search' ? peekLegacyText('search') : undefined;
      clearLegacyText('search');
      clearLegacyText('library');
      latestState.current = base;
      navigate(location.pathname, { replace: true, state: base });
      if (text) { setQuery(text); void submit(text); }
      else if (arrival === 'focus-search') requestAnimationFrame(() => document.getElementById(SHELF_SEARCH_ID)?.focus());
    });
    return () => clearTimeout(timer);
  }, [arrival]);

  const clearViewed = async () => {
    const books = state.recentBooks;
    // One undo notice at a time: the newest replaces "Removed … · Undo".
    if (await clearRecentBooks()) { dismissRemoval?.(); setCleared(books); }
  };
  useEffect(() => { if (removedBook) setCleared(null); }, [removedBook]);
  useEffect(() => {
    if (!cleared) return;
    const timer = setTimeout(() => setCleared(null), 10_000);
    return () => clearTimeout(timer);
  }, [cleared]);

  const empty = entries.length === 0;
  const count = entries.length;
  const resultsStatus = search.status === 'searching' ? 'searching' : search.status === 'failed' ? 'failed' : 'results';
  // The chosen library's background check for these results (plan Phase 8).
  // Only for a library whose catalog the app can read; none chosen, nothing.
  const checkable = Boolean(badgeLibrary && library?.capabilities.publicAvailability);
  const marks = useLibraryMarks({ active: showResults && resultsStatus === 'results' && results.length > 0 && checkable,
    libraryId: state.selectedLibraryId, candidateId, entries: results, query: queryForCandidates(candidateId) });
  const markedCount = useMarkedCount(badgeLibrary ? results : []);
  const books = (total: number) => total === 1 ? '1 book' : total + ' books';
  const announcement = !showResults ? '' : resultsStatus === 'searching' ? 'Searching' : resultsStatus === 'failed' ? 'Couldn’t search'
    : !results.length ? 'No books found'
      : books(results.length) + (marks.checking ? '. Looking in ' + badgeLibrary : markedCount ? '. ' + books(markedCount) + ' in ' + badgeLibrary : '');
  const scan = wide ? undefined : goScan;
  const backToShelf = <button type="button" className="home-text-button results-back" onClick={() => closeSearch('shelf')}><BackGlyph />Back to my shelf</button>;
  const shelf = <>
    {empty ? <div className="cold-open-suggestions">
      {/* "Ready to search" and the search bar are in the top bar (intro). */}
      <Bookcase entries={suggested} libraryName={badgeLibrary} perBay={perBay} openKey={openKey} motion={motion} />
    </div> : <section className="my-shelf" aria-labelledby="my-shelf-heading">
      <div className="my-shelf-heading">
        <h1 id="my-shelf-heading" tabIndex={-1}>My shelf</h1>
        <span>{books(count)}</span>
      </div>
      {view === 'list' && count > 1 ? <ShelfList entries={withSuggestions} libraryName={badgeLibrary} motion={motion} />
        : <Bookcase entries={withSuggestions} libraryName={badgeLibrary} perBay={perBay} openKey={openKey} motion={motion} />}
    </section>}
    {!empty && !wide && <AccountInvite savedCount={state.savedBooks.length + state.savedContent.length} />}
    <SpineRow books={state.recentBooks} onClear={() => { void clearViewed(); }} disabled={recoveryMode} />
  </>;
  const resultsPane = <ResultsShelf ref={resultsHeading} status={resultsStatus} entries={results} view={view}
    onRetry={() => { void submit(search.query || query); }} onScan={scan} libraryName={badgeLibrary} checking={marks.checking} reserveLine={checkable}
    back={wide ? backToShelf : undefined} perBay={perBay} openKey={openKey} />;

  return <div ref={home} className={'home' + (desk ? ' home-desk home-' + layout : '')} style={desk ? { '--bay-cols': perBay } as CSSProperties : undefined}>
    {linkNotice && <p className="home-notice" role="status">{libraryLinkMessage(linkNotice)}</p>}
    <TopBar ref={personButton} layout={layout} panelOpen={panelOpen} onOpenPanel={openPanel} libraryName={libraryName} intro={empty && !showResults ? <EmptyShelf /> : undefined}
      search={{ value: query, onChange: changeQuery, onSubmit: text => { void submit(text); }, onClear: clearQuery, onScan: scan, active: showResults }}
      leading={showResults && !wide ? backToShelf : undefined}
      trailing={showResults ? results.length > 0 && resultsStatus === 'results' ? <ViewSwitch view={view} onChange={changeView} /> : undefined
        : count > 1 ? <ViewSwitch view={view} onChange={changeView} /> : undefined} />
    <ShelfStage showResults={showResults} shelf={shelf} results={resultsPane} />
    <p className="visually-hidden" role="status" aria-live="polite">{announcement}</p>
    {cleared && <div className="undo-notice home-undo" role="status"><span>Viewed before cleared</span>
      {restoreRecentBooks && <button type="button" onClick={async () => { if (await restoreRecentBooks(cleared)) setCleared(null); }}>Undo</button>}</div>}
    {!desk && <SidePanel open={panelOpen} onClose={closePanel} returnFocus={returnFocus} onChangeLibrary={changeLibrary} />}
    {!desk && <LibraryPickerDialog open={libraryOpen} onClose={closeLibrary} returnFocus={returnFocus} initialQuery={libraryQuery} />}
    {!wide && <ScanDialog open={scanOpen} onClose={closeScan} onIsbn={lookUpIsbn} onSearchByTitle={searchByTitle} returnFocus={scanReturnFocus} />}
  </div>;
}


/** How many of these result cards the chosen library has marked. */
function useMarkedCount(entries: readonly ResultEntry[]): number {
  const holdings = useHoldingsStore();
  useSyncExternalStore(holdings.subscribe, holdings.version, holdings.version);
  return entries.filter(entry => isMarked(holdings, entry)).length;
}
