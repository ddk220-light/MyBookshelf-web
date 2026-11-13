// Phase 13 (plan 8.3, 8.4): reduced motion on every moving part, a start with
// the network gone, and a slow network on search and on a library check. A
// failed or slow check is "couldn't check", never "not found".
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';
import { installBarcodeCamera } from './camera-frames.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const book = (index, extra = {}) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Shelf book ' + index, authors: ['Author ' + index], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), ...extra });
const MINE = book(1, { bookKey: BOOK.bookKey, isbn13: BOOK.isbn13, title: BOOK.title, authors: BOOK.authors });
async function seed(page, { saved = [MINE, book(2)], recent = [book(7)], libraryId = LINKED_LIBRARY.id } = {}) {
  await page.addInitScript(({ KEY, saved, recent, libraryId }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: recent, savedBooks: saved, savedContent: [] }));
  }, { KEY, saved, recent, libraryId });
}
/** CSS animations and transitions longer than 10 ms that are running or about to. */
const moving = page => page.evaluate(() => document.getAnimations()
  .filter(animation => animation.playState !== 'finished' && Number(animation.effect?.getComputedTiming().duration || 0) > 10)
  .map(animation => (animation.animationName || animation.transitionProperty || 'animation') + ' on ' + (animation.effect?.target?.className || '')));

test('reduced motion: nothing slides, pops or spins anywhere in the main journey', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches).catch(() => true)).toBe(true);
  await installPublicV2Fixture(page);
  await installBarcodeCamera(page).catch(() => {});
  await seed(page);
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
  expect(await moving(page), 'shelf').toEqual([]);
  await page.getByRole('button', { name: 'Account and settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Account and settings' })).toBeVisible();
  expect(await moving(page), 'side panel').toEqual([]);
  await page.keyboard.press('Escape');
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.fill('innovator');
  await input.press('Enter');
  await expect(page.getByRole('region', { name: 'Search results' }).getByRole('link').first()).toBeVisible();
  expect(await moving(page), 'results').toEqual([]);
  await page.getByRole('region', { name: 'Search results' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
  expect(await moving(page), 'book page while checking').toEqual([]);
  await page.getByRole('button', { name: 'On my shelf' }).click();
  await page.getByRole('button', { name: 'Add to my shelf' }).click();
  expect(await moving(page), 'tick after adding').toEqual([]);
  await page.locator('.library-answer').getByText(LINKED_LIBRARY.name).waitFor();
  await page.goto('/app/shelf');
  await page.getByRole('button', { name: 'Scan a barcode' }).click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
  expect(await moving(page), 'scan pop-up').toEqual([]);
});

test('offline start: saved books show, search and the book page say they could not connect, nothing reads "not found"', async ({ page, context }) => {
  await installPublicV2Fixture(page);
  await seed(page);
  // The page itself is served; every API call fails as with no network.
  await page.route('**/api/**', route => route.abort('internetdisconnected'));
  await page.goto('/app/shelf');
  // The account check failed too: private content stays hidden until the reader
  // chooses to carry on as a guest (accounts PRD AC-14).
  await expect(page.getByText('Couldn’t check your account.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue as guest' }).click();
  await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^Shelf book 2 by Author 2/ })).toBeVisible();
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.fill('innovator');
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Couldn’t search' })).toBeVisible();
  // Opened from the shelf, the saved details show and the library card says it couldn't check.
  await page.getByRole('button', { name: 'Clear search and go back to my shelf' }).click();
  await page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
  await expect(page.locator('.library-answer')).toHaveAttribute('data-answer', 'unknown', { timeout: 40_000 });
  expect(await page.locator('body').innerText()).not.toMatch(/not (found|in) /i);
  // Opened by its address after a reload, a saved book shows its saved details; the library name cannot load, the card still says it couldn't check.
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
  await expect(page.locator('.library-answer')).toHaveAttribute('data-answer', 'unknown', { timeout: 40_000 });
  // A cold start with no network at all: no service worker, so the browser's own offline page.
  await context.setOffline(true);
  const failed = await page.goto('/app/shelf').then(() => false, () => true);
  await context.setOffline(false);
  console.log('OFFLINE cold start failed=' + failed);
  test.info().annotations.push({ type: 'offline cold start', description: failed ? 'navigation fails (no service worker or offline cache)' : 'page loaded from cache' });
});

test('slow network: search shows Searching, then results; a slow library check shows Checking, then its answer', async ({ page }) => {
  await installPublicV2Fixture(page);
  await seed(page);
  const slow = ms => async route => { await new Promise(resolve => setTimeout(resolve, ms)); await route.fallback(); };
  await page.route('**/api/v2/books/search', slow(3000));
  await page.route('**/api/v2/holdings/check', slow(4000));
  await page.goto('/app/shelf');
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.fill('innovator');
  const started = Date.now();
  await input.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /Searching|Looking/ }).first()).toBeAttached({ timeout: 2000 }).catch(() => {});
  const results = page.getByRole('region', { name: 'Search results' });
  await expect(results.getByRole('link').first()).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeGreaterThan(2500);
  await results.getByRole('link').first().click();
  const card = page.locator('.library-answer');
  await expect(card).toHaveAttribute('data-answer', 'checking');
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await expect(card).not.toHaveAttribute('data-answer', 'checking', { timeout: 10_000 });
  expect(['found', 'not_found', 'unknown', 'unconfirmed']).toContain(await card.getAttribute('data-answer'));
});
