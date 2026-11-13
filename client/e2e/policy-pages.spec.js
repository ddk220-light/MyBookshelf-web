// Privacy, Terms, About and Report a problem from the side panel (plan
// Phase 9, section 8.2).
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();

async function setup(page, { libraryId = LINKED_LIBRARY.id } = {}) {
  await installPublicV2Fixture(page);
  await page.route('**/api/account/capabilities', route => route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: 'http://127.0.0.1:4173' } }));
  await page.addInitScript(({ KEY, libraryId }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: [], savedContent: [] }));
  }, { KEY, libraryId });
}

test.describe('Policy pages and Report a problem', () => {

  test('Privacy, Terms and About open from the side panel, and Back returns to it', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    const panel = page.getByRole('dialog', { name: 'Account and settings' });
    await page.getByRole('button', { name: 'Account and settings' }).click();
    await panel.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/app\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'How long we keep things' })).toBeVisible();
    await expect(page.getByText('Draft for owner')).toHaveCount(0);
    // Placeholders stay visible until the release sets the effective date (the publication switch).
    const date = process.env.VITE_POLICY_EFFECTIVE_DATE?.trim();
    await expect(page.getByText(date ? 'Effective ' + date + '.' : /^Effective \[EFFECTIVE DATE\]\./, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /My shelf/ })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'MyBookshelf' })).toBeVisible();
    await expect(page.locator('.about-facts dt', { hasText: 'Version' })).toBeVisible();
    await expect(page.locator('.about-facts dd').first()).toHaveText(/^([0-9a-f]{7}|\[VERSION\])$/);
    await expect(page.getByRole('link', { name: 'deepakdhanavel@gmail.com' })).toHaveAttribute('href', 'mailto:deepakdhanavel@gmail.com');
    expect((await axe(page)).violations).toEqual([]);
    await page.goBack();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto('/app/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
    await expect(page.getByText("You must be 18 or older, or have a parent's or guardian's permission.")).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    // Opened directly, Back goes to the shelf with the panel open.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(panel).toBeVisible();
  });

  test('the Create account form links the Terms and Privacy in one line', async ({ page }) => {
    await setup(page);
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Account and settings' }).click();
    await page.getByRole('dialog', { name: 'Account and settings' }).getByRole('link', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
    const line = page.locator('.account-terms');
    await expect(line).toHaveText('By creating an account you agree to the Terms and Privacy');
    await expect(line.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/app/privacy');
    await line.getByRole('link', { name: 'Terms' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
  });

  test('Report a problem sends the words with the screen and library, then shows Sent', async ({ page }) => {
    await setup(page);
    const reports = [];
    await page.route('**/api/v2/problem-reports', async route => { reports.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: {} }); });
    await page.goto('/app/shelf');
    await page.getByRole('button', { name: 'Account and settings' }).click();
    await page.getByRole('dialog', { name: 'Account and settings' }).getByRole('link', { name: 'Report a problem' }).click();
    const box = page.getByRole('textbox', { name: 'Report a problem' });
    await expect(box).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await box.fill('The library answer looks wrong');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('button', { name: 'Sent' })).toHaveAttribute('aria-disabled', 'true');
    expect(reports).toHaveLength(1);
    // Nothing else goes with the words: no account, email or device identifier.
    expect(Object.keys(reports[0]).every(key => ['text', 'screen', 'libraryId', 'appVersion'].includes(key))).toBe(true);
    expect(reports[0]).toMatchObject({ text: 'The library answer looks wrong', screen: 'shelf', libraryId: LINKED_LIBRARY.id });
    expect((await axe(page)).violations).toEqual([]);
  });

  test('Report a problem: couldn’t connect, then Try again', async ({ page }) => {
    await setup(page);
    let attempts = 0;
    await page.route('**/api/v2/problem-reports', route => (++attempts === 1 ? route.abort() : route.fulfill({ status: 202, json: {} })));
    await page.goto('/app/report');
    await page.getByRole('textbox', { name: 'Report a problem' }).fill('Scanner did not open');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('alert')).toContainText('Couldn’t connect');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Sent' })).toBeVisible();
  });
});
