// Desktop layout (docs/plans/2026-11-14-desktop-and-shelf-suggestions.md,
// Part 1; boards DeskShelf, DeskResults, DeskBook and DeskLibrary): the left
// column from 1100 px, the middle slot for a book or side page, the library
// picker in the column, no scan button, the cold open with five suggested
// books (DeskSuggestFirst), and the icon rail between phone and wide widths. Runs in the desktop browser
// projects at its own viewport sizes.
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const WIDE = { width: 1440, height: 900 };
const book = (index, extra = {}) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Shelf book ' + index, authors: ['Author ' + index], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, 60 - index)).toISOString(), ...extra });
const MINE = book(1, { bookKey: BOOK.bookKey, isbn13: BOOK.isbn13, title: BOOK.title, authors: BOOK.authors });
const TWELVE = [MINE, ...Array.from({ length: 11 }, (_, index) => book(index + 2))];
const USER = { id: 'reader-1', name: 'Reader', email: 'reader@example.test', emailVerified: true };
const versions = { settingsRevision: 0, shelfRevision: 0, historyGeneration: 0, historyEnabled: true };
const bookPath = '/app/books/' + encodeURIComponent(BOOK.bookKey);
const bookUrl = new RegExp(bookPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
async function noViolations(page, screen) {
  const { violations } = await axe(page);
  expect(violations.map(v => screen + ': ' + v.id + ' ' + v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')), screen).toEqual([]);
}

async function setup(page, { saved = TWELVE, recent = [book(30), book(31), book(32)], libraryId = LINKED_LIBRARY.id, light = 'daylight', signedIn = false } = {}) {
  await installPublicV2Fixture(page);
  await page.route('**/api/v2/holdings/lookup', route => route.fulfill({ json: { answers: Object.fromEntries(route.request().postDataJSON().books.map((item, index) => [item.bookKey, index % 2 ? 'not_found' : 'found'])) } }));
  await page.route('**/api/account/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/account', '');
    if (path === '/session') return route.fulfill({ json: signedIn ? { status: 'authenticated', user: USER, csrfToken: 'csrf-1' } : { status: 'guest' } });
    if (path === '/capabilities') return route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } });
    if (path === '/state') return route.fulfill({ json: { profile: { ...USER, profileRevision: 0 }, selectedLibraryId: libraryId, selectedLibrary: libraryId ? LINKED_LIBRARY : null, libraryRemoved: false, counts: { saved: saved.length, recent: recent.length }, ...versions } });
    if (path === '/books') return route.fulfill({ json: { books: saved.map(item => ({ ...item, savedAt: item.viewedAt })), nextCursor: null, ...versions } });
    if (path === '/history') return route.fulfill({ json: { books: recent, ...versions } });
    if (path === '/history/views') return route.fulfill({ json: { status: 'recorded', referenceId: '00000000-0000-4000-8000-000000000009', viewedAt: new Date().toISOString(), ...versions } });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found.' } } });
  });
  await page.addInitScript(({ KEY, saved, recent, libraryId, light }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: recent, savedBooks: saved, savedContent: [] }));
    localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({ version: 1, preference: light }));
  }, { KEY, saved, recent, libraryId, light });
}

const column = page => page.getByRole('complementary', { name: 'Library and account' });
const slot = page => page.locator('.desk-slot');
const focusedName = page => page.evaluate(() => { const element = document.activeElement; return element?.getAttribute('aria-label') || element?.labels?.[0]?.textContent?.trim() || element?.textContent?.trim().slice(0, 60) || element?.tagName; });

test.describe('Desktop layout', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop browsers only');
  test.use({ viewport: WIDE });

  test('shelf: left column, six books a bay, search bar and view switch, no person icon, no scan button', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
    const side = column(page);
    await expect(side.getByText('MyBookshelf')).toBeVisible();
    await expect(side.getByRole('heading', { name: 'My library' })).toBeVisible();
    await expect(side.getByText(LINKED_LIBRARY.name)).toBeVisible();
    await expect(side.getByRole('button', { name: 'Change library' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Create account' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(side.getByRole('group', { name: 'Reading light' }).getByRole('button')).toHaveCount(3);
    for (const name of ['Report a problem', 'Privacy', 'About']) await expect(side.getByRole('link', { name })).toBeVisible();
    expect((await side.boundingBox()).width).toBe(300);
    await expect(page.getByRole('button', { name: 'Account and settings' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Scan a barcode' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Take your shelf with you' })).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'View' })).toBeVisible();
    await expect(page.locator('.my-shelf-heading span')).toHaveText('12 books');
    // 12 saved books, then five suggestions (DeskSuggestShelf board): 6, 6 and 5.
    const bays = page.locator('.home-bookcase .bay-books');
    await expect(bays).toHaveCount(3);
    await expect(bays.first().locator('.cover3d')).toHaveCount(6);
    await expect(bays.nth(2).locator('.cover3d.is-suggested')).toHaveCount(5);
    await expect(page.locator('.bay-tag')).toHaveCount(1);
    const cover = await page.locator('.home-bookcase .cover3d').first().boundingBox();
    expect(Math.round(cover.width)).toBe(120);
    expect(Math.round(cover.height)).toBe(180);
    const search = await page.locator('.search-bar').boundingBox();
    expect(search.width).toBeLessThanOrEqual(680);
    await expect(page.getByRole('region', { name: 'Viewed before' }).getByRole('link')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'List view' }).click();
    await expect(page.locator('.shelf-list-item')).toHaveCount(17);
    await expect(page.locator('.shelf-list-cover.is-suggested')).toHaveCount(5);
  });

  test('signed in: the email, Account settings in the middle slot, Log out; signed out accounts stay out when switched off', async ({ page }) => {
    await setup(page, { signedIn: true });
    await page.goto('/app/shelf');
    const side = column(page);
    await expect(side.getByText(USER.email)).toBeVisible();
    await expect(side.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(side.getByRole('link', { name: 'Create account' })).toHaveCount(0);
    await side.getByRole('link', { name: 'Account settings' }).click();
    await expect(page).toHaveURL(/\/app\/settings\/account$/);
    await expect(slot(page).getByText(USER.email)).toBeVisible();
    await expect(slot(page).getByRole('button', { name: 'Change password' })).toBeVisible();
    // The shelf is still drawn beside the page (hidden from assistive technology).
    await expect(page.locator('#my-shelf-heading')).toBeAttached();
    await slot(page).getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(slot(page)).toHaveCount(0);
  });

  test('accounts switched off: no account section in the column', async ({ page }) => {
    await setup(page);
    await page.route('**/api/account/session', route => route.fulfill({ status: 503, json: { error: { code: 'ACCOUNT_DISABLED', message: 'Accounts are not enabled.' } } }));
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
    await expect(column(page).getByRole('heading', { name: 'My library' })).toBeVisible();
    await expect(column(page).getByRole('heading', { name: 'Account' })).toHaveCount(0);
    await expect(column(page).getByRole('link', { name: 'Log in' })).toHaveCount(0);
  });

  test('cold open: the search leads, no empty shelves and no scan button; five suggested books on one bay', async ({ page }) => {
    await setup(page, { saved: [], recent: [], libraryId: null });
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await expect(page.getByText('Add books to your shelf and search in your library')).toBeVisible();
    await expect(page.getByRole('button', { name: /Scan|Search for a book/ })).toHaveCount(0);
    await expect(page.locator('.cold-open-suggestions .bay')).toHaveCount(1);
    await expect(page.locator('.cold-open-suggestions .cover3d.is-suggested')).toHaveCount(5);
    await expect(page.locator('.bay-tag')).toHaveText(['Suggested']);
    await expect(column(page).getByRole('button', { name: 'Find my library' })).toBeVisible();
    // The larger search bar stands under the heading, above the books (DeskSuggestFirst board).
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    const [heading, bar, shelf] = await Promise.all([page.getByRole('heading', { name: 'Ready to search' }).boundingBox(), page.locator('.search-bar').boundingBox(),
      page.locator('.cold-open-suggestions').boundingBox()]);
    expect(heading.y + heading.height).toBeLessThan(bar.y);
    expect(bar.y + bar.height).toBeLessThan(shelf.y);
    expect(Math.round(bar.height)).toBe(60);
    expect(bar.width).toBeLessThanOrEqual(640);
    await input.click();
    await expect(input).toBeFocused();
    await noViolations(page, 'cold open');
  });

  test('a book opens in the middle slot: the column narrows, the shelf moves right and outlines it; ×, Escape, the shelf and Back close it', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    const cover = page.locator('.home-bookcase').getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') });
    const shelfBefore = await page.locator('.desk-shelf-area').boundingBox();
    await cover.click();
    await expect(page).toHaveURL(bookUrl);
    await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    const close = slot(page).getByRole('button', { name: 'Close the book' });
    await expect(close).toBeFocused();
    expect(Math.round((await column(page).boundingBox()).width)).toBe(248);
    expect(Math.round((await slot(page).boundingBox()).width)).toBe(600);
    const area = page.locator('.desk-shelf-area');
    expect((await area.boundingBox()).x).toBe(848);
    expect(shelfBefore.x).toBe(300);
    await expect(area).toHaveAttribute('inert', '');
    await expect(area).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.cover3d.is-open')).toHaveCount(1);
    // The shelf keeps its width: it is cut off at the right edge, not squeezed.
    expect(Math.round((await page.locator('.desk-shelf').boundingBox()).width)).toBe(1140);
    await expect(page.locator('#my-shelf-heading')).toBeAttached();

    await close.click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(slot(page)).toHaveCount(0);
    await expect(cover).toBeFocused();

    await cover.click();
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(cover).toBeFocused();

    await cover.click();
    await expect(slot(page)).toBeVisible();
    await page.mouse.click(1200, 500);
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(slot(page)).toHaveCount(0);

    await cover.click();
    await expect(slot(page)).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(slot(page)).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(bookUrl);
    await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    await noViolations(page, 'book open');
  });

  test('a direct book address shows the shelf with that book open in the middle', async ({ page }) => {
    await setup(page);
    await page.goto(bookPath);
    await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    await expect(column(page)).toBeVisible();
    await expect(page.locator('.desk-shelf .cover3d:not(.is-suggested)')).toHaveCount(12);
    await expect(page.locator('.cover3d.is-open')).toHaveCount(1);
    await expect(slot(page).getByRole('button', { name: 'Close the book' })).toBeFocused();
    // No shelf entry behind it: closing puts the shelf in its place.
    await slot(page).getByRole('button', { name: 'Close the book' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
  });

  test('adding a book in the slot puts it on the shelf beside it', async ({ page }) => {
    await setup(page, { saved: TWELVE.slice(1) });
    await page.goto('/app/shelf');
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.fill('innovator');
    await input.press('Enter');
    const results = page.getByRole('region', { name: 'Search results' });
    await results.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).click();
    await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    // The results the book was opened from stay beside it.
    await expect(page.locator('.desk-shelf .search-results')).toBeAttached();
    await slot(page).getByRole('button', { name: 'Add to my shelf' }).click();
    await expect(slot(page).getByRole('button', { name: 'On my shelf' })).toBeVisible();
    await expect(page.locator('.shelf-book-toast')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to my shelf', exact: true }).click();
    await expect(page.locator('.my-shelf-heading span')).toHaveText('12 books');
  });

  test('choosing a library in the left column, with the shelf still there', async ({ page }) => {
    await setup(page, { libraryId: null });
    await page.goto('/app/shelf');
    await column(page).getByRole('button', { name: 'Find my library' }).click();
    const picker = column(page).getByRole('region', { name: 'Find your library' });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('button', { name: 'Libraries near me' })).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
    await expect(column(page).getByRole('heading', { name: 'Reading light' })).toHaveCount(0);
    await noViolations(page, 'library picker');
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(column(page).getByRole('button', { name: 'Find my library' })).toBeFocused();

    await column(page).getByRole('button', { name: 'Find my library' }).click();
    await picker.getByLabel('City, town or library name').fill('Chennai');
    const row = picker.getByRole('button', { name: new RegExp(LINKED_LIBRARY.name) });
    await expect(row).toBeVisible();
    await row.click();
    await expect(picker).toHaveCount(0);
    await expect(column(page).getByText(LINKED_LIBRARY.name)).toBeVisible();
    await expect(column(page).getByRole('button', { name: 'Change library' })).toBeFocused();
    expect(page.url()).not.toContain('Chennai');
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toContain('Chennai');

    // Nothing matches: one tap sends a request.
    await page.route('**/api/v2/libraries/discover', route => route.fulfill({ json: { libraries: [], total: 0, nextOffset: null } }));
    await page.route('**/api/v2/library-requests', route => route.fulfill({ status: 202, json: { status: 'received' } }));
    await column(page).getByRole('button', { name: 'Change library' }).click();
    await picker.getByLabel('City, town or library name').fill('Nowhere Town');
    await expect(picker.getByRole('button', { name: 'Request to add “Nowhere Town”' })).toBeVisible();
    // Back closes the picker too (it is a history entry).
    await page.goBack();
    await expect(picker).toHaveCount(0);
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });

  test('Find my library on an open book: the picker opens in the column and the book stays', async ({ page }) => {
    await setup(page, { libraryId: null });
    await page.goto(bookPath);
    await slot(page).getByRole('button', { name: 'Find my library' }).click();
    const picker = column(page).getByRole('region', { name: 'Find your library' });
    await expect(picker).toBeVisible();
    await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    await picker.getByLabel('City, town or library name').fill('Chennai');
    await picker.getByRole('button', { name: new RegExp(LINKED_LIBRARY.name) }).click();
    await expect(picker).toHaveCount(0);
    await expect(slot(page).locator('.library-answer')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.library-answer')))).toBe(true);
  });

  test('side pages open in the middle slot: Privacy, Report a problem, About, Log in', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    const privacy = column(page).getByRole('link', { name: 'Privacy' });
    await privacy.click();
    await expect(page).toHaveURL(/\/app\/privacy$/);
    await expect(slot(page).getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back' })).toHaveCount(0);
    await expect(slot(page).getByRole('button', { name: 'Close' })).toBeFocused();
    await expect(page.locator('.desk-shelf .cover3d').first()).toBeVisible();
    await noViolations(page, 'privacy in the slot');
    // Another page from the column takes its place; × goes back to the shelf.
    await column(page).getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(/\/app\/about$/);
    await expect(slot(page).getByRole('heading', { level: 1, name: 'MyBookshelf' })).toBeVisible();
    await slot(page).getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(privacy).toBeFocused();

    await column(page).getByRole('link', { name: 'Report a problem' }).click();
    await expect(slot(page).getByRole('heading', { level: 1, name: 'Report a problem' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/app\/shelf$/);

    await column(page).getByRole('link', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/app\/account\/sign-in$/);
    await expect(slot(page).getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    await expect(slot(page).getByLabel('Email')).toBeVisible();
    // The shelf stays drawn beside the form (read-only).
    await expect(page.locator('.desk-shelf .cover3d:not(.is-suggested)')).toHaveCount(12);
    await noViolations(page, 'log in in the slot');
    await slot(page).getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
  });

  test('a direct visit to Privacy shows the shelf with Privacy in the middle', async ({ page }) => {
    await setup(page);
    await page.goto('/app/privacy');
    await expect(slot(page).getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(page.locator('.desk-shelf .cover3d:not(.is-suggested)')).toHaveCount(12);
    await slot(page).getByRole('button', { name: 'Close' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });

  test('an account form opened directly (an email link, a reload) stands alone; Escape while typing keeps it open', async ({ page }) => {
    await setup(page);
    await page.goto('/app/account/sign-in');
    const email = slot(page).getByLabel('Email');
    await expect(email).toBeVisible();
    await expect(page.locator('.desk-shelf')).toHaveCount(0);
    await expect(column(page)).toBeVisible();
    await noViolations(page, 'log in opened directly');
    await email.fill('reader@example.com');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/app\/account\/sign-in$/);
    await expect(email).toHaveValue('reader@example.com');
    await slot(page).getByRole('button', { name: 'Close' }).focus();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.locator('.desk-shelf .cover3d:not(.is-suggested)')).toHaveCount(12);
  });

  test('search results replace the shelf in place, six a bay, with the library line; a typed ISBN opens the book', async ({ page }) => {
    await setup(page, { saved: [book(2)], recent: [] });
    await page.route('**/api/v2/books/search', route => {
      const query = route.request().postDataJSON().query;
      if (query === BOOK.isbn13) return route.fulfill({ json: { kind: 'exact', book: BOOK } });
      if (query === 'nothing at all') return route.fulfill({ json: { kind: 'candidates', candidates: [] } });
      return route.fulfill({ json: { kind: 'candidates', candidates: Array.from({ length: 8 }, (_, index) => ({ bookKey: 'v1:openlibrary:OL' + (90 + index) + 'W', title: 'Result ' + index, authors: ['Writer ' + index] })) } });
    });
    await page.route('**/api/v2/holdings/search', route => route.fulfill({ json: { answers: { 'v1:openlibrary:OL90W': 'found' } } }));
    await page.goto('/app/shelf');
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.fill('result');
    await input.press('Enter');
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('link')).toHaveCount(8);
    await expect(results.locator('.bay-books').first().locator('.cover3d')).toHaveCount(6);
    await expect(page.getByRole('button', { name: 'Back to my shelf', exact: true })).toBeVisible();
    await expect(page.locator('.results-head')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Scan/ })).toHaveCount(0);
    expect(page.url()).not.toContain('result');
    await noViolations(page, 'results');
    await page.getByRole('button', { name: 'Back to my shelf', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();

    await input.fill('nothing at all');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'No books found' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Scan/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear search and go back to my shelf' }).click();

    await input.fill(BOOK.isbn13);
    await input.press('Enter');
    await expect(page).toHaveURL(bookUrl);
    await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
  });

  test('keyboard only: column, search, a result, add it, Escape back to the result', async ({ page }) => {
    await setup(page, { saved: [book(2)], recent: [] });
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
    await expect(column(page).getByRole('button', { name: 'Change library' })).toBeVisible();
    const order = [];
    for (let step = 0; step < 15 && order.at(-1) !== 'Search for a book'; step += 1) { await page.keyboard.press('Tab'); order.push(await focusedName(page)); }
    expect(order).toEqual(['Skip to content', 'Change library', 'Create account', 'Log in', 'Daylight', 'Lamplight', 'Ink', 'Report a problem', 'Privacy', 'About', 'Search for a book']);
    await page.keyboard.type('innovator');
    await page.keyboard.press('Enter');
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('link').first()).toBeVisible();
    for (let step = 0; step < 10 && (await focusedName(page)) !== BOOK.title + ' by ' + BOOK.authors[0]; step += 1) await page.keyboard.press('Tab');
    expect(await focusedName(page)).toBe(BOOK.title + ' by ' + BOOK.authors[0]);
    await page.keyboard.press('Enter');
    await expect(slot(page).getByRole('button', { name: 'Close the book' })).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await focusedName(page)).toBe('Add to my shelf');
    await page.keyboard.press('Enter');
    await expect(slot(page).getByRole('button', { name: 'On my shelf' })).toBeFocused();
    // Tab stays out of the shelf behind the book.
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.desk-shelf-area')))).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    expect(await focusedName(page)).toMatch(new RegExp('^' + BOOK.title + ' by .*on my shelf'));
    const ring = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return style.outlineStyle !== 'none'; });
    expect(ring).toBe(true);
  });

  for (const light of ['daylight', 'lamplight', 'ink']) test(`axe and contrast in ${light}: shelf, book open, picker, results`, async ({ page }) => {
    await setup(page, { light, signedIn: light === 'ink' });
    await page.goto('/app/shelf');
    await expect(page.locator('html')).toHaveAttribute('data-reading-light', light);
    await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
    await expect(page.locator('.cover-badge-library').first()).toBeVisible();
    await noViolations(page, light + ' shelf');
    await page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).click();
    await expect(page.locator('.library-answer')).not.toHaveAttribute('data-answer', 'checking');
    await noViolations(page, light + ' book');
    await page.keyboard.press('Escape');
    await column(page).getByRole('button', { name: 'Change library' }).click();
    await column(page).getByLabel('City, town or library name').fill('Chennai');
    await expect(column(page).getByRole('button', { name: new RegExp(LINKED_LIBRARY.name) })).toBeVisible();
    await noViolations(page, light + ' picker');
    await page.keyboard.press('Escape');
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.fill('innovator');
    await input.press('Enter');
    await expect(page.getByRole('region', { name: 'Search results' }).getByRole('link').first()).toBeVisible();
    await noViolations(page, light + ' results');
  });

  test('reduced motion: the book opens without motion', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).click();
    await expect(slot(page)).toBeVisible();
    await expect(page.locator('.desk')).not.toHaveClass(/desk-opening/);
    expect(await slot(page).evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    expect(await column(page).evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });
    test('the book pushes the shelf right, then settles', async ({ page }) => {
      await setup(page);
      await page.goto('/app/shelf');
      await page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).click();
      await expect(page.locator('.desk')).toHaveClass(/desk-opening/);
      expect(await slot(page).evaluate(element => getComputedStyle(element).animationName)).toBe('desk-slot-grow');
      await expect(page.locator('.desk')).not.toHaveClass(/desk-opening/);
      expect(Math.round((await slot(page).boundingBox()).width)).toBe(600);
      await page.keyboard.press('Escape');
      await expect(page.locator('.desk')).toHaveClass(/desk-closing/);
      await expect(page.locator('.desk')).not.toHaveClass(/desk-closing/);
    });
  });

  test.describe('rail (between phone and 1100 px)', () => {
    test.use({ viewport: { width: 1024, height: 768 } });
    test('icon rail; a book covers the shelf; the rail opens pages and pop-overs', async ({ page }) => {
      await setup(page);
      await page.goto('/app/shelf');
      await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
      const rail = page.getByRole('navigation', { name: 'Library and account' });
      for (const name of ['My library', 'Account', 'Reading light', 'Help']) await expect(rail.getByRole('button', { name })).toBeVisible();
      await expect(column(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Account and settings' })).toHaveCount(0);
      expect((await rail.boundingBox()).width).toBe(72);
      await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await noViolations(page, 'rail shelf');

      const cover = page.locator('.home-bookcase').getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') });
      const areaBefore = await page.locator('.desk-shelf-area').boundingBox();
      await cover.click();
      await expect(slot(page).getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
      const box = await slot(page).boundingBox();
      expect(box.x).toBe(72);
      expect(box.width).toBe(600);
      // Covering, not pushing: the shelf has not moved.
      expect((await page.locator('.desk-shelf-area').boundingBox()).x).toBe(areaBefore.x);
      await noViolations(page, 'rail book');
      await page.keyboard.press('Escape');
      await expect(cover).toBeFocused();

      await rail.getByRole('button', { name: 'Help' }).click();
      const help = page.getByRole('dialog', { name: 'Help' });
      await expect(help).toBeVisible();
      await expect(help.getByRole('link', { name: 'Report a problem' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(help).toBeHidden();
      await expect(rail.getByRole('button', { name: 'Help' })).toBeFocused();
      await rail.getByRole('button', { name: 'Help' }).click();
      await help.getByRole('link', { name: 'Privacy' }).click();
      await expect(page).toHaveURL(/\/app\/privacy$/);
      await expect(slot(page).getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
      await expect(help).toBeHidden();
      await slot(page).getByRole('button', { name: 'Close' }).click();

      await rail.getByRole('button', { name: 'Reading light' }).click();
      await page.getByRole('dialog', { name: 'Reading light' }).getByRole('button', { name: 'Lamplight' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-reading-light', 'lamplight');
      await page.keyboard.press('Escape');

      await rail.getByRole('button', { name: 'My library' }).click();
      const picker = page.getByRole('dialog', { name: 'Find your library' });
      await expect(picker).toBeVisible();
      await noViolations(page, 'rail picker');
      await page.keyboard.press('Escape');
      await expect(picker).toBeHidden();
      await expect(rail.getByRole('button', { name: 'My library' })).toBeFocused();

      await rail.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('dialog', { name: 'Account' }).getByRole('link', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/app\/account\/sign-in$/);
      await expect(slot(page).getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    });

    test('a page opened from a rail pop-over takes focus, and gives it back to the rail button', async ({ page }) => {
      await setup(page);
      await page.goto('/app/shelf');
      await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
      const rail = page.getByRole('navigation', { name: 'Library and account' });
      await rail.getByRole('button', { name: 'Help' }).click();
      await page.getByRole('dialog', { name: 'Help' }).getByRole('link', { name: 'Privacy' }).press('Enter');
      await expect(page).toHaveURL(/\/app\/privacy$/);
      await expect(slot(page).getByRole('button', { name: 'Close' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/app\/shelf$/);
      await expect(rail.getByRole('button', { name: 'Help' })).toBeFocused();
      // An account form is drawn without the shelf (App.tsx entry mode): focus still comes back to Account.
      await rail.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('dialog', { name: 'Account' }).getByRole('link', { name: 'Log in' }).press('Enter');
      await expect(slot(page).getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
      await expect(slot(page).getByRole('button', { name: 'Close' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/app\/shelf$/);
      await expect(rail.getByRole('button', { name: 'Account' })).toBeFocused();
      // A pop-over open while the window widens does not come back by itself when it narrows again.
      await rail.getByRole('button', { name: 'Help' }).click();
      await expect(page.getByRole('dialog', { name: 'Help' })).toBeVisible();
      await page.setViewportSize(WIDE);
      await expect(column(page)).toBeVisible();
      await page.setViewportSize({ width: 1024, height: 768 });
      await expect(rail).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Help' })).toBeHidden();
    });
  });

  test('touch targets are 44 px or more at desktop width, the column included', async ({ page }) => {
    await setup(page, { recent: Array.from({ length: 8 }, (_, index) => book(index + 30)) });
    await page.goto('/app/shelf');
    await expect(page.getByRole('region', { name: 'Viewed before' })).toBeVisible();
    const small = () => page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')]
      .filter(element => element.getClientRects().length && !element.closest('[aria-hidden="true"], [inert]') && !element.classList.contains('desktop-skip')
        && !(element.tagName === 'A' && element.closest('p') && element.closest('p').textContent.trim() !== element.textContent.trim()))
      .map(element => { const box = element.getBoundingClientRect(); return { name: (element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 40), width: box.width, height: box.height }; })
      .filter(target => target.width < 44 || target.height < 44));
    expect(await small()).toEqual([]);
    await page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).click();
    await expect(page.locator('.library-answer')).toBeVisible();
    expect(await small()).toEqual([]);
  });
});
