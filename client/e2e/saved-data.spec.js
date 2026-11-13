// Browser storage edge cases on the one-shelf screens: a full shelf, a damaged
// record, storage that is denied or comes back, a library that stops
// resolving, and two open tabs.
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const key = 'mybookshelf.anonymous-web.v1';
const bookPath = '/app/books/' + encodeURIComponent(BOOK.bookKey);
const shelf = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);

async function fixture(page) {
  const result = await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/holdings/**', route => route.fulfill({ json: { answers: {}, answer: 'unknown' } }));
  return result;
}

for (const count of [100, 104]) test('a shelf of ' + count + ' books survives and rejects a new addition', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(({ key, book, count }) => {
    if (localStorage.getItem(key)) return;
    const savedBooks = Array.from({ length: count }, (_, i) => ({ title: book.title + ' ' + i, authors: book.authors, bookKey: 'v1:openlibrary:OL' + i + 'W', source: 'direct', viewedAt: '2026-10-28T00:00:00Z' }));
    localStorage.setItem(key, JSON.stringify({ version: 1, savedBooks, recentBooks: [], selectedLibraryId: null }));
  }, { key, book: BOOK, count });
  await page.goto(bookPath);
  const original = (await shelf(page)).savedBooks;
  const add = page.getByRole('button', { name: 'Add to my shelf' });
  await expect(add).toBeDisabled();
  await expect(add).toHaveAccessibleDescription('Shelf full');
  expect((await shelf(page)).savedBooks).toEqual(original);
  await page.reload();
  expect((await shelf(page)).savedBooks.length).toBe(count);
});

for (const field of ['savedBooks', 'recentBooks']) test('damaged ' + field + ' blocks automatic writes until explicit recovery', async ({ page }) => {
  await fixture(page);
  const raw = JSON.stringify({ version: 1, selectedLibraryId: null, savedBooks: [], recentBooks: [], [field]: [{ title: 'Recover this book' }] });
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key, raw });
  await page.goto(bookPath);
  await expect(page.getByRole('button', { name: 'Reload shelf', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add to my shelf' }).click();
  await page.getByRole('button', { name: 'Reload shelf', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await page.getByRole('button', { name: 'Start a new shelf', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
  await page.getByRole('button', { name: 'Start a new shelf', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start a new shelf', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload shelf', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to my shelf' }).click();
  await expect(page.getByRole('button', { name: 'On my shelf' })).toBeVisible();
  expect((await shelf(page)).savedBooks.length).toBe(1);
});

test('denied storage uses a working session shelf with feedback', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }));
  await page.goto(bookPath);
  await page.getByRole('button', { name: 'Add to my shelf' }).click();
  await expect(page.locator('.site-notice')).toContainText(/can’t be saved/);
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title) }).first()).toBeVisible();
});

test('a library that fails to load stays chosen; one that is gone is cleared with its name', async ({ page }) => {
  await fixture(page);
  let missing = false;
  await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ status: missing ? 404 : 503, json: { error: { code: missing ? 'LIBRARY_NOT_FOUND' : 'CATALOG_TIMEOUT' } } }));
  await page.addInitScript(({ key, library }) => {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ version: 1, selectedLibraryId: library.id, savedBooks: [], recentBooks: [] }));
      localStorage.setItem('mybookshelf.reader-preferences.v1', JSON.stringify({ version: 1, selectedLibrary: { id: library.id, name: library.name } }));
    }
  }, { key, library: LINKED_LIBRARY });
  const failed = page.waitForResponse(response => response.url().endsWith('/libraries/resolve'));
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  await failed;
  expect((await shelf(page)).selectedLibraryId).toBe(LINKED_LIBRARY.id);
  missing = true;
  await page.reload();
  await expect(page.locator('.site-notice')).toContainText(LINKED_LIBRARY.name + ' is no longer listed');
  await expect.poll(async () => (await shelf(page)).selectedLibraryId).toBeNull();
});

test('restored storage access never overwrites a shelf that could not be read', async ({ page }) => {
  await fixture(page);
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
  const search = page.getByRole('searchbox', { name: 'Search for a book' });
  await search.fill(BOOK.isbn13);
  await search.press('Enter');
  await page.getByRole('button', { name: 'Add to my shelf' }).click();
  await expect(page.getByRole('button', { name: 'On my shelf' })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title) }).first()).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(original);
});

test('a book saved in one tab appears on the shelf open in another', async ({ context }) => {
  const first = await context.newPage(), second = await context.newPage();
  for (const page of [first, second]) await fixture(page);
  await second.goto('/app/shelf');
  await expect(second.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  await first.goto(bookPath);
  await first.getByRole('button', { name: 'Add to my shelf' }).click();
  await expect(first.getByRole('button', { name: 'On my shelf' })).toBeVisible();
  await expect(second.getByRole('link', { name: new RegExp('^' + BOOK.title) }).first()).toBeVisible();
});
