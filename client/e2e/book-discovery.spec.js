import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';
import AxeBuilder from '@axe-core/playwright';

test('spelling suggestions and numeric titles can be opened and saved without losing the query', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installPublicV2Fixture(page);
  const cases = [
    { query: 'prdie prejudice austen', book: { bookKey: 'v1:openlibrary:OL66554W', title: 'Pride and Prejudice', authors: ['Jane Austen'], searchMatch: 'spelling' } },
    { query: '1984', book: { bookKey: 'v1:openlibrary:OL1168083W', title: '1984', authors: ['George Orwell'] } },
  ];
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: [cases.find(item => item.query === route.request().postDataJSON().query).book] } }));
  await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book: cases.find(item => item.book.bookKey === route.request().postDataJSON().bookKey).book } }));
  await chooseLinkedLibrary(page);
  for (const { query, book } of cases) {
    await page.getByLabel('Title, author or ISBN').fill(query);
    await page.getByRole('button', { name: 'Search books', exact: true }).click();
    await expect(page.locator('.candidate-section h2')).toHaveText(book.searchMatch ? 'Similar matches' : 'Search results');
    await expect(page.locator('.candidate-section')).toContainText(book.title);
    if (book.searchMatch) await expect(page.getByText('These titles or authors are close to your spelling. Check the details before choosing.')).toBeVisible();
    expect((await new AxeBuilder({ page }).include('.candidate-section').analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`search-${query === '1984' ? 'numeric' : 'spelling'}.png`), fullPage: true });
    await page.locator(`a[href="/app/books/${encodeURIComponent(book.bookKey)}"]`).click();
    await expect(page.getByRole('heading', { name: book.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save book', exact: true }).click();
    await page.getByRole('link', { name: 'Back to search' }).click();
    await expect(page.getByLabel('Title, author or ISBN')).toHaveValue(query);
  }
  await page.getByRole('navigation').getByRole('link', { name: 'Shelf', exact: true }).click();
  for (const { book } of cases) await expect(page.getByRole('region', { name: 'Saved books' })).toContainText(book.title);
});

test('IIT Madras search presents one title and keeps all three versions accessible', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await installPublicV2Fixture(page);
  const library = { ...LINKED_LIBRARY, id: 'chamo:iit-madras', name: 'Indian Institute of Technology Madras' };
  const candidates = [
    { bookKey: 'v1:openlibrary:OL20774896W', title: 'A Modern Approach To Logical Reasoning', authors: ['Dr. R S Aggarwal'], publishedDate: '2014', languages: ['eng'] },
    { bookKey: 'v1:openlibrary:OL29062473W', title: 'A Modern Approach to Logical Reasoning', authors: ['R. S. Aggarwal'], publishedDate: '2007', languages: [] },
    { bookKey: 'v1:openlibrary:OL24612560W', title: 'A Modern Approach to Logical Reasoning', authors: [], publishedDate: '2017', languages: [] },
  ];
  await page.route('**/api/v2/libraries/discover', route => route.fulfill({ json: { libraries: [library], total: 1, nextOffset: null } }));
  await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ json: { library } }));
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates } }));
  await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book: candidates.find(book => book.bookKey === route.request().postDataJSON().bookKey) } }));
  await page.goto('/app/libraries');
  await page.getByLabel('Library, city or postcode').fill('IIT Madras');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: `Select ${library.name}`, exact: true }).click();
  const query = 'Modern approach to logical reasoning';
  await page.getByLabel('Title, author or ISBN').fill(query);
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await expect(page.locator('.book-grid > li')).toHaveCount(1);
  await expect(page.locator('.book-versions')).not.toBeVisible();
  await expect(page.getByText('View 3 versions')).toBeVisible();
  const summary = page.locator('.book-result-group summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.book-version-link')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /Published 2017/ })).toBeVisible();
  await expect(page.locator('.candidate-section')).not.toContainText('copies');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.candidate-section').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('reasoning-versions.png'), fullPage: true });
  for (const version of candidates) {
    const observing = page.waitForRequest(request => request.url().endsWith('/api/v2/availability'));
    await page.getByRole('link', { name: new RegExp(`Published ${version.publishedDate}`) }).click();
    const request = await observing;
    expect(request.postDataJSON()).toMatchObject({ libraryId: library.id, bookKey: version.bookKey, editionScope: 'work' });
    if (!version.languages.length) expect(request.postDataJSON()).not.toHaveProperty('language');
    await expect(page.getByRole('heading', { name: version.title, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to search' }).click();
    await expect(page.getByLabel('Title, author or ISBN')).toHaveValue(query);
    await expect(page.locator('.book-grid > li')).toHaveCount(1);
    await expect(page.locator('.book-result-group')).toHaveAttribute('open', '');
  }
});

test('example book leads to library discovery and retains edition preferences', async ({ page }, testInfo) => {
  await installPublicV2Fixture(page);
  const book = { ...BOOK, bookKey: 'v1:isbn:9788173711466', isbn13: '9788173711466', title: 'Wings of Fire', authors: ['A. P. J. Abdul Kalam'], languages: ['eng', 'tam'] };
  await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book } }));
  await page.goto('/app/search');
  await expect(page.getByRole('heading', { name: 'Try a book' })).toBeVisible();
  await page.getByRole('link', { name: 'Try Wings of Fire' }).click();
  await expect(page.getByRole('heading', { name: book.title })).toBeVisible();
  await page.getByRole('button', { name: /Edition settings/ }).click();
  await page.getByLabel('Book language').selectOption('tam');
  await page.getByRole('checkbox', { name: /Only this ISBN/ }).click();
  await expect(page.getByRole('checkbox', { name: /Only this ISBN/ })).toBeChecked();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('link', { name: 'Choose a library', exact: true }).click();
  await expect(page.locator('.book-return-bar')).toContainText(book.title);
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: `Select ${LINKED_LIBRARY.name}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Available at the library' })).toBeVisible();
  await page.getByRole('button', { name: /Edition settings/ }).click();
  await expect(page.getByRole('checkbox', { name: /Only this ISBN/ })).toBeChecked();
  await expect(page).toHaveURL(/language=tam.*edition=exact/);
  await page.getByRole('checkbox', { name: /Only this ISBN/ }).click();
  await expect(page.getByRole('checkbox', { name: /Only this ISBN/ })).not.toBeChecked();
  await expect(page.getByLabel('Book language')).toHaveValue('tam');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('discovery-book.png'), fullPage: true });
});
