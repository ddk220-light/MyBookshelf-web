// One-shelf accounts (plan Phase 9): the side panel signed in and out, the
// small Account settings, the AccountStates forms and Viewed before saved to
// the account. The account service is mocked here, as in the unit tests; the
// real-server journeys stay in accounts-real.spec.js (ACCOUNT_E2E harness).
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const USER = { id: 'reader-1', name: 'Reader', email: 'reader@example.test', emailVerified: true };
const versions = { settingsRevision: 0, shelfRevision: 0, historyGeneration: 0, historyEnabled: true };
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();

/** Mocks the account API; returns the requests it saw (path, method, body). */
async function mockAccount(page, { signedIn = true, handle } = {}) {
  const seen = [];
  await installPublicV2Fixture(page);
  await page.route('**/api/account/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/account', '');
    const body = request.postData() ? request.postDataJSON() : null;
    seen.push({ path, method: request.method(), body });
    const custom = await handle?.(path, body, route);
    if (custom === 'handled') return;
    if (custom) return route.fulfill(custom);
    if (path === '/session') return route.fulfill({ json: signedIn ? { status: 'authenticated', user: USER, csrfToken: 'csrf-1' } : { status: 'guest' } });
    if (path === '/capabilities') return route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: url.origin } });
    if (path === '/state') return route.fulfill({ json: { profile: { ...USER, profileRevision: 0 }, selectedLibraryId: LINKED_LIBRARY.id, selectedLibrary: LINKED_LIBRARY, libraryRemoved: false, counts: { saved: 0, recent: 0 }, ...versions } });
    if (path === '/books') return route.fulfill({ json: { books: [], nextCursor: null, ...versions } });
    if (path === '/history') return route.fulfill({ json: { books: [], ...versions } });
    if (path === '/history/views') return route.fulfill({ json: { status: 'recorded', referenceId: '00000000-0000-4000-8000-000000000009', viewedAt: new Date().toISOString(), ...versions } });
    if (path === '/forgot-password') return route.fulfill({ status: 202, json: { status: 'check-email' } });
    if (path === '/sign-out') return route.fulfill({ json: { status: 'signed-out' } });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found.' } } });
  });
  return seen;
}

test.describe('One-shelf accounts', () => {

  test('Settings shows the signed-in reader and opens the account, password and deletion screens', async ({ page }) => {
    const seen = await mockAccount(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Settings' });
    await expect(panel.getByText(USER.email)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Create account' })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    await panel.getByRole('link', { name: 'Account settings' }).click();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByText(USER.email)).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('link', { name: 'Change password' }).click();
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Keep my password' }).click();
    await page.getByRole('link', { name: 'Delete my account…' }).click();
    await expect(page.getByRole('heading', { name: 'Delete your account' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('link', { name: 'Keep my account' }).click();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    expect(seen.some(request => request.path === '/reauth/password' || request.path === '/deletion')).toBe(false);
  });

  test('delete account: wrong password, then deleted', async ({ page }) => {
    let tries = 0;
    await mockAccount(page, { handle: async path => {
      if (path === '/reauth/password') return ++tries === 1 ? { status: 401, json: { error: { code: 'INVALID_CREDENTIALS', message: 'Check your email and password.' } } } : { json: { proof: 'proof-1', csrfToken: 'csrf-2' } };
      if (path === '/deletion') return { json: { status: 'accepted', accessEnded: true } };
      return undefined;
    } });
    await page.goto('/app/settings/account');
    await page.getByRole('link', { name: 'Delete my account…' }).click();
    const password = page.getByLabel('Type your password to confirm');
    await password.fill('not my password');
    await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong password');
    await password.fill('the right synthetic password');
    await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Account deleted' })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/account\/deletion$/);
  });

  test('log in: wrong email or password; couldn’t connect with Try again', async ({ page }) => {
    let tries = 0;
    await mockAccount(page, { signedIn: false, handle: (path, _body, route) => {
      if (path !== '/sign-in') return undefined;
      tries += 1;
      if (tries === 1) return { status: 401, json: { error: { code: 'INVALID_CREDENTIALS', message: 'Check your email and password.' } } };
      return route.abort().then(() => 'handled');
    } });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill('reader@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a synthetic password');
    await page.getByRole('button', { name: 'Log in with password' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Log in with password' }).click();
    await expect(page.getByRole('alert')).toContainText('Couldn’t connect');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => tries).toBe(3);
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveCount(0);
  });

  test('create account accepts a password with one character; forgot password: link sent', async ({ page }) => {
    const seen = await mockAccount(page, { signedIn: false, handle: path => path === '/sign-up' ? { status: 202, json: { status: 'check-email' } } : undefined });
    await page.goto('/app/account/sign-up');
    await page.getByLabel('Email', { exact: true }).fill('reader@example.test');
    await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await page.getByLabel('Password', { exact: true }).fill('x');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(seen.find(request => request.path === '/sign-up').body).toEqual({ name: 'Reader', email: 'reader@example.test', password: 'x' });

    await page.goto('/app/account/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill('reader@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('button', { name: 'Link sent' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  });

  test('signed in: opening a book adds it to the account’s Viewed before without any setting', async ({ page }) => {
    const seen = await mockAccount(page, { handle: path => path === '/state' ? { json: { profile: { ...USER, profileRevision: 0 }, selectedLibraryId: null, selectedLibrary: null, libraryRemoved: false, counts: { saved: 0, recent: 0 }, ...versions, historyEnabled: false } } : undefined });
    await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
    await expect.poll(() => seen.filter(request => request.path === '/history/views').length).toBe(1);
    expect(seen.find(request => request.path === '/history/views').body).toMatchObject({ book: { bookKey: BOOK.bookKey }, historyGeneration: 0 });
    await expect(page.getByText('Updating recently viewed…')).toHaveCount(0);
  });

  for (const light of ['lamplight', 'ink']) test(`account screens stay legible in ${light}`, async ({ page }) => {
    await mockAccount(page, { signedIn: false, handle: path => path === '/sign-in' ? { status: 401, json: { error: { code: 'INVALID_CREDENTIALS', message: 'x' } } } : undefined });
    await page.addInitScript(light => localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({ version: 1, preference: light })), light);
    await page.goto('/app/account/sign-in');
    await page.getByLabel('Email', { exact: true }).fill('reader@example.test');
    await page.getByLabel('Password', { exact: true }).fill('a synthetic password');
    await page.getByRole('button', { name: 'Log in with password' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
  });
});
