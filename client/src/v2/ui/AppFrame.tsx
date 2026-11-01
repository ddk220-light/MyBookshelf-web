// client/src/v2/ui/AppFrame.tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { BookNavigation } from '../bookNavigation';
import { readReadingLightPreference, writeReadingLight, APPEARANCE_STORAGE_KEY, READING_LIGHT_STORAGE_KEY, type ReadingLight, type ReadingLightPreference } from '../readingLight';
import { useMediaQuery } from '../useMediaQuery';
import { useLibrary } from '../context';
import { Notice } from './Notice';
import { uiMessages as m } from '../uiMessages';
import { TabBar } from './TabBar';
import { DogAnimationProvider } from './DogAnimation';
import { ConfirmDialog } from './ConfirmDialog';
import {AccountNotice} from './account/AccountSummary';

const ReadingLightContext = createContext<{ light: ReadingLight; preference: ReadingLightPreference; setLight: (l: ReadingLightPreference) => void }>({ light: 'daylight', preference: 'system', setLight: () => {} });

export function useReadingLight() {
  return useContext(ReadingLightContext);
}

export function AppFrame({ children }: { children: ReactNode }) {
  const { storageNotice, recoveryMode, reloadShelf, startNewShelf, removedLibraryNotice, removedBook, undoRemoval, reportStorageFailure } = useLibrary();
  const [resetting, setResetting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const screen = useRef<HTMLElement | null>(null);
  const [preference, setLightState] = useState<ReadingLightPreference>(() => readReadingLightPreference());
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key === null || event.key === APPEARANCE_STORAGE_KEY || event.key === READING_LIGHT_STORAGE_KEY)
        setLightState(readReadingLightPreference());
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const light = preference === 'system' ? dark ? 'lamplight' : 'daylight' : preference;
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
        if (location.pathname === '/app/search') document.getElementById('book-search')?.focus();
        else navigate('/app/search', { state: { ...(location.state as BookNavigation | null)?.searchState, focusSearch: true } });
      } else if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && location.pathname.startsWith('/app/books/')) {
        event.preventDefault();
        screen.current?.querySelector<HTMLAnchorElement>('.back-link')?.click();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [location, navigate]);

  useEffect(() => {
    const route = location.pathname.split('/')[2];
    const names: Record<string, string> = { shelf: 'Your bookshelf', search: 'Search books', libraries: 'Choose a library', settings: 'Settings', books: 'Book details' };
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

  return <DogAnimationProvider><ReadingLightContext.Provider value={{ light, preference, setLight }}>
    <div className="app-backdrop">
      <div className={`app-frame${location.pathname.startsWith('/app/books/') ? ' book-mode' : ''}${location.pathname.startsWith('/app/account/') ? ' account-entry-mode' : ''}`}>
        <a className="desktop-skip" href="#main-content">{m.skipToContent}</a>
        <TabBar />
        <main id="main-content" ref={screen} className="app-screen" tabIndex={-1}>
          <AccountNotice/>
          {storageNotice && <div className="site-notice"><Notice tone="error">{storageNotice}</Notice>{recoveryMode && <div className="recovery-actions"><button onClick={reloadShelf}>Reload shelf</button><button className="button-quiet" onClick={() => setResetting(true)}>Start a new shelf</button></div>}</div>}
          {removedLibraryNotice && <div className="site-notice"><Notice>{removedLibraryNotice}</Notice></div>}
          {children}
        </main>
        {removedBook && <div className="undo-notice" role="status"><span>Removed {removedBook.title}</span><button onClick={undoRemoval}>Undo</button></div>}
        <ConfirmDialog open={resetting} title="Start a new shelf?" body={<p>This replaces the saved shelf in this browser. The original contents cannot be recovered after this.</p>} confirmLabel="Start a new shelf" onConfirm={async() => { await startNewShelf(); setResetting(false); }} onCancel={() => setResetting(false)} />
      </div>
    </div>
  </ReadingLightContext.Provider></DogAnimationProvider>;
}
