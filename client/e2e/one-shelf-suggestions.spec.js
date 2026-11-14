// Shelf suggestions (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
// Part 2; boards SuggestFirstOpen, SuggestShelf, DeskSuggestFirst and
// DeskSuggestShelf): five suggested books from the bundled list stand faded on
// the cold open; one opens like any book, and once added it is an ordinary
// saved book at the front while five suggestions remain.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

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
// The server's suggestions (step B): one book the chosen library is known to
// have (a stored "found"), then one related book. Authors not in the seed list.
const FOUND_HERE = { bookKey: 'v1:openlibrary:OL5735363W', title: 'Em and the Big Hoom', authors: ['Jerry Pinto'], workId: 'OL5735363W', inLibrary: true };
const RELATED = { bookKey: 'v1:openlibrary:OL1925458W', title: 'A Fine Balance', authors: ['Rohinton Mistry'], workId: 'OL1925458W' };
async function withServerSuggestions(page, { answer = Promise.resolve() } = {}) {
  const asked = { suggestions: [], events: [] };
  await page.route('**/api/v2/suggestions', async route => { asked.suggestions.push(route.request().postDataJSON()); await answer; return route.fulfill({ json: { books: [FOUND_HERE, RELATED] } }); });
  await page.route('**/api/v2/suggestions/events', route => { asked.events.push(route.request().postDataJSON()); return route.fulfill({ status: 202, json: {} }); });
  await page.addInitScript(({ libraryId }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: [], savedContent: [] }));
  }, { libraryId: LINKED_LIBRARY.id });
  return asked;
}
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

  test('a suggestion the chosen library is known to have carries its badge, with no library check', async ({ page }) => {
    const calls = await setup(page);
    const asked = await withServerSuggestions(page);
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    const badged = page.getByRole('link', { name: name(FOUND_HERE) + ', in ' + LINKED_LIBRARY.name + ', suggested' });
    await expect(badged).toBeVisible();
    await expect(badged.locator('.cover-badge-library')).toBeVisible();
    // The server's books first, then the seed list: still five, one per author.
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
    expect(await shelfNames(page)).toEqual([name(FOUND_HERE) + ', in ' + LINKED_LIBRARY.name + ', suggested', ...suggestedNames([RELATED, ...SEED.slice(0, 3)])]);
    await expect(page.getByRole('link', { name: name(RELATED) + ', suggested' }).locator('.cover-badge-library')).toHaveCount(0);
    // Faded cover, solid badge.
    expect(await faceOpacity(badged)).toBe('0.75');
    expect(await badged.locator('.cover-badge-library').evaluate(badge => getComputedStyle(badge).opacity)).toBe('1');
    // One request, with the chosen library and no search text; no library was asked.
    expect(asked.suggestions).toEqual([{ libraryId: LINKED_LIBRARY.id, recentBookKeys: [], excludeKeys: [] }]);
    expect(calls.filter(call => call.endpoint.startsWith('/holdings/') || call.endpoint === '/availability')).toEqual([]);
    expect(page.url()).toMatch(/\/app\/shelf$/);
    expect((await axe(page)).violations).toEqual([]);
    // The five drawn are counted as shown, once (book keys only).
    const shown = { event: 'shown', bookKeys: [FOUND_HERE, RELATED, ...SEED.slice(0, 3)].map(book => book.bookKey) };
    await expect.poll(() => asked.events).toEqual([shown]);
    // Opening it is counted (book key only); the book page asks the library as for any book.
    await badged.click();
    await expect(page).toHaveURL(new RegExp('/app/books/' + encodeURIComponent(FOUND_HERE.bookKey) + '$'));
    await expect(page.getByRole('heading', { level: 1, name: FOUND_HERE.title })).toBeVisible();
    await expect.poll(() => asked.events).toEqual([shown, { event: 'opened', bookKey: FOUND_HERE.bookKey }]);
    expect(asked.suggestions).toHaveLength(1);
    // Back to the same shelf: nothing new is counted.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(asked.events).toHaveLength(2);
  });

  test('a first answer that comes late does not change the books under the reader, and focus stays put', async ({ page }) => {
    await setup(page);
    let release;
    const asked = await withServerSuggestions(page, { answer: new Promise(resolve => { release = resolve; }) });
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    // The slots are held at first, then the seed list stands in for the late answer.
    await expect.poll(() => asked.suggestions.length).toBe(1);
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5, { timeout: 5000 });
    expect(await shelfNames(page)).toEqual(suggestedNames(SEED.slice(0, 5)));
    // The reader reaches one by keyboard; the answer then arrives.
    const third = page.getByRole('link', { name: name(SEED[2]) + ', suggested' });
    await third.focus();
    const answered = page.waitForResponse('**/api/v2/suggestions');
    release();
    await answered;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(await shelfNames(page)).toEqual(suggestedNames(SEED.slice(0, 5)));
    await expect(third).toBeFocused();
    // What stayed is what is counted.
    await expect.poll(() => asked.events).toEqual([{ event: 'shown', bookKeys: SEED.slice(0, 5).map(book => book.bookKey) }]);
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
