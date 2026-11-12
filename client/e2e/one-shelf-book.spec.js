// One-shelf book page, library card and library pop-up (plan Phase 7):
// Book, BookChecked, BookStates, LibraryPicker and LibraryStates boards.
// Runs only against a build made with VITE_ONE_SHELF=true:
//   VITE_ONE_SHELF=true ONE_SHELF_E2E=true npm run test:e2e --workspace=client -- one-shelf-book.spec.js
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { BOOK, LINKED_LIBRARY, UNLINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const KEY = 'mybookshelf.anonymous-web.v1';
const OTHER_LIBRARY = Object.freeze({ ...LINKED_LIBRARY, id: 'koha:kalaignar-centenary-library', name: 'Kalaignar Centenary Library', city: 'Madurai' });
const LIBRARIES = [LINKED_LIBRARY, OTHER_LIBRARY, UNLINKED_LIBRARY];
const RECORD = 'https://catalog.example.test/record/123';
const shelfBook = (index, extra = {}) => ({ bookKey: 'v1:openlibrary:OL' + index + 'W', title: 'Shelf book ' + index, authors: ['Author ' + index], source: 'direct',
  viewedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), ...extra });
const bookPath = '/app/books/' + encodeURIComponent(BOOK.bookKey);
const axe = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
const contrast = page => new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
const everything = page => page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + JSON.stringify(history.state) + location.href);

/**
 * The public fixture plus the Phase 7 routes. `check` answers /holdings/check
 * (a value, a function of the body, or 'hold' to keep it open); `lookup` lists
 * found book keys per library for /holdings/lookup; `requests` answers
 * /library-requests.
 */
async function setup(page, { saved = [], libraryId = null, light, check = { answer: 'found', catalogUrl: RECORD }, lookup = {}, request = 202 } = {}) {
  await installPublicV2Fixture(page);
  const calls = { check: [], lookup: [], requests: [], discover: [] };
  const held = [];
  await page.route('**/api/v2/libraries/*', async route => {
    const endpoint = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() || {};
    if (endpoint.endsWith('/resolve')) {
      const library = LIBRARIES.find(row => row.id === body.libraryId);
      return route.fulfill(library ? { json: { library } } : { status: 404, json: { error: { code: 'LIBRARY_NOT_FOUND', message: 'This library is not in the directory.' } } });
    }
    if (endpoint.endsWith('/resolve-link')) {
      const library = { 'anna-centenary-library': LINKED_LIBRARY, 'kalaignar-centenary-library': OTHER_LIBRARY }[body.slug];
      return route.fulfill(library ? { json: { library } } : { status: 404, json: { error: { code: 'LIBRARY_NOT_FOUND', message: 'This library is not in the directory.' } } });
    }
    if (endpoint.endsWith('/discover')) {
      calls.discover.push(body);
      if (body.lat != null) return route.fulfill({ json: { libraries: [{ ...OTHER_LIBRARY, distanceKm: 1.2 }, { ...LINKED_LIBRARY, distanceKm: 3.8 }], total: 2, nextOffset: null } });
      if (/tirunelveli/i.test(body.query || '')) return route.fulfill({ json: { libraries: [], total: 0, nextOffset: null } });
      return route.fulfill({ json: { libraries: LIBRARIES, total: LIBRARIES.length, nextOffset: null, area: { label: 'Chennai, Tamil Nadu, India' } } });
    }
    return route.fallback();
  });
  await page.route('**/api/v2/holdings/check', async route => {
    const body = route.request().postDataJSON();
    calls.check.push(body);
    const reply = typeof check === 'function' ? check(body) : check;
    if (reply === 'hold') { await new Promise(resolve => held.push(resolve)); return route.fulfill({ json: { answer: 'found' } }).catch(() => {}); }
    if (reply?.status) return route.fulfill({ status: reply.status, json: { error: { code: 'CATALOG_TIMEOUT', message: 'The public catalog is temporarily unavailable.' } } });
    return route.fulfill({ json: reply });
  });
  await page.route('**/api/v2/holdings/lookup', route => {
    const body = route.request().postDataJSON();
    calls.lookup.push(body);
    const found = lookup[body.libraryId] || [];
    return route.fulfill({ json: { answers: Object.fromEntries(body.books.filter(item => found.includes(item.bookKey)).map(item => [item.bookKey, 'found'])) } });
  });
  await page.route('**/api/v2/library-requests', route => {
    calls.requests.push(route.request().postDataJSON());
    return request === 202 ? route.fulfill({ status: 202, json: {} })
      : route.fulfill({ status: request, json: { error: { code: request === 429 ? 'RATE_LIMITED' : 'INVALID_REQUEST', message: 'The request is invalid.' } } });
  });
  await page.addInitScript(({ KEY, saved, libraryId, light }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(KEY, JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: saved, savedContent: [] }));
    if (light) localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({ version: 1, preference: light }));
  }, { KEY, saved, libraryId, light });
  return { calls, release: () => { while (held.length) held.shift()(); } };
}
const savedKeys = page => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY)).savedBooks.map(item => item.bookKey), KEY);

test.describe('One-shelf book page', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');

  test('before a library: the book, Add to my shelf and Find my library; add, toast, remove, no confirmation', async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto(bookPath);
    await expect(page.getByRole('heading', { level: 1, name: BOOK.title })).toBeVisible();
    await expect(page.locator('.shelf-book-author')).toHaveText(BOOK.authors[0]);
    await expect(page.getByText('Published 2016', { exact: true })).toBeVisible();
    await expect(page.getByText('ISBN ' + BOOK.isbn13)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Is it in your library?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find my library' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About this book' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Reviews on Goodreads/ })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: /All editions on Open Library/ })).toHaveAttribute('href', 'https://openlibrary.org/isbn/' + BOOK.isbn13);
    // Nothing from the old page: no copies, due dates, shelf numbers, share or edition settings.
    await expect(page.getByText(/copies|due|call number|658\.4/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Share|Edition/ })).toHaveCount(0);
    expect(calls.check).toEqual([]);
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const add = page.getByRole('button', { name: 'Add to my shelf' });
    const box = await add.boundingBox();
    expect(box.width).toBeGreaterThan(300);
    await add.click();
    const on = page.getByRole('button', { name: 'On my shelf' });
    await expect(on).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.shelf-book-toast')).toContainText('Added to your shelf');
    expect(await savedKeys(page)).toEqual([BOOK.bookKey]);
    expect((await axe(page)).violations).toEqual([]);
    // Reduced motion: the tick does not pop.
    expect(await page.locator('.save-tick').evaluate(element => getComputedStyle(element).animationName)).toBe('none');

    await on.click();
    await expect(page.getByRole('button', { name: 'Add to my shelf' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await savedKeys(page)).toEqual([]);

    await page.getByRole('button', { name: 'Add to my shelf' }).click();
    await page.getByRole('link', { name: 'See my shelf' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.locator('.bay-books').getByRole('link', { name: BOOK.title + ' by ' + BOOK.authors[0] })).toBeVisible();
    await page.reload();
    await expect(page.locator('.bay-books').getByRole('link', { name: BOOK.title + ' by ' + BOOK.authors[0] })).toBeVisible();
  });

  const STATES = [
    ['found', { answer: 'found', catalogUrl: RECORD }, 'Found in Anna Centenary Library', 'library-answer-found'],
    ['not found', { answer: 'not_found' }, 'Not found in Anna Centenary Library', 'library-answer-not-found'],
    ['unconfirmed', { answer: 'unconfirmed' }, 'Couldn’t confirm in Anna Centenary Library', 'library-answer-grey'],
    ['unknown', { answer: 'unknown' }, 'Couldn’t check Anna Centenary Library', 'library-answer-grey'],
    ['a failed check', { status: 503 }, 'Couldn’t check Anna Centenary Library', 'library-answer-grey'],
  ];
  for (const [name, reply, label, tone] of STATES) test(`library card: ${name}`, async ({ page }) => {
    await setup(page, { libraryId: LINKED_LIBRARY.id, check: reply });
    await page.goto(bookPath);
    const card = page.getByRole('group', { name: label });
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(new RegExp(tone));
    await expect(card.getByText(LINKED_LIBRARY.name)).toBeVisible();
    await expect(card.getByRole('link', { name: /^Catalog/ })).toHaveAttribute('href', reply.catalogUrl || LINKED_LIBRARY.catalogUrl);
    await expect(card.getByRole('button', { name: 'Try again' })).toHaveCount(label.startsWith('Couldn’t check') ? 1 : 0);
    // One row, no availability details.
    const height = (await card.boundingBox()).height;
    expect(height).toBeLessThan(80);
    expect(await card.textContent()).not.toMatch(/cop(y|ies)|due|floor|shelf \d/i);
    await expect(page.locator('p[role="status"]', { hasText: label })).toHaveCount(1);
    expect((await axe(page)).violations).toEqual([]);
  });

  test('checking: grey with a static icon under reduced motion, then the answer; Try again after a failure', async ({ page }) => {
    let mode = 'hold';
    const fixture = await setup(page, { libraryId: LINKED_LIBRARY.id, check: () => mode === 'hold' ? 'hold' : mode === 'fail' ? { status: 503 } : { answer: 'found' } });
    await page.goto(bookPath);
    const checking = page.getByRole('group', { name: 'Checking Anna Centenary Library' });
    await expect(checking).toBeVisible();
    await expect(checking).toHaveClass(/library-answer-grey/);
    await expect(checking).toHaveAttribute('aria-busy', 'true');
    expect(await page.locator('.library-answer-spin').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    expect((await axe(page)).violations).toEqual([]);
    mode = 'fail';
    await page.reload();
    fixture.release();
    const failed = page.getByRole('group', { name: 'Couldn’t check Anna Centenary Library' });
    await expect(failed).toBeVisible();
    await expect(page.locator('.library-answer-not-found')).toHaveCount(0);
    mode = 'found';
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('group', { name: 'Found in Anna Centenary Library' })).toBeVisible();
  });

  test('a dropped connection or going offline: couldn’t check, never not found', async ({ page, context }) => {
    await setup(page, { libraryId: LINKED_LIBRARY.id, check: { answer: 'not_found' } });
    await page.route('**/api/v2/holdings/check', route => route.abort('internetdisconnected'));
    await page.goto(bookPath);
    const card = page.getByRole('group', { name: 'Couldn’t check Anna Centenary Library' });
    await expect(card).toBeVisible();
    await context.setOffline(true);
    await card.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('group', { name: 'Couldn’t check Anna Centenary Library' })).toBeVisible();
    await expect(page.locator('.library-answer-not-found')).toHaveCount(0);
    await context.setOffline(false);
  });

  test('Find my library: the pop-up over the book; choosing one checks this book without leaving the page', async ({ page }) => {
    const { calls } = await setup(page, { check: { answer: 'found', catalogUrl: RECORD } });
    await page.goto(bookPath);
    const find = page.getByRole('button', { name: 'Find my library' });
    await find.click();
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Libraries near me' })).toBeFocused();
    expect((await axe(page)).violations).toEqual([]);
    // Back closes it and stays on the book.
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(BOOK.bookKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await expect(find).toBeFocused();

    await find.click();
    await dialog.getByLabel('City, town or library name').fill('Chennai');
    const list = dialog.getByRole('region', { name: /Libraries/ });
    await expect(list.getByRole('button')).toHaveCount(3);
    await expect(list.getByRole('button', { name: /Anna Centenary Library/ })).toContainText('Chennai · Tamil Nadu');
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
    }
    expect((await axe(page)).violations).toEqual([]);
    await list.getByRole('button', { name: /Anna Centenary Library/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('group', { name: 'Found in Anna Centenary Library' })).toBeVisible();
    expect(page.url()).toContain('/app/books/');
    expect(calls.check).toEqual([{ libraryId: LINKED_LIBRARY.id, bookKey: BOOK.bookKey }]);
    // The typed text went to the server once and is kept nowhere.
    expect(await everything(page)).not.toContain('Chennai');
    // Back from the book goes where it came from, not to the closed pop-up.
    expect(await page.evaluate(() => history.state?.usr?.overlay ?? null)).toBeNull();
  });

  test('a placeholder book shows what is known and no About', async ({ page }) => {
    await setup(page);
    await page.route('**/api/v2/books/resolve', route => route.fulfill({ json: { book: { bookKey: 'v1:isbn:9780000000002', isbn13: '9780000000002', title: '9780000000002', authors: [], metadataStatus: 'missing' } } }));
    await page.goto('/app/books/' + encodeURIComponent('v1:isbn:9780000000002'));
    await expect(page.getByRole('heading', { level: 1, name: '9780000000002' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About this book' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add to my shelf' })).toBeVisible();
  });

  for (const light of ['lamplight', 'ink']) test(`the book page and its card stay legible in ${light}`, async ({ page }) => {
    await setup(page, { light });
    await page.goto(bookPath);
    await expect(page.getByRole('button', { name: 'Find my library' })).toBeVisible();
    expect((await contrast(page)).violations).toEqual([]);
    await page.getByRole('button', { name: 'Add to my shelf' }).click();
    await expect(page.getByRole('button', { name: 'On my shelf' })).toBeVisible();
    expect((await contrast(page)).violations).toEqual([]);
    for (const reply of [{ answer: 'found' }, { answer: 'not_found' }, { answer: 'unknown' }]) {
      await page.unroute('**/api/v2/holdings/check');
      await page.route('**/api/v2/holdings/check', route => route.fulfill({ json: reply }));
      await page.evaluate(([KEY, id]) => { const value = JSON.parse(localStorage.getItem(KEY)); value.selectedLibraryId = id; localStorage.setItem(KEY, JSON.stringify(value)); }, [KEY, LINKED_LIBRARY.id]);
      await page.reload();
      await expect(page.locator('.library-answer[data-answer="' + reply.answer + '"]')).toBeVisible();
      expect((await contrast(page)).violations).toEqual([]);
    }
  });

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });
    test('the tick pops after an add and the checking icon turns', async ({ page }) => {
      await setup(page, { libraryId: LINKED_LIBRARY.id, check: 'hold' });
      await page.goto(bookPath);
      await expect(page.getByRole('group', { name: 'Checking Anna Centenary Library' })).toBeVisible();
      expect(await page.locator('.library-answer-spin').evaluate(element => getComputedStyle(element).animationName)).toBe('check-spin');
      await page.getByRole('button', { name: 'Add to my shelf' }).click();
      expect(await page.locator('.save-tick').evaluate(element => getComputedStyle(element).animationName)).toBe('tick-pop');
    });
  });
});

test.describe('One-shelf library pop-up', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');
  const openFromPanel = async page => {
    await page.getByRole('button', { name: 'Account and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Account and settings' });
    await panel.getByRole('button', { name: /^(Change|Choose a) library$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Find your library' });
    await expect(dialog).toBeVisible();
    return dialog;
  };

  test('Change in the side panel: choosing another library keeps the shelf, clears the badges and refills them', async ({ page }) => {
    const saved = [shelfBook(1), shelfBook(2), shelfBook(3)];
    const { calls } = await setup(page, { saved, libraryId: LINKED_LIBRARY.id, lookup: { [LINKED_LIBRARY.id]: [saved[0].bookKey], [OTHER_LIBRARY.id]: [saved[1].bookKey, saved[2].bookKey] } });
    await page.goto('/app/shelf');
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.locator('.cover-badge-library')).toHaveCount(1);
    const dialog = await openFromPanel(page);
    await expect(page.getByRole('dialog', { name: 'Account and settings' })).toBeHidden();
    await dialog.getByLabel('City, town or library name').fill('Madurai');
    await dialog.getByRole('button', { name: /Kalaignar Centenary Library/ }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.home-library')).toHaveText(OTHER_LIBRARY.name);
    await expect(page.locator('.cover-badge-library')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Shelf book 1 by Author 1' })).toBeVisible();
    await expect(page.locator('.cover3d')).toHaveCount(3);
    expect(calls.lookup.map(call => call.libraryId)).toEqual([LINKED_LIBRARY.id, OTHER_LIBRARY.id]);
    await expect(page.getByRole('button', { name: 'Account and settings' })).toBeFocused();
    // Closing the pop-up went back past the panel's entry, not to the panel.
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test.describe('near me', () => {
    test.use({ geolocation: { latitude: 9.9252, longitude: 78.1198 }, permissions: ['geolocation'] });
    test('Libraries near me fills the same list nearest first with distances; the position is not kept', async ({ page }) => {
      const { calls } = await setup(page);
      await page.goto('/app/shelf');
      const dialog = await openFromPanel(page);
      await dialog.getByLabel('City, town or library name').fill('Chennai');
      await expect(dialog.getByRole('button', { name: /Example Public Library/ })).toBeVisible();
      await dialog.getByRole('button', { name: 'Libraries near me' }).click();
      await expect(dialog.getByRole('button', { name: 'Libraries near me' })).toHaveAttribute('aria-pressed', 'true');
      const list = dialog.getByRole('region', { name: 'Nearest first' });
      await expect(list.getByRole('button')).toHaveCount(2);
      await expect(list.getByRole('button').first()).toContainText('Kalaignar Centenary Library');
      await expect(list.getByRole('button').first()).toContainText('1.2 km');
      await expect(dialog.getByLabel('City, town or library name')).toHaveValue('');
      expect(calls.discover.at(-1)).toMatchObject({ lat: 9.9252, lon: 78.1198 });
      expect((await axe(page)).violations).toEqual([]);
      expect(await everything(page)).not.toMatch(/9\.925|78\.119/);
      await list.getByRole('button').first().click();
      await expect(page.locator('.home-library')).toHaveText(OTHER_LIBRARY.name);
      expect(await everything(page)).not.toMatch(/9\.925|78\.119/);
    });
  });

  test('nothing found: one line and one button; one tap sends the request and thanks; the text is kept nowhere', async ({ page }) => {
    const { calls } = await setup(page);
    await page.goto('/app/shelf');
    const dialog = await openFromPanel(page);
    await dialog.getByLabel('City, town or library name').fill('Tirunelveli');
    await expect(dialog.getByText('No libraries here yet', { exact: true }).first()).toBeVisible();
    const request = dialog.getByRole('button', { name: 'Request to add “Tirunelveli”' });
    await expect(request).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await request.click();
    await expect(dialog.locator('.library-requested')).toHaveText('Received your request, thank you.');
    await expect(request).toHaveCount(0);
    expect(calls.requests).toEqual([{ text: 'Tirunelveli' }]);
    expect((await axe(page)).violations).toEqual([]);
    expect(await everything(page)).not.toContain('Tirunelveli');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Account and settings' })).toBeFocused();
  });

  test('a refused request text gets no thank-you and keeps the button', async ({ page }) => {
    const { calls } = await setup(page, { request: 400 });
    await page.goto('/app/shelf');
    const dialog = await openFromPanel(page);
    await dialog.getByLabel('City, town or library name').fill('Tirunelveli');
    await dialog.getByRole('button', { name: 'Request to add “Tirunelveli”' }).click();
    await expect.poll(() => calls.requests.length).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Request to add “Tirunelveli”' })).toBeEnabled();
    await expect(dialog.getByText(/Received your request|Couldn’t send/)).toHaveCount(0);
  });

  for (const light of ['lamplight', 'ink']) test(`the pop-up stays legible in ${light}`, async ({ page }) => {
    await setup(page, { light });
    await page.goto('/app/shelf');
    const dialog = await openFromPanel(page);
    await dialog.getByLabel('City, town or library name').fill('Chennai');
    await expect(dialog.getByRole('button', { name: /Anna Centenary Library/ })).toBeVisible();
    expect((await contrast(page)).violations).toEqual([]);
    await dialog.getByLabel('City, town or library name').fill('Tirunelveli');
    await dialog.getByRole('button', { name: 'Request to add “Tirunelveli”' }).click();
    await expect(dialog.locator('.library-requested')).toBeVisible();
    expect((await contrast(page)).violations).toEqual([]);
  });
});

test.describe('One-shelf library links', () => {
  test.skip(process.env.ONE_SHELF_E2E !== 'true', 'Requires a VITE_ONE_SHELF=true build');

  test('a guide page’s link chooses the library silently and opens the shelf; the shelf stays', async ({ page }) => {
    await setup(page, { saved: [shelfBook(1)], libraryId: OTHER_LIBRARY.id });
    await page.goto('/select/anna-centenary-library?next=/app/search&q=wings');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.cover3d')).toHaveCount(1);
    expect(await everything(page)).not.toContain('wings');
    await page.reload();
    await expect(page.locator('.home-library')).toHaveText(LINKED_LIBRARY.name);
  });

  test('a shared book link chooses the library and opens the book with its answer', async ({ page }) => {
    const { calls } = await setup(page, { check: { answer: 'found', catalogUrl: RECORD } });
    await page.goto('/select/anna-centenary-library?book=' + encodeURIComponent(BOOK.bookKey));
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(BOOK.bookKey).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.getByRole('group', { name: 'Found in Anna Centenary Library' })).toBeVisible();
    expect(calls.check).toEqual([{ libraryId: LINKED_LIBRARY.id, bookKey: BOOK.bookKey }]);
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/app\/shelf$/);
  });

  test('a link that does not resolve lands on the shelf with the notice and keeps the library', async ({ page }) => {
    await setup(page, { libraryId: OTHER_LIBRARY.id });
    await page.goto('/select/no-such-library');
    await expect(page).toHaveURL(/\/app\/shelf$/);
    await expect(page.locator('.home-notice')).toBeVisible();
    await expect(page.locator('.home-library')).toHaveText(OTHER_LIBRARY.name);
    await page.reload();
    await expect(page.locator('.home-notice')).toHaveCount(0);
  });
});
