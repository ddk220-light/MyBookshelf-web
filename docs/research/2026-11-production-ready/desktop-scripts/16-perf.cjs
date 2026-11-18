// Response times, cache headers and sizes for the main document, JS/CSS/fonts and API calls. Fresh context, then a repeat visit.
const { open, timing, BASE, appendCsv, ROOT } = require('./lib.cjs');
const fs = require('fs'); const path = require('path');
(async () => {
  const s = await open({ name: '16-perf' }); const { page } = s;
  const rows = [];
  const grab = async (label) => {
    const res = await page.evaluate(() => [performance.getEntriesByType('navigation')[0], ...performance.getEntriesByType('resource')].map(e => ({ name: e.name, type: e.initiatorType || 'navigation', dur: Math.round(e.duration), ttfb: Math.round(e.responseStart - e.startTime), transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize, proto: e.nextHopProtocol })));
    for (const e of res) { const u = new URL(e.name); rows.push({ visit: label, host: u.host, path: u.pathname.length > 70 ? u.pathname.slice(0, 67) + '...' : u.pathname, ...e, name: undefined }); }
  };
  try {
    let t0 = Date.now();
    await page.goto(BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(1000); await grab('landing first visit');
    // Open the app, timed correctly
    t0 = Date.now(); await page.getByRole('link', { name: /Open the app/ }).click(); await page.getByRole('heading', { name: 'Ready to search' }).waitFor();
    timing('1 open the app', 'click "Open the app" on the landing page to "Ready to search" heading (corrected measurement)', Date.now() - t0, 'Date.now() around click and waitFor');
    await page.locator('.cover3d.is-suggested img').first().waitFor(); await page.waitForTimeout(2500); await grab('app first visit (from landing)');
    const vit = await page.evaluate(() => new Promise(res => { const out = {}; try { new PerformanceObserver(l => { const e = l.getEntries().pop(); out.lcp = Math.round(e.startTime); out.lcpEl = (e.element?.tagName || '') + '.' + String(e.element?.className || '').slice(0, 30); }).observe({ type: 'largest-contentful-paint', buffered: true }); new PerformanceObserver(l => { out.cls = l.getEntries().reduce((a, e) => a + (e.hadRecentInput ? 0 : e.value), 0); }).observe({ type: 'layout-shift', buffered: true }); } catch {} const n = performance.getEntriesByType('navigation')[0]; out.fcp = Math.round(performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime || -1); out.dcl = Math.round(n.domContentLoadedEventEnd); out.load = Math.round(n.loadEventEnd); setTimeout(() => res(out), 600); }));
    console.log('APP VITALS', JSON.stringify(vit));
    if (vit.fcp > 0) timing('12 performance', 'app shelf (cold, via landing link): first contentful paint', vit.fcp, 'Paint Timing'); if (vit.lcp) timing('12 performance', 'app shelf (cold): largest contentful paint (' + vit.lcpEl + ')', vit.lcp, 'PerformanceObserver LCP'); timing('12 performance', 'app shelf (cold): load event end', vit.load, 'Navigation Timing');
    console.log('CLS', vit.cls);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500); await grab('app repeat visit (reload)');
    const v2 = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { fcp: Math.round(performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime || -1), load: Math.round(n.loadEventEnd), ttfb: Math.round(n.responseStart) }; });
    timing('12 performance', 'app shelf (reload, warm cache): first contentful paint', v2.fcp, 'Paint Timing'); timing('12 performance', 'app shelf (reload): document TTFB', v2.ttfb, 'Navigation Timing');
  } catch (e) { console.error('ERR', e); }
  finally {
    const net = s.net.slice();
    await s.close();
    fs.writeFileSync(path.join(ROOT, 'scripts', 'logs', 'perf-resources.json'), JSON.stringify(rows, null, 1));
    const hdr = {}; for (const n of net) hdr[n.host + n.path] = n;
    console.log('visit | type | host+path | status | ms | ttfb | transfer | encoded | decoded | cache-control | x-vercel-cache | encoding');
    for (const r of rows) { const h = hdr[r.host + (r.path.endsWith('...') ? '' : r.path)] || net.find(n => n.host === r.host && n.path.startsWith(r.path.replace('...', ''))) || {}; if (['img', 'image'].includes(r.type) && r.host !== 'mybookshelf.cloud') continue; console.log([r.visit, r.type, r.host + r.path, h.status ?? '', r.dur, r.ttfb, r.transfer, r.encoded, r.decoded, h.cache || '', h.xcache || '', h.enc || ''].join(' | ')); }
    const imgs = rows.filter(r => r.host !== 'mybookshelf.cloud'); console.log('THIRD-PARTY', JSON.stringify([...new Set(imgs.map(i => i.host))]), 'count', imgs.length, 'bytes', imgs.reduce((a, i) => a + (i.transfer || i.encoded || 0), 0), 'slowest ms', Math.max(0, ...imgs.map(i => i.dur)));
  }
})();
