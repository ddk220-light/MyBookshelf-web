// Repeatable visual review. API responses are fixtures; screenshots do not prove
// live catalog availability. External covers fail deliberately to review fallbacks.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { installPublicV2Fixture, LINKED_LIBRARY, BOOK } from '../../client/e2e/public-v2-fixture.js';
const output = process.env.PREVIEW_ARTIFACTS || '/tmp/mybookshelf-ui-review';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';
const widths = (process.env.PREVIEW_WIDTHS || '390,1440').split(',').map(Number);
const browser = await chromium.launch();
const library = { ...LINKED_LIBRARY, capabilities: { ...LINKED_LIBRARY.capabilities, titleSearch: true } };
const books = [
  ['9780261103344', 'The Hobbit', 'J.R.R. Tolkien'],
  ['9780061122415', 'The Alchemist', 'Paulo Coelho'],
  ['9788173711466', 'Wings of Fire', 'A. P. J. Abdul Kalam'],
  ['9780451524935', 'Nineteen Eighty-Four', 'George Orwell'],
  ['9780140328721', 'Fantastic Mr Fox', 'Roald Dahl'],
  ['9780451225245', 'The Pillars of the Earth', 'Ken Follett'],
  ['9788172764588', 'Ponniyin Selvan, Part 1: Pudhu Vellam', 'Kalki Krishnamurthy'],
].map(([isbn13, title, author], i) => ({ bookKey: 'v1:isbn:' + isbn13, isbn13, title, authors: [author], source: 'direct', viewedAt: new Date(Date.UTC(2026,9,31,12,0,60-i)).toISOString() }));
const results = [];
await mkdir(output, { recursive: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, baseURL, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await installPublicV2Fixture(page);
    await page.route('**/api/v2/libraries/resolve', route => route.fulfill({ json: { library } }));
    await page.route(/https:\/\/(covers.openlibrary.org|books.google.com)\//, route => route.abort());
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await page.evaluate(({id, books}) => localStorage.setItem('mybookshelf.anonymous-web.v1', JSON.stringify({version:1,selectedLibraryId:id,savedBooks:books,recentBooks:books.slice(0,3)})), {id:library.id,books});
    const capture = async (screen, path, theme) => {
      console.log(JSON.stringify({width,theme,screen,path}));
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (path.startsWith('/app/')) await page.locator('html').waitFor({state:'attached'});
      const geometry = await page.evaluate(() => {
        const main = document.querySelector('main');
        const h1 = document.querySelector('h1');
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1 || main.scrollWidth > main.clientWidth + 1,
          heading: h1.textContent, headingSize:getComputedStyle(h1).fontSize,
          background:getComputedStyle(document.body).backgroundColor,
          sidebarWidth: document.querySelector('.app-navigation')?.getBoundingClientRect().width || null,
          mainWidth:main.getBoundingClientRect().width };
      });
      const file = `${width}-${theme}-${screen}.png`;
      await page.screenshot({ path: output + '/' + file, fullPage: true });
      results.push({width,theme,screen,path,file,...geometry});
    };
    for (const theme of ['daylight','lamplight','ink']) {
      await page.evaluate(theme => localStorage.setItem('mybookshelf.appearance.v1', JSON.stringify({version:1,preference:theme})), theme);
      for (const [screen,path] of [['shelf','/app/shelf'],['book','/app/books/'+encodeURIComponent(BOOK.bookKey)],['library-picker','/app/libraries'],['side-panel','/app/settings'],['privacy','/app/privacy']]) await capture(screen,path,theme);
    }
    await page.goto('/about', {waitUntil:'domcontentloaded'});
    await page.evaluate(() => localStorage.clear());
    for (const [screen,path] of [['home','/'],['guides','/libraries'],['library','/libraries/anna-centenary-library'],['about','/about'],['how','/how-it-works'],['source','/open-source'],['support','/support'],['privacy','/privacy'],['404','/not-a-page']]) await capture(screen,path,'public');
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(output+'/layout-review.json',JSON.stringify({baseURL,fixtureAvailability:true,missingCovers:true,results},null,2));
const failures = results.filter(row => row.overflow);
console.log(JSON.stringify({screens:results.length,failures},null,2));
if (failures.length) process.exitCode = 1;
