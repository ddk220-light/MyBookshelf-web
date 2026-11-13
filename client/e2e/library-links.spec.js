// Library links in the one-shelf app (plan Phase 12, 8.2): /select/<slug> and
// the public guide pages choose the library without asking, then open the
// shelf (or the shared book). The guide's own button is followed from the
// built static page, so the link the public site publishes is the one tested.
import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const key = 'mybookshelf.anonymous-web.v1';
const pilots = [
  ['koha:anna-centenary-library', 'Anna Centenary Library', 'Chennai', 'anna-centenary-library'],
  ['koha:kalaignar-centenary-library', 'Kalaignar Centenary Library', 'Madurai', 'kalaignar-centenary-library'],
  ['koha:ernakulam-public-library', 'Ernakulam Public Library', 'Kochi', 'ernakulam-public-library'],
  ['vpl:visakhapatnam-public-library', 'Visakhapatnam Public Library', 'Visakhapatnam', 'visakhapatnam-public-library'],
].map(([id, name, city, slug]) => ({ ...LINKED_LIBRARY, id, name, city, selectionPath: '/select/' + slug }));
const oldLibrary = { ...LINKED_LIBRARY, id: 'koha:previous', name: 'Previously chosen library' };
const savedBook = { ...BOOK, source: 'direct', viewedAt: '2026-10-27T00:00:00.000Z' };
const chosen = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').selectedLibraryId ?? null, key);

async function fixture(page, remember = false) {
  const result = await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.route('**/api/v2/holdings/**', route => route.fulfill({ json: { answers: {} } }));
  await page.route('**/api/v2/libraries/*', async route => {
    const endpoint = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (!endpoint.endsWith('/resolve') && !endpoint.endsWith('/resolve-link')) return route.fallback();
    const library = [oldLibrary, ...pilots].find(row => endpoint.endsWith('/resolve-link') ? row.selectionPath === `/select/${body.slug}` : row.id === body.libraryId);
    return route.fulfill(library ? { json: { library } } : { status: 404, json: { error: { code: 'LIBRARY_NOT_FOUND' } } });
  });
  if (remember) await page.addInitScript(({ key, id, book }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, selectedLibraryId: id, recentBooks: [book], savedBooks: [book] }));
  }, { key, id: oldLibrary.id, book: savedBook });
  return result;
}

test('a guide page’s button chooses its library silently and opens the shelf, which survives reload', async ({ page }) => {
  await fixture(page, true);
  await page.goto('/libraries/anna-centenary-library');
  const button = page.getByRole('link', { name: 'Find a book to check here →' });
  await expect(button).toHaveAttribute('href', '/select/anna-centenary-library?next=/app/shelf');
  await button.click();
  await expect(page).toHaveURL(/\/app\/shelf$/);
  await expect(page.locator('.home-library')).toHaveText(pilots[0].name);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await chosen(page)).toBe(pilots[0].id);
  // The saved shelf is untouched.
  await expect(page.getByRole('link', { name: new RegExp('^' + BOOK.title) }).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.home-library')).toHaveText(pilots[0].name);
});

for (const library of pilots) test(`/select link for ${library.name} works on a fresh visit with no account`, async ({ page }) => {
  await fixture(page);
  await page.goto(library.selectionPath + '?next=/app/search');
  await expect(page).toHaveURL(/\/app\/shelf$/);
  await expect(page.locator('.home-library')).toHaveText(library.name);
  expect(await chosen(page)).toBe(library.id);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('a second link switches libraries', async ({ page }) => {
  await fixture(page);
  await page.goto(pilots[0].selectionPath);
  await expect(page.locator('.home-library')).toHaveText(pilots[0].name);
  await page.goto(pilots[1].selectionPath);
  await expect(page.locator('.home-library')).toHaveText(pilots[1].name);
  expect(await chosen(page)).toBe(pilots[1].id);
});

test('an unknown link keeps the chosen library and the saved books', async ({ page }) => {
  await fixture(page, true);
  await page.goto('/select/no-such-library');
  await expect(page).toHaveURL(/\/app\/shelf$/);
  await expect(page.locator('.home-notice')).toBeVisible();
  expect(await chosen(page)).toBe(oldLibrary.id);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).savedBooks.length, key)).toBe(1);
});

test('a slow response for the previous library cannot undo the link selection', async ({ page }) => {
  await fixture(page, true);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v2/libraries/resolve', async route => {
    if (route.request().postDataJSON().libraryId !== oldLibrary.id) return route.fallback();
    await gate;
    await route.fulfill({ json: { library: oldLibrary } });
  });
  await page.goto(pilots[0].selectionPath);
  await expect(page.locator('.home-library')).toHaveText(pilots[0].name);
  release();
  await page.waitForTimeout(300);
  await expect(page.locator('.home-library')).toHaveText(pilots[0].name);
  expect(await chosen(page)).toBe(pilots[0].id);
});

test('a shared book link survives reload and Back returns to the shelf', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/v2/holdings/check', route => route.fulfill({ json: { answer: 'found' } }));
  await page.goto(pilots[0].selectionPath + '?book=' + encodeURIComponent(BOOK.bookKey));
  await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Found in ' + pilots[0].name })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: BOOK.title })).toBeVisible();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/app\/shelf$/);
});
