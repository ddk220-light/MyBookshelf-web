// Privacy, Terms, About and Report a problem from the side panel (plan
// Phase 9, section 8.2).
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';
import { POLICY_EFFECTIVE_DATE } from '../../shared/policy-effective-date.mjs';

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
    await page.goto('/');
    const panel = page.getByRole('dialog', { name: 'Settings' });
    await page.getByRole('button', { name: 'Settings' }).click();
    await panel.getByRole('link', { name: 'Privacy' }).click();
    await expect(page).toHaveURL(/\/app\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'How long we keep information' })).toBeVisible();
    await expect(page.getByText('Draft for owner')).toHaveCount(0);
    // The committed effective date (shared/policy-effective-date.mjs), never the placeholder.
    await expect(page.getByText('Effective ' + POLICY_EFFECTIVE_DATE + '.', { exact: true })).toBeVisible();
    await expect(page.getByText(/EFFECTIVE DATE/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /My reading shelf/ })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(panel).toBeVisible();

    // Terms sits beside Privacy in the panel.
    await panel.getByRole('link', { name: 'Terms' }).click();
    await expect(page).toHaveURL(/\/app\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: 'About MyBookshelf' }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Find out if your library has a book, before you go.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'privacy@mybookshelf.cloud', exact: true })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    await page.goto('/app/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
    await expect(page.getByText("You must be 18 or older, or have a parent's or guardian's permission.")).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    // Opened directly, Back goes to the shelf with the panel open.
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(panel).toBeVisible();
  });

  test('the Create account form links the Terms and Privacy in one line', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to MyBookshelf' })).toBeVisible();
    const line = page.locator('.account-terms');
    await expect(line).toHaveText('By creating an account you agree to the Terms and Privacy');
    await expect(line.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/app/privacy');
    await line.getByRole('link', { name: 'Terms' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Terms' })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to MyBookshelf' })).toBeVisible();
  });

  test('Report a problem sends the words with the screen and library, then shows Sent', async ({ page }) => {
    await setup(page);
    const reports = [];
    await page.route('**/api/v2/problem-reports', async route => { reports.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: {} }); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Report a problem' }).click();
    const box = page.getByRole('textbox', { name: 'What happened?' });
    await expect(box).toBeVisible();
    await expect(page.locator('.report-context')).toHaveText(new RegExp('^Sent with your message: the screen you were on \\(Reading shelf\\) and your library \\(' + LINKED_LIBRARY.name + '\\)\\.$'));
    await expect(page.getByText('Please leave out passwords and library card numbers.', { exact: false })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await box.fill('The library answer looks wrong');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('button', { name: 'Sent' })).toHaveAttribute('aria-disabled', 'true');
    expect(reports).toHaveLength(1);
    // Nothing else goes with the words: no account, email or device identifier.
    expect(Object.keys(reports[0]).every(key => ['text', 'screen', 'libraryId', 'appVersion'].includes(key))).toBe(true);
    expect(reports[0]).toMatchObject({ text: 'The library answer looks wrong', screen: 'shelf', libraryId: LINKED_LIBRARY.id });
    expect((await axe(page)).violations).toEqual([]);
  });

  test('Report a problem: the optional name and email go with the words only when filled in', async ({ page }) => {
    await setup(page);
    const reports = [];
    await page.route('**/api/v2/problem-reports', async route => { reports.push(route.request().postDataJSON()); await route.fulfill({ status: 202, json: {} }); });
    await page.goto('/app/report');
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Wrong answer');
    await page.getByLabel('Your name (optional)').fill('Asha');
    await page.getByLabel('Your email (optional)').fill('reader@example.org');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('button', { name: 'Sent' })).toBeVisible();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ text: 'Wrong answer', name: 'Asha', email: 'reader@example.org' });
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).not.toMatch(/reader@example|Asha/);
  });

  test('Report a problem: couldn’t connect, then Try again', async ({ page }) => {
    await setup(page);
    let attempts = 0;
    await page.route('**/api/v2/problem-reports', route => (++attempts === 1 ? route.abort() : route.fulfill({ status: 202, json: {} })));
    await page.goto('/app/report');
    await page.getByRole('textbox', { name: 'What happened?' }).fill('Scanner did not open');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('alert')).toContainText('Couldn’t connect');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('button', { name: 'Sent' })).toBeVisible();
  });
});
