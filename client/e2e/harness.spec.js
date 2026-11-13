import { expect, test } from '@playwright/test';

// No fixture: the built app against whatever the preview serves for /api.
test('a new reader starts with a bookshelf and can choose a library without an account', async ({ page }) => {
  await page.route('**/api/account/session', route => route.fulfill({ json: { status: 'guest' } }));
  await page.goto('/app/shelf');
  await expect(page).toHaveURL(/\/shelf$/);
  await expect(page).toHaveTitle(/MyBookshelf/i);
  await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search for a book' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Account and settings' }).click();
  const panel = page.getByRole('dialog', { name: 'Account and settings' });
  await panel.getByRole('button', { name: 'Choose a library' }).click();
  await expect(page.getByRole('dialog', { name: 'Find your library' })).toBeVisible();
  await expect(page.getByLabel('City, town or library name')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
