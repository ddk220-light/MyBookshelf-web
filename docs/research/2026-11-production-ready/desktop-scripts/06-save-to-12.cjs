// No library: save from search results, reach 12 saved books, list view, remove one.
const { open, layoutRow, timing, BASE, STATE_FILE } = require('./lib.cjs');
const fs = require('fs');
const { search } = require('./search.cjs');
const slot = page => page.locator('.desk-slot');
const sugg = page => page.evaluate(() => [...document.querySelectorAll('.cover3d.is-suggested')].map(c => c.getAttribute('aria-label') + ' {' + c.dataset.shelfKey + '}' + (c.querySelector('.cover3d-face')?.dataset.cover === 'ready' ? '' : ' [no image]')));
const saved = page => page.evaluate(() => [...document.querySelectorAll('.home-bookcase:not(.results-bookcase) .cover3d:not(.is-suggested)')].map(c => c.getAttribute('aria-label') + ' {' + c.dataset.shelfKey + '}'));
async function openAndSave(page, locator) {
  await locator.click(); await slot(page).locator('h1.shelf-book-title').waitFor({ timeout: 20000 });
  await slot(page).getByRole('button', { name: 'Add to my shelf' }).click();
  await slot(page).getByRole('button', { name: 'On my shelf' }).waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
}
(async () => {
  const s = await open({ name: '06-save-to-12', useState: true });
  const { page, shot } = s;
  await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
  // save from results (author query again; no library so no catalog check)
  const r = await search(page, 'R. K. Narayan', 'author query (second run, 4 saved)', { step: '5 save from results (no library)' });
  console.log(JSON.stringify(r.cards.cards.map(c => c.name + (c.mine ? ' [MINE]' : ''))));
  await shot('33-results-with-saved-badges-<vp>');
  // open an unsaved result
  const unsaved = page.locator('.results-bookcase .cover3d:not(:has(.cover-badge-mine))');
  console.log('unsaved results', await unsaved.count());
  await openAndSave(page, unsaved.first());
  await shot('34-book-from-result-saved-<vp>');
  console.log('book from result: shelf beside shows results?', await page.locator('.results-bookcase .cover3d').count(), page.url());
  await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(800);
  await shot('34-results-after-save-<vp>');
  console.log('after close: results still shown?', await page.locator('.results-bookcase .cover3d').count(), 'mine badges', await page.locator('.results-bookcase .cover-badge-mine').count());
  await openAndSave(page, page.locator('.results-bookcase .cover3d:not(:has(.cover-badge-mine))').first());
  await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(600);
  // results list view
  await page.getByRole('button', { name: 'List view' }).click(); await page.waitForTimeout(700);
  await shot('35-results-list-view-<vp>');
  console.log('RESULT LIST', (await page.locator('.search-results').innerText()).replace(/\n+/g, ' | ').slice(0, 900));
  console.log(JSON.stringify(await layoutRow(page, s.vp, 'search results list view (no library)')));
  await page.getByRole('button', { name: /Bay view|Shelf view|Cover/ }).first().click().catch(async () => { console.log('view buttons:', await page.getByRole('group', { name: 'View' }).innerHTML()); });
  await page.waitForTimeout(400);
  // Back to my shelf
  const t0 = Date.now(); await page.getByRole('button', { name: 'Back to my shelf' }).or(page.getByRole('link', { name: 'Back to my shelf' })).first().click(); await page.getByRole('heading', { name: 'My shelf' }).waitFor();
  timing('5 save from results (no library)', '"Back to my shelf" click to shelf heading', Date.now() - t0, 'Date.now() around click and waitFor');
  await page.waitForTimeout(1800);
  console.log('SHELF 6 saved', JSON.stringify(await saved(page)), '| sugg', JSON.stringify(await sugg(page)));
  await shot('36-shelf-6-books-<vp>');
  // keep saving suggestions until 12
  let n = (await saved(page)).length, guard = 0;
  while (n < 12 && guard++ < 10) {
    const list = await sugg(page);
    // prefer a suggestion with a cover image; skip nothing otherwise
    await openAndSave(page, page.locator('.cover3d.is-suggested').first());
    await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(2000);
    n = (await saved(page)).length;
    console.log('saved', n, '| picked', list[0], '| next sugg', JSON.stringify(await sugg(page)));
  }
  await page.waitForTimeout(1500);
  await shot('37-shelf-12-books-<vp>'); await shot('37-shelf-12-books-full-<vp>', { fullPage: true });
  console.log('SHELF 12: heading', (await page.locator('.my-shelf-heading').innerText()).replace(/\n/g, ' '), '| saved', JSON.stringify(await saved(page)), '| sugg', JSON.stringify(await sugg(page)));
  const a = await layoutRow(page, s.vp, 'shelf with 12 saved books (no library)'); console.log(JSON.stringify(a));
  console.log('scroll', JSON.stringify(await page.evaluate(() => { const m = [...document.querySelectorAll('*')].filter(el => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2).map(el => [el.tagName + '.' + String(el.className).slice(0, 30), el.scrollHeight, el.clientHeight]); return { m, doc: [document.documentElement.scrollHeight, innerHeight] }; })));
  await page.mouse.move(800, 500); await page.mouse.wheel(0, 2000); await page.waitForTimeout(600); await shot('37-shelf-12-books-scrolled-<vp>');
  console.log('VIEWED BEFORE', (await page.getByRole('region', { name: 'Viewed before' }).innerText().catch(() => 'n/a')).replace(/\n+/g, ' | ').slice(0, 600));
  await page.mouse.wheel(0, -2000); await page.waitForTimeout(300);
  // list view
  await page.getByRole('button', { name: 'List view' }).click(); await page.waitForTimeout(700);
  await shot('38-shelf-12-list-view-<vp>'); await shot('38-shelf-12-list-view-full-<vp>', { fullPage: true });
  console.log('LIST', (await page.locator('main').innerText()).replace(/\n+/g, ' | ').slice(0, 1500));
  console.log(JSON.stringify(await layoutRow(page, s.vp, 'shelf list view, 12 saved (no library)')));
  console.log('list controls', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.shelf-list-item')].slice(0, 2).map(li => [...li.querySelectorAll('a,button')].map(b => (b.getAttribute('aria-label') || b.innerText.trim()).slice(0, 60))))));
  console.log('view group', await page.getByRole('group', { name: 'View' }).innerHTML());
  await page.reload(); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1200);
  console.log('view after reload: list items', await page.locator('.shelf-list-item').count());
  await page.getByRole('group', { name: 'View' }).getByRole('button').first().click(); await page.waitForTimeout(600);
  // remove a book: open the last saved, press "On my shelf"
  const last = page.locator('.home-bookcase .cover3d:not(.is-suggested)').last();
  const lastName = await last.getAttribute('aria-label');
  await last.click(); await slot(page).locator('h1.shelf-book-title').waitFor();
  await page.waitForTimeout(500); await shot('39-remove-before-<vp>');
  await slot(page).getByRole('button', { name: 'On my shelf' }).click(); await page.waitForTimeout(900);
  await shot('39-remove-after-<vp>');
  console.log('REMOVE', lastName, '| slot text', (await slot(page).innerText()).replace(/\n+/g, ' | ').slice(0, 200), '| confirm/undo?', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.undo-notice, [role=alertdialog], dialog[open]')].map(e => e.innerText))));
  console.log('shelf count now', (await saved(page)).length, 'heading', (await page.locator('.my-shelf-heading').innerText()).replace(/\n/g, ' '));
  // put it back so the shelf has 12
  await slot(page).getByRole('button', { name: 'Add to my shelf' }).click(); await slot(page).getByRole('button', { name: 'On my shelf' }).waitFor();
  await slot(page).getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(1000);
  console.log('final saved', (await saved(page)).length, JSON.stringify(await saved(page)));
  console.log('LOCALSTORAGE keys', JSON.stringify(await page.evaluate(() => Object.keys(localStorage).map(k => k + ' (' + localStorage.getItem(k).length + ')'))));
  console.log('search text in storage?', await page.evaluate(() => JSON.stringify(localStorage).includes('Narayan"') ? 'author name appears (book data)' : 'no'), '| sessionStorage keys', JSON.stringify(await page.evaluate(() => Object.keys(sessionStorage))));
  await s.close({ save: true });
  fs.copyFileSync(STATE_FILE, STATE_FILE.replace('state.json', 'state-nolib-12.json'));
})().catch(e => { console.error(e); process.exit(1); });
