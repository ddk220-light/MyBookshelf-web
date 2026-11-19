// Anna Centenary: save Wings of Fire, ISBN search (live check 2), ISBN book page (3), an unmarked result's book page (4), catalog link opened once.
const { open, layoutRow, timing, BASE, STATE_FILE, SHOTS } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const { search } = require('./search.cjs');
const { slot, column, openBookMeasure } = require('./libsteps.cjs');
(async () => {
  const s = await open({ name: '08-anna2', useState: true });
  const { page, shot } = s;
  let t0 = Date.now();
  await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor();
  await column(page).getByText('Anna Centenary Library').waitFor();
  timing('2 returning shelf', 'returning reader (12 saved, library chosen): navigation to shelf heading and library name', Date.now() - t0, 'Date.now() around goto and waitFor');
  await page.waitForTimeout(2000);
  await shot('44-returning-shelf-anna-<vp>');
  console.log('badges on shelf (stored answers):', await page.locator('.home-bookcase .cover-badge-library').count(), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].filter(c => c.querySelector('.cover-badge-library')).map(c => c.getAttribute('aria-label')))));
  // ISBN search (live check 2)
  const r = await search(page, '9780143333623', 'ISBN query @ Anna Centenary', { step: '4 search (Anna Centenary)', expectLibrary: true });
  console.log(JSON.stringify(r.out)); console.log(JSON.stringify(r.cards));
  await page.waitForTimeout(500);
  await shot('45-search-isbn-anna-<vp>');
  console.log('URL after ISBN search', page.url().replace(/\d{13}/, '<isbn>'), 'slot open?', await slot(page).count());
  await layoutRow(page, s.vp, 'search results: ISBN, Anna Centenary');
  if (r.cards.count > 0) {
    const first = page.locator('.results-bookcase .cover3d').first();
    const b = await openBookMeasure(page, first, 'ISBN result book @ Anna Centenary', '6 book page (Anna Centenary)');
    console.log('ISBN BOOK', JSON.stringify(b));
    await shot('46-book-anna-isbn-result-<vp>');
    console.log('ISBN BOOK TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 700));
    await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '46-book-anna-isbn-answer-card-1440x900.png') }).catch(() => {});
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(500);
  }
  // title search again? No: go back to shelf and open Wings of Fire via the suggestions if present, else via stored state
  await page.getByText('Back to my shelf').click(); await page.waitForTimeout(1500);
  await s.close({ save: true });
})().catch(e => { console.error(e); process.exit(1); });
