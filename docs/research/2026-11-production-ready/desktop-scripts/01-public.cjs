const { open, layoutRow, timing, BASE, appendCsv } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  if (!fs.existsSync(path.join(root, 'timings.csv'))) appendCsv('timings.csv', ['step', 'what was measured', 'milliseconds', 'how measured']);
  if (!fs.existsSync(path.join(root, 'layout.csv'))) appendCsv('layout.csv', ['viewport', 'screen', 'page height', 'horizontal overflow', 'truncated elements', 'smallest font px', 'smallest target px', 'elements under 12px', 'targets under 24px', 'books per bay', 'inner scroll areas (scrollHeight/clientHeight)', 'longest line (approx chars)']);
  const s = await open({ name: '01-public' });
  const { page, shot } = s;
  const pages = [['landing', '/'], ['how-it-works', '/how-it-works'], ['about', '/about'], ['libraries', '/libraries'], ['privacy', '/app/privacy']];
  let n = 1;
  for (const [name, url] of pages) {
    const t0 = Date.now();
    const resp = await page.goto(BASE + url, { waitUntil: 'load' });
    const nav = await page.evaluate(() => { const e = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint').find(x => x.name === 'first-contentful-paint'); return { ttfb: e.responseStart, dcl: e.domContentLoadedEventEnd, load: e.loadEventEnd, fcp: p?.startTime, size: e.transferSize, enc: e.encodedBodySize, dec: e.decodedBodySize }; });
    timing('1 ' + name, 'document TTFB', nav.ttfb, 'Navigation Timing responseStart'); timing('1 ' + name, 'first contentful paint', nav.fcp || -1, 'Paint Timing'); timing('1 ' + name, 'load event end', nav.load || (Date.now() - t0), 'Navigation Timing');
    console.log(name, resp.status(), page.url(), JSON.stringify(nav), JSON.stringify(resp.headers()['cache-control']));
    await page.waitForTimeout(1200);
    const nn = String(n).padStart(2, '0');
    await shot(`${nn}-public-${name}-top-<vp>`);
    await shot(`${nn}-public-${name}-full-<vp>`, { fullPage: true });
    const a = await layoutRow(page, s.vp, 'public ' + name);
    console.log(JSON.stringify(a));
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.textContent.trim().replace(/\s+/g, ' ').slice(0, 50) + ' -> ' + a.getAttribute('href')));
    console.log('LINKS', name, links.length, JSON.stringify(links.slice(0, 60)));
    console.log('TITLE', await page.title(), '| H:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3')].map(h => h.tagName + ':' + h.textContent.trim().slice(0, 60)))));
    n++;
  }
  await s.close();
})().catch(e => { console.error(e); process.exit(1); });
