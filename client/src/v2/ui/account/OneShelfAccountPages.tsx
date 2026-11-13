import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAccountSession } from '../../auth/AccountSessionProvider';
import { AccountApiError, accountRequest, safeAccountReturn } from '../../auth/accountClient';
import { useAccountEntryPending } from '../../auth/entryReadiness';
import { useLinkToken } from '../../auth/LinkTokenProvider';
import { useDeletionReceipt } from '../../auth/DeletionReceiptProvider';
import { TickGlyph } from '../home/homeIcons';
import { FormAlert } from '../panel/PanelPage';
import { AccountForm, afterProviderSignIn } from './AccountPages';

// The account forms (AccountStates board, plan Phase 9).
// Same endpoints and the same sign-in, import and deletion flows as the forms
// in AccountPages.tsx; only the screens change: fewer fields, no explanatory
// sentences, and each error as one short line with an icon.

/** Password length rule of the account service (server accounts/validation.js). */
export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;
/**
 * The account service still requires a private name at sign-up (PRD AC-02);
 * the one-shelf form does not ask for one (plan 4.7: accounts hold the email,
 * password, shelf, library and Viewed before), so it sends this fixed word.
 */
export const ACCOUNT_NAME_PLACEHOLDER = 'Reader';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How a failed account request reads to the reader. */
type Failure = 'offline' | 'limited' | 'unavailable' | 'other';
function failureOf(error: unknown): Failure {
  if (!(error instanceof AccountApiError)) return 'other';
  if (error.status === 429 || error.code === 'RATE_LIMITED') return 'limited';
  if (error.code === 'NETWORK_ERROR' || error.code === 'INVALID_RESPONSE' || error.status >= 500 || error.status === 0) return 'offline';
  if (error.code === 'ACCOUNT_UNAVAILABLE') return 'unavailable';
  return 'other';
}

function Field({ label, error, errorId, children }: { label: string; error?: ReactNode; errorId?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="account-v2-field">
    <label htmlFor={id}>{label}</label>
    {children(id)}
    {error && <FormAlert id={errorId}>{error}</FormAlert>}
  </div>;
}

function Done({ children }: { children: ReactNode }) {
  return <button type="button" className="home-button sent-button" aria-disabled="true" aria-live="polite"><span className="tick-pop"><TickGlyph /></span>{children}</button>;
}

function useAlive() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}

function failureAlert(failure: Failure | null, retry: () => void) {
  if (failure === 'offline') return <FormAlert offline action={<button type="button" className="home-text-button" onClick={retry}>Try again</button>}>Couldn’t connect</FormAlert>;
  if (failure === 'limited') return <FormAlert>Too many tries. Try later</FormAlert>;
  if (failure === 'unavailable') return <FormAlert>This account is unavailable</FormAlert>;
  return null;
}

type LogInError = 'credentials' | 'verify' | Failure | null;

/** Log in: email, password, Log in, Forgot password? */
export function LogInPage() {
  const entryPending = useAccountEntryPending();
  const { refresh, prepareSignIn } = useAccountSession();
  const navigate = useNavigate(), location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LogInError>(null);
  const [verifySent, setVerifySent] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const typedEmail = useRef('');
  const alive = useAlive();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim(), password = String(data.get('password') || '');
    if (!email || !password) { setError('credentials'); return; }
    typedEmail.current = email;
    setBusy(true); setError(null); setVerifySent(false);
    prepareSignIn();
    try {
      const result = await accountRequest<{ returnTo?: string }>('/sign-in', { method: 'POST',
        body: { email, password, returnTo: safeAccountReturn(new URLSearchParams(location.search).get('returnTo')) } });
      if (!alive.current) return;
      const checked = await refresh(true);
      if (!alive.current) return;
      if (checked.status !== 'authenticated') throw new AccountApiError('NETWORK_ERROR', 'Couldn’t connect.');
      navigate(afterProviderSignIn(safeAccountReturn(result.returnTo || null)), { replace: true, state: null });
    } catch (failure) {
      if (!alive.current) return;
      const code = failure instanceof AccountApiError ? failure.code : '';
      setError(code === 'INVALID_CREDENTIALS' ? 'credentials' : code === 'VERIFY_EMAIL_REQUIRED' ? 'verify' : failureOf(failure));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const resend = async () => {
    if (!typedEmail.current) return;
    try {
      await accountRequest('/resend-verification', { method: 'POST', body: { email: typedEmail.current } });
      if (alive.current) setVerifySent(true);
    } catch (failure) { if (alive.current) setError(failureOf(failure)); }
  };
  const wrong = error === 'credentials';
  return <AccountForm title="Log in" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} noValidate>
    <Field label="Email">{id => <input id={id} name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={wrong || undefined} aria-describedby={wrong ? 'login-error' : undefined} />}</Field>
    <Field label="Password">{id => <input id={id} name="password" type="password" autoComplete="current-password" required aria-invalid={wrong || undefined} aria-describedby={wrong ? 'login-error' : undefined} />}</Field>
    {wrong && <FormAlert id="login-error">Wrong email or password</FormAlert>}
    {error === 'verify' && (verifySent ? <FormAlert action={<span className="form-alert-done"><TickGlyph size={18} />Link sent</span>}>Email not verified</FormAlert>
      : <FormAlert action={<button type="button" className="home-text-button" onClick={() => { void resend(); }}>Send link</button>}>Email not verified</FormAlert>)}
    {failureAlert(error === 'credentials' || error === 'verify' ? null : error, () => form.current?.requestSubmit())}
    {error === 'other' && <FormAlert>Couldn’t log in</FormAlert>}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Logging in…' : 'Log in'}</button>
    {error !== 'offline' && <Link className="home-text-button account-v2-link" to="/app/account/forgot-password">Forgot password?</Link>}
  </AccountForm>;
}

type CreateErrors = { email?: 'invalid' | 'used'; password?: 'short' | 'long' | 'leaked' };

/** Create account: email, password, Create account, and the one Terms line. */
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
    if ([...password].length < PASSWORD_MIN) next.password = 'short';
    else if ([...password].length > PASSWORD_MAX) next.password = 'long';
    setFields(next); setFailure(null);
    if (next.email || next.password) {
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
      else if (error instanceof AccountApiError && error.code === 'INVALID_INPUT' && /breach/i.test(error.message)) setFields({ password: 'leaked' });
      else if (error instanceof AccountApiError && error.code === 'INVALID_INPUT' && /password/i.test(error.message)) setFields({ password: 'short' });
      else if (error instanceof AccountApiError && error.code === 'INVALID_INPUT') setFields({ email: 'invalid' });
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
  if (sentTo) return <AccountForm title="Check your email">
    <p className="account-v2-email"><strong>{sentTo}</strong></p>
    {failureAlert(failure, () => { setFailure(null); void resend(); })}
    {resent ? <Done>Link sent</Done> : <button type="button" className="home-button home-button-outline" onClick={() => { void resend(); }}>Send again</button>}
    <Link className="home-text-button account-v2-link" to="/app/account/sign-in">Log in</Link>
  </AccountForm>;
  const emailError = fields.email === 'invalid' ? 'Check the email' : fields.email === 'used' ? 'Email already used' : undefined;
  const passwordError = fields.password === 'short' ? `Too short: ${PASSWORD_MIN} characters or more` : fields.password === 'long' ? `Too long: ${PASSWORD_MAX} characters or fewer`
    : fields.password === 'leaked' ? 'Found in a data leak. Choose another' : undefined;
  return <AccountForm title="Create account" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} noValidate>
    <div className="account-v2-field">
      <label htmlFor="signup-email">Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(emailError) || undefined} aria-describedby={emailError ? 'signup-email-error' : undefined}
        onChange={() => { if (fields.email) setFields({ ...fields, email: undefined }); }} />
      {emailError && <FormAlert id="signup-email-error" action={fields.email === 'used' ? <Link className="home-text-button" to="/app/account/sign-in">Log in</Link> : undefined}>{emailError}</FormAlert>}
    </div>
    <div className="account-v2-field">
      <label htmlFor="signup-password">Password</label>
      <input id="signup-password" name="password" type="password" autoComplete="new-password" required aria-invalid={Boolean(passwordError) || undefined} aria-describedby={passwordError ? 'signup-password-error' : undefined}
        onChange={() => { if (fields.password) setFields({ ...fields, password: undefined }); }} />
      {passwordError && <FormAlert id="signup-password-error">{passwordError}</FormAlert>}
    </div>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Creating account…' : 'Create account'}</button>
    <p className="account-terms">By creating an account you agree to the <Link to="/app/terms">Terms</Link> and <Link to="/app/privacy">Privacy</Link></p>
  </AccountForm>;
}

/** Forgot password: email, Send reset link → Link sent. */
export function ResetRequestPage() {
  const entryPending = useAccountEntryPending();
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
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
      <input id={id} name="email" type="email" autoComplete="email" maxLength={254} required readOnly={sent} aria-invalid={invalid || undefined} aria-describedby={invalid ? 'reset-email-error' : undefined} />}</Field>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    {sent ? <Done>Link sent</Done> : <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Sending…' : 'Send reset link'}</button>}
  </AccountForm>;
}

/** The reset link: a new password, then Log in. */
export function NewPasswordPage() {
  const entryPending = useAccountEntryPending();
  const token = useLinkToken();
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [length, setLength] = useState<'short' | 'long' | 'leaked' | null>(null);
  const [expired, setExpired] = useState(!token);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending || !token) return;
    const password = String(new FormData(event.currentTarget).get('password') || '');
    const size = [...password].length;
    if (size < PASSWORD_MIN || size > PASSWORD_MAX) { setLength(size < PASSWORD_MIN ? 'short' : 'long'); return; }
    setBusy(true); setLength(null); setFailure(null);
    try {
      await accountRequest('/reset-password', { method: 'POST', body: { token, password } });
      if (alive.current) setDone(true);
    } catch (error) {
      if (!alive.current) return;
      const code = error instanceof AccountApiError ? error.code : '';
      const message = error instanceof Error ? error.message : '';
      if (code === 'INVALID_INPUT' && /breach/i.test(message)) setLength('leaked');
      else if (code === 'INVALID_INPUT' && /password/i.test(message)) setLength('short');
      else if (code === 'LINK_EXPIRED' || code === 'INVALID_INPUT') setExpired(true);
      else setFailure(failureOf(error) === 'other' ? 'offline' : failureOf(error));
    } finally { if (alive.current) setBusy(false); }
  };
  if (done) return <AccountForm title="Password saved">
    <Link className="home-button" to="/app/account/sign-in" replace>Log in</Link>
  </AccountForm>;
  if (expired) return <AccountForm title="New password">
    <FormAlert>Link expired</FormAlert>
    <Link className="home-button" to="/app/account/forgot-password" replace>Send a new link</Link>
  </AccountForm>;
  return <AccountForm title="New password" formRef={form} busy={busy} onSubmit={event => { void submit(event); }} noValidate>
    <Field label="New password" errorId="new-password-error" error={length === 'short' ? `Too short: ${PASSWORD_MIN} characters or more` : length === 'long' ? `Too long: ${PASSWORD_MAX} characters or fewer` : length === 'leaked' ? 'Found in a data leak. Choose another' : undefined}>{id =>
      <input id={id} name="password" type="password" autoComplete="new-password" required aria-invalid={Boolean(length) || undefined} aria-describedby={length ? 'new-password-error' : undefined} />}</Field>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Saving…' : 'Save password'}</button>
  </AccountForm>;
}

/** The verification link: one button, then Log in. */
export function VerifyEmailPage() {
  const entryPending = useAccountEntryPending();
  const token = useLinkToken();
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [expired, setExpired] = useState(!token);
  const [failure, setFailure] = useState<Failure | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const alive = useAlive();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || entryPending || !token) return;
    setBusy(true); setFailure(null);
    try {
      await accountRequest('/verify-email', { method: 'POST', body: { token } });
      if (alive.current) setDone(true);
    } catch (error) {
      if (!alive.current) return;
      const kind = failureOf(error);
      if (kind === 'other') setExpired(true); else setFailure(kind);
    } finally { if (alive.current) setBusy(false); }
  };
  if (done) return <AccountForm title="Email verified"><Link className="home-button" to="/app/account/sign-in" replace>Log in</Link></AccountForm>;
  if (expired) return <AccountForm title="Verify email">
    <FormAlert>Link expired</FormAlert>
    <Link className="home-button home-button-outline" to="/app/account/sign-in" replace>Log in</Link>
  </AccountForm>;
  return <AccountForm title="Verify email" formRef={form} busy={busy} onSubmit={event => { void submit(event); }}>
    {failureAlert(failure, () => form.current?.requestSubmit())}
    <button type="submit" className="home-button" disabled={busy || entryPending}>{busy ? 'Verifying…' : 'Verify email'}</button>
  </AccountForm>;
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
    <Link className="home-button" to="/app/shelf" replace>Back to my shelf</Link>
  </AccountForm>;
  return <AccountForm title="Couldn’t confirm">
    <FormAlert offline={Boolean(receipt)}>{receipt ? 'Deletion not confirmed' : 'Nothing to show here'}</FormAlert>
    {receipt && <button type="button" className="home-button" disabled={receipt.busy} onClick={() => { void check(); }}>{receipt.busy ? 'Checking…' : 'Check again'}</button>}
    <Link className="home-button home-button-outline" to="/app/shelf" replace>Back to my shelf</Link>
  </AccountForm>;
}
