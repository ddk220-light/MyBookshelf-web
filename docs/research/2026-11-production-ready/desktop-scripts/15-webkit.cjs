// WebKit at 1440x900: cold shelf, search results, book page. No library chosen, so no catalog checks.
const { open, layoutRow, timing, BASE } = require('./lib.cjs');
const { search } = require('./search.cjs');
(async () => {
  let s = await open({ name: '15-webkit', engine: 'webkit' }); let { page, shot } = s;
  try {
    const t0 = Date.now();
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'Ready to search' }).waitFor();
    timing('13 WebKit', 'cold shelf: navigation to "Ready to search" heading', Date.now() - t0, 'Date.now() around goto and waitFor');
    await page.waitForTimeout(2000); await shot('85-webkit-cold-shelf-<vp>');
    console.log('COLD', JSON.stringify(await layoutRow(page, s.vp + ' webkit', 'cold shelf')));
    console.log('fonts', await page.evaluate(() => JSON.stringify({ h1: getComputedStyle(document.querySelector('h1')).fontFamily.slice(0, 60), body: getComputedStyle(document.body).fontFamily.slice(0, 60), loaded: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight) })));
    const r = await search(page, 'R. K. Narayan', 'author query (WebKit, no library)', { step: '13 WebKit' });
    console.log(JSON.stringify(r.out), r.cards.count, JSON.stringify(r.cards.bays));
    await page.waitForTimeout(600); await shot('86-webkit-results-<vp>');
    console.log('RESULTS', JSON.stringify(await layoutRow(page, s.vp + ' webkit', 'search results (no library)')));
    const c0 = Date.now();
    await page.locator('.results-bookcase .cover3d').first().click(); await page.locator('.desk-slot h1.shelf-book-title').waitFor();
    timing('13 WebKit', 'click result cover to book title', Date.now() - c0, 'Date.now() around click and waitFor');
    await page.waitForTimeout(2000); await shot('87-webkit-book-<vp>');
    console.log('BOOK', JSON.stringify(await layoutRow(page, s.vp + ' webkit', 'book page (no library)')));
    await page.locator('.desk-slot').getByRole('button', { name: 'Add to my shelf' }).click(); await page.waitForTimeout(900); await shot('87-webkit-book-saved-<vp>');
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    console.log('Escape closes in WebKit?', await page.locator('.desk-slot').count() === 0);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    console.log('Tab in WebKit focuses:', await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim().slice(0, 50)));
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }
  s = await open({ name: '15-webkit-12', engine: 'webkit', stateFile: 'state-nolib-12.json' }); ({ page, shot } = s);
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(2500);
    await shot('88-webkit-shelf-12-<vp>');
    console.log('SHELF12', JSON.stringify(await layoutRow(page, s.vp + ' webkit', 'shelf, 12 saved, no library')));
    await page.getByRole('button', { name: 'Lamplight' }).click(); await page.waitForTimeout(600); await shot('88-webkit-shelf-12-lamplight-<vp>');
    await page.goto(BASE + '/'); await page.waitForTimeout(1200); await shot('89-webkit-landing-<vp>');
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }
})();
