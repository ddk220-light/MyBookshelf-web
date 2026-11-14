import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import type { BookNavigation } from '../../bookNavigation';
import { LibraryStateContext, useLibrary, type LibraryState } from '../../context';
import { peekLegacyText } from '../../legacyHandoff';
import { candidatesFor } from '../../searchMemory';
import { useMediaQuery } from '../../useMediaQuery';
import { HomeScreen } from '../home/HomeScreen';
import { useHistoryOverlay } from '../home/useHistoryOverlay';
import { LibraryPickerDialog } from '../library/LibraryPickerDialog';
import { canGoBack } from '../panel/PanelPage';
import { DeskColumn, DeskRail, type ReportFrom } from './DeskColumn';
import { ACCOUNT_ENTRY_PATH, DeskSlotContext, isSlotPath, type DeskSlot } from './layoutMode';
import './desk.css';

type ShelfRouteState = { search?: { candidateId?: string }; overlay?: string; legacy?: string } & Record<string, unknown>;

// Kept in memory only (never in storage), across the remount that the account
// forms cause (App.tsx entry mode keeps the shelf out of them):
// - the last shelf drawn, for the backdrop beside an account form, and only
//   for the same reader (no account, or the same account);
// - whether a page was open in the middle slot a moment ago, so that opening
//   or closing an account form still moves like any other page.
let lastShelf: { account: string | null; state: LibraryState['state']; library: LibraryState['library'] } | null = null;
let lastLayout: { open: boolean; path: string; at: number } | null = null;
const RECENT_MS = 1500;
const MOTION_MS = 520;

/** The middle slot's name for assistive technology. */
function slotLabel(pathname: string): string {
  const page = pathname.replace(/^\/app\//, '');
  if (page.startsWith('books/')) return 'Book';
  if (page.startsWith('account/')) return 'Account';
  return ({ report: 'Report a problem', privacy: 'Privacy', terms: 'Terms', about: 'About', 'settings/account': 'Account settings' } as Record<string, string>)[page] || 'Page';
}

function motionAllowed(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

/**
 * The rail and wide layouts (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
 * Part 1; DeskShelf, DeskResults, DeskBook and DeskLibrary boards). The shelf
 * (HomeScreen) is always drawn; a book, Account settings, Report a problem,
 * Privacy, Terms, About or an account form opens in the middle slot beside it,
 * at its own address (`/app/books/…`, `/app/privacy`, …), so Back and Forward
 * open and close it and a direct visit shows the shelf with that page open.
 *
 * Wide (1100 px and wider): the left column narrows and the shelf slides
 * right, cut off at the right edge, with the open book outlined. Rail
 * (640–1099 px): the page covers the shelf. Clicking the shelf, × or Escape
 * closes the page; focus moves into it and back to what opened it. No motion
 * under reduced motion. The library picker belongs to the layout: in the left
 * column at wide widths, a pop-over beside the rail otherwise.
 */
export function DeskLayout({ mode, notices, children }: { mode: 'rail' | 'wide'; notices?: ReactNode; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const live = useLibrary();
  const { session } = useAccountSession();
  const { pathname } = location;
  const routeState = location.state as (ShelfRouteState & BookNavigation) | null;
  const slotOpen = isSlotPath(pathname);
  const entry = ACCOUNT_ENTRY_PATH.test(pathname);
  const bookMatch = /^\/app\/books\/([^/]+)$/.exec(pathname);
  const bookKey = useMemo(() => { try { return bookMatch ? decodeURIComponent(bookMatch[1]) : null; } catch { return null; } }, [bookMatch?.[1]]);

  // The results a page was opened from stay beside it: a book carries them in
  // its navigation state; any other page takes the shelf's last ones.
  const shelfSearch = useRef<string | undefined>(undefined);
  if (pathname === '/app/shelf') shelfSearch.current = routeState?.search?.candidateId;
  const fromResults = bookKey ? (routeState?.searchState?.shelf ? routeState.searchState.candidateId : undefined) : shelfSearch.current;
  const behind = slotOpen ? { candidateId: fromResults && candidatesFor(fromResults) ? fromResults : undefined } : null;

  // The account forms run without the shelf, so beside them the last shelf
  // seen in this tab is drawn instead, read-only (and only for the same reader).
  const account = session.status === 'authenticated' ? session.user?.id || null : null;
  useEffect(() => { if (!entry) lastShelf = { account, state: live.state, library: live.library }; });
  const backdrop = useMemo<LibraryState | null>(() => {
    if (!entry) return null;
    const shelf = lastShelf && lastShelf.account === account ? lastShelf : null;
    return { ...live, state: shelf ? { ...shelf.state, selectedLibraryId: null } : live.state, library: shelf?.library || null, loadingLibrary: false, recoveryMode: true };
  }, [entry, account, live]);

  // Where this layout arrived from: a moment ago, the same layout before a
  // remount (an account form opening or closing), else nowhere.
  const [arrival] = useState(() => lastLayout && Date.now() - lastLayout.at < RECENT_MS ? lastLayout : null);
  const wasOpen = useRef(arrival ? arrival.open : slotOpen);
  const lastPath = useRef(arrival?.path ?? pathname);

  // The shelf beside an open page takes no focus or pointer input.
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { area.current?.toggleAttribute('inert', slotOpen); }, [slotOpen]);

  // Motion: opening (DeskBook board's push) and closing, never under reduced motion.
  const motion = useMediaQuery('(prefers-reduced-motion: no-preference)');
  const [phase, setPhase] = useState<'opening' | 'closing' | null>(null);
  useLayoutEffect(() => {
    lastLayout = { open: slotOpen, path: pathname, at: Date.now() };
    if (wasOpen.current === slotOpen) return;
    wasOpen.current = slotOpen;
    setPhase(motion && motionAllowed() ? (slotOpen ? 'opening' : 'closing') : null);
  }, [slotOpen, motion, pathname]);
  useEffect(() => () => { if (lastLayout) lastLayout = { ...lastLayout, at: Date.now() }; }, []);
  useEffect(() => {
    if (!phase) return;
    const timer = window.setTimeout(() => setPhase(null), MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Focus: into the page when it opens, back to what opened it when it closes
  // (that control, else the book's cover or the link with the page's address).
  const root = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLElement>(null);
  const pressed = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const noteControl = (event: MouseEvent<HTMLDivElement>) => {
    const control = event.target instanceof Element ? event.target.closest<HTMLElement>('a[href], button') : null;
    if (control) pressed.current = control;
  };
  useLayoutEffect(() => {
    const previous = lastPath.current;
    lastPath.current = pathname;
    if (slotOpen) {
      if (!isSlotPath(previous) || previous === pathname) opener.current = pressed.current?.isConnected && !pressed.current.closest('.desk-slot') ? pressed.current : null;
      const page = slotRef.current;
      page?.scrollTo?.(0, 0);
      (page?.querySelector<HTMLElement>('.slot-close') || page)?.focus({ preventScroll: true });
      return;
    }
    if (!isSlotPath(previous) || previous === pathname) return;
    const href = previous.replace(/["\\]/g, '\\$&');
    const target = opener.current?.isConnected ? opener.current
      : root.current?.querySelector<HTMLElement>(`.desk-shelf a[href="${href}"], .desk-column a[href="${href}"]`);
    opener.current = null;
    requestAnimationFrame(() => { if (target?.isConnected) target.focus({ preventScroll: true }); });
  }, [pathname, slotOpen]);

  // × , Escape and the shelf beside the page close it: back to where it was
  // opened from, or (opened directly) to the shelf in its place. A library
  // picker opened on top of the page closes with it.
  const close = useCallback(() => {
    const state = location.state as ShelfRouteState | null;
    const steps = state?.overlay && state[state.overlay + 'Pushed'] ? 2 : 1;
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    if (canGoBack() && typeof index === 'number' && index >= steps) { navigate(-steps); return; }
    const results = (state as BookNavigation | null)?.searchState;
    const candidate = results?.shelf ? results.candidateId : undefined;
    navigate('/app/shelf', { replace: true, state: candidate && candidatesFor(candidate) ? { search: { candidateId: candidate } } : null });
  }, [location.state, navigate]);
  const slot = useMemo<DeskSlot>(() => ({ mode, close }), [mode, close]);
  useEffect(() => {
    if (!slotOpen) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (document.querySelector('dialog[open]')) return;
      if (event.target instanceof Element && event.target.closest('textarea, [contenteditable="true"], input[type="search"]')) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [slotOpen, close]);

  // The library picker (history entry `overlay: 'library'`, so Back closes it).
  const picker = useHistoryOverlay('library');
  const pickerOpener = useRef<HTMLElement | null>(null);
  const [pickerQuery, setPickerQuery] = useState(() => routeState?.overlay === 'library' && routeState.legacy === 'library' ? peekLegacyText('library') : undefined);
  useEffect(() => { if (!picker.open) setPickerQuery(undefined); }, [picker.open]);
  // Whatever opened it (Change, the rail, or the book's Find my library) gets focus back.
  useLayoutEffect(() => { if (picker.open) pickerOpener.current = pressed.current; }, [picker.open]);
  const openPicker = useCallback(() => {
    // Beside an account form there is no shelf to choose for: the shelf opens with the picker.
    if (entry) navigate('/app/shelf', { state: { overlay: 'library' } });
    else picker.show();
  }, [entry, navigate, picker.show]);
  const pickerReturn = useCallback(() => {
    const before = pickerOpener.current;
    if (before?.isConnected && !before.closest('[inert]')) return before;
    return slotRef.current?.querySelector<HTMLElement>('.library-answer, .library-ask-button')
      || root.current?.querySelector<HTMLElement>('.desk-change, .desk-find-library, .rail-library') || null;
  }, []);

  const [menu, setMenu] = useState<'account' | 'light' | 'help' | null>(null);
  useEffect(() => { setMenu(null); }, [pathname]);

  const report: ReportFrom = bookKey ? { reportScreen: 'book', reportBookKey: bookKey } : { reportScreen: behind?.candidateId || (!slotOpen && routeState?.search) ? 'search' : 'shelf' };
  const wide = mode === 'wide';
  const side = wide
    ? <DeskColumn narrow={slotOpen} picking={picker.open} onChangeLibrary={openPicker} onClosePicker={picker.close} pickerQuery={pickerQuery} pickerReturn={pickerReturn} report={report} />
    : <DeskRail menu={menu} onMenu={setMenu} onLibrary={openPicker} slotOpen={slotOpen} report={report} />;
  const shelfArea = <div ref={area} className="desk-shelf-area" aria-hidden={slotOpen || undefined}>
    <div className="desk-shelf" id="desk-shelf">
      <HomeScreen layout={mode} behind={behind} openKey={bookKey} />
    </div>
  </div>;
  const classes = ['desk', 'desk-mode-' + mode, slotOpen && 'desk-open', picker.open && wide && 'desk-picking', phase && 'desk-' + phase].filter(Boolean).join(' ');
  return <div ref={root} className={classes} onClickCapture={noteControl}>
    {backdrop ? <LibraryStateContext.Provider value={backdrop}>{side}</LibraryStateContext.Provider> : side}
    <main id="main-content" className="desk-main" tabIndex={-1}>
      {notices}
      <div className="desk-stage">
        {slotOpen && <DeskSlotContext.Provider value={slot}>
          <section ref={slotRef} className="desk-slot" tabIndex={-1} aria-label={slotLabel(pathname)}>
            <div className="desk-slot-page">{children}</div>
          </section>
        </DeskSlotContext.Provider>}
        {backdrop ? <LibraryStateContext.Provider value={backdrop}>{shelfArea}</LibraryStateContext.Provider> : shelfArea}
        {slotOpen && <div className="desk-scrim" aria-hidden="true" onClick={close} />}
      </div>
    </main>
    {!wide && <LibraryPickerDialog open={picker.open} onClose={picker.close} returnFocus={pickerReturn} initialQuery={pickerQuery} />}
  </div>;
}
