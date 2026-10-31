import { goToTab } from './public-v2-fixture.js';
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture, tab } from './public-v2-fixture.js';
import { installBarcodeCamera } from './camera-frames.js';

test('a new reader scans or searches and saves before choosing a library for availability', async ({ page }) => {
  const fixture = await installPublicV2Fixture(page);
  await page.goto('/app/shelf');
  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start your shelf' })).toBeVisible();
  await page.locator('.shelf-start').getByRole('link', { name: 'Find a book', exact: true }).click();
  await page.getByLabel('Title, author or ISBN').fill(BOOK.isbn13);
  await page.getByRole('button', { name: /Search books|Find libraries/, exact: true }).click();
  await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await goToTab(page, 'Shelf');
  await page.reload();
  const saved = page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: /Innovator/ });
  await expect(saved).toBeVisible();
  expect(fixture.calls.some((call) => call.endpoint.startsWith('/app/libraries/') || call.endpoint === '/availability')).toBe(false);

  await saved.click();
  await page.getByRole('link', { name: 'Choose a library', exact: true }).click();
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Select Anna Centenary Library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
  expect(fixture.calls.some((call) => call.endpoint === '/availability')).toBe(true);
});

test('a failed saved library never blocks the shelf or book lookup', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.route('**/api/v2/libraries/resolve', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE' } }) }));
  await page.addInitScript((id) => localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 1, selectedLibraryId: id, recentBooks: [], savedBooks: [] })), LINKED_LIBRARY.id);
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible();
  await page.locator('.shelf-start').getByRole('link', { name: 'Find a book', exact: true }).click();
  await page.getByLabel('Title, author or ISBN').fill(BOOK.isbn13);
  await page.getByRole('button', { name: /Search books|Find libraries/, exact: true }).click();
  await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Library details unavailable');
  await expect(page.getByRole('button', { name: 'Save book', exact: true })).toBeEnabled();
});

for (const [nativeSupport, rotated] of [['missing', false], ['formats', false], ['broken', false], ['missing', true]]) {
  test(`real barcode frames decode when native detection is ${nativeSupport}${rotated ? ' and the barcode is rotated' : ''}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installBarcodeCamera(page, nativeSupport, rotated);
    const fixture = await installPublicV2Fixture(page);
    await page.goto('/app/search');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible({ timeout: 15000 });
    expect(fixture.calls.some((call) => call.endpoint === '/books/search' && call.body.query === BOOK.isbn13)).toBe(true);
    expect(await page.evaluate(() => window.__testCameraTrack.readyState)).toBe('ended');
    expect(errors).toEqual([]);
    await goToTab(page, 'Shelf');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')).recentBooks[0].source)).toBe('camera');
  });
}
