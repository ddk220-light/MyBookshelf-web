// Request budget: what the app asks the server for when a reader simply opens
// it, leaves it open, or switches tabs. Every request to /api is counted.
// A guest must never wake the accounts database (docs/accounts/OPERATIONS.md):
// one session call on load, nothing while idle or on focus.
import { expect, test } from '@playwright/test';
import { LINKED_LIBRARY } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const PREFERENCES = 'mybookshelf.reader-preferences.v1';
const book = index => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Shelf book ' + index, authors: ['Author ' + index], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString() });

async function setup(page, { saved = [], libraryId = null } = {}) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) calls.push(request.method() + ' ' + url.pathname);
  });
  const missingCover = route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
  await page.route('https://covers.openlibrary.org/**', missingCover);
  await page.route('https://books.google.com/**', missingCover);
  await page.route('**/api/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() || {};
    if (path === '/api/account/session') return route.fulfill({ json: { status: 'guest' } });
    if (path === '/api/account/capabilities') return route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: new URL(request.url()).origin } });
    if (path === '/api/v2/libraries/resolve') return route.fulfill({ json: { library: LINKED_LIBRARY } });
    if (path === '/api/v2/holdings/lookup') return route.fulfill({ json: { answers: Object.fromEntries((body.books || []).map(item => [item.bookKey, 'found'])) } });
    if (path === '/api/v2/books/resolve') {
      const found = saved.find(item => item.bookKey === body.bookKey);
      return route.fulfill(found ? { json: { book: found } } : { status: 404, json: { error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } } });
    }
    if (path === '/api/v2/holdings/check') return route.fulfill({ json: { answer: 'found' } });
    return route.fulfill({ status: 404, json: { error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' } } });
  });
  await page.addInitScript(({ KEY, PREFERENCES, saved, libraryId, library }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (!saved.length && !libraryId) return;
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: saved, savedContent: [] }));
    if (libraryId) localStorage.setItem(PREFERENCES, JSON.stringify({ version: 1, shelfView: 'shelf', shelfSort: 'recent', selectedLibrary: { id: library.id, name: library.name } }));
  }, { KEY, PREFERENCES, saved, libraryId, library: LINKED_LIBRARY });
  return calls;
}
const count = (calls, call) => calls.filter(item => item === call).length;
const accountCalls = calls => calls.filter(item => / \/api\/(account|auth)(\/|$)/.test(item));
const settle = page => page.waitForTimeout(1500);
async function tabSwitches(page, times) {
  for (let index = 0; index < times; index++)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });
}

test.describe('Request budget', () => {
  test('a guest\'s first visit: one session call and no other account call; idle and tab switches ask nothing', async ({ page }) => {
    test.setTimeout(45_000);
    const calls = await setup(page);
    await page.goto('/app/shelf');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await settle(page);
    expect(accountCalls(calls)).toEqual(['GET /api/account/session']);
    for (const call of new Set(calls)) expect(count(calls, call), call).toBe(1);
    const loaded = calls.length;
    // Ten seconds open and untouched: nothing at all.
    await page.waitForTimeout(10_000);
    expect(calls.slice(loaded)).toEqual([]);
    // Five tab switches: still nothing for a guest.
    await tabSwitches(page, 5);
    await settle(page);
    expect(calls.slice(loaded)).toEqual([]);
  });

  test('a returning reader with saved books and a library: each load call once, and not again after a book page', async ({ page }) => {
    const saved = [book(1), book(2), book(3)];
    const calls = await setup(page, { saved, libraryId: LINKED_LIBRARY.id });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.getByRole('link', { name: /Shelf book 1 by Author 1/ }).first()).toBeVisible();
    await settle(page);
    expect(accountCalls(calls)).toEqual(['GET /api/account/session', 'GET /api/account/capabilities']);
    expect(count(calls, 'POST /api/v2/libraries/resolve')).toBe(1);
    expect(count(calls, 'POST /api/v2/holdings/lookup')).toBe(1);
    for (const call of new Set(calls)) expect(count(calls, call), call).toBe(1);
    await tabSwitches(page, 5);
    await settle(page);
    for (const call of new Set(calls)) expect(count(calls, call), call).toBe(1);
    // Open a saved book and come back: the shelf does not ask again.
    await page.getByRole('link', { name: /Shelf book 2 by Author 2/ }).first().click();
    await expect(page).toHaveURL(/\/app\/books\//);
    await settle(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.getByRole('link', { name: /Shelf book 1 by Author 1/ }).first()).toBeVisible();
    await settle(page);
    for (const call of ['GET /api/account/session', 'GET /api/account/capabilities', 'POST /api/v2/libraries/resolve', 'POST /api/v2/holdings/lookup'])
      expect(count(calls, call), call).toBe(1);
  });
});
