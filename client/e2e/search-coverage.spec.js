import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { LINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';

const library = { ...LINKED_LIBRARY, capabilities: { ...LINKED_LIBRARY.capabilities, titleSearch: true } };
const kalam = { bookKey: `v1:catalog:${library.id}:309106`, title: 'Wings of fire: an autobiography', authors: ['Abdul Kalam, A. P. J'], publisher: 'Universities Press', publishedDate: '1999' };
const otherCopy = { ...kalam, bookKey: `v1:catalog:${library.id}:497990`, authors: [...kalam.authors, 'Tiwari, Arun'], publishedDate: '2021' };
const dragon = { bookKey: `v1:catalog:${library.id}:479740`, title: 'Wings of Fire: The Dark Secret', authors: ['Sutherland, Tui'] };

async function setup(page) {
  const fixture = await installPublicV2Fixture(page);
  await page.route('**/api/v2/libraries/*', route => route.fulfill({ json: route.request().url().endsWith('/areas') ? { countries: ['IN'], regions: ['Tamil Nadu'], districts: ['Chennai'] } : route.request().url().endsWith('/discover')
    ? { libraries: [library], total: 1, nextOffset: null } : { library } }));
  await chooseLinkedLibrary(page);
  await page.goto('/app/search');
  return fixture;
}

test('catalog covers and optional book details load without delaying or replacing library availability', async ({ page }) => {
  const fixture = await setup(page);
  const result = { ...kalam, isbn13: '9788173711466', coverUrl: 'https://covers.openlibrary.org/b/isbn/9788173711466-M.jpg?default=false' };
  await page.route('https://covers.openlibrary.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#345c48"/></svg>' }));
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: [result], catalog: { libraryId: library.id, name: library.name, hasMore: false } } }));
  await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book: result } }));
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let enrichmentCalls = 0;
  await page.route('**/api/v2/books/enrich', async route => {
    enrichmentCalls++; await gate;
    await route.fulfill({ json: { book: { ...result, description: 'An autobiography supplied by the metadata source.', pageCount: 180 } } });
  });
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.locator('.candidate-section .cover')).toBeVisible();
  await expect.poll(() => page.locator('.candidate-section .cover-image').evaluate(img => img.naturalWidth)).toBeGreaterThan(1);
  await page.locator('.candidate-section .book-card').click();
  await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
  expect(fixture.calls.filter(call => call.endpoint === '/availability').map(call => call.body.bookKey)).toEqual([result.bookKey]);
  release();
  await expect(page.getByText('An autobiography supplied by the metadata source.')).toBeVisible();
  expect(enrichmentCalls).toBe(1);
  expect(fixture.calls.filter(call => call.endpoint === '/availability')).toHaveLength(1);
  await expect(page.getByRole('heading', { name: result.title, exact: true })).toBeVisible();
});

test('Anna groups duplicate records, pages with the same scope, and preserves results after a failed next page', async ({ page }) => {
  const fixture = await setup(page);
  const calls = [];
  let failNext = true;
  await page.route('**/api/v2/books/search', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.offset && failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: { code: 'CATALOG_UNAVAILABLE' } } }); }
    return route.fulfill({ json: { kind: 'candidates', candidates: body.offset ? [otherCopy, dragon] : [kalam, otherCopy],
      nextOffset: body.offset ? null : 40, catalog: { libraryId: library.id, name: library.name, hasMore: !body.offset } } });
  });
  await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book: otherCopy } }));
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(1);
  await expect(page.getByText('View 2 catalog records')).toBeVisible();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await expect(page.getByText('Couldn’t load more books. Try again.')).toBeVisible();
  await expect(page.getByText('View 2 catalog records')).toBeVisible();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(2);
  expect(calls.slice(1)).toEqual([{ query: 'Wings of Fire', libraryId: library.id, offset: 40 }, { query: 'Wings of Fire', libraryId: library.id, offset: 40 }]);
  await expect(page.getByRole('button', { name: 'Show more books' })).toHaveCount(0);
  await page.getByText('View 2 catalog records').click();
  await page.getByRole('link', { name: /Universities Press.*2021/ }).click();
  await expect(page).toHaveURL(new RegExp(encodeURIComponent(otherCopy.bookKey)));
  await expect.poll(() => fixture.calls.filter(call => call.endpoint === '/availability').map(call => call.body.bookKey)).toContain(otherCopy.bookKey);
  await page.getByRole('link', { name: 'Back to search' }).click();
  await expect(page.getByLabel('Title, author or ISBN', { exact: true })).toHaveValue('Wings of Fire');
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('All books keeps different authors visible and loads later matches without adding a library filter', async ({ page }) => {
  await setup(page);
  const calls = [];
  const books = [
    { bookKey: 'v1:openlibrary:OL1037811W', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'] },
    { bookKey: 'v1:openlibrary:OL16833236W', title: 'Wings of Fire: The Dragonet Prophecy', authors: ['Tui Sutherland'] },
  ];
  await page.route('**/api/v2/books/search', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    return route.fulfill({ json: { kind: 'candidates', nextOffset: body.offset ? null : 40,
      candidates: body.offset ? [{ bookKey: 'v1:openlibrary:OL98843W', title: 'Wings of Fire', authors: ['Charles Todd'] }] : books } });
  });
  await page.getByRole('button', { name: 'All books', exact: true }).click();
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('Wings of Fire');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.getByText('A. P. J. Abdul Kalam', { exact: true })).toBeVisible();
  await expect(page.getByText('Tui Sutherland', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show more books' }).click();
  await expect(page.getByText('Charles Todd', { exact: true })).toBeVisible();
  expect(calls).toEqual([{ query: 'Wings of Fire' }, { query: 'Wings of Fire', offset: 40 }]);
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
