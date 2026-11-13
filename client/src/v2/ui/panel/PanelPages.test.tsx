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
  it('sends the words with the screen and library only, then shows Sent', async () => {
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: 'bc:sfpl', savedBooks: [], recentBooks: [], savedContent: [] }));
    const calls = network({ handle: path => path.endsWith('/api/v2/problem-reports') ? json({}, 202) : path.includes('/api/v2/') ? json({ libraries: [], library: null }) : undefined });
    app('/app/report', { reportScreen: 'search' });
    const box = await screen.findByRole('textbox', { name: 'Report a problem' });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '  The cover is wrong\non this book  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('button', { name: 'Sent' })).toHaveAttribute('aria-disabled', 'true');
    const report = calls.find(call => call.path.endsWith('/problem-reports'))!;
    expect(report.body).toEqual({ text: 'The cover is wrong\non this book', screen: 'search', libraryId: 'bc:sfpl' });
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
    fireEvent.change(await screen.findByRole('textbox', { name: 'Report a problem' }), { target: { value: 'Broken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Couldn’t connect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Too many reports. Try later')).toBeInTheDocument();
  });
});

describe('account screens', () => {
  it('Create account: too short password, the Terms line, and no name field', async () => {
    const calls = network({ handle: path => path.endsWith('/api/account/sign-up') ? json({ status: 'check-email' }, 202) : undefined });
    app('/app/account/sign-up');
    const email = await screen.findByLabelText('Email');
    expect(screen.queryByLabelText('Your name')).toBeNull();
    const terms = screen.getByText((_, node) => node?.textContent === 'By creating an account you agree to the Terms and Privacy' && node.tagName === 'P');
    expect(within(terms).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/app/terms');
    expect(within(terms).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/app/privacy');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled());
    fireEvent.change(email, { target: { value: 'reader@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Too short: 15 characters or more')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some(call => call.path.endsWith('/sign-up'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a long synthetic passphrase' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(calls.find(call => call.path.endsWith('/sign-up'))!.body).toEqual({ name: 'Reader', email: 'reader@example.test', password: 'a long synthetic passphrase' });
  });

  it('Log in: wrong email or password, then couldn’t connect with Try again', async () => {
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
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong password here' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Wrong email or password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/app/account/forgot-password');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Couldn’t connect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Too many tries. Try later')).toBeInTheDocument();
    expect(calls.filter(call => call.path.endsWith('/sign-in'))).toHaveLength(3);
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

  it('Account settings: Change password sends the reset link; Delete asks once and deletes', async () => {
    const calls = network({ signedIn: true, handle: path => {
      if (path.endsWith('/forgot-password')) return json({ status: 'check-email' }, 202);
      if (path.endsWith('/reauth/password')) return json({ proof: 'proof-1', csrfToken: 'csrf-2' });
      // Answered at once: access can end before the move to the receipt page
      // has rendered, and the page must still be the receipt, not the shelf.
      if (path.endsWith('/api/account/deletion')) return json({ status: 'accepted', accessEnded: true });
      return undefined;
    } });
    app('/app/settings/account');
    expect(await screen.findByText(USER.email)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('button', { name: 'Link sent' })).toBeInTheDocument();
    expect(calls.find(call => call.path.endsWith('/forgot-password'))!.body).toEqual({ email: USER.email });
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/app/settings/account/more');
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete account and shelf?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'my account password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls.some(call => call.path.endsWith('/api/account/deletion'))).toBe(true));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/app/account/deletion'));
    expect(calls.find(call => call.path.endsWith('/reauth/password'))!.body).toEqual({ password: 'my account password', action: 'delete' });
    expect(calls.find(call => call.path.endsWith('/api/account/deletion'))!.body).toMatchObject({ proof: 'proof-1', confirmation: 'delete-account' });
    expect(await screen.findByRole('heading', { name: 'Account deleted' })).toBeInTheDocument();
  });

  it('Delete with a wrong password shows one line and stays', async () => {
    network({ signedIn: true, handle: path => path.endsWith('/reauth/password') ? failure(401, 'INVALID_CREDENTIALS') : undefined });
    app('/app/settings/account');
    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete account and shelf?' });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'not it' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByText('Wrong password')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/app/settings/account');
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
