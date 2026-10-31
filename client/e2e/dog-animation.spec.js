import { goToTab } from './public-v2-fixture.js';
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture, tab } from './public-v2-fixture.js';

const DOG_KEY = 'mybookshelf.anonymous-web.dog-animation';
const STATE_KEY = 'mybookshelf.anonymous-web.v1';
const LIGHT_KEY = 'mybookshelf.anonymous-web.reading-light';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

test('companion is opt-in, loads only when enabled, and keeps both choices across reloads', async ({ page }, testInfo) => {
  const errors = [];
  const dogRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/Bucky-[^/]+\.js/.test(request.url())) dogRequests.push(request.url());
  });
  await installPublicV2Fixture(page);
  await chooseLinkedLibrary(page);
  await page.goto('/app/shelf');
  await expect(page.locator('.shelf-bucky, .book-companion')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recently viewed books' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('shelf-default-off.png'), fullPage: true });

  await page.goto(`/app/books/${encodeURIComponent(BOOK.bookKey)}`);
  await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  await expect(page.locator('.reader-book')).toBeVisible();
  await expect(page.locator('.book-companion')).toHaveCount(0);
  expect(dogRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Save book', exact: true }).click();

  await goToTab(page, 'Settings');
  const toggle = page.getByRole('switch', { name: 'Show companion' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Lamplight', exact: true }).click();
  const existingState = await page.evaluate((key) => localStorage.getItem(key), STATE_KEY);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate((key) => localStorage.getItem(key), DOG_KEY)).toBe('true');
  expect(await page.evaluate((key) => localStorage.getItem(key), STATE_KEY)).toBe(existingState);
  expect(await page.evaluate((key) => localStorage.getItem(key), LIGHT_KEY)).toBe('lamplight');
  await page.screenshot({ path: testInfo.outputPath('settings-enabled.png'), fullPage: true });

  await goToTab(page, 'Shelf');
  await expect(page.locator('.shelf-bucky')).toBeVisible();
  expect(dogRequests.length).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.shelf-bucky')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: /Innovator/ })).toBeVisible();

  await page.goto(`/app/books/${encodeURIComponent(BOOK.bookKey)}`);
  await expect(page.locator('.book-companion')).toBeVisible();
  await expect(page.locator('.book-companion')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('journal-enabled.png'), fullPage: true });

  await goToTab(page, 'Settings');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: 'Lamplight', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await goToTab(page, 'Shelf');
  await expect(page.locator('.shelf-bucky')).toHaveCount(0);
  await expect(page.locator('.library-chip')).toContainText(LINKED_LIBRARY.name);
  await expect(page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: /Innovator/ })).toBeVisible();
  await page.goto(`/app/books/${encodeURIComponent(BOOK.bookKey)}`);
  await expect(page.locator('.reader-book')).toBeVisible();
  await expect(page.locator('.book-companion')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('clearing saved books preserves the companion preference', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.goto('/app/settings');
  await page.getByRole('switch', { name: 'Show companion' }).click();
  await page.getByRole('button', { name: 'Clear saved books' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear saved books', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  expect(await page.evaluate((key) => localStorage.getItem(key), DOG_KEY)).toBe('true');
  await expect(page.getByRole('switch', { name: 'Show companion' })).toHaveAttribute('aria-checked', 'true');
});

test('companion changes update other open tabs without a reload', async ({ context, page }) => {
  await installPublicV2Fixture(context);
  await chooseLinkedLibrary(page);
  await page.goto('/app/shelf');
  await expect(page.locator('.shelf-bucky')).toHaveCount(0);
  const settings = await context.newPage();
  await settings.goto('/app/settings');
  const toggle = settings.getByRole('switch', { name: 'Show companion' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();
  await expect(page.locator('.shelf-bucky')).toBeVisible();
  await page.goto(`/app/books/${encodeURIComponent(BOOK.bookKey)}`);
  await expect(page.locator('.book-companion')).toBeVisible();

  await toggle.click();
  await expect(page.locator('.book-companion')).toHaveCount(0);
  await goToTab(page, 'Shelf');
  await expect(page.locator('.shelf-bucky')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Shelf', level: 1 })).toBeVisible();
});
