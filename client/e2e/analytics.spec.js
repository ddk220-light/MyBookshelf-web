import { test, expect } from '@playwright/test';
import { GOOGLE_TAG_SNIPPET } from '../../shared/google-tag.mjs';

// Cookieless page-visit analytics (plan Phase 11).
// Default build: nothing is loaded. With the setting on:
//   VITE_ANALYTICS_ENABLED=true ANALYTICS_E2E=true npm run test:e2e --workspace=client -- analytics.spec.js
// Vercel's script is replaced by a stand-in that reports page views through
// the queued beforeSend hook, the way the real script does.
// Google's script is replaced by an empty one: these journeys also run on the
// live site and must not count as visits.

const STAND_IN = `(function () {
  var hook = null;
  (window.vaq || []).forEach(function (args) { if (args[0] === 'beforeSend') hook = args[1]; });
  window.__reported = [];
  function send() { var event = hook ? hook({ type: 'pageview', url: location.href }) : { url: location.href }; if (event) window.__reported.push(event.url); }
  send();
  var push = history.pushState;
  history.pushState = function () { push.apply(this, arguments); send(); };
})();`;

test.beforeEach(({ context }) => context.route('https://www.googletagmanager.com/**', route => route.fulfill({ contentType: 'text/javascript', body: '' })));

test('the default build loads no Vercel analytics and sets no cookie', async ({ page, context }) => {
  test.skip(process.env.ANALYTICS_E2E === 'true', 'Default build only');
  const requests = [];
  page.on('request', request => { if (request.url().includes('_vercel/insights') || request.url().includes('/insights.js')) requests.push(request.url()); });
  for (const path of ['/', '/about', '/app/books/v1%3Aisbn%3A9780140328721']) await page.goto(path);
  await page.waitForLoadState('networkidle');
  expect(requests).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('the Google tag is on the app and the public pages, and the security policy lets it run', async ({ page }) => {
  await page.addInitScript(() => {
    window.__blocked = [];
    document.addEventListener('securitypolicyviolation', event => window.__blocked.push(event.effectiveDirective + ' ' + event.blockedURI));
  });
  for (const path of ['/', '/app/account/sign-in', '/about', '/libraries/oakland-public-library', '/no-such-page']) {
    const response = await page.goto(path);
    expect(await response.text()).toContain(GOOGLE_TAG_SNIPPET);
    await expect(page.locator('h1, h2').first()).toBeAttached();
    expect(await page.evaluate(() => [typeof window.gtag, window.dataLayer[0][0]])).toEqual(['function', 'js']);
    expect(await page.evaluate(() => window.__blocked.filter(item => item.startsWith('script-src')))).toEqual([]);
  }
});

test('a book search is a key event without the words searched for', async ({ page }) => {
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: [] } }));
  await page.goto('/');
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.fill('secret search words');
  await input.press('Enter');
  const sent = () => page.evaluate(() => window.dataLayer.map(item => Array.from(item)));
  await expect.poll(async () => (await sent()).filter(item => item[1] === 'book_search')).toEqual([['event', 'book_search', { outcome: 'none', result_band: '0', method: 'typed' }]]);
  expect(JSON.stringify(await sent())).not.toContain('secret');
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
