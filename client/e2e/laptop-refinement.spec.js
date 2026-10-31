import { expect, test } from '@playwright/test';
import { BOOK, LINKED_LIBRARY, installPublicV2Fixture, tab } from './public-v2-fixture.js';

test('search keeps its draft, one scanner and one camera request through resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installPublicV2Fixture(page);
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => { window.cameraRequests++; return new Promise(() => {}); },
    } });
  });
  await page.goto('/app/search');
  await page.getByLabel('Title, author or ISBN', { exact: true }).fill('many books');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.cameraRequests)).toBe(1);
  for (const width of [390, 1440, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByLabel('Title, author or ISBN', { exact: true })).toHaveValue('many books');
    await expect(page.getByLabel('ISBN barcode camera')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toBeVisible();
  }
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Scan a barcode', exact: true })).toBeFocused();
});

test('GPS is requested only on tap, stays out of URLs and storage, and area selection survives resizing', async ({ page }) => {
  const fixture = await installPublicV2Fixture(page);
  await page.addInitScript(() => {
    window.locationRequests = 0;
    navigator.geolocation.getCurrentPosition = success => { window.locationRequests++; success({ coords: { latitude: 13.087812, longitude: 80.278512 } }); };
  });
  await page.route('**/api/v2/libraries/discover', route => {
    fixture.calls.push({ endpoint: '/libraries/discover', body: route.request().postDataJSON() });
    return route.fulfill({ json: { libraries: [{ ...LINKED_LIBRARY, locationMatch: { scope: 'locality', label: 'In Chennai' } }], total: 1, nextOffset: null, radiusKm: 25, area: { label: 'Chennai, Tamil Nadu', country: 'IN' } } });
  });
  await page.goto('/app/libraries');
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  await page.getByRole('button', { name: 'Libraries near me', exact: true }).click();
  await expect(page.locator('.location-context')).toContainText('Chennai');
  await expect(page.locator('.library-results-list')).toContainText('In Chennai');
  expect(page.url()).not.toMatch(/13\.087812|80\.278512/);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/13\.087812|80\.278512/);
  expect(fixture.calls.some(call => call.body.lat === 13.087812)).toBe(true);
  for (const width of [1023,1024,390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.location-context')).toContainText('Chennai');
  }
  expect(await page.evaluate(() => window.locationRequests)).toBe(1);
  await expect(page.locator('.library-map')).toHaveCount(0);
});

test('GPS denial leaves typed place search and area browsing usable', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_, failure) => failure({ code: 1 }); });
  await page.goto('/app/libraries');
  await page.getByRole('button', { name: 'Libraries near me', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Location unavailable');
  await page.getByLabel('Library, city or postcode').fill('Chennai');
  await page.getByRole('button', { name: /Chennai, Chennai, Tamil Nadu, India/ }).click();
  await expect(page.locator('.library-results-list')).toContainText(LINKED_LIBRARY.name);
  await page.getByRole('button', { name: 'Browse by country', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Country', exact: true })).toBeVisible();
});

test('search and book shortcuts preserve typing and originating search', async ({ page }) => {
  await installPublicV2Fixture(page);
  await page.goto('/app/shelf');
  await expect(page.getByRole('heading', { name: 'Shelf', exact: true })).toBeVisible();
  await page.keyboard.press('Alt+/');
  const field = page.getByLabel('Title, author or ISBN', { exact: true });
  await expect(field).toBeFocused();
  await field.fill('Innovator');
  await page.keyboard.press('Escape');
  await expect(field).toBeFocused();
  await field.fill('Innovator');
  await page.getByRole('button', { name: 'Search books', exact: true }).click();
  await page.getByRole('link', { name: /The Innovator’s Dilemma/ }).click();
  await page.getByRole('button', { name: 'Save book', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(field).toHaveValue('Innovator');
  await expect(page.locator('.candidate-section .book-card')).toHaveCount(2);
});
