import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { BOOK, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';

for (const light of ['daylight', 'lamplight', 'ink']) test('all screens remain accessible in ' + light, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await installPublicV2Fixture(page);
  await page.addInitScript(value => localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({ version: 1, preference: value })), light);
  await chooseLinkedLibrary(page);
  for (const path of ['/app/shelf', '/app/search', '/app/libraries', '/app/settings', '/app/books/' + encodeURIComponent(BOOK.bookKey)]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-reading-light', light);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.getByRole('button', { name: /Edition settings/ }).click();
  await page.getByRole('checkbox', { name: /Only this ISBN/ }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: /Only this ISBN/ })).toBeChecked();
  await page.getByRole('button', { name: 'Done', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await expect(page.getByRole('button', { name: 'On your shelf', exact: true })).toBeVisible();
});
