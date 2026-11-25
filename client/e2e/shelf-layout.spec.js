// The shelf's rows and lists at phone and desk widths, and with text at twice
// the size (25 November 2026): nothing is printed over the plank, the
// "Suggested" labels stand in line and clear of the answers, and the lists
// keep to the page. Measured on the drawn boxes.
import { expect, test } from '@playwright/test';
import { LINKED_LIBRARY, installPublicV2Fixture } from './public-v2-fixture.js';

const LIBRARY = { ...LINKED_LIBRARY, name: 'Denver Public Library', city: 'Denver' };
const LONG = 'Pride and Prejudice: Music from the Motion Picture Soundtrack, arranged for the piano with guitar chords';
const RESULTS = [['Pride and Prejudice', ['Jane Austen'], '1813', true], ['Pride and Prejudice [adaptation]', ['Fern Siegel'], '1997'], ['Pride and Prejudice [adaptation]', ['Jane Austen'], '1984'],
  ['Pride and Prejudice', ['Evelyn Atwood', 'Jane Austen'], '1980', true], ['Pride and Prejudice and Zombies', ['Seth Grahame-Smith', 'Katherine Kellgren'], '2009', true], ['Pride and prejudice', ['Annabella Bloom'], '2011', true],
  [LONG, ['Dario Marianelli'], '2006', true], ['Malgudi Days (Twentieth-Century Classics)', ['Rasipuram Krishnaswamy Narayan'], '1995', true], ['Emma', ['Jane Austen'], '1815']]
  .map(([title, authors, publishedDate, found], index) => ({ bookKey: 'v1:openlibrary:OL' + (500 + index) + 'W', title, authors, publishedDate, found }));
const SAVED = [['Alice’s Adventures in Wonderland', 'Lewis Carroll'], ['Gitanjali (song offerings): a collection of prose translations made by the author from the original Bengali', 'Rabindranath Tagore'],
  ['The Adventures of Sherlock Holmes', 'Arthur Conan Doyle'], ['Pride and Prejudice', 'Jane Austen']].map(([title, author], index) => ({ bookKey: 'v1:openlibrary:OL' + (900 + index) + 'W', title, authors: [author],
    source: 'direct', viewedAt: new Date(Date.UTC(2026, 0, 9 - index)).toISOString() }));

async function setup(page, { saved = SAVED, libraryId = LIBRARY.id } = {}) {
  await installPublicV2Fixture(page);
  await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ json: { library: LIBRARY } }));
  await page.route('**/api/v2/books/search', route => route.fulfill({ json: { kind: 'candidates', candidates: RESULTS, nextOffset: null } }));
  // Every second book asked about is found (saved and suggested alike), one is not, the rest have no answer.
  await page.route('**/api/v2/holdings/lookup', route => route.fulfill({ json: { answers: Object.fromEntries(route.request().postDataJSON().books
    .map((book, index) => [book.bookKey, index % 2 ? 'found' : index ? null : 'not_found']).filter(([, answer]) => answer)) } }));
  await page.route('**/api/v2/holdings/search', route => {
    const keys = route.request().postDataJSON().books.map(book => book.bookKey);
    const found = RESULTS.filter(book => book.found && keys.includes(book.bookKey)).map(book => book.bookKey);
    const lines = [...found.map(bookKey => ({ type: 'mark', bookKey, answer: 'found' })), { type: 'done', unchecked: keys.filter(key => !found.includes(key)) }];
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' }, body: lines.map(line => JSON.stringify(line) + '\n').join('') });
  });
  // A suggestion the library has, from the server's list.
  await page.route('**/api/v2/suggestions/related**', route => route.fulfill({ json: { books: [0, 1, 2, 3].map(index => ({ bookKey: 'v1:openlibrary:OL' + (700 + index) + 'W', workId: 'OL' + (700 + index) + 'W',
    title: 'Suggested book ' + index, authors: ['Suggested Author ' + index], coverUrl: null })) } }));
  await page.addInitScript(({ saved, libraryId }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({ version: 2, selectedLibraryId: libraryId, recentBooks: [], savedBooks: saved, savedContent: [] }));
  }, { saved, libraryId });
}
const search = async page => {
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.fill('pride');
  await input.press('Enter');
  // The reader's own copy comes first (with its bookmark), then the marked results.
  await expect(marked(page)).toHaveCount(1 + RESULTS.filter(book => book.found).length);
};
// Its content only: where Google's tag is blocked, WebKit's load event comes late (docs/STATUS.md, 24 November 2026).
const open = page => page.goto('/', { waitUntil: 'domcontentloaded' });
const marked = page => page.getByRole('region', { name: 'Search results' }).getByRole('link', { name: /, in Denver Public Library/ });
const textSize = (page, scale) => page.evaluate(size => { document.documentElement.style.fontSize = size; }, scale * 100 + '%');
/** The new width, once the app has drawn the layout that goes with it. */
async function resize(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await expect(page.locator('.desk-column')).toHaveCount(width >= 1100 ? 1 : 0);
  await expect(page.locator('.desk-rail')).toHaveCount(width >= 640 && width < 1100 ? 1 : 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
}
const SIZES = ['phone', 'desk'].map(kind => [kind, kind === 'phone' ? [320, 360, 390, 430] : [800, 1024, 1280, 1440]]);

/** Every row of books: what is printed under the covers, the labels and the plank, measured. */
function rows(page) {
  return page.locator('.home-bookcase .bay:has(.bay-books)').evaluateAll(bays => bays.map(bay => {
    // Rows off screen are skipped by the browser until they are near (content-visibility).
    bay.scrollIntoView({ block: 'center' });
    const lip = bay.querySelector('.bay-lip').getBoundingClientRect(), plank = bay.querySelector('.bay-plank').getBoundingClientRect(), whole = bay.getBoundingClientRect();
    const slots = [...bay.querySelectorAll('.bay-books > li')].map(slot => {
      const box = element => element && (({ top, bottom, left, right }) => ({ top, bottom, left, right }))(element.getBoundingClientRect());
      return { cover: box(slot.querySelector('.cover3d')), caption: box(slot.querySelector('.result-caption')), answer: box(slot.querySelector('.cover-answer')), label: box(slot.querySelector('.suggested-label')) };
    });
    return { lip: lip.top, plank: { top: plank.top, bottom: plank.bottom }, bay: { top: whole.top, bottom: whole.bottom, left: whole.left, right: whole.right }, slots, width: innerWidth };
  }));
}
function checkRows(measured, at) {
  for (const row of measured) {
    const labels = row.slots.map(slot => slot.label).filter(Boolean);
    for (const { cover, caption, answer, label } of row.slots) {
      for (const [what, box] of [['caption', caption], ['answer', answer]]) if (box) {
        // Under its cover, above the plank's top, on the page.
        expect(box.top, `${what} under its cover, ${at}`).toBeGreaterThanOrEqual(cover.bottom);
        expect(box.bottom, `${what} above the plank, ${at}`).toBeLessThanOrEqual(row.lip);
        expect(box.left, `${what} on the page, ${at}`).toBeGreaterThanOrEqual(0);
        expect(box.right, `${what} on the page, ${at}`).toBeLessThanOrEqual(row.width);
      }
      if (label) {
        // On the plank front, inside the bay, clear of the answer.
        expect(Math.abs((label.top + label.bottom) / 2 - (row.plank.top + row.plank.bottom) / 2), `label on the plank, ${at}`).toBeLessThanOrEqual(1);
        expect(label.bottom, `label in its bay, ${at}`).toBeLessThanOrEqual(row.bay.bottom + .5);
        if (answer) expect(label.top - answer.bottom, `label clear of the answer, ${at}`).toBeGreaterThanOrEqual(4);
      }
    }
    // One row's labels stand in line and apart.
    expect(Math.max(0, ...labels.map(label => label.top)) - Math.min(...labels.map(label => label.top), Math.max(0, ...labels.map(label => label.top))), at).toBeLessThan(.5);
    labels.slice(1).forEach((label, index) => expect(label.left, `labels apart, ${at}`).toBeGreaterThanOrEqual(labels[index].right));
    // Captions stay in their own columns.
    const captions = row.slots.map(slot => slot.caption || slot.answer).filter(Boolean);
    captions.slice(1).forEach((caption, index) => expect(caption.left, `captions apart, ${at}`).toBeGreaterThanOrEqual(captions[index].right));
  }
}
/** The page and the scrolling areas around an element that are wider inside than out. */
const overflowing = (page, selector) => page.locator(selector).evaluate(list => {
  const wide = [];
  for (let element = list; element; element = element.parentElement) if ((element === document.documentElement || getComputedStyle(element).overflowX !== 'visible') && element.scrollWidth !== element.clientWidth) wide.push(element.className || element.tagName);
  return wide;
});
async function checkList(page, at) {
  expect(await overflowing(page, '.shelf-list'), `no horizontal scroll, ${at}`).toEqual([]);
  const { list, items } = await page.locator('.shelf-list').evaluate(element => ({ list: element.getBoundingClientRect().toJSON(),
    items: [...element.querySelectorAll('.shelf-list-item')].map(item => ({ left: item.getBoundingClientRect().left, width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height,
      parts: [...item.querySelectorAll('.shelf-list-title, .shelf-list-author, .shelf-list-cover')].map(part => ({ right: part.getBoundingClientRect().right, top: part.getBoundingClientRect().top - item.getBoundingClientRect().top,
        bottom: item.getBoundingClientRect().bottom - part.getBoundingClientRect().bottom, lines: part.getBoundingClientRect().height / parseFloat(getComputedStyle(part).lineHeight) })) })) }));
  for (const item of items) {
    expect([item.left, item.width], `rows of one width, ${at}`).toEqual([list.left, list.width]);
    expect(item.height, at).toBeGreaterThanOrEqual(44);
    for (const part of item.parts) {
      expect(part.right, `inside the row, ${at}`).toBeLessThanOrEqual(list.right + .5);
      expect(Math.min(part.top, part.bottom), `inside the row, ${at}`).toBeGreaterThanOrEqual(0);
    }
  }
}

for (const [kind, widths] of SIZES) test.describe(`Shelf rows and lists, ${kind}`, () => {
  test.skip(({ isMobile }) => isMobile && kind === 'desk', 'Desktop browsers only');
  for (const scale of [1, 2]) test(`text at ${scale * 100}%: nothing over the plank, labels in line, lists inside the page`, async ({ page }) => {
    test.slow();
    await setup(page);
    await page.setViewportSize({ width: widths[0], height: 900 });
    await open(page);
    await expect(page.locator('.home-bookcase .cover3d.is-suggested')).toHaveCount(5);
    await expect(page.locator('.home-bookcase li:has(.suggested-label) .cover-answer').first()).toBeAttached();
    await textSize(page, scale);
    for (const width of widths) {
      await resize(page, width);
      checkRows(await rows(page), `home, ${width} px`);
      if (kind === 'phone') {
        const name = await page.locator('.home-wordmark').boundingBox(), bar = await page.locator('.search-bar').boundingBox();
        expect(name.y + name.height, `wordmark clear of the search bar, ${width} px`).toBeLessThanOrEqual(bar.y);
      }
    }
    await page.getByRole('button', { name: 'List view' }).click();
    for (const width of widths) {
      await resize(page, width);
      await checkList(page, `home list, ${width} px`);
    }
    await search(page);
    for (const width of widths) {
      await resize(page, width);
      await checkList(page, `results list, ${width} px`);
    }
    // At most two lines each, with the whole title kept for screen readers.
    const long = page.locator('.shelf-list-item', { hasText: LONG });
    await expect(long).toHaveAccessibleName(new RegExp('^' + LONG.replace(/[()]/g, '\\$&')));
    expect(await long.locator('.shelf-list-title').evaluate(title => Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight)))).toBeLessThanOrEqual(2);
    await page.getByRole('button', { name: 'Shelf view' }).click();
    for (const width of widths) {
      await resize(page, width);
      const measured = await rows(page);
      checkRows(measured, `results, ${width} px`);
      // Each cover's badges are on the page.
      const badges = await page.locator('.results-bookcase .cover-badge').evaluateAll(items => items.map(item => item.getBoundingClientRect()).map(box => [box.left, box.right, innerWidth]));
      for (const [left, right, page] of badges) { expect(left, `badge, ${width} px`).toBeGreaterThanOrEqual(0); expect(right, `badge, ${width} px`).toBeLessThanOrEqual(page); }
      expect(measured.flatMap(row => row.slots).filter(slot => slot.answer)).toHaveLength(await marked(page).count());
      expect(await overflowing(page, '.results-bookcase'), `no horizontal scroll, ${width} px`).toEqual([]);
    }
  });
});

test('the request form’s fields are drawn as fields, also inside "Want a reply?"', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v2/libraries/discover', route => route.fulfill({ json: { libraries: [], total: 0, nextOffset: null } }));
  await open(page);
  await page.getByRole('button', { name: 'Change library' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change library' });
  await dialog.getByRole('button', { name: 'My library isn’t listed' }).click();
  const colors = await page.locator('.library-request-form input').evaluateAll(inputs => inputs.map(input => [getComputedStyle(input).backgroundColor, getComputedStyle(input.closest('.contact-fields') || document.querySelector('.library-dialog')).backgroundColor]));
  expect(colors).toHaveLength(3);
  for (const [field, around] of colors) expect(field).not.toBe(around);
});

test('desktop cold open: "Choose your library" stands under the centred search bar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop browsers only');
  await setup(page, { saved: [], libraryId: null });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const prompt = await page.getByRole('region', { name: 'Choose your library' }).boundingBox();
  const bar = await page.locator('.search-bar').boundingBox();
  expect(Math.abs(prompt.x + prompt.width / 2 - bar.x - bar.width / 2)).toBeLessThanOrEqual(1);
  expect(prompt.y).toBeGreaterThanOrEqual(bar.y + bar.height);
});
