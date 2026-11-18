// Outside India: Burlingame Public Library. Wings of Fire from the shelf (live check 7), ISBN flow (8), title search (9).
const { open, layoutRow, timing, BASE, STATE_FILE, SHOTS } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
const { search } = require('./search.cjs');
const { slot, column, chooseLibrary, openBookMeasure } = require('./libsteps.cjs');
(async () => {
  fs.copyFileSync(STATE_FILE.replace('state.json', 'state-kv-13.json'), STATE_FILE);
  const s = await open({ name: '11-burlingame', useState: true });
  const { page, shot } = s;
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    const c = await chooseLibrary(page, 'Burlingame', 'Burlingame Public Library', '3 choose library');
    await c.pick(); await page.waitForTimeout(1200);
    await shot('58-library-chosen-burlingame-shelf-<vp>');
    console.log('COLUMN', (await column(page).innerText()).replace(/\n+/g, ' | '));
    const loc = page.locator('.home-bookcase .cover3d[aria-label^="Wings of Fire"]').first();
    const b = await openBookMeasure(page, loc, 'Wings of Fire @ Burlingame Public Library', '8 same book across libraries', 75000);
    console.log('WOF BURL', JSON.stringify(b));
    await shot('59-book-burlingame-wings-<vp>');
    await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '59-book-burlingame-answer-card-1440x900.png') });
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(800);
    // ISBN flow, measured in page
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.click();
    await page.evaluate(() => { window.__i = {}; const mark = k => { if (!(k in window.__i)) window.__i[k] = performance.now(); };
      document.addEventListener('keydown', e => { if (e.key === 'Enter') mark('submit'); }, true);
      new MutationObserver(() => { if (!('submit' in window.__i)) return; const s = document.querySelector('.desk-slot'); if (document.querySelector('.ghost-bookcase')) mark('ghost'); if (document.querySelector('.results-bookcase:not(.ghost-bookcase) .cover3d')) mark('firstResult'); if (!s) return; mark('slot'); if (s.querySelector('h1.shelf-book-title')) mark('title'); const a = s.querySelector('.library-answer'); if (a) { mark('card'); if (a.dataset.answer !== 'checking') mark('settled'); } }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); });
    await input.pressSequentially('9780439023481', { delay: 45 }); await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200); await shot('60-isbn-flow-1s-<vp>');
    await page.waitForFunction(() => 'settled' in window.__i, null, { timeout: 75000, polling: 100 }).catch(() => console.log('!! ISBN answer not settled'));
    const i = await page.evaluate(() => window.__i); const d = k => (k in i ? Math.round(i[k] - i.submit) : null);
    const how = 'performance.now() in page; MutationObserver from Enter keydown';
    const ans = await slot(page).locator('.library-answer').getAttribute('data-answer').catch(() => null);
    if (d('ghost') != null) timing('4 search (Burlingame)', 'ISBN query: submit to placeholder covers', d('ghost'), how);
    if (d('title') != null) timing('4 search (Burlingame)', 'ISBN query: submit to book page title (opens the book directly)', d('title'), how);
    if (d('settled') != null) timing('4 search (Burlingame)', `ISBN query: submit to library answer settled (${ans})`, d('settled'), how);
    console.log('ISBN flow', JSON.stringify({ ghost: d('ghost'), firstResult: d('firstResult'), slot: d('slot'), title: d('title'), card: d('card'), settled: d('settled'), ans }));
    await page.waitForTimeout(800);
    await shot('60-isbn-flow-book-burlingame-<vp>');
    const info = await slot(page).evaluate(el => { const a = el.querySelector('.library-answer'); const c = el.querySelector('.library-answer-catalog'); return { aria: a?.getAttribute('aria-label'), answer: a?.dataset.answer, visible: a?.innerText.replace(/\s+/g, ' ').trim(), href: c?.href, retry: !!el.querySelector('.library-answer-retry'), text: el.innerText.replace(/\n+/g, ' | ').slice(0, 400) }; });
    console.log('ISBN BOOK', JSON.stringify(info));
    console.log('URL is a book address with the ISBN in it?', /books\/v1%3Aisbn%3A\d{13}/.test(page.url()), '| search field value length', (await input.inputValue()).length, '| history length', await page.evaluate(() => history.length));
    await slot(page).locator('.library-answer').screenshot({ path: path.join(SHOTS, '60-isbn-book-burlingame-answer-card-1440x900.png') });
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(800);
    await shot('60-isbn-flow-after-close-<vp>');
    console.log('after closing ISBN book: url', page.url().replace(/\d{13}/, '<isbn>'), 'results shown?', await page.locator('.search-results').count(), 'input len', (await input.inputValue()).length);
    // title search (live check 9)
    const r = await search(page, 'Wings of Fire', 'title query @ Burlingame', { step: '4 search (Burlingame)', expectLibrary: true, maxWait: 45000 });
    console.log(JSON.stringify(r.out)); console.log(JSON.stringify(r.cards.cards.map(c => c.name)), r.cards.libLine);
    await shot('61-search-title-burlingame-<vp>');
    await layoutRow(page, s.vp, 'search results: title, Burlingame');
    // open a marked result that is not the Kalam book (no new check expected: answer from the marks)
    await page.getByText('Back to my shelf').click(); await page.waitForTimeout(1500);
    await shot('62-shelf-burlingame-after-<vp>');
    console.log('shelf', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].map(c => c.getAttribute('aria-label')))));
  } catch (e) { console.error('ERR', e); await shot('ERR-11-<vp>').catch(() => {}); }
  finally { await s.close({ save: true }); fs.copyFileSync(STATE_FILE, STATE_FILE.replace('state.json', 'state-burl-13.json')); }
})();
