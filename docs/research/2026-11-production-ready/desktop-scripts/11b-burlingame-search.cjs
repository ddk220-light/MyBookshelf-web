// Burlingame: title search (live check 9). Then open a marked result (answer expected from the marks, no new check).
const { open, layoutRow, timing, BASE, STATE_FILE, SHOTS } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const { search } = require('./search.cjs');
const { slot, column, openBookMeasure } = require('./libsteps.cjs');
(async () => {
  const s = await open({ name: '11b-burlingame-search', useState: true });
  const { page, shot } = s;
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(2000);
    await shot('60-shelf-burlingame-returning-<vp>');
    console.log('shelf badges (stored answers on return):', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].filter(c => c.querySelector('.cover-badge-library')).map(c => c.getAttribute('aria-label')))));
    setTimeout(() => shot('61-search-title-burlingame-looking-<vp>').catch(() => {}), 6500);
    const r = await search(page, 'Wings of Fire', 'title query @ Burlingame', { step: '4 search (Burlingame)', expectLibrary: true, maxWait: 45000 });
    console.log(JSON.stringify(r.out)); console.log(JSON.stringify(r.cards.cards.map(c => c.name)), '|', r.cards.libLine);
    await page.waitForTimeout(400);
    await shot('61-search-title-burlingame-<vp>');
    await layoutRow(page, s.vp, 'search results: title, Burlingame');
    await page.locator('.results-head').screenshot({ path: path.join(SHOTS, '61-results-head-burlingame-1440x900.png') });
    // hover a marked result: tooltip?
    const marked = page.locator('.results-bookcase .cover3d:has(.cover-badge-library)');
    console.log('marked', await marked.count(), 'title attr on covers', await page.locator('.results-bookcase .cover3d').first().getAttribute('title'));
    if (await marked.count() > 1) {
      const b = await openBookMeasure(page, marked.nth(1), 'marked result (not Kalam) @ Burlingame, answer from marks', '6 book page (Burlingame)');
      console.log('MARKED BOOK', JSON.stringify(b));
      await shot('62-book-burlingame-marked-result-<vp>');
      await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(600);
    }
    await page.getByText('Back to my shelf').click(); await page.waitForTimeout(1500);
    await shot('62-shelf-burlingame-after-<vp>');
  } catch (e) { console.error('ERR', e); }
  finally { await s.close({ save: true }); fs.copyFileSync(STATE_FILE, STATE_FILE.replace('state.json', 'state-burl-13.json')); }
})();
