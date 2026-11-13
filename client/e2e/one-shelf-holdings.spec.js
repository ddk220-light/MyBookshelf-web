// One-shelf background check for search results (plan Phase 8, 5.7–5.9):
// the Shelf board's sequence, "Looking in <library>…", then the library badge
// on each result the library has.
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const OTHER_LIBRARY = Object.freeze({ ...LINKED_LIBRARY, id: 'koha:kalaignar-centenary-library', name: 'Kalaignar Centenary Library', city: 'Madurai' });
const LIBRARIES = [LINKED_LIBRARY, OTHER_LIBRARY];
const TITLES = [['Wings of Fire', 'A. P. J. Abdul Kalam'], ['Ignited Minds', 'A. P. J. Abdul Kalam'], ['My Journey', 'A. P. J. Abdul Kalam'],
  ['The Guide', 'R. K. Narayan'], ['Swami and Friends', 'R. K. Narayan'], ['Malgudi Days', 'R. K. Narayan'],
  ['The Dark Room', 'R. K. Narayan'], ['Waiting for the Mahatma', 'R. K. Narayan'], ['The Painter of Signs', 'R. K. Narayan']];
const RESULTS = TITLES.map(([title, author], index) => ({ bookKey: 'v1:openlibrary:OL' + (100 + index) + 'W', title, authors: [author] }));
const label = (book, library) => book.title + ' by ' + book.authors[0] + (library ? ', in ' + library.name : '');
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
const lines = events => events.map(event => JSON.stringify(event) + '\n').join('');

/**
 * Public fixture plus nine search results, the library routes, /holdings/check
 * and a /holdings/search fixture. `marks(body)` returns { delay, found, status }
 * for one check: after `delay` ms the reply carries a mark per found key, then
 * done (Playwright fulfils a route in one piece, so marks land together).
 */
async function setup(page, { libraryId = LINKED_LIBRARY.id, marks = () => ({ delay: 600, found: [] }), check = { answer: 'unknown' } } = {}) {
  await installPublicV2Fixture(page);
  const calls = { marks: [], checks: [], aborted: 0 };
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: RESULTS, nextOffset: null } }));
  await page.route('**/api/v2/books/resolve', route => {
    const book = RESULTS.find(item => item.bookKey === route.request().postDataJSON().bookKey);
    return route.fulfill(book ? { json: { book } } : { status: 404, json: { error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } } });
  });
  await page.route('**/api/v2/libraries/*', route => {
    const endpoint = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() || {};
    if (endpoint.endsWith('/resolve')) {
      const library = LIBRARIES.find(row => row.id === body.libraryId);
      return route.fulfill(library ? { json: { library } } : { status: 404, json: { error: { code: 'LIBRARY_NOT_FOUND', message: 'This library is not in the directory.' } } });
    }
    if (endpoint.endsWith('/discover')) return route.fulfill({ json: { libraries: LIBRARIES, total: LIBRARIES.length, nextOffset: null } });
    return route.fallback();
  });
  await page.route('**/api/v2/holdings/lookup', route => route.fulfill({ json: { answers: {} } }));
  await page.route('**/api/v2/holdings/check', route => { calls.checks.push(route.request().postDataJSON()); return route.fulfill({ json: check }); });
  await page.route('**/api/v2/holdings/search', async route => {
    const body = route.request().postDataJSON();
    calls.marks.push(body);
    const reply = marks(body);
    await new Promise(resolve => setTimeout(resolve, reply.delay ?? 0));
    if (reply.status) return route.fulfill({ status: reply.status, json: { error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } } }).catch(() => {});
    const found = (reply.found || []).filter(key => body.books.some(item => item.bookKey === key));
    const text = reply.raw ?? lines([...found.map(bookKey => ({ type: 'mark', bookKey, answer: 'found' })),
      { type: 'done', unchecked: body.books.map(item => item.bookKey).filter(key => !found.includes(key)) }]);
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' }, body: text }).catch(() => {});
  });
  page.on('requestfailed', request => { if (request.url().endsWith('/api/v2/holdings/search')) calls.aborted += 1; });
  await page.addInitScript(({ KEY, libraryId }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: [], savedContent: [] }));
  }, { KEY, libraryId });
  return calls;
}
const searchFor = async (page, text) => {
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.fill(text);
  await input.press('Enter');
};
const results = page => page.getByRole('region', { name: 'Search results' });
const statusLine = page => page.locator('.results-library');
const everything = page => page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + JSON.stringify(history.state) + location.href);

test.describe('One-shelf result badges', () => {

  test('searching, then "Looking in…", then marks: badges top right, "In <library>", list view, accessible', async ({ page }) => {
    const found = [RESULTS[0].bookKey, RESULTS[4].bookKey, RESULTS[8].bookKey];
    const calls = await setup(page, { marks: () => ({ delay: 1200, found }) });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await searchFor(page, 'narayan  kalam');
    await expect(results(page).getByRole('link')).toHaveCount(9);
    await expect(statusLine(page)).toHaveText('Looking in Anna Centenary Library…');
    await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText('9 books. Looking in Anna Centenary Library');
    await expect(results(page).locator('.cover-badge-library')).toHaveCount(0);
    expect(calls.marks).toEqual([{ libraryId: LINKED_LIBRARY.id, query: 'narayan kalam', books: RESULTS.map(book => ({ bookKey: book.bookKey })) }]);
    expect((await axe(page)).violations).toEqual([]);

    await expect(results(page).locator('.cover-badge-library')).toHaveCount(3);
    await expect(statusLine(page)).toHaveText('In Anna Centenary Library');
    await expect(statusLine(page).locator('.results-library-badge')).toBeVisible();
    await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveText('9 books. 3 books in Anna Centenary Library');
    for (const book of RESULTS) await expect(results(page).getByRole('link', { name: label(book, found.includes(book.bookKey) && LINKED_LIBRARY), exact: true })).toBeVisible();
    // Top right of the cover, and no pop under reduced motion.
    const badge = results(page).getByRole('link', { name: label(RESULTS[0], LINKED_LIBRARY) }).locator('.cover-badge-library');
    const [cover, mark] = await Promise.all([results(page).getByRole('link', { name: label(RESULTS[0], LINKED_LIBRARY) }).boundingBox(), badge.boundingBox()]);
    expect(mark.x + mark.width).toBeGreaterThan(cover.x + cover.width);
    expect(mark.y).toBeLessThan(cover.y);
    expect(await badge.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    // Nothing reads as "not in the library"; the text is nowhere in the browser.
    await expect(page.getByText(/not (found|in)|couldn/i)).toHaveCount(0);
    expect(await everything(page)).not.toMatch(/narayan|kalam/i);
    expect((await axe(page)).violations).toEqual([]);

    await page.getByRole('button', { name: 'List view' }).click();
    await expect(results(page).locator('.shelf-list-item')).toHaveCount(9);
    await expect(results(page).locator('.shelf-list-item .cover-badge-library')).toHaveCount(3);
    await expect(results(page).getByRole('link', { name: label(RESULTS[4], LINKED_LIBRARY) })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(calls.marks).toHaveLength(1);
  });

  test('opening a result stops the check, the marked book is green at once, and Back keeps the marks without asking again', async ({ page }) => {
    let run = 0;
    const calls = await setup(page, { marks: () => (++run === 1 ? { delay: 400, found: [RESULTS[2].bookKey] } : { delay: 0, found: [] }) });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await searchFor(page, 'kalam');
    const marked = results(page).getByRole('link', { name: label(RESULTS[2], LINKED_LIBRARY) });
    await expect(marked).toBeVisible();
    await marked.click();
    await expect(page).toHaveURL(/\/app\/books\//);
    // The check answered "unknown"; the mark already proved this book.
    await expect(page.getByRole('group', { name: 'Found in Anna Centenary Library' })).toBeVisible();
    expect(calls.checks.map(call => call.bookKey)).toEqual([RESULTS[2].bookKey]);
    await page.goBack();
    await expect(results(page).getByRole('link', { name: label(RESULTS[2], LINKED_LIBRARY) })).toBeVisible();
    await expect(statusLine(page)).toHaveText('In Anna Centenary Library');
    await page.waitForTimeout(300);
    expect(calls.marks).toHaveLength(1);
  });

  test('a slow catalog: tapping a book while it is still looking aborts the request', async ({ page }) => {
    const calls = await setup(page, { marks: () => ({ delay: 20_000, found: [RESULTS[0].bookKey] }) });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await searchFor(page, 'narayan');
    await expect(statusLine(page)).toHaveText('Looking in Anna Centenary Library…');
    await results(page).getByRole('link', { name: label(RESULTS[3]) }).click();
    await expect(page).toHaveURL(/\/app\/books\//);
    await expect.poll(() => calls.aborted).toBe(1);
    expect(calls.checks.map(call => call.bookKey)).toEqual([RESULTS[3].bookKey]);
    await page.goBack();
    await expect(results(page).getByRole('link')).toHaveCount(9);
    await expect(statusLine(page)).toHaveText('');
    await expect(results(page).locator('.cover-badge-library')).toHaveCount(0);
    expect(calls.marks).toHaveLength(1);
  });

  test('a check that finds nothing, fails or breaks off ends quietly; badges already shown stay', async ({ page }) => {
    const replies = [{ delay: 300, found: [] }, { delay: 100, status: 503 },
      { delay: 100, raw: lines([{ type: 'mark', bookKey: RESULTS[1].bookKey, answer: 'found' }]) + '{"type":"do' }];
    const calls = await setup(page, { marks: () => replies.shift() });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    for (const query of ['first', 'second', 'third']) {
      await searchFor(page, query);
      await expect(results(page).getByRole('link')).toHaveCount(9);
      await expect.poll(() => calls.marks.length).toBe(['first', 'second', 'third'].indexOf(query) + 1);
      await expect(statusLine(page)).not.toHaveText(/Looking/);
    }
    await expect(results(page).locator('.cover-badge-library')).toHaveCount(1);
    await expect(statusLine(page)).toHaveText('In Anna Centenary Library');
    await expect(page.getByText(/not (found|in)|couldn/i)).toHaveCount(0);
  });

  test('changing library stops the check, clears the badges and checks the open results again', async ({ page }) => {
    const calls = await setup(page, { marks: body => body.libraryId === LINKED_LIBRARY.id ? { delay: 100, found: [RESULTS[0].bookKey] } : { delay: 300, found: [RESULTS[5].bookKey, RESULTS[6].bookKey] } });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await searchFor(page, 'narayan');
    await expect(results(page).locator('.cover-badge-library')).toHaveCount(1);
    await page.getByRole('button', { name: 'Account and settings' }).click();
    await page.getByRole('dialog', { name: 'Account and settings' }).getByRole('button', { name: /^(Change|Choose a) library$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await dialog.getByLabel('City, town or library name').fill('Madurai');
    await dialog.getByRole('button', { name: /Kalaignar Centenary Library/ }).click();
    await expect(dialog).toBeHidden();
    await expect(results(page).getByRole('link', { name: label(RESULTS[5], OTHER_LIBRARY) })).toBeVisible();
    await expect(results(page).locator('.cover-badge-library')).toHaveCount(2);
    await expect(results(page).getByRole('link', { name: label(RESULTS[0]), exact: true })).toBeVisible();
    await expect(statusLine(page)).toHaveText('In Kalaignar Centenary Library');
    expect(calls.marks.map(call => call.libraryId)).toEqual([LINKED_LIBRARY.id, OTHER_LIBRARY.id]);
  });

  test('no library chosen: no check and no line', async ({ page }) => {
    const calls = await setup(page, { libraryId: null });
    await page.goto('/app/shelf');
    await searchFor(page, 'narayan');
    await expect(results(page).getByRole('link')).toHaveCount(9);
    await page.waitForTimeout(300);
    expect(calls.marks).toEqual([]);
    await expect(statusLine(page)).toHaveCount(0);
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });
    test('a badge pops in when its mark arrives', async ({ page }) => {
      await setup(page, { marks: () => ({ delay: 900, found: [RESULTS[0].bookKey] }) });
      await page.goto('/app/shelf');
      await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
      await searchFor(page, 'kalam');
      const badge = results(page).locator('.cover-badge-library');
      await expect(badge).toHaveCount(1);
      expect(await badge.evaluate(element => getComputedStyle(element).animationName)).toBe('mark-pop');
    });
  });
});
