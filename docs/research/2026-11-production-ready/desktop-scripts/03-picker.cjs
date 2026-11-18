const { open, layoutRow, timing, BASE } = require('./lib.cjs');
const rows = page => page.evaluate(() => [...document.querySelectorAll('.library-row:not(.library-row-ghost)')].map(r => r.innerText.replace(/\n+/g, ' / ')).slice(0, 30));
async function typeAndWait(page, text, label) {
  const input = page.getByLabel('City, town or library name');
  await input.fill('');
  const t0 = Date.now();
  await input.pressSequentially(text, { delay: 60 });
  const typed = Date.now();
  await page.waitForFunction(() => !document.querySelector('.library-list[aria-busy="true"]') && (document.querySelector('.library-row:not(.library-row-ghost)') || [...document.querySelectorAll('.library-line')].length), null, { timeout: 15000 }).catch(() => console.log('no rows settled'));
  await page.waitForTimeout(900);
  timing('3 picker', `${label}: last key to list settled (includes 900 ms settle wait)`, Date.now() - typed, 'Date.now() after typing; DOM poll for rows');
  return Date.now() - t0;
}
(async () => {
  for (const [w, h] of (process.env.ONLY ? [[1024, 768]] : [[1440, 900], [1024, 768]])) {
    const s = await open({ name: '03-picker', viewport: { width: w, height: h } });
    const { page, shot } = s;
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'Ready to search' }).waitFor();
    await page.waitForTimeout(800);
    if (w >= 1100) await page.getByRole('button', { name: 'Find my library' }).click();
    else { await page.getByRole('button', { name: 'My library' }).click(); await page.waitForTimeout(500); await shot('14-picker-rail-popover-<vp>'); console.log('POPOVER', await page.evaluate(() => document.querySelector('[role=dialog], .desk-popover, [popover]')?.innerText)); const b = page.getByRole('button', { name: /Find my library|Choose/ }); if (await b.count()) await b.first().click(); }
    await page.getByRole('heading', { name: 'Find your library' }).waitFor();
    await page.waitForTimeout(500);
    await shot('14-picker-open-<vp>');
    console.log('focused:', await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 150)), page.url());
    await layoutRow(page, s.vp, 'picker open (empty)');
    await typeAndWait(page, 'Chennai', 'city name');
    await shot('15-picker-city-<vp>');
    console.log('CITY rows', JSON.stringify(await rows(page)), '| label:', await page.locator('.library-list-label').allInnerTexts());
    console.log(JSON.stringify(await layoutRow(page, s.vp, 'picker city results')));
    const sc = await page.evaluate(() => { const l = document.querySelector('.library-list'); const d = document.querySelector('.library-dialog'); return { list: [l?.scrollHeight, l?.clientHeight], dialog: [d?.scrollHeight, d?.clientHeight, Math.round(d?.getBoundingClientRect().width)], rows: document.querySelectorAll('.library-row').length, trunc: [...document.querySelectorAll('.library-row-name, .library-row-area')].filter(e => e.scrollWidth > e.clientWidth + 1).length }; });
    console.log('picker scroll', JSON.stringify(sc));
    await typeAndWait(page, 'Anna Centenary', 'library name');
    await shot('16-picker-name-anna-<vp>');
    console.log('NAME rows', JSON.stringify(await rows(page)));
    await typeAndWait(page, 'Kendriya Vidyalaya Narimedu', 'e-Granthalaya library name');
    await shot('17-picker-name-kv-narimedu-<vp>');
    console.log('KV rows', JSON.stringify(await rows(page)));
    if (w >= 1100 && !process.env.SKIP) {
      await typeAndWait(page, 'Burlingame', 'US library name');
      await shot('18-picker-name-burlingame-<vp>');
      console.log('BURL rows', JSON.stringify(await rows(page)));
      await typeAndWait(page, 'Setagaya', 'Japanese library name');
      await shot('19-picker-name-setagaya-<vp>');
      console.log('SETA rows', JSON.stringify(await rows(page)));
      await typeAndWait(page, 'Chenai', 'misspelt city');
      await shot('20-picker-misspelt-city-<vp>');
      console.log('MISSPELT rows', JSON.stringify(await rows(page)), await page.locator('.library-line').allInnerTexts());
    }
    await typeAndWait(page, 'Zzyzxqville', 'place with no libraries');
    await shot('21-picker-none-<vp>');
    console.log('NONE', await page.locator('h2:has-text("Find your library")').locator('xpath=../..').innerText());
    const unlisted = page.getByRole('button', { name: 'My library isn’t listed' });
    console.log('unlisted button count', await unlisted.count());
    if (await unlisted.count()) { await unlisted.click(); await page.waitForTimeout(500); await shot('22-picker-not-listed-form-<vp>'); console.log('UNLISTED FORM', await page.locator('h2:has-text("Find your library")').locator('xpath=../..').innerText()); }
    // close with Escape
    await page.keyboard.press('Escape'); await page.waitForTimeout(500);
    console.log('after Escape: picker open?', await page.getByRole('heading', { name: 'Find your library' }).count(), page.url(), 'focus:', await page.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').slice(0, 40)));
    await s.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
