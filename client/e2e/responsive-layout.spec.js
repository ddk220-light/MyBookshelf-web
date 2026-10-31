import { expect, test } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { goToTab, AVAILABILITY, BOOK, LINKED_LIBRARY, chooseLinkedLibrary, installPublicV2Fixture } from './public-v2-fixture.js';

const LONG_BOOK = { ...BOOK,
  title: 'அலுவலக மேலாண்மை : தொழிற்கல்வி – மேல்நிலை இரண்டாம் ஆண்டு தமிழ்நாட்டுப் பாடநூல் கழகம்',
  authors: ['தமிழ்நாட்டுப் பாடநூல் கழகம்', 'Alexandra Verylongsurname'],
  publisher: 'தமிழ்நாட்டுப் பாடநூல் மற்றும் கல்வியியல் பணிகள் கழகம்',
  description: 'A complete description with useful details about this edition and its subjects. '.repeat(35),
};
const LONG_LIBRARY = { ...LINKED_LIBRARY, name: 'Christchurch City Libraries Ngā Kete Wānanga o Ōtautahi', capabilities: { ...LINKED_LIBRARY.capabilities, titleSearch: true } };

async function contained(page) {
  const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    nested: [...document.querySelectorAll('.reader-book-heading, .reader-availability')].filter(e => ['auto', 'scroll', 'hidden'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).map(e => e.className) }));
  expect(result.scroll).toBeLessThanOrEqual(result.width + 1);
  expect(result.nested).toEqual([]);
}
async function unclipped(locator) {
  // Covers can finish loading during this check. Read one DOM snapshot rather
  // than holding indices for placeholder labels that may disappear.
  const measurements = await locator.evaluateAll(elements => elements.map(e => ({height: e.clientHeight, scrollHeight: e.scrollHeight, width: e.clientWidth, scrollWidth: e.scrollWidth, clamp: getComputedStyle(e).webkitLineClamp})));
  for (const sizes of measurements) {
    expect(sizes.scrollHeight).toBeLessThanOrEqual(sizes.height + 1);
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.width + 1);
    expect(['none', 'unset', '']).toContain(sizes.clamp);
  }
}
for (const width of [320, 390, 768, 1280]) {
  test(`long titles, authors, locations and saved books remain readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({width, height: 844});
    await installPublicV2Fixture(page, { availability: { ...AVAILABILITY.available, locations: [{ name: 'Anna Centenary Library COMPETITIVE SECTION – SEVENTH FLOOR / ஏழாவது தளம்', availableCopies: 1 }], callNumber: '658 TAM' } });
    await page.route('**/api/v2/books/resolve', r => r.fulfill({json: {book: LONG_BOOK}}));
    await chooseLinkedLibrary(page);
    await page.goto(`/app/books/${encodeURIComponent(LONG_BOOK.bookKey)}?page=library`);
    await expect(page.getByRole('heading', {name: 'Available at the library'})).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await unclipped(page.locator('.reader-book-heading h1, .authors, .availability-heading, .location-list'));
    await contained(page);
    await page.getByRole('button', {name: 'More'}).click();
    await expect(page.locator('.story-text')).toHaveText(LONG_BOOK.description.trim());
    await unclipped(page.locator('.story-text'));
    await page.getByRole('button', {name: 'Save book', exact: true}).click();
    await goToTab(page, 'Shelf');
    await page.reload();
    const saved = page.getByRole('region', {name:'Saved books'});
    await expect(saved.getByRole('link', { name: LONG_BOOK.title, exact: true })).toHaveAccessibleName(LONG_BOOK.title);
    await saved.getByRole('link', { name: LONG_BOOK.title, exact: true }).focus();
    await page.keyboard.press('Escape');
    await contained(page);
    await page.evaluate(() => window.scrollTo(0,0));
    await page.screenshot({path:testInfo.outputPath(`saved-${width}.png`),fullPage:true});
  });
}

test('library selection and search results retain full copy at 200% text size', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await installPublicV2Fixture(page);
  await page.route('**/api/v2/libraries/*', r => r.fulfill({json:r.request().url().endsWith('/discover')?{libraries:[LONG_LIBRARY],total:1,nextOffset:null}:{library:LONG_LIBRARY}}));
  await page.route('**/api/v2/books/search', r => r.fulfill({json:{kind:'candidates',candidates:[LONG_BOOK]}}));
  await page.goto('/app/libraries');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.locator('html').evaluate(e => getComputedStyle(e).fontSize)).toBe('32px');
  await page.getByLabel('Library, city or postcode').fill('Christchurch');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await unclipped(page.locator('.library-card-top h2'));
  await contained(page);
  await page.getByRole('button',{name:'Select ' + LONG_LIBRARY.name,exact:true}).click();
  await expect(page).toHaveURL(/\/app\/search$/);
  await expect(page.locator('.selected-library').getByText(LONG_LIBRARY.name,{exact:true})).toBeVisible();
  await page.getByLabel('Title, author or ISBN').fill('long title');
  await page.getByRole('button',{name:'Search books',exact:true}).click();
  await expect(page.locator('.book-card')).toBeVisible();
  await unclipped(page.locator('.book-card strong, .book-card small'));
  await contained(page);
});

test('navigation, route reset and settings anchors work with the restored scrollable reading frame', async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await installPublicV2Fixture(page);
  await page.goto('/app/settings');
  await page.locator('main').evaluate(el => el.scrollTo(0, el.scrollHeight));
  await page.getByRole('navigation').getByRole('link',{name:'Shelf',exact:true}).click();
  await expect(page.getByRole('heading',{name: 'Shelf', level: 1})).toBeVisible();
  await expect.poll(() => page.locator('main').evaluate(el => el.scrollTop)).toBe(0);
  await page.goto('/app/settings#privacy');
  await expect.poll(() => page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const heading=page.getByRole('heading',{name:'Privacy',exact:true});
  const box=await heading.boundingBox();
  const nav=await page.getByRole('navigation').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
  for (const url of ['/app/shelf','/app/search','/app/libraries','/app/settings']) {
    await page.goto(url);
    await contained(page);
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa']).analyze();
    expect(result.violations).toEqual([]);
  }
});
