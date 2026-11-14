import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ProblemScreen } from '../../api';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { useLibrary } from '../../context';
import type { PublicLibrary } from '../../types';
import { trapTab } from '../home/dialogFocus';
import { CloseGlyph, LibraryGlyph, PersonIcon } from '../home/homeIcons';
import { LibraryPicker } from '../library/LibraryPickerDialog';
import { useReadingLight } from '../readingLightContext';

const LIGHTS = [['daylight', 'Daylight'], ['lamplight', 'Lamplight'], ['ink', 'Ink']] as const;

/** Accounts switched off or not answering: no account controls at all (as in the side panel). */
export function useAccountsShown() {
  const { session } = useAccountSession();
  const signedIn = session.status === 'authenticated' && Boolean(session.user);
  return { signedIn, shown: signedIn || !session.availability, email: signedIn ? session.user!.email : null };
}

/** "Kotturpuram, Chennai" under the library's name: its town (and region when there is no town). */
export function libraryPlace(library: PublicLibrary): string {
  return [...new Set([library.district, library.city].filter((part): part is string => Boolean(part)))].join(', ') || library.region || '';
}

/** What a problem report opened here says about the screen beside it. */
export type ReportFrom = { reportScreen: ProblemScreen; reportBookKey?: string };

/** The chosen library: icon tile, name, place and Change; with none chosen, Find my library. */
function LibrarySection({ onChange }: { onChange: () => void }) {
  const { library, loadingLibrary } = useLibrary();
  return <section className="desk-section desk-library" aria-labelledby="desk-library-heading">
    <h2 id="desk-library-heading">My library</h2>
    {library ? <>
      <div className="desk-library-row">
        <span className="desk-library-icon" aria-hidden="true"><LibraryGlyph size={24} strokeWidth={1.8} /></span>
        <span className="desk-library-name"><strong>{library.name}</strong>{libraryPlace(library) && <span>{libraryPlace(library)}</span>}</span>
      </div>
      <button type="button" className="desk-link desk-change" aria-label="Change library" onClick={onChange}>Change</button>
    </> : loadingLibrary ? <p className="desk-library-loading" role="status">Loading…</p>
      : <button type="button" className="home-button home-button-outline desk-find-library" onClick={onChange}>Find my library</button>}
  </section>;
}

/** Signed out: Create account and Log in. Signed in: the email, Account settings and Log out. */
export function AccountLinks({ replace, onDone, compact = false }: { replace: boolean; onDone?: () => void; compact?: boolean }) {
  const { signOut } = useAccountSession();
  const { signedIn, email } = useAccountsShown();
  if (signedIn) return <>
    <div className="desk-person"><span className="desk-avatar" aria-hidden="true">{(email || '?').trim().charAt(0).toUpperCase()}</span><span className="desk-email">{email}</span></div>
    <Link className="desk-link" to="/app/settings/account" replace={replace} onClick={onDone}>Account settings</Link>
    <button type="button" className="desk-link" onClick={() => { onDone?.(); void signOut(); }}>Log out</button>
  </>;
  return <div className={'desk-account-buttons' + (compact ? ' is-compact' : '')}>
    <Link className="home-button" to="/app/account/sign-up" replace={replace} onClick={onDone}>Create account</Link>
    <Link className="home-button home-button-outline" to="/app/account/sign-in" replace={replace} onClick={onDone}>Log in</Link>
  </div>;
}

export function LightToggle({ labelledBy }: { labelledBy: string }) {
  const { light, setLight } = useReadingLight();
  return <div className="light-toggle desk-light-toggle" role="group" aria-labelledby={labelledBy}>
    {LIGHTS.map(([value, label]) => <button key={value} type="button" aria-pressed={light === value} onClick={() => setLight(value)}>{label}</button>)}
  </div>;
}

/** Report a problem, Privacy and About. */
export function HelpLinks({ replace, report, onDone, className = '' }: { replace: boolean; report: ReportFrom; onDone?: () => void; className?: string }) {
  return <nav className={'desk-help ' + className} aria-label="Help and information">
    <Link to="/app/report" state={report} replace={replace} onClick={onDone}>Report a problem</Link>
    <Link to="/app/privacy" replace={replace} onClick={onDone}>Privacy</Link>
    <Link to="/app/about" replace={replace} onClick={onDone}>About</Link>
  </nav>;
}

/**
 * The library picker in the left column (DeskLibrary board): in place of the
 * library, account and reading light sections, with the shelf still beside
 * it. Escape and × close it; focus starts on "Libraries near me" (or the
 * field, when an old link brought text) and goes back to `returnFocus`.
 */
function ColumnPicker({ onClose, initialQuery, returnFocus }: { onClose: () => void; initialQuery?: string; returnFocus: () => HTMLElement | null }) {
  const titleId = useId(), listId = useId();
  const ref = useRef<HTMLElement>(null);
  const back = useRef(returnFocus);
  back.current = returnFocus;
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>(initialQuery ? '#library-place' : '.library-near')?.focus();
    return () => { requestAnimationFrame(() => { const target = back.current(); if (target?.isConnected) target.focus(); }); };
    // Focus moves in once, when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };
  return <section ref={ref} className="desk-picker" aria-labelledby={titleId} onKeyDown={keyDown}>
    <LibraryPicker variant="column" titleId={titleId} listId={listId} onClose={onClose} initialQuery={initialQuery} />
  </section>;
}

/**
 * The permanent left column at wide widths (DeskShelf board): wordmark, My
 * library, Account (none at all when accounts are switched off), Reading
 * light, and Report a problem / Privacy / About at the bottom. It narrows
 * while a page is open in the middle slot (DeskBook board) and widens to hold
 * the library picker (DeskLibrary board). Links open their page in the
 * middle slot; with a page already there, they take its place.
 */
export function DeskColumn({ narrow, picking, onChangeLibrary, onClosePicker, pickerQuery, pickerReturn, report }: {
  narrow: boolean; picking: boolean; onChangeLibrary: () => void; onClosePicker: () => void; pickerQuery?: string;
  pickerReturn: () => HTMLElement | null; report: ReportFrom;
}) {
  const { shown } = useAccountsShown();
  return <aside className={'desk-column' + (narrow ? ' is-narrow' : '') + (picking ? ' is-picking' : '')} aria-label="Library and account">
    <p className="desk-wordmark">MyBookshelf</p>
    {picking ? <ColumnPicker onClose={onClosePicker} initialQuery={pickerQuery} returnFocus={pickerReturn} /> : <>
      <LibrarySection onChange={onChangeLibrary} />
      {shown && <section className="desk-section desk-account" aria-labelledby="desk-account-heading">
        <h2 id="desk-account-heading">Account</h2>
        <AccountLinks replace={narrow} />
      </section>}
      <section className="desk-section" aria-labelledby="desk-light-heading">
        <h2 id="desk-light-heading">Reading light</h2>
        <LightToggle labelledBy="desk-light-heading" />
      </section>
    </>}
    <HelpLinks replace={narrow} report={report} />
  </aside>;
}

type RailMenuName = 'account' | 'light' | 'help';

/**
 * Between phone and wide widths (640–1099 px) the left column folds into an
 * icon rail: My library opens the library picker; Account, Reading light
 * and Help open a small pop-over beside the rail. Their pages open in the
 * middle slot, over the shelf.
 */
export function DeskRail({ menu, onMenu, onLibrary, slotOpen, report }: {
  menu: RailMenuName | null; onMenu: (menu: RailMenuName | null) => void; onLibrary: () => void; slotOpen: boolean; report: ReportFrom;
}) {
  const { shown } = useAccountsShown();
  const buttons = useRef<Partial<Record<RailMenuName, HTMLButtonElement | null>>>({});
  const open = (name: RailMenuName) => onMenu(menu === name ? null : name);
  const item = (name: RailMenuName, label: string, icon: ReactNode) => <button type="button" ref={node => { buttons.current[name] = node; }}
    className="rail-button" data-rail={name} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={menu === name} onClick={() => open(name)}>{icon}</button>;
  return <>
    <nav className="desk-rail" aria-label="Library and account">
      <button type="button" className="rail-button rail-library" aria-label="My library" title="My library" aria-haspopup="dialog" onClick={onLibrary}><LibraryGlyph size={24} strokeWidth={1.8} /></button>
      {shown && item('account', 'Account', <PersonIcon />)}
      {item('light', 'Reading light', <LightGlyph />)}
      {item('help', 'Help', <HelpGlyph />)}
    </nav>
    <RailMenu name={menu} anchor={menu ? buttons.current[menu] || null : null} onClose={() => onMenu(null)}>
      {menu === 'account' && <AccountLinks replace={slotOpen} compact onDone={() => onMenu(null)} />}
      {menu === 'light' && <LightToggle labelledBy="rail-menu-title" />}
      {menu === 'help' && <HelpLinks className="rail-help" replace={slotOpen} report={report} onDone={() => onMenu(null)} />}
    </RailMenu>
  </>;
}

const MENU_TITLES: Record<RailMenuName, string> = { account: 'Account', light: 'Reading light', help: 'Help' };

/** A pop-over beside the rail: a small modal dialog. Escape and a click outside close it; focus returns to its rail button. */
function RailMenu({ name, anchor, onClose, children }: { name: RailMenuName | null; anchor: HTMLElement | null; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (name && !dialog.open) {
      opener.current = anchor;
      const box = anchor?.getBoundingClientRect();
      dialog.style.top = Math.max(12, Math.min((box?.top ?? 12) - 4, window.innerHeight - 260)) + 'px';
      dialog.showModal();
      dialog.querySelector<HTMLElement>('a[href], button:not(.rail-menu-close)')?.focus();
    }
    if (!name && dialog.open) {
      dialog.close();
      if (opener.current?.isConnected) opener.current.focus();
    }
  }, [name, anchor]);
  const backdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== ref.current) return;
    const box = ref.current.getBoundingClientRect();
    if (event.clientX > box.right || event.clientX < box.left || event.clientY < box.top || event.clientY > box.bottom) onClose();
  };
  // A link here opens its page in the middle slot. The pop-over closes at
  // once, before that page is drawn: while it is open (modal) everything
  // else is inert, and closing it later would take focus back from the page.
  const follow = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target instanceof Element && event.target.closest('a[href]') && ref.current?.open) ref.current.close();
  };
  return <dialog ref={ref} className="rail-menu" aria-labelledby="rail-menu-title" onClick={backdrop} onClickCapture={follow} onKeyDown={event => trapTab(event, ref.current)}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={() => { if (name) onClose(); }}>
    {name && <>
      <div className="rail-menu-head">
        <h2 id="rail-menu-title">{MENU_TITLES[name]}</h2>
        <button type="button" className="rail-menu-close" aria-label="Close" onClick={onClose}><CloseGlyph size={20} /></button>
      </div>
      {children}
    </>}
  </dialog>;
}

function LightGlyph() {
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </svg>;
}

function HelpGlyph() {
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.2-2.4 3.7M12 17h.01" />
  </svg>;
}
