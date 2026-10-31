import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { AVAILABILITY, CANDIDATE_BOOK, LINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';

const library = { ...LINKED_LIBRARY, capabilities: { ...LINKED_LIBRARY.capabilities, titleSearch: true } };
const book = { bookKey: `v1:catalog:${library.id}:101413`, title: 'அலுவலக மேலாண்மை : தொழிற்கல்வி – மேல்நிலை இரண்டாம் ஆண்டு', authors: ['தமிழ்நாடு பாடநூல் நிறுவனம்'], publishedDate: '2010', edition: 'Second edition' };
const mixed = { ...AVAILABILITY.available, lookupKind: 'catalog_record', matchKind: 'catalog_record', availableCopies: 1, totalCopies: 2, notForLoanCopies: 1,
  locations: [{ name: 'Third floor', availableCopies: 1, totalCopies: 1 }, { name: 'Fourth floor', notForLoanCopies: 1, totalCopies: 1 }] };

async function installCatalogFixture(page, availability = mixed, selectedLibrary = library) {
  const fixture = await installPublicV2Fixture(page, { availability });
  await page.route('**/api/v2/libraries/*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/discover') ? { libraries: [selectedLibrary], total: 1, nextOffset: null } : { library: selectedLibrary }) }));
  await page.route('**/api/v2/books/*', async route => {
    const body = route.request().postDataJSON();
    const searching = route.request().url().endsWith('/search');
    if (searching && body.libraryId !== library.id) return route.fallback();
    fixture.calls.push({ endpoint: searching ? '/books/search' : '/books/resolve', body });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(searching
      ? { kind: 'candidates', candidates: [book], catalog: { libraryId: library.id, name: library.name, hasMore: true } } : { book }) });
  });
  await chooseLinkedLibrary(page);
  await page.goto('/app/search');
  return fixture;
}

test('a catalog without ISBN lookup starts with title search and restores scanning under All books', async ({ page }) => {
  await installCatalogFixture(page, mixed, { ...library, capabilities: { ...library.capabilities, isbnLookup: false } });
  await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.getByLabel('Title or author', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan a barcode' })).toHaveCount(0);
  await page.getByRole('button', { name: 'All books', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Scan a barcode' })).toBeVisible();
  await expect(page.getByLabel('Title, author or ISBN')).toBeVisible();
});

async function searchAndChoose(page) {
  await expect(page.locator('.search-scope button[aria-pressed="true"]')).toContainText(library.name);
  await page.getByLabel('Title, author or ISBN').fill('அலுவலக மேலாண்மை');
  await page.getByRole('button', { name: /Search books|Find libraries/, exact: true }).click();
  await expect(page.getByText(/From Anna Centenary Library/)).toBeVisible();
  await expect(page.getByText('More matches are available in the library catalog.')).toBeVisible();
  await expect(page.getByText('Second edition · 2010', { exact: true })).toBeVisible();
  expect(await page.locator('.candidate-section .book-card strong').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await page.getByRole('link', { name: new RegExp(book.title) }).click();
  await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
}

test('a Tamil title without an ISBN can be chosen, checked, saved and reopened with mixed holdings', async ({ page }) => {
  const fixture = await installCatalogFixture(page);
  await searchAndChoose(page);
  await expect(page.getByRole('heading', { name: 'Available at the library' })).toBeVisible();
  await expect(page.getByText('1 available · 2 total', { exact: true })).toBeVisible();
  await expect(page.getByText('Fourth floor · 1 not for loan', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On your shelf', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mybookshelf.anonymous-web.v1')).savedBooks);
  expect(saved[0].bookKey).toBe(book.bookKey);
  expect(saved[0].isbn13).toBeUndefined();
  expect(fixture.calls.some(call => call.endpoint === '/books/search' && call.body.libraryId === library.id)).toBe(true);
  expect(fixture.calls.filter(call => call.endpoint === '/availability').every(call => call.body.bookKey === book.bookKey)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('catalog results survive Back and the reader can switch to searching all books', async ({ page }) => {
  const fixture = await installCatalogFixture(page);
  await searchAndChoose(page);
  await page.getByRole('link', { name: 'Back to search' }).click();
  await expect(page.getByLabel('Title, author or ISBN')).toHaveValue('அலுவலக மேலாண்மை');
  await expect(page.locator('.search-scope button[aria-pressed="true"]')).toContainText(library.name);
  await expect(page.getByText(/From Anna Centenary Library/)).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(book.title) })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'All books', exact: true }).click();
  await expect(page.locator('.candidate-section')).toHaveCount(0);
  await page.getByLabel('Title, author or ISBN').fill('private author query');
  await page.getByRole('button', { name: /Search books|Find libraries/, exact: true }).click();
  await expect(page.getByRole('link', { name: CANDIDATE_BOOK.title })).toBeVisible();
  await expect(page.getByText(/From Anna Centenary Library/)).toHaveCount(0);
  expect(fixture.calls.find(call => call.endpoint === '/books/search' && call.body.query === 'private author query').body.libraryId).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem('mybookshelf.anonymous-web.v1'))).not.toContain('private author query');
});

for (const [stamp, extra] of [
  ['Read at the library', { loanRestriction: 'not_for_loan', notForLoanCopies: 2, totalCopies: 2 }],
  ['Check with the library', { notForLoanCopies: undefined, totalCopies: undefined }],
]) test(`a catalog title without an ISBN clearly shows ${stamp}`, async ({ page }) => {
  await installCatalogFixture(page, { ...mixed, outcome: 'unknown', availableCopies: undefined, locations: [], ...extra });
  await searchAndChoose(page);
  await expect(page.getByRole('heading', { name: stamp, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Scan ISBN' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open library catalog' })).toBeVisible();
  if (stamp === 'Read at the library') await expect(page.getByText('2 listed · not for loan', { exact: true })).toBeVisible();
  else await expect(page.getByText('This book is listed, but copy details aren’t available here.')).toBeVisible();
});
