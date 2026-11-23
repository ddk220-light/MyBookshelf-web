import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { webLink, type ProblemScreen } from '../../api';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { useLibrary } from '../../context';
import type { PublicLibrary } from '../../types';
import { LibraryGlyph, SettingsGlyph } from '../home/homeIcons';
import { LIBRARY_FIELD, LibraryPicker, touchScreen } from '../library/LibraryPickerDialog';

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

/** The chosen library: icon tile, name, place and Change library; with none chosen, Find my library. */
function LibrarySection({ onChange }: { onChange: () => void }) {
  const { library, loadingLibrary } = useLibrary();
  const catalog = library?.capabilities.catalogLink ? webLink(library.catalogUrl) : undefined;
  return <section className="desk-section desk-library" aria-labelledby="desk-library-heading">
    <h2 id="desk-library-heading">My library</h2>
    {library ? <>
      <div className="desk-library-row">
        <span className="desk-library-icon" aria-hidden="true"><LibraryGlyph size={24} strokeWidth={1.8} /></span>
        <span className="desk-library-name"><strong>{catalog ? <a href={catalog} target="_blank" rel="noreferrer" aria-label={library.name + ", opens in a new tab"}>{library.name}</a> : library.name}</strong>{libraryPlace(library) && <span>{libraryPlace(library)}</span>}</span>
      </div>
      <button type="button" className="desk-link desk-change" onClick={onChange}>Change library</button>
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

/** Help, Report a problem, Privacy, Terms and About. */
export function HelpLinks({ replace, report, onDone, className = '' }: { replace: boolean; report: ReportFrom; onDone?: () => void; className?: string }) {
  return <nav className={'desk-help ' + className} aria-label="Help and information">
    <a href="/support">Help</a>
    <Link to="/app/report" state={report} replace={replace} onClick={onDone}>Report a problem</Link>
    <Link to="/app/privacy" replace={replace} onClick={onDone}>Privacy</Link>
    <Link to="/app/terms" replace={replace} onClick={onDone}>Terms</Link>
    <Link to="/app/about" replace={replace} onClick={onDone}>About</Link>
  </nav>;
}

/**
 * After the picker closes, focus goes back to `target()`. The column may be
 * drawn again a little later (the chosen library replacing Find my library),
 * which would drop focus with the button it was on, so for a short while
 * focus that has been lost is put back on the current target. Focus the
 * reader has moved somewhere else is left alone.
 */
const SETTLE_MS = 1500;
function returnFocusWhenSettled(target: () => HTMLElement | null) {
  const until = performance.now() + SETTLE_MS;
  const step = () => {
    const active = document.activeElement;
    const lost = !active || active === document.body || !active.isConnected;
    const next = target();
    if (lost && next?.isConnected) next.focus();
    else if (!lost && active !== next) return;
    if (performance.now() < until) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * The library picker in the left column (DeskLibrary board): in place of the
 * library, account and reading light sections, with the shelf still beside
 * it. Escape and × close it; focus starts in the field (on a touch screen,
 * on "Libraries near me", so the keyboard waits for a tap) and goes back to
 * `returnFocus`.
 */
function ColumnPicker({ onClose, initialQuery, returnFocus }: { onClose: () => void; initialQuery?: string; returnFocus: () => HTMLElement | null }) {
  const titleId = useId(), listId = useId();
  const ref = useRef<HTMLElement>(null);
  const back = useRef(returnFocus);
  back.current = returnFocus;
  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLElement>(touchScreen() ? '.library-near' : LIBRARY_FIELD)?.focus();
    return () => returnFocusWhenSettled(() => back.current());
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
 * library, Account (none at all when accounts are switched off), Settings
 * (the reading light lives there), and Help / Report a problem / Privacy /
 * Terms / About at the bottom. It narrows
 * while a page is open in the middle slot (DeskBook board) and widens to hold
 * the library picker (DeskLibrary board). Links open their page in the
 * middle slot; with a page already there, they take its place.
 */
export function DeskColumn({ narrow, picking, onChangeLibrary, onClosePicker, pickerQuery, pickerReturn, report, onSettings }: {
  narrow: boolean; picking: boolean; onChangeLibrary: () => void; onClosePicker: () => void; pickerQuery?: string;
  pickerReturn: () => HTMLElement | null; report: ReportFrom; onSettings: () => void;
}) {
  const { shown, signedIn } = useAccountsShown();
  return <aside className={'desk-column' + (narrow ? ' is-narrow' : '') + (picking ? ' is-picking' : '')} aria-label="Library and account">
    <p className="desk-wordmark"><a href="/about">MyBookshelf</a></p>
    {picking ? <ColumnPicker onClose={onClosePicker} initialQuery={pickerQuery} returnFocus={pickerReturn} /> : <>
      <LibrarySection onChange={onChangeLibrary} />
      {shown && <section className="desk-section desk-account" aria-labelledby="desk-account-heading">
        <h2 id="desk-account-heading">Account</h2>
        {!signedIn && <p className="desk-account-line">Keep the same reading shelf on your phone and computer.</p>}
        <AccountLinks replace={narrow} />
      </section>}
      <button type="button" className="desk-link desk-settings" aria-haspopup="dialog" onClick={onSettings}><SettingsGlyph size={18} />Settings</button>
    </>}
    <HelpLinks replace={narrow} report={report} />
  </aside>;
}

/** At rail widths one gear opens the same Settings panel used on phones. */
export function DeskRail({ onSettings, open }: { onSettings: () => void; open: boolean }) {
  return <aside className="desk-rail" aria-label="MyBookshelf">
    <button type="button" className="rail-button desk-settings" aria-label="Settings" title="Settings"
      aria-haspopup="dialog" aria-expanded={open} onClick={onSettings}><SettingsGlyph /></button>
  </aside>;
}
