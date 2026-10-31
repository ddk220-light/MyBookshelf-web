import { expect, test } from '@playwright/test';

test('a new reader starts with a bookshelf and can choose a library without an account', async ({ page }) => {
  await page.goto('/app/shelf');
  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page).toHaveTitle(/MyBookshelf/i);
  await expect(page.getByRole('heading', { name: 'Shelf', exact: true })).toBeVisible();
  await page.locator('.shelf-start').getByRole('link', { name: 'Find a book', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Choose a library' })).toBeVisible();
  await expect(page.getByLabel('Title, author or ISBN')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  for (const name of ['Search', 'Shelf', 'Libraries', 'Settings']) {
    await expect(page.getByRole('navigation').getByRole('link', { name, exact: true })).toBeVisible();
  }
});
