const { open, layoutRow, timing, BASE } = require('./lib.cjs');
(async () => {
  let s = await open({ name: '02-public2' });
  let { page, shot } = s;
  for (const [n, name, url] of [['06', 'guide-anna-centenary', '/libraries/anna-centenary-library'], ['07', 'guide-setagaya', '/libraries/setagaya-city-library'], ['08', 'privacy-public', '/privacy'], ['09', 'support', '/support'], ['10', 'open-source', '/open-source']]) {
    const resp = await page.goto(BASE + url, { waitUntil: 'load' });
    await page.waitForTimeout(800);
    console.log(name, resp.status(), page.url(), await page.title());
    await shot(`${n}-public-${name}-top-<vp>`);
    await shot(`${n}-public-${name}-full-<vp>`, { fullPage: true });
    console.log(JSON.stringify(await layoutRow(page, s.vp, 'public ' + name)));
    console.log('LINKS', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('main a[href], #content a[href]')].map(a => a.textContent.trim().replace(/\s+/g, ' ').slice(0, 50) + ' -> ' + a.getAttribute('href')).slice(0, 30))));
    console.log('TEXT', (await page.evaluate(() => (document.querySelector('main') || document.body).innerText)).slice(0, 1500).replace(/\n+/g, ' | '));
  }
  // header links by click
  await page.goto(BASE + '/', { waitUntil: 'load' });
  for (const name of ['Libraries', 'How it works', 'About']) {
    const t0 = Date.now();
    await page.locator('header').getByRole('link', { name, exact: true }).click();
    await page.waitForLoadState('load');
    console.log('HEADER', name, '->', page.url(), Date.now() - t0, 'ms');
    await page.goto(BASE + '/', { waitUntil: 'load' });
  }
  // Open the app
  let t0 = Date.now();
  const [popup] = await Promise.all([page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null), page.getByRole('link', { name: /Open the app/ }).click()]);
  console.log('Open the app opened new tab?', !!popup, await page.getByRole('link', { name: /Open the app/ }).first().getAttribute('target').catch(() => 'n/a'));
  const app = popup || page;
  await app.getByRole('heading', { name: 'Ready to search' }).waitFor({ timeout: 15000 });
  timing('1 open the app', 'click "Open the app" to "Ready to search" heading visible', Date.now() - t0, 'Date.now() around click and waitFor');
  await app.waitForTimeout(1500);
  await app.screenshot({ path: require('path').join(require('./lib.cjs').SHOTS, '11-public-open-the-app-result-1440x900.png') });
  console.log('app url', app.url());
  if (popup) await popup.close();
  // Find my library (landing main button -> /app/libraries)
  await page.goto(BASE + '/', { waitUntil: 'load' });
  t0 = Date.now();
  const [popup2] = await Promise.all([page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null), page.getByRole('link', { name: 'Find my library' }).click()]);
  const app2 = popup2 || page;
  await app2.waitForTimeout(3000);
  console.log('Find my library ->', app2.url(), 'new tab', !!popup2);
  await app2.screenshot({ path: require('path').join(require('./lib.cjs').SHOTS, '12-public-find-my-library-result-1440x900.png') });
  await s.close();

  // Cold shelf at each viewport (fresh context each)
  for (const [w, h] of [[1440, 900], [1920, 1080], [1280, 720], [1100, 800], [1024, 768], [700, 900]]) {
    s = await open({ name: '02-cold', viewport: { width: w, height: h } });
    ({ page, shot } = s);
    t0 = Date.now();
    await page.goto(BASE + '/app/shelf', { waitUntil: 'commit' });
    await page.getByRole('heading', { name: 'Ready to search' }).waitFor({ timeout: 20000 });
    const tHead = Date.now() - t0;
    await page.locator('.cover3d.is-suggested').first().waitFor({ timeout: 20000 }).catch(() => {});
    const tSug = Date.now() - t0;
    // covers loaded
    await page.waitForFunction(() => { const im = [...document.querySelectorAll('.cover3d img')]; return im.length >= 1 && im.every(i => i.complete && i.naturalWidth > 0); }, null, { timeout: 15000 }).catch(() => {});
    const tImg = Date.now() - t0;
    timing(`2 cold shelf ${w}x${h}`, 'navigation start to "Ready to search" heading', tHead, 'Date.now() from goto to waitFor'); timing(`2 cold shelf ${w}x${h}`, 'navigation start to first suggested cover element', tSug, 'Date.now() from goto to waitFor'); timing(`2 cold shelf ${w}x${h}`, 'navigation start to all suggestion cover images loaded', tImg, 'Date.now(); img.complete poll');
    await page.waitForTimeout(1200);
    await shot('13-cold-shelf-<vp>');
    await shot('13-cold-shelf-full-<vp>', { fullPage: true });
    const a = await layoutRow(page, s.vp, 'cold shelf');
    console.log(s.vp, JSON.stringify(a));
    const info = await page.evaluate(() => ({
      sug: [...document.querySelectorAll('.cover3d.is-suggested')].map(c => { const a = c.closest('a') || c; const im = c.querySelector('img'); const r = c.getBoundingClientRect(); return (a.getAttribute('aria-label') || a.textContent.trim()).slice(0, 70) + ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + (im ? (im.naturalWidth ? ' img' : ' IMG-FAILED') : ' no-img') + ']'; }),
      column: (() => { const c = document.querySelector('[aria-label="Library and account"]'); return c ? Math.round(c.getBoundingClientRect().width) : null; })(),
      rail: [...document.querySelectorAll('nav button, nav a, .desk-rail button, .desk-rail a')].map(b => (b.getAttribute('aria-label') || b.textContent.trim()) + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)),
      search: (() => { const b = document.querySelector('.search-bar'); const r = b?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; })(),
      text: document.querySelector('main')?.innerText.slice(0, 400).replace(/\n+/g, ' | '),
      emptyBelow: innerHeight - Math.max(...[...document.querySelectorAll('.bay, .search-bar, main h1, main p')].map(e => e.getBoundingClientRect().bottom)),
    }));
    console.log(s.vp, JSON.stringify(info));
    await s.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
