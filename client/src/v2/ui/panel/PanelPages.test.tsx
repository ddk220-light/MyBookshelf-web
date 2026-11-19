import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AnonymousWebApp } from '../../App';
import { parsePolicy, policySections } from './policyText';
import { appVersion, policyEffectiveDate } from './buildInfo';
import { useLibrary } from '../../context';
import { AccountSessionProvider } from '../../auth/AccountSessionProvider';
import { LibraryStateProvider } from '../../context';

// Phase 9: the side panel's pages and the one-shelf account screens, rendered
// through the real app tree with a stubbed network.

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const failure = (status: number, code: string, message = 'Synthetic failure.') => json({ error: { code, message } }, status);
const USER = { id: 'reader-1', name: 'Reader', email: 'reader@example.test', emailVerified: true };
const versions = { settingsRevision: 0, shelfRevision: 0, historyGeneration: 0, historyEnabled: false };
type Handler = (path: string, init: RequestInit | undefined) => Response | Promise<Response> | undefined;
type Call = { path: string; method: string; body: Record<string, unknown> | null };

function network({ signedIn = false, handle }: { signedIn?: boolean; handle?: Handler } = {}) {
  const calls: Call[] = [];
  const fetchStub = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    calls.push({ path, method: init?.method || 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    const custom = await handle?.(path, init);
    if (custom) return custom;
    if (path.endsWith('/api/account/capabilities')) return json({ email: true, google: false, apple: false, canonicalOrigin: window.location.origin });
    if (path.endsWith('/api/account/session')) return json(signedIn ? { status: 'authenticated', user: USER, csrfToken: 'csrf-1' } : { status: 'guest' });
    if (path.endsWith('/api/account/state')) return json({ profile: { ...USER, profileRevision: 0 }, selectedLibraryId: null, selectedLibrary: null, libraryRemoved: false, counts: { saved: 0, recent: 0 }, ...versions });
    if (path.includes('/api/account/books?')) return json({ books: [], nextCursor: null, ...versions });
    if (path.endsWith('/api/account/history')) return json({ books: [], ...versions });
    return failure(404, 'NOT_FOUND');
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}</output>; }
function app(path: string, state?: unknown) {
  return render(<MemoryRouter initialEntries={[{ pathname: path, state }]}><AnonymousWebApp /><Location /></MemoryRouter>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); document.title = ''; });

describe('policy texts', () => {
  it('keep their words, drop only the review note, and fill placeholders only when the build gives a value', () => {
    const text = '> Draft for owner and legal review. Not yet published.\n\n# Privacy\n\nEffective [EFFECTIVE DATE]. Run by someone.\n\n## Contact\n\n**Bold** words and\na wrapped line.\n\n- one\n  continued\n- two\n\n| What | How long |\n|---|---|\n| Account | Until you delete it |\n';
    const kept = policySections(parsePolicy(text, { '[EFFECTIVE DATE]': null }));
    expect(kept.title).toBe('Privacy');
    expect(kept.intro).toEqual([{ type: 'p', text: 'Effective [EFFECTIVE DATE]. Run by someone.' }]);
    expect(kept.sections[0]).toEqual({ heading: 'Contact', blocks: [
      { type: 'p', text: '**Bold** words and a wrapped line.' },
      { type: 'ul', items: ['one continued', 'two'] },
      { type: 'table', head: ['What', 'How long'], rows: [['Account', 'Until you delete it']] },
    ] });
    expect(JSON.stringify(kept)).not.toContain('Draft');
    expect(policySections(parsePolicy(text, { '[EFFECTIVE DATE]': '1 January 2027' })).intro[0]).toEqual({ type: 'p', text: 'Effective 1 January 2027. Run by someone.' });
  });

  it('build values are checked before use', () => {
    expect(appVersion({})).toBeNull();
    expect(appVersion({ VITE_APP_VERSION: 'abc1234' })).toBe('abc1234');
    expect(appVersion({ VITE_APP_VERSION: 'not a version!' })).toBeNull();
    expect(policyEffectiveDate({ VITE_POLICY_EFFECTIVE_DATE: ' 1 January 2027 ' })).toBe('1 January 2027');
    expect(policyEffectiveDate({ VITE_POLICY_EFFECTIVE_DATE: '<b>' })).toBeNull();
  });

  it('Privacy, Terms and About render the approved texts with visible placeholders', async () => {
    network();
    const view = app('/app/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What we collect and why' })).toBeInTheDocument();
    expect(screen.getByText(/Effective \[EFFECTIVE DATE\]\./)).toBeInTheDocument();
    expect(screen.getByText(/each book you open is added to your/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Draft for owner');
    expect(screen.getAllByRole('link', { name: 'deepakdhanavel@gmail.com' })[0]).toHaveAttribute('href', 'mailto:deepakdhanavel@gmail.com');
    expect(screen.getByRole('link', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /My shelf/ })).toBeNull();
    // The title is set in an effect, which can run after the heading appears.
    await waitFor(() => expect(document.title).toBe('Privacy — MyBookshelf'));
    view.unmount();
    app('/app/terms');
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms' })).toBeInTheDocument();
    expect(screen.getByText("You must be 18 or older, or have a parent's or guardian's permission.")).toBeInTheDocument();
    cleanup();
    app('/app/about');
    expect(await screen.findByRole('heading', { level: 1, name: 'MyBookshelf' })).toBeInTheDocument();
    expect(screen.getByText(/MyBookshelf helps you find a book/)).toBeInTheDocument();
    const facts = document.querySelector<HTMLElement>('.about-facts')!;
    expect(within(facts).getByText('Version').nextElementSibling).toHaveTextContent('[VERSION]');
    expect(within(facts).getByRole('link', { name: 'deepakdhanavel@gmail.com' })).toBeInTheDocument();
  });
});

describe('side panel', () => {
  it('signed out: Create account, Log in, and rows to the new pages', async () => {
    network();
    app('/app/shelf', { overlay: 'panel' });
    const panel = await screen.findByRole('dialog', { name: 'Account and settings' });
    expect(within(panel).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/app/account/sign-up');
    expect(within(panel).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/app/account/sign-in');
    expect(within(panel).getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', '/app/report');
    expect(within(panel).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/app/privacy');
    expect(within(panel).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/app/about');
  });

  it('signed in: the email, Log out and Account settings', async () => {
    network({ signedIn: true });
    app('/app/shelf', { overlay: 'panel' });
    const panel = await screen.findByRole('dialog', { name: 'Account and settings' });
    expect(await within(panel).findByText(USER.email)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Account settings' })).toHaveAttribute('href', '/app/settings/account');
    expect(within(panel).queryByRole('link', { name: 'Create account' })).toBeNull();
  });
});

describe('Report a problem', () => {
  it('says what is sent with the words, sends them with the screen and library only, then shows Sent', async () => {
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: 'bc:sfpl', savedBooks: [], recentBooks: [], savedContent: [] }));
    const sfpl = { id: 'bc:sfpl', name: 'San Francisco Public Library', city: 'San Francisco', region: 'California', country: 'US', health: 'operational',
      capabilities: { catalogLookup: true, publicAvailability: true, copyCounts: false, locationAvailability: false, callNumber: false, catalogLink: true } };
    const calls = network({ handle: path => path.endsWith('/api/v2/problem-reports') ? json({}, 202) : path.endsWith('/api/v2/libraries/resolve') ? json({ library: sfpl })
      : path.includes('/api/v2/') ? json({ libraries: [], library: null }) : undefined });
    app('/app/report', { reportScreen: 'search' });
    const box = await screen.findByRole('textbox', { name: 'What happened?' });
    await waitFor(() => expect(document.querySelector('.report-context')).toHaveTextContent('your library (San Francisco Public Library)'));
    expect(box).toHaveAttribute('placeholder', 'For example: the app says Wings of Fire is not in my library, but the library has it.');
    expect(screen.getByText(/^Tell us what went wrong:/)).toBeInTheDocument();
    expect(document.querySelector('.report-context')).toHaveTextContent('Sent with your message: the screen you were on (Search results) and your library (San Francisco Public Library).');
    expect(screen.getByText(/Please leave out passwords and library card numbers\./)).toBeInTheDocument();
    expect(screen.getByText(/We delete them after 90 days\./)).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '  The cover is wrong\non this book  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('button', { name: 'Sent' })).toHaveAttribute('aria-disabled', 'true');
    const report = calls.find(call => call.path.endsWith('/problem-reports'))!;
    expect(report.body).toEqual({ text: 'The cover is wrong\non this book', screen: 'search', libraryId: 'bc:sfpl' });
  });

  it('names the book shown and sends the optional name and email; a bad email sends nothing', async () => {
    const book = { bookKey: 'v1:isbn:9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z' };
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: null, savedBooks: [], recentBooks: [book], savedContent: [] }));
    const calls = network({ handle: path => path.endsWith('/api/v2/problem-reports') ? json({}, 202) : undefined });
    app('/app/report', { reportScreen: 'book', reportBookKey: book.bookKey });
    const box = await screen.findByRole('textbox', { name: 'What happened?' });
    expect(document.querySelector('.report-context')).toHaveTextContent('Sent with your message: the screen you were on (Book page) and the book (Wings of Fire).');
    fireEvent.change(box, { target: { value: 'Wrong answer' } });
    fireEvent.change(screen.getByLabelText('Your name (optional)'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Your email (optional)'), { target: { value: 'asha@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Check the email address, or leave it empty.')).toBeInTheDocument();
    expect(calls.some(call => call.path.endsWith('/problem-reports'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Your email (optional)'), { target: { value: 'asha@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('button', { name: 'Sent' })).toBeInTheDocument();
    expect(calls.find(call => call.path.endsWith('/problem-reports'))!.body)
      .toEqual({ text: 'Wrong answer', screen: 'book', bookKey: book.bookKey, name: 'Asha', email: 'asha@example.org' });
    // The details stay in the page: nothing in browser storage.
    let stored = '';
    for (const store of [localStorage, sessionStorage]) for (let index = 0; index < store.length; index += 1) stored += store.getItem(store.key(index)!);
    expect(stored).not.toMatch(/asha@example|Wrong answer/);
  });

  it('shows one line for each failure and Try again when offline', async () => {
    let attempt = 0;
    network({ handle: path => {
      if (!path.endsWith('/problem-reports')) return undefined;
      attempt++;
      if (attempt === 1) throw new TypeError('offline');
      return failure(429, 'RATE_LIMITED');
    } });
    app('/app/report');
    fireEvent.change(await screen.findByRole('textbox', { name: 'What happened?' }), { target: { value: 'Broken' } });
    expect(document.querySelector('.report-context')).toHaveTextContent('Sent with your message: the screen you were on (Settings).');
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Couldn’t connect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Too many reports. Try later')).toBeInTheDocument();
  });
});

describe('account screens', () => {
  it('Create account: a welcome, no password rules, an eye on the password, and what happens next', async () => {
    let release: () => void = () => {};
    const calls = network({ handle: path => path.endsWith('/api/account/sign-up') ? new Promise<Response>(resolve => { release = () => resolve(json({ status: 'check-email' }, 202)); }) : undefined });
    app('/app/account/sign-up');
    expect(await screen.findByRole('heading', { name: 'Welcome to MyBookshelf' })).toBeInTheDocument();
    expect(screen.getByText('Create a free account to keep the same reading shelf on every device. The books already on this device come with you.')).toBeInTheDocument();
    const email = screen.getByLabelText('Email');
    expect(screen.queryByLabelText('Your name')).toBeNull();
    const next = screen.getByRole('heading', { name: 'What happens next' }).parentElement!;
    expect(within(next).getAllByRole('listitem').map(item => item.textContent)).toEqual(['We send a link to your email.', 'Open the link and you are signed in.', 'Your reading shelf appears on any device where you log in.']);
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/app/privacy');
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/app/account/sign-in');
    const password = screen.getByLabelText('Password');
    // No helper text: the field describes nothing until there is an error.
    expect(password).not.toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled());
    fireEvent.change(email, { target: { value: 'reader@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(calls.some(call => call.path.endsWith('/sign-up'))).toBe(false);
    expect(password).toHaveFocus();
    fireEvent.change(password, { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('button', { name: 'Creating your account…' })).toBeDisabled();
    release();
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(calls.find(call => call.path.endsWith('/sign-up'))!.body).toEqual({ name: 'Reader', email: 'reader@example.test', password: 'a' });
  });

  it('Create account: only the maximum length is a rule', async () => {
    const calls = network();
    app('/app/account/sign-up');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'reader@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x'.repeat(129) } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Too long: 128 characters or fewer')).toBeInTheDocument();
    expect(calls.some(call => call.path.endsWith('/sign-up'))).toBe(false);
  });

  it('Log in with password: wrong email or password, then couldn’t connect with Try again; Forgot your password? keeps the email', async () => {
    let attempt = 0;
    const calls = network({ handle: path => {
      if (!path.endsWith('/api/account/sign-in')) return undefined;
      attempt++;
      if (attempt === 1) return failure(401, 'INVALID_CREDENTIALS', 'Check your email and password.');
      if (attempt === 2) throw new TypeError('offline');
      return failure(429, 'RATE_LIMITED');
    } });
    app('/app/account/sign-in');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'w' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in with password' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Log in with password' }));
    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/app/account/forgot-password');
    fireEvent.click(screen.getByRole('button', { name: 'Log in with password' }));
    expect(await screen.findByText('Couldn’t connect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Too many tries. Try later')).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/sign-in'))).toHaveLength(3);
    expect(calls.find(call => call.path.endsWith('/sign-in'))!.body).toMatchObject({ email: 'reader@example.test', password: 'w' });
    fireEvent.click(screen.getByRole('link', { name: 'Forgot your password?' }));
    expect(await screen.findByLabelText('Email')).toHaveValue('reader@example.test');
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/account\/forgot-password$/);
  });

  it('Forgot password: Send reset link turns into Link sent', async () => {
    const calls = network({ handle: path => path.endsWith('/forgot-password') ? json({ status: 'check-email' }, 202) : undefined });
    app('/app/account/forgot-password');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'reader@example.test' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('button', { name: 'Link sent' })).toHaveAttribute('aria-disabled', 'true');
    expect(calls.find(call => call.path.endsWith('/forgot-password'))!.body).toEqual({ email: 'reader@example.test' });
  });

  it('Your account: email, password, the size of the shelf, Log out and Delete my account…; no download and no devices', async () => {
    const calls = network({ signedIn: true, handle: path => {
      if (path.endsWith('/api/account/profile')) return json({ pendingEmail: null, methods: [{ provider: 'password', usable: true }] });
      if (path.includes('/api/account/books?')) return json({ books: [{ referenceId: '00000000-0000-4000-8000-000000000001', bookKey: 'v1:isbn:9780262033848', title: 'Saved', authors: [], savedAt: '2026-11-01T00:00:00.000Z' }], nextCursor: null, ...versions });
      if (path.endsWith('/sign-out')) return json({ status: 'signed-out' });
      return undefined;
    } });
    app('/app/settings/account');
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change email' })).toHaveAttribute('href', '/app/settings/account/email');
    expect(await screen.findByText('Set')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/app/settings/account/password');
    expect(await screen.findByText('1 saved book · 0 viewed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Delete my account…' })).toHaveAttribute('href', '/app/settings/account/delete');
    expect(screen.queryByRole('button', { name: /Download|Sign out all|devices/i })).toBeNull();
    expect(screen.queryByText(/signed-in devices/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/sign-out'))).toBe(true));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/));
  });

  it('old account addresses lead to the new screens', async () => {
    network({ signedIn: true, handle: path => path.endsWith('/api/account/profile') ? json({ methods: [{ provider: 'password', usable: true }] }) : undefined });
    app('/app/settings/account/more');
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/settings\/account$/);
    cleanup();
    app('/app/account/import');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/shelf$/));
  });

  it('Change password within 10 minutes of signing in asks only for the new password', async () => {
    const calls = network({ signedIn: true, handle: path => {
      if (path.endsWith('/api/account/session')) return json({ status: 'authenticated', user: USER, csrfToken: 'csrf-1', signedInAt: new Date(Date.now() - 60_000).toISOString() });
      if (path.endsWith('/reauth/recent')) return json({ status: 'confirmed', proof: 'proof-1', action: 'password-change', csrfToken: 'csrf-1' });
      if (path.endsWith('/api/account/password')) return json({ status: 'password-updated' });
      if (path.endsWith('/api/account/profile')) return json({ methods: [{ provider: 'password', usable: true }] });
      return undefined;
    } });
    app('/app/settings/account/password');
    expect(await screen.findByRole('heading', { name: 'Change your password' })).toBeInTheDocument();
    expect(screen.getByText('Other devices where you are logged in will be logged out.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).toBeNull();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('Password changed. Other devices were logged out.')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/settings\/account$/);
    expect(calls.find(call => call.path.endsWith('/reauth/recent'))!.body).toEqual({ action: 'password-change' });
    expect(calls.find(call => call.path.endsWith('/api/account/password'))!.body).toEqual({ password: 'b', proof: 'proof-1' });
    expect(calls.some(call => call.path.endsWith('/reauth/password'))).toBe(false);
  });

  it('Change password later asks for the current password ("Confirm it’s you")', async () => {
    let tries = 0;
    const calls = network({ signedIn: true, handle: path => {
      if (path.endsWith('/reauth/password')) return ++tries === 1 ? failure(401, 'INVALID_CREDENTIALS') : json({ status: 'confirmed', proof: 'proof-2', action: 'password-change', csrfToken: 'csrf-2' });
      if (path.endsWith('/api/account/password')) return json({ status: 'password-updated' });
      if (path.endsWith('/api/account/profile')) return json({ methods: [{ provider: 'password', usable: true }] });
      return undefined;
    } });
    app('/app/settings/account/password');
    const current = await screen.findByLabelText('Current password');
    fireEvent.change(current, { target: { value: 'not it' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('Wrong password')).toBeInTheDocument();
    fireEvent.change(current, { target: { value: 'the old one' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('Password changed. Other devices were logged out.')).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/reauth/password')).map(call => call.body)).toEqual([
      { password: 'not it', action: 'password-change' }, { password: 'the old one', action: 'password-change' }]);
    expect(calls.find(call => call.path.endsWith('/api/account/password'))!.body).toEqual({ password: 'new one', proof: 'proof-2' });
    expect(calls.some(call => call.path.endsWith('/reauth/recent'))).toBe(false);
  });

  it('Change email sends a link to the new address and keeps the current one until it is opened', async () => {
    const calls = network({ signedIn: true, handle: path => {
      if (path.endsWith('/api/account/session')) return json({ status: 'authenticated', user: USER, csrfToken: 'csrf-1', signedInAt: new Date().toISOString() });
      if (path.endsWith('/reauth/recent')) return json({ status: 'confirmed', proof: 'proof-1', action: 'email-change', csrfToken: 'csrf-1' });
      if (path.endsWith('/api/account/email-change')) return json({ status: 'check-email' }, 202);
      return undefined;
    } });
    app('/app/settings/account/email');
    const field = await screen.findByLabelText('New email');
    fireEvent.change(field, { target: { value: USER.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the link' }));
    expect(await screen.findByText('That is already your email')).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'new@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the link' }));
    expect(await screen.findByRole('heading', { name: 'Check your new email' })).toBeInTheDocument();
    expect(calls.find(call => call.path.endsWith('/api/account/email-change'))!.body).toEqual({ newEmail: 'new@example.test', proof: 'proof-1' });
  });

  it('Delete my account: what goes and what stays, always the password, then deleted and the browser copy cleared', async () => {
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: 'bc:smcl', recentBooks: [{ bookKey: 'v1:isbn:9780131103627', title: 'Viewed', authors: [], source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z' }],
      savedBooks: [{ bookKey: 'v1:isbn:9780262033848', title: 'Kept here', authors: [], source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z' }], savedContent: [] }));
    localStorage.setItem('mybookshelf.merged.v1', JSON.stringify({ version: 1, saved: ['v1:isbn:9780262033848'], viewed: ['v1:isbn:9780131103627'], libraries: ['bc:smcl'] }));
    localStorage.setItem('mybookshelf.reader-preferences.v1', JSON.stringify({ version: 1, shelfView: 'list', shelfSort: 'recent', selectedLibrary: { id: 'bc:smcl', name: 'San Mateo' } }));
    const calls = network({ signedIn: true, handle: path => {
      if (path.endsWith('/api/account/session')) return json({ status: 'authenticated', user: USER, csrfToken: 'csrf-1', signedInAt: new Date().toISOString() });
      if (path.endsWith('/reauth/password')) return json({ proof: 'proof-1', csrfToken: 'csrf-2' });
      // Answered at once: access can end before the move to the receipt page
      // has rendered, and the page must still be the receipt, not the shelf.
      if (path.endsWith('/api/account/deletion')) return json({ status: 'accepted', accessEnded: true });
      if (path.endsWith('/imports')) return json({ status: 'imported', savedAdded: 1, historyAccepted: 1, historyExpired: 0, ...versions });
      return undefined;
    } });
    app('/app/settings/account/delete');
    expect(await screen.findByRole('heading', { name: 'Delete your account' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone. Please read what happens first.')).toBeInTheDocument();
    const gone = screen.getByRole('region', { name: 'Deleted straight away' });
    expect(within(gone).getByText('The copy of your reading shelf kept in this browser')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'What stays for a short time' })).getByText('Backup copies, which expire within 30 days.')).toBeInTheDocument();
    expect(screen.getByText('We will send one email to confirm the account was deleted.')).toBeInTheDocument();
    expect(screen.queryByText(/download/i)).toBeNull();
    expect(screen.getByRole('link', { name: 'Keep my account' })).toHaveAttribute('href', '/app/settings/account');
    // Even right after signing in, deleting asks for the password.
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('Type your password')).toBeInTheDocument();
    expect(calls.some(call => call.path.endsWith('/reauth/password') || call.path.endsWith('/reauth/recent'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Type your password to confirm'), { target: { value: 'my account password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/api/account/deletion'))).toBe(true));
    expect(await screen.findByRole('heading', { name: 'Account deleted' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/account/deletion');
    expect(calls.find(call => call.path.endsWith('/reauth/password'))!.body).toEqual({ password: 'my account password', action: 'delete' });
    expect(calls.find(call => call.path.endsWith('/api/account/deletion'))!.body).toMatchObject({ proof: 'proof-1', confirmation: 'delete-account' });
    const left = JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')!);
    expect(left).toMatchObject({ selectedLibraryId: null, savedBooks: [], recentBooks: [] });
    expect(localStorage.getItem('mybookshelf.merged.v1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('mybookshelf.reader-preferences.v1')!)).toEqual({ version: 1, shelfView: 'list', shelfSort: 'recent' });
  });

  it('Delete with a wrong password shows one line and stays', async () => {
    network({ signedIn: true, handle: path => path.endsWith('/reauth/password') ? failure(401, 'INVALID_CREDENTIALS') : undefined });
    app('/app/settings/account/delete');
    fireEvent.change(await screen.findByLabelText('Type your password to confirm'), { target: { value: 'not it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('Wrong password')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/settings/account/delete');
  });
});

function Probe() {
  const library = useLibrary();
  return <>
    <output data-testid="loading">{String(Boolean(library.loadingAccount))}</output>
    <output data-testid="recent">{library.state.recentBooks.map(book => book.bookKey).join(',')}</output>
    <output data-testid="restore">{String(Boolean(library.restoreRecentBooks))}</output>
    <button onClick={async () => { document.title = await library.saveBook({ bookKey: 'v1:googlebooks:other', isbn13: '9780262033848', title: 'Same ISBN', authors: [] } as never); }}>Save</button>
    <button onClick={() => { void library.rememberBook({ bookKey: 'v1:googlebooks:seen', title: 'Seen', authors: [] } as never, 'search'); }}>Open</button>
    <button onClick={() => { void library.restoreRecentBooks?.([{ bookKey: 'v1:googlebooks:seen', title: 'Seen', authors: [], source: 'search', viewedAt: '2026-11-01T00:00:00.000Z' }]); }}>Undo</button>
    <span>{library.mutationNotice}</span>
  </>;
}

describe('account shelf', () => {
  const saved = { referenceId: '00000000-0000-4000-8000-000000000001', bookKey: 'v1:isbn:9780262033848', isbn13: '9780262033848', title: 'Saved', authors: [], savedAt: '2026-11-01T00:00:00.000Z' };
  const signedIn = (handle?: Handler) => network({ signedIn: true, handle: (path, init) => {
    if (path.includes('/api/account/books?')) return json({ books: [saved], nextCursor: null, ...versions });
    return handle?.(path, init);
  } });

  it('an ISBN already saved counts as saved; a book open is recorded quietly with history off; Undo restores through the import', async () => {
    const calls = signedIn(path => path.endsWith('/history/views') ? json({ status: 'recorded', ...versions })
      : path.endsWith('/imports') ? json({ status: 'imported', savedAdded: 0, historyAccepted: 1, historyExpired: 0, ...versions }) : undefined);
    render(<MemoryRouter><AccountSessionProvider><LibraryStateProvider><Probe /></LibraryStateProvider></AccountSessionProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('restore')).toHaveTextContent('true');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.title).toBe('already-saved'));
    expect(calls.some(call => call.method === 'PUT' && call.path.endsWith('/api/account/books'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/history/views'))).toBe(true));
    expect(calls.find(call => call.path.endsWith('/history/views'))!.body).toMatchObject({ source: 'search', historyGeneration: 0 });
    await waitFor(() => expect(calls.filter(call => call.path.endsWith('/api/account/history')).length).toBeGreaterThan(1));
    expect(screen.queryByText(/Updating recently viewed|Saved$/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/imports'))).toBe(true));
    const restore = calls.find(call => call.path.endsWith('/imports'))!.body!;
    expect(restore).toMatchObject({ includeHistory: true, libraryPolicy: 'keep-account', snapshot: { version: 1, selectedLibraryId: null, savedBooks: [] } });
    expect((restore.snapshot as { recentBooks: Array<{ viewedAt: string }> }).recentBooks[0].viewedAt).toBe('2026-11-01T00:00:00.000Z');
  });

});
