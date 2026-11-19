// e-Granthalaya: PM SHRI Kendriya Vidyalaya No.1 Narimedu. Wings of Fire from the shelf (live check 5), one Retry (6).
const { open, layoutRow, timing, BASE, STATE_FILE, SHOTS } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const { slot, column, chooseLibrary, openBookMeasure } = require('./libsteps.cjs');
(async () => {
  fs.copyFileSync(STATE_FILE.replace('state.json', 'state-anna-13.json'), STATE_FILE);
  const s = await open({ name: '10-kv', useState: true });
  const { page, shot } = s;
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    // how the library is changed
    const change = column(page).getByRole('button', { name: 'Change library' });
    await change.hover(); await page.waitForTimeout(200);
    await column(page).screenshot({ path: path.join(SHOTS, '52-column-library-change-hover-1440x900.png') });
    const c = await chooseLibrary(page, 'Kendriya Vidyalaya Narimedu', 'Narimedu', '3 choose library');
    await shot('52-picker-change-from-anna-<vp>');
    console.log('picker while a library is chosen:', (await page.locator('h2:has-text("Find your library")').locator('xpath=../..').innerText()).replace(/\n+/g, ' | '));
    await c.pick();
    await page.waitForTimeout(1200);
    await shot('53-library-chosen-kv-shelf-<vp>');
    console.log('COLUMN', (await column(page).innerText()).replace(/\n+/g, ' | '));
    console.log('badges after change:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].filter(c => c.querySelector('.cover-badge-library')).map(c => c.getAttribute('aria-label')))));
    const loc = page.locator('.home-bookcase .cover3d[aria-label^="Wings of Fire"]').first();
    setTimeout(() => shot('54-book-kv-checking-6s-<vp>').catch(() => {}), 6000);
    setTimeout(() => slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '54-book-kv-checking-answer-card-1440x900.png') }).catch(() => {}), 7000);
    setTimeout(() => shot('54-book-kv-checking-20s-<vp>').catch(() => {}), 20000);
    const b = await openBookMeasure(page, loc, 'Wings of Fire @ KV Narimedu (e-Granthalaya)', '8 same book across libraries', 75000);
    console.log('WOF KV', JSON.stringify(b));
    await page.waitForTimeout(500);
    await shot('55-book-kv-answer-<vp>');
    await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '55-book-kv-answer-card-1440x900.png') });
    console.log('TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 500));
    if (b.retry) {
      const retry = slot(page).getByRole('button', { name: 'Try again' });
      console.log('retry box', JSON.stringify(await retry.boundingBox()), 'cursor', await retry.evaluate(e => getComputedStyle(e).cursor), 'title attr', await retry.getAttribute('title'));
      await retry.hover(); await page.waitForTimeout(250);
      await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, 'states', 'retry-button-hover.png') });
      await retry.focus(); await page.waitForTimeout(150);
      await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, 'states', 'retry-button-focus.png') });
      await page.mouse.move(700, 700);
      await page.evaluate(() => document.activeElement?.blur());
      await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, 'states', 'retry-button-default.png') });
      // one Retry (live check 6)
      await page.evaluate(() => { window.__r = { t: null }; const a = document.querySelector('.desk-slot .library-answer'); new MutationObserver(() => { const x = document.querySelector('.desk-slot .library-answer'); if (x && x.dataset.answer !== 'checking' && window.__r.t != null && !('end' in window.__r) && window.__r.sawChecking) window.__r.end = performance.now(); if (x && x.dataset.answer === 'checking') window.__r.sawChecking = true; }).observe(document.body, { subtree: true, attributes: true, childList: true }); });
      await page.evaluate(() => { window.__r.t = performance.now(); });
      await retry.click();
      await page.waitForTimeout(3000); await shot('56-book-kv-retry-checking-<vp>');
      await page.waitForFunction(() => 'end' in window.__r, null, { timeout: 75000, polling: 100 }).catch(() => console.log('!! retry did not settle in 75 s'));
      const r = await page.evaluate(() => window.__r);
      const ans = await slot(page).locator('.library-answer').getAttribute('data-answer');
      if (r.end) timing('8 same book across libraries', `Wings of Fire @ KV Narimedu: Retry press to answer settled (${ans})`, r.end - r.t, 'performance.now() in page; MutationObserver');
      console.log('RETRY result', ans, r.end ? Math.round(r.end - r.t) : 'not settled', 'retry still offered?', await slot(page).getByRole('button', { name: 'Try again' }).count());
      await shot('56-book-kv-after-retry-<vp>');
    }
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(1000);
    await shot('57-shelf-kv-after-check-<vp>');
    await layoutRow(page, s.vp, 'shelf 13 saved, KV Narimedu chosen');
  } catch (e) { console.error('ERR', e); await shot('ERR-10-<vp>').catch(() => {}); }
  finally { await s.close({ save: true }); fs.copyFileSync(STATE_FILE, STATE_FILE.replace('state.json', 'state-kv-13.json')); }
})();
