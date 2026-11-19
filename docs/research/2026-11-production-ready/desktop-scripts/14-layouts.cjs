// Layout checks at every viewport. No library chosen for anything that searches or opens a book; the library-chosen state is used for the shelf only.
const { open, layoutRow, BASE, SHOTS } = require('./lib.cjs');
const path = require('path');
const { search } = require('./search.cjs');
const VPS = (process.env.VPS ? JSON.parse(process.env.VPS) : [[1440, 900], [1920, 1080], [1280, 720], [1100, 800], [1024, 768], [700, 900]]);
const extraMetrics = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const sc = document.querySelector('.desk-shelf') || document.scrollingElement;
  const lastBottom = Math.max(0, ...[...document.querySelectorAll('.bay, .shelf-list-item, .search-message, .viewed-before, [aria-label="Viewed before"]')].map(e => e.getBoundingClientRect().bottom));
  const about = document.querySelector('.shelf-book-about'); let cpl = null;
  if (about) { const range = document.createRange(); range.selectNodeContents(about); const rects = [...range.getClientRects()]; const lines = new Set(rects.map(r => Math.round(r.top))).size; cpl = lines ? Math.round(about.textContent.length / lines) : null; }
  return { column: r('.desk-column'), rail: r('.desk-rail'), slot: r('.desk-slot'), shelf: r('.desk-shelf'), searchBar: r('.search-bar'), cover: r('.home-bookcase .cover3d'), scroller: sc ? [sc.scrollHeight, sc.clientHeight] : null, emptyBelowContentPx: Math.round(innerHeight - Math.min(innerHeight, lastBottom)), aboutCharsPerLine: cpl, bayWidth: r('.bay'), gapRightOfLastBookInBay: (() => { const bay = document.querySelector('.bay-books'); if (!bay) return null; const last = bay.querySelector('li:last-child .cover3d') || bay.lastElementChild; return Math.round(bay.getBoundingClientRect().right - last.getBoundingClientRect().right); })() };
});
(async () => {
  for (const [w, h] of VPS) {
    const vp = { width: w, height: h };
    let s = await open({ name: '14-layouts', stateFile: 'state-nolib-12.json', viewport: vp });
    let { page, shot } = s;
    const wide = w >= 1100;
    try {
      await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1800);
      await shot('76-shelf-12-<vp>');
      let a = await layoutRow(page, s.vp, 'shelf, 12 saved, no library'); console.log(s.vp, 'SHELF', JSON.stringify({ over: a.overflowX, trunc: a.trunc, minFont: a.minFont, smallFonts: a.smallFonts, minT: a.minTarget, smallT: a.smallTargets, covered: a.covered, bays: a.baysBooks, scrollers: a.scrollers }), JSON.stringify(await extraMetrics(page)));
      await page.mouse.move(w * 0.6, h * 0.6); await page.mouse.wheel(0, 4000); await page.waitForTimeout(500); await shot('76-shelf-12-bottom-<vp>'); await page.mouse.wheel(0, -4000); await page.waitForTimeout(300);
      // list view
      await page.getByRole('button', { name: 'List view' }).click(); await page.waitForTimeout(500); await shot('77-shelf-list-<vp>');
      a = await layoutRow(page, s.vp, 'shelf list view, 12 saved'); console.log(s.vp, 'LIST', JSON.stringify({ over: a.overflowX, trunc: a.trunc, minT: a.minTarget, smallT: a.smallTargets, line: a.maxLineChars }), JSON.stringify(await extraMetrics(page)));
      await page.getByRole('button', { name: 'Shelf view' }).click(); await page.waitForTimeout(400);
      // book page
      await page.locator('.home-bookcase .cover3d:not(.is-suggested)').first().click();
      await page.locator('h1.shelf-book-title').waitFor(); await page.waitForTimeout(1600);
      await shot('78-book-<vp>');
      a = await layoutRow(page, s.vp, 'book page (no library)'); console.log(s.vp, 'BOOK', JSON.stringify({ over: a.overflowX, trunc: a.trunc, minFont: a.minFont, smallFonts: a.smallFonts, minT: a.minTarget, smallT: a.smallTargets, covered: a.covered, scrollers: a.scrollers }), JSON.stringify(await extraMetrics(page)));
      console.log(s.vp, 'book controls', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.desk-slot button, .desk-slot a, .shelf-book button, .shelf-book a')].map(b => (b.getAttribute('aria-label') || b.innerText.trim()).slice(0, 30)))), 'shelf visible width beside page:', await page.evaluate(() => { const sl = document.querySelector('.desk-slot'); return sl ? Math.round(innerWidth - sl.getBoundingClientRect().right) : 'no slot'; }));
      const more = page.getByRole('button', { name: 'More' }); if (await more.count()) { await more.click(); await page.waitForTimeout(300); await shot('78-book-more-open-<vp>'); }
      await page.keyboard.press('Escape'); await page.waitForTimeout(600);
      if (await page.locator('h1.shelf-book-title').count()) { console.log(s.vp, 'Escape did not close the book; using Back/Close'); const c = page.getByRole('button', { name: /Close/ }).or(page.getByRole('link', { name: /Back/ })); await c.first().click(); await page.waitForTimeout(500); }
      // search results (no library)
      const r = await search(page, 'R. K. Narayan', `author query at ${s.vp}`, { step: `11 layout ${s.vp}` });
      await page.waitForTimeout(400); await shot('79-results-<vp>');
      a = await layoutRow(page, s.vp, 'search results (no library)'); console.log(s.vp, 'RESULTS', JSON.stringify({ over: a.overflowX, bays: a.baysBooks, trunc: a.trunc, minT: a.minTarget, smallT: a.smallTargets, covered: a.covered, scrollers: a.scrollers }), JSON.stringify(await extraMetrics(page)));
      // book opened from results
      await page.locator('.results-bookcase .cover3d').nth(4).click(); await page.locator('h1.shelf-book-title').waitFor(); await page.waitForTimeout(1500);
      await shot('80-book-from-results-<vp>');
      const c = page.getByRole('button', { name: /Close/ }).or(page.getByRole('link', { name: /Back/ })); await c.first().click(); await page.waitForTimeout(500);
      console.log(s.vp, 'after closing book from results: results kept?', await page.locator('.results-bookcase .cover3d').count());
      await page.getByText('Back to my shelf').click().catch(() => {}); await page.waitForTimeout(600);
      // picker with a city typed (directory only)
      const opener = wide ? page.getByRole('button', { name: 'Find my library' }) : page.locator('.desk-rail').getByRole('button', { name: 'My library' });
      await opener.click(); await page.getByRole('heading', { name: 'Find your library' }).waitFor();
      await page.getByLabel('City, town or library name').pressSequentially('Chennai', { delay: 40 }); await page.locator('.library-row').first().waitFor(); await page.waitForTimeout(700);
      await shot('81-picker-city-<vp>');
      a = await layoutRow(page, s.vp, 'library picker, city typed'); console.log(s.vp, 'PICKER', JSON.stringify({ over: a.overflowX, trunc: a.trunc, minT: a.minTarget, smallT: a.smallTargets, scrollers: a.scrollers }));
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
      // account entry and report at this width
      if (!wide) {
        await page.locator('.desk-rail').getByRole('button', { name: 'Account' }).click(); await page.waitForTimeout(400);
        await page.getByRole('link', { name: 'Create account' }).click(); await page.waitForTimeout(1200); await shot('82-account-create-<vp>');
        await layoutRow(page, s.vp, 'create account');
        await page.goBack(); await page.waitForTimeout(600);
      } else if (w !== 1440) { await page.getByRole('link', { name: 'Create account' }).click(); await page.waitForTimeout(1200); await shot('82-account-create-<vp>'); await layoutRow(page, s.vp, 'create account'); await page.keyboard.press('Escape'); await page.goBack().catch(() => {}); }
    } catch (e) { console.error(s.vp, 'ERR', e.message.split('\n').slice(0, 3).join(' / ')); await shot('ERR-14-<vp>').catch(() => {}); }
    finally { await s.close(); }
    // library chosen, shelf only
    s = await open({ name: '14-layouts-lib', stateFile: 'state-burl-13.json', viewport: vp }); ({ page, shot } = s);
    try {
      await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1800);
      await shot('83-shelf-13-library-chosen-<vp>');
      const a = await layoutRow(page, s.vp, 'shelf, 13 saved, library chosen'); console.log(s.vp, 'SHELF+LIB', JSON.stringify({ over: a.overflowX, trunc: a.trunc, minT: a.minTarget, bays: a.baysBooks }), 'library name visible on screen?', await page.getByText('Burlingame Public Library').first().isVisible().catch(() => false));
      if (!wide) { await page.locator('.desk-rail').getByRole('button', { name: 'My library' }).click(); await page.waitForTimeout(600); await shot('83-rail-my-library-pressed-<vp>'); console.log(s.vp, 'rail My library opens:', (await page.locator('dialog[open]').first().innerText().catch(() => 'none')).replace(/\n+/g, ' | ').slice(0, 200)); await page.keyboard.press('Escape'); }
    } catch (e) { console.error(s.vp, 'ERR', e.message.split('\n')[0]); } finally { await s.close(); }
  }
  // dark colour scheme on a brand-new context (no stored preference)
  const d = await open({ name: '14-dark-fresh', extra: { colorScheme: 'dark' } });
  try { await d.page.goto(BASE + '/app/shelf'); await d.page.getByRole('heading', { name: 'Ready to search' }).waitFor(); await d.page.waitForTimeout(1200); await d.shot('84-dark-scheme-fresh-cold-shelf-<vp>');
    console.log('DARK FRESH', await d.page.evaluate(() => JSON.stringify({ attrs: [...document.documentElement.attributes].map(a => a.name + '=' + a.value), bg: getComputedStyle(document.body).backgroundColor, pressed: [...document.querySelectorAll('.light-toggle button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.innerText), stored: localStorage.getItem('mybookshelf.appearance.v1') })));
  } catch (e) { console.error('ERR', e.message); } finally { await d.close(); }
})();
