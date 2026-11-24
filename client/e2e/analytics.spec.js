import { test, expect } from '@playwright/test';

// Cookieless page-visit analytics (plan Phase 11).
// Default build: nothing is loaded. With the setting on:
//   VITE_ANALYTICS_ENABLED=true ANALYTICS_E2E=true npm run test:e2e --workspace=client -- analytics.spec.js
// Vercel's script is replaced by a stand-in that reports page views through
// the queued beforeSend hook, the way the real script does.
// The Google tag (shared/google-tag.mjs) never runs under an automated browser,
// against any address: these journeys also run on the live site and must not
// count as visits.

const STAND_IN = `(function () {
  var hook = null;
  (window.vaq || []).forEach(function (args) { if (args[0] === 'beforeSend') hook = args[1]; });
  window.__reported = [];
  function send() { var event = hook ? hook({ type: 'pageview', url: location.href }) : { url: location.href }; if (event) window.__reported.push(event.url); }
  send();
  var push = history.pushState;
  history.pushState = function () { push.apply(this, arguments); send(); };
})();`;

test('the default build loads no analytics and sets no cookie', async ({ page, context }) => {
  test.skip(process.env.ANALYTICS_E2E === 'true', 'Default build only');
  const requests = [];
  page.on('request', request => { if (request.url().includes('_vercel/insights') || request.url().includes('/insights.js')) requests.push(request.url()); });
  for (const path of ['/', '/about', '/app/books/v1%3Aisbn%3A9780140328721']) await page.goto(path);
  await page.waitForLoadState('networkidle');
  expect(requests).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('the Google tag never runs in these journeys: no request to Google, nothing queued and no cookie', async ({ page, context }) => {
  const google = [];
  context.on('request', request => { if (/(^|\.)(googletagmanager|google-analytics|analytics\.google)\.com$/.test(new URL(request.url()).hostname)) google.push(request.url()); });
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
  for (const path of ['/', '/app/books/v1%3Aisbn%3A9780140328721', '/app/account/sign-in', '/select/anna-centenary-library', '/about', '/libraries/anna-centenary-library', '/libraries/oakland-public-library', '/books', '/no-such-page']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => [typeof window.dataLayer, document.querySelectorAll('script[src*="googletagmanager"]').length])).toEqual(['undefined', 0]);
  }
  // The public pages carry the script; it is what decides not to run.
  await page.goto('/about');
  await expect(page.locator('script[src="/google-tag.js"]')).toHaveCount(1);
  expect(google).toEqual([]);
  expect((await context.cookies()).filter(cookie => cookie.name.startsWith('_g'))).toEqual([]);
});

test('with analytics on, page views are scrubbed, the admin view is never reported and no cookie is set', async ({ page, context }) => {
  test.skip(process.env.ANALYTICS_E2E !== 'true', 'Requires a VITE_ANALYTICS_ENABLED=true build');
  await context.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'text/javascript', body: STAND_IN }));
  const reported = async () => page.evaluate(() => window.__reported);
  await page.goto('/?q=wings+of+fire#x');
  await expect.poll(reported).toEqual(['http://127.0.0.1:4173/']);
  await page.goto('/app/books/v1%3Aisbn%3A9780140328721?from=search');
  await expect.poll(reported).toEqual(['http://127.0.0.1:4173/app/books/[book]']);
  await page.goto('/app/account/reset-password?token=synthetic');
  await expect.poll(reported).toEqual(['http://127.0.0.1:4173/app/account']);
  await page.goto('/app/admin');
  await page.waitForLoadState('networkidle');
  expect(await reported()).toEqual([]);
  await page.goto('/libraries/anna-centenary-library?ref=x');
  await expect.poll(reported).toEqual(['http://127.0.0.1:4173/libraries/anna-centenary-library']);
  expect(await context.cookies()).toEqual([]);
});
