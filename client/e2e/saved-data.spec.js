import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture, goToTab } from './public-v2-fixture.js';
const key = 'mybookshelf.anonymous-web.v1';

for (const count of [100, 104]) test('a shelf of ' + count + ' books survives and rejects a new addition', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.addInitScript(({ key, book, count }) => {
    if (localStorage.getItem(key)) return;
    const savedBooks = Array.from({ length: count }, (_, i) => ({ title: book.title, authors: book.authors, bookKey: 'v1:openlibrary:OL' + i + 'W', source: 'direct', viewedAt: '2026-10-28T00:00:00Z' }));
    localStorage.setItem(key, JSON.stringify({ version: 1, savedBooks, recentBooks: [], selectedLibraryId: null }));
  }, { key, book: BOOK, count });
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  const original = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).savedBooks, key);
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your shelf is full');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).savedBooks, key)).toEqual(original);
  await page.reload();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).savedBooks.length, key)).toBe(count);
});

for (const field of ['savedBooks','recentBooks']) test('damaged ' + field + ' blocks automatic writes until explicit recovery', async ({ page }) => {
  await installPublicV2Fixture(page);
  const raw = JSON.stringify({ version: 1, selectedLibraryId: null, savedBooks: [], recentBooks: [], [field]: [{ title: 'Recover this book' }] });
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('button', { name: 'Reload shelf', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await page.getByRole('button', { name: 'Reload shelf', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await page.getByRole('button', { name: 'Start a new shelf', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await page.getByRole('button', { name: 'Start a new shelf', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start a new shelf', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload shelf', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await expect(page.getByRole('button', {name:'On your shelf',exact:true})).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).savedBooks.length, key)).toBe(1);
});

test('denied storage uses a working session shelf with feedback', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }));
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await expect(page.locator('.site-notice')).toContainText(/can’t be saved/);
  await goToTab(page, 'Shelf');
  await expect(page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: BOOK.title, exact: true })).toBeVisible();
});

test('transient library failure preserves selection and confirmed removal keeps its display name', async ({ page }) => {
  await installPublicV2Fixture(page);
  let missing = false;
  await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ status: missing ? 404 : 503, json: { error: { code: missing ? 'LIBRARY_NOT_FOUND' : 'CATALOG_TIMEOUT' } } }));
  await page.addInitScript(({ key, library }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ version: 1, selectedLibraryId: library.id, savedBooks: [], recentBooks: [] }));
      localStorage.setItem('mybookshelf.reader-preferences.v1', JSON.stringify({ version: 1, selectedLibrary: { id: library.id, name: library.name } }));
    }
  }, { key, library: LINKED_LIBRARY });
  await page.goto('/app/shelf');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLibraryId, key)).toBe(LINKED_LIBRARY.id);
  missing = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.site-notice')).toContainText(LINKED_LIBRARY.name + ' is no longer listed');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLibraryId, key)).toBeNull();
});

test('restored storage access never overwrites a shelf that could not be read', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.addInitScript(({ key, book }) => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    set.call(localStorage, key, JSON.stringify({ version: 1, selectedLibraryId: null, savedBooks: [{ ...book, bookKey: 'v1:googlebooks:older-save', title: 'Previously saved book', source: 'direct', viewedAt: '2026-10-20T00:00:00Z' }], recentBooks: [] }));
    window.allowShelfStorage = false;
    Storage.prototype.getItem = function (name) {
      if (name === key && !window.allowShelfStorage) throw new DOMException('denied', 'SecurityError');
      return get.call(this, name);
    };
    Storage.prototype.setItem = function (name, value) {
      if (name === key && !window.allowShelfStorage) throw new DOMException('denied', 'SecurityError');
      return set.call(this, name, value);
    };
  }, { key, book: BOOK });
  await page.goto('/app/shelf');
  await expect(page.getByText('Your changes can’t be saved in this browser. They may be lost when you leave.')).toBeVisible();
  await page.evaluate(() => { window.allowShelfStorage = true; });
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  await goToTab(page, 'Search');
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill(BOOK.isbn13);
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await expect(page.getByRole('button', { name: 'On your shelf', exact: true })).toBeVisible();
  await goToTab(page, 'Shelf');
  await expect(page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: BOOK.title, exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(original);
});
