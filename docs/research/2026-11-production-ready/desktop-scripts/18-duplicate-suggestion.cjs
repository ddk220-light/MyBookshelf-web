// Owner call-out: a suggested book duplicating one already on the shelf. Fresh reader, no library (no catalog checks): save a book found by ISBN, then read the suggestions.
const { open, BASE, timing } = require('./lib.cjs');
(async () => {
  const s = await open({ name: '18-duplicate-suggestion' }); const { page, shot } = s;
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'Ready to search' }).waitFor(); await page.waitForTimeout(1200);
    const input = page.getByRole('searchbox', { name: 'Search for a book' });
    await input.click(); await input.pressSequentially('9788173711466', { delay: 40 });
    const t0 = Date.now(); await page.keyboard.press('Enter');
    await page.locator('.desk-slot h1.shelf-book-title').waitFor({ timeout: 30000 });
    timing('4 search (no library)', 'ISBN query: submit to book page title (opens the book directly)', Date.now() - t0, 'Date.now() around Enter and waitFor');
    await page.waitForTimeout(1500);
    console.log('ISBN BOOK', (await page.locator('.desk-slot').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
    await shot('91-isbn-book-nolib-<vp>');
    await page.locator('.desk-slot').getByRole('button', { name: 'Add to my shelf' }).click(); await page.waitForTimeout(800);
    await page.locator('.desk-slot').getByRole('button', { name: 'Close the book' }).click(); await page.waitForTimeout(2500);
    await shot('91-shelf-after-saving-isbn-book-<vp>');
    const list = await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].map(c => c.getAttribute('aria-label') + ' {' + c.dataset.shelfKey.replace(/\d{13}/, '<isbn>') + '}'));
    console.log('SHELF', JSON.stringify(list));
    console.log('search field after closing the ISBN book: value length', (await input.inputValue()).length, '| what is shown:', await page.locator('.search-results').count() ? 'results view' : 'shelf');
    await page.reload(); await page.waitForTimeout(3000);
    console.log('AFTER RELOAD', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.home-bookcase .cover3d')].map(c => c.getAttribute('aria-label')))));
    await shot('91-shelf-after-saving-isbn-book-reload-<vp>');
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }
})();
