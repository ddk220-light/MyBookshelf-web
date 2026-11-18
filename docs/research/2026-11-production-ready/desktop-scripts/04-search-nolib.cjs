// Searches with NO library chosen (no catalog checks): author, misspelling, no results. Then a book page with no library, save 1 book.
const { open, layoutRow, timing, BASE } = require('./lib.cjs');
const { search } = require('./search.cjs');
(async () => {
  const s = await open({ name: '04-search-nolib' });
  const { page, shot } = s;
  await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'Ready to search' }).waitFor(); await page.waitForTimeout(800);
  // typing state
  const input = page.getByRole('searchbox', { name: 'Search for a book' });
  await input.click(); await page.waitForTimeout(300); await shot('23-search-field-focused-<vp>');
  let r = await search(page, 'R. K. Narayan', 'author query', { step: '4 search (no library)' });
  console.log(JSON.stringify(r, null, 0));
  await page.waitForTimeout(500);
  await shot('24-search-author-nolib-<vp>'); await shot('24-search-author-nolib-full-<vp>', { fullPage: true });
  console.log(JSON.stringify(await layoutRow(page, s.vp, 'search results: author, no library')));
  // scroll the results to the bottom
  await page.mouse.move(800, 600); await page.mouse.wheel(0, 3000); await page.waitForTimeout(600); await shot('24-search-author-nolib-scrolled-<vp>'); await page.mouse.wheel(0, -3000); await page.waitForTimeout(300);
  r = await search(page, 'Wings of Fier', 'misspelt title query', { step: '4 search (no library)' });
  console.log(JSON.stringify(r));
  await shot('25-search-misspelt-nolib-<vp>');
  await layoutRow(page, s.vp, 'search results: misspelt title, no library');
  r = await search(page, 'qzxv jkwpl zzqy', 'no-results query', { step: '4 search (no library)' });
  console.log(JSON.stringify(r));
  await shot('26-search-none-nolib-<vp>');
  await layoutRow(page, s.vp, 'search: no results');
  console.log('NONE text:', (await page.locator('.search-results').innerText()).replace(/\n+/g, ' | '));
  // clear the search: how?
  console.log('clear controls:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.search-bar button, .results-head a, .results-head button')].map(b => (b.getAttribute('aria-label') || b.innerText) + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)))));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  console.log('after Escape in search: results still shown?', await page.locator('.search-results').count(), 'input value length', (await input.inputValue()).length);
  await shot('26-search-after-escape-<vp>');
  await s.close({ save: true });
})().catch(e => { console.error(e); process.exit(1); });
