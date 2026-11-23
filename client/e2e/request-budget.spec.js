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
  // The books each stored-answers lookup asked about, and the book each related list was asked for.
  calls.lookups = [];
  calls.related = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    calls.push(request.method() + ' ' + url.pathname);
    if (url.pathname === '/api/v2/holdings/lookup') calls.lookups.push((request.postDataJSON()?.books || []).map(item => item.bookKey));
    if (url.pathname === '/api/v2/suggestions/related') calls.related.push(url.search);
  });
  const missingCover = route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
  await page.route('https://covers.openlibrary.org/**', missingCover);
  await page.route('https://books.google.com/**', missingCover);
  await page.route('**/api/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() || {};
    if (path === '/api/account/session') return route.fulfill({ json: { status: 'guest' } });
    if (path === '/api/auth/ok') return route.fulfill({ json: { ok: true } });
    if (path === '/api/account/capabilities') return route.fulfill({ json: { email: true, google: false, apple: false, canonicalOrigin: new URL(request.url()).origin } });
    if (path === '/api/v2/libraries/resolve') return route.fulfill({ json: { library: LINKED_LIBRARY } });
    if (path === '/api/v2/holdings/lookup') return route.fulfill({ json: { answers: Object.fromEntries((body.books || []).map(item => [item.bookKey, 'found'])) } });
    if (path === '/api/v2/books/resolve') {
      const found = saved.find(item => item.bookKey === body.bookKey);
      return route.fulfill(found ? { json: { book: found } } : { status: 404, json: { error: { code: 'BOOK_NOT_FOUND', message: 'No public book details were found.' } } });
    }
    if (path === '/api/v2/holdings/check') return route.fulfill({ json: { answer: 'found' } });
    if (path === '/api/v2/suggestions/related') return route.fulfill({ json: { books: [] } });
    if (path === '/api/v2/suggestions/events') return route.fulfill({ status: 202, json: {} });
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
  test('opening account entry warms the service once for this page load', async ({ page }) => {
    const calls = await setup(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    expect(count(calls, 'GET /api/auth/ok')).toBe(0);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
    await expect.poll(() => count(calls, 'GET /api/auth/ok')).toBe(1);
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to MyBookshelf' })).toBeVisible();
    expect(count(calls, 'GET /api/auth/ok')).toBe(1);
  });

  test('a guest\'s first visit: one session call and no other account call; idle and tab switches ask nothing', async ({ page }) => {
    test.setTimeout(45_000);
    const calls = await setup(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ready to search' })).toBeVisible();
    await settle(page);
    expect(accountCalls(calls)).toEqual(['GET /api/account/session']);
    // No library and nothing viewed: the seed suggestions need no request.
    expect(calls.filter(call => call.includes('/suggestions'))).toEqual([]);
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

  // Before (POST /suggestions): one suggestion function run per visit, each paying up to three
  // Open Library requests. Now: up to three GETs of public related lists, which the browser and
  // Vercel's CDN keep for a day (no function run on a repeat), and one stored-answers lookup for
  // the candidates, beside the shelf's own lookup for the saved books.
  test('a returning reader with saved books and a library: at most 3 related GETs and 1 suggestions lookup on load, and nothing again after a book page', async ({ page }) => {
    test.setTimeout(45_000);
    const saved = [book(1), book(2), book(3)];
    const calls = await setup(page, { saved, libraryId: LINKED_LIBRARY.id });
    await page.goto('/');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.getByRole('link', { name: /Shelf book 1 by Author 1/ }).first()).toBeVisible();
    await settle(page);
    expect(accountCalls(calls)).toEqual(['GET /api/account/session', 'GET /api/account/capabilities']);
    expect(count(calls, 'POST /api/v2/libraries/resolve')).toBe(1);
    // Shelf suggestions: one GET per recent book (three at most), each naming one public book key and nothing else.
    expect(count(calls, 'GET /api/v2/suggestions/related')).toBe(3);
    expect(calls.related.sort()).toEqual(saved.map(item => '?book=' + encodeURIComponent(item.bookKey)).sort());
    expect(count(calls, 'POST /api/v2/suggestions')).toBe(0);
    // Two stored-answers lookups: the shelf's for the saved books and the suggestions' for their candidates.
    expect(count(calls, 'POST /api/v2/holdings/lookup')).toBe(2);
    const savedKeys = saved.map(item => item.bookKey);
    expect(calls.lookups.filter(keys => keys.every(key => savedKeys.includes(key)))).toHaveLength(1);
    expect(calls.lookups.filter(keys => keys.every(key => !savedKeys.includes(key)))).toHaveLength(1);
    // Drawing them writes nothing.
    expect(count(calls, 'POST /api/v2/suggestions/events')).toBe(0);
    const once = calls => { for (const call of new Set(calls)) expect(count(calls, call), call).toBe(call === 'GET /api/v2/suggestions/related' ? 3 : call === 'POST /api/v2/holdings/lookup' ? 2 : 1); };
    once(calls);
    const loaded = calls.length;
    // Ten seconds open and untouched, then five tab switches: nothing at all.
    await page.waitForTimeout(10_000);
    await tabSwitches(page, 5);
    await settle(page);
    expect(calls.slice(loaded)).toEqual([]);
    // Open a saved book and come back: the shelf does not ask again.
    await page.getByRole('link', { name: /Shelf book 2 by Author 2/ }).first().click();
    await expect(page).toHaveURL(/\/app\/books\//);
    await settle(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/\/[^/]+\/$/);
    await expect(page.getByRole('link', { name: /Shelf book 1 by Author 1/ }).first()).toBeVisible();
    await settle(page);
    for (const call of ['GET /api/account/session', 'GET /api/account/capabilities', 'POST /api/v2/libraries/resolve'])
      expect(count(calls, call), call).toBe(1);
    expect(count(calls, 'POST /api/v2/holdings/lookup')).toBe(2);
    expect(count(calls, 'GET /api/v2/suggestions/related')).toBe(3);
  });
});
