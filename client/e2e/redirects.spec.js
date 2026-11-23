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
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  });

  test('/app/shelf, the shelf’s old address, forwards to the root without its query', async ({ page, request }) => {
    for (const path of ['/app/shelf', '/app/shelf/', '/app/shelf?q=wings#top', '/app']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(308);
      expect(response.headers().location, path).toBe('/');
    }
    await fixture(page);
    await page.goto('/app/shelf?q=wings');
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    expect(await everything(page)).not.toContain('wings');
  });

  test('/app/search: the shelf with the search bar focused', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/search');
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeFocused();
  });

  test('/app/search?q=: searches once, and the text stays out of the address, history and storage', async ({ page }) => {
    const { calls } = await fixture(page);
    await page.goto('/app/search?q=innovator');
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title) }).first()).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('innovator');
    expect(calls.filter(call => call.endpoint === '/books/search')).toHaveLength(1);
    expect(await everything(page)).not.toContain('innovator');
    // Back leaves the results for the shelf; the old address is not in the history.
    await page.goBack();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await page.goBack();
    expect(page.url()).not.toContain('innovator');
    await page.goForward();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
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
      await expect(page).toHaveURL(/\/\/[^/]+\/$/);
      await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
      await page.goto('/app/search?scope=papers&q=fixture-paper');
      await expect(page).toHaveURL(/\/\/[^/]+\/$/);
      expect(calls.some(call => call.endpoint.includes('content'))).toBe(false);
      expect(await everything(page)).not.toContain('fixture-paper');
    }
  });

  test('/app/libraries: the shelf with the library pop-up', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/libraries');
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('City, town or library name')).toHaveValue('');
    // Back closes it and stays on the shelf.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
  });

  test('/app/libraries: the pop-up opens once; Back closes it and it never opens again by itself', async ({ page }) => {
    await fixture(page);
    await page.addInitScript(book => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [],
        savedBooks: [{ bookKey: book.bookKey, title: book.title, authors: book.authors, source: 'direct', viewedAt: '2026-11-01T00:00:00.000Z' }], savedContent: [] }));
    }, BOOK);
    await page.goto('/app/libraries');
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await expect(dialog).toBeVisible();
    // Back closes the pop-up and stays on the shelf.
    await page.goBack();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'My reading shelf' })).toBeVisible();
    // Opening a book and coming back, or a reload, does not bring it back.
    await page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).click();
    await expect(page).toHaveURL(bookUrl);
    await page.goBack();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My reading shelf' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'My reading shelf' })).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test('/app/libraries?q=: the text goes into the pop-up’s field and nowhere else', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/libraries?q=Chennai');
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
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
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
    await page.goto('/app/settings#privacy');
    await expect(page).toHaveURL(/\/app\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  });

  test('/find: the shelf', async ({ page }) => {
    await fixture(page);
    await page.goto('/find');
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
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
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await everything(page)).not.toContain('wings');
  });

  test('a book link opens the book', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to my reading shelf' })).toBeVisible();
  });

  test('an unknown app page says so and leads back to the shelf', async ({ page }) => {
    await fixture(page);
    await page.goto('/app/no-such-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await page.getByRole('link', { name: 'My reading shelf' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
  });
});

test.describe('Public pages into the app', () => {
  test('the not-found page’s links open the shelf and the library guides', async ({ page }) => {
    await fixture(page);
    const response = await page.goto('/no-such-page');
    expect(response.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Explore libraries' })).toHaveAttribute('href', '/libraries');
    await page.getByRole('link', { name: 'Open my reading shelf →' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  });

  test('the About page leads to the reading shelf at the root, and the wordmark leads back to About', async ({ page }) => {
    await fixture(page);
    await page.goto('/about');
    await expect(page.locator('main input')).toHaveCount(0);
    await page.getByRole('main').getByRole('link', { name: 'Open my reading shelf' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await page.getByRole('link', { name: 'MyBookshelf', exact: true }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator('h1')).toHaveText('Find out if your library has a book, before you go.');
  });

  test('Open my reading shelf and the libraries hub lead into the app', async ({ page }) => {
    await fixture(page);
    await page.goto('/libraries');
    // "Find my library" goes through /app/libraries, which opens the picker over the shelf.
    await page.getByRole('main').getByRole('link', { name: 'Find my library', exact: true }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('dialog', { name: 'Find your library' })).toBeVisible();
    await page.goto('/how-it-works');
    await page.getByRole('banner').getByRole('link', { name: 'Open my reading shelf' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
  });
});
