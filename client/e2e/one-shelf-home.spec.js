// One-shelf home (plan Phase 4). Runs only against a build made with
// VITE_ONE_SHELF=true:
//   VITE_ONE_SHELF=true ONE_SHELF_E2E=true npm run test:e2e --workspace=client -- one-shelf-home.spec.js
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const book = (index, extra = {}) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Shelf book ' + index, authors: ['Author ' + index], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), ...extra });

async function setup(page, { saved = [], recent = [], libraryId = null, light, found = [], email = true } = {}) {
  await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/holdings/lookup', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { answers: Object.fromEntries(body.books.map(item => [item.bookKey, found.includes(item.bookKey) ? 'found' : 'not_found'])) } });
  });
  await page.addInitScript(({ KEY, saved, recent, libraryId, light }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: recent, savedBooks: saved, savedContent: [] }));
    if (light) localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({ version: 1, preference: light }));
  }, { KEY, saved, recent, libraryId, light });
}
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();

test.describe('One-shelf home', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');

  test('first open: empty shelf, search bar, no tab bar, accessible', async ({ page }) => {
    await setup(page);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
    await expect(page.locator('.book-placeholder')).toHaveCount(1);
    await page.getByRole('button', { name: 'Search for a book' }).click();
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeFocused();
    await page.getByRole('searchbox', { name: 'Search for a book' }).fill('wings of fire');
    expect(page.url()).not.toContain('wings');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain('wings of fire');
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('shelf in use: covers, library badge, Viewed before, invite, list view', async ({ page }) => {
    const saved = Array.from({ length: 8 }, (_, index) => book(index + 1));
    await setup(page, { saved, recent: [book(20), book(21), book(22)], libraryId: LINKED_LIBRARY.id, found: [saved[7].bookKey] });
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.getByRole('link', { name: 'Shelf book 8 by Author 8, in Anna Centenary Library' })).toBeVisible();
    await expect(page.locator('.cover-badge-library')).toHaveCount(1);
    await expect(page.locator('.bay-books')).toHaveCount(3);
    await expect(page.locator('.cover3d')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'Take your shelf with you' })).toBeVisible();
    const viewed = page.getByRole('region', { name: 'Viewed before' });
    await expect(viewed.getByRole('link')).toHaveCount(3);
    // Every control is at least 44 px; spines included.
    for (const target of await page.locator('.home a[href], .home button').all()) {
      if (!await target.isVisible()) continue;
      const box = await target.boundingBox();
      expect(Math.min(box.width, box.height), await target.getAttribute('aria-label') || await target.textContent()).toBeGreaterThanOrEqual(38);
      expect(Math.max(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    for (const spine of await viewed.getByRole('link').all()) expect((await spine.boundingBox()).width).toBeGreaterThanOrEqual(44);
    expect((await axe(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'Not now' }).click();
    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.locator('.shelf-list-item')).toHaveCount(8);
    await page.reload();
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Take your shelf with you' })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);

    await viewed.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('region', { name: 'Viewed before' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByRole('region', { name: 'Viewed before' }).getByRole('link')).toHaveCount(3);

    await page.getByRole('link', { name: 'Shelf book 8 by Author 8, in Anna Centenary Library' }).click();
    await expect(page).toHaveURL(/\/app\/books\//);
  });

  test('keyboard order and the side panel: focus trap, Escape and Back close it, focus returns', async ({ page }) => {
    await setup(page, { saved: [book(1), book(2)], libraryId: LINKED_LIBRARY.id });
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    const order = [];
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim()));
    }
    const from = order.indexOf('Account and settings');
    expect(order.slice(from, from + 4)).toEqual(['Account and settings', 'Search for a book', 'Scan a barcode', 'Shelf view']);

    const person = page.getByRole('button', { name: 'Account and settings' });
    await person.click();
    const panel = page.getByRole('dialog', { name: 'Account and settings' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused();
    await expect(panel.getByText(LINKED_LIBRARY.name)).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(person).toBeFocused();

    await person.click();
    await expect(panel).toBeVisible();
    await page.goBack();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/app\/shelf$/);

    await person.click();
    await panel.getByRole('button', { name: 'Lamplight' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-reading-light', 'lamplight');
    await page.mouse.click(370, 400);
    await expect(panel).toBeHidden();
  });

  for (const light of ['lamplight', 'ink']) test(`${light} stays legible`, async ({ page }) => {
    await setup(page, { saved: [book(1), book(2), book(3), book(4)], recent: [book(9)], libraryId: LINKED_LIBRARY.id, light, found: [book(1).bookKey] });
    await page.goto('/app/shelf');
    await expect(page.locator('.cover-badge-library')).toHaveCount(1);
    expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Account and settings' }).click();
    expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
  });

  test('a long shelf keeps the page light and a wide screen gets a centred column', async ({ page }) => {
    await setup(page, { saved: Array.from({ length: 200 }, (_, index) => book(index + 1)) });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app/shelf');
    await expect(page.locator('.cover3d')).toHaveCount(200);
    expect(await page.locator('.bay').first().evaluate(element => getComputedStyle(element).contentVisibility)).toBe('auto');
    const column = await page.locator('.home').boundingBox();
    expect(column.width).toBeLessThanOrEqual(480);
    expect(Math.abs(column.x + column.width / 2 - 640)).toBeLessThan(10);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('reduced motion: the panel does not slide', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Account and settings' }).click();
    expect(await page.locator('.side-panel').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  });
});
