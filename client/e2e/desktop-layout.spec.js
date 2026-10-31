import { expect, test } from '@playwright/test';
import { BOOK, chooseLinkedLibrary, installPublicV2Fixture, tab } from './public-v2-fixture.js';

for (const [width, height] of [[1024,768],[1280,800],[1366,768],[1440,900],[1920,1080]]) test('desktop layout and breakpoint preserve the reader at ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height });
  const fixture = await installPublicV2Fixture(page);
  await chooseLinkedLibrary(page);
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  const status = page.getByRole('heading', { name: 'Available at the library', exact: true });
  await expect(status).toBeInViewport();
  const cover = await page.locator('.reader-book-cover-column').boundingBox();
  const main = await page.locator('.reader-book-main').boundingBox();
  expect(main.x).toBeGreaterThan(cover.x + cover.width);
  const sidebar = await page.locator('.app-navigation').boundingBox();
  expect(sidebar.width).toBe(width >= 1440 ? 248 : 224);
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await tab(page, 'Shelf').click();
  await expect(page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: BOOK.title, exact: true })).toBeVisible();
  await tab(page, 'Search').click();
  const field = page.getByLabel('Title, author or ISBN', { exact: true });
  await field.fill('a draft');
  for (const next of [1023, 1024, width]) {
    await page.setViewportSize({ width: next, height });
    await expect(field).toHaveValue('a draft');
    await expect(field).toHaveCount(1);
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(2);
  expect(fixture.calls.filter(call => call.endpoint === '/availability')).toHaveLength(1);
});

test('library list and details support keyboard selection without a map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installPublicV2Fixture(page);
  await page.goto('/app/libraries');
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  const rows = page.locator('.library-row-open');
  await expect(rows).toHaveCount(2);
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/library=directory/);
  await expect(page.locator('.library-detail h2')).toHaveText('Example Public Library');
  const detail = await page.locator('.library-detail-pane').boundingBox(), list = await page.locator('.library-list-panel').boundingBox();
  expect(detail.x).toBeGreaterThan(list.x + list.width);
  await expect(page.locator('.library-map')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.library-detail')).toHaveCount(1);
  await page.getByRole('button', { name: '← Libraries', exact: true }).click();
  await expect(page.getByLabel('Library, city or postcode')).toHaveValue('Chennai');
});
