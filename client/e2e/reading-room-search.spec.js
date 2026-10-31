import { test, expect } from '@playwright/test';
import { installPublicV2Fixture, LINKED_LIBRARY } from './public-v2-fixture.js';

const books = Array.from({ length: 12 }, (_, index) => ({ bookKey: `v1:openlibrary:OL${index + 100}W`,
  title: index === 0 ? 'Wings of Fire' : `Wings of Fire: Volume ${index}`, authors: [index === 0 ? 'A. P. J. Abdul Kalam' : 'Tui T. Sutherland'] }));

for (const width of [390, 1440]) test(`catalog cards keep full titles and recover partial pages at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 });
  await installPublicV2Fixture(page);
  const calls = []; let retried = false;
  await page.route('**/api/v2/books/search', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    const first = !body.offset;
    const partial = first && !retried;
    if (first) retried = true;
    return route.fulfill({ json: { kind: 'candidates', candidates: first ? books.slice(0, 6) : books.slice(6), nextOffset: first ? 40 : null, partial } });
  });
  await page.goto('/app/search');
  expect((await page.getByLabel('Title, author or ISBN', { exact: true }).boundingBox()).height).toBeLessThan(100);
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.getByText('A. P. J. Abdul Kalam', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Retry missing results' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry missing results' }).click();
  await expect(page.getByRole('button', { name: 'Retry missing results' })).toHaveCount(0);
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(12);
  expect(calls.map(call => call.offset || 0)).toEqual([0, 40, 0]);
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.locator('main').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: testInfo.outputPath(`search-${width}.png`) });
});

test('Back restores expanded catalog groups, visible result count and scroll position', async ({ page }) => {
  await installPublicV2Fixture(page);
  const catalogBooks = books.map((book, index) => ({ ...book, bookKey: `v1:catalog:${LINKED_LIBRARY.id}:${index + 200}` }));
  const version = { ...catalogBooks[5], bookKey: `v1:catalog:${LINKED_LIBRARY.id}:999`, publisher: 'Another edition' };
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: [...catalogBooks, version],
    catalog: { name: LINKED_LIBRARY.name, libraryId: LINKED_LIBRARY.id, hasMore: false } } }));
  await page.goto('/app/search');
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await page.getByText('View 2 catalog records').click();
  const link = page.getByRole('link', { name: /Another edition/ });
  await link.scrollIntoViewIfNeeded();
  const scroll = await page.locator('main').evaluate(el => el.scrollTop);
  await link.click();
  await expect(page).toHaveURL(/books/);
  await page.goBack();
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(10);
  await expect(link).toBeVisible();
  await expect.poll(() => page.locator('main').evaluate(el => el.scrollTop)).toBeCloseTo(scroll, -1);
});

test('a failed catalog page retries its original query and library after returning from a book', async ({ page }) => {
  await installPublicV2Fixture(page);
  const library = { ...LINKED_LIBRARY, capabilities: { ...LINKED_LIBRARY.capabilities, titleSearch: true } };
  await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ json: { library } }));
  await page.addInitScript(id => localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 1, selectedLibraryId: id, recentBooks: [], savedBooks: [] })), library.id);
  const calls = []; let failed = false;
  await page.route('**/api/v2/books/search', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.offset && !failed) { failed = true; return route.fulfill({ status: 503, json: { error: { message: 'Temporarily unavailable' } } }); }
    return route.fulfill({ json: { kind: 'candidates', candidates: body.offset ? books.slice(5) : books.slice(0, 5), nextOffset: body.offset ? null : 40,
      catalog: { name: library.name, libraryId: library.id, hasMore: !body.offset } } });
  });
  await page.goto('/app/search');
  await expect(page.locator('.search-scope button[aria-pressed="true"]')).toContainText(library.name);
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await expect(page.getByRole('button', { name: 'Retry missing results' })).toBeVisible();
  await page.locator('.candidate-section .book-card').first().click();
  await page.getByRole('link', { name: 'Back to search' }).click();
  // Editing the form doesn't alter the query that produced these results.
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('another query');
  await page.getByRole('button', { name: 'Retry missing results' }).click();
  await expect(page.getByRole('button', { name: 'Retry missing results' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show more books' }).click();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(12);
  expect(calls).toEqual([{ query: 'Wings of Fire', libraryId: library.id }, { query: 'Wings of Fire', libraryId: library.id, offset: 40 }, { query: 'Wings of Fire', libraryId: library.id, offset: 40 }]);
});
