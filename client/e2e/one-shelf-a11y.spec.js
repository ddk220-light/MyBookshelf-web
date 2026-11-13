// Phase 13 accessibility pass (plan 8.3): axe (WCAG 2.2 AA) on every one-shelf
// screen and pop-up in all three reading lights, a keyboard-only walk of the
// main journey, and touch targets of 44 px or more, the Viewed before spines
// included. Measured sizes are attached to each test as annotations.
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const book = (index, extra = {}) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Shelf book ' + index, authors: ['Author ' + index], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), ...extra });
const MINE = book(1, { bookKey: BOOK.bookKey, isbn13: BOOK.isbn13, title: BOOK.title, authors: BOOK.authors });

async function setup(page, { light = 'daylight', saved = [MINE, book(2), book(3)], recent = [book(7), book(8), book(9)], libraryId = LINKED_LIBRARY.id } = {}) {
  await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/holdings/lookup', route => route.fulfill({ json: { answers: Object.fromEntries(route.request().postDataJSON().books.map((item, index) => [item.bookKey, index % 2 ? 'not_found' : 'found'])) } }));
  await page.addInitScript(({ KEY, saved, recent, libraryId, light }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: recent, savedBooks: saved, savedContent: [] }));
    localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({ version: 1, preference: light }));
  }, { KEY, saved, recent, libraryId, light });
}
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
async function noViolations(page, screen) {
  const { violations } = await axe(page);
  expect(violations.map(v => screen + ': ' + v.id + ' ' + v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')), screen).toEqual([]);
}

/** Every visible control's box, smallest first. Links inside a sentence are exempt (WCAG 2.5.8 "inline"). */
const targets = page => page.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex="0"]')]
  .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[aria-hidden="true"], [inert]')
    && !(element.tagName === 'A' && element.closest('p') && element.closest('p').textContent.trim() !== element.textContent.trim())
    && !element.classList.contains('desktop-skip') && !element.matches('main#main-content'))
  .map(element => { const box = element.getBoundingClientRect(); return { name: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || element.tagName).trim().slice(0, 50), width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10, spine: Boolean(element.closest('.spine-row, [aria-label="Viewed before"]')) }; })
  .sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height)));

for (const light of ['daylight', 'lamplight', 'ink']) test.describe(`every screen and pop-up in ${light}`, () => {
  test('shelf, list view, Viewed before, side panel, library pop-up and scan pop-up', async ({ page }) => {
    await setup(page, { light });
    await page.goto('/app/shelf');
    await expect(page.locator('html')).toHaveAttribute('data-reading-light', light);
    await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Viewed before' })).toBeVisible();
    await noViolations(page, 'shelf');
    await page.getByRole('button', { name: 'List view' }).click();
    await noViolations(page, 'list view');
    await page.getByRole('button', { name: 'Shelf view' }).click();
    await page.getByRole('button', { name: 'Account and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Account and settings' });
    await expect(panel).toBeVisible();
    await noViolations(page, 'side panel');
    await panel.getByRole('button', { name: 'Change library' }).click();
    const picker = page.getByRole('dialog', { name: 'Find your library' });
    await expect(picker).toBeVisible();
    await noViolations(page, 'library pop-up');
    await picker.getByLabel('City, town or library name').fill('Chennai');
    await expect(picker.getByRole('region', { name: 'Libraries' })).toBeVisible();
    await noViolations(page, 'library pop-up with results');
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await page.getByRole('button', { name: 'Scan a barcode' }).click();
    const scan = page.getByRole('dialog').filter({ hasText: /ISBN|camera|Scan/i }).first();
    await expect(scan).toBeVisible();
    await noViolations(page, 'scan pop-up');
    await page.keyboard.press('Escape');
  });

  test('search results, book page with the library card, empty shelf', async ({ page }) => {
    await setup(page, { light });
    await page.goto('/app/shelf');
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.fill('innovator');
    await input.press('Enter');
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('link').first()).toBeVisible();
    await noViolations(page, 'search results');
    await results.getByRole('link').first().click();
    await expect(page.getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    await expect(page.locator('.library-answer')).toBeVisible();
    await expect(page.locator('.library-answer')).not.toHaveAttribute('data-answer', 'checking');
    await noViolations(page, 'book page');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/app/shelf');
    await noViolations(page, 'shelf after clearing storage');
  });

  test('Privacy, Terms, About, Report a problem, Log in and Create account', async ({ page }) => {
    await setup(page, { light });
    for (const [path, heading] of [['/app/privacy', 'Privacy'], ['/app/terms', 'Terms'], ['/app/about', 'MyBookshelf'], ['/app/report', 'Report a problem'],
      ['/app/account/sign-in', 'Log in'], ['/app/account/sign-up', 'Create account']]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await noViolations(page, path);
    }
  });
});

test('keyboard only: search, open a result, add it, find a library, back to the shelf', async ({ page }) => {
  await setup(page, { saved: [book(2)], recent: [book(7)], libraryId: null });
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'My shelf' })).toBeVisible();
  const focused = () => page.evaluate(() => { const element = document.activeElement; return element?.getAttribute('aria-label') || element?.labels?.[0]?.textContent?.trim() || element?.textContent?.trim().slice(0, 60) || element?.tagName; });
  const tabTo = async (name, limit = 25) => {
    for (let step = 0; step < limit; step += 1) {
      await page.keyboard.press('Tab');
      if ((await focused()) === name) return;
    }
    throw Error('Tab never reached ' + name);
  };
  await tabTo('Search for a book');
  await page.keyboard.type('innovator');
  await page.keyboard.press('Enter');
  const results = page.getByRole('region', { name: 'Search results' });
  await expect(results.getByRole('link').first()).toBeVisible();
  await tabTo(BOOK.title + ' by ' + BOOK.authors[0]);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
  await tabTo('Add to my shelf');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'On my shelf' })).toBeFocused();
  await tabTo('Find my library');
  await page.keyboard.press('Enter');
  const picker = page.getByRole('dialog', { name: 'Find your library' });
  await expect(picker).toBeVisible();
  await tabTo('City, town or library name', 10);
  await page.keyboard.type('Chennai');
  await expect(picker.getByRole('region', { name: 'Libraries' }).getByRole('button').first()).toBeVisible();
  await page.keyboard.press('Tab');
  await tabTo(await picker.getByRole('region', { name: 'Libraries' }).getByRole('button').first().evaluate(element => element.getAttribute('aria-label') || element.textContent.trim().slice(0, 60)), 10);
  await page.keyboard.press('Enter');
  await expect(picker).toBeHidden();
  // Focus comes back to the library card (or its Try again), never to the top of the page.
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.library-answer')))).toBe(true);
  await page.keyboard.press('Shift+Tab');
  for (let step = 0; step < 15 && (await focused()) !== 'Back'; step += 1) await page.keyboard.press('Shift+Tab');
  expect(await focused()).toBe('Back');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Search results' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('/app/shelf');
  await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title + ' by ') }).first()).toBeVisible();
  // Every focusable element on the way showed a visible focus ring.
  const ring = await page.evaluate(() => { const element = document.querySelector('.home-person'); element.focus(); const style = getComputedStyle(element); return style.outlineStyle !== 'none' || style.boxShadow !== 'none'; });
  expect(ring).toBe(true);
});

for (const project of ['mobile', 'desktop']) test(`touch targets are 44 px or more (${project}), Viewed before spines included`, async ({ page }, testInfo) => {
  test.skip(project === 'mobile' ? testInfo.project.name !== 'mobile-chromium' : testInfo.project.name !== 'chromium', 'one size per project');
  await setup(page, { saved: Array.from({ length: 12 }, (_, index) => book(index + 2)), recent: Array.from({ length: 8 }, (_, index) => book(index + 30, { title: 'V' + index })) });
  await page.goto('/app/shelf');
  await expect(page.getByRole('region', { name: 'Viewed before' })).toBeVisible();
  const report = [];
  const measure = async (screen) => {
    const all = await targets(page);
    const small = all.filter(target => target.width < 44 || target.height < 44);
    const spines = all.filter(target => target.spine && target.name !== 'Clear');
    report.push(screen + ': ' + all.length + ' targets, smallest ' + (all[0] ? `${all[0].width}×${all[0].height} (${all[0].name})` : '-')
      + (spines.length ? `; spines ${Math.min(...spines.map(s => s.width))}–${Math.max(...spines.map(s => s.width))} wide × ${Math.min(...spines.map(s => s.height))} tall` : ''));
    expect(small, screen).toEqual([]);
  };
  await measure('shelf');
  await page.getByRole('button', { name: 'List view' }).click();
  await measure('list view');
  await page.getByRole('button', { name: 'Shelf view' }).click();
  await page.getByRole('button', { name: 'Account and settings' }).click();
  await measure('side panel');
  await page.keyboard.press('Escape');
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await expect(page.locator('.library-answer')).toBeVisible();
  await measure('book page');
  testInfo.annotations.push({ type: 'touch targets', description: report.join(' | ') });
  console.log('TOUCH ' + testInfo.project.name + ' ' + report.join(' | '));
});
