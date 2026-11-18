// No library chosen: book page in the middle slot, closing ways, saving to 1, 4, 12 books, list view, remove.
const { open, layoutRow, timing, BASE } = require('./lib.cjs');
const { search } = require('./search.cjs');
const slot = page => page.locator('.desk-slot');
const focusName = page => page.evaluate(() => { const e = document.activeElement; return (e?.getAttribute('aria-label') || e?.textContent?.trim().slice(0, 50) || e?.tagName) + ' <' + e?.tagName.toLowerCase() + '.' + (e?.className || '').toString().slice(0, 30) + '>'; });
const sugg = page => page.evaluate(() => [...document.querySelectorAll('.cover3d.is-suggested')].map(c => c.getAttribute('aria-label') + ' {' + c.dataset.shelfKey + '}' + (c.querySelector('.cover3d-face')?.dataset.cover === 'ready' ? '' : ' [no image]')));
const saved = page => page.evaluate(() => [...document.querySelectorAll('.home-bookcase:not(.results-bookcase) .cover3d:not(.is-suggested)')].map(c => c.getAttribute('aria-label') + ' {' + c.dataset.shelfKey + '}'));
async function openCover(page, locator, label) {
  const t0 = Date.now();
  await locator.click();
  await slot(page).locator('h1.shelf-book-title').waitFor({ timeout: 20000 });
  const t1 = Date.now() - t0;
  timing('6 book page (no library)', `${label}: click cover to book title shown`, t1, 'Date.now() around click and waitFor');
  await page.waitForFunction(() => { const f = document.querySelector('.desk-slot .book-stand .cover3d-face'); return f && f.dataset.cover !== 'loading'; }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
}
async function saveOpen(page) {
  const b = slot(page).getByRole('button', { name: 'Add to my shelf' });
  await b.click();
  await slot(page).getByRole('button', { name: 'On my shelf' }).waitFor({ timeout: 8000 });
}
(async () => {
  const s = await open({ name: '05-book-save-nolib' });
  const { page, shot } = s;
  await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'Ready to search' }).waitFor(); await page.waitForTimeout(1200);
  console.log('SUGG cold', JSON.stringify(await sugg(page)));
  // a. open suggestion 4 (Malgudi Days)
  await openCover(page, page.locator('.cover3d.is-suggested').nth(3), 'suggestion (cold shelf)');
  await shot('27-book-nolib-suggestion-<vp>');
  console.log('URL', page.url());
  console.log('BOOK TEXT', (await slot(page).innerText()).replace(/\n+/g, ' | '));
  console.log('BOOK LINKS', JSON.stringify(await slot(page).evaluate(el => [...el.querySelectorAll('a[href], button')].map(a => a.tagName + ': ' + (a.getAttribute('aria-label') || a.innerText.trim()).slice(0, 60) + (a.href ? ' -> ' + a.href.slice(0, 110) : '')))));
  console.log(JSON.stringify(await layoutRow(page, s.vp, 'book page in middle slot (no library)')));
  console.log('GEOM', JSON.stringify(await page.evaluate(() => { const r = e => { const b = document.querySelector(e)?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null; }; return { column: r('.desk-column'), slot: r('.desk-slot'), shelfVisibleFrom: r('.desk-slot') ? Math.round(document.querySelector('.desk-slot').getBoundingClientRect().right) : null, open: r('.cover3d.is-open'), slotScroll: [document.querySelector('.desk-slot').scrollHeight, document.querySelector('.desk-slot').clientHeight] }; })));
  console.log('focus after open:', await focusName(page));
  // b. closing ways
  const reopen = async () => { await openCover(page, page.locator('.cover3d.is-suggested').nth(3), 'suggestion reopen'); };
  await slot(page).getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(500);
  console.log('close ×: slot', await slot(page).count(), page.url(), 'focus', await focusName(page));
  await reopen(); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  console.log('close Escape: slot', await slot(page).count(), page.url(), 'focus', await focusName(page));
  await reopen(); await page.mouse.click(1250, 720); await page.waitForTimeout(500);
  console.log('close click-on-shelf (empty area): slot', await slot(page).count(), page.url(), 'focus', await focusName(page));
  await reopen(); await page.goBack(); await page.waitForTimeout(500);
  console.log('close Back: slot', await slot(page).count(), page.url(), 'focus', await focusName(page));
  await page.goForward(); await page.waitForTimeout(800);
  console.log('Forward: slot', await slot(page).count(), page.url());
  if (!(await slot(page).count())) await reopen();
  // while a book is open, click another cover on the pushed shelf
  const other = page.locator('.cover3d.is-suggested').nth(4);
  console.log('other cover visible in viewport while slot open?', JSON.stringify(await other.boundingBox()));
  // c. save
  await page.mouse.move(700, 300);
  const sb = slot(page).getByRole('button', { name: 'Add to my shelf' });
  console.log('save button box', JSON.stringify(await sb.boundingBox()));
  await sb.click(); await page.waitForTimeout(150); await shot('28-book-nolib-just-saved-<vp>');
  await slot(page).getByRole('button', { name: 'On my shelf' }).waitFor(); await page.waitForTimeout(900);
  await shot('28-book-nolib-saved-<vp>');
  console.log('after save text', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 300));
  await slot(page).getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(1500);
  await shot('29-shelf-1-book-<vp>');
  console.log('SHELF 1: heading', await page.locator('.my-shelf-heading').innerText().catch(() => 'n/a'), '| saved', JSON.stringify(await saved(page)), '| sugg', JSON.stringify(await sugg(page)));
  console.log(JSON.stringify(await layoutRow(page, s.vp, 'shelf with 1 saved book (no library)')));
  // d. direct visit and reload
  const bookUrl = await page.locator('.home-bookcase .cover3d:not(.is-suggested)').first().getAttribute('href');
  let t0 = Date.now();
  await page.goto(BASE + bookUrl); await slot(page).locator('h1.shelf-book-title').waitFor({ timeout: 20000 });
  timing('6 book page (no library)', 'direct visit to a book address: navigation to title shown', Date.now() - t0, 'Date.now() around goto and waitFor');
  await page.waitForTimeout(1200); await shot('30-book-direct-visit-<vp>');
  console.log('direct visit: shelf drawn beside?', await page.locator('.home-bookcase .cover3d').count(), 'title', await page.title());
  t0 = Date.now(); await page.reload(); await slot(page).locator('h1.shelf-book-title').waitFor({ timeout: 20000 });
  timing('6 book page (no library)', 'reload on a book address: reload to title shown', Date.now() - t0, 'Date.now() around reload and waitFor');
  await page.waitForTimeout(1000); await shot('30-book-reload-<vp>');
  await slot(page).getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(800);
  console.log('after × on direct visit:', page.url(), 'history length', await page.evaluate(() => history.length));
  // e. three more suggestions
  for (let i = 0; i < 3; i++) {
    await openCover(page, page.locator('.cover3d.is-suggested').first(), 'suggestion (shelf)');
    if (i === 0) { await shot('31-suggestion-open-<vp>'); console.log('SUGG BOOK', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 500)); }
    await saveOpen(page); await slot(page).getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(1800);
    if (i === 0) await shot('31-suggestion-saved-shelf-2-<vp>');
    console.log('after saving suggestion', i + 1, '| sugg', JSON.stringify(await sugg(page)));
  }
  await page.waitForTimeout(1500);
  await shot('32-shelf-4-books-<vp>');
  console.log('SHELF 4: heading', await page.locator('.my-shelf-heading').innerText().catch(() => 'n/a'), '| saved', JSON.stringify(await saved(page)));
  console.log(JSON.stringify(await layoutRow(page, s.vp, 'shelf with 4 saved books (no library)')));
  await s.close({ save: true });
})().catch(e => { console.error(e); process.exit(1); });
