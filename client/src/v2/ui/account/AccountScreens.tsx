import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAccountSession, type AccountSession } from '../../auth/AccountSessionProvider';
import { AccountApiError, accountRequest } from '../../auth/accountClient';
import { useDeletionReceipt } from '../../auth/DeletionReceiptProvider';
import { useLibrary } from '../../context';
import { TrashGlyph } from '../home/homeIcons';
import { FormAlert, PanelPage } from '../panel/PanelPage';
import { AccountForm } from './AccountPages';
import { EMAIL, Field, PASSWORD_MAX, failureAlert, failureOf, useAlive, type Failure } from './OneShelfAccountPages';
import { PasswordInput } from './PasswordInput';

// One account screen (Account board, plan B6) and the three screens it opens:
// Change email, Change password (the DeleteAccount board's form style) and
// Delete account (DeleteAccount board, B7). No data download, no list of
// signed-in devices and no "log out everywhere" here (owner's decision);
// changing the email or the password still logs the other devices out.

/** Within this long of signing in the password is not asked again (server: credential-actions.js), less a little for clocks. */
const RECENT_MS = 10 * 60_000 - 30_000;
const signedInRecently = (session: AccountSession) => {
  const at = session.signedInAt ? Date.parse(session.signedInAt) : NaN;
  return Number.isFinite(at) && Date.now() - at < RECENT_MS;
};

type Profile = {
  pendingEmail?: { email: string; expiresAt: string } | null;
  methods: Array<{ provider: 'password' | 'google' | 'apple'; usable: boolean }>;
};
/** What the account screen says after a change made on one of its screens (router state). */
type AccountNotice = { notice?: 'password' | 'email-cancelled' };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function useSignedIn() {
  const { session } = useAccountSession();
  if (session.status === 'authenticated' && session.user) return { session, redirect: null };
  return { session, redirect: session.status === 'checking' ? <p role="status" className="panel-page">Checking your account…</p> : <Navigate to="/app/account/sign-in" replace /> };
}

/** "Your account": email, password, the size of the shelf, Log out, Delete my account… */
export function AccountPage() {
  const { session, redirect } = useSignedIn();
  const { signOut, invalidate } = useAccountSession();
  const library = useLibrary();
  const navigate = useNavigate(), location = useLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [problem, setProblem] = useState<Failure | null>(null);
  const [notice] = useState(() => (location.state as AccountNotice | null)?.notice);
  const alive = useAlive();
  const userId = session.user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    // One request when the reader opens the screen: whether a password is
    // set and whether an email change is waiting for confirmation.
    void accountRequest<Profile>('/profile', { identity: userId })
      .then(value => { if (active) setProfile(value); })
      .catch(error => { if (error instanceof AccountApiError && (error.status === 401 || error.code === 'IDENTITY_CHANGED')) invalidate(); });
    return () => { active = false; };
  }, [userId, invalidate]);
  if (redirect) return redirect;
  const saved = library.state.savedBooks.length, viewed = library.state.recentBooks.length;
  const password = !profile || profile.methods.some(method => method.provider === 'password' && method.usable);
  const cancelChange = async () => {
    if (cancelling) return;
    setCancelling(true); setProblem(null);
    try {
      await accountRequest('/email-change/cancel', { method: 'POST', body: {}, csrf: session.csrfToken, identity: userId });
      if (alive.current) setProfile(current => current && { ...current, pendingEmail: null });
    } catch (error) {
      if (alive.current) setProblem(failureOf(error) === 'other' ? 'offline' : failureOf(error));
    } finally { if (alive.current) setCancelling(false); }
  };
  return <PanelPage title="Your account" documentTitle="Your account" className="account-page">
    <p className="account-lede">Your reading shelf, your library and the books you viewed are saved to this account and shown on every device where you log in.</p>
    {notice === 'password' && <p role="status" className="account-done">Password changed. Other devices were logged out.</p>}
    <section className="account-rows" aria-label="Account details">
      <div className="account-row">
        <div className="account-row-text">
          <span className="account-row-label">Email</span>
          <span className="account-row-value">{session.user!.email}</span>
          {profile?.pendingEmail && <span className="account-row-note">Waiting for you to confirm {profile.pendingEmail.email}.{' '}
            <button type="button" className="home-text-button" disabled={cancelling} onClick={() => { void cancelChange(); }}>{cancelling ? 'Cancelling…' : 'Cancel the change'}</button></span>}
        </div>
        <Link className="account-row-action" to="/app/settings/account/email" aria-label="Change email">Change</Link>
      </div>
      <div className="account-row">
        <div className="account-row-text">
          <span className="account-row-label">Password</span>
          <span className="account-row-value">{password ? 'Set' : 'Not set'}</span>
        </div>
        {password && <Link className="account-row-action" to="/app/settings/account/password" aria-label="Change password">Change</Link>}
      </div>
      <div className="account-row">
        <div className="account-row-text">
          <span className="account-row-label">Your reading shelf</span>
          <span className="account-row-value">{plural(saved, 'saved book', 'saved books')} · {viewed} viewed</span>
        </div>
      </div>
    </section>
    {failureAlert(problem, () => { void cancelChange(); })}
    <button type="button" className="home-button home-button-outline account-logout" onClick={() => { void signOut(); navigate('/', { replace: true, state: null }); }}>Log out</button>
    <p className="account-fine">Logging out keeps your reading shelf safe in your account.</p>
    <Link className="account-delete-link" to="/app/settings/account/delete">Delete my account…</Link>
  </PanelPage>;
}

type Confirmed = { proof: string; csrfToken: string };
type ChangeError = 'current' | 'confirm' | Failure | null;

/**
 * "Confirm it's you" for a change: within 10 minutes of signing in no password
 * is asked (except to delete the account); otherwise the current password.
 */
function useConfirmation(action: 'password-change' | 'email-change') {
  const { session, refresh } = useAccountSession();
  const [needsPassword, setNeedsPassword] = useState(() => !signedInRecently(session));
  const confirm = async (current: string): Promise<Confirmed | 'needs-password'> => {
    if (!needsPassword) {
      try {
        return await accountRequest<Confirmed>('/reauth/recent', { method: 'POST', body: { action }, csrf: session.csrfToken, identity: session.user?.id });
      } catch (error) {
        if (error instanceof AccountApiError && error.code === 'RECENT_AUTH_REQUIRED') { setNeedsPassword(true); return 'needs-password'; }
        throw error;
      }
    }
    const proof = await accountRequest<Confirmed>('/reauth/password', { method: 'POST', body: { password: current, action }, csrf: session.csrfToken });
    // Confirming starts a new session for this device: take its new key.
    await refresh(true);
    return proof;
  };
  return { needsPassword, confirm };
}

const currentPasswordError = (error: ChangeError) => error === 'current' ? 'Wrong password' : error === 'confirm' ? 'Type your password to continue' : undefined;
const changeFailure = (error: unknown): ChangeError => {
  const code = error instanceof AccountApiError ? error.code : '';
  if (code === 'INVALID_CREDENTIALS' || code === 'INVALID_PASSWORD') return 'current';
  if (code === 'RECENT_AUTH_REQUIRED') return 'confirm';
  const kind = failureOf(error);
  return kind === 'other' ? 'offline' : kind;
};

/** Change password: the new password (and the current one unless signed in within 10 minutes). */
export function ChangePasswordPage() {
  const { session, redirect } = useSignedIn();
  const { refresh } = useAccountSession();
  const navigate = useNavigate();
  const { needsPassword, confirm } = useConfirmation('password-change');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChangeError>(null);
  const [tooLong, setTooLong] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  if (redirect) return redirect;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const current = String(data.get('current-password') || ''), next = String(data.get('new-password') || '');
    if (needsPassword && !current) { event.currentTarget.querySelector<HTMLInputElement>('input[name="current-password"]')?.focus(); return; }
    if (!next) { event.currentTarget.querySelector<HTMLInputElement>('input[name="new-password"]')?.focus(); return; }
    if ([...next].length > PASSWORD_MAX) { setTooLong(true); return; }
    setBusy(true); setError(null); setTooLong(false);
    try {
      const proof = await confirm(current);
      if (!alive.current) return;
      if (proof === 'needs-password') { setError('confirm'); return; }
      await accountRequest('/password', { method: 'POST', body: { password: next, proof: proof.proof }, csrf: proof.csrfToken, identity: session.user?.id });
      // The change logs out every other device and starts a new session here.
      await refresh(true);
      if (alive.current) navigate('/app/settings/account', { replace: true, state: { notice: 'password' } satisfies AccountNotice });
    } catch (failure) {
      if (alive.current) setError(changeFailure(failure));
    } finally { if (alive.current) setBusy(false); }
  };
  const currentError = currentPasswordError(error);
  return <AccountForm title="Change your password" formRef={form} busy={busy} noValidate onSubmit={event => { void submit(event); }}
    lede="Other devices where you are logged in will be logged out.">
    {needsPassword && <Field label="Current password" errorId="current-password-error" error={currentError}>{id =>
      <PasswordInput id={id} name="current-password" autoComplete="current-password" required aria-invalid={Boolean(currentError) || undefined} aria-describedby={currentError ? 'current-password-error' : undefined} />}</Field>}
    <Field label="New password" errorId="new-password-error" error={tooLong ? `Too long: ${PASSWORD_MAX} characters or fewer` : undefined}>{id =>
      <PasswordInput id={id} name="new-password" autoComplete="new-password" required aria-invalid={tooLong || undefined} aria-describedby={tooLong ? 'new-password-error' : undefined} />}</Field>
    {failureAlert(error === 'offline' || error === 'limited' || error === 'unavailable' ? error : null, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
    <Link className="home-button home-button-outline" to="/app/settings/account" replace>Keep my password</Link>
  </AccountForm>;
}

/** Change email: the new address gets a link; the current one stays in use until it is opened. */
export function ChangeEmailPage() {
  const { session, redirect } = useSignedIn();
  const { needsPassword, confirm } = useConfirmation('email-change');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChangeError | 'email' | 'same'>(null);
  const [sentTo, setSentTo] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  if (redirect) return redirect;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim(), current = String(data.get('current-password') || '');
    if (!EMAIL.test(email) || email.length > 254) { setError('email'); return; }
    if (email.toLowerCase() === session.user?.email.toLowerCase()) { setError('same'); return; }
    if (needsPassword && !current) { event.currentTarget.querySelector<HTMLInputElement>('input[name="current-password"]')?.focus(); return; }
    setBusy(true); setError(null);
    try {
      const proof = await confirm(current);
      if (!alive.current) return;
      if (proof === 'needs-password') { setError('confirm'); return; }
      await accountRequest('/email-change', { method: 'POST', body: { newEmail: email, proof: proof.proof }, csrf: proof.csrfToken, identity: session.user?.id });
      if (alive.current) setSentTo(email);
    } catch (failure) {
      if (!alive.current) return;
      const code = failure instanceof AccountApiError ? failure.code : '';
      setError(code === 'SAME_EMAIL' ? 'same' : code === 'INVALID_INPUT' ? 'email' : changeFailure(failure));
    } finally { if (alive.current) setBusy(false); }
  };
  if (sentTo) return <AccountForm title="Check your new email">
    <p>We sent a link to <strong>{sentTo}</strong>. Open it to finish the change. Until then you keep using {session.user!.email}.</p>
    <p>When the change is done, other devices where you are logged in will be logged out.</p>
    <Link className="home-button" to="/app/settings/account" replace>Back to your account</Link>
  </AccountForm>;
  const emailError = error === 'email' ? 'Check the email' : error === 'same' ? 'That is already your email' : undefined;
  const currentError = currentPasswordError(error === 'email' || error === 'same' ? null : error);
  return <AccountForm title="Change your email" formRef={form} busy={busy} noValidate onSubmit={event => { void submit(event); }}
    lede="We send a link to the new address. Your email changes when you open it.">
    <Field label="New email" errorId="new-email-error" error={emailError}>{id =>
      <input id={id} name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(emailError) || undefined} aria-describedby={emailError ? 'new-email-error' : undefined} />}</Field>
    {needsPassword && <Field label="Current password" errorId="current-password-error" error={currentError}>{id =>
      <PasswordInput id={id} name="current-password" autoComplete="current-password" required aria-invalid={Boolean(currentError) || undefined} aria-describedby={currentError ? 'current-password-error' : undefined} />}</Field>}
    {failureAlert(error === 'offline' || error === 'limited' || error === 'unavailable' ? error : null, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy}>{busy ? 'Sending…' : 'Send the link'}</button>
    <Link className="home-button home-button-outline" to="/app/settings/account" replace>Keep my email</Link>
  </AccountForm>;
}

type DeleteError = '' | 'empty' | 'password' | 'offline' | 'limited' | 'unavailable';

/** Delete your account (DeleteAccount board): what goes, what stays for a short time, the password. */
export function DeleteAccountPage() {
  const { session, redirect } = useSignedIn();
  const deletion = useDeletionReceipt();
  const library = useLibrary();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DeleteError>('');
  if (redirect) return redirect;
  const saved = library.state.savedBooks.length;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !session.user) return;
    const password = String(new FormData(event.currentTarget).get('password') || '');
    if (!password) { setError('empty'); event.currentTarget.querySelector<HTMLInputElement>('input[name="password"]')?.focus(); return; }
    setBusy(true);
    setError('');
    try {
      // Deleting always asks for the password, however recently the reader signed in.
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
  return <AccountForm title="Delete your account" busy={busy} noValidate onSubmit={event => { void submit(event); }}
    lede="This cannot be undone. Please read what happens first."
    after={<p className="account-fine">We will send one email to confirm the account was deleted.</p>}>
    <section className="account-deleted-list" aria-labelledby="deleted-data">
      <h2 id="deleted-data">What will be deleted</h2>
      <ul>
        <li>Your email and password</li>
        <li>{saved ? `Your ${plural(saved, 'saved book', 'saved books')} and your library choice` : 'Your library choice'}</li>
        <li>Your Viewed before list</li>
        <li>The copy of your reading shelf kept in this browser</li>
      </ul>
      <p>You’ll be logged out on every device right away. Live account data is scheduled for removal within 24 hours.</p>
    </section>
    <section className="account-kept-list" aria-labelledby="kept-briefly">
      <h2 id="kept-briefly">What stays for a short time</h2>
      <p>Backup copies, which expire within 30 days.</p>
    </section>
    <Field label="Type your password to confirm" errorId="delete-error">{id =>
      <PasswordInput id={id} name="password" autoComplete="current-password" required aria-invalid={error === 'password' || error === 'empty' || undefined} aria-describedby={error ? 'delete-error' : undefined} />}</Field>
    {error === 'empty' && <FormAlert id="delete-error">Type your password</FormAlert>}
    {error === 'password' && <FormAlert id="delete-error">Wrong password</FormAlert>}
    {error === 'offline' && <FormAlert id="delete-error" offline>Couldn’t connect</FormAlert>}
    {error === 'limited' && <FormAlert id="delete-error">Too many tries. Try later</FormAlert>}
    {error === 'unavailable' && <FormAlert id="delete-error">Can’t delete right now. Try later</FormAlert>}
    <button type="submit" className="home-button danger-button" disabled={busy}><TrashGlyph />{busy ? 'Deleting…' : 'Delete my account'}</button>
    <Link className="home-button home-button-outline" to="/app/settings/account" replace>Keep my account</Link>
  </AccountForm>;
}
