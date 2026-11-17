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
// The server's suggestions: the related list of the book the reader viewed
// (GET /suggestions/related), whose first book the chosen library is known to
// have (a stored "found" from POST /holdings/lookup). Authors not in the seed list.
const VIEWED = { bookKey: 'v1:openlibrary:OL27448W', title: 'The Guide', authors: ['R. K. Narayan'], source: 'direct', viewedAt: '2026-11-10T00:00:00.000Z' };
const FOUND_HERE = { bookKey: 'v1:openlibrary:OL5735363W', title: 'Em and the Big Hoom', authors: ['Jerry Pinto'], workId: 'OL5735363W' };
const RELATED = { bookKey: 'v1:openlibrary:OL1925458W', title: 'A Fine Balance', authors: ['Rohinton Mistry'], workId: 'OL1925458W' };
async function withServerSuggestions(page, { answer = Promise.resolve() } = {}) {
  const asked = { related: [], lookups: [], events: [] };
  await page.route('**/api/v2/suggestions/related?**', async route => {
    asked.related.push({ method: route.request().method(), search: new URL(route.request().url()).search });
    await answer;
    return route.fulfill({ json: { books: [RELATED, FOUND_HERE] } });
  });
  await page.route('**/api/v2/holdings/lookup', route => {
    const body = route.request().postDataJSON();
    asked.lookups.push(body);
    return route.fulfill({ json: { answers: Object.fromEntries(body.books.map(item => [item.bookKey, item.bookKey === FOUND_HERE.bookKey ? 'found' : 'not_found'])) } });
  });
  await page.route('**/api/v2/suggestions/events', route => { asked.events.push(route.request().postDataJSON()); return route.fulfill({ status: 202, json: {} }); });
  await page.addInitScript(({ libraryId, viewed }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [viewed], savedBooks: [], savedContent: [] }));
  }, { libraryId: LINKED_LIBRARY.id, viewed: VIEWED });
  return asked;
}
// The "Suggested" labels: one below each suggested book, on the plank, not faded, hidden from
// screen readers, and inside the bay (which keeps its height).
async function checkLabels(page, count) {
  const labels = page.locator('.suggested-label');
  await expect(labels).toHaveCount(count);
  await expect(labels).toHaveText(Array(count).fill('Suggested'));
  const facts = await page.locator('.bay-books > li:has(.cover3d.is-suggested)').evaluateAll(slots => slots.map(slot => {
    const cover = slot.querySelector('.cover3d').getBoundingClientRect();
    const label = slot.querySelector('.suggested-label');
    const box = label.getBoundingClientRect();
    const plank = slot.closest('.bay').querySelector('.bay-plank').getBoundingClientRect();
    const bay = slot.closest('.bay').getBoundingClientRect();
    let faded = false;
    for (let node = label; node && node !== document.body; node = node.parentElement) if (Number(getComputedStyle(node).opacity) < 1) faded = true;
    return { hidden: label.getAttribute('aria-hidden'), faded, centred: Math.abs((box.left + box.right) / 2 - (cover.left + cover.right) / 2) <= 1,
      onPlank: box.top < plank.bottom && box.bottom > plank.top && Math.abs((box.top + box.bottom) / 2 - (plank.top + plank.bottom) / 2) <= 1,
      inBay: box.top >= bay.top && box.bottom <= bay.bottom + 0.5, below: box.top >= cover.bottom - 3 };
  }));
  expect(facts).toHaveLength(count);
  for (const fact of facts) expect(fact).toEqual({ hidden: 'true', faded: false, centred: true, onPlank: true, inBay: true, below: true });
  // Side by side in a bay they never touch, and none leaves the page.
  const overlaps = await page.locator('.bay-books').evaluateAll(bays => bays.flatMap(bay => {
    const boxes = [...bay.querySelectorAll('.suggested-label')].map(label => label.getBoundingClientRect());
    return boxes.slice(1).map((box, index) => box.left < boxes[index].right).concat(boxes.map(box => box.left < 0 || box.right > innerWidth));
  }));
  expect(overlaps.every(overlap => !overlap)).toBe(true);
  // The old per-bay tag is gone.
  await expect(page.locator('.bay-tag, .bay-tags')).toHaveCount(0);
}
// WCAG contrast of the first label's text on its own background, in each reading light.
async function labelContrast(page) {
  const ratios = {};
  for (const light of ['daylight', 'lamplight', 'ink']) {
    ratios[light] = await page.locator('.suggested-label').first().evaluate((label, light) => {
      document.documentElement.dataset.readingLight = light;
      const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
      const style = getComputedStyle(label);
      const [a, b] = [lum(rgb(style.color)), lum(rgb(style.backgroundColor))];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }, light);
  }
  await page.evaluate(() => { document.documentElement.dataset.readingLight = 'daylight'; });
  return ratios;
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
    // Three a bay, a "Suggested" label below each book; covers faded, labels not.
    await expect(page.locator('.bay-books')).toHaveCount(2);
    await checkLabels(page, 5);
    expect(await faceOpacity(suggested.first())).toBe('0.75');
    // At least 4.5:1 in all three reading lights.
    for (const [light, ratio] of Object.entries(await labelContrast(page))) expect(ratio, light).toBeGreaterThanOrEqual(4.5);
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
    // The saved book has no label; each suggestion does, and the bays keep one height.
    await expect(first.locator('xpath=..').locator('.suggested-label')).toHaveCount(0);
    await checkLabels(page, 5);
    const heights = await page.locator('.home-bookcase .bay').evaluateAll(bays => bays.map(bay => Math.round(bay.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    // Reduced motion (playwright.config.js): nothing moves.
    expect(await first.locator('.cover3d-face').evaluate(face => getComputedStyle(face).animationName)).toBe('none');
    // No view switch for one saved book; nothing was asked of a library for the suggestions.
    await expect(page.getByRole('group', { name: 'View' })).toHaveCount(0);
    expect(calls.filter(call => call.endpoint.startsWith('/holdings/'))).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')).savedBooks.map(book => book.bookKey))).toEqual([WINGS.bookKey]);
    expect((await axe(page)).violations).toEqual([]);
  });

  test('a suggestion the chosen library is known to have carries its badge, from stored answers only', async ({ page }) => {
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
    // One GET for the viewed book's related list: its key is all the address holds.
    expect(asked.related).toEqual([{ method: 'GET', search: '?book=' + encodeURIComponent(VIEWED.bookKey) }]);
    // One stored-answers lookup, for the candidates only; never a library check.
    expect(asked.lookups).toHaveLength(1);
    expect(asked.lookups[0].libraryId).toBe(LINKED_LIBRARY.id);
    expect(asked.lookups[0].books.map(item => item.bookKey)).toEqual([RELATED.bookKey, FOUND_HERE.bookKey, ...SEED.map(item => item.bookKey)]);
    expect(calls.filter(call => /^\/holdings\/(check|search)$/.test(call.endpoint) || call.endpoint === '/availability' || call.endpoint === '/suggestions')).toEqual([]);
    expect(page.url()).toMatch(/\/app\/shelf$/);
    expect((await axe(page)).violations).toEqual([]);
    // Drawing the five is not counted (only opened and saved are).
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
    expect(asked.events).toEqual([]);
    // Opening it is counted (book key only); the book page asks the library as for any book.
    await badged.click();
    await expect(page).toHaveURL(new RegExp('/app/books/' + encodeURIComponent(FOUND_HERE.bookKey) + '$'));
    await expect(page.getByRole('heading', { level: 1, name: FOUND_HERE.title })).toBeVisible();
    await expect.poll(() => asked.events).toEqual([{ event: 'opened', bookKey: FOUND_HERE.bookKey }]);
    expect(asked.related).toHaveLength(1);
    expect(asked.lookups).toHaveLength(1);
    // Back to the same shelf: nothing new is counted.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(asked.events).toHaveLength(1);
  });

  test('a first answer that comes late does not change the books under the reader, and focus stays put', async ({ page }) => {
    await setup(page);
    let release;
    const asked = await withServerSuggestions(page, { answer: new Promise(resolve => { release = resolve; }) });
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    // The slots are held at first, then the seed list stands in for the late answer.
    await expect.poll(() => asked.related.length).toBe(1);
    await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5, { timeout: 5000 });
    expect(await shelfNames(page)).toEqual(suggestedNames(SEED.slice(0, 5)));
    // The reader reaches one by keyboard; the answer then arrives.
    const third = page.getByRole('link', { name: name(SEED[2]) + ', suggested' });
    await third.focus();
    const answered = page.waitForResponse('**/api/v2/holdings/lookup');
    release();
    await answered;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(await shelfNames(page)).toEqual(suggestedNames(SEED.slice(0, 5)));
    await expect(third).toBeFocused();
    // Nothing is counted for books only drawn.
    expect(asked.events).toEqual([]);
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
    await checkLabels(page, 5);
    for (const [light, ratio] of Object.entries(await labelContrast(page))) expect(ratio, light).toBeGreaterThanOrEqual(4.5);
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
    // One bay of six: the saved book, then five suggestions, each with its label.
    await expect(page.locator('.bay-books')).toHaveCount(1);
    await checkLabels(page, 5);
    expect((await axe(page)).violations).toEqual([]);
  });
});

test.describe('Shelf suggestions on the rail and a narrow phone', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop browsers only');
  for (const viewport of [{ width: 1024, height: 768 }, { width: 320, height: 640 }]) {
    test(`${viewport.width} px: a "Suggested" label below each suggested book, the bays one height, nothing off the page`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setup(page);
      await page.addInitScript(({ saved }) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: null, recentBooks: [], savedBooks: saved, savedContent: [] }));
      }, { saved: SEED.slice(10, 14).map((book, index) => ({ ...book, source: 'direct', viewedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString() })) });
      await page.goto('/app/shelf');
      await expect(page.getByRole('heading', { level: 1, name: 'My shelf' })).toBeVisible();
      await expect(page.getByRole('link', { name: /, suggested$/ })).toHaveCount(5);
      await checkLabels(page, 5);
      const heights = await page.locator('.home-bookcase .bay').evaluateAll(bays => bays.map(bay => Math.round(bay.getBoundingClientRect().height)));
      expect(heights.length).toBeGreaterThan(1);
      expect(new Set(heights).size).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const [light, ratio] of Object.entries(await labelContrast(page))) expect(ratio, light).toBeGreaterThanOrEqual(4.5);
      expect((await axe(page)).violations).toEqual([]);
    });
  }
});
