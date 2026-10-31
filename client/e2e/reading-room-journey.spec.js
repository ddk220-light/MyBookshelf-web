import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, UNLINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture, goToTab } from './public-v2-fixture.js';

test('search, edition settings, library selection and reopen preserve identity and recheck', async ({ page }) => {
  const fixture = await installPublicV2Fixture(page);
  await chooseLinkedLibrary(page);
  await page.getByLabel('Title, author or ISBN').fill('Innovator');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await page.locator('.candidate-section').getByRole('link', { name: /Innovator’s Dilemma/ }).click();
  await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Edition settings/ }).click();
  await page.getByRole('checkbox', { name: /Only this ISBN/ }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.availability-library-line').getByRole('link', { name: 'Change' }).click();
  await expect(page.getByText(BOOK.title, { exact: true })).toBeVisible();
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  await page.getByRole('button', { name: 'Select ' + UNLINKED_LIBRARY.name, exact: true }).click();
  await expect(page).toHaveURL(/edition=exact/);
  await expect(page.getByRole('heading', { name: 'Check the library website' })).toBeVisible();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await page.getByRole('link', { name: 'Back to search', exact: true }).click();
  await expect(page.getByLabel('Title, author or ISBN')).toHaveValue('Innovator');
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(2);
  await goToTab(page, 'Shelf');
  const before = fixture.calls.filter(call => call.endpoint === '/availability').length;
  await page.getByRole('region', { name: 'Saved books' }).getByRole('link', { name: BOOK.title, exact: true }).click();
  await expect.poll(() => fixture.calls.filter(call => call.endpoint === '/availability').length).toBe(before + 1);
  expect(fixture.calls.filter(call => call.endpoint === '/availability').map(call => call.body.libraryId)).toContain(LINKED_LIBRARY.id);
});
