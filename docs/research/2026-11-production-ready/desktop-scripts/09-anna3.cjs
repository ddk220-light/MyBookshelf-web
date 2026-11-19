// Anna Centenary: Wings of Fire by its book address (stored answer expected), save it, catalog link opened once; one saved book opened from the shelf (live check 3).
const { open, layoutRow, timing, BASE, STATE_FILE, SHOTS, sleep } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const { slot, column, openBookMeasure } = require('./libsteps.cjs');
(async () => {
  const s = await open({ name: '09-anna3', useState: true });
  const { page, shot, context } = s;
  try {
    const t0 = Date.now();
    await page.goto(BASE + '/app/books/v1%3Aopenlibrary%3AOL1037811W', { waitUntil: 'commit' });
    await slot(page).locator('h1.shelf-book-title').waitFor({ timeout: 20000 });
    const tTitle = Date.now() - t0;
    await page.waitForFunction(() => { const a = document.querySelector('.desk-slot .library-answer'); return a && a.dataset.answer !== 'checking'; }, null, { timeout: 45000, polling: 50 });
    const tAns = Date.now() - t0;
    timing('8 same book across libraries', 'Wings of Fire @ Anna Centenary by direct address (new visit): navigation to title', tTitle, 'Date.now() around goto and waitFor');
    timing('8 same book across libraries', 'Wings of Fire @ Anna Centenary by direct address (new visit): navigation to library answer settled', tAns, 'Date.now(); DOM poll every 50 ms');
    await page.waitForTimeout(1500);
    const info = await slot(page).evaluate(el => { const a = el.querySelector('.library-answer'); const c = el.querySelector('.library-answer-catalog'); return { aria: a?.getAttribute('aria-label'), answer: a?.dataset.answer, visible: a?.innerText.replace(/\s+/g, ' ').trim(), href: c?.href, target: c?.target, rel: c?.rel }; });
    console.log('WOF ANNA', JSON.stringify(info));
    await shot('47-book-anna-wings-direct-<vp>');
    await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '47-book-anna-found-answer-card-1440x900.png') });
    console.log('BOOK TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | '));
    // save
    await slot(page).getByRole('button', { name: 'Add to my shelf' }).click(); await slot(page).getByRole('button', { name: 'On my shelf' }).waitFor();
    await page.waitForTimeout(600); await shot('47-book-anna-wings-saved-<vp>');
    // catalog link: open once
    if (info.href) {
      const cat = await context.newPage();
      const c0 = Date.now(); let status = 'n/a';
      try { const resp = await cat.goto(info.href, { timeout: 30000, waitUntil: 'load' }); status = resp?.status(); } catch (e) { status = 'error: ' + e.message.split('\n')[0]; }
      timing('6 catalog link', 'Anna Centenary catalog link: navigation to load', Date.now() - c0, 'Date.now() around goto');
      await sleep(1500);
      await cat.screenshot({ path: path.join(SHOTS, '48-catalog-link-anna-opened-1440x900.png') }).catch(() => {});
      console.log('CATALOG PAGE', status, cat.url(), '| title:', await cat.title().catch(() => ''), '| mentions the book?', await cat.evaluate(() => /wings of fire/i.test(document.body.innerText)).catch(() => 'n/a'));
      await cat.close();
    }
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(1500);
    await shot('49-shelf-13-anna-<vp>');
    console.log('shelf badges', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].filter(c => c.querySelector('.cover-badge-library')).map(c => c.getAttribute('aria-label')))));
    // a saved book from the shelf: live check 3
    const target = page.locator('.home-bookcase .cover3d:not(.is-suggested)', { hasText: '' }).filter({ has: page.locator('xpath=self::*[contains(@aria-label,"Ram - Scion")]') });
    const loc = (await target.count()) ? target.first() : page.locator('.home-bookcase .cover3d[aria-label^="Ram - Scion"]').first();
    console.log('opening', await loc.getAttribute('aria-label'));
    const b = await openBookMeasure(page, loc, 'Ram - Scion of Ikshvaku @ Anna Centenary (from shelf)', '6 book page (Anna Centenary)');
    console.log('RAM ANNA', JSON.stringify(b));
    await shot('50-book-anna-ram-<vp>');
    await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '50-book-anna-ram-answer-card-1440x900.png') });
    console.log('RAM TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 600));
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(1200);
    await shot('51-shelf-anna-after-checks-<vp>');
    console.log('shelf badges after', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].map(c => c.getAttribute('aria-label')))));
    await layoutRow(page, s.vp, 'shelf 13 saved, Anna Centenary, after checks');
  } catch (e) { console.error('ERR', e); await shot('ERR-09-<vp>').catch(() => {}); }
  finally { await s.close({ save: true }); fs.copyFileSync(STATE_FILE, STATE_FILE.replace('state.json', 'state-anna-13.json')); }
})();
