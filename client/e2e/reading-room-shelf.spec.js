import { expect, test } from '@playwright/test';
import { BOOK, installPublicV2Fixture } from './public-v2-fixture.js';
const key = 'mybookshelf.anonymous-web.v1';
test('face-out shelf wraps, sort and view persist, and removal offers Undo', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.addInitScript(({ key, book }) => {
    if (localStorage.getItem(key)) return;
    const savedBooks = Array.from({ length: 15 }, (_, i) => ({ ...book, bookKey: 'v1:openlibrary:OL' + i + 'W', title: String.fromCharCode(90-i) + ' Book', authors: [String.fromCharCode(65+i)], isbn13: undefined, coverUrl: undefined, source: 'direct', viewedAt: new Date(Date.UTC(2026,0,i+1)).toISOString() }));
    localStorage.setItem(key, JSON.stringify({ version: 1, selectedLibraryId: null, savedBooks, recentBooks: [] }));
  }, { key, book: BOOK });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/app/shelf');
  await expect(page.locator('.faceout-book')).toHaveCount(15);
  expect(await page.locator('.faceout-row').first().locator('.faceout-book').count()).toBe(2);
  await page.getByLabel('Sort saved books').selectOption('title');
  await expect(page.locator('.faceout-book a').first()).toHaveAccessibleName('L Book');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('Sort saved books')).toHaveValue('title');
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Remove L Book from saved books', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Saved books' }).locator('li')).toHaveCount(14);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Saved books' }).locator('li')).toHaveCount(15);
});
