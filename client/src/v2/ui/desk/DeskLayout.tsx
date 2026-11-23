import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { UNSAFE_LocationContext, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
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
import { SidePanel } from '../panel/SidePanel';
import { DeskColumn, DeskRail, type ReportFrom } from './DeskColumn';
import { ACCOUNT_ENTRY_PATH, DeskSlotContext, isSlotPath, type DeskSlot, type LayoutMode } from './layoutMode';
import { ShelfPlaceKeeper } from './ShelfPlace';
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
// - library picker entries a page opened beside them left behind (by history
//   entry key), and the entry drawn last, so that the picker never opens again
//   by itself (see the picker below).
const leftPickers = new Set<string>();
let lastEntry: { key: string; picker: boolean; index: number | null } | null = null;
let passedOver: string | null = null;
const RECENT_MS = 1500;
// Fields a reader types in: Escape there belongs to the field, not the page.
const TYPING_FIELD = 'textarea, select, [contenteditable="true"], [contenteditable=""], '
  + 'input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"])';
const MOTION_MS = 520;

/** Tests: forget the shelf and layout remembered in this tab (as a fresh tab has none). */
export function forgetDeskMemory() { lastShelf = null; lastLayout = null; }

/** The middle slot's name for assistive technology. */
function slotLabel(pathname: string): string {
  const page = pathname.replace(/^\/app\//, '');
  if (page.startsWith('books/')) return 'Book';
  if (page.startsWith('account/') || page.startsWith('settings/account/')) return 'Account';
  return ({ report: 'Report a problem', privacy: 'Privacy', terms: 'Terms', about: 'About', 'settings/account': 'Account settings' } as Record<string, string>)[page] || 'Page';
}

/**
 * At rail widths the links to the side pages sit in Settings, which is gone
 * by the time a page closes: the rail's settings gear stands in for them.
 */
function railButtonFor(root: HTMLElement | null, pathname: string): HTMLElement | null {
  const fromSettings = /^\/app\/(account\/|settings\/account(\/|$)|report$|privacy$|terms$|about$)/.test(pathname);
  return fromSettings ? root?.querySelector<HTMLElement>('.desk-rail .desk-settings') || null : null;
}

function motionAllowed(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

/**
 * The rail and wide layouts (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
 * Part 1; DeskShelf, DeskResults, DeskBook and DeskLibrary boards), and the
 * phone layout's shelf screen. All three draw the shelf at the same place in
 * the page, so when the window crosses 640 or 1100 px it stays drawn as it
 * was (scroll place, a search and its text, an open scan pop-up); on phones
 * nothing else is added and the shelf screen is as released. The shelf
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
export function DeskLayout({ mode, notices, children }: { mode: LayoutMode; notices?: ReactNode; children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const live = useLibrary();
  const { session } = useAccountSession();
  const { pathname } = location;
  const routeState = location.state as (ShelfRouteState & BookNavigation) | null;
  // Phones: the shelf screen only (AppFrame draws every other page as released).
  const phone = mode === 'phone';
  const slotOpen = !phone && isSlotPath(pathname);
  const entry = ACCOUNT_ENTRY_PATH.test(pathname);
  const bookMatch = /^\/app\/books\/([^/]+)$/.exec(pathname);
  const bookKey = useMemo(() => { try { return bookMatch ? decodeURIComponent(bookMatch[1]) : null; } catch { return null; } }, [bookMatch?.[1]]);

  // The results a page was opened from stay beside it: a book carries them in
  // its navigation state; any other page takes the shelf's last ones.
  const shelfSearch = useRef<string | undefined>(undefined);
  if (pathname === '/') shelfSearch.current = routeState?.search?.candidateId;
  const fromResults = bookKey ? (routeState?.searchState?.shelf ? routeState.searchState.candidateId : undefined) : shelfSearch.current;
  const behind = slotOpen ? { candidateId: fromResults && candidatesFor(fromResults) ? fromResults : undefined } : null;

  // The account forms run without the shelf, so beside them the last shelf
  // seen in this tab is drawn instead, read-only (and only for the same reader).
  // A form opened with no shelf drawn yet in this tab (an email link, the
  // return from a sign-in provider, a reload) stands alone: no shelf beside it
  // until the reader finishes or closes it (owner decision, 14 November).
  const account = session.status === 'authenticated' ? session.user?.id || null : null;
  const bare = entry && !(lastShelf && lastShelf.account === account);
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

  // The shelf beside an open page takes no focus or pointer input: the scrim
  // over it takes the pointer at once, and it is made inert and hidden from
  // assistive technology together, with the focus move below, at the next
  // frame (restyling every cover is then not added to the task that opens
  // the page; hiding it earlier would hide controls that can still take
  // focus). It is live again as soon as the page closes, before focus goes
  // back to it.
  const area = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (slotOpen) return;
    area.current?.removeAttribute('inert');
    area.current?.removeAttribute('aria-hidden');
  }, [slotOpen]);

  // Motion: opening (DeskBook board's push) and closing, never under reduced motion.
  const motion = useMediaQuery('(prefers-reduced-motion: no-preference)');
  const [phase, setPhase] = useState<'opening' | 'closing' | null>(null);
  useLayoutEffect(() => {
    if (phone) return;
    lastLayout = { open: slotOpen, path: pathname, at: Date.now() };
    if (wasOpen.current === slotOpen) return;
    wasOpen.current = slotOpen;
    setPhase(motion && motionAllowed() ? (slotOpen ? 'opening' : 'closing') : null);
  }, [phone, slotOpen, motion, pathname]);
  const deskShown = useRef(!phone);
  deskShown.current = !phone;
  useEffect(() => () => { if (lastLayout && deskShown.current) lastLayout = { ...lastLayout, at: Date.now() }; }, []);
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
    // A link in Settings goes with Settings: at rail width the gear stands in for it.
    if (control) pressed.current = control.closest('.side-panel') && root.current?.querySelector<HTMLElement>('.desk-rail .desk-settings') || control;
  };
  useLayoutEffect(() => {
    const previous = lastPath.current;
    lastPath.current = pathname;
    if (slotOpen) {
      if (!isSlotPath(previous) || previous === pathname) opener.current = pressed.current?.isConnected && !pressed.current.closest('.desk-slot') ? pressed.current : null;
      const page = slotRef.current;
      // A page that takes another's place starts at its top. A newly opened
      // slot is already there: scrolling it would force a layout of the whole
      // shelf beside it in this same task.
      if (isSlotPath(previous) && previous !== pathname) page?.scrollTo?.(0, 0);
      // Focus moves in at the next frame, with the frame's own style and
      // layout: moving it now would force them for the whole shelf here.
      const frame = requestAnimationFrame(() => {
        if (!page?.isConnected) return;
        area.current?.setAttribute('inert', '');
        area.current?.setAttribute('aria-hidden', 'true');
        const active = document.activeElement;
        // Unless something in the page, or a picker or dialog over it, took it first.
        if (active && active !== page && (page.contains(active) || active.closest('dialog[open], .desk-picker'))) return;
        (page.querySelector<HTMLElement>('.slot-close') || page).focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!isSlotPath(previous) || previous === pathname) return;
    const href = previous.replace(/["\\]/g, '\\$&');
    const target = opener.current?.isConnected ? opener.current
      : root.current?.querySelector<HTMLElement>(`.desk-shelf a[href="${href}"], .desk-column a[href="${href}"]`) || railButtonFor(root.current, previous);
    opener.current = null;
    // Settings coming back over the shelf (Back to its entry) keeps its own focus.
    requestAnimationFrame(() => { if (target?.isConnected && !document.querySelector('dialog[open]')) target.focus({ preventScroll: true }); });
  }, [pathname, slotOpen]);

  // × , Escape and the shelf beside the page close it: back to where it was
  // opened from, or (opened directly) to the shelf in its place. A library
  // picker opened on top of the page closes with it. A page opened directly
  // with the picker on top of it is two entries with nothing before them:
  // Back once closes the picker, then the shelf takes the page's place, so no
  // entry for the page is left behind.
  const shelfInPlace = useCallback((state: unknown) => {
    const results = (state as BookNavigation | null)?.searchState;
    const candidate = results?.shelf ? results.candidateId : undefined;
    navigate('/', { replace: true, state: candidate && candidatesFor(candidate) ? { search: { candidateId: candidate } } : null });
  }, [navigate]);
  const closeAfterBack = useRef<string | null>(null);
  const close = useCallback(() => {
    const state = location.state as ShelfRouteState | null;
    const steps = state?.overlay && state[state.overlay + 'Pushed'] ? 2 : 1;
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    if (canGoBack() && typeof index === 'number' && index >= steps) { navigate(-steps); return; }
    if (steps === 2 && typeof index === 'number' && index === 1) { closeAfterBack.current = location.pathname; navigate(-1); return; }
    shelfInPlace(state);
  }, [location.state, location.pathname, navigate, shelfInPlace]);
  useLayoutEffect(() => {
    const page = closeAfterBack.current;
    if (!page) return;
    closeAfterBack.current = null;
    if (pathname === page && !(location.state as ShelfRouteState | null)?.overlay) shelfInPlace(location.state);
  }, [location, pathname, shelfInPlace]);
  const slot = useMemo<DeskSlot>(() => ({ mode: mode === 'phone' ? 'rail' : mode, close }), [mode, close]);
  useEffect(() => {
    if (!slotOpen) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (document.querySelector('dialog[open]')) return;
      // Escape while typing in a field (an account form's email or password,
      // a report) does not close the page; from anywhere else it does.
      if (event.target instanceof Element && event.target.closest(TYPING_FIELD)) return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [slotOpen, close]);

  // The library picker (history entry `overlay: 'library'`, so Back closes it).
  // In the left column the shelf and the column stay usable beside it, so a
  // book or page can be opened from there, which the picker gives way to. It
  // never opens again by itself: when Back, Forward or × comes back to its
  // entry, that entry is passed over (one the picker pushed) or the picker is
  // taken off it (the entry the page had before).
  const overlay = useHistoryOverlay('library');
  const leftBehind = overlay.open && leftPickers.has(location.key);
  const picker = { ...overlay, open: overlay.open && !leftBehind };
  useLayoutEffect(() => {
    const index = (window.history.state as { idx?: unknown } | null)?.idx;
    const previous = lastEntry;
    lastEntry = { key: location.key, picker: overlay.open, index: typeof index === 'number' ? index : null };
    if (navigationType === 'PUSH' && previous?.picker && previous.key !== location.key && !overlay.open) leftPickers.add(previous.key);
    // Once per arrival (React's development double effects run this twice).
    if (passedOver !== location.key) passedOver = null;
    if (!leftBehind || passedOver) return;
    passedOver = location.key;
    const state = location.state as ShelfRouteState | null;
    if (state?.libraryPushed) navigate(previous?.index != null && lastEntry.index != null && previous.index < lastEntry.index ? 1 : -1);
    else {
      const { overlay: _overlay, libraryPushed: _pushed, ...rest } = state || {};
      navigate(location.pathname + location.search, { replace: true, state: Object.keys(rest).length ? rest : null });
    }
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickerOpener = useRef<HTMLElement | null>(null);
  const [pickerQuery, setPickerQuery] = useState(() => routeState?.overlay === 'library' && routeState.legacy === 'library' ? peekLegacyText('library') : undefined);
  useEffect(() => { if (!picker.open) setPickerQuery(undefined); }, [picker.open]);
  // Whatever opened it (Change, the rail, or the book's Find my library) gets focus back.
  useLayoutEffect(() => { if (picker.open) pickerOpener.current = pressed.current; }, [picker.open]);
  const openPicker = useCallback(() => {
    // Beside an account form there is no shelf to choose for: the shelf opens with the picker.
    if (entry) navigate('/', { state: { overlay: 'library' } });
    else picker.show();
  }, [entry, navigate, picker.show]);
  const pickerReturn = useCallback(() => {
    const before = pickerOpener.current;
    if (before?.isConnected && !before.closest('[inert]')) return before;
    return slotRef.current?.querySelector<HTMLElement>('.library-answer, .library-ask-button')
      || root.current?.querySelector<HTMLElement>('.desk-change, .desk-find-library, .desk-settings') || null;
  }, []);

  const settings = useHistoryOverlay('panel');
  const settingsReturn = useCallback(() => root.current?.querySelector<HTMLElement>('.desk-settings') || null, []);
  const changeLibraryFromSettings = () => {
    const { panelPushed, ...rest } = routeState || {};
    navigate(pathname + location.search, { replace: true, state: { ...rest, overlay: 'library', libraryPushed: Boolean(panelPushed) } });
  };

  const report: ReportFrom = bookKey ? { reportScreen: 'book', reportBookKey: bookKey } : { reportScreen: behind?.candidateId || (!slotOpen && routeState?.search) ? 'search' : 'shelf' };
  const wide = mode === 'wide';
  const side = phone ? null : wide
    ? <DeskColumn narrow={slotOpen} picking={picker.open} onChangeLibrary={openPicker} onClosePicker={picker.close} pickerQuery={pickerQuery} pickerReturn={pickerReturn} report={report} onSettings={settings.show} />
    : <DeskRail onSettings={settings.show} open={settings.open} />;
  // While a page is open the shelf beside it is held as it was: it keeps the
  // address it was drawn for, so the change of address does not reach its
  // covers' links and the shelf is not drawn again in full (only the open
  // book's outline changes).
  const routerLocation = useContext(UNSAFE_LocationContext);
  const shelfLocation = useRef(routerLocation);
  if (!slotOpen) shelfLocation.current = routerLocation;
  // On phones the wrappers below are left out of the layout (`shelf-host`,
  // display: contents), so the screen scrolls and looks as released.
  const host = (name: string) => phone ? 'shelf-host' : name;
  const shelfArea = <div ref={area} className={host('desk-shelf-area')}>
    <div className={host('desk-shelf')} id={phone ? undefined : 'desk-shelf'}>
      <UNSAFE_LocationContext.Provider value={shelfLocation.current}><HomeScreen layout={mode} behind={behind} openKey={bookKey} onOpenLibrary={openPicker} /></UNSAFE_LocationContext.Provider>
    </div>
  </div>;
  const classes = phone ? 'shelf-host' : ['desk', 'desk-mode-' + mode, slotOpen && 'desk-open', bare && 'desk-bare', picker.open && wide && 'desk-picking', phase && 'desk-' + phase].filter(Boolean).join(' ');
  // Every layout has the same elements in the same places, so changing
  // layout redraws none of them; only their classes change.
  return <div ref={root} className={classes} onClickCapture={noteControl}>
    <ShelfPlaceKeeper mode={mode} root={root} />
    {backdrop ? <LibraryStateContext.Provider value={backdrop}>{side}</LibraryStateContext.Provider> : side}
    <main id="main-content" className={phone ? 'app-screen' : 'desk-main'} tabIndex={-1}>
      {notices}
      <div className={host('desk-stage')}>
        {slotOpen && <DeskSlotContext.Provider value={slot}>
          <section ref={slotRef} className="desk-slot" tabIndex={-1} aria-label={slotLabel(pathname)}>
            <div className="desk-slot-page">{children}</div>
          </section>
        </DeskSlotContext.Provider>}
        {bare ? null : backdrop ? <LibraryStateContext.Provider value={backdrop}>{shelfArea}</LibraryStateContext.Provider> : shelfArea}
        {slotOpen && !bare && <div className="desk-scrim" aria-hidden="true" onClick={close} />}
      </div>
    </main>
    {/* On phones the shelf screen has its own library pop-up. */}
    {mode === 'rail' && <LibraryPickerDialog open={picker.open} onClose={picker.close} returnFocus={pickerReturn} initialQuery={pickerQuery} />}
    {!phone && <SidePanel open={settings.open} onClose={settings.close} onChangeLibrary={changeLibraryFromSettings} returnFocus={settingsReturn} report={report} />}
  </div>;
}
