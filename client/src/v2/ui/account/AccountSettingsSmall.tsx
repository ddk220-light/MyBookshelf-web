import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { AccountApiError, accountRequest } from '../../auth/accountClient';
import { useDeletionReceipt } from '../../auth/DeletionReceiptProvider';
import { trapTab } from '../home/dialogFocus';
import { ChevronGlyph, PersonIcon, TickGlyph, TrashGlyph } from '../home/homeIcons';
import { FormAlert, PanelPage } from '../panel/PanelPage';

type LinkStatus = 'idle' | 'sending' | 'sent' | 'offline' | 'limited';

/**
 * AccountSettings board (plan Phase 9): the email, Change password and Delete
 * account. Change password sends the existing reset link to the account's
 * email. Delete account asks once, "Delete account and shelf?"; the service
 * still needs the password to confirm it is the owner, so that one field sits
 * in the same confirmation. The older full settings stay at
 * /app/settings/account/more (plan section 9, question 18).
 */
export function AccountSettingsSmall() {
  const { session } = useAccountSession();
  const [link, setLink] = useState<LinkStatus>('idle');
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (session.status !== 'authenticated' || !session.user) {
    if (session.status === 'checking') return <p role="status" className="panel-page">Checking your account…</p>;
    return <Navigate to="/app/account/sign-in" replace />;
  }
  const email = session.user.email;

  const sendLink = async () => {
    if (link === 'sending' || link === 'sent') return;
    setLink('sending');
    try {
      await accountRequest('/forgot-password', { method: 'POST', body: { email } });
      if (alive.current) setLink('sent');
    } catch (error) {
      if (alive.current) setLink(error instanceof AccountApiError && error.status === 429 ? 'limited' : 'offline');
    }
  };

  return <PanelPage title={<span className="visually-hidden">Account settings</span>} documentTitle="Account settings" className="account-settings-small">
    <div className="account-person"><span className="panel-avatar" aria-hidden="true"><PersonIcon size={20} /></span><span className="panel-email">{email}</span></div>
    <nav className="settings-rows" aria-label="Account settings">
      <button type="button" className="panel-row settings-row" aria-live="polite" aria-disabled={link === 'sent' || undefined} disabled={link === 'sending'} onClick={() => { void sendLink(); }}>
        {link === 'sent' ? <span className="settings-row-done"><TickGlyph />Link sent</span> : link === 'sending' ? 'Sending…' : 'Change password'}
        {link !== 'sent' && <ChevronGlyph />}
      </button>
      <button ref={deleteButton} type="button" className="panel-row settings-row" aria-haspopup="dialog" onClick={() => setConfirming(true)}>Delete account<ChevronGlyph /></button>
    </nav>
    {link === 'offline' && <FormAlert offline action={<button type="button" className="home-text-button" onClick={() => { setLink('idle'); void sendLink(); }}>Try again</button>}>Couldn’t connect</FormAlert>}
    {link === 'limited' && <FormAlert>Too many tries. Try later</FormAlert>}
    <Link className="settings-more" to="/app/settings/account/more">More</Link>
    {confirming && <DeleteAccountDialog onCancel={() => { setConfirming(false); deleteButton.current?.focus(); }} />}
  </PanelPage>;
}

type DeleteError = '' | 'password' | 'offline' | 'limited' | 'unavailable';

function DeleteAccountDialog({ onCancel }: { onCancel: () => void }) {
  const { session } = useAccountSession();
  const deletion = useDeletionReceipt();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DeleteError>('');
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !session.user) return;
    const password = String(new FormData(event.currentTarget).get('password') || '');
    if (!password) { setError('password'); return; }
    setBusy(true);
    setError('');
    try {
      const proof = await accountRequest<{ proof: string; csrfToken: string }>('/reauth/password', {
        method: 'POST', body: { password, action: 'delete' }, csrf: session.csrfToken,
      });
      const result = deletion.submit({ proof: proof.proof, csrfToken: proof.csrfToken, identity: session.user.id });
      navigate('/app/account/deletion', { replace: true, state: null });
      await result;
    } catch (failure) {
      const status = failure instanceof AccountApiError ? failure.status : 0;
      const code = failure instanceof AccountApiError ? failure.code : '';
      setError(code === 'INVALID_CREDENTIALS' || status === 401 || status === 403 ? 'password'
        : status === 429 ? 'limited' : status >= 500 && code !== 'NETWORK_ERROR' ? 'unavailable' : 'offline');
      setBusy(false);
    }
  };

  return <dialog ref={ref} className="scan-dialog confirm-sheet" role="alertdialog" aria-labelledby="delete-account-title" aria-busy={busy}
    onKeyDown={(event: KeyboardEvent<HTMLDialogElement>) => trapTab(event, ref.current)}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <form className="confirm-sheet-form" onSubmit={event => { void submit(event); }} noValidate>
      <h2 id="delete-account-title">Delete account and shelf?</h2>
      <div className="account-v2-field">
        <label htmlFor="delete-password">Password</label>
        <input id="delete-password" name="password" type="password" autoComplete="current-password" required
          aria-invalid={error === 'password' || undefined} aria-describedby={error ? 'delete-error' : undefined} />
      </div>
      {error === 'password' && <FormAlert id="delete-error">Wrong password</FormAlert>}
      {error === 'offline' && <FormAlert id="delete-error" offline>Couldn’t connect</FormAlert>}
      {error === 'limited' && <FormAlert id="delete-error">Too many tries. Try later</FormAlert>}
      {error === 'unavailable' && <FormAlert id="delete-error">Can’t delete right now. Try later</FormAlert>}
      <button type="submit" className="home-button danger-button" disabled={busy}><TrashGlyph />{busy ? 'Deleting…' : 'Delete'}</button>
      <button type="button" className="home-button home-button-outline" disabled={busy} onClick={onCancel}>Cancel</button>
    </form>
  </dialog>;
}
