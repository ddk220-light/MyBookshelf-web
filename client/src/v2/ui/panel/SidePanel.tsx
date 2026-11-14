import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { useLibrary } from '../../context';
import { useReadingLight } from '../readingLightContext';
import { trapTab } from '../home/dialogFocus';
import { ChevronGlyph, CloseGlyph, LibraryGlyph, PersonIcon } from '../home/homeIcons';

const LIGHTS = [['daylight', 'Daylight'], ['lamplight', 'Lamplight'], ['ink', 'Ink']] as const;

/**
 * The left side panel (account, library, reading light, help). A modal
 * dialog: focus stays inside, Escape and the backdrop close it, and focus
 * returns to the control that opened it. Back closes it too (the home screen
 * opens it as a history entry). "Change" hands over to the library pop-up.
 */
export function SidePanel({ open, onClose, returnFocus, onChangeLibrary }: { open: boolean; onClose: () => void; returnFocus?: () => HTMLElement | null; onChangeLibrary: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { session, signOut } = useAccountSession();
  const { library, loadingLibrary } = useLibrary();
  const { light, setLight } = useReadingLight();
  // A problem report names the screen under the panel: results or the shelf.
  const reportScreen = (useLocation().state as { search?: unknown } | null)?.search ? 'search' : 'shelf';
  const signedIn = session.status === 'authenticated' && Boolean(session.user);
  // Accounts switched off or not answering: nothing here could work, so the
  // reader simply carries on as a guest without account buttons.
  const accountsAvailable = signedIn || !session.availability;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('.side-panel-close')?.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      returnFocus?.()?.focus();
    }
  }, [open, returnFocus]);

  const trap = (event: KeyboardEvent<HTMLDialogElement>) => trapTab(event, ref.current);
  // The dialog box is the panel itself, so a click on the dialog element outside its box is the backdrop.
  const backdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== ref.current) return;
    const box = ref.current.getBoundingClientRect();
    if (event.clientX > box.right || event.clientX < box.left || event.clientY < box.top || event.clientY > box.bottom) onClose();
  };

  return <dialog ref={ref} className="side-panel" aria-label="Account and settings" onKeyDown={trap} onClick={backdrop}
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }}>
    {open && <>
      <button type="button" className="side-panel-close" aria-label="Close" onClick={onClose}><CloseGlyph /></button>

      {accountsAvailable && <section className="panel-section panel-account" aria-labelledby="panel-account">
        <h2 id="panel-account">Account</h2>
        {signedIn ? <>
          <div className="panel-person"><span className="panel-avatar" aria-hidden="true"><PersonIcon size={20} /></span><span className="panel-email">{session.user!.email}</span></div>
          <button type="button" className="home-button home-button-outline panel-button" onClick={() => { void signOut(); }}>Log out</button>
          <Link className="panel-row panel-row-plain" to="/app/settings/account">Account settings<ChevronGlyph /></Link>
        </> : <>
          <Link className="home-button panel-button" to="/app/account/sign-up">Create account</Link>
          <Link className="home-button home-button-outline panel-button" to="/app/account/sign-in">Log in</Link>
        </>}
      </section>}

      <section className="panel-section" aria-labelledby="panel-library">
        <h2 id="panel-library">My library</h2>
        <div className="panel-library">
          <span className="panel-library-icon" aria-hidden="true"><LibraryGlyph size={20} strokeWidth={1.8} /></span>
          <span className="panel-library-name">{library ? <><strong>{library.name}</strong>{library.city && <span>{library.city}</span>}</> : <strong>{loadingLibrary ? 'Loading…' : 'None chosen'}</strong>}</span>
          <button type="button" className="home-text-button" aria-haspopup="dialog" aria-label={library ? 'Change library' : 'Choose a library'} onClick={onChangeLibrary}>{library ? 'Change' : 'Choose'}</button>
        </div>
      </section>

      <section className="panel-section" aria-labelledby="panel-light">
        <h2 id="panel-light">Reading light</h2>
        <div className="light-toggle" role="group" aria-labelledby="panel-light">
          {LIGHTS.map(([value, label]) => <button key={value} type="button" aria-pressed={light === value} onClick={() => setLight(value)}>{label}</button>)}
        </div>
      </section>

      <nav className="panel-links" aria-label="Help and information">
        <Link className="panel-row" to="/app/report" state={{ reportScreen }}>Report a problem<ChevronGlyph /></Link>
        <Link className="panel-row" to="/app/privacy">Privacy<ChevronGlyph /></Link>
        <Link className="panel-row" to="/app/about">About<ChevronGlyph /></Link>
      </nav>
    </>}
  </dialog>;
}
