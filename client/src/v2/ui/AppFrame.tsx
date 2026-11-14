// client/src/v2/ui/AppFrame.tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { BookNavigation } from '../bookNavigation';
import { readReadingLightPreference, writeReadingLight, APPEARANCE_STORAGE_KEY, READING_LIGHT_STORAGE_KEY, type ReadingLightPreference } from '../readingLight';
import { ReadingLightContext, useReadingLight } from './readingLightContext';
import { useLibrary } from '../context';
import { Notice } from './Notice';
import { uiMessages as m } from '../uiMessages';
import { ConfirmDialog } from './ConfirmDialog';
import {AccountNotice} from './account/AccountSummary';
import { DeskLayout } from './desk/DeskLayout';
import { isDeskPath, isSlotPath, useLayoutMode } from './desk/layoutMode';

// One-shelf pages that carry their own "Back" and set their own title: the
// side panel's pages and the account screens (plan Phase 9).
const PANEL_PAGE = /^\/app\/(report|privacy|terms|about|settings\/account(\/more)?|account\/[a-z-]+)$/;

export { useReadingLight };

// The home screen's side panel is the navigation (no tab bar). Other screens
// get a link back to the shelf. From 640 px wide the shelf, the book and the
// panel's pages are drawn by the desk layout instead (ui/desk): a rail or a
// left column, the shelf, and a middle slot for the book or page.
export function AppFrame({ children }: { children: ReactNode }) {
  const { storageNotice, recoveryMode, reloadShelf, startNewShelf, removedLibraryNotice, removedBook, undoRemoval, reportStorageFailure } = useLibrary();
  const [resetting, setResetting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const screen = useRef<HTMLElement | null>(null);
  const mode = useLayoutMode();
  const desk = mode !== 'phone' && isDeskPath(location.pathname);
  const [preference, setLightState] = useState<ReadingLightPreference>(() => readReadingLightPreference());
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === null || event.key === APPEARANCE_STORAGE_KEY || event.key === READING_LIGHT_STORAGE_KEY)
        setLightState(readReadingLightPreference());
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  // Plan section 9, row 16: until Lamplight is designed, a reader with no
  // explicit choice gets Daylight rather than following the device.
  const light = preference === 'system' ? 'daylight' : preference;
  const setLight = useCallback((next: ReadingLightPreference) => {
    setLightState(next);
    if (!writeReadingLight(next)) reportStorageFailure();
  }, [reportStorageFailure]);
  useEffect(() => {
    document.documentElement.dataset.light = light;
    document.documentElement.dataset.readingLight = light;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light === 'daylight' ? '#faf7f1' : light === 'ink' ? '#f6f7f9' : '#15120f');
  }, [light]);
  useEffect(() => {
    if (!location.hash) {
      screen.current?.scrollTo?.(0, 0);
      return;
    }
    const frame = requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || document.querySelector('[role="dialog"], dialog[open]')
        || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === 'Slash') {
        event.preventDefault();
        const shelfSearch = document.getElementById('shelf-search');
        const searchState = (location.state as BookNavigation | null)?.searchState;
        if (shelfSearch && !shelfSearch.closest('[inert]')) shelfSearch.focus();
        else {
          // Search lives on the home screen; results found there come back with it.
          navigate('/app/shelf', { state: searchState?.shelf && searchState.candidateId ? { search: { candidateId: searchState.candidateId } } : null });
          requestAnimationFrame(() => document.getElementById('shelf-search')?.focus());
        }
      } else if (!desk && event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && location.pathname.startsWith('/app/books/')) {
        event.preventDefault();
        screen.current?.querySelector<HTMLAnchorElement>('.back-link')?.click();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [location, navigate, desk]);

  useEffect(() => {
    if (PANEL_PAGE.test(location.pathname) && !location.pathname.endsWith('/more')) return;
    const route = location.pathname.split('/')[2];
    const names: Record<string, string> = { shelf: 'Your bookshelf', search: 'Search books', books: 'Book details', read: 'Free reading details' };
    const accountNames: Record<string, string> = {
      'sign-in': 'Sign in', 'sign-up': 'Create account', verify: 'Verify your email',
      'forgot-password': 'Reset your password', 'reset-password': 'Choose a new password',
      'email-change': 'Confirm your new email', return: 'Continue securely',
      'complete-profile': 'Add your name', import: 'Bring books over', deletion: 'Account deletion status',
    };
    const title = location.pathname === '/app/settings/account' ? 'Your account'
      : route === 'account' ? accountNames[location.pathname.split('/')[3]] : names[route];
    document.title = (title || 'Choose a library') + ' — MyBookshelf';
  }, [location.pathname]);

  const notices = <>
    <AccountNotice />
    {storageNotice && <div className="site-notice"><Notice tone="error">{storageNotice}</Notice>{recoveryMode && <div className="recovery-actions"><button onClick={reloadShelf}>Reload shelf</button><button className="button-quiet" onClick={() => setResetting(true)}>Start a new shelf</button></div>}</div>}
    {removedLibraryNotice && <div className="site-notice"><Notice>{removedLibraryNotice}</Notice></div>}
  </>;
  const frame = <ReadingLightContext.Provider value={{ light, preference, setLight }}>
    <div className="app-backdrop">
      <div className={`app-frame one-shelf-frame${location.pathname.startsWith('/app/books/') ? ' book-mode' : ''}${location.pathname.startsWith('/app/account/') ? ' account-entry-mode' : ''}${desk ? ' desk-frame' : ''}`}>
        <a className="desktop-skip" href="#main-content">{m.skipToContent}</a>
        {desk ? <DeskLayout mode={mode as 'rail' | 'wide'} notices={notices}>{isSlotPath(location.pathname) ? children : null}</DeskLayout>
          : <main id="main-content" ref={screen} className="app-screen" tabIndex={-1}>
            {location.pathname !== '/app/shelf' && !location.pathname.startsWith('/app/books/') && !PANEL_PAGE.test(location.pathname) && <Link className="one-shelf-back" to="/app/shelf"><span aria-hidden="true">‹</span> My shelf</Link>}
            {notices}
            {children}
          </main>}
        {removedBook && <div className="undo-notice" role="status"><span>Removed {removedBook.title}</span><button onClick={undoRemoval}>Undo</button></div>}
        <ConfirmDialog open={resetting} title="Start a new shelf?" body={<p>This replaces the saved shelf in this browser. The original contents cannot be recovered after this.</p>} confirmLabel="Start a new shelf" onConfirm={async() => { await startNewShelf(); setResetting(false); }} onCancel={() => setResetting(false)} />
      </div>
    </div>
  </ReadingLightContext.Provider>;
  return frame;
}
