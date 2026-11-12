import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLibrary } from '../../context';
import { readReaderPreferences, writeReaderPreferences } from '../../readerState';
import type { RecentBook } from '../../types';
import { SidePanel } from '../panel/SidePanel';
import { AccountInvite } from '../shelf/AccountInvite';
import { Bookcase } from '../shelf/Bookcase';
import { EmptyBays, EmptyShelf } from '../shelf/EmptyShelf';
import { ShelfList } from '../shelf/ShelfList';
import { SpineRow } from '../shelf/SpineRow';
import { ViewSwitch, type ShelfView } from '../shelf/ViewSwitch';
import { SHELF_SEARCH_ID } from './SearchBar';
import { shelfEntries } from './shelfItems';
import { TopBar } from './TopBar';
import { useShelfHoldings } from './useShelfHoldings';
import './home.css';

type Overlay = { overlay?: 'panel'; panelPushed?: boolean };

/**
 * The one-shelf home (VITE_ONE_SHELF): top bar with the search bar, then the
 * reader's shelf (or the empty state), the account invite and "Viewed before".
 * The side panel is an overlay with its own history entry, so Back closes it.
 */
export function HomeScreen() {
  const { state, library, loadingLibrary, clearRecentBooks, restoreRecentBooks, recoveryMode, reportStorageFailure } = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const personButton = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ShelfView>(() => readReaderPreferences().shelfView);
  const [cleared, setCleared] = useState<RecentBook[] | null>(null);

  const entries = useMemo(() => shelfEntries(state.savedBooks, state.savedContent), [state.savedBooks, state.savedContent]);
  useShelfHoldings(state.selectedLibraryId, state.savedBooks);
  const cachedLibrary = readReaderPreferences().selectedLibrary;
  const libraryName = library?.name || (loadingLibrary && cachedLibrary?.id === state.selectedLibraryId ? cachedLibrary.name : null);
  const badgeLibrary = library?.id === state.selectedLibraryId ? library.name : null;

  const routeState = location.state as Overlay | null;
  const panelOpen = routeState?.overlay === 'panel';
  const openPanel = () => navigate(location.pathname, { state: { ...(routeState || {}), overlay: 'panel', panelPushed: true } });
  // The entry pushed by openPanel is left with Back. One that arrived another way (/app/settings) is replaced.
  const closePanel = useCallback(() => {
    const { overlay: _overlay, panelPushed, ...rest } = routeState || {};
    if (panelPushed) navigate(-1);
    else navigate(location.pathname, { replace: true, state: Object.keys(rest).length ? rest : null });
  }, [navigate, location.pathname, routeState]);
  const returnFocus = useCallback(() => personButton.current, []);

  const changeView = (next: ShelfView) => {
    setView(next);
    if (!writeReaderPreferences({ shelfView: next })) reportStorageFailure();
  };
  const focusSearch = () => {
    const input = document.getElementById(SHELF_SEARCH_ID);
    input?.focus();
    input?.scrollIntoView?.({ block: 'nearest' });
  };
  // Search on the shelf arrives in the next phase; until then the existing search screen answers.
  const goSearch = () => navigate('/app/search', { state: { focusSearch: true } });
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
  return <div className="home">
    <TopBar ref={personButton} panelOpen={panelOpen} onOpenPanel={openPanel} onSearch={goSearch} onScan={goScan} libraryName={libraryName}
      trailing={count > 1 ? <ViewSwitch view={view} onChange={changeView} /> : undefined} />
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
    {cleared && <div className="undo-notice home-undo" role="status"><span>Viewed before cleared</span>
      {restoreRecentBooks && <button type="button" onClick={async () => { if (await restoreRecentBooks(cleared)) setCleared(null); }}>Undo</button>}</div>}
    <SidePanel open={panelOpen} onClose={closePanel} returnFocus={returnFocus} />
  </div>;
}
