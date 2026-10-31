import { expect, test } from '@playwright/test';
import { BOOK, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';

for (const [width, height] of [[320,740],[360,800],[375,812],[390,844],[430,932],[568,320],[1023,768],[1024,768],[1280,800],[1366,768],[1440,900],[1920,1080]]) {
  test('continuous book remains usable at ' + width + '×' + height, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fixture = await installPublicV2Fixture(page);
    await chooseLinkedLibrary(page);
    await page.goto('/app/books/' + encodeURIComponent(BOOK.bookKey));
    await expect(page.getByRole('heading', { name: 'Available at the library', exact: true })).toBeVisible();
    const checks = fixture.calls.filter(call => call.endpoint === '/availability').length;
    await page.getByRole('link', { name: 'Goodreads' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Goodreads' })).toBeInViewport();
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: /Edition settings/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Edition settings' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('checkbox', { name: /Only this ISBN/ }).check();
    await expect.poll(() => fixture.calls.filter(call => call.endpoint === '/availability').length).toBe(checks + 1);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: /Edition settings/ })).toBeFocused();
    for (const next of [1023, 1024, 390]) {
      await page.setViewportSize({ width: next, height: 844 });
      await expect(page).toHaveURL(/edition=exact/);
      await expect(page.locator('.reader-book')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: BOOK.title, exact: true })).toHaveCount(1);
    }
    expect(fixture.calls.filter(call => call.endpoint === '/availability')).toHaveLength(checks + 1);
  });
}
