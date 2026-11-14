// Shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
// Part 2; boards SuggestFirstOpen, SuggestShelf, DeskSuggestFirst and
// DeskSuggestShelf): five suggested books from the bundled list stand faded on
// the cold open; one opens like any book, and once added it is an ordinary
// saved book at the front while five suggestions remain.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installPublicV2Fixture } from './public-v2-fixture.js';

const SEED = JSON.parse(readFileSync(new URL('../../shared/suggestions-seed.json', import.meta.url), 'utf8')).books;
const name = book => book.title + ' by ' + book.authors[0];
const suggestedNames = books => books.map(book => name(book) + ', suggested');
const WINGS = SEED[0];
const wingsUrl = new RegExp('/app/books/' + encodeURIComponent(WINGS.bookKey) + '$');

async function setup(page) {
  // Guest session; covers and the API are stubbed (no third-party hosts).
  const { calls } = await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/books/resolve', route => {
    const { bookKey } = route.request().postDataJSON();
    const seeded = SEED.find(book => book.bookKey === bookKey);
    if (!seeded) return route.fallback();
    return route.fulfill({ json: { book: { ...seeded, workId: bookKey.split(':').pop(), publishedDate: '1999' } } });
  });
  return calls;
}
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
const shelfNames = page => page.locator('.home-bookcase .cover3d').evaluateAll(links => links.map(link => link.getAttribute('aria-label')));
const faceOpacity = locator => locator.locator('.cover3d-face').evaluate(face => getComputedStyle(face).opacity);

test.describe('Shelf suggestions on a phone', () => {
  test('cold open shows five suggested books; open one, add it: it is first and solid, and five suggestions remain', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    const suggested = page.getByRole('link', { name: /, suggested$/ });
    await expect(suggested).toHaveCount(5);
    expect(await shelfNames(page)).toEqual(suggestedNames(SEED.slice(0, 5)));
    // Three a bay, one "Suggested" tag on each bay's plank; covers faded.
    await expect(page.locator('.bay-books')).toHaveCount(2);
    await expect(page.locator('.bay-tag')).toHaveText(['Suggested', 'Suggested']);
    expect(await faceOpacity(suggested.first())).toBe('0.75');
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole('link', { name: name(WINGS) + ', suggested' }).click();
    await expect(page).toHaveURL(wingsUrl);
    await expect(page.getByRole('heading', { level: 1, name: WINGS.title })).toBeVisible();
    await page.getByRole('button', { name: 'Add to my shelf' }).click();
    await expect(page.getByRole('button', { name: 'On my shelf' })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();

    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await expect(page.locator('.my-shelf-heading span')).toHaveText('1 book');
    const first = page.locator('.home-bookcase .cover3d').first();
    await expect(first).toHaveAccessibleName(name(WINGS));
    await expect(first).not.toHaveClass(/is-suggested/);
    expect(await faceOpacity(first)).toBe('1');
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
    expect((await shelfNames(page)).slice(1)).toEqual(suggestedNames(SEED.slice(1, 6)));
    // Reduced motion (playwright.config.js): nothing moves.
    expect(await first.locator('.cover3d-face').evaluate(face => getComputedStyle(face).animationName)).toBe('none');
    // No view switch for one saved book; nothing was asked of a library for the suggestions.
    await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
    expect(calls.filter(call => call.endpoint.startsWith('/holdings/'))).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')).savedBooks.map(book => book.bookKey))).toEqual([WINGS.bookKey]);
    expect((await axe(page)).violations).toEqual([]);
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });
    test('the saved book turns solid and the new suggestion fades in', async ({ page }) => {
      await setup(page);
      await page.goto('/app/shelf');
      await page.getByRole('link', { name: name(WINGS) + ', suggested' }).click();
      await page.getByRole('button', { name: 'Add to my shelf' }).click();
      await expect(page.getByRole('button', { name: 'On my shelf' })).toBeVisible();
      await page.getByRole('link', { name: 'Back' }).click();
      const first = page.locator('.home-bookcase .cover3d').first();
      await expect(first).toHaveClass(/is-turning-solid/);
      expect(await first.locator('.cover3d-face').evaluate(face => getComputedStyle(face).animationName)).toBe('suggestion-solid');
      const arrived = page.getByRole('link', { name: name(SEED[5]) + ', suggested' });
      await expect(arrived).toHaveClass(/is-arriving/);
      expect(await arrived.locator('.cover3d-face').evaluate(face => getComputedStyle(face).animationName)).toBe('suggestion-in');
      // Settled: full and 75% opacity.
      await expect.poll(() => faceOpacity(first)).toBe('1');
      await expect.poll(() => faceOpacity(arrived)).toBe('0.75');
    });
  });
});

test.describe('Shelf suggestions on a desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop browsers only');
  test.use({ viewport: { width: 1440, height: 900 } });

  test('cold open shows five suggested books; open one, add it: it is first and solid, and five suggestions remain', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
    expect(await shelfNames(page)).toEqual(suggestedNames(SEED.slice(0, 5)));
    await expect(page.locator('.bay-books')).toHaveCount(1);
    await expect(page.locator('.bay-tag')).toHaveText(['Suggested']);
    const cover = await page.locator('.cover3d').first().boundingBox();
    expect([Math.round(cover.width), Math.round(cover.height)]).toEqual([120, 180]);
    expect((await axe(page)).violations).toEqual([]);

    // It opens in the middle slot like any book, outlined on the shelf beside it.
    await page.getByRole('link', { name: name(WINGS) + ', suggested' }).click();
    await expect(page).toHaveURL(wingsUrl);
    const slot = page.locator('.desk-slot');
    await expect(slot.getByRole('heading', { level: 1, name: WINGS.title })).toBeVisible();
    await expect(page.locator('.cover3d.is-open')).toHaveCount(1);
    await expect(page.locator('.cover3d.is-open')).toHaveClass(/is-suggested/);
    await slot.getByRole('button', { name: 'Add to my shelf' }).click();
    await expect(slot.getByRole('button', { name: 'On my shelf' })).toBeVisible();
    // The shelf beside the book: now a saved book at the front, still outlined.
    const first = page.locator('.home-bookcase .cover3d').first();
    await expect(first).toHaveAttribute('aria-label', name(WINGS));
    await expect(first).toHaveClass(/is-open/);
    await expect(first).not.toHaveClass(/is-suggested/);

    await slot.getByRole('button', { name: 'Close the book' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
    expect(await faceOpacity(first)).toBe('1');
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
    expect(await shelfNames(page)).toEqual([name(WINGS), ...suggestedNames(SEED.slice(1, 6))]);
    // One bay of six: the saved book and the run of five suggestions with its tag.
    await expect(page.locator('.bay-books')).toHaveCount(1);
    await expect(page.locator('.bay-tag')).toHaveCount(1);
    expect((await axe(page)).violations).toEqual([]);
  });
});
