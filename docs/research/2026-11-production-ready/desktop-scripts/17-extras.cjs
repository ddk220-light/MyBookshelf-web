// Extras: rail library line, scan dialog (camera not granted), crop of the "couldn't confirm" card from an earlier shot, status icon gallery.
const { open, BASE, SHOTS } = require('./lib.cjs');
const path = require('path'); const fs = require('fs');
(async () => {
  const s = await open({ name: '17-extras', stateFile: 'state-burl-13.json', viewport: { width: 1024, height: 768 } }); const { page, shot } = s;
  try {
    await page.goto(BASE + '/app/shelf'); await page.getByRole('heading', { name: 'My shelf' }).waitFor(); await page.waitForTimeout(1500);
    const info = await page.evaluate(() => { const el = [...document.querySelectorAll('main *, .desk-shelf *')].find(e => e.children.length === 0 && e.textContent.trim() === 'Burlingame Public Library'); if (!el) return null; const up = el.closest('a, button'); const r = el.getBoundingClientRect(); return { tag: el.tagName, cls: el.className, parent: el.parentElement.tagName + '.' + el.parentElement.className, insideLinkOrButton: !!up, cursor: getComputedStyle(el).cursor, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], font: getComputedStyle(el).fontSize }; });
    console.log('RAIL LIBRARY LINE', JSON.stringify(info));
    if (info) { await page.mouse.move(info.box[0] + 20, info.box[1] + 8); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'states', 'rail-library-name-hover.png'), clip: { x: info.box[0] - 10, y: info.box[1] - 10, width: info.box[2] + 20, height: info.box[3] + 20 } });
      await page.mouse.click(info.box[0] + 20, info.box[1] + 8); await page.waitForTimeout(500); console.log('clicking the library name on the rail layout opens anything?', await page.locator('dialog[open]').count()); await page.keyboard.press('Escape'); }
    // scan dialog
    await page.getByRole('button', { name: 'Scan a barcode' }).click(); await page.waitForTimeout(2500);
    await shot('90-scan-dialog-no-camera-<vp>');
    console.log('SCAN', (await page.locator('dialog[open]').first().innerText().catch(() => 'no dialog')).replace(/\n+/g, ' | '));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    // body font stack in Chromium
    console.log('fonts chromium', await page.evaluate(() => JSON.stringify({ body: getComputedStyle(document.body).fontFamily.slice(0, 80), frame: getComputedStyle(document.querySelector('.my-shelf-heading') || document.body).fontFamily.slice(0, 80), input: getComputedStyle(document.querySelector('input')).fontFamily.slice(0, 80) })));
    // crop the couldn't-confirm card from shot 45
    const src = path.join(SHOTS, '45-search-isbn-anna-1440x900.png');
    const p2 = await s.context.newPage(); await p2.setViewportSize({ width: 1440, height: 900 });
    await p2.setContent(`<body style="margin:0"><img src="data:image/png;base64,${fs.readFileSync(src).toString('base64')}"></body>`); await p2.waitForTimeout(400);
    await p2.screenshot({ path: path.join(SHOTS, '45-book-anna-isbn-answer-card-1440x900.png'), clip: { x: 280, y: 366, width: 536, height: 76 } });
    await p2.close();
  } catch (e) { console.error('ERR', e); } finally { await s.close(); }
})();
