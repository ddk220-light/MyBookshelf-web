// One-shelf home (plan Phase 4). Runs only against a build made with
// VITE_ONE_SHELF=true:
//   VITE_ONE_SHELF=true ONE_SHELF_E2E=true npm run test:e2e --workspace=client -- one-shelf-home.spec.js
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BOOK, CANDIDATE_BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';
import { installBarcodeCamera } from './camera-frames.js';

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
const bookUrl = new RegExp('/app/books/' + encodeURIComponent(BOOK.bookKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
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

  test('a very long title and author stay inside the typeset cover', async ({ page }) => {
    const long = book(1, { title: 'The Chronicle of Supercalifragilisticexpialidocious Adventures Across Seventeen Kingdoms',
      authors: ['Bartholomew Maximilian Featherstonehaugh-Worthington III'] });
    await setup(page, { saved: [long] });
    await page.goto('/app/shelf');
    const inside = locator => locator.evaluate(cover => {
      const face = cover.querySelector('.cover3d-face').getBoundingClientRect();
      return [...cover.querySelectorAll('.cover3d-title, .cover3d-author')].every(text => {
        const box = text.getBoundingClientRect();
        return box.left >= face.left - 0.5 && box.right <= face.right + 0.5;
      });
    });
    await expect(page.locator('.home-bookcase .cover3d')).toHaveCount(1);
    expect(await inside(page.locator('.home-bookcase .cover3d'))).toBe(true);
  });

  test('reduced motion: the panel does not slide', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Account and settings' }).click();
    expect(await page.locator('.side-panel').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  });
});

// Search on the shelf (plan Phase 5): Results, SearchStates and Shelf boards.
test.describe('One-shelf search', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');
  const MINE = book(1, { bookKey: BOOK.bookKey, isbn13: BOOK.isbn13, title: BOOK.title, authors: BOOK.authors });
  const searchFor = async (page, text) => {
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.fill(text);
    await input.press('Enter');
  };
  const searchRequests = page => {
    const queries = [];
    page.on('request', request => { if (request.url().endsWith('/api/v2/books/search')) queries.push(request.postDataJSON()); });
    return queries;
  };

  test('results on the shelf: my book first with the bookmark, list view, a book and Back, then the shelf', async ({ page }) => {
    await setup(page, { saved: [MINE, book(2)], libraryId: LINKED_LIBRARY.id });
    const queries = searchRequests(page);
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await searchFor(page, 'innovator');
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('link')).toHaveCount(2);
    await expect(results.getByRole('link').first()).toHaveAttribute('aria-label', BOOK.title + ' by ' + BOOK.authors[0] + ', on my shelf');
    await expect(results.locator('.cover-badge-mine')).toHaveCount(1);
    await expect(results.locator('.cover-badge-library')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'My shelf' })).toHaveCount(0);
    // Public data only; the text is nowhere but the field.
    expect(queries).toEqual([{ query: 'innovator' }]);
    expect(page.url()).toMatch(/\/app\/shelf$/);
    expect(JSON.stringify(await page.evaluate(() => history.state))).not.toContain('innovator');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain('innovator');
    expect((await axe(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'List view' }).click();
    await expect(results.locator('.shelf-list-item')).toHaveCount(2);
    await page.getByRole('button', { name: 'Shelf view' }).click();

    await results.getByRole('link', { name: CANDIDATE_BOOK.title + ' by ' + CANDIDATE_BOOK.authors[0] }).click();
    await expect(page).toHaveURL(/\/app\/books\//);
    await page.goBack();
    await expect(results.getByRole('link')).toHaveCount(2);
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('innovator');
    expect(queries).toHaveLength(1);

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toHaveValue('');
    await searchFor(page, 'innovator');
    await expect(results.getByRole('link')).toHaveCount(2);
    await page.getByRole('button', { name: 'Back to my shelf', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await searchFor(page, 'innovator');
    await page.getByRole('button', { name: 'Clear search and go back to my shelf' }).click();
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeFocused();
  });

  test('searching, nothing found, failure and offline', async ({ page, context }) => {
    await setup(page);
    let answer = 'hold';
    let release;
    await page.route('**/api/v2/books/search', async route => {
      if (answer === 'hold') { await new Promise(resolve => { release = resolve; }); return route.fulfill({ json: { kind: 'candidates', candidates: [] } }).catch(() => {}); }
      if (answer === 'none') return route.fulfill({ json: { kind: 'candidates', candidates: [], nextOffset: null } });
      if (answer === 'fail') return route.fulfill({ status: 503, json: { error: { code: 'METADATA_UNAVAILABLE', message: 'Unavailable.' } } });
      return route.fulfill({ json: { kind: 'candidates', candidates: [BOOK] } });
    });
    const queries = searchRequests(page);
    await page.goto('/app/shelf');
    await searchFor(page, 'wings of fire');
    await expect(page.locator('.ghost-book')).toHaveCount(9);
    expect((await axe(page)).violations).toEqual([]);
    // A newer search cancels the one still running.
    answer = 'none';
    await searchFor(page, 'wngs fyre kalm');
    await expect(page.getByRole('heading', { name: 'No books found' })).toBeVisible();
    release?.();
    await expect(page.getByRole('button', { name: 'Scan the barcode' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    answer = 'fail';
    await searchFor(page, 'wings of fire');
    await expect(page.getByRole('heading', { name: 'Couldn’t search' })).toBeVisible();
    await expect(page.getByText('No books found')).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    answer = 'ok';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('region', { name: 'Search results' }).getByRole('link')).toHaveCount(1);

    const before = queries.length;
    await context.setOffline(true);
    await searchFor(page, 'innovator');
    await expect(page.getByRole('heading', { name: 'Couldn’t search' })).toBeVisible();
    expect(queries.length).toBe(before);
    await context.setOffline(false);
  });

  test('an ISBN goes straight to its book', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await searchFor(page, '9781625275868');
    await expect(page).toHaveURL(new RegExp('/app/books/' + encodeURIComponent(BOOK.bookKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  });

  for (const light of ['lamplight', 'ink']) test(`results stay legible in ${light}`, async ({ page }) => {
    await setup(page, { saved: [MINE], light });
    await page.goto('/app/shelf');
    await searchFor(page, 'innovator');
    await expect(page.locator('.cover-badge-mine')).toHaveCount(1);
    expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
  });

  test('reduced motion: results replace the shelf without a slide', async ({ page }) => {
    await setup(page, { saved: [book(1)] });
    await page.goto('/app/shelf');
    await searchFor(page, 'innovator');
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
    await expect(page.locator('.shelf-stage.is-sliding')).toHaveCount(0);
    await expect(page.locator('.stage-pane')).toHaveCount(1);
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });
    test('the shelf moves down and the results come down from above, then back', async ({ page }) => {
      await setup(page, { saved: [book(1)] });
      await page.goto('/app/shelf');
      await searchFor(page, 'innovator');
      await expect(page.locator('.shelf-stage.slide-down')).toHaveCount(1);
      expect(await page.locator('.stage-results').evaluate(element => getComputedStyle(element).animationName)).toBe('stage-from-above');
      await expect(page.locator('.shelf-stage.is-sliding')).toHaveCount(0);
      await expect(page.locator('.stage-pane')).toHaveCount(1);
      await page.getByRole('button', { name: 'Back to my shelf', exact: true }).click();
      expect(await page.locator('.stage-shelf').evaluate(element => getComputedStyle(element).animationName)).toBe('stage-from-below');
      await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    });
  });
});

// Scan pop-up (plan Phase 6): Scan and ScanStates boards. The camera is a real
// canvas stream with EAN-13 bars (camera-frames.js); the shipped decoder reads it.
test.describe('One-shelf scan', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');
  const track = page => page.evaluate(() => window.__testCameraTrack?.readyState ?? null);
  const showBarcode = (page, code) => page.evaluate(value => { window.__testBarcode = value; }, code);

  test('scans a barcode from the empty shelf and opens the book; Back returns to the shelf', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await installBarcodeCamera(page);
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan the barcode on a book' }).click();
    await expect(page).toHaveURL(bookUrl, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
    expect(await track(page)).toBe('ended');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')).recentBooks[0].source)).toBe('camera');
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('scanning: camera frame and one line; Back and Escape close it, release the camera and return focus', async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { code: '' });
    await setup(page, { saved: [book(1)] });
    await page.goto('/app/shelf');
    const scanButton = page.getByRole('button', { name: 'Scan a barcode' });
    await scanButton.click();
    const dialog = page.getByRole('dialog', { name: 'Scan the barcode' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Barcode on the back cover')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'ISBN' })).toHaveAttribute('placeholder', 'ISBN, 10 or 13 digits');
    await expect.poll(() => track(page)).toBe('live');
    expect(await dialog.locator('video').evaluate(video => video.srcObject !== null)).toBe(true);
    expect(page.url()).toMatch(/\/app\/shelf$/);
    expect((await axe(page)).violations).toEqual([]);
    // Focus stays in the pop-up.
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
    }
    await page.goBack();
    await expect(dialog).toBeHidden();
    expect(await track(page)).toBe('ended');
    await expect(scanButton).toBeFocused();
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();

    await scanButton.click();
    await expect.poll(() => track(page)).toBe('live');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await track(page)).toBe('ended');
    await expect(scanButton).toBeFocused();
    expect(page.url()).toMatch(/\/app\/shelf$/);
    // The pop-up's history entry went with it.
    await page.goBack();
    expect(page.url()).not.toMatch(/\/app\/shelf$/);
  });

  test('not an ISBN: one line and the camera stays on; the second miss: Couldn’t match, Scan again, Search by title', async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { code: '5012345678900' });
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    const dialog = page.getByRole('dialog', { name: 'Scan the barcode' });
    await expect(dialog.getByRole('status')).toHaveText('Not an ISBN. Try the back cover.', { timeout: 15000 });
    await expect(dialog.getByRole('textbox', { name: 'ISBN' })).toHaveAttribute('placeholder', 'Or type the ISBN');
    expect(await track(page)).toBe('live');
    expect((await axe(page)).violations).toEqual([]);

    await showBarcode(page, '4006381333931');
    const noMatch = page.getByRole('dialog', { name: 'Couldn’t match that barcode' });
    await expect(noMatch).toBeVisible({ timeout: 15000 });
    expect(await track(page)).toBe('ended');
    await expect(noMatch.getByRole('button', { name: 'Search by title' })).toBeFocused();
    expect((await axe(page)).violations).toEqual([]);

    await noMatch.getByRole('button', { name: 'Scan again' }).click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => track(page)).toBe('live');
    await expect(dialog.getByRole('status')).toHaveText('Not an ISBN. Try the back cover.', { timeout: 15000 });
    await showBarcode(page, '5012345678900');
    await expect(noMatch).toBeVisible({ timeout: 15000 });
    await noMatch.getByRole('button', { name: 'Search by title' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeFocused();
    expect(await track(page)).toBe('ended');
    // Nothing scanned is kept in the address or the browser.
    expect(page.url()).toMatch(/\/app\/shelf$/);
    expect(JSON.stringify(await page.evaluate(() => history.state)) + await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toMatch(/5012345678900|4006381333931/);
  });

  test('camera refused: Allow camera inside the camera box asks again; the ISBN field stays', async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { camera: 'denied' });
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    const dialog = page.getByRole('dialog', { name: 'Scan the barcode' });
    const allow = dialog.getByRole('button', { name: 'Allow camera' });
    await expect(allow).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'ISBN' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await page.evaluate(() => { window.__testCameraAllow = true; });
    await allow.click();
    await expect(page).toHaveURL(bookUrl, { timeout: 15000 });
    expect(await page.evaluate(() => window.__testCameraRequests)).toBe(2);
  });

  test('no camera: straight to Type the ISBN; an ISBN with no known book: Couldn’t match; a known one opens', async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { camera: 'none' });
    await setup(page);
    await page.route('**/api/v2/books/search', route => {
      const query = route.request().postDataJSON().query;
      if (query !== '9780306406157') return route.fallback();
      return route.fulfill({ json: { kind: 'exact', book: { bookKey: 'v1:isbn:' + query, isbn13: query, title: 'ISBN ' + query, authors: [], metadataStatus: 'missing' } } });
    });
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    const dialog = page.getByRole('dialog', { name: 'Type the ISBN' });
    await expect(dialog).toBeVisible();
    const field = dialog.getByRole('textbox', { name: 'ISBN' });
    await expect(field).toBeFocused();
    await expect(dialog.locator('video')).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    await field.fill('0-306-40615-2');
    await field.press('Enter');
    const noMatch = page.getByRole('dialog', { name: 'Couldn’t match that barcode' });
    await expect(noMatch).toBeVisible();
    await noMatch.getByRole('button', { name: 'Try again' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'ISBN' }).fill(BOOK.isbn13);
    await dialog.getByRole('button', { name: 'Find' }).click();
    await expect(page).toHaveURL(bookUrl);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('"No books found" opens the same pop-up over the results', async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { camera: 'none' });
    await setup(page);
    await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: [], nextOffset: null } }));
    await page.goto('/app/shelf');
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.fill('wngs fyre');
    await input.press('Enter');
    await page.getByRole('button', { name: 'Scan the barcode' }).click();
    await expect(page.getByRole('dialog', { name: 'Type the ISBN' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No books found' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan the barcode' })).toBeFocused();
  });

  for (const light of ['lamplight', 'ink']) test(`the pop-up stays legible in ${light}`, async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { code: '5012345678900' });
    await setup(page, { light });
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Not an ISBN. Try the back cover.', { timeout: 15000 });
    expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
    await showBarcode(page, '4006381333931');
    await expect(page.getByRole('dialog', { name: 'Couldn’t match that barcode' })).toBeVisible({ timeout: 15000 });
    expect((await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()).violations).toEqual([]);
  });

  test('reduced motion: the pop-up does not slide', async ({ page }) => {
    await installBarcodeCamera(page, 'missing', false, { camera: 'none' });
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    expect(await page.locator('.scan-dialog[open]').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });
    test('the pop-up rises from the bottom', async ({ page }) => {
      await installBarcodeCamera(page, 'missing', false, { camera: 'none' });
      await setup(page);
      await page.goto('/app/shelf');
      await page.getByRole('button', { name: 'Scan a barcode' }).click();
      expect(await page.locator('.scan-dialog[open]').evaluate(element => getComputedStyle(element).animationName)).toBe('scan-in');
    });
  });
});

// Accounts switched off (staging): the reader is simply a guest.
test.describe('One-shelf with accounts switched off', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');
  test('no account notice on the home screen and no account buttons in the side panel', async ({ page }) => {
    await setup(page, { saved: [book(1)] });
    await page.route('**/api/account/session', route => route.fulfill({ status: 503, json: { error: { code: 'ACCOUNT_DISABLED', message: 'Accounts aren’t enabled here yet. You can continue browsing.' } } }));
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await expect(page.getByText(/Accounts aren’t/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Check account availability' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Take your shelf with you' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Account and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Account and settings' });
    await expect(panel.getByRole('heading', { name: 'My library' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Create account' })).toHaveCount(0);
    await expect(panel.getByRole('link', { name: 'Log in' })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    await page.keyboard.press('Escape');
    // The guest shelf works: a search and a save are possible.
    await page.getByRole('searchbox', { name: 'Search for a book' }).fill(BOOK.isbn13);
    await page.getByRole('searchbox', { name: 'Search for a book' }).press('Enter');
    await expect(page).toHaveURL(bookUrl);
  });
});
