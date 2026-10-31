import { goToTab } from './public-v2-fixture.js';
import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture, tab } from './public-v2-fixture.js';

const key = 'mybookshelf.anonymous-web.v1';
const pilots = [
  ['koha:anna-centenary-library', 'Anna Centenary Library', 'Chennai'],
  ['koha:kalaignar-centenary-library', 'Kalaignar Centenary Library', 'Madurai'],
  ['koha:ernakulam-public-library', 'Ernakulam Public Library', 'Kochi'],
  ['vpl:visakhapatnam-public-library', 'Visakhapatnam Public Library', 'Visakhapatnam'],
].map(([id, name, city]) => ({ ...LINKED_LIBRARY, id, name, city,
  selectionPath: `/select/${name.toLowerCase().replaceAll(' ', '-')}`,
  capabilities: { ...LINKED_LIBRARY.capabilities, titleSearch: true, isbnLookup: !id.startsWith('vpl:') } }));
const oldLibrary = { ...LINKED_LIBRARY, id: 'koha:previous', name: 'Previously chosen library' };
const savedBook = { ...BOOK, source: 'direct', viewedAt: '2026-10-27T00:00:00.000Z' };

async function fixture(page, remember = false) {
  const fixture = await installPublicV2Fixture(page);
  await page.route('**/api/v2/libraries/*', async route => {
    const endpoint = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON();
    if (endpoint.endsWith('/discover')) return route.fulfill({ json: { libraries: pilots, total: pilots.length, nextOffset: null } });
    if (!endpoint.endsWith('/resolve') && !endpoint.endsWith('/resolve-link')) return route.fallback();
    const library = [oldLibrary, ...pilots].find(row => endpoint.endsWith('/resolve-link') ? row.selectionPath === `/select/${body.slug}` : row.id === body.libraryId);
    return route.fulfill(library ? { json: { library } } : { status: 404, json: { error: { code: 'LIBRARY_NOT_FOUND' } } });
  });
  if (remember) await page.addInitScript(({ key, id, book }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, selectedLibraryId: id, recentBooks: [book], savedBooks: [book] }));
  }, { key, id: oldLibrary.id, book: savedBook });
  return fixture;
}

for (const library of pilots) test(`direct link selects ${library.name}, scopes search and survives reload`, async ({ page }) => {
  const { calls } = await fixture(page, true);
  await page.goto(library.selectionPath);
  await expect(page.getByRole('dialog', { name: 'Choose this library?' })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLibraryId, key)).toBe(oldLibrary.id);
  await page.getByRole('button', { name: 'Choose ' + library.name, exact: true }).click();
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(page.locator('.selected-library > span')).toHaveText(library.name);
  await expect(page.locator('.search-scope button[aria-pressed="true"]')).toContainText(library.name);
  await page.reload();
  await expect(page.locator('.selected-library > span')).toHaveText(library.name);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(stored.selectedLibraryId).toBe(library.id);
  expect(stored.savedBooks[0].bookKey).toBe(BOOK.bookKey);
  expect(stored.recentBooks[0].bookKey).toBe(BOOK.bookKey);
  if (library.capabilities.isbnLookup === false) await expect(page.getByRole('button', { name: 'Scan a barcode' })).toHaveCount(0);
  await page.getByLabel(library.capabilities.isbnLookup ? 'Title, author or ISBN' : 'Title or author', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible();
  expect(calls.find(call => call.endpoint === '/books/search').body.libraryId).toBe(library.id);
});

test('fresh visit needs no account or previous selection; a second link switches libraries', async ({ page }) => {
  await fixture(page);
  await page.goto(pilots[0].selectionPath);
  await page.getByRole('button', { name: 'Choose ' + pilots[0].name, exact: true }).click();
  await expect(page.locator('.selected-library > span')).toHaveText(pilots[0].name);
  await page.goto(pilots[1].selectionPath);
  await page.getByRole('button', { name: 'Choose ' + pilots[1].name, exact: true }).click();
  await expect(page.locator('.selected-library > span')).toHaveText(pilots[1].name);
  await expect(page).toHaveURL(/\/app\/search$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(page.locator('.selected-library > span')).toHaveText(pilots[1].name);
});

test('cancelling a shared link preserves the previous library and shelf', async ({ page }) => {
  await fixture(page, true);
  await page.goto(pilots[0].selectionPath);
  await expect(page.getByRole('dialog', { name: 'Choose this library?' })).toBeVisible();
  await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(page.locator('.selected-library > span')).toHaveText(oldLibrary.name);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  expect(stored.selectedLibraryId).toBe(oldLibrary.id);
  expect(stored.savedBooks[0].bookKey).toBe(BOOK.bookKey);
});

test('unknown or incomplete links preserve the selected library and saved books', async ({ page }) => {
  await fixture(page, true);
  for (const path of ['/select/missing-library', '/select']) {
    await page.goto(path);
    await expect(page.getByText('This library link isn’t available. Please choose a library from the directory.')).toBeVisible();
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    expect(stored.selectedLibraryId).toBe(oldLibrary.id);
    expect(stored.savedBooks[0].bookKey).toBe(BOOK.bookKey);
    await expect(page.getByRole('link', { name: 'Choose a library', exact: true })).toBeVisible();
  }
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
  await page.getByRole('button', { name: 'Choose ' + pilots[0].name, exact: true }).click();
  await expect(page.locator('.selected-library > span')).toHaveText(pilots[0].name);
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/libraries/resolve') && response.request().postDataJSON().libraryId === oldLibrary.id);
  release();
  await oldResponse;
  await expect(page.locator('.selected-library > span')).toHaveText(pilots[0].name);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).selectedLibraryId, key)).toBe(pilots[0].id);
});

test('directory and Settings offer a usable link even without clipboard permission on small screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await fixture(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.goto('/app/libraries');
  await page.getByLabel('Library, city or postcode').fill('Anna');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('.library-results-list .library-row-open').first().click();
  await page.getByRole('button', { name: `Copy link for ${pilots[0].name}`, exact: true }).click();
  const link = page.getByRole('textbox', { name: 'Library link' });
  await expect(link).toHaveValue(new URL(pilots[0].selectionPath, page.url()).href);
  await page.goto(await link.inputValue());
  await page.getByRole('button', { name: 'Choose ' + pilots[0].name, exact: true }).click();
  await expect(page.locator('.selected-library > span')).toHaveText(pilots[0].name);
  await goToTab(page, 'Settings');
  await page.getByRole('button', { name: `Copy link for ${pilots[0].name}`, exact: true }).click();
  await expect(link).toHaveValue(new URL(pilots[0].selectionPath, page.url()).href);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const action of ['confirm', 'cancel']) test(`shared book context survives reload and ${action} returns to the book`, async ({ page }) => {
  const { calls } = await fixture(page, true);
  const params = new URLSearchParams({ book: BOOK.bookKey, edition: 'exact', language: 'hin' });
  await page.goto(pilots[0].selectionPath + '?' + params);
  await page.getByRole('dialog', { name: 'Choose this library?' }).waitFor();
  await page.reload();
  if (action === 'confirm') await page.getByRole('button', { name: 'Choose ' + pilots[0].name, exact: true }).click();
  else await page.getByRole('link', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: BOOK.title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
  const url = new URL(page.url());
  expect(decodeURIComponent(url.pathname)).toBe('/app/books/' + BOOK.bookKey);
  expect(url.searchParams.get('edition')).toBe('exact');
  expect(url.searchParams.get('language')).toBe('hin');
  expect(calls.find(call => call.endpoint === '/availability').body.libraryId).toBe(action === 'confirm' ? pilots[0].id : oldLibrary.id);
});

test('copying a library while choosing for a book includes explicit book context', async ({ page }) => {
  await fixture(page, true);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey) + '?edition=exact&language=hin');
  await page.locator('.availability-library-line').getByRole('link', { name: 'Change', exact: true }).click();
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  await page.locator('.library-results-list .library-row-open').first().click();
  await page.getByRole('button', { name: 'Copy link for ' + pilots[0].name, exact: true }).click();
  const shared = new URL(await page.getByRole('textbox', { name: 'Library link', exact: true }).inputValue());
  expect(shared.searchParams.get('book')).toBe(BOOK.bookKey);
  expect(shared.searchParams.get('edition')).toBe('exact');
  expect(shared.searchParams.get('language')).toBe('hin');
});
