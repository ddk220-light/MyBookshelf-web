import { test, expect } from '@playwright/test';

// Cookieless page-visit analytics (plan Phase 11).
// Default build: nothing is loaded. With the setting on:
//   VITE_ANALYTICS_ENABLED=true ANALYTICS_E2E=true npm run test:e2e --workspace=client -- analytics.spec.js
// Vercel's script is replaced by a stand-in that reports page views through
// the queued beforeSend hook, the way the real script does.

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
  for (const path of ['/', '/about', '/app/shelf']) await page.goto(path);
  await page.waitForLoadState('networkidle');
  expect(requests).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('with analytics on, page views are scrubbed, the admin view is never reported and no cookie is set', async ({ page, context }) => {
  test.skip(process.env.ANALYTICS_E2E !== 'true', 'Requires a VITE_ANALYTICS_ENABLED=true build');
  await context.route('**/_vercel/insights/script.js', route => route.fulfill({ contentType: 'text/javascript', body: STAND_IN }));
  const reported = async () => page.evaluate(() => window.__reported);
  await page.goto('/app/shelf?q=wings+of+fire#x');
  await expect.poll(reported).toEqual(['http://127.0.0.1:4173/app/shelf']);
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
