// Phase 13 performance measurements (plan 8.4). Not part of the normal suite:
// PERF_E2E=true npx playwright test perf.spec.js --project=mobile-chromium --workers=1
// Chrome mobile emulation at 390×844 with CPU slowdown through the DevTools
// protocol. Prints one PERF line per measurement; budgets from 8.4 are checked
// loosely (the lab is not a phone).
import { expect, test } from '@playwright/test';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const enabled = process.env.PERF_E2E === 'true';
const KEY = 'mybookshelf.anonymous-web.v1';
const book = index => ({ bookKey: 'v1:openlibrary:OL' + (index + 1) + 'W', title: 'Shelf book number ' + (index + 1), authors: ['Author ' + (index % 17)], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() });

async function prepare(page, { saved, slowdown, motion = 'reduce', viewport = { width: 390, height: 844 }, libraryId = null }) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: motion });
  await installPublicV2Fixture(page);
  await page.route('**/api/v2/holdings/lookup', route => route.fulfill({ json: { answers: {} } }));
  await page.addInitScript(({ KEY, saved, libraryId }) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: saved.slice(0, 12), savedBooks: saved, savedContent: [] }));
    }
    window.__perf = { longTasks: [], lcp: 0, shelfAt: 0 };
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__perf.longTasks.push(Math.round(entry.duration)); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__perf.lcp = Math.round(entry.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    const seen = () => { if (!window.__perf.shelfAt && document.querySelector('.home h2, .home h1, [aria-label="My reading shelf"], .empty-shelf')) window.__perf.shelfAt = Math.round(performance.now()); };
    new MutationObserver(seen).observe(document, { subtree: true, childList: true });
  }, { KEY, saved, libraryId });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  return cdp;
}

test.describe('performance (lab)', () => {
  test.skip(!enabled, 'Set PERF_E2E=true to measure.');
  test.describe.configure({ mode: 'serial' });

  // Opening a book at desktop width with 100 saved books (desk layout, plan
  // 2026-11-14 Part 1): the shelf beside the book must not be drawn again in
  // full. Each book is opened from the shelf and closed with Escape; the
  // longest task while it opens is kept. Budget: under 50 ms at 4×.
  for (const slowdown of [4]) test(`opening a book beside 100 saved books, desktop, ${slowdown}× CPU`, async ({ page }) => {
    await prepare(page, { saved: Array.from({ length: 100 }, (_, index) => book(index)), slowdown: 1, viewport: { width: 1440, height: 900 }, libraryId: LINKED_LIBRARY.id });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'My reading shelf' })).toBeVisible();
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
    const opens = [];
    for (let index = 0; index < 5; index += 1) {
      await page.evaluate(() => { window.__perf.longTasks = []; });
      await page.locator('.home-bookcase a[data-shelf-key]').nth(6 + index).click();
      await expect(page.locator('.desk-slot h1')).toBeVisible();
      await page.waitForTimeout(800);
      opens.push(Math.max(0, ...await page.evaluate(() => window.__perf.longTasks)));
      await page.keyboard.press('Escape');
      await expect(page.locator('.desk-slot')).toHaveCount(0);
      await page.waitForTimeout(800);
    }
    const sorted = [...opens].sort((a, b) => a - b);
    console.log(`PERF desk-open books=100 cpu=${slowdown}x longestTaskPerOpen=${opens.join(',')}ms median=${sorted[2]}ms max=${sorted[4]}ms`);
    expect(sorted[2], 'median longest task while a book opens').toBeLessThan(50);
  });

  for (const slowdown of [4, 6]) {
    for (const count of [0, 10, 100]) test(`first render of the shelf, ${count} books, ${slowdown}× CPU`, async ({ page }) => {
      await prepare(page, { saved: Array.from({ length: count }, (_, index) => book(index)), slowdown });
      await page.goto('/');
      await page.goto('/'); // warm cache, as in 8.4
      await expect(page.getByRole('heading', { name: count ? 'My reading shelf' : 'Ready to search' })).toBeVisible();
      await page.waitForTimeout(1500);
      const perf = await page.evaluate(() => ({ ...window.__perf, fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0),
        dcl: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd), covers: document.querySelectorAll('.home a[aria-label]').length }));
      console.log(`PERF first-render books=${count} cpu=${slowdown}x shelf=${perf.shelfAt}ms fcp=${perf.fcp}ms lcp=${perf.lcp}ms dcl=${perf.dcl}ms longTasks=${perf.longTasks.length} maxLongTask=${Math.max(0, ...perf.longTasks)}ms links=${perf.covers}`);
      expect(perf.lcp).toBeLessThan(slowdown === 4 ? 2500 : 4000);
    });

    test(`scrolling 100 books, ${slowdown}× CPU`, async ({ page }) => {
      await prepare(page, { saved: Array.from({ length: 100 }, (_, index) => book(index)), slowdown });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'My reading shelf' })).toBeVisible();
      await page.waitForTimeout(1500);
      await page.evaluate(() => { window.__perf.longTasks = []; });
      const frames = page.evaluate(() => new Promise(resolve => {
        const times = []; const start = performance.now();
        const step = now => { times.push(now); if (now - start < 4000) requestAnimationFrame(step); else resolve(times); };
        requestAnimationFrame(step);
      }));
      await page.mouse.move(195, 500);
      let deepest = 0;
      const scrolled = () => page.evaluate(() => Math.max(document.scrollingElement.scrollTop, ...[...document.querySelectorAll('main, .app-screen')].map(element => element.scrollTop)));
      for (let index = 0; index < 40; index += 1) { await page.mouse.wheel(0, index < 20 ? 300 : -300); await page.waitForTimeout(80); if (index === 19) deepest = await scrolled(); }
      expect(deepest, 'the shelf scrolled').toBeGreaterThan(2000);
      const times = await frames;
      const gaps = times.slice(1).map((time, index) => time - times[index]);
      const fps = Math.round((gaps.length / ((times.at(-1) - times[0]) / 1000)) * 10) / 10;
      const longTasks = await page.evaluate(() => window.__perf.longTasks);
      const slowFrames = gaps.filter(gap => gap > 50).length;
      console.log(`PERF scroll books=100 cpu=${slowdown}x scrolled=${deepest}px fps=${fps} frames=${gaps.length} slowFrames(>50ms)=${slowFrames} maxFrame=${Math.round(Math.max(...gaps))}ms longTasks=${longTasks.length} maxLongTask=${Math.max(0, ...longTasks)}ms`);
      expect(Math.max(0, ...longTasks)).toBeLessThan(slowdown === 4 ? 100 : 200);
    });

    test(`search slide, ${slowdown}× CPU`, async ({ page }) => {
      await prepare(page, { saved: Array.from({ length: 10 }, (_, index) => book(index)), slowdown, motion: 'no-preference' });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'My reading shelf' })).toBeVisible();
      await page.waitForTimeout(1000);
      await page.evaluate(() => { window.__perf.longTasks = []; });
      const input = page.getByRole('searchbox', { name: 'Search for a book' });
      await input.fill('innovator');
      const started = await page.evaluate(() => performance.now());
      await input.press('Enter');
      await expect(page.getByRole('region', { name: 'Search results' }).getByRole('link').first()).toBeVisible();
      const shown = await page.evaluate(() => performance.now());
      await page.waitForTimeout(1200);
      const longTasks = await page.evaluate(() => window.__perf.longTasks);
      console.log(`PERF search cpu=${slowdown}x resultsShown=${Math.round(shown - started)}ms longTasks=${longTasks.length} maxLongTask=${Math.max(0, ...longTasks)}ms`);
      expect(Math.max(0, ...longTasks)).toBeLessThan(slowdown === 4 ? 200 : 300);
    });
  }
});
