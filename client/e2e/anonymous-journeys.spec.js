import { expect, test } from '@playwright/test';
import { AVAILABILITY, BOOK, CANDIDATE_BOOK, LINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture, goToTab } from './public-v2-fixture.js';
const key = 'mybookshelf.anonymous-web.v1';

test('library selection is optional and Settings selection persists', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'Shelf', exact: true })).toBeVisible();
  await goToTab(page, 'Settings');
  await page.getByRole('link', { name: 'Choose a library', exact: true }).click();
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  await page.getByRole('button', { name: 'Select ' + LINKED_LIBRARY.name, exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.reload();
  await expect(page.locator('.reading-library-card')).toContainText(LINKED_LIBRARY.name);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('manual ISBN, metadata and safe catalog handoffs work; reopening refreshes', async ({ page }) => {
  const fixture = await installPublicV2Fixture(page);
  await chooseLinkedLibrary(page);
  await page.getByLabel('Title, author or ISBN').fill(BOOK.isbn13);
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.getByRole('heading', { name: BOOK.title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Goodreads' })).toHaveAttribute('href', new RegExp(BOOK.isbn13));
  await expect(page.getByRole('link', { name: 'Goodreads' })).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('link', { name: 'Open library catalog', exact: true })).toHaveAttribute('href', /record\/123/);
  await expect(page.getByText(/Checked|Previously available|Availability may have changed/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await goToTab(page, 'Shelf');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.shelf-book-status')).toHaveText('Last result: Available at the library');
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(stored.recentBooks[0].source).toBe('isbn');
  const before = fixture.calls.filter(call => call.endpoint === '/availability').length;
  await page.getByRole('list', { name: 'Saved books' }).getByRole('link').click();
  await expect.poll(() => fixture.calls.filter(call => call.endpoint === '/availability').length).toBe(before + 1);
});

test('invalid ISBN can be corrected, and search Back restores results without persisting the query', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.goto('/app/search');
  await page.getByLabel('Title, author or ISBN').fill('9781625275869');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Enter a valid ISBN');
  const query = 'private draft should not persist';
  await page.getByLabel('Title, author or ISBN').fill(query);
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await page.getByRole('link', { name: new RegExp(CANDIDATE_BOOK.title) }).click();
  await expect(page.getByRole('heading', { name: CANDIDATE_BOOK.title, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Title, author or ISBN')).toHaveValue(query);
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(query);
});

test('camera denial keeps manual ISBN entry usable inside the sheet', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } }));
  await page.goto('/app/search');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByLabel('ISBN', { exact: true }).fill(BOOK.isbn13);
  await dialog.getByRole('button', { name: 'Find this edition', exact: true }).click();
  await expect(page.getByRole('heading', { name: BOOK.title, exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('direct links work without a library and confirmed catalog titles survive saving', async ({ page }) => {
  await installPublicV2Fixture(page, { availability: { ...AVAILABILITY.available, catalogTitle: 'பரமார்த்த குரு கதைகள்' } });
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('link', { name: 'Choose a library', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: BOOK.title, exact: true })).toBeVisible();
  await chooseLinkedLibrary(page);
  await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book: { bookKey: BOOK.bookKey, isbn13: BOOK.isbn13, title: 'ISBN ' + BOOK.isbn13, authors: [], metadataStatus: 'missing' } } }));
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('heading', { name: 'பரமார்த்த குரு கதைகள்', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await expect(page.getByRole('button', {name:'On your shelf',exact:true})).toBeVisible();
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(stored.savedBooks[0].title).toBe('பரமார்த்த குரு கதைகள்');
  expect(stored.recentBooks[0].title).toBe('பரமார்த்த குரு கதைகள்');
});

for (const [name, availability, title] of [
  ['available', AVAILABILITY.available, 'Available at the library'],
  ['none available', AVAILABILITY.noneAvailable, 'No lending copies available'],
  ['not found', AVAILABILITY.notFound, 'Not listed in this catalog'],
  ['stale fallback', AVAILABILITY.stale, 'Catalog timed out'],
  ['failed possible match', AVAILABILITY.unknown, 'Availability unavailable'],
  ['possible edition', { ...AVAILABILITY.unknown, errorCode: undefined, freshness: 'fresh' }, 'Check the edition'],
  ['catalog presence', { ...AVAILABILITY.available, outcome: 'in_catalog', availableCopies: undefined }, 'Listed in the catalog'],
  ['reference', { ...AVAILABILITY.available, outcome: 'unknown', loanRestriction: 'not_for_loan', availableCopies: undefined }, 'Read at the library'],
]) test('availability is truthful for ' + name, async ({ page }) => {
  await installPublicV2Fixture(page, { availability });
  await chooseLinkedLibrary(page);
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open library catalog', exact: true })).toBeVisible();
  await expect(page.getByText(/Checked|Previously available|Availability may have changed/)).toHaveCount(0);
  if (availability.freshness === 'stale' || availability.errorCode) await expect(page.getByText('2 available · 3 total', { exact: true })).toHaveCount(0);
});

test('a failed fresh check replaces earlier success and Retry replaces the failure', async ({ page }) => {
  await installPublicV2Fixture(page);
  let attempt = 0;
  await page.route('**/api/v2/availability', route => route.fulfill({ json: ++attempt === 2 ? AVAILABILITY.stale : AVAILABILITY.available }));
  await chooseLinkedLibrary(page);
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catalog timed out', exact: true })).toBeVisible();
  await expect(page.getByText('2 available · 3 total', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
  expect(attempt).toBe(3);
});

test('recent books synchronize across tabs and clearing requires confirmation', async ({ page, context }) => {
  await installPublicV2Fixture(context);
  await page.goto('/app/shelf');
  const second = await context.newPage();
  await second.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.locator('.reader-recent')).toContainText(BOOK.title);
  await page.locator('.reader-recent').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Clear recent books', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-recent')).toContainText(BOOK.title);
  await page.getByRole('button', { name: 'Clear recent books', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear recent books', exact: true }).click();
  await expect(page.locator('.reader-recent .book-card')).toHaveCount(0);
  await second.close();
});

test('themes default to device, explicit choice overrides it, and clearing only empties the shelf', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await chooseLinkedLibrary(page);
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await goToTab(page, 'Settings');
  await expect(page.getByRole('switch', { name: 'Match device' })).toHaveAttribute('aria-checked','true');
  await expect(page.locator('html')).toHaveAttribute('data-reading-light','lamplight');
  await page.getByRole('button', { name: 'Ink', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Match device' })).toHaveAttribute('aria-checked','false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-reading-light','ink');
  await page.getByRole('button', { name: 'Clear saved books', exact: true }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).savedBooks.length, key)).toBe(1);
  await page.getByRole('button', { name: 'Clear saved books', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear saved books', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(stored.savedBooks).toEqual([]);
  expect(stored.recentBooks).toHaveLength(1);
  expect(stored.selectedLibraryId).toBe(LINKED_LIBRARY.id);
  await page.getByRole('switch', { name: 'Match device' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-reading-light','daylight');
});
