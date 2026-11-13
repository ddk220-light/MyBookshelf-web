// Every old address in the plan's Phase 12 redirect table, plus the public
// pages' links into the app. Old Search, Libraries and Settings pages are
// overlays on the shelf now; typed text carried in an old address (`q`) never
// reaches the new address, the history entries or browser storage.
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const contentBuild = process.env.FREE_CONTENT_E2E === 'true';
const bookUrl = new RegExp('/app/books/' + encodeURIComponent(BOOK.bookKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
// Address, history state and both browser stores, as one string.
const everything = page => page.evaluate(() => location.href + JSON.stringify(history.state) + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));

async function fixture(page) {
  const result = await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/holdings/**', route => route.fulfill({ json: { answers: {}, answer: 'unknown' } }));
  return result;
}

test.describe('Old addresses', () => {
  test('/app goes to the shelf', async ({ page }) => {
    await fixture(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  });

  test('/app/search: the shelf with the search bar focused', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/search');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeFocused();
  });

  test('/app/search?q=: searches once, and the text stays out of the address, history and storage', async ({ page }) => {
    const { calls } = await fixture(page);
    await page.goto('/app/search?q=innovator');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title) }).first()).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('innovator');
    expect(calls.filter(call => call.endpoint === '/books/search')).toHaveLength(1);
    expect(await everything(page)).not.toContain('innovator');
    // Back leaves the results for the shelf; the old address is not in the history.
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await page.goBack();
    expect(page.url()).not.toContain('innovator');
    await page.goForward();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    expect(await everything(page)).not.toContain('innovator');
    expect(calls.filter(call => call.endpoint === '/books/search')).toHaveLength(1);
  });

  test('/app/search?q= with an ISBN opens that book', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/search?q=' + BOOK.isbn13);
    await expect(page).toHaveURL(bookUrl);
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  });

  test('/app/search?scope=free: free reading when its build setting is on, otherwise the shelf', async ({ page }) => {
    const { calls } = await fixture(page);
    await page.goto('/app/search?scope=free');
    if (contentBuild) {
      await expect(page).toHaveURL(/\/app\/search\?scope=free$/);
      await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/app\/shelf$/);
      await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
      await page.goto('/app/search?scope=papers&q=fixture-paper');
      await expect(page).toHaveURL(/\/app\/shelf$/);
      expect(calls.some(call => call.endpoint.includes('content'))).toBe(false);
      expect(await everything(page)).not.toContain('fixture-paper');
    }
  });

  test('/app/libraries: the shelf with the library pop-up', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/libraries');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('City, town or library name')).toHaveValue('');
    // Back closes it and stays on the shelf.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });

  test('/app/libraries?q=: the text goes into the pop-up’s field and nowhere else', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/libraries?q=Chennai');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await expect(dialog.getByLabel('City, town or library name')).toHaveValue('Chennai');
    await expect(dialog.getByRole('button', { name: new RegExp(LINKED_LIBRARY.name) })).toBeVisible();
    expect(await everything(page)).not.toContain('Chennai');
    await dialog.getByRole('button', { name: new RegExp(LINKED_LIBRARY.name) }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    expect(await everything(page)).not.toContain('Chennai');
    // A reload shows the shelf, without the pop-up or the text.
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('/app/libraries?book=: the book with the library pop-up over it', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/libraries?book=' + encodeURIComponent(BOOK.bookKey));
    await expect(page).toHaveURL(bookUrl);
    await expect(page.getByRole('dialog', { name: 'Find your library' })).toBeVisible();
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  });

  test('/app/settings: the shelf with the side panel; #privacy: the Privacy page', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/settings');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('dialog', { name: 'Account and settings' })).toBeVisible();
    await page.goto('/app/settings#privacy');
    await expect(page).toHaveURL(/\/app\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  });

  test('/find: the shelf', async ({ page }) => {
    await fixture(page);
    await page.goto('/find');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  });

  test('/privacy: the public privacy page', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/privacy$/);
  });

  test('/select/<slug>?next=/app/search: chooses the library silently, then the shelf', async ({ page }) => {
    await fixture(page);
    await page.route('**/api/v2/libraries/resolve-link', route => route.fulfill({ json: { library: LINKED_LIBRARY } }));
    await page.goto('/select/anna-centenary-library?next=/app/search&q=wings');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await everything(page)).not.toContain('wings');
  });

  test('a book link opens the book', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to my shelf' })).toBeVisible();
  });

  test('an unknown app page says so and leads back to the shelf', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'My shelf' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });
});

test.describe('Public pages into the app', () => {
  test('the not-found page’s links open the shelf and the library guides', async ({ page }) => {
    await fixture(page);
    const response = await page.goto('/no-such-page');
    expect(response.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Explore libraries' })).toHaveAttribute('href', '/libraries');
    await page.getByRole('link', { name: 'Open your bookshelf →' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  });

  test('the landing page’s Find my library opens the library pop-up and puts no typed text in an address', async ({ page }) => {
    await fixture(page);
    await page.goto('/');
    await expect(page.locator('main input')).toHaveCount(0);
    await page.getByRole('link', { name: 'Find my library' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('dialog', { name: 'Find your library' })).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { name: 'Find a book instead →' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });

  test('Open the app and the libraries hub lead into the new app', async ({ page }) => {
    await fixture(page);
    await page.goto('/libraries');
    await page.getByRole('link', { name: 'Find your library in the app →' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('dialog', { name: 'Find your library' })).toBeVisible();
    await page.goto('/how-it-works');
    await page.getByRole('link', { name: /Open the app/ }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });
});
