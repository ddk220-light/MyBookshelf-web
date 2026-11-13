// Scanning from the shelf with real barcode frames, whatever the browser's own
// barcode detection does, and a saved library that fails to load never
// blocking the shelf or a book lookup.
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';
import { installBarcodeCamera } from './camera-frames.js';

async function fixture(page) {
  const result = await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/holdings/**', route => route.fulfill({ json: { answers: {}, answer: 'unknown' } }));
  return result;
}

test('a failed saved library never blocks the shelf or book lookup', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'CATALOG_UNAVAILABLE' } }) }));
  await page.addInitScript(id => localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 1, selectedLibraryId: id, recentBooks: [], savedBooks: [] })), LINKED_LIBRARY.id);
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Search for a book' });
  await search.fill(BOOK.isbn13);
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to my shelf' })).toBeEnabled();
});

for (const [nativeSupport, rotated] of [['missing', false], ['formats', false], ['broken', false], ['missing', true]]) {
  test(`real barcode frames decode when native detection is ${nativeSupport}${rotated ? ' and the barcode is rotated' : ''}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installBarcodeCamera(page, nativeSupport, rotated);
    const { calls } = await fixture(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible({ timeout: 15000 });
    expect(calls.some(call => call.endpoint === '/books/search' && call.body.query === BOOK.isbn13)).toBe(true);
    expect(await page.evaluate(() => window.__testCameraTrack.readyState)).toBe('ended');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')).recentBooks[0].source)).toBe('camera');
  });
}
