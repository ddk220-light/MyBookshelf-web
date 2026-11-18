// Anna Centenary Library (Koha): choose, title search (live check 1), book page (check 2).
const { open, layoutRow, timing, BASE, STATE_FILE } = require('./lib.cjs');
const fs = require('fs');
const { search } = require('./search.cjs');
const { slot, column, chooseLibrary, openBookMeasure } = require('./libsteps.cjs');
(async () => {
  fs.copyFileSync(STATE_FILE.replace('state.json', 'state-nolib-12.json'), STATE_FILE);
  const s = await open({ name: '07-anna', useState: true });
  const { page, shot } = s;
  await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
  const c = await chooseLibrary(page, 'Anna Centenary', 'Anna Centenary Library', '3 choose library');
  await c.row.hover(); await page.waitForTimeout(200); await shot('40-picker-row-hover-anna-<vp>');
  await c.pick();
  await shot('41-library-chosen-anna-shelf-<vp>');
  console.log('COLUMN', (await column(page).innerText()).replace(/\n+/g, ' | '));
  console.log('library controls', JSON.stringify(await column(page).evaluate(el => [...el.querySelectorAll('button, a')].map(b => (b.getAttribute('aria-label') || b.innerText.trim()) + ' | text="' + b.innerText.trim() + '" ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height) + ' cursor=' + getComputedStyle(b).cursor))));
  console.log('shelf badges after choosing:', await page.locator('.home-bookcase .cover-badge-library').count(), 'focus', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.slice(0, 40)));
  await layoutRow(page, s.vp, 'shelf 12 saved, Anna Centenary chosen');
  // title search: live check 1
  const r = await search(page, 'Wings of Fire', 'title query @ Anna Centenary', { step: '4 search (Anna Centenary)', expectLibrary: true });
  console.log(JSON.stringify(r.out)); console.log(JSON.stringify(r.cards));
  await shot('42-search-title-anna-<vp>'); await shot('42-search-title-anna-full-<vp>', { fullPage: true });
  await layoutRow(page, s.vp, 'search results: title, Anna Centenary');
  console.log('results head', (await page.locator('.results-head').innerText()).replace(/\n+/g, ' | '));
  // book page: first result
  const first = page.locator('.results-bookcase .cover3d').first();
  console.log('opening', await first.getAttribute('aria-label'));
  const b = await openBookMeasure(page, first, 'Wings of Fire @ Anna Centenary', '8 same book across libraries');
  console.log('BOOK', JSON.stringify(b));
  await shot('43-book-anna-wings-of-fire-<vp>');
  console.log('BOOK TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | '));
  console.log('URL', page.url());
  await layoutRow(page, s.vp, 'book page, Anna Centenary answer');
  await slot(page).locator('.library-answer').screenshot({ path: require('path').join(require('./lib.cjs').SHOTS, '43-book-anna-answer-card-1440x900.png') }).catch(e => console.log('no card shot', e.message));
  await s.close({ save: true });
  fs.copyFileSync(STATE_FILE, STATE_FILE.replace('state.json', 'state-anna.json'));
})().catch(e => { console.error(e); process.exit(1); });
