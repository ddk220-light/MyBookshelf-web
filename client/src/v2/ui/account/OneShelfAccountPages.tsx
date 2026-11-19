import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { AccountApiError, accountRequest, safeAccountReturn } from '../../auth/accountClient';
import { useAccountEntryPending } from '../../auth/entryReadiness';
import { useLinkToken } from '../../auth/linkToken';
import { useDeletionReceipt } from '../../auth/DeletionReceiptProvider';
import { useLibrary } from '../../context';
import { TickGlyph } from '../home/homeIcons';
import { FormAlert } from '../panel/PanelPage';
import { AccountForm, AccountScreen } from './AccountPages';
import { PasswordInput } from './PasswordInput';

// The account entry screens (production-ready boards CreateAccount, LogIn and
// Welcome; plan B1 to B4 and B10). Every password field has an eye button and
// no rules beyond the maximum length; each error is one short line.

/** The longest password the account service accepts (server accounts/validation.js). */
export const PASSWORD_MAX = 128;
/**
 * The account service still requires a private name at sign-up (PRD AC-02);
 * the form does not ask for one (plan 4.7: accounts hold the email, password,
 * shelf, library and Viewed before), so it sends this fixed word.
 */
export const ACCOUNT_NAME_PLACEHOLDER = 'Reader';

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How a failed account request reads to the reader. */
export type Failure = 'offline' | 'limited' | 'unavailable' | 'other';
export function failureOf(error: unknown): Failure {
  if (!(error instanceof AccountApiError)) return 'other';
  if (error.status === 429 || error.code === 'RATE_LIMITED') return 'limited';
  if (error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE' || error.status >= 500 || error.status === 0) return 'offline';
  if (error.code === 'ACCOUNT_UNAVAILABLE') return 'unavailable';
  return 'other';
}

/**
 * Where an email typed on one account screen travels to the next (Log in →
 * Forgot password, a failed reset → Log in): router state only, never the
 * address or browser storage.
 */
export type EntryState = { email?: string; from?: 'verify' | 'reset' | 'link' };
export function stateEmail(location: Location): string {
  const email = (location.state as EntryState | null)?.email;
  return typeof email === 'string' && email.length <= 254 ? email : '';
}

export function Field({ label, error, errorId, children }: { label: string; error?: ReactNode; errorId?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="account-v2-field">
    <label htmlFor={id}>{label}</label>
    {children(id)}
    {error && <FormAlert id={errorId}>{error}</FormAlert>}
  </div>;
}

export function Done({ children }: { children: ReactNode }) {
  return <button type="button" className="home-button sent-button" aria-disabled="true" aria-live="polite"><span className="tick-pop"><TickGlyph /></span>{children}</button>;
}

export function useAlive() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}

export function failureAlert(failure: Failure | null, retry: () => void) {
  if (failure === 'offline') return <FormAlert offline action={<button type="button" className="home-text-button" onClick={retry}>Try again</button>}>Couldn’t connect</FormAlert>;
  if (failure === 'limited') return <FormAlert>Too many tries. Try later</FormAlert>;
  if (failure === 'unavailable') return <FormAlert>Accounts aren’t available right now</FormAlert>;
  return null;
}

type LogInError = 'credentials' | 'verify' | Failure | null;

/**
 * Log in (LogIn board): "Email me a log-in link" first, the password as the
 * second way. One email field serves both; Enter in the email field asks for
 * the link, Enter in the password field logs in with the password.
 */
export function LogInPage() {
  const entryPending = useAccountEntryPending();
  const { refresh, prepareSignIn } = useAccountSession();
  const navigate = useNavigate(), location = useLocation();
  const [email, setEmail] = useState(() => stateEmail(location));
  const [busy, setBusy] = useState<'link' | 'password' | null>(null);
  const [error, setError] = useState<LogInError>(null);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState('');
  const [resent, setResent] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const linkForm = useRef<HTMLFormElement>(null), passwordForm = useRef<HTMLFormElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const typedEmail = useRef('');
  const alive = useAlive();
  const ids = { link: useId(), password: useId(), email: useId() };
  const typed = () => email.trim();

  const sendLink = async (address: string) => {
    if (busy || entryPending) return;
    if (!EMAIL.test(address) || address.length > 254) { setEmailInvalid(true); emailInput.current?.focus(); return; }
    setBusy('link'); setError(null); setEmailInvalid(false);
    try {
      await accountRequest('/magic-link', { method: 'POST', body: { email: address } });
      if (!alive.current) return;
      if (linkSentTo) setResent(true); else setLinkSentTo(address);
    } catch (failure) {
      if (!alive.current) return;
      const kind = failureOf(failure);
      if (kind === 'other') setEmailInvalid(true); else setError(kind);
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const logIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending) return;
    const address = typed(), password = String(new FormData(event.currentTarget).get('password') || '');
    if (!address || !password) { setError('credentials'); return; }
    typedEmail.current = address;
    setBusy('password'); setError(null); setVerifySent(false); setEmailInvalid(false);
    prepareSignIn();
    try {
      const result = await accountRequest<{ returnTo?: string }>('/sign-in', { method: 'POST',
        body: { email: address, password, returnTo: safeAccountReturn(new URLSearchParams(location.search).get('returnTo')) } });
      if (!alive.current) return;
      const checked = await refresh(true);
      if (!alive.current) return;
      if (checked.status !== 'authenticated') throw new AccountApiError('NETWORK_ERROR', 'Couldn’t connect.');
      // The books in this browser join the account on their own (plan B5).
      navigate(safeAccountReturn(result.returnTo || null), { replace: true, state: null });
    } catch (failure) {
      if (!alive.current) return;
      const code = failure instanceof AccountApiError ? failure.code : '';
      setError(code === 'INVALID_CREDENTIALS' ? 'credentials' : code === 'VERIFY_EMAIL_REQUIRED' ? 'verify' : failureOf(failure));
    } finally {
      if (alive.current) setBusy(null);
    }
  };
  const resendVerification = async () => {
    if (!typedEmail.current) return;
    try {
      await accountRequest('/resend-verification', { method: 'POST', body: { email: typedEmail.current } });
      if (alive.current) setVerifySent(true);
    } catch (failure) { if (alive.current) setError(failureOf(failure)); }
  };

  if (linkSentTo) return <AccountScreen title="Check your email">
    <p>If that address has an account, a link is on its way. Open it on this device and you are logged in.</p>
    <p className="account-v2-email"><strong>{linkSentTo}</strong></p>
    <p className="account-fine">The link works once, for 15 minutes. Use the newest email.</p>
    {failureAlert(error === 'offline' || error === 'limited' || error === 'unavailable' ? error : null, () => { void sendLink(linkSentTo); })}
    {resent ? <Done>Link sent</Done> : <button type="button" className="home-button home-button-outline" disabled={busy === 'link'} onClick={() => { void sendLink(linkSentTo); }}>{busy === 'link' ? 'Sending…' : 'Send again'}</button>}
    <button type="button" className="home-text-button account-v2-link" onClick={() => { setLinkSentTo(''); setResent(false); setError(null); }}>Use my password instead</button>
  </AccountScreen>;

  const wrong = error === 'credentials';
  const emailError = emailInvalid ? 'Check the email' : undefined;
  return <AccountScreen title="Log in" busy={Boolean(busy)}>
    <p className="account-lede">Open your reading shelf on this device.</p>
    <form ref={linkForm} id={ids.link} className="account-v2-stack" aria-label="Log in with an email link" noValidate
      onSubmit={event => { event.preventDefault(); void sendLink(typed()); }}>
      <div className="account-v2-field">
        <label htmlFor={ids.email}>Email</label>
        <input ref={emailInput} id={ids.email} name="email" type="email" autoComplete="email" maxLength={254} required value={email}
          onChange={event => { setEmail(event.target.value); if (emailInvalid) setEmailInvalid(false); }}
          aria-invalid={wrong || emailInvalid || undefined} aria-describedby={emailError ? 'login-email-error' : wrong ? 'login-error' : undefined} />
        {emailError && <FormAlert id="login-email-error">{emailError}</FormAlert>}
      </div>
      <button type="submit" className="home-button" disabled={Boolean(busy) || entryPending}>{busy === 'link' ? 'Sending…' : 'Email me a log-in link'}</button>
      <p className="account-fine">We send a link to your email. Open it on this device and you are logged in. No password needed.</p>
    </form>
    <div className="account-divider"><span aria-hidden="true" />or use your password<span aria-hidden="true" /></div>
    <form ref={passwordForm} id={ids.password} className="account-v2-stack" aria-label="Log in with your password" noValidate onSubmit={event => { void logIn(event); }}>
      <Field label="Password">{id => <PasswordInput id={id} name="password" autoComplete="current-password" required
        aria-invalid={wrong || undefined} aria-describedby={wrong ? 'login-error' : undefined} />}</Field>
      {wrong && <FormAlert id="login-error">Wrong email or password</FormAlert>}
      {error === 'verify' && (verifySent ? <FormAlert action={<span className="form-alert-done"><TickGlyph size={18} />Link sent</span>}>Email not verified</FormAlert>
        : <FormAlert action={<button type="button" className="home-text-button" onClick={() => { void resendVerification(); }}>Send link</button>}>Email not verified</FormAlert>)}
      {failureAlert(error === 'credentials' || error === 'verify' ? null : error, () => passwordForm.current?.requestSubmit())}
      {error === 'other' && <FormAlert>Couldn’t log in</FormAlert>}
      <button type="submit" className="home-button home-button-outline" disabled={Boolean(busy) || entryPending}>{busy === 'password' ? 'Logging in…' : 'Log in with password'}</button>
      {error !== 'offline' && <Link className="home-text-button account-v2-link account-start" to="/app/account/forgot-password" state={{ email: typed() } satisfies EntryState}>Forgot your password?</Link>}
    </form>
    <p className="account-switch">New here? <Link to="/app/account/sign-up">Create an account</Link></p>
  </AccountScreen>;
}

type CreateErrors = { email?: 'invalid' | 'used'; password?: 'long' };

/** Create account (CreateAccount board): a welcome, email, password, what happens next. */
export function CreateAccountPage() {
  const entryPending = useAccountEntryPending();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<CreateErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [resent, setResent] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim(), password = String(data.get('password') || '');
    const next: CreateErrors = {};
    if (!EMAIL.test(email) || email.length > 254) next.email = 'invalid';
    // No rules: any password, as long as one character is typed.
    if (!password) next.password = undefined;
    else if ([...password].length > PASSWORD_MAX) next.password = 'long';
    setFields(next); setFailure(null);
    if (next.email || next.password || !password) {
      event.currentTarget.querySelector<HTMLInputElement>(next.email ? 'input[name="email"]' : 'input[name="password"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      await accountRequest('/sign-up', { method: 'POST', body: { name: ACCOUNT_NAME_PLACEHOLDER, email, password } });
      if (alive.current) setSentTo(email);
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof AccountApiError ? error.code : '';
      // The service answers a used email like a new one (PRD AC-02), so "used"
      // appears only if it ever reports the address as taken.
      if (code === 'USER_ALREADY_EXISTS' || code === 'EMAIL_IN_USE') setFields({ email: 'used' });
      else if (code === 'INVALID_INPUT' && error instanceof Error && /password/i.test(error.message)) setFields({ password: 'long' });
      else if (code === 'INVALID_INPUT') setFields({ email: 'invalid' });
      else setFailure(failureOf(error) === 'other' ? 'offline' : failureOf(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const resend = async () => {
    try {
      await accountRequest('/resend-verification', { method: 'POST', body: { email: sentTo } });
      if (alive.current) setResent(true);
    } catch (error) { if (alive.current) setFailure(failureOf(error) === 'other' ? 'offline' : failureOf(error)); }
  };
  if (sentTo) return <AccountScreen title="Check your email">
    <p>We sent a link to this address. Open it and you are signed in.</p>
    <p className="account-v2-email"><strong>{sentTo}</strong></p>
    {failureAlert(failure, () => { setFailure(null); void resend(); })}
    {resent ? <Done>Link sent</Done> : <button type="button" className="home-button home-button-outline" onClick={() => { void resend(); }}>Send again</button>}
    <Link className="home-text-button account-v2-link" to="/app/account/sign-in" state={{ email: sentTo } satisfies EntryState}>Log in</Link>
  </AccountScreen>;
  const emailError = fields.email === 'invalid' ? 'Check the email' : fields.email === 'used' ? 'Email already used' : undefined;
  const passwordError = fields.password === 'long' ? `Too long: ${PASSWORD_MAX} characters or fewer` : undefined;
  return <AccountForm title="Welcome to MyBookshelf" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} noValidate
    lede="Create a free account to keep the same reading shelf on every device. The books already on this device come with you."
    after={<>
      <div className="account-next">
        <h2>What happens next</h2>
        <ol>
          <li>We send a link to your email.</li>
          <li>Open the link and you are signed in.</li>
          <li>Your reading shelf appears on any device where you log in.</li>
        </ol>
      </div>
      <p className="account-switch">Already have an account? <Link to="/app/account/sign-in">Log in</Link></p>
      <p className="account-fine account-terms">By creating an account you agree to the <Link to="/app/terms">Terms</Link> and <Link to="/app/privacy">Privacy</Link></p>
    </>}>
    <div className="account-v2-field">
      <label htmlFor="signup-email">Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(emailError) || undefined} aria-describedby={emailError ? 'signup-email-error' : undefined}
        onChange={() => { if (fields.email) setFields({ ...fields, email: undefined }); }} />
      {emailError && <FormAlert id="signup-email-error" action={fields.email === 'used' ? <Link className="home-text-button" to="/app/account/sign-in">Log in</Link> : undefined}>{emailError}</FormAlert>}
    </div>
    <div className="account-v2-field">
      <label htmlFor="signup-password">Password</label>
      <PasswordInput id="signup-password" name="password" autoComplete="new-password" required aria-invalid={Boolean(passwordError) || undefined} aria-describedby={passwordError ? 'signup-password-error' : undefined}
        onChange={() => { if (fields.password) setFields({ ...fields, password: undefined }); }} />
      {passwordError && <FormAlert id="signup-password-error">{passwordError}</FormAlert>}
    </div>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Creating your account…' : 'Create account'}</button>
  </AccountForm>;
}

/** Forgot password: email, Send reset link → Link sent. The email typed on Log in comes along. */
export function ResetRequestPage() {
  const entryPending = useAccountEntryPending();
  const location = useLocation();
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const [initialEmail] = useState(() => stateEmail(location));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || sent || entryPending) return;
    const email = String(new FormData(event.currentTarget).get('email') || '').trim();
    if (!EMAIL.test(email)) { setInvalid(true); return; }
    setBusy(true); setInvalid(false); setFailure(null);
    try {
      await accountRequest('/forgot-password', { method: 'POST', body: { email } });
      if (alive.current) setSent(true);
    } catch (error) {
      if (alive.current) { const kind = failureOf(error); if (kind === 'other') setInvalid(true); else setFailure(kind); }
    } finally { if (alive.current) setBusy(false); }
  };
  return <AccountForm title="Reset password" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} noValidate>
    <Field label="Email" error={invalid ? 'Check the email' : undefined} errorId="reset-email-error">{id =>
      <input id={id} name="email" type="email" autoComplete="email" maxLength={254} required readOnly={sent} defaultValue={initialEmail} aria-invalid={invalid || undefined} aria-describedby={invalid ? 'reset-email-error' : undefined} />}</Field>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    {sent ? <Done>Link sent</Done> : <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Sending…' : 'Send reset link'}</button>}
  </AccountForm>;
}

/** Where a link that signed the reader in lands: Welcome, or Log in with the email filled. */
function useSignedInFromLink(from: NonNullable<EntryState['from']>) {
  const { refresh } = useAccountSession(), navigate = useNavigate();
  return async (reply: { signedIn?: boolean; email?: string }, alive: { current: boolean }) => {
    const checked = reply.signedIn ? await refresh(true) : null;
    if (!alive.current) return;
    // The token leaves the address with this page (replace).
    if (checked?.status === 'authenticated') navigate('/app/account/welcome', { replace: true, state: { from } satisfies EntryState });
    else navigate('/app/account/sign-in', { replace: true, state: { email: reply.email } satisfies EntryState });
  };
}

function ExpiredLink({ title, to, email }: { title: string; to: string; email?: string }) {
  return <AccountScreen title={title}>
    <FormAlert>Link expired</FormAlert>
    <Link className="home-button" to={to} replace state={email ? { email } satisfies EntryState : null}>Request a new link</Link>
  </AccountScreen>;
}

/** The reset link: a new password, then signed in (Welcome). */
export function NewPasswordPage() {
  const entryPending = useAccountEntryPending();
  const { prepareSignIn } = useAccountSession();
  const token = useLinkToken();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const signedIn = useSignedInFromLink('reset');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending || !token) return;
    const password = String(new FormData(event.currentTarget).get('password') || '');
    if (!password) { event.currentTarget.querySelector<HTMLInputElement>('input[name="password"]')?.focus(); return; }
    if ([...password].length > PASSWORD_MAX) { setTooLong(true); return; }
    setBusy(true); setTooLong(false); setFailure(null);
    prepareSignIn();
    try {
      const reply = await accountRequest<{ signedIn?: boolean; email?: string }>('/reset-password', { method: 'POST', body: { token, password } });
      await signedIn(reply, alive);
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof AccountApiError ? error.code : '';
      const message = error instanceof Error ? error.message : '';
      if (code === 'INVALID_INPUT' && /password/i.test(message)) setTooLong(true);
      else if (code === 'LINK_EXPIRED' || code === 'INVALID_INPUT') setExpired(true);
      else setFailure(failureOf(error) === 'other' ? 'offline' : failureOf(error));
    } finally { if (alive.current) setBusy(false); }
  };
  if (expired) return <ExpiredLink title="New password" to="/app/account/forgot-password" email={stateEmail(location)} />;
  return <AccountForm title="New password" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} noValidate>
    <Field label="New password" errorId="new-password-error" error={tooLong ? `Too long: ${PASSWORD_MAX} characters or fewer` : undefined}>{id =>
      <PasswordInput id={id} name="password" autoComplete="new-password" required aria-invalid={tooLong || undefined} aria-describedby={tooLong ? 'new-password-error' : undefined} />}</Field>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Saving…' : 'Save password'}</button>
  </AccountForm>;
}

/**
 * The verification link: one tap (a mail scanner opening the page spends
 * nothing), then signed in (Welcome).
 */
export function VerifyEmailPage() {
  const entryPending = useAccountEntryPending();
  const { prepareSignIn } = useAccountSession();
  const token = useLinkToken();
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const signedIn = useSignedInFromLink('verify');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending || !token) return;
    setBusy(true); setFailure(null);
    prepareSignIn();
    try {
      const reply = await accountRequest<{ signedIn?: boolean; email?: string }>('/verify-email', { method: 'POST', body: { token } });
      await signedIn(reply, alive);
    } catch (error) {
      if (!alive.current) return;
      const kind = failureOf(error);
      if (kind === 'other') setExpired(true); else setFailure(kind);
    } finally { if (alive.current) setBusy(false); }
  };
  if (expired) return <ExpiredLink title="Verify email" to="/app/account/sign-in" />;
  return <AccountForm title="Verify email" formRef={form} busy={busy} onSubmit={event => { void submit(event); }}>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Verifying…' : 'Verify email'}</button>
  </AccountForm>;
}

/** The emailed log-in link (B10): one tap logs in on this device. */
export function MagicLinkPage() {
  const entryPending = useAccountEntryPending();
  const { prepareSignIn } = useAccountSession();
  const token = useLinkToken();
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const signedIn = useSignedInFromLink('link');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending || !token) return;
    setBusy(true); setFailure(null);
    prepareSignIn();
    try {
      const reply = await accountRequest<{ email?: string }>('/magic-link/verify', { method: 'POST', body: { token } });
      await signedIn({ ...reply, signedIn: true }, alive);
    } catch (error) {
      if (!alive.current) return;
      const kind = failureOf(error);
      if (kind === 'other') setExpired(true); else setFailure(kind);
    } finally { if (alive.current) setBusy(false); }
  };
  if (expired) return <ExpiredLink title="Log in" to="/app/account/sign-in" />;
  return <AccountForm title="Log in" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} lede="Log in to MyBookshelf on this device.">
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Logging in…' : 'Log in'}</button>
  </AccountForm>;
}

/** Welcome (board): signed in after an emailed link or a new password, with what came over from this device. */
export function WelcomePage() {
  const { session } = useAccountSession();
  const library = useLibrary();
  const location = useLocation();
  const from = (location.state as EntryState | null)?.from;
  if (session.status !== 'authenticated') return <AccountScreen title="Log in to continue">
    <Link className="home-button" to="/app/account/sign-in" replace>Log in</Link>
  </AccountScreen>;
  const merged = library.mergeResult;
  const saved = merged?.savedAdded ?? 0;
  return <AccountScreen title="You’re signed in" className="account-welcome" icon={<WelcomeGlyph />}>
    <p className="account-lede">{from === 'reset' ? 'Your new password is saved and your account is ready.'
      : from === 'link' ? 'You’re logged in on this device.'
        : 'Your email is confirmed and your account is ready.'}</p>
    {merged === undefined ? <p role="status" className="account-fine">Bringing over the books from this device…</p>
      : <div className="account-came" role="status">
        <h2>{saved > 0 ? 'Your reading shelf came with you' : 'Your reading shelf'}</h2>
        <ul>
          {saved > 0 && <li>{saved} saved {saved === 1 ? 'book' : 'books'} from this device {saved === 1 ? 'is' : 'are'} now in your account.</li>}
          {library.library && <li>Your library is {library.library.name}.</li>}
          <li>Books you add on one device appear on the others.</li>
        </ul>
      </div>}
    <div className="account-signed-as"><span>Signed in as</span><strong>{session.user?.email}</strong></div>
    <Link className="home-button" to="/" replace>Go to my reading shelf</Link>
    <Link className="home-text-button account-v2-link" to="/app/settings/account">Account settings</Link>
  </AccountScreen>;
}

function WelcomeGlyph() {
  return <svg aria-hidden="true" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16.5 9.5" /></svg>;
}

/** After Delete: access has ended; the receipt is checked again until cleanup is recorded. */
export function DeletionDonePage() {
  const { receipt, check } = useDeletionReceipt();
  const attempts = useRef({ operationId: '', count: 0 });
  useEffect(() => {
    if (!receipt || receipt.busy || !['pending', 'accepted'].includes(receipt.status)) return;
    if (attempts.current.operationId !== receipt.operationId) attempts.current = { operationId: receipt.operationId, count: 0 };
    if (attempts.current.count >= 12) return;
    const timer = setTimeout(() => { attempts.current.count++; void check(); }, 5000);
    return () => clearTimeout(timer);
  }, [receipt, check]);
  if (receipt?.busy && receipt.status === 'unknown') return <AccountForm title="Deleting…" busy><p role="status" className="visually-hidden">Deleting your account</p></AccountForm>;
  const confirmed = receipt && ['accepted', 'pending', 'cleaned'].includes(receipt.status);
  if (confirmed) return <AccountForm title="Account deleted">
    <p>Access to your account has ended. We’ll email you to confirm.</p>
    {receipt.status === 'pending' && <p role="status">We’re still recording your request for cleanup.</p>}
    {receipt.status === 'accepted' && <p role="status">Your account data is scheduled for cleanup.</p>}
    <Link className="home-button" to="/" replace>Back to my reading shelf</Link>
  </AccountForm>;
  return <AccountForm title="Couldn’t confirm">
    <FormAlert offline={Boolean(receipt)}>{receipt ? 'Deletion not confirmed' : 'Nothing to show here'}</FormAlert>
    {receipt && <button type="button" className="home-button" disabled={receipt.busy} onClick={() => { void check(); }}>{receipt.busy ? 'Checking…' : 'Check again'}</button>}
    <Link className="home-button home-button-outline" to="/" replace>Back to my reading shelf</Link>
  </AccountForm>;
}
