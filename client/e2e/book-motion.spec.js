import { expect, test } from '@playwright/test';
import { BOOK, installPublicV2Fixture } from './public-v2-fixture.js';
for (const reducedMotion of ['no-preference', 'reduce']) test('save and Undo work with ' + reducedMotion + ' motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await installPublicV2Fixture(page);
  await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await page.getByRole('button', { name: 'On your shelf', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'On your shelf', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
